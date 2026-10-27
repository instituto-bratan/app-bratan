// OS DADOS DO APP DE FECHAMENTO (28/10/2026): as consultas da lista e do
// protocolo, e a mudança de situação. Na prévia (sem Supabase) usa dois
// protocolos de exemplo, fictícios, que vivem só na memória desta aba.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { lerProtocolo, listarProtocolosAbertos, listarProtocolosResolvidos, mudarProtocolo } from "@/lib/remote/protocolo";
import { isSupabaseConfigured } from "@/lib/supabase";
import { estaAberto, type MudancaDoProtocolo, type Protocolo } from "./protocolo";

export const CHAVE_DOS_PROTOCOLOS = ["protocolos"] as const;

function usaBanco() {
  // Na prévia não há sessão de verdade: tudo fica na memória.
  return isSupabaseConfigured;
}

function exemplo(id: string, horasAtras: number, nome: string, extra: Partial<Protocolo> = {}): Protocolo {
  const criado = new Date(Date.now() - horasAtras * 3600_000).toISOString();
  return {
    id,
    clientRef: `prot-exemplo-${id}`,
    medicoId: "preview-dr_daniel",
    medicoNome: "Dr. Daniel Bratan",
    enviadoPor: "preview-dr_daniel",
    pacienteNome: nome,
    contactRef: null,
    agendaRef: null,
    itens: [
      { id: "proj", nome: "Projeto de Acompanhamento · 6 meses", nome_paciente: "Projeto de Acompanhamento", detalhe: "6 meses", categoria: "Acompanhamento", unidade: "un", quantidade: 1, preco_unitario: 1000, preco_tabela: 1000, valor: 1000, pellets: [] },
      { id: "vitd", nome: "Vitamina D", nome_paciente: "Vitamina D", detalhe: "2 doses", categoria: "Vitaminas", unidade: "dose", quantidade: 2, preco_unitario: 100, preco_tabela: 100, valor: 200, pellets: [] },
    ],
    total: 1296,
    opcoes: { soma_itens: 1200, avista_sem_desconto: 1296, desconto: 0, desconto_tipo: "reais", desconto_informado: 0, pix: 1296, parcelas: 6, parcela: 241.92, parcelado_total: 1451.52, fator_avista: 1.08, fator_parcelado: 1.12 },
    numeroBra: null,
    substituiRef: null,
    status: "PRESCRITO",
    dealRef: null,
    saleRef: null,
    formaEscolhida: null,
    valorFechado: null,
    motivoNaoFechou: null,
    motivoDetalhe: null,
    motivoCancelamento: null,
    negociacaoEm: null,
    fechadoEm: null,
    fechadoPor: null,
    criadoNoAparelhoEm: criado,
    criadoEm: criado,
    atualizadoEm: criado,
    ...extra,
  };
}

let memoria: Protocolo[] | null = null;
function previa(): Protocolo[] {
  if (!memoria) memoria = [exemplo("exemplo-1", 0.6, "Paciente Exemplo Um"), exemplo("exemplo-2", 27, "Paciente Exemplo Dois", { status: "EM_NEGOCIACAO" })];
  return memoria;
}

export function useProtocolosAbertos() {
  const { pessoa } = useAuth();
  return useQuery({
    queryKey: [...CHAVE_DOS_PROTOCOLOS, "abertos"],
    queryFn: async () => (usaBanco() ? listarProtocolosAbertos() : { lista: previa().filter((p) => estaAberto(p.status)), tabelaPronta: true }),
    enabled: Boolean(pessoa),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}

export function useProtocolosResolvidos(dias = 7) {
  const { pessoa } = useAuth();
  return useQuery({
    queryKey: [...CHAVE_DOS_PROTOCOLOS, "resolvidos", dias],
    queryFn: async () => {
      const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
      return usaBanco() ? listarProtocolosResolvidos(desde) : { lista: previa().filter((p) => !estaAberto(p.status)), tabelaPronta: true };
    },
    enabled: Boolean(pessoa),
    staleTime: 30_000,
  });
}

export function useProtocolo(id: string | undefined) {
  const { pessoa } = useAuth();
  return useQuery({
    queryKey: [...CHAVE_DOS_PROTOCOLOS, "um", id],
    queryFn: async () => (usaBanco() ? lerProtocolo(id ?? "") : previa().find((p) => p.id === id) ?? null),
    enabled: Boolean(pessoa && id),
    staleTime: 10_000,
  });
}

/** Muda a situação no banco (o gatilho confere a régua) e atualiza as listas. */
export function useMudarProtocolo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, mudanca }: { id: string; mudanca: MudancaDoProtocolo }) => {
      if (usaBanco()) return mudarProtocolo(id, mudanca);
      const atual = previa().find((p) => p.id === id);
      if (!atual) throw new Error("Protocolo de exemplo não encontrado.");
      const novo: Protocolo = { ...atual, ...mudanca, atualizadoEm: new Date().toISOString(), fechadoEm: mudanca.status === "FECHADO" ? new Date().toISOString() : atual.fechadoEm } as Protocolo;
      memoria = previa().map((p) => (p.id === id ? novo : p));
      return novo;
    },
    onSuccess: (protocolo) => {
      queryClient.setQueryData([...CHAVE_DOS_PROTOCOLOS, "um", protocolo.id], protocolo);
      void queryClient.invalidateQueries({ queryKey: CHAVE_DOS_PROTOCOLOS });
    },
  });
}

// ---------------------------------------------------------------------------
// A MARCAÇÃO QUE FICOU PARA TRÁS (28/10/2026)
//
// O fechamento grava em dois lugares: o CRM/comanda (registrarFechamento) e o
// protocolo. Se a internet cair entre um e outro, o protocolo continuaria
// "prescrito" — e um segundo "Fechou" lançaria OUTRA comanda. Então a mudança
// que não subiu fica guardada neste aparelho, a tela do protocolo esconde o
// "Fechou" e oferece só "marcar no sistema".
// ---------------------------------------------------------------------------

const CHAVE_PENDENTE = "app-bratan-fechamento-pendente:";

export function guardarMarcacaoPendente(id: string, mudanca: MudancaDoProtocolo) {
  try {
    window.localStorage.setItem(CHAVE_PENDENTE + id, JSON.stringify(mudanca));
  } catch {
    /* sem espaço no aparelho: a tela ainda mostra o erro */
  }
}

export function lerMarcacaoPendente(id: string): MudancaDoProtocolo | null {
  try {
    const bruto = window.localStorage.getItem(CHAVE_PENDENTE + id);
    return bruto ? (JSON.parse(bruto) as MudancaDoProtocolo) : null;
  } catch {
    return null;
  }
}

export function limparMarcacaoPendente(id: string) {
  try {
    window.localStorage.removeItem(CHAVE_PENDENTE + id);
  } catch {
    /* nada a limpar */
  }
}
