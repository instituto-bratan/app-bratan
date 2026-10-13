// CONFERE O PACOTE DO APP DO PACIENTE (01/10/2026). Roda depois do build:portal e
// derruba o build se uma tela da equipe vazou para dentro do app da loja: basta
// um import errado no portal para o pacote levar o financeiro, o CRM ou os POPs
// (Diretriz 2.3.1 da Apple, e o maior risco de segurança do app instalado).
import fs from "node:fs";
import path from "node:path";

const PASTA = path.resolve(process.argv[2] ?? "dist-portal");

/** Rotas e textos que só existem no sistema da equipe. */
const SO_DA_EQUIPE = [
  "/financeiro/contas",
  "/financeiro/extrato",
  "/crm/vendas",
  "/crm/coordenador",
  "/estoque/aplicacoes",
  "/administracao/integracoes",
  "/administracao/acessos",
  "/concierge/nps",
];
/** Arquivos públicos que nunca entram no app: os POPs internos e o PWA da equipe. */
const ARQUIVOS_PROIBIDOS = ["fluxogramas", "pdfjs", "sw.js", "manifest.webmanifest"];
/**
 * As fontes da equipe (Fraunces e Manrope, Papel & Musgo) não vão para o app do
 * paciente, que usa a própria família (08/10/2026): moram em
 * src/styles/fontes-da-equipe.css, importado só por src/main.tsx.
 */
const FONTES_DA_EQUIPE = /(^|[\\/])(fraunces|manrope)-[^\\/]*\.(woff2?|ttf|otf)$/i;

function arquivos(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((item) => {
    const caminho = path.join(pasta, item.name);
    return item.isDirectory() ? arquivos(caminho) : [caminho];
  });
}

if (!fs.existsSync(path.join(PASTA, "index.html"))) {
  console.error(`✗ ${PASTA}/index.html não existe: rode o build:portal antes.`);
  process.exit(1);
}

const problemas = [];
for (const nome of ARQUIVOS_PROIBIDOS) {
  if (fs.existsSync(path.join(PASTA, nome))) problemas.push(`o pacote leva ${nome}`);
}
for (const arquivo of arquivos(PASTA).filter((a) => FONTES_DA_EQUIPE.test(a))) {
  problemas.push(`o pacote leva a fonte da equipe ${path.relative(PASTA, arquivo)}`);
}
for (const arquivo of arquivos(PASTA).filter((a) => /\.(js|css|html)$/.test(a))) {
  const texto = fs.readFileSync(arquivo, "utf8");
  for (const marca of SO_DA_EQUIPE) {
    if (texto.includes(marca)) problemas.push(`${path.relative(PASTA, arquivo)} cita "${marca}"`);
  }
  // Mesmo embutida no CSS (data:), a declaração da fonte da equipe não entra (08/10/2026).
  if (/@font-face\s*\{[^}]*font-family:\s*["']?(Fraunces|Manrope)\b/i.test(texto)) {
    problemas.push(`${path.relative(PASTA, arquivo)} declara a fonte da equipe (@font-face Fraunces/Manrope)`);
  }
}

if (problemas.length) {
  console.error("✗ O app do paciente está levando partes do sistema da equipe:");
  for (const p of problemas) console.error(`  · ${p}`);
  process.exit(1);
}
const total = arquivos(PASTA).reduce((soma, a) => soma + fs.statSync(a).size, 0);
console.log(`✓ Pacote do paciente limpo: ${arquivos(PASTA).length} arquivos, ${(total / 1024).toFixed(0)} KB, nenhuma tela da equipe.`);
