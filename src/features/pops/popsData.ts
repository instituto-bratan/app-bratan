export type PopsAreaId =
  | "recepcao_comercial"
  | "gestao"
  | "enfermagem"
  | "higienizacao_limpeza"
  | "copa_nutricao"
  | "financeiro_administrativo";

export type PopsArea = {
  id: PopsAreaId;
  label: string;
  descricao: string;
  foco: string;
  responsaveis: string[];
  tarefasDoDia: string[];
};

export type FluxogramaDocumento = {
  id: string;
  areaId: PopsAreaId;
  titulo: string;
  setor: string;
  responsavel: string;
  categoria: string;
  resumo: string;
  etapas: string[];
  tarefasSugeridas: string[];
  tags: string[];
  fileName: string;
  assetPath: string;
};

function fluxogramaPath(fileName: string) {
  return `${import.meta.env.BASE_URL}fluxogramas/${encodeURIComponent(fileName)}`;
}

export const popsAreas: PopsArea[] = [
  {
    id: "recepcao_comercial",
    label: "Recepção / Comercial",
    descricao: "Captação, qualificação, acolhimento, documentação, contratos e pós-venda.",
    foco: "Garantir uma jornada premium do primeiro contato até o acompanhamento.",
    responsaveis: ["Recepcionista", "Secretaria / Concierge", "Comercial"],
    tarefasDoDia: [
      "Confirmar consultas D-2 e D-1 e registrar no iClinic/PDCA Comercial.",
      "Acolher paciente, questionário, bioimpedância e encaminhamento à consulta.",
      "Conferir contratos no SuperSign antes do envio e acompanhar assinaturas.",
      "Registrar adesão, não adesão, presente e responsável pelo paciente.",
      "Fazer pós-venda D+1 e manter acompanhamento semanal quando aplicável.",
    ],
  },
  {
    id: "gestao",
    label: "Gestão",
    descricao: "Coordenação da experiência pré e pós-consulta, conferência e não adesão.",
    foco: "Tirar ruído entre recepção, médico, enfermagem e entrega final.",
    responsaveis: ["Gestor", "Secretaria Executiva", "Coordenação"],
    tarefasDoDia: [
      "Conferir pré-consulta: cadastro, assinatura, documentos e bioimpedância.",
      "Validar contrato, prontuário físico e entrega final antes de liberar o paciente.",
      "Acompanhar não adesões e direcionar receitas conforme regra definida.",
      "Garantir entrega de plano, presente e orientação final pela enfermagem.",
    ],
  },
  {
    id: "enfermagem",
    label: "Enfermagem",
    descricao: "Procedimentos, medicações, estoque, esterilização, emergências e acompanhamento.",
    foco: "Executar com segurança, rastreabilidade e registro obrigatório.",
    responsaveis: ["Enfermeira", "Equipe de Enfermagem", "Dr. Daniel"],
    tarefasDoDia: [
      "Conferir prescrições, materiais, EPIs, sala e identificação do paciente.",
      "Registrar medicações, flebotomia, intercorrências e procedimentos no sistema correto.",
      "Atualizar acompanhamento de pacientes em tratamento, doses e bioimpedância.",
      "Controlar estoque: mínimo, vencimentos, compras, recebimento e entrada no iClinic.",
      "Garantir esterilização, descarte e disponibilidade do DEA.",
    ],
  },
  {
    id: "higienizacao_limpeza",
    label: "Higienização / Limpeza",
    descricao: "Limpeza concorrente/terminal, saneantes, EPIs e controle de geladeira.",
    foco: "Manter ambientes seguros e registrar conformidade.",
    responsaveis: ["Limpeza", "Higienização"],
    tarefasDoDia: [
      "Classificar ambientes e aplicar limpeza conforme criticidade.",
      "Usar EPIs, saneantes corretos e registrar checklist.",
      "Controlar temperatura da geladeira e agir quando sair da faixa.",
    ],
  },
  {
    id: "copa_nutricao",
    label: "Copa / Nutrição",
    descricao: "Alimentos prontos, lanches, validade, etiquetagem e rastreabilidade.",
    foco: "Oferecer alimentos seguros, identificados e dentro do padrão.",
    responsaveis: ["Copa", "Nutrição", "Recepção"],
    tarefasDoDia: [
      "Conferir validade, temperatura, higiene da bancada e insumos antes da montagem.",
      "Higienizar frutas, montar, embalar, etiquetar e refrigerar imediatamente.",
      "Registrar rastreabilidade na planilha integrada quando houver oferta ao paciente.",
    ],
  },
  {
    id: "financeiro_administrativo",
    label: "Financeiro / Administrativo",
    descricao: "Fechamento diário, conciliação, notas, compras, reembolso e arquivamento.",
    foco: "Preservar rastreabilidade de ponta a ponta no movimento financeiro.",
    responsaveis: ["Gestor Financeiro", "Financeiro", "Administrativo"],
    tarefasDoDia: [
      "Coletar comandas, receitas, comprovantes, contratos e documentos do crediário.",
      "Conferir valores, meios de pagamento, taxas, rendimentos e travas de caixa.",
      "Atualizar planilhas, PDCA Comercial, P12, NFS-e e arquivos no SharePoint.",
      "Validar compras institucionais com NF/invoice, comprovante, formulário e destino.",
    ],
  },
];

