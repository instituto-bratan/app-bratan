# Módulo Nutrição — desenho do piloto v0.1

Data: 28/09/2026 · Branch: `feat/nutricao` · Proposta de produto: https://claude.ai/artifact/XeUrAx2YurbahsETa8fMRU
Requisitos originais: áudios da Dra. Géssica (transcrição em `PROGRAMA GESSICA/docs/referencias/audios-gessica-2026-09-28.md`).

## Contexto novo (Lucas, 28/09)

- Hoje a Géssica não grava a consulta, não usa IA e escreve o prontuário do iClinic à mão.
- Gasta cerca de 1 hora por consulta e mais 1 hora para montar o plano; acumula atraso quando as consultas se encostam.
- Confere as prescrições do Dr. Daniel num grupo de prescrições.
- Só ela usa. Usa Mac. Identidade visual do documento: Instituto Bratan.
- Decisão: construir dentro do APP BRATAN.

## O que o piloto entrega

1. **Hoje**: atendimentos, planos a entregar com o prazo de 72 horas úteis, rascunhos e entregas.
2. **Consulta**: gravação (ou arquivo de áudio), transcrição local, organização por IA nas 15 linhas do prontuário e no bloco de suplementos, revisão campo a campo com a fala de origem, texto pronto para colar no iClinic, finalização e retificação.
3. **Plano alimentar**: duplicar o anterior ou começar do zero, refeições, alimentos com medida caseira e gramas, alternativas fora do cálculo, refeição opcional dentro, blocos de frutas e legumes, acordos da consulta propostos pela IA, cálculo com a TACO e as regras dela, prévia paginada idêntica ao PDF.
4. **Biblioteca**: listas dela, alimentos da TACO com fonte, medidas caseiras validadas por ela, identificação profissional.

Fora do piloto: Supabase (os dados clínicos ficam no navegador dela até a decisão sobre RLS, MFA e região), equivalentes automáticos, ajuste automático às metas, portal, WhatsApp, iClinic direto.

## Arquitetura

```
Navegador (APP BRATAN, rota /nutricao)          Estação local (Mac da Géssica, 127.0.0.1:8787)
 ├─ domínio puro (testado): campos, resumo,      ├─ POST /transcricoes → ffmpeg + whisper.cpp (large-v3-turbo)
 │  prazos, plano, cálculo, paginação, extração  ├─ POST /organizar   → Claude (SDK oficial, saída estruturada)
 ├─ IndexedDB: pessoas, atendimentos, planos,    ├─ POST /pdf         → Chrome headless (mesmo HTML da prévia)
 │  biblioteca, gravações em pedaços             └─ GET  /saude       → o que está pronto
 └─ UI (React + Tailwind do app)
```

- **Por que uma estação local**: o áudio nunca sai do Mac; a chave da IA fica fora do navegador; o PDF sai do mesmo motor da prévia. As Edge Functions do Supabase não rodam whisper.cpp nem Chrome.
- **Segurança da estação**: escuta só em 127.0.0.1; aceita só as origens do app; responde ao preflight de rede privada do Chrome.
- **IA**: `claude-opus-5`, raciocínio adaptativo, `fallbacks: "default"`, saída em JSON Schema fechado. Todo valor precisa de trecho de origem; o navegador confere o trecho contra a transcrição e descarta o que não bate. Nada entra no registro sem aceite. Prescrição nunca vem da IA: vem da lista registrada por ela.
- **Dados**: IndexedDB com número de versão por registro (conflito entre abas avisado, nunca sobrescrito em silêncio) e aviso entre abas por BroadcastChannel. Exportação de cópia de segurança em arquivo.
- **Gravação**: MediaRecorder em pedaços de 5 s gravados no IndexedDB durante a consulta (uma queda não perde a gravação); pausa; medidor de nível; tela acordada; consentimento obrigatório antes de gravar.
- **PDF**: paginação própria. O componente mede cada bloco (refeição, lista, identificação) e distribui em páginas A4 sem partir bloco. A mesma marcação vai para a estação, que imprime com o Chrome. Sem estação, abre a impressão do navegador com a mesma página.
- **Cálculo**: TACO 4ª ed. (NEPA/Unicamp, 2011), 597 itens, por 100 g. Gramas do item × composição. Só a opção principal entra; refeição opcional entra; 5 g de azeite (TACO "Azeite, de oliva, extra virgem") no almoço e no jantar com legumes e verduras, sem aparecer no documento. g/kg com 1 casa, gramas inteiras, % inteiro fechando 100.

## Decisões de interface

- **Tom**: ferramenta calma e rápida, no visual do app (fonte do sistema, tokens Musgo, Oliva, Dourado, Creme). O papel fala outra língua: o plano usa Fraunces e Manrope; a folha do prontuário usa fonte monoespaçada, porque é texto para colar.
- **Assinatura visual — a bolinha verde**: é o marcador que ela pediu ao lado de cada alimento, e vira o sistema de estado do módulo. Campo confirmado = bolinha cheia (Oliva). Vazio = anel fino. Valor do atendimento anterior aguardando confirmação = anel Dourado. Sugestão da IA pendente = anel tracejado azul-tinta. O medidor de voz da gravação é uma fileira de bolinhas.
- **Consulta**: duas colunas. À esquerda, o roteiro com as 15 linhas (o anterior aparece em cinza sob cada linha); à direita, a folha do prontuário se escrevendo, fixa na tela. Barra de gravação no topo.
- **Plano**: três colunas. Estrutura (refeições e blocos), edição, folha A4 com abas Prévia e Cálculo.
- **Estados sempre visíveis**: salvamento ("Salvando…", "Salvo às 09:41", "Não salvou: …"), estação local (conectada ou como ligar), gravação.
- **Palavras**: botões dizem o que acontece ("Copiar para o iClinic", "Finalizar checkpoint", "Gerar PDF"). "Não informado" nunca vira "não". Nenhum "&" em texto gerado.

## Testes

Lógica pura com teste antes do código (`tests/nutricao-*.test.mjs`, carregador `tests/helpers/load-ts.mjs`): campos e resumo, suplementos, prazos, texto, plano e versões, cálculo, paginação, validação da extração, conversão da TACO. Estação com testes de parse e de origem. Telas conferidas rodando `pnpm dev:demo` no navegador.

## Antes de pacientes reais

Consentimento de gravação; conta da Anthropic separada com retenção zero; RIPD; decidir onde os dados clínicos passam a morar (Supabase com RLS e MFA) e migrar do IndexedDB.
