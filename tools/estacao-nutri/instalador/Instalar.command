#!/bin/bash
# ESTAÇÃO NUTRIÇÃO · INSTITUTO BRATAN — INSTALADOR PARA O MAC DA DRA. GÉSSICA (28/09/2026).
#
# Dois cliques. Instala o que falta (Homebrew, Node, ffmpeg, whisper e Google
# Chrome), copia a estação, baixa e confere o modelo de transcrição e deixa a
# estação ligando sozinha quando o Mac liga. Nada aqui usa IA paga.
# Rodar de novo atualiza a estação e mantém os dados e a configuração dela.
set -Eeuo pipefail

# Valores de verdade. As variáveis ESTACAO_* existem só para o teste (testar.sh).
ORIGEM_APP="${ESTACAO_ORIGEM:-https://app-bratan.vercel.app}"
BASE="${ESTACAO_BASE:-$HOME/Library/Application Support/EstacaoNutri}"
PORTA="${ESTACAO_PORTA:-8787}"
ROTULO="${ESTACAO_ROTULO:-br.com.institutobratan.estacao-nutri}"
LOGS="${ESTACAO_LOGS:-$HOME/Library/Logs/EstacaoNutri}"
ATALHO="${ESTACAO_ATALHO:-$HOME/Applications/Nutrição Bratan.app}"
ABRIR_CHROME="${ESTACAO_ABRIR_CHROME:-sim}"

MODELO_NOME="ggml-large-v3-turbo-q5_0.bin"
MODELO_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$MODELO_NOME"
MODELO_SHA256="394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"

PACOTE="$(cd "$(dirname "$0")" && pwd)"
PROGRAMA="$BASE/programa"
ESTACAO="$PROGRAMA/tools/estacao-nutri"
MODELO="$BASE/modelos/$MODELO_NOME"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"
USUARIO="$(id -u)"

passo="começo"
parou() {
  echo
  echo "✗ A instalação parou em: $passo."
  echo "  Tire um print desta janela e mande para o Lucas."
  read -r -p "Aperte Enter para fechar. " _ || true
}
trap parou ERR

etapa() {
  passo="$1"
  echo
  echo "▸ $1"
}
ok() { echo "  ✓ $1"; }
erro() {
  echo "  ✗ $1"
  return 1
}
modelo_confere() { [ -f "$1" ] && [ "$(shasum -a 256 "$1" | cut -d' ' -f1)" = "$MODELO_SHA256" ]; }

echo "Estação Nutrição · Instituto Bratan"
echo "Instala neste Mac a parte do APP BRATAN que transcreve as consultas e gera o PDF do plano."
echo "Na primeira vez leva de 10 a 20 minutos e precisa de internet. Nada aqui é cobrado."

etapa "Conferindo o Mac"
[ "$(uname -s)" = "Darwin" ] || erro "este instalador é só para Mac"
[ -d "$PACOTE/app/tools/estacao-nutri" ] || erro "a pasta \"app\" precisa estar ao lado do instalador (descompacte o pacote inteiro)"
livre_kb="$(df -Pk "$HOME" | awk 'NR == 2 { print $4 }')"
[ "$livre_kb" -gt 3000000 ] || erro "pouco espaço livre no disco: são precisos 3 GB"
ok "macOS $(sw_vers -productVersion), $((livre_kb / 1024 / 1024)) GB livres"

etapa "Homebrew (o instalador de programas do Mac)"
if [ -x /opt/homebrew/bin/brew ]; then
  BREW=/opt/homebrew/bin/brew
elif [ -x /usr/local/bin/brew ]; then
  BREW=/usr/local/bin/brew
else
  id -Gn | tr ' ' '\n' | grep -qx admin || erro "este usuário do Mac não é administrador; instale com um usuário administrador"
  echo "  Vou instalar o Homebrew. Quando ele pedir, aperte Enter e digite a senha do Mac."
  echo "  Enquanto você digita a senha, nada aparece na tela. É normal."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [ -x /opt/homebrew/bin/brew ]; then BREW=/opt/homebrew/bin/brew; else BREW=/usr/local/bin/brew; fi
  [ -x "$BREW" ] || erro "o Homebrew não foi instalado"
