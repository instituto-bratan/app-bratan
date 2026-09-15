Tenho material suficiente para fechar o relatório: mais de 30 buscas e cerca de 70 páginas/PDFs lidos, incluindo o texto integral das resoluções CFM 2.454/2026 e 2.336/2023. Algumas fontes ficaram inacessíveis (gov.br fora do ar pela lei eleitoral, NEJM/HBR/PubMed com paywall ou bloqueio, Semantic Scholar com rate limit) — sinalizo isso ao longo do texto. Segue o relatório.

---

# Inovações em gestão de clínicas médicas privadas de alto padrão (2025–2026)
### Relatório de pesquisa para uma clínica de medicina de precisão, saúde hormonal, emagrecimento com tirzepatida e planos de acompanhamento de 6 meses (São Paulo) — com app próprio React + Supabase

*Data da pesquisa: 14/09/2026. Idioma das fontes: português e inglês. Citações no formato [n] remetem à lista de fontes ao final, com URL e data.*

---

## Sumário executivo (o que importa em 10 linhas)

1. **O mercado premium virou "membership".** Function Health (US$ 365/ano, 200 mil+ membros, US$ 2,5 bi de valuation), Superpower (US$ 349/ano desde 01/09/2026), Biograph (US$ 7.500–15.000/ano), Fountain Life (US$ 595 a US$ 21.500/ano) e a concierge medicine (mediana US$ 3.200–3.500/ano, fees subindo 8,4% a.a.) convergem para **entrada barata + upsell de diagnóstico e acompanhamento contínuo** [1–9, 18–20].
2. **GLP-1 é um negócio de retenção, não de prescrição.** 30% abandonam no 1º mês, ~80% em 12 meses no mercado geral; serviços digitais bem estruturados retêm 84% em 24 semanas (Omada) e pacientes engajados perdem 22,9% vs. 17,5% do peso [13–17]. O plano de 6 meses da clínica é exatamente o produto certo — o risco está no **onboarding dos dias 0–30** e na **renovação em D150–D180**.
3. **Benchmarks de retenção que valem para plano de alto ticket:** concierge saudável retém 94–97% ao ano; abaixo de 92% a matemática do membership "quebra em 3 anos"; indicações geram 30–50% dos novos membros a CAC quase zero; eventos trimestrais somam +2–4 p.p. de retenção [18].
4. **No Brasil, os softwares de clínica entraram na era dos agentes:** Clinicorp lançou agentes de IA que confirmam, reagendam faltas, cobram inadimplentes e retomam orçamentos (R$ 299/mês; 30 mil clínicas; Clinipay com R$ 10 bi de TPV em 2025) [33, 34]; Doctoralia tem Noa Notes (escriba em PT-BR, 7 mil médicos no Brasil em nov/2025) e Noa Evidence [35, 36]; Amplimed tem o trio Amélia (agendamento, transcrição, copilot) [39]; HiDoctor e Conclínica já vendem transcrição de consulta [41].
5. **A evidência de escriba ambiente é real, mas modesta:** RCT no NEJM AI (238 médicos) mostrou –9,5% de tempo de documentação com Nabla e redução de burnout; estudo prospectivo mostrou –21% (13,6 min/dia) e 84% das notas precisando de edição mínima [46].
6. **A regulação chegou e já está em vigor:** Resolução CFM 2.454/2026 (IA na medicina, vigente desde 26/08/2026) obriga informar o paciente, registrar no prontuário o uso de IA como apoio, proíbe delegar à IA a comunicação de diagnóstico e exige governança de quem contrata IA; classifica agendamento/chatbots informativos como baixo risco [49]. ANPD virou agência reguladora (Lei 15.352/2026) e prometeu 10 fiscalizações em dados de saúde até o fim de 2026 [50].
7. **Prazo regulatório iminente:** receituário controlado 100% digital via SNCR até **30/09/2026** (RDC Anvisa 1.000/2025) — tirzepatida/semaglutida são receitas com retenção (assinatura avançada aceita); Memed aguarda liberação [52].
8. **Publicidade médica (CFM 2.336/2023) permite preço e desconto em campanha, mas veda "premiações" e vendas casadas** — o voucher de indicação condicionado a fechamento merece revisão de redação [51].
9. **Soroterapia e implantes hormonais estão sob cerco:** CRM-PR publicou a Resolução 260/2026 (21/08/2026) endurecendo soroterapia e proibindo promessas de antienvelhecimento/detox; CFM 2.333/2023 veda terapia hormonal para estética e "modulação hormonal" sem deficiência comprovada [53, 54].
10. **No-show no Brasil roda em 20–30% em consultórios; bem gerido fica em 5–12%.** Confirmação em dois toques por WhatsApp (48h e 2h) reduz faltas em 40–70%; modelos de ML capturam ~60% dos no-shows nos 20% de maior risco [27, 28, 48].

---

## Método e limitações

- 30+ consultas de busca e ~70 páginas/PDFs lidos entre 14/09/2026 (manhã) e a redação. Textos integrais das resoluções CFM 2.454/2026 e 2.336/2023 foram extraídos dos PDFs oficiais do CFM.
- **Inacessíveis:** páginas gov.br/Agência Gov (indisponíveis "em razão da legislação eleitoral"), NEJM Catalyst, HBR (paywall), PubMed/PMC (bloqueio), planalto.gov.br (conexão recusada) e o relatório da Bain sobre NPS em saúde (não localizado). Onde recorri a conhecimento geral, sinalizo com **(verificar)**.
- Preços e números de fornecedores são os publicados nas próprias páginas e podem mudar.

---

## 1. Modelos de negócio e jornada do paciente que estão vencendo em 2026

### 1.1 Longevidade e medicina de precisão "as a service"

| Player | Preço (2026) | O que vende | Lição para a clínica |
|---|---|---|---|
| **Function Health** [1–3, 61] | US$ 365/ano (caiu de US$ 499); MRI de corpo inteiro US$ 499 após comprar a Ezra (mai/2025) | 160+ exames em 2 coletas/ano, painel com IA, "Protocols" (dados → passos de ação), chat privado com IA sobre os próprios dados; 50 mi+ exames desde 2023; 200 mil+ membros | Preço de entrada baixo, alta frequência de contato com dados, upsell de imagem. O "plano de ação em linguagem simples" é a feature mais copiável |
| **Superpower** [4–6] | US$ 199 (ago/2025) → US$ 349/ano (01/09/2026), 2 coletas incluídas | 100+ biomarcadores, app, "concierge-level" | Testou preço para baixo e subiu quando encaixou a 2ª coleta: o **valor percebido está no acompanhamento, não no exame** |
| **Biograph** (Peter Attia) [7] | Core US$ 7.500/ano (avaliação única); Black US$ 15.000/ano (acompanhamento contínuo, especialistas, monitoramento em casa) | Risco de câncer, cardiovascular, neurodegenerativo e metabólico | Dois tiers: **avaliação profunda** vs. **acompanhamento contínuo** — mesma lógica de "consulta + plano" |
| **Fountain Life** [8, 9] | BASE US$ 595 (2026, com DEXA), CORE US$ 2.995 (exames trimestrais + consultas), APEX US$ 19.500–21.500 (MRI, angio-TC) | Clínicas em NY, FL, TX | Escada de 3 degraus com **ritmo trimestral** no meio |
| **Concierge medicine (EUA)** [18–20] | Mediana US$ 3.200–3.500/ano; fees +8,4% em 2026; 58% dos novos contratos são mensais (US$ 250–400/mês) | Acesso direto ao médico, consultas de 30–60 min, mesmo dia/dia seguinte, telemedicina ilimitada | Painéis pequenos (150–500 pacientes) sustentam US$ 0,9–3,6 mi/ano por médico |

