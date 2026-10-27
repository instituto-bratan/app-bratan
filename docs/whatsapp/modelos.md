# Os 6 modelos do WhatsApp oficial

Data: 27/10/2026. Estes são os textos para cadastrar na Meta (WhatsApp Manager → Modelos de mensagem). O app manda exatamente estes textos, com estes nomes e estas variáveis. Se mudar um texto aqui, mude também em `supabase/functions/_shared/whatsappRegras.ts` (o teste `tests/whatsapp-atendimento.test.mjs` confere que os dois batem).

## Regras que valem para os seis

- **Categoria: Utilidade.** Os seis falam de um horário ou de um combinado que a pessoa já tem com o Instituto. Custo por mensagem entregue: R$ 0,035, cobrado também dentro da janela de 24 h desde 01/10/2026. A Meta pode reclassificar um modelo como Marketing (R$ 0,32). Se isso acontecer, o modelo aparece com a categoria trocada no WhatsApp Manager. *Conferir* o aviso da Meta depois da aprovação, principalmente na oferta de vaga e nas boas-vindas.
- **Idioma:** Português (BR), código `pt_BR`.
- **Só logística.** A política do WhatsApp proíbe mandar ou pedir informação de saúde e lista remédios entre os itens proibidos. Por isso nenhuma mensagem leva nome de remédio, procedimento, exame, resultado, peso, diagnóstico, nome do médico, valor ou CPF. A mensagem diz só quem é (Instituto Bratan), o dia e a hora.
- **CFM (publicidade médica):** nenhuma promessa de resultado, nada de antes e depois, nada de preço ou desconto. Os textos abaixo não fazem propaganda, só marcam e lembram.
- **Variáveis** são `{{1}}`, `{{2}}`… na ordem da tabela de cada modelo. A Meta pede um exemplo de cada uma no cadastro: use os da coluna "exemplo".
- **Botões de resposta:** o texto do botão tem que ser exatamente o da tabela. O app lê o botão pela marca que vai junto com cada mensagem; o texto também serve de reserva quando a marca não vem.
- *Conferir* na documentação da Meta antes de cadastrar: limite de caracteres do texto do botão (os nossos têm no máximo 20), limite do corpo (os nossos têm menos de 300) e a regra de que o corpo não pode começar nem terminar com variável (os nossos não começam nem terminam).

## 1. `confirmacao_consulta` — Confirmação do horário

Quando sai: na véspera, a partir das 10h, para cada horário marcado na agenda do iClinic. A consulta de segunda é confirmada no sábado. Sai só para quem tem a ficha no CRM com telefone e nome que batem com a agenda.

Corpo:

> Olá, {{1}}! Aqui é do Instituto Bratan. Seu horário está marcado para {{2}}, às {{3}}. Você confirma a presença?

| Variável | O que é | Exemplo |
|---|---|---|
| {{1}} | primeiro nome | Maria |
| {{2}} | dia | terça-feira, 28/10 |
| {{3}} | hora | 14:30 |

Botões (resposta rápida): **Confirmo** · **Preciso remarcar**

- "Confirmo": a agenda do dia mostra "Confirmou" e a pessoa recebe "Obrigado! Seu horário de … está confirmado."
- "Preciso remarcar": a agenda mostra "Pediu para remarcar", a recepção recebe um aviso na Fila do dia e o horário vai na hora para a lista de encaixe (modelo 3). A pessoa recebe "Tudo bem! A recepção vai te chamar por aqui para combinar um novo horário."

## 2. `lembrete_vespera` — Lembrete da véspera

Quando sai: na véspera, a partir das 17h, só para quem recebeu a confirmação há pelo menos 4 horas e ainda não respondeu.

Corpo:

> Oi, {{1}}. Ainda não recebemos a sua confirmação para {{2}}, às {{3}}, no Instituto Bratan. Se não puder vir, toque em Preciso remarcar e liberamos o horário para outra pessoa.

| Variável | O que é | Exemplo |
|---|---|---|
| {{1}} | primeiro nome | Maria |
| {{2}} | dia | terça-feira, 28/10 |
| {{3}} | hora | 14:30 |

Botões (resposta rápida): **Confirmo** · **Preciso remarcar** (fazem o mesmo que no modelo 1).

## 3. `oferta_vaga` — Oferta de vaga (encaixe)

Quando sai: quando um horário do médico abre (a pessoa tocou "Preciso remarcar" ou a consulta foi desmarcada no iClinic), para UMA pessoa da lista de encaixe por vez. Só entra na lista quem aceitou receber esta oferta (a recepção marca o consentimento na Lista de espera). A vaga fica com a pessoa pelos minutos da variável 4; sem resposta, passa para a próxima.

Corpo:

> Olá, {{1}}! Abriu um horário no Instituto Bratan em {{2}}, às {{3}}, e você está na nossa lista de encaixe. Quer ficar com ele? O horário fica reservado para você por {{4}} minutos.

