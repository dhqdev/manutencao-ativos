import { Sparkles } from "lucide-react";
import { ChatAssistente } from "@/components/assistente/chat";
import { Cabecalho, EstadoVazio } from "@/components/ui";
import { configuracaoGroq } from "@/lib/integracoes";
import { getContexto } from "@/lib/session";

export const metadata = { title: "Assistente · Gestão de Manutenção" };

export default async function AssistentePage() {
  const { orgId, organizacao, profile } = await getContexto();
  // Só diz se o superadmin ligou o Groq; a chave fica no servidor.
  const ligado = Boolean(await configuracaoGroq().catch(() => null));

  if (ligado) {
    // A tela de conversa tem cabeçalho próprio e enxuto (o campo fica preso embaixo).
    return <ChatAssistente nome={profile.nome?.split(" ")[0] ?? null} orgId={orgId} />;
  }

  return (
    <>
      <Cabecalho
        titulo="Assistente"
        descricao={`Pergunte sobre os ativos, manutenções, planos e pneus de ${organizacao.nome}. Ele só consulta: não altera nada.`}
      />
      <EstadoVazio
        icone={<Sparkles className="h-5 w-5" />}
        titulo="Assistente ainda não disponível"
        descricao="O administrador do sistema precisa ligar o assistente de IA. Assim que ele fizer isso, esta tela passa a funcionar."
      />
    </>
  );
}
