#!/bin/bash
# ESTAÇÃO NUTRIÇÃO · INSTITUTO BRATAN — INSTALADOR PARA O MAC DA DRA. GÉSSICA (28/09/2026).
#
# Dois cliques. Instala o que falta (Homebrew, Node, ffmpeg, whisper e Google
# Chrome), copia a estação, baixa e confere o modelo de transcrição e deixa a
# estação ligando sozinha quando o Mac liga. Nada aqui usa IA paga.
# Rodar de novo atualiza a estação e mantém os dados e a configuração dela. A
# versão nova é montada de lado e só entra no lugar da antiga quando está
# pronta: se a atualização falhar no meio, a estação que funcionava continua igual.
set -Eeuo pipefail

# Terminal aberto pelo Rosetta (Mac com chip Apple): roda de novo nativo.
if [ "$(sysctl -in sysctl.proc_translated 2>/dev/null)" = "1" ]; then
  exec arch -arm64 /bin/bash "$0" "$@"
fi

# Valores de verdade. As variáveis ESTACAO_* existem só para o teste (testar.sh).
ORIGEM_APP="${ESTACAO_ORIGEM:-https://app-bratan.vercel.app}"
BASE="${ESTACAO_BASE:-$HOME/Library/Application Support/EstacaoNutri}"
PORTA="${ESTACAO_PORTA:-8787}"
ROTULO="${ESTACAO_ROTULO:-br.com.institutobratan.estacao-nutri}"
LOGS="${ESTACAO_LOGS:-$BASE/logs}"
ATALHO="${ESTACAO_ATALHO:-$HOME/Applications/Nutrição Bratan.app}"
ABRIR_CHROME="${ESTACAO_ABRIR_CHROME:-sim}"

MODELO_NOME="ggml-large-v3-turbo-q5_0.bin"
# Commit fixo do repositório do whisper.cpp: o "main" pode trocar o arquivo um dia.
MODELO_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/$MODELO_NOME"
MODELO_SHA256="394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"
# Acompanha o MACOS_OLDEST_SUPPORTED do instalador do Homebrew. Abaixo disso não
# há programas prontos e o Mac compilaria tudo por horas. Sobe quando o Homebrew subir.
MACOS_MINIMO=15

PACOTE="$(cd "$(dirname "$0")" && pwd)"
VERSAO="$(cat "$PACOTE/app/VERSAO" 2>/dev/null || echo "?")"
PROGRAMA="$BASE/programa"
NOVO="$BASE/programa.novo"
ANTIGO="$BASE/programa.antigo"
ESTACAO="$PROGRAMA/tools/estacao-nutri"
MODELO="$BASE/modelos/$MODELO_NOME"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"
USUARIO="$(id -u)"
# Só o Homebrew de Mac com chip Apple. Um /usr/local/bin/brew herdado de um Mac
# Intel não serve: não instala nada num Mac com chip Apple.
PREFIXO=/opt/homebrew
BREW="$PREFIXO/bin/brew"
NODE="$PREFIXO/bin/node"
NPM="$PREFIXO/bin/npm"
WHISPER="$PREFIXO/bin/whisper-cli"
FFMPEG="$PREFIXO/bin/ffmpeg"

# Uma execução por vez: dois cliques seguidos abririam duas janelas mexendo nas
# mesmas pastas. O kernel solta a trava quando o processo morre; nunca fica velha.
mkdir -p "$BASE"
if [ -z "${ESTACAO_TRAVADO:-}" ]; then
  if ! /usr/bin/lockf -s -t 0 "$BASE/.instalando" true; then
    echo "O instalador já está aberto em outra janela do Terminal. Use aquela janela."
    read -r -p "Aperte Enter para fechar. " _ </dev/tty 2>/dev/null || true
    exit 1
  fi
  ESTACAO_TRAVADO=1 exec /usr/bin/lockf -s -t 0 "$BASE/.instalando" /bin/bash "$0" "$@"
fi

# Mac acordado enquanto instala: o Homebrew e o download demoram.
caffeinate -i -w $$ &

MANTER_SUDO=""
ao_sair() {
  [ -z "$MANTER_SUDO" ] || kill "$MANTER_SUDO" 2>/dev/null || true
}
trap ao_sair EXIT