| Variável | O que é | Exemplo |
|---|---|---|
| {{1}} | primeiro nome | Maria |
| {{2}} | dia | terça-feira, 28/10 |
| {{3}} | hora | 14:30 |
| {{4}} | minutos para responder | 30 |

Botões (resposta rápida): **Quero o horário** · **Não posso** · **Sair da lista**

- "Quero o horário": a vaga é dela; a recepção recebe "Encaixe aceito pelo WhatsApp — marcar no iClinic" e marca. Ela recebe "Combinado! Separamos o horário de … para você. A recepção confirma por aqui em seguida."
- "Não posso": continua na lista; a vaga vai para a próxima pessoa na hora.
- "Sair da lista": deixa de receber ofertas pelo WhatsApp (o aceite fica registrado como retirado).

*Conferir:* a Meta pode entender a oferta de vaga como Marketing. O argumento para Utilidade é que a pessoa pediu para entrar na lista e a mensagem responde a esse pedido.

## 4. `lembrete_pagamento` — Lembrete de pagamento

Quando sai: perto do vencimento de um pagamento combinado. **Ainda não sai sozinho** (versão 2: vai ligado aos Lembretes do financeiro). Sem valor, sem o que foi comprado.

Corpo:

> Olá, {{1}}! Passando para lembrar do pagamento combinado com o Instituto Bratan, com vencimento em {{2}}. Se já pagou, pode desconsiderar esta mensagem.

| Variável | O que é | Exemplo |
|---|---|---|
| {{1}} | primeiro nome | Maria |
| {{2}} | vencimento | 05/11 |

Botões (resposta rápida): **Já paguei** · **Falar com a recepção**. O app não decide nada com esses dois: a resposta abre a conversa e a recepção atende pelo WhatsApp.

## 5. `lembrete_aplicacao` — Lembrete de aplicação

Quando sai: na véspera do horário de acompanhamento com a enfermagem, no lugar da confirmação do modelo 1. Liga pela configuração (`confirmacao.modeloPorProfissional`, ex.: `{"Juliana": "lembrete_aplicacao"}`). Não diz o nome do remédio, nem a palavra "aplicação".

Corpo:

> Olá, {{1}}! Lembrete do Instituto Bratan: seu próximo horário de acompanhamento é {{2}}, às {{3}}. Você confirma a presença?

| Variável | O que é | Exemplo |
|---|---|---|
| {{1}} | primeiro nome | Maria |
| {{2}} | dia | terça-feira, 28/10 |
| {{3}} | hora | 14:30 |

Botões (resposta rápida): **Confirmo** · **Preciso remarcar** (fazem o mesmo que no modelo 1).

## 6. `boas_vindas_ficha` — Boas-vindas com ficha

Quando sai: depois de marcar a primeira consulta. **Ainda não sai sozinho** (versão 2).

Corpo:

> Olá, {{1}}! Que bom ter você no Instituto Bratan. Para agilizar a sua chegada em {{2}}, preencha a sua ficha de cadastro pelo botão abaixo. Leva uns 3 minutos.

| Variável | O que é | Exemplo |
|---|---|---|
| {{1}} | primeiro nome | Maria |
| {{2}} | dia | terça-feira, 28/10 |

Botão (link): **Preencher ficha**, com o endereço da ficha e o fim variável (`{{1}}` no fim do endereço, ex.: `https://SEU-ENDERECO/ficha/{{1}}`).

*Conferir* antes de cadastrar este modelo: a ficha online ainda não existe no app. Defina o endereço primeiro (uma opção é o portal Meu Bratan, que já usa `/meu/entrar?t=`). O endereço base fica gravado no modelo da Meta; trocar depois exige cadastrar o modelo de novo. A ficha pede dado pessoal no site do Instituto, nunca pelo WhatsApp.

## Mensagens que o app responde sozinho

Depois que a pessoa toca num botão, a Meta abre uma janela de 24 h em que dá para responder com texto livre (resposta de serviço; as primeiras 1.000 do mês são grátis por número). O app usa isso só para dizer que recebeu. Desliga em `respostasAutomaticas: false`.

- Confirmou: "Obrigado! Seu horário de terça-feira, 28/10, às 14:30 está confirmado."
- Pediu para remarcar: "Tudo bem! A recepção vai te chamar por aqui para combinar um novo horário."
- Aceitou a vaga: "Combinado! Separamos o horário de terça-feira, 28/10, às 14:30, para você. A recepção confirma por aqui em seguida."
- Não pôde: "Sem problema! Você continua na lista e avisamos no próximo horário que abrir."
- Saiu da lista: "Pronto, você saiu da lista de encaixe. Se quiser voltar, é só pedir à recepção."
- Vaga já passou para outra pessoa: "Esse horário não está mais disponível. Você continua na lista e avisamos no próximo que abrir."
