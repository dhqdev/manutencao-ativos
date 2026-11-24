# Instalação no servidor próprio (Oracle Cloud ARM64 + Docker Swarm)

Tudo roda em uma VM sua: banco, API, login, arquivos, WhatsApp, HTTPS e
backup. Nenhum serviço externo é necessário (o e-mail de recuperação de senha
é opcional e usa o SMTP que você escolher).

```
internet ─► traefik ─► app ─► rest (PostgREST) ─► db (PostgreSQL 17)
                        └──► whatsapp (Baileys)
migrador · cron · backup
```

O GitHub Actions monta e testa as imagens a cada push na `main`, publica em
`ghcr.io/dhqdev/manutencao-ativos/{app,whatsapp,ops}` (linux/arm64) e cria uma
**release** (`vAAAA.MM.DD-N`) com as notas dos commits, as tags das imagens e o
pacote `infra/` anexado.

---

## O que você precisa

- VM **Ampere A1 (ARM64)** na Oracle Cloud com **Ubuntu 22.04 ou 24.04**
  (o plano Always Free — até 4 OCPUs e 24 GB — sobra).
- Um domínio (ou subdomínio) para o sistema e outro para o painel do Traefik.
- O arquivo de chaves que veio junto com este projeto (ou gere as suas, veja
  "Gerar chaves").

---

## 1. Oracle Cloud: liberar 80 e 443

No console: **Networking → Virtual Cloud Networks → (sua VCN) → Security
Lists → Default Security List → Add Ingress Rules**:

| Source CIDR | Protocolo | Porta de destino |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

> Se a VM usa um NSG (Network Security Group), adicione as mesmas regras nele.
> Reserve o IP público (Networking → Reserved Public IPs) para ele não mudar.

## 2. DNS

Crie dois registros **A** apontando para o IP público da VM:

```
manutencao.seudominio.com.br   →  IP_DA_VM
traefik.seudominio.com.br      →  IP_DA_VM
```

O certificado HTTPS só sai depois que o DNS estiver respondendo.

## 3. Preparar a VM

```bash
ssh ubuntu@IP_DA_VM
sudo git clone https://github.com/dhqdev/manutencao-ativos.git /opt/manutencao
sudo chown -R ubuntu:ubuntu /opt/manutencao
cd /opt/manutencao
sudo bash infra/preparar-servidor.sh
exit   # saia e entre de novo para o grupo "docker" valer
```

O script instala o Docker, abre 80/443 no firewall da própria VM (as imagens
Ubuntu da Oracle bloqueiam tudo além da 22), liga o modo Swarm e cria a rede
`rede_publica`.

## 4. Acesso às imagens

As imagens ficam no GitHub Container Registry. Escolha um:

- **Tornar públicas** (mais simples): no GitHub, abra cada pacote em
  *Your profile → Packages* (`app`, `whatsapp`, `ops`) → *Package settings* →
  *Change visibility → Public*. O código já é público; as imagens não têm
  segredo nenhum (as chaves ficam só no `.env` do servidor).
- **Manter privadas**: crie um token em *GitHub → Settings → Developer settings
  → Personal access tokens (classic)* com o escopo `read:packages` e, na VM:
  `echo SEU_TOKEN | docker login ghcr.io -u dhqdev --password-stdin`

> As imagens só aparecem depois do primeiro workflow verde na `main`
> (aba *Actions* do repositório).

## 5. Chaves e domínios

```bash
cd /opt/manutencao/infra
cp .env.exemplo .env
chmod 600 .env
nano .env
```

Cole as chaves do arquivo que você recebeu e ajuste `DOMINIO`,
`TRAEFIK_DOMINIO` e `ACME_EMAIL`. Mantenha as **aspas simples** nos valores.

Defina também o **superadmin** (`SUPERADMIN_EMAIL` e `SUPERADMIN_SENHA`, com 8
ou mais caracteres): é o login que administra todas as empresas e usuários pelo
**console do superadmin** (ele só gerencia; não usa o sistema das empresas). O migrador cria e mantém esse login a cada deploy.

> **Portainer com um Traefik que já existe na VM?** Use
> [`infra/portainer.yml`](infra/portainer.yml): troque os valores `TROQUE-...`,
> cole em *Stacks → Add stack* e faça o Deploy. Para atualizar: console do
> superadmin → **Versão do sistema** → **Atualizar** (serviço `manutencao-atualizador`), ou
> clique em *Update the stack* com **Re-pull image and redeploy** ligado (com
> `:latest`) ou trocando a tag das linhas `image:` pela release nova. Não
> precisa mexer no migrador: os serviços backup e atualizador conferem a versão
> do banco ao subir e aplicam o SQL que faltar.

