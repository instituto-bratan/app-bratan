// ABA PACIENTES (05/10/2026). Lucas: "adicione uma aba de pacientes pois não
// consigo pesquisar o perfil deles para eu colocar o CPF".
//
// A lista de todos os contatos com busca por nome, telefone ou e-mail; de cada
// linha abre a ficha completa (/crm/contatos/:id) ou, para quem pode, o CPF
// ali mesmo. O número do CPF nunca vem na lista: só "tem" ou "não tem".
//
// PAPEL & MUSGO (08/10/2026, redesenho etapa 4): um cabeçalho só, com o número
// explicado em frase ("312 contatos, 84 pacientes. 15 com CPF guardado.");
// a busca é o campo da fundação; os filtros viram leituras com a contagem de
// cada tipo; a lista mora numa folha (é onde se age: abrir a ficha, pôr o CPF).
// Abaixo de 1024 px, cada linha empilha nome, contato e ações — sem rolar de lado.
// O que a tela FAZ não mudou: mesma busca, mesmos filtros, mesma permissão do
// CPF (a de Impostos & NFs) e o CPF continua mascarado no cartão que abre.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IdCard } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, Botao, Cabecalho, CampoBusca, LinkSeta } from "@/components/ui/fundacao";
import { useAuth } from "@/hooks/useAuth";
import { canCrmBratan, canEditModule, canSeeModule } from "@/lib/access";
import { listRemoteContatosComCpf, listRemotePacientes } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { CpfDoPacienteCard } from "@/features/crm/CpfDoPacienteCard";
import { Etiqueta, Leitura } from "@/features/crm/comercialVisual";
import { AvisoDaTela, Vazio } from "@/features/financeiro/pecasDiaPagar";
import { buscar, ordenar, passaNoFiltro, rotuloDoTipo, type FiltroDeTipo, type PacienteDaLista } from "./pacientesData";
import { fraseDaListaDePacientes } from "./frasesPacientes";

const FILTROS: { chave: FiltroDeTipo; rotulo: string }[] = [
  { chave: "pacientes", rotulo: "Pacientes" },
  { chave: "ex", rotulo: "Ex-pacientes" },
  { chave: "leads", rotulo: "Leads" },
  { chave: "todos", rotulo: "Todos" },
];

/** As colunas da lista (no computador largo). Abaixo de 1024 px a linha empilha. */
function colunasDaLista(veCpf: boolean) {
  return veCpf
    ? "lg:grid-cols-[minmax(0,1.3fr)_9.5rem_minmax(0,1.4fr)_6.5rem_13rem_4.5rem]"
    : "lg:grid-cols-[minmax(0,1.4fr)_9.5rem_minmax(0,1.6fr)_6.5rem_4.5rem]";
}

export function PacientesPage() {
  const { pessoa, session, isPreview } = useAuth();
  const usaRemoto = Boolean(pessoa && session && !isPreview);
  // O CPF segue a permissão da tela Impostos & NFs (é a mesma RLS de contato_documento).
  const veCpf = canSeeModule(pessoa, "fin-impostos");
  const editaCpf = canEditModule(pessoa, "fin-impostos");
  const [termo, setTermo] = useState("");
  const [filtro, setFiltro] = useState<FiltroDeTipo>("todos");
  const [aberto, setAberto] = useState<string | null>(null);

  const contatos = useQuery({ queryKey: ["pacientes-lista"], queryFn: listRemotePacientes, enabled: usaRemoto, staleTime: 60_000 });
  const comCpf = useQuery({ queryKey: ["pacientes-com-cpf"], queryFn: listRemoteContatosComCpf, enabled: usaRemoto && veCpf, staleTime: 60_000 });

  const lista = useMemo<PacienteDaLista[]>(() => {
    const refs = comCpf.data ?? new Set<string>();
    return ordenar((contatos.data ?? []).map((c) => ({ ...c, temCpf: refs.has(c.id) })));
  }, [contatos.data, comCpf.data]);
  const visiveis = useMemo(() => buscar(lista, termo, filtro), [lista, termo, filtro]);
  // Quantos de cada tipo (o número ao lado de cada filtro).
  const porFiltro = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.chave, lista.filter((p) => passaNoFiltro(p, f.chave)).length])) as Record<FiltroDeTipo, number>,
    [lista],
  );

  const frase = fraseDaListaDePacientes({
    contatos: lista.length,
    pacientes: porFiltro.pacientes,
    comCpf: lista.filter((p) => p.temCpf).length,
    pacientesSemCpf: lista.filter((p) => p.tipo === "PATIENT" && !p.temCpf).length,
    sabeCpf: veCpf,
    carregando: contatos.isLoading,
    semConta: !usaRemoto,
  });

  return (
    <AccessGate allowed={canCrmBratan} label="Pacientes" module="pacientes">
      <div className="mx-auto grid w-full max-w-[1200px] gap-6 font-sans text-tinta max-md:gap-4">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Pacientes · Todos"
          titulo="Pacientes"
          frase={
            <>
              <strong>{frase.destaque}</strong>
              {frase.resto}
              {frase.alerta ? <span className="alerta">{frase.alerta}</span> : null}
            </>
          }
        />

        {/* Busca + filtros: uma linha no computador, duas no celular. */}
        <div className="flex flex-wrap items-center gap-3">
          <CampoBusca
            valor={termo}
            onMudar={setTermo}
            rotulo="Buscar paciente"
            placeholder="Nome, telefone ou e-mail"
            className="w-full max-w-[420px] max-md:max-w-none"
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
            {FILTROS.map((f) => (
              <Leitura key={f.chave} ativa={filtro === f.chave} numero={usaRemoto && !contatos.isLoading ? porFiltro[f.chave] : undefined} onClick={() => setFiltro(f.chave)}>
                {f.rotulo}
              </Leitura>
            ))}
          </div>
        </div>

        {contatos.isError ? (
          <AvisoDaTela tom="erro">Não consegui carregar a lista de pacientes. Recarregue a página.</AvisoDaTela>
        ) : !visiveis.length ? (
          <BlocoFolha>
            <Vazio titulo={contatos.isLoading ? "Carregando…" : termo ? `Ninguém com "${termo}"${filtro === "todos" ? "" : " neste filtro"}.` : "Nenhum contato neste filtro."}>
              {!contatos.isLoading && termo ? "Procure por um pedaço do nome (sem acento vale), do telefone ou do e-mail." : null}
            </Vazio>
          </BlocoFolha>
        ) : (
          <BlocoFolha as="section" aria-label="Lista de contatos" className="overflow-hidden">
            {/* Cabeçalho das colunas: só no computador largo. */}
            <div
              aria-hidden="true"
              className={cn(
                "hidden h-10 items-center gap-4 border-b border-fio-2 px-5 text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2 lg:grid",
                colunasDaLista(veCpf),
              )}
            >
              <span>Nome</span>
              <span>Telefone</span>
              <span>E-mail</span>
              <span>Tipo</span>
              {veCpf ? <span>CPF</span> : null}
              <span className="text-right">Abrir</span>
            </div>
            <ul>
              {visiveis.map((p) => (
                <PacienteLinha
                  key={p.id}
                  p={p}
                  veCpf={veCpf}
                  editaCpf={editaCpf}
                  aberto={aberto === p.id}
                  onAbrirCpf={() => setAberto(aberto === p.id ? null : p.id)}
                  pessoaId={pessoa?.id ?? null}
                />
              ))}
            </ul>
          </BlocoFolha>
        )}
      </div>
    </AccessGate>
  );
}

