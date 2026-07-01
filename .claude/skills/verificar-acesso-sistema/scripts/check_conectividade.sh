#!/usr/bin/env bash
# Diagnostico de conectividade do BRASMAT MES: site (Vercel) + banco (Supabase).
# Uso: bash check_conectividade.sh [caminho-do-repo]
# Le SUPA_URL/SUPA_KEY direto do status.js do repo (evita hardcode de credencial).

set -uo pipefail

REPO="${1:-.}"
STATUS_JS="$REPO/status.js"
SITE_URL="https://brasmat-mes.vercel.app"

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

echo "== 1. Site (Vercel) =="
V_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$SITE_URL")
V_TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time 10 "$SITE_URL")
echo "  $SITE_URL -> HTTP $V_CODE em ${V_TIME}s"

echo "== 2. Supabase REST API =="
S_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  "$SUPA_URL/rest/v1/posicao_atual?select=codigo_peca&limit=1")
S_TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time 10 \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  "$SUPA_URL/rest/v1/posicao_atual?select=codigo_peca&limit=1")
echo "  $SUPA_URL/rest/v1/... -> HTTP $S_CODE em ${S_TIME}s"

echo "== 3. Rede geral (referencia, para isolar a causa) =="
G_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://www.google.com")
echo "  google.com -> HTTP $G_CODE"

echo ""
echo "== Resumo automatico =="
if [ "$V_CODE" = "000" ] && [ "$G_CODE" = "000" ]; then
  echo "REDE_GERAL: internet local do usuario parece indisponivel (google.com tambem nao respondeu)."
elif [ "$S_CODE" = "200" ] && { [ "$V_CODE" = "200" ] || [ "$V_CODE" = "304" ]; }; then
  echo "OK: site e banco respondendo normalmente."
elif [ "$S_CODE" = "000" ] || [ -z "$S_CODE" ]; then
  echo "SUPABASE_TIMEOUT: Supabase nao respondeu. Se google.com respondeu OK, o problema e especifico do Supabase -> checar dashboard (projeto pausado ou incidente de plataforma)."
elif [ "$S_CODE" = "401" ] || [ "$S_CODE" = "403" ]; then
  echo "SUPABASE_AUTH: Supabase respondeu mas recusou a chave (HTTP $S_CODE). A publishable key em status.js pode estar errada/revogada -> conferir em Project Settings > API Keys no dashboard."
elif [ "$V_CODE" != "200" ] && [ "$V_CODE" != "304" ]; then
  echo "VERCEL_PROBLEMA: site respondeu HTTP $V_CODE (nao-200). Checar vercel-status.com e o painel do projeto na Vercel."
else
  echo "INDEFINIDO: ver os codigos acima e cruzar manualmente."
fi
