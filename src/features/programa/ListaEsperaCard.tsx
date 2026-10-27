// LISTA DE ESPERA (15/09/2026, proposta 3.2): quando um paciente pede para
// remarcar (resposta ao toque de confirmação), o horário libera e a recepção
// chama o próximo daqui. Simples: nome, telefone, preferência.
//
// Papel & Musgo (08/10/2026, redesenho etapa 4): é onde se age (pôr na lista,
// marcar encaixado), então mora numa folha; os campos são os do guia (40 px,
// rótulo para o leitor de tela) e a contagem vem em frase ao lado do título.
//
// LISTA DE PRONTIDÃO (27/10/2026, frente Atendimento digital): quem aceita
// receber a oferta de encaixe pelo WhatsApp é marcado aqui, com o
// consentimento (por onde aceitou; quando e quem registrou vêm do login, no
// banco). Quando um horário do médico abre, o app oferece a vaga a uma pessoa
// por vez, com 30 minutos para responder pelo botão (whatsapp-encaixe). Aqui a
// recepção vê como está cada oferta e as vagas que alguém aceitou (para marcar
// no iClinic). A lista segue o acesso da Agenda do dia — o mesmo do banco
// (202610280302): recepção, enfermagem, coordenação e quem o Lucas liberar.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPlus } from "lucide-react";
import { BlocoFolha, Botao } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "@/components/ui/avisos";
import { CAMPO, Etiqueta } from "@/features/crm/comercialVisual";
import { TituloDoBloco } from "@/features/financeiro/pecasDiaPagar";
import { useNivelDaTela } from "@/hooks/useNivelDaTela";
import { integracaoLigada } from "@/lib/integracoes";
import {
  colocarNaListaDeEspera,
  encerrarVagaDeEncaixe,
  listarListaDeEspera,
  listarVagasDeEncaixe,
  marcarEncaixado,
  nomesDaListaDeEspera,
  tirarDoEncaixe,
  type PessoaNaListaDeEspera,
  type VagaDeEncaixe,
} from "@/lib/remote/atendimento";
import { cn } from "@/lib/utils";
import {
  CANAIS_DO_CONSENTIMENTO,
  ROTULO_DA_OFERTA,
  ROTULO_DA_VAGA,
  TEXTO_DO_CONSENTIMENTO,
  diaPorExtenso,
  horaEmBrasilia,
  telefoneValido,
} from "../../../supabase/functions/_shared/whatsappRegras";

const FORM_VAZIO = { nome: "", telefone: "", preferencia: "", profissional: "", aceitaEncaixe: false, canal: "" };
const VIVAS = new Set(["ENVIANDO", "AGUARDANDO"]);

