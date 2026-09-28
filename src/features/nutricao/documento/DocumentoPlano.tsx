// O PLANO ALIMENTAR COMO VAI PARA A PESSOA (28/09/2026).
//
// Mede cada bloco (título, refeição, lista, identificação) na largura exata da
// folha, distribui em páginas A4 sem partir nenhum bloco (paginacao.ts) e
// desenha as páginas. A mesma marcação vai para o PDF: a prévia é o PDF.
// Não aparece no documento: refeição vazia, lista sem item marcado, cálculo,
// azeite de preparo, observações internas.
import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import logoBratan from "@/assets/bratan-logo-horizontal.png";
import { escolherDensidade, type BlocoMedido, type Densidade, type ResultadoPaginacao, type TipoBloco } from "../dominio/paginacao";
import { cabecalhoDoDocumento } from "../dominio/plano";
import { normalizarTexto } from "../dominio/texto";
import type { IdentificacaoProfissional, ItemRefeicao, Plano } from "../dominio/tipos";
import { CSS_DO_DOCUMENTO, FOLHA, FONTES, cssDasFontes } from "./estilo";

type Bloco = { id: string; tipo: TipoBloco; conteudo: ReactNode };

export function quantidadeDoItem(item: Pick<ItemRefeicao, "quantidade" | "gramas">): string {
  const qtd = normalizarTexto(item.quantidade);
  if (qtd && item.gramas) return `${qtd} (${item.gramas}g)`;
  if (qtd) return qtd;
  return item.gramas ? `${item.gramas}g` : "";
}

