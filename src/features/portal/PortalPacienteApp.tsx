// MEU BRATAN — o portal do paciente (15/09/2026, proposta 3.7, primeira etapa).
//
// Uma página só, no celular, com o que o paciente quer saber: a próxima
// consulta, a curva, a trilha do plano, o que fechou e pagou, os documentos, e
// um lugar para mandar a pesagem da semana. Entra por link mágico; não tem
// senha. Tudo vem da função portal-paciente, nunca direto do banco.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { Avisos, toast } from "@/components/ui/avisos";
import { todayISO } from "@/lib/localStore";
import { buildMilestones } from "@/features/programa/programaData";
import type { CrmDeal } from "@/features/crm/crmData";
import bratanMark from "@/assets/bratan-mark.png";
import "./portal.css";
import { CurvaEvolucao } from "./CurvaEvolucao";
import { dadosDemo } from "./portalDemo";
import { SESSAO_DEMO, ambienteSemSupabase, carregarDados, emPrevia, entrarComToken, enviarPesagem, guardarSessao, lerSessao, responderConsulta, sairDoPortal } from "./portalCliente";
import { brl, brlCentavos, diaCurto, diaMes, nomeDoPlano, proximaConsulta, resumoEvolucao, resumoFinanceiro, saudacao, trilhaDoPlano, type MarcoDoPlano, type PortalDados } from "./portalPaciente";

const METODO: Record<string, string> = { PIX: "Pix", DINHEIRO: "dinheiro", CARTAO_DEBITO: "débito", CARTAO_CREDITO: "crédito", BOLETO: "boleto", TRANSFERENCIA: "transferência" };
const CONSENT_LABEL: Record<string, string> = { LGPD: "uso dos seus dados para o atendimento", TRATAMENTO: "termo do tratamento", IA: "apoio de inteligência artificial", IMAGEM: "uso de imagem", MARKETING: "mensagens e novidades" };

/** Marca o navegador como "Meu Bratan" enquanto o portal está aberto (ícone, cor, manifesto próprio). */
function useIdentidadeDoPortal() {
  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const tema = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const antes = { manifest: manifest?.href ?? "", tema: tema?.content ?? "", titulo: document.title };
    if (manifest) manifest.href = "/meu.webmanifest";
    if (tema) tema.content = "#3E4632";
    document.title = "Meu Bratan";
    return () => {
      if (manifest) manifest.href = antes.manifest;
      if (tema) tema.content = antes.tema;
      document.title = antes.titulo;
    };
  }, []);
}

function Topo({ nome }: { nome?: string }) {
  return (
    <div className="p-topo">
      <div className="p-marca">
        <img src={bratanMark} alt="" />
        <span>Meu Bratan</span>
      </div>
      {nome ? <span className="p-muted">{nome}</span> : null}
    </div>
  );
}

// ---- Entrar pelo link -----------------------------------------------------------
function EntrarPage() {
  useIdentidadeDoPortal();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [erro, setErro] = useState("");
  const token = params.get("t") ?? "";
  const demo = params.get("demo") === "1";
  useEffect(() => {
    let vivo = true;
    (async () => {
      // Demonstração com dados de exemplo (sem paciente real): ambiente dev:demo ou ?demo=1.
      if (ambienteSemSupabase || demo) {
        guardarSessao(SESSAO_DEMO);
        navigate("/meu", { replace: true });
        return;
      }
      if (!token) {
        setErro("Este link está incompleto. Peça um novo para a recepção.");
        return;
      }
      const r = await entrarComToken(token);
      if (!vivo) return;
      if (!r.ok || !r.sessao) {
        setErro(r.error ?? "Não consegui abrir o seu portal.");
        return;
      }
      guardarSessao(r.sessao);
      navigate("/meu", { replace: true });
    })();
    return () => {
      vivo = false;
    };
  }, [token, demo, navigate]);
  return (
    <div className="portal">
      <div className="p-entrar">
        <div className="p-card p-anim">
          <img src={bratanMark} alt="" style={{ width: 56, height: 56, borderRadius: 14 }} />
          <h1>{erro ? "Não deu para entrar" : "Abrindo o seu espaço…"}</h1>
          <p className="p-frase">{erro || "Um instante. Estamos preparando as suas informações."}</p>
          {erro ? <p className="p-muted">O link vale por uma semana e funciona no aparelho em que você abre. Se precisar, a recepção manda outro na hora.</p> : null}
        </div>
      </div>
    </div>
  );
}