function falhou(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** A oferta mais recente desta pessoa, em frase ("oferta enviada… até 14:35"). */
function situacaoDaPessoa(pessoa: PessoaNaListaDeEspera, vagas: VagaDeEncaixe[]) {
  const ofertas = vagas.flatMap((vaga) => vaga.ofertas.filter((oferta) => oferta.listaEsperaId === pessoa.id).map((oferta) => ({ oferta, vaga })));
  const viva = ofertas.find(({ oferta }) => VIVAS.has(oferta.status));
  const escolhida = viva ?? ofertas.sort((a, b) => String(b.oferta.respondidaEm ?? b.oferta.enviadaEm ?? "").localeCompare(String(a.oferta.respondidaEm ?? a.oferta.enviadaEm ?? "")))[0];
  if (!escolhida) return null;
  const { oferta, vaga } = escolhida;
  const prazo = oferta.status === "AGUARDANDO" && oferta.expiraEm ? ` até ${horaEmBrasilia(oferta.expiraEm)}` : "";
  return `${ROTULO_DA_OFERTA[oferta.status] ?? oferta.status.toLowerCase()}${prazo} · ${diaPorExtenso(vaga.inicio)}, ${horaEmBrasilia(vaga.inicio)}`;
}

export function ListaEsperaCard({ pessoaId, ativo }: { pessoaId: string | null; ativo: boolean }) {
  const queryClient = useQueryClient();
  const tela = useNivelDaTela("agenda");
  const pode = ativo && tela.nivel !== "OCULTO";
  const query = useQuery({ queryKey: ["lista-espera"], queryFn: listarListaDeEspera, enabled: pode, staleTime: 60_000 });
  const vagasQuery = useQuery({ queryKey: ["encaixe-vagas"], queryFn: () => listarVagasDeEncaixe(3), enabled: pode, staleTime: 60_000 });
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  if (!pode) return null;

  const vagas = vagasQuery.data ?? [];
  const whatsappLigado = integracaoLigada("whatsapp");

  async function recarregar() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["lista-espera"] }), queryClient.invalidateQueries({ queryKey: ["encaixe-vagas"] })]);
  }

  async function adicionar() {
    if (!form.nome.trim()) return;
    if (form.aceitaEncaixe && !telefoneValido(form.telefone)) {
      toast("Para o encaixe pelo WhatsApp, o número precisa ter DDD e número (ex.: 11 99999-0000).", { tom: "atencao", duracaoMs: 6000 });
      return;
    }
    if (form.aceitaEncaixe && !form.canal) {
      toast("Marque por onde a pessoa aceitou o encaixe (presencial, ligação ou WhatsApp).", { tom: "atencao", duracaoMs: 6000 });
      return;
    }
    setSalvando(true);
    try {
      await colocarNaListaDeEspera(
        { nome: form.nome.trim(), telefone: form.telefone.trim(), preferencia: form.preferencia.trim(), profissional: form.profissional.trim(), aceitaEncaixe: form.aceitaEncaixe, consentimentoCanal: form.canal },
        pessoaId,
      );
      setForm(FORM_VAZIO);
      await recarregar();
      toast(form.aceitaEncaixe ? "Entrou na lista de espera, com o encaixe pelo WhatsApp." : "Entrou na lista de espera.", { tom: "ok" });
    } catch (error) {
      toast(`Não consegui gravar: ${falhou(error)}`, { tom: "erro" });
    } finally {
      setSalvando(false);
    }
  }

  async function agir(acao: () => Promise<void>, erro: string) {
    try {
      await acao();
      await recarregar();
    } catch (error) {
      toast(`${erro} ${falhou(error)}`, { tom: "erro" });
    }
  }

  const quantos = query.data?.length ?? 0;
  const noEncaixe = (query.data ?? []).filter((item) => item.aceitaEncaixe).length;

  return (
    <BlocoFolha as="section" id="lista-de-espera" aria-labelledby="titulo-lista-de-espera" respiro className="font-sans">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <TituloDoBloco
          id="titulo-lista-de-espera"
          icone={<ListPlus className="h-4 w-4" aria-hidden="true" />}
          detalhe={quantos === 0 ? undefined : `${quantos} ${quantos === 1 ? "pessoa esperando" : "pessoas esperando"}${noEncaixe ? `, ${noEncaixe} no encaixe pelo WhatsApp` : ""}`}
        >
          Lista de espera
        </TituloDoBloco>
        <InfoTip title="Para que serve">
          Quem quer ser encaixado antes. Quem aceitar o encaixe pelo WhatsApp recebe a vaga que abrir com o médico (quando um paciente pede para remarcar
          ou desmarca): uma pessoa por vez, na ordem de chegada, com 30 minutos para responder pelo botão; sem resposta, a vaga passa para a próxima.
          Quem aceitar a vaga aparece em "Vagas do encaixe" para a recepção marcar no iClinic. Marcar "encaixado" tira da lista.
        </InfoTip>
      </div>
      {!whatsappLigado ? (
        <p className="mt-2 text-[13px] font-medium leading-5 text-tinta-2">O encaixe pelo WhatsApp começa quando o WhatsApp oficial for ligado. O aceite já pode ser registrado.</p>
      ) : null}

      {tela.podeEditar ? (
        <div className="mt-4 grid gap-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_9rem_1fr_9rem_auto]">
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome" aria-label="Nome" className={CAMPO} />
            <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="WhatsApp" aria-label="WhatsApp" className={`${CAMPO} tabular-nums`} inputMode="tel" />
            <input value={form.preferencia} onChange={(e) => setForm({ ...form, preferencia: e.target.value })} placeholder="Preferência (ex.: manhãs, terça)" aria-label="Preferência" className={CAMPO} />
            <input value={form.profissional} onChange={(e) => setForm({ ...form, profissional: e.target.value })} placeholder="Médico (vazio = qualquer)" aria-label="Profissional" className={CAMPO} />
            <Botao variante="secundario" carregando={salvando} disabled={salvando || !form.nome.trim()} onClick={() => void adicionar()}>
              Adicionar
            </Botao>
          </div>
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <label className="flex max-w-[60ch] cursor-pointer items-start gap-2 text-[13px] font-semibold leading-5 text-tinta">
              <input
                type="checkbox"
                checked={form.aceitaEncaixe}
                onChange={(e) => setForm({ ...form, aceitaEncaixe: e.target.checked, canal: e.target.checked ? form.canal : "" })}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-musgo"
              />
              <span>
                Aceita receber a oferta de encaixe pelo WhatsApp
                <span className="block font-medium text-tinta-2">{TEXTO_DO_CONSENTIMENTO} Pergunte antes e marque só se a pessoa disser que sim.</span>
              </span>
            </label>
            {form.aceitaEncaixe ? (
              <select value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value })} aria-label="Por onde a pessoa aceitou" className={cn(CAMPO, "w-52 cursor-pointer")}>
                <option value="">Por onde aceitou?</option>
                {CANAIS_DO_CONSENTIMENTO.map((canal) => (
                  <option key={canal} value={canal}>
                    {canal}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      ) : null}

      {query.data?.length ? (
        <ul className="mt-4 border-t border-fio">
          {query.data.map((item) => {
            const situacao = situacaoDaPessoa(item, vagas);
            return (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-fio py-2.5 last:border-b-0">
                <span className="min-w-0 text-sm font-medium leading-5 text-tinta">
                  <strong className="font-bold">{item.nome}</strong>
                  <span className="tabular-nums">{item.telefone ? ` · ${item.telefone}` : ""}</span>
                  {item.preferencia ? ` · ${item.preferencia}` : ""}
                  {item.profissional ? ` · ${item.profissional}` : ""}
                  <span className="ml-1.5 text-[13px] tabular-nums text-tinta-2">
                    desde {item.criadoEm.slice(8, 10)}/{item.criadoEm.slice(5, 7)}
                  </span>
                  {item.aceitaEncaixe ? (
                    <Etiqueta tom="musgo" className="ml-2" title={item.consentimentoCanal ? `Aceitou por: ${item.consentimentoCanal}` : undefined}>
                      encaixe pelo WhatsApp
                    </Etiqueta>
                  ) : null}
                  {situacao ? <span className="block text-[13px] font-medium text-tinta-2">{situacao}</span> : null}
                </span>
                {tela.podeEditar ? (
                  <span className="flex flex-wrap gap-2">
                    {item.aceitaEncaixe ? (
                      <Botao tamanho="pq" variante="fantasma" onClick={() => void agir(() => tirarDoEncaixe(item.id), "Não deu para tirar do encaixe.")}>
                        Tirar do encaixe
                      </Botao>
                    ) : null}
                    <Botao tamanho="pq" variante="suave" onClick={() => void agir(() => marcarEncaixado(item.id), "Não deu para tirar da lista de espera.")}>
                      Encaixado
                    </Botao>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] font-medium text-tinta-2">Ninguém esperando encaixe.</p>
      )}

      <VagasDoEncaixe vagas={vagas} pessoas={query.data ?? []} podeEditar={tela.podeEditar} aoEncerrar={(id) => void agir(() => encerrarVagaDeEncaixe(id), "Não deu para encerrar a vaga.")} />
    </BlocoFolha>
  );
}

/** As vagas abertas e as dos últimos 3 dias: quem está com a oferta, quem aceitou (marcar no iClinic). */
function VagasDoEncaixe({ vagas, pessoas, podeEditar, aoEncerrar }: { vagas: VagaDeEncaixe[]; pessoas: PessoaNaListaDeEspera[]; podeEditar: boolean; aoEncerrar: (id: string) => void }) {
  const naLista = new Map(pessoas.map((pessoa) => [pessoa.id, pessoa.nome]));
  const faltam = [...new Set(vagas.flatMap((vaga) => [vaga.preenchidaPor ?? "", ...vaga.ofertas.map((oferta) => oferta.listaEsperaId)]))].filter((id) => id && !naLista.has(id));
  const nomesQuery = useQuery({ queryKey: ["encaixe-nomes", faltam.join(",")], queryFn: () => nomesDaListaDeEspera(faltam), enabled: faltam.length > 0, staleTime: 60_000 });
  if (!vagas.length) return null;
  const nome = (id: string | null) => (id ? (naLista.get(id) ?? nomesQuery.data?.[id] ?? "alguém da lista") : "");

  return (
    <div className="mt-4 border-t border-fio pt-4">
      <p className="font-sans text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">Vagas do encaixe</p>
      <ul className="mt-2">
        {vagas.map((vaga) => {
          const viva = vaga.ofertas.find((oferta) => VIVAS.has(oferta.status));
          const detalhe =
            vaga.status === "PREENCHIDA"
              ? `${nome(vaga.preenchidaPor)} aceitou — marcar no iClinic`
              : viva
                ? `oferecida a ${nome(viva.listaEsperaId)}${viva.expiraEm ? `, responde até ${horaEmBrasilia(viva.expiraEm)}` : ""}`
                : vaga.status === "ABERTA"
                  ? vaga.ofertas.length
                    ? `${vaga.ofertas.length} oferta(s) sem aceite; procurando o próximo da lista`
                    : "esperando alguém da lista que sirva para este horário"
                  : (vaga.motivoEncerramento ?? ROTULO_DA_VAGA[vaga.status] ?? vaga.status.toLowerCase());
          return (
            <li key={vaga.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-fio py-2.5 last:border-b-0">
              <span className="min-w-0 text-sm font-medium leading-5 text-tinta">
                <strong className="font-bold tabular-nums">
                  {diaPorExtenso(vaga.inicio)}, {horaEmBrasilia(vaga.inicio)}
                </strong>
                {vaga.profissional ? ` · ${vaga.profissional}` : ""}
                {vaga.motivo === "TESTE" ? (
                  <Etiqueta className="ml-2">teste</Etiqueta>
                ) : null}
                <Etiqueta tom={vaga.status === "PREENCHIDA" ? "atencao" : vaga.status === "ABERTA" ? "musgo" : "neutro"} className="ml-2">
                  {vaga.status === "PREENCHIDA" ? "marcar no iClinic" : vaga.status === "ABERTA" ? "aberta" : "fechada"}
                </Etiqueta>
                <span className="block text-[13px] font-medium text-tinta-2">{detalhe}</span>
              </span>
              {podeEditar && vaga.status === "ABERTA" ? (
                <Botao tamanho="pq" variante="fantasma" onClick={() => aoEncerrar(vaga.id)}>
                  Encerrar vaga
                </Botao>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
