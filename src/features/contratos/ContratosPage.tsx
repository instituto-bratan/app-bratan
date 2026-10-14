// CONTRATOS DE MEDICAÇÃO (14/10/2026). Lucas: "o modelo que a gente faz
// manual, que você pode automatizar hoje... é o modelo de contrato manual que
// nós mandamos para o SuperSign... dentro do contrato vai ter as medicações do
// que o doutor prescreveu".
//
// Como funciona: a recepção solta o TTO do doutor (o PDF do iClinicRx com os
// protocolos, doses, sessões e CID), liga o paciente do CRM, confere os campos
// e clica em "Gerar contrato". O app grava o número (único por ano) e devolve o
// .docx igual ao modelo de sempre, pronto para subir no SuperSign. O envio pelo
// SuperSign continua à mão até a API ser contratada (plano de ação, fase 2).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Download, FilePlus2, FileUp, Plus, Trash2 } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { confirmar, toast } from "@/components/ui/avisos";
import { BlocoFolha, Botao, Cabecalho } from "@/components/ui/fundacao";
import { useAuth } from "@/hooks/useAuth";
import { canContratos } from "@/lib/access";
import { parseMoneyBR } from "@/lib/money";
import { lerRemoteCpfDoContato } from "@/lib/remote/compliance";
import { baixarRemoteModeloContrato, listRemoteContratos, mudarStatusRemoteContrato, salvarRemoteContrato, type ContratoGerado } from "@/lib/remote/contratos";
import { mensagemDoSalvamento, salvarArquivo } from "@/lib/salvarArquivo";
import { cn } from "@/lib/utils";
import { todayISO } from "@/lib/localStore";
import { PatientPicker, type PatientPickerValue } from "@/features/crm/PatientPicker";
import { useCrmState } from "@/features/crm/useCrmState";
import { Aviso, Campo, CampoArea, CampoSelecao, Etiqueta, Rotulo } from "@/features/crm/comercialVisual";
import { extrairLinhasPdf } from "@/features/financeiro/pdfTexto";
import { moedaDoContrato } from "./extenso";
import { gerarDocxDoContrato, nomeDoArquivo } from "./gerarDocx";
import { lerTto } from "./lerTto";
import {
  MEIOS_DE_PAGAMENTO,
  VIAS,
  avisosDoContrato,
  dadosDoTto,
  dadosVazios,
  pendenciasDoContrato,
  prazoSugerido,
  tipoSugerido,
  type DadosDoContrato,
  type ProtocoloDoContrato,
} from "./montarContrato";

type PagamentoNaTela = { valor: string; meio: string; parcelas: string; data: string };

const STATUS: Record<ContratoGerado["status"], { rotulo: string; tom: "neutro" | "musgo" | "ok" | "erro" }> = {
  GERADO: { rotulo: "Gerado", tom: "neutro" },
  ENVIADO: { rotulo: "Enviado ao SuperSign", tom: "musgo" },
  ASSINADO: { rotulo: "Assinado", tom: "ok" },
  CANCELADO: { rotulo: "Cancelado", tom: "erro" },
};

const reais = (valor: number) => valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Secao({ titulo, children, className }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <BlocoFolha respiro className={cn("grid gap-4", className)}>
      <h2 className="font-serif text-lg font-semibold leading-6">{titulo}</h2>
      {children}
    </BlocoFolha>
  );
}

function CampoRotulado({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("grid gap-1", className)}>
      <Rotulo>{rotulo}</Rotulo>
      {children}
    </label>
  );
}

async function baixarContrato(d: DadosDoContrato) {
  const modelo = await baixarRemoteModeloContrato();
  const arquivo = await gerarDocxDoContrato(modelo, d);
  const resultado = await salvarArquivo(nomeDoArquivo(d), arquivo);
  toast(mensagemDoSalvamento(resultado));
}

