Tenho o material completo. Aqui está o inventário.

---

# INVENTÁRIO TÉCNICO — APP BRATAN

**Raiz do projeto (`$APP` daqui em diante):**
`/Users/lucasribeiro-financeiro/Documents/Codex/2026-06-24/files-mentioned-by-the-user-eu/work/app-bratan`

> Todos os caminhos abaixo são absolutos, na forma `$APP/...`. Repositório git local em `main`, sincronizado com `origin/main`. Último commit: `edcb2d2` — "Taxa de cartão da precificação: 3,84% → 2,39%, o parcelado do acordo Rede Q-7621480".

---

## 1. STACK E INFRA

### 1.1 `package.json` (`$APP/package.json`)

Nome `app-bratan`, `private: true`, `version 0.1.0`, `type: module`.

**Dependências de produção (16):**

| Pacote | Versão | Papel |
|---|---|---|
| `react` / `react-dom` | `^18.3.1` | base (não é React 19) |
| `react-router-dom` | `^6.28.0` | roteamento SPA |
| `@supabase/supabase-js` | `^2.46.1` | banco, auth, storage, realtime |
| `@tanstack/react-query` | `^5.59.20` | cache/fetch de dados |
| `framer-motion` | `^12.41.0` | animações (transição de rota, kanban, launcher) |
| `lucide-react` | `^0.468.0` | ícones |
| `react-hook-form` | `^7.53.2` + `@hookform/resolvers` `^3.9.1` | formulários |
| `zod` | `^3.23.8` | validação |
| `@radix-ui/react-slot` `^1.1.1`, `@radix-ui/react-tooltip` `^1.2.10` | primitivos shadcn (só 2!) |
| `class-variance-authority` `^0.7.1`, `clsx` `^2.1.1`, `tailwind-merge` `^2.5.4` | utilitários de classe |

**Dev (10):** `vite ^5.4.11`, `@vitejs/plugin-react ^4.3.3`, `typescript ^5.6.3`, `tailwindcss ^3.4.15`, `postcss ^8.4.49`, `autoprefixer ^10.4.20`, `@types/node ^22.10.1`, `@types/react ^18.3.12`, `@types/react-dom ^18.3.1`.

**O que NÃO existe (e é decisão explícita, documentada em comentário):**
- **Sem biblioteca de gráficos** → SVG puro em `$APP/src/components/charts/BratanCharts.tsx` (381 linhas).
- **Sem biblioteca de xlsx** → gerador próprio de `.xlsx` (ZIP + XML, método "stored") em `$APP/src/lib/xlsxWriter.ts` (373 linhas). Justificativa no cabeçalho: bibliotecas custam 500KB–1MB e as versões gratuitas não formatam.
- **Sem biblioteca de PDF** → `$APP/src/lib/brandedPdf.ts` e `$APP/src/lib/planilhaImpressao.ts` abrem janela de impressão HTML e usam "Salvar como PDF" do navegador.
- **Leitura de PDF**: `pdf.js 4.10.38` carregado **sob demanda da CDN cdnjs** em `$APP/src/features/financeiro/pdfTexto.ts` (não está no bundle nem no `package.json`).
- Sem ESLint, Prettier, Biome, Husky. Sem Vitest/Jest (usa `node:test`). Sem i18n. Sem biblioteca de toast.

### 1.2 Scripts

```
dev       vite --host 127.0.0.1
build     tsc -b && vite build && node scripts/gen-version.mjs
preview   vite preview --host 127.0.0.1
test      node --test tests/*.test.mjs
dev:demo  VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= vite --host 127.0.0.1 --port 5174   (modo prévia sem banco)
```

Não há script `lint` nem `typecheck` isolado — o `tsc -b` só roda dentro do `build`.

### 1.3 Build / Vite

`$APP/vite.config.ts`: `base: "/"`, alias `@ → ./src`, `manualChunks` em 3 grupos (`react`, `motion`, `supabase`).
Existe também `$APP/vite.single.config.ts` → build single-file em `dist-single/` (`assetsInlineLimit: 100MB`, `inlineDynamicImports`) — artefato de uma necessidade antiga de rodar o app via `file://` (o `main.tsx` ainda troca `BrowserRouter` por `HashRouter` quando `protocol === "file:"`).

`$APP/tsconfig.json`: `strict: true`, `noEmit`, `moduleResolution: Node`, path `@/*`.

### 1.4 PWA

- `$APP/index.html`: `theme-color #4A5D3A`, `manifest.webmanifest`, `apple-touch-icon`, `apple-mobile-web-app-capable`, `viewport-fit=cover`, `lang="pt-BR"`.
- `$APP/public/manifest.webmanifest`: `display: standalone` + `display_override`, 3 ícones (192, 512, maskable-512), categorias `business/medical/productivity`.
- `$APP/public/sw.js`: **service worker escrito à mão, sem Workbox**. Cache `bratan-shell-v1`. Estratégia: navegação = network-first com fallback ao `index.html`; assets same-origin = stale-while-revalidate; **cross-origin (Supabase/wss) nunca interceptado**; `/version.json` nunca cacheado.
- Registro do SW: `$APP/src/main.tsx` (só em `import.meta.env.PROD` e fora de `file://`).
- Aviso de nova versão: `$APP/src/components/UpdatePrompt.tsx` — faz polling de `/version.json` a cada 60s + em `focus`/`visibilitychange`; ao detectar mudança, mostra faixa "Atualizar", manda `SKIP_WAITING` e recarrega.
- `$APP/scripts/gen-version.mjs`: grava `dist/version.json` com `VERCEL_GIT_COMMIT_SHA` ou `local-<timestamp>`.

### 1.5 Vercel

`$APP/vercel.json`:
- **CSP**: `default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- Cache-control específico para `/sw.js`, `/manifest.webmanifest` e `/version.json` (`no-store`).
- Rewrite SPA `/(.*) → /index.html`.

`$APP/.vercel/project.json`: projeto `app-bratan`.
`$APP/netlify.toml` ainda existe (config morta — o deploy é Vercel).

### 1.6 Variáveis de ambiente esperadas (somente nomes)

**Front (Vite, `$APP/.env.example`):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Edge Functions (Supabase secrets):**
- `ANTHROPIC_API_KEY` — `marketing-briefing-parse`
- `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `SHAREPOINT_DRIVE_ID`, `SHAREPOINT_ROOT_FOLDER` (opcional) — `sharepoint-dispatch`
- `APP_ALLOWED_ORIGINS` — `create-colaborador-access`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` / `SERVICE_ROLE_KEY`

**Build:** `VERCEL_GIT_COMMIT_SHA`.

> Existe `$APP/.env.local` e um resíduo `$APP/.env.local.swp` (swap do vim) no disco. Ambos estão no `.gitignore` e **não foram lidos**.

### 1.7 Edge Functions (`$APP/supabase/functions`) — 3

| Função | O que faz |
|---|---|
| `sharepoint-dispatch/index.ts` | Consome `sharepoint_dispatch_queue`, pega o arquivo do Storage e sobe para o SharePoint via Microsoft Graph (token client_credentials em `login.microsoftonline.com`, upload simples até 4MB e chunked de 5MB acima disso, cria hierarquia de pastas ano/mês, 5 tentativas, lotes de 10). Sem segredos, responde `configured:false` e não mexe na fila. |
| `marketing-briefing-parse/index.ts` | Baixa a foto/PDF do bucket `marketing-briefings` e chama a API da Anthropic (`https://api.anthropic.com/v1/messages`, `anthropic-version: 2023-06-01`, modelo **`claude-opus-4-8`**) com um JSON Schema de plano de conteúdo; grava o plano em `marketing_briefings`. |
| `create-colaborador-access/index.ts` | Cria o usuário de auth do colaborador com a service-role key, validando cargo contra lista fechada e origem contra `APP_ALLOWED_ORIGINS` (default inclui `https://app-bratan.vercel.app` e localhost:5173). |

Scripts auxiliares: `$APP/scripts/marketing-ia-setup.mjs` (valida a chave Anthropic com `claude-haiku-4-5` e roda `supabase secrets set`) e `$APP/scripts/sharepoint-setup.mjs`.

### 1.8 Migrations (`$APP/supabase/migrations`) — 69 arquivos

**80 tabelas criadas · 37 funções SQL · 177 policies RLS · 6 buckets de Storage.**

Domínios (do mais antigo ao mais novo):

