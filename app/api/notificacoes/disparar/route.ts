import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { enviarTexto, estadoSessao } from "@/lib/whatsapp";
import { destinatariosDe, montarResumo, type Pendencia } from "@/lib/whatsapp-mensagem";

export const dynamic = "force-dynamic";
// Cada mensagem leva alguns segundos (o "digitando..." antes do envio).
export const maxDuration = 300;

/** Comparação de tempo constante: não vaza o segredo por diferença de latência. */
function comparacaoSegura(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    // Ainda assim compara, para o tempo não denunciar o tamanho.
    timingSafeEqual(bb, bb);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

const HORARIO_PADRAO = 8;

function agoraEmBrasilia() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "00";
  return { hoje: `${v("year")}-${v("month")}-${v("day")}`, hora: Number(v("hour")) };
}

type Admin = ReturnType<typeof createAdminClient>;

/** Quantas empresas são atendidas ao mesmo tempo (cada uma tem sua sessão). */
const EM_PARALELO = 4;

function funcaoAusente(erro: { code?: string; message?: string }) {
  return erro.code === "PGRST202" || erro.code === "42883" || /whatsapp_reservar_envio/i.test(erro.message ?? "");
}

/**
 * Garante que só UMA rodada envia o resumo de uma empresa por dia, mesmo com
 * duas rodadas chegando juntas (cron + disparo manual). Sem a função, cai na checagem
 * antiga (que não é atômica, mas funciona).
 */
async function reservar(db: Admin, orgId: string, hoje: string) {
  const { data, error } = await db.rpc("whatsapp_reservar_envio", { p_org: orgId, p_data: hoje });
  if (!error) return data === true;
  if (!funcaoAusente(error)) throw new Error(error.message);

  const { data: jaEnviado } = await db
    .from("whatsapp_envios")
    .select("id")
    .eq("org_id", orgId)
    .eq("data_referencia", hoje)
    .eq("sucesso", true)
    .maybeSingle();
  return !jaEnviado;
}

/** Registra o resultado do dia. Qualquer detalhe diferente de "enviando" libera a reserva. */
async function registrar(
  db: Admin,
  orgId: string,
  hoje: string,
  r: { sucesso: boolean; quantidade?: number; detalhe: string | null },
) {
  await db.from("whatsapp_envios").upsert(
    {
      org_id: orgId,
      data_referencia: hoje,
      quantidade: r.quantidade ?? 0,
      sucesso: r.sucesso,
      detalhe: r.detalhe,
      enviado_em: new Date().toISOString(),
    },
    { onConflict: "org_id,data_referencia" },
  );
}

/**
 * Rotina diária: varre as empresas com WhatsApp conectado e manda o resumo
 * das manutenções atrasadas e a vencer para os números cadastrados.
 *
 * Chamada de hora em hora pelo serviço "cron" da stack (infra/stack.yml), com
 * `Authorization: Bearer ${CRON_SECRET}`. Cada empresa recebe uma vez por dia,
 * a partir do horário que escolheu.
 */
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET?.trim();

  if (!segredo) {
    return NextResponse.json(
      { erro: "CRON_SECRET não configurada. A rotina fica desligada até você definir a variável." },
      { status: 503 },
    );
  }

  // Só cabeçalho: segredo em query string vaza em log de acesso e no Referer.
  const enviado = request.headers.get("authorization") ?? "";

  if (!comparacaoSegura(enviado, `Bearer ${segredo}`)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  // Data e hora de Brasília: o container roda em UTC, e às 21h daqui
  // já seria "amanhã" para ele.
  const { hoje, hora } = agoraEmBrasilia();
  const db = createAdminClient();

  // "*" em vez de listar colunas: se uma migração ainda não rodou (horario_envio,
  // destinatarios), a rotina continua funcionando com os valores padrão.
  const { data: todas, error } = await db
    .from("whatsapp_conexoes")
    .select("*, organizacoes(nome)")
    .eq("notificar", true)
    .eq("status", "conectado");

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  // Chegou a hora (ou já passou: se uma rodada falhar, a próxima cobre). Quem
  // já recebeu hoje é pulado na reserva.
  const conexoes = (todas ?? []).filter(
    (c) => Number(c.horario_envio ?? HORARIO_PADRAO) <= hora,
  );

  const resultado = {
    hora,
    verificadas: conexoes.length,
    enviadas: 0,
    puladas: 0,
    falhas: [] as { org: string; motivo: string }[],
  };

  async function atender(conexao: (typeof conexoes)[number]) {
    const empresa =
      (conexao.organizacoes as unknown as { nome?: string } | null)?.nome ?? "Sua empresa";

    try {
      if (!(await reservar(db, conexao.org_id, hoje))) {
        resultado.puladas++;
        return;
      }

      const destinos = destinatariosDe(conexao);
      if (!destinos.length) {
        resultado.falhas.push({ org: empresa, motivo: "nenhum número para receber" });
        await registrar(db, conexao.org_id, hoje, { sucesso: false, detalhe: "sem destinatários" });
        return;
      }

      const estado = await estadoSessao(conexao.instancia);
      if (estado.status !== "conectado") {
        // "conectando" = o servidor está religando (deploy, queda de rede): tenta
        // na próxima hora sem mexer no status. "desconectado" = precisa de QR novo.
        if (estado.status === "desconectado") {
          await db
            .from("whatsapp_conexoes")
            .update({ status: "desconectado" })
            .eq("org_id", conexao.org_id);
        }
        const motivo = `WhatsApp ${estado.status}`;
        resultado.falhas.push({ org: empresa, motivo });
        await registrar(db, conexao.org_id, hoje, { sucesso: false, detalhe: motivo });
        return;
      }

      const { data: pendencias } = await db.rpc("whatsapp_pendencias", {
        p_org: conexao.org_id,
      });

      const lista = (pendencias ?? []) as Pendencia[];

      // Nada pendente: não incomoda ninguém (e a próxima hora confere de novo).
      if (lista.length === 0) {
        resultado.puladas++;
        await registrar(db, conexao.org_id, hoje, { sucesso: false, detalhe: "nada pendente" });
        return;
      }

      const texto = montarResumo(empresa, lista);
      const erros: string[] = [];
      let entregues = 0;

      for (const numero of destinos) {
        try {
          await enviarTexto(conexao.instancia, numero, texto);
          entregues++;
        } catch (e) {
          erros.push(`${numero}: ${e instanceof Error ? e.message : "erro desconhecido"}`);
        }
      }

      if (!entregues) throw new Error(erros.join(" · "));

      // Sucesso encerra o dia, mesmo que um dos números tenha falhado (o
      // detalhe fica registrado e a tela de configurações acusa o número ruim).
      await registrar(db, conexao.org_id, hoje, {
        sucesso: true,
        quantidade: lista.length,
        detalhe: erros.length ? erros.join(" · ") : null,
      });

      await db
        .from("whatsapp_conexoes")
        .update({ ultimo_envio: new Date().toISOString() })
        .eq("org_id", conexao.org_id);

      resultado.enviadas++;
    } catch (e) {
      const motivo = e instanceof Error ? e.message : "erro desconhecido";
      resultado.falhas.push({ org: empresa, motivo });
      await registrar(db, conexao.org_id, hoje, { sucesso: false, detalhe: motivo }).catch(() => {});
    }
  }

  for (let i = 0; i < conexoes.length; i += EM_PARALELO) {
    await Promise.all(conexoes.slice(i, i + EM_PARALELO).map(atender));
  }

  return NextResponse.json(resultado);
}