passo="começo"
parou() {
  {
    echo
    echo "✗ A instalação parou em: $passo."
    echo "  Tire um print desta janela e mande para o Lucas."
  } >&2
  read -r -p "Aperte Enter para fechar. " _ </dev/tty 2>/dev/null || true
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
livre_mb() { echo $(( $(df -Pk "$1" | awk 'NR == 2 { print $4 }') / 1024 )); }
baixar_modelo() {
  # Continua de onde parou; tenta de novo em qualquer erro; desiste se a
  # conexão ficar 60 s sem entregar nada (troca de rede, Wi-Fi que caiu).
  curl -fL --retry 5 --retry-all-errors --retry-delay 5 --speed-limit 1024 --speed-time 60 -C - --progress-bar -o "$MODELO.parcial" "$MODELO_URL"
}

echo "Estação Nutrição · Instituto Bratan · versão $VERSAO"
echo "Instala neste Mac a parte do APP BRATAN que transcreve as consultas e gera o PDF do plano."
echo "Nada aqui é cobrado. Na primeira vez precisa de internet, pode baixar até 2 GB e levar de 30 a 60 minutos."
echo "Deixe o Mac na tomada e não feche esta janela."

etapa "Conferindo o Mac"
[ "$(uname -s)" = "Darwin" ] || erro "este instalador é só para Mac"
[ "$(sysctl -in hw.optional.arm64 2>/dev/null)" = "1" ] || erro "este Mac tem processador Intel. A estação precisa de um Mac com chip Apple (M1 ou mais novo). Avise o Lucas."
MACOS="$(sw_vers -productVersion)"
[ "${MACOS%%.*}" -ge "$MACOS_MINIMO" ] || erro "este Mac está com o macOS $MACOS, antigo demais. Atualize em Ajustes do Sistema > Geral > Atualização de Software (é grátis) e rode o instalador de novo"
acesso="$(ls "$PACOTE/app/tools/estacao-nutri" 2>&1 >/dev/null || true)"
case "$acesso" in
  *"Operation not permitted"*)
    erro "o Terminal não tem permissão para ler a pasta do instalador. Em Ajustes do Sistema > Privacidade e Segurança > Arquivos e Pastas > Terminal, ligue a pasta (Transferências, Mesa ou o pen drive) e rode de novo. Ou arraste a pasta \"Estação Nutrição Bratan\" para a sua pasta pessoal e rode de lá"
    ;;
esac
[ -d "$PACOTE/app/tools/estacao-nutri" ] || erro "a pasta \"app\" precisa estar ao lado do instalador (descompacte o pacote inteiro)"
# Espaço conforme o que falta: ferramentas da Apple (~2 GB), Homebrew (~1 GB) e Chrome (~1,5 GB, mais a atualização).
precisa_mb=1500
[ -d /Library/Developer/CommandLineTools ] || precisa_mb=$((precisa_mb + 2500))
[ -x "$BREW" ] || precisa_mb=$((precisa_mb + 1000))
[ -d "/Applications/Google Chrome.app" ] || precisa_mb=$((precisa_mb + 2000))
livre="$(livre_mb "$HOME")"
[ "$livre" -gt "$precisa_mb" ] || erro "pouco espaço livre no disco: são precisos $(( (precisa_mb + 999) / 1000 )) GB e há $(( livre / 1000 )) GB. Libere espaço em Ajustes do Sistema > Geral > Armazenamento e rode de novo (o Finder pode mostrar um número maior, porque conta o que ainda pode ser apagado)"
ok "macOS $MACOS, chip Apple, $(( livre / 1000 )) GB livres"

# Instalar o Homebrew ou o Chrome pede a senha de um usuário administrador.
if [ ! -x "$BREW" ] || [ ! -d "/Applications/Google Chrome.app" ]; then
  id -Gn | tr ' ' '\n' | grep -qx admin || erro "seu usuário do Mac não é administrador. Peça a quem cuida do Mac para torná-lo administrador (Ajustes do Sistema > Usuários e Grupos) e rode de novo NO SEU usuário. Se não for possível: o administrador roda este instalador uma vez no usuário dele, encerra a sessão (menu Apple > Encerrar Sessão), e depois você entra no seu usuário e roda o instalador de novo"
  echo "  Digite a senha do Mac e aperte Enter (nada aparece enquanto você digita; é normal)."
  sudo -v -p "  Senha do Mac: " || erro "a senha não foi aceita; rode o instalador de novo"
  # Mantém a senha válida enquanto o instalador roda, para não pedir de novo no meio.
  ( while kill -0 "$$" 2>/dev/null; do sudo -n -v 2>/dev/null || true; sleep 50; done ) &
  MANTER_SUDO=$!
