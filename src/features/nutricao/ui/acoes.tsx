// AÇÕES COMPARTILHADAS: começar consulta, estado da estação (28/09/2026).
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizarParaBusca } from "../dominio/extracao";
import type { Pessoa, TipoAtendimento } from "../dominio/tipos";
import { useEstacao } from "../estacao/cliente";
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
            <label htmlFor="nova-consulta-busca" className="text-xs font-semibold uppercase tracking-wide text-brand-oliva">
              Pessoa
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="nova-consulta-busca"
                autoFocus
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setEscolhida(null);
                }}
                placeholder="Buscar pelo nome ou cadastrar"
                className="h-10 w-full rounded-xl border border-brand-oliva/20 bg-white/70 pl-9 pr-3 text-sm focus:border-brand-dourado focus:outline-none focus:ring-2 focus:ring-brand-dourado/25"
              />
            </div>
            <ul className="max-h-56 overflow-y-auto rounded-xl border border-brand-oliva/12">
              {filtradas.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setEscolhida(p)}
                    aria-pressed={escolhida?.id === p.id}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted aria-pressed:bg-brand-creme/60"
                  >
                    <span className="font-medium">{p.nome}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {p.faseAcompanhamento ? `mês ${p.faseAcompanhamento.mes} de ${p.faseAcompanhamento.total}` : "sem fase"}
                      {p.ficticia ? <SeloFicticio /> : null}
                    </span>
                  </button>
                </li>
              ))}
              {filtradas.length === 0 ? <li className="px-3 py-3 text-sm text-muted-foreground">Ninguém com esse nome. O botão abaixo cadastra.</li> : null}
            </ul>
          </div>
        ) : (
          <p>
            Consulta de hoje de <strong>{pessoa.nome}</strong>.
          </p>
        )}
        <fieldset className="grid gap-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-brand-oliva">Tipo</legend>
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
  if (carregando) return <span className="text-xs text-muted-foreground">Procurando a estação local…</span>;
  if (!saude) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="Sem a estação, o registro continua à mão. Para gravar e transcrever, abra “Iniciar Estação” no Mac.">
        <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
        Estação local desligada{detalhado ? ": abra “Iniciar Estação” no Mac para gravar, transcrever e gerar PDF" : ""}
      </span>
    );
  }
  const partes = [saude.whisper.pronto ? "transcrição" : null, saude.ia.configurada ? "IA" : null, saude.chrome ? "PDF" : null].filter(Boolean);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800" title={`Modelo de transcrição: ${saude.whisper.modelo ?? "nenhum"} · IA: ${saude.ia.configurada ? saude.ia.modelo : "sem chave configurada"}`}>
      <Mic className="h-3.5 w-3.5" aria-hidden="true" />
      Estação local pronta ({partes.join(", ") || "nada configurado"}){detalhado && !saude.ia.configurada ? " · IA sem chave" : ""}
    </span>
  );
}