| Domínio | Migrations | Tabelas principais |
|---|---|---|
| Fundação / pessoas / acesso / auditoria | `...240001`, `...240003`, `...240004`, `...240007`, `...030004`, `...060005`, `...270001`, `...100001` | `colaborador`, `colaborador_cargo`, `colaborador_acesso`, `audit_event`, `app_senha_gestor` |
| Operação do dia (fase 1) | `...240002`, `...240006` | `aviso`, `almoco_slot`, `checklist_template/_item_template/_run/_item_run/_task`, `pop_documento` |
| Comprovantes | `...240003`, `...240015`, `...090002`, `...040001` | `comprovante` |
| Pagamentos / crediário | `...240005`, `...090001`, `...280001`, `...280002` | `pagamento_lembrete`, `pagamento_recebimento` |
| Estalecas / gamificação | `...240008` a `...240011`, `...060002`, `...060003` | `estaleca_config/_transactions/_claims`, `checkins`, `checkin_event_codes`, `gamification_profile`, `rewards`, `reward_campaigns` |
| Inteligência 360 | `...240012`, `...240013`, `...240014` | `dashboard_360_snapshots`, `weekly_average_ticket`, `pricing_table`, `prescriptions_sales`, `patient_journey`, `relationship_touchpoints`, `retention_cohorts`, `rescue_workflows`, `churn_investigations`, `patient_experience`, `receivables`, `action_items`, `objection_playbook`, `inteligencia_360_settings` |
| CRM | `...240016`, `...160001/2/3`, `...170001/2`, `...200001`, `...240001(jul)`, `...270002`, `...030001(ago)`, `...120001`, `...080003` | `crm_contacts`, `crm_deals`, `crm_tasks`, `crm_cadences/_steps/_enrollments`, `crm_timeline_events`, `crm_touchpoints`, `crm_message_templates`, `crm_coordenador_mes` |
| Financeiro | `...030001/2/3`, `...080001/2/3`, `...130001`, `...150001`, `...310001`, `...030002(ago)`, `...120002`, `...140001`, `...200001(ago)`, `...250001`, `...010001(set)`, `...020001`, `...080001/2`, `...100002` | `fin_categories`, `fin_sales/_sale_items/_sale_payments`, `fin_expenses`, `fin_expense_nota`, `fin_invoices`, `fin_purchases`, `fin_savings_moves`, `fin_provision_rules`, `fin_reconciliations`, `fin_cash_entries`, `fin_crediario_profit`, `fin_partner_entries`, `fin_pdca_status`, `fin_metas_config`, `fin_gestao_mensal`, `fin_bank_entry`, `fin_inbox_item`, `fin_lucro_config/_dia/_publico`, `fin_entrada_unica` |
| Estoque | `...190001`, `...190002` | `estoque_item`, `estoque_movimento` |
| NPS / Concierge / totem | `...040002`, `...210001` | `nps_resposta` (totem, anônimo), `concierge_nps_contato`, `concierge_nps_mes` |
| SharePoint | `...010001` | `sharepoint_dispatch_queue` (+ job `pg_cron` `sharepoint-dispatch-15min`) |
| Marketing | `...130002` | `marketing_briefings` |
| Obsidian (**criado e removido**) | `...240017` cria, `...060001` remove | `obsidian_vault_settings`, `obsidian_export_queue`, `obsidian_sync_logs` |

**Buckets de Storage:** `comprovantes`, `notas-fiscais-despesa`, `estalecas-provas`, `avatars`, `marketing-briefings`, `fin-caixa-entrada`.

Bootstrap manual em `$APP/supabase/bootstrap/` (2 SQLs para promover a conta do Lucas a coordenação).

---

## 2. MAPA DE ROTAS E TELAS

Roteador em `$APP/src/App.tsx` (152 linhas). Lazy-loading centralizado em `$APP/src/lib/routePreload.ts` (mapa `routeLoaders` + `prefetchRoute` disparado em `pointerenter`/`focus`/`touchstart` na navegação).

**52 entradas de rota: 44 telas reais + 7 redirects + 1 catch-all.**

**Guarda em duas camadas:** `ProtectedRoute` (sessão) → `AppLayout` → `AccessGate` (dentro de quase toda página). O `moduleKey` faz duas coisas: esconde o item no menu (`$APP/src/layouts/AppLayout.tsx:225`) e bloqueia a tela (`$APP/src/components/access/AccessGate.tsx:22`). Exceções gravadas por pessoa (`colaborador_acesso`) vencem o padrão do cargo.

### Rotas públicas / shell

| Caminho | Componente | Área | O que faz | moduleKey |
|---|---|---|---|---|
| `/login` | `$APP/src/routes/LoginPage.tsx` | Auth | "Acesso da equipe": e-mail + senha autorizados pela coordenação; em modo prévia (sem Supabase) permite entrar como um cargo. | — |
| `*` | `Navigate → /` | — | Catch-all. | — |

### Hoje / base (todo cargo)

| Caminho | Componente | Área | O que faz | moduleKey |
|---|---|---|---|---|
| `/` e `/inicio` | `$APP/src/features/home/HomePage.tsx` (802 l.) | Home | Porta de entrada: cartões de atalho filtrados pelo cargo, resumo do Lucro Inteligente público, contagem de comprovantes pendentes no SharePoint, fila do dia. | **sem AccessGate** |
| `/meu-perfil` | `$APP/src/features/perfil/MeuPerfilPage.tsx` | Perfil | Dados da pessoa, lista de módulos liberados e troca de avatar (upload p/ bucket `avatars`). | **sem AccessGate** |
| `/tarefas` | `$APP/src/features/checklist/ChecklistPage.tsx` | Hoje | Checklist do dia por cargo, reinicia diariamente; marca item feito (`checklist_item_run`). | `hoje` (só no menu) |
| `/almoco` | `$APP/src/features/almoco/AlmocoPage.tsx` | Hoje | Quadro de horários de almoço e cobertura, com relógio ao vivo (refresh 30s). | `hoje` (só no menu) |
| `/mural` | `$APP/src/features/mural/MuralPage.tsx` | Hoje | Mural de avisos oficiais; coordenação publica e arquiva. | `hoje` (só no menu) |
| `/pops-fluxos` | `$APP/src/features/pops/PopsFluxosPage.tsx` | Documentos | Biblioteca de **32 POPs/fluxogramas** (PNG/PDF em `$APP/public/fluxogramas`) filtrada por 7 áreas: Recepção/Comercial, Médico/Profissional, Gestão, Enfermagem, Higienização, Copa/Nutrição, Financeiro/Administrativo. | `pops` (só no menu) |
| `/comprovantes` | `$APP/src/features/comprovantes/ComprovantesPage.tsx` (811 l.) | Documentos | Anexa comprovante (foto/PDF) → bucket `comprovantes` + fila SharePoint; vincula à pendência; estorno; exclusão definitiva com aviso sobre a cópia já enviada. | `comprovantes` ✓ |
| `/estalecas` | `$APP/src/features/estalecas/EstalecasPage.tsx` (783 l.) | Carteira | Saldo de Estalecas, check-in de academia/igreja por código do dia (RPC `perform_estalecas_checkin`), envio de prova de conquista (bucket `estalecas-provas`), ranking. | `estalecas` (só no menu) |

### Financeiro (área com 16 telas)

| Caminho | Componente | O que faz | moduleKey |
|---|---|---|---|
| `/financeiro` | redirect → `/financeiro/lancar-dia` | — | — |
| `/financeiro/lancar-dia` | `FinanceiroLancarDiaPage.tsx` (938 l.) | Comanda digital: paciente (busca no CRM), itens do catálogo oficial, formas de pagamento, edição/exclusão com confirmação. Origem de quase todo o financeiro. | `fin-lancar-dia` ✓ |
| `/financeiro/contas` | `FinanceiroContasPage.tsx` (1311 l.) | Contas a pagar + **Fila do Dia** (vencidas / hoje / 7 dias / compras chegando) + **Lançar rápido** (cola boleto/PIX/NF e o app preenche) + **Caixa de entrada** (solta vários PDFs). Categoria P12 obrigatória. | `fin-contas` ✓ |
| `/financeiro/painel` | `FinanceiroPainelPage.tsx` (876 l.) | Painel do Mês para reunião: 6 blocos (mês em um olhar, gráficos, mapa de calor, ponte dos lucros, pontos da reunião, gestão do dia 5). Substitui `/relatorios` + `/gestao`. | `fin-gestao` ✓ |
| `/financeiro/gestao` · `/financeiro/relatorios` | redirects → `/financeiro/painel` | Links antigos preservados. | — |
| `/financeiro/extrato` | `FinanceiroExtratoPage.tsx` (515 l.) | Arrasta o `.xlsx` do Itaú → conciliação automática em 4 baldes (comanda, despesa, cofre, ignorado). | `fin-extrato` ✓ |
| `/financeiro/compras` | `FinanceiroComprasPage.tsx` (471 l.) | Planilha CONTROLE DE COMPRAS: forma de pagamento, cartão + parcelas, NF, previsão de entrega; se não for crédito cria a conta a pagar sozinha; "A caminho" → estoque. | `fin-compras` ✓ |
| `/financeiro/crediario` | `FinanceiroCrediarioPage.tsx` (743 l.) | Livro-caixa do dinheiro vivo (fora da P12); conferência do cofre com detector de duplicata; botão "somar este caixa no lucro do mês"; estorno rastreado. | `fin-crediario` ✓ |
| `/financeiro/fechamento` | `FinanceiroFechamentoPage.tsx` (422 l.) | Conferência diária esperado × extrato por maquininha, lançamento de taxas, Bateu/Divergente. | `fin-fechamento` ✓ |
| `/financeiro/poupanca` | `FinanceiroPoupancaPage.tsx` (512 l.) | Cofre: obra/CDB, provisões de 13º e férias; provisões sugeridas × movimentos lançados. | `fin-poupanca` ✓ |
| `/financeiro/impostos` | `FinanceiroImpostosPage.tsx` (803 l.) | Fila de NFs a emitir (uma por comanda), alíquota por tipo (consulta × tratamento), guias mensais/trimestrais. | `fin-impostos` ✓ |
| `/financeiro/repasses` | `FinanceiroRepassesPage.tsx` (292 l.) | Classificação PLANO (R$110) / AVULSA (R$150) / RETORNO (sem repasse) e fechamento do mês. | `fin-repasses` ✓ |
| `/financeiro/p12` | `FinanceiroP12Page.tsx` (467 l.) | DRE vivo: matriz categoria × mês derivada de comandas e contas; clicar no número abre a "prova viva". | `fin-p12` ✓ |
| `/financeiro/metas` | `FinanceiroMetasPage.tsx` (510 l.) | Meta mínima / meta / super meta; meta do dia recalculada pelos dias em que o Dr. Daniel atende; "Copiar meta do dia" p/ WhatsApp. | `fin-metas` ✓ |
| `/financeiro/pdca` | `FinanceiroPdcaPage.tsx` (287 l.) | Adesão ao plano derivada das comandas, com objeções e marcação manual. | `fin-pdca` ✓ |
| `/financeiro/lucro` | `FinanceiroLucroPage.tsx` (1202 l.) | Lucro Inteligente (Profit First): régua diária de envelopes, transferências, conferência com o portal da Rede, "onde estamos" dos últimos 3 meses. | `fin-lucro` ✓ |
| `/lembretes-pagamento` | `$APP/src/features/pagamentos/PagamentosPage.tsx` (989 l.) | Promessas de pagamento (nome, valor, data); "Recebi" pergunta se a dívida já tem comanda — separa dinheiro novo de dinheiro já contado. | `fin-contas` ✓ |

