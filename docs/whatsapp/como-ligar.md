# Como ligar o WhatsApp oficial

Data: 27/10/2026. Passo a passo para o Lucas. O que está marcado com *conferir* precisa ser checado na tela ou na documentação da Meta na hora, porque a Meta muda nomes de menu com frequência. O resto o app já faz.

## O que já está pronto no app

- **Confirmação na véspera com dois botões** ("Confirmo" / "Preciso remarcar"). A resposta aparece na Agenda do dia. "Preciso remarcar" vira aviso na Fila do dia da recepção e manda o horário para a lista de encaixe.
- **Lista de prontidão (encaixe).** Quem aceita entrar (com consentimento registrado na Lista de espera) recebe a vaga que abrir com o médico. Vai uma pessoa por vez, com 30 minutos para responder pelo botão. Sem resposta, a vaga passa para a próxima.
- **Origem com carimbo.** A primeira mensagem com código entre colchetes ("Oi! [IG-BIO]") marca a origem na ficha. Se o número não está no CRM, abre um lead em "Novo — falar primeiro". Os links com código por canal estão na tela de Marketing.
- **Modo teste ligado por padrão.** Enquanto ele estiver ligado, só sai mensagem para os números da lista. A trava está em três lugares: na tela, na Edge Function (o número fora da lista nem é tentado) e no banco (a linha de saída é recusada).
- Os 6 modelos estão em [modelos.md](modelos.md).

## Quanto custa

A Meta cobra R$ 0,035 por mensagem de utilidade entregue, também dentro da janela de 24 h (desde 01/10/2026). Exemplo: 100 consultas no mês dão de R$ 3,50 a R$ 7,00 (só a confirmação, ou a confirmação mais o lembrete para todos). As respostas automáticas são mensagens de serviço: as primeiras 1.000 do mês são grátis por número. Se a Meta classificar um modelo como Marketing, ele passa a custar R$ 0,32.

## 1. Conta da empresa na Meta

1. Entrar no Gerenciador de Negócios da Meta (business.facebook.com) com a conta que administra a página do Instituto.
2. Fazer a **verificação da empresa** com CNPJ, razão social, endereço e um documento, como o cartão CNPJ ou uma conta em nome da empresa. *Conferir*: o menu é algo como Configurações do negócio → Central de segurança → Verificação da empresa. A Meta pode levar dias para aprovar.

## 2. App da Meta

1. Em developers.facebook.com: Meus apps → Criar app → tipo **Empresa** (Business), ligado ao portfólio do Instituto.
2. Adicionar o produto **WhatsApp** ao app e escolher (ou criar) a conta do WhatsApp Business do Instituto. *Conferir* os nomes dos botões.

## 3. Número em coexistência (o mesmo número da recepção)

O número da recepção continua no app WhatsApp Business do celular **e** passa a funcionar pela API. No Brasil isso funciona. Os limites:

- pela API não há grupos, listas de transmissão nem chamadas (no celular continua tudo como hoje);
- o celular principal precisa abrir o app WhatsApp Business pelo menos a cada ~14 dias, senão a conexão cai;
- o que o app manda pela API aparece na conversa do celular, e a recepção continua respondendo pelo celular.

Como ligar: no app da Meta, em WhatsApp, adicionar número escolhendo a opção de **conectar o número que já está no app WhatsApp Business**. Depois é ler o QR code com o celular da recepção. *Conferir*: o nome exato da opção e se a Meta oferece a coexistência direto no seu app ou só pelo "cadastro incorporado" de um provedor. Antes, faça o backup das conversas do WhatsApp Business no celular.

O app guarda no banco só o tipo de cada mensagem recebida, o botão tocado e o código de origem. **O texto das conversas não é copiado para o banco**: a conversa fica no WhatsApp da recepção.

## 4. As quatro chaves (segredos)