fi

etapa "Homebrew (o instalador de programas do Mac)"
if [ -x "$BREW" ]; then
  ok "Homebrew já estava instalado"
else
  echo "  Instalando o Homebrew e as ferramentas da Apple de que ele precisa. Leva de 15 a 30 minutos, com textos"
  echo "  em inglês na tela. Não digite nada. Se abrir uma janela do Mac pedindo para instalar as \"ferramentas de"
  echo "  linha de comando\", clique em Instalar (não em \"Obter Xcode\"), espere terminar e só então aperte uma"
  echo "  tecla nesta janela."
  curl -fsSL --retry 3 https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh -o "$BASE/.homebrew-install.sh" || erro "não deu para baixar o instalador do Homebrew; confira a internet e rode de novo"
  NONINTERACTIVE=1 /bin/bash "$BASE/.homebrew-install.sh" || erro "o Homebrew não terminou de instalar"
  rm -f "$BASE/.homebrew-install.sh"
  [ -x "$BREW" ] || erro "o Homebrew não apareceu em $PREFIXO"
fi
eval "$("$BREW" shellenv)"
# Instalar o que falta sem atualizar o que ela já tem.
export HOMEBREW_NO_INSTALL_UPGRADE=1 HOMEBREW_NO_ENV_HINTS=1 HOMEBREW_NO_ANALYTICS=1
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
[ -x "$NODE" ] || "$BREW" link --formula node >/dev/null 2>&1 || true
[ -x "$NODE" ] || erro "o Node está instalado mas não aparece em $PREFIXO/bin"
node_serve() { [ "$("$NODE" -p 'Boolean(process.features.typescript)' 2>/dev/null || true)" = "true" ]; }
if ! node_serve; then
  echo "  atualizando o Node (a estação precisa de uma versão recente)…"
  "$BREW" upgrade --formula node
fi
node_serve || erro "o Node deste Mac é antigo demais para a estação"
[ -x "$WHISPER" ] || erro "o whisper-cli não apareceu em $PREFIXO/bin"
[ -x "$FFMPEG" ] || erro "o ffmpeg não apareceu em $PREFIXO/bin"
ok "Node $("$NODE" --version), ffmpeg e whisper prontos"

etapa "Google Chrome (gera o PDF e é o navegador do APP BRATAN)"
# O gerador de PDF só procura o Chrome em /Applications.
if [ -d "/Applications/Google Chrome.app" ]; then
  ok "Chrome já estava instalado"
else
  echo "  instalando o Google Chrome…"
  # Registrado no Homebrew mas apagado de /Applications: só o reinstall o traz de volta.
  if "$BREW" list --cask google-chrome >/dev/null 2>&1; then
    "$BREW" reinstall --cask google-chrome
  else
    "$BREW" install --cask google-chrome
  fi
  [ -d "/Applications/Google Chrome.app" ] || erro "o Chrome não foi instalado em /Applications"
  ok "Chrome instalado"
fi

etapa "Estação Nutrição (versão $VERSAO)"
mkdir -p "$BASE/modelos" "$LOGS"
# Montada de lado; a estação em uso (se houver) não é tocada até tudo estar pronto.
rm -rf "$NOVO" "$ANTIGO"
rsync -a --exclude ".env.local" --exclude "node_modules" "$PACOTE/app/" "$NOVO/"
[ ! -f "$ESTACAO/.env.local" ] || cp -p "$ESTACAO/.env.local" "$NOVO/tools/estacao-nutri/.env.local"
if ! (cd "$NOVO/tools/estacao-nutri" && "$NPM" ci --omit=dev --no-audit --no-fund --loglevel=error >/dev/null); then
  rm -rf "$NOVO"
  if [ -d "$ESTACAO" ]; then
    erro "não deu para baixar as peças da estação (confira a internet). A estação que já estava instalada continua funcionando; rode o instalador de novo mais tarde"
  fi
  erro "não deu para baixar as peças da estação; confira a internet e rode o instalador de novo"