### CRM / Concierge / Programa

| Caminho | Componente | O que faz | moduleKey |
|---|---|---|---|
| `/crm` | redirect → `/crm/minhas-tarefas` | — | — |
| `/crm/minhas-tarefas` | `CrmTasksPage.tsx` (643 l.) | Fila de contatos do dia com mensagem pronta, botão copiar + abrir WhatsApp, registro da resposta. | **sem AccessGate** |
| `/crm/vendas` | `CrmKanbanPage.tsx` (**2789 l.**) | Kanban comercial + jornada do programa + abas por cadência + repescagens + fechamento com senha de gestor + importação CSV do Feegow + fullscreen + tour guiado. | **sem AccessGate** |
| `/crm/contatos/:id` | `CrmContactProfilePage.tsx` (557 l.) | Perfil do contato: dados, linha do tempo, tarefas em aberto. | **sem AccessGate** |
| `/crm/cadencias` | `CrmCadencesPage.tsx` (811 l.) | Inscreve contato nas réguas (D1, D5, D7, D60, resgates); avisa quando a regra de 1 cadência por paciente bloqueia; faixa "fora do 3·1". | **sem AccessGate** |
| `/crm/planilha` | `CrmPlanilhaCadenciasPage.tsx` (750 l.) | Planilha Oficial de Cadências viva: abas Enfermagem / Recepção / Concierge / Vendas / Gestor; colunas D1–D5; escalonamento automático p/ Concierge e Gestor. | `crm` ✓ |
| `/crm/coordenador` | `CrmCoordenadorPage.tsx` (371 l.) | Planilha do coordenador de vendas (5 abas): Registro de Contatos (auto do CRM + linhas à mão), Funil, PDCA Prescrições, PDCA Agendamentos, Plano de Ação. | `crm` ✓ |
| `/crm/indicacoes` | `CrmCanaisPage.tsx` (416 l.) | Indicações: quem indicou × quem foi indicado, voucher de R$500 liberado sozinho quando a consulta vira comanda. | `crm` ✓ |
| `/crm/canais` | redirect → `/crm/indicacoes` | — | — |
| `/crm/listas` | redirect → `/acompanhamento` | — | — |
| `/acompanhamento` | `ProgramaAcompanhamentoPage.tsx` (634 l.) | Plano de Acompanhamento do Dr. Daniel: fase de cada paciente, marcos (6 checkpoints, 6 bioimpedâncias, 3 consultas), quem não fechou na semana. Agenda oficial fica no Feegow. | `acompanhamento` ✓ |
| `/concierge/nps` | `ConciergeNpsPage.tsx` (646 l.) | Fila de quem passou na clínica e ainda não recebeu contato (derivada das comandas), WhatsApp com mensagem pronta, duas carinhas, resumo do mês, dores/elogios + PDCA, comentários do totem. | `concierge-nps` ✓ |
| `/estoque` | `EstoquePage.tsx` (898 l.) | Estoque Recepção × Enfermagem: posição, mínimos, lotes FEFO, contagem cíclica, chegadas vindas de Compras, leitor de código de barras. | `estoque` ✓ |

### Administração / Marketing / Inteligência

| Caminho | Componente | O que faz | moduleKey |
|---|---|---|---|
| `/administracao` | redirect → `/administracao/colaboradores` | — | — |
| `/administracao/colaboradores` | `ColaboradoresPage.tsx` (657 l.) | Cadastro da equipe + criação de login (Edge Function), ativação/desativação (RPCs). | `canAdministracao` ✓ |
| `/administracao/colaboradores/:id` | `ColaboradorPerfilPage.tsx` (181 l.) | Ficha do colaborador com módulos liberados. | `canAdministracao` ✓ |
| `/administracao/acessos` | `AcessosPage.tsx` (199 l.) | Grade pessoa × tela com nível efetivo (OCULTO/VER/EDITAR) e exceções por pessoa. Só Dr. Daniel, CEO e gestor financeiro. | `canManageAcessos` ✓ |
| `/administracao/estalecas` | `EstalecasAdminPage.tsx` (**1847 l.**) | Código de check-in do dia, aprovação de provas, prêmios, ajustes de saldo, ranking mensal. | `canAdministracao` ✓ |
| `/administracao/seguranca` | `SegurancaPage.tsx` (327 l.) | Matriz de acessos por cargo + pontos de atenção. | `canAdministracao` ✓ |
| `/administracao/auditoria` | `AuditoriaPage.tsx` (369 l.) | Eventos de `audit_event` em português, filtro por pessoa e por área. | `canAdministracao` ✓ |
| `/marketing` | `MarketingPage.tsx` (932 l.) | Briefing do mês: upload de foto/PDF → "Preencher com IA" (Edge Function + Claude) → estratégia, cadência por formato, temas semanais e calendário de peças com status A produzir → Gravado → Editado → Postado. | `marketing` ✓ |
| `/inteligencia-360` | `Inteligencia360Page.tsx` → `Inteligencia360DashboardPage` (2172 l. no arquivo) | Painel executivo: faturamento, metas, CRM, adesão, NPS do totem, próxima ação recomendada, "Copiar meta do dia", "Gerar resumo em PDF". | `AccessGate` no `App.tsx` (`canInteligencia360`) |
| `/inteligencia-360/:section` | `Inteligencia360ModulePage` | 10 módulos: `ticket-medio` (Ticket Médio Semanal), `precificacao` (Preço, custo, repasse, margem), `comercial` (Prescrito × vendido, objeções), `jornada-paciente`, `reguas`, `retencao-resgate`, `experiencia` (NPS/Google), `recebiveis`, `acoes` (plano de melhoria), `configuracoes`. | idem |

### Elementos globais (fora das rotas)

- `$APP/src/layouts/AppLayout.tsx` (615 l.): sidebar desktop com 9 grupos de fluxo, dock mobile (`DockMorph`), **Flow Launcher ⌘K** com busca normalizada sem acento, badge de cargo, avatar, sair.
- `$APP/src/components/BalaoDoDia.tsx`: balão arrastável em todas as telas (meta do dia + cabe gastar), lê `fin_lucro_publico`; escondido por padrão para o gestor financeiro.
- `$APP/src/features/financeiro/PublicadorDoResumo.tsx`: componente sem tela — enquanto alguém com `fin-lucro` em EDITAR estiver logado, recalcula e grava o retrato público do mês.
- `$APP/src/components/ui/page-guide.tsx`: botão flutuante "Como usar" em toda tela, alimentado por `$APP/src/lib/pageGuides.ts` (702 l., 30 guias com "o que é / passos / dicas").

---

## 3. DOMÍNIOS E DADOS

### 3.1 Camada de acesso

- Cliente único: `$APP/src/lib/supabase.ts` (`persistSession`, `autoRefreshToken`, `detectSessionInUrl`). `isSupabaseConfigured` permite o **modo prévia** sem banco.
- **`$APP/src/lib/remoteData.ts` (5.078 linhas)** concentra praticamente TODAS as chamadas ao Supabase — ~140 funções `listRemote*` / `createRemote*` / `saveRemote*` / `deleteRemote*`. É o módulo central do app.
- Tipos do banco: `$APP/src/types/database.ts` (534 l.).
- Auth: `$APP/src/hooks/useAuth.tsx` — carrega a `Pessoa` da view `colaborador_app` por `auth_id`, com `onAuthStateChange`.