export function ContratosPage() {
  const { pessoa, session, isPreview } = useAuth();
  const usaRemoto = Boolean(pessoa && session && !isPreview);
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const contratos = useQuery({ queryKey: ["contratos"], queryFn: () => listRemoteContratos(), enabled: usaRemoto, staleTime: 30_000 });
  const [editando, setEditando] = useState(params.get("novo") === "1" || Boolean(params.get("contato")));

  const lista = contratos.data ?? [];
  const ano = Number(todayISO().slice(0, 4));
  const proximoNumero = useMemo(() => {
    const doAno = lista.filter((c) => c.ano === ano).map((c) => c.numero);
    return doAno.length ? Math.max(...doAno) + 1 : null;
  }, [lista, ano]);

  const status = useMutation({
    mutationFn: ({ id, novo }: { id: string; novo: ContratoGerado["status"] }) => mudarStatusRemoteContrato(id, novo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contratos"] }),
    onError: (erro) => toast(erro instanceof Error ? erro.message : String(erro), { tom: "erro" }),
  });

  const fechar = () => {
    setEditando(false);
    setParams({}, { replace: true });
  };

  const doMes = lista.filter((c) => c.geradoEm.slice(0, 7) === todayISO().slice(0, 7) && c.status !== "CANCELADO");
  const semAssinar = lista.filter((c) => c.status === "GERADO" || c.status === "ENVIADO");

  return (
    <AccessGate allowed={canContratos} label="Contratos">
      <div className="mx-auto grid w-full max-w-[1100px] gap-6 font-sans text-tinta max-md:gap-4">
        <Cabecalho
          sobrancelha="Comercial · Contratos"
          titulo="Contratos de medicação"
          frase={
            editando ? (
              <>Solte o TTO do doutor: protocolos, doses, sessões e CID entram sozinhos. Confira e gere o contrato para o SuperSign.</>
            ) : (
              <>
                <strong>{doMes.length}</strong> {doMes.length === 1 ? "contrato gerado" : "contratos gerados"} este mês; <strong>{semAssinar.length}</strong> ainda sem assinatura.
              </>
            )
          }
          acoes={
            editando ? null : (
              <Botao variante="primario" icone={<FilePlus2 className="size-4" aria-hidden />} onClick={() => setEditando(true)}>
                Novo contrato
              </Botao>
            )
          }
        />

        {editando ? (
          <FormularioDoContrato
            proximoNumero={proximoNumero}
            contatoInicial={params.get("contato")}
            dealInicial={params.get("deal")}
            onFechar={fechar}
            onGerado={() => {
              void queryClient.invalidateQueries({ queryKey: ["contratos"] });
              fechar();
            }}
          />
        ) : (
          <BlocoFolha>
            {contratos.isLoading ? <p className="p-6 text-sm">Carregando…</p> : null}
            {contratos.error ? <Aviso tom="erro" className="m-4">{(contratos.error as Error).message}</Aviso> : null}
            {!contratos.isLoading && !lista.length ? (
              <p className="p-6 text-sm leading-6">Nenhum contrato gerado pelo app ainda. Clique em <strong>Novo contrato</strong> e solte o TTO do doutor.</p>
            ) : null}
            <ul className="divide-y divide-fio">
              {lista.map((c) => (
                <li key={c.id} className="grid items-center gap-3 px-5 py-3 lg:grid-cols-[7rem_minmax(0,1fr)_8rem_6.5rem_11rem_auto]">
                  <span className="font-mono text-sm font-bold tabular-nums">
                    {c.numero}/{c.ano}
                  </span>
                  <span className="min-w-0 truncate text-sm font-semibold">{c.pacienteNome}</span>
                  <span className="text-sm tabular-nums">{moedaDoContrato(c.valorTotal)}</span>
                  <span className="text-sm tabular-nums">{c.geradoEm.slice(8, 10)}/{c.geradoEm.slice(5, 7)}/{c.geradoEm.slice(0, 4)}</span>
                  <Etiqueta tom={STATUS[c.status].tom}>{STATUS[c.status].rotulo}</Etiqueta>
                  <span className="flex flex-wrap gap-2 lg:justify-end">
                    <Botao tamanho="pq" icone={<Download className="size-4" aria-hidden />} onClick={() => baixarContrato(c.dados).catch((e) => toast(e instanceof Error ? e.message : String(e), { tom: "erro" }))}>
                      Baixar
                    </Botao>
                    {c.status === "GERADO" ? (
                      <Botao tamanho="pq" onClick={() => status.mutate({ id: c.id, novo: "ENVIADO" })}>
                        Enviei
                      </Botao>
                    ) : null}
                    {c.status === "ENVIADO" ? (
                      <Botao tamanho="pq" onClick={() => status.mutate({ id: c.id, novo: "ASSINADO" })}>
                        Assinado
                      </Botao>
                    ) : null}
                    {c.status !== "CANCELADO" && c.status !== "ASSINADO" ? (
                      <Botao
                        tamanho="pq"
                        variante="fantasma"
                        onClick={async () => {
                          if (await confirmar(`Cancelar o contrato ${c.numero}/${c.ano}?`, { corpo: "O número não volta a ser usado.", confirmar: "Cancelar contrato", destrutivo: true }))
                            status.mutate({ id: c.id, novo: "CANCELADO" });
                        }}
                      >
                        Cancelar
                      </Botao>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </BlocoFolha>
        )}
      </div>
    </AccessGate>
  );
}

function FormularioDoContrato({
  proximoNumero,
  contatoInicial,
  dealInicial,
  onFechar,
  onGerado,
}: {
  proximoNumero: number | null;
  contatoInicial: string | null;
  dealInicial: string | null;
  onFechar: () => void;
  onGerado: () => void;
}) {
  const { state: crm } = useCrmState();
  const hoje = todayISO();
  const [d, setD] = useState<DadosDoContrato>(() => ({ ...dadosVazios(hoje), numero: proximoNumero }));
  const [numeroTexto, setNumeroTexto] = useState(proximoNumero ? String(proximoNumero) : "");
  const [cidsTexto, setCidsTexto] = useState("");
  const [valorTotalTexto, setValorTotalTexto] = useState("");
  const [pagamentos, setPagamentos] = useState<PagamentoNaTela[]>([{ valor: "", meio: "PIX", parcelas: "1", data: hoje }]);
  const [paciente, setPaciente] = useState<PatientPickerValue>({ ref: "", name: "" });
  const [dealRef, setDealRef] = useState<string | null>(dealInicial);
  const [lendo, setLendo] = useState(false);
  const [lido, setLido] = useState<string | null>(null);
  const [mostrarResponsavel, setMostrarResponsavel] = useState(false);

  // Veio do Kanban (?contato=&deal=): liga o paciente e traz o valor fechado.
  useEffect(() => {
    if (!contatoInicial || paciente.ref) return;
    const contato = crm.contacts.find((c) => c.id === contatoInicial);
    if (contato) escolherPaciente({ ref: contato.id, name: contato.fullName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contatoInicial, crm.contacts]);

  useEffect(() => {
    if (proximoNumero && !numeroTexto) setNumeroTexto(String(proximoNumero));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proximoNumero]);

  const mudarPaciente = (campo: keyof DadosDoContrato["paciente"], valor: string) => setD((x) => ({ ...x, paciente: { ...x.paciente, [campo]: valor } }));
  const mudarProtocolo = (i: number, mudanca: Partial<ProtocoloDoContrato>) =>
    setD((x) => {
      const protocolos = x.protocolos.map((p, j) => (j === i ? { ...p, ...mudanca } : p));
      return { ...x, protocolos };
    });

  function escolherPaciente(valor: PatientPickerValue) {
    setPaciente(valor);
    if (!valor.ref) return;
    const contato = crm.contacts.find((c) => c.id === valor.ref);
    if (contato) {
      setD((x) => ({
        ...x,
        paciente: {
          ...x.paciente,
          nome: x.paciente.nome || contato.fullName.toUpperCase(),
          telefone: x.paciente.telefone || contato.whatsapp || contato.phone || "",
          email: x.paciente.email || contato.email || "",
        },
      }));
    }
    const deal = (dealInicial ? crm.deals.find((x) => x.id === dealInicial) : null) ?? [...crm.deals].filter((x) => x.contactId === valor.ref).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
    if (deal) {
      setDealRef(deal.id);
      const valorFechado = deal.soldAmount || deal.prescribedAmount;
      if (valorFechado > 0) setValorTotalTexto((t) => t || reais(valorFechado));
    }
    lerRemoteCpfDoContato(valor.ref)
      .then((doc) => {
        if (doc?.cpf) setD((x) => ({ ...x, paciente: { ...x.paciente, cpf: x.paciente.cpf || doc.cpf } }));
      })
      .catch(() => undefined);
  }

  async function lerArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setLendo(true);
    try {
      const texto = await extrairLinhasPdf(arquivo);
      const tto = lerTto(texto);
      if (!tto.protocolos.length) {
        toast("Não achei protocolos neste PDF. Confira se é o TTO do iClinicRx; dá para preencher à mão abaixo.", { tom: "erro" });
        return;
      }
      setD((x) => dadosDoTto(x, tto));
      const cids = [...new Set(tto.protocolos.flatMap((p) => p.cids))];
      setCidsTexto(cids.join(", "));
      setLido(`Li ${tto.protocolos.length} ${tto.protocolos.length === 1 ? "protocolo" : "protocolos"}${cids.length ? `, CID ${cids.join(" e ")}` : ""}${tto.emitidoEm ? ` (TTO de ${tto.emitidoEm.split("-").reverse().join("/")})` : ""}. Confira tudo abaixo.`);
      if (!paciente.ref && tto.paciente) {
        const primeiro = tto.paciente.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
        const candidatos = crm.contacts.filter((c) => c.fullName.trim().toLowerCase() === tto.paciente.trim().toLowerCase() || (c.fullName.toLowerCase().startsWith(primeiro) && c.fullName.toLowerCase().includes(tto.paciente.trim().split(/\s+/).slice(-1)[0]?.toLowerCase() ?? "")));
        if (candidatos.length === 1) escolherPaciente({ ref: candidatos[0].id, name: candidatos[0].fullName });
      }
    } catch (erro) {
      toast(erro instanceof Error ? erro.message : String(erro), { tom: "erro" });
    } finally {
      setLendo(false);
    }
  }

  const dados: DadosDoContrato = useMemo(
    () => ({
      ...d,
      numero: Number(numeroTexto.replace(/\D/g, "")) || null,
      cids: cidsTexto.split(/[,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean),
      valorTotal: parseMoneyBR(valorTotalTexto) || 0,
      pagamentos: pagamentos.map((p) => ({ valor: parseMoneyBR(p.valor) || 0, meio: p.meio, parcelas: Number(p.parcelas) || 1, data: p.data })),
    }),
    [d, numeroTexto, cidsTexto, valorTotalTexto, pagamentos],
  );
  const pendencias = pendenciasDoContrato(dados);
  const avisos = avisosDoContrato(dados);
  const somaPagamentos = dados.pagamentos.reduce((s, p) => s + p.valor, 0);

  const gerar = useMutation({
    mutationFn: async () => {
      const salvo = await salvarRemoteContrato(dados, { dealRef, contactRef: paciente.ref || null });
      await baixarContrato(salvo.dados);
      return salvo;
    },
    onSuccess: (salvo) => {
      toast(`Contrato ${salvo.numero}/${salvo.ano} gerado. Suba o arquivo no SuperSign e marque "Enviei" na lista.`, { tom: "ok" });
      onGerado();
    },
    onError: (erro) => toast(erro instanceof Error ? erro.message : String(erro), { tom: "erro" }),
  });

  return (
    <div className="grid gap-4">
      <Secao titulo="1. Documento do doutor e paciente">
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-bloco border-2 border-dashed border-fio px-4 py-6 text-center text-sm font-semibold hover:border-musgo",
            lendo && "cursor-progress opacity-70",
          )}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void lerArquivo(e.dataTransfer.files?.[0]);
          }}
        >
          <FileUp className="size-6 text-musgo" aria-hidden />
          {lendo ? "Lendo o TTO…" : "Solte aqui o TTO do doutor (PDF do iClinicRx) ou clique para escolher"}
          <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => void lerArquivo(e.target.files?.[0])} />
        </label>
        {lido ? <Aviso tom="ok">{lido}</Aviso> : null}
        <CampoRotulado rotulo="Paciente no CRM (liga o contrato à ficha e traz telefone, e-mail, CPF e o valor fechado)">
          <PatientPicker contacts={crm.contacts} value={paciente} onChange={escolherPaciente} somenteVincular id="contrato-paciente" />
        </CampoRotulado>
      </Secao>

      <Secao titulo="2. Contratante">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <CampoRotulado rotulo="Nome completo" className="md:col-span-2">
            <Campo value={d.paciente.nome} onChange={(e) => mudarPaciente("nome", e.target.value)} />
          </CampoRotulado>
          <CampoRotulado rotulo="CPF">
            <Campo value={d.paciente.cpf} onChange={(e) => mudarPaciente("cpf", e.target.value)} inputMode="numeric" autoComplete="off" />
          </CampoRotulado>
          <CampoRotulado rotulo="RG">
            <Campo value={d.paciente.rg} onChange={(e) => mudarPaciente("rg", e.target.value)} autoComplete="off" />
          </CampoRotulado>
          <CampoRotulado rotulo="Data de nascimento">
            <Campo type="date" value={d.paciente.nascimento} onChange={(e) => mudarPaciente("nascimento", e.target.value)} />
          </CampoRotulado>
          <CampoRotulado rotulo="Nacionalidade">
            <Campo value={d.paciente.nacionalidade} onChange={(e) => mudarPaciente("nacionalidade", e.target.value)} />
          </CampoRotulado>
          <CampoRotulado rotulo="Estado civil">
            <Campo value={d.paciente.estadoCivil} onChange={(e) => mudarPaciente("estadoCivil", e.target.value)} />
          </CampoRotulado>
          <CampoRotulado rotulo="Profissão">
            <Campo value={d.paciente.profissao} onChange={(e) => mudarPaciente("profissao", e.target.value)} />
          </CampoRotulado>
          <CampoRotulado rotulo="Telefone">
            <Campo value={d.paciente.telefone} onChange={(e) => mudarPaciente("telefone", e.target.value)} inputMode="tel" />
          </CampoRotulado>
          <CampoRotulado rotulo="Endereço (rua)" className="md:col-span-2">
            <Campo value={d.paciente.endereco} onChange={(e) => mudarPaciente("endereco", e.target.value)} />
          </CampoRotulado>
          <CampoRotulado rotulo="Número / complemento">
            <Campo value={d.paciente.numeroEnd} onChange={(e) => mudarPaciente("numeroEnd", e.target.value)} />
          </CampoRotulado>
          <CampoRotulado rotulo="Bairro">
            <Campo value={d.paciente.bairro} onChange={(e) => mudarPaciente("bairro", e.target.value)} />
          </CampoRotulado>
          <CampoRotulado rotulo="Município">
            <Campo value={d.paciente.municipio} onChange={(e) => mudarPaciente("municipio", e.target.value)} />
          </CampoRotulado>
          <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
            <CampoRotulado rotulo="UF">
              <Campo value={d.paciente.uf} maxLength={2} onChange={(e) => mudarPaciente("uf", e.target.value)} />
            </CampoRotulado>
            <CampoRotulado rotulo="CEP">
              <Campo value={d.paciente.cep} onChange={(e) => mudarPaciente("cep", e.target.value)} inputMode="numeric" />
            </CampoRotulado>
          </div>
          <CampoRotulado rotulo="E-mail" className="md:col-span-2">
            <Campo type="email" value={d.paciente.email} onChange={(e) => mudarPaciente("email", e.target.value)} />
          </CampoRotulado>
        </div>
        <button type="button" className="justify-self-start text-sm font-bold text-musgo underline-offset-[3px] hover:underline" onClick={() => setMostrarResponsavel((v) => !v)}>
          {mostrarResponsavel ? "Esconder responsável legal e plano de saúde" : "Paciente menor de idade ou com plano de saúde?"}
        </button>
        {mostrarResponsavel ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <CampoRotulado rotulo="Responsável legal" className="md:col-span-2">
              <Campo value={d.responsavel.nome} onChange={(e) => setD((x) => ({ ...x, responsavel: { ...x.responsavel, nome: e.target.value } }))} />
            </CampoRotulado>
            <CampoRotulado rotulo="RG do responsável">
              <Campo value={d.responsavel.rg} onChange={(e) => setD((x) => ({ ...x, responsavel: { ...x.responsavel, rg: e.target.value } }))} />
            </CampoRotulado>
            <CampoRotulado rotulo="CPF do responsável">
              <Campo value={d.responsavel.cpf} onChange={(e) => setD((x) => ({ ...x, responsavel: { ...x.responsavel, cpf: e.target.value } }))} inputMode="numeric" />
            </CampoRotulado>
            <CampoRotulado rotulo="Plano de saúde" className="md:col-span-2">
              <Campo value={d.planoSaude} onChange={(e) => setD((x) => ({ ...x, planoSaude: e.target.value }))} />
            </CampoRotulado>
            <p className="text-sm leading-5 md:col-span-2">Menor de 16 anos: o responsável assina por ele. De 16 a 18: os dois assinam no SuperSign.</p>
          </div>
        ) : null}
      </Secao>

      <Secao titulo="3. Tratamento">
        <div className="grid gap-3 md:grid-cols-3">
          <CampoRotulado rotulo="CID (separe por vírgula)">
            <Campo value={cidsTexto} onChange={(e) => setCidsTexto(e.target.value)} placeholder="F52.0, D50" />
          </CampoRotulado>
          <CampoRotulado rotulo="Data da consulta">
            <Campo type="date" value={d.consultaEm} onChange={(e) => setD((x) => ({ ...x, consultaEm: e.target.value }))} />
          </CampoRotulado>
          <fieldset className="grid gap-1">
            <legend className="font-sans text-[13px] font-bold leading-5 text-tinta">Tipo de tratamento (1.3)</legend>
            {(
              [
                ["imediato", "Imediato (atendimento único)"],
                ["curto", "Curto prazo (até 1 mês)"],
                ["medio", "Médio prazo (3 a 4 meses)"],
              ] as const
            ).map(([chave, rotulo]) => (
              <label key={chave} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={d.tipo[chave]} onChange={(e) => setD((x) => ({ ...x, tipo: { ...x.tipo, [chave]: e.target.checked } }))} />
                {rotulo}
              </label>
            ))}
          </fieldset>
        </div>

        {d.protocolos.map((p, i) => (
          <div key={i} className="grid gap-3 rounded-bloco border border-fio p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">Protocolo {i + 1}</span>
              <Botao
                tamanho="pq"
                variante="fantasma"
                icone={<Trash2 className="size-4" aria-hidden />}
                onClick={() => setD((x) => {
                  const protocolos = x.protocolos.filter((_, j) => j !== i);
                  return { ...x, protocolos, tipo: tipoSugerido(protocolos), prazo: prazoSugerido(protocolos) };
                })}
              >
                Tirar
              </Botao>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_6rem_6rem]">
              <CampoRotulado rotulo="Nome do protocolo">
                <Campo value={p.titulo} onChange={(e) => mudarProtocolo(i, { titulo: e.target.value })} />
              </CampoRotulado>
              <CampoRotulado rotulo="Via">
                <CampoSelecao value={p.via} onChange={(e) => mudarProtocolo(i, { via: e.target.value })}>
                  <option value="">—</option>
                  {VIAS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </CampoSelecao>
              </CampoRotulado>
              <CampoRotulado rotulo="Sessões">
                <Campo type="number" min={1} value={p.sessoes || ""} onChange={(e) => mudarProtocolo(i, { sessoes: Number(e.target.value) || 0 })} />
              </CampoRotulado>
              <CampoRotulado rotulo="Meses">
                <Campo type="number" min={0} value={p.meses ?? ""} onChange={(e) => mudarProtocolo(i, { meses: e.target.value ? Number(e.target.value) : null })} />
              </CampoRotulado>
            </div>
            <CampoRotulado rotulo="Posologia">
              <Campo value={p.posologia} onChange={(e) => mudarProtocolo(i, { posologia: e.target.value })} placeholder="DOSE ÚNICA." />
            </CampoRotulado>
            <div className="grid gap-2">
              <Rotulo>Medicamentos e dosagem (tabela 1.5)</Rotulo>
              {p.itens.map((item, k) => (
                <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] gap-2">
                  <Campo pequeno value={item.nome} aria-label="Medicamento" onChange={(e) => mudarProtocolo(i, { itens: p.itens.map((it, j) => (j === k ? { ...it, nome: e.target.value } : it)) })} />
                  <Campo pequeno value={item.dose} aria-label="Dosagem" onChange={(e) => mudarProtocolo(i, { itens: p.itens.map((it, j) => (j === k ? { ...it, dose: e.target.value } : it)) })} />
                  <Botao tamanho="pq" variante="fantasma" aria-label="Tirar medicamento" icone={<Trash2 className="size-4" aria-hidden />} onClick={() => mudarProtocolo(i, { itens: p.itens.filter((_, j) => j !== k) })} />
                </div>
              ))}
              <Botao tamanho="pq" className="justify-self-start" icone={<Plus className="size-4" aria-hidden />} onClick={() => mudarProtocolo(i, { itens: [...p.itens, { nome: "", dose: "" }] })}>
                Medicamento
              </Botao>
            </div>
          </div>
        ))}
        <Botao
          className="justify-self-start"
          icone={<Plus className="size-4" aria-hidden />}
          onClick={() => setD((x) => ({ ...x, protocolos: [...x.protocolos, { titulo: "", via: "", sessoes: 1, posologia: "", meses: null, itens: [{ nome: "", dose: "" }] }] }))}
        >
          Protocolo
        </Botao>
        <CampoRotulado rotulo="Prazo da contratação (2.1) — um parágrafo por linha">
          <CampoArea value={d.prazo} onChange={(e) => setD((x) => ({ ...x, prazo: e.target.value }))} rows={4} />
        </CampoRotulado>
      </Secao>

      <Secao titulo="4. Valor e pagamento">
        <CampoRotulado rotulo="Valor total do contrato (R$)" className="max-w-xs">
          <Campo value={valorTotalTexto} onChange={(e) => setValorTotalTexto(e.target.value)} inputMode="decimal" placeholder="6.102,00" />
        </CampoRotulado>
        {pagamentos.map((p, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_6rem_minmax(0,1fr)_auto] md:items-end">
            <CampoRotulado rotulo={i === 0 ? "Valor (R$)" : "Restante (R$)"}>
              <Campo value={p.valor} inputMode="decimal" onChange={(e) => setPagamentos((l) => l.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} />
            </CampoRotulado>
            <CampoRotulado rotulo="Forma">
              <CampoSelecao value={p.meio} onChange={(e) => setPagamentos((l) => l.map((x, j) => (j === i ? { ...x, meio: e.target.value } : x)))}>
                {MEIOS_DE_PAGAMENTO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </CampoSelecao>
            </CampoRotulado>
            <CampoRotulado rotulo="Parcelas">
              <Campo type="number" min={1} max={24} value={p.parcelas} onChange={(e) => setPagamentos((l) => l.map((x, j) => (j === i ? { ...x, parcelas: e.target.value } : x)))} />
            </CampoRotulado>
            <CampoRotulado rotulo="Dia">
              <Campo type="date" value={p.data} onChange={(e) => setPagamentos((l) => l.map((x, j) => (j === i ? { ...x, data: e.target.value } : x)))} />
            </CampoRotulado>
            <Botao tamanho="pq" variante="fantasma" aria-label="Tirar forma de pagamento" icone={<Trash2 className="size-4" aria-hidden />} onClick={() => setPagamentos((l) => l.filter((_, j) => j !== i))} />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Botao tamanho="pq" icone={<Plus className="size-4" aria-hidden />} onClick={() => setPagamentos((l) => [...l, { valor: "", meio: "LINK DE PAGAMENTO", parcelas: "1", data: hoje }])}>
            Forma de pagamento
          </Botao>
          <span className={cn("text-sm font-semibold tabular-nums", Math.round(somaPagamentos * 100) !== Math.round(dados.valorTotal * 100) && "text-erro")}>
            Soma: {moedaDoContrato(somaPagamentos)} de {moedaDoContrato(dados.valorTotal)}
          </span>
        </div>
      </Secao>

      <Secao titulo="5. Contrato">
        <div className="grid gap-3 md:grid-cols-3">
          <CampoRotulado rotulo={`Número do contrato (${dados.ano})`}>
            <Campo value={numeroTexto} onChange={(e) => setNumeroTexto(e.target.value)} inputMode="numeric" placeholder="ex.: 2451" />
          </CampoRotulado>
          <CampoRotulado rotulo="Data da assinatura">
            <Campo type="date" value={d.assinaturaEm} onChange={(e) => setD((x) => ({ ...x, assinaturaEm: e.target.value }))} />
          </CampoRotulado>
        </div>
        {!proximoNumero ? <p className="text-sm leading-5">Primeiro contrato pelo app: use o número seguinte ao último contrato feito à mão. Daqui para a frente o app sugere sozinho.</p> : null}
        {pendencias.length ? <Aviso tom="atencao">Para gerar, falta: {pendencias.join("; ")}.</Aviso> : null}
        {avisos.length ? <Aviso tom="info">Confira (não trava): {avisos.join("; ")}.</Aviso> : null}
        <div className="flex flex-wrap gap-3">
          <Botao variante="primario" disabled={pendencias.length > 0} carregando={gerar.isPending} icone={<Download className="size-4" aria-hidden />} onClick={() => gerar.mutate()}>
            Gerar contrato (.docx)
          </Botao>
          <Botao variante="fantasma" onClick={onFechar}>
            Voltar à lista
          </Botao>
        </div>
      </Secao>
    </div>
  );
}