**Números de referência do Macbach 2026 Concierge Benchmark Report (mai/2026; 15 meses de observação)** [18]:
- Retenção anual saudável **94–97%**; abaixo de 92% "a matemática se deteriora em 3 anos"; abaixo de 90% o churn supera a aquisição.
- CAC mediano US$ 650–1.800 por membro; regra: **CAC < 30% do fee do 1º ano**; payback no 1º ciclo anual; LTV:CAC de 8:1 a 30:1.
- Mix de aquisição: **indicação de membros 30–50%** (CAC US$ 0–200), busca orgânica 15–30%, Maps 10–20%, mídia paga 10–20% (CAC US$ 1.200–3.500).
- Receita recorrente = 75–90% da receita total; eventos trimestrais para membros = **+2–4 p.p. de retenção**; janela de consideração 3–9 meses e 8–15 visitas ao site antes de assinar.

**Alerta de modelo:** a Forward (clínica "tech-first" com CarePods, membership de ~US$ 149/mês, ~US$ 650 mi captados) encerrou operações em novembro de 2024 — caso clássico de tecnologia cara à frente de demanda recorrente (**verificar**; não consegui abrir a matéria original).

### 1.2 Clínicas de GLP-1: preço, adesão, acompanhamento, recompra

**Como Ro, Hims e Found estruturam (2026)** [10–12]:
- **Membership separada da medicação**: Ro cobra US$ 39 no 1º mês e US$ 149/mês depois (ou US$ 888/ano), sem remédio; medicação à parte (Zepbound a partir de US$ 299 via LillyDirect). Hims lista Zepbound a US$ 1.899/mês e desde 09/03/2026 não anuncia mais compostos na plataforma. Found: US$ 99–149/mês de membership, cobrança a cada 4 semanas (13 cobranças/ano), reembolso integral só em 3 dias ou antes da 1ª consulta.
- **O que a membership entrega**: Ro — até 24 consultas/ano, mensagens ilimitadas, laboratório incluso, "concierge de seguro", coaching e currículo educacional, check-in mensal com ajuste de dose; Hims — equipe 24/7, guia nutricional, app com trackers e **ondansetrona sem custo** (antiemético para a fase de titulação).
- Cancelamento com 48h de antecedência da renovação; renovação automática.

**O que a evidência diz sobre abandono (2025–2026)** [13–17]:
- No mundo real, ~50% dos diabéticos e **~80% dos pacientes com obesidade sem diabetes descontinuam em 12 meses**; 26,2% em 3 meses e 30,8% em 6 meses; 58% param antes de benefício clinicamente significativo; **30% param no 1º mês** [13, 14].
- Causas: efeitos GI nas primeiras semanas, custo, expectativa de perda linear e **fricção operacional** (refill perdido, check-in complicado, resposta lenta) [13].
- Serviço digital britânico com tirzepatida (Healthcare, 2025): apenas **27% aderentes aos 12 meses**; aderentes perderam 22,6% vs. 13,6% da coorte; **rastreamento semanal de peso e conversa com o coach foram os maiores preditores** — e o hiperengajamento inicial (pesagem diária intensa) previu abandono. Recomendação: "ritmo comportamental moderado" [16].
- JMIR 2025 (126.553 pacientes com tirzepatida): engajados perderam –22,9% vs. –17,5% (+5,3 p.p.) [17].
- Omada (dados da empresa): 94% de retenção em 12 semanas e 84% em 24 semanas, com –12,1% de peso nos que persistiram [15].
- Playbook de retenção em 4 pilares (Propel, 03/07/2026): **onboarding dias 0–30** (expectativas, treino de aplicação, antecipar efeitos GI), **aderência dias 30–90** (lembretes de titulação, check-in de sintomas, reframing do progresso), **orquestração de refill** e **reativação** de quem pausou [13].

### 1.3 Brasil: tirzepatida, longevidade e o comparador local

- Mounjaro: **6 doses disponíveis desde março/2026** (2,5 a 15 mg), R$ 1.400–2.300 por caixa nas redes (CMED R$ 1.523–4.068); custo anual pode superar R$ 20 mil; planos de saúde não cobrem [23, 24]. Clínicas paulistanas (Phorma, Bellit) posicionam-se como **"não vendemos medicação; vendemos avaliação, exames e monitoramento"**, com retornos a cada 4–8 semanas e foco em preservar massa magra [23, 24].
- Manipulados: R$ 200–600/mês (50–75% mais barato), apontados como alternativa em guias de telemedicina [25] — risco ético/regulatório para quem prescreve (ver §7).
- **Longevitar (SP)** vende "Protocolos de Longevidade por assinatura" de 2 a 12 meses, R$ 12 mi investidos e R$ 20 mi projetados [21]. Age & Health organiza programas por década de vida (20/40/60+) com "avaliação 360°" [22]. Voy Saúde e Regimen fazem marketing de conteúdo com guias de preço de GLP-1 e apps de lembrete de dose (Regimen: freemium, integração Apple Health) [25, 26].
- **Alice** como referência de operação: "meu médico Alice" + time de saúde, coordenação de cuidado, **renovação de 96%**, churn de 2,5% no 1º semestre de 2025, sinistralidade 53% (mercado 85%+), meta de R$ 1 bi em 2026 [43]. Dr. Consulta lançou planos após comprar participação na cuidar.me [62].

### 1.4 O que adaptar para uma clínica de 1 médico titular em São Paulo

1. **Tratar o plano de 6 meses (~R$ 7 mil) como um "membership de ciclo"**: onboarding 0–30 dias com toques da enfermagem em D3, D7, D14 e D30 (o mês 1 concentra 30% do abandono), check-in clínico a cada 4 semanas (padrão Ro), renovação trabalhada em D150–D180 com relatório de resultados.
2. **Escada de 3 degraus** (inspirada em Fountain Life/Biograph): (a) avaliação de precisão avulsa; (b) plano de 6 meses; (c) "manutenção" recorrente pós-ciclo (mensal, valor menor, com pesagem/bioimpedância e ajuste) — reduz o abismo pós-D180.
3. **Comunidade**: evento trimestral para pacientes ativos e ex-pacientes (+2–4 p.p. de retenção; canal de indicação a CAC zero) [18].
4. **Kit de titulação** (educação + antiemético prescrito quando indicado, como faz a Hims) para não perder o paciente na náusea da semana 2.
5. **Meta de retenção explícita**: ≥ 92% de conclusão do ciclo e ≥ 40% de recompra (ver KPIs no §2).

---

## 2. Métricas e gestão

### 2.1 KPIs e benchmarks publicados

| KPI | Benchmark encontrado | Fonte |
|---|---|---|
| No-show | Brasil: 20–30% em consultórios; 10–30% geral; bem gerido 5–12%; endocrinologia ~14%; >20% "compromete a receita de forma estruturada" | [27, 28] |
| Redução com confirmação WhatsApp | 40–70% (48h + 2h antes); TuoTempo reporta –50% de absenteísmo e –80% de carga no call center; Amplimed: –38% | [28, 42, 39] |
| Ocupação da agenda/sala | Saudável 75–85% | [29, 30] |
| Conversão consulta → tratamento (estética médica) | 40–60% saudável; medir em 2 etapas (lead→avaliação, avaliação→venda) | [30, 31] |
| Retenção/recompra | Estética: >70%; concierge: 94–97%/ano; <92% = zona de perigo | [30, 18] |
| CAC | Concierge US$ 650–1.800 (<30% do fee anual); estética BR: LTV:CAC ≥ 3:1 | [18, 30] |
| Indicação como fonte | 30–50% dos novos membros | [18] |
| NPS em saúde | Média 65 (CustomerGauge 2026); hospitais 35–45; >70 excepcional; Prontmed publica NPS 65 | [57, 41] |
| Tempo de resposta a lead | Responder em <1h = ~7x mais qualificação do que 1h depois e ~60x mais do que 24h (Oldroyd/McElheran/Elkington, HBR 2011 — números do estudo, artigo em paywall) | [60] |
| Churn de plano GLP-1 | 30% no mês 1; ~80% em 12 meses (mercado); 84% retidos em 24 semanas em programa estruturado | [13–15] |
| Ticket | Concierge mediana US$ 3.200–3.500/ano; Biograph US$ 7.500; a clínica opera R$ 7–9 mil por plano | [18, 19] |

