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
menu **Administração**. O migrador cria e mantém esse login a cada deploy.

> **Portainer com um Traefik que já existe na VM?** Use
> [`infra/portainer.yml`](infra/portainer.yml): troque os valores `TROQUE-...`,
> cole em *Stacks → Add stack* e faça o Deploy. Para atualizar, troque a tag das
> 4 linhas `image:` pela release nova e clique em *Update the stack*.

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
`SUPERADMIN_SENHA`. No menu **Administração** você cria empresas e usuários.

> Quer que só você crie contas? Ponha `CADASTRO_ABERTO='false'` no `.env` e
> rode `./deploy.sh` de novo. Novos usuários passam a ser criados pelo
> superadmin (Administração) ou pelo gestor (Configurações → Equipe).

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
     Opcional: `DEPLOY_KNOWN_HOSTS` = saída de `ssh-keyscan IP_DA_VM` (mais seguro).
   - **Variables**: `DEPLOY_HOST` = IP ou nome da VM.
     Opcionais: `DEPLOY_USUARIO` (padrão `ubuntu`), `DEPLOY_PASTA` (padrão `/opt/manutencao`).

O job `deploy` copia `stack.yml`, `traefik.yml` e `deploy.sh` e roda
`TAG=<commit> ./deploy.sh` — o `.env` fica sempre só na VM.

---

## Operação

**Atualizar:** push na `main` (com deploy automático) ou, na VM, `./deploy.sh`.

**Voltar uma versão:** escolha a release na aba *Releases* do GitHub e rode
`TAG=v2026.11.19-12 ./deploy.sh` (cada imagem tem a tag da release, do commit
e `latest`).

**Logs:** `docker service logs -f manutencao_<serviço>` (app, rest, db,
whatsapp, cron, backup, migrador) e `docker service logs -f traefik_traefik`.

**Painel do Traefik:** `https://TRAEFIK_DOMINIO` (usuário e senha no arquivo de chaves).

### Backups

Todo dia às 3h30 (`BACKUP_HORA`), mantendo 14 dias (`BACKUP_DIAS`), no volume
`manutencao_backups`:

```bash
sudo ls -lh /var/lib/docker/volumes/manutencao_backups/_data/
```

**Copie para fora da VM** — um backup no mesmo disco não salva de um disco
perdido. O serviço de backup já manda tudo para o **Backblaze B2** quando as
variáveis `B2_*` estão preenchidas.

#### Backblaze B2 (cópia fora do servidor)

O B2 é um armazenamento de arquivos barato (cerca de US$ 6 por TB/mês, os
primeiros 10 GB grátis) e compatível com o `rclone`, que já vem na imagem `ops`.

1. Crie a conta em <https://www.backblaze.com/sign-up/cloud-storage>.
2. **Buckets → Create a Bucket**: nome único (ex.: `suaempresa-manutencao-backup`),
   *Files in Bucket*: **Private**. Ligar *Default Encryption* não custa nada.
3. **Application Keys → Add a New Application Key**: *Allow access to Bucket(s)*:
   só esse bucket; *Type of Access*: **Read and Write**. Copie o **keyID** e a
   **applicationKey** (ela aparece uma vez só).
4. Preencha no serviço de backup (`infra/.env` ou na stack do Portainer):

   ```
   B2_KEY_ID='keyID'
   B2_APP_KEY='applicationKey'
   B2_BUCKET='suaempresa-manutencao-backup'
   B2_PASTA='manutencao'          # pasta dentro do bucket
   B2_DIAS='30'                   # dias que os dumps do banco ficam no B2
   B2_SENHA_CRIPTOGRAFIA=''       # opcional: criptografa antes de enviar
   ```

5. Atualize a stack. No log do backup deve aparecer
   `Backblaze B2 conectado` (`docker service logs manutencao_backup`).

O que vai para lá, todo dia depois do backup local das 3h30:

| No bucket | O quê |
|---|---|
| `manutencao/banco/banco-AAAAMMDD-HHMM.dump` | Um dump do banco por dia, guardado por `B2_DIAS` dias |
| `manutencao/arquivos/` | Espelho das fotos e anexos (só o que mudou sobe) |
| `manutencao/arquivos-removidos/AAAAMMDD-HHMM/` | O que foi apagado no sistema, guardado por `B2_DIAS` dias |

**Testar agora**, sem esperar a madrugada (Portainer → Containers → backup →
Console, ou na VM):

```bash
docker exec -it $(docker ps -qf name=manutencao_backup) /ops/backup.sh agora
```

> Com `B2_SENHA_CRIPTOGRAFIA` os nomes e o conteúdo ficam ilegíveis no painel
> do Backblaze. **Guarde essa senha fora do servidor**: sem ela o backup não
> abre. Não troque depois de começar (os arquivos antigos continuariam na senha velha).

**Baixar do B2 para restaurar** (traz para o volume de backups e depois segue
os passos de restauração abaixo):

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
    rclone lsf "$R/banco"                                    # lista os dumps
    rclone copy "$R/banco/banco-AAAAMMDD-HHMM.dump" /backups # baixa um
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

O jeito fácil é o superadmin: **Administração → Usuários → chave** (define ou
gera uma senha nova). Pelo terminal, para quando nem o superadmin entra
(a senha do superadmin se acerta trocando `SUPERADMIN_SENHA` na stack):

```bash
docker exec -it $(docker ps -qf name=manutencao_db) psql -U postgres -d manutencao -c \
  "update auth.users set encrypted_password = crypt('NovaSenha123', gen_salt('bf', 10)) where email = 'dono@empresa.com.br'"
```

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
