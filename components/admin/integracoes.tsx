"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, KeyRound, LoaderCircle, Sparkles, TriangleAlert } from "lucide-react";
import { BotaoExcluir } from "@/components/confirmar";
import { Erro, useAcao } from "@/components/admin/comum";
import { Badge, Botao, Campo, Secao } from "@/components/ui";
import { chamarAcao } from "@/lib/acao-cliente";
import { adminRemoverGroq, adminSalvarGroq, adminTestarGroq } from "@/lib/actions/integracoes";
import { dataHoraBR } from "@/lib/format";
import { GROQ_MODELO_PADRAO, MODELOS_GROQ, modeloDesligado } from "@/lib/modelos-groq";

const OUTRO = "__outro__";

/**
 * Aba "Integrações" do console: um cartão por serviço externo (Groq, Backblaze...).
 * As chaves ficam em sistema_credenciais; a tela só recebe se existem e o final.
 */
export function IntegracoesAdmin({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-4 lg:grid-cols-2">{children}</div>;
}

export type SituacaoGroq = {
  configurada: boolean;
  final: string | null;
  atualizadoEm: string | null;
  /** O que o assistente usa de fato (o salvo, ou o padrão se ele foi desligado). */
  modelo: string;
  modeloSalvo: string | null;
};

export function CartaoGroq({ situacao }: { situacao: SituacaoGroq }) {
  const router = useRouter();
  const { erro, ocupado, rodar } = useAcao();
  const [teste, setTeste] = useState<{ ok: boolean; texto: string } | null>(null);
  const [testando, setTestando] = useState(false);
  const [chave, setChave] = useState("");
  // Modelos que a chave enxerga (vêm do teste); antes disso, só os sugeridos.
  const [daConta, setDaConta] = useState<string[]>([]);
  const conhecidos = MODELOS_GROQ.map((m) => m.id);
  const [escolha, setEscolha] = useState(conhecidos.includes(situacao.modelo) ? situacao.modelo : OUTRO);
  const [outro, setOutro] = useState(conhecidos.includes(situacao.modelo) ? "" : situacao.modelo);
  const extras = daConta.filter((m) => !conhecidos.includes(m));

  function salvar(fd: FormData) {
    setTeste(null);
    // Depois de salvar, testa sozinho: erro de chave ou de modelo aparece já.
    rodar(() => chamarAcao(() => adminSalvarGroq(fd)), () => {
      setChave("");
      void testar();
    });
  }

  async function testar() {
    setTestando(true);
    setTeste(null);
    const r = await chamarAcao(() => adminTestarGroq());
    if ("modelos" in r && r.modelos.length) setDaConta(r.modelos);
    if (r.ok && "modelo" in r) setTeste({ ok: true, texto: `Chave e modelo funcionando (${r.modelo}).` });
    else setTeste({ ok: false, texto: r.erro ?? "Falha no teste." });
    setTestando(false);
  }

  return (
    <Secao
      titulo="Groq · assistente de IA"
      acoes={
        situacao.configurada ? (
          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Ligado</Badge>
        ) : (
          <Badge>Desligado</Badge>
        )
      }
    >
      <form action={salvar} className="space-y-4 px-4 py-4 sm:px-5">
        <p className="text-sm text-slate-600">
          Liga o <strong>Assistente</strong> para todos os clientes. Ele responde perguntas consultando só os dados
          da empresa de quem pergunta, e não altera nada. Crie a chave em{" "}
          <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-marca-700 underline">
            console.groq.com/keys
          </a>
          .
        </p>

        {situacao.configurada && (
          <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <KeyRound className="h-4 w-4 text-slate-400" aria-hidden />
            Chave salva terminando em <code className="font-mono">…{situacao.final}</code>
            {situacao.atualizadoEm && <span className="text-slate-500">· {dataHoraBR(situacao.atualizadoEm)}</span>}
          </p>
        )}

        <Campo
          label={situacao.configurada ? "Trocar a chave" : "Chave da API"}
          hint={situacao.configurada ? "Deixe em branco para manter a atual." : undefined}
        >
          <input
            name="chave"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="gsk_..."
            className="campo font-mono"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
          />
        </Campo>

        {modeloDesligado(situacao.modeloSalvo) && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              O modelo salvo (<code className="font-mono">{situacao.modeloSalvo}</code>) foi desligado pelo Groq. O
              assistente já está usando <code className="font-mono">{GROQ_MODELO_PADRAO}</code>; salve para gravar a troca.
            </span>
          </p>
        )}

        <Campo label="Modelo" hint="Todos da lista aceitam chamada de ferramentas (tool use), que o assistente usa.">
          <select
            className="campo"
            value={escolha}
            onChange={(e) => setEscolha(e.target.value)}
            name={escolha === OUTRO ? undefined : "modelo"}
          >
            {MODELOS_GROQ.map((m) => (
              <option key={m.id} value={m.id}>
                {m.rotulo} · {m.detalhe}
              </option>
            ))}
            {extras.length > 0 && (
              <optgroup label="Outros modelos da sua chave">
                {extras.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </optgroup>
            )}
            <option value={OUTRO}>Outro (digitar o nome)…</option>
          </select>
        </Campo>
        {escolha === OUTRO && (
          <input
            name="modelo"
            value={outro}
            onChange={(e) => setOutro(e.target.value)}
            placeholder={GROQ_MODELO_PADRAO}
            aria-label="Nome do modelo"
            className="campo font-mono"
            spellCheck={false}
          />
        )}

        {erro && <Erro>{erro}</Erro>}
        {teste && (teste.ok ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700">
            <CircleCheck className="h-4 w-4" aria-hidden /> {teste.texto}
          </p>
        ) : (
          <Erro>{teste.texto}</Erro>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Botao type="submit" disabled={ocupado}>
            {ocupado ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Salvar
          </Botao>
          {situacao.configurada && (
            <>
              <Botao type="button" variante="secundario" onClick={testar} disabled={testando}>
                {testando && <LoaderCircle className="h-4 w-4 animate-spin" />}
                Testar conexão
              </Botao>
              <BotaoExcluir
                acao={adminRemoverGroq}
                titulo="Remover a chave do Groq?"
                mensagem="O assistente fica desligado para todos os clientes até uma chave nova ser salva."
                rotulo="Remover"
                className="ml-auto"
                aoConcluir={() => router.refresh()}
              />
            </>
          )}
        </div>
      </form>
    </Secao>
  );
}
