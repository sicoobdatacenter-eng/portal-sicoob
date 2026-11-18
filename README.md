# Portal de Conhecimento – Projeto Sicoob | UnB

Repositório central de documentos, processos e entregas do projeto, com FAQ colaborativo.
Front-end React + TypeScript (Vite), banco/autenticação/arquivos no **Supabase** e hospedagem na **Netlify**.

## Como o acesso funciona

- O login usa **somente usuário e senha**. Nenhuma tela pede e-mail e o portal não envia e-mails.
- **Não há cadastro público.** Só administradores criam, editam, desativam, excluem usuários e redefinem senhas (menu *Gerenciar usuários*).
- Esqueceu a senha? O administrador define uma nova e repassa diretamente à pessoa.
- Por baixo, o Supabase Auth exige um identificador no formato de e-mail. O portal monta esse identificador sozinho (`usuario@portal-psp5.local`), ele nunca aparece na interface e nunca recebe mensagens.
- As senhas são guardadas pelo Supabase Auth com hash seguro (bcrypt). Nada fica em texto puro.
- As operações de administração de usuários rodam apenas na Netlify Function `netlify/functions/admin-users.mjs`, que usa a `SUPABASE_SERVICE_ROLE_KEY`. Essa chave **nunca** vai para o navegador. A função confere o token de quem chama e exige perfil de administrador ativo.
- Regras de segurança (RLS) no banco impedem que usuários comuns criem, editem ou excluam documentos, categorias e usuários, mesmo chamando a API diretamente.

## Perfis

| Ação | Administrador | Usuário |
|---|---|---|
| Consultar, pesquisar, visualizar e baixar documentos | sim | sim |
| Cadastrar pergunta no FAQ | sim (pode publicar direto) | sim (fica pendente até um admin aprovar) |
| Sugerir conteúdo ou correção | sim | sim |
| Criar, editar e excluir documentos e categorias | sim | não |
| Aprovar ou recusar perguntas e sugestões | sim | não |
| Gerenciar usuários e ver o histórico de alterações | sim | não |

## Configuração, passo a passo

### 1. Criar o projeto no Supabase
1. Crie um projeto em <https://supabase.com>.
2. Em **Authentication > Sign In / Providers > Email**, deixe **Allow new users to sign up** **desligado** (ninguém se cadastra sozinho). Você pode manter ou desligar *Confirm email*: os usuários são criados já confirmados pela função.
3. Em **SQL Editor**, rode, nesta ordem:
   1. `supabase/migrations/001_schema.sql` (tabelas, gatilhos, RLS e bucket de arquivos)
   2. `supabase/seed.sql` (opcional): cria as categorias iniciais e cadastra os 4 links reais da pasta "Entregas Sprint 4" (Figma, draw.io, Google Drive e Google Docs). Não cria documentos fictícios.
4. Em **Project Settings > API**, copie: *Project URL*, a chave *anon/publishable* e a chave *service_role*.

### 2. Criar o primeiro administrador (uma única vez)
No seu computador, dentro da pasta do projeto:

```bash
npm install
cp .env.example .env.local      # preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
npm run setup:admin
```

O script pergunta nome, usuário e senha (a senha não aparece na tela) e se recusa a rodar de novo se já existir um administrador. Nenhuma credencial fica no código. Em ambientes sem terminal interativo, use `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `ADMIN_FULL_NAME` como variáveis de ambiente.

Se o Supabase recusar o identificador interno, o script avisa. Nesse caso defina `VITE_AUTH_EMAIL_DOMAIN` com outro domínio válido (por exemplo `acessos.exemplo.com.br`), use o **mesmo valor** na Netlify e rode o script de novo.

### 3. Publicar na Netlify
1. Suba o projeto para um repositório Git e conecte-o em **Add new site > Import from Git** (o `netlify.toml` já define build, pasta `dist`, Functions e cabeçalhos de segurança).
2. Em **Site configuration > Environment variables**, cadastre:

| Variável | Valor | Observação |
|---|---|---|
| `VITE_SUPABASE_URL` | Project URL | pública |
| `VITE_SUPABASE_ANON_KEY` | chave anon/publishable | pública |
| `SUPABASE_URL` | Project URL | usada pela Function |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service_role | **secreta**, só na Function |
| `VITE_AUTH_EMAIL_DOMAIN` | (opcional) | só se precisou trocar o domínio no passo 2 |

3. Faça o deploy. Acesse o site e entre com o administrador criado no passo 2.

### 4. Uso no dia a dia
1. O administrador abre **Gerenciar usuários > Novo usuário**, informa nome, login, senha inicial (há o botão *Gerar senha*) e o perfil.
2. Ele passa login e senha diretamente à pessoa (mensagem, conversa, etc.). A senha só aparece na tela de confirmação, no momento da criação ou da redefinição.
3. Para esquecimento de senha, o administrador usa **Senha** na linha da pessoa, define outra e repassa.
4. **Desativar** bloqueia o acesso sem apagar o histórico. **Excluir** remove o acesso de vez.

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local     # preencha todas as variáveis
npx netlify dev                # sobe o site e a Function em /api/admin-users
```

Com `npm run dev` apenas o front-end roda; a tela *Gerenciar usuários* depende da Function, então use `netlify dev` para testá-la.

Outros comandos: `npm run build` (verifica tipos e gera `dist`) e `npm run test:db` (52 verificações de esquema e RLS em um Postgres local embutido, sem precisar do Supabase).

## Estrutura

```
src/                  interface (páginas, componentes, estilos)
shared/auth.js        regras de login e senha compartilhadas (interface, função e script)
netlify/functions/    admin-users.mjs: administração de usuários (service role)
supabase/migrations/  esquema, RLS e storage
supabase/seed.sql     categorias e entregas reais iniciais
scripts/              setup do primeiro admin e testes de banco
public/brand/         logos oficiais Sicoob e UnB em PNG (sem alterações)
```

## Observações

- Arquivos enviados ao repositório: até 50 MB cada, em bucket privado (PDF e imagens têm prévia; os demais, download). Links do Figma, Google Docs/Sheets/Slides/Drive e YouTube têm prévia incorporada quando o serviço permite.
- Os logos aparecem sempre sobre fundo branco, para preservar as cores originais.
- Toda criação e edição de documentos, categorias, FAQ e sugestões é registrada no **Histórico de alterações** (visível só para administradores).
- Se for incorporar outro serviço em prévia, inclua o domínio em `frame-src` no `netlify.toml`.
