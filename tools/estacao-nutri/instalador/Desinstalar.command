#!/bin/bash
# ESTAÇÃO NUTRIÇÃO · INSTITUTO BRATAN — TIRA A ESTAÇÃO DESTE MAC (28/09/2026).
#
# Pergunta antes de mexer em qualquer coisa. Desliga o início automático e apaga
# o programa, o registro, o atalho e as cópias de trabalho das consultas (sem a
# estação, ninguém mais as apagaria no prazo). O modelo de transcrição só é
# apagado se ela pedir. O que está no Chrome (prontuários, gravações) não muda.
set -uo pipefail

# Valores de verdade. As variáveis ESTACAO_* existem só para o teste (testar.sh).
BASE="${ESTACAO_BASE:-$HOME/Library/Application Support/EstacaoNutri}"
ROTULO="${ESTACAO_ROTULO:-br.com.institutobratan.estacao-nutri}"
LOGS="${ESTACAO_LOGS:-$BASE/logs}"
ATALHO="${ESTACAO_ATALHO:-$HOME/Applications/Nutrição Bratan.app}"

# "s", "S", "sim", "Sim", com ou sem espaço: tudo vale como sim.
disse_sim() { case "$(printf %s "$1" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')" in s | sim) return 0 ;; *) return 1 ;; esac; }

echo "Estação Nutrição · Instituto Bratan — desinstalar"
echo
confirma="${ESTACAO_CONFIRMAR:-}"
if [ -z "$confirma" ]; then
  read -r -p "Tirar a Estação Nutrição deste Mac? Digite s e aperte Enter (só Enter cancela): " confirma </dev/tty 2>/dev/null || confirma=""
fi
if ! disse_sim "$confirma"; then
  echo "Nada foi mudado."
  ( read -r -p "Aperte Enter para fechar. " _ </dev/tty ) 2>/dev/null || true
  exit 0
fi

launchctl bootout "gui/$(id -u)/$ROTULO" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$ROTULO.plist"
echo "  ✓ a estação não liga mais sozinha"
rm -rf "$BASE/programa" "$BASE/programa.novo" "$BASE/programa.antigo" "$BASE/.prova" "$LOGS"
echo "  ✓ programa apagado"
rm -rf "$BASE/audios" "$BASE/trabalho" "$BASE/transcricoes"
echo "  ✓ cópias de áudio e de transcrição da estação apagadas"
if [ "$ATALHO" != "nao" ]; then
  rm -rf "$ATALHO"
  echo "  ✓ atalho \"Nutrição Bratan\" apagado"
fi

resposta="${ESTACAO_APAGAR_MODELO:-}"
if [ -z "$resposta" ]; then
  echo
  echo "Apagar também o modelo de transcrição (574 MB)? Só vale a pena se você não for instalar de novo."
  read -r -p "Digite s e aperte Enter para apagar, ou só Enter para manter: " resposta </dev/tty 2>/dev/null || resposta=""
fi
if disse_sim "$resposta"; then
  rm -rf "$BASE"
  echo "  ✓ modelo apagado"
else
  echo "  · modelo mantido em $BASE/modelos"
fi

echo
echo "Os prontuários, as gravações e as transcrições que ficam no Chrome, no módulo Nutrição, NÃO foram"
echo "apagados por aqui. Para tirá-los deste Mac, fale com o Lucas."
echo "O Node, o ffmpeg, o whisper e o Chrome continuam instalados (outros programas podem usar)."
( read -r -p "Aperte Enter para fechar. " _ </dev/tty ) 2>/dev/null || true
