# Estado da arte em usabilidade, design de interface e front-end para sistemas internos de gestão — setembro de 2026

**Contexto do relatório.** Pesquisa feita em 14/09/2026 para um app interno de gestão de clínica (back-office financeiro, CRM de vendas, operação/recepção), React 18/19 + TypeScript + Vite + Tailwind + shadcn/ui + Supabase, PWA hospedado na Vercel, em português do Brasil, usado por pessoas não técnicas em desktop e celular. Foram feitas cerca de 60 buscas e lidas ~70 páginas primárias (blogs oficiais de React, WebKit, Chrome, Vercel, Supabase, shadcn, TanStack, W3C, NN/g etc.). Quando a informação vem de fonte secundária ou não pôde ser confirmada na fonte primária, isso está sinalizado no texto. Datas estão no formato dia/mês/ano; onde só se sabe o mês, aparece assim.

---

## Sumário executivo (o que importa para este app)

1. **A "fila do dia" virou o padrão de home em software operacional** — Linear (Triage/Inbox), Attio ("o que devo focar hoje?"), Superhuman (split inbox). O padrão é: uma lista única, ordenada, com 4–5 ações de teclado (aceitar/adiar/delegar/concluir) e contagem no ícone do app.
2. **⌘K universal é o segundo atalho mais valioso depois da fila** — e é, tecnicamente, o padrão ARIA *combobox*. Superhuman, Retool e Linear publicaram princípios claros (busca por subsequência, sinônimos, ranking por uso, filtro por contexto).
3. **IA na interface saiu da fase "chat"**: em 2026 o padrão é *UI generativa restrita a um catálogo* (Vercel json-render, jan/2026; AI SDK 7, 25/06/2026), *aprovação humana de ações* (tool approvals com assinatura) e *agentes de rotina* visíveis como itens na fila — não como chatbots.
4. **PWA no iOS melhorou de verdade**: desde o iOS 26 (15/09/2025) qualquer site pode ser adicionado como web app; push existe desde o 16.4; *Declarative Web Push* (18.4, 27/03/2025) permite notificação e badge sem service worker. Continua **sem** Background Sync, Share Target, File Handling e BarcodeDetector. Web apps instalados **não** sofrem a poda de 7 dias de armazenamento.
5. **IA no dispositivo, no navegador, ainda é só desktop Chrome** (Prompt API estável no Chrome 148, maio/2026, exige 22 GB livres e GPU > 4 GB). Para celular de recepcionista e vendedor, a IA continua no servidor (Edge Functions + modelo em nuvem).
6. **Stack**: React 19.3 (09/09/2026) estabilizou `<ViewTransition>`; Vite 8 (12/03/2026) trocou o bundler por Rolldown; Tailwind 4.3 (08/05/2026); **shadcn/ui tornou Base UI o padrão em julho/2026** (Radix continua suportado); TanStack Table v9 (04/08/2026) e Form v2 alpha (06/08/2026); Zod 4 estável; Biome 2.4 / Oxlint 1.80.
7. **Supabase em 2026**: passkeys em beta (28/05/2026), OAuth/OIDC customizado (07/05/2026), Deno 2.1 em todas as regiões, Cron + Queues + tarefas em segundo plano nas Edge Functions, broadcast a partir do banco, branching sem Git, **tabelas deixaram de ser expostas automaticamente na Data API (28/04/2026)** — item de segurança a checar.
8. **Vercel em 2026**: Ship 2026 (30/06) trouxe AI SDK 7, Workflow SDK durável, Queues, Sandbox, **Vercel Passport** (app interno atrás do IdP — útil para um sistema de clínica), Vercel Agent e Fluid compute.
9. **Acessibilidade virou lei de fato**: EN 301 549 V4.1.1 (02/09/2026) alinha a Europa à WCAG 2.2; WCAG 3.0 só ~2029; no Brasil a LBI + eMAG + **ABNT NBR 17225** são a referência. Para este app, os critérios que mais pesam são alvo mínimo 24×24 px, alternativa a arrastar, autenticação sem "teste cognitivo" e não pedir a mesma informação duas vezes.
10. **Estética**: tanto o Material 3 Expressive quanto o Liquid Glass ensinam por contraste — a Apple **reduziu a transparência no iOS 27 (WWDC 06/2026) e criou um controle deslizante** depois das críticas de legibilidade. Para um sistema financeiro, a direção é "luxo silencioso": neutros quentes, tipografia com números tabulares, translucidez mínima, movimento só quando informa.

---

## 1. Tendências de UX 2026 em software B2B/ops

### 1.1 "AI-native UI" e interfaces generativas

**Onde a indústria chegou.** Interface generativa (a IA gera componentes em tempo de execução, não só texto) deixou de ser demo. A Vercel abriu a tecnologia do v0 no AI SDK 3.0 e, em **janeiro de 2026**, lançou o **json-render** (Apache 2.0; 13 mil estrelas até 26/03/2026): o desenvolvedor descreve um *catálogo de componentes e ações permitidos* com esquemas Zod, e o modelo gera um JSON restrito a esse catálogo, que um `Renderer` mapeia para componentes reais. O ganho é segurança e consistência: o modelo nunca escreve React arbitrário. O **AI SDK 6** trouxe a abstração *Agent*, aprovação de execução de ferramentas, DevTools e MCP; o **AI SDK 7 (25/06/2026)** adicionou aprovações assinadas (HMAC), *WorkflowAgent* durável, `HarnessAgent` (mesma interface para Claude Code/Codex), sessões realtime de voz e telemetria por passo. A biblioteca **AI Elements** é um registry shadcn de componentes para apps "AI-native" (mensagens, raciocínio, chamadas de ferramenta).

**Protocolos.** O **AG-UI** padroniza eventos entre agente e front-end (streaming de tokens, estado compartilhado, UI generativa, interrupções human-in-the-loop) e já é suportado por LangGraph, CrewAI, Microsoft Agent Framework, Google ADK, AWS Strands, Pydantic AI e LlamaIndex (maio/2026). O **TanStack AI** entrou em RC em 21/08/2026 com 24 provedores, AG-UI e MCP. Do lado do navegador, o **WebMCP** (Chrome, early preview em 10/02/2026, destaque do I/O de 19/05/2026) permite que um site exponha "ferramentas" estruturadas — declarativas via formulários HTML ou imperativas via JS — para agentes que navegam por você.

**Padrões de "agentic UX" que se consolidaram** (síntese de Zylos, Mantlr, Fuselab, 2026): mostrar o que o agente está fazendo passo a passo; explicar por que escolheu uma ação; permitir cancelar/desfazer a qualquer momento; *delegação progressiva* (a autonomia cresce conforme o histórico de aprovações do usuário); onboarding que pergunta o objetivo e deixa o agente demonstrar valor. O Gartner projeta ~40% dos apps corporativos com agentes embutidos até o fim de 2026 (contra <5% em 2025). Produtos de referência: **Linear** lançou *Loops* (fluxos recorrentes de agente reagindo à atividade do workspace) e um Linear Agent que age como "colega de equipe"; **Attio** tem o "Ask Attio" ("Quais deals devo focar hoje?") que executa operações internas e devolve uma lista priorizada; **Retool Agents** insiste em "agentes para produção" com observação em tempo real passo a passo, evals e trilha de auditoria completa.

**Ferramentas de geração de UI.** **Google Stitch** (gratuito no Google Labs; 350 gerações padrão + 200 experimentais/mês; Gemini 3.0 Pro/Flash) ganhou em **19/03/2026** ("Stitch 2.0") um canvas infinito AI-native, geração de até 5 telas conectadas, protótipos interativos, entrada por voz, `DESIGN.md` para sistema de design e exporta HTML/CSS, Tailwind, Vue, Angular, Flutter, SwiftUI e Figma; fontes secundárias citam um novo pacote de atualizações no I/O 2026 (não confirmado em fonte primária). Limitações apontadas em review de 04/04/2026: pouca edição no canvas, foco só em UI, status experimental. **v0 / Lovable / Bolt**: v0 é só front-end no ecossistema Vercel; Lovable é o mais "full-stack" (Supabase, auth, Stripe por padrão; US$ 20 mi ARR em 2 meses); Bolt é flexível em frameworks, sem banco embutido. Para um time pequeno, o uso sensato em 2026 é *exploração de alternativas visuais* — nunca como fonte de código de produção sem revisão.

**O que isso muda para o app da clínica.** A regra de ouro que emerge: *fatos vêm do SQL, o modelo só escolhe componentes e frases*. Esse desenho casa exatamente com a preferência já registrada de "número derivado sempre com frase" e com o sistema 360 ser derivado/read-only em muitas telas.

### 1.2 Command palette / "⌘K" universal

O ⌘K está em Linear, Figma, Notion, Vercel, Raycast, Slack, GitHub. Tecnicamente é o **padrão ARIA combobox** (input que mantém foco + listbox, `aria-activedescendant` na linha ativa). Princípios da Superhuman ("How to build a remarkable command palette"): (1) mesma tecla abre e fecha, disponível em qualquer tela; (2) *tudo* que a UI faz existe como comando (inclusive o que é drag-and-drop); (3) busca tolerante — fuzzy/subsequência ("tgldk" acha "Toggle dark mode") + sinônimos e apelidos para reforçar o vocabulário do produto; (4) ranking com pontuação padrão, multiplicadores, relações "segue" (X sempre abaixo de Y) e histórico de uso; (5) ícones por comando, fonte mono para atalhos, lista parcialmente cortada para sugerir "há mais"; (6) filtro por contexto ("Enviar" só aparece ao redigir), preferindo *dar boost* a esconder. A Retool documentou o mesmo processo. Em 2026, o **Base UI** (agora padrão do shadcn) traz `Combobox` e `Autocomplete` prontos — algo que o Radix nunca teve —, o que reduz muito o custo de implementar.

### 1.3 Inbox unificado / "fila do dia" como padrão

