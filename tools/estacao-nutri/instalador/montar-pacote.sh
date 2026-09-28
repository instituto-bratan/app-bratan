#!/bin/bash
# MONTA O PACOTE DA ESTAÇÃO NUTRIÇÃO PARA O MAC DA GÉSSICA (28/09/2026).
#
# Gera "Estação Nutrição Bratan.zip": o instalador, o desinstalador, o LEIA-ME
# e a estação, com os arquivos do app que ela importa (roteiro e esquema da
# organização) no mesmo caminho relativo do repositório. Sem node_modules e
# sem .env.local: o instalador baixa as dependências e escreve a configuração.
#
# Uso: tools/estacao-nutri/instalador/montar-pacote.sh [pasta de saída]
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
ESTACAO="$RAIZ/tools/estacao-nutri"
SAIDA="${1:-$AQUI/dist}"
NOME="Estação Nutrição Bratan"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PACOTE="$TMP/$NOME"
DESTINO="$PACOTE/app/tools/estacao-nutri"
mkdir -p "$DESTINO"

cp "$ESTACAO"/*.ts "$ESTACAO/package.json" "$ESTACAO/package-lock.json" "$ESTACAO/README.md" "$ESTACAO/.env.example" "$DESTINO/"

# Arquivos do app que a estação importa ("../../src/..."): vão junto, no mesmo lugar.
grep -hoE "from \"\.\./\.\./src/[^\"]+\"" "$ESTACAO"/*.ts | sed -E 's/^from "\.\.\/\.\.\/(.*)"$/\1/' | sort -u | while read -r relativo; do
  mkdir -p "$PACOTE/app/$(dirname "$relativo")"
  cp "$RAIZ/$relativo" "$PACOTE/app/$relativo"
  # "import type" some ao rodar; qualquer outro import relativo teria de vir junto.
  if grep -E "^import " "$RAIZ/$relativo" | grep -vE "^import type " | grep -qE "from \"\."; then
    echo "✗ $relativo importa outros arquivos; o pacote precisaria levá-los também." >&2
    exit 1
  fi
done

# Versão: o instalador mostra na tela, para saber qual pacote entrou no Mac dela.
echo "$(date +%Y-%m-%d) $(git -C "$RAIZ" rev-parse --short HEAD 2>/dev/null || echo sem-git)" >"$PACOTE/app/VERSAO"

cp "$AQUI/Instalar.command" "$AQUI/Desinstalar.command" "$AQUI/LEIA-ME.txt" "$PACOTE/"
chmod +x "$PACOTE/Instalar.command" "$PACOTE/Desinstalar.command"

mkdir -p "$SAIDA"
rm -f "$SAIDA/$NOME.zip"
# Sem atributos estendidos deste Mac (arquivos "._", quarentena, ACL): só o conteúdo.
ditto -c -k --norsrc --noextattr --noqtn --noacl --keepParent "$PACOTE" "$SAIDA/$NOME.zip"
echo "$SAIDA/$NOME.zip"