fi
eval "$("$BREW" shellenv)"
PREFIXO="$("$BREW" --prefix)"
# Instalar o que falta sem atualizar o que ela já tem.
export HOMEBREW_NO_INSTALL_UPGRADE=1 HOMEBREW_NO_ENV_HINTS=1
ok "Homebrew pronto"

etapa "Programas da transcrição (Node, ffmpeg e whisper)"
for formula in node ffmpeg whisper-cpp; do
  if "$BREW" list --formula "$formula" >/dev/null 2>&1; then
    ok "$formula já estava instalado"
  else
    echo "  instalando $formula…"
    "$BREW" install --formula "$formula"
    ok "$formula instalado"
  fi
done
NODE="$PREFIXO/bin/node"
NPM="$PREFIXO/bin/npm"
node_serve() { [ "$("$NODE" -p 'Boolean(process.features.typescript)' 2>/dev/null)" = "true" ]; }
if ! node_serve; then
  echo "  atualizando o Node (a estação precisa de uma versão recente)…"
  "$BREW" upgrade --formula node
fi
node_serve || erro "o Node deste Mac é antigo demais para a estação"
WHISPER="$PREFIXO/bin/whisper-cli"
FFMPEG="$PREFIXO/bin/ffmpeg"
[ -x "$WHISPER" ] || erro "o whisper-cli não apareceu em $PREFIXO/bin"
[ -x "$FFMPEG" ] || erro "o ffmpeg não apareceu em $PREFIXO/bin"
ok "Node $("$NODE" --version), ffmpeg e whisper prontos"

etapa "Google Chrome (gera o PDF e é o navegador do APP BRATAN)"
# O gerador de PDF só procura o Chrome em /Applications.
if [ -d "/Applications/Google Chrome.app" ]; then
  ok "Chrome já estava instalado"
else
  echo "  instalando o Google Chrome…"
  "$BREW" install --cask google-chrome
  ok "Chrome instalado"
fi

etapa "Estação Nutrição"
mkdir -p "$PROGRAMA" "$BASE/modelos" "$LOGS"
rsync -a --delete --exclude ".env.local" --exclude "node_modules" "$PACOTE/app/" "$PROGRAMA/"
(cd "$ESTACAO" && "$NPM" ci --omit=dev --no-audit --no-fund --loglevel=error >/dev/null)
ok "estação copiada para $PROGRAMA"

etapa "Modelo de transcrição (574 MB, só na primeira vez)"
if modelo_confere "$MODELO"; then
  ok "modelo já estava baixado e conferido"
else
  if ! modelo_confere "$MODELO.parcial"; then
    echo "  baixando… (se a internet cair, rode o instalador de novo: ele continua de onde parou)"
    curl -fL --retry 5 --retry-delay 5 -C - --progress-bar -o "$MODELO.parcial" "$MODELO_URL" ||
      erro "o download do modelo não terminou; confira a internet e rode o instalador de novo"
    modelo_confere "$MODELO.parcial" || {
      rm -f "$MODELO.parcial"
      erro "o modelo baixado veio diferente do esperado; rode o instalador de novo"
    }
  fi
  mv -f "$MODELO.parcial" "$MODELO"
  ok "modelo baixado e conferido"
fi

etapa "Configuração"
ENV="$ESTACAO/.env.local"
AVISO="# Estação Nutrição: as 5 últimas linhas são do instalador (rodar de novo reescreve só elas)."
{
  echo "$AVISO"
  if [ -f "$ENV" ]; then
    grep -vxF "$AVISO" "$ENV" | grep -vE '^(ORIGENS_PERMITIDAS|WHISPER_BIN|FFMPEG_BIN|PASTA_DADOS|PORTA)=' || true
  fi
  echo "ORIGENS_PERMITIDAS=$ORIGEM_APP"
  echo "WHISPER_BIN=\"$WHISPER\""
  echo "FFMPEG_BIN=\"$FFMPEG\""
  echo "PASTA_DADOS=\"$BASE\""
  echo "PORTA=$PORTA"
} >"$ENV.novo"
mv -f "$ENV.novo" "$ENV"
chmod 600 "$ENV"
ok "a estação só atende o APP BRATAN ($ORIGEM_APP)"

