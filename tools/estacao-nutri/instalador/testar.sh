#!/bin/bash
# TESTE DO INSTALADOR DA ESTAÇÃO NUTRIÇÃO, DE PONTA A PONTA, NESTE MAC (28/09/2026).
#
# Monta o pacote, descompacta como se fosse no Mac da Géssica e instala numa
# pasta temporária, com outra porta (8788) e outro rótulo de início automático.
# Confere a estação instalada (saúde, origem permitida, PDF e transcrição),
# reinstala por cima (tem que manter a configuração dela) e desinstala.
# Não baixa o modelo de novo: usa uma cópia do que já está neste Mac.
#
# Uso: tools/estacao-nutri/instalador/testar.sh
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
MODELO_LOCAL="${MODELO_LOCAL:-$HOME/Library/Application Support/EstacaoNutri/modelos/ggml-large-v3-turbo-q5_0.bin}"
AUDIO_TESTE="${AUDIO_TESTE:-$HOME/Downloads/WhatsApp Ptt 2026-09-28 at 09.44.04.ogg}"
ORIGEM="https://app-bratan.vercel.app"
PORTA=8788
ROTULO="br.com.institutobratan.estacao-nutri.teste"
TMP="$(mktemp -d)"

export ESTACAO_ORIGEM="$ORIGEM"
export ESTACAO_BASE="$TMP/base"
export ESTACAO_PORTA="$PORTA"
export ESTACAO_ROTULO="$ROTULO"
export ESTACAO_LOGS="$TMP/logs"
export ESTACAO_ATALHO="$TMP/Nutrição Bratan.app"
export ESTACAO_ABRIR_CHROME=nao
export ESTACAO_APAGAR_DADOS=nao

limpar() {
  launchctl bootout "gui/$(id -u)/$ROTULO" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$ROTULO.plist"
  rm -rf "$TMP"
}
trap limpar EXIT

falhas=0
confere() {
  local descricao="$1"
  shift
  if "$@"; then echo "  ✓ $descricao"; else echo "  ✗ $descricao"; falhas=$((falhas + 1)); fi
}

