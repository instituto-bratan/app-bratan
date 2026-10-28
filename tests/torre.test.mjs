// TORRE BRATAN (28/10/2026). O Lucas pediu o mapa dos sistemas como um sistema
// de verdade, dentro do app (fase 1). Estes testes seguram as promessas:
// - a Torre e a Central nunca discordam: cada frente vira um cartão com a mesma
//   situação, o mesmo número e o mesmo próximo passo;
// - o desenho: nenhum cartão encosta em outro e cada um fica dentro da sua faixa;
// - as linhas ligam cartões que existem e mudam sozinhas quando a integração liga;
// - "Esperando você": as decisões do contador do Início, o próximo passo de cada
//   frente parada e o aviso das notas, nessa ordem;
// - o Lucro Inteligente: some para quem não vê, "somando" enquanto lê, a falta
//   somada por pessoa;
// - a porta: rota /torre no módulo da Central, manifesto e ícones próprios.
// Dados fictícios.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");
const central = loadTs("src/features/central/central.ts");
const torre = loadTs("src/features/torre/torre.ts");

const LIDO_EM = "2026-10-28T12:00:00.000Z";

/** O resumo de exemplo da Central (fictício), com um ajuste opcional. */
function resumo(mudar = () => undefined) {
  const bruto = JSON.parse(JSON.stringify(plain(central.resumoDeExemplo(LIDO_EM))));
  mudar(bruto);
  return bruto;
}

function mapaDe(bruto, { decisoes = null, lucro = null } = {}) {
  return plain(torre.montarMapa({ central: central.montarCentral(bruto), bruto, decisoes, lucro }));
}

test("Torre e Central nunca discordam: mesma situação, mesmo número e mesmo próximo passo", () => {
  const bruto = resumo();
  const daCentral = plain(central.montarCentral(bruto));
  const mapa = mapaDe(bruto);
  for (const frente of daCentral.frentes) {
    const no = mapa.nos.find((item) => item.id === frente.id);
    assert.ok(no, `a frente ${frente.id} virou cartão`);
    assert.equal(no.palavra, central.SITUACOES[frente.situacao].palavra, frente.id);
    assert.equal(no.numero, frente.destaque.valor === "—" ? null : frente.destaque.valor, frente.id);
    assert.equal(no.painel.proximo, frente.proximoPasso === "Nada travado." ? null : frente.proximoPasso, frente.id);
    assert.deepEqual(no.painel.travou, frente.travou, frente.id);
  }
  assert.equal(mapa.frase, daCentral.frase);
});

test("o desenho: nenhum cartão encosta em outro, todos dentro do mapa e da sua faixa", () => {
  const mapa = mapaDe(resumo(), { lucro: { ate: "2026-10-31", pessoas: [] } });
  const folga = 6;
  for (const no of mapa.nos) {
    assert.ok(no.x >= 0 && no.y >= 0 && no.x + no.w <= torre.LARGURA && no.y + no.h <= torre.ALTURA, `${no.id} sai do mapa`);
    const faixa = mapa.zonas.find((zona) => zona.id === no.zona);
    if (faixa) assert.ok(no.x >= faixa.x && no.y >= faixa.y && no.x + no.w <= faixa.x + faixa.w && no.y + no.h <= faixa.y + faixa.h, `${no.id} sai da faixa ${faixa.id}`);
  }
  for (let i = 0; i < mapa.nos.length; i += 1) {
    for (let j = i + 1; j < mapa.nos.length; j += 1) {
      const [a, b] = [mapa.nos[i], mapa.nos[j]];
      const separados = a.x + a.w + folga <= b.x || b.x + b.w + folga <= a.x || a.y + a.h + folga <= b.y || b.y + b.h + folga <= a.y;
      assert.ok(separados, `${a.id} encosta em ${b.id}`);
    }
  }
  assert.equal(new Set(mapa.nos.map((no) => no.id)).size, mapa.nos.length, "ids repetidos");
});

test("as linhas ligam cartões que existem e mudam sozinhas quando a integração liga", () => {
  const hoje = mapaDe(resumo());
  const ids = new Set(hoje.nos.map((no) => no.id));
  for (const aresta of hoje.arestas) assert.ok(ids.has(aresta.de) && ids.has(aresta.para), `${aresta.de} → ${aresta.para}`);
  const jeito = (mapa, de) => mapa.arestas.find((aresta) => aresta.de === de).jeito;
  assert.equal(jeito(hoje, "whatsapp"), "desligado");
  assert.equal(jeito(hoje, "itau"), "a-mao", "o extrato do Itaú entra por arquivo");
  assert.equal(hoje.nos.find((no) => no.id === "itau").palavra, "À mão");

  const ligado = mapaDe(
    resumo((bruto) => {
      for (const chave of ["whatsapp", "itau"]) bruto.integracoes.find((linha) => linha.chave === chave).ligada = true;
    }),
  );
  assert.equal(jeito(ligado, "whatsapp"), "sozinho");
  assert.equal(jeito(ligado, "itau"), "sozinho");
  assert.equal(ligado.nos.find((no) => no.id === "itau").palavra, "Ligada");
});

