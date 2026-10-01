#!/usr/bin/env bash
# CONTA DO REVISOR DA APPLE (Diretriz 2.1). Roda na máquina do Lucas, no Terminal:
#   bash scripts/definir-conta-de-revisao.sh
# Pede o login e a senha sem mostrar na tela e grava como segredos da função
# portal-paciente. Essa conta abre o portal com DADOS DE EXEMPLO: não encosta em
# paciente nenhum. O mesmo login e a mesma senha vão no App Store Connect, em
# "Informações para a revisão do app". Para desligar: apague os dois segredos.
set -euo pipefail
cd "$(dirname "$0")/.."

read -r -p "E-mail de login do revisor (ex.: revisao.apple@institutobratan.com.br): " LOGIN
read -r -s -p "Senha do revisor (12 caracteres ou mais): " SENHA; echo
read -r -s -p "Repita a senha: " SENHA2; echo
[ "$SENHA" = "$SENHA2" ] || { echo "As senhas não batem. Nada foi gravado."; exit 1; }
[ ${#SENHA} -ge 12 ] || { echo "A senha precisa de 12 caracteres ou mais. Nada foi gravado."; exit 1; }
[ -n "$LOGIN" ] || { echo "Faltou o login. Nada foi gravado."; exit 1; }

export SUPABASE_ACCESS_TOKEN="$(security find-generic-password -s "Supabase CLI" -w)"
ARQUIVO="$(mktemp)"
trap 'rm -f "$ARQUIVO"' EXIT
chmod 600 "$ARQUIVO"
printf 'PORTAL_REVISAO_LOGIN=%s\nPORTAL_REVISAO_SENHA=%s\n' "$LOGIN" "$SENHA" > "$ARQUIVO"
supabase secrets set --project-ref xdccpfdoxrjbzfdvoonr --env-file "$ARQUIVO"
echo "Pronto. Teste em https://app-bratan.vercel.app/meu, em \"Entrar com e-mail e senha\"."
