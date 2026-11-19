"use server";

import { revalidatePath } from "next/cache";
import { getContexto } from "@/lib/session";
import { createClient } from "@/lib/db/server";
import { erroBanco, booleano, inteiro, mensagemErro, type Resultado } from "@/lib/form";
import {
  abrirConexao,
  desconectar,
  enviarTexto,
  estadoSessao,
  nomeInstancia,
  verificarNumeros,
  type EstadoSessao,
} from "@/lib/whatsapp";
import { destinatariosDe, montarResumo } from "@/lib/whatsapp-mensagem";
import { SEM_PERMISSAO, podeGerenciar } from "@/lib/permissoes";
import {
  MAX_DESTINATARIOS,
  formatarTelefone,
  normalizarTelefone,
  telefoneValido,
} from "@/lib/telefone";

/**
 * Conectar, desconectar e mexer nas preferências é coisa de proprietário ou
 * gestor. A checagem vem antes de qualquer chamada ao servidor de WhatsApp: o
 * RLS só protege o banco, não o WhatsApp.
 */
async function exigirGestor() {
  const ctx = await getContexto();
  if (!podeGerenciar(ctx.papel)) throw new Error(SEM_PERMISSAO);
  return ctx;
}

export type StatusWhatsapp = {
  status: "desconectado" | "conectando" | "conectado";
  qr: string | null;
  codigoPareamento: string | null;
  numero: string | null;
  nomePerfil: string | null;
  expirado?: boolean;
  erro?: string;
};

const DESCONECTADO: StatusWhatsapp = {
  status: "desconectado",
  qr: null,
  codigoPareamento: null,
  numero: null,
  nomePerfil: null,
};

function paraStatus(e: EstadoSessao): StatusWhatsapp {
  return {
    status: e.status,
    qr: e.qr ?? null,
    codigoPareamento: e.codigoPareamento ?? null,
    numero: e.numero ?? null,
    nomePerfil: e.nomePerfil ?? null,
    expirado: Boolean(e.expirado),
    ...(e.erro ? { erro: e.erro } : {}),
  };
}

/** Coluna nova ainda não criada no banco (migracao-baileys.sql não rodou). */
function colunaAusente(erro: { code?: string; message?: string }) {
  return erro.code === "PGRST204" || erro.code === "42703" || /destinatarios/i.test(erro.message ?? "");
}

/**
 * Abre a sessão da empresa e devolve o QR. Com `telefone`, devolve também o
 * código de pareamento (conectar sem escanear).
 */
export async function iniciarConexao(telefone?: string | null): Promise<StatusWhatsapp> {
  try {
    const { orgId } = await exigirGestor();

    let numeroPareamento: string | null = null;
    if (telefone) {
      if (!telefoneValido(telefone)) {
        return { ...DESCONECTADO, erro: "Telefone inválido. Informe com DDD, ex.: (11) 98765-4321." };
      }
      numeroPareamento = normalizarTelefone(telefone);
    }

    const db = await createClient();
    const instancia = nomeInstancia(orgId);
    const estado = paraStatus(await abrirConexao(instancia, numeroPareamento));

    await db.from("whatsapp_conexoes").upsert(
      {
        org_id: orgId,
        instancia,
        status: estado.status,
        ...(estado.status === "conectado"
          ? { numero: estado.numero, nome_perfil: estado.nomePerfil }
          : {}),
      },
      { onConflict: "org_id" },
    );

    revalidatePath("/configuracoes");
    return estado;
  } catch (e) {
    return { ...DESCONECTADO, erro: mensagemErro(e) };
  }
}

/** Consultado a cada poucos segundos enquanto o QR está na tela. */
export async function consultarStatus(): Promise<StatusWhatsapp> {
  try {
    const { orgId } = await exigirGestor();
    const db = await createClient();

    const { data: conexao } = await db
      .from("whatsapp_conexoes")
      .select("instancia, numero, nome_perfil, status")
      .eq("org_id", orgId)
      .maybeSingle();

    if (!conexao) return DESCONECTADO;

    const estado = paraStatus(await estadoSessao(conexao.instancia));

    if (estado.status === "conectado") {
      const numero = estado.numero ?? conexao.numero;
      const nomePerfil = estado.nomePerfil ?? conexao.nome_perfil;

      if (conexao.status !== "conectado" || conexao.numero !== numero) {
        await db
          .from("whatsapp_conexoes")
          .update({ status: "conectado", numero, nome_perfil: nomePerfil })
          .eq("org_id", orgId);
        revalidatePath("/configuracoes");
      }
      return { ...estado, numero, nomePerfil };
    }

    if (estado.status === "desconectado" && conexao.status !== "desconectado") {
      await db.from("whatsapp_conexoes").update({ status: "desconectado" }).eq("org_id", orgId);
      revalidatePath("/configuracoes");
    }

    return estado;
  } catch (e) {
    // Servidor fora do ar no meio da leitura: mantém a tela como está.
    return { ...DESCONECTADO, status: "conectando", erro: mensagemErro(e) };
  }
}