### 3.2 Tabelas por área (via `.from("...")` em `$APP/src`)

**Financeiro:** `fin_sales`, `fin_sale_items`, `fin_sale_payments`, `fin_expenses`, `fin_expense_nota`, `fin_purchases`, `fin_invoices`, `fin_categories`, `fin_savings_moves`, `fin_provision_rules`, `fin_reconciliations`, `fin_cash_entries`, `fin_crediario_profit`, `fin_partner_entries`, `fin_pdca_status`, `fin_metas_config`, `fin_gestao_mensal`, `fin_bank_entry`, `fin_inbox_item`, `fin_lucro_config`, `fin_lucro_dia`, `fin_lucro_publico`, `fin_entrada_unica`.

**CRM:** `crm_contacts`, `crm_deals`, `crm_coordenador_mes` (+ `crm_tasks`, `crm_cadence_enrollments` via realtime e via o carregador `listRemoteCrmState`, que monta o `CrmState` inteiro).

**Pagamentos:** `pagamento_lembrete`, `pagamento_recebimento`.

**Estalecas:** `estaleca_transactions`, `estaleca_claims`, `estaleca_config`, `checkins`, `checkin_event_codes`, `rewards`, `gamification_profile`, `gamification_ranking_profile`.

**Operação:** `checklist_task`, `checklist_template`, `checklist_item_template`, `checklist_run`, `checklist_item_run`, `aviso`, `comprovante`.

**Estoque:** `estoque_item`, `estoque_movimento`.

**Concierge / NPS:** `concierge_nps_contato`, `concierge_nps_mes`, `nps_resposta` (totem).

**Admin:** `colaborador`, `colaborador_app`, `colaborador_cargo`, `colaborador_acesso`, `audit_event`.

**Integrações:** `sharepoint_dispatch_queue`, `marketing_briefings`, `inteligencia_360_settings`, `receivables`.

### 3.3 Como os dados carregam

**Padrão dominante — híbrido local + remoto:**
`useAuth` define `useRemote = Boolean(pessoa && session && !isPreview)`. Se remoto, React Query busca; se não, cai em `localStorage` (`$APP/src/lib/localStore.ts`). Isso vale para `$APP/src/features/financeiro/useFinanceiro.ts` (671 l.), `$APP/src/features/crm/useCrmState.ts` (218 l.) e `$APP/src/features/estoque/useEstoque.ts`.

**React Query** (`$APP/src/main.tsx`): `staleTime: 60_000`, `refetchOnWindowFocus: false`, `retry: 1`. Queries específicas usam `staleTime: 30_000` (CRM).

**~39 chaves de `localStorage`** com prefixo `app-bratan-*` — cada domínio tem a sua (`app-bratan-fin-sales`, `app-bratan-crm-v2`, `app-bratan-inteligencia-360-v2`, `app-bratan-estoque-items`, `app-bratan-kanban-density-v2`, `app-bratan-tour-kanban`, `app-bratan-preview-cargo`, etc.).

**Realtime — um único canal**, em `$APP/src/lib/remoteData.ts:4025-4032`:
```
.channel("crm-stream")
  .on("postgres_changes", {... table: "crm_deals" }, onChange)
  .on("postgres_changes", {... table: "crm_tasks" }, onChange)
  .on("postgres_changes", {... table: "crm_cadence_enrollments" }, onChange)
```
Nenhuma outra área usa realtime. **Não há polling** exceto o `/version.json` do `UpdatePrompt` (60s) e o relógio do Almoço (30s).

**Sincronismo do CRM (sofisticado e frágil):** `useCrmState` faz sync por *diff* contra um `baselineRef`, com `dirtyRef` para não deixar o snapshot remoto sobrescrever mudança local, fila de deletes pendentes, e três permissões distintas por cargo (`canSyncCatalog`, `canPushCoverage`, `curative`) — tudo comentado como correção de bugs reais de julho/2026.

### 3.4 Storage buckets (6)

| Bucket | Uso |
|---|---|
| `comprovantes` | upload/remove/signed URL — `remoteData.ts:784`, `:4769`, `:5018` |
| `notas-fiscais-despesa` | NF do fornecedor anexada à conta — `:5011` |
| `marketing-briefings` | foto/PDF do briefing — `:1253`, `:1269`, `:1309`, `:1318` |
| `estalecas-provas` | prova de conquista — `:4623`, `:5025` |
| `avatars` | foto de perfil (jpg por pessoa) — `:4650`, `:4662` |
| `fin-caixa-entrada` | PDFs soltos na caixa de entrada do financeiro — `:4923` |

Todo acesso de leitura é por `createSignedUrl(..., 60 * 10)` (10 min).

### 3.5 RPCs chamadas do front (10)

`perform_estalecas_checkin`, `normalized_checkin_code_hash`, `invalidate_checkin`, `mark_pagamento_pago_por_comprovante`, `write_audit_event`, `definir_senha_gestor`, `conferir_senha_gestor`, `senha_gestor_definida`, `deactivate_colaborador`, `reactivate_colaborador`.

No banco há mais 27 funções (helpers de RLS: `is_coordenacao`, `is_financeiro_full`, `can_crm_read/manage`, `module_access_override`, `estoque_pode`, `crm_task_resolve_owner`, triggers `prevent_negative_estaleca_balance`, `crm_tasks_prevent_status_regression`, `estoque_carimba_chegada`, `nps_totem_dentro_do_limite`, etc.).

---

## 4. INTEGRAÇÕES EXTERNAS

### 4.1 SharePoint / Microsoft Graph — **automatizado**

- Mapa de pastas: `$APP/src/lib/sharepoint.ts` (site `institutobratanribeiro.sharepoint.com/sites/Financeiro`, biblioteca Documentos). Módulos: `COMPROVANTE` → `NOTA FISCAL E COMPROVANTES/AAAA/MM`, `NOTA_FISCAL_DESPESA` → `.../NOTAS FISCAIS RECEBIDAS`, `ESTORNO` → `.../ESTORNOS`, `CRM_DOCUMENTO`, `POP`, `RELATORIO_360`, `OUTRO`.
- Enfileiramento no front: `prepareSharePointDispatch()` chamado em `$APP/src/features/comprovantes/ComprovantesPage.tsx:275` e `:329`, e em `$APP/src/features/financeiro/NotaDaContaCell.tsx`.
- Envio: `$APP/supabase/functions/sharepoint-dispatch/index.ts` + job `pg_cron` a cada 15 min.
- **Manual:** cadastro do app no Azure AD e os 5 segredos (documentado em `$APP/docs/sharepoint-integracao.md`). Sem eles a fila acumula em `PENDING` — nada se perde, mas nada sobe.

### 4.2 Anthropic (Claude) — **automatizado com clique**

- `$APP/supabase/functions/marketing-briefing-parse/index.ts`: `https://api.anthropic.com/v1/messages`, header `anthropic-version: 2023-06-01`, modelo `claude-opus-4-8`, tool/JSON-Schema `PLAN_SCHEMA` (monthLabel, summary, cadence, weeklyThemes, calendar…). Aceita imagem e PDF como content block.
- `$APP/scripts/marketing-ia-setup.mjs`: valida a chave com `claude-haiku-4-5` e grava o secret.
- **Manual:** anexar a foto/PDF do briefing e clicar "Preencher com IA" (`$APP/src/features/marketing/MarketingPage.tsx:471`). Não há Gemini nem OpenAI no código.

### 4.3 Rede / Itaú (maquininha) — **motor local, conferência manual**

- `$APP/src/features/financeiro/recebiveisRede.ts`: dois acordos comerciais codificados — **Q-7594851** (vigência `2026-08-24`) e **Q-7621480** (vigência `2026-09-01`), com tabelas de taxa por modalidade, prazo de liquidação de 31 dias, cálculo de antecipação (SELIC + 0,9%) e calendário de dias úteis/feriados bancários.
- **Não há API da Rede.** O passo manual está explícito em `$APP/src/features/financeiro/FinanceiroLucroPage.tsx:927`: *"abra o portal da Rede, veja o 'a receber' de hoje e digite aqui"* — o app só mostra a diferença.

### 4.4 Extrato do Itaú (xlsx) — **semiautomático**

- `$APP/src/features/financeiro/extratoBanco.ts` (766 l.): lê o `.xlsx` **sem biblioteca** — descompacta o ZIP com `DecompressionStream("deflate-raw")` do navegador e faz o parse do XML; também aceita CSV/texto colado. `clientRef` determinístico (data+valor+descrição) evita duplicar reimportação. `conciliarExtrato()` casa lançamentos com comandas, despesas e movimentos de cofre em 4 baldes.
- **Manual:** o Lucas baixa o extrato no internet banking e arrasta o arquivo em `$APP/src/features/financeiro/FinanceiroExtratoPage.tsx:258` (`accept=".xlsx,.csv,.txt"`).

### 4.5 Leitor de boleto / guia / NF / PIX — **regex + parsing de especificação, sem IA**