export const fluxogramas: FluxogramaDocumento[] = [
  {
    id: "administracao-medicamento-im",
    areaId: "enfermagem",
    titulo: "Administração de Medicamento - Via Intramuscular",
    setor: "Enfermagem",
    responsavel: "Equipe de Enfermagem",
    categoria: "Procedimento assistencial",
    resumo: "Técnica em Z para aplicação intramuscular segura, com preparo, técnica, descarte e registro.",
    etapas: ["Preparo", "Técnica e aplicação", "Pós e descarte", "Registro"],
    tarefasSugeridas: [
      "Conferir medicamento, dose, via, paciente e prescrição.",
      "Paramentar-se, aplicar técnica em Z, observar resposta por 30 minutos.",
      "Descartar perfurocortantes e registrar no prontuário eletrônico.",
    ],
    tags: ["medicação", "prescrição", "registro", "descarte"],
    fileName: "Fluxograma — Administracao de Medicamento — Via Intramuscular.png",
    assetPath: fluxogramaPath("Fluxograma — Administracao de Medicamento — Via Intramuscular.png"),
  },
  {
    id: "atendimento-clinica-vendas",
    areaId: "recepcao_comercial",
    titulo: "Atendimento na Clínica e Processo de Vendas",
    setor: "Recepção / Comercial",
    responsavel: "Recepcionista / Vendedor",
    categoria: "Jornada comercial",
    resumo: "Condução do paciente da chegada ao fechamento, documentação, contrato e início do tratamento.",
    etapas: ["Atendimento na clínica", "Decisão do paciente", "Registro e documentação", "Conferência e assinatura", "Início do tratamento"],
    tarefasSugeridas: [
      "Entregar questionário, direcionar bioimpedância e escanear documentos.",
      "Registrar fechamento ou não fechamento no prontuário.",
      "Emitir contrato, separar presente, conferir assinatura e arquivar contrato.",
    ],
    tags: ["recepção", "vendas", "contrato", "bioimpedância"],
    fileName: "Fluxograma — Atendimento na Clínica e Processo de Vendas.png",
    assetPath: fluxogramaPath("Fluxograma — Atendimento na Clínica e Processo de Vendas.png"),
  },
  {
    id: "boas-praticas-limpeza-desinfeccao",
    areaId: "higienizacao_limpeza",
    titulo: "Boas Práticas de Limpeza e Desinfecção",
    setor: "Higienização / Limpeza",
    responsavel: "Higienização",
    categoria: "Ambientes",
    resumo: "Higienização por criticidade, com saneantes corretos e registro em checklist.",
    etapas: ["Classificar e preparar", "Proteger e aplicar", "Esfregar e secar", "Inspecionar e registrar"],
    tarefasSugeridas: [
      "Classificar a área e definir limpeza concorrente ou terminal.",
      "Separar EPIs, detergente e hipoclorito.",
      "Inspecionar resultado, lavar EPIs e registrar checklist.",
    ],
    tags: ["limpeza", "desinfecção", "checklist", "EPI"],
    fileName: "Fluxograma — Boas Práticas de Limpeza e Desinfecção.png",
    assetPath: fluxogramaPath("Fluxograma — Boas Práticas de Limpeza e Desinfecção.png"),
  },
  {
    id: "compras-conta-pessoal-socios",
    areaId: "financeiro_administrativo",
    titulo: "Compras Institucionais via Conta Pessoal de Sócios",
    setor: "Financeiro",
    responsavel: "Setor Financeiro",
    categoria: "Compras e reembolso",
    resumo: "Compra sem NF-e nacional paga por sócio, com documentação, justificativa, reembolso e validação fiscal.",
    etapas: ["Elegibilidade", "Documentação", "Formulário e justificativa", "Reembolso e lançamento", "Arquivamento e validação"],
    tarefasSugeridas: [
      "Validar se a compra é pontual, institucional e permitida por CPF.",
      "Anexar pedido, documento fiscal aceito, tributos e comprovante de pagamento.",
      "Preencher formulário de reembolso, lançar natureza correta e arquivar processo completo.",
    ],
    tags: ["financeiro", "compras", "reembolso", "arquivo"],
    fileName: "Fluxograma — Compras Institucionais via Conta Pessoal de Sócios.png",
    assetPath: fluxogramaPath("Fluxograma — Compras Institucionais via Conta Pessoal de Sócios.png"),
  },
  {
    id: "contratos-supersign",
    areaId: "recepcao_comercial",
    titulo: "Contratos no SuperSign - Passo a Passo",
    setor: "Recepção / Comercial",
    responsavel: "Andrya Bratan",
    categoria: "Contratos",
    resumo: "Envio e assinatura digital de contratos no SuperSign, com ordem, autenticação por WhatsApp e conferência final.",
    etapas: ["Acesso e seleção", "Nomear envelope", "Participantes e autenticação", "Conferência e envio", "Execução e fechamento"],
    tarefasSugeridas: [
      "Selecionar modelo correto e nomear envelope no padrão.",
      "Conferir ordem de assinatura, contatos, WhatsApp e ausência de campos em branco.",
      "Acompanhar assinatura administrativa, empresa, paciente/colaborador e testemunhas.",
    ],
    tags: ["contrato", "SuperSign", "assinatura", "WhatsApp"],
    fileName: "Fluxograma — Contratos no SuperSing — Passo a Passo.png",
    assetPath: fluxogramaPath("Fluxograma — Contratos no SuperSing — Passo a Passo.png"),
  },
  {
    id: "controle-pacientes-iclinic-sharepoint",
    areaId: "enfermagem",
    titulo: "Controle de Pacientes - iClinic e SharePoint",
    setor: "Enfermagem",
    responsavel: "Juliana Bonato",
    categoria: "Acompanhamento",
    resumo: "Acompanhamento de pacientes em tratamento usando iClinic, SharePoint e chat corporativo.",
    etapas: ["Medicações no iClinic", "Contatos de acompanhamento", "Finalização", "Calendário SharePoint", "Comunicação e bioimpedância"],
    tarefasSugeridas: [
      "Registrar medicação e criar lembretes de acompanhamento.",
      "Fazer contatos de 30 e 60 dias, além de contatos semanais para doses programadas.",
      "Registrar pendências no calendário SharePoint e usar apenas canais corporativos.",
    ],
    tags: ["iClinic", "SharePoint", "tratamento", "bioimpedância"],
    fileName: "Fluxograma — Controle de Pacientes - iClinic e SharePoint.png",
    assetPath: fluxogramaPath("Fluxograma — Controle de Pacientes - iClinic e SharePoint.png"),
  },
  {
    id: "flebotomia-terapeutica",
    areaId: "enfermagem",
    titulo: "Flebotomia Terapêutica (Sangria Terapêutica)",
    setor: "Enfermagem",
    responsavel: "Equipe de Enfermagem",
    categoria: "Procedimento assistencial",
    resumo: "Coleta terapêutica para remoção de volume ou produtos do metabolismo, com monitoramento e registro.",
    etapas: ["Preparo", "Acesso venoso", "Coleta e monitoramento", "Encerramento"],
    tarefasSugeridas: [
      "Conferir prescrição, dados do paciente, volume e sinais vitais.",
      "Montar bolsa de sangria, controlar vazão e atingir volume prescrito.",
      "Descartar bolsa, orientar paciente e registrar anotação de enfermagem.",
    ],
    tags: ["sangria", "sinais vitais", "descarte", "registro"],
    fileName: "Fluxograma — Flebotomia Terapeutica (Sangria Terapeutica).png",
    assetPath: fluxogramaPath("Fluxograma — Flebotomia Terapeutica (Sangria Terapeutica).png"),
  },
  {
    id: "fluxo-pre-pos-consulta",
    areaId: "gestao",
    titulo: "Fluxo Operacional Pré e Pós-Consulta do Paciente",
    setor: "Gestão",
    responsavel: "Gestão",
    categoria: "Experiência do paciente",
    resumo: "Da chegada à entrega final, com excelência no acolhimento, documentação, adesão e pós-venda.",
    etapas: ["Pré-consulta", "Consulta e conduta", "Paciente aderiu", "Conferência e não adesão", "Entrega final e pós-venda"],
    tarefasSugeridas: [
      "Conferir cadastro, assinatura, documentos e bioimpedância.",
      "Registrar valor/desconto, encaminhar receitas e montar presente quando houver adesão.",
      "Conferir contrato e garantir entrega final com pós-venda D+1.",
    ],
    tags: ["gestão", "pré-consulta", "pós-consulta", "adesão"],
    fileName: "Fluxograma — Fluxo Operacional Pré e Pós-Consulta do Paciente.png",
    assetPath: fluxogramaPath("Fluxograma — Fluxo Operacional Pré e Pós-Consulta do Paciente.png"),
  },
  {
    id: "jornada-paciente-alto-ticket",
    areaId: "recepcao_comercial",
    titulo: "Jornada do Paciente e Fechamento Alto Ticket - Protocolo Bratan",
    setor: "Recepção",
    responsavel: "Recepção / Secretaria",
    categoria: "Alto ticket",
    resumo: "Captação, qualificação, consulta premium, fechamento e acompanhamento contínuo.",
    etapas: ["Captação e qualificação", "Consulta e experiência premium", "Fechamento alto ticket", "Pós-venda e acompanhamento"],
    tarefasSugeridas: [
      "Aplicar script obrigatório e filtrar perfil alto ticket.",
      "Preparar recepção, kit paciente e condução sem pressa.",
      "Fazer transição, tratar objeções, fechar e manter responsável pelo paciente.",
    ],
    tags: ["alto ticket", "vendas", "pós-venda", "qualificação"],
    fileName: "Fluxograma — Jornada do Paciente e Fechamento Alto Ticket - Protocolo Bratan.png",
    assetPath: fluxogramaPath("Fluxograma — Jornada do Paciente e Fechamento Alto Ticket - Protocolo Bratan.png"),
  },
  {
    id: "alimentos-prontos-paciente",
    areaId: "copa_nutricao",
    titulo: "Controle de Alimentos Prontos para Oferta ao Paciente",
    setor: "Higienização / Copa (Nutrição)",
    responsavel: "Equipe responsável pela copa / recepção",
    categoria: "Segurança alimentar",
    resumo: "Seleção, higienização, embalagem, identificação e armazenamento de frutas e lanches naturais.",
    etapas: ["Selecionar e receber", "Higienizar", "Montar e identificar", "Armazenar e rastrear"],
    tarefasSugeridas: [
      "Selecionar fornecedor e recusar matéria-prima inadequada.",
      "Higienizar manipulação, lavar em água corrente e sanitizar com hipoclorito.",
      "Etiquetar, refrigerar entre 4 e 8 °C e registrar rastreabilidade.",
    ],
    tags: ["alimentos", "validade", "temperatura", "rastreabilidade"],
    fileName: "Fluxograma — POP-ALIM-01 Controle de Alimentos Prontos para Oferta ao Paciente.png",
    assetPath: fluxogramaPath("Fluxograma — POP-ALIM-01 Controle de Alimentos Prontos para Oferta ao Paciente.png"),
  },
  {
    id: "montagem-lanche-natural",
    areaId: "copa_nutricao",
    titulo: "Montagem de Lanche Natural Integral",
    setor: "Higienização / Copa (Nutrição)",
    responsavel: "Copa / colaborador responsável",
    categoria: "Segurança alimentar",
    resumo: "Montagem do sanduíche natural com pré-produção conferida, embalagem identificada e refrigeração imediata.",
    etapas: ["Pré-produção", "Montar", "Embalar e identificar", "Controle de qualidade"],
    tarefasSugeridas: [
      "Conferir geladeira, bancada, mãos, luvas, validade e abertura dos insumos.",
      "Montar no momento correto, embalar imediatamente e etiquetar com data e responsável.",
      "Descartar produto vencido, alterado ou fora de refrigeração.",
    ],
    tags: ["lanche", "copa", "validade", "refrigeração"],
    fileName: "Fluxograma — POP-ALIM-01 Montagem de Lanche Natural Integral.png",
    assetPath: fluxogramaPath("Fluxograma — POP-ALIM-01 Montagem de Lanche Natural Integral.png"),
  },
  {
    id: "emissao-receitas-compra-medicamentos",
    areaId: "enfermagem",
    titulo: "Emissão de Receitas para Compra de Medicamentos",
    setor: "Enfermagem / Compras",
    responsavel: "Assistente Administrativo / Compras",
    categoria: "Compras clínicas",
    resumo: "Prescrições vinculadas a pacientes reais, na quantidade exata da compra e com registro em planilha.",
    etapas: ["Identificar pacientes", "Emitir no Memed", "Segurança e envio", "Controle"],
    tarefasSugeridas: [
      "Identificar pacientes reais com indicação e nunca emitir em nome de colaboradores.",
      "Emitir receita no Memed com quantidade exata e desativar envio automático ao paciente.",
      "Enviar ao fornecedor e registrar compra na planilha com prazo e responsável.",
    ],
    tags: ["receitas", "Memed", "compras", "medicamentos"],
    fileName: "Fluxograma — POP-ENF · Etapa 2 Emissão de Receitas para Compra de Medicamentos.png",
    assetPath: fluxogramaPath("Fluxograma — POP-ENF · Etapa 2 Emissão de Receitas para Compra de Medicamentos.png"),
  },
  {
    id: "compras-estoque-medicamentos",
    areaId: "enfermagem",
    titulo: "Compras e Controle de Estoque de Medicamentos",
    setor: "Enfermagem / Compras",
    responsavel: "Enfermagem + Compras + Dr. Daniel",
    categoria: "Estoque",
    resumo: "Do relatório de estoque à entrada da mercadoria, com validação clínica, receitas e rastreabilidade.",
    etapas: ["Levantamento", "Validar e aprovar", "Comprar", "Receber e arquivar"],
    tarefasSugeridas: [
      "Receber relatório e conferir mínimo, vencimentos e consumo dos últimos 30 dias.",
      "Montar lista preliminar, obter aprovação do Dr. Daniel e providenciar receitas.",
      "Solicitar orçamento, comprar, lançar no SharePoint e dar entrada no iClinic.",
    ],
    tags: ["estoque", "compras", "iClinic", "SharePoint"],
    fileName: "Fluxograma — POP-ENF Compras e Controle de Estoque de Medicamentos.png",
    assetPath: fluxogramaPath("Fluxograma — POP-ENF Compras e Controle de Estoque de Medicamentos.png"),
  },
  {
    id: "fechamento-financeiro-diario",
    areaId: "financeiro_administrativo",
    titulo: "Fechamento Financeiro Diário",
    setor: "Financeiro / Administrativo",
    responsavel: "Setor Financeiro",
    categoria: "Fechamento",
    resumo: "Conferência, conciliação, classificação, registro e arquivamento do movimento do dia.",
    etapas: ["Coletar", "Conferir e conciliar", "Classificar e registrar", "Emitir e fechar"],
    tarefasSugeridas: [
      "Reunir comandas, receitas, comprovantes, contratos e documentos do crediário.",
      "Conferir agenda, adesão, composição do plano, valores e formas de pagamento.",
      "Classificar entradas, taxas, rendimentos, atualizar PDCA/P12 e arquivar NFS-e.",
    ],
    tags: ["financeiro", "conciliação", "NFS-e", "P12"],
    fileName: "Fluxograma — POP-FIN-001 Fechamento Financeiro Diário.png",
    assetPath: fluxogramaPath("Fluxograma — POP-FIN-001 Fechamento Financeiro Diário.png"),
  },
  {
    id: "agendamento-primeira-consulta",
    areaId: "recepcao_comercial",
    titulo: "Agendamento de Primeira Consulta e Apresentação do Plano Bratan",
    setor: "Gestão",
    responsavel: "Secretaria Premium / Gestão",
    categoria: "Agendamento",
    resumo: "Agendamento, registro e acompanhamento da primeira consulta com qualidade.",
    etapas: ["Recepção e qualificação", "Agendamento", "Registro e comunicação", "Acompanhamento e encerramento"],
    tarefasSugeridas: [
      "Receber lead, apresentar Instituto e coletar dados obrigatórios.",
      "Oferecer datas dentro do prazo, explicar condições e confirmar pagamento.",
      "Cadastrar no iClinic, enviar guia, atualizar controles e confirmar D-2/D-1.",
    ],
    tags: ["agendamento", "lead", "iClinic", "confirmação"],
    fileName: "Fluxograma — POP-GES-001 Agendamento de Primeira Consulta e Apresentação do Plano Bratan.png",
    assetPath: fluxogramaPath("Fluxograma — POP-GES-001 Agendamento de Primeira Consulta e Apresentação do Plano Bratan.png"),
  },
  {
    id: "controle-temperatura-geladeira",
    areaId: "higienizacao_limpeza",
    titulo: "Controle de Temperatura da Geladeira",
    setor: "Higienização / Limpeza",
    responsavel: "Andrya Naara",
    categoria: "Controle ambiental",
    resumo: "Monitoramento do termômetro digital para conservação adequada dos alimentos.",
    etapas: ["Instalação e preparo", "Configuração", "Leitura e monitoramento"],
    tarefasSugeridas: [
      "Manter equipamento fixado e cabo preservado.",
      "Ler unidade em Celsius, limpar/resetar quando necessário e substituir pilha se preciso.",
      "Observar temperaturas interna e externa e agir se sair da faixa.",
    ],
    tags: ["geladeira", "temperatura", "alimentos", "monitoramento"],
    fileName: "Fluxograma — POP. HIG - 005 Controle de Temperatura da Geladeira.png",
    assetPath: fluxogramaPath("Fluxograma — POP. HIG - 005 Controle de Temperatura da Geladeira.png"),
  },
  {
    id: "esterilizacao-instrumental",
    areaId: "enfermagem",
    titulo: "Esterilização de Instrumental",
    setor: "Enfermagem",
    responsavel: "Profissionais da Enfermagem",
    categoria: "Esterilização",
    resumo: "Limpeza e esterilização do instrumental para reduzir carga microbiana e garantir reuso seguro.",
    etapas: ["Limpeza e descontaminação", "Inspeção e embalagem", "Esterilização em autoclave"],
    tarefasSugeridas: [
      "Higienizar mãos, usar EPIs, detergente enzimático, escovar, enxaguar e secar.",
      "Inspecionar integridade, embalar em papel grau cirúrgico e identificar.",
      "Executar ciclo de autoclave, aguardar despressurização e conferir embalagens.",
    ],
    tags: ["esterilização", "autoclave", "instrumental", "EPI"],
    fileName: "Fluxograma — POP.ENF 002 Esterilização de Instrumental.png",
    assetPath: fluxogramaPath("Fluxograma — POP.ENF 002 Esterilização de Instrumental.png"),
  },
  {
    id: "uso-dea",
    areaId: "enfermagem",
    titulo: "Uso do DEA (Desfibrilador Externo Automático)",
    setor: "Enfermagem",
    responsavel: "Enfermeira Beatriz",
    categoria: "Emergência",
    resumo: "Aplicação do DEA em parada cardiorrespiratória, com análise de ritmo e suporte mantido.",
    etapas: ["Preparação", "Análise do ritmo", "Desfibrilação", "Situações especiais"],
    tarefasSugeridas: [
      "Ligar o DEA, instalar eletrodos e seguir áudio/visor em sequência.",
      "Garantir que ninguém toque no paciente durante análise e choque.",
      "Reiniciar compressões e manter suporte até retorno do paciente ou chegada do SAV.",
    ],
    tags: ["DEA", "emergência", "desfibrilação", "SAV"],
    fileName: "Fluxograma — Uso do DEA (Desfibrilador Externo Automático).png",
    assetPath: fluxogramaPath("Fluxograma — Uso do DEA (Desfibrilador Externo Automático).png"),
  },
];

export const totalPopsTasks = popsAreas.reduce((total, area) => total + area.tarefasDoDia.length, 0);

export function documentsByArea(areaId: PopsAreaId) {
  return fluxogramas.filter((documento) => documento.areaId === areaId);
}