function PacienteLinha({ p, veCpf, editaCpf, aberto, onAbrirCpf, pessoaId }: { p: PacienteDaLista; veCpf: boolean; editaCpf: boolean; aberto: boolean; onAbrirCpf: () => void; pessoaId: string | null }) {
  const telefone = p.whatsapp || p.telefone;
  return (
    <li className={cn("border-b border-fio last:border-b-0", aberto && "bg-saber")}>
      <div className={cn("grid items-center gap-x-4 gap-y-1 px-5 py-3 text-sm font-medium leading-5 max-lg:grid-cols-[minmax(0,1fr)_auto] max-md:px-4", colunasDaLista(veCpf))}>
        <div className="min-w-0">
          <p className="truncate font-bold text-tinta">{p.nome}</p>
          {p.apelido && p.apelido !== p.nome ? <p className="truncate text-[13px] text-tinta-2">{p.apelido}</p> : null}
        </div>
        {/* Tipo no celular fica ao lado do nome; no computador, na coluna dele. */}
        <div className="justify-self-end lg:hidden">
          <Etiqueta tom={p.tipo === "PATIENT" ? "musgo" : "neutro"}>{rotuloDoTipo[p.tipo] ?? p.tipo}</Etiqueta>
        </div>
        <p className="whitespace-nowrap tabular-nums text-tinta max-lg:col-span-2 max-lg:text-[13px] max-lg:text-tinta-2">
          {telefone || <span className="text-tinta-2">—</span>}
          <span className="sr-only"> (telefone)</span>
        </p>
        {/* 13/10/2026: no celular o e-mail aparece inteiro (quebra a linha); o corte com title fica só no computador. */}
        <p className={cn("min-w-0 text-tinta lg:truncate max-lg:col-span-2 max-lg:break-all max-lg:text-[13px] max-lg:text-tinta-2", !p.email && "max-lg:hidden")} title={p.email || undefined}>
          {p.email || <span className="text-tinta-2">—</span>}
        </p>
        <div className="max-lg:hidden">
          <Etiqueta tom={p.tipo === "PATIENT" ? "musgo" : "neutro"}>{rotuloDoTipo[p.tipo] ?? p.tipo}</Etiqueta>
        </div>
        {veCpf ? (
          <div className="flex min-w-0 items-center gap-2 max-lg:flex-wrap max-lg:pt-1">
            {p.temCpf ? (
              <span className="text-[13px] font-bold text-ok">guardado</span>
            ) : (
              <span className={cn("text-[13px] font-semibold", p.tipo === "PATIENT" ? "text-atencao" : "text-tinta-2")}>sem CPF</span>
            )}
            {editaCpf ? (
              <Botao
                tamanho="pq"
                variante={p.temCpf || aberto ? "fantasma" : "suave"}
                onClick={onAbrirCpf}
                aria-expanded={aberto}
                icone={<IdCard className="h-4 w-4" aria-hidden="true" />}
                className="px-2.5"
              >
                {aberto ? "Fechar" : p.temCpf ? "Ver" : "Colocar CPF"}
              </Botao>
            ) : null}
          </div>
        ) : null}
        <div className={cn("text-right max-lg:justify-self-end max-lg:pt-1", !veCpf && "max-lg:col-span-2")}>
          <LinkSeta to={`/crm/contatos/${p.id}`}>Ficha</LinkSeta>
        </div>
      </div>
      {aberto && editaCpf ? (
        <div className="px-5 pb-4 max-md:px-4">
          <div className="max-w-xl">
            <CpfDoPacienteCard contactRef={p.id} pessoaId={pessoaId} ativo />
          </div>
        </div>
      ) : null}
    </li>
  );
}
