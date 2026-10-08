// GUIA VISUAL INTERNO — /ajustes/guia-visual (08/10/2026).
//
// A vitrine viva da fundação "Papel & Musgo": as cores (lidas do CSS de verdade,
// nos dois temas), as letras e cada componente padrão funcionando. Serve de
// referência para as próximas etapas do redesenho — quem for refazer uma tela
// abre aqui e copia a peça, em vez de inventar outra. Não mostra dado nenhum da
// clínica: os exemplos são os números fictícios da proposta aprovada.
import * as React from "react";
import { Plus, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { Abas } from "./abas";
import { BlocoFolha, BlocoSaber } from "./blocos";
import { Botao, LinkSeta, type TamanhoBotao, type VarianteBotao } from "./botao";
import { BarraDecisao, BotaoDecisao } from "./botao-decisao";
import { Cabecalho, FraseDoFluxo } from "./cabecalho";
import { CampoBusca } from "./campo-busca";
import { Contador } from "./contador";
import { FioDoMes } from "./fio-do-mes";
import { ESTADOS_DO_SELO, TOKENS_DE_COR } from "./papel-musgo";
import { Selo } from "./selo";

function Secao({ numero, titulo, intro, children }: { numero: string; titulo: string; intro: React.ReactNode; children: React.ReactNode }) {
  const id = `guia-${numero}`;
  return (
    <section aria-labelledby={id} className="grid gap-6 border-t border-fio-2 py-10 xl:grid-cols-[minmax(0,260px)_minmax(0,1fr)] xl:gap-10">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">{numero}</p>
        <h2 id={id} className="mt-2 text-xl font-bold leading-7 text-tinta">
          {titulo}
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-tinta-2">{intro}</p>
      </div>
      <div className="grid min-w-0 gap-6">{children}</div>
    </section>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-bold leading-5 text-tinta">{children}</p>;
}

/** "232 227 210" → "#E8E3D2" */
function canalParaHex(canal: string) {
  const partes = canal.trim().split(/\s+/).map(Number);
  if (partes.length !== 3 || partes.some((n) => !Number.isFinite(n))) return "";
  return `#${partes.map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** A paleta de um tema, com o valor lido do CSS que está valendo (não de uma cópia). */
function Paleta({ tema }: { tema: "claro" | "escuro" }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [valores, setValores] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (!ref.current) return;
    const estilo = window.getComputedStyle(ref.current);
    const lidos: Record<string, string> = {};
    for (const token of TOKENS_DE_COR) lidos[token.nome] = canalParaHex(estilo.getPropertyValue(`--${token.nome}-rgb`));
    setValores(lidos);
  }, []);
  return (
    <div ref={ref} data-tema={tema} className="grid gap-3 rounded-bloco bg-papel p-4 ring-1 ring-fio-2">
      <Rotulo>{tema === "claro" ? "Tema claro" : "Tema escuro"}</Rotulo>
      <ul className="grid gap-2">
        {TOKENS_DE_COR.map((token) => (
          <li key={token.nome} className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-3">
            <span className="h-8 w-8 rounded-controle ring-1 ring-fio-2" style={{ background: `var(--${token.nome})` }} aria-hidden="true" />
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-bold leading-5 text-tinta">
                {token.nome}
                <code className="font-sans text-xs font-semibold tabular-nums text-tinta-2">{valores[token.nome] ?? ""}</code>
              </span>
              <span className="block text-xs font-medium leading-4 text-tinta-2">{token.uso}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const VARIANTES: { variante: VarianteBotao; rotulo: string; uso: string }[] = [
  { variante: "primario", rotulo: "Aprovar", uso: "a decisão (um por tela)" },
  { variante: "suave", rotulo: "Aprovar", uso: "decisão na linha" },
  { variante: "secundario", rotulo: "Devolver", uso: "outra decisão, criar, abrir" },
  { variante: "fantasma", rotulo: "Cancelar", uso: "ação de apoio" },
  { variante: "perigo", rotulo: "Recusar", uso: "na outra ponta" },
];

const TAMANHOS: { tamanho: TamanhoBotao; uso: string }[] = [
  { tamanho: "pq", uso: "32 · na linha" },
  { tamanho: "padrao", uso: "40 · padrão" },
  { tamanho: "toque", uso: "44 · celular" },
  { tamanho: "grande", uso: "52 · barra fixa do celular" },
];

export function GuiaVisualPagina() {
  const [aba, setAba] = React.useState("contas");
  const [busca, setBusca] = React.useState("");
  const [ultimaDecisao, setUltimaDecisao] = React.useState("Nenhuma decisão ainda.");

  return (
    <div className="mx-auto w-full max-w-[1200px] pb-16 font-sans text-tinta">
      <Cabecalho
        sobrancelha="Ajustes"
        titulo={
          <>
            Guia <em>visual</em>
          </>
        }
        frase={
          <>
            <strong>As peças do redesenho Papel &amp; Musgo</strong>, funcionando. Tela nova sai daqui: copie a peça em vez de
            inventar outra.
          </>
        }
        acoes={<LinkSeta to="/inicio">Voltar ao Início</LinkSeta>}
      />

      <Secao
        numero="01 · Cores"
        titulo="Quatro papéis e uma cor para agir"
        intro={
          <>
            Mesa (menu), papel (fundo), saber (ler) e folha (decidir). Musgo é ação. Oliva só em ícone e dourado só em enfeite:
            nenhum dos dois vira texto. Os valores abaixo são lidos do CSS que está valendo.
          </>
        }
      >
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
          <Paleta tema="claro" />
          <Paleta tema="escuro" />
        </div>
      </Secao>

      <Secao
        numero="02 · Letras"
        titulo="Fraunces fala pouco. Manrope trabalha."
        intro="Fraunces só em título da página, número principal e data. Todo o resto é Manrope, com algarismos de largura igual em todo valor. Escala 12 · 13 · 14 · 16 · 20 · 24 · 32 · 40."
      >
        <BlocoFolha respiro className="grid gap-5">
          <p className="font-serifa text-[40px] font-normal leading-[1.1] tracking-[-0.012em] max-md:text-[32px]">
            <em className="italic text-musgo">Terça,</em> 6 de outubro
          </p>
          <p className="whitespace-nowrap font-serifa text-[40px] font-normal leading-none tabular-nums">
            <span className="mr-1 align-[.95em] font-sans text-sm font-bold text-tinta-2">R$</span>92.400
          </p>
          <p className="font-serifa text-base italic leading-[1.3] text-tinta-2">terça, 6 de outubro</p>
          <ul className="grid gap-2 border-t border-fio pt-4">
            <li className="text-2xl font-bold leading-8">24 · R$ 38.200 cabe gastar</li>
            <li className="text-xl font-bold leading-7">20 · Título do painel de detalhe</li>
            <li className="text-base font-medium leading-6">16 · Frase do cabeçalho, título de grupo</li>
            <li className="text-sm font-medium leading-5">
              14 · Corpo, linha, tabela, menu, botão · <b className="tabular-nums">R$ 312,40</b>
            </li>
            <li className="text-[13px] font-medium leading-5 text-tinta-2">13 · Meta da linha, ajuda do campo, legenda</li>
            <li className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">12 · Rubrica, contador</li>
          </ul>
        </BlocoFolha>
      </Secao>

      <Secao
        numero="03 · Cabeçalho"
        titulo="Um componente para as 60 telas"
        intro="Sobrancelha, título, a frase com o número já explicado e as ações à direita. Embaixo, o fio do mês OU a frase do fluxo — nunca os dois."
      >
        <BlocoSaber>
          <Cabecalho
            className="mb-0"
            sobrancelha="Financeiro · Pagar"
            titulo="Contas a pagar"
            frase={
              <>
                <strong>Duas contas vencem hoje</strong>, somando R$ 3.420,00. Nenhuma está vencida.
              </>
            }
            acoes={
              <Botao variante="secundario" icone={<Plus className="h-4 w-4" aria-hidden="true" />}>
                Nova conta
              </Botao>
            }
            rodape={<FioDoMes diasUteis={21} hoje={4} mes="Outubro" sobre="saber" />}
          />
        </BlocoSaber>
        <BlocoSaber>
          <Cabecalho
            className="mb-0"
            sobrancelha="Compras e estoque"
            titulo="Pedidos de compra"
            frase={
              <>
                <strong>3 pedidos esperam sua decisão</strong>, somando R$ 957,30.{" "}
                <span className="alerta">O da Enfermagem passou do prazo.</span>
              </>
            }
            acoes={
              <Botao variante="secundario" icone={<Plus className="h-4 w-4" aria-hidden="true" />}>
                Novo pedido
              </Botao>
            }
            rodape={
              <FraseDoFluxo link={{ to: "/compras", rotulo: "Ver os pedidos" }}>
                O setor pede, você aprova, o Financeiro compra e o setor confirma a chegada.
              </FraseDoFluxo>
            }
          />
        </BlocoSaber>
      </Secao>

      <Secao
        numero="04 · Abas"
        titulo="Uma linha só; a aberta leva o fio de ouro"
        intro={
          <>
            Uma ou duas palavras por aba. Com <code className="font-sans font-bold">to</code> em todas, cada aba é uma rota (o
            endereço antigo continua valendo). Sem, são abas da tela. Use ← e → para andar.
          </>
        }
      >
        <div className="grid gap-3">
          <Abas
            rotulo="Exemplo: Financeiro · Pagar"
            itens={[
              { id: "contas", rotulo: "Contas" },
              { id: "fatura", rotulo: "Fatura do cartão" },
              { id: "lembretes", rotulo: "Lembretes", contador: 2 },
            ]}
            valor={aba}
            onMudar={setAba}
            idDoPainel={(id) => `guia-painel-${id}`}
          />
          <p id={`guia-painel-${aba}`} role="tabpanel" className="text-sm font-medium leading-5 text-tinta-2">
            Aba aberta: <strong className="text-tinta">{aba === "contas" ? "Contas" : aba === "fatura" ? "Fatura do cartão" : "Lembretes"}</strong>
          </p>
        </div>
      </Secao>

      <Secao
        numero="05 · Situação"
        titulo="Forma, palavra e cor"
        intro="Quatro marcas de etapa (pedido · aprovação · compra · recebimento): cheia = feita, vazada = é a vez dela. Discreto na lista; cheio no painel."
      >
        <BlocoFolha>
          <ul>
            {ESTADOS_DO_SELO.map((estado) => (
              <li key={estado} className="grid grid-cols-1 gap-2 border-t border-fio px-4 py-3 first:border-t-0 sm:grid-cols-2 sm:items-center">
                <Selo estado={estado} />
                <Selo estado={estado} cheio />
              </li>
            ))}
          </ul>
        </BlocoFolha>
      </Secao>

      <Secao
        numero="06 · Botões"
        titulo="Decisão ganha botão. Navegação ganha seta."
        intro="Aprovar leva o valor dentro do botão. Devolver e Recusar pedem o motivo antes de valer; Recusar fica na ponta oposta."
      >
        <BlocoFolha respiro className="grid gap-4">
          <ul className="grid gap-3">
            {VARIANTES.map((item) => (
              <li key={item.variante} className="flex flex-wrap items-center gap-3">
                <Botao variante={item.variante}>{item.rotulo}</Botao>
                <Botao variante={item.variante} disabled>
                  {item.rotulo}
                </Botao>
                <Botao variante={item.variante} carregando>
                  {item.rotulo}
                </Botao>
                <span className="text-[13px] font-medium leading-5 text-tinta-2">{item.uso}</span>
              </li>
            ))}
            <li className="flex flex-wrap items-center gap-3">
              <LinkSeta to="/financeiro/fechamento">Conferir</LinkSeta>
              <span className="text-[13px] font-medium leading-5 text-tinta-2">link com seta: navegar</span>
            </li>
          </ul>
          <div className="flex flex-wrap items-end gap-3 border-t border-fio pt-4">
            {TAMANHOS.map((item) => (
              <figure key={item.tamanho} className="grid justify-items-start gap-1">
                <BotaoDecisao tipo="aprovar" tamanho={item.tamanho} valor={item.tamanho === "grande" ? 486 : undefined} />
                <figcaption className="text-xs font-medium leading-4 text-tinta-2">{item.uso}</figcaption>
              </figure>
            ))}
          </div>
        </BlocoFolha>
        <div className="grid gap-2">
          <Rotulo>Barra de decisão (experimente: nada é gravado)</Rotulo>
          <BlocoFolha className="overflow-hidden">
            <div className="grid gap-1 px-6 py-4 max-md:px-4">
              <p className="text-xl font-bold leading-7">Luvas nitrílicas M (10 cx) e seringas 3 mL (200 un)</p>
              <p className="text-[13px] font-medium leading-5 text-tinta-2">Enfermagem · Juliana · pedido nº 0012</p>
            </div>
            <BarraDecisao
              valor={486}
              nota="Aprovar avisa a Juliana e o Financeiro para comprar."
              quemLe="a Juliana"
              onAprovar={() => setUltimaDecisao("Aprovado: R$ 486,00.")}
              onDevolver={(motivo) => setUltimaDecisao(`Devolvido com o motivo: “${motivo}”.`)}
              onRecusar={(motivo) => setUltimaDecisao(`Recusado com o motivo: “${motivo}”.`)}
            />
          </BlocoFolha>
          <p role="status" aria-live="polite" className="text-[13px] font-medium leading-5 text-tinta-2">
            {ultimaDecisao}
          </p>
        </div>
      </Secao>

      <Secao
        numero="07 · Blocos"
        titulo="Decidir em folha, saber em papel"
        intro="Folha tem borda e não tem sombra: é onde se decide. Saber não tem borda nem sombra: é só para ler."
      >
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
          <BlocoFolha as="section" aria-label="Exemplo de folha">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-2 pt-4">
              <p className="text-base font-bold leading-6">
                Pagar hoje <span className="text-sm font-semibold text-tinta-2">2 contas · R$ 3.420,00</span>
              </p>
              <span className="text-[13px] font-medium leading-5 text-tinta-2">nenhuma vencida</span>
            </div>
            {[
              { nome: "Stin Pharma", meta: "Medicações", valor: "R$ 2.380,00" },
              { nome: "Enel", meta: "Energia", valor: "R$ 1.040,00" },
            ].map((conta) => (
              <div key={conta.nome} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-t border-fio px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold leading-5">{conta.nome}</p>
                  <p className="text-[13px] font-medium leading-5 text-tinta-2">{conta.meta}</p>
                </div>
                <span className="whitespace-nowrap text-sm font-bold tabular-nums">{conta.valor}</span>
                <Botao variante="suave" tamanho="pq">
                  Paguei
                </Botao>
              </div>
            ))}
          </BlocoFolha>
          <BlocoSaber as="aside" aria-label="Exemplo de saber" className="grid content-start gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">Outubro até agora</p>
              <span className="text-[13px] font-medium text-tinta-2">dia útil 4 de 21</span>
            </div>
            <FioDoMes diasUteis={21} hoje={4} mes="Outubro" legenda={false} sobre="saber" />
            <p className="whitespace-nowrap font-serifa text-[40px] leading-none tabular-nums">
              <span className="mr-1 align-[.95em] font-sans text-sm font-bold text-tinta-2">R$</span>92.400
            </p>
            <p className="text-[13px] font-medium leading-5 text-tinta-2">
              faturados · meta de outubro <strong className="text-tinta tabular-nums">R$ 470.000</strong>
            </p>
          </BlocoSaber>
        </div>
      </Secao>

      <Secao
        numero="08 · Peças"
        titulo="Contador, fio do mês e busca"
        intro={
          <>
            O contador só aparece no que é crítico: no Início, só as decisões pendentes (as notas sem CPF vão para Avisos, como
            prioridade). O fio do mês vai em Início, Financeiro e Resultados.
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-6">
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <Contador valor={6} rotulo="6 decisões pendentes" /> pendências
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <Contador valor={2} tom="suave" /> em aba e filtro
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <Contador valor={1} tom="alerta" rotulo="1 vencida" /> vencido
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <Contador valor={140} /> acima de 99
          </span>
        </div>
        <BlocoSaber>
          <FioDoMes diasUteis={22} hoje={6} mes="Outubro" sobre="saber" />
        </BlocoSaber>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
          <div className="grid gap-2">
            <Rotulo>Porta do ⌘K (topo da casca)</Rotulo>
            <CampoBusca onAbrir={() => setUltimaDecisao("A busca ⌘K abriria aqui.")} />
          </div>
          <div className="grid gap-2">
            <Rotulo>Filtro de lista</Rotulo>
            <CampoBusca valor={busca} onMudar={setBusca} placeholder="Buscar paciente pelo nome ou telefone" />
          </div>
        </div>
      </Secao>

      <Secao
        numero="09 · Claro e escuro"
        titulo="A mesma folha, nos dois temas"
        intro={
          <>
            No escuro trocam só as variáveis. Um bloco pode forçar o tema com <code className="font-sans font-bold">data-tema</code>.
          </>
        }
      >
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
          {(["claro", "escuro"] as const).map((tema) => (
            <div key={tema} data-tema={tema} className={cn("grid gap-3 rounded-bloco bg-papel p-4 ring-1 ring-fio-2")}>
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 stroke-oliva" aria-hidden="true" />
                <Rotulo>{tema === "claro" ? "Claro" : "Escuro"}</Rotulo>
              </div>
              <BlocoFolha className="overflow-hidden">
                <div className="grid gap-2 px-4 py-3">
                  <Selo estado="aguardando" cheio />
                  <p className="text-base font-bold leading-6">Papel A4 (5 resmas) e toner HP 85A</p>
                  <p className="text-[13px] font-medium leading-5 text-tinta-2">Recepção · Isabela</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-fio px-4 py-3">
                  <BotaoDecisao tipo="aprovar" valor={312.4} tamanho="pq" />
                  <BotaoDecisao tipo="devolver" tamanho="pq" />
                  <BotaoDecisao tipo="recusar" tamanho="pq" className="ml-auto" />
                </div>
              </BlocoFolha>
            </div>
          ))}
        </div>
      </Secao>
    </div>
  );
}