## 6. Subir

```bash
cd /opt/manutencao/infra
./deploy.sh
```

Acompanhe:

```bash
docker stack services manutencao          # todos 1/1 (o migrador fica 0/1 depois de terminar)
docker service logs -f manutencao_migrador
docker service logs -f manutencao_app
```

Em 1–2 minutos: `https://SEU_DOMINIO` → entre com o `SUPERADMIN_EMAIL` e a
`SUPERADMIN_SENHA`. Você cai no **console do superadmin**, onde cria os usuários (cada um numa empresa nova ou numa existente).

> Quer que só você crie contas? Ponha `CADASTRO_ABERTO='false'` no `.env` e
> rode `./deploy.sh` de novo. Novos usuários passam a ser criados pelo
> superadmin (console) ou pelo gestor (Configurações → Equipe).

> Cada empresa tem até `ARQUIVOS_COTA_MB` (padrão 5120, ou seja 5 GB) de fotos
> e anexos; `0` tira o limite. Arquivos que ficaram no disco sem registro no
> banco vão toda madrugada para `ARQUIVOS_DIR/.orfaos/` e saem de vez em 30 dias.

---

## 7. Trazer os dados do Supabase antigo (opcional, uma vez)

Traz logins (**com as mesmas senhas**), empresas, ativos, manutenções, planos,
pneus, configuração do WhatsApp e todos os arquivos (fotos e anexos).

No Supabase: *Project Settings → Database → Connection string → URI* (use a
conexão direta ou o "Session pooler") e a chave secreta em *Settings → API Keys*.

```bash
cd /opt/manutencao/infra && set -a && . ./.env && set +a
docker run --rm --network manutencao_interna \
  -v manutencao_arquivos:/dados/arquivos \
  -e PGHOST=db -e PGPASSWORD="$POSTGRES_PASSWORD" \
  -e SUPABASE_DB_URL='postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres' \
  -e SUPABASE_URL='https://xojpygcmdvuzklllobbb.supabase.co' \
  -e SUPABASE_SECRET_KEY='sb_secret_...' \
  ghcr.io/dhqdev/manutencao-ativos/ops:latest importar-supabase
```

Faça isso **antes** de alguém se cadastrar no sistema novo (o script recusa
importar num banco que já tem empresas, a não ser com `-e FORCAR=1`). As
conexões de WhatsApp voltam como "desconectado": cada empresa lê o QR uma vez.

Depois de conferir que está tudo lá, o projeto do Supabase pode ser pausado.

---

## Deploy automático (GitHub Actions → servidor)

Sem configurar nada, o Actions só monta, testa e publica as imagens; você roda
`./deploy.sh` na VM quando quiser. Para o deploy acontecer sozinho a cada push
na `main`:

1. Na VM, autorize a chave pública de deploy (está no arquivo de chaves):
   ```bash
   echo 'ssh-ed25519 AAAA... github-actions-deploy' >> ~/.ssh/authorized_keys
   ```
2. No GitHub: *Settings → Secrets and variables → Actions*
   - **Secrets**: `DEPLOY_SSH_KEY` = a chave **privada** de deploy.
     Obrigatório: `DEPLOY_KNOWN_HOSTS` = saída de `ssh-keyscan -H IP_DA_VM` (confira a impressão digital no servidor; sem ela o deploy não conecta).
   - **Variables**: `DEPLOY_HOST` = IP ou nome da VM.
     Opcionais: `DEPLOY_USUARIO` (padrão `ubuntu`), `DEPLOY_PASTA` (padrão `/opt/manutencao`).

O job `deploy` copia `stack.yml`, `traefik.yml` e `deploy.sh` e roda
`TAG=<commit> ./deploy.sh` — o `.env` fica sempre só na VM.

---

## Operação

**Atualizar:** console do superadmin → bloco **Versão do sistema** → **Atualizar para vX**
(o serviço `atualizador` aplica a última release publicada no ghcr.io), push na
`main` (com deploy automático) ou, na VM, `./deploy.sh`. O botão troca só as
imagens: quando a release muda o arquivo da stack (variável ou serviço novo),
atualize a stack também. Stack antiga, sem o serviço `atualizador`: atualize a
stack uma vez com o arquivo novo e o botão passa a funcionar.

