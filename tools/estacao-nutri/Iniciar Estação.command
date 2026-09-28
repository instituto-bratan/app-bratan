#!/bin/bash
# Estação local da nutrição: dois cliques para ligar. Feche esta janela (ou Ctrl+C) para desligar.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "O Node.js não foi encontrado. Instale com: brew install node"
  read -r -p "Aperte Enter para fechar."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Primeira vez: instalando as dependências da estação..."
  npm install || { read -r -p "A instalação falhou. Aperte Enter para fechar."; exit 1; }
fi

npm start
