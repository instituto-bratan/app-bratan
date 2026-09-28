// BANCO LOCAL DO MÓDULO NUTRIÇÃO (IndexedDB, 28/09/2026).
//
// No piloto os dados clínicos ficam no navegador do Mac da Dra. Géssica, até a
// decisão sobre onde passam a morar no Supabase (RLS por cargo, segundo fator,
// região dos dados). Duas garantias:
// - cada registro tem número de versão: gravar por cima de uma versão mais nova
//   (outra aba, outro momento) é recusado com ConflitoDeVersao, nunca em silêncio;
// - toda gravação avisa as outras abas abertas (BroadcastChannel).

const NOME_DO_BANCO = "bratan-nutricao";
const VERSAO_DO_BANCO = 1;
const CANAL = "bratan-nutricao";

export type NomeDaColecao =
  | "pessoas"
  | "atendimentos"
  | "itensUso"
  | "planos"
  | "biblioteca"
  | "alimentos"
  | "medidas"
  | "agenda"
  | "gravacoes"
  | "pedacos"
  | "meta";

const COLECOES_POR_PESSOA: NomeDaColecao[] = ["atendimentos", "itensUso", "planos"];

export class ConflitoDeVersao extends Error {
  constructor(public readonly atual: unknown) {
    super("Este registro foi alterado em outra aba ou aparelho depois que você abriu.");
    this.name = "ConflitoDeVersao";
  }
}

let conexao: Promise<IDBDatabase> | null = null;

function pedido<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha no banco local."));
  });
}

function fimDaTransacao(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("A gravação foi cancelada."));
    tx.onerror = () => reject(tx.error ?? new Error("Falha no banco local."));
  });
}

export function abrirBanco(): Promise<IDBDatabase> {
  if (conexao) return conexao;
  conexao = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Este navegador não permite guardar dados localmente (IndexedDB indisponível)."));
      return;
    }
    const req = indexedDB.open(NOME_DO_BANCO, VERSAO_DO_BANCO);
    req.onupgradeneeded = () => {
      const db = req.result;
      const criar = (nome: NomeDaColecao) => (db.objectStoreNames.contains(nome) ? null : db.createObjectStore(nome, { keyPath: "id" }));
      for (const nome of ["pessoas", "biblioteca", "alimentos", "medidas", "agenda", "gravacoes", "meta"] as NomeDaColecao[]) criar(nome);
      for (const nome of COLECOES_POR_PESSOA) {
        const store = criar(nome);
        store?.createIndex("pessoaId", "pessoaId", { unique: false });
      }
      if (!db.objectStoreNames.contains("pedacos")) {
        const pedacos = db.createObjectStore("pedacos", { keyPath: ["gravacaoId", "ordem"] });
        pedacos.createIndex("gravacaoId", "gravacaoId", { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        conexao = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      conexao = null;
      reject(req.error ?? new Error("Não foi possível abrir o banco local."));
    };
    req.onblocked = () => reject(new Error("Feche as outras abas do app e tente de novo."));
  });
  return conexao;
}

// ------------------------------------------------------------ aviso entre abas

export type AvisoDeMudanca = { colecao: NomeDaColecao; id: string | null };

let canal: BroadcastChannel | null = null;
const ouvintesLocais = new Set<(aviso: AvisoDeMudanca) => void>();

function obterCanal(): BroadcastChannel | null {
  if (canal || typeof BroadcastChannel === "undefined") return canal;
  canal = new BroadcastChannel(CANAL);
  canal.onmessage = (evento) => {
    for (const ouvinte of ouvintesLocais) ouvinte(evento.data as AvisoDeMudanca);
  };
  return canal;
}

function avisar(aviso: AvisoDeMudanca) {
  obterCanal()?.postMessage(aviso);
}

/** Ouvir mudanças feitas em OUTRAS abas (as desta aba já atualizam pelo TanStack Query). */
export function ouvirMudancas(ouvinte: (aviso: AvisoDeMudanca) => void): () => void {
  obterCanal();
  ouvintesLocais.add(ouvinte);
  return () => {
    ouvintesLocais.delete(ouvinte);
  };
}

// ------------------------------------------------------------ leitura e gravação

