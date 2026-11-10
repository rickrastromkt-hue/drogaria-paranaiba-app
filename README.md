# Central de Atendimento WhatsApp

> Sistema *white-label*: uma instalação por empresa. Para instalar para um novo cliente, siga o **[INSTALACAO.md](INSTALACAO.md)**.

Painel para a equipe atender clientes no WhatsApp via **Z-API**, com **Next.js** na **Vercel** e **Firebase** (Auth, Firestore e Storage).

## Como funciona

1. Cliente manda mensagem → a Z-API chama `/api/webhooks/zapi` → abre um **atendimento** (com protocolo) na **Fila** e envia a mensagem de boas-vindas.
2. Um atendente clica em **Pegar atendimento** → ele vira o dono da conversa (os outros veem "com Fulano").
3. O atendente responde (texto, imagem, áudio, vídeo, PDF; `/` abre as respostas rápidas), pode **transferir** ou **encerrar**.
4. **Encerramento automático:** se a empresa mandou a última mensagem e o cliente não responde em **10 min** (configurável), o atendimento fecha sozinho e o cliente recebe a mensagem de ausência. O cabeçalho do chat mostra a contagem regressiva.
5. Se o cliente escrever de novo depois de encerrado, abre um atendimento novo.

Perfis: **Administrador** (equipe, ajustes, conexão) e **Atendente**.

## Estrutura

```
src/app/(app)/atendimentos   Fila / Meus / Equipe + chat
src/app/(app)/historico      Atendimentos encerrados
src/app/(app)/equipe         Cadastro de atendentes (admin)
src/app/(app)/configuracoes  Z-API, mensagens automáticas, respostas rápidas (admin)
src/app/api/...              Webhook Z-API, ações dos tickets, equipe, cron
src/lib/tickets.ts           Regras de negócio (fila, pegar, enviar, encerrar, ausência)
src/lib/zapi.ts              Cliente Z-API + parser do webhook
firestore.rules / storage.rules
```

Coleções no Firestore: `users`, `tickets` (+ subcoleção `messages`), `contacts`, `settings/general`, `quickReplies`, `meta/counters`.

## Configuração

### 1. Firebase
1. Crie um projeto em https://console.firebase.google.com
2. **Authentication** → ative *E-mail/senha*.
3. **Firestore Database** → crie (modo produção).
4. **Storage** → ative (para envio de arquivos).
5. **Configurações do projeto → Seus apps → Web**: copie as chaves `NEXT_PUBLIC_FIREBASE_*`.
6. **Contas de serviço → Gerar nova chave privada**: use `project_id`, `client_email` e `private_key` nas variáveis `FIREBASE_*`.
7. Publique as regras:
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules,storage --project SEU_PROJETO
   ```

### 2. Variáveis de ambiente
Copie `.env.example` para `.env.local` (local) e cadastre as mesmas na Vercel (*Settings → Environment Variables*).

### 3. Vercel
1. Suba o repositório no GitHub e importe na Vercel.
2. Cadastre as variáveis e faça o deploy.
3. Acesse `https://SEU-DOMINIO/setup` e crie o **primeiro administrador** (só funciona enquanto não existir nenhum usuário).

### 4. Z-API
Em **Ajustes**, clique em **Configurar webhook automaticamente** (precisa estar no domínio da Vercel), ou cadastre manualmente no painel da Z-API, nos webhooks *Ao receber* e *Status da mensagem*:

```
https://SEU-DOMINIO/api/webhooks/zapi?secret=VALOR_DE_ZAPI_WEBHOOK_SECRET
```

Se o número não estiver conectado, o QR Code aparece em **Ajustes**.

### 5. Encerramento por ausência (cron)
A verificação roda em três momentos:
- a cada minuto, enquanto algum atendente estiver com o painel aberto;
- a cada mensagem recebida no webhook;
- **recomendado:** um cron externo a cada minuto, para funcionar mesmo com o painel fechado.

No plano Hobby da Vercel o cron nativo só roda 1x por dia, então use o https://cron-job.org (grátis):
```
GET https://SEU-DOMINIO/api/cron/auto-close?secret=VALOR_DE_CRON_SECRET    (a cada 1 minuto)
```
No plano Pro dá para usar o Vercel Cron: crie um `vercel.json` com
`{"crons":[{"path":"/api/cron/auto-close","schedule":"* * * * *"}]}` (a Vercel envia o `CRON_SECRET` sozinha).

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha
npm run dev
```

## Logo, nome e cores
Tudo em **Ajustes → Ajuste do desenvolvedor** (protegido por senha do desenvolvedor; para trocar a senha numa instalação use `DEV_PASSWORD_SALT`/`DEV_PASSWORD_HASH`) (fica salvo em `settings/branding` no Firestore de cada empresa):
- nome e slogan (usados no sistema e nas mensagens com `{empresa}` e `{slogan}`);
- logo completo (login) e ícone quadrado (barra lateral, aba do navegador, notificações);
- cor principal e cor de destaque (a paleta inteira é gerada a partir delas).
