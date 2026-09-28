// UMA LINHA DO ROTEIRO NA TELA DA CONSULTA (28/09/2026).
//
// Tudo o que diz respeito a um tema fica junto: o texto de hoje, o que foi
// registrado no atendimento anterior (em cinza, com a data), o valor trazido
// do anterior aguardando confirmação (anel dourado) e a sugestão da IA com a
// fala de origem (anel tracejado azul).
import { useState, type KeyboardEvent } from "react";
import { Check, CornerDownLeft, Mic, Pencil, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ATALHOS, acrescentarAtalho, conteudoDoCampo } from "../dominio/campos";
import type { LinhaDoRoteiro as Linha } from "../dominio/roteiro";
import { diaMes, formatarNumero } from "../dominio/texto";
import type { ConfigNutricao, DadosBio, SegmentoTranscricao, SugestaoCampo, ValorCampo } from "../dominio/tipos";
import { Bolinha, LinhaQueCresce, type EstadoBolinha } from "../ui/basicos";
import { FalaDeOrigem, minutoDe } from "./FalaDeOrigem";

type Props = {
  linha: Linha;
  valor: ValorCampo;
  anterior: { valor: ValorCampo; data: string } | null;
  sugestao: SugestaoCampo | null;
  segmentos: SegmentoTranscricao[];
  /** Trechos da gravação que falam deste tema (busca por palavras, sem IA). */
  achados: SegmentoTranscricao[];
  config: ConfigNutricao;
  editavel: boolean;
  /** Na retificação não se traz nada do anterior: a correção é do registro daquele dia. */
  permitirAnterior: boolean;
  aoEditarTexto: (texto: string) => void;
  aoEditarBio: (bio: DadosBio) => void;
  aoTrazerAnterior: () => void;
  aoConfirmarAnterior: () => void;
  /** Descarta o valor trazido do anterior: nada antigo vira dado de hoje. */
  aoLimpar: () => void;
  aoAceitar: (textoEditado?: string) => void;
  aoRecusar: () => void;
  /** Leva um trecho da gravação para esta linha. */
  aoUsarTrecho: (segmento: SegmentoTranscricao) => void;
  aoProximo: (atual: HTMLElement) => void;
};

function estadoDaBolinha(valor: ValorCampo, sugestao: SugestaoCampo | null): EstadoBolinha {
  if (valor.estado === "anterior_pendente") return "anterior";
  if (sugestao && sugestao.estado === "pendente") return sugestao.incerto ? "incerto" : "ia";
  return valor.estado === "preenchido" ? "ok" : "vazio";
}

const ORIGEM: Record<string, string> = {
  digitado: "digitado hoje",
  anterior_confirmado: "confirmado do anterior",
  ia_aceita: "da gravação, revisado",
  ia_editada: "da gravação, editado",
  transcricao: "da gravação",
  importado: "importado",
};

