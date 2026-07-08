// Conteúdo dos tutoriais "Como usar" de cada tela do app.
// Arquivo de dados puro — sem React, sem imports.

export type PageGuide = {
  title: string;
  whatIs: string;
  steps: string[];
  tips?: string[];
};

export const pageGuides: Array<{ pattern: string; guide: PageGuide }> = [
  {
    pattern: "/inicio",
    guide: {
      title: "Início",
      whatIs:
        "É a porta de entrada do app: daqui você abre todas as áreas que o seu cargo libera. Pense nele como o balcão central do Instituto.",
      steps: [
        "Olhe os atalhos na tela: cada cartão leva para uma área (Tarefas, Financeiro, CRM, etc.).",
        "Toque no cartão da área que você precisa usar agora.",
        "Se não encontrar uma área, é porque o seu cargo não tem acesso a ela — fale com a coordenação se precisar.",
        "Para voltar ao Início a qualquer momento, use o menu ou o botão de voltar do app.",
      ],
      tips: [
        "Comece o dia abrindo o Checklist do dia e o Mural de avisos.",
        "O que aparece aqui muda conforme o seu cargo — cada pessoa vê só o que usa.",
      ],
    },
  },
  {
    pattern: "/tarefas",
    guide: {
      title: "Checklist do dia",
      whatIs:
        "É a lista de tarefas do seu dia de trabalho. Ela mostra o que precisa ser feito, na ordem, para nada ficar para trás.",
      steps: [
        "Abra a tela no começo do turno e leia todas as tarefas do dia.",
        "Faça a tarefa na vida real e depois marque-a como concluída no app.",
        "Se alguma tarefa não puder ser feita, avise a coordenação em vez de só deixar em aberto.",
        "Antes de ir embora, confira se tudo ficou marcado como concluído.",
      ],
      tips: [
        "Marque as tarefas na hora em que terminar — assim ninguém precisa perguntar se já foi feito.",
        "A lista reinicia a cada dia, então não se assuste se ontem sumiu.",
      ],
    },
  },
  {
    pattern: "/almoco",
    guide: {
      title: "Almoço e cobertura",
      whatIs:
        "Aqui a equipe organiza os horários de almoço e quem cobre quem enquanto cada pessoa está fora. Assim a clínica nunca fica sem ninguém no posto.",
      steps: [
        "Veja o quadro com os horários de almoço de cada pessoa do dia.",
        "Escolha ou confirme o seu horário de saída e de volta.",
        "Confira quem vai cobrir a sua função enquanto você almoça.",
        "Antes de sair, avise a pessoa que vai te cobrir e passe o que estiver pendente.",
      ],
      tips: [
        "Não saia sem confirmar a cobertura — recepção e telefone não podem ficar sozinhos.",
        "Se precisar trocar de horário, combine com a coordenação antes de mudar no app.",
      ],
    },
  },
  {
    pattern: "/mural",
    guide: {
      title: "Mural de avisos",
      whatIs:
        "É o quadro de avisos oficial da clínica dentro do app. Tudo que a coordenação precisa comunicar para a equipe aparece aqui.",
      steps: [
        "Abra o mural todo dia, de preferência no começo do turno.",
        "Leia os avisos mais recentes, que ficam no topo.",
        "Se um aviso pedir confirmação de leitura ou alguma ação, faça na hora.",
        "Ficou com dúvida sobre um aviso? Pergunte para quem publicou ou para a coordenação.",
      ],
      tips: [
        "Aviso no mural vale como comunicado oficial — 'não vi' não segura ninguém.",
        "Avisos antigos continuam disponíveis, é só rolar a lista para baixo.",
      ],
    },
  },
  {
    pattern: "/pops-fluxos",
    guide: {
      title: "POPs e fluxos",
      whatIs:
        "É a biblioteca com o passo a passo oficial de cada processo da clínica (os POPs) e os fluxos de trabalho de cada setor. Na dúvida de como fazer algo, a resposta está aqui.",
      steps: [
        "Procure o POP pelo nome do processo ou pelo setor (recepção, financeiro, clínico...).",
        "Abra o documento e siga o passo a passo exatamente como está escrito.",
        "Se a realidade estiver diferente do que o POP diz, avise a coordenação para atualizarem o documento.",
        "Use esta tela também para treinar gente nova: é o material oficial.",
      ],
      tips: [
        "Antes de perguntar 'como faz?', dê uma olhada aqui — quase sempre já tem a resposta.",
        "POP desatualizado atrapalha todo mundo: reporte assim que perceber.",
      ],
    },
  },
  {
    pattern: "/comprovantes",
    guide: {
      title: "Comprovantes",
      whatIs:
        "É onde você anexa comprovantes de pagamento (foto ou PDF) e liga cada um à pendência certa. Os arquivos sobem sozinhos para o SharePoint a cada 15 minutos.",
      steps: [
        "Toque em anexar e escolha a foto ou o arquivo do comprovante.",
        "Vincule o comprovante à pendência correspondente (a conta ou pagamento a que ele se refere).",
        "Confira se o valor e a data do comprovante batem com a pendência antes de salvar.",
        "Pronto: em até 15 minutos o arquivo estará guardado no SharePoint automaticamente.",
      ],
      tips: [
        "Tire a foto com o comprovante inteiro visível — valor, data e nome legíveis.",
        "Não precisa mandar nada por WhatsApp nem salvar em pasta: o app cuida do envio.",
        "Comprovante sem vínculo com pendência fica solto e dá trabalho depois — sempre vincule.",
      ],
    },
  },
  {
    pattern: "/estalecas",
    guide: {
      title: "Carteira de Estalecas",
      whatIs:
        "É a sua carteira de Estalecas: aqui você faz check-in de academia e igreja, registra conquistas e acompanha o ranking da equipe.",
      steps: [
        "Para o check-in de academia ou igreja, pegue o código do dia divulgado pela coordenação.",
        "Digite o código na tela para registrar o seu check-in.",
        "Para registrar uma conquista, envie a prova (foto ou documento) e aguarde a coordenação aprovar.",
        "Acompanhe o seu saldo de Estalecas e a sua posição no ranking.",
      ],
      tips: [
        "O código de check-in vale só para o dia — não adianta guardar o de ontem.",
        "Conquista só vira Estaleca depois que a coordenação aprova a prova.",
      ],
    },
  },
  {
    pattern: "/lembretes-pagamento",
    guide: {
      title: "Lembretes de pagamento",
      whatIs:
        "Aqui você registra pagamentos que um paciente combinou de fazer depois: nome, valor e data combinada. Esses lembretes alimentam o Recebíveis 360 sozinhos.",
      steps: [
        "Toque em novo lembrete.",
        "Preencha o nome do paciente, o valor combinado e a data em que ele prometeu pagar.",
        "Salve — não precisa fazer mais nada, o Recebíveis 360 já fica sabendo.",
        "Quando o pagamento acontecer, dê baixa no lembrete para tirá-lo da fila.",
      ],
      tips: [
        "Registre na hora em que o paciente combinar, antes que a informação se perca.",
        "Prefira datas exatas ('dia 15') em vez de 'semana que vem' — facilita a cobrança.",
      ],
    },
  },
  {
    pattern: "/financeiro/lancar-dia",
    guide: {
      title: "Lançar o dia (comandas)",
      whatIs:
        "É a comanda digital da clínica: cada atendimento vira uma comanda com paciente, itens e pagamentos. É daqui que sai quase todo o financeiro do Instituto.",
      steps: [
        "Toque em nova comanda e busque o paciente — a busca puxa direto do CRM.",
        "Adicione os itens do atendimento (consulta, tratamento, produto...).",
        "Registre como o paciente pagou: dinheiro, Pix, cartão, ou mais de uma forma.",
        "Confira o total e salve a comanda.",
        "Precisou corrigir uma comanda de outro dia? Encontre-a e toque no lápis para editar.",
        "Para excluir uma comanda, o app pede confirmação — leia antes de confirmar.",
      ],
      tips: [
        "Lance a comanda no momento do atendimento, não deixe para o fim do dia.",
        "Se o paciente não aparecer na busca, cadastre-o primeiro no CRM.",
        "Comanda certa aqui = P12, metas, impostos e repasses certos em todo o resto do app.",
      ],
    },
  },
  {
    pattern: "/financeiro/contas",
    guide: {
      title: "Contas a pagar",
      whatIs:
        "É a lista de contas da clínica: o que precisa ser pago, quando e de qual categoria. Toda conta entra com uma categoria P12 obrigatória.",
      steps: [
        "Toque em nova conta e preencha descrição, valor e data de vencimento.",
        "Escolha a categoria P12 — o app não deixa salvar sem ela.",
        "Quando pagar a conta na vida real, clique no selo dela para marcá-la como paga.",
        "Marcou sem querer? Clique no selo de novo para desfazer.",
      ],
      tips: [
        "A categoria P12 é o que faz o DRE ficar certo — na dúvida de qual usar, pergunte antes de chutar.",
        "Anexe o comprovante do pagamento na tela de Comprovantes e vincule à conta.",
      ],
    },
  },
  {
    pattern: "/financeiro/p12",
    guide: {
      title: "P12 (DRE vivo)",
      whatIs:
        "É o DRE vivo da clínica: um painel que se monta sozinho a partir das comandas e das contas. Aqui nada se digita — você só lê e investiga.",
      steps: [
        "Escolha o mês que quer analisar no filtro.",
        "Leia as linhas do P12: receitas em cima, despesas por categoria embaixo.",
        "Quer saber de onde veio um número? Clique no valor: abre a prova viva com todos os lançamentos que o compõem.",
        "Repare na linha Entrada de valores: ela mostra o que foi para a poupança.",
      ],
      tips: [
        "Se um valor parece errado, o problema está na origem (comanda ou conta) — corrija lá e o P12 se ajusta sozinho.",
        "Use a prova viva nas reuniões: cada número tem os lançamentos que o sustentam.",
      ],
    },
  },
  {
    pattern: "/financeiro/fechamento",
    guide: {
      title: "Fechamento do dia",
      whatIs:
        "É a conferência diária: o que o app esperava receber em cada maquininha contra o que realmente caiu no extrato. É aqui que se descobre qualquer diferença.",
      steps: [
        "Abra o dia que vai conferir e veja o valor esperado por maquininha.",
        "Compare com o extrato real de cada maquininha.",
        "Lance as taxas cobradas pelas operadoras.",
        "Se os valores conferem, marque Bateu. Se não, marque Divergente e anote o motivo.",
        "Divergência sem explicação? Investigue no mesmo dia — quanto mais tempo passa, mais difícil achar.",
      ],
      tips: [
        "Faça o fechamento todo dia, de preferência no fim do expediente.",
        "As divergências mais comuns são taxa não lançada ou comanda com forma de pagamento errada.",
      ],
    },
  },
  {
    pattern: "/financeiro/poupanca",
    guide: {
      title: "Poupança",
      whatIs:
        "É o controle da poupança da clínica: quanto entrou, quanto saiu e quanto tem guardado. Os movimentos são lançados à mão no fim do mês.",
      steps: [
        "No fim do mês, registre os movimentos que realmente aconteceram: entradas e saídas da poupança.",
        "Veja as provisões sugeridas pelo app — elas são só uma sugestão de quanto guardar.",
        "Decida com a gestão quanto vai ser guardado de verdade e lance esse valor.",
        "Confira se o saldo do app bate com o saldo real da conta.",
      ],
      tips: [
        "Sugestão não é lançamento: nada entra na poupança até você registrar o movimento.",
        "Lance sempre com a data real do movimento para o histórico ficar confiável.",
      ],
    },
  },
  {
    pattern: "/financeiro/impostos",
    guide: {
      title: "Impostos e notas fiscais",
      whatIs:
        "É a fila de notas fiscais a emitir, uma por comanda, e o controle das guias de imposto. As alíquotas mudam conforme o tipo: consulta ou tratamento.",
      steps: [
        "Abra a fila de NFs pendentes — cada comanda gera uma nota a emitir.",
        "Confira o tipo de cada item (consulta ou tratamento): é ele que define a alíquota.",
        "Emita a nota e marque-a como resolvida na fila.",
        "No período certo, gere as guias mensais e trimestrais pela própria tela.",
      ],
      tips: [
        "Não deixe a fila acumular: nota atrasada vira multa.",
        "Se a alíquota parecer estranha, confira se o item foi classificado no tipo certo na comanda.",
      ],
    },
  },
  {
    pattern: "/financeiro/repasses",
    guide: {
      title: "Repasses médicos",
      whatIs:
        "É onde se classifica cada atendimento para calcular o repasse do profissional: PLANO paga R$ 110, AVULSA paga R$ 150 e RETORNO não gera repasse.",
      steps: [
        "Abra a lista de atendimentos do período.",
        "Classifique cada um: PLANO (R$ 110), AVULSA (R$ 150) ou RETORNO (sem repasse).",
        "Confira o total calculado por profissional.",
        "No fim do período, use a opção de fechar o mês para travar os valores.",
      ],
      tips: [
        "Classifique aos poucos ao longo do mês — deixar tudo para o fechamento vira maratona.",
        "Depois de fechado o mês, evite mexer: qualquer ajuste deve ser combinado com a gestão.",
      ],
    },
  },
  {
    pattern: "/financeiro/pdca",
    guide: {
      title: "PDCA",
      whatIs:
        "É o acompanhamento de adesão dos pacientes, calculado automaticamente a partir das comandas. Mostra quem está seguindo o plano de tratamento e quem está escapando.",
      steps: [
        "Abra o painel e veja os indicadores de adesão do período.",
        "Identifique os pacientes ou grupos com adesão baixa.",
        "Combine com a equipe as ações de recuperação (contato, reagendamento, régua de resgate).",
        "Volte depois para conferir se as ações melhoraram os números.",
      ],
      tips: [
        "Os números vêm das comandas: comanda lançada certinha = adesão medida certinha.",
        "Adesão caindo é sinal de churn chegando — aja cedo.",
      ],
    },
  },
  {
    pattern: "/financeiro/compras",
    guide: {
      title: "Controle de Compras",
      whatIs:
        "A planilha CONTROLE DE COMPRAS dentro do app: tudo que o Instituto compra, com forma de pagamento, NF e previsão de entrega — sem digitar duas vezes na P12.",
      steps: [
        "Preencha data, descrição da compra e valor total.",
        "Escolha a forma de pagamento: crédito pede o cartão (Itaú/Santander/Safra) e as parcelas.",
        "Se NÃO for crédito, escolha a categoria P12 — a conta a pagar é criada sozinha, já no lugar certo.",
        "Compra no crédito entra na P12 pela fatura do cartão no fim do mês — não lance de novo.",
        "Quando o pedido chegar, clique em 'A caminho' para marcar como recebido.",
      ],
      tips: [
        "O selo 'P12 OK' mostra que a conta vinculada existe; 'Via fatura' significa que entra pela fatura do cartão.",
        "Excluir uma compra também exclui a conta a pagar que ela criou.",
      ],
    },
  },
  {
    pattern: "/financeiro/metas",
    guide: {
      title: "Controle de Metas",
      whatIs:
        "É o painel de metas da CEO: meta mínima, meta e super meta do mês, com a meta do dia recalculada sozinha conforme os dias em que o Dr. Daniel atende. Faturamento e pacientes vêm das comandas automaticamente.",
      steps: [
        "Abra o painel e veja onde o mês está: meta mínima, meta e super meta.",
        "Confira a meta do dia — ela muda conforme a agenda do Dr. Daniel, sem precisar mexer em nada.",
        "Acompanhe faturamento e número de pacientes: os dois vêm das comandas sozinhos.",
        "Toque em Copiar meta do dia para gerar o resumo pronto e colar no WhatsApp da equipe.",
      ],
      tips: [
        "Não precisa digitar faturamento aqui — se o número está errado, é comanda faltando ou errada.",
        "Mande o resumo da meta do dia de manhã, antes do primeiro atendimento.",
      ],
    },
  },
  {
    pattern: "/crm/minhas-tarefas",
    guide: {
      title: "Minhas Tarefas (CRM)",
      whatIs:
        "É a sua fila de contatos do dia: cada tarefa é uma pessoa para falar, com a mensagem já pronta. É por aqui que as réguas de relacionamento viram conversa de verdade.",
      steps: [
        "Abra a fila e comece pela primeira tarefa do dia.",
        "Toque em copiar mensagem para pegar o texto pronto.",
        "Toque em abrir WhatsApp: a conversa com a pessoa abre direto.",
        "Envie a mensagem e, quando a pessoa responder, registre a resposta na tarefa.",
        "Conclua a tarefa para ela sair da fila e a régua seguir o fluxo.",
      ],
      tips: [
        "Não pule o registro da resposta: é ele que mantém o histórico do contato completo.",
        "Fila zerada no fim do dia é a meta — tarefa acumulada esfria o lead.",
      ],
    },
  },
  {
    pattern: "/crm/vendas",
    guide: {
      title: "Vendas (Kanban)",
      whatIs:
        "É o quadro de vendas: cada coluna é uma etapa da caminhada do lead até fechar. Toda negociação nasce aqui.",
      steps: [
        "Chegou um lead novo? Toque em Novo lead: ele cria o contato e a negociação de uma vez.",
        "Acompanhe cada cartão: ele mostra em que etapa a negociação está.",
        "Quando o lead avançar de verdade, arraste o cartão para a próxima coluna — o app valida se a passagem é permitida.",
        "Abra o cartão para ver detalhes, registrar o que foi conversado e agendar o próximo passo.",
      ],
      tips: [
        "Negociação só nasce aqui — não tente criar em outra tela.",
        "Se o app barrar o arraste, é porque falta cumprir algo da etapa atual.",
        "Cartão parado muitos dias na mesma coluna merece um contato de resgate.",
      ],
    },
  },
  {
    pattern: "/crm/cadencias",
    guide: {
      title: "Cadências (réguas)",
      whatIs:
        "É onde você inscreve um contato nas réguas de acompanhamento D1, D5, D7 e D60. Depois de inscrito, as tarefas de contato aparecem sozinhas em Minhas Tarefas nos dias certos.",
      steps: [
        "Busque o contato pelo nome.",
        "Vincule a negociação existente daquele contato.",
        "Escolha a régua certa (D1, D5, D7 ou D60) e inscreva.",
        "Pronto: nos dias da régua, a tarefa de contato aparece automaticamente em Minhas Tarefas.",
      ],
      tips: [
        "Inscreva o contato assim que a etapa pedir — régua atrasada perde o timing.",
        "Um contato sem negociação vinculada não roda a régua direito: vincule antes.",
      ],
    },
  },
  {
    pattern: "/crm/contatos",
    guide: {
      title: "Contatos (CRM)",
      whatIs:
        "É o perfil completo de cada pessoa no CRM: dados de contato, linha do tempo com tudo que já aconteceu e as tarefas ligadas a ela.",
      steps: [
        "Busque a pessoa pelo nome e abra o perfil.",
        "Leia a linha do tempo antes de falar com ela: mostra todo o histórico de conversas e atendimentos.",
        "Confira as tarefas em aberto ligadas àquele contato.",
        "Mantenha os dados atualizados: telefone, e-mail e informações importantes.",
      ],
      tips: [
        "Antes de qualquer ligação ou mensagem, 30 segundos na linha do tempo evitam perguntas repetidas.",
        "Telefone desatualizado quebra as réguas — corrija assim que descobrir.",
      ],
    },
  },
  {
    pattern: "/inteligencia-360",
    guide: {
      title: "Inteligência 360",
      whatIs:
        "É o painel executivo do Instituto: reúne os números de todas as áreas em um lugar só, tudo calculado automaticamente. Ninguém digita nada aqui.",
      steps: [
        "Abra o painel e percorra os blocos: faturamento, metas, CRM, adesão e mais.",
        "Use Copiar meta do dia para mandar o resumo do dia para o WhatsApp.",
        "Use Gerar resumo em PDF quando precisar de um relatório para reunião ou para a gestão.",
        "Viu um número estranho? Vá até a tela de origem (comandas, contas, CRM) e corrija lá.",
      ],
      tips: [
        "Este painel é derivado: ele só reflete o que foi lançado nas outras telas.",
        "Ótimo para a reunião da manhã — abre, lê, alinha e cada um vai para o seu posto.",
      ],
    },
  },
  {
    pattern: "/administracao/colaboradores",
    guide: {
      title: "Colaboradores",
      whatIs:
        "É onde se cadastra a equipe do Instituto e se cria o login de cada pessoa. O cargo escolhido define automaticamente o que ela pode ver e fazer no app.",
      steps: [
        "Toque em novo colaborador e preencha os dados da pessoa.",
        "Escolha o cargo com atenção: é ele que define os acessos.",
        "Crie o login e entregue as credenciais para a pessoa.",
        "Quando alguém mudar de função ou sair, atualize o cadastro na hora.",
      ],
      tips: [
        "Na dúvida entre dois cargos, escolha o de menor acesso — dá para ampliar depois.",
        "Desligou alguém? Desative o login no mesmo dia.",
      ],
    },
  },
  {
    pattern: "/administracao/estalecas",
    guide: {
      title: "Administração de Estalecas",
      whatIs:
        "É o painel da coordenação para o programa de Estalecas: aprovar conquistas, criar o código de check-in do dia e cuidar de prêmios e ajustes.",
      steps: [
        "Todo dia, crie o código de check-in de academia/igreja e divulgue para a equipe.",
        "Revise as conquistas enviadas: veja a prova e aprove ou recuse cada uma.",
        "Cadastre e mantenha os prêmios que podem ser trocados por Estalecas.",
        "Precisou corrigir um saldo? Use os ajustes, sempre anotando o motivo.",
      ],
      tips: [
        "Código novo a cada dia — código repetido tira a graça e a confiança do check-in.",
        "Aprove as conquistas rápido: reconhecimento que demora perde o efeito.",
      ],
    },
  },
  {
    pattern: "/administracao/seguranca",
    guide: {
      title: "Segurança e acessos",
      whatIs:
        "É onde se define o que cada cargo pode ver e fazer no app. Mudou aqui, mudou para todo mundo daquele cargo.",
      steps: [
        "Escolha o cargo que quer revisar.",
        "Veja a lista de áreas e ações liberadas para ele.",
        "Ative ou desative os acessos conforme a função real do cargo.",
        "Salve e avise as pessoas afetadas se algo importante mudou.",
      ],
      tips: [
        "Regra de ouro: cada cargo enxerga só o que precisa para trabalhar.",
        "Antes de liberar um acesso amplo, pergunte-se se um acesso menor já resolveria.",
      ],
    },
  },
  {
    pattern: "/administracao/auditoria",
    guide: {
      title: "Auditoria",
      whatIs:
        "É o registro de quem fez o quê e quando dentro do app, escrito em linguagem simples, sem códigos. Serve para entender o histórico e esclarecer dúvidas.",
      steps: [
        "Abra a lista de eventos: os mais recentes aparecem primeiro.",
        "Use o filtro por pessoa para ver as ações de alguém específico.",
        "Use o filtro por área para focar em um assunto (financeiro, CRM, administração...).",
        "Leia o evento: ele diz em português o que foi feito e o momento exato.",
      ],
      tips: [
        "Sumiu ou mudou um lançamento? A auditoria conta a história antes de qualquer suposição.",
        "Auditoria é para esclarecer, não para caçar culpados — use com esse espírito.",
      ],
    },
  },
  {
    pattern: "/meu-perfil",
    guide: {
      title: "Meu perfil",
      whatIs:
        "É a sua página pessoal no app: seus dados, as permissões que o seu cargo libera e a sua foto de perfil.",
      steps: [
        "Confira se os seus dados estão corretos e atualize o que mudou.",
        "Veja a lista de permissões liberadas — é o que o seu cargo permite fazer no app.",
        "Troque o avatar se quiser: uma foto ajuda a equipe a te reconhecer.",
        "Sentiu falta de algum acesso para trabalhar? Fale com a coordenação.",
      ],
      tips: [
        "As permissões vêm do cargo — não dá para mudá-las por aqui.",
        "Mantenha o telefone atualizado: é por ele que a equipe te encontra.",
      ],
    },
  },
];

/**
 * Encontra o guia da tela pelo caminho da URL.
 * - Normaliza barra final ("/tarefas/" vira "/tarefas").
 * - Retorna o guia do pattern MAIS LONGO que combina com o início do caminho.
 * - "/" e "/inicio" retornam o guia de Início.
 */
export function findPageGuide(pathname: string): PageGuide | null {
  let path = (pathname || "/").trim();

  // Normaliza barras finais.
  while (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  if (path === "") {
    path = "/";
  }

  // A raiz é a tela de Início.
  if (path === "/") {
    path = "/inicio";
  }

  let best: PageGuide | null = null;
  let bestLength = -1;

  for (const entry of pageGuides) {
    if (path.startsWith(entry.pattern) && entry.pattern.length > bestLength) {
      best = entry.guide;
      bestLength = entry.pattern.length;
    }
  }

  return best;
}