| Segredo | Onde pegar |
|---|---|
| `WHATSAPP_TOKEN` | Token **permanente** de um usuário do sistema. *Conferir* o caminho: Configurações do negócio → Usuários → Usuários do sistema → Adicionar (administrador) → Atribuir ativos (o app e a conta do WhatsApp) → Gerar token com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`, sem validade. O token temporário da tela de teste vence em 24 h e não serve. |
| `WHATSAPP_PHONE_NUMBER_ID` | No app da Meta → WhatsApp → Configuração da API: o "identificador do número de telefone" (é um número comprido, **não** é o telefone). |
| `WHATSAPP_APP_SECRET` | No app da Meta → Configurações do app → Básico → Chave secreta do aplicativo. Sem ela o webhook recusa tudo, para ninguém conseguir forjar a resposta de um paciente. |
| `WHATSAPP_VERIFY_TOKEN` | Você inventa: uma senha longa e aleatória, por exemplo a saída de `openssl rand -hex 32` no Terminal. Vai aqui e no cadastro do webhook (passo 6). |

Gravar pelo Terminal, nunca pelo app, pelo chat ou no repositório:

```bash
supabase secrets set \
  WHATSAPP_TOKEN='...' \
  WHATSAPP_PHONE_NUMBER_ID='...' \
  WHATSAPP_APP_SECRET='...' \
  WHATSAPP_VERIFY_TOKEN='...' \
  --project-ref <ref-do-projeto>
```

Depois, em **Ajustes → Integrações → WhatsApp oficial**, os quatro nomes ficam verdes.

## 5. Banco e funções

1. Aplicar as migrações `supabase/migrations/202610280301_whatsapp_modo_teste_e_confirmacao.sql` e `202610280302_encaixe_lista_de_prontidao.sql`.
2. Publicar as funções:

```bash
supabase functions deploy whatsapp-enviar confirmar-consultas whatsapp-encaixe --project-ref <ref-do-projeto>
supabase functions deploy whatsapp-webhook --no-verify-jwt --project-ref <ref-do-projeto>
```

O webhook vai **sem** a conferência de login do Supabase (`--no-verify-jwt`) porque quem chama é a Meta. A segurança dele é a assinatura com o App Secret.

## 6. Webhook (a Meta avisando o app)

No app da Meta → WhatsApp → Configuração → Webhook → Editar:

- **URL de retorno:** `https://<ref-do-projeto>.supabase.co/functions/v1/whatsapp-webhook`
- **Token de verificação:** o mesmo `WHATSAPP_VERIFY_TOKEN`.
- Verificar e salvar. Depois, em "Campos do webhook", **assinar `messages`**. Os outros campos o app ignora.

## 7. Cadastrar os 6 modelos

No WhatsApp Manager → Modelos de mensagem → Criar modelo, para cada um de [modelos.md](modelos.md):
categoria **Utilidade**, idioma **Português (BR)**, o **nome exatamente igual** (`confirmacao_consulta`, `lembrete_vespera`, `oferta_vaga`, `lembrete_pagamento`, `lembrete_aplicacao`, `boas_vindas_ficha`), o corpo, os exemplos das variáveis e os botões.

- Se a Meta não aceitar um nome, cadastre com outro e grave em Integrações → WhatsApp → Configuração: `"nomesNaMeta": { "oferta_vaga": "outro_nome" }`.
- O `boas_vindas_ficha` precisa do endereço da ficha antes (ver o *conferir* em modelos.md). Pode ficar para depois: hoje nada manda esse modelo.
- *Conferir*: o tempo de aprovação. Em geral sai em minutos ou horas.

## 8. Número público (para os links do Marketing)

Em Integrações → WhatsApp oficial → "Número do WhatsApp do Instituto": o número com DDD → Salvar. A tela de Marketing passa a mostrar os links por canal (bio do Instagram, story, perfil do Google, QR da recepção, indicação de médico). Os links funcionam desde já com o WhatsApp Business da recepção. O carimbo no CRM começa quando o webhook estiver ligado.

## 9. Teste com o próprio número (modo teste ligado)