etapa "Ligar sozinha quando o Mac liga"
launchctl bootout "gui/$USUARIO/$ROTULO" 2>/dev/null || true
for _ in 1 2 3 4 5; do
  lsof -nP -iTCP:"$PORTA" -sTCP:LISTEN >/dev/null 2>&1 || break
  sleep 1
done
if lsof -nP -iTCP:"$PORTA" -sTCP:LISTEN >/dev/null 2>&1; then
  erro "outro programa já usa a porta $PORTA (talvez a estação aberta à mão): feche-o e rode o instalador de novo"
fi
mkdir -p "$(dirname "$PLIST")"
cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$ROTULO</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>server.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ESTACAO</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$PREFIXO/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOGS/estacao.log</string>
  <key>StandardErrorPath</key>
  <string>$LOGS/estacao.log</string>
</dict>
</plist>
PLIST
plutil -lint "$PLIST" >/dev/null || erro "o arquivo de início automático ficou inválido"
ligou=nao
for _ in 1 2 3 4 5; do
  if launchctl bootstrap "gui/$USUARIO" "$PLIST" 2>/dev/null; then
    ligou=sim
    break
  fi
  sleep 1
done
[ "$ligou" = "sim" ] || erro "o Mac não aceitou ligar a estação sozinha"
ok "liga sozinha (o Mac pode avisar que \"node\" virou um item de segundo plano: é a estação)"

etapa "Conferindo a estação"
saude=""
for _ in $(seq 1 30); do
  saude="$(curl -s -m 2 -H "Origin: $ORIGEM_APP" "http://127.0.0.1:$PORTA/saude" || true)"
  case "$saude" in *'"ok":true'*) break ;; esac
  sleep 1
done
case "$saude" in
  *'"ok":true'*) ;;
  *) erro "a estação não respondeu; o registro dela está em $LOGS/estacao.log" ;;
esac
# shellcheck disable=SC2016 # os ${…} abaixo são do JavaScript, não do shell
"$NODE" -e '
  const s = JSON.parse(process.argv[1]);
  const linha = (certo, texto) => console.log(`  ${certo ? "✓" : "✗"} ${texto}`);
  linha(s.whisper && s.whisper.pronto, `transcrição (${(s.whisper && s.whisper.modelo) || "sem modelo"})`);
  linha(s.ffmpeg, "conversão de áudio (ffmpeg)");
  linha(s.chrome, "PDF (Google Chrome)");
  console.log(`  · IA paga: ${s.ia && s.ia.configurada ? "LIGADA (usa créditos)" : "desligada, nada é cobrado"}`);
  process.exit(s.whisper && s.whisper.pronto && s.ffmpeg && s.chrome ? 0 : 1);
' "$saude" || erro "falta uma peça (veja a lista acima)"

if [ "$ATALHO" != "nao" ]; then
  etapa "Atalho \"Nutrição Bratan\""
  mkdir -p "$(dirname "$ATALHO")"
  rm -rf "$ATALHO"
  # Sem a saída do osacompile (ele avisa que assinou o atalho); se falhar, a etapa aparece no erro.
  osacompile -o "$ATALHO" -e "do shell script \"open -a 'Google Chrome' '$ORIGEM_APP/nutricao'\"" >/dev/null 2>&1
  ok "abre o módulo Nutrição no Chrome (fica em $(dirname "$ATALHO"))"
fi

trap - ERR
echo
echo "Pronto! A Estação Nutrição está instalada e liga sozinha quando o Mac liga."
echo
echo "Na primeira consulta, o Chrome vai perguntar duas coisas. Responda Permitir nas duas:"
echo "  1. se o APP BRATAN pode acessar apps deste computador (é a estação);"
echo "  2. se pode usar o microfone."
echo "O Mac também pode pedir para o Chrome usar o microfone: clique em OK."
if [ "$ABRIR_CHROME" = "sim" ]; then open -a "Google Chrome" "$ORIGEM_APP/nutricao"; fi
echo
read -r -p "Aperte Enter para fechar esta janela. " _ || true
