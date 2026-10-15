// Contrato de medicação gerado pelo app (14/10/2026): números, dados e o modelo
// .docx do bucket privado "modelos-contrato" (202610140001).
import type { ComandaParaContrato, DadosDoContrato, FichaDoContato, LembreteParaContrato } from "@/features/contratos/montarContrato";
import { requireSupabase } from "./base";

export type ContratoGerado = {
  id: string;
  ano: number;
  numero: number;
  dealRef: string | null;
  contactRef: string | null;
  pacienteNome: string;
  valorTotal: number;
  dados: DadosDoContrato;
  status: "GERADO" | "ENVIADO" | "ASSINADO" | "CANCELADO";
  geradoEm: string;
};

const COLUNAS = "id, ano, numero, deal_ref, contact_ref, paciente_nome, valor_total, dados, status, gerado_em";

function doBanco(row: any): ContratoGerado {
  return {
    id: row.id,
    ano: row.ano,
    numero: row.numero,
    dealRef: row.deal_ref ?? null,
    contactRef: row.contact_ref ?? null,
    pacienteNome: row.paciente_nome,
    valorTotal: Number(row.valor_total ?? 0),
    dados: row.dados as DadosDoContrato,
    status: row.status,
    geradoEm: row.gerado_em,
  };
}

export async function listRemoteContratos(limit = 200): Promise<ContratoGerado[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("contrato_gerado").select(COLUNAS).order("ano", { ascending: false }).order("numero", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(doBanco);
}

/** Grava o contrato. Número repetido no mesmo ano volta como erro claro. */
export async function salvarRemoteContrato(dados: DadosDoContrato, refs: { dealRef: string | null; contactRef: string | null }): Promise<ContratoGerado> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("contrato_gerado")
    .insert({ ano: dados.ano, numero: dados.numero, deal_ref: refs.dealRef, contact_ref: refs.contactRef, paciente_nome: dados.paciente.nome.trim().toUpperCase(), valor_total: dados.valorTotal, dados })
    .select(COLUNAS)
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(`O contrato nº ${dados.numero}/${dados.ano} já existe. Use o próximo número.`);
    throw new Error(error.message);
  }
  return doBanco(data);
}

export async function mudarStatusRemoteContrato(id: string, status: ContratoGerado["status"]) {
  const client = requireSupabase();
  const { error } = await client.from("contrato_gerado").update({ status, atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** O modelo .docx (só quem pode gerar contrato consegue baixar). */
export async function baixarRemoteModeloContrato(modelo = "medicacao"): Promise<ArrayBuffer> {
  const client = requireSupabase();
  const { data, error } = await client.storage.from("modelos-contrato").download(`${modelo}.docx`);
  if (error || !data) throw new Error(`Não consegui baixar o modelo do contrato (${error?.message ?? "arquivo vazio"}).`);
  return data.arrayBuffer();
}

// ---------------------------------------------------------------------------
// Cadastro e pagamento do paciente para o contrato (15/10/2026, 202610150001).
// ---------------------------------------------------------------------------
/** Ficha guardada + CPF + e-mail/telefone do CRM (função segura: só quem pode gerar contrato). */
export async function lerRemoteCadastroDoContrato(contactRef: string): Promise<FichaDoContato & { temCpfGuardado?: boolean }> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("contrato_cadastro_do_contato", { _contact_ref: contactRef });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { ficha?: Record<string, string | null> | null; cpf?: string | null; tem_cpf?: boolean; email?: string | null; telefone?: string | null };
  const f = r.ficha ?? {};
  const limpo = (v: string | null | undefined) => (v ?? "").trim() || undefined;
  return {
    nacionalidade: limpo(f.nacionalidade),
    estadoCivil: limpo(f.estado_civil),
    profissao: limpo(f.profissao),
    rg: limpo(f.rg),
    nascimento: limpo(f.nascimento),
    endereco: limpo(f.endereco),
    numeroEnd: limpo(f.numero),
    bairro: limpo(f.bairro),
    municipio: limpo(f.municipio),
    uf: limpo(f.uf),
    cep: limpo(f.cep),
    cpf: limpo(r.cpf),
    email: limpo(r.email),
    telefone: limpo(r.telefone),
    // CPF guardado que este usuário não pode ver (recepção): o contrato pede para digitar.
    temCpfGuardado: Boolean(r.tem_cpf),
  };
}

/** Ao gerar o contrato: grava a ficha, o CPF e completa e-mail/telefone vazios no CRM.
 *  Devolve o que aconteceu com o CPF ("mantido" = já havia outro e quem gerou não pode trocar). */
export async function salvarRemoteCadastroDoContrato(contactRef: string, paciente: DadosDoContrato["paciente"]): Promise<{ cpf: "gravado" | "igual" | "trocado" | "mantido" | null }> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("contrato_salvar_cadastro", { _contact_ref: contactRef, _dados: paciente });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { cpf?: "gravado" | "igual" | "trocado" | "mantido" | null };
  return { cpf: r.cpf ?? null };
}

/** As comandas recentes do paciente (com os pagamentos) e os lembretes em aberto. */
export async function listarRemotePagamentosDoContato(contactRef: string, desdeISO: string): Promise<{ comandas: ComandaParaContrato[]; lembretes: LembreteParaContrato[] }> {
  const client = requireSupabase();
  const { data: vendas, error } = await client.from("fin_sales").select("client_ref, sale_date").eq("crm_contact_ref", contactRef).is("deleted_at", null).gte("sale_date", desdeISO).order("sale_date", { ascending: false }).limit(10);
  if (error) throw new Error(error.message);
  const refs = (vendas ?? []).map((v: any) => v.client_ref as string);
  const { data: pags, error: e2 } = refs.length ? await client.from("fin_sale_payments").select("sale_ref, method, amount, installments").in("sale_ref", refs) : { data: [], error: null };
  if (e2) throw new Error(e2.message);
  const comandas: ComandaParaContrato[] = (vendas ?? []).map((v: any) => ({
    ref: v.client_ref,
    dia: String(v.sale_date).slice(0, 10),
    pagamentos: (pags ?? []).filter((p: any) => p.sale_ref === v.client_ref).map((p: any) => ({ metodo: p.method, valor: Number(p.amount) || 0, parcelas: Number(p.installments) || 1 })),
  }));
  const { data: lembs, error: e3 } = await client.from("pagamento_lembrete").select("valor_pendente, data_prevista, observacao").eq("crm_contact_ref", contactRef).eq("status", "aberto").is("deleted_at", null);
  if (e3) throw new Error(e3.message);
  const lembretes: LembreteParaContrato[] = (lembs ?? []).map((l: any) => ({ valor: Number(l.valor_pendente) || 0, dataPrevista: String(l.data_prevista ?? "").slice(0, 10), observacao: l.observacao ?? "" }));
  return { comandas, lembretes };
}