Para a sua escala (40–70 comandas/mês), sugiro um **painel semanal de 8 números**: leads respondidos em <5 min (%), avaliações agendadas, comparecimento, conversão avaliação→plano, ticket, ocupação de sala (h vendidas/h disponíveis), pacientes ativos em plano por fase (D0–30 / D31–90 / D91–180) e NPS transacional.

### 2.2 Softwares de gestão de clínica no Brasil — o que lançaram em 2025–2026

| Software | Novidades 2025–2026 (publicadas) | Preço público |
|---|---|---|
| **Clinicorp** (odonto-first, 30 mil clínicas, ARR ~R$ 100 mi) | **Agentes Clinicorp IA** (fev/2026): confirmar consultas, reagendar faltas, recuperar inadimplência, retomar orçamentos, qualificar leads, 24h; BI por chat; Voice Control na consulta; Clinipay (R$ 10 bi TPV em 2025, baixa automática); app Clini.me; totem/check-in por QR; NPS integrado; CRC com alertas de retorno | IA R$ 299/mês sem fidelidade [33, 34] |
| **Doctoralia / Feegow / TuoTempo** (Docplanner) | **Noa Notes** (escriba PT-BR; 7 mil médicos e 200 mil consultas no Brasil em nov/2025; relato de urologista: de 13 para 20 consultas/dia); **Noa Evidence** (síntese de evidência, gratuito); Feegow Starter R$ 129 / Plus R$ 199 / VIP R$ 249 por profissional (Noa Notes no VIP); TuoTempo com assistente de voz e WhatsApp | [35–38, 42] |
| **Amplimed** (70 mil profissionais) | Trio **Amélia**: Agendamento (WhatsApp 24h), Transcrição (áudio → prontuário estruturado com revisão médica), Copilot (localiza/resume dados do paciente); totem de autoatendimento, painel de chamadas, pagamento por link, NPS, "repasse profissional automatizado" | não publicado [39] |
| **iClinic** (Afya) | Site não detalha IA; análise de abr/2026 aponta preços não divulgados e 70% de resolução de reclamações; **iClinic Rx aguarda API do SNCR** | não publicado [40, 52] |
| **HiDoctor** (75 mil profissionais) | "IA para transcrever consultas" que sugere perguntas e exames; app do paciente MedBook; WhatsApp | não publicado [41] |
| **Conclínica** | Prontuário com IA (conversa → documentação estruturada); **cobrança recorrente automática** (boleto/cartão/Pix); NFS-e integrada | Plano Gestão R$ 119/profissional [41] |
| **Shosp** (5 mil profissionais) | Conciliação bancária, **distribuição de honorários (fee split)**, Flex BI, pesquisas de satisfação, classificação de pacientes para retenção | não publicado [41] |
| **Prontmed** | Portal do paciente (app), conexão com laboratórios, NPS 65 publicado | não publicado [41] |
| **Ninsaúde Clinic** | Check-in por QR, Ninsaúde Pay, conciliação bancária, **API aberta**, IA de apoio diagnóstico (224Scan/Houdini), automação de marketing | não publicado [41] |
| **Carecode** (healthtech, 50+ clínicas) | Comando de voz e assistência contextual em produção; transcrição "amadurece em 2026–27"; ganho medido de 30–45 min/dia | [44] |

**Leitura para quem tem app próprio:** o que os incumbentes estão vendendo em 2026 são (a) **agentes que fecham o loop** (confirmar → reagendar → cobrar → retomar orçamento), (b) **escriba em PT-BR**, (c) **pagamento com baixa automática** e (d) **check-in por QR**. Nenhum deles entrega, nativamente, um plano de acompanhamento de 6 meses com semáforo de adesão — isso é diferencial possível do app.

---

## 3. IA na clínica

### 3.1 Escriba / documentação ambiente em português

- **Disponíveis em PT-BR hoje:** Noa Notes (Doctoralia, funciona sobre qualquer prontuário, sem app, LGPD; não transcreve tudo — resume o clinicamente relevante) [35]; Amélia Transcrição (Amplimed) [39]; HiDoctor e Conclínica [41]; Clinicorp Voice Control [34]. Heidi diz transcrever em 100+ idiomas e Nabla se apresenta como multilíngue (85 mil clínicos, 130+ organizações), mas **nenhuma das duas publica suporte explícito a português brasileiro** nas páginas visitadas [45]. Sobre Dragon Copilot (Microsoft/Nuance) em PT-BR não encontrei confirmação pública.
- **Evidência (2025–2026)** [46]: RCT NEJM AI com 238 médicos de 14 especialidades — Nabla reduziu tempo de documentação em 9,5% (p=0,02), DAX em 1,7% (n.s.); burnout (Mini-Z) melhorou e exaustão caiu. RCT stepped-wedge (66 profissionais): –0,36 h/dia, exaustão –0,44. Estudo prospectivo (79 profissionais, 23 especialidades): –21% de tempo (13,6 min/dia), "pajama time" –13%, **49,4% sem sintomas de burnout vs. 7,6% antes**, 84% das notas com edição mínima. Nabla reporta 55% dos usuários economizando 1h+/dia e 1,5x mais pacientes/mês (dado da empresa) [45].
- **Regra brasileira**: pela CFM 2.454/2026, o médico deve **registrar no prontuário o uso de IA como apoio** (art. 4º, V), **informar o paciente** quando a IA for apoio relevante (art. 5º, §1º) e respeitar a **recusa informada** (§3º); escribas caem em "médio risco" (apoiam decisão, com supervisão humana); a nota é sempre revisada e assinada pelo médico [49].

### 3.2 Pré-consulta por IA (anamnese via WhatsApp)

- Clinia (IA no WhatsApp para clínicas) reporta **84,9% das conversas resolvidas 100% pela IA** e 74,5% dos novos clientes agendando exames [47]. Amélia Agendamento e os agentes Clinicorp fazem triagem administrativa [39, 34]. Alma registra dúvidas clínicas e **escala para a equipe sem dar aconselhamento** [47] — exatamente o desenho que a CFM 2.454 trata como baixo risco ("chatbots fornecendo informações gerais de saúde, sem personalizar aconselhamento clínico") [49].
- Aplicação prática: questionário estruturado (motivo, medicações, alergias, histórico de peso, metas, fotos de exames) coletado no WhatsApp 48h antes, organizado por IA em rascunho de anamnese para o médico revisar. Nenhuma "interpretação" chega ao paciente.

### 3.3 Pós-consulta

- Heidi e Dragon Copilot geram **resumo para o paciente**; Freed/Nabla/Suki/Abridge geram instruções ao paciente [45]. No Brasil não encontrei fornecedor com "resumo para o paciente em PT-BR" pronto — é lacuna e oportunidade para o app, desde que o texto seja **revisado e enviado pelo médico** (CFM 2.454, art. 5º, §2º veda delegar à IA a comunicação de diagnóstico/prognóstico/decisão terapêutica) [49].

### 3.4 Previsão de no-show e churn

- Revisão de 52 estudos (2010–2025): regressão logística em 68% dos trabalhos, desempenho de 52% a 99%; variáveis-chave são histórico de faltas, lead time do agendamento, idade e canal [48]. Estudo de 2026 em ortopedia: modelo calibrado captura **~60% dos no-shows nos 20% de maior risco**; estudo de 2026 em RM testou **ligação direcionada aos de alto risco** com redução de faltas (abstract inacessível) [48].
- Para 40–70 comandas/mês, um modelo estatístico próprio terá pouca amostra; **regras simples** (faltou antes, agendou com >14 dias, 1ª consulta, não respondeu à confirmação de 48h) já ordenam bem o risco. Churn de plano: use os preditores do estudo britânico — **pesagem semanal e resposta ao coach** [16].

### 3.5 Agendamento inteligente, ocupação e "yield"

