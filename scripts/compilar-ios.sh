#!/usr/bin/env bash
# COMPILA O MEU BRATAN PARA O SIMULADOR DE IPHONE.
#   bash scripts/compilar-ios.sh              # compila, instala e abre no iPhone 18 Pro
#   bash scripts/compilar-ios.sh so-compilar
#   APARELHO="iPhone 18 Pro Max" bash scripts/compilar-ios.sh
#
# Desde 02/10/2026 o projeto mora em ~/Projetos/Codex, fora do iCloud. Dentro do
# iCloud Drive o xcodebuild TRAVA ao abrir o projeto (sem erro nenhum), por isso
# este script se recusa a rodar a partir da cópia antiga em ~/Documents/Codex.
# O Xcode 27 não tem mais o app Simulator: o iPhone aparece no DeviceHub.
set -euo pipefail
cd "$(dirname "$0")/.."
RAIZ="$(pwd -P)"
case "$RAIZ" in
  */Documents/Codex/*|*/Mobile\ Documents/*)
    echo "✗ Esta é a cópia que ficou no iCloud. Rode a partir de ~/Projetos/Codex/2026-06-24/files-mentioned-by-the-user-eu/work/app-bratan"
    exit 1 ;;
esac
APARELHO="${APARELHO:-iPhone 18 Pro}"
SAIDA="$HOME/Library/Caches/MeuBratan-ios"
mkdir -p "$SAIDA"

npm run app:ios

echo "→ compilando para '$APARELHO'"
xcodebuild -project "$RAIZ/ios/App/App.xcodeproj" -scheme App -configuration Debug \
  -destination "platform=iOS Simulator,name=$APARELHO" \
  -derivedDataPath "$SAIDA/DerivedData" -skipMacroValidation build \
  > "$SAIDA/xcodebuild.log" 2>&1 || { grep -E "error:" "$SAIDA/xcodebuild.log" | grep -v "xpc\|Logging" | head -20; echo "✗ falhou; log em $SAIDA/xcodebuild.log"; exit 1; }

APP="$SAIDA/DerivedData/Build/Products/Debug-iphonesimulator/App.app"
echo "✓ compilado: $APP"
[ "${1:-}" = "so-compilar" ] && exit 0

xcrun simctl boot "$APARELHO" 2>/dev/null || true
open "/Applications/Xcode.app/Contents/Applications/DeviceHub.app" 2>/dev/null || true
xcrun simctl install booted "$APP"
xcrun simctl launch booted br.com.institutobratan.meubratan
echo "✓ Meu Bratan aberto no simulador"