// ---- Sem sessão -----------------------------------------------------------------
function SemSessao() {
  return (
    <div className="portal">
      <div className="p-entrar">
        <div className="p-card p-anim">
          <img src={bratanMark} alt="" style={{ width: 56, height: 56, borderRadius: 14 }} />
          <h1>Este é o seu espaço no Instituto Bratan</h1>
          <p className="p-frase">Aqui você vê a próxima consulta, a sua evolução, o seu plano e manda a pesagem da semana.</p>
          <p className="p-muted">Para entrar, abra o link que a recepção mandou no seu WhatsApp. Não tem senha para decorar.</p>
          {ambienteSemSupabase ? (
            <Link to="/meu/entrar" className="p-btn" style={{ textDecoration: "none" }}>
              Ver com dados de exemplo
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---- A página -------------------------------------------------------------------
function MeuPortal() {
  useIdentidadeDoPortal();
  const navigate = useNavigate();
  const hoje = todayISO();
  const [sessao] = useState(() => lerSessao());
  const previa = emPrevia(sessao);
  const [dados, setDados] = useState<PortalDados | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [peso, setPeso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [respondendo, setRespondendo] = useState(false);

  const recarregar = useCallback(async () => {
    if (!sessao) return;
    if (previa) {
      setDados(dadosDemo(hoje));
      setCarregando(false);
      return;
    }
    const r = await carregarDados(sessao);
    if (!r.ok || !r.dados) {
      if (r.sessaoInvalida) guardarSessao(null);
      setErro(r.error ?? "Não consegui carregar.");
      setCarregando(false);
      return;
    }
    setDados(r.dados);
    setErro("");
    setCarregando(false);
  }, [sessao, hoje, previa]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const marcos: MarcoDoPlano[] = useMemo(() => {
    if (!dados?.plano) return [];
    const deal = { id: dados.plano.dealId, closedAt: dados.plano.closedAt, programPhaseEnteredAt: dados.plano.programPhaseEnteredAt ?? undefined, updatedAt: dados.plano.updatedAt, createdAt: dados.plano.createdAt, programMilestonesDone: dados.plano.marcosFeitos } as unknown as CrmDeal;
    return buildMilestones(deal, hoje).map((m) => ({ key: m.key, type: m.type, n: m.n, total: m.total, label: m.label, expectedDate: m.expectedDate, done: m.done, overdue: m.overdue }));
  }, [dados, hoje]);

  if (!sessao) return <SemSessao />;
  const proxima = dados ? proximaConsulta(dados.consultas, marcos, hoje) : null;
  const evolucao = dados ? resumoEvolucao(dados.medicoes, hoje) : null;
  const financeiro = dados ? resumoFinanceiro(dados.comandas, dados.parcelasAbertas, hoje) : null;
  const trilha = dados?.plano ? trilhaDoPlano(marcos, dados.plano.inicio, hoje) : null;
  const ultimaPesagemPropria = dados?.medicoes.filter((m) => m.origem === "PACIENTE").sort((a, b) => b.dia.localeCompare(a.dia))[0] ?? null;

  async function mandarPesagem() {
    const valor = Number(peso.replace(",", "."));
    if (!(valor >= 30 && valor <= 300)) return toast("Confira o peso: em quilos, com vírgula (ex.: 82,4).", { tom: "atencao" });
    setEnviando(true);
    try {
      if (previa) {
        setDados((atual) => (atual ? { ...atual, medicoes: [...atual.medicoes, { id: `demo-${Date.now()}`, dia: hoje, pesoKg: valor, gorduraPct: null, massaMagraKg: null, cinturaCm: null, origem: "PACIENTE" }] } : atual));
        setPeso("");
        toast("Pesagem guardada (exemplo).", { tom: "ok" });
        return;
      }
      const r = await enviarPesagem(sessao!, valor);
      if (!r.ok) return toast(r.error ?? "Não consegui guardar.", { tom: "erro" });
      setPeso("");
      toast(r.atualizou ? "Pesagem de hoje atualizada. Obrigado!" : "Pesagem guardada. A enfermagem acompanha por aqui.", { tom: "ok" });
      await recarregar();
    } finally {
      setEnviando(false);
    }
  }

  async function responder(resposta: "CONFIRMO" | "REMARCAR") {
    if (!proxima?.id || proxima.origem === "PREVISTA") return;
    setRespondendo(true);
    try {
      if (previa) {
        setDados((atual) => (atual ? { ...atual, consultas: atual.consultas.map((c) => (c.id === proxima.id ? { ...c, status: resposta === "CONFIRMO" ? "CONFIRMADA" : "REMARCAR" } : c)) } : atual));
        toast(resposta === "CONFIRMO" ? "Consulta confirmada (exemplo)." : "Pedido de remarcação enviado (exemplo).", { tom: "ok" });
        return;
      }
      const r = await responderConsulta(sessao!, proxima.id, proxima.origem, resposta);
      if (!r.ok) return toast(r.error ?? "Não consegui registrar.", { tom: "erro" });
      toast(resposta === "CONFIRMO" ? "Consulta confirmada. Até lá!" : "Avisamos a recepção. Ela vai te chamar para combinar outro horário.", { tom: "ok", duracaoMs: 6000 });
      await recarregar();
    } finally {
      setRespondendo(false);
    }
  }

  async function sair() {
    if (!previa && sessao) await sairDoPortal(sessao).catch(() => undefined);
    guardarSessao(null);
    navigate("/meu", { replace: true });
    window.location.reload();
  }

  return (
    <div className="portal">
      <Avisos />
      {previa ? <span className="p-demo">dados de exemplo</span> : null}
      <div className="p-wrap">
        <nav className="p-nav" aria-label="Seções">
          <a href="#consulta">Consulta</a>
          <a href="#evolucao">Evolução</a>
          <a href="#plano">Meu plano</a>
          <a href="#pesagem">Pesagem</a>
          <a href="#documentos">Documentos</a>
        </nav>
        <Topo nome={dados?.paciente.nome} />

        {carregando ? (
          <div className="p-card p-anim">
            <p className="p-frase">Preparando as suas informações…</p>
          </div>
        ) : erro ? (
          <div className="p-card p-anim">
            <h2>Não consegui carregar</h2>
            <p className="p-frase">{erro}</p>
            <div className="p-botoes">
              <button type="button" className="p-btn" onClick={() => void recarregar()}>
                Tentar de novo
              </button>
              <button type="button" className="p-btn sec" onClick={() => void sair()}>
                Sair
              </button>
            </div>
          </div>
        ) : dados ? (
          <>
            <header className="p-anim" style={{ display: "grid", gap: 4, padding: "6px 4px 2px" }}>
              <h1>{saudacao(dados.paciente.primeiroNome)}</h1>
              <p className="p-frase">{trilha ? trilha.frase : "Aqui está o seu espaço no Instituto."}</p>
            </header>

            {/* ---- Próxima consulta ---- */}
            <section id="consulta" className="p-hero p-anim" aria-labelledby="t-consulta">
              <span className="p-eyebrow" id="t-consulta">Sua próxima consulta</span>
              {proxima ? (
                <>
                  <h2>{proxima.titulo}{proxima.hora ? <span className="p-serif-i"> · {proxima.hora}</span> : null}</h2>
                  <p className="p-quando">{proxima.quando}</p>
                  <p className="p-sub">
                    {proxima.tipo} com {proxima.profissional} · {proxima.local}
                    {proxima.origem === "PREVISTA" ? " · previsão pelo seu plano; a recepção confirma o dia e a hora" : null}
                  </p>
                  {proxima.status === "CONFIRMADA" ? <span className="p-pill ok">✓ você confirmou</span> : proxima.status === "REMARCAR" ? <span className="p-pill atencao">a recepção vai te chamar para remarcar</span> : null}
                  {proxima.podeResponder ? (
                    <div className="p-botoes">
                      <button type="button" className="p-btn" disabled={respondendo} onClick={() => void responder("CONFIRMO")}>
                        Confirmo, estarei lá
                      </button>
                      <button type="button" className="p-btn sec" disabled={respondendo} onClick={() => void responder("REMARCAR")}>
                        Preciso remarcar
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <h2>Sem consulta marcada</h2>
                  <p className="p-sub">Quando a recepção agendar, ela aparece aqui e você confirma com um toque.</p>
                </>
              )}
            </section>

            {/* ---- Evolução ---- */}
            <section id="evolucao" className="p-card p-anim" aria-labelledby="t-evolucao">
              <span className="p-eyebrow" id="t-evolucao">Sua evolução</span>
              {evolucao ? (
                <>
                  <div className="p-grid-2">
                    <div>
                      <p className="p-muted">no começo · {diaMes(evolucao.primeira.dia)}</p>
                      <p className="p-numero">{evolucao.primeira.pesoKg?.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}<small>kg</small></p>
                    </div>
                    <div>
                      <p className="p-muted">hoje · {diaMes(evolucao.ultima.dia)}</p>
                      <p className="p-numero">{evolucao.ultima.pesoKg?.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}<small>kg</small></p>
                    </div>
                  </div>
                  {evolucao.pontos.length > 1 ? <CurvaEvolucao resumo={evolucao} /> : null}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {evolucao.deltaPeso !== null && evolucao.pontos.length > 1 ? <span className={`p-pill ${evolucao.deltaPeso < 0 ? "ok" : ""}`}>{evolucao.deltaPeso > 0 ? "+" : ""}{evolucao.deltaPeso.toLocaleString("pt-BR")} kg</span> : null}
                    {evolucao.deltaGordura !== null ? <span className={`p-pill ${evolucao.deltaGordura < 0 ? "ok" : ""}`}>gordura {evolucao.deltaGordura > 0 ? "+" : ""}{evolucao.deltaGordura.toLocaleString("pt-BR")} pontos</span> : null}
                    {evolucao.deltaMassaMagra !== null ? <span className={`p-pill ${evolucao.deltaMassaMagra >= 0 ? "ok" : "atencao"}`}>massa magra {evolucao.deltaMassaMagra > 0 ? "+" : ""}{evolucao.deltaMassaMagra.toLocaleString("pt-BR")} kg</span> : null}
                    {evolucao.deltaCintura !== null ? <span className={`p-pill ${evolucao.deltaCintura < 0 ? "ok" : ""}`}>cintura {evolucao.deltaCintura > 0 ? "+" : ""}{evolucao.deltaCintura.toLocaleString("pt-BR")} cm</span> : null}
                  </div>
                  <p className="p-frase">{evolucao.frase}</p>
                  <p className="p-muted">Pontos cheios são as medições da enfermagem; vazados, as pesagens que você mandou.</p>
                </>
              ) : (
                <p className="p-frase">A sua curva começa na próxima bioimpedância com a enfermagem. Se quiser, já mande a pesagem desta semana logo abaixo.</p>
              )}
            </section>

            {/* ---- Trilha ---- */}
            {trilha && dados.plano ? (
              <section id="plano" className="p-card p-anim" aria-labelledby="t-trilha">
                <span className="p-eyebrow" id="t-trilha">{nomeDoPlano(dados.plano.canal)} · desde {diaMes(dados.plano.inicio)}</span>
                <h2>Mês {trilha.mesAtual} de 6</h2>
                <div className="p-trilha" role="list" aria-label="Os seis meses do plano">
                  {trilha.passos.map((p) => (
                    <div key={p.mes} className={`p-passo ${p.estado}`} role="listitem">
                      <i>{p.estado === "feito" ? "✓" : p.mes}</i>
                      <span>{p.estado === "agora" ? "agora" : `mês ${p.mes}`}</span>
                    </div>
                  ))}
                </div>
                <div>
                  {(trilha.passos.find((p) => p.estado === "agora") ?? trilha.passos[trilha.passos.length - 1]).marcos.map((m) => (
                    <div key={m.key} className={`p-marco ${m.done ? "feito" : m.overdue ? "atrasado" : ""}`}>
                      <i>{m.done ? "✓" : ""}</i>
                      <div>
                        <p style={{ fontWeight: 600 }}>{m.label}</p>
                        <p className="p-muted">{m.done ? "feito" : `previsto para ${diaMes(m.expectedDate)}`} · com {m.quem}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="p-muted">{trilha.feitos} de {trilha.total} passos concluídos.</p>
              </section>
            ) : null}

            {/* ---- Pesagem ---- */}
            <section id="pesagem" className="p-card quieto p-anim" aria-labelledby="t-pesagem">
              <span className="p-eyebrow" id="t-pesagem">Pesagem da semana</span>
              <h3>Quanto a balança marcou hoje?</h3>
              <form
                style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void mandarPesagem();
                }}
              >
                <input className="p-input" inputMode="decimal" placeholder="82,4" value={peso} onChange={(e) => setPeso(e.target.value)} aria-label="Peso em quilos" />
                <button type="submit" className="p-btn" disabled={enviando || !peso.trim()}>
                  {enviando ? "Enviando…" : "Enviar"}
                </button>
              </form>
              <p className="p-muted">{ultimaPesagemPropria ? `Sua última pesagem foi em ${diaCurto(ultimaPesagemPropria.dia)}: ${ultimaPesagemPropria.pesoKg?.toLocaleString("pt-BR")} kg. ` : ""}Uma vez por semana, no mesmo horário, de preferência de manhã. A enfermagem vê por aqui e entra em contato se precisar.</p>
            </section>

            {/* ---- Meu plano: o que fechou ---- */}
            {financeiro ? (
              <section className="p-card p-anim" aria-labelledby="t-fin">
                <span className="p-eyebrow" id="t-fin">O que você fechou</span>
                <p className="p-frase">{financeiro.frase}</p>
                {financeiro.contratado > 0 ? (
                  <div className="p-barra" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, Math.round((financeiro.pago / Math.max(financeiro.contratado, financeiro.pago + financeiro.emAberto)) * 100))}%` }} />
                  </div>
                ) : null}
                <ul className="p-lista">
                  {dados.comandas.map((c) => (
                    <li key={c.id} className="p-linha-item">
                      <div>
                        <p style={{ fontWeight: 600 }}>{c.itens.map((i) => i.descricao).join(" + ")}</p>
                        <p className="p-muted">
                          {diaCurto(c.dia)} · {c.pagamentos.map((p) => `${METODO[p.metodo] ?? p.metodo.toLowerCase()}${p.parcelas > 1 ? ` ${p.parcelas}x` : ""} ${brl(p.valor)}`).join(" · ") || "sem pagamento registrado"}
                        </p>
                      </div>
                      <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{brl(c.total)}</span>
                    </li>
                  ))}
                </ul>
                {financeiro.parcelas.length ? (
                  <div>
                    <p className="p-eyebrow" style={{ marginBottom: 6 }}>Parcelas a vencer</p>
                    <ul className="p-lista">
                      {financeiro.parcelas.map((p) => (
                        <li key={p.id} className="p-linha-item">
                          <span>
                            {diaCurto(p.prevista)}
                            {p.observacao ? <span className="p-muted"> · {p.observacao}</span> : null}
                          </span>
                          <span style={{ fontWeight: 600 }}>{brlCentavos(p.valor)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* ---- Documentos ---- */}
            <section id="documentos" className="p-card p-anim" aria-labelledby="t-docs">
              <span className="p-eyebrow" id="t-docs">Documentos</span>
              {dados.documentos.length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {dados.documentos.map((d, i) =>
                    d.url ? (
                      <a key={`${d.tipo}-${i}`} className="p-doc" href={d.url} target="_blank" rel="noreferrer">
                        <span>
                          <span style={{ fontWeight: 600 }}>{d.titulo}</span>
                          <span className="p-muted"> · {diaCurto(d.dia)}</span>
                        </span>
                        <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <div key={`${d.tipo}-${i}`} className="p-doc">
                        <span>
                          <span style={{ fontWeight: 600 }}>{d.titulo}</span>
                          <span className="p-muted"> · {diaCurto(d.dia)}</span>
                        </span>
                        <span className="p-muted">peça o arquivo à recepção</span>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <p className="p-frase">Seu contrato e as notas fiscais vão aparecer aqui conforme forem emitidos.</p>
              )}
            </section>

            <footer className="p-rodape p-anim">
              {dados.consentimentos.length ? <p>Você autorizou: {dados.consentimentos.filter((c) => c.aceito).map((c) => CONSENT_LABEL[c.tipo] ?? c.tipo.toLowerCase()).join(", ") || "nada registrado ainda"}.</p> : null}
              <p>Seus dados ficam só com o Instituto Bratan e aparecem aqui só para você. Para mudar algo, fale com a recepção.</p>
              <p>
                <button type="button" onClick={() => void sair()}>
                  Sair deste aparelho
                </button>
              </p>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function PortalPacienteApp() {
  return (
    <Routes>
      <Route path="entrar" element={<EntrarPage />} />
      <Route path="*" element={<MeuPortal />} />
    </Routes>
  );
}