- Os incumbentes atacam a ocupação com lista de espera ativa, reagendamento automático de faltas (Clinicorp) e assistente de voz que agenda fora do horário (Galdur: "8 em cada 10 ligações fora do horário viraram agendamento" em piloto; planos R$ 197–997/mês) [34, 47].
- **Precificação dinâmica em saúde**: não encontrei evidência publicada de clínicas privadas praticando yield por horário em 2025–2026. O limite ético no Brasil: a CFM 2.336/2023 **permite anunciar valores e "abatimentos e descontos em campanhas promocionais"**, mas **proíbe vinculá-los a vendas casadas e premiações** (art. 9º, VIII) [51]. Portanto, "condições diferenciadas em janelas de menor demanda" são possíveis; "leilão de horário" ou "preço surge" seriam frágeis eticamente. Classifico como **especulativo**.

### 3.6 "AI receptionist" por voz/WhatsApp

- Oferta brasileira madura em 2026: Alma (WhatsApp 24h, API oficial Meta, LGPD, 15 dias grátis, sem taxa de setup), Galdur Voz (voz em PT-BR, agenda + confirmação por WhatsApp, integrações Clinicorp/RD/Kommo "quando disponível"), Interaflow (telefone + WhatsApp), TW Solutions (IA sobre PABX), Clinia [47]. Nenhuma publica métricas auditadas de conversão; Galdur e Clinia publicam números de piloto.

### 3.7 Riscos regulatórios (CFM e ANPD) — resumo operacional

- **CFM 2.454/2026** (DOU 27/02/2026; vigência 26/08/2026) [49]: IA é apoio; médico é responsável final (arts. 4º e 7º); registrar uso no prontuário; informar o paciente e aceitar recusa; vedado delegar comunicação de diagnóstico/prognóstico; quem **contrata** IA deve ter processos de governança (art. 14 e Anexo III: transparência, monitoramento de viés, **Diretor Técnico responsável**, preferência por soluções auditáveis e com API); classificar risco (Anexo II: agendamento e chatbots informativos = baixo; apoio à decisão com supervisão = médio); IA com finalidade publicitária obedece às regras de publicidade (art. 7º, §3º). Fiscalização pelos CRMs.
- **ANPD**: Lei 15.352/2026 (25/02/2026) elevou a ANPD a agência reguladora, com poder de apreender equipamentos e interditar; Resoluções CD/ANPD 30 e 31/2025 fixam **10 ações de fiscalização em dados de saúde, biometria e financeiros até o fim de 2026**; incidentes devem ser comunicados em **3 dias úteis** (Res. 15/2024; 6 dias úteis para pequeno porte); Res. 18/2024 exige encarregado (DPO) **com substituto** e autonomia real; a fiscalização cobra "efetividade prática", não papel [50].

---

## 4. Vendas e retenção em saúde premium

### 4.1 Cadências de follow-up

- Padrão publicado para clínicas brasileiras (MedGM, 08/02/2026): D–1 confirmação; **D+1, D+3, D+7** para orçamento em aberto; D+3 pós-consulta; D+7 pesquisa de satisfação; **90 dias reativação de inativos**; automação de follow-up reduz faltas em ~40% e reativa ~30% [32]. A cadência da clínica (D1·D5·D7·D60) está alinhada; o que a literatura de GLP-1 acrescenta é a **densidade no mês 1** (D3, D7, D14, D30) e um toque em **D150–D180** para renovação [13, 16].
- Tempo de resposta: responder em minutos, não horas; 70% dos primeiros contatos chegam pelo WhatsApp [32, 59].

### 4.2 "Closer" de saúde e scripts

- Não encontrei fonte acadêmica sobre "closer de saúde"; é prática de mercado (cursos e consultorias de gestão médica, ex.: pilares "Multiplicar — consultas orientadas à conversão" e "Potencializar — redes de indicação" do programa do Dr. Thiago Volpi) [56]. O que a evidência de GLP-1 sustenta: o fechamento deve **alinhar expectativa** (curva de peso não linear, efeitos GI na titulação) — desalinhamento é a 3ª causa de abandono [13]. Sugestão: script de fechamento com "as 3 primeiras semanas" explicadas e assinatura do contrato no ato (já feito via SuperSign em 24h).

### 4.3 Indicações e voucher — atenção à CFM 2.336/2023

- Indicação é o canal nº 1 em concierge (30–50%) [18]. Porém a CFM 2.336/2023 permite descontos em campanhas **"sendo proibido vincular as promoções a vendas casadas, premiações e outros que desvirtuem o objetivo final da medicina"** (art. 9º, VIII) e a exposição de motivos cita como vedado "concorra a prêmio se se submeter a tal procedimento" [51]. Um **voucher de R$ 500 liberado quando o indicado fecha/consulta** pode ser lido como "premiação por trazer paciente". Alternativas mais seguras: cortesia clínica não condicionada a compra (ex.: bioimpedância ou consulta de retorno de cortesia para pacientes ativos, sem gatilho de fechamento), agradecimento não financeiro, prioridade de agenda, convite a eventos. Recomendo parecer do CRM-SP/advogado antes de manter o gatilho atual.

### 4.4 Reativação, comunidade, upsell

- Reativação em 1m/3m/6m/1a (já existente como "Repescagens") coincide com o pilar "reativação" do playbook GLP-1 [13]. Comunidade/eventos: +2–4 p.p. de retenção [18]. Upsell natural: nutri e psi já parceiras — a evidência mostra que **suporte nutricional e de estilo de vida melhora persistência** [15, 17]; implantes hormonais só com indicação (ver §7).

### 4.5 Contrato digital no fechamento

- Assinatura eletrônica (Lei 14.063/2020; simples/avançada/qualificada) é válida para contratos privados (**conhecimento geral; verificar**). A RDC 1.000/2025 usa a mesma taxonomia (avançada vs. qualificada) para receitas [52]. Ferramentas: SuperSign (já usado), Clicksign, ZapSign, ou Ninsaúde Sign/Feegow (assinatura digital nos planos Plus+) [37, 41].

### 4.6 CRMs — o que fazem de melhor (2026)

| CRM | Ponto forte | Preço de entrada |
|---|---|---|
| **Kommo** | Melhor integração nativa com WhatsApp e salesbots; indicado "para escalar" | US$ 15/usuário/mês (WhatsApp exige tier avançado) [59, 32] |
| **Clint** | Inbox multiatendente com API oficial WhatsApp, IA de automação no plano de entrada, setup <24h, LGPD | R$ 523/mês (Starter); Growth R$ 800/mês [59] |
| **RD Station CRM** | Ecossistema de marketing (formulários, e-mail, tráfego) | R$ 69–90/mês; WhatsApp em módulo separado [59, 32] |
| **Pipedrive** | Simplicidade, "para começar" | R$ 59+ [32] |
| **HubSpot** | Robusto, Service Hub; custo desproporcional para times pequenos no Brasil | US$ 90/usuário/mês (Pro) [59] |
| **Verticais BR** (Clínica nas Nuvens, Clinicorp CRC, Amplimed) | Funil já ligado à agenda e ao orçamento | R$ 150+ [32, 34] |

Como a clínica já tem CRM próprio (Kanban por cadência, repescagens, coordenador), o benchmark útil é funcional: **inbox WhatsApp oficial multiatendente**, **tags de origem**, **SLA de resposta visível**, **automação de cadência com "fiz o toque"** e **relatório por canal e por consultora**.

---

## 5. Financeiro de clínica

### 5.1 Profit First e "Lucro Inteligente"

- Método Michalowicz [55]: cinco contas (Receita, Lucro, Remuneração do dono, Impostos, Operacional), alocação a cada depósito, **ritmo 10/25**, distribuição trimestral de lucro, percentuais-alvo (TAPs) por faixa de receita. Tabela clássica do livro para "receita real" de US$ 500 mil–1 mi: Lucro 15% / Dono 20% / Impostos 15% / OpEx 50% (**conhecimento geral do livro; verificar edição**). Para o Brasil, a conta "Impostos" precisa refletir Lucro Presumido + ISS (a clínica já usa 16,6% do líquido), e recomendo criar **duas contas extras**: **Provisões** (13º, férias, IRPJ/CSLL trimestral) e **Reserva** (vault de 1–3 meses de despesas fixas).
- Dr. Thiago Volpi (Imersão Médico Empresário; 6 pilares: Decidir, Multiplicar, Potencializar, Formar, Lucrar, Escalar) enfatiza precificação e indicadores financeiros; a página pública não detalha o método de envelopes [56]. Não encontrei publicação brasileira específica de "Profit First para clínicas" com percentuais — o que a clínica já tem (envelopes impostos/lucro/executor/operacional, taxas antes, TAD) está à frente do que o mercado documenta.