test("Esperando você: decisões do Início, o próximo passo de cada frente parada e o aviso das notas, nessa ordem", () => {
  const decisoes = central.decisoesDaCentral({ pedidos: 2, contas: 3, fechamentos: 0, total: 5 }, 1);
  const mapa = mapaDe(resumo(), { decisoes });
  assert.deepEqual(
    mapa.esperando.map((item) => item.id),
    ["decisao-pedidos", "decisao-contas", "frente-atendimento", "aviso-notas"],
  );
  const atendimento = mapa.esperando.find((item) => item.id === "frente-atendimento");
  assert.equal(atendimento.texto, plain(central.montarCentral(resumo())).frentes.find((frente) => frente.id === "atendimento").proximoPasso);
  assert.equal(atendimento.no, "atendimento");
  const cartao = mapa.nos.find((no) => no.id === "esperando");
  assert.equal(cartao.palavra, "4");
  assert.equal(cartao.tom, "atencao");
  assert.ok(mapa.nos.find((no) => no.id === "atendimento").esperaVoce, "a frente parada acende no filtro");
  assert.ok(!mapa.nos.find((no) => no.id === "gestao").esperaVoce, "frente no ar não acende");
});

test("Lucro Inteligente: some sem acesso, 'somando' enquanto lê e a falta somada por pessoa", () => {
  assert.ok(!mapaDe(resumo()).nos.some((no) => no.id === "lucro"), "sem acesso ao Lucro, sem cartão");
  assert.ok(!mapaDe(resumo()).arestas.some((aresta) => aresta.para === "lucro"));

  const somando = mapaDe(resumo(), { lucro: "lendo" }).nos.find((no) => no.id === "lucro");
  assert.equal(somando.palavra, "Somando…");

  const lido = mapaDe(resumo(), {
    lucro: {
      ate: "2026-10-31",
      pessoas: [
        { nome: "Pessoa A", falta: 1200.5, adiantado: 0 },
        { nome: "Pessoa B", falta: 0, adiantado: 300 },
        { nome: "Pessoa C", falta: 99.5, adiantado: 0 },
      ],
    },
  }).nos.find((no) => no.id === "lucro");
  assert.match(lido.numero, /^falta R\$\s1\.300,00$/);
  assert.equal(lido.palavra, "até 31/10");
  assert.equal(lido.tom, "atencao");
  assert.match(lido.painel.agora[1], /^Pessoa B: recebeu R\$\s300,00 a mais\.$/);
  assert.equal(lido.painel.link.to, "/financeiro/extrato-socios");
});

test("a linha sai reta quando os cartões se olham, e desce reta quando estão um sobre o outro", () => {
  assert.equal(torre.caminhoDaAresta({ x: 0, y: 100, w: 100, h: 40 }, { x: 200, y: 50, w: 100, h: 200 }), "M100 120C150 120,150 120,200 120");
  assert.equal(torre.caminhoDaAresta({ x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 100, w: 100, h: 50 }), "M50 50C50 75,50 75,50 100");
  // Da direita para a esquerda (a porta manda para fora): sai da borda esquerda.
  assert.match(torre.caminhoDaAresta({ x: 300, y: 0, w: 100, h: 100 }, { x: 0, y: 30, w: 100, h: 40 }), /^M300 50C.*,100 50$/);
});

test("a porta e a identidade: /torre no módulo da Central, manifesto e ícones próprios", () => {
  assert.match(ler("src/App.tsx"), /path="\/torre"[\s\S]{0,160}module="central"/);
  assert.match(ler("src/lib/routePreload.ts"), /pathname === "\/torre"\) return "torre"/);

  const manifesto = JSON.parse(ler("public/torre.webmanifest"));
  assert.equal(manifesto.name, "Torre Bratan");
  assert.equal(manifesto.id, "/torre");
  assert.equal(manifesto.start_url, "/torre");
  assert.equal(manifesto.scope, "/", "dentro do app instalado, os links das telas não saem da janela");
  for (const icone of manifesto.icons) assert.ok(fs.existsSync(path.join(repoRoot, "public", icone.src)), icone.src);
  assert.ok(fs.existsSync(path.join(repoRoot, "public/torre-apple-touch-icon.png")));

  const vercel = JSON.parse(ler("vercel.json"));
  const cabecalho = vercel.headers.find((bloco) => bloco.source === "/torre.webmanifest");
  assert.ok(cabecalho?.headers.some((linha) => linha.key === "Content-Type" && /manifest\+json/.test(linha.value)));

  const pagina = ler("src/features/torre/TorrePage.tsx");
  assert.match(pagina, /manifesto: "\/torre\.webmanifest"/);
  assert.match(pagina, /queryKey: \["central-resumo"\]/, "a mesma consulta da Central");
  assert.match(ler("src/styles/globals.css"), /@keyframes torre-fluxo/);
});