function numeroOuNulo(texto: string): number | null {
  const limpo = texto.replace(",", ".").trim();
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function CampoNumero({ id, rotulo, unidade, valor, casas, editavel, aoMudar }: { id: string; rotulo: string; unidade: string; valor: number | null; casas: number; editavel: boolean; aoMudar: (n: number | null) => void }) {
  const [texto, setTexto] = useState(valor === null ? "" : formatarNumero(valor, casas));
  const [focado, setFocado] = useState(false);
  const exibido = focado ? texto : valor === null ? "" : formatarNumero(valor, casas);
  return (
    <label htmlFor={id} className="inline-flex items-center gap-1.5 text-sm">
      <span className="text-xs font-semibold text-muted-foreground">{rotulo}</span>
      <input
        id={id}
        aria-label={`${rotulo} (${unidade})`}
        inputMode="decimal"
        disabled={!editavel}
        value={exibido}
        onFocus={() => {
          setFocado(true);
          setTexto(valor === null ? "" : formatarNumero(valor, casas));
        }}
        onBlur={() => setFocado(false)}
        onChange={(e) => {
          setTexto(e.target.value);
          aoMudar(numeroOuNulo(e.target.value));
        }}
        className="h-8 w-[4.5rem] rounded-lg border border-brand-oliva/20 bg-white/70 px-2 text-right font-mono text-sm tabular-nums focus:border-brand-dourado focus:outline-none focus:ring-2 focus:ring-brand-dourado/25 disabled:opacity-70"
      />
      <span className="text-xs text-muted-foreground">{unidade}</span>
    </label>
  );
}

export function LinhaDoRoteiro(props: Props) {
  const { linha, valor, anterior, sugestao, segmentos, achados, config, editavel } = props;
  const [editandoSugestao, setEditandoSugestao] = useState<string | null>(null);
  const [verTodosAchados, setVerTodosAchados] = useState(false);
  const idCampo = `campo-${linha.id}`;
  const bolinha = estadoDaBolinha(valor, sugestao);
  const pendente = valor.estado === "anterior_pendente";
  const sugestaoPendente = sugestao && sugestao.estado === "pendente" ? sugestao : null;
  const textoAnterior = anterior ? conteudoDoCampo(linha.id, anterior.valor, config) : "";
  // Trechos ainda não usados nesta linha; sem IA, é por aqui que a gravação vira registro.
  const usados = new Set(valor.evidencias.map((e) => e.segmento));
  const achadosNovos = achados.filter((s) => !usados.has(s.i));
  const achadosVisiveis = verTodosAchados ? achadosNovos : achadosNovos.slice(0, 3);
  const temHora = segmentos.some((s) => s.inicio || s.fim);

  const aoTeclar = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // A linha dela é uma linha: Enter vai para o próximo tema.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      props.aoProximo(e.currentTarget);
    }
  };

  // Valor ainda do anterior não serve de base: digitar um número parte do zero.
  const bioVazia: DadosBio = { pesoKg: null, pgc: null, visceral: null, fonte: null };
  const bio = pendente ? bioVazia : valor.bio ?? bioVazia;

  return (
    <div className="group grid grid-cols-[18px_minmax(0,1fr)] gap-x-3 border-b border-brand-oliva/10 py-3 last:border-b-0" data-campo={linha.id}>
      <div className="pt-2.5">
        <Bolinha estado={bolinha} />
      </div>
      <div className="grid min-w-0 gap-1.5">
        <div className="flex items-baseline gap-3">
          <label htmlFor={idCampo} className="shrink-0 text-sm font-semibold text-brand-musgo">
            <span className="mr-1.5 font-mono text-[11px] font-normal text-muted-foreground">{String(linha.linha).padStart(2, "0")}</span>
            {linha.rotulo}
          </label>
          {/* O que ela pergunta nesse tema: aparece ao entrar no campo, no mesmo lugar, sem empurrar nada. */}
          {editavel ? (
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100" title={linha.oQueRegistrar}>
              {linha.oQueRegistrar}
            </span>
          ) : (
            <span className="flex-1" />
          )}
          {valor.origem && valor.estado === "preenchido" ? <span className="shrink-0 text-[11px] text-muted-foreground">{ORIGEM[valor.origem]}</span> : null}
        </div>

        {linha.id === "bio" ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-2.5">
            <CampoNumero id={`${idCampo}-peso`} rotulo="Peso" unidade="kg" casas={1} valor={pendente ? null : bio.pesoKg} editavel={editavel} aoMudar={(n) => props.aoEditarBio({ ...bio, pesoKg: n })} />
            <CampoNumero id={`${idCampo}-pgc`} rotulo="PGC" unidade="%" casas={1} valor={pendente ? null : bio.pgc} editavel={editavel} aoMudar={(n) => props.aoEditarBio({ ...bio, pgc: n })} />
            <CampoNumero id={`${idCampo}-visceral`} rotulo={config.siglaVisceral} unidade="nível" casas={0} valor={pendente ? null : bio.visceral} editavel={editavel} aoMudar={(n) => props.aoEditarBio({ ...bio, visceral: n })} />
            {bio.fonte && !pendente ? <span className="text-[11px] text-muted-foreground">{bio.fonte}</span> : null}
          </div>
        ) : null}

        {linha.id !== "bio" || valor.texto ? (
          <LinhaQueCresce
            id={linha.id === "bio" ? `${idCampo}-obs` : idCampo}
            value={pendente ? "" : valor.texto}
            disabled={!editavel}
            placeholder={linha.id === "bio" ? "observação da bioimpedância (opcional)" : pendente ? "" : "não informado"}
            onChange={(e) => props.aoEditarTexto(e.target.value)}
            onKeyDown={aoTeclar}
            aria-describedby={textoAnterior ? `${idCampo}-anterior` : undefined}
          />
        ) : null}

        {editavel && ATALHOS[linha.id] && !pendente ? (
          <div className="flex flex-wrap gap-1.5 pl-2.5 opacity-80 transition-opacity group-focus-within:opacity-100">
            {(ATALHOS[linha.id] ?? []).map((atalho) => (
              <button key={atalho} type="button" className="nutri-chip" onClick={() => props.aoEditarTexto(acrescentarAtalho(valor.texto, atalho))}>
                {atalho}
              </button>
            ))}
          </div>
        ) : null}

        {editavel && !pendente && !sugestaoPendente && achadosNovos.length > 0 ? (
          <div className="nutri-achados grid gap-1 px-3 py-2 text-sm">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-brand-oliva">
              <Mic className="h-3 w-3" aria-hidden="true" /> na gravação
            </span>
            {achadosVisiveis.map((s) => (
              <div key={s.i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1 text-[13px] text-brand-tinta">
                  <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">{temHora ? minutoDe(s.inicio) : `#${s.i + 1}`}</span>
                  {s.texto}
                </span>
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => props.aoUsarTrecho(s)}>
                  <CornerDownLeft className="h-3 w-3" aria-hidden="true" /> Usar
                </Button>
              </div>
            ))}
            {achadosNovos.length > 3 && !verTodosAchados ? (
              <button type="button" className="justify-self-start text-xs font-semibold text-brand-oliva hover:underline" onClick={() => setVerTodosAchados(true)}>
                mais {achadosNovos.length - 3} trecho(s)
              </button>
            ) : null}
          </div>
        ) : null}

        {pendente ? (
          <div className="nutri-anterior flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>
              <span className="mr-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-dourado">do atendimento de {diaMes(valor.anteriorDe)}</span>
              {conteudoDoCampo(linha.id, valor, config)}
            </span>
            {editavel ? (
              <span className="flex gap-1.5">
                <Button type="button" size="sm" onClick={props.aoConfirmarAnterior} className="h-8 gap-1">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" /> Continua igual
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={props.aoLimpar}>
                  Mudou
                </Button>
              </span>
            ) : null}
          </div>
        ) : null}

        {sugestaoPendente ? (
          <div className="nutri-sugestao grid gap-2 px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide nutri-texto-ia">sugestão da gravação</span>
              {sugestaoPendente.incerto ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">confira: {sugestaoPendente.motivo}</span> : null}
            </div>
            {editandoSugestao !== null ? (
              <LinhaQueCresce value={editandoSugestao} onChange={(e) => setEditandoSugestao(e.target.value)} autoFocus className="bg-white/80" />
            ) : (
              <p className="font-medium">
                {linha.id === "bio" && sugestaoPendente.bio
                  ? [
                      sugestaoPendente.bio.pesoKg !== null ? `Peso ${formatarNumero(sugestaoPendente.bio.pesoKg, 1)} kg` : null,
                      sugestaoPendente.bio.pgc !== null ? `PGC ${formatarNumero(sugestaoPendente.bio.pgc, 1)}%` : null,
                      sugestaoPendente.bio.visceral !== null ? `${config.siglaVisceral} ${formatarNumero(sugestaoPendente.bio.visceral, 0)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : sugestaoPendente.texto}
              </p>
            )}
            <FalaDeOrigem evidencias={sugestaoPendente.evidencias} segmentos={segmentos} />
            {editavel ? (
              <div className="flex flex-wrap gap-1.5">
                {editandoSugestao !== null ? (
                  <>
                    <Button type="button" size="sm" className="h-8 gap-1" onClick={() => { props.aoAceitar(editandoSugestao); setEditandoSugestao(null); }}>
                      <CornerDownLeft className="h-3.5 w-3.5" aria-hidden="true" /> Usar este texto
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setEditandoSugestao(null)}>
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" size="sm" className="h-8 gap-1" onClick={() => props.aoAceitar()}>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" /> Aceitar
                    </Button>
                    {linha.id !== "bio" ? (
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => setEditandoSugestao(sugestaoPendente.texto)}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" variant="ghost" className="h-8 gap-1" onClick={props.aoRecusar}>
                      <X className="h-3.5 w-3.5" aria-hidden="true" /> Recusar
                    </Button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {textoAnterior && !pendente ? (
          <p id={`${idCampo}-anterior`} className="flex flex-wrap items-center gap-2 pl-2.5 text-xs text-muted-foreground">
            <span>
              <span className="font-mono">{diaMes(anterior?.data)}</span> · {textoAnterior}
            </span>
            {editavel && props.permitirAnterior && valor.estado === "vazio" ? (
              <button type="button" onClick={props.aoTrazerAnterior} className="inline-flex items-center gap-1 rounded-full px-1.5 font-semibold text-brand-oliva hover:bg-muted">
                <RotateCcw className="h-3 w-3" aria-hidden="true" /> trazer para conferir
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