O **Triage do Linear** é a referência mais bem documentada: "uma caixa de entrada especial para o time" onde itens esperam revisão; ações **Aceitar (1), Duplicar/Mesclar (2), Recusar (3), Adiar/Snooze (H)** e atribuir; navegação G→T; *responsabilidade de triagem* com rotação e integração a escalas; *Triage Rules* (automação condicional) e *Triage Intelligence* (LLM sugere propriedades e detecta duplicatas). O padrão Superhuman divide a inbox por tipo (split inbox) e o "Ask Attio" transforma a pergunta "o que fazer hoje" numa lista. O que esses três têm em comum: **um lugar só, ordenado, com ações de uma tecla, e "concluir" tira o item da frente**.

### 1.4 Calm technology e redução de alertas

Os 8 princípios de Amber Case (calmtech.com; o Calm Tech Institute existe desde maio/2024 como corpo de padrões): exigir atenção mínima, informar e criar calma, usar a periferia, comunicar sem "falar", falhar com graça, *suficiência mínima* ("a quantidade certa de tecnologia é o mínimo necessário") e respeitar normas sociais. No contexto corporativo, 76% dos trabalhadores de tecnologia relatam exaustão mental ligada a notificações e troca de contexto (Medium/Bootcamp, 2026). As práticas de 2026 para software de operação: notificações **contextuais e priorizadas**, aparecendo só quando há ação a tomar; agrupar em resumo (ex.: um push às 7h com "5 contas vencem hoje · 3 toques de cadência · 1 NF pendente") em vez de um por evento; badge no ícone como canal periférico; nada de vermelho para o que não é urgente.

### 1.5 Progressive disclosure

A regra do NN/g (Nielsen, 03/12/2006, ainda a referência): mostrar de início só as poucas opções mais importantes; oferecer o resto "sob demanda"; **duas camadas no máximo** — designs com três ou mais níveis falham por desorientação; a divisão precisa estar certa (frequente na frente, raro atrás) e a progressão precisa ser óbvia (botão/link com rótulo que diz o que vem). A variante *staged disclosure* (passo a passo) funciona quando os passos são independentes; vira problema quando são interdependentes. Em B2B 2026 isso aparece como "flow-first design": desenhar a jornada inteira antes de otimizar telas.

### 1.6 Tabelas densas com edição inline

Padrões consolidados (Pencil & Paper; SaaSUI; Setproduct 2026):
- Coluna identificadora primeiro; texto à esquerda, números à direita; colunas previsíveis (status, datas, ações) com largura fixa; colunas de texto flexíveis.
- **Três densidades** (condensada 40 px / regular 48 px / relaxada 56 px) com controle fora da tabela e preferência persistida.
- Cabeçalho fixo; **rodapé fixo com totais** e ações em lote quando há seleção; primeira coluna congelada na rolagem horizontal.
- Edição inline com cursor de texto ao passar o mouse, confirmação por Enter/check; para editar muitos campos de uma linha, converter para formulário vertical em drawer (UX Movement).
- Ações em lote: checkbox aparece no hover; menu (excluir, exportar, duplicar) só depois da seleção.
- Linha expansível para detalhe curto; painel lateral para detalhe longo; modal só quando perder o contexto é aceitável.
- Filtros/abas/paginação **na URL** (compartilhar e voltar funcionam).
Referências: Attio (registros com atributos, visões salvas, edição inline), Airtable (grade com tipos de campo ricos), Linear ("denso porém calmo", edição instantânea, quase sem mouse).

### 1.7 Micro-interações, optimistic UI, skeletons, estados vazios

As **Web Interface Guidelines da Vercel** são hoje o checklist mais concreto e usado (inclusive por agentes de código):
- Feedback em ≤100 ms; **optimistic UI** quando o sucesso é provável, com rollback ou *desfazer* em falha; ações destrutivas exigem confirmação ou desfazer com janela segura.
- Spinner/skeleton só depois de **150–300 ms**, visível por no mínimo **300–500 ms** (evita piscar); skeleton **espelha o layout final** para não haver salto.
- Alvo mínimo 24 px no desktop e **44 px no celular**; `<input>` ≥ 16 px no iOS para não dar zoom; `touch-action: manipulation`; todo gesto (arrastar, deslizar) tem alternativa por toque/teclado.
- Enter envia em campo único; Cmd/Ctrl+Enter em textarea; botão de enviar fica habilitado até o envio começar; permitir colar código OTP; placeholders com exemplo real.
- Todos os estados desenhados: vazio, esparso, denso, erro; "nenhuma tela é beco sem saída".
- Animação: variante `prefers-reduced-motion`; só `transform`/`opacity`; nunca `transition: all`; interrompível.
- **Números tabulares** (`font-variant-numeric: tabular-nums`) para comparar valores; aspas tipográficas; contraste APCA em vez de WCAG 2 para precisão perceptiva; `color-scheme: dark` no `<html>`; `<meta name="theme-color">`.
NN/g (skeletons, revisado 02/09/2026): < 1 s nada; 1–10 s skeleton ou spinner; > 10 s barra de progresso; skeleton para "tela inteira carregando", spinner para um módulo; nunca skeleton "só moldura" (cabeçalho/rodapé sem placeholders de conteúdo). Estados vazios são "oportunidade de design": explicar o que é, por que está vazio e a próxima ação (Toptal; Timothy Graf, 2026).

### 1.8 Dark mode

`light-dark()` está em **Baseline desde maio/2024** e exige `color-scheme: light dark` na raiz — elimina metade das media queries. Tailwind v4 usa **OKLCH** na paleta, o que dá escuros com croma consistente. ECharts 6 adapta o tema automaticamente ao esquema do sistema; shadcn/charts tematiza por variáveis CSS com par claro/escuro. Regra da Vercel: nunca confiar só em cor para status; aumentar contraste nos estados interativos.

### 1.9 Acessibilidade (WCAG 2.2, ARIA APG, Europa, Brasil)

- **WCAG 2.2** (05/10/2023) é a norma vigente. Nove critérios novos: *Foco não obscurecido* (AA), *Aparência do foco* (AAA), **Movimentos de arrastar** (AA: toda ação de arrastar precisa de alternativa por ponteiro simples), **Tamanho do alvo mínimo** (AA: 24×24 CSS px ou espaçamento equivalente), *Ajuda consistente* (A), **Entrada redundante** (A: não pedir a mesma informação duas vezes na sessão), **Autenticação acessível** (AA: sem "teste cognitivo" obrigatório — passkeys/biometria ajudam), e as versões AAA. O 4.1.1 Parsing foi removido.
- **WCAG 3.0**: ainda *Working Draft*; finalização estimada ~2029; 2.2 não será descontinuada (AbilityNet, fev/2026).
- **Europa**: EN 301 549 V4.1.1 publicada em **02/09/2026**, alinhada à WCAG 2.2; citação no Diário Oficial da UE esperada em nov/2026 para presunção de conformidade com o EAA (Centre for Accessibility Australia; Level Access).
- **Brasil**: LBI (Lei 13.146/2015) e Decreto 5.296/2004; eMAG para portais públicos; **ABNT NBR 17225** (conteúdo e aplicações web) e **NBR 17060** (mobile) citadas pelo gov.br como referência atual. Sites comerciais devem implementar práticas inclusivas; obrigatoriedade estrita recai sobre o setor público.
- **ARIA APG** continua a fonte dos padrões (combobox para ⌘K, grid para tabelas editáveis, dialog, listbox). Vercel recomenda HTML semântico antes de ARIA e `aria-label` em botões só de ícone.

### 1.10 Material 3 Expressive e Apple Liquid Glass — o que muda para web apps