`$APP/src/features/financeiro/leitorDocumento.ts` (203 l.):
- **Boleto**: linha digitável de 47 dígitos; campo 5 = fator de vencimento (4) + valor em centavos (10). Trata as **duas bases de fator** (07/10/1997 e 22/02/2025) escolhendo a que cai perto de hoje.
- **Guia de arrecadação**: 48 dígitos começando em 8; remonta o código de barras de 44 dígitos e lê o valor quando o 3º dígito é 6 ou 7.
- **PIX BR Code (EMV)**: percorre os campos TLV a partir de `000201` — tag 54 (valor) e 59 (recebedor). Comentário explícito: regex solta pegaria "54" no meio de outro número.
- **Texto livre**: vencimento, valor, CNPJ, beneficiário/cedente/prestador, nº da NF.
- Cada campo lido vai para o array `leituras[]` com a origem, para a pessoa conferir. Zero IA.

`$APP/src/features/financeiro/pdfTexto.ts`: extrai texto de PDF com `pdf.js 4.10.38` carregado da CDN cdnjs sob demanda; `.txt`/`.eml`/`.html` lidos direto com strip de tags.

**Manual:** colar o texto ou soltar o PDF em `LancarRapidoCard.tsx` / `CaixaEntradaCard.tsx`; escolher a categoria P12; conferir antes de salvar.

### 4.6 WhatsApp — **link, não API**

Apenas `https://wa.me/55<numero>?text=<mensagem>` gerado em 7 pontos: `$APP/src/features/crm/crmData.ts:734`, `CadenciaKanban.tsx:32`, `RepescagemBoard.tsx:51`, `CrmKanbanPage.tsx:330/456/1886`, `$APP/src/features/concierge/npsData.ts:183`. **Nada é enviado automaticamente** — a pessoa copia/abre e manda.

### 4.7 Feegow — **importação CSV manual**

`$APP/src/features/crm/CrmKanbanPage.tsx:748-807` (`handleFeegowFile`): importa a exportação de pacientes do Feegow em CSV, detecta colunas, cria contato/lead com `sourceChannel: "Importação Feegow"`, deduplicando por telefone. Nas outras telas o Feegow aparece só como referência de processo ("a agenda oficial fica no Feegow" — `ProgramaAcompanhamentoPage.tsx:196`).

### 4.8 iClinic, SuperSign — **só documentados, zero integração**

Aparecem exclusivamente em `$APP/src/features/pops/popsData.ts` e `$APP/src/features/checklist/checklistData.ts` como passos de POP e itens de checklist. Ex.: POP "Cobrança de Assinatura de Contratos (SuperSign) v2" (`popsData.ts:231`), "Controle de Pacientes - iClinic e SharePoint" (`popsData.ts:580`).

### 4.9 Totem NPS — **entrada externa, leitura no app**

Tabela `nps_resposta` (migration `202608040002_nps_resposta_totem.sql`, com função `nps_totem_dentro_do_limite`). O paciente dá a nota no totem da recepção; respostas são **anônimas por decisão de LGPD**. Motor de leitura em `$APP/src/features/inteligencia360/npsData.ts` (score clássico 0–6/7–8/9–10). Consumido em `Inteligencia360Page.tsx:705` e `ConciergeNpsPage.tsx:89`.

### 4.10 Geração de arquivos — **automatizado, salvamento manual**

- **Excel**: `$APP/src/lib/xlsxWriter.ts` (ZIP "stored" + XML, com cabeçalho colorido, formato moeda/data, largura de coluna, painel congelado, linha de total).
- **PDF**: `$APP/src/lib/brandedPdf.ts` (relatório com identidade visual) e `$APP/src/lib/planilhaImpressao.ts` (mesma `XlsxSheet` vira PDF paisagem) — ambos via `window.open` + diálogo de impressão.
- **Salvar**: `$APP/src/lib/salvarArquivo.ts` — usa `showSaveFilePicker` (Chrome/Edge, inclusive PWA instalado) e cai no `<a download>` no Safari/Firefox, informando na tela onde o arquivo foi parar.
- Planilhas para a contabilidade em `$APP/src/features/financeiro/contabilidadeXlsx.ts` e `$APP/src/features/financeiro/exportContabilidade.ts` (formatos "ENTRADA INSTITUTO BRATAN", "CONTAS A PAGAR-RECEBER", "PDCA DR DANIEL", "CONTROLE DE IMPOSTOS"). **Manual:** o envio ao contador continua sendo por fora.

### 4.11 E-mail

Não há envio de e-mail pelo app. O `.eml` só aparece como formato aceito na leitura de boleto.

---

## 5. MOTORES DE REGRA (lógica pura, sem React)

Todos testáveis por `node --test` porque não importam JSX.

### Financeiro

| Arquivo | Linhas | O que calcula |
|---|---|---|
| `$APP/src/features/financeiro/lucroInteligente.ts` | 996 | Profit First adaptado: "Vendas − Lucro = Despesas". Tira as taxas de maquininha/PIX do bruto do dia e reparte o LÍQUIDO em 4 envelopes — impostos (% do líquido), lucro dos sócios (R$ fixo/mês ÷ dias úteis), médico executor (50% do lucro bruto do produto = coluna S da planilha), operacional (o que sobra, pode ficar negativo). Suporta "degraus" com data de vigência, calcula disponibilidade D+1 do cartão pulando feriado e o custo de antecipar. Classifica cada conta paga no envelope certo. |
| `$APP/src/features/financeiro/catalogoPrecificacao.ts` | 303 | A planilha oficial "BRATAN - PRECIFICACAO E LUCRO - TAXA HORA SALA" (versão 14/09/2026) dentro do código: cada produto com preço (coluna F), lucro bruto (coluna P), imposto, comissão (10%, 1% em tirzepatidas até 49 un), repasse nutri/psi e custo fixo (consumível + minutos de sala). Reconhece o item da comanda por nome exato, regex na descrição ou preço; rateia valores e monta itens fechados. |
| `$APP/src/features/financeiro/recebiveisRede.ts` | 281 | Agenda de recebíveis do cartão: parcelas previstas com data e valor líquido por acordo vigente (Q-7594851 × Q-7621480), taxas por modalidade, saldo a receber numa data, faturamento Rede do mês, custo de antecipação (SELIC a.m. + 0,9%), calendário de dias úteis e feriados bancários. |
| `$APP/src/features/financeiro/extratoBanco.ts` | 766 | Lê o extrato (.xlsx/CSV/texto) e concilia contra comandas, despesas e cofre em 4 baldes; detecta taxa de maquininha fora da faixa, PIX que não caiu, pagamento não lançado; gera a "leitura da conciliação" em português. |
| `$APP/src/features/financeiro/financeiroData.ts` | 2559 | Núcleo do domínio: tipos de venda/despesa/nota, `saleTotal`, matriz P12, alíquotas (`finTaxRates`), impostos por NF, regras de repasse 110/150, conferência do dia, gestão mensal, ponte dos lucros, provisões, recorrências, parcelamento (até 72x). |
| `$APP/src/features/financeiro/metasData.ts` | 466 | Meta mínima/meta/super meta do mês; meta do DIA recalculada pelos dias úteis em que o Dr. Daniel atende (padrão seg–qui, sem sexta, com overrides por dia); faturamento e pacientes derivados das comandas. |
| `$APP/src/features/financeiro/pdcaData.ts` | 167 | Adesão = plano de acompanhamento com valor ≥ R$6.997. Quem só pagou sinal fica fora do denominador; medicação avulsa não é tratamento; ticket médio do PDCA só de quem fechou o plano. |
| `$APP/src/features/financeiro/naturezaItem.ts` | 89 | Separa VENDA (plano/consulta/tratamento) de sinal, medicação avulsa, exame e atendimento de outro profissional. O faturamento soma tudo; só ticket e PDCA olham a natureza. |
| `$APP/src/features/financeiro/resumoFechamento.ts` | 187 | Documento de fechamento mensal: o app calcula o que sai dos lançamentos e a pessoa só digita decisão de reunião/saldo de banco. Crediário NUNCA entra. Lucro dividido 80% Andrya / 20% Daniel. |
| `$APP/src/features/financeiro/conferenciaFechamento.ts` | 168 | Detecta "fechou no Kanban e não virou comanda": cruza `CrmDeal`, lembretes e `FinCashEntry` contra `FinSale` e devolve pendências (FECHOU_SEM_COMANDA, COMANDA_MENOR_QUE_VENDA, VEIO_DA_PLANILHA) com gravidade. |
| `$APP/src/features/financeiro/filaFinanceira.ts` | 217 | Monta a Fila do Dia derivando de contas + compras: vencidas, vencem hoje, próximos 7 dias, compras chegando; alertas SEM_ARQUIVO/SEM_NF/SEM_CONTA/ATRASADO/CHEGANDO + frase-resumo. |
| `$APP/src/features/financeiro/momentoDoMes.ts` | 169 | Classifica o mês em COMECO/MEIO/RETA_FINAL/FECHADO medindo **dias úteis** e adapta a narrativa da apresentação (ritmo necessário → projeção → quanto falta por dia → resultado), sempre contra a super-supermeta. |
| `$APP/src/features/financeiro/pontosDaReuniao.ts` | 392 | Gera os pontos de reunião a partir dos números, ordenados por peso; cada ponto traz O QUÊ (com valor), POR QUE importa e O QUE FAZER. |
| `$APP/src/features/financeiro/contabilidadeXlsx.ts` | 422 | Monta as abas "ENTRADA INSTITUTO BRATAN" (grade diária) e "CONTAS A PAGAR-RECEBER" no formato que o contador já recebe. |
| `$APP/src/features/financeiro/exportContabilidade.ts` | 311 | Monta "PDCA DR DANIEL", "CONTROLE DE IMPOSTOS CONSULTA/TRATAMENTO" (ISS/PIS/COFINS/IRPJ/CSLL com subtotais mensal × trimestral) e "ENTRADA POUPANÇA × SAÍDA OBRA". |

