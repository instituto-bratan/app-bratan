// O PAINEL DO WHATSAPP (27/10/2026, frente Atendimento digital).
//
// Mora dentro de Ajustes → Integrações, na linha do WhatsApp oficial: é onde o
// Lucas liga e testa (docs/whatsapp/como-ligar.md). Mostra a situação em frase
// (desligado · modo teste com N números · ligado para todos), a lista de
// números que podem receber no modo teste, o número público dos links do
// Marketing, o "Mandar teste", os botões de rodar agora e as últimas mensagens.
//
// A trava do modo teste não depende desta tela: ela está na Edge Function e no
// banco. Aqui só quem gerencia acessos muda a config (o banco recusa o resto),
// e desligar o modo teste pede confirmação.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send } from "lucide-react";
import { Botao } from "@/components/ui/fundacao";
import { confirmar, toast } from "@/components/ui/avisos";
import { BOTAO_TEXTO, CAMPO, Detalhes, Etiqueta, RUBRICA, Recado } from "@/features/admin/pecasAjustes";
import {
  avancarEncaixeAgora,
  criarVagaDeTesteDoEncaixe,
  lerEstadoDoWhatsapp,
  listarMensagensDoWhatsapp,
  mandarConfirmacoesAgora,
  mandarTesteDoWhatsapp,
  salvarNaConfigDoWhatsapp,
} from "@/lib/remote/atendimento";
import { cn } from "@/lib/utils";
import {
  MODELOS,
  NOMES_DOS_MODELOS,
  chaveDoTelefone,
  fraseDoModoTeste,
  mascararTelefone,
  telefoneBR,
  telefoneValido,
  type NomeModelo,
} from "../../../supabase/functions/_shared/whatsappRegras";

/** "(11) 99999-0000" — só para os números da equipe na lista do modo teste. */
function telefoneLegivel(valor: string) {
  const t = telefoneBR(valor);
  if (!t) return valor;
  const local = t.slice(4);
  return `(${t.slice(2, 4)}) ${local.slice(0, local.length - 4)}-${local.slice(-4)}`;
}

