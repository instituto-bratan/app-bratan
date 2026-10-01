#!/usr/bin/env bash
# COMPILA O MEU BRATAN PARA O SIMULADOR DE IPHONE (01/10/2026).
#   bash scripts/compilar-ios.sh            # compila, instala e abre no iPhone 18 Pro
#   bash scripts/compilar-ios.sh so-compilar
#
# Por que compilar de uma CÓPIA fora do projeto: a pasta Documents/Codex fica no
# iCloud Drive e o xcodebuild TRAVA ao abrir um projeto dentro do iCloud (fica
# preso carregando o .xcodeproj, sem erro nenhum). Fora do iCloud o mesmo
# projeto compila em minutos. A cópia é descartável; o ios/ do repositório é o
# que vale e o Package.resolved volta para lá no fim.
set -euo pipefail
cd "$(dirname "$0")/.."
RAIZ="$PWD"
COPIA="$HOME/Library/Caches/MeuBratan-ios"
APARELHO="${APARELHO:-iPhone 18 Pro}"

npm run app:ios

rm -rf "$COPIA/ios"
mkdir -p "$COPIA"
cp -R "$RAIZ/ios" "$COPIA/ios"

echo "→ compilando para '$APARELHO' em $COPIA (fora do iCloud)"
xcodebuild -project "$COPIA/ios/App/App.xcodeproj" -scheme App -configuration Debug \
  -destination "platform=iOS Simulator,name=$APARELHO" \
  -derivedDataPath "$COPIA/DerivedData" -skipMacroValidation build \
  > "$COPIA/xcodebuild.log" 2>&1 || { grep -E "error:" "$COPIA/xcodebuild.log" | grep -v "xpc\|Logging" | head -20; echo "✗ falhou; log em $COPIA/xcodebuild.log"; exit 1; }

RESOLVIDO="App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved"
if [ -f "$COPIA/ios/$RESOLVIDO" ]; then
  mkdir -p "$(dirname "$RAIZ/ios/$RESOLVIDO")"
  cp "$COPIA/ios/$RESOLVIDO" "$RAIZ/ios/$RESOLVIDO"
fi

APP="$COPIA/DerivedData/Build/Products/Debug-iphonesimulator/App.app"
echo "✓ compilado: $APP"
[ "${1:-}" = "so-compilar" ] && exit 0

xcrun simctl boot "$APARELHO" 2>/dev/null || true
open -b com.apple.dt.DeviceHub 2>/dev/null || open "/Applications/Xcode.app/Contents/Applications/DeviceHub.app" 2>/dev/null || true
xcrun simctl install booted "$APP"
xcrun simctl launch booted br.com.institutobratan.meubratan
echo "✓ Meu Bratan aberto no simulador"
