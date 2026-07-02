#!/usr/bin/env bash
# Conta linhas das tabelas principais e estima a taxa de crescimento de producao_eventos.
# So usa a chave publica (anon) -- nao precisa de token, sempre pode rodar.
# Uso: bash contagem_tabelas.sh [caminho-do-repo]

set -uo pipefail

REPO="${1:-.}"
STATUS_JS="$REPO/status.js"

if [ ! -f "$STATUS_JS" ]; then
  echo "ERRO: nao achei $STATUS_JS. Rode a partir da raiz do repo brasmat-mes, ou passe o caminho como argumento."
  exit 1
fi

SUPA_URL=$(grep -oE 'SUPA_URL *= *"[^"]+"' "$STATUS_JS" | head -1 | sed -E 's/.*"(.*)"/\1/')
SUPA_KEY=$(grep -oE 'SUPA_KEY *= *"[^"]+"' "$STATUS_JS" | head -1 | sed -E 's/.*"(.*)"/\1/')

if [ -z "$SUPA_URL" ] || [ -z "$SUPA_KEY" ]; then
  echo "ERRO: nao consegui extrair SUPA_URL/SUPA_KEY de $STATUS_JS."
  exit 1
fi

contar(){
  local tbl="$1"
  curl -s -o /dev/null -D - --max-time 15 \
    -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
    -H "Prefer: count=exact" -H "Range: 0-0" \
    "$SUPA_URL/rest/v1/$tbl?select=*" 2>/dev/null | grep -i "content-range" | sed -E 's#.*/([0-9]+).*#\1#'
}

echo "== Contagem de linhas (tabelas principais) =="
for tbl in producao_eventos posicao_atual demanda_itens demanda_clientes kanban_operadores; do
  n=$(contar "$tbl")
  echo "  $tbl: ${n:-?}"
done

echo ""
echo "== Crescimento de producao_eventos (evento mais antigo x mais recente) =="
MAIS_ANTIGO=$(curl -s --max-time 15 -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  "$SUPA_URL/rest/v1/producao_eventos?select=data_evento&order=data_evento.asc&limit=1" | grep -oE '"[0-9]{4}-[0-9]{2}-[0-9]{2}')
MAIS_RECENTE=$(curl -s --max-time 15 -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  "$SUPA_URL/rest/v1/producao_eventos?select=data_evento&order=data_evento.desc&limit=1" | grep -oE '"[0-9]{4}-[0-9]{2}-[0-9]{2}')
echo "  mais antigo: ${MAIS_ANTIGO#\"}"
echo "  mais recente: ${MAIS_RECENTE#\"}"
