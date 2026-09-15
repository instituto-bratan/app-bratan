Pesquisa concluída. Segue o relatório completo.

---

# Integrações e automações financeiras e de comunicação para uma clínica médica de pequeno porte em São Paulo

**Data da pesquisa:** 14/09/2026. **Perfil considerado:** Ltda em Lucro Presumido, conta PJ Itaú + Safra, maquininha Rede, sócios em Santander/Inter/Nubank, contratos via SuperSign, prontuário/agenda migrando Feegow → iClinic, equipe em grupos de WhatsApp, Microsoft 365/SharePoint, app interno React + Supabase (Edge Functions em Deno) na Vercel.

**Legenda de status usada em todo o texto**

| Selo | Significado |
|---|---|
| **[Disponível]** | Em produção hoje, contratável por uma empresa pequena |
| **[Anunciado]** | Divulgado oficialmente, ainda não vigente ou em piloto/liberação gradual |
| **[Depende de homologação/contrato]** | Existe, mas exige credenciamento, gerente de conta, certificado, aprovação da Meta ou contrato comercial |
| **[Não verificado]** | Afirmação encontrada só em fonte secundária/promocional, sem fonte oficial |

**Nota metodológica:** a cota de busca web desta sessão esgotou-se no fim da pesquisa; alguns itens (preços da Iniciador, Provu, detalhes do portal de desenvolvedores da Rede e do Itaú, tabela de tarifas PJ do Itaú, Nuvem Fiscal) não puderam ser verificados porque os sites bloquearam o acesso automatizado (HTTP 403) ou exigem JavaScript. Estão marcados.

---

## Sumário executivo

1. **WhatsApp ficou por mensagem e vai ficar mais caro em 1º/10/2026**: hoje utilidade/autenticação custam ~US$ 0,005–0,0068 (~R$ 0,03) fora da janela de 24 h e são grátis dentro dela; marketing ~US$ 0,0625 (~R$ 0,31–0,35). A partir de 1º/10/2026 as respostas de serviço dentro da janela passam a ser cobradas (~R$ 0,035, com franquia de 1.000/mês por número segundo um BSP). Faturamento em reais desde 1º/07/2026, obrigatório até 30/06/2027.
2. **Grupos de WhatsApp**: a API oficial agora tem uma Groups API, mas só para grupos **criados pela empresa via API**, com **máximo de 8 participantes** e exigindo **Official Business Account (selo)**. Ela **não lê grupos existentes**. Ler comprovantes do grupo atual da equipe só é possível com API não oficial (risco real de banimento em 2026) ou reorganizando o fluxo.
3. **Coexistência** (app WhatsApp Business + Cloud API no mesmo número) está liberada no Brasil desde abril/2026 e é o caminho para automatizar sem tirar o celular da recepção — mas é incompatível com OBA (logo, com a Groups API) e com a Calling API.
4. **Open Finance**: jornada sem redirecionamento (JSR) obrigatória desde 06/02/2026, com PJ/desktop/Pix Automático em produção desde 22/04/2026. O gargalo para empresas continua sendo o **consentimento com vários sócios** (fluxo assíncrono CIBA ainda em estudo pelo BC).
5. **Itaú**: as APIs de Pix, cobrança/boleto híbrido, extrato, pagamentos e DDA existem, mas o onboarding é **via gerente** (mTLS, token temporário de 72 h). Inter é o banco com API PJ 100 % autoatendimento e sem custo de setup.
6. **Rede**: há API/EDI de conciliação (autorização pelo portal da Rede, geralmente intermediada por software house ou conciliadora) e e.Rede para link/tokenização/recorrência. Registro de recebíveis mudou com a Res. BCB 514/2025 (vigências 05/01/2026 e 11/05/2026).
7. **NFS-e**: uma Ltda em Lucro Presumido em São Paulo **continua no emissor municipal** (Nota do Milhão, webservice) — o Emissor Nacional é obrigatório em SP só para o Simples Nacional (1º/11/2026) e autônomos (1º/01/2027). O destaque de IBS/CBS (alíquota-teste 1 %) no padrão nacional ficou obrigatório em 1º/10/2026 para o regime regular; em SP o Layout 2 tem os campos. Serviços médicos têm redução de 60 % de IBS/CBS.
8. **Emitir a nota do paciente ao fechar a comanda é factível hoje** com Focus NFe (a partir de R$ 89,90/mês), NFE.io (R$ 190/mês) ou PlugNotas, mais certificado A1 (R$ 150–235/ano).
9. **iClinic não tem API pública documentada** (só modelos de importação CSV); **Feegow tem API REST completa** (agendamentos, pacientes, financeiro, faturamento TISS). Isso pesa na migração.
10. **Assinar contrato dentro do app é trivial** via API da SuperSign (já usada) ou ZapSign; Gov.br é só para órgãos públicos. **Crediário sem risco** para a clínica existe (ParcelaMais até 36x, Dr.Cash 24x com repasse em 48 h, BV até R$ 30 mil).

---

## 1. WhatsApp Business Platform em 2026

### 1.1 Modelo de cobrança e tarifas no Brasil

