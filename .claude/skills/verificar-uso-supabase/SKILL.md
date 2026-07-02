---
name: verificar-uso-supabase
description: Verifica o consumo de recursos do projeto Supabase do BRASMAT MES (egress/banda, tamanho do banco, conexões e mensagens de Realtime, storage) frente aos limites do plano gratuito. Use SEMPRE que o usuário pedir para "verificar uso do Supabase", "quanto estou consumindo", "checar cota/limite", "ver se estou perto do limite do plano gratuito", ou pedir um acompanhamento periódico de consumo de dados — mesmo sem mencionar "Supabase" explicitamente, se o contexto for sobre custo/capacidade do sistema BRASMAT MES.
---

# Verificar uso do Supabase (BRASMAT MES)

O usuário quer manter o sistema no plano gratuito da Supabase pelo maior tempo possível
(ver auditoria técnica feita anteriormente, `AUDITORIA_TECNICA.md` no repo). Esta skill é
o jeito de checar periodicamente se o consumo está saudável, sem precisar refazer uma
auditoria inteira toda vez.

## Passo 1 — números do banco (sempre disponível, sem login)

Rode o script bundled — ele só usa a chave pública (anon), então funciona sempre, sem
precisar de token nem de login:

```
bash .claude/skills/verificar-uso-supabase/scripts/contagem_tabelas.sh C:\Users\grafe\brasmat-mes
```

Ele devolve:
- Contagem exata de linhas em `producao_eventos`, `posicao_atual`, `demanda_itens`,
  `demanda_clientes`, `kanban_operadores`.
- Data do evento mais antigo e mais recente em `producao_eventos`, para você calcular a
  taxa de crescimento (linhas novas por dia) e comparar com a medição anterior.

Compare com a última vez que você rodou isso (ou com os números da auditoria original:
em 02/07/2026 eram 27.026 linhas em `producao_eventos`, crescendo ~310/dia). Se a
contagem estiver muito acima do esperado pela taxa de crescimento, investigue se alguma
tela está inserindo eventos duplicados.

## Passo 2 — números oficiais de cota (Egress, DB size, Realtime, Storage)

Esses números só existem no painel da Supabase (`Usage`), não dá para pegar só com a
chave pública. Duas formas, dependendo do que estiver disponível na sessão:

1. **Se houver um conector MCP de Supabase conectado** (verifique as ferramentas
   disponíveis) — prefira usá-lo, é mais direto.
2. **Senão, use o Chrome já conectado** (`mcp__Claude_in_Chrome__*`):
   - Confirme que há navegador conectado (`list_connected_browsers`); se vazio, peça
     para o usuário ativar a extensão.
   - Navegue para `https://supabase.com/dashboard/org/oopahubqerqhhbpsqccv/usage?projectRef=hjvlznijsgdwurtsyukl`
     (org `brasmatmatrizes`, projeto `hjvlznijsgdwurtsyukl` — confirme o ref lendo
     `SUPA_URL` de `status.js` caso o projeto mude).
   - Se pedir login, **peça para o usuário logar ele mesmo** — nunca digite
     credenciais por ele.
   - Tire um screenshot e leia os valores de **Egress**, **Database Size**,
     **Storage Size**, **Realtime Concurrent Peak Connections**, **Realtime Messages** —
     e o teto de cada um (aparece ao clicar em cada métrica, ex.: Egress mostra
     "Included in Free Plan: 5 GB").

## Passo 3 — relatar

Monte uma tabela simples: métrica, valor atual, limite do plano gratuito, e se está
tranquilo ou perto do limite. Não precisa ser um relatório longo — o usuário só quer
saber se está tudo bem ou se algo pede atenção. Se algo estiver próximo do limite (ex.:
acima de 70-80% da cota), avise com destaque e sugira investigar qual página está
consumindo mais (releia `AUDITORIA_TECNICA.md` para lembrar os pontos mais pesados
já identificados e corrigidos).

## O que esta skill nunca deve fazer

- Não digitar credenciais/login no painel da Supabase.
- Não pedir Personal Access Token para esta checagem de rotina — o token só é
  necessário para alterações de schema (DDL), não para consultar o painel de uso.
- Não propor nem agendar verificações futuras automaticamente — é sob demanda, o
  usuário chama quando quiser.