### 5.2 Taxa hora-sala e ocupação

- Benchmark de ocupação 75–85% [29, 30]. A clínica calculou custo de sala de R$ 123,15/h com despesas fixas de R$ 97,5 mil/mês e ocupação de ~5% (69 h vendidas de 1.386) — o número mais alavancável do negócio: cada ponto de ocupação vale mais que qualquer corte de custo. Painel diário de horas vendidas × disponíveis por sala é o KPI operacional nº 1.

### 5.3 Contas a pagar, conciliação e repasses em 2026

- Incumbentes: Clinipay faz **baixa automática** de boleto/Pix/cartão e consulta SPC/Serasa [34]; Shosp e Ninsaúde têm **conciliação bancária** e Shosp **distribuição de honorários** [41]; Amplimed automatiza "repasse profissional" [39]; Conclínica cobra recorrência automática [41]. Feegow Pay e iClinic Pay não tinham páginas públicas acessíveis na data.
- Repasses médicos: modelos de fee split (a clínica usa 110/150 e "coluna S" da precificação) exigem trilha: comanda → regra → extrato de repasse → pagamento → conciliação. Sobre "pejotização", o STF suspendeu nacionalmente processos sobre o tema em 2025 (**conhecimento geral; verificar status atual**) — manter contratos PJ com autonomia real e evitar subordinação.
- ERPs financeiros genéricos (Conta Azul, Omie, Nibo, Granatum): não consegui coletar novidades 2026; funcionam como camada contábil/Open Finance, não como gestão clínica.

### 5.4 Reforma tributária (**verificar com o contador**)

- LC 214/2025: **2026 é ano-teste** (CBS 0,9% + IBS 0,1%, compensáveis com PIS/Cofins), CBS substitui PIS/Cofins em 2027, IBS substitui ISS/ICMS gradualmente até 2033; **serviços de saúde têm redução de 60%** das alíquotas; sociedades de profissões regulamentadas têm redução de 30%; Lucro Presumido continua para IRPJ/CSLL. Não consegui abrir o texto legal (planalto/normas.leg.br indisponíveis), portanto trate como orientação a confirmar.

---

## 6. Experiência do paciente

- **Check-in digital/totem**: Clinicorp (QR Code), Ninsaúde (QR), Amplimed (totem + painel de chamadas), TuoTempo (check-in, app, questionários; –50% absenteísmo; –80% carga de call center) [34, 39, 41, 42]. Padrão 2026: o paciente confirma dados cadastrais e consentimentos no próprio check-in.
- **App do paciente**: Clini.me (Clinicorp), MedBook (HiDoctor), portal Prontmed, app TuoTempo, Function/Superpower com painel de biomarcadores e "Protocols" [1, 34, 41, 42]. O diferencial dos players de longevidade é **traduzir dado em ação** ("o que fazer até a próxima coleta").
- **Telemonitoramento**: InBody LookinBody Web sincroniza bioimpedância na nuvem, com app do paciente e relatórios de massa muscular/gordura/visceral — a página cita explicitamente **GLP-1** (distinguir perda de gordura de perda de músculo) [58]. Withings Health Solutions (balança celular Body Pro 2) não pôde ser acessada (403). CGM sem prescrição: Stelo (Dexcom) US$ 89/mês, sensor de ~15 dias, para não usuários de insulina; sem indicação de disponibilidade fora dos EUA [58]. No Brasil, FreeStyle Libre é o sensor disponível (**conhecimento geral**).
- **Gamificação/adesão**: o estudo britânico alerta que **hiperengajamento inicial prevê abandono** — gamificação deve premiar constância moderada (1 pesagem/semana, 1 resposta ao coach), não streaks diários [16].
- **NPS/CSAT/CES**: média setorial 65 (CustomerGauge 2026), hospitais 35–45, >70 excepcional; medir trimestralmente ou após interações-chave [57]. Não localizei relatório Bain 2025–2026 específico de saúde. Customer Effort Score (Dixon/Freeman/Toman, HBR 2010): reduzir esforço pesa mais para lealdade do que "encantar" [60] — para a clínica, esforço = quantos toques o paciente precisa dar para reagendar, pegar exame, pagar.

---

## 7. Compliance e proteção

### 7.1 LGPD saúde (ANPD 2025–2026) [50]
- ANPD como agência reguladora (Lei 15.352/2026); 10 fiscalizações em saúde até fim de 2026; incidentes em 3 dias úteis (6 para pequeno porte); DPO nomeado, publicado e com substituto (Res. 18/2024); RIPD atualizado para tratamentos de alto risco; contratos com fornecedores (Supabase, WhatsApp API, escriba) com cláusulas de segurança; base legal do art. 11 (tutela da saúde) para o clínico e **consentimento específico** para marketing/imagem/IA.

### 7.2 Publicidade médica — CFM 2.336/2023 [51]
- **Permitido**: valores de consulta, meios de pagamento (art. 9º, VI–VII); descontos em campanhas (VIII, sem venda casada/premiação); mostrar ambiente e equipamentos com registro Anvisa (IX); anunciar serviços de nutri/psi executando a prescrição, **registrando em prontuário** (III); selfies sem sensacionalismo (art. 8º, III).
- **Antes e depois e depoimentos** (art. 14): só com texto educativo, indicações, fatores de resultado e complicações; conjunto com evoluções satisfatórias, **insatisfatórias e complicações**; sem edição de imagem; anonimato; depoimentos "sóbrios, sem adjetivos que denotem superioridade ou induzam promessa de resultado".
- **Vedado** (art. 11): divulgar método não reconhecido pelo CFM, medicamento/equipamento sem registro Anvisa, garantia de resultado, consórcio.

### 7.3 IA — CFM 2.454/2026 [49]: ver §3.7. Checklist mínimo para a clínica: inventário de sistemas de IA com classificação de risco; aviso e opção de recusa no termo de atendimento; registro automático no prontuário ("nota apoiada por IA, revisada pelo médico"); Diretor Técnico como responsável; contrato com fornecedor cobrindo LGPD e auditabilidade.

### 7.4 Notas fiscais e "recibo para reembolso" (**orientação geral; verificar**)
- Emitir NFS-e por serviço efetivamente prestado, no CPF do paciente, com descrição e data reais; nunca fracionar ou antecipar para caber em cobertura; sinal não gera nota (regra já adotada). Operadoras e Justiça vêm combatendo "reembolso assistido" e notas frias desde 2023 — a clínica deve fornecer documento fiel e deixar o pedido de reembolso ao paciente.

### 7.5 Contratos de tratamento e desistência (CDC) (**orientação geral; verificar com advogado**)
- Direito de arrependimento de 7 dias quando a contratação ocorre fora do estabelecimento (WhatsApp/online) — art. 49; cláusulas de multa devem ser proporcionais (art. 51); informação clara sobre o que é reembolsável (medicação aplicada e consultas realizadas não são); política de remarcação/no-show transparente (a literatura de no-show recomenda regras claras, com cobrança de falta como tática secundária) [28].

### 7.6 Receitas controladas digitais — SNCR [52]
- RDC Anvisa 1.000/2025 (DOU 15/12/2025): receitas de controlados **nativas digitais**, numeração nacional única via API do **SNCR**; **assinatura qualificada ICP-Brasil** para Notificações de Receita (A/B) e Controle Especial (C1); **assinatura avançada** (gov.br) aceita para receitas com retenção (antimicrobianos, **GLP-1**). Novos modelos desde 13/02/2026; prazo de disponibilização completa adiado de 01/06 para **30/09/2026**; receitas sem numeração aceitas por 30 dias após o início; SNGPC continua controlando estoque. Memed (atualização 02/06/2026) aguarda liberação; Afya iClinic Rx idem.

