// ORIENTAÇÕES POR CONDIÇÃO — RASCUNHOS PARA A DRA. GÉSSICA REVISAR (16/10/2026).
//
// Resposta dela (28/09/2026): quer, além do quantitativo, orientações
// qualitativas "de acordo com as diretrizes" para refluxo, gestação, gastrite,
// SOP, esteatose e outras ("mais de 20"). Estes textos são SUGESTÕES escritas a
// partir das fontes citadas em cada uma: entram na Biblioteca marcados como
// rascunho e não saem em nenhum plano finalizado antes de ela ler e marcar
// "Revisei" (revisao.ts). Depois de revisados, são dela: editar cria versão nova.
import type { BlocoBiblioteca } from "./tipos";

const CRIADO_EM = "2026-10-16T00:00:00.000Z";

type Rascunho = { id: string; titulo: string; itens: string[]; fonte: string };

// Gestação: cafeína pelo Fascículo 3 do Ministério da Saúde (100 mg/dia, cerca de uma xícara), o
// limite mais conservador; o ACOG (2010) aceita até 200 mg/dia. Decisão final da Dra. Géssica.
const RASCUNHOS: Rascunho[] = [
  {
    id: "orient-refluxo",
    titulo: "Orientações para refluxo",
    itens: [
      "Faça refeições menores e mais frequentes, evitando grandes volumes de uma vez.",
      "Faça a última refeição pelo menos 2 a 3 horas antes de se deitar.",
      "Depois de comer, evite deitar-se ou recostar-se no sofá.",
      "Coma devagar e mastigue bem os alimentos.",
      "Observe se café, chocolate, hortelã, molho de tomate, frutas cítricas, bebidas com gás ou pimenta pioram seus sintomas e reduza apenas o que piorar.",
      "Prefira preparações cozidas, assadas ou grelhadas no lugar de frituras e comidas muito gordurosas.",
      "Observe também se bebidas alcoólicas pioram o refluxo e, se piorarem, evite-as.",
      "Se o seu plano incluir perda de peso, siga-o com constância, pois reduzir o excesso de peso é uma das medidas que mais aliviam o refluxo.",
    ],
    fonte: "ACG Clinical Guideline for the Diagnosis and Management of GERD (Katz et al., 2022); Guia Alimentar para a População Brasileira, Ministério da Saúde (2014)",
  },
  {
    id: "orient-gastrite",
    titulo: "Orientações para gastrite e dispepsia",
    itens: [
      "Mantenha horários regulares para as refeições e evite ficar muitas horas sem comer.",
      "Faça refeições menores e mais frequentes, evitando grandes volumes de uma vez.",
      "Coma devagar, mastigue bem e faça as refeições em ambiente tranquilo.",
      "Prefira preparações cozidas, assadas ou grelhadas e reduza frituras e comidas muito gordurosas, que costumam aumentar a sensação de estômago pesado.",
      "Observe se café, chá preto ou mate, bebidas com gás, pimenta, temperos fortes ou frutas ácidas pioram seus sintomas e reduza apenas o que piorar.",
      "Evite bebidas alcoólicas, que podem agravar o desconforto no estômago.",
      "Não corte grupos inteiros de alimentos por conta própria e combine qualquer restrição com sua nutricionista.",
      "Dê preferência a alimentos in natura ou minimamente processados e reduza os ultraprocessados.",
    ],
    fonte: "British Society of Gastroenterology guidelines on the management of functional dyspepsia (Black et al., 2022); Guia Alimentar para a População Brasileira, Ministério da Saúde (2014)",
  },
  {
    id: "orient-gestacao",
    titulo: "Orientações para gestação",
    itens: [
      "Faça de alimentos in natura ou minimamente processados a base das refeições, como feijão, arroz, legumes, verduras, frutas, ovos, carnes e leite.",
      "Beba água filtrada ou fervida ao longo do dia e evite refrigerantes, sucos de caixinha ou em pó e refrescos.",
      "Evite ultraprocessados, como embutidos, macarrão instantâneo, salgadinhos de pacote e biscoitos recheados.",
      "Limite a cafeína a até 100 mg por dia, o que equivale a cerca de uma xícara de café ou de chá preto, verde ou mate.",
      "Não consuma bebidas alcoólicas durante a gestação.",
      "Coma carnes, aves, peixes, frutos do mar e ovos sempre bem cozidos, evitando preparações cruas ou malpassadas, como sushi, sashimi e carpaccio.",
      "Consuma apenas leite e derivados pasteurizados, evitando leite cru e queijos sem procedência.",
      "Lave frutas, legumes e verduras em água corrente, deixe-os de molho em solução de hipoclorito ou água sanitária própria para alimentos, conforme o rótulo, e enxágue antes de comê-los crus.",
      "Inclua peixes como sardinha e salmão e evite cação, peixe-espada e outros peixes grandes predadores, que acumulam mais mercúrio.",
      "Se tiver enjoo, faça refeições menores e mais frequentes, beba líquidos nos intervalos entre elas e evite deitar logo após comer.",
    ],
    fonte: "Ministério da Saúde e USP, Protocolos de uso do Guia Alimentar, Fascículo 3: orientação alimentar de gestantes (2021); TelessaúdeRS-UFRGS, prevenção da toxoplasmose na gestação (2023); FDA e EPA, Advice about Eating Fish (2021)",
  },
  {
    id: "orient-esteatose",
    titulo: "Orientações para esteatose hepática",
    itens: [
      "Siga um padrão alimentar no estilo mediterrâneo, com legumes, verduras, frutas, feijões, cereais integrais, peixes e azeite de oliva.",
      "Reduza ultraprocessados, como biscoitos recheados, salgadinhos, embutidos, doces industrializados e fast-food.",
      "Evite refrigerantes, sucos adoçados e outras bebidas com açúcar e prefira água.",
      "Prefira a fruta inteira ao suco, mesmo ao suco natural.",
      "Evite bebidas alcoólicas, pois elas também sobrecarregam o fígado.",
      "Prefira gorduras como azeite, castanhas e peixes e reduza carnes gordurosas, manteiga e frituras.",
      "Se você já toma café e se sente bem com ele, pode mantê-lo na rotina, de preferência sem açúcar.",
      "Se o seu plano incluir perda de peso, siga-o com constância, pois mesmo perdas moderadas já reduzem a gordura no fígado.",
    ],
    fonte: "EASL-EASD-EASO Clinical Practice Guidelines on the management of MASLD (2024); Guia Alimentar para a População Brasileira, Ministério da Saúde (2014)",
  },
  {
    id: "orient-sop",
    titulo: "Orientações para síndrome dos ovários policísticos (SOP)",
    itens: [
      "Baseie sua alimentação em alimentos in natura ou minimamente processados, como feijão, arroz, legumes, verduras, frutas, ovos, carnes e peixes.",
      "Não existe uma dieta específica melhor para a SOP, então o mais importante é um plano que caiba na sua rotina e nas suas preferências.",
      "Evite dietas muito restritivas ou desequilibradas, que são difíceis de manter e podem prejudicar sua saúde.",
      "Prefira cereais integrais, feijões e outras leguminosas e reduza farinhas brancas, açúcar e doces.",
      "Evite refrigerantes, sucos adoçados e outras bebidas com açúcar.",
      "Reduza ultraprocessados, como biscoitos recheados, salgadinhos, embutidos e fast-food.",
      "Mantenha horários regulares para as refeições e coma com atenção, longe de telas.",
      "Cuidar da alimentação traz benefícios mesmo quando o peso não muda, então valorize cada hábito conquistado.",
    ],
    fonte: "International Evidence-based Guideline for the Assessment and Management of PCOS (Teede et al., 2023); Guia Alimentar para a População Brasileira, Ministério da Saúde (2014)",
  },
  {
    id: "orient-constipacao",
    titulo: "Orientações para constipação intestinal",
    itens: [
      "Inclua fibras todos os dias, com frutas, legumes, verduras, feijões e cereais integrais.",
      "Aumente as fibras de forma gradual, ao longo de alguns dias, para evitar gases e desconforto.",
      "Beba água ao longo do dia, principalmente quando aumentar as fibras.",
      "Experimente incluir kiwi na rotina, fruta que ajuda o intestino de muitas pessoas.",
      "A ameixa seca também pode ajudar e pode entrar nos lanches ou como sobremesa.",
      "Prefira pães e cereais integrais, como pão de centeio integral e aveia, no lugar dos refinados.",
      "Coma as frutas com casca e bagaço sempre que possível, em vez de sucos coados.",
      "Mantenha horários regulares para as refeições, sem longos intervalos entre elas.",
    ],
    fonte: "British Dietetic Association, Guidelines for the dietary management of chronic constipation in adults (Dimidi et al., 2025); OMS, Carbohydrate intake for adults and children (2023); Guia Alimentar para a População Brasileira, Ministério da Saúde (2014)",
  },
  {
    id: "orient-glicemia",
    titulo: "Orientações para controle da glicemia",
    itens: [
      "Prefira água e evite refrigerantes, sucos, mesmo os naturais, e outras bebidas com açúcar.",
      "Reduza açúcar, doces e farinhas brancas, como pão francês, bolos e biscoitos.",
      "Prefira carboidratos ricos em fibras, como feijão, lentilha, grão-de-bico, aveia, arroz integral e outros cereais integrais.",
      "Monte o prato com muitos legumes e verduras, uma porção de proteína e uma porção moderada de arroz, massa, batata ou outro carboidrato.",
      "Use gorduras de boa qualidade, como azeite, castanhas e peixes, no lugar de manteiga, banha e carnes gordurosas.",
      "Reduza ultraprocessados, como biscoitos, salgadinhos, embutidos e refeições prontas congeladas.",
      "Mantenha horários regulares para as refeições e evite pular refeições.",
      "Se o seu plano incluir perda de peso, siga-o com constância, pois mesmo perdas moderadas melhoram o controle da glicose.",
    ],
    fonte: "Sociedade Brasileira de Diabetes, Diretriz Oficial: Terapia nutricional no pré-diabetes e no diabetes mellitus tipo 2 (2023); Guia Alimentar para a População Brasileira, Ministério da Saúde (2014)",
  },
  {
    id: "orient-hipertensao",
    titulo: "Orientações para hipertensão",
    itens: [
      "Limite o sal a menos de 5 g por dia, pouco menos de uma colher de chá, contando o sal que já vem nos alimentos industrializados.",
      "Cozinhe com pouco sal e tempere com alho, cebola, ervas, limão e especiarias.",
      "Tire o saleiro da mesa e prove a comida antes de pensar em acrescentar sal.",
      "Evite temperos prontos, caldos em cubo, embutidos, enlatados, salgadinhos e outros ultraprocessados, que concentram muito sódio.",
      "Leia os rótulos e evite produtos que tragam na embalagem a lupa de alto em sódio.",
      "Inclua frutas, legumes, verduras e feijões todos os dias, como no padrão alimentar DASH, que ajuda a controlar a pressão.",
      "Prefira leite e derivados com menos gordura e cereais integrais.",
      "Evite bebidas alcoólicas ou, se consumir, reduza a quantidade e tenha dias da semana sem álcool.",
    ],
    fonte: "SBC, SBH e SBN, Diretriz Brasileira de Hipertensão Arterial (2025); OMS, Guideline: sodium intake for adults and children (2012)",
  },
  {
    id: "orient-dislipidemia",
    titulo: "Orientações para colesterol e triglicerídeos",
    itens: [
      "Prefira carnes magras, frango sem pele e peixes e reduza carnes gordurosas, embutidos, manteiga e banha.",
      "Evite ultraprocessados, como biscoitos recheados, salgadinhos, sorvetes cremosos e salgados fritos.",
      "Use azeite de oliva ou óleos vegetais em pequena quantidade no lugar de gorduras sólidas.",
      "Inclua castanhas e sementes em pequenas porções e peixes como sardinha e salmão ao longo da semana.",
      "Aumente as fibras com aveia, feijões, lentilha, frutas, legumes e verduras, que ajudam a controlar o colesterol.",
      "Reduza açúcar, doces, refrigerantes, sucos adoçados e farinhas brancas, que favorecem o aumento dos triglicerídeos.",
      "Evite bebidas alcoólicas, que podem elevar bastante os triglicerídeos.",
      "Prefira preparações assadas, cozidas, grelhadas ou no vapor em vez de frituras.",
      "Se o seu plano incluir perda de peso, siga-o com constância, pois isso ajuda especialmente a baixar os triglicerídeos.",
    ],
    fonte: "SBC, Diretriz Brasileira de Dislipidemias e Prevenção da Aterosclerose (2025); Guia Alimentar para a População Brasileira, Ministério da Saúde (2014)",
  },
  {
    id: "orient-hipertrofia",
    titulo: "Orientações para ganho de massa muscular",
    itens: [
      "Inclua uma boa fonte de proteína em todas as refeições principais, como ovos, carnes, frango, peixes, leite, iogurte, queijos ou feijões.",
      "Distribua a proteína ao longo do dia, em vez de concentrá-la em uma única refeição.",
      "Faça uma refeição com proteína e carboidrato nas horas próximas ao treino, antes ou depois, conforme você se sentir melhor.",
      "Inclua carboidratos de boa qualidade, como arroz, feijão, batata, mandioca, frutas e pães integrais, para ter energia nos treinos.",
      "Coma o suficiente para sustentar o treino, porque comer pouco demais dificulta o ganho de massa muscular.",
      "Mantenha frutas, legumes e verduras todos os dias para garantir vitaminas, minerais e fibras.",
      "Beba água ao longo do dia e reponha líquidos durante e após o treino, principalmente em dias quentes.",
      "Se for preciso completar a proteína do dia, um lanche antes de dormir com iogurte, leite ou queijo pode ajudar.",
      "Priorize a comida de verdade e use suplementos apenas com orientação da sua nutricionista.",
    ],
    fonte: "ISSN Position Stand: protein and exercise (Jäger et al., 2017); ACSM, Academy of Nutrition and Dietetics e Dietitians of Canada, Nutrition and Athletic Performance (2016)",
  },
  {
    id: "orient-glp1",
    titulo: "Orientações para uso de agonistas de GLP-1 (semaglutida, tirzepatida)",
    itens: [
      "Faça refeições pequenas e mais frequentes, evitando grandes volumes de uma vez.",
      "Coma devagar e pare ao primeiro sinal de saciedade, mesmo que ainda haja comida no prato.",
      "Comece cada refeição pela proteína, como ovos, carnes, frango, peixes, iogurte ou feijões, para preservar seus músculos mesmo comendo pouco.",
      "Mesmo com pouco apetite, não pule refeições e garanta pequenas porções nutritivas.",
      "Evite refeições gordurosas e frituras, principalmente no início do tratamento e nos dias de enjoo.",
      "Beba água ao longo do dia, em pequenos goles, sem esperar sentir sede.",
      "Aumente as fibras aos poucos, com frutas, legumes, verduras, feijões e ameixa seca, para ajudar o intestino.",
      "Priorize alimentos in natura ou minimamente processados e reduza doces, refrigerantes e ultraprocessados.",
      "Evite bebidas alcoólicas, que podem piorar o enjoo e o refluxo.",
    ],
    fonte: "ACLM, ASN, OMA e The Obesity Society, Nutritional priorities to support GLP-1 therapy for obesity: a joint advisory (Mozaffarian et al., 2025); Guia Alimentar para a População Brasileira, Ministério da Saúde (2014)",
  },
  {
    id: "orient-endometriose",
    titulo: "Orientações para endometriose",
    itens: [
      "Priorize um padrão alimentar com frutas, legumes, verduras, grãos integrais, feijões e peixes.",
      "Dê preferência a alimentos in natura ou minimamente processados e reduza os ultraprocessados.",
      "Prefira gorduras como azeite de oliva, castanhas e peixes e reduza carnes processadas e frituras.",
      "Reduza o consumo de bebidas alcoólicas.",
      "Não retire grupos de alimentos, como glúten ou laticínios, por conta própria e converse antes com sua nutricionista.",
      "Se perceber que algum alimento piora seus sintomas intestinais, anote e leve essa observação para a consulta.",
      "Mantenha horários regulares para as refeições e coma com atenção.",
      "Beba água ao longo do dia e inclua fibras para ajudar o intestino a funcionar bem.",
    ],
    fonte: "ESHRE Guideline: Endometriosis (Becker et al., 2022); Guia Alimentar para a População Brasileira, Ministério da Saúde (2014)",
  },
];

export const ORIENTACOES_INICIAIS: BlocoBiblioteca[] = RASCUNHOS.map((r) => ({
  id: r.id,
  titulo: r.titulo,
  itens: r.itens,
  texto: "",
  versao: 1,
  fonte: `Sugestão do app para revisão · ${r.fonte}`,
  atualizadoEm: CRIADO_EM,
  rascunho: true,
  tipo: "orientacao",
}));