**Sobras:** o `atualizador` apaga sozinho os contêineres parados desta stack
(substituídos numa atualização, migrador que terminou) e as imagens antigas
`app`/`whatsapp`/`ops` que nenhum contêiner usa: no fim de cada atualização, ao
subir e de hora em hora. Contêiner que saiu com erro fica 24 h (para o
`docker service logs` mostrar o motivo). Não mexe em volumes nem em outras
stacks. A lista de tarefas antigas em `docker service ps` continua aparecendo:
é só o histórico do Swarm, sem contêiner nem disco.

O banco acompanha sozinho: além do migrador, os serviços **backup** e
**atualizador** comparam, ao subir, a versão da imagem deles com a gravada em
`sistema_esquema` e aplicam o SQL se o banco estiver atrás (nunca para trás).
Isso cobre o caso em que o Swarm não roda o migrador de novo (tarefa antiga
"Complete" com a mesma especificação), que deixava tabela nova faltando
("not in the schema cache").

**Voltar uma versão:** escolha a release na aba *Releases* do GitHub e rode
`TAG=v2026.11.19-12 ./deploy.sh` (cada imagem tem a tag da release, do commit
e `latest`).

**Logs:** `docker service logs -f manutencao_<serviço>` (app, rest, db,
whatsapp, cron, backup, migrador, atualizador) e `docker service logs -f traefik_traefik`.

**Painel do Traefik:** `https://TRAEFIK_DOMINIO` (usuário e senha no arquivo de chaves).

### Backups

A cada 15 dias às 3h30 (`BACKUP_CADA_DIAS` e `BACKUP_HORA`; o intervalo também
se muda no console), mantendo 14 dias (`BACKUP_DIAS`), no volume
`manutencao_backups`. O automático conta a partir do último backup bom, então
um **Fazer backup agora** no console também adia o próximo. Se uma rodada
falhar, ele tenta de novo na madrugada seguinte.

```bash
sudo ls -lh /var/lib/docker/volumes/manutencao_backups/_data/
```

O arquivo `ULTIMO-BACKUP.txt` no mesmo volume diz como foi a última rodada
(`ok banco-AAAAMMDD-HHMM.dump` ou `FALHOU`). O dump só é aceito se o
`pg_restore` consegue lê-lo, e enquanto o backup do banco estiver falhando
nenhuma cópia antiga é apagada pela retenção.

**Copie para fora da VM** — um backup no mesmo disco não salva de um disco
perdido. O serviço de backup já manda tudo para o **Backblaze B2** quando as
credenciais estão no console do superadmin (**Gerência → Integrações**) ou nas
variáveis `B2_*` da stack.

#### Backblaze B2 (cópia fora do servidor)

O B2 é um armazenamento de arquivos barato (cerca de US$ 6 por TB/mês, os
primeiros 10 GB grátis) e compatível com o `rclone`, que já vem na imagem `ops`.

1. Crie a conta em <https://www.backblaze.com/sign-up/cloud-storage>.
2. **Buckets → Create a Bucket**: nome único (ex.: `suaempresa-manutencao-backup`),
   *Files in Bucket*: **Private**. Ligar *Default Encryption* não custa nada.
3. **Application Keys → Add a New Application Key**: *Allow access to Bucket(s)*:
   só esse bucket; *Type of Access*: **Read and Write**. Copie o **keyID** e a
   **applicationKey** (ela aparece uma vez só). Não use a *Master Application
   Key*: ela abre todos os buckets da conta.
   Em **Configurações de ciclo de vida** do bucket, escolha **Keep only the last
   version**: assim nem versão velha de arquivo fica cobrando espaço.
4. No console do superadmin, **Gerência → Integrações → Backup no Backblaze
   B2**: cole o keyID, a applicationKey e o nome do bucket (pasta, intervalo e
   modo são opcionais) e clique em **Salvar**. O console confere a chave na
   API do Backblaze antes de gravar (bucket inexistente, chave sem acesso a ele
   ou bucket público são recusados). O serviço backup relê as credenciais a
   cada rodada: não precisa mexer na stack. A applicationKey nunca volta para a
   tela (só os 4 últimos caracteres).

   Alternativa (reserva, usada só se o console estiver vazio): as variáveis
   do serviço de backup (`infra/.env` ou na stack do Portainer):

   ```
   B2_KEY_ID='keyID'
   B2_APP_KEY='applicationKey'
   B2_BUCKET='suaempresa-manutencao-backup'
   B2_PASTA='manutencao'          # pasta dentro do bucket
   B2_MODO='espelho'              # espelho (igual ao app) ou historico
   B2_DIAS='30'                   # só no historico: dias que os dumps ficam no B2
   B2_SENHA_CRIPTOGRAFIA=''       # opcional: criptografa antes de enviar
   ```

