# App do Instituto Bratan

Este repositório é **PÚBLICO**. Não escreva aqui (nem em commit, teste, comentário
ou migração) nome de paciente, CPF, RG, telefone, valor financeiro real, chave,
token, senha ou endereço de banco. Dados fictícios nos testes.

Contexto que não está no código (decisões, números do mês, pendências) fica na
memória do Claude Code, que o Lucas leva de um Mac para outro por AirDrop
(arquivo "Claude - memoria do projeto Bratan"). Se ela não estiver instalada,
peça para ele instalar antes de mexer em regra de negócio.

## Quem pede e como responder

- O Lucas é o gestor financeiro do Instituto. Fala português, não é programador.
- Respostas em português direto, sem jargão; número sempre com a frase do que
  ele significa ("cabe gastar", "falta pagar"). Nada de "saldo do envelope".
- Ele prefere entregas em .docx, .pdf, .xlsx ou .pptx, não páginas HTML.
- Divergência em dinheiro: listar e perguntar, nunca "corrigir" sozinho.
- WhatsApp é só leitura. Nunca mandar mensagem a paciente.
- Senha, CPF, cartão e chave: quem digita é o Lucas.

## Stack e comandos

React 18 + Vite + Tailwind + Supabase (RLS, funções SECURITY DEFINER, Edge
Functions), publicado na Vercel. Gerenciador: **pnpm** (não npm).

| O quê | Comando |
|---|---|
| Tipos | `npx tsc -b` |
| Testes (node:test, sem build) | `node --test tests/*.test.mjs` |
| Build do app | `npx pnpm build` |
| Build do portal do paciente (tem trava de vazamento) | `npx pnpm build:portal` |
| Publicar | `npx vercel --prod --yes` (depois do push) |

Ordem de toda entrega: tipos → testes → build → build:portal → commit → push →
vercel. Commit em português, terminando com
`Co-Authored-By: Claude <noreply@anthropic.com>` (ou a linha que o sistema indicar).

## Banco (Supabase)

- Migração nova em `supabase/migrations/AAAAMMDDNNNN_nome.sql`.
- **Ensaie antes:** rode a migração dentro de `begin; … rollback;` com um bloco
  `do $$ … raise exception 'RESULTADO …' $$` que prova os casos (usuário com e
  sem permissão, valores inválidos). Só depois aplique e registre em
  `supabase_migrations.schema_migrations`.
- **Migração antes do front** quando o front lê coluna nova.
- Valor novo no código = conferir CHECK/enum no banco (um CHECK velho já
  derrubou o salvamento de um lote inteiro).
- Referência de contato nas tabelas (`crm_contact_ref`, `contact_ref`) é o
  `crm_contacts.client_ref` ("contact-…"), nunca o `id` uuid.
- CPF só para quem já pode ver (`contato_documento`); nunca abrir para mais gente.

## Onde moram as regras do dinheiro

- `src/features/financeiro/catalogoPrecificacao.ts`: a planilha de precificação
  dentro do app (preço, coluna P = lucro bruto, imposto, comissão, sala). Mudou a
  planilha → recalcular pelas fórmulas e conferir produto a produto.
- `src/features/financeiro/profissionais.ts`: quem executa e a regra de salário
  de cada um (percentual da coluna P, número de parcelas, dia do vencimento).
- `src/features/financeiro/motorLucroInteligente.ts`: parcelas dos executores,
  lucro dos sócios, compromissos do mês (pagamento é baixa, nunca custo novo).
- `src/features/financeiro/lucroInteligente.ts`: a planilha diária dos envelopes.
- `src/features/financeiro/financeiroData.ts`: P12, lucro do mês, fechamento
  contábil e a ponte dos três lucros (operacional × contábil × caixa).
- Mudança de regra com data (ex.: comissão): vale da data em diante; mês já
  fechado não muda sozinho.

## Telas: como conferir

- O navegador embutido não abre localhost. Para ver telas:
  `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --host 127.0.0.1 --port 5402`
  e fotografar com o chrome-headless-shell do Playwright (modo prévia: cargo em
  `sessionStorage["app-bratan-preview-cargo"]`, dados em localStorage).

## Projeto irmão

A versão para vender a outras clínicas é o repositório **privado**
`instituto-bratan/app-gestao-clinica`. Melhoria feita aqui chega lá com
`git fetch bratan && git merge bratan/main` (rodado lá).

## Mac novo (uma vez)

1. Instalar Node 22+, pnpm (`npm i -g pnpm`), GitHub CLI (`brew install gh`),
   Supabase CLI (`brew install supabase/tap/supabase`).
2. `gh auth login` (o Lucas entra), `git clone https://github.com/instituto-bratan/app-bratan.git`.
3. Fora do iCloud (ex.: `~/Projetos`): pasta dentro do iCloud trava build e git.
4. `pnpm install`; pedir ao Lucas o `.env.local` (vai por AirDrop, nunca pelo chat).
5. `npx vercel login` e `npx vercel link` (projeto app-bratan); `supabase login`.
