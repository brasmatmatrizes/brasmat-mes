#!/usr/bin/env bash
# Backup dos dados de negocio do BRASMAT MES para CSV local + download dos anexos.
# So usa a chave publica (anon) -- somente leitura, sempre pode rodar.
# Uso: bash backup.sh [caminho-do-repo] [--completo]
#   --completo  inclui tambem producao_eventos (grande, origem externa)

set -uo pipefail

REPO="."
COMPLETO=0
for arg in "$@"; do
  case "$arg" in
    --completo) COMPLETO=1 ;;
    *) REPO="$arg" ;;
  esac
done

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

DIR="$HOME/brasmat-mes-backups/$(date +%Y-%m-%d_%H%M)"
mkdir -p "$DIR"

exportar_csv(){
  local tbl="$1"
  local out="$DIR/$tbl.csv"
  curl -s --max-time 120 \
    -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
    -H "Accept: text/csv" \
    "$SUPA_URL/rest/v1/$tbl?select=*&limit=100000" -o "$out"
  if [ ! -s "$out" ]; then
    echo "  $tbl: FALHOU (arquivo vazio)"
    return 1
  fi
  # linhas de dados = total de linhas - 1 (cabecalho)
  local n
  n=$(( $(wc -l < "$out") - 1 ))
  echo "  $tbl: $n linha(s) -> $out"
}

echo "== Exportando tabelas de negocio (CSV) =="
FALHAS=0
for tbl in demanda_itens demanda_clientes kanban_operadores; do
  exportar_csv "$tbl" || FALHAS=$((FALHAS+1))
done

if [ "$COMPLETO" = "1" ]; then
  echo ""
  echo "== Exportando producao_eventos (backup completo) =="
  exportar_csv "producao_eventos" || FALHAS=$((FALHAS+1))
fi

echo ""
echo "== Baixando anexos (desenho/fluxo) do bucket =="
URLS=$(curl -s --max-time 60 \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  "$SUPA_URL/rest/v1/demanda_itens?select=desenho_url,fluxo_url" \
  | grep -oE '"https?://[^"]+"' | tr -d '"' | sort -u)

N_OK=0; N_ERR=0
if [ -z "$URLS" ]; then
  echo "  nenhum anexo cadastrado."
else
  while IFS= read -r url; do
    [ -z "$url" ] && continue
    # caminho relativo apos o nome do bucket (mantem CLIENTE/CODIGO/arquivo)
    rel="${url#*demanda-arquivos/}"
    if [ "$rel" = "$url" ]; then rel=$(basename "$url"); fi
    if curl -s --max-time 60 --create-dirs -o "$DIR/anexos/$rel" "$url" && [ -s "$DIR/anexos/$rel" ]; then
      N_OK=$((N_OK+1))
    else
      N_ERR=$((N_ERR+1))
      echo "  FALHOU: $url"
    fi
  done <<< "$URLS"
  echo "  anexos baixados: $N_OK ok, $N_ERR com erro"
fi

echo ""
echo "== Resumo =="
echo "  pasta do backup: $DIR"
if [ "$FALHAS" -gt 0 ] || [ "$N_ERR" -gt 0 ]; then
  echo "  ATENCAO: houve falhas ($FALHAS tabela(s), $N_ERR anexo(s)). Verificar antes de confiar neste backup."
  exit 1
fi
echo "  backup concluido sem falhas."
