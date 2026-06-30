# Inteligencia 360 - APP BRATAN

## O que foi criado

A area `Inteligencia 360` transforma dados operacionais em leitura executiva:

- Dashboard 360 read-only para consolidar indicadores, alertas, qualidade dos dados e proximas acoes.
- Modulos operacionais para preenchimento da fonte correta do dado.
- Motor `intelligenceEngine` com regras de ticket, conversao, retencao, resgate, recebiveis e experiencia.
- Migration Supabase com tabelas, enums, campos calculados e RLS.

## Onde ficam os arquivos

- Telas: `src/features/inteligencia360/Inteligencia360Page.tsx`
- Dados, tipos e seeds: `src/features/inteligencia360/inteligencia360Data.ts`
- Motor de inteligencia: `src/features/inteligencia360/intelligenceEngine.ts`
- Rotas: `src/App.tsx` e `src/lib/routePreload.ts`
- Navegacao: `src/layouts/AppLayout.tsx`
- Banco: `supabase/migrations/202606240012_inteligencia_360.sql`

## Como preencher ticket medio semanal

Abra `Inteligencia 360 > Ticket Medio Semanal`.

Preencha sempre separado por:

- semana;
- medico;
- paciente novo ou recorrente;
- atendidos;
- fechados;
- valor vendido;
- valor recebido;
- meta;
- ticket da semana anterior;
- hipotese da queda;
- causa raiz;
- plano de acao.

O Dashboard 360 nao recebe formulario de ticket. Ele apenas le esse modulo e consolida os indicadores.

## Como gerar insights

Abra `/inteligencia-360`.

O Dashboard calcula:

- ticket medio geral, novos e recorrentes;
- vendido vs recebido;
- conversao prescrito x vendido;
- recebiveis em aberto e vencidos;
- retencao, resgate, churn e NPS;
- qualidade dos dados;
- insights da semana.

Cada card abre a fonte de verdade do dado.

## Como criar acoes

No Dashboard, cada insight critico ou de atencao tem o botao `Criar acao`.

A acao criada aparece em `Inteligencia 360 > Acoes e Plano de Melhoria`, com:

- origem;
- titulo;
- descricao;
- dono;
- prazo;
- prioridade;
- impacto esperado.

## Como evoluir para iClinic, Feegow, SharePoint ou API

A primeira versao funciona com dados manuais e seeds locais para demonstracao.

Para integrar sistemas reais:

- manter cada modulo como fonte da verdade;
- importar dados para as tabelas da migration;
- gerar `dashboard_360_snapshots` automaticamente por job, Edge Function ou view;
- nunca preencher o Dashboard 360 manualmente;
- usar `patient_reference` em vez de CPF ou dados sensiveis;
- manter mensagens como tarefa/copiar mensagem antes de automatizar envio.