fi
ok "estação preparada"

etapa "Modelo de transcrição (574 MB, só na primeira vez)"
if modelo_confere "$MODELO"; then
  ok "modelo já estava baixado e conferido"
else
  if ! modelo_confere "$MODELO.parcial"; then
    [ "$(livre_mb "$BASE")" -gt 1000 ] || erro "pouco espaço livre para o modelo (precisa de 1 GB). Libere espaço em Ajustes do Sistema > Geral > Armazenamento e rode de novo"
    echo "  baixando… (se a internet cair, rode o instalador de novo: ele continua de onde parou)"
    if ! baixar_modelo; then
      rc=$?
      case "$rc" in
        23) erro "o disco encheu durante o download. Libere espaço e rode o instalador de novo" ;;
        22 | 33)
          # O pedaço guardado não serve mais (o servidor não aceitou continuar): começa do zero.
          rm -f "$MODELO.parcial"
          baixar_modelo || erro "o download do modelo não terminou; confira a internet e rode o instalador de novo"
          ;;
        *) erro "o download do modelo não terminou; confira a internet e rode o instalador de novo" ;;
      esac
    fi
    modelo_confere "$MODELO.parcial" || {
      rm -f "$MODELO.parcial"
      erro "o modelo baixado veio diferente do esperado; rode o instalador de novo"
    }
  fi
  mv -f "$MODELO.parcial" "$MODELO"
  ok "modelo baixado e conferido"
fi

etapa "Configuração"
ENV="$NOVO/tools/estacao-nutri/.env.local"
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
# O Time Machine não copia os áudios nem as transcrições (a marca fica na pasta-mãe
# e vale para as subpastas, mesmo recriadas). O que está no Chrome não passa por aqui.
tmutil addexclusion "$BASE" >/dev/null 2>&1 || true
ok "a estação só atende o APP BRATAN ($ORIGEM_APP); áudios fora do Time Machine"

etapa "Ligar sozinha quando o Mac liga"
launchctl bootout "gui/$USUARIO/$ROTULO" 2>/dev/null || true
for _ in 1 2 3 4 5 6 7 8 9 10; do
  lsof -nP -iTCP:"$PORTA" -sTCP:LISTEN >/dev/null 2>&1 || break
  sleep 1
done
if lsof -nP -iTCP:"$PORTA" -sTCP:LISTEN >/dev/null 2>&1; then
  erro "outro programa já usa a porta $PORTA (talvez a estação aberta à mão): feche-o e rode o instalador de novo"
fi
# Porta livre para este usuário, mas alguém responde: é a estação de outro usuário do Mac.
if curl -s -m 2 -o /dev/null "http://127.0.0.1:$PORTA/saude"; then
  erro "há uma estação ligada em outro usuário deste Mac. Encerre a sessão desse usuário (menu Apple > Encerrar Sessão) e rode o instalador de novo"
fi
# Troca a estação em uso pela preparada. A antiga fica de lado até o fim.
[ ! -d "$PROGRAMA" ] || mv "$PROGRAMA" "$ANTIGO"
mv "$NOVO" "$PROGRAMA"
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
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>$LOGS/estacao.log</string>
  <key>StandardErrorPath</key>
  <string>$LOGS/estacao.log</string>
</dict>
</plist>
PLIST
plutil -lint "$PLIST" >/dev/null || erro "o arquivo de início automático ficou inválido"
# Se o item foi desligado em Ajustes do Sistema, o Mac guarda isso; religa antes.
launchctl enable "gui/$USUARIO/$ROTULO" 2>/dev/null || true
ligou=nao
motivo=""
for _ in 1 2 3 4 5; do
  if motivo="$(launchctl bootstrap "gui/$USUARIO" "$PLIST" 2>&1)"; then
    ligou=sim
    break
  fi
  sleep 1
done
if [ "$ligou" != "sim" ]; then
  echo "  o Mac respondeu: $motivo"
  erro "o Mac não aceitou ligar a estação sozinha. Abra Ajustes do Sistema > Geral > Itens de Início e Extensões, em \"Permitir em Segundo Plano\" ligue \"node\" e rode o instalador de novo"
