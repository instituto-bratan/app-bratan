# CRM Bratan - Sprint 1

## O que foi criado

- `/crm/minhas-tarefas`: tela principal do dia, com Hoje, Atrasadas, Proximos 7 dias, Concluidas e Todas.
- `/crm/vendas`: Kanban Comercial com etapas de lead, consulta, prescricao, fechamento, recuperacao e resgate.
- `/crm/contatos/:id`: Perfil 360 comercial e relacional do contato/paciente.
- `/crm/cadencias`: cadencias por funcao com templates, inscricao manual e geracao de tarefas.

## Como usar Minhas Tarefas

1. Abra CRM > Minhas Tarefas.
2. Filtre por tipo, prioridade ou busca.
3. Use Copiar mensagem ou Abrir WhatsApp.
4. Registre a resposta para salvar historico de toque.
5. Crie uma proxima tarefa quando ainda houver pendencia.

## Como mover cards no Kanban

1. Abra CRM > Kanban Comercial.
2. Crie um lead ou selecione um card existente.
3. Clique em Mover / registrar.
4. Informe etapa, valores e objeções quando necessário.
5. O sistema cria as tarefas de outros setores automaticamente.

Regras atuais:

- Nao fechou exige objeção e cria Medico D+1 + Gestao D+2.
- Fechou completo exige valor vendido e cria Concierge D+1, Recepcao/Agenda e Administrativo/Contrato.
- Fechou parcial exige valor vendido + motivo do parcial e cria as mesmas proximas tarefas essenciais.

## Como abrir Perfil 360

Cada card e tarefa tem o botão Ver perfil. O Perfil 360 mostra:

- resumo do contato;
- tarefas;
- cadencias;
- venda/negociacao;
- jornada;
- experiencia;
- recebiveis resumidos para quem pode ver financeiro;
- contratos.

## Como as cadencias geram tarefas

As cadencias ficam em `/crm/cadencias`.

Sprint 1 inclui:

- Comercial D1 / D5 / D7 / D60;
- Pos-consulta nao fechou: Medico D+1 e Gestao D+2;
- Concierge D+1;
- Enfermagem a cada 14 dias;
- Pos-aplicacao / bioimpedancia;
- Ciclo de retorno.

O app nao envia mensagem automaticamente. Ele sugere, copia e abre WhatsApp.

## Permissoes

- Coordenacao e gestao veem tudo.
- Comercial/SDR ve tarefas, contatos e Kanban comercial.
- Enfermagem ve tarefas e contatos ligados ao acompanhamento.
- Concierge ve acolhimento e experiencia.
- Recepcao ve agenda, retornos e contratos a criar.
- Financeiro ve pendencias financeiras.
- Limpeza nao ve CRM.

## Como alimenta o Dashboard 360

O CRM deriva dados para a Inteligencia 360 sem pedir preenchimento duplicado:

- negocios viram prescricoes/vendas;
- fechamentos viram jornada;
- valores vendidos nao recebidos viram recebiveis;
- tarefas atrasadas viram acoes;
- toques viram reguas/relacionamento;
- feedback negativo vira experiencia.

## Sprint 2 sugerida

- Persistencia remota completa no Supabase para as telas do CRM.
- Drawer lateral refinado para edicao inline.
- Regras mais finas de RLS por tipo de dado sensivel.
- Integracao futura com WhatsApp API/iClinic/Feegow/SharePoint.
- Importacao de leads e deduplicacao assistida.
