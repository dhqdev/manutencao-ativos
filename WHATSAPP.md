# Notificações por WhatsApp (Baileys, servidor próprio)

Cada empresa conecta o WhatsApp dela dentro do sistema e, todo dia no horário
escolhido, ele envia o resumo das manutenções atrasadas e a vencer para os
números cadastrados.

Antes isso passava pela Evolution API. Agora o projeto tem o **próprio serviço
de WhatsApp**, com [Baileys](https://github.com/WhiskeySockets/Baileys), na
pasta [`whatsapp/`](whatsapp/) — um container da stack (`manutencao_whatsapp`),
sempre ligado, falando com o app e com o banco pela rede interna.

---

## Onde ele roda

```
app ──HTTP + chave──► whatsapp (Baileys) ──► WhatsApp
                          │
                          └──► rest (PostgREST) ──► db   (credenciais dos números)
```

O serviço não tem porta publicada: só o app fala com ele. As credenciais de
cada número ficam na tabela `whatsapp_sessoes` do nosso banco (sem nenhuma
policy de acesso — só o servidor enxerga), então reinício e deploy não pedem
QR de novo.

---

## O que o servidor faz

- **Não cala o celular** — o número só fica online durante o "digitando" de
  cada envio e sai logo depois. Online o tempo todo (`WHATSAPP_SEMPRE_ONLINE`)
  faz o celular parar de tocar notificação das mensagens recebidas.
- **"Digitando..."** — antes de cada mensagem, quem recebe vê o número digitando
  por 1 a 4 segundos, proporcional ao tamanho do texto.
- **QR code direto no app** — Configurações → WhatsApp. Ele se renova sozinho.
- **Código de pareamento** — para quem está usando o sistema **no próprio
  celular** e não tem como escanear a tela: informa o número e digita no
  WhatsApp um código de 8 letras.
- **Não perde a conexão em deploy/reinício** — as credenciais ficam no banco
  (tabela `whatsapp_sessoes`). O processo pode reiniciar à vontade: as sessões
  voltam sozinhas, sem ler o QR de novo.
- **Reconexão automática** — queda de internet ou do WhatsApp: tenta de novo
  com espera crescente (2 s, 4 s, 8 s… até 1 min), sem desistir nunca de um
  número pareado. Só o celular removendo o aparelho (ou o Desconectar do
  sistema) desliga de vez.
- **Vigia** — a cada 30 s confere cada número: conexão que morreu sem aviso,
  login que não termina ("conectando" por mais de 3 min) ou número pareado
  sem reconexão marcada são religados sozinhos.
- **Envio que não se perde** — se a conexão cair (ou travar) bem na hora de
  enviar, o servidor reconecta e tenta mais uma vez, dentro do prazo do app.
  Um envio que trava não prende a fila dos próximos.
- **Reenvio pedido pelo destinatário** — quando o celular de quem recebe não
  consegue abrir uma mensagem (trocou de aparelho, abriu o WhatsApp Web), ele
  pede de novo. O servidor guarda as mensagens enviadas por 7 dias para
  atender; sem isso a pessoa ficava em "Aguardando mensagem".
- **Nono dígito** — muitos celulares antigos continuam registrados no WhatsApp
  sem o 9. Antes de enviar, o servidor pergunta ao WhatsApp pelas duas formas
  e usa a que existe.
- **Fila de envio** — mensagens da mesma empresa saem uma de cada vez, com
  pausa entre elas (evita rajada, que é o que faz o WhatsApp bloquear número).
- **Não baixa histórico** — o servidor só envia avisos; não puxa conversas
  antigas (economiza memória e banco).
- **Detecta desconexão pelo celular** — se alguém remover o aparelho em
  "Aparelhos conectados", a tela do app já mostra "Desconectado".

---

## Como funciona para o usuário

1. **Configurações → Notificações por WhatsApp → Conectar com QR code**
   (ou **Conectar pelo número**, para receber um código em vez do QR).
2. No celular: WhatsApp → **Configurações → Aparelhos conectados → Conectar um aparelho**.
3. A tela muda sozinha para "Conectado".
4. Em **Quem recebe o resumo**, cadastre um ou mais números (até 10). O sistema
   confere no WhatsApp se cada número existe antes de salvar.
5. Ajuste horário, antecedência e atrasadas, e use **Enviar teste**.

> O número conectado é o **remetente** da empresa. Se a lista de quem recebe
> ficar vazia, o resumo vai para o próprio número conectado (chat "Você") —
> funciona, mas o celular normalmente não toca notificação nesse chat.
> O ideal é conectar um número da empresa e cadastrar os celulares dos gestores.

Se não houver nada pendente, **nada é enviado**.

---

## Instalação

Nada a fazer à parte: o serviço sobe junto com a stack (`infra/deploy.sh`,
veja [INSTALACAO.md](INSTALACAO.md)). Ele usa estas variáveis do `infra/.env`:

| Variável | Para quê |
|---|---|
| `WHATSAPP_API_KEY` | Chave entre o app e o serviço (os dois leem do mesmo `.env`) |
| `APP_URL` | App na rede interna (`http://app:3000`). O serviço pede a ele um token de 5 min do papel `whatsapp_servico`, que só enxerga as tabelas do WhatsApp. Se faltar, deduz do `POSTGREST_URL` |

O serviço **não** recebe mais o `JWT_SECRET`: se a sua stack antiga ainda passa
essa variável para ele, tire (ela só serve de reserva se o app não responder,
e mesmo assim com o papel restrito).

Conferir: `docker service logs -f manutencao_whatsapp` deve mostrar
"servidor de WhatsApp no ar" e "restaurando sessões salvas".

Vindo da Evolution: as sessões antigas **não migram** (são outro formato).
Cada empresa lê o QR uma vez em Configurações → WhatsApp e cadastra quem
recebe. Depois, apague as instâncias `manut_...` no painel da Evolution para o
celular não ficar com dois aparelhos conectados.

---

## Ajustes do servidor (opcionais)

| Variável | Padrão | O que faz |
|---|---|---|
| `WHATSAPP_SEMPRE_ONLINE` | `false` | Mantém o número online o tempo todo. **Efeito colateral do WhatsApp:** enquanto um aparelho conectado está online, o celular para de tocar notificação das mensagens **recebidas** (parece que o número "parou de receber"). Para só mandar avisos, deixe `false`: o número fica online só durante cada envio. |
| `WHATSAPP_DIGITANDO` | `true` | "Digitando..." antes de cada mensagem. |
| `WHATSAPP_REJEITAR_CHAMADAS` | `false` | Recusa ligações recebidas no número conectado. |
| `WHATSAPP_INTERVALO_ENVIO_MS` | `1500` | Pausa entre mensagens da mesma empresa. |
| `WHATSAPP_NOME_APARELHO` | `Gestão de Manutenção` | Nome que aparece em "Aparelhos conectados". |
| `LOG_LEVEL` / `LOG_LEVEL_BAILEYS` | `info` / `warn` | Detalhe dos logs. |

---

## A rotina diária

`GET /api/notificacoes/disparar`, protegida por `CRON_SECRET` (só no cabeçalho
`Authorization: Bearer ...`). Chamada **de hora em hora** pelo serviço `cron`
da stack (minuto 1 de cada hora).

Para cada empresa conectada, a partir do horário dela:

1. **reserva o dia** com `whatsapp_reservar_envio()` — se duas rodadas
   chegarem juntas (cron + disparo manual), só uma envia;
2. confere no servidor de WhatsApp que o número está conectado. Se estiver
   **reconectando** (logo depois de um deploy), tenta na hora seguinte sem
   mexer em nada; se foi **desconectado pelo celular**, marca como desconectado;
3. busca as pendências (`whatsapp_pendencias()`);
4. envia para cada número cadastrado e registra em `whatsapp_envios`.

Uma falha libera a próxima hora para tentar de novo; um envio com sucesso
encerra o dia. As empresas são atendidas 4 de cada vez.

```bash
curl -H "Authorization: Bearer SEU_CRON_SECRET" https://SEU_DOMINIO/api/notificacoes/disparar
```

```json
{ "hora": 8, "verificadas": 1, "enviadas": 1, "puladas": 0, "falhas": [] }
```

Para reenviar no mesmo dia, apague a linha do dia em `whatsapp_envios`.

---

## API do servidor de WhatsApp

Todas as rotas, menos `/saude`, exigem `Authorization: Bearer WHATSAPP_API_KEY`.
Quem chama é só o app — a chave nunca vai ao navegador (`lib/whatsapp.ts` é
`server-only`).

| Método e rota | Corpo | Resposta |
|---|---|---|
| `GET /saude` | — | `{ ok, sessoes, conectadas, conectando }` |
| `POST /sessoes/:id/conectar` | `{ telefone? }` | `{ status, qr, codigoPareamento, numero, nomePerfil }` |
| `GET /sessoes/:id` | — | o mesmo formato acima |
| `DELETE /sessoes/:id` | — | remove o aparelho do celular e apaga as credenciais |
| `POST /sessoes/:id/mensagens` | `{ numero, texto, digitando? }` | `{ ok, id, jid }` · 409 desconectado · 422 número sem WhatsApp · 503/504 conexão caiu e não voltou a tempo |
| `POST /sessoes/:id/arquivos` | `{ numero, nome, tipo, base64, legenda? }` | `{ ok, id, jid }` · imagem (JPG/PNG/WEBP) com legenda ou PDF como documento, até 8 MB · 415 outro tipo |
| `POST /sessoes/:id/numeros` | `{ numeros: [] }` | `{ numeros: [{ numero, existe, jid }] }` |

`:id` é a coluna `whatsapp_conexoes.instancia` (`manut_<id-da-empresa>`), ou
`sistema_cobranca`: o WhatsApp do dono do sistema, conectado no console
(seção Assinaturas), que recebe os comprovantes de pagamento das empresas.

---

## Observações operacionais

- **Um processo só.** Duas cópias do serviço com as mesmas credenciais
  derrubam uma à outra (o WhatsApp responde `connectionReplaced`). Por isso a
  stack usa `replicas: 1` e atualiza com `stop-first` (a cópia velha sai antes
  de a nova entrar). Não aumente as réplicas. Se mesmo assim acontecer, a
  cópia derrubada não desiste: espera 2 min (depois 4, 8… até 30) e retoma,
  relendo as credenciais do banco. No log aparece "sessão aberta em outra
  conexão".
- **Gravação das chaves.** Chave de criptografia que não chega ao banco volta
  velha no próximo reinício e quebra a conversa. Por isso as gravações
  insistem (até ~20 s por tentativa, mais as do Baileys), as credenciais
  tentam de novo sozinhas até gravar e o desligamento espera o que já estava
  na fila. Token do banco recusado (JWT_SECRET trocado) é renovado na hora.
- **Número pareado antes desta versão** (com a sincronização inicial
  desligada) não tem os pares LID ↔ número que o WhatsApp manda no
  pareamento. Ele funciona, mas se algum número continuar sem receber,
  desconecte e leia o QR de novo uma vez.
- **Deploy e reinício não desconectam.** No desligamento (SIGTERM) o servidor
  fecha as conexões sem deslogar e espera as gravações pendentes; ao subir,
  religa todas as sessões salvas, uma a cada 1,5 s. Enquanto religa, a sessão
  responde "conectando" (nunca "desconectado"), e a rotina tenta na hora
  seguinte sem marcar a empresa como desconectada.
- **Desconectar pelo sistema** remove o aparelho do celular e apaga as
  credenciais do banco.
- **QR que ninguém lê** para de girar depois de uns 3 minutos; é só clicar em
  conectar de novo.
- **Risco de bloqueio:** o WhatsApp não tem API oficial para isso e pode
  bloquear números que mandam muita mensagem para quem não tem o número salvo.
  Um resumo por dia para os próprios gestores é uso tranquilo; evite usar o
  servidor para disparo em massa.
- **Versão do Baileys:** fixada em `whatsapp/package.json` (`7.0.0-rc14`). Ao
  atualizar, teste a conexão antes em um número reserva.