1. Em Integrações → WhatsApp oficial: **Ligar**. O modo teste continua ligado.
2. Pôr o seu celular em **Números que podem receber no modo teste**.
3. **Mandar teste** com o modelo "Confirmação do horário" para o seu número. A mensagem chega com os dois botões. Toque em "Confirmo" e chega "Teste recebido…". Isso prova que o modelo, o webhook e a assinatura estão certos. Em **Últimas mensagens** aparecem a saída e o botão.
4. **Encaixe:** em Acompanhamento → Lista de espera, cadastre-se com o seu número e marque "Aceita receber a oferta pelo WhatsApp". Depois, em Integrações, **Criar vaga de teste**. Chega a oferta para o próximo dia útil às 10h (é de mentira, não mexe na agenda). Toque em "Quero o horário" e chega "Combinado! … (teste)". Depois tire o seu nome da lista. A oferta só sai de segunda a sábado, das 8h às 20h. Fora desse horário ela espera, e o botão **Avançar as ofertas de encaixe agora** manda quando a janela abrir.
5. **Confirmação de verdade (opcional):** marque no iClinic um horário de teste para amanhã, com o nome igual ao de uma ficha do CRM que tenha o seu número. Na véspera, depois das 10h, use **Mandar as confirmações devidas agora** (ou espere a rodada de hora em hora). Toque em "Preciso remarcar": o aviso aparece na Fila do dia da recepção e a Agenda do dia mostra "Pediu para remarcar". Depois apague o horário de teste no iClinic.
6. **Origem:** de um celular que não está no CRM, mande para o número do Instituto "Oi! [IG-BIO]". Aparece um lead em Comercial → Kanban, "Novo — falar primeiro", com a origem Instagram. Esse passo não manda mensagem para ninguém e funciona com o modo teste ligado.

## 10. Agendar o encaixe

A confirmação já tem agendador no banco (`confirmar-consultas-horario`, de hora em hora). O encaixe ainda não tem. Rode [agendamento-encaixe.sql](agendamento-encaixe.sql) no SQL Editor do Supabase (passos 1, 2 e 3 do arquivo). Ele roda a cada 10 minutos, das 8h às 20h50.

## 11. Virar a chave

Em Integrações → WhatsApp oficial → **Desligar o modo teste**. O app pede confirmação. A partir daí as mensagens saem para os pacientes. No primeiro dia, acompanhe **Últimos eventos** e **Últimas mensagens** na mesma tela.

## Para desligar rápido

- **Desligar** em Integrações para tudo, na hora.
- **Ligar o modo teste** de novo: volta a sair só para a lista.
- Pausar uma parte só, em Configuração: `"confirmacao": { "ligada": false }` ou `"encaixe": { "ligado": false }`.

## Onde cada um vê o resultado

- **Recepção:** Fila do dia ("Paciente pediu para remarcar pelo WhatsApp", "Encaixe aceito pelo WhatsApp — marcar no iClinic"), Agenda do dia (Confirmou / Pediu para remarcar) e Acompanhamento → Lista de espera (quem aceitou o encaixe e como está cada oferta).
- **Marketing:** os links com código por canal.
- **Coordenação:** Integrações → WhatsApp oficial.

## O que dá para ajustar na configuração

Em Integrações → WhatsApp oficial → Configuração (o que não estiver escrito usa o padrão):

```json
{
  "confirmacao": { "horaDoToque": 10, "horaDoLembrete": 17, "horaLimite": 20, "enviarNoDomingo": false, "profissionais": [], "modeloPorProfissional": { "Juliana": "lembrete_aplicacao" } },
  "encaixe": { "profissionais": ["Dr. Daniel", "Dr. Moisés"], "minutosParaResponder": 30, "antecedenciaMinimaMinutos": 120, "diasParaFrente": 14, "horaInicio": 8, "horaFim": 20, "diasDaSemana": [1, 2, 3, 4, 5, 6] },
  "respostasAutomaticas": true,
  "versaoApi": "v21.0"
}
```

*Conferir* a versão da API da Meta (`versaoApi`): cada versão dura cerca de dois anos. Se a Meta avisar que a v21.0 venceu, troque pela atual.