### CRM

| Arquivo | Linhas | O que calcula |
|---|---|---|
| `$APP/src/features/crm/crmData.ts` | **4693** | O motor inteiro do CRM: contatos, negociações, etapas do funil, fases do programa, catálogo de cadências e passos, templates de mensagem, geração e resolução de tarefas, avanço automático de card, timeline, papéis (`CrmRole`), dedupe por telefone, derivação da Inteligência 360. |
| `$APP/src/features/crm/cadenciaKanbanData.ts` | 187 | Transforma cada cadência num quadro: colunas = passos (D1, D5, D7, D60…), cartões = inscrições ativas, cada uma na coluna do passo que está esperando. Tudo derivado das tarefas. |
| `$APP/src/features/crm/repescagemData.ts` | 289 | Repescagem por faixa de sumiço (1 mês, 3, 6, 1 ano) usando a **última comanda** como referência; a régua é isca no WhatsApp → ligação → 2ª ligação; data/hora de cada toque vêm do `completedAt` da tarefa. Permite adicionar pessoa à mão. |
| `$APP/src/features/crm/resgateData.ts` | 96 | Radar de resgate: separa em CHEGANDO (perto dos 60 dias), D60, M6, A1 a partir da última comanda, e mapeia cada faixa para a cadência-semente correspondente. |
| `$APP/src/features/crm/coordenadorVendasData.ts` | 210 | A planilha do coordenador: Registro de Contatos derivado do CRM (origem pelo canal, agendou/compareceu/fechou pela etapa) + linhas à mão; Funil somado automaticamente; PDCAs guardados por mês. |
| `$APP/src/features/crm/recebimentoKanbanData.ts` | 189 | Recebimento no fechamento do Kanban: tipo (sinal/1ª consulta/tratamento/retorno), divisão em parcelas com conferência de soma, quando emitir a nota, lista de destinos com ✓ do que já está resolvido. |
| `$APP/src/features/crm/nameMatch.ts` | 90 | Limpa nome de paciente vindo da comanda (corta anotações como "NF unificada 15/07"), reconhece variações do mesmo nome sem juntar pessoas diferentes, e barra linhas que não são pessoa ("Fechamento do dia"). |
| `$APP/src/features/crm/faseVencida.ts` | 48 | Prazo por fase do programa (`FECHAMENTO_D0` 1d, `TRES_CONTATOS_D1` 3d, `AGENDAMENTO` 7d, `PRIMEIRO_ATENDIMENTO` 21d, demais sem prazo); vencido fica vermelho e sobe no topo. |
| `$APP/src/features/crm/contactChannels.ts` | 87 | Regra única de telefone/e-mail: máscara BR conforme digita, DDI 55, validação mínima para ligar/abrir WhatsApp. |

### Outros domínios

| Arquivo | Linhas | O que calcula |
|---|---|---|
| `$APP/src/features/estoque/estoqueData.ts` | 429 | Kardex (saldo sempre derivado dos movimentos, nunca gravado), ponto de pedido, FEFO por lote/validade, contagem cíclica como movimento, elo com Compras (chegada pendente → entrada + carimbo "Chegou"), leitura de código de barras/GS1 AI. |
| `$APP/src/features/programa/programaData.ts` | 503 | Plano de 6 meses (POP v3.1): 6 checkpoints mensais + 6 bioimpedâncias + 3 consultas (meses 2, 4, 6). Calcula datas previstas a partir da adesão, o que está atrasado e o próximo passo por paciente. |
| `$APP/src/features/concierge/npsData.ts` | 184 | Registro de contato da concierge (paciente, canal, carinha), resumo do mês calculado (era aba digitada) e junção com os comentários do totem do mês. |
| `$APP/src/features/inteligencia360/npsData.ts` | 90 | NPS clássico do totem: faixas 0–6/7–8/9–10, score = %promotores − %detratores, mais a média simples. |
| `$APP/src/features/inteligencia360/intelligenceEngine.ts` | 476 | Gera insights e o snapshot do Dashboard 360 a partir do estado: ticket médio × meta, variação, recebíveis vencidos, qualidade do dado, próxima ação recomendada, brief executivo semanal. |
| `$APP/src/features/estalecas/estalecasData.ts` | 772 | Economia das Estalecas: config (valores de check-in academia/igreja, bônus de sequência, marco 500, % de cashback e teto), saldo, status de transação, hash determinístico do código de check-in. |
| `$APP/src/lib/chartData.ts` | 278 | Agregadores puros dos gráficos: série mensal faturamento × custos × lucro (espelho da P12), mapa de calor diário, donuts de forma de pagamento / tipo de item / destino do custo. |
| `$APP/src/lib/access.ts` | 361 | Matriz de acesso: 10 cargos, 26 `ModuleKey`, nível padrão por cargo e nível efetivo com exceção por pessoa (OCULTO/VER/EDITAR). |
| `$APP/src/lib/money.ts` | 36 | `parseMoneyBR` — aceita "1.500,00", "R$ 150", "1500.00", "150,5"; decide ponto-milhar × ponto-decimal pelo número de casas. |

---

## 6. QUALIDADE E DX

### Testes — o ponto mais forte do projeto

- **63 arquivos** em `$APP/tests/`, **642 casos `test()`**, **11.574 linhas**.
- Runner: `node --test` (sem framework). Cada arquivo traz seu **próprio loader**: `typescript.transpileModule` + `vm.runInNewContext`, com stub de `@/lib/localStore` e resolução do alias `@/`. Por isso os motores são deliberadamente livres de JSX.
- Cobertura por domínio: financeiro (`financeiro`, `financeiro-provisoes`, `lucro-inteligente`, `lucro-resumo-publico`, `recebiveis-rede`, `maquininha-extrato`, `contas-parcelas`, `contas-recorrentes`, `crediario-no-lucro`, `gestao-mensal`, `metas-agosto`, `resumo-fechamento`, `conferencia-fechamento`, `fechamento-comprovantes`, `fechamento-vira-comanda`, `fila-financeira`, `nota-fiscal-conta`, `obra-x-distribuicao`, `contabilidade-xlsx`, `export-contabilidade`, `pdca-plano`, `ticket-sem-sinal`, `ticket-so-venda`), CRM (`crm-rules`, `crm-etapa4`, `crm-cadencia-sequencial`, `crm-planilha-cadencias`, `crm-programa`, `crm-canais`, `crm-dono-real`, `crm-sync-dedup`, `cadencia-kanban`, `repescagem`, `radar-resgate`, `fase-vencida`, `coordenador-vendas`, `name-match`, `indicacoes`, `uma-jornada-por-paciente`, `agendamento-31`, `corrigir-canal-fechamento`), operação (`estoque`, `acessos`, `comprovantes`, `estalecas-rules`, `concierge-nps`, `nps-totem`, `sharepoint`, `pops-fluxogramas`, `programa`, `acompanhamento-filtro`), utilitários (`money`, `relatorios-graficos`, `planilhas-onde-o-dado-mora`, `processo-sem-erro`, `nota-instrucao-visivel`, `reuniao-14-08`).
- **Zero teste de componente/UI** — nenhum React Testing Library, nenhum Playwright/Cypress.

### Lint / typecheck / CI

- **Não há ESLint, Prettier, Biome nem Husky.**
- Typecheck só dentro do `build` (`tsc -b`). `strict: true` está ligado.
- **Não há `.github/`** — nenhum CI. A verificação é o build do Vercel.
- Existem `tsconfig.tsbuildinfo` e `tsconfig.node.tsbuildinfo` **versionados no git**.

### Tratamento de erros

- 121 `catch` e 53 `console.*` no `src`. **Nenhum ErrorBoundary** — uma exceção de render derruba a tela.
- Padrão dominante: estado local de feedback (295 ocorrências de `setError`/`setFeedback`/`setStatus`) renderizado em cartão colorido.
- 27 usos de `window.confirm` / `window.alert` / `window.prompt` para confirmações destrutivas e cópia.
- Falhas de sync do CRM têm banner dedicado com detalhe técnico (`$APP/src/features/crm/CrmSyncBanner.tsx`), por decisão explícita: "um print da equipe já chega com o diagnóstico".
- `useAuth` tem `.catch()` no `getSession` inicial — correção documentada de um bug que prendia o app em "Carregando".