A Meta migrou de "por conversa" para **cobrança por mensagem de template entregue** em 1º/07/2025; conversas de serviço (respostas a quem escreveu para a empresa) são gratuitas desde 1º/11/2024, e **templates de utilidade enviados dentro de uma janela de atendimento aberta também são gratuitos** desde 1º/07/2025. Há descontos por volume para utilidade/autenticação. A Meta só pode alterar preços no primeiro dia de cada trimestre, com aviso de 1 mês (tarifas), 3 meses (novos modelos) ou 6 meses (mudanças estruturais). Fonte oficial: [Meta – Pricing](https://developers.facebook.com/docs/whatsapp/pricing) e [Updates to pricing](https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing) (acessados em 14/09/2026).

**Faturamento em reais [Disponível]**: desde 1º/07/2026 (9h PT) clientes e parceiros com "país de venda" Brasil podem ser faturados em BRL pela entidade local (Facebook Brasil); a migração é **obrigatória até 30/06/2027**, com suspensão de entregas a partir de 1º/07/2027 (mesma fonte oficial).

Tarifas para o Brasil (a Meta publica o rate card em planilha, não no texto; valores abaixo vêm de BSPs brasileiros que o reproduzem):

| Categoria | USD/mensagem | BRL aprox. | Quando cobra | Fontes |
|---|---|---|---|---|
| Marketing | ~0,0625 | R$ 0,31–0,35 | Sempre, ao entregar | [Fortics 03/09/2026](https://www.fortics.com.br/mudancas-precos-whatsapp-business-api-outubro-2026/), [Nimochat 10/01/2026, atualizado 11/09/2026](https://www.nimochat.com.br/blog/geral/quanto-custa-api-oficial-whatsapp-waba-2026/) |
| Utilidade | ~0,005–0,0068 | ~R$ 0,03 | Só fora da janela de 24 h | idem |
| Autenticação | ~0,005–0,0068 | ~R$ 0,03 | Sempre | idem |
| Serviço (resposta na janela) | grátis até 30/09/2026 | — | — | idem |

Observação: um artigo de março/2026 ([SocialHub 03/03/2026](https://www.socialhub.pro/blog/preco-whatsapp-api-2026-brasil/)) lista utilidade a US$ 0,0375; está em desacordo com as fontes mais recentes e com o rate card conhecido — trate como desatualizado.

**Mudança anunciada para 1º/10/2026 [Anunciado]**: segundo BSPs, a Meta passará a cobrar as **mensagens de serviço** (respostas de atendentes/plataformas dentro da janela de 24 h) e os templates de utilidade enviados em resposta ao cliente, a ~US$ 0,0068 (~R$ 0,035) por mensagem entregue; a Nimochat cita **franquia de 1.000 mensagens de serviço grátis por mês por número**. Mensagens iniciadas pelo cliente e a janela de 72 h de anúncios (click-to-WhatsApp) continuam grátis. Fontes: [Fortics 03/09/2026](https://www.fortics.com.br/mudancas-precos-whatsapp-business-api-outubro-2026/), [Nimochat](https://www.nimochat.com.br/blog/geral/quanto-custa-api-oficial-whatsapp-waba-2026/), [Maxbot](https://www.maxbot.com.br/blog/nova-precificacao-do-whatsapp-business). Não encontrei o texto dessa mudança na página oficial de updates acessada hoje — confirme no rate card oficial antes de orçar.

**Impacto para a clínica**: com ~2.000 mensagens/mês (lembretes, confirmações, NPS, recibos), o custo em utilidade fica na casa de R$ 60–100/mês; cada resposta humana passará a custar centavos após outubro. Não há mensalidade, taxa de ativação ou mínimo na Cloud API direta.

### 1.2 Categorias, templates, janela e Flows

- **Utilidade** cobre confirmações, lembretes, atualizações de agendamento, cobranças/recibos e avisos transacionais; **qualquer mensagem proativa que não seja utilidade/autenticação é marketing** (promoções, reativação, novidades) — a Meta reclassifica templates com conteúdo promocional. Fonte: [Talkaio](https://talkaio.com/blog/quanto-custa-a-whatsapp-business-platform-o-modelo-de-cobranca-por-conversa-explicado-2/), [Meta Pricing](https://developers.facebook.com/docs/whatsapp/pricing).
- **WhatsApp Flows [Disponível]**: telas nativas (formulários, seletores, calendário) dentro do WhatsApp, sem link externo; usadas por clínicas para escolher horário, pré-cadastro e **NPS pós-atendimento**; exigem aprovação da Meta como os templates. Fontes: [ChatGuru](https://chatguru.com.br/blog/whatsapp-flows-o-que-e-como-funciona/), [Clint, maio/2026](https://www.clint.digital/blog/automacoes-whatsapp-agendamento-clinicas-2026) (cita seletor de horário via Flows e confirmação 24 h antes com redução de no-show de 15 % em um case), [SocialHub – Flows 2026](https://www.socialhub.pro/blog/whatsapp-flows-2026-formulario-interativo/).

### 1.3 Pagamentos e Pix dentro do WhatsApp

- **Payments API – Brasil (oficial) [Disponível, depende de PSP]**: a documentação da Meta descreve cinco integrações: **Pix dinâmico**, **links de pagamento**, **boleto**, **cartão one-click off-site** e o template **order_details**. O comerciante envia `order_details` com um `reference_id` próprio, o cliente paga (Pix no app do banco ou link no navegador) e o status volta por webhook; **a conciliação é responsabilidade do comerciante com o seu PSP** — a Meta não lista PSPs nem taxas na página. Fonte: [Meta – Payments API BR](https://developers.facebook.com/docs/whatsapp/cloud-api/payments-api/payments-br) (acesso 14/09/2026). Na prática: o QR dinâmico vem da sua API Pix (Itaú/Asaas/Inter) e é exibido dentro da conversa.
- **WhatsApp Pay com Pix (consumidor → empresa)**: a Meta anunciou em 06/06/2024 a inclusão do Pix e a expansão para empresas maiores, clientes da API. Fontes: [CNN Brasil 06/06/2024](https://www.cnnbrasil.com.br/economia/negocios/whatsapp-pay-inclui-pix-e-expande-para-grandes-empresas/), [Exame 06/06/2024](https://exame.com/invest/mercados/pix-icone-verificado-e-ia-as-novidade-do-whatsapp-para-empresas/).
- **[Não verificado]**: um artigo promocional afirma que o BC "autorizou oficialmente em jan/2026" o WhatsApp Pay com taxas de 0,99 % (Pix) e 2,98 % (cartão), **sem citar nenhum ato normativo ou fonte oficial** ([SocialHub 12/05/2026](https://www.socialhub.pro/blog/whatsapp-pay-brasil-2026-banco-central-lancamento-pagamento-in-chat-pme-brasileira/)). Não use esses números para decisão.

### 1.4 Meta AI para empresas (Business AI / Meta Business Agent) [Anunciado / liberação gradual]

Na Conversations 2026 (Londres) a Meta anunciou a expansão do **Meta Business Agent** para WhatsApp, Messenger e Instagram: responde dúvidas, recomenda, **agenda horários**, qualifica leads, conclui vendas e decide quando passar para humano; "disponível para um grupo seleto de empresas", **gratuito inicialmente, com planos pagos por assinatura nos próximos meses**; anunciou também a Meta Business Agent Platform para agentes customizados. Fonte: [InfoMoney 04/06/2026](https://www.infomoney.com.br/business/startups-meta-amplia-ia-para-empresas-com-agentes-integrados-ao-whatsapp/). Fontes secundárias citam liberação do "Business AI" para PMEs brasileiras em março/2026 ([Stormcore](https://stormcore.com.br/blog/ia-no-whatsapp-business-2026), [SocialHub](https://www.socialhub.pro/blog/whatsapp-business-ai-brasil/)). Para uma clínica, o agente da Meta compete com um agente próprio (Claude na Cloud API) que você controla quanto a CFM/LGPD.

### 1.5 WhatsApp Business Calling API [Disponível via BSP]

Chamadas de voz VoIP dentro da conversa, com o mesmo número verificado. Receber chamadas do cliente é gratuito; chamadas iniciadas pela empresa exigem **permissão prévia do usuário**, são cobradas **por minuto em pulsos de 6 s**, por país e com desconto por volume; **cobradas em reais desde julho/2026**; limites: 1 chamada/dia e 2/semana por cliente, permissão revogada após 4 chamadas não atendidas; a chamada abre janela de atendimento mesmo sem ser atendida. Fontes: [Clickmassa 31/07/2026](https://clickmassa.com.br/whatsapp-business-calling-api/), [Voll](https://vollsolutions.com.br/whatsapp-business-calling-api/), [Message Central](https://www.messagecentral.com/blog/api-whatsapp-business-brasil). Não funciona em grupos nem com coexistência ([Meta Groups](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups); [360dialog – Coexistence](https://docs.360dialog.com/docs/resources/phone-numbers/coexistence)).

### 1.6 Grupos: o que a API oficial permite e o que não permite

Documentação oficial da **Groups API** (Cloud API), acessada em 14/09/2026 ([Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups)):

| Regra | Detalhe |
|---|---|
| Quem pode | Apenas números com **Official Business Account (OBA)**; números do app WhatsApp Business e "multi-solution" não são elegíveis |
| Criação | **Só a empresa cria o grupo via API**; participantes entram por **link de convite** (não há endpoint para adicionar diretamente) |
| Tamanho | **Máximo 8 participantes**; até 10.000 grupos por número; 1 empresa Cloud API por grupo |
| Mensagens | Texto, mídia, templates de texto e de mídia; **recebimento de mensagens do grupo por webhook** ("Receive group messages") |
| Não suportado | Chamadas, mensagens temporárias, view-once, commerce, interativas, autenticação |
| Cobrança | Mesma tarifa por mensagem 1:1, contada por mensagem enviada ao grupo |
| Histórico | **Não há endpoint para puxar histórico**; só chega o que acontece após a entrada (fonte: [Unipile, ago/2026](https://www.unipile.com/whatsapp-group-api/)) |

Fontes complementares: [imBee](https://www.imbee.io/resource/whatsapp-groups-api-business-guide-2026), [Sanuker](https://sanuker.com/whatsapp-groups-api-en/), [ChatbotX](https://chatbotx.io/blog/whatsapp-groups-api-explained-rules-use-cases-setup-guide-2026/).

**Consequência direta para "ler comprovantes que a equipe manda no grupo"**: o grupo atual da equipe (criado por uma pessoa no WhatsApp comum) **não é acessível** pela API oficial. As alternativas são: (a) criar via API um grupo "Caixa" com até 8 pessoas (recepção, enfermagem, financeiro) — exige selo OBA, e o número **não poderá usar coexistência**; (b) pedir que o comprovante seja **encaminhado 1:1 para o número da clínica** (mensagem iniciada pelo cliente/colaborador: grátis; a mídia chega por webhook); (c) API não oficial (Z-API/Evolution em modo QR) lê qualquer grupo, mas com o risco descrito em 1.8 — nunca no número principal da clínica.

### 1.7 Coexistência (app + API no mesmo número) [Disponível no Brasil]

Permite manter o WhatsApp Business App da recepção e conectar o mesmo número à Cloud API; mensagens novas são espelhadas nos dois lados via webhooks (`smb_message_echoes`); histórico pode ser sincronizado do app; **o app precisa ser aberto ao menos a cada 13 dias** e não pode ser desinstalado; **não suporta OBA (selo), Calling API** nem migração entre contas; companheiros Windows/WearOS não disparam webhooks. Brasil confirmado em abril/2026. Fontes: [360dialog docs](https://docs.360dialog.com/docs/resources/phone-numbers/coexistence), [ChakraHQ 2026](https://chakrahq.com/article/whatsapp-business-app-api-coexistence-2026/), [Whautomate](https://whautomate.com/whatsapp-coexistence), [Clint](https://www.clint.digital/blog/como-usar-api-whatsapp-no-celular/).

### 1.8 BSPs brasileiros × Cloud API direta × APIs não oficiais

| Opção | Modelo de custo | Observações | Status |
|---|---|---|---|
| **Cloud API direta (Meta)** | Só a tarifa Meta; sem mensalidade | Você hospeda o webhook (Edge Function); faturamento em BRL disponível | [Disponível] |
| **360dialog** | Tarifa Meta sem markup + mensalidade por número | Tem coexistência documentada; modelo "direto Meta" | [Disponível] |
| **Gupshup, Twilio, Bird, Infobip** | Fixo US$ 25–100/número/mês ou markup 10–30 %; Infobip 40 % acima da 360dialog em benchmark de 6.000 msgs (verificado em 23/07/2026) | Twilio cobra suporte premium à parte | [Disponível] |
| **Zenvia, Take Blip** | Enterprise, plataforma multicanal/conversacional | Mais indicados para volumes maiores | [Disponível] |
| **Z-API** (não oficial) | R$ 99,99/instância (Ultimate); parceiros R$ 54,99–89,99 (ago/2026) | Conexão via QR/WhatsApp Web; a própria doc admite que "não existe prática 100 % eficaz para evitar banimento" e cita bans após 10 mensagens a destinatários diferentes | [Disponível, risco alto] |
| **Evolution API** (open source) | Grátis (self-host) | Tem **modo oficial (Cloud API)** — seguro — e modo QR — risco | [Disponível] |

Fontes: [Notifica 2026](https://blog.usenotifica.com.br/blog/08-top-whatsapp-bsps-brazil), [Asisteclick](https://asisteclick.com/en/blog/chatbot-whatsapp-precio-empresas/), [Message Central](https://www.messagecentral.com/blog/best-whatsapp-business-api-providers-brazil), [360dialog blog](https://360dialog.com/blog/br/category/precos-api-whatsapp/), [Z-API docs – bloqueios](https://developer.z-api.io/tips/blockednumbernew), [Cubo Suite – guia Z-API](https://blog.cubosuite.com.br/z-api-guia-completo/), [Organizabot – Evolution API 03/2026](https://blog.organizabot.com/2026/03/evolution-api.html).

**Banimentos em 2026**: a Meta passou a detectar a **forma de conexão** (fingerprint do navegador, pacotes, padrões de dispositivo), não só volume; contas caem em até 48 h, de forma permanente; um provedor relata que 40–60 % das contas em APIs alternativas sofreram suspensão no 1º trimestre de 2026 (estimativa do próprio provedor). Recomendação unânime: Cloud API oficial + coexistência. Fontes: [Cubo Suite 25/07/2026, atualizado 12/08/2026](https://blog.cubosuite.com.br/meta-banindo-whatsapp-nao-oficial-em-2026-o-que-mudou-e-o-que-fazer), [AraraHQ](https://ararahq.com/blog/api-whatsapp-oficial-vs-nao-oficial-riscos), [ProxyAds](https://proxyads.com/blog/whatsapp-api-oficial-vs-nao-oficial/).

### 1.9 O que a clínica pode automatizar legalmente

| Automação | Categoria Meta | Base CFM / LGPD | Status |
|---|---|---|---|
| Lembrete e confirmação de consulta (botões Confirmar/Remarcar) | Utilidade | Comunicação assistencial; base legal "tutela da saúde" (LGPD art. 11, II, f) | [Disponível] |
| Recibo/comprovante e NFS-e em PDF após pagamento | Utilidade | Transacional | [Disponível] |
| NPS pós-atendimento (Flows) | Utilidade (pesquisa de serviço prestado) | Permitido; sem uso de depoimentos que "prometam resultado" | [Disponível] |
| Régua de resgate/retorno (60 d/6 m/1 a) | **Marketing** se proativa e não vinculada a um atendimento em curso | Exige **opt-in registrado**; conteúdo sóbrio, sem promessa de resultado (CFM 2.336/2023) | [Disponível] |
| Preços, formas de pagamento, horários | Utilidade/Marketing conforme contexto | CFM 2.336/2023 **permite** divulgar valores de consulta, meios de pagamento e descontos em campanhas (sem venda casada) | [Disponível] |
| Antes/depois, depoimentos | Marketing | Só educativo, imagens não manipuladas e paciente não identificável; depoimentos sóbrios; proibido garantir/insinuar resultado | [Disponível com cautela] |
| Envio de resultado/diagnóstico | — | Evitar pelo WhatsApp; enviar link autenticado do portal (dado sensível) | — |

Fontes: [CFM – O que muda (Res. 2.336/2023)](https://publicidademedica.cfm.org.br/resolucao/o-que-muda), [Portal CFM](https://portal.cfm.org.br/noticias/cfm-atualiza-resolucao-da-publicidade-medica/) (vigente desde 11/03/2024), [usebip – marketing médico 2026](https://www.usebip.com/blogs/bip-insights/marketing-medico-em-2026-o-que-a-resolucao-cfm-2-336-2023-permite-bip) (lembretes de retorno e material educativo pós-consulta não são publicidade em sentido estrito), ANPD em 6.5.

### 1.10 Leitura automática de comprovantes (abordagem técnica, sem fornecedor específico verificado)

Fluxo viável hoje: webhook da Cloud API recebe a mídia (imagem/PDF) → Edge Function baixa pelo endpoint de mídia (URL temporária) → extração estruturada por modelo de visão (valor, data/hora, pagador, banco, **ID da transação/E2E**) → casamento automático com o extrato/API Pix do Itaú (o E2E ID é a chave de verdade) → vínculo com a comanda e com `comprovante.crm_contact_ref`. O que impede hoje é só o **canal de entrada** (grupo atual não acessível pela API oficial — ver 1.6).

---

## 2. Open Finance Brasil e bancos

### 2.1 Estado do Open Finance em 2026

- As fases de dados (1–4, incluindo investimentos/seguros/câmbio) estão concluídas; o Open Finance passou de 100 milhões de clientes ([Finsiders](https://finsidersbrasil.com.br/economia-open/brasil-lidera-open-finance-no-mundo-com-100-milhoes-de-clientes/)) e o foco de 2026 é **pagamentos e PJ** ([Finsiders – de dados a motor de pagamentos](https://finsidersbrasil.com.br/tendencias-de-pagamento/open-finance-evolui-de-dados-a-motor-de-pagamentos/)).
- **Jornada Sem Redirecionamento (JSR) [Disponível]**: obrigatória para todos os detentores de conta do Pix desde **06/02/2026** (Res. BCB 541/2025); piloto v2.2.0 (PJ, desktop, Pix Automático) de 06/02 a 21/04/2026; **operação plena desde 22/04/2026** — autorização de pagamento dentro do ERP/app, com conciliação em tempo real. Fonte: [Pluggy, maio/2026](https://www.pluggy.ai/blog/open-finance-2026-novidades).
- **Jornada otimizada [Disponível desde 22/06/2026]**: o cliente pode compartilhar saldo/limite ao vincular Pix por aproximação a carteiras ou ao autorizar transferências automáticas, vendo se há saldo antes de confirmar. Fonte: [Finfy](https://finfy.luby.com.br/blog/open-finance-libera-saldo-antes-do-pagamento-o-que-muda-no-pix/).
- **Portabilidade de crédito digital [Disponível]**: desde fev/2026 (Res. Conjunta 15/2025), consignado em ago/2026 ([Pluggy](https://www.pluggy.ai/blog/open-finance-2026-novidades)).
- **Consentimento PJ com vários sócios [Anunciado / em estudo]**: hoje, empresa com múltiplos representantes precisa que **todos aprovem quase ao mesmo tempo**; o fluxo expira e recomeça do zero; o BC colocou na agenda 2025/2026 o **fluxo assíncrono (CIBA)** e telas mais claras, com marco de planejamento em agosto/2026, mas sem padrão técnico obrigatório publicado. Fontes: [Let's Money 29/05/2026](https://www.letsmoney.com.br/open-finance/open-finance-pj-burocracia-socios-credito), [TI Inside 23/01/2026](https://tiinside.com.br/23/01/2026/jornada-de-consentimento-ainda-limita-adesao-das-empresas-ao-open-finance-no-brasil/), [Mobile Time 21/05/2026](https://www.mobiletime.com.br/noticias/21/05/2026/banco-central-quer/), [Pluggy – OF para empresas](https://www.pluggy.ai/blog/open-finance-para-empresas). **Para a clínica**: se a conta Itaú tem poderes isolados para um sócio, o consentimento funciona hoje; se exige assinatura conjunta, espere fricção.

### 2.2 Pix: o que está lançado, o que está anunciado

| Recurso | Status | Detalhe | Fontes |
|---|---|---|---|
| **Pix Automático** | [Disponível] | Lançado em meados de 2025, oferta obrigatória pelas instituições desde out/2025; >85 % dos bancos pagadores suportam (abr/2026); PSPs que oferecem ao recebedor: Stripe BR, Pagar.me, Mercado Pago, Stone, Cielo, Asaas, Iugu, Vindi, PagSeguro; bancos direto: Itaú, Bradesco, Santander, BB, Caixa, Inter, BTG | [EM 06/01/2026](https://www.em.com.br/tecnologia/2026/01/7327097-pix-em-2026-pix-automatico-ja-e-realidade-e-novas-funcoes-sao-esperadas.html), [FWC 24/05/2026](https://fwctecnologia.com/blog/post/pix-automatico-apps-recorrencia-sem-cartao-2026), [Forja de Sistemas](https://forjadesistemas.com.br/blog/pix-automatico-recorrencia-saas-proprio-2026/) |
| **Pix por aproximação (NFC)** | [Disponível] | Desde fev/2025; 2026 é ano de adoção | [EM](https://www.em.com.br/tecnologia/2026/01/7327097-pix-em-2026-pix-automatico-ja-e-realidade-e-novas-funcoes-sao-esperadas.html), [Zoop](https://www.zoop.com.br/blog/pix/pix-2026-tendencias) |
| **Pix Parcelado (oficial do BC)** | [Retirado da agenda de curto prazo] | Em mar/2026 o BC priorizou Split Tributário, Cobrança Híbrida e MED 2.0; bancos (Nubank, Inter, C6, Itaú, Bradesco, Santander, Caixa) já oferecem "Pix parcelado" próprio ao pagador | [Matera](https://www.matera.com/br/blog/pix-parcelado/), [Agência Brasil 04/2025](https://agenciabrasil.ebc.com.br/economia/noticia/2025-04/pix-parcelado-deve-ser-lancado-em-setembro-diz-banco-central) |
| **Pix Garantido** | [Anunciado, sem data] | Em desenvolvimento pelo BC; funcionaria como agendamento de pagamentos futuros garantidos | [EM](https://www.em.com.br/tecnologia/2026/01/7327097-pix-em-2026-pix-automatico-ja-e-realidade-e-novas-funcoes-sao-esperadas.html), [eCarts](https://ecarts.com.br/tecnologia/pix-no-credito-2026-pix-parcelado-pix-garantido-e-como-usar/) |
| **Pix Offline** | [Anunciado, sem data] | Estudo | [EM](https://www.em.com.br/tecnologia/2026/01/7327097-pix-em-2026-pix-automatico-ja-e-realidade-e-novas-funcoes-sao-esperadas.html) |

Para o paciente, "Pix parcelado" é um produto do **banco dele** — a clínica recebe à vista, sem integrar nada.

### 2.3 APIs do Itaú para empresas

O portal [Itaú for Developers](https://devportal.itau.com.br/) não é legível por robô (conteúdo em JavaScript), então o que segue vem de integradores e de um comparativo de maio/2026:

- **APIs**: Pix (recebimento com QR dinâmico e webhook), Cobrança/Boleto (registro online em segundos, **boleto híbrido/bolecode** com QR Pix, alteração de vencimento e baixa), **Extrato** (atualizações ao longo do dia, para conciliação), **Pagamentos**, **DDA**, Open Finance. Fontes: [KMEE – comparativo de 12 APIs bancárias, 19/05/2026](https://kmee.com.br/blog/comparativo-apis-bancarias-erp-brasil-2026/), [InnCash 20/03/2026](https://inn.cash/blog/recebimentos/api-itau/), [Pluggy – API de extrato](https://www.pluggy.ai/blog/api-extrato-bancario-erp-sistema-gestao).
- **Onboarding [Depende de contrato]**: **via gerente**; autenticação client credentials + **mTLS**; o banco envia ClientID e um **token temporário válido por 72 h** para gerar o certificado de produção; a configuração no bankline só pode ser feita por **representante legal**; integradores Pix são autorizados em "Cobrança → Integradores Pix". Há **duas habilitações** distintas (Pix/bolecode e alteração/baixa de boleto). Fontes: [OpenPix – integração Itaú](https://developers.openpix.com.br/en/docs/bank-integrations/integration-itau-bank), [Omie – Pix Itaú](https://ajuda.omie.com.br/pt-BR/articles/6817569-configurando-a-integracao-com-o-itau-pix-via-api), [Casa do Desenvolvedor](https://forum.casadodesenvolvedor.com.br/topic/45171-integra%C3%A7%C3%A3o-de-boletos-via-api-ita%C3%BA/), [Itaú – cobrança](https://www.itau.com.br/empresas/pagamentos-recebimentos/cobranca).
- **Custos**: a [Tabela Geral de Tarifas Empresas (vigência 01/07/2026)](https://www.itau.com.br/media/dam/m/4428b7a6c585420e/original/tabela_geral_de_tarifas_empresas_pdf.pdf) não pôde ser lida (403). KMEE classifica o custo de setup como "médio" e a limitação como "depende de gestor comercial". **[Não verificado]** quanto a valores.
- **Agendamento**: PJ pode agendar pagamentos com até 1 ano de antecedência ([Atendimento Itaú](https://www.itau.com.br/atendimento-itau/para-empresas/pagamentos/posso-agendar-pagamentos-pela-internet)).

### 2.4 Outros bancos relevantes para o perfil

| Banco | Onboarding | Certificado | Recursos | Custo | Nota |
|---|---|---|---|---|---|
| **Safra** | Gerente | mTLS | APIs limitadas | Alto | KMEE recomenda agregador Open Finance |
| **Santander** | Portal + gerente | A1 | Pix, Boleto, Open Finance | Médio | Sandbox instável |
| **Inter** | **100 % autoatendimento** ("Soluções para sua empresa → Nova integração") | Próprio (12 m) | Pix, **Pix Automático**, Pix Cobrança, Pagamentos, Extrato, Saldos, sandbox, SDKs Java/C# | **Zero** | Só PJ; onboarding mais simples do mercado |
| **Nubank PJ** | Sem API pública | — | — | — | Usar agregador |
| **BTG, Sicoob, BB** | Autoatendimento | JWT/próprio/mTLS | Pix, boleto híbrido, pagamentos | Zero/baixo | Boas opções de entrada |
| **C6** | Portal | Próprio | Pix, Boleto, Pagamentos, **DDA** | Baixo | Cobertura completa |

Fontes: [KMEE 19/05/2026](https://kmee.com.br/blog/comparativo-apis-bancarias-erp-brasil-2026/), [Inter Developers](https://developers.inter.co/), [Santander Developers](https://developer.santander.com.br/) (403). Status geral: [Disponível] para Inter/BTG/Sicoob/BB; [Depende de contrato] para Itaú/Safra/Santander.

### 2.5 Agregadores, contas digitais PJ e ERPs

| Provedor | O que entrega | Preço público | Status |
|---|---|---|---|
| **Pluggy** (ITP regulado pelo BC, YC S21) | Dados OF (saldos, extrato categorizado, cartões) + Pagamentos (iniciação Pix, QR, links, Pix recorrente); webhooks; sandbox; trial 14 dias em produção | **Dados a partir de R$ 2.500/mês; Pagamentos a partir de R$ 500/mês**; excedente por requisição | [Disponível] — caro para uma conta só |
| **Belvo** | Dados + iniciação de pagamentos (autorizada set/2022, lançada mar/2023) | Sob consulta | [Disponível] |
| **Klavi** | Dados para crédito; operava OF regulado via **Iniciador** (dez/2023) enquanto aguardava licença própria | Sob consulta | [Disponível] |
| **Iniciador** | ITP (iniciação de pagamentos) | Sob consulta | [Não verificado – preços] |
| **Celcoin** | BaaS + OF + **pagamento de contas/DDA** (2.600–5.900 convênios) | Rebate transacional; exige ser cliente BaaS | [Depende de contrato] |
| **Cora** | Conta PJ; API de extrato, saldo, boleto c/ Pix (R$ 0,50), carnês 24x, pagamento de boletos por código de barras, DARF/GPS, TED, webhooks | **Cora Pro R$ 44,90/mês** libera a API | [Disponível] |
| **Asaas** | Conta PJ + API completa (ver 7) | Sem mensalidade; por transação | [Disponível] |
| **Conta Azul Pro** | Open Finance com Sicoob, Nubank, BB, Bradesco, Inter, C6, **Itaú, Santander**, Sicredi, Caixa; importação **D-1**; consentimento 3–12 meses | Plano do ERP | [Disponível] |
| **Nibo** | Conciliador Open Finance (>20 instituições), modo contador, exporta p/ 50+ sistemas contábeis | Sob consulta | [Disponível] |
| **Omie** | Pix via API Itaú (integrador autorizado no bankline) | Plano do ERP | [Disponível] |
| **Kamino** | Contas a pagar automatizadas (captura de boletos, **alçadas de aprovação**, pagamento em lote Pix/TED), conciliação com 50+ bancos, cartões corporativos, API REST | Sob consulta; alvo R$ 5–100 M/ano | [Disponível] |

Fontes: [Pluggy – Preços](https://www.pluggy.ai/precos) (acesso 14/09/2026), [Securo sobre Pluggy](https://blog.usesecuro.com/post/pluggy-quanto-custa-usar-api-open-banking), [LatamFintech – Belvo 02/03/2023](https://www.latamfintech.co/articles/open-finance-platform-belvo-now-offers-payment-initiation-service-in-brazil), [Startups – Klavi 22/12/2023](https://startups.com.br/negocios/fintech/klavi-agora-tem-a-chave-do-open-finance-regulado/), [Celcoin – pagamento de contas](https://www.celcoin.com.br/solucoes/pagamento-de-contas/), [Cora Developers](https://developers.cora.com.br/), [Cora – integração direta](https://www.cora.com.br/blog/integracao-direta-cora/), [Conta Azul – Open Finance](https://ajuda.contaazul.com/hc/pt-br/articles/22052814567565-Open-Finance-como-funciona-a-integra%C3%A7%C3%A3o-na-Conta-Azul), [Nibo Conciliador](https://www.nibo.com.br/conciliador-open-finance), [Kamino](https://www.kamino.com.br/).

### 2.6 Dá para uma empresa pequena usar?

Sim, em três caminhos, do mais barato ao mais robusto:
1. **API do próprio banco**: Itaú via gerente (extrato + Pix + boleto híbrido) — custo em tarifas bancárias, sem terceiro; Inter em autoatendimento e sem custo se parte do fluxo migrar para lá.
2. **ERP com Open Finance embutido** (Conta Azul/Nibo, ~R$ 100–300/mês) para extrato D-1 de Itaú/Santander/Inter/Nubank/Safra via consentimento — exportando CSV/API para o app.
3. **Agregador direto** (Pluggy) só se quiser consolidar várias contas (Itaú, Safra, sócios) com webhooks em tempo real — R$ 2.500/mês é desproporcional para uma clínica pequena.
Requisitos comuns: consentimento renovado a cada 3–12 meses; para o Itaú, certificado/mTLS e representante legal.

---

## 3. Adquirência Rede/Itaú e alternativas

### 3.1 Rede

- **e.Rede (API de e-commerce) [Disponível]**: autorização/captura, **tokenização**, **recorrência**, 3DS; credenciais **PV + token** geradas no Portal Developers (sandbox) e no Portal e.Rede (produção); SDKs oficiais no GitHub (PHP atualizado em maio/2024; Node/Python em dez/2022; módulo Magento 2 em out/2024; módulos WooCommerce/PrestaShop/OpenCart descontinuados). Fontes: [GitHub DevelopersRede](https://github.com/DevelopersRede), [HubSoft – e.Rede Itaú](https://wiki.hubsoft.com.br/modulos/configuracao/integracao/cartao/erede_itau). O portal [developer.userede.com.br](https://developer.userede.com.br/) bloqueou o acesso (403).
- **Conciliação via API/EDI [Depende de contrato]**: a Rede disponibiliza extrato eletrônico (vendas, pagamentos/liquidações, ajustes, cancelamentos, antecipações) para ERPs e conciliadoras; a software house cadastra a empresa (razão social, CNPJ, código do estabelecimento) e o **representante autoriza o acesso no site da Rede** (portal meu.userede.com.br); credenciais ClientID/Secret são da Rede. Fontes: [Citel – conciliação Redecard API](https://documentacao.citelsoftware.com.br/fazer-conciliacao-automatica-de-cartoes-redecard-api-erp-autcom-doc-9/), [Adaptive – Conciliação REDE API](https://wiki.adaptive.com.br/pt-br/Adaptive-Business/Financeiro/Movimenta%C3%A7%C3%A3o/Habilitar-Conciliacao-de-cartoes-REDE-API), [Conciliadora – API](https://doc.conciliadora.com.br/) (suporta Cielo, Rede, Amex; API key; 2 req/s).
- **Antecipação (RAV / antecipação automática em 1 dia útil), pagamento por WhatsApp, link de pagamento**: constam como regulamentos/documentos no portal de atendimento da Rede ([Rede – documentos](https://www.userede.com.br/atendimento/documentos)); contratação pelo portal/app. **Não encontrei API pública de RAV** — [Não verificado].

### 3.2 Registro de recebíveis (CERC/B3/Núclea) — o que mudou

Desde 2021 toda agenda de cartões é registrada em registradoras homologadas (B3, CERC, Núclea), condição para validade das cessões e prevenção de dupla oneração. A **Res. BCB 514/2025 (21/10/2025)** ajustou a Res. 264/2022: procedimentos de **cancelamento de antecipação pré-contratada**, uso obrigatório das informações para **conciliação com sistemas de liquidação centralizada**, tarifas e análise da convenção. Vigência: **05/01/2026** (cancelamento, tarifas, comunicação) e **11/05/2026** (conciliação). Efeito para o lojista: mais autonomia sobre fluxos e segurança para antecipar com terceiros. Fontes: [Okai](https://okai.com.br/artigo/o-banco-central-aperfeicoa-o-registro-de-recebiveis-o-que-muda-com-a-resolucao-bcb-no-514-2025), [LegisWeb – Res. 514](https://www.legisweb.com.br/legislacao/?id=485366), [Antecipa Fácil](https://antecipafacil.com.br/financiadores/artigos/registro-de-recebiveis-cerc-b3), [BCB – Convenção entre registradoras](https://www.bcb.gov.br/content/estabilidadefinanceira/spb_docs/convencoes/Conven%C3%A7%C3%A3o%20entre%20Entidades%20Registradoras%20-%20Receb%C3%ADveis%20de%20Arranjos%20de%20Pagamento.pdf).

### 3.3 Alternativas com conciliação por API

| Adquirente/PSP | Conciliação | Taxas públicas (set/2026) | Fontes |
|---|---|---|---|
| **Cielo** | Extrato Eletrônico EDI v15.15 (19/05/2026): vendas, pagamentos, negociações, saldo em aberto, eventos Pix; API só para conciliadoras (OAuth) | — | [Cielo EDI](https://developercielo.github.io/tutorial/edi-extrato-eletronico) |
| **Stone / Pagar.me** | POS e gateway na mesma conta; Conta Stone com API | Sob consulta | [Stone Open Banking docs](https://docs.openbank.stone.com.br/), [Pagar.me](https://pagar.me/precos/) (taxas não públicas) |
| **Mercado Pago** | Relatórios de **Liberações**, **Dinheiro em Conta**, Faturamento e Vendas com Split, via API/CSV/JSON | — | [Mercado Pago – Relatórios](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/reports/introduction) |
| **InfinitePay** | InfiniteNitro: antecipação em 6 s, inclusive de **outras maquininhas via Open Finance** | Pix 0 %, débito 1,37 %, crédito 1x 3,15 %, 12x antecipado 12,40 % | [Calculadora de Taxas, set/2026](https://www.calculadoradetaxas.com.br/marcas/infinitepay-vs-stone) |
| **PagBank** | API | — | [Tecnospeed – APIs de bancos](https://blog.tecnospeed.com.br/api-de-bancos-brasileiros/) |
| **Asaas Tap** | Mesma conta/API do Asaas | Débito 1,25 %; crédito à vista 2,99 %; 2–21x 3,49–4,29 % | [Asaas – preços](https://www.asaas.com/precos-e-taxas) |

Conciliadoras SaaS (Conciliadora, Concil, F360, Equals) atendem qualquer porte, preços sob consulta ([Conciliadora](https://conciliadora.com.br/), [Concil](https://www.concil.com.br/blog/solucao-em-conciliacao-de-cartoes-4-diferenciais-que-concil-oferece/), [F360](https://f360.com.br/blog/financas/software-de-conciliacao-de-cartoes/)).

---

## 4. Notas fiscais

### 4.1 NFS-e Nacional, ADN e São Paulo

- **Padrão nacional**: o portal [gov.br/nfse](https://www.gov.br/nfse/pt-br) oferece o **Emissor Nacional** (nfse.gov.br/EmissorNacional), o **ADN** e **API/webservices** para sistemas próprios (DPS assinada com certificado digital). Municípios tinham até **1º/01/2026** para aderir (LC 214/2025), sob pena de suspensão de transferências voluntárias; 3.413 municípios em 2025. Para **Lucro Presumido/Real não há prazo nacional** — depende do município. Fontes: [Contábeis 30/06/2026](https://www.contabeis.com.br/artigos/77741/nfs-e-nacional-obrigatoriedade-prazos-e-impacto-contabil/), [Notaas 10/09/2026](https://www.notaas.com.br/blog/post/api-nfse-nacional-melhor-provedor-emissao-nota-fiscal-de-servico-eletronica-nacional).
- **São Paulo**: Emissor Nacional **obrigatório para Simples Nacional a partir de 1º/11/2026** (adiado de 1º/09; Res. CGSN 189/2026 e 191/2026) e para **profissionais liberais/autônomos a partir de 1º/01/2027** (IN SF/SUREM 7/2026, DOM 31/07/2026; adiado de 03/08/2026). A partir dessas datas o sistema municipal fica só para consulta/emissões retroativas **para esses contribuintes**. **Empresas fora do Simples não são mencionadas** — permanecem no emissor municipal (Nota do Milhão) e webservice; a Tecnospeed registra que "São Paulo manterá emissor próprio". Fontes: [Prefeitura SP – uso do Emissor Nacional](https://prefeitura.sp.gov.br/web/fazenda/w/usoemissornacional), [Contábeis 78636](https://www.contabeis.com.br/noticias/78636/sao-paulo-adia-nfs-e-obrigatoria-para-autonomos-para-2027/), [TOTVS](https://www.totvs.com/blog/fiscal-clientes/sao-paulo-reforca-obrigatoriedade-da-nfs-e-nacional-para-empresas-do-simples-nacional/), [Tecnospeed 23/06/2026](https://blog.tecnospeed.com.br/nfs-e-sao-paulo-layout-para-adequacao-a-reforma-tributaria/). **Conclusão para a clínica (Ltda, Lucro Presumido): continua no webservice municipal de SP; acompanhar decisão futura do município.**
- **Layout municipal SP desde 1º/01/2026**: Layout 1 (só ISS) ou **Layout 2 (ISS + IBS + CBS, com CST e cClassTrib)**, ambos por online/webservice; **emissão por TXT desativada**; 2026 é ano-teste com preenchimento opcional no municipal. Fonte: [Prefeitura SP – orientações 2026](https://prefeitura.sp.gov.br/web/fazenda/w/nfs-e_orientacoes).

### 4.2 Reforma Tributária (IBS/CBS) e serviços médicos

- **2026**: ano-teste com **CBS 0,9 % + IBS 0,1 %** destacados; contribuintes em conformidade dispensados de recolher (LC 214/2025). **Ato Conjunto RFB/CGIBS 04/2026** adiou o **destaque obrigatório na NFS-e (padrão nacional) de 03/08/2026 para 1º/10/2026** no regime regular; Simples em **1º/01/2027**; documentos sem os campos são rejeitados. Fonte: [LegisWeb 31/07/2026](https://www.legisweb.com.br/noticia/?id=34071). **Confirmar com a contabilidade se essa obrigatoriedade alcança o emissor municipal de SP** (Layout 2) — [Depende de confirmação].
- **2027**: CBS plena, extinção de PIS/Cofins; **2029–2033**: transição do IBS (ISS/ICMS). Fonte: [Unicred 06/02/2026](https://unicred.com.br/blog/pessoa-juridica/reforma-tributaria-2026-o-que-muda-para-medicos-e-profissionais-da-saude/), [Conta Azul](https://contaazul.com/blog/reforma-tributaria/).
- **Redução de 60 %** de IBS/CBS para serviços hospitalares, médicos e ambulatoriais e exames (Anexo da LC 214/2025); **clínicas estéticas podem não ser contempladas** (controvérsia); **redução de 30 %** para profissões regulamentadas (médico PF/sociedade uniprofissional); clínicas passam a tomar **crédito** sobre insumos e serviços. Fontes: [Contábeis 01/09/2025](https://www.contabeis.com.br/artigos/72593/reforma-tributaria-reducao-de-60-no-ibs-cbs-para-saude-e-dispositivos-medicos/), [Assecon](https://asseconcontabilidade.com.br/reforma-tributaria-para-clinicas-medicas/), [Grupo Advance](https://grupoadvance.com.br/ibs-e-cbs-na-saude/). Split payment (recolhimento na liquidação) está na agenda BC 2026–2027 ([Matera](https://www.matera.com/br/blog/pix-parcelado/)).

### 4.3 APIs para emitir a NFS-e do paciente [Disponível]

| Provedor | Preço público | Cobertura | Fonte |
|---|---|---|---|
| **Focus NFe** | Solo **R$ 89,90/mês** (1 CNPJ, 100 notas, R$ 0,10 excedente); Start R$ 113,90 (3 CNPJ); Growth R$ 548 (4.000 notas); inclui **recebimento de NF-e/CT-e/NFS-e Nacional**; MDe com trial 30 dias | NFS-e em >3.000 municípios (SP incluso) | [focusnfe.com.br/precos](https://focusnfe.com.br/precos/) (14/09/2026) |
| **NFE.io** | Base **R$ 190/mês** (250 notas), Growth R$ 265 (500), Scale R$ 375 (1.000); anual Initial R$ 1.075/ano (100/mês); API + e-mail ao cliente | Nacional e municipal | [nfe.io/precos](https://nfe.io/precos/emissao-nfse/) |
| **PlugNotas (Tecnospeed)** | Sob consulta | NFS-e nacional + 2.200 municípios; webhooks com retry; certificado gerenciado | [PlugNotas](https://tecnospeed.com.br/en/plugdfe/plugnotas/) |
| **eNotas** | Planos mensal/anual (−25 %), valores dinâmicos no site; garantia 30 dias | Centenas de prefeituras | [enotas.com.br/precos](https://enotas.com.br/precos) |
| **Nuvem Fiscal** | Site inacessível nesta sessão | NFS-e/NF-e + Distribuição DF-e | [dev.nuvemfiscal.com.br](https://dev.nuvemfiscal.com.br/docs/) [Não verificado] |
| **Notaas** | Freemium 50 notas/mês com webhooks | ADN nacional | [Notaas](https://www.notaas.com.br/blog/post/api-nfse-nacional-melhor-provedor-emissao-nota-fiscal-de-servico-eletronica-nacional) (peça promocional) |

**Certificado A1 e-CNPJ (12 meses): R$ 149,90–235** ([CertDigitais 2026](https://certificadodigitais.com.br/artigos/quanto-custa-certificado-digital-2026/), [Omie 2026](https://www.omie.com.br/blog/qual-e-o-valor-do-certificado-digital-a1-e-a3-em-2026/), [Alvo R$ 149,90](https://aralvo.com.br/product/certificado-digital-e-cnpj-a1-2/)).

**Emitir automaticamente ao fechar a comanda**: viável hoje — Edge Function envia JSON (tomador CPF, descrição, código de serviço, valores; duas notas por paciente ou unificada, conforme sua regra) ao provedor, recebe webhook com PDF/XML, grava na comanda e dispara template de utilidade + e-mail. O provedor cuida da assinatura com o A1 e do webservice de SP.

### 4.4 Receber notas de fornecedores

- **NF-e (produtos)**: **Distribuição DF-e / Manifestação do Destinatário** — Focus NFe MDe captura automaticamente XMLs emitidos contra o CNPJ, manifesta (ciência/confirmação/desconhecimento), guarda 5 anos, webhooks ([Focus MDe](https://focusnfe.com.br/produtos/manifestacao-destinatario-mde/), [Focus – manifestar](https://doc.focusnfe.com.br/reference/manifestar_nfe_recebida)); Tecnospeed rota `/nfe/consulta` com origem=2 ([Tecnospeed](https://atendimento.tecnospeed.com.br/hc/pt-br/articles/360009557213-Rota-da-API-Consultar-Distribui%C3%A7%C3%A3o-DFe-NF-e)); Nuvem Fiscal Distribuição NF-e ([doc](https://dev.nuvemfiscal.com.br/docs/distribuicao-nfe/)). Exige o A1 da clínica. [Disponível]
- **NFS-e de fornecedores (serviços)**: no padrão nacional, os planos da Focus incluem "recebimento de NFS-e Nacional"; para NFS-e municipais de SP, a consulta de notas recebidas é pelo sistema da Prefeitura (conhecimento geral). PDFs/DANFE por e-mail: como a clínica usa Microsoft 365, a leitura da caixa via Microsoft Graph (anexos XML/PDF → `fin_inbox_item`) é o caminho natural (abordagem técnica).

---

## 5. Boletos e contas a pagar

| Necessidade | Como fazer por API | Status | Fontes |
|---|---|---|---|
| **DDA (listar boletos contra o CNPJ)** | Itaú (DDA consta na API, via gerente); C6 (DDA); **Celcoin** (listar boletos por CPF/CNPJ, notificar e pagar — só para clientes BaaS, modelo de rebate); **Kamino** (captura automática de boletos + alçadas) | [Depende de contrato] | [KMEE](https://kmee.com.br/blog/comparativo-apis-bancarias-erp-brasil-2026/), [Celcoin](https://www.celcoin.com.br/solucoes/pagamento-de-contas/), [Kamino](https://www.kamino.com.br/) |
| **Ler linha digitável / consultar boleto** | Celcoin *Authorize* (beneficiário, valor, vencimento, janelas); Inter/Cora "pagamento por código de barras" retornam dados; o app já tem leitor | [Disponível] | [Celcoin docs](https://developers.celcoin.com.br/docs/pagamento-de-contas-1) |
| **Pagar boleto por API** | **Inter** (autoatendimento, sem custo de setup), **Cora** (Cora Pro R$ 44,90/mês; boletos, DARF/GPS, TED), **Asaas** (pagamento de contas **grátis**), Celcoin (autorizar → reservar → capturar em 30 min; janela 7h–23h), Transfeera (sandbox sob pedido; preços não públicos) | [Disponível] | [Inter](https://developers.inter.co/), [Cora](https://developers.cora.com.br/), [Asaas preços](https://www.asaas.com/precos-e-taxas), [Transfeera 15/12/2025](https://transfeera.com/blog/api-de-boleto/) |
| **Agendamento** | Itaú PJ agenda até 1 ano antes e no máximo 1 dia antes do vencimento; Inter/Cora aceitam pagamento agendado | [Disponível] | [Itaú](https://www.itau.com.br/atendimento-itau/para-empresas/pagamentos/quais-pagamentos-possuem-servico-de-agendamento-da-conta-empresarial) |
| **Aprovação em dois passos** | Kamino (alçadas por valor/centro de custo); no app: "senha do gestor" + segunda aprovação antes de chamar a API do banco; internet banking Itaú tem alçadas nativas (conhecimento geral) | [Disponível] | [Kamino](https://www.kamino.com.br/) |
| **"Contas a pagar automáticas" em escritórios (2026)** | Nibo (Open Finance + modo contador), Conta Azul Pro (OF D-1, 10 bancos), Omie (Pix Itaú), BPO com Kamino/F360 | [Disponível] | [Nibo ajuda](https://ajuda.nibo.com.br/pt-BR/articles/11364850-saiba-tudo-sobre-o-nibo-conciliador-open-finance), [Conta Azul](https://ajuda.contaazul.com/hc/pt-br/articles/22061571693837-Open-Finance-como-autorizar), [BPO Space](https://blog.bpospace.com.br/post/melhor-erp-para-bpo-financeiro-5-dicas) |

---

## 6. Saúde: sistemas, regulação e assinatura

### 6.1 iClinic (destino da migração) — [Sem API pública verificada]

A documentação pública ([docs.iclinic.com.br v1.3.0](https://docs.iclinic.com.br/)) contém **apenas modelos de importação de dados** (Paciente, Prontuário, Agendamento, Anexo) — nenhum endpoint REST, autenticação ou webhook; `developers.iclinic.com.br` não existe; a página de integrações retorna 404; a central de suporte lista módulos (Agenda, Faturamento TISS, Finanças, Comunicação com paciente) sem seção de API ([suporte.iclinic.com.br](https://suporte.iclinic.com.br/pt-BR/)). **Ação recomendada**: exigir do iClinic/Afya, no contrato de migração, acesso a API de parceiro ou exportações agendadas; planejar o app para operar com CSV de agenda/financeiro.

### 6.2 Feegow (origem) — [Disponível]

API REST pública v1.0 ([docs.feegow.com](https://docs.feegow.com/), `api.feegow.com/v1/api/...`), token gerado pelo usuário master e enviado em `x-access-token`; grupos: **Agendamentos**, Bloqueios, Cartão de Benefício, Convênios, Empresa, Especialidades, Estoque, **Faturamento (guias TISS)**, **Financeiro** (contas, pagamentos, fornecedores; `financial/invoice/create`), Funcionários, Laudos, **Pacientes**, Procedimentos, Profissionais, Propostas, Relatórios; pacote Node oficial ([GitHub](https://github.com/feegow/feegow-public-api-node-package)); ">200 funções"; integração nativa com **Doctoralia** (agenda e preços sincronizam a partir do Feegow). Webhooks não documentados. Fontes: [Feegow – interoperabilidade](https://feegowclinic.com.br/destaques/interoperabilidade), [Ajuda Feegow – Doctoralia](https://ajuda.feegow.com/support/solutions/articles/67000749754-integrac%C3%A3o-doctoralia-e-feegow), [Chatlabs – confirmação de agenda Feegow + WhatsApp](https://www.chatlabs.com.br/feegow-clinic-whatsapp-api).

### 6.3 Doctoralia e TISS/TUSS

Doctoralia integra nativamente com Feegow ([Doctoralia Pro](https://pro.doctoralia.com.br/produto/agenda/integracao-para-clinicas)); não encontrei API aberta para terceiros. Para clínica particular sem convênios, TISS/TUSS importam apenas para o **reembolso** que o paciente pede ao plano (recibo/NF com CPF, CRM e descrição, idealmente com código TUSS) — iClinic e Feegow têm módulos TISS (conhecimento geral; não verificado nesta pesquisa).

### 6.4 CFM: telemedicina, prontuário, publicidade

- **Telemedicina**: a Res. CFM 2.314/2022 continua sendo o marco (teleconsulta, teleinterconsulta, telediagnóstico, consentimento, prontuário eletrônico seguro, sigilo); **nenhuma resolução substitutiva de 2025–2026 foi encontrada** nas fontes. Fontes: [CFM 2.314/2022 (PDF)](https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2022/2314_2022.pdf), [iClinic blog 25/09/2025](https://iclinic.com.br/blog/telemedicina-cfm-novas-normas/), [Doctoralia Pro](https://pro.doctoralia.com.br/blog/clinicas/telemedicina-o-que-diz-a-lei-brasileira).
- **Publicidade**: Res. CFM 2.336/2023, vigente desde 11/03/2024 (ver 1.9).
- **Prontuário eletrônico**: guarda e digitalização seguem a Res. CFM 1.821/2007 (certificação SBIS/CFM para eliminar papel) — conhecimento geral, não verificado nesta pesquisa.

### 6.5 LGPD e ANPD (2025–2026)

- **Agenda Regulatória ANPD 2025–2026**: 16 temas, com **dados de saúde e biometria** como prioridade; meta de **10 ações de fiscalização até o fim de 2026** envolvendo saúde, biometria e dados financeiros (Res. CD/ANPD 30 e 31/2025); Res. CD/ANPD 18/2024 (encarregado/DPO) e 15/2024 (comunicação de incidente em **3 dias úteis**). Fontes: [HDPO](https://hdpo.com.br/fiscalizacao-de-dados-de-saude-anpd-2026/), [Migalhas 06/03/2026](https://www.migalhas.com.br/quentes/451314/anpd-amplia-rigor-sobre-dados-de-saude-e-biometria-alerta-advogada), [CTS](https://ctsconsultoria.com.br/agenda-regulatoria-anpd-2025-2026-lgpd/).
- **Obrigações práticas para a clínica**: mapeamento de dados; **RIPD** para tratamentos de alto risco (prontuário, WhatsApp com pacientes, IA); base legal preferencialmente **tutela da saúde** (art. 11) em vez de consentimento para o assistencial, e **consentimento/opt-in** para marketing; DPO com autonomia real; contratos com operadores (Meta, Supabase, Vercel, BSP, provedor de NFS-e) com cláusulas de segurança, finalidade e exclusão; teste do protocolo de incidente em 3 dias. Fonte: [Migalhas – bases legais em saúde](https://www.migalhas.com.br/depeso/449916/tratamento-de-dados-em-saude-bases-legais-limites-e-boas-praticas).

### 6.6 Assinatura eletrônica — assinar o contrato dentro do app [Disponível]

Base legal: MP 2.200-2/2001 e Lei 14.063/2020 — **assinatura avançada (sem ICP-Brasil) vale para contratos privados**; ICP-Brasil (qualificada) é opcional.

| Plataforma | Planos (público) | API / WhatsApp | Fonte |
|---|---|---|---|
| **SuperSign** (já usada) | Grátis 3 docs/mês; Essencial WhatsApp **R$ 34,90/mês** (R$ 27,90 anual); 3 usuários | **API REST v4** em português, webhooks, idempotência, envio por WhatsApp/e-mail, templates, validador; docs em docs.supersign.com.br; suporte humano | [SuperSign API](https://supersign.com.br/api-assinatura-digital-parcerias/), [Comparativo 04/06/2025, atual. 08/02/2026](https://supersign.com.br/blog/comparativo-supersign-vs-d4sign-zapsign-clicksign/) |
| **ZapSign** | Individual grátis (3 docs); Profissional R$ 29,90–149,90/mês; Team R$ 49,90–259,90; Enterprise a partir de R$ 500 | API: WhatsApp **R$ 0,50/envio**, SMS R$ 0,10, **certificado digital R$ 0,50/assinatura**, verificação avançada R$ 1,50–5,00; excedente R$ 2,50/doc | [zapsign.com.br/precos](https://zapsign.com.br/precos) (14/09/2026) |
| **Clicksign** | Start R$ 39/mês (5 usuários); WhatsApp nativo | API nos planos | [SuperSign comparativo](https://supersign.com.br/blog/comparativo-supersign-vs-d4sign-zapsign-clicksign/) |
| **D4Sign** | Starter R$ 39,90/mês; WhatsApp via módulo | API | idem |
| **Gov.br** | Gratuito | **Só órgãos públicos** podem integrar a API (exige Login Único; conta prata/ouro) | [Gov.br – assinatura para órgãos](https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica/assinatura-eletronica-para-orgaos), [Manual de integração](https://manual-integracao-assinatura-eletronica.servicos.gov.br/pt-br/7.9/iniciarintegracao.html) |

---

## 7. Pagamentos do paciente

### 7.1 Pix com QR dinâmico e conciliação automática

| Provedor | Como | Custo | Status |
|---|---|---|---|
| **Itaú API Pix** | QR dinâmico com `txid` por comanda; webhook de recebimento; dinheiro cai na própria conta | Tarifa bancária (não verificada); habilitação via gerente/mTLS | [Depende de contrato] |
| **Inter** | Pix Cobrança + webhooks; autoatendimento | Sem custo de setup | [Disponível] (requer conta Inter) |
| **Asaas** | Cobrança Pix + webhook; notificações WhatsApp | **R$ 1,99/Pix** (promo R$ 0,99 por 3 meses) | [Disponível] |
| **Stripe** | Pix **1,19 %** (só por convite); cartão 3,99 % + R$ 0,39; boleto R$ 3,45; Billing 0,7 % | [Disponível/convite] | [Stripe BR pricing](https://stripe.com/br/pricing) |
| **Pagar.me** | Split, recorrência com boleto, Pix | Sob consulta | [Disponível] |
| **Cora** | Boleto + Pix QR R$ 0,50 | Cora Pro R$ 44,90/mês | [Disponível] |

Fontes: [Asaas preços](https://www.asaas.com/precos-e-taxas), [Asaas docs](https://docs.asaas.com/) (cobranças, Pix Automático/assinaturas, split, links, pagamento de contas, tokenização, WhatsApp, NF, webhooks, sandbox), [FWC – gateways 2026](https://fwctecnologia.com/en/blog/post/payment-gateways-brazil-comparison-2026) (banco direto 0,22–0,28 % com homologação por banco vs. PSP 0,28–0,99 % com conciliação pronta).

### 7.2 Link de pagamento, tokenização, split e recorrência

- **Link de pagamento**: Asaas (mesmas taxas do cartão: à vista **2,99 % + R$ 0,49**; 2–6x 3,49 %; 7–12x 3,99 %; 13–21x 4,29 %; promoções menores nos 3 primeiros meses), Rede (portal/app; API não verificada), Stripe Payment Links, Pagar.me.
- **Tokenização/recorrência no cartão**: e.Rede (tokenização + recorrência), Asaas (tokenização), Stripe/Pagar.me (Stripe com network tokens). Fonte: [Mind Group 07/2026](https://mindconsulting.com.br/2026/07/gateways-pagamento-online-brasil-comparativo-2026/).
- **Split**: Asaas, Pagar.me, Mercado Pago (relatório de split). 
- **Recorrência sem cartão**: **Pix Automático** via Asaas/Itaú/Inter/Pagar.me/Stripe (ver 2.2).
- **Antecipação**: Asaas cartão a partir de **1,25 %/mês**, boleto 5,79 %/mês; Rede RAV/antecipação automática; InfinitePay Nitro (inclusive de outras adquirentes via Open Finance).

### 7.3 Crediário / BNPL para saúde

| Provedor | Modelo | Para a clínica | Status | Fonte |
|---|---|---|---|---|
| **ParcelaMais** | Financiamento em **até 36x**; análise simultânea em 3 financeiras (Parcelex, Brasil Card, SRM — política própria para saúde) | **Recebe o valor integral à vista**, sem risco de inadimplência; saúde, odonto, estética, veterinária; onboarding + treinamento | [Disponível, contrato] | [ParcelaMais](https://www.parcelamais.com.br/services/financiamento) |
| **Dr.Cash** | **Boleto parcelado em até 24x** | **Repasse em 48 h**, "sem risco de inadimplência"; taxas não públicas | [Disponível, contrato] | [Dr.Cash](https://drcash.com.br/) |
| **Banco BV – Financiamento Saúde** | Até **R$ 30 mil** para procedimentos | Recebe em 48 h | [Disponível, credenciamento] | [BV](https://www.bv.com.br/web/portal/financiamento/saude) |
| **Koin** | Pix/boleto parcelado (BNPL), até 12x sem cartão; checkout/API | Foco e-commerce/televendas | [Disponível] | [Koin empresas](https://empresas.koin.com.br/bnpl) |
| **Provu** | Crédito pessoal/BNPL | Site inacessível nesta sessão | [Não verificado] | — |
| **Asaas carnê/boleto parcelado**, **Cora carnê 24x** | Parcelamento emitido pela clínica | Risco fica com a clínica | [Disponível] | [Asaas](https://blog.asaas.com/api-de-boleto/), [Cora](https://developers.cora.com.br/) |

---

## 20 ideias concretas para o app da clínica

Selos: **Pronto** (dá para implementar agora com o que existe) · **Beta** (recurso novo/liberação gradual ou dependente de aprovação da Meta) · **Depende de homologação** (gerente, certificado, contrato comercial).

1. **Lembrete + confirmação de consulta com botões** — Edge Function agendada lê a agenda (hoje via API Feegow; no iClinic via exportação) e dispara template de utilidade D-1 e H-3 com "Confirmar/Remarcar"; a resposta atualiza o status e alimenta o Kanban. Provedor: Cloud API direta da Meta. Custo: ~R$ 0,03/msg fora de janela (grátis dentro). **Pronto.**

2. **Coexistência no número da recepção** — conectar o número atual do WhatsApp Business App à Cloud API para automatizar sem tirar o celular da recepção; mensagens espelhadas nos dois lados. Provedor: Meta (ou 360dialog). Custo: só as mensagens. Restrição: incompatível com selo OBA/Groups API/Calling. **Pronto.**

3. **NPS via WhatsApp Flows** — tela nativa (0–10 + comentário) enviada após o atendimento, gravando em `nps_resposta` e no `/concierge/nps`; substitui o totem para quem não respondeu. Provedor: Meta Flows. Custo: 1 template de utilidade por paciente. **Pronto (Flow exige aprovação da Meta).**

4. **Nota fiscal e recibo automáticos ao fechar a comanda** — Edge Function emite a(s) NFS-e no webservice municipal de SP via Focus NFe (Solo R$ 89,90/mês) ou NFE.io (R$ 190/mês), recebe PDF/XML por webhook e envia por template de utilidade + e-mail; usa a regra "2 notas por paciente ou unificada" já definida. Custo extra: A1 e-CNPJ R$ 150–235/ano. **Pronto / Depende de certificado.**

5. **Comprovantes lidos automaticamente** — trocar o grupo informal por (a) grupo criado via Groups API (até 8 pessoas; exige OBA) ou (b) encaminhamento 1:1 para o número da clínica; o webhook baixa a mídia, um modelo de visão extrai valor/data/E2E e o app casa com o extrato Itaú e a comanda. Provedor: Meta + Claude API. Custo: centavos por comprovante. **Beta (Groups API nova; OBA depende da Meta).**

6. **Pix dinâmico por comanda com conciliação instantânea** — QR/copia-e-cola gerado pela API Pix do Itaú com `txid` da comanda; webhook marca "pago" e alimenta o Lucro Inteligente em D+0; opcionalmente exibido dentro do WhatsApp via `order_details` (Payments API BR). Alternativa sem gerente: Asaas (R$ 1,99/Pix) ou Inter (grátis). **Depende de homologação (Itaú) / Pronto (Asaas/Inter).**

7. **Extrato bancário automático** — substituir o leitor xlsx pela API de extrato do Itaú (via gerente) para os 4 caixas; fallback: Open Finance por ERP (Conta Azul/Nibo, ~R$ 100–300/mês, D-1) exportando para o app; Pluggy (R$ 2.500/mês) só se consolidar Itaú + Safra + contas dos sócios. **Depende de homologação.**

8. **Conciliação Rede automática (vendas × liquidações × taxas × antecipações)** — habilitar a API/EDI de conciliação da Rede (autorização no portal meu.userede) e cruzar com o "fechamento sem comanda" dia a dia; alternativa via conciliadora (Conciliadora/F360). Custo: sob consulta (frequentemente incluso na relação com a Rede). **Depende de homologação.**

9. **Painel de custo de antecipação com escolha de financiador** — comparar RAV Rede × Asaas (1,25 %/mês) × InfinitePay Nitro (antecipa recebíveis de outras maquininhas via Open Finance) usando a agenda registrada (Res. BCB 514/2025, vigente desde 05/01 e 11/05/2026); integra ao "custo de antecipação TAD" do Lucro Inteligente. **Pronto (decisão contratual).**

10. **Contas a pagar com pagamento por API e dupla aprovação** — Fila do dia dispara pagamento de boletos via Inter (grátis, autoatendimento), Cora Pro (R$ 44,90/mês) ou Asaas (grátis) depois de "senha do gestor" + segunda aprovação; agendamento e comprovante voltam por webhook. DDA automático via Itaú (gerente) ou Kamino. **Pronto (Inter/Cora/Asaas) / Depende de homologação (DDA Itaú).**

11. **Captura automática de notas de fornecedores** — MDe/Distribuição DF-e (incluso nos planos Focus NFe; trial 30 dias) cria `fin_inbox_item` com XML/PDF e preenche a conta a pagar; leitura da caixa do Outlook via Microsoft Graph para NFS-e em PDF. Reduz os 302 "SEM_NOTA". **Pronto.**

12. **Preparação IBS/CBS na emissão** — incluir CST e cClassTrib (Layout 2 de SP), aplicar a redução de 60 % para serviços médicos e sinalizar itens estéticos como "controvérsia"; destaque obrigatório no padrão nacional desde 1º/10/2026 e CBS plena em 2027. Provedor: o mesmo da NFS-e. **Pronto para preparar / Anunciado (vigência).**

13. **Pix Automático para planos e programas em parcelas** — o paciente autoriza uma vez no banco dele; a clínica cobra mensalmente sem cartão. Provedor: Asaas (R$ 1,99/cobrança) ou Itaú/Inter API. **Beta (JSR PJ/Automático em produção desde 22/04/2026; adoção em curva).**

14. **Link de pagamento e cartão tokenizado para sinal e parcelas** — link enviado no fechamento do Kanban (Asaas 2,99 % + R$ 0,49 à vista; parcelado 3,49–4,29 %) ou e.Rede com tokenização/recorrência nas taxas da Rede; webhook cria comanda + comprovante. **Pronto.**

15. **Crediário sem risco no fechamento** — botão "Financiar" que abre ParcelaMais (até 36x, clínica recebe à vista) ou Dr.Cash (24x, repasse em 48 h) e, para tickets maiores, BV (até R$ 30 mil); resultado registrado no negócio do CRM. Custo: taxa embutida negociada com a financeira. **Pronto (contrato comercial).**

16. **Contrato assinado dentro do app** — ao fechar o plano, o app gera o contrato pela API da SuperSign (já em uso; a partir de R$ 34,90/mês) ou ZapSign (R$ 0,50/envio WhatsApp), envia por WhatsApp e o webhook "assinado" libera a comanda; substitui o SLA manual de 24 h do POP. **Pronto.**

17. **Espelho de agenda/paciente independente do prontuário** — hoje via API Feegow (agendamentos, pacientes, financeiro, faturamento TISS); na migração, exigir do iClinic API de parceiro ou exportações agendadas, mantendo no Supabase um espelho que o CRM e o WhatsApp consomem. **Pronto (Feegow) / Depende de negociação (iClinic).**

18. **Ligação pelo WhatsApp na régua de resgate** — Calling API para o gestor/SDR ligar do mesmo número, com permissão prévia do paciente e registro automático da tentativa no CRM; cobrado por minuto em reais desde jul/2026; limites de 1/dia e 2/semana por paciente; não funciona com coexistência. **Beta.**

19. **Agente de IA de triagem e agendamento** — próprio (Claude na Cloud API, com handoff humano e regras CFM/LGPD embutidas) ou Meta Business Agent (gratuito no início, liberação seletiva, futura assinatura); responde fora do horário, oferece horários via Flows e qualifica leads para o Kanban. **Beta.**

20. **Governança LGPD operacional** — registrar opt-in de marketing por contato (templates de marketing só com opt-in), RIPD para WhatsApp/IA/Supabase, DPO nomeado, política de retenção e protocolo de incidente em 3 dias úteis; prioridade porque a ANPD planeja 10 fiscalizações em saúde/biometria/financeiro até o fim de 2026. Custo: horas internas + assessoria. **Pronto (processo).**

---

## Itens não verificados ou pendentes de confirmação

- Valores da tabela de tarifas PJ do Itaú (PDF bloqueado) e detalhes do portal de desenvolvedores do Itaú e da Rede (conteúdo em JavaScript/403).
- Existência de API pública de RAV na Rede e de link de pagamento Rede por API.
- Preços da Iniciador, Provu, PlugNotas, eNotas, Pagar.me, Kamino, Transfeera, conciliadoras (todos "sob consulta").
- Alegações da SocialHub sobre autorização do BC ao WhatsApp Pay em jan/2026 e taxas de 0,99 % (sem fonte oficial).
- Se a obrigatoriedade de destaque IBS/CBS de 1º/10/2026 (padrão nacional) alcança o emissor municipal de SP para empresas em Lucro Presumido — confirmar com a contabilidade.
- Estado exato do Business AI da Meta para PMEs no Brasil (fontes secundárias citam março/2026; a Meta fala em "grupo seleto" em junho/2026).

## Fontes consultadas (todas acessadas em 14/09/2026; datas de publicação quando disponíveis)

**WhatsApp**: [Meta – Pricing](https://developers.facebook.com/docs/whatsapp/pricing) · [Meta – Updates to pricing](https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing) · [Meta – Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups) · [Meta – Payments API Brasil](https://developers.facebook.com/docs/whatsapp/cloud-api/payments-api/payments-br) · [Fortics 03/09/2026](https://www.fortics.com.br/mudancas-precos-whatsapp-business-api-outubro-2026/) · [Nimochat 10/01/2026 (atual. 11/09/2026)](https://www.nimochat.com.br/blog/geral/quanto-custa-api-oficial-whatsapp-waba-2026/) · [SocialHub 03/03/2026](https://www.socialhub.pro/blog/preco-whatsapp-api-2026-brasil/) · [Talkaio](https://talkaio.com/blog/quanto-custa-a-whatsapp-business-platform-o-modelo-de-cobranca-por-conversa-explicado-2/) · [Unipile ago/2026](https://www.unipile.com/whatsapp-group-api/) · [imBee](https://www.imbee.io/resource/whatsapp-groups-api-business-guide-2026) · [360dialog – Coexistence](https://docs.360dialog.com/docs/resources/phone-numbers/coexistence) · [ChakraHQ](https://chakrahq.com/article/whatsapp-business-app-api-coexistence-2026/) · [Clickmassa 31/07/2026](https://clickmassa.com.br/whatsapp-business-calling-api/) · [Voll](https://vollsolutions.com.br/whatsapp-business-calling-api/) · [InfoMoney 04/06/2026](https://www.infomoney.com.br/business/startups-meta-amplia-ia-para-empresas-com-agentes-integrados-ao-whatsapp/) · [CNN Brasil 06/06/2024](https://www.cnnbrasil.com.br/economia/negocios/whatsapp-pay-inclui-pix-e-expande-para-grandes-empresas/) · [Exame 06/06/2024](https://exame.com/invest/mercados/pix-icone-verificado-e-ia-as-novidade-do-whatsapp-para-empresas/) · [Z-API docs](https://developer.z-api.io/tips/blockednumbernew) · [Cubo Suite 25/07/2026](https://blog.cubosuite.com.br/meta-banindo-whatsapp-nao-oficial-em-2026-o-que-mudou-e-o-que-fazer) · [Notifica](https://blog.usenotifica.com.br/blog/08-top-whatsapp-bsps-brazil) · [Clint maio/2026](https://www.clint.digital/blog/automacoes-whatsapp-agendamento-clinicas-2026) · [ChatGuru](https://chatguru.com.br/blog/whatsapp-flows-o-que-e-como-funciona/) · [CFM – o que muda](https://publicidademedica.cfm.org.br/resolucao/o-que-muda) · [usebip](https://www.usebip.com/blogs/bip-insights/marketing-medico-em-2026-o-que-a-resolucao-cfm-2-336-2023-permite-bip)

**Open Finance/bancos/Pix**: [Pluggy – novidades 2026 (maio/2026)](https://www.pluggy.ai/blog/open-finance-2026-novidades) · [Pluggy – preços](https://www.pluggy.ai/precos) · [Finfy](https://finfy.luby.com.br/blog/open-finance-libera-saldo-antes-do-pagamento-o-que-muda-no-pix/) · [Let's Money 29/05/2026](https://www.letsmoney.com.br/open-finance/open-finance-pj-burocracia-socios-credito) · [TI Inside 23/01/2026](https://tiinside.com.br/23/01/2026/jornada-de-consentimento-ainda-limita-adesao-das-empresas-ao-open-finance-no-brasil/) · [EM 06/01/2026](https://www.em.com.br/tecnologia/2026/01/7327097-pix-em-2026-pix-automatico-ja-e-realidade-e-novas-funcoes-sao-esperadas.html) · [Matera](https://www.matera.com/br/blog/pix-parcelado/) · [FWC 24/05/2026](https://fwctecnologia.com/blog/post/pix-automatico-apps-recorrencia-sem-cartao-2026) · [KMEE 19/05/2026](https://kmee.com.br/blog/comparativo-apis-bancarias-erp-brasil-2026/) · [OpenPix – Itaú](https://developers.openpix.com.br/en/docs/bank-integrations/integration-itau-bank) · [Omie – Pix Itaú](https://ajuda.omie.com.br/pt-BR/articles/6817569-configurando-a-integracao-com-o-itau-pix-via-api) · [InnCash 20/03/2026](https://inn.cash/blog/recebimentos/api-itau/) · [Inter Developers](https://developers.inter.co/) · [Cora Developers](https://developers.cora.com.br/) · [Conta Azul – OF](https://ajuda.contaazul.com/hc/pt-br/articles/22052814567565-Open-Finance-como-funciona-a-integra%C3%A7%C3%A3o-na-Conta-Azul) · [Nibo](https://www.nibo.com.br/conciliador-open-finance) · [Kamino](https://www.kamino.com.br/) · [Celcoin](https://www.celcoin.com.br/solucoes/pagamento-de-contas/) · [Celcoin docs](https://developers.celcoin.com.br/docs/pagamento-de-contas-1) · [LatamFintech – Belvo 02/03/2023](https://www.latamfintech.co/articles/open-finance-platform-belvo-now-offers-payment-initiation-service-in-brazil) · [Startups – Klavi 22/12/2023](https://startups.com.br/negocios/fintech/klavi-agora-tem-a-chave-do-open-finance-regulado/)

**Adquirência**: [GitHub DevelopersRede](https://github.com/DevelopersRede) · [HubSoft – e.Rede](https://wiki.hubsoft.com.br/modulos/configuracao/integracao/cartao/erede_itau) · [Citel – conciliação Rede](https://documentacao.citelsoftware.com.br/fazer-conciliacao-automatica-de-cartoes-redecard-api-erp-autcom-doc-9/) · [Rede – documentos](https://www.userede.com.br/atendimento/documentos) · [Conciliadora API](https://doc.conciliadora.com.br/) · [Cielo EDI (v15.15, 19/05/2026)](https://developercielo.github.io/tutorial/edi-extrato-eletronico) · [Mercado Pago – relatórios](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/reports/introduction) · [Calculadora de Taxas set/2026](https://www.calculadoradetaxas.com.br/marcas/infinitepay-vs-stone) · [Okai – Res. 514/2025](https://okai.com.br/artigo/o-banco-central-aperfeicoa-o-registro-de-recebiveis-o-que-muda-com-a-resolucao-bcb-no-514-2025) · [LegisWeb – Res. 514](https://www.legisweb.com.br/legislacao/?id=485366)

**Notas fiscais**: [Prefeitura SP – Emissor Nacional](https://prefeitura.sp.gov.br/web/fazenda/w/usoemissornacional) · [Prefeitura SP – orientações 2026](https://prefeitura.sp.gov.br/web/fazenda/w/nfs-e_orientacoes) · [Contábeis 78636](https://www.contabeis.com.br/noticias/78636/sao-paulo-adia-nfs-e-obrigatoria-para-autonomos-para-2027/) · [Contábeis 77741 (30/06/2026)](https://www.contabeis.com.br/artigos/77741/nfs-e-nacional-obrigatoriedade-prazos-e-impacto-contabil/) · [TOTVS](https://www.totvs.com/blog/fiscal-clientes/sao-paulo-reforca-obrigatoriedade-da-nfs-e-nacional-para-empresas-do-simples-nacional/) · [Tecnospeed 23/06/2026](https://blog.tecnospeed.com.br/nfs-e-sao-paulo-layout-para-adequacao-a-reforma-tributaria/) · [LegisWeb 31/07/2026 – IBS/CBS](https://www.legisweb.com.br/noticia/?id=34071) · [Unicred 06/02/2026](https://unicred.com.br/blog/pessoa-juridica/reforma-tributaria-2026-o-que-muda-para-medicos-e-profissionais-da-saude/) · [Contábeis 72593 (01/09/2025)](https://www.contabeis.com.br/artigos/72593/reforma-tributaria-reducao-de-60-no-ibs-cbs-para-saude-e-dispositivos-medicos/) · [gov.br/nfse](https://www.gov.br/nfse/pt-br) · [Focus NFe – preços](https://focusnfe.com.br/precos/) · [Focus – MDe](https://focusnfe.com.br/produtos/manifestacao-destinatario-mde/) · [NFE.io – preços](https://nfe.io/precos/emissao-nfse/) · [PlugNotas](https://tecnospeed.com.br/en/plugdfe/plugnotas/) · [Notaas 10/09/2026](https://www.notaas.com.br/blog/post/api-nfse-nacional-melhor-provedor-emissao-nota-fiscal-de-servico-eletronica-nacional) · [CertDigitais 2026](https://certificadodigitais.com.br/artigos/quanto-custa-certificado-digital-2026/)

**Saúde/assinatura**: [docs.iclinic.com.br](https://docs.iclinic.com.br/) · [docs.feegow.com](https://docs.feegow.com/) · [Feegow – Doctoralia](https://ajuda.feegow.com/support/solutions/articles/67000749754-integrac%C3%A3o-doctoralia-e-feegow) · [CFM 2.314/2022](https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2022/2314_2022.pdf) · [iClinic blog 25/09/2025](https://iclinic.com.br/blog/telemedicina-cfm-novas-normas/) · [HDPO – ANPD 2026](https://hdpo.com.br/fiscalizacao-de-dados-de-saude-anpd-2026/) · [Migalhas 06/03/2026](https://www.migalhas.com.br/quentes/451314/anpd-amplia-rigor-sobre-dados-de-saude-e-biometria-alerta-advogada) · [SuperSign API](https://supersign.com.br/api-assinatura-digital-parcerias/) · [SuperSign comparativo (atual. 08/02/2026)](https://supersign.com.br/blog/comparativo-supersign-vs-d4sign-zapsign-clicksign/) · [ZapSign – preços](https://zapsign.com.br/precos) · [Gov.br – assinatura para órgãos](https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica/assinatura-eletronica-para-orgaos)

**Pagamentos do paciente**: [Asaas – preços](https://www.asaas.com/precos-e-taxas) · [Asaas docs](https://docs.asaas.com/) · [Stripe BR – pricing](https://stripe.com/br/pricing) · [Pagar.me](https://pagar.me/precos/) · [FWC – gateways 2026](https://fwctecnologia.com/en/blog/post/payment-gateways-brazil-comparison-2026) · [Mind Group 07/2026](https://mindconsulting.com.br/2026/07/gateways-pagamento-online-brasil-comparativo-2026/) · [ParcelaMais](https://www.parcelamais.com.br/services/financiamento) · [Dr.Cash](https://drcash.com.br/) · [BV Saúde](https://www.bv.com.br/web/portal/financiamento/saude) · [Koin](https://empresas.koin.com.br/bnpl)