### 7.7 Soroterapia / protocolos endovenosos [53]
- CRM-PR Resolução 260/2026 (aprovada 10/08, DOU 21/08/2026): critérios de infraestrutura, prescrição individualizada, **proibição de promessas de antienvelhecimento e desintoxicação** e de divulgar métodos sem reconhecimento do CFM. CFM 1.974/2011 já vedava publicidade de procedimento experimental; CRM-PR obteve na Justiça Federal a suspensão de curso de soroterapia para não médicos (2024). Reposição EV só com deficiência/má-absorção documentada. Para São Paulo, ainda não há norma equivalente do CRM-SP localizada, mas a tendência regional é clara.

### 7.8 Implantes hormonais [54]
- CFM 2.333/2023: vedadas terapias hormonais com esteroides para **estética, massa muscular ou performance** e a "modulação hormonal" sem deficiência clínica e laboratorial; permitidas reposições com indicação (hipogonadismo, menopausa, endometriose etc.). Implantes **manipulados** (gestrinona etc.) carecem de registro Anvisa e controle de qualidade — FEBRASGO contra, SBMP a favor (debate na CNN em 23/05/2026). Anunciar medicamento sem registro Anvisa viola a 2.336/2023 (art. 11, III).

---

## 20 ideias concretas para a clínica e seu app

Selos: **Pronto** (tecnologia e evidência maduras, dá para fazer já) · **Beta** (viável, exige validação) · **Especulativo** (exploratório).

1. **Onboarding 0–30 do plano com toques D3·D7·D14·D30 pela enfermagem** — script de efeitos GI, treino de aplicação, curva de peso esperada; tarefa nasce no motor de cadência com dono real. *Evidência:* 30% dos abandonos no mês 1; Ro faz check-in mensal; playbook de 4 pilares [13, 11]. **Pronto**
2. **Semáforo de adesão por paciente ativo** (verde/amarelo/vermelho) derivado de: pesagem semanal enviada, resposta ao último toque, retorno agendado, dias desde última dose. Vermelho gera tarefa de resgate. *Evidência:* pesagem semanal e contato com coach são os maiores preditores; hiperengajamento inicial prevê abandono [16]. **Beta**
3. **Régua de renovação D150–D180 com "Relatório de Resultados"** (evolução de peso, massa magra, exames, metas) e oferta de Ciclo 2/manutenção. *Evidência:* retenção 94–97% em concierge; escada de tiers de Fountain/Biograph [18, 7, 8]. **Pronto**
4. **Produto "Manutenção" mensal pós-ciclo** (valor menor, pesagem/bioimpedância + ajuste + acesso ao time) para não perder o paciente no abismo pós-D180. *Evidência:* receita recorrente = 75–90% em concierge; Superpower subiu preço ao incluir 2ª coleta [18, 5]. **Beta**
5. **Escriba em PT-BR na consulta** (Noa Notes/Amélia/HiDoctor ou API própria) com registro automático "nota apoiada por IA, revisada pelo médico" e aviso no termo. *Evidência:* RCT NEJM AI –9,5%; prospectivo –21% e burnout de 92% → 51% [46]; CFM 2.454 art. 4º V e 5º §1º [49]. **Pronto** (ferramenta) / **Beta** (própria)
6. **Pré-consulta por WhatsApp**: questionário estruturado 48h antes → rascunho de anamnese para o médico; IA só organiza (baixo risco). *Evidência:* Clinia 84,9% de conversas resolvidas; Anexo II da CFM 2.454 [47, 49]. **Beta**
7. **"Resumo da sua consulta e plano de cuidado"** gerado a partir da nota, revisado e enviado pelo médico via WhatsApp/PWA. *Evidência:* Heidi/Dragon fazem patient summaries; Function "Protocols" [45, 1]; mediação humana obrigatória (art. 5º §2º) [49]. **Beta**
8. **Confirmação em dois toques (48h e 2h) + lista de espera ativa + score de risco de falta por regras** (faltou antes, lead time >14 dias, 1ª consulta, sem resposta). *Evidência:* –40 a –70% de faltas; TuoTempo –50%; top-20% de risco concentra ~60% dos no-shows [28, 42, 48]. **Pronto**
9. **Recepcionista de voz/WhatsApp fora do horário** integrada à agenda (Galdur/Alma/Clinia), com escalonamento humano para dúvidas clínicas. *Evidência:* 8/10 ligações fora do horário viraram agendamento em piloto [47]. **Beta**
10. **SLA de resposta a lead de 5 minutos como KPI no Kanban** (cronômetro no cartão, alerta ao coordenador). *Evidência:* <1h = ~7x mais qualificação; 60x vs. 24h (HBR 2011) [60]. **Pronto**
11. **Redesenhar Indicações para ficar dentro da CFM 2.336**: cortesia clínica não condicionada a fechamento (ex.: bioimpedância de cortesia para pacientes ativos), agradecimento não financeiro, prioridade de agenda; manter a visão por indicador. *Evidência:* art. 9º VIII e exposição de motivos [51]; indicação = 30–50% dos novos membros [18]. **Pronto**
12. **Evento trimestral para pacientes ativos e ex-pacientes** (aula com nutri/psi, "dia da bioimpedância"), com RSVP e presença registradas no CRM como toque. *Evidência:* +2–4 p.p. de retenção [18]. **Pronto**
13. **Ocupação de sala como KPI diário no Painel do Mês** (h vendidas/h disponíveis por sala; meta 75–85%), com "janelas de menor demanda" ofertadas em campanha (desconto permitido, sem venda casada). *Evidência:* ocupação atual ~5%; benchmark 75–85%; CFM art. 9º VIII [29, 30, 51]. **Pronto** (KPI) / **Especulativo** (yield)
14. **Contas "Provisões" (13º, férias, IRPJ/CSLL) e "Reserva" no Lucro Inteligente**, alocadas por depósito no ritmo 10/25, com meta de 1–3 meses de fixos. *Evidência:* Profit First (175 mil empresas) [55]; reforma tributária em fase de teste em 2026. **Pronto**
15. **Extrato de repasse por comanda** (regra 110/150 ou coluna S → valor → pagamento → conciliação), assinado digitalmente pelo médico/PJ. *Evidência:* Shosp/Amplimed automatizam fee split; trilha reduz risco trabalhista [41, 39]. **Pronto**
16. **Conciliação assistida**: além do hash do extrato, sugestão automática de matching por valor/data/CPF e baixa em 1 clique; explorar Open Finance (Pluggy/Belvo) para importar extrato sem xlsx. *Evidência:* Clinipay baixa automática; Ninsaúde/Shosp conciliação [34, 41]. **Beta**
17. **Check-in por QR no totem com confirmação de dados e consentimentos** (LGPD, imagem, IA, termo de tratamento) e assinatura no ato; NPS/CES já ligados ao mesmo fluxo. *Evidência:* Clinicorp/Ninsaúde QR; TuoTempo [34, 41, 42]. **Pronto**
18. **Curva de composição corporal no app do paciente** (InBody via LookinBody Web/API + balança conectada em casa), com alerta ao médico se perda de massa magra > limiar. *Evidência:* InBody cita GLP-1; engajamento digital = +5,3 p.p. de perda [58, 17]. **Beta**
19. **CGM opcional de 14 dias no início do plano** ("descoberta metabólica"), com leitura conjunta com a nutri. *Evidência:* Stelo US$ 89/mês nos EUA; sem evidência de desfecho em não diabéticos [58]. **Especulativo**
20. **"Cofre de compliance" no app**: registro de consentimentos, inventário de IA com classificação de risco (Anexo II), DPO e substituto, RIPD, plano de incidente de 3 dias úteis, trilha de auditoria; **gate de indicação clínica** para itens EV/hormonais na comanda (CID + exame de deficiência + consentimento específico) e prescrição de controlados via plataforma integrada ao SNCR até 30/09/2026. *Evidência:* CFM 2.454, ANPD 2026, CRM-PR 260/2026, CFM 2.333/2023, RDC 1.000/2025 [49, 50, 52, 53, 54]. **Pronto**