### i18n

**Não há.** O app é 100% pt-BR hardcoded (`lang="pt-BR"` no HTML e no manifest, `Intl.NumberFormat("pt-BR")` / `DateTimeFormat("pt-BR")` nos formatadores). Para uma clínica de SP isso é adequado.

### Acessibilidade

- **712 atributos `aria-*`** — densidade alta e consistente (`aria-hidden` em todo ícone decorativo, `aria-label` em botões de ícone, `aria-label="Navegação principal"`, `role="tablist"`).
- `motion-safe:` usado nos pulsos de loading.
- Foco visível via `focus-visible:ring-2 focus-visible:ring-ring` na maioria dos interativos.
- Ponto fraco: `window.alert/confirm` no lugar de diálogos acessíveis; `<img alt="">` em previews de comprovante (decorativo, ok) e tooltips nativos `<title>` nos gráficos SVG (funciona, mas não é navegável por teclado).

### Tema escuro

**Não existe.** `grep "dark:"` no `src` → **0 ocorrências**. Há variáveis CSS de tema em `$APP/src/styles/globals.css` (paleta musgo/oliva/dourado/creme/papel/tinta em `:root`), mas nenhum bloco `.dark`. O `manifest.webmanifest` traz `background_color: #20241a` (escuro) enquanto o app é claro.

### Responsividade mobile

- **633 prefixos responsivos**: `sm:` 338, `lg:` 142, `md:` 104, `xl:` 47, `2xl:` 1. Abordagem mobile-first real.
- Shell dedicado: `mobile-app-shell`, `min-h-dvh`, `env(safe-area-inset-*)` (22 ocorrências), `ios-safe-top`, `overscroll-behavior-y: none`, `-webkit-tap-highlight-color: transparent`.
- Navegação mobile própria: `DockMorph` (`$APP/src/components/ui/dock-morph.tsx`) com 5 itens fixos + "Menu" que abre o Flow Launcher.
- Kanban com pan-scroll por arrasto (`$APP/src/features/crm/usePanScroll.ts`) e densidade ajustável (`kanbanDensidade.ts`).
- Estética "iOS glass": `ios-glass`, `ios-glass-quiet`, `ios-pressable`, `backdrop-blur-xl`, `liquid-glass-button`.

### Estados vazios / loading

- 56 pontos com `isLoading`/`isPending`/"Carregando"/"Preparando tela"; fallbacks de Suspense em 2 níveis (App e AppLayout).
- ~42 estados vazios escritos em linguagem humana ("Ninguém em aberto de não-fechamento nesse período. 🎉", "Nada encontrado para 'x'. Tente outro nome, como 'tarefas' ou 'kanban'").
- Gráficos têm `EmptyChart` próprio (`$APP/src/components/charts/BratanCharts.tsx:25`).

### Notificações

- **Sem toast library, sem push notification, sem Web Notifications API.** O feedback é inline por tela.
- A única notificação global é o `UpdatePrompt` (faixa "Nova versão disponível").

### Offline

- Service worker garante que o **shell** abre offline (cache do `index.html`) e que assets são servidos rápido.
- Dados do Supabase **não** são cacheados (cross-origin passa direto, por decisão).
- O `localStorage` funciona como fallback de leitura em modo prévia, mas **não há fila de escrita offline** — sem rede, a escrita falha.

---

## 7. SINAIS DE TRABALHO MANUAL E DÍVIDA (30 itens)

### Passos manuais embutidos no produto

| # | Arquivo:linha | O que é |
|---|---|---|
| 1 | `$APP/src/features/financeiro/FinanceiroLucroPage.tsx:927` | "Abra o portal da Rede, veja o 'a receber' de hoje e **digite aqui**" — não há API da Rede; a conferência de recebíveis é digitação. |
| 2 | `$APP/src/features/financeiro/FinanceiroExtratoPage.tsx:228` | "**Arraste o arquivo que você já baixa**" — o extrato do Itaú entra por upload manual, não por Open Finance/API. |
| 3 | `$APP/src/features/financeiro/ProvaDoDinheiroCard.tsx:105` | "**Digite o saldo do Itaú** para fechar a conta" — o saldo bancário é digitado à mão a cada fechamento. |
| 4 | `$APP/src/features/financeiro/FinanceiroCrediarioPage.tsx:536` | "**Conte o dinheiro do cofre e digite aqui**" — conferência física manual. |
| 5 | `$APP/src/features/crm/CrmCoordenadorPage.tsx:216` | Botão "**Adicionar linha à mão**" no Registro de Contatos — a planilha sobrevive dentro do app. |
| 6 | `$APP/src/features/crm/repescagemData.ts:139-141` | "Antes de adicionar **manualmente**, para ter o controle" — entrada manual na repescagem como requisito explícito. |
| 7 | `$APP/src/features/financeiro/FilaDoDiaCard.tsx:78` | `window.prompt("Copie a linha digitável:", codigo)` — copiar boleto via prompt nativo. |
| 8 | `$APP/src/features/financeiro/pdfTexto.ts:31` | Fallback do leitor de PDF: "**Cole o texto do boleto no lugar do arquivo**". |
| 9 | `$APP/src/features/admin/EstalecasAdminPage.tsx:640` | "Não foi possível copiar automaticamente. **Copie o link manualmente**." |
| 10 | `$APP/docs/sharepoint-integracao.md` | Ativação do SharePoint é 100% manual (registrar app no Azure, consentimento de admin, 5 segredos). Sem isso a fila só acumula. |

### Comentários de dívida / decisões provisórias

| # | Arquivo:linha | O que é |
|---|---|---|
| 11 | `$APP/src/features/comprovantes/ComprovantesPage.tsx:400` | Texto na UI: "Captura **interina**... A **etapa oficial futura** envia os arquivos para o SharePoint via Microsoft Graph API" — **já está implementado** (a Edge Function existe e roda de 15 em 15 min). Copy desatualizado que mente para o usuário. |
| 12 | `$APP/src/features/financeiro/financeiroData.ts:1607` | "Regra **simplificada** (Lucas, 03/08/2026): todo resgate do CDB é OBRA" — atalho consciente de modelagem. |
| 13 | `$APP/src/features/financeiro/financeiroData.ts:2058` | "não dá para saber qual parte já foi emitida — no tipo **mais provável**" — heurística na classificação de NF. |
| 14 | `$APP/src/features/financeiro/naturezaItem.ts:49` | "Descrição vazia fica como tratamento (**não dá para saber**)" — default silencioso que afeta ticket médio e PDCA. |
| 15 | `$APP/src/features/crm/CrmKanbanPage.tsx:921` | "⚠️ O DINHEIRO NÃO ENTROU NO CAIXA... **Lance a entrada na mão** em Financeiro › Crediário para o cofre não ficar furado" — compensação manual de falha de escrita. |
| 16 | `$APP/src/features/crm/CrmKanbanPage.tsx:2180` | "Arrastar com o mouse foi **desabilitado** (Lucas, 22/07)" — código de drag mantido morto. |
| 17 | `$APP/src/features/pagamentos/pagamentosData.ts:417` | "O mesmo valor entrou pelo lembrete E foi lançado à mão no caixa — o dinheiro está contado **duas vezes**" — detector de duplicata que existe porque o fluxo duplo permanece. |

### Constantes de negócio hardcoded (mudam sem deploy? não — exigem deploy)

| # | Arquivo:linha | Constante |
|---|---|---|
| 18 | `$APP/src/features/financeiro/recebiveisRede.ts:37` | `FATURAMENTO_ACORDADO_REDE = 154166.66` — piso do acordo comercial. |
| 19 | `$APP/src/features/financeiro/recebiveisRede.ts:44` e `:60` | `TAXAS_REDE` e `TAXAS_REDE_V2` — tabelas inteiras de taxa (débito 0,7%, crédito à vista 1,4%, parcelado 2,68%/3,46%, PIX 0,6% com teto R$1). |
| 20 | `$APP/src/features/financeiro/recebiveisRede.ts:149` e `:160` | `SELIC_ANUAL_REFERENCIA = 0.15` e `TAXA_FIXA_TAD = 0.009` — SELIC congelada em 15% a.a. |
| 21 | `$APP/src/features/financeiro/recebiveisRede.ts:109` | `FERIADOS_BANCARIOS` — Set fixo de datas; feriados de anos futuros não existem. |
| 22 | `$APP/src/features/financeiro/financeiroData.ts:1836-1840` | `finTaxRates` — ISS 2%, PIS 0,65%, COFINS 3%, IRPJ 4,8% (consulta) / 1,2% (tratamento), CSLL 2,88% / 1,08%. |
| 23 | `$APP/src/features/financeiro/financeiroData.ts:2132` | Repasse `PLANO: { amount: 110 }` e `AVULSA: 150` — valores do contrato nutri/psi no código. |
| 24 | `$APP/src/features/financeiro/pdcaData.ts:56` | `PLANO_VALOR_MINIMO = 6997` — preço do plano define a régua de adesão. |
| 25 | `$APP/src/features/financeiro/catalogoPrecificacao.ts:49+` | **Catálogo inteiro** de produtos com preço, lucro bruto, comissão e custo hora-sala (R$ 102,05/h; R$ 1,700787/min) copiado da planilha `.numbers`. Já sofreu 4 commits de recálculo em 13 dias (`7ecf6c8`, `284d86b`, `93890c2`, `edcb2d2`). |
| 26 | `$APP/src/features/financeiro/lucroInteligente.ts:108` | `defaultLucroConfig` — impostos 16,6%, lucro R$ 40.000/mês, médico executor 50%. |
| 27 | `$APP/src/features/crm/crmData.ts:2335` e `:4001` | `REFERRAL_REWARD_VALUE = 500` e o limiar `closedAmount >= 8000`. |
| 28 | `$APP/src/features/financeiro/financeiroData.ts:1533-1534`, `$APP/src/features/financeiro/extratoBanco.ts:331-334` | `TOLERANCIA_FECHAMENTO = 1`, `TAXA_CARTAO_SUSPEITA = 9`, `TAXA_MAQUININHA_MIN/MAX = 0/12`, `TOLERANCIA = 0.02`. |

