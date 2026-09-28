#!/bin/bash
# ESTAÇÃO NUTRIÇÃO · INSTITUTO BRATAN — TIRA A ESTAÇÃO DESTE MAC (28/09/2026).
#
# Desliga o início automático e apaga o programa, o registro e o atalho. As
# gravações, as transcrições e o modelo só são apagados se ela pedir.
set -uo pipefail

# Valores de verdade. As variáveis ESTACAO_* existem só para o teste (testar.sh).
BASE="${ESTACAO_BASE:-$HOME/Library/Application Support/EstacaoNutri}"
ROTULO="${ESTACAO_ROTULO:-br.com.institutobratan.estacao-nutri}"
LOGS="${ESTACAO_LOGS:-$HOME/Library/Logs/EstacaoNutri}"
ATALHO="${ESTACAO_ATALHO:-$HOME/Applications/Nutrição Bratan.app}"

echo "Estação Nutrição · Instituto Bratan — desinstalar"
echo
launchctl bootout "gui/$(id -u)/$ROTULO" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$ROTULO.plist"
echo "  ✓ a estação não liga mais sozinha"
rm -rf "$BASE/programa" "$LOGS"
echo "  ✓ programa apagado"
if [ "$ATALHO" != "nao" ]; then
  rm -rf "$ATALHO"
  echo "  ✓ atalho \"Nutrição Bratan\" apagado"
fi

resposta="${ESTACAO_APAGAR_DADOS:-}"
if [ -z "$resposta" ]; then
  echo
  echo "Apagar também as gravações, as transcrições e o modelo de transcrição deste Mac?"
  echo "Isso não tem volta. Os registros do módulo Nutrição, que ficam no Chrome, não mudam."
  read -r -p "Digite s e aperte Enter para apagar, ou só Enter para manter: " resposta || resposta=""
fi
case "$resposta" in
  s | S | sim)
    rm -rf "$BASE"
    echo "  ✓ gravações, transcrições e modelo apagados"
    ;;
  *) echo "  · gravações, transcrições e modelo mantidos em $BASE" ;;
esac

echo
echo "O Node, o ffmpeg, o whisper e o Chrome continuam instalados (outros programas podem usar)."
read -r -p "Aperte Enter para fechar. " _ || true