saude() { curl -s -m 3 -H "Origin: $ORIGEM" "http://127.0.0.1:$PORTA/saude"; }
saude_completa() {
  saude | node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>{const s=JSON.parse(t);process.exit(s.ok&&s.whisper.pronto&&s.ffmpeg&&s.chrome?0:1)})'
}
ia_desligada() { saude | grep -q '"ia":{"configurada":false'; }
origem_estranha_recusada() { [ "$(curl -s -o /dev/null -w '%{http_code}' -m 3 -H "Origin: https://exemplo.com" "http://127.0.0.1:$PORTA/saude")" = "403" ]; }
gera_pdf() {
  curl -s -m 60 -H "Origin: $ORIGEM" -H "Content-Type: application/json" \
    -d '{"html":"<!doctype html><html><body><h1>Plano alimentar — teste</h1></body></html>"}' \
    -o "$TMP/teste.pdf" "http://127.0.0.1:$PORTA/pdf" && [ "$(head -c 4 "$TMP/teste.pdf")" = "%PDF" ]
}
transcreve() {
  [ -f "$AUDIO_TESTE" ] || { echo "    (sem $AUDIO_TESTE: transcrição não testada)"; return 0; }
  node - "$AUDIO_TESTE" "$PORTA" "$ORIGEM" <<'JS'
const [arquivo, porta, origem] = process.argv.slice(2);
const base = `http://127.0.0.1:${porta}`;
const h = { Origin: origem };
const id = `teste-${Date.now()}`;
const audio = await (await import("node:fs/promises")).readFile(arquivo);
const envio = await fetch(`${base}/transcricoes?gravacao=${id}`, { method: "POST", headers: { ...h, "Content-Type": "audio/ogg" }, body: audio });
if (!envio.ok) process.exit(1);
const { jobId } = await envio.json();
let e;
for (let i = 0; i < 150; i++) {
  await new Promise((ok) => setTimeout(ok, 2000));
  e = await (await fetch(`${base}/transcricoes/${jobId}`, { headers: h })).json();
  if (e.estado === "pronta" || e.estado === "erro") break;
}
await fetch(`${base}/audios/${id}`, { method: "DELETE", headers: h });
const texto = e?.resultado?.segmentos?.map((s) => s.texto).join(" ") ?? "";
console.log(`    (${e?.estado}: "${texto.slice(0, 60)}…")`);
process.exit(e?.estado === "pronta" && /prontu[aá]rio/i.test(texto) ? 0 : 1);
JS
}
agente_carregado() { launchctl print "gui/$(id -u)/$ROTULO" >/dev/null 2>&1; }
agente_ausente() { ! agente_carregado && [ ! -f "$HOME/Library/LaunchAgents/$ROTULO.plist" ]; }
env_local() { cat "$ESTACAO_BASE/programa/tools/estacao-nutri/.env.local"; }
env_tem_origem() { env_local | grep -qx "ORIGENS_PERMITIDAS=$ORIGEM"; }
env_sem_chave_ia() { ! env_local | grep -q '^ANTHROPIC_API_KEY=.'; }
env_manteve_linha_dela() { env_local | grep -qx "DIAS_RETENCAO_AUDIO=5"; }
env_sem_repeticao() { [ "$(env_local | grep -c '^ORIGENS_PERMITIDAS=')" = "1" ]; }
porta_fechada() { ! curl -s -m 2 "http://127.0.0.1:$PORTA/saude" >/dev/null; }

echo "▸ Pacote"
"$AQUI/montar-pacote.sh" "$TMP/saida" >/dev/null
ZIP="$TMP/saida/Estação Nutrição Bratan.zip"
confere "pacote montado" test -f "$ZIP"
confere "pacote não leva node_modules nem .env.local" bash -c "! unzip -Z1 \"$ZIP\" | grep -qE 'node_modules|\\.env\\.local'"
confere "pacote sem atributos deste Mac (arquivos ._)" bash -c "! unzip -Z1 \"$ZIP\" | grep -qE '(^|/)\\._'"
ditto -x -k "$ZIP" "$TMP/copiado"
PACOTE="$TMP/copiado/Estação Nutrição Bratan"
confere "instalador e desinstalador executáveis" test -x "$PACOTE/Instalar.command" -a -x "$PACOTE/Desinstalar.command"
confere "leva o roteiro e o esquema que a estação importa do app" test -f "$PACOTE/app/src/features/nutricao/dominio/roteiro.ts" -a -f "$PACOTE/app/src/features/nutricao/dominio/esquemaOrganizacao.ts"

echo "▸ Primeira instalação (com o download do modelo interrompido 3 MB antes do fim)"
MODELO_TESTE="$ESTACAO_BASE/modelos/ggml-large-v3-turbo-q5_0.bin"
mkdir -p "$ESTACAO_BASE/modelos"
head -c "$(($(stat -f%z "$MODELO_LOCAL") - 3000000))" "$MODELO_LOCAL" >"$MODELO_TESTE.parcial"
if "$PACOTE/Instalar.command" </dev/null >"$TMP/instalar-1.log" 2>&1; then echo "  ✓ instalador terminou"; else echo "  ✗ instalador falhou:"; tail -20 "$TMP/instalar-1.log"; falhas=$((falhas + 1)); fi
if [ "${MOSTRAR_SAIDA:-}" = "1" ]; then sed 's/^/    │ /' "$TMP/instalar-1.log"; fi
modelo_certo() { [ "$(shasum -a 256 "$MODELO_TESTE" | cut -d' ' -f1)" = "$(shasum -a 256 "$MODELO_LOCAL" | cut -d' ' -f1)" ] && [ ! -e "$MODELO_TESTE.parcial" ]; }
confere "retomou o download de onde parou e conferiu o modelo" modelo_certo
confere "liga sozinha (início automático carregado)" agente_carregado
confere "estação completa: transcrição, ffmpeg e Chrome" saude_completa
confere "IA paga desligada" ia_desligada
confere "recusa site que não é o APP BRATAN" origem_estranha_recusada
confere "gera PDF pelo Chrome" gera_pdf
confere "transcreve áudio de verdade" transcreve
confere "configuração aceita só o APP BRATAN" env_tem_origem
confere "sem chave de IA na configuração" env_sem_chave_ia
confere "atalho Nutrição Bratan criado" test -d "$ESTACAO_ATALHO"

echo "▸ Reinstalar por cima"
echo "DIAS_RETENCAO_AUDIO=5" >>"$ESTACAO_BASE/programa/tools/estacao-nutri/.env.local"
if "$PACOTE/Instalar.command" </dev/null >"$TMP/instalar-2.log" 2>&1; then echo "  ✓ instalador terminou"; else echo "  ✗ instalador falhou:"; tail -20 "$TMP/instalar-2.log"; falhas=$((falhas + 1)); fi
confere "não baixou o modelo de novo" grep -q "modelo já estava baixado" "$TMP/instalar-2.log"
confere "manteve a linha que ela acrescentou" env_manteve_linha_dela
confere "não repetiu a configuração" env_sem_repeticao
confere "estação respondendo de novo" saude_completa

echo "▸ Desinstalar"
if "$PACOTE/Desinstalar.command" </dev/null >"$TMP/desinstalar.log" 2>&1; then echo "  ✓ desinstalador terminou"; else echo "  ✗ desinstalador falhou:"; tail -20 "$TMP/desinstalar.log"; falhas=$((falhas + 1)); fi
confere "início automático removido" agente_ausente
confere "estação desligada" porta_fechada
confere "programa apagado" test ! -d "$ESTACAO_BASE/programa"
confere "atalho apagado" test ! -e "$ESTACAO_ATALHO"
confere "gravações e modelo mantidos (ela não pediu para apagar)" test -f "$ESTACAO_BASE/modelos/ggml-large-v3-turbo-q5_0.bin"

echo
if [ "$falhas" -eq 0 ]; then echo "Tudo certo."; else echo "$falhas conferência(s) falharam."; exit 1; fi
