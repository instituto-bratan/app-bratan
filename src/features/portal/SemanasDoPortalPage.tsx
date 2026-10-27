// SEMANAS DO MEU BRATAN (27/10/2026) — Pacientes › Acompanhamento › Semanas do portal.
//
// O texto que o paciente lê no cartão "Semana X de N" do portal: o que costuma
// acontecer naquela semana do plano e uma missão simples. Coordenação e
// enfermagem escrevem aqui (podeEditarSemanasDoPortal; no banco,
// pode_editar_semana_do_portal). Tom educativo, sem promessa de resultado e sem
// nome de remédio (Res. CFM 2.336/2023): a tela não salva texto com remédio ou
// dose e avisa quando o texto parece promessa.
//
// A migração trouxe 4 semanas de EXEMPLO. O texto real é da equipe.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Plus } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, Botao, Cabecalho } from "@/components/ui/fundacao";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { podeEditarSemanasDoPortal } from "@/lib/acessoDoPortal";
import { listRemoteSemanasDoPortal, salvarRemoteSemanaDoPortal, type ConteudoDaSemanaRegistro } from "@/lib/remote/semanasDoPortal";
import { LIMITES_DO_CONTEUDO, SEMANAS_DE_EXEMPLO, SEMANA_MAXIMA, problemasDoTexto, validarConteudoDaSemana, type ConteudoDaSemana } from "../../../supabase/functions/_shared/semanaDoPaciente";
import { CabecaDaFolha, Campo, CampoArea, CampoTexto, Etiqueta, Recado, TituloComDica } from "@/features/admin/pecasAjustes";