function quando(iso: string) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(11, 16)}` : "";
}

export function PainelDoWhatsapp({ ligada, podeEditar, pessoaId, onMudou }: { ligada: boolean; podeEditar: boolean; pessoaId: string | null; onMudou: () => Promise<void> }) {
  const queryClient = useQueryClient();
  const estadoQuery = useQuery({ queryKey: ["whatsapp-estado"], queryFn: lerEstadoDoWhatsapp, staleTime: 30_000 });
  const mensagensQuery = useQuery({ queryKey: ["whatsapp-mensagens"], queryFn: () => listarMensagensDoWhatsapp(15), staleTime: 30_000 });
  const [novoNumero, setNovoNumero] = useState("");
  const [numeroPublico, setNumeroPublico] = useState<string | null>(null);
  const [modeloDoTeste, setModeloDoTeste] = useState<NomeModelo>("confirmacao_consulta");
  const [numeroDoTeste, setNumeroDoTeste] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const config = estadoQuery.data?.config;
  if (estadoQuery.isError) return <Recado tom="atencao">Não consegui ler a configuração do WhatsApp agora.</Recado>;
  if (!config) return null;
  const permitidos = config.telefonesPermitidos.filter(telefoneValido);
  const publico = numeroPublico ?? (config.numeroPublico ? telefoneLegivel(config.numeroPublico) : "");
  const situacao = !ligada ? { tom: "neutro" as const, rotulo: "desligado" } : config.modoTeste ? { tom: "atencao" as const, rotulo: "modo teste" } : { tom: "ok" as const, rotulo: "ligado para todos" };

  async function recarregar() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["whatsapp-estado"] }), queryClient.invalidateQueries({ queryKey: ["whatsapp-mensagens"] })]);
    await onMudou();
  }

  async function salvar(mudanca: Parameters<typeof salvarNaConfigDoWhatsapp>[0], recado: string) {
    setOcupado(true);
    try {
      await salvarNaConfigDoWhatsapp(mudanca, pessoaId);
      toast(recado, { tom: "ok" });
      await recarregar();
      return true;
    } catch (error) {
      toast(`Não consegui salvar: ${error instanceof Error ? error.message : String(error)}`, { tom: "erro" });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function alternarModoTeste() {
    if (!config) return;
    if (config.modoTeste) {
      const ok = await confirmar("Desligar o modo teste?", {
        corpo:
          "A partir daqui as mensagens saem para os pacientes de verdade: a confirmação na véspera, o lembrete e a oferta de encaixe. Para voltar atrás, é só ligar o modo teste de novo.",
        confirmar: "Desligar o modo teste",
        destrutivo: true,
      });
      if (!ok) return;
      await salvar({ modoTeste: false }, "Modo teste desligado: as mensagens saem para todos.");
      return;
    }
    await salvar({ modoTeste: true }, "Modo teste ligado: só sai para os números da lista.");
  }

  async function adicionarNumero() {
    if (!config) return;
    if (!telefoneValido(novoNumero)) {
      toast("Número inválido. Use DDD e número, por exemplo (11) 99999-0000.", { tom: "atencao" });
      return;
    }
    if (permitidos.some((numero) => chaveDoTelefone(numero) === chaveDoTelefone(novoNumero))) {
      toast("Esse número já está na lista.", { tom: "info" });
      return;
    }
    if (await salvar({ telefonesPermitidos: [...permitidos, telefoneBR(novoNumero)] }, "Número na lista do modo teste.")) setNovoNumero("");
  }

  async function rodar(acao: "teste" | "confirmacoes" | "encaixe" | "vaga-de-teste") {
    setOcupado(true);
    try {
      if (acao === "teste") {
        const r = await mandarTesteDoWhatsapp(numeroDoTeste || permitidos[0] || "", modeloDoTeste);
        if (r.ok) toast("Teste enviado. Toque num botão da mensagem para conferir a volta.", { tom: "ok", duracaoMs: 6000 });
        else toast(r.error ?? "O teste não saiu.", { tom: "erro", duracaoMs: 8000 });
      } else if (acao === "confirmacoes") {
        const r = await mandarConfirmacoesAgora();
        if (!r.ok) toast(r.error ?? "Não deu certo.", { tom: "erro", duracaoMs: 8000 });
        else if (r.pausada) toast("A confirmação está pausada na configuração.", { tom: "atencao" });
        else
          toast(
            `${r.enviados ?? 0} de ${r.devidos ?? 0} confirmação(ões) devida(s) agora enviada(s)${r.foraDoModoTeste ? ` · ${r.foraDoModoTeste} fora da lista do modo teste` : ""}${r.semTelefone ? ` · ${r.semTelefone} sem telefone na ficha` : ""}.`,
            { tom: "ok", duracaoMs: 7000 },
          );
      } else {
        const r = acao === "encaixe" ? await avancarEncaixeAgora() : await criarVagaDeTesteDoEncaixe();
        if (!r.ok) toast(r.error ?? "Não deu certo.", { tom: "erro", duracaoMs: 8000 });
        else toast(`${r.ofertasEnviadas ?? 0} oferta(s) de encaixe enviada(s)${r.semCandidato ? ` · ${r.semCandidato} vaga(s) sem ninguém da lista que sirva` : ""}.`, { tom: "ok", duracaoMs: 7000 });
      }
      await recarregar();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section aria-labelledby="whatsapp-atendimento" className="grid gap-4 border-t border-fio pt-4 font-sans">
      <div className="flex flex-wrap items-center gap-2">
        <h4 id="whatsapp-atendimento" className="flex items-center gap-2 text-sm font-bold leading-5 text-tinta">
          <MessageCircle className="h-4 w-4 stroke-oliva" aria-hidden="true" />
          Atendimento pelo WhatsApp
        </h4>
        <Etiqueta tom={situacao.tom}>{situacao.rotulo}</Etiqueta>
      </div>
      <p className="text-sm font-medium leading-[22px] text-tinta">
        {fraseDoModoTeste(ligada, config)} O passo a passo para ligar está em <code className="font-mono text-[13px]">docs/whatsapp/como-ligar.md</code>.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          <p className={RUBRICA}>Modo teste</p>
          <p className="text-[13px] font-medium leading-5 text-tinta-2">
            {config.modoTeste
              ? "Ligado: a confirmação, o lembrete e a oferta de encaixe só saem para os números abaixo. Os outros nem são tentados."
              : "Desligado: as mensagens saem para os pacientes."}
          </p>
          {podeEditar ? (
            <Botao variante={config.modoTeste ? "perigo" : "secundario"} tamanho="pq" className="w-fit max-md:h-10" disabled={ocupado} onClick={() => void alternarModoTeste()}>
              {config.modoTeste ? "Desligar o modo teste" : "Ligar o modo teste"}
            </Botao>
          ) : null}

          <p className={cn(RUBRICA, "mt-3")}>Números que podem receber no modo teste</p>
          {permitidos.length ? (
            <ul className="grid gap-1">
              {permitidos.map((numero) => (
                <li key={numero} className="flex flex-wrap items-center gap-3 text-sm font-medium tabular-nums text-tinta">
                  {telefoneLegivel(numero)}
                  {podeEditar ? (
                    <button
                      type="button"
                      className={BOTAO_TEXTO}
                      disabled={ocupado}
                      onClick={() => void salvar({ telefonesPermitidos: permitidos.filter((item) => item !== numero) }, "Número tirado da lista.")}
                    >
                      Tirar
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] font-medium leading-5 text-tinta-2">Nenhum número na lista: nada sai enquanto o modo teste estiver ligado.</p>
          )}
          {podeEditar ? (
            <div className="flex flex-wrap gap-2">
              <input
                value={novoNumero}
                onChange={(event) => setNovoNumero(event.target.value)}
                placeholder="(11) 99999-0000"
                aria-label="Número para a lista do modo teste"
                inputMode="tel"
                className={cn(CAMPO, "w-48 tabular-nums")}
              />
              <Botao variante="secundario" disabled={ocupado || !novoNumero.trim()} onClick={() => void adicionarNumero()}>
                Pôr na lista
              </Botao>
            </div>
          ) : null}
        </div>

        <div className="grid content-start gap-2">
          <p className={RUBRICA}>Número do WhatsApp do Instituto</p>
          <p className="text-[13px] font-medium leading-5 text-tinta-2">É para onde apontam os links com código da tela de Marketing (bio do Instagram, story, Google, QR da recepção).</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={publico}
              onChange={(event) => setNumeroPublico(event.target.value)}
              placeholder="(11) 99999-0000"
              aria-label="Número do WhatsApp do Instituto"
              inputMode="tel"
              disabled={!podeEditar}
              className={cn(CAMPO, "w-48 tabular-nums")}
            />
            {podeEditar ? (
              <Botao
                variante="secundario"
                disabled={ocupado || numeroPublico === null}
                onClick={() => {
                  if (!telefoneValido(publico)) {
                    toast("Número inválido. Use DDD e número.", { tom: "atencao" });
                    return;
                  }
                  void salvar({ numeroPublico: telefoneBR(publico) }, "Número do Instituto salvo. Os links do Marketing já usam ele.").then((ok) => ok && setNumeroPublico(null));
                }}
              >
                Salvar
              </Botao>
            ) : null}
          </div>

          {ligada ? (
            <>
              <p className={cn(RUBRICA, "mt-3")}>Mandar teste</p>
              {permitidos.length ? (
                <div className="flex flex-wrap gap-2">
                  <select value={modeloDoTeste} onChange={(event) => setModeloDoTeste(event.target.value as NomeModelo)} aria-label="Modelo do teste" className={cn(CAMPO, "w-56 cursor-pointer")}>
                    {NOMES_DOS_MODELOS.map((nome) => (
                      <option key={nome} value={nome}>
                        {MODELOS[nome].titulo}
                      </option>
                    ))}
                  </select>
                  <select value={numeroDoTeste || permitidos[0]} onChange={(event) => setNumeroDoTeste(event.target.value)} aria-label="Número do teste" className={cn(CAMPO, "w-48 cursor-pointer tabular-nums")}>
                    {permitidos.map((numero) => (
                      <option key={numero} value={numero}>
                        {telefoneLegivel(numero)}
                      </option>
                    ))}
                  </select>
                  <Botao variante="secundario" disabled={ocupado} icone={<Send className="h-4 w-4" aria-hidden="true" />} onClick={() => void rodar("teste")}>
                    Mandar teste
                  </Botao>
                </div>
              ) : (
                <p className="text-[13px] font-medium leading-5 text-tinta-2">Ponha o seu número na lista do modo teste para mandar um teste.</p>
              )}
              <p className={cn(RUBRICA, "mt-3")}>Rodar agora</p>
              <div className="flex flex-wrap gap-2">
                <Botao variante="secundario" tamanho="pq" className="max-md:h-10" disabled={ocupado} onClick={() => void rodar("confirmacoes")}>
                  Mandar as confirmações devidas agora
                </Botao>
                <Botao variante="secundario" tamanho="pq" className="max-md:h-10" disabled={ocupado} onClick={() => void rodar("encaixe")}>
                  Avançar as ofertas de encaixe agora
                </Botao>
                {config.modoTeste ? (
                  <Botao variante="secundario" tamanho="pq" className="max-md:h-10" disabled={ocupado} onClick={() => void rodar("vaga-de-teste")}>
                    Criar vaga de teste
                  </Botao>
                ) : null}
              </div>
            </>
          ) : (
            <p className="mt-3 text-[13px] font-medium leading-5 text-tinta-2">Ligue a integração (botão acima) para mandar teste e rodar a confirmação e o encaixe.</p>
          )}
        </div>
      </div>

      <Detalhes resumo={`Últimas mensagens${mensagensQuery.data?.length ? ` (${mensagensQuery.data.length})` : ""}`}>
        {mensagensQuery.isError ? (
          <p>Não consegui ler as mensagens.</p>
        ) : mensagensQuery.data?.length ? (
          <ul className="grid gap-1">
            {mensagensQuery.data.map((mensagem) => (
              <li key={mensagem.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium leading-5">
                <span className="tabular-nums text-tinta-2">{quando(mensagem.criadoEm)}</span>
                <Etiqueta>{mensagem.direcao === "SAIDA" ? "saiu" : "chegou"}</Etiqueta>
                <span className="tabular-nums text-tinta">{mascararTelefone(mensagem.telefone)}</span>
                <span className={cn("font-bold", mensagem.status === "ERRO" ? "text-erro" : "text-tinta")}>{mensagem.status.toLowerCase()}</span>
                <span className="min-w-0 text-tinta [overflow-wrap:anywhere]">{mensagem.corpo}</span>
                {mensagem.erro ? <span className="min-w-0 text-erro [overflow-wrap:anywhere]">{mensagem.erro}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>Nenhuma mensagem ainda.</p>
        )}
      </Detalhes>
    </section>
  );
}