export async function encerrarConexao(): Promise<Resultado> {
  try {
    const { orgId } = await exigirGestor();
    const db = await createClient();

    const { data: conexao } = await db
      .from("whatsapp_conexoes")
      .select("instancia")
      .eq("org_id", orgId)
      .maybeSingle();

    await desconectar(conexao?.instancia ?? nomeInstancia(orgId));
    await db.from("whatsapp_conexoes").delete().eq("org_id", orgId);

    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export async function salvarPreferenciasWhatsapp(fd: FormData): Promise<Resultado> {
  try {
    const { orgId } = await exigirGestor();
    const db = await createClient();

    // Destinatários: só dígitos com DDI, sem repetidos.
    const digitados = fd
      .getAll("destinatarios")
      .map((v) => String(v).trim())
      .filter(Boolean);

    const invalidos = digitados.filter((n) => !telefoneValido(n));
    if (invalidos.length) {
      return { ok: false, erro: `Número inválido: ${invalidos.join(", ")}. Informe com DDD.` };
    }

    const destinatarios = [...new Set(digitados.map(normalizarTelefone))];
    if (destinatarios.length > MAX_DESTINATARIOS) {
      return { ok: false, erro: `No máximo ${MAX_DESTINATARIOS} números recebem o resumo.` };
    }

    const { data: conexao } = await db
      .from("whatsapp_conexoes")
      .select("instancia, status")
      .eq("org_id", orgId)
      .maybeSingle();

    // Confere no WhatsApp quais números existem. Se o servidor estiver fora do
    // ar, salva assim mesmo — a rotina avisa depois se algum falhar.
    if (destinatarios.length && conexao?.status === "conectado") {
      try {
        const consulta = await verificarNumeros(conexao.instancia, destinatarios);
        const semWhatsapp = consulta.filter((c) => !c.existe).map((c) => formatarTelefone(c.numero));
        if (semWhatsapp.length) {
          return { ok: false, erro: `Sem WhatsApp: ${semWhatsapp.join(", ")}. Confira o número.` };
        }
      } catch {
        // segue sem a conferência
      }
    }

    const { error } = await db
      .from("whatsapp_conexoes")
      .update({
        notificar: booleano(fd, "notificar"),
        incluir_atrasadas: booleano(fd, "incluir_atrasadas"),
        dias_antecedencia: Math.min(Math.max(inteiro(fd, "dias_antecedencia", 3) ?? 3, 0), 60),
        horario_envio: Math.min(Math.max(inteiro(fd, "horario_envio", 8) ?? 8, 0), 23),
        destinatarios,
      })
      .eq("org_id", orgId);

    if (error) {
      if (colunaAusente(error)) {
        return {
          ok: false,
          erro: "Banco desatualizado: rode o migrador de novo (veja INSTALACAO.md).",
        };
      }
      return erroBanco(error);
    }

    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export type ResultadoTeste =
  | { ok: true; enviados: number; falhas: string[] }
  | { ok: false; erro: string };

/** Manda agora, para todos os destinatários, o mesmo resumo da rotina diária. */
export async function enviarResumoTeste(): Promise<ResultadoTeste> {
  try {
    const { orgId, organizacao } = await exigirGestor();
    const db = await createClient();

    const { data: conexao } = await db
      .from("whatsapp_conexoes")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle();

    if (!conexao || conexao.status !== "conectado") {
      return { ok: false, erro: "Conecte um WhatsApp antes de enviar o teste." };
    }

    const destinos = destinatariosDe(conexao);
    if (!destinos.length) return { ok: false, erro: "Cadastre ao menos um número para receber." };

    const { data: pendencias, error } = await db.rpc("whatsapp_pendencias", { p_org: orgId });
    if (error) return erroBanco(error);

    const texto = montarResumo(organizacao.nome, pendencias ?? [], true);

    let enviados = 0;
    const falhas: string[] = [];
    for (const numero of destinos) {
      try {
        await enviarTexto(conexao.instancia, numero, texto);
        enviados++;
      } catch (e) {
        falhas.push(`${formatarTelefone(numero)}: ${mensagemErro(e)}`);
      }
    }

    if (!enviados) return { ok: false, erro: falhas.join(" · ") };
    return { ok: true, enviados, falhas };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}