function blocosDoPlano(plano: Plano, identificacao: IdentificacaoProfissional): Bloco[] {
  const blocos: Bloco[] = [
    {
      id: "cabecalho",
      tipo: "cabecalho",
      conteudo: (
        <div>
          <h1 className="pd-titulo">{cabecalhoDoDocumento(plano).titulo}</h1>
          <p className="pd-nome">{cabecalhoDoDocumento(plano).nome}</p>
          <div className="pd-filete" />
        </div>
      ),
    },
  ];

  for (const r of plano.refeicoes) {
    const itens = r.itens.filter((i) => normalizarTexto(i.descricao));
    if (itens.length === 0) continue;
    blocos.push({
      id: `ref-${r.id}`,
      tipo: "refeicao",
      conteudo: (
        <section className="pd-refeicao">
          <div className="pd-ref-titulo">
            <span className="pd-ref-nome">
              {r.emoji ? <span className="pd-ref-emoji">{r.emoji}</span> : null}
              {normalizarTexto(r.nome)}
              {r.opcional ? <span className="pd-ref-opcional">(opcional)</span> : null}
            </span>
            {r.horario ? <span className="pd-ref-hora">{normalizarTexto(r.horario)}</span> : null}
          </div>
          <ul className="pd-itens">
            {itens.map((item) => {
              const qtd = quantidadeDoItem(item);
              return (
                <li key={item.id} className="pd-item">
                  <span className="pd-bolinha" />
                  <span>
                    <span className="pd-item-nome">{normalizarTexto(item.descricao)}</span>
                    {qtd ? <span className="pd-item-qtd"> · {qtd}</span> : null}
                  </span>
                  {item.alternativas.filter((a) => normalizarTexto(a.descricao)).map((a) => {
                    const q = quantidadeDoItem(a);
                    return (
                      <span key={a.id} className="pd-alt">
                        ou <b>{normalizarTexto(a.descricao)}</b>
                        {q ? ` · ${q}` : ""}
                      </span>
                    );
                  })}
                  {normalizarTexto(item.observacao) ? <span className="pd-obs">{normalizarTexto(item.observacao)}</span> : null}
                </li>
              );
            })}
          </ul>
          {normalizarTexto(r.observacao) ? <p className="pd-ref-obs">{normalizarTexto(r.observacao)}</p> : null}
        </section>
      ),
    });
  }

  for (const b of plano.blocos) {
    const incluidos = b.itens.filter((i) => i.incluido && normalizarTexto(i.texto));
    if (incluidos.length === 0 && !normalizarTexto(b.texto)) continue;
    blocos.push({
      id: `bloco-${b.id}`,
      tipo: "lista",
      conteudo: (
        <section className="pd-lista">
          <h3>{normalizarTexto(b.titulo)}</h3>
          {incluidos.length ? (
            <ul>
              {incluidos.map((i) => (
                <li key={i.id}>
                  <span className="pd-bolinha" />
                  <span>{normalizarTexto(i.texto)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {normalizarTexto(b.texto) ? <p className="pd-texto">{normalizarTexto(b.texto)}</p> : null}
        </section>
      ),
    });
  }

  if (normalizarTexto(plano.observacoesFinais)) {
    blocos.push({ id: "observacoes", tipo: "texto", conteudo: <p className="pd-texto">{normalizarTexto(plano.observacoesFinais)}</p> });
  }

  const [nome, ...resto] = identificacao.linhas;
  blocos.push({
    id: "identificacao",
    tipo: "identificacao",
    conteudo: (
      <div className="pd-identificacao">
        <div className="pd-id-nome">{nome}</div>
        {resto.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    ),
  });
  return blocos;
}

export type InfoDaPaginacao = { paginas: number; densidade: Densidade; avisos: ResultadoPaginacao["avisos"]; sobraMaxima: number };

type Props = {
  plano: Plano;
  identificacao: IdentificacaoProfissional;
  /** Zoom da prévia (1 = tamanho real). */
  zoom?: number;
  aoPaginar?: (info: InfoDaPaginacao) => void;
};

const CSS_COMPLETO = `${cssDasFontes(FONTES)}\n${CSS_DO_DOCUMENTO}`;

function Pagina({ plano, numero, total, children }: { plano: Plano; numero: number; total: number; children: ReactNode }) {
  return (
    <div className="pd-pagina">
      <header className="pd-cabecalho">
        <img className="pd-logo" src={logoBratan} alt="Instituto Bratan" />
        <span className="pd-cab-direita">Nutrição</span>
      </header>
      <div className="pd-corpo">{children}</div>
      <footer className="pd-rodape">
        <span>
          {cabecalhoDoDocumento(plano).nome} · {cabecalhoDoDocumento(plano).titulo}
        </span>
        <span>
          página {numero} de {total}
        </span>
      </footer>
    </div>
  );
}

export const DocumentoPlano = forwardRef<HTMLDivElement, Props>(function DocumentoPlano({ plano, identificacao, zoom = 1, aoPaginar }, ref) {
  const blocos = useMemo(() => blocosDoPlano(plano, identificacao), [plano, identificacao]);
  const medidorNormal = useRef<HTMLDivElement>(null);
  const medidorCompacto = useRef<HTMLDivElement>(null);
  const [resultado, setResultado] = useState<{ densidade: Densidade; paginas: string[][] } | null>(null);
  const aoPaginarRef = useRef(aoPaginar);
  aoPaginarRef.current = aoPaginar;

  const medir = useCallback(() => {
    const ler = (raiz: HTMLDivElement | null): { blocos: BlocoMedido[]; alturaUtil: number } | null => {
      if (!raiz) return null;
      const pagina = raiz.querySelector<HTMLElement>(".pd-pagina");
      const corpo = raiz.querySelector<HTMLElement>(".pd-corpo");
      if (!pagina || !corpo) return null;
      const estilo = getComputedStyle(pagina);
      const alturaUtil = pagina.clientHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom);
      const medidos: BlocoMedido[] = blocos.map((b) => {
        const el = corpo.querySelector<HTMLElement>(`[data-bloco="${b.id}"]`);
        return { id: b.id, tipo: b.tipo, altura: el ? el.getBoundingClientRect().height : 0 };
      });
      return { blocos: medidos, alturaUtil };
    };
    const normal = ler(medidorNormal.current);
    const compacto = ler(medidorCompacto.current);
    if (!normal || !compacto) return;
    const escolha = escolherDensidade(
      [
        { densidade: "normal", blocos: normal.blocos },
        { densidade: "compacta", blocos: compacto.blocos },
      ],
      normal.alturaUtil,
      FOLHA.espacoEntreBlocosPx,
    );
    setResultado({ densidade: escolha.densidade, paginas: escolha.resultado.paginas.map((p) => p.blocos) });
    aoPaginarRef.current?.({ paginas: escolha.resultado.paginas.length, densidade: escolha.densidade, avisos: escolha.resultado.avisos, sobraMaxima: escolha.resultado.sobraMaxima });
  }, [blocos]);

  useLayoutEffect(() => {
    medir();
    let vivo = true;
    void document.fonts?.ready.then(() => vivo && medir());
    return () => {
      vivo = false;
    };
  }, [medir]);

  const porId = new Map(blocos.map((b) => [b.id, b]));
  const paginas = resultado?.paginas ?? [blocos.map((b) => b.id)];
  const densidade = resultado?.densidade ?? "normal";

  const medidor = (d: Densidade, alvo: RefObject<HTMLDivElement>) => (
    <div ref={alvo} className={`plano-doc${d === "compacta" ? " pd-compacta" : ""}`} aria-hidden="true">
      <div className="pd-pagina">
        <div className="pd-corpo">
          {blocos.map((b) => (
            <div key={b.id} data-bloco={b.id}>
              {b.conteudo}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style>{CSS_COMPLETO}</style>
      {/* Medição fora da tela, em tamanho real. */}
      <div style={{ position: "absolute", left: -100000, top: 0, visibility: "hidden", pointerEvents: "none" }}>
        {medidor("normal", medidorNormal)}
        {medidor("compacta", medidorCompacto)}
      </div>
      <div style={{ zoom }}>
        <div ref={ref} className={`plano-doc${densidade === "compacta" ? " pd-compacta" : ""}`} data-densidade={densidade}>
          {paginas.map((ids, i) => (
            <div key={i} style={{ marginBottom: i < paginas.length - 1 ? 18 : 0, boxShadow: "0 1px 3px rgba(0,0,0,.12), 0 12px 32px rgba(0,0,0,.10)" }} className="pd-sombra">
              <Pagina plano={plano} numero={i + 1} total={paginas.length}>
                {ids.map((id) => {
                  const b = porId.get(id);
                  return b ? (
                    <div key={id} data-bloco={id}>
                      {b.conteudo}
                    </div>
                  ) : null;
                })}
              </Pagina>
            </div>
          ))}
        </div>
      </div>
    </>
  );
});
