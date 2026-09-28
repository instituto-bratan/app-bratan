# Nutrição — como rodar o piloto (28/09/2026)

Módulo da Dra. Géssica dentro do APP BRATAN: consulta gravada, prontuário no formato dela, plano alimentar com cálculo e PDF.
Desenho: `docs/superpowers/specs/2026-09-28-nutricao-design.md`. Proposta de produto: https://claude.ai/artifact/XeUrAx2YurbahsETa8fMRU

## Ligar

Dois processos no Mac:

```sh
# 1. o app, em modo demonstração (sem Supabase), em http://127.0.0.1:5174
npx pnpm@10 dev:demo

# 2. a estação local (transcrição, IA, PDF), em http://127.0.0.1:8787
cd tools/estacao-nutri && npm install && npm start
```

Na tela de entrada, "Prévia local" → cargo **Nutricionista** → menu **Nutrição**.
A estação também abre com dois cliques em `tools/estacao-nutri/Iniciar Estação.command`. Detalhes em `tools/estacao-nutri/README.md`.

## O que já funciona

- **Hoje**: consultas do dia, planos a entregar com o prazo de 72 horas úteis (3 dias úteis, feriados nacionais), rascunhos, PDFs não compartilhados, compartilhados sem confirmação, retornos.
- **Consulta**: consentimento, gravação guardada no computador a cada 5 s, envio de áudio do celular, colar anotações, transcrição local (whisper large-v3-turbo), organização pela IA com a fala de origem em cada sugestão, as 14 linhas do roteiro, bloco de suplementos, texto pronto para o iClinic, finalizar (bloqueia pendências) e retificar (com motivo).
- **Plano**: duplicar o anterior ou começar com as listas, refeições, alimentos da TACO com medida caseira, substituições fora do cálculo, opcional dentro, azeite de preparo de 5 g, tabela g/kg · g · %, prévia A4 igual ao PDF, revisão automática, versões e diferenças, entrega em etapas.
- **Biblioteca**: listas dela com versão, TACO 4ª ed. (597 alimentos), medidas caseiras, identificação, ajustes, cópia de segurança.

## O que falta para usar com pacientes reais

1. **IA**: criar `tools/estacao-nutri/.env.local` com `ANTHROPIC_API_KEY` de uma organização da Anthropic separada, com retenção zero de dados (regra da página "O que a IA fez" do próprio app). Sem a chave, tudo funciona à mão e a transcrição continua local.
2. **Consentimento** de gravação e de uso de IA no termo de atendimento; RIPD do módulo no Cofre de compliance.
3. **Onde os dados moram**: no piloto, no navegador do Mac dela (IndexedDB). Baixar a cópia de segurança com frequência (Biblioteca › Ajustes). A migração para o Supabase depende da correção das tabelas clínicas abertas, do segundo fator de login e da decisão sobre a região do banco.
4. **Confirmações com a Géssica** (valores iniciais em `src/features/nutricao/dominio/config.ts`): sigla MGV ou NGV; "Es" = esvaziamento; 72 horas úteis = 3 dias úteis; calorias pelos fatores 4/4/9 ou pela tabela; como a lista de frutas e os legumes livres entram na conta; tabela de nutrientes no PDF ou só para ela.
5. **Publicar na Vercel** (se for o caso): `vercel.json` já libera o microfone para o próprio app e a conexão com a estação; incluir a URL de produção em `ORIGENS_PERMITIDAS` no `.env.local` da estação.

## Limites conhecidos do piloto

- A IA é conferida por assunto (o trecho citado existe e fala do tema), não pela exatidão do resumo: cada sugestão continua passando pelo aceitar/editar/recusar dela.
- Enquanto um trecho gravado não entrou na transcrição, o app pede para transcrever ou descartar antes de gravar outro. Com a estação desligada no meio da consulta, pausar e retomar a mesma gravação.
- O áudio de um checkpoint que nunca é finalizado não tem prazo para apagar; fica até ela descartar a gravação ou finalizar.
- Lista da biblioteca salva em outra aba substitui a edição não salva desta aba (nada é gravado por cima).
- Planos finalizados antes de 28/09/2026 no mesmo navegador (só dados fictícios) não têm a identificação congelada.

## Testes

`npx pnpm@10 test` roda tudo (módulo: `tests/nutricao-*.test.mjs` e `tests/estacao-*.test.mjs`).