export async function ler<T>(colecao: NomeDaColecao, id: string): Promise<T | undefined> {
  const db = await abrirBanco();
  return pedido<T | undefined>(db.transaction(colecao, "readonly").objectStore(colecao).get(id));
}

export async function listar<T>(colecao: NomeDaColecao): Promise<T[]> {
  const db = await abrirBanco();
  return pedido<T[]>(db.transaction(colecao, "readonly").objectStore(colecao).getAll());
}

export async function listarPorPessoa<T>(colecao: NomeDaColecao, pessoaId: string): Promise<T[]> {
  const db = await abrirBanco();
  const indice = db.transaction(colecao, "readonly").objectStore(colecao).index("pessoaId");
  return pedido<T[]>(indice.getAll(pessoaId));
}

type ComVersao = { id: string; versao: number };

/**
 * Grava conferindo a versão. `versaoLida` é a versão que a tela carregou; se o
 * banco já tem outra, alguém gravou antes e a gravação é recusada. `null` =
 * registro novo (ou gravação sem conferência, só para dados de sistema).
 */
export async function gravar<T extends ComVersao>(colecao: NomeDaColecao, registro: T, versaoLida: number | null): Promise<T> {
  const db = await abrirBanco();
  const tx = db.transaction(colecao, "readwrite");
  const store = tx.objectStore(colecao);
  const atual = await pedido<T | undefined>(store.get(registro.id));
  if (atual && versaoLida !== null && atual.versao !== versaoLida) {
    tx.abort();
    throw new ConflitoDeVersao(atual);
  }
  const salvo = { ...registro, versao: (atual?.versao ?? 0) + 1 } as T;
  store.put(salvo);
  await fimDaTransacao(tx);
  avisar({ colecao, id: registro.id });
  return salvo;
}

/** Para dados sem conferência de versão (metadados, pedaços de áudio). */
export async function gravarSemVersao<T extends { id: string }>(colecao: NomeDaColecao, registro: T): Promise<void> {
  const db = await abrirBanco();
  const tx = db.transaction(colecao, "readwrite");
  tx.objectStore(colecao).put(registro);
  await fimDaTransacao(tx);
  avisar({ colecao, id: registro.id });
}

export async function apagar(colecao: NomeDaColecao, id: string): Promise<void> {
  const db = await abrirBanco();
  const tx = db.transaction(colecao, "readwrite");
  tx.objectStore(colecao).delete(id);
  await fimDaTransacao(tx);
  avisar({ colecao, id });
}

// ------------------------------------------------------------ pedaços da gravação

export type PedacoDeAudio = { gravacaoId: string; ordem: number; dados: Blob };

export async function guardarPedaco(pedaco: PedacoDeAudio): Promise<void> {
  const db = await abrirBanco();
  const tx = db.transaction("pedacos", "readwrite");
  tx.objectStore("pedacos").put(pedaco);
  await fimDaTransacao(tx);
}

export async function lerPedacos(gravacaoId: string): Promise<PedacoDeAudio[]> {
  const db = await abrirBanco();
  const indice = db.transaction("pedacos", "readonly").objectStore("pedacos").index("gravacaoId");
  const pedacos = await pedido<PedacoDeAudio[]>(indice.getAll(gravacaoId));
  return pedacos.sort((a, b) => a.ordem - b.ordem);
}

export async function apagarPedacos(gravacaoId: string): Promise<void> {
  const db = await abrirBanco();
  const tx = db.transaction("pedacos", "readwrite");
  const indice = tx.objectStore("pedacos").index("gravacaoId");
  const chaves = await pedido<IDBValidKey[]>(indice.getAllKeys(gravacaoId));
  for (const chave of chaves) tx.objectStore("pedacos").delete(chave);
  await fimDaTransacao(tx);
}

// ------------------------------------------------------------ cópia de segurança

const COLECOES_EXPORTADAS: NomeDaColecao[] = ["pessoas", "atendimentos", "itensUso", "planos", "biblioteca", "alimentos", "medidas", "agenda", "gravacoes", "meta"];

export async function exportarTudo(): Promise<Record<string, unknown[]>> {
  const saida: Record<string, unknown[]> = {};
  for (const colecao of COLECOES_EXPORTADAS) saida[colecao] = await listar(colecao);
  return saida;
}
