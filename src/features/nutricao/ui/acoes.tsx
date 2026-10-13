// AÇÕES COMPARTILHADAS: começar consulta, estado da estação (28/09/2026).
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, Plus, Search } from "lucide-react";
import { Button } from "@/features/crm/comercialVisual";
import { normalizarParaBusca } from "../dominio/extracao";
import type { Pessoa, TipoAtendimento } from "../dominio/tipos";
import { useEstacao, COMO_RELIGAR_ESTACAO } from "../estacao/cliente";
import { useAtualizarNutricao, usePessoas } from "../store/hooks";
import * as repo from "../store/repositorio";
import { Dialogo, SeloFicticio } from "./basicos";

const TIPOS: { id: TipoAtendimento; rotulo: string }[] = [
  { id: "checkpoint", rotulo: "Checkpoint" },
  { id: "primeira", rotulo: "Primeira consulta" },
  { id: "retorno", rotulo: "Retorno" },
];

/** Abre o atendimento de hoje da pessoa, criando se ainda não existe. */
export async function abrirAtendimentoDeHoje(pessoa: Pessoa, tipo: TipoAtendimento): Promise<string> {
  const doDia = (await repo.listarAtendimentosDaPessoa(pessoa.id)).find((a) => a.data === repo.hoje());
  if (doDia) return doDia.id;
  const novo = await repo.criarAtendimento(pessoa, { data: repo.hoje(), tipo });
  return novo.id;
}

export function BotaoNovaConsulta({ pessoa, rotulo = "Nova consulta" }: { pessoa?: Pessoa; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [escolhida, setEscolhida] = useState<Pessoa | null>(pessoa ?? null);
  const [tipo, setTipo] = useState<TipoAtendimento>("checkpoint");
  const [criando, setCriando] = useState(false);
  const { data: pessoas = [] } = usePessoas();
  const navegar = useNavigate();
  const atualizar = useAtualizarNutricao();

  const filtradas = useMemo(() => {
    const termo = normalizarParaBusca(busca);
    return termo ? pessoas.filter((p) => normalizarParaBusca(p.nome).includes(termo)) : pessoas;
  }, [busca, pessoas]);

  const comecar = async () => {
    setCriando(true);
    try {
      let alvo = escolhida;
      if (!alvo && busca.trim()) {
        alvo = await repo.salvarPessoa(repo.pessoaNova(busca), null);
      }
      if (!alvo) return;
      const id = await abrirAtendimentoDeHoje(alvo, tipo);
      await atualizar();
      setAberto(false);
      navegar(`/nutricao/consultas/${id}`);
    } finally {
      setCriando(false);
    }
  };

  return (
    <>
      <Button type="button" onClick={() => setAberto(true)} className="gap-2">
        <Plus className="h-4 w-4" aria-hidden="true" /> {rotulo}
      </Button>
      <Dialogo
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Começar consulta de hoje"
        acoes={
          <>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={comecar} disabled={criando || (!escolhida && !busca.trim())}>
              {escolhida ? `Abrir consulta de ${escolhida.nome.split(" ")[0]}` : busca.trim() ? `Cadastrar ${busca.trim()} e abrir` : "Escolha a pessoa"}
            </Button>
          </>
        }
      >
        {!pessoa ? (
          <div className="grid gap-2">
            <label htmlFor="nova-consulta-busca" className="text-xs font-semibold uppercase tracking-wide text-tinta-2">
              Pessoa
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-2" aria-hidden="true" />
              <input
                id="nova-consulta-busca"
                autoFocus
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setEscolhida(null);
                }}
                placeholder="Buscar pelo nome ou cadastrar"
                className="h-10 w-full rounded-controle border border-borda-campo bg-folha text-tinta pl-9 pr-3 text-sm focus-visible:border-musgo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
              />
            </div>
            <ul className="max-h-56 divide-y divide-fio overflow-y-auto rounded-bloco border border-fio bg-folha">
              {filtradas.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setEscolhida(p)}
                    aria-pressed={escolhida?.id === p.id}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-papel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco aria-pressed:bg-musgo-claro aria-pressed:shadow-[inset_3px_0_0_rgb(var(--musgo-rgb))]"
                  >
                    <span className="font-bold text-tinta">{p.nome}</span>
                    <span className="flex items-center gap-2 text-xs text-tinta-2">
                      {p.faseAcompanhamento ? `mês ${p.faseAcompanhamento.mes} de ${p.faseAcompanhamento.total}` : "sem fase"}
                      {p.ficticia ? <SeloFicticio /> : null}
                    </span>
                  </button>
                </li>
              ))}
              {filtradas.length === 0 ? <li className="px-3 py-3 text-sm text-tinta-2">Ninguém com esse nome. O botão abaixo cadastra.</li> : null}
            </ul>
          </div>
        ) : (
          <p>
            Consulta de hoje de <strong>{pessoa.nome}</strong>.
          </p>
        )}
        <fieldset className="grid gap-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-tinta-2">Tipo</legend>
          <div className="flex flex-wrap gap-2">
            {TIPOS.map((t) => (
              <button key={t.id} type="button" className="nutri-chip" aria-pressed={tipo === t.id} onClick={() => setTipo(t.id)}>
                {t.rotulo}
              </button>
            ))}
          </div>
        </fieldset>
      </Dialogo>
    </>
  );
}

/** Estado da estação local numa linha, com o que fazer quando está desligada. */
export function SeloEstacao({ detalhado = false }: { detalhado?: boolean }) {
  const { carregando, saude } = useEstacao();
  if (carregando) return <span className="text-[13px] font-semibold text-tinta-2">Procurando a estação local…</span>;
  if (!saude) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-tinta-2" title={`Sem a estação, o registro continua à mão. ${COMO_RELIGAR_ESTACAO}`}>
        <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
        Estação local desligada{detalhado ? `: ${COMO_RELIGAR_ESTACAO}` : ""}
      </span>
    );
  }
  const partes = [saude.whisper.pronto ? "transcrição" : null, saude.ia.configurada ? "IA" : null, saude.chrome ? "PDF" : null].filter(Boolean);
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ok" title={`Modelo de transcrição: ${saude.whisper.modelo ?? "nenhum"} · IA: ${saude.ia.configurada ? saude.ia.modelo : "sem chave configurada"}`}>
      <Mic className="h-3.5 w-3.5" aria-hidden="true" />
      Estação local pronta ({partes.join(", ") || "nada configurado"}){detalhado && !saude.ia.configurada ? " · IA sem chave" : ""}
    </span>
  );
}
