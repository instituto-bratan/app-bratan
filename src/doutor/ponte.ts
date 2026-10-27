// PONTE DO APP DO DOUTOR COM O SISTEMA (28/10/2026).
//
// O app do doutor é a v22 que ele já conhece (public/doutor/plano.js): monta o
// plano, apresenta, baixa a imagem, gera o código do Closer — tudo offline.
// Esta ponte acrescenta três coisas, sem mexer na tela dele:
//   1. SESSÃO: usa o login do APP BRATAN (mesmo domínio, mesma sessão do
//      Supabase guardada no aparelho). Sem sessão, "Entrar" leva ao login do
//      360 em /doutor/entrar e volta para cá.
//   2. PACIENTE DA AGENDA: lista a agenda do dia (agenda_espelho) para escolher
//      o paciente em vez de digitar; quando o nome casa com uma ficha do CRM,
//      o protocolo já vai ligado a ela.
//   3. "ENVIAR AO SISTEMA": grava o protocolo na tabela `protocolo` pela função
//      protocolo_enviar. Sempre passa pela fila deste aparelho (sobe quando
//      der) e nunca duplica (o client_ref nasce aqui).
// A regra de cada pedaço mora em arquivos sem tela, testados:
// protocoloDaV22.ts (o retrato do plano → protocolo) e filaDeEnvio.ts (a fila).
import type { Session } from "@supabase/supabase-js";
import { casarComFicha, chaveDoProfissional, classificarCaixa, horaEmBrasilia, nomeDoProfissional, type ContatoParaCasar } from "@/features/agenda/agendaDoDia";
import { isCargo, moduleLevel } from "@/lib/access";
import { enviarRemoteProtocolo } from "@/lib/remote/protocolo";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { aoFalhar, aoResponder, classificarFalha, colocarNaFila, conferirNomeDaAgenda, lerEstado, novoPlano, prontosParaEnviar, situacaoDoPlano, vincularAgenda, type EstadoDaPonte } from "./filaDeEnvio";
import { assinaturaDoRetrato, travaDoRetrato, type RetratoDaV22 } from "./protocoloDaV22";

type ApiDaV22 = {
  retrato: () => RetratoDaV22;
  nome: () => string;
  temItens: () => boolean;
  definirPaciente: (nome: string) => void;
  aviso: (texto: string) => void;
};

type PessoaDaPonte = { id: string; nome: string; cargo: string | null; acessos: Record<string, string> | null };

declare global {
  interface Window {
    BratanPlano?: ApiDaV22;
  }
}

const CHAVE = "bratan_doutor_ponte_v1";
const ENTRAR = "/doutor/entrar";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o tipo Database do projeto é escrito à mão
const banco = supabase as any;

let estado: EstadoDaPonte = lerEstado(lerGuardado());
let sessao: Session | null = null;
let pessoa: PessoaDaPonte | null = null;
let enviando = false;
let contatosDoCrm: ContatoParaCasar[] | null = null;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const api = () => window.BratanPlano;

function lerGuardado(): unknown {
  try {
    return JSON.parse(window.localStorage.getItem(CHAVE) || "null");
  } catch {
    return null;
  }
}

function guardar() {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch {
    /* aparelho sem espaço: a fila vive só nesta aba até ele liberar */
  }
}

function aviso(texto: string) {
  api()?.aviso(texto);
}