fi
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
# De verdade, com as versões que este Mac tem: um PDF e uma transcrição curta.
PROVA="$BASE/.prova"
rm -rf "$PROVA"
mkdir -p "$PROVA"
curl -s -m 120 -H "Origin: $ORIGEM_APP" -H "Content-Type: application/json" \
  -d '{"html":"<!doctype html><html><body><p>Estação Nutrição: PDF de conferência.</p></body></html>"}' \
  -o "$PROVA/prova.pdf" "http://127.0.0.1:$PORTA/pdf" || true
[ "$(head -c 4 "$PROVA/prova.pdf" 2>/dev/null || true)" = "%PDF" ] || erro "o Chrome não gerou o PDF de conferência; o registro está em $LOGS/estacao.log"
ok "PDF de conferência gerado"
"$FFMPEG" -loglevel error -y -f lavfi -i "sine=frequency=440:duration=2" -ac 1 -ar 16000 "$PROVA/prova.wav"
# shellcheck disable=SC2016 # os ${…} abaixo são do JavaScript, não do shell
"$NODE" - "$PROVA/prova.wav" "$PORTA" "$ORIGEM_APP" <<'JS' || erro "a transcrição de conferência não terminou; o registro está em $LOGS/estacao.log"
const [arquivo, porta, origem] = process.argv.slice(2);
const base = `http://127.0.0.1:${porta}`;
const h = { Origin: origem };
const id = `conferencia-${process.pid}`;
const audio = await (await import("node:fs/promises")).readFile(arquivo);
const envio = await fetch(`${base}/transcricoes?gravacao=${id}`, { method: "POST", headers: { ...h, "Content-Type": "audio/wav" }, body: audio });
if (!envio.ok) process.exit(1);
const { jobId } = await envio.json();
let estado = null;
for (let i = 0; i < 120; i++) {
  await new Promise((ok) => setTimeout(ok, 1000));
  estado = await (await fetch(`${base}/transcricoes/${jobId}`, { headers: h })).json();
  if (estado.estado === "pronta" || estado.estado === "erro") break;
}
await fetch(`${base}/audios/${id}`, { method: "DELETE", headers: h });
process.exit(estado && estado.estado === "pronta" ? 0 : 1);
JS
ok "transcrição de conferência concluída"
rm -rf "$PROVA" "$ANTIGO"

# O módulo abre sempre no mesmo perfil do Chrome: é nele que ficam os prontuários.
PERFIL="$("$NODE" -e 'try{const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log((s.profile&&s.profile.last_used)||"Default")}catch{console.log("Default")}' "$HOME/Library/Application Support/Google/Chrome/Local State")"
if [ "$ATALHO" != "nao" ]; then
  etapa "Atalho \"Nutrição Bratan\""
  mkdir -p "$(dirname "$ATALHO")"
  rm -rf "$ATALHO"
  # Sem a saída do osacompile (ele avisa que assinou o atalho); se falhar, a etapa aparece no erro.
  osacompile -o "$ATALHO" -e "do shell script \"open -na 'Google Chrome' --args --profile-directory='$PERFIL' '$ORIGEM_APP/nutricao'\"" >/dev/null 2>&1
  ok "abre o módulo Nutrição no Chrome, sempre no perfil \"$PERFIL\" (fica em $(dirname "$ATALHO"))"
fi

trap - ERR
echo
echo "Pronto! A Estação Nutrição (versão $VERSAO) está instalada e liga sozinha quando o Mac liga."
echo "Ela só atende o APP BRATAN, e a IA paga está desligada: nada é cobrado."
echo
echo "Ao abrir o módulo Nutrição, o Chrome pergunta se o site pode acessar apps deste computador: clique em Permitir."
echo "Se for a primeira vez do Chrome, o Mac pergunta se quer abrir um app baixado da Internet: clique em Abrir."
echo "Na primeira gravação, escolha \"Permitir ao visitar o site\" para o microfone; se o Mac perguntar, clique em Permitir."
echo "Os prontuários ficam neste Chrome, no perfil \"$PERFIL\". Uma vez por semana, baixe a cópia de segurança (Nutrição > Biblioteca)."
if [ "$ABRIR_CHROME" = "sim" ]; then open -na "Google Chrome" --args "--profile-directory=$PERFIL" "$ORIGEM_APP/nutricao"; fi
echo
read -r -p "Aperte Enter para fechar esta janela. " _ </dev/tty 2>/dev/null || true