5. No log do backup deve aparecer `Backblaze B2 conectado (console)` (ou
   `(variaveis)`) em até 15 segundos (`docker service logs manutencao_backup`).
   O cartão do console mostra o destino em uso, se o serviço está no ar e as
   últimas rodadas (data, tamanho do banco e dos arquivos, se o B2 deu certo).

O que vai para lá, depois de cada backup local:

| No bucket | O quê |
|---|---|
| `manutencao/banco/AAAA/MM/banco-AAAAMMDD-HHMM.dump` | Dump do banco. No **espelho** (padrão) só fica o mais novo; no **histórico**, um por rodada, pelos dias de retenção (padrão 30) |
| `manutencao/arquivos/<empresa>/…` | Fotos e anexos, arquivo por arquivo (só o que mudou sobe). No espelho, o que foi apagado no app sai do bucket |
| `manutencao/arquivos-removidos/AAAAMMDD-HHMM/` | Só no histórico: o que foi apagado no sistema, pelos mesmos dias |

No modo **espelho** o bucket fica igual ao app, sem guardar informação
antiga. O dump anterior só é apagado depois que o novo subiu inteiro, e nada
é apagado no B2 se o envio falhar.

**Testar agora**, sem esperar a madrugada: botão **Fazer backup agora** no
cartão do console (o serviço pega o pedido em até 15 segundos e a tela
acompanha), ou pelo Portainer → Containers → backup → Console, ou na VM:

```bash
docker exec -it $(docker ps -qf name=manutencao_backup) /ops/backup.sh agora
```

> Sem senha de criptografia (o padrão), os arquivos aparecem com o nome de
> verdade em **Browse Files** do Backblaze e se baixam direto por lá. Quem
> protege é o bucket privado, a chave restrita a ele e a criptografia do
> próprio B2. Com `B2_SENHA_CRIPTOGRAFIA` (só pela stack) nomes e conteúdo
> ficam ilegíveis no painel e **sem essa senha o backup não abre**.

**Baixar do B2 para restaurar** (traz para o volume de backups e depois segue
os passos de restauração abaixo). Se as credenciais estão só no console,
exporte antes `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET`, `B2_PASTA` e
`B2_SENHA_CRIPTOGRAFIA` com os mesmos valores:

```bash
cd /opt/manutencao/infra && set -a && . ./.env && set +a
docker run --rm -v manutencao_backups:/backups \
  -e B2_KEY_ID -e B2_APP_KEY -e B2_BUCKET -e B2_PASTA -e B2_SENHA_CRIPTOGRAFIA \
  --entrypoint sh ghcr.io/dhqdev/manutencao-ativos/ops:latest -c '
    export RCLONE_CONFIG_B2_TYPE=b2 RCLONE_CONFIG_B2_ACCOUNT="$B2_KEY_ID" RCLONE_CONFIG_B2_KEY="$B2_APP_KEY"
    R="b2:$B2_BUCKET/${B2_PASTA:-manutencao}"
    if [ -n "$B2_SENHA_CRIPTOGRAFIA" ]; then
      export RCLONE_CONFIG_C_TYPE=crypt RCLONE_CONFIG_C_REMOTE="$R"
      export RCLONE_CONFIG_C_PASSWORD=$(rclone obscure "$B2_SENHA_CRIPTOGRAFIA"); R="c:"
    fi
    rclone lsf -R "$R/banco"                                       # lista os dumps
    rclone copy "$R/banco/AAAA/MM/banco-AAAAMMDD-HHMM.dump" /backups # baixa um
    rclone copy "$R/arquivos" /backups/arquivos-b2           # fotos e anexos'
```

Os arquivos baixados em `arquivos-b2` voltam para o volume com
`docker run --rm -v manutencao_arquivos:/dados/arquivos -v manutencao_backups:/backups alpine sh -c 'cp -a /backups/arquivos-b2/. /dados/arquivos/ && chown -R 1000:1000 /dados/arquivos'`.

**Restaurar o banco** (apaga o conteúdo atual):

```bash
cd /opt/manutencao/infra && set -a && . ./.env && set +a
docker service scale manutencao_app=0 manutencao_whatsapp=0 manutencao_cron=0
docker run --rm --network manutencao_interna -v manutencao_backups:/backups \
  -e PGHOST=db -e PGPASSWORD="$POSTGRES_PASSWORD" --entrypoint sh \
  ghcr.io/dhqdev/manutencao-ativos/ops:latest \
  -c '. /ops/comum.sh && pg_restore --clean --if-exists -d manutencao /backups/banco-AAAAMMDD-HHMM.dump'
./deploy.sh
```