function novoClientRef() {
  const c = window.crypto;
  if (c?.randomUUID) return `prot-${c.randomUUID()}`;
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return `prot-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function hojeEmBrasilia() {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

function iniciais(nome: string) {
  const partes = nome.replace(/^(dr|dra)\.?\s+/i, "").split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "•";
}

function podeEnviar() {
  return Boolean(pessoa && moduleLevel({ cargo: isCargo(pessoa.cargo) ? pessoa.cargo : null, acessos: pessoa.acessos }, "doutor") === "EDITAR");
}

// ---------------------------------------------------------------- sessão

async function carregarPessoa(authId: string) {
  try {
    const { data } = await banco.from("colaborador_app").select("id, nome, cargo, acessos").eq("auth_id", authId).eq("ativo", true).maybeSingle();
    pessoa = data ? { id: String(data.id), nome: String(data.nome ?? ""), cargo: data.cargo ?? null, acessos: data.acessos ?? null } : null;
  } catch {
    pessoa = null;
  }
}

async function iniciarSessao() {
  if (!isSupabaseConfigured || !banco) {
    atualizarTela();
    return;
  }
  try {
    const { data } = await banco.auth.getSession();
    sessao = data.session ?? null;
    if (sessao) await carregarPessoa(sessao.user.id);
  } catch {
    sessao = null;
  }
  atualizarTela();
  void esvaziarFila();
  banco.auth.onAuthStateChange((evento: string, nova: Session | null) => {
    const mudouDeGente = (nova?.user.id ?? null) !== (sessao?.user.id ?? null);
    sessao = nova;
    if (!nova) {
      pessoa = null;
      atualizarTela();
      return;
    }
    if (mudouDeGente || !pessoa) {
      void carregarPessoa(nova.user.id).then(() => {
        atualizarTela();
        void esvaziarFila();
      });
    } else if (evento === "TOKEN_REFRESHED" || evento === "SIGNED_IN") {
      void esvaziarFila();
    }
  });
}

// ---------------------------------------------------------------- envio

async function esvaziarFila() {
  if (enviando || !sessao || !navigator.onLine) {
    atualizarTela();
    return;
  }
  const pendentes = prontosParaEnviar(estado);
  if (!pendentes.length) return;
  enviando = true;
  atualizarTela();
  try {
    for (const item of pendentes) {
      try {
        const resposta = await enviarRemoteProtocolo(item.envio);
        estado = aoResponder(estado, item.clientRef, resposta, new Date().toISOString());
        guardar();
        aviso(resposta.novo ? `Protocolo de ${item.paciente} enviado ao comercial` : `O protocolo de ${item.paciente} já estava no sistema`);
      } catch (erro) {
        const falha = classificarFalha(erro);
        estado = aoFalhar(estado, item.clientRef, falha);
        guardar();
        // Sem internet ou sem login: os próximos também não vão. Espera.
        if (!falha.definitiva) break;
        aviso(`Não foi para o sistema: ${falha.mensagem}`);
      }
    }
  } finally {
    enviando = false;
    atualizarTela();
  }
}

function aoTocarEnviar() {
  const v22 = api();
  if (!v22) return;
  const retrato = v22.retrato();
  const trava = travaDoRetrato(retrato);
  if (trava) {
    aviso(trava);
    atualizarTela();
    return;
  }
  if (sessao && pessoa && !podeEnviar()) {
    aviso("Seu acesso não envia protocolo. Peça em Administração › Acessos › App do Doutor.");
    return;
  }
  const r = colocarNaFila(estado, retrato, { agoraISO: new Date().toISOString(), novoId: novoClientRef });
  estado = r.estado;
  guardar();
  if (r.jaEnviado) aviso("Este protocolo já está no sistema");
  else if (!sessao) aviso("Guardado neste aparelho. Entre no sistema para ele subir.");
  else if (!navigator.onLine) aviso("Sem internet: guardado neste aparelho, sobe sozinho quando voltar.");
  void esvaziarFila();
  atualizarTela();
}

// ---------------------------------------------------------------- tela

const ICONE_ENVIAR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/></svg>';

function atualizarTela() {
  const v22 = api();
  const conta = $<HTMLButtonElement>("ptConta");
  const agenda = $<HTMLButtonElement>("ptAgenda");
  const vinculo = $<HTMLSpanElement>("ptVinculo");
  const envio = $<HTMLDivElement>("ptEnvio");
  const situacao = $<HTMLParagraphElement>("ptSituacao");
  const icone = $<HTMLSpanElement>("icEnviar");
  if (icone && !icone.innerHTML) icone.innerHTML = ICONE_ENVIAR;

  if (conta) {
    conta.hidden = !isSupabaseConfigured;
    if (!sessao) {
      conta.className = "ponte-conta";
      conta.innerHTML = '<span class="bolinha" aria-hidden="true"></span>Entrar';
      conta.title = "Entrar no sistema para enviar protocolos";
      conta.setAttribute("aria-label", "Entrar no sistema");
    } else {
      conta.className = "ponte-conta logado";
      conta.textContent = iniciais(pessoa?.nome || sessao.user.email || "");
      conta.title = pessoa?.nome ? `Conectado como ${pessoa.nome}` : "Conectado ao sistema";
      conta.setAttribute("aria-label", conta.title);
    }
  }
  if (agenda) agenda.hidden = !sessao;
  const entrar = $<HTMLButtonElement>("ptEntrar");
  if (entrar) entrar.hidden = Boolean(sessao) || !isSupabaseConfigured;
  if (vinculo) {
    const v = estado.vinculo;
    vinculo.hidden = !v.agendaRef;
    vinculo.textContent = v.agendaRef ? `Da agenda de hoje${v.contactRef ? " · ficha do CRM ligada" : ""}` : "";
  }
  if (envio) envio.hidden = !v22 || !isSupabaseConfigured;
  if (!v22 || !situacao) return;

  const retrato = v22.temItens() ? v22.retrato() : null;
  const trava = retrato ? travaDoRetrato(retrato) : null;
  const assinatura = retrato && !trava ? assinaturaDoRetrato(retrato) : null;
  const s = situacaoDoPlano(estado, assinatura, { temSessao: Boolean(sessao), online: navigator.onLine, enviando });
  const texto = trava && v22.temItens() ? trava : s.texto;
  const pendentesDeOutros = estado.fila.filter((item) => item.assinatura !== assinatura).length;
  situacao.dataset.tipo = trava ? "nunca" : s.tipo;
  situacao.textContent =
    pendentesDeOutros > 0 ? `${texto} ${pendentesDeOutros === 1 ? "Mais 1 protocolo" : `Mais ${pendentesDeOutros} protocolos`} esperando para subir.` : texto;
  const botao = $<HTMLButtonElement>("ptEnviar");
  if (botao) botao.disabled = enviando && s.tipo === "enviando";
}

// ---------------------------------------------------------------- janelas (conta e agenda)

function abrirJanela(html: string, aoClicar: (alvo: HTMLElement) => void) {
  const modal = $<HTMLDivElement>("ptModal");
  const cartao = $<HTMLDivElement>("ptCard");
  if (!modal || !cartao) return;
  cartao.innerHTML = html;
  cartao.onclick = (evento) => {
    const alvo = (evento.target as HTMLElement).closest<HTMLElement>("[data-pt]");
    if (alvo) aoClicar(alvo);
  };
  modal.classList.add("on");
  window.setTimeout(() => cartao.querySelector<HTMLElement>("[data-foco]")?.focus(), 60);
}

function fecharJanela() {
  $<HTMLDivElement>("ptModal")?.classList.remove("on");
}

const esc = (texto: string) => texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

function abrirConta() {
  if (!sessao) {
    window.location.assign(ENTRAR);
    return;
  }
  const naFila = estado.fila.length;
  abrirJanela(
    `<h3 id="ptTitulo">Conectado ao sistema</h3>
     <p class="ponte-quem">${esc(pessoa?.nome || sessao.user.email || "")}</p>
     <p>${podeEnviar() ? "Os protocolos que você enviar vão para o comercial." : "Seu acesso ainda não envia protocolos (Administração › Acessos › App do Doutor)."}
     ${naFila ? ` ${naFila === 1 ? "1 protocolo está guardado" : `${naFila} protocolos estão guardados`} neste aparelho esperando para subir.` : ""}</p>
     <div class="mbtns"><button class="btn dang" data-pt="sair">Sair</button><button class="btn pri" data-pt="fechar" data-foco>Fechar</button></div>`,
    (alvo) => {
      if (alvo.dataset.pt === "sair") {
        void banco.auth.signOut().finally(() => {
          fecharJanela();
          atualizarTela();
        });
      } else fecharJanela();
    },
  );
}

type LinhaDaAgenda = { id: string; origem: string; origem_id: string; inicio: string | null; profissional: string | null; paciente: string | null; status: string | null };

async function lerContatosDoCrm(): Promise<ContatoParaCasar[]> {
  if (contatosDoCrm) return contatosDoCrm;
  try {
    const { data } = await banco.from("crm_contacts").select("client_ref, full_name").is("archived_at", null).limit(5000);
    contatosDoCrm = ((data ?? []) as { client_ref: string | null; full_name: string | null }[])
      .filter((linha) => linha.client_ref && (linha.full_name ?? "").trim())
      .map((linha) => ({ id: String(linha.client_ref), nome: String(linha.full_name) }));
  } catch {
    contatosDoCrm = [];
  }
  return contatosDoCrm;
}

async function abrirAgenda() {
  abrirJanela(`<h3 id="ptTitulo">Agenda de hoje</h3><p class="ponte-vazio">Carregando a agenda…</p>`, () => undefined);
  const hoje = hojeEmBrasilia();
  let linhas: LinhaDaAgenda[] = [];
  let falha = "";
  try {
    const { data, error } = await banco
      .from("agenda_espelho")
      .select("id, origem, origem_id, inicio, profissional, paciente, status")
      .eq("dia", hoje)
      .order("inicio")
      .limit(400);
    if (error) throw error;
    linhas = (data ?? []) as LinhaDaAgenda[];
  } catch (erro) {
    falha = classificarFalha(erro).mensagem;
  }
  const contatos = linhas.length ? await lerContatosDoCrm() : [];
  const pacientes = linhas
    .filter((linha) => linha.status !== "cancelado" && linha.status !== "desmarcado")
    .map((linha) => ({ linha, caixa: classificarCaixa(linha.paciente), chave: chaveDoProfissional(linha.profissional) }))
    .filter((item) => item.caixa.tipo === "PACIENTE");
  // O Dr. Daniel primeiro (é a agenda dele); a equipe embaixo.
  const doDoutor = pacientes.filter((item) => item.chave === "dr-daniel");
  const daEquipe = pacientes.filter((item) => item.chave !== "dr-daniel");
  const fichas = new Map<string, ReturnType<typeof casarComFicha>>();
  const item = (p: (typeof pacientes)[number], indice: number) => {
    const ficha = casarComFicha(p.caixa.nome, contatos);
    fichas.set(String(indice), ficha);
    return `<button type="button" class="ponte-item" data-pt="paciente" data-i="${indice}">
      <b>${esc(horaEmBrasilia(p.linha.inicio))}</b><span>${esc(p.caixa.nome)}</span><em>${ficha.status === "FICHA" ? "ficha ✓" : esc(nomeDoProfissional(p.chave, p.linha.profissional))}</em></button>`;
  };
  const ordem = [...doDoutor, ...daEquipe];
  let html = `<h3 id="ptTitulo">Agenda de hoje</h3>`;
  if (falha) html += `<p class="ponte-vazio">Não consegui ler a agenda: ${esc(falha)} Digite o nome do paciente.</p>`;
  else if (!ordem.length) html += `<p class="ponte-vazio">Nenhum paciente na agenda de hoje (ou a agenda ainda não chegou do iClinic). Digite o nome do paciente.</p>`;
  else {
    html += `<p>Toque no paciente: o nome vai para o plano e, quando há ficha no CRM, o protocolo já vai ligado a ela.</p><div class="ponte-lista">`;
    if (doDoutor.length) html += `<div class="ponte-grupo">Dr. Daniel</div>${doDoutor.map((p) => item(p, ordem.indexOf(p))).join("")}`;
    if (daEquipe.length) html += `<div class="ponte-grupo">Equipe</div>${daEquipe.map((p) => item(p, ordem.indexOf(p))).join("")}`;
    html += `</div>`;
  }
  html += `<div class="mbtns"><button class="btn" data-pt="fechar">Fechar</button><button class="btn pri" data-pt="digitar" data-foco>Digitar o nome</button></div>`;
  abrirJanela(html, (alvo) => {
    if (alvo.dataset.pt === "paciente") {
      const escolhido = ordem[Number(alvo.dataset.i)];
      if (!escolhido) return;
      const ficha = fichas.get(String(alvo.dataset.i));
      api()?.definirPaciente(escolhido.caixa.nome);
      estado = vincularAgenda(estado, {
        agendaRef: `${escolhido.linha.origem}:${escolhido.linha.origem_id}`,
        contactRef: ficha && ficha.status === "FICHA" ? ficha.contatoId : null,
        nome: escolhido.caixa.nome,
      });
      guardar();
      fecharJanela();
      atualizarTela();
      return;
    }
    fecharJanela();
    if (alvo.dataset.pt === "digitar") $<HTMLInputElement>("pName")?.focus();
  });
}

// ---------------------------------------------------------------- liga tudo

function ligar() {
  $<HTMLButtonElement>("ptEnviar")?.addEventListener("click", aoTocarEnviar);
  $<HTMLButtonElement>("ptConta")?.addEventListener("click", abrirConta);
  $<HTMLButtonElement>("ptEntrar")?.addEventListener("click", () => window.location.assign(ENTRAR));
  $<HTMLButtonElement>("ptAgenda")?.addEventListener("click", () => void abrirAgenda());
  $<HTMLDivElement>("ptModal")?.addEventListener("click", (evento) => {
    if ((evento.target as HTMLElement).id === "ptModal") fecharJanela();
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && $<HTMLDivElement>("ptModal")?.classList.contains("on")) fecharJanela();
  });
  document.addEventListener("bratan:plano", (evento) => {
    const motivo = (evento as CustomEvent<{ motivo?: string }>).detail?.motivo;
    if (motivo === "novo") estado = novoPlano(estado);
    else estado = conferirNomeDaAgenda(estado, api()?.nome() ?? "");
    guardar();
    atualizarTela();
  });
  window.addEventListener("online", () => void esvaziarFila());
  window.addEventListener("offline", atualizarTela);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void esvaziarFila();
  });
  // Outra aba do app mexeu na fila: lê de novo.
  window.addEventListener("storage", (evento) => {
    if (evento.key !== CHAVE) return;
    estado = lerEstado(lerGuardado());
    atualizarTela();
  });
  // Enquanto houver protocolo esperando, tenta de tempos em tempos.
  window.setInterval(() => {
    if (prontosParaEnviar(estado).length) void esvaziarFila();
  }, 45_000);
  atualizarTela();
  void iniciarSessao();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligar);
else ligar();
