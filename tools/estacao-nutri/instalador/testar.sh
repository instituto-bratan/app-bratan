#!/bin/bash
# TESTE DO INSTALADOR DA ESTAÇÃO NUTRIÇÃO, DE PONTA A PONTA, NESTE MAC (28/09/2026).
#
# Monta o pacote, descompacta como se fosse no Mac da Géssica e instala numa
# pasta temporária, com outra porta (8788) e outro rótulo de início automático.
# Confere a estação instalada (saúde, origem permitida, PDF, transcrição de um
# áudio de verdade e a limpeza depois do descarte), simula uma atualização que
# falha (a estação antiga tem de continuar), reinstala por cima (tem de manter a
# configuração dela) e desinstala. Não baixa o modelo de novo: usa uma cópia do
# que já está neste Mac, cortada 3 MB antes do fim para testar a retomada.
# Não dá para testar a instalação do Homebrew e dos programas do zero num Mac
# que já tem tudo.
#
# Uso: tools/estacao-nutri/instalador/testar.sh   (MOSTRAR_SAIDA=1 mostra a tela do instalador)
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
export ESTACAO_APAGAR_MODELO=nao

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
roda() {
  # roda o instalador ou o desinstalador; $1 = rótulo, $2 = programa, $3 = arquivo de saída
  if "$2" </dev/null >"$3" 2>&1; then echo "  ✓ $1 terminou"; else echo "  ✗ $1 falhou:"; tail -20 "$3"; falhas=$((falhas + 1)); fi
  if [ "${MOSTRAR_SAIDA:-}" = "1" ]; then sed 's/^/    │ /' "$3" | grep -vE "#{10,}"; fi
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
const texto = e?.resultado?.segmentos?.map((s) => s.texto).join(" ") ?? "";
// Antes de descartar, a transcrição tem de estar em disco com o nome da gravação.
const fs = await import("node:fs");
const pasta = `${process.env.ESTACAO_BASE}/transcricoes`;
const antes = fs.readdirSync(pasta).filter((n) => n.startsWith(`${id}.`)).length;
await fetch(`${base}/audios/${id}`, { method: "DELETE", headers: h });
const depois = fs.readdirSync(pasta).filter((n) => n.startsWith(`${id}.`)).length;
const sobrou = fs.readdirSync(`${process.env.ESTACAO_BASE}/audios`).filter((n) => n.startsWith(`${id}.`)).length;
console.log(`    (${e?.estado}: "${texto.slice(0, 60)}…"; transcrição em disco antes: ${antes}, depois do descarte: ${depois}, áudio: ${sobrou})`);
process.exit(e?.estado === "pronta" && /prontu[aá]rio/i.test(texto) && antes === 1 && depois === 0 && sobrou === 0 ? 0 : 1);
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
fora_do_time_machine() { xattr -p com.apple.metadata:com_apple_backup_excludeItem "$ESTACAO_BASE" >/dev/null 2>&1; }
plist_interativo() { grep -q "<string>Interactive</string>" "$HOME/Library/LaunchAgents/$ROTULO.plist"; }
sem_sobras_da_atualizacao() { [ ! -e "$ESTACAO_BASE/programa.novo" ] && [ ! -e "$ESTACAO_BASE/programa.antigo" ] && [ ! -e "$ESTACAO_BASE/.prova" ]; }

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
confere "leva a versão do pacote" bash -c "grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2} ' \"$PACOTE/app/VERSAO\""

echo "▸ Primeira instalação (com o download do modelo interrompido 3 MB antes do fim)"
MODELO_TESTE="$ESTACAO_BASE/modelos/ggml-large-v3-turbo-q5_0.bin"
mkdir -p "$ESTACAO_BASE/modelos"
head -c "$(($(stat -f%z "$MODELO_LOCAL") - 3000000))" "$MODELO_LOCAL" >"$MODELO_TESTE.parcial"
roda "instalador" "$PACOTE/Instalar.command" "$TMP/instalar-1.log"
modelo_certo() { [ "$(shasum -a 256 "$MODELO_TESTE" | cut -d' ' -f1)" = "$(shasum -a 256 "$MODELO_LOCAL" | cut -d' ' -f1)" ] && [ ! -e "$MODELO_TESTE.parcial" ]; }
confere "mostra a versão do pacote" grep -q "versão $(cut -d' ' -f1 "$PACOTE/app/VERSAO")" "$TMP/instalar-1.log"
confere "retomou o download de onde parou e conferiu o modelo" modelo_certo
confere "liga sozinha (início automático carregado)" agente_carregado
confere "início automático sem limite de CPU e disco (ProcessType)" plist_interativo
confere "estação completa: transcrição, ffmpeg e Chrome" saude_completa
confere "conferiu um PDF e uma transcrição de verdade ao instalar" bash -c "grep -q 'PDF de conferência gerado' \"$TMP/instalar-1.log\" && grep -q 'transcrição de conferência concluída' \"$TMP/instalar-1.log\""
confere "IA paga desligada" ia_desligada
confere "recusa site que não é o APP BRATAN" origem_estranha_recusada
confere "gera PDF pelo Chrome" gera_pdf
confere "transcreve áudio de verdade e o descarte apaga áudio e transcrição" transcreve
confere "configuração aceita só o APP BRATAN" env_tem_origem
confere "sem chave de IA na configuração" env_sem_chave_ia
confere "pasta dos áudios fora do Time Machine" fora_do_time_machine
confere "registro em $ESTACAO_LOGS" test -s "$ESTACAO_LOGS/estacao.log"
confere "atalho Nutrição Bratan criado" test -d "$ESTACAO_ATALHO"
confere "nada sobrou da montagem" sem_sobras_da_atualizacao

echo "▸ Atualização que falha no meio (sem acesso ao registro do npm)"
echo "DIAS_RETENCAO_AUDIO=5" >>"$ESTACAO_BASE/programa/tools/estacao-nutri/.env.local"
mkdir -p "$TMP/cache-vazio"
if ! npm_config_registry=http://127.0.0.1:9 npm_config_cache="$TMP/cache-vazio" "$PACOTE/Instalar.command" </dev/null >"$TMP/instalar-falha.log" 2>&1; then
  echo "  ✓ instalador parou"
else
  echo "  ✗ instalador não deveria ter terminado"; falhas=$((falhas + 1))
fi
confere "avisou que a estação antiga continua funcionando" grep -q "continua funcionando" "$TMP/instalar-falha.log"
confere "estação antiga continua respondendo" saude_completa
confere "estação antiga intacta (peças no lugar)" test -d "$ESTACAO_BASE/programa/tools/estacao-nutri/node_modules/playwright-core"
confere "nada sobrou da montagem" sem_sobras_da_atualizacao

echo "▸ Reinstalar por cima"
roda "instalador" "$PACOTE/Instalar.command" "$TMP/instalar-2.log"
confere "não baixou o modelo de novo" grep -q "modelo já estava baixado" "$TMP/instalar-2.log"
confere "manteve a linha que ela acrescentou" env_manteve_linha_dela
confere "não repetiu a configuração" env_sem_repeticao
confere "estação respondendo de novo" saude_completa
confere "nada sobrou da montagem" sem_sobras_da_atualizacao

echo "▸ Desinstalar"
mkdir -p "$ESTACAO_BASE/audios" "$ESTACAO_BASE/transcricoes"
echo x >"$ESTACAO_BASE/audios/sobra.ogg"
echo x >"$ESTACAO_BASE/transcricoes/sobra.json"
ESTACAO_CONFIRMAR=nao roda "desinstalador sem confirmar" "$PACOTE/Desinstalar.command" "$TMP/desinstalar-nao.log"
nao_mexeu() { agente_carregado && [ -d "$ESTACAO_BASE/programa" ]; }
confere "sem confirmar, não mexeu em nada" nao_mexeu
ESTACAO_CONFIRMAR=sim roda "desinstalador" "$PACOTE/Desinstalar.command" "$TMP/desinstalar.log"
confere "início automático removido" agente_ausente
confere "estação desligada" porta_fechada
confere "programa apagado" test ! -d "$ESTACAO_BASE/programa"
confere "atalho apagado" test ! -e "$ESTACAO_ATALHO"
confere "cópias de áudio e transcrição apagadas sem perguntar" bash -c "test ! -e \"$ESTACAO_BASE/audios\" && test ! -e \"$ESTACAO_BASE/transcricoes\""
confere "modelo mantido (ela não pediu para apagar)" test -f "$ESTACAO_BASE/modelos/ggml-large-v3-turbo-q5_0.bin"
confere "avisa que o que está no Chrome continua" grep -q "NÃO foram" "$TMP/desinstalar.log"

echo
if [ "$falhas" -eq 0 ]; then echo "Tudo certo."; else echo "$falhas conferência(s) falharam."; exit 1; fi