### Nomes de pessoas amarrados ao código

| # | Arquivo:linha | O que é |
|---|---|---|
| 29 | `$APP/src/features/crm/crmData.ts:1039-1045`, `:457`, `:2622`; `$APP/src/features/crm/repescagemData.ts:287`; `$APP/src/hooks/useAuth.tsx:32`; `$APP/src/features/financeiro/ResumoFechamentoCard.tsx:292`; `$APP/src/features/pops/popsData.ts:566` | Templates assinados por "Aline", frases sobre "Estevão", preview de cargo com nome "Lucas", divisão de lucro rotulada "Andrya", responsável de POP "Andrya Bratan". Trocar uma pessoa de função exige deploy. |

### Risco técnico específico (merece verificação)

| # | Arquivo:linha | O que é |
|---|---|---|
| 30 | `$APP/src/features/financeiro/pdfTexto.ts:8-9` vs `$APP/vercel.json` | O leitor de PDF faz `import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs")` e aponta o worker para a mesma CDN. A CSP de produção é `script-src 'self'` e `connect-src 'self' https://*.supabase.co` — **ambos bloqueiam a cdnjs**. Em produção, soltar um PDF em "Lançar rápido" ou na "Caixa de entrada" provavelmente cai no fallback "cole o texto do boleto". Vale testar no ambiente publicado. |

### Dívida estrutural do repositório (bônus)

- Arquivos de build versionados: `$APP/vite.config.js`, `$APP/vite.config.d.ts`, `$APP/tailwind.config.js`, `$APP/tailwind.config.d.ts`, `$APP/tsconfig.tsbuildinfo`, `$APP/tsconfig.node.tsbuildinfo` — **três** tailwind configs coexistindo.
- `$APP/netlify.toml` morto (deploy é Vercel). `$APP/vite.single.config.ts` + `$APP/dist-single/` órfãos.
- `$APP/src/features/placeholders/PlaceholderPage.tsx` — componente **não importado por ninguém** (dead code).
- Duplicação de domínio: dois módulos NPS (`$APP/src/features/concierge/npsData.ts` e `$APP/src/features/inteligencia360/npsData.ts`) e duas lógicas de resgate (`resgateData.ts` e `repescagemData.ts`) com faixas quase idênticas.
- Migrations do Obsidian criadas (`202606240017`) e removidas (`202607060001`) — schema morto no histórico.
- Inconsistência de modelo IA: `claude-opus-4-8` na função, `claude-haiku-4-5` no script de setup.
- `$APP/.env.local.swp` (swap do vim) parado no diretório desde junho.

---

## 8. TAMANHO

### Totais

| Métrica | Valor |
|---|---|
| Arquivos `.ts` + `.tsx` em `src` | **155** |
| Linhas em `src` (ts/tsx) | **64.727** |
| CSS (`$APP/src/styles/globals.css`) | 346 |
| Testes | 63 arquivos, 11.574 linhas, 642 casos |
| Migrations SQL | 69 arquivos |
| Edge Functions | 3 |
| Assets de POP (`$APP/public/fluxogramas`) | 31 arquivos (PNG + PDF) |

### Distribuição por pasta

| Pasta | Arquivos | Linhas | % |
|---|---|---|---|
| `$APP/src/features/financeiro` | 45 | 19.746 | 30,5% |
| `$APP/src/features/crm` | 25 | 14.104 | 21,8% |
| `$APP/src/lib` | 14 | 7.384 | 11,4% |
| `$APP/src/features/admin` | 8 | 3.851 | 5,9% |
| `$APP/src/features/inteligencia360` | 4 | 3.739 | 5,8% |
| `$APP/src/components` | 24 | 2.286 | 3,5% |
| `$APP/src/features/pagamentos` | 2 | 1.516 | 2,3% |
| `$APP/src/features/estalecas` | 2 | 1.555 | 2,4% |
| `$APP/src/features/estoque` | 3 | 1.434 | 2,2% |
| `$APP/src/features/programa` | 2 | 1.137 | 1,8% |
| `$APP/src/features/pops` | 2 | 1.108 | 1,7% |
| `$APP/src/features/comprovantes` | 2 | 1.061 | 1,6% |
| `$APP/src/features/marketing` | 1 | 932 | 1,4% |
| `$APP/src/features/concierge` | 2 | 830 | 1,3% |
| `$APP/src/features/home` | 1 | 802 | 1,2% |
| `$APP/src/layouts` | 1 | 615 | 0,9% |
| `$APP/src/features/checklist` | 2 | 614 | 0,9% |
| `$APP/src/types` | 1 | 534 | 0,8% |
| demais (`hooks`, `routes`, `perfil`, `mural`, `almoco`, `placeholders`) | 10 | 1.279 | 2,0% |

**Financeiro + CRM = 52% do código.**

### Os 15 maiores arquivos

| # | Arquivo | Linhas | Leitura |
|---|---|---|---|
| 1 | `$APP/src/lib/remoteData.ts` | **5.078** | God module de acesso a dados: ~140 funções para todas as tabelas. Candidato nº1 a quebrar em `remoteData/financeiro.ts`, `remoteData/crm.ts`, `remoteData/estalecas.ts`… |
| 2 | `$APP/src/features/crm/crmData.ts` | **4.693** | Motor + catálogo + templates + pipeline num arquivo só. Separar catálogo (dados), motor de cadência, motor de jornada e serialização. |
| 3 | `$APP/src/features/crm/CrmKanbanPage.tsx` | **2.789** | A tela mais pesada do app: kanban + jornada + abas de cadência + repescagem + fechamento + import Feegow + tour. **Prioridade máxima de modularização.** |
| 4 | `$APP/src/features/financeiro/financeiroData.ts` | **2.559** | Domínio financeiro inteiro: tipos, P12, impostos, repasses, conferência, provisões, recorrências. |
| 5 | `$APP/src/features/inteligencia360/Inteligencia360Page.tsx` | **2.172** | Dashboard + 10 módulos + formulários num arquivo. Cada módulo deveria ser um arquivo. |
| 6 | `$APP/src/features/admin/EstalecasAdminPage.tsx` | **1.847** | Aprovações + códigos + prêmios + ajustes + ranking. |
| 7 | `$APP/src/features/financeiro/FinanceiroContasPage.tsx` | **1.311** | Fila do Dia + Lançar Rápido + Caixa de Entrada + planilha do mês. |
| 8 | `$APP/src/features/financeiro/FinanceiroLucroPage.tsx` | **1.202** | Régua + envelopes + transferências + conferência Rede + histórico 3 meses. |
| 9 | `$APP/src/features/inteligencia360/inteligencia360Data.ts` | **1.001** | Estado + tipos + derivações do 360. |
| 10 | `$APP/src/features/financeiro/lucroInteligente.ts` | **996** | Motor Profit First (denso, mas coeso e testado). |
| 11 | `$APP/src/features/pagamentos/PagamentosPage.tsx` | **989** | Lembretes + recebimento + estorno + vínculo com comanda. |
| 12 | `$APP/src/features/financeiro/FinanceiroLancarDiaPage.tsx` | **938** | Comanda digital completa. |
| 13 | `$APP/src/features/marketing/MarketingPage.tsx` | **932** | Upload + IA + plano + calendário de peças + edição manual. |
| 14 | `$APP/src/features/estoque/EstoquePage.tsx` | **898** | Dois setores + lotes + contagem + chegadas + relatórios. |
| 15 | `$APP/src/features/financeiro/FinanceiroPainelPage.tsx` | **876** | Painel do Mês com 6 blocos de reunião. |

**Padrão que salta aos olhos:** o projeto separa muito bem **motor** (puro, testado, pequeno-médio) de **tela** (React, gigante, sem teste). Os 8 maiores arquivos somam 22.651 linhas — 35% do `src` em 5% dos arquivos. É exatamente aí que um redesenho de produto tem mais alavanca: quebrar `CrmKanbanPage`, `Inteligencia360Page`, `FinanceiroContasPage` e `EstalecasAdminPage` em subcomponentes por bloco, e fatiar `remoteData.ts` por domínio.