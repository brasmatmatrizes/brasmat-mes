---
name: backup-dados
description: Faz backup dos dados de negócio do BRASMAT MES (tabelas demanda_itens, demanda_clientes, kanban_operadores e os anexos PDF/imagem do bucket demanda-arquivos) para arquivos CSV locais que abrem no Excel. Use SEMPRE que o usuário pedir "backup", "exportar os dados", "salvar uma cópia", "proteger os dados", ou periodicamente antes de mudanças estruturais no banco (nova coluna, migração, mexer em RLS). O plano gratuito do Supabase não tem restauração point-in-time — este backup é a única cópia de segurança.
---

# Backup de dados (BRASMAT MES)

Esta skill existe porque os dados lançados manualmente no sistema — demanda dos clientes,
prazos confirmados, anexos de desenho/roteiro — **não existem em nenhum outro lugar**.
Os eventos de produção (`producao_eventos`) vêm de um sistema externo e podem ser
reimportados; o resto, não. O plano gratuito do Supabase não tem backup automático
restaurável, então esta é a rede de segurança.

## Passo 1 — rodar o script

```
bash .claude/skills/backup-dados/scripts/backup.sh C:\Users\grafe\brasmat-mes
```

O script:
1. Lê `SUPA_URL`/`SUPA_KEY` do `status.js` (nunca hardcoded — a chave pode ser rotacionada).
2. Cria a pasta `~/brasmat-mes-backups/AAAA-MM-DD_HHMM/` (fora do repo — dado não vai pro git).
3. Exporta como **CSV** (abre direto no Excel): `demanda_itens`, `demanda_clientes`,
   `kanban_operadores`.
4. Baixa os **anexos** (desenho/fluxo) referenciados em `demanda_itens` para a subpasta
   `anexos/`, preservando a estrutura `CLIENTE/CODIGO/arquivo`.
5. Imprime um resumo com contagem de linhas e de arquivos baixados.

Para incluir também `producao_eventos` (grande, origem externa — só quando o usuário
pedir backup completo):

```
bash .claude/skills/backup-dados/scripts/backup.sh C:\Users\grafe\brasmat-mes --completo
```

## Passo 2 — conferir o resultado

Compare as contagens do resumo com o esperado (a skill `verificar-uso-supabase` tem a
contagem atual das tabelas). Se alguma tabela veio com 0 linhas ou um anexo falhou,
investigue antes de dar o backup como concluído — backup silenciosamente vazio é pior
que nenhum.

## Passo 3 — informar o usuário

Diga onde o backup ficou salvo (caminho completo da pasta) e o que contém. Sugira
copiar a pasta para um segundo lugar (pen drive / Google Drive) de tempos em tempos —
o backup local no mesmo computador não protege contra defeito da máquina.

## Observações

- Tudo é **só leitura** (chave anon via REST) — pode rodar a qualquer momento sem risco.
- Egress conta na cota do plano gratuito; o backup completo com `producao_eventos` e
  anexos consome mais — não rodar o completo várias vezes por dia à toa.
- Restauração: os CSVs podem ser reimportados pelo painel do Supabase (Table Editor →
  Import data via CSV) ou via API com credencial elevada, mantendo os mesmos nomes de coluna.