**Material 3 Expressive** (Google, 2025; pesquisa de 3 anos, **46 estudos, 18 mil participantes**): componentes com "personalidade de movimento" (física de mola), 35+ formas geométricas, tipografia e cor mais ousadas, identidade gerida por tokens. Achados: elementos-chave localizados **até 4× mais rápido** em eye-tracking; preferência até 87% entre 18–24; idosos igualaram jovens na localização de controles. **Ressalva do próprio Google**: expressividade não substitui usabilidade — um redesenho de playlist que quebrou convenções falhou. Está chegando a Chrome, Gmail e Android; **para a web não há implementação oficial**: o pedido de suporte no `material-web` (issue #5888, 13/02/2026) está aberto e sem resposta, e a biblioteca está em modo de manutenção. Lição para o app: usar *forma e movimento como sinal* (um card que "assenta" ao confirmar) e *tokens* como fonte única — não copiar o visual.

**Liquid Glass** (WWDC 09/06/2025; iOS/macOS 26): translucidez que reflete e refrata o fundo. Críticas amplas: legibilidade (sol direto), distração, complexidade para times pequenos. **Na WWDC de junho/2026 a Apple reduziu a transparência padrão do iOS 27/macOS 27, mudou o efeito do vidro, os cantos das barras laterais, redesenhou ícones e criou um controle deslizante "mais claro ↔ mais tingido"**. Para web apps o efeito prático: (a) no Safari 26/27 a barra de abas translúcida flutua sobre o conteúdo — use `viewport-fit=cover`, `env(safe-area-inset-*)` e `theme-color`; (b) o Safari 26 trouxe `contrast-color()` (escolhe preto/branco automaticamente), `text-wrap: pretty`, anchor positioning e animações por rolagem — ferramentas nativas para fazer "vidro" com legibilidade; (c) a regra que a própria Apple aprendeu: translucidez só em cromo (barras, popovers), nunca sob texto financeiro.

---

## 2. Mobile e PWA em 2026

### 2.1 iOS/Safari 26 e 27: o que dá e o que não dá

| Capacidade | Status no iOS (set/2026) | Fonte |
|---|---|---|
| Instalar como web app | **Qualquer site**, sem manifest, com toggle "Abrir como Web App" (iOS 26, 15/09/2025) | WebKit 26.0 |
| Web Push | Desde iOS 16.4 (03/2023), só para app na tela inicial | MagicBell 20/03/2026 |
| Declarative Web Push | iOS 18.4 (27/03/2025): JSON com `title`, `body`, `navigate`, `app_badge`; **sem service worker**; mais econômico e privado | WebKit |
| Badging API | Sim (16.4+), requer permissão de notificação | MagicBell |
| Screen Wake Lock | Sim (18.4) | WebKit |
| Câmera/microfone, geolocalização, Web Share (enviar) | Sim | MagicBell |
| Armazenamento (IndexedDB, Cache) | Sim; **web app instalado é isento da poda de 7 dias** ("não faz parte do Safari, tem seu próprio contador") | WebKit 24/03/2020 |
| Background Sync / Periodic Sync / Background Fetch | **Não**, sem posição pública nem prazo | caniuse; MagicBell |
| Share Target, File Handling, File System Access (gravação) | **Não** | MagicBell |
| BarcodeDetector | **Não** ("Under Consideration" desde 2024) | caniuse; DEV |
| Web Bluetooth / NFC / USB | Não | MagicBell |
| WebGPU | **Sim** (Safari 26) | WebKit 26.0 |

**Safari 27** (beta 08/06/2026; lançamento com iOS 27 em setembro/2026): 58 recursos novos, 525 correções; *Grid Lanes* (masonry só com CSS), `<select>` customizável com `appearance: base-select` mantendo acessibilidade nativa, *scroll anchoring*, anchor positioning consciente de transformações, `:heading`, `stretch`, **Service Worker Static Routing** (regras para o navegador pular o SW em certas requisições), WebAssembly JSPI, Cookie Store `maxAge`, melhorias de WebRTC e `ImageCapture`. Nada novo em background, push ou hardware.

Segundo a The New Stack (2026, não confirmado na fonte), o Safari Technology Preview 247 trouxe um servidor MCP embutido com 16 ferramentas para agentes controlarem o navegador — sinal da direção "web agentic" também na Apple.

**Chrome/Android** continua bem à frente em capacidades (Background Sync, Share Target, BarcodeDetector, File Handling). Para uma equipe mista, a arquitetura tem de assumir o **mínimo comum do iOS**: fila local em IndexedDB com *replay na próxima abertura*, push declarativo para lembretes e badges, e Background Sync como *melhoria progressiva* no Android.

### 2.2 Offline-first e sync engines

O campo se dividiu em **replicadores de dados** (ElectricSQL, PowerSync) e **replicadores de comandos** (Replicache/Zero). Estado em set/2026:
- **PowerSync + Supabase**: única opção com *suporte offline de primeira classe* para Supabase; SQLite local no cliente (web, React Native, Flutter, Kotlin, Swift), fila de upload processada pelo cliente Supabase quando volta a rede; não invasivo (sem alterar schema); regras de sync por usuário. Parceiro oficial.
- **TanStack DB** (beta): coleções tipadas a partir de TanStack Query, REST ou motores de sync (Electric, PowerSync, RxDB); *live queries* com dataflow diferencial (filtrar, juntar, agrupar no cliente); **mutações otimistas** que se desfazem sozinhas em falha. É "o passo seguro de 2026" para quem já usa Query.
- **ElectricSQL**: **11/08/2026 anunciou que se juntou à Databricks** (com a Neon, para o Lakebase); Electric Cloud está sendo encerrado; o código continua aberto. Risco de plataforma.
- **Zero (Rocicorp)**: cache autoritativo do servidor com queries ZQL executadas primeiro no cliente; requer Postgres e o protocolo deles; Cloud Zero de US$ 30 a US$ 1.000+/mês.
- **Supabase** não tem offline nativo (discussão aberta desde 2020). Realtime mudou: broadcast a partir do banco (LW14, 04/2025), payload binário (11/06/2026) e schema `realtime` bloqueado para alterações (14/07/2026).
Recomendação de arquitetura: **offline cirúrgico** (estoque, comanda/comprovante, totem) e não o app inteiro; TanStack DB para otimismo e cache, PowerSync se precisar de horas offline de verdade.

### 2.3 Câmera: QR, código de barras, boleto e comprovante

- **BarcodeDetector**: no Chrome está ligado por padrão desde a **versão 134** e cobre ~94% das instalações (jun/2026); **Safari não tem**. Padrão: detectar a API e, no iOS, cair para um módulo WebAssembly (ZXing/zbar em WASM) — prática recomendada por Scanbot e pela comunidade.
- **Boleto**: o código de barras (44 dígitos, ITF) não é a linha digitável (47/48 dígitos); é preciso o algoritmo de conversão com dígitos verificadores (projetos abertos como *LeituraCodigoBarraBoleto* e *linhadigitavel* mostram o caminho; extensões e serviços comerciais existem). Câmera do celular via HTTPS + WASM funciona hoje; a partir da linha digitável extraem-se banco, valor e vencimento.
- **Comprovante PIX / NF / recibo**: OCR clássico (Tesseract.js) perde para **modelos multimodais com saída estruturada** (Zod 4 → JSON Schema): foto → Edge Function → campos (valor, data, pagador, chave) com *confiança* e destaque para o humano confirmar. No **Chrome desktop 148+** o Prompt API aceita imagem e áudio e devolve JSON, mas é só desktop; para celular, servidor.
- O Chrome anunciou no I/O 2026 "**entrada por voz em toda a web**" com transcrição e limpeza por Gemini em formulários — sinal de que ditado em campos vira commodity.

### 2.4 Voz no navegador

- **Web Speech API**: Safari tem `webkitSpeechRecognition` (processamento nos servidores da Apple). No **Chrome desktop** há reconhecimento **no dispositivo** com `processLocally = true`, `SpeechRecognition.available()`/`install()` para pacotes de idioma (com nível `dictation`) e **viés contextual por frases** (`phrases` com `boost` 0–10 — ideal para nomes próprios como "Bratan", produtos e médicos). Controlado por Permissions-Policy `on-device-speech-recognition`.
- **APIs de streaming** (2026): OpenAI Realtime GA em 28/08/2025 (gpt-realtime); recomendação atual da OpenAI é `gpt-4o-mini-transcribe`; Deepgram Flux Multilingual (11/05/2026); AssemblyAI Universal-3.5 Pro Realtime (menor WER no benchmark Pipecat); ElevenLabs Scribe v2 Realtime (~150 ms). **Gemini Live API** (preview, docs de set/2026): WebSocket, PCM 16 kHz entrada/24 kHz saída, *tokens efêmeros* para uso direto no cliente, 70 idiomas, barge-in. O **AI SDK 7** abstrai sessões realtime de voz entre provedores.
- Regra prática: Web Speech para ditado curto (observação de toque, comentário), streaming em nuvem para transcrição de ligações/atendimentos, sempre com transcrição visível e editável antes de salvar.

### 2.5 IA no dispositivo (WebGPU, WebNN, Chrome built-in AI, Apple)

- **WebGPU**: em todos os navegadores principais (Chrome, Edge, Firefox, Safari 26+); considerado Baseline em jan/2026 por levantamentos do setor. É o caminho para ML no navegador hoje via transformers.js/ONNX Runtime Web.
- **WebNN**: origin trial no Chrome 147–149; produção realista só em 2027.
- **Chrome built-in AI**: **Prompt API estável no Chrome 148** (I/O, 19/05/2026) com entrada multimodal e saída JSON; Summarizer/Translator/Language Detector; **Gemma 197M** como modelo "expert" leve para APIs específicas. Requisitos: Windows 10/11, macOS 13+, Linux ou ChromeOS; **22 GB livres, GPU > 4 GB VRAM ou 16 GB RAM/4 núcleos**; **sem Android/iOS**. Gemini Nano 4 chega a celulares flagship no fim de 2026 (via Android, não via Prompt API web ainda). **Firebase AI Logic** faz inferência híbrida (no dispositivo quando disponível, nuvem caso contrário) — com App Check obrigatório desde jul/2026.
- **Apple**: Apple Intelligence aparece em WKWebView (Writing Tools) e no Safari, mas **não há API web para o modelo on-device**. Na prática: para uma recepcionista no iPhone, "IA no dispositivo" no navegador não existe em 2026.

---

## 3. Stack de front-end 2026

### 3.1 React 19.x

- **19.2 (01/10/2025)**: `<Activity>` (esconder preservando estado), `useEffectEvent`, `cacheSignal`, Performance Tracks, pré-renderização parcial, revelação em lote de Suspense no servidor.
- **19.3 (09/09/2026)**: **`<ViewTransition>` estável** (entrada/saída/movimento/compartilhado, só em Transitions; integra Suspense e espera imagens/fontes), **Fragment refs** (eventos, foco, medições em grupo), `addTransitionType` (animação diferente para "próximo/anterior"), `browser()` do react-dom para pular SSR em componentes só de navegador, Trusted Types; correções de `useDeferredValue` e de ViewTransition no Safari móvel. **Não há React 20.**
- **React Compiler** estável (1.0) desde o fim de 2025 e integrado ao Next 16 e ao Vite via plugin; Turbopack já tem versão em Rust (Next 16.3).

### 3.2 Frameworks: Next.js 16 vs. React Router 7/8 vs. TanStack Start

- **Next.js 16** (21/10/2025): *Cache Components* (`"use cache"`, cache explícito e opt-in), Turbopack padrão, `proxy.ts` no lugar do middleware, React Compiler, `updateTag()/refresh()`. **16.2 (18/03/2026)**: dev 4× mais rápido, `create-next-app` "agent-ready", Agent DevTools experimental. **Adapter API estável (25/03/2026)** para deploy fora da Vercel. **16.3 (03/08/2026)**: *Instant Navigations* (stream/cache/block, prefetch parcial), 90% menos memória em dev, docs empacotadas em `AGENTS.md`, "first-party skills".
- **React Router**: v7 (Remix fundido, início de 2025) → middleware estável 17/09/2025 → **v8 (17/06/2026)**: middleware é padrão, `RouterContextProvider`, exige Node 22.22+, React 19.2.7+, Vite 7+ no framework mode. RSC no framework mode continua **unstable**. Remix 3 (RC em 31/08/2026) é outro projeto, sem React.
- **TanStack Start**: RC v1 em 22/09/2025 e **ainda rotulado RC em 14/09/2026**; roteamento tipado, server functions, middleware; deploy em Cloudflare, Vercel, Netlify, Render, Railway, Node; Vercel virou *Gold partner* em 08/09/2026; benchmark Platformatic mostrou ~25% mais throughput que RR7 e ~40% que Next.
- **Para este app**: um sistema interno autenticado não precisa de RSC nem de SEO. Manter **Vite SPA/PWA** é a escolha mais barata e coerente; se surgir necessidade de rotas com loaders/actions tipados ou SSR pontual, React Router 8 framework mode (mesmo Vite) é o caminho de menor atrito.

### 3.3 Vite 8 e Vite+

**Vite 8 (12/03/2026)**: Rolldown (Rust) substitui esbuild + Rollup como bundler único; builds 10–30× mais rápidos (casos de 46 s → 6 s) com compatibilidade de plugins. **Vite+** (VoidZero, beta, MIT): CLI `vp` que unifica Vite, Rolldown, Vitest, **Oxlint/Oxfmt**, tsdown e task runner de monorepo; `vp migrate` para projetos existentes.

### 3.4 Tailwind v4

CSS-first (`@theme` substitui o `tailwind.config.js`), motor Oxide + Lightning CSS (5× full build, 100× incremental), **OKLCH** na paleta. **4.3 (08/05/2026)**: utilitários de scrollbar, propriedades lógicas, `zoom`, `tab-size`, melhor `@variant`. Na prática, o `@theme` vira a **fonte de tokens** do app.

### 3.5 shadcn/ui em 2026 (linha do tempo do changelog oficial)

set/2025 registry index → out/2025 Registry Directory + novos componentes → dez/2025 `npx shadcn create` → jan/2026 docs Base UI, RTL → fev/2026 **blocks para Radix e Base UI** (login, sidebar, dashboard), pacote Radix unificado → mar/2026 **CLI v4**, variante *Luma* → abr/2026 `preset`/`apply`, variante *Sera* → mai/2026 `eject`, variante *Rhea*, validação de registry → jun/2026 **Chat Interface**, registries em repositórios GitHub → **jul/2026 Base UI vira padrão** (Base UI 1.6.0, 6 mi downloads/semana; projetos novos escolhiam Base UI 2:1; Radix "não está sendo descontinuado"; migração componente a componente por *skill* de agente, não por codemod), suporte a **React Aria**, `shadcn/typeset`, `@shadcn/helpers` para AI SDK → ago/2026 **Questionnaire** (fluxos de perguntas multi-etapa), *human-in-the-loop* nos helpers, registries privados → **set/2026 pacote `cn`**. **Charts** oficiais rodam em **Recharts v3** com `ChartContainer/Tooltip/Legend`, cores por variáveis CSS (claro/escuro) e `accessibilityLayer` (teclado + leitor de tela). Ecossistema: registry.directory, Supabase UI Library, **Tremor** (Recharts + Tailwind; anunciou que está se juntando à Vercel; Tremor Blocks apontado como gratuito em fontes de 2026).

### 3.6 Primitivos: Base UI, Radix, React Aria

**Base UI 1.0 (dez/2025)**: 35 componentes, engenharia full-time da MUI, ex-autores do Radix e Floating UI; traz **Combobox, Autocomplete, Number Field, Checkbox Group, Select com objetos**. **Radix**: adquirido pela WorkOS, velocidade menor em componentes complexos. **React Aria**: a escolha quando conformidade WCAG é contratual. Para um app financeiro, `NumberField` (moeda) e `Combobox` (paciente, fornecedor) justificam a migração progressiva.

### 3.7 Motion

Renomeado de Framer Motion para **Motion** (`motion/react`; 30 mi downloads/mês; Figma e Framer como clientes); motor híbrido usa Web Animations API e ScrollTimeline (120 fps) e cai para JS só em molas/gestos. Combinar com `<ViewTransition>` nativo (React 19.3) para navegação e com animações por rolagem do CSS (Safari 26+).

### 3.8 Dados, formulários, estado, validação

- **TanStack Query v5** (métodos antigos depreciados em favor de `queryClient.query/infiniteQuery`, removidos na v6). **Table v9 (04/08/2026)**: arquitetura tree-shakable, reatividade fina. **Form v2 alpha (06/08/2026)**: validadores flexíveis, schema-first, SSR mais simples. **DB** beta; **AI** RC (21/08/2026).
- **Zustand** ultrapassou o Redux (72,9 mi/mês; ~3 KB); **Jotai** estável em 9–10 mi/mês, melhor para reatividade fina (um projeto de formulários cortou 75% dos re-renders).
- **Zod 4** estável: parsing de strings 14,7× mais rápido, objetos 6,5×, 100× menos instanciações no `tsc`, core 57% menor, **zod/mini 1,88 KB**, `z.toJSONSchema()` (perfeito para saída estruturada de LLM), `.meta()`/registries, `z.prettifyError()`, `z.file()`; API de erros unificada (`error`).

### 3.9 Lint, testes, Storybook

- **Oxlint 1.80 + oxfmt** (ago/2026; 813 regras; 100k LOC em < 2 s; roda ao lado do ESLint) vs. **Biome 2.4** (lint + format num binário, regras type-aware). Regra: Oxlint para compatibilidade, Biome para simplificação, ESLint só para regras customizadas.
- **Vitest 4 (22/10/2025)**: Browser Mode estável, `toMatchScreenshot` (regressão visual), traces do Playwright, `expect.schemaMatching`. **Playwright 1.63** (mais recente): *test locks*, `locator.visible()`, aria/screen snapshots nos traces. **Storybook 10 (28/10/2025)**: ESM-only (29% mais leve), `sb.mock` com o time do Vitest, addon Vitest transforma cada story em teste real no navegador — 5–10× mais rápido que Playwright CT para componentes.

### 3.10 Supabase 2026

- **Realtime**: broadcast a partir do banco (LW14, abr/2025), payload binário (11/06/2026), schema bloqueado (14/07/2026).
- **Edge Functions**: **Deno 2.1 em todas as regiões** (fallback `forceDenoVersion=1`), deploy pelo dashboard, **persistent storage** (LW15, jul/2025), **tarefas em segundo plano**, **Cron** (UI sobre pg_cron/pg_net) e **Queues** — três caminhos de agendamento (pg_cron, Supabase Cron, HTTP externo).
- **Auth**: **passkeys beta (28/05/2026)** — WebAuthn, biometria/PIN/chave física, API pode mudar; WebAuthn também como fator MFA; **OAuth/OIDC customizado (07/05/2026)**; cotas de auth de terceiros ampliadas (03/03/2026).
- **Storage**: transformações de imagem (redimensionar, qualidade 20–100, WebP automático; cobrado por pacote de 1.000 imagens de origem); uploads 10× maiores; egress cacheado a US$ 0,03/GB (22/08/2026).
- **Plataforma**: Branching 2.0 (jul/2025) → **branching sem Git por padrão (mai/2026)**; **@supabase/server SDK (mai/2026)**; **Data API: tabelas não são mais expostas automaticamente (28/04/2026)** — verificar o que precisa de opt-in; **MCP server hospedado** `mcp.supabase.com` (10/10/2025) com modo *read-only*, escopo por projeto e grupos de recursos, suportando Claude Code, Cursor, VS Code etc. (risco principal: prompt injection — manter aprovação manual); **Supabase UI Library** (31/03/2025) com blocos shadcn de auth, dropzone, chat realtime e presença; ISO 27001.

### 3.11 Vercel 2026

**Ship 2026 (30/06/2026)**: **AI SDK 7**, **AI Gateway** (centenas de modelos, failover, *sem markup de token*, roda em Fluid compute), **Workflow SDK** (execução durável com retries e estado), **Queues**, **Sandbox** (microVMs), Chat SDK (Slack/Discord/GitHub), **Vercel Connect** (credenciais para agentes sem tokens longos), **eve** (framework de agentes open source), Dockerfile + container registry, **Vercel Services**, **Vercel Agent** (investiga anomalias e abre PRs), **Vercel Passport** (apps internos privados atrás do IdP), Security Dashboard. **Fluid compute** cobra CPU ativa e reaproveita instâncias; **observabilidade** nativa do Gateway (latência, tokens, custo por projeto). **json-render** (jan/2026) e **AI Elements** completam a camada de UI generativa.

---

## 4. Visualização de dados financeira e operacional

### 4.1 Princípios que se repetem nas melhores fontes de 2026

5–8 KPIs na tela principal ("quarenta métricas não é dashboard, é bagunça com fonte melhor"); a métrica mais decisiva ocupa o maior espaço; **enfatizar movimento e tempo, não saldos estáticos** (waterfall, linhas de tendência, rastreio de pagamentos); projeção **semana a semana** para ver pontos de aperto antes de virarem emergência; cortar o que ninguém agiu em 90 dias; layout em três faixas (KPIs → tendências → tabelas de diagnóstico); automatizar a atualização e a conciliação semanal. Regra própria já adotada e validada pela literatura: **nunca comparar mês parcial com mês fechado** — comparar com o mesmo dia do mês anterior ou com ritmo (run-rate).

### 4.2 "Quanto entrou / cabe gastar / sobra" e envelopes (Profit First)

O Profit First é "orçamento por envelopes para empresas": contas separadas, percentuais aplicados **à entrada** (o Relay, banco americano, automatiza transferências percentuais nos dias **10 e 25**, com template de 5 contas; a separação "cria escassez visível que muda o comportamento" — 22/05/2026). O *Profit First App* redesenhou em 2026 a tela de alocação e separou "Alocação" de "Planejamento". Padrões visuais que funcionam para gente não técnica:
- **Barra de alocação empilhada** (impostos · lucro · executor · operacional) por dia/mês, com a régua de metas como marcas.
- **Envelope = cartão com frase**, não gauge: "Entraram R$ X · contas pagas R$ Y → sobra R$ Z" (a preferência já registrada de "número com frase" é exatamente o que a literatura de dashboards narrativos recomenda).
- **Barra tipo bullet** (realizado vs. meta vs. faixa aceitável) em vez de velocímetros — mais precisa e ocupa menos espaço.
- **Waterfall (ponte)** para explicar diferenças entre conceitos — a "ponte dos 3 lucros" é literalmente um waterfall clicável.
- **Sparkline + delta** ao lado de cada KPI; **calendário/heatmap de vencimentos** para a fila de contas.

### 4.3 Fluxo de caixa projetado

Linha/área do saldo projetado com **faixa de incerteza**, marcadores de eventos fixos (folha, repasses, impostos), realce dos **pontos de aperto** (saldo abaixo do mínimo), alternância de cenários (antecipar recebíveis ou não). Waterfall semanal de entradas/saídas para explicar a curva.

### 4.4 Funil de vendas

Preferir **funil em barras** (largura proporcional por etapa) a funis "de cone"; mostrar **conversão entre etapas**, velocidade e envelhecimento dos deals; padronizar cores (verde saudável / amarelo em risco / vermelho parado) em todos os painéis; KPIs alinhados ao que o time é cobrado (no caso, SUPERMETA e cadências D1·D5·D7). Kanban por cadência já é o formato certo de "funil operacional"; o gráfico é a visão gerencial.

### 4.5 Ocupação de agenda

**Heatmap hora × dia** por sala/profissional com % de ocupação e linha de meta; tabela de horas vendidas vs. disponíveis; o mesmo componente serve para totem (presença) e para a reunião do dia 5.

### 4.6 Bibliotecas (estado em jun–set/2026)

| Biblioteca | Quando usar | Observações |
|---|---|---|
| **Recharts 3** (via shadcn/charts) | Padrão para dashboards React | SVG, `accessibilityLayer`, tema por CSS vars; pesa mais que Visx; cai com >10k pontos |
| **Visx** (Airbnb) | Visualizações sob medida, bundle mínimo | Primitivos D3, mais código |
| **Apache ECharts 6** | Grandes volumes, heatmap/matriz, gráficos financeiros | Novo tema padrão com tokens, dark automático, beeswarm/chord/matrix, séries customizadas publicáveis; pesado se importado sem cuidado; canvas (sem SSR) |
| **Observable Plot** | Exploração rápida com lógica D3 | Menos "React-native" |
| **Nivo** | Visual bonito rápido | Pode chegar a 500 KB; atrito com React 19 |
| **ApexCharts** | Heatmap, treemap, candlestick interativos | Client-only |
| **Tremor** | Blocos de dashboard prontos no estilo shadcn | Recharts + Tailwind + Radix; juntando-se à Vercel |
| **shadcn charts** | Área/barra/linha/pizza/radar copy-paste | Cobre a maioria dos casos de SaaS |

Ordem de tamanho (LogRocket, 01/06/2026): visx → react-chartjs-2 → Victory → MUI X → Nivo → Recharts → ApexCharts → ECharts → Ant Design Charts.

### 4.7 "Narrative dashboards" com texto gerado por IA

Em 2026 todos os grandes BIs geram narrativa (Power BI Copilot, Looker + Gemini, Databricks AI/BI, Domo, Narrative BI, ThoughtSpot); relatos de redução de "time-to-insight" de até 70%. O padrão que evita alucinação é **número → frase → por quê → o que fazer**, com fatos vindos de SQL e o modelo restrito a redigir e escolher componentes (json-render/AI Elements); saída estruturada validada por Zod; citar a fonte de cada número (card "Fonte/período" já existe no Inteligência 360). Nunca deixar o modelo calcular.

### 4.8 Impressão e PDF de relatórios

- **CSS de impressão**: `@page` com **caixas de margem** (16 posições) para cabeçalho/rodapé e `counter(page)`/`pages` — suportado no **Chrome 131 (30/10/2024)**; controlar quebras com `break-inside: avoid`; o navegador ainda imprime seu próprio cabeçalho a menos que o usuário desative.
- **Servidor**: Chromium headless (Puppeteer) para fidelidade com SVG e texto selecionável; alternativas sem navegador (Forme); **react-pdf** reescreveu a paginação e ganhou `widows/orphans`.
- Recomendação: um só conjunto de componentes com folha de impressão para o "modo apresentação"; PDF no servidor (Edge Function chamando um serviço de Chromium ou react-pdf) para a contabilidade.

---

## 5. Design systems e identidade para saúde premium

### 5.1 Referências e o que elas fazem

- **Tendência "medical luxury" (2026)**: tons terrosos e neutros quentes (verdes apagados, off-white) substituindo o azul clínico; tipografia "convidativa, não clínica"; muito espaço em branco, texto curto orientado a benefício; **fotos reais convertem 3–5× mais que banco de imagens**; mobile-first e pintura < 2 s (Marceline, Zakcodex, Magier).
- **Function Health**: resultados agrupados por sistema (Hormônios & Tireoide, Coração & Metabolismo), promessa de **explicação em linguagem simples para cada resultado**, preço enquadrado como "US$ 1/dia", tabela comparativa vs. check-up tradicional, depoimentos reais.
- **Superpower**: neutros de alto contraste com **acento laranja**, categorias com contagem de biomarcadores, **resultados como números de impacto** ("85% dos membros descobrem risco precoce"), "US$ 10.000 agora é US$ 349".
- **Parsley Health**: tom empático ("um médico que pergunta *por quê*"), **equipe de cuidado de 5 pessoas** visualizada, tabelas comparativas, entrada gradual (revisão de exames → cuidado completo).
- **Tia**: sans bold com **itálico de ênfase** em uma palavra, ícones simples que "desmistificam", níveis de assinatura, CTA persistente de agendamento, transparência da equipe.
- **Oura**: storytelling antes de dados; scores em anéis (no app); categorias de saúde como cards.
- **Alice (Brasil)**: "Saúde como deve ser"; **bege, branco e cinzas suaves**; fotos de pessoas reais em vez de estoque médico; *metric callouts* grandes ("100.000 membros", "CSAT 4,8/5"); linguagem "sem burocracia, sem demora"; navegação por público (membros/empresas/médicos). É a melhor referência de tom em português.
- Ressalva crítica (Metropolis): a "designificação" da saúde — chatice flat e cartunesca de e-commerce transposta para clínicas — cansou; premium em 2026 é sóbrio.

### 5.2 Recepção, totem e tablet

Kiosk.com, Aila, Quantem, DoctorConnect (2026): alvos grandes e bem espaçados (usuário apressado e distraído erra em botão pequeno), **uma pergunta por tela**, próximo passo sempre indicado, multilíngue, check-in em **< 3 minutos** (uma redução de 2,5 min por paciente reduziu 26% da espera para triagem — NIH/PMC 2024), opções de acessibilidade visíveis, tablets comerciais de 11" ou mais com altura ajustável. Padrões de software: modo quiosque com **reset por inatividade**, tela de atração, sem teclado físico, tipografia ≥ 20 px, contraste alto, anonimato claro (o NPS do totem já é anônimo), fila local para funcionar sem rede.

### 5.3 Gamificação leve para vendas (sem infantilizar)

Achados (SPOTIO, Visdum, Hoopla, Leaderboarded, 2026): a armadilha clássica é **iluminar quem já ganha e desmoralizar o meio (60% do time decide o resultado)**; a pergunta certa é se o quadro premia comportamento que fecha receita e se os números competidos são os mesmos pelos quais as pessoas são pagas; **8 em 10 quadros ativos são uma lista ranqueada simples, sem badges, streaks ou multiplicadores**, e ~3/4 são "sempre ligados" com dados do CRM em tempo real. Tradução em design: **meta do time como barra de ritmo** ("no ritmo"/"atrás" em relação à SUPERMETA e aos dias úteis restantes), progresso pessoal privado, reconhecimento de *disciplina de cadência* (toques D1·D5·D7 feitos no prazo) e não só de fechamento, sem confete e sem troféus; "modo apresentação" para a reunião.

---

## 6. Métodos: descoberta, teste e Figma → código

### 6.1 Descoberta e teste de usabilidade com IA em times pequenos

- **Maze**: *AI Moderator* conduz entrevistas, análise automática, relatórios com clipes, testes em protótipo Figma, painel de 6 mi participantes, **MCP server** para levar achados a outras ferramentas; plano gratuito.
- **Dovetail**: *AI Projects* transformam chamadas/documentos em relatórios com trechos; *Channels 2.0* classifica feedback em oportunidades; *AI Chat* com **respostas citando a fonte**; redação automática de PII; MCP/CLI; SOC2/ISO/HIPAA.
- **PostHog**: replay + analytics + flags + surveys, open source, tier gratuito, instalação por `npx @posthog/wizard`; **resumos de sessão por IA via MCP** direto no Cursor/VS Code/Claude Code. **Hotjar** (agora Contentsquare) segue o mais acessível; **Microsoft Clarity** é gratuito e ilimitado.
- **Stack típico de 2026**: uma ferramenta de comportamento (replay/heatmap) + uma de teste por tarefa. **Cuidado com "usuários sintéticos"**: NN/g (21/06/2024) mostrou sicofantia e superestimativa (ex.: previram conclusão de curso acima do real), listas genéricas sem prioridade e ausência de dados comportamentais; servem só para gerar hipóteses, nunca para substituir pesquisa. **Plano mínimo para este app**: 3–5 sessões presenciais por trimestre com recepção/vendas/financeiro em tarefas críticas ("lançar conta pelo boleto", "fechar comanda", "fazer o toque"), medindo tempo e erros; replay com máscara de dados sensíveis; síntese de feedback do WhatsApp em canais estilo Dovetail.

### 6.2 Design tokens e Figma → código

- **DTCG 2025.10** (28/10/2025): primeira especificação estável, 40+ organizações (Adobe, Figma, Google, Microsoft, Shopify); `$value`/`$type`, aliases por caminho, multiarquivo, temas, cores avançadas; **Style Dictionary v4** e Terrazzo leem nativamente; Figma, Penpot, Sketch e Tokens Studio exportam o mesmo formato.
- **Figma MCP server**: 14 ferramentas (fev/2026); **Code Connect** mapeia componente Figma → componente real e caminho de import; **Code Connect UI** conecta ao GitHub com um clique; integração **bidirecional com Claude Code (fev/2026)** e geração de camadas de design a partir do VS Code (06/03/2026). **Config 2026 (24/06/2026)**: Figma Motion (timeline), **code layers** (código executável como camada; early access jul/2026), agente de design com skills e conectores MCP; **Figma Make** para todos os assentos Full.
- **Google Stitch** aceita `DESIGN.md` e importação de tokens; útil para explorar 5 telas de um fluxo rapidamente dentro das regras do sistema.
- Para um time pequeno com shadcn: o **`@theme` do Tailwind v4 é a fonte de tokens**, exportável em DTCG; um **registry shadcn privado** (GitHub, ago/2026) guarda os blocos do produto; um `DESIGN.md`/`AGENTS.md` no repositório orienta qualquer agente (Claude Code, Stitch, v0) a gerar dentro do sistema — o mesmo mecanismo que Next.js 16.3 e shadcn adotaram para si.

---

## 20 ideias concretas de UX/redesenho para um app de gestão de clínica

Selo: **Pronto** (tecnologia madura e suportada no iOS/Android hoje) · **Beta** (funciona, mas com API em beta ou cobertura parcial) · **Especulativo** (direção certa, ainda sem suporte amplo).

1. **Fila do dia como home, com Triage** — **Pronto.** Uma lista única (contas a vencer, toques de cadência, NFs a emitir, mínimos de estoque, NPS a responder) ordenada por urgência, com ações de uma tecla no desktop (1 concluir · 2 adiar · 3 delegar · H silenciar até) e deslizar-com-alternativa no celular. Contagem no ícone via Badging API e **Declarative Web Push às 7h** ("5 contas · 3 toques · 1 NF") — sem service worker no iOS 18.4+.
2. **⌘K universal em português** — **Pronto.** Base UI Combobox; busca por subsequência; sinônimos ("boleto/conta/pagar", "paciente/contato"); três modos: *Ir para*, *Fazer* (lançar conta, novo toque, abrir comanda) e *Perguntar*; ranking por uso e contexto; recentes; atalhos visíveis para ensinar.
3. **"Lançar rápido" pela câmera: boleto, NF, PIX** — **Pronto.** BarcodeDetector no Android/Chrome e ZXing-WASM no iOS; código de 44 dígitos → linha digitável, banco, valor e vencimento preenchidos; comprovante/NF por foto → Edge Function com modelo multimodal e saída Zod/JSON Schema → campos com **indicador de confiança** e destaque do que o humano deve confirmar.
4. **Números com frase e narrativa grounded** — **Pronto.** Todo KPI derivado nasce com sua frase-modelo ("Entraram R$ X · contas pagas R$ Y → sobra R$ Z"); "por quê" em uma segunda camada (nunca uma terceira); no Painel do Mês, um parágrafo gerado por IA **só a partir de fatos SQL**, com cada número linkado à sua fonte.
5. **Envelopes do Lucro Inteligente como potes visuais + ponte dos 3 lucros** — **Pronto.** Barra empilhada diária/mensal (impostos · lucro · executor · operacional) com a régua como marcas; cada envelope em cartão bullet (realizado vs. cota); calendário de transferências (padrão Relay 10/25); a ponte operacional → contábil → caixa como **waterfall clicável** que abre os lançamentos de cada degrau.
6. **Fluxo de caixa projetado com pontos de aperto** — **Pronto.** Área do saldo projetado por semana com faixa de incerteza, marcadores de folha/repasses/impostos, realce onde cai abaixo do mínimo, alternância "com/sem antecipação" e o custo da antecipação (TAD) escrito na tela.
7. **Kanban por cadência com otimismo e desfazer** — **Pronto.** "Fiz o toque" move o cartão instantaneamente, toast com *Desfazer* 5 s, rollback em falha; contagem regressiva para o próximo passo no cartão; arrastar com alternativa por menu (WCAG 2.5.7); estado persistido na URL.
8. **Ritmo da equipe (gamificação leve)** — **Pronto.** Barra de ritmo do time vs. SUPERMETA ajustada aos dias úteis restantes ("no ritmo"/"R$ X atrás"), progresso individual privado, reconhecimento de disciplina de cadência (toques no prazo), lista ranqueada simples sem badges; "modo apresentação" para a reunião.
9. **Painel em modo apresentação + PDF do dia 5** — **Pronto.** Mesmos componentes com folha de impressão: `@page` com cabeçalho corrido ("Instituto Bratan · Setembro/2026") e numeração; PDF fiel gerado no servidor (Chromium ou react-pdf) para contabilidade e CSVs anexos.
10. **Totem e tablet com padrões de quiosque** — **Pronto.** Uma pergunta por tela, alvos ≥ 72 px, reset por inatividade, tela de atração com a identidade da clínica (neutros quentes, foto real), anonimato explícito, fila local em IndexedDB com replay na próxima abertura (não há Background Sync no iPad) e indicador discreto de "pendente de envio".
11. **Tabelas densas com edição inline e totais fixos** — **Pronto.** TanStack Table v9 + Base UI NumberField para moeda; três densidades; cabeçalho fixo e **rodapé com totais/seleção**; ações em lote após seleção; colunas visíveis persistidas por pessoa; filtros na URL; edição de linha inteira em drawer vertical.
12. **Navegação "app-like" com View Transitions e Activity** — **Pronto.** `<ViewTransition>` (React 19.3) na passagem lista → detalhe (paciente, comanda), `<Activity>` para preservar filtros e rolagem das abas do CRM ao alternar, skeletons com atraso de 150–300 ms espelhando o layout, variante sem movimento.
13. **Dark mode e legibilidade "luxo silencioso"** — **Pronto.** Tokens com `light-dark()` e OKLCH; `theme-color` alinhado ao fundo; `contrast-color()` em chips de status; translucidez só no cromo (lição do iOS 27); números tabulares em toda tela financeira; serifa discreta para telas voltadas ao paciente (totem), sans para operação.
14. **Design system como código + DESIGN.md** — **Pronto.** Registry shadcn privado com os blocos do produto (KPI com frase, envelope, item da fila, cartão de cadência); tokens exportados em DTCG a partir do `@theme`; migração progressiva Radix → Base UI pela skill oficial; Storybook 10 + Vitest 4 (`toMatchScreenshot`) para regressão visual; `DESIGN.md/AGENTS.md` para qualquer geração assistida por IA.
15. **Offline cirúrgico para estoque e comanda** — **Beta.** TanStack DB (beta) com coleções do Query, live queries e mutações otimistas persistidas; se a enfermagem precisar de horas sem rede, PowerSync (SQLite local + fila de upload) só nessas tabelas; o resto do app permanece online.
16. **Passkeys e "senha do gestor" com WebAuthn** — **Beta.** Login por Face ID/Touch ID via Supabase passkeys (beta 28/05/2026); a trava da mesa compartilhada vira **step-up WebAuthn** (o gestor aprova com a própria biometria no celular) em vez de senha digitada na recepção — atende WCAG 3.3.8 e reduz risco de senha vazada.
17. **Voz para registrar toques e observações** — **Beta.** Ditado com Web Speech (no Chrome desktop, on-device com viés de frases para nomes de médicos e produtos; no iPhone, o reconhecimento da Apple); fallback para STT em streaming via Edge Function; o texto vira nota estruturada (resultado do toque, próximo passo) para confirmar antes de salvar.
18. **"Perguntar ao 360" com UI generativa restrita** — **Beta.** AI SDK 7 + catálogo json-render (cartão KPI, tabela, gráfico, botão de ação); a resposta a "quanto falta para a meta?" vem como componentes, não como prosa; ações que movimentam dinheiro passam por **aprovação humana assinada**; sem cálculos no modelo.
19. **Agentes de rotina com aprovação** — **Beta.** Supabase Cron + Queues + tarefas em segundo plano nas Edge Functions produzem *propostas* (conciliação diária, NF pendente, cobrança D+1, régua de resgate) que entram na fila como itens "revisar" com log passo a passo estilo Retool/Linear Loops; nada é gravado sem clique humano.
20. **Ferramentas para agentes do navegador e IA on-device** — **Especulativo.** Expor via **WebMCP** ações seguras ("consultar saldo do envelope", "abrir comanda") para agentes como o Gemini no Chrome; usar o **Prompt API** (Chrome 148, só desktop com hardware forte) para triagem local de mensagens do WhatsApp na máquina do gestor; ambos ainda sem cobertura em iPhone/Android e sem posição do WebKit.

---

## 10 referências visuais e o que copiar de cada uma

1. **Linear** (linear.app) — copiar o **Triage** como home operacional (aceitar/adiar/mesclar com uma tecla, responsabilidade rotativa), a densidade "calma" das listas, o tema escuro sóbrio e o ⌘K onipresente. Não copiar a estética de produto dev para telas de paciente.
2. **Attio** (attio.com) — copiar a **tabela de registros com visões salvas e edição inline**, os atributos derivados (score de ICP → "linkagem") e o "**Ask Attio**" que devolve *lista priorizada* em vez de texto; o construtor de workflows visual para as réguas.
3. **Superhuman** (superhuman.com; blog "How to build a remarkable command palette") — copiar a **filosofia do palette** (sinônimos, ranking, contexto), o "split inbox" por tipo de item e a obsessão por resposta < 100 ms.
4. **Raycast** (raycast.com) — copiar apelidos e *fallbacks* no palette (digitou um valor em reais → oferece "lançar conta", "calcular repasse"), ações rápidas em cada resultado e atalhos aprendíveis.
5. **Retool Agents** (retool.com/agents) — copiar o **log de execução passo a passo**, custo/tempo visíveis, aprovações e trilha de auditoria para os agentes de rotina.
6. **Function Health / Superpower** (functionhealth.com; superpower.com) — copiar a **explicação em linguagem simples ao lado de cada resultado**, categorias com contagem, barras de faixa "dentro/fora" para KPIs (ocupação, margem, cadência) e o enquadramento de valores ("R$ X por dia útil").
7. **Alice** (alice.com.br) — copiar o **tom de voz em português** ("sem burocracia, sem demora"), a paleta bege/branco/cinza quente e fotos de pessoas reais para totem, recepção e materiais do paciente.
8. **Oura** (ouraring.com) — copiar a ideia de um **"score do dia" da clínica** (caixa, ocupação, cadência) em anel, sempre com a frase que explica o número e o que mudou desde ontem; storytelling antes de gráfico.
9. **Relay / Profit First App** (relayfi.com; App Store) — copiar a **tela de regras de alocação em percentuais**, o calendário de transferências automáticas e a separação visual dos envelopes como "contas" com escassez visível.
10. **Vercel Dashboard + Web Interface Guidelines / shadcn dashboard blocks** (vercel.com/design/guidelines; ui.shadcn.com) — copiar a monocromia disciplinada, skeletons estáveis, números tabulares, estados vazios com próximo passo e usar as guidelines como **checklist de revisão** (inclusive para agentes de código); os blocks como base dos painéis.

---

## Fontes (URL e data)

**Tendências de UX / IA na interface**
- Vercel, json-render / Generative UI — https://thenewstack.io/vercels-json-render-a-step-toward-generative-ui/ e https://www.infoq.com/news/2026/03/vercel-json-render (26/03/2026; lançamento jan/2026)
- AI SDK 6 — https://vercel.com/blog/ai-sdk-6 (2025/2026); AI SDK 7 — https://vercel.com/blog/ai-sdk-7 (25/06/2026)
- AI SDK UI: Generative User Interfaces — https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces (acesso 14/09/2026)
- AG-UI — https://docs.ag-ui.com/introduction (acesso 14/09/2026); Zylos Research, "Agentic UX" — https://zylos.ai/research/2026-05-28-agentic-ux-frontend-design-patterns-ai-agents/ (28/05/2026); Mantlr — https://mantlr.com/blog/designing-for-ai-agents-ux-patterns-2026 (2026); Fuselab — https://fuselabcreative.com/ui-design-for-ai-agents/ (2026)
- WebMCP — https://developer.chrome.com/blog/webmcp-epp (10/02/2026); Chrome no I/O 2026 — https://developer.chrome.com/blog/chrome-at-io26 (19/05/2026)
- Google Stitch — https://moda.app/blog/google-stitch-review (04/04/2026); https://www.uxpin.com/studio/blog/google-stitch-ai-design-tool-updates-ui-ux/ (2026); https://www.thesys.dev/blogs/google-stitch (01/04/2026); https://tech-insider.org/google-stitch-ai-design-tool-march-2026-update/ (03/2026, não acessível na verificação)
- v0 vs Lovable vs Bolt — https://blog.tooljet.com/lovable-vs-bolt-vs-v0/ ; https://superframeworks.com/compare/lovable-vs-bolt-vs-v0 ; https://weavai.app/blog/en/2026/05/12/2026-ai-app-builder-guide-v0-vs-bolt-new-vs-lovable/ (12/05/2026)
- Tendências B2B — https://procreator.design/blog/b2b-saas-design-trends-and-examples/ ; https://www.onething.design/post/b2b-saas-ux-design ; https://dfeelings.com/en/blog/enterprise-ux-the-top-b2b-experience-design-trends-of-2026 ; https://fuselabcreative.com/enterprise-ux-design-guide-2026-best-practices/ (2026)
- Command palette — Superhuman https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/ ; Retool https://retool.com/blog/designing-the-command-palette ; https://www.techinterview.org/post/3233475212/build-command-palette-cmd-k/ ; https://dev.to/dev48v/i-rebuilt-the-cmd-k-command-palette-in-60-lines-of-javascript-3a1l (06/2026)
- Linear Triage — https://linear.app/docs/triage ; Linear (Loops, Agent) — https://linear.app/ (acesso 14/09/2026)
- Attio — https://attio.com/ (acesso 14/09/2026); Retool Agents — https://retool.com/agents (acesso 14/09/2026)
- Calm Technology — https://calmtech.com/ ; Fuzzy Math — https://fuzzymath.com/blog/calm-technology-enterprise-web-application-ui-design/ ; Medium/Bootcamp — https://medium.com/design-bootcamp/the-rise-of-calm-technology-reducing-digital-stress-in-the-workplace-f0d7c6a27e8f
- Progressive disclosure — NN/g https://www.nngroup.com/articles/progressive-disclosure/ (03/12/2006)
- Tabelas — Pencil & Paper https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables ; SaaSUI https://www.saasui.design/blog/saas-data-table-ui-patterns ; Setproduct https://www.setproduct.com/blog/data-table-ui-design (2026); UX Movement https://uxmovement.substack.com/p/the-easiest-way-to-bulk-edit-data ; UX Lift https://www.uxlift.org/articles/best-practices-for-inline-editing-in-tables/
- Vercel Web Interface Guidelines — https://vercel.com/design/guidelines (acesso 14/09/2026)
- Skeletons — NN/g https://www.nngroup.com/articles/skeleton-screens/ (04/06/2023, revisto 02/09/2026); Estados vazios — Toptal https://www.toptal.com/designers/ux/empty-state-ux-design ; https://timgraf.com/ux-design/empty-states-are-design-opportunities-a-practical-framework-for-designing-zero-data-moments-error-states-and-feedback-interfaces-users-actually-appreciate/ (2026)
- light-dark() — MDN https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark (Baseline 05/2024)
- WCAG 2.2 — https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ (05/10/2023); WCAG 3.0 — AbilityNet https://abilitynet.org.uk/resources/digital-accessibility/what-expect-wcag-30-web-content-accessibility-guidelines (02/2026); EN 301 549 V4.1.1 — https://www.accessibility.org.au/european-accessibility-standard-updated-to-include-wcag-2-2 (09/2026); EAA — https://www.levelaccess.com/compliance-overview/european-accessibility-act-eaa/ ; Brasil — https://www.gov.br/governodigital/pt-br/acessibilidade-e-usuario/acessibilidade-digital (acesso 14/09/2026)
- Material 3 Expressive — pesquisa Google Design https://design.google/library/expressive-material-design-google-research (2025); Supercharge https://supercharge.design/blog/material-3-expressive ; Chrome M3E https://www.androidauthority.com/chrome-stable-material-3-expressive-redesign-3593166/ (2026); issue material-web #5888 https://github.com/material-components/material-web/issues/5888 (13/02/2026)
- Liquid Glass — Wikipedia https://en.wikipedia.org/wiki/Liquid_Glass (WWDC 09/06/2025; revisão WWDC 06/2026)

**Mobile e PWA**
- WebKit, Safari 26.0 — https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ (15/09/2025); WWDC25 — https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/
- WebKit, Safari 27 beta — https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-safari-27-beta/ (08/06/2026); sessão WWDC26 https://developer.apple.com/videos/play/wwdc2026/204/
- Declarative Web Push — https://webkit.org/blog/16535/meet-declarative-web-push/ (27/03/2025); Safari 18.4 — https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
- Poda de 7 dias e isenção de web apps — https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ (24/03/2020)
- Limitações PWA iOS — MagicBell https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide (20/03/2026); MobiLoud https://www.mobiloud.com/blog/progressive-web-apps-ios/ (2026)
- Background Sync — caniuse https://caniuse.com/background-sync ; https://www.testmuai.com/web-technologies/background-sync-safari/
- BarcodeDetector — MDN https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector ; caniuse https://caniuse.com/mdn-api_barcodedetector ; https://dev.to/ilhannegis/barcode-scanning-on-ios-the-missing-web-api-and-a-webassembly-solution-2in2 ; Scanbot https://scanbot.io/techblog/barcode-detection-api-tutorial/
- Boleto — https://github.com/saraiva1989/LeituraCodigoBarraBoleto ; https://github.com/Ewersonfc/linhadigitavel ; https://github.com/stutzsolucoes/boleto-ocr-service
- Sync engines — PowerSync+Supabase https://docs.powersync.com/integrations/supabase/guide e https://powersync.com/blog/offline-first-apps-with-tanstack-db-and-powersync ; TanStack DB https://tanstack.com/db/latest (beta); Electric https://electric.ax/blog (11/08/2026, "joining Databricks"); Zero https://zero.rocicorp.dev/ ; comparativos https://johnny.sh/blog/choosing-a-sync-engine-in-2026/ e https://kanopylabs.com/blog/tanstack-db-vs-electricsql-vs-zero-sync ; Supabase offline https://github.com/orgs/supabase/discussions/357
- Web Speech on-device — MDN https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API e https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally
- STT em streaming — Deepgram https://deepgram.com/learn/best-speech-to-text-apis-2026 ; AssemblyAI https://www.assemblyai.com/blog/best-api-models-for-real-time-speech-recognition-and-transcription ; Gemini Live API https://ai.google.dev/gemini-api/docs/live (docs 09/2026)
- Chrome built-in AI — Prompt API https://developer.chrome.com/docs/ai/prompt-api ; https://developer.chrome.com/docs/ai/built-in ; Firebase AI Logic híbrido https://developer.chrome.com/docs/ai/firebase-ai-logic e https://firebase.google.com/docs/ai-logic/hybrid/web/get-started ; Chrome 148 https://pasqualepillitteri.it/en/news/3145/gemini-nano-chrome-built-in-ai-client-side-en
- WebGPU/WebNN — https://www.utsubo.com/blog/frontier-web-apis-2026-production-ready ; https://web.dev/blog/webgpu-supported-major-browsers ; https://www.ddevtools.com/updates/2026-01-webgpu-webnn-browser-ai (01/2026)
- Safari e agentes (MCP) — The New Stack https://thenewstack.io/safari-mcp-platform-infrastructure/ (2026; conteúdo não verificado)

**Stack front-end**
- React 19.3 — https://react.dev/blog/2026/09/09/react-19-3 (09/09/2026); React 19.2 — https://react.dev/blog/2025/10/01/react-19-2 (01/10/2025); https://react.dev/versions
- Next.js — https://nextjs.org/blog/next-16 (21/10/2025); https://nextjs.org/blog (16.2 em 18/03/2026; adapters 25/03/2026; 16.3 em 03/08/2026)
- React Router — https://remix.run/blog (v8 17/06/2026; middleware 17/09/2025; RSC preview 18/09/2025); https://reactrouter.com/changelog
- TanStack — https://tanstack.com/blog (Table v9 04/08/2026; Form v2 alpha 06/08/2026; AI RC 21/08/2026; Vercel Gold 08/09/2026); Start RC https://tanstack.com/blog/announcing-tanstack-start-v1 (22/09/2025) e https://tanstack.com/start/latest ; comparação https://tanstack.com/start/latest/docs/framework/react/comparison ; benchmark https://blog.platformatic.dev/react-ssr-framework-benchmark-tanstack-start-react-router-nextjs
- Vite 8 — https://vite.dev/blog/announcing-vite8 (12/03/2026); https://www.infoq.com/news/2026/05/vite-v8-rust/ ; Vite+ https://viteplus.dev/ (beta)
- Tailwind — https://tailwindcss.com/blog ; https://releases.sh/tailwind-css (4.3 em 08/05/2026); https://blog.logrocket.com/tailwind-css-guide/
- shadcn/ui — changelog https://ui.shadcn.com/docs/changelog ; Base UI padrão https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default (07/2026); blocks https://ui.shadcn.com/docs/changelog/2026-02-blocks (02/2026); cn https://ui.shadcn.com/docs/changelog/2026-09-cn (09/2026); charts https://ui.shadcn.com/docs/components/chart ; registry.directory https://registry.directory/
- Base UI / Radix / React Aria — https://blog.logrocket.com/headless-ui-alternatives/ ; https://www.greatfrontend.com/blog/top-headless-ui-libraries-for-react-in-2026 ; https://www.pkgpulse.com/guides/shadcn-ui-vs-base-ui-vs-radix-components-2026 ; https://www.shadcndeck.com/blog/radix-vs-base-ui
- Motion — https://motion.dev/ ; https://motion.dev/docs/react
- Zod 4 — https://zod.dev/v4 ; Estado — https://saschb2b.com/blog/react-state-management-2026 ; https://dev.to/jsgurujobs/state-management-in-2026-zustand-vs-jotai-vs-redux-toolkit-vs-signals-2gge
- Lint — https://jsmanifest.com/biome-oxlint-comparison-2026 ; https://www.pkgpulse.com/guides/biome-vs-eslint-vs-oxlint-2026 ; https://tech-insider.org/eslint-vs-biome-vs-oxlint-2026/
- Testes — Vitest 4 https://vitest.dev/blog/vitest-4 (22/10/2025); Playwright https://playwright.dev/docs/release-notes (1.63); Storybook 10 https://storybook.js.org/blog/storybook-10/ (28/10/2025); https://getautonoma.com/blog/storybook-vs-playwright-component-testing (2026)
- Supabase — changelog https://supabase.com/changelog ; passkeys https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta (28/05/2026) e https://supabase.com/docs/guides/auth/passkeys ; Launch Weeks https://supabase.com/blog/categories/launch-week ; Edge Functions Deno 2.1 https://supabase.com/blog/supabase-edge-functions-deploy-dashboard-deno-2-1 e https://github.com/orgs/supabase/discussions/37941 ; jobs grandes https://supabase.com/blog/processing-large-jobs-with-edge-functions ; cron https://crontap.com/guides/supabase-cron-jobs ; Realtime https://supabase.com/docs/guides/realtime ; imagens https://supabase.com/docs/guides/storage/serving/image-transformations ; MCP https://supabase.com/docs/guides/getting-started/mcp ; UI Library https://supabase.com/blog/supabase-ui-library (31/03/2025) e https://supabase.com/ui/docs/getting-started/introduction ; notícias jun/2026 https://blog.mean.ceo/supabase-news-june-2026/
- Vercel — Ship 2026 https://vercel.com/blog/vercel-ship-2026-recap (30/06/2026); AI Gateway em Fluid https://vercel.com/blog/how-ai-gateway-runs-on-fluid-compute ; https://vercel.com/i/vercel-ai-gateway-vs-openrouter ; https://vercel.com/ai-sdk

**Visualização de dados**
- LogRocket, bibliotecas React 2026 — https://blog.logrocket.com/best-react-chart-libraries-2026/ (01/06/2026); PkgPulse https://www.pkgpulse.com/guides/recharts-v3-vs-tremor-vs-nivo-react-charting-2026 ; ECharts 6 https://echarts.apache.org/handbook/en/basics/release-note/v6-feature/ ; Tremor https://tremor.so/ ; https://adminlte.io/blog/tremor-dashboard-templates/ (2026)
- Dashboards financeiros — https://www.f9finance.com/dashboard-design-best-practices/ ; https://www.fanruan.com/en/blog/best-cash-flow-dashboard-examples-templates (2026); https://www.eleken.co/blog-posts/financial-dashboard-examples ; https://optimaoffice.com/financial-reporting-dashboards/ (2026)
- Profit First — Relay https://relayfi.com/blog/profit-first-vs-envelope-budgeting/ (22/05/2026); Profit First App https://apps.apple.com/us/app/profit-first-app/id6742326463 ; UX de finanças https://www.appthetics.com/blog/budgeting-apps-ux-patterns
- Funil — https://www.teamgate.com/blog/best-practices-visualizing-sales-pipeline-trends/ ; https://www.domo.com/learn/charts/funnel-charts ; https://5of10.com/articles/sales-kpi-visualization-examples/
- Narrativa com IA — https://www.holistics.io/bi-tools/ai-analytics/ ; https://www.narrative.bi/ai/ ; https://www.deepdatainsight.com/data-visualization/intelligent-data-visualization-how-ai-is-transforming-business-dashboards-in-2026/ ; https://www.databricks.com/blog/whats-new-aibi-february-2026-roundup (02/2026)
- Impressão/PDF — Chrome @page margin boxes https://developer.chrome.com/blog/print-margins (30/10/2024); https://oribi.io/tech-blog/creating-pdf-from-a-react-component ; https://www.formepdf.com/blog/introducing-forme ; https://blog.risingstack.com/pdf-from-html-node-js-puppeteer/

**Saúde premium, totem, gamificação**
- https://marcelinestudios.com/blog/medical-spa-website-design-tips ; https://zakcodex.com/blogs/healthcare-website-design-guide ; https://www.magier.com/blog/best-medical-website-designs (2026); Metropolis https://metropolismag.com/interiors/healthcare-interiors/the-problem-with-the-designification-of-health-care
- Sites (acesso 14/09/2026): https://www.functionhealth.com/ ; https://superpower.com/ ; https://www.parsleyhealth.com/ ; https://asktia.com/ ; https://ouraring.com/ ; https://alice.com.br/ (Neko Health https://www.nekohealth.com/ não pôde ser acessado)
- Totem — https://kiosk.com/kiosk-ui/ ; https://www.ailatech.com/blog/best-practices-for-implementing-check-in-kiosks-in-hospitals-and-clinics/ ; https://quantem.io/feeds/blog/hospital-kiosk-software (2026); https://doctorconnect.net/best-patient-check-in-kiosks-and-apps-2026
- Gamificação — SPOTIO https://spotio.com/blog/sales-leaderboards/ (2026); Visdum https://www.visdum.com/blog/keep-your-sales-team-motivated-with-a-leaderboard ; Hoopla https://hoopla.net/sales-gamification-how-leading-companies-turn-sales-performance-into-a-daily-game/ ; Leaderboarded https://leaderboarded.com/blog/posts/sales-gamification/

**Métodos**
- Maze https://maze.co/ ; Dovetail https://dovetail.com/ ; PostHog https://posthog.com/session-replay ; Quantum Metric (replay 2026) https://www.quantummetric.com/blog/best-session-replay-tools-in-2026 ; CleverX (Maze vs Hotjar) https://cleverx.com/blog/maze-vs-hotjar-in-2026-which-tool-fits-your-research-workflow/ ; Swarm https://www.useswarm.co/blog/best-ai-usability-testing-tools ; GrainQL (Hotjar/Contentsquare) https://www.grainql.com/blog/best-hotjar-alternatives-2026
- NN/g, usuários sintéticos — https://www.nngroup.com/articles/synthetic-users/ (21/06/2024)
- DTCG — https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/ (28/10/2025); Style Dictionary https://styledictionary.com/info/dtcg/ ; https://blog.codercops.com/blog/design-tokens-2026-w3c-format-guide
- Figma — MCP https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server ; Code Connect https://developers.figma.com/docs/code-connect ; GitHub changelog https://github.blog/changelog/2026-03-06-figma-mcp-server-can-now-generate-design-layers-from-vs-code/ (06/03/2026); Config 2026 https://webdeveloper.com/news/figma-config-2026-motion-design-agent/ (24/06/2026); CTO guide https://alexbobes.com/tech/figma-mcp-the-cto-guide-to-design-to-code-in-2026/

**Itens não confirmados em fonte primária** (tratar com cautela): detalhes da atualização do Stitch no I/O 2026; servidor MCP do Safari Technology Preview 247; data exata da entrada da Tremor na Vercel; versão exata do Chrome que ligou o reconhecimento de fala on-device.