---

## Fontes (URL e data de publicação/consulta)

1. Function Health — "With a $2.5B Valuation, Function Becomes the New Standard for Health…" — 19/11/2025 (pub. 03/12/2025) — https://www.functionhealth.com/article/function-announcement
2. CNBC — "Function Health buys Ezra, launches full-body scan for a third of the price" — 05/05/2025 — https://www.cnbc.com/2025/05/05/function-health-mri-ezra.html
3. Vitality Scout — "Function Health Review (2026): $365/Year" — 2026 — https://vitalityscout.com/guides/function-health-review
4. Yahoo Finance — "Superpower Launches $199 Membership…" — 19/08/2025 — https://finance.yahoo.com/news/superpower-launches-199-membership-help-160000865.html
5. Crown Counseling — "Superpower Health Review 2026" (preço a US$ 349 em 01/09/2026) — 2026 — https://crowncounseling.com/reviews/superpower-health-review
6. Sacra — Superpower funding — https://sacra.com/c/superpower/
7. Radiology Business — "Biograph… launches with $7,500 membership fee" — 2025 — https://radiologybusiness.com/topics/healthcare-management/healthcare-economics/biograph-new-whole-body-mri-startup-launches-7500-membership-fee ; TechCrunch — 28/02/2025 — https://techcrunch.com/2025/02/28/startup-co-founded-by-longevity-guru-peter-attia-emerges-from-stealth
8. Longevity.Technology — "Fountain Life makes longevity accessible with $595 membership" — 2026 — https://longevity.technology/news/fountain-life-makes-longevity-accessible-with-595-membership/
9. Yahoo Life — "Are Longevity Clinics Worth It in 2026?" — 19/05/2026 — https://www.yahoo.com/lifestyle/articles/longevity-clinics-worth-2026-5-002654092.html
10. Vitality Scout — "Ro Weight Loss Cost (2026)" — jul/2026 — https://vitalityscout.com/guides/ro-body-weight-loss-cost
11. The RX Index — "Ro vs Hims for Weight Loss (2026)" — https://therxindex.com/guides/ro-vs-hims-weight-loss/
12. Trimi — "Found Weight Loss Cost 2026" — https://trytrimi.com/blog/found-semaglutide-cost ; PlexusDx — Found membership/cancellation (Trustpilot em 04/09/2026) — https://plexusdx.com/blogs/learn/found-weight-loss-reviews-membership-medication-cancellation-plexusdx
13. Propel — "GLP-1 Patient Retention: Why Patients Quit & How to Keep Them" — 03/07/2026 — https://www.trypropel.ai/resources/blogs/glp-1-patient-retention
14. Amgen — "The Gap Between GLP-1 Prescriptions and Persistence" — https://www.amgen.com/obesity/prescription-gap
15. PMC — "Adherence and Persistence with GLP-1-Based Therapies: International Real-World Evidence and the Role of Nutritional and Lifestyle Support — Narrative Review" — 2026 — https://pmc.ncbi.nlm.nih.gov/articles/PMC13259006/ (PubMed 42280404)
16. Healthcare (MDPI) — "12-Month Weight Loss and Adherence Predictors in a Real-World UK Tirzepatide-Supported Digital Obesity Service" — 2025 — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12786109/
17. JMIR — "Digital Engagement Significantly Enhances Weight Loss Outcomes in Adults With Obesity Treated With Tirzepatide" — 2025 (metadados via https://api.semanticscholar.org/)
18. Macbach — "The 2026 Concierge Medicine Benchmark Report" — mai/2026 — https://macbach.com/insights/concierge-medicine-benchmarks-2026
19. Concierge MD Finder — "How Concierge Medicine Pricing Works in 2026" — 2026 — https://conciergemedfinder.com/blog/concierge-medicine-pricing-real-cost-2026
20. Medical Economics — "Why more physicians will choose concierge medicine in 2026" — https://www.medicaleconomics.com/view/why-more-physicians-will-choose-concierge-medicine-in-2026 ; Towards Healthcare — mercado concierge — https://www.towardshealthcare.com/insights/concierge-medicine-market-sizing
21. Coopecir-PB — "Longevitar inaugura centro de medicina regenerativa em São Paulo" — 2026 — https://www.coopecirpb.com.br/noticia/4798
22. Age & Health — https://agehealth.com.br/clinica-longevidade-em-sao-paulo/ ; Clínica Sculpté — https://clinicasculpte.com.br/quem-somos/ (403 na consulta)
23. Clínica Phorma — "Mounjaro no Brasil: Doses, Preços e o Que Muda em 2026" — https://clinicaphorma.com.br/mounjaro-brasil-precos-doses-2026/
24. Clínica Bellit — "Quanto custa o tratamento com Tirzepatida em São Paulo?" — http://www.clinicabellit.com.br/blog/quanto-custa-o-tratamento-com-tirzepatida-em-sao-paulo
25. Regimen — "Ozempic e Mounjaro no Brasil em 2026" — https://helloregimen.com/pt/blog/ozempic-mounjaro-brasil-guia-2026
26. Voy Saúde — "Quanto custa o Mounjaro?" — https://www.voysaude.com.br/blog/quanto-custa-o-mounjaro (429 na consulta)
27. Fácil Consulta — "Taxa de Faltas em Consultas Médicas: Dados do Mercado" — 06/02/2026 — https://c.facilconsulta.com.br/taxa-de-faltas-em-consultas-medicas-dados-do-mercado/
28. ByDoctor — "Taxa de No-Show na Clínica: O que é Normal e Como Reduzir" — 25/06/2026 — https://bydoctor.com.br/blog/taxa-de-no-show-clinica-o-que-e-normal-como-melhorar
29. Conclínica — "Benchmark de Mercado" — https://conclinica.com.br/benchmark-clinicas/
30. Contourline — "Indicadores para clínica estética médica" — https://contourline.com.br/indicadores-clinica-estetica-medica/
31. UNO CRM — "KPIs comerciais semanais que toda clínica deve acompanhar" — https://www.unocrm.com.br/kpis-comerciais-semanais-clinicas/
32. MedGM — "CRM para Clínicas Médicas" — 08/02/2026 — https://medgm.com.br/blog/crm-para-clinica-medica.html
33. Brazil Economy — "Clinicorp aposta em agentes de IA para automatizar clínicas e dobrar de tamanho" — 26/02/2026 — https://brazileconomy.com.br/empresas/2026/02/clinicorp-aposta-em-agentes-de-ia-para-automatizar-clinicas-e-dobrar-de-tamanho-ate-2027/
34. Clinicorp — Clinicorp IA — https://www.clinicorp.com/clinicorp-ia ; Ferramentas — https://www.clinicorp.com/ferramentas
35. Doctoralia Press — "Noa Notes: assistente virtual com IA revoluciona a rotina médica" — 18/11/2025 — https://press.doctoralia.com.br/435372-noa-notes-assistente-virtual-com-ia-revoluciona-a-rotina-medica
36. Medicina S/A — "Doctoralia lança Noa Evidence" — 2025/2026 — https://medicinasa.com.br/doctoralia-noa-evidence/
37. ClinicaSysPro — "Feegow: planos e valores 2026" — https://www.clinicasyspro.com.br/clinicasyspro-vs-feegow.html
38. Feegow Clinic — https://feegowclinic.com.br/
39. Amplimed — Amélia Transcrição — https://www.amplimed.com.br/amelia-transcricao/ ; site — https://www.amplimed.com.br/
40. Analister — "iClinic: prós, contras e análise completa 2026" — 15/04/2026 — https://analister.com/ferramentas/iclinic ; iClinic — https://iclinic.com.br/
41. Shosp — https://www.shosp.com.br/ ; Prontmed — https://prontmed.com/ ; HiDoctor — https://www.hidoctor.com.br/ ; Conclínica — https://conclinica.com.br/ ; Ninsaúde (via Apolo) — https://blog.apolo.app/ninsaude-clinic-e-a-revolucao-da-gestao-360/
42. TuoTempo — https://www.tuotempo.com.br/
43. Bloomberg Línea — "Alice acelera o crescimento e projeta chegar a R$ 1 bi em receita em 2026" — 23/09/2025 — https://www.bloomberglinea.com.br/tech/alice-acelera-o-crescimento-e-projeta-chegar-a-r-1-bi-em-receita-em-2026-diz-ceo/
44. Carecode — "Prontuário com IA: o que muda na rotina do médico em 2026" — https://www.carecode.ai/en/blog/prontuario-com-ia
45. Nabla — https://www.nabla.com/ ; Heidi Health — https://www.heidihealth.com/ ; Unite.AI — "10 Best AI Medical Scribes (September 2026)" — https://www.unite.ai/best-ai-medical-scribes/
46. NEJM AI 2025 — "Ambient AI Scribes in Clinical Practice: A Randomized Trial" (DOI 10.1056/AIoa2501000); NEJM AI 2025 — RCT stepped-wedge (DOI 10.1056/AIoa2500945); JMIR Med Inform 2025 — "Ambient AI Scribe Implementation in Ambulatory Setting" (DOI 10.2196/84104) — metadados via https://api.semanticscholar.org/
47. Clinia — https://clinia.io/ ; Galdur Voz — https://voz.galdurai.com/ ; Alma — https://oialma.com.br/ ; Interaflow — https://www.interaflow.ai/recepcionista-virtual
48. ScienceDirect — "Predicting patient no-shows using machine learning: comprehensive review" — 2025 — https://www.sciencedirect.com/science/article/pii/S2666521225000328 ; PubMed 42553932 — RM no-show com intervenção — ago/2026 — https://pubmed.ncbi.nlm.nih.gov/42553932/ ; PubMed 42598448 — artroplastia — 2026 — https://pubmed.ncbi.nlm.nih.gov/42598448/
49. CFM — Resolução 2.454/2026 (DOU 27/02/2026; retificação 05/03/2026; vigência 180 dias) — PDF https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2026/2454_2026.pdf ; notícia https://portal.cfm.org.br/noticias/cfm-normatiza-uso-da-ia-na-medicina/ ; Conjur — 14/03/2026 — https://www.conjur.com.br/2026-mar-14/resolucao-do-cfm-trata-do-uso-de-inteligencia-artificial-na-medicina/
50. Medicina S/A — "LGPD na saúde em 2026: o ano da virada regulatória" — 19/08/2026 — https://medicinasa.com.br/lgpd-saude-2026/ ; HDPO — "Fiscalização de dados de saúde: ANPD intensifica em 2026" — https://hdpo.com.br/fiscalizacao-de-dados-de-saude-anpd-2026/ ; Confidata — Res. 18/2024 — https://confidata.com.br/blog/encarregado-dados-2026-resolucao-anpd-18-2024 ; Sindilojas-SP — prazo de incidentes — https://sindilojas-sp.org.br/anpd-impoe-novo-prazo-p-comunicacao-de-incidentes-de-dados/
51. CFM — Resolução 2.336/2023 (publicidade médica) — PDF https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2023/2336_2023.pdf ; notícia https://portal.cfm.org.br/noticias/cfm-atualiza-resolucao-da-publicidade-medica/
52. CFF — "Anvisa aprova nova RDC… receituário eletrônico de medicamentos controlados" — 10/12/2025 — https://site.cff.org.br/noticia/Noticias-gerais/10/12/2025/anvisa-aprova-nova-rdc-que-regulamenta-o-receituario-eletronico-de-medicamentos-controlados ; Brum Consulting — RDC 1.000/2025 — https://brumconsulting.com.br/noticias/rdc-anvisa-receita-eletronica-medicamentos-controlados/ ; Portal Afya — https://portal.afya.com.br/saude/rdc-1-000-25-o-que-o-medico-precisa-saber-sobre-os-novos-receituarios-controlados ; Memed — 02/06/2026 — https://suporte-medico.memed.com.br/hc/pt-br/articles/43907350996251 ; Agência Gov — mai/2026 (indisponível) — https://agenciagov.ebc.com.br/noticias/202605/sncr-o-que-muda-para-farmacias-e-drogarias-com-o-novo-sistema-de-controle-de-receitas
53. Bem Paraná — "CRM-PR endurece regras para soroterapia…" (Res. CRM-PR 260/2026, DOU 21/08/2026) — https://www.bemparana.com.br/bem-estar/saude-e-beleza/crm-pr-endurece-regras-para-soroterapia-e-proibe-promessas-de-antienvelhecimento-e-desintoxicacao/ ; CRM-PR — 30/01/2024 — https://www.crmpr.org.br/Justica-Federal-acata-pedido-do-CRMPR-e-suspende-curso-de-soroterapia-em-Foz-do-Iguacu-11-58830.shtml
54. CFM — Res. 2.333/2023 — 11/04/2023 — https://portal.cfm.org.br/noticias/cfm-proibe-a-prescricao-medica-de-terapias-hormonais-com-fins-esteticos-de-ganho-de-massa-muscular-e-de-melhoria-de-desempenho-esportivo/ ; CNN Brasil — "Implantes hormonais dividem entidades médicas" — 23/05/2026 — https://www.cnnbrasil.com.br/nacional/brasil/implantes-hormonais-dividem-entidades-medicas-apos-restricoes-do-cfm/ ; Portal Afya — CBGO 2025 FEBRASGO — https://portal.afya.com.br/ginecologia-e-obstetricia/cbgo-2025-implantes-hormonais-posicionamento-da-febrasgo
55. Mike Michalowicz — Profit First — https://mikemichalowicz.com/profit-first/
56. Dr. Thiago Volpi — Imersão Médico Empresário — https://drthiagovolpi.com.br/imersao-medico-empresario/
57. CustomerGauge — "Healthcare NPS Benchmarks" — 2026 — https://customergauge.com/benchmarks/blog/nps-healthcare-net-promoter-score-benchmarks ; Zonka — https://www.zonkafeedback.com/blog/nps-in-healthcare-and-patient-satisfaction
58. InBody — LookinBody Web — https://inbodyusa.com/products/lookinbody-web/ ; Dexcom Stelo — https://www.stelo.com/
59. Clint — "Clint vs HubSpot vs Kommo vs Zoho: qual CRM para vender pelo WhatsApp em 2026" — https://www.clint.digital/blog/crm-para-whatsapp-brasil-2026/
60. HBR — Oldroyd, McElheran, Elkington, "The Short Life of Online Sales Leads" — mar/2011 — https://hbr.org/2011/03/the-short-life-of-online-sales-leads ; HBR — Dixon, Freeman, Toman, "Stop Trying to Delight Your Customers" — jul-ago/2010 — https://hbr.org/2010/07/stop-trying-to-delight-your-customers (ambos em paywall; números citados de conhecimento do estudo)
61. Fierce Healthcare — "Function Health acquires Ezra" — mai/2025 — https://www.fiercehealthcare.com/health-tech/function-health-acquires-ezra-combine-lab-testing-and-ai-powered-medical-imaging
62. Terra — "Dr.Consulta lança planos de saúde após comprar participação na cuidar.me" — https://www.terra.com.br/byte/inovacao/drconsulta-lanca-planos-de-saude-apos-comprar-participacao-na-cuidarme,f2e5beddd64fd59823fb5a048102a75fmjiw9mk7.html

---

### Nota final para quem vai relayar

Os três achados com **prazo** são: (1) SNCR/receita controlada digital até **30/09/2026**; (2) CFM 2.454/2026 **já em vigor** desde 26/08/2026 — qualquer IA no app (escriba, chatbot, resumo) precisa de aviso ao paciente, registro no prontuário e inventário de risco; (3) a ANPD fará fiscalizações em saúde até dezembro/2026 — DPO nomeado com substituto e plano de incidente de 3 dias úteis. Os dois achados de **negócio** mais fortes são a densidade de toques no mês 1 do plano (onde 30% do abandono acontece) e a taxa de ocupação de sala (~5% hoje contra 75–85% de benchmark).