**Restaurar os arquivos:**

```bash
docker run --rm -v manutencao_arquivos:/dados/arquivos -v manutencao_backups:/backups alpine \
  sh -c 'cd /dados && tar -xzf /backups/arquivos-AAAAMMDD-HHMM.tar.gz && chown -R 1000:1000 /dados/arquivos'
```

### Trocar a senha de alguém pelo servidor

O jeito fácil é o superadmin: **console → chave na linha do usuário** (define ou
gera uma senha nova). Pelo terminal, para quando nem o superadmin entra
(a senha do superadmin se acerta trocando `SUPERADMIN_SENHA` na stack):

```bash
docker exec -it $(docker ps -qf name=manutencao_db) psql -U postgres -d manutencao -c \
  "update auth.users set encrypted_password = crypt('NovaSenha123', gen_salt('bf', 10)) where email = 'dono@empresa.com.br'"
```

### Assistente de IA (Groq, opcional)

Crie uma chave em [console.groq.com/keys](https://console.groq.com/keys) e
cole no console do superadmin, aba **Integrações** → **Groq**. Não é variável
da stack: vale na hora, sem deploy. O servidor precisa sair para
`https://api.groq.com` (porta 443). Use **Testar conexão** para conferir.

### E-mail de recuperação de senha (opcional)

Preencha `SMTP_*` no `.env` (qualquer provedor SMTP: o do seu domínio,
Brevo, Resend, Amazon SES, Gmail com senha de app) e rode `./deploy.sh`. Sem
SMTP, a tela "Esqueci minha senha" orienta a pedir uma senha nova ao gestor.

---

## Segurança — o que fica exposto

- Só **80** e **443** (Traefik). O 80 apenas redireciona para HTTPS.
- **PostgREST, Postgres e WhatsApp não têm porta publicada**: ficam na rede
  interna do Swarm. Ninguém de fora fala com o banco.
- Login com limite de tentativas (8 por e-mail e 30 por IP a cada 15 min),
  senhas em bcrypt, sessões revogáveis no banco, cookie `httpOnly` + `Secure`.
- Fotos e anexos só abrem com link assinado de 1 hora.
- O `atualizador` tem o socket do Docker (= root no servidor), por isso não abre
  porta nem entra na rede pública: só lê pedidos no banco, aceita apenas tags
  `vAAAA.MM.DD-N` e só troca imagens da própria stack vindas do mesmo registro.

### Trocar chaves

| Chave | Efeito de trocar |
|---|---|
| `JWT_SECRET` | Nenhum para o usuário (tokens duram 5 min). Redeploy. |
| `SESSAO_SECRET` | Todo mundo precisa entrar de novo. |
| `ARQUIVOS_SECRET` | Links de fotos abertos param; recarregar a página resolve. |
| `CRON_SECRET`, `WHATSAPP_API_KEY` | Nenhum (app e serviços leem do mesmo `.env`). |
| `AUTHENTICATOR_PASSWORD` | O migrador aplica a nova senha no deploy. |
| `POSTGRES_PASSWORD` | **Não troque só no `.env`**: o Postgres usa esse valor apenas na criação do banco. Troque antes no banco (`ALTER ROLE postgres PASSWORD '...'`) e depois no `.env`. |

Gerar chaves novas: `openssl rand -hex 32`. Senha do painel:
`openssl passwd -apr1 'SENHA'` → `TRAEFIK_PAINEL_USUARIOS='admin:<resultado>'`.

---

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Navegador avisa "certificado inválido" | DNS ainda não aponta para a VM, ou 80/443 fechadas na Security List da Oracle. Veja `docker service logs traefik_traefik`. |
| `404 page not found` (do Traefik) | `DOMINIO` no `.env` diferente do endereço acessado. |
| `Bad Gateway` | O app ainda está subindo ou caiu: `docker service ps manutencao_app --no-trunc`. |
| Serviço com `0/1` e erro "denied" | As imagens são privadas e a VM não fez `docker login ghcr.io` (passo 4). |
| Tela "Banco de dados não configurado" | O migrador falhou: `docker service logs manutencao_migrador`. Corrija e rode `./deploy.sh`. |
| WhatsApp não conecta | `docker service logs -f manutencao_whatsapp`. Veja [WHATSAPP.md](WHATSAPP.md). |
