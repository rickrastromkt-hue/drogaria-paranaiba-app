# Instalar para uma nova empresa

Cada empresa tem **a sua própria instalação**: um projeto Firebase, um projeto na Vercel e uma instância da Z-API.
O código é o mesmo para todas, e o nome, o logo, as cores e as mensagens ficam em **Ajustes**, sem mexer no código.

Tempo estimado: **30 minutos**.

---

## 1. Firebase (banco de dados e login)

1. Acesse https://console.firebase.google.com e clique em **Adicionar projeto** (ex.: `empresa-x-wpp`).
2. **Authentication → Começar →** ative **E-mail/senha**.
3. **Firestore Database → Criar banco →** modo **produção**, região `southamerica-east1` (São Paulo).
4. **Firestore → Regras:** cole o conteúdo de [`firestore.rules`](firestore.rules) e clique em **Publicar**.
5. **Storage → Começar** e, em **Regras**, cole [`storage.rules`](storage.rules). É onde ficam as imagens, vídeos e documentos enviados pela empresa (os áudios vão em base64 e não usam o Storage).
6. **⚙️ Configurações do projeto → Seus apps → Web (`</>`)**: registre o app e copie os valores de `firebaseConfig`.
7. **⚙️ Configurações do projeto → Contas de serviço → Gerar nova chave privada:** baixa um `.json`.
   Use `project_id`, `client_email` e `private_key` dele. **Nunca envie esse arquivo para o GitHub.**

## 2. Z-API (WhatsApp)

1. Crie uma instância no painel da Z-API.
2. Anote o **ID da instância**, o **Token da instância** e o **Token de segurança da conta** (*Segurança*).

## 3. Vercel (hospedagem)

1. Na Vercel, clique em **Add New → Project** e importe este repositório (o mesmo para todas as empresas).
2. Em **Environment Variables**, preencha as variáveis abaixo (modelo em [`.env.example`](.env.example)):

| Variável | Onde pegar |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` … `NEXT_PUBLIC_FIREBASE_APP_ID` | `firebaseConfig` (passo 1.6) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | arquivo `.json` da conta de serviço (passo 1.7). A chave vai **entre aspas**, com os `\n` |
| `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN` | painel da Z-API (passo 2) |
| `ZAPI_WEBHOOK_SECRET`, `CRON_SECRET` | invente dois textos aleatórios e longos |

3. Clique em **Deploy**. Se você cadastrar ou alterar variáveis depois, faça **Redeploy**.
4. *(Opcional)* Em **Settings → Domains**, adicione um domínio próprio (ex.: `atendimento.empresax.com.br`).

## 4. Primeiro acesso

1. Abra `https://SEU-DOMINIO/setup` e informe o **nome da empresa** e os dados do **administrador**.
2. No fim de **Ajustes**, clique em **Ajuste do desenvolvedor** (pede a senha do desenvolvedor), envie o **logo** e o **ícone**, escolha as **cores** e o **slogan**, depois **Salvar identidade**.
3. Em **Ajustes → WhatsApp**, leia o **QR Code** com o celular da empresa e clique em **Configurar webhook automaticamente**.
4. Em **Ajustes → Mensagens automáticas**, revise os textos do menu, boas-vindas, encerramento e o **WhatsApp do Financeiro**.
5. Em **Equipe**, cadastre os atendentes.

## 5. Encerramento automático (recomendado)

Crie uma tarefa gratuita em https://cron-job.org, chamando a cada **1 minuto**:

```
https://SEU-DOMINIO/api/cron/auto-close?secret=VALOR_DO_CRON_SECRET
```

## 6. Teste

Mande "oi" de outro celular para o número da empresa:
- deve chegar o menu (1 Atendimento / 2 Financeiro);
- respondendo **1**, o cliente aparece em **Conversas → Fila** com protocolo.

---

### Atualizações

Todas as empresas usam o mesmo repositório. Quando o código é atualizado no GitHub, **cada projeto da Vercel ligado a ele publica sozinho**.
As configurações de cada empresa (nome, logo, cores e mensagens) ficam no Firebase dela e não são afetadas.

---

## 7. App no celular e notificações

### Notificações (push)
1. Firebase → **Configurações do projeto → Cloud Messaging → Certificados push da Web → Gerar par de chaves**.
2. Salve a chave pública no Firestore em `settings/push` → `{ vapidKey: "..." }`
   (ou na variável `NEXT_PUBLIC_FIREBASE_VAPID_KEY` da Vercel).
3. Cada atendente, no celular, toca em **Ativar** no aviso de notificações (uma vez).

Avisos enviados: **novo cliente na fila** e **mensagem na fila** (toda a equipe), **mensagem de um cliente em atendimento** (responsável e quem atende junto), **atendimento atribuído/transferido para você**.
No iPhone, as notificações só funcionam com o app adicionado à tela inicial (Safari → Compartilhar → Adicionar à Tela de Início).

### Instalar (Android)
- **Sem APK:** abra o site no Chrome → menu ⋮ → **Instalar app**.
- **Com APK:**
  1. Acesse https://www.pwabuilder.com, cole o endereço do site e clique em **Start**.
  2. **Package for stores → Android → Generate Package**. Anote o *Package ID* (ex.: `br.com.empresa.atendimento`).
  3. Baixe o `.zip`: ele traz o **APK** (para instalar direto), o **AAB** (Play Store) e o arquivo `assetlinks.json` com a impressão digital (SHA-256) da chave.
  4. Salve no Firestore em `settings/android` → `{ packageName: "<Package ID>", sha256: ["<SHA-256 do assetlinks.json>"] }`.
     Isso publica `https://SEU-DOMINIO/.well-known/assetlinks.json` e faz o app abrir em tela cheia (sem barra do navegador).
  5. Guarde o arquivo da chave de assinatura (`signing.keystore`) e as senhas: são necessários para gerar atualizações do APK.