function SemanaLinha({ conteudo, aoSalvar, comecaEditando = false, aoCancelarNova }: { conteudo: ConteudoDaSemana; aoSalvar: (c: ConteudoDaSemana) => Promise<void>; comecaEditando?: boolean; aoCancelarNova?: () => void }) {
  const [editando, setEditando] = useState(comecaEditando);
  const [rascunho, setRascunho] = useState(conteudo);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!editando) setRascunho(conteudo);
  }, [conteudo, editando]);

  const erros = validarConteudoDaSemana(rascunho);
  const avisos = [...new Set([rascunho.titulo, rascunho.costumaAcontecer, rascunho.missao].flatMap((texto) => problemasDoTexto(texto).avisa))];

  async function salvar(proximo: ConteudoDaSemana) {
    const travas = validarConteudoDaSemana(proximo);
    if (travas.length) return toast(travas[0], { tom: "atencao", duracaoMs: 7000 });
    setSalvando(true);
    try {
      await aoSalvar(proximo);
      setEditando(false);
    } catch {
      /* o aviso do erro já saiu; o rascunho fica na tela para tentar de novo */
    } finally {
      setSalvando(false);
    }
  }

  return (
    <li className="grid gap-4 border-t border-fio px-6 py-5 max-md:px-4 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
      <div className="min-w-0">
        <h3 className="text-base font-bold leading-6 text-tinta">Semana {conteudo.semana}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{conteudo.ativo ? <Etiqueta tom="ok">no portal</Etiqueta> : <Etiqueta tom="atencao">fora do portal</Etiqueta>}</div>
      </div>
      <div className="grid min-w-0 gap-3 text-sm">
        {editando ? (
          <>
            <Campo id={`titulo-${conteudo.semana}`} rotulo="Título" ajuda={`${rascunho.titulo.length}/${LIMITES_DO_CONTEUDO.titulo}`}>
              <CampoTexto id={`titulo-${conteudo.semana}`} value={rascunho.titulo} maxLength={LIMITES_DO_CONTEUDO.titulo} onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })} placeholder="Ex.: Segunda semana: criando a rotina" />
            </Campo>
            <Campo id={`costuma-${conteudo.semana}`} rotulo="O que costuma acontecer nesta semana" ajuda={`${rascunho.costumaAcontecer.length}/${LIMITES_DO_CONTEUDO.costumaAcontecer} · educativo: "é comum", "muita gente percebe" — nunca "você vai"`}>
              <CampoArea id={`costuma-${conteudo.semana}`} rows={3} value={rascunho.costumaAcontecer} maxLength={LIMITES_DO_CONTEUDO.costumaAcontecer} onChange={(e) => setRascunho({ ...rascunho, costumaAcontecer: e.target.value })} />
            </Campo>
            <Campo id={`missao-${conteudo.semana}`} rotulo="Missão da semana" ajuda={`${rascunho.missao.length}/${LIMITES_DO_CONTEUDO.missao} · uma coisa simples, que caiba em qualquer rotina`}>
              <CampoArea id={`missao-${conteudo.semana}`} rows={2} value={rascunho.missao} maxLength={LIMITES_DO_CONTEUDO.missao} onChange={(e) => setRascunho({ ...rascunho, missao: e.target.value })} />
            </Campo>
            {erros.length ? (
              <Recado tom="erro">
                {erros.map((erro) => (
                  <p key={erro}>{erro}</p>
                ))}
              </Recado>
            ) : null}
            {avisos.length ? (
              <Recado tom="atencao">
                {avisos.map((aviso) => (
                  <p key={aviso}>{aviso}</p>
                ))}
              </Recado>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Botao variante="primario" carregando={salvando} disabled={erros.length > 0} onClick={() => void salvar(rascunho)}>
                {salvando ? "Salvando…" : "Salvar"}
              </Botao>
              <Botao
                variante="fantasma"
                onClick={() => {
                  setRascunho(conteudo);
                  setEditando(false);
                  aoCancelarNova?.();
                }}
              >
                Cancelar
              </Botao>
            </div>
          </>
        ) : (
          <>
            <p className="text-[15px] font-bold leading-6 text-tinta">{conteudo.titulo || "Sem título"}</p>
            {conteudo.costumaAcontecer ? <p className="whitespace-pre-wrap font-medium leading-[22px] text-tinta">{conteudo.costumaAcontecer}</p> : null}
            {conteudo.missao ? (
              <p className="font-medium leading-[22px] text-tinta-2">
                <strong className="text-tinta">Missão:</strong> {conteudo.missao}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Botao tamanho="pq" variante="secundario" onClick={() => setEditando(true)}>
                Editar
              </Botao>
              <Botao tamanho="pq" variante={conteudo.ativo ? "perigo" : "suave"} carregando={salvando} onClick={() => void salvar({ ...conteudo, ativo: !conteudo.ativo })}>
                {conteudo.ativo ? "Tirar do portal" : "Pôr no portal"}
              </Botao>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

export function SemanasDoPortalPage() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const usaRemoto = Boolean(pessoa && session && !isPreview);
  const semanasQuery = useQuery({ queryKey: ["portal-semanas"], queryFn: listRemoteSemanasDoPortal, staleTime: 30_000, enabled: usaRemoto });
  // Na prévia (sem banco), a tela mostra os exemplos e não salva.
  const semanas: ConteudoDaSemanaRegistro[] = usaRemoto ? semanasQuery.data ?? [] : SEMANAS_DE_EXEMPLO.map((s) => ({ ...s, atualizadoEm: null }));
  const [nova, setNova] = useState<ConteudoDaSemana | null>(null);
  const noPortal = semanas.filter((s) => s.ativo).length;
  const proxima = Math.min(SEMANA_MAXIMA, (semanas.reduce((maior, s) => Math.max(maior, s.semana), 0) || 0) + 1);

  async function salvar(conteudo: ConteudoDaSemana) {
    if (!usaRemoto) {
      // Prévia: dá para experimentar o editor (e ver as travas), mas nada vai ao banco.
      toast("Na prévia nada é salvo.", { tom: "info" });
      throw new Error("prévia");
    }
    try {
      await salvarRemoteSemanaDoPortal(conteudo);
      toast(`Semana ${conteudo.semana} salva. ${conteudo.ativo ? "Quem está nessa semana do plano já lê no portal." : "Ela ficou fora do portal."}`, { tom: "ok", duracaoMs: 6000 });
      setNova(null);
      await queryClient.invalidateQueries({ queryKey: ["portal-semanas"] });
    } catch (falha) {
      toast(`Não consegui salvar: ${falha instanceof Error ? falha.message : String(falha)}`, { tom: "erro", duracaoMs: 7000 });
      throw falha;
    }
  }

  return (
    <AccessGate allowed={podeEditarSemanasDoPortal} label="Pacientes · Semanas do Meu Bratan">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Pacientes · Acompanhamento"
          titulo={
            <TituloComDica
              texto="Semanas do Meu Bratan"
              tituloDaDica="O cartão de cada semana do plano"
              dica={
                <>
                  Toda semana o portal mostra ao paciente o texto da semana em que ele está (contada do fechamento do plano), uma missão simples e o
                  check-in de fome, energia e enjoo. Resposta vermelha vira tarefa para a enfermagem ligar no mesmo dia. Sem texto para a semana, o
                  paciente vê só o check-in.
                </>
              }
            />
          }
          frase={
            <>
              <strong>
                {noPortal} {noPortal === 1 ? "semana" : "semanas"}
              </strong>{" "}
              no portal. O paciente lê a da semana em que está, junto com o check-in de 1 toque.
            </>
          }
        />
        <Recado tom="info">
          <strong>Educativo, sem promessa e sem remédio.</strong> Escreva o que costuma acontecer ("é comum…", "muita gente percebe…"), nunca o que vai
          acontecer, e deixe remédio e dose para a consulta (Res. CFM 2.336/2023). As 4 primeiras semanas vieram como exemplo: reescreva com a voz da equipe.
        </Recado>
        {usaRemoto && semanasQuery.isError ? <Recado tom="erro">Não consegui carregar as semanas agora. Se a tabela ainda não existe no banco, a migração 202610280402 precisa ser aplicada.</Recado> : null}
        {!usaRemoto ? <Recado tom="atencao">Prévia: estes são os textos de exemplo. Dá para experimentar o editor, mas nada é salvo.</Recado> : null}
        <BlocoFolha as="section" aria-labelledby="semanas-do-portal" className="min-w-0 overflow-hidden">
          <CabecaDaFolha
            id="semanas-do-portal"
            icone={<CalendarRange />}
            titulo="Uma semana por linha"
            resumo={`${semanas.length} ${semanas.length === 1 ? "escrita" : "escritas"}`}
            acoes={
              !nova && proxima <= SEMANA_MAXIMA ? (
                <Botao tamanho="pq" variante="suave" icone={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => setNova({ semana: proxima, titulo: "", costumaAcontecer: "", missao: "", ativo: true })}>
                  Escrever a semana {proxima}
                </Botao>
              ) : null
            }
          />
          {usaRemoto && semanasQuery.isLoading ? (
            <p role="status" className="border-t border-fio px-6 py-6 text-sm font-semibold text-tinta-2 max-md:px-4">
              Carregando…
            </p>
          ) : null}
          <ul>
            {semanas.map((conteudo) => (
              <SemanaLinha key={conteudo.semana} conteudo={conteudo} aoSalvar={salvar} />
            ))}
            {nova ? <SemanaLinha key={`nova-${nova.semana}`} conteudo={nova} aoSalvar={salvar} comecaEditando aoCancelarNova={() => setNova(null)} /> : null}
          </ul>
        </BlocoFolha>
      </div>
    </AccessGate>
  );
}
