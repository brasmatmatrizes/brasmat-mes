---
name: kpi-definicoes
description: Referência única das definições de indicadores (KPIs) do BRASMAT MES — como cada número é calculado (status, progresso, OTD em cascata, produtividade da inspeção, tempo por operação). Use SEMPRE que for criar ou alterar um indicador/dashboard, quando números divergirem entre telas ("na tela X aparece diferente da tela Y"), ou quando o usuário perguntar "como esse número é calculado". Garante que todas as telas contem do mesmo jeito.
---

# Definições de KPI (BRASMAT MES)

Regra de ouro do projeto: **a linha do tempo é a referência** — qualquer número exibido
num card/indicador tem que bater com o que a linha do tempo da peça mostra. Se divergir,
o indicador está errado, não a linha do tempo.

Estas são as definições **firmadas** (implementadas e aprovadas). Indicador novo usa
estas mesmas regras; mudança em regra existente só com aprovação explícita do usuário
(e atualizando esta skill + CLAUDE.md).

## Identidade e base

- Tudo se calcula por **pedido + código** (nunca só código).
- Fonte: `producao_eventos` (eventos imutáveis) / `posicao_atual` (último evento por peça).
- Tela que agrega por período **filtra data no servidor** (`data_evento=gte/lte`), padrão
  mês corrente.
- ⚠ Contagens brutas podem estar infladas por **duplicidade de apontamento** (origem
  externa; ver skill `auditar-apontamentos`). Decisão do usuário em 02/07/2026: não
  deduplicar por ora — se um número parecer alto demais, auditar antes de "corrigir" a tela.

## Status da peça (`status()` em status.js)

Definido por evento + processo + suboperação do **último** evento:
- Saída ADMINISTRATIVO 11.4 → **expedida**
- Entrada ADMINISTRATIVO 11.4 → **em estoque**
- Saída QUALIDADE 10.2 → **aprovada**
- Saída ADMINISTRATIVO 11.3 → **aguardando primeiro operador**
- Entrada (demais) → **em processo** · Saída (demais) → **entre processos**

## Progresso da peça

`sequencial_operacao / quantidade_operacoes` do **último evento** (`calcProgressoRow`).
Esses campos só existem em `producao_eventos` (não na view). Check manual "Concluído"
na demanda **sobrepõe** o progresso (usado quando o apontamento está errado).

## Tipo V/I (`getTipo`)

`classificacao_fiscal` ("Vendas"→V azul, "Industrialização"→I laranja); fallback
`razao_social` (Brasmat→V, Mota→I). Registro mais recente com o campo preenchido
(`order=id.desc`), por pedido+código.

## OTD (otd.html)

Peça **sem `prazo_entrega` não é analisada**. Prazo vale até 23:59:59 do dia.

**Filtro V/I** (default **Vendas**): classifica cada grupo pedido+código pela regra do
`getTipo` (registro mais recente com o campo preenchido) e filtra os grupos —
**nunca** filtra evento no servidor (perderia eventos sem `classificacao_fiscal` e
quebraria a cascata). "Todos" reproduz o comportamento antigo.

### OTD global (do início ao fim) — o número de frente pro cliente

Entrega final = **Saída ADM 11.4** vs prazo. Dois números:
- **OTD Cliente (entregue no prazo)** = expedidos no prazo ÷ **expedidos**. É o desempenho
  do que já saiu, sobre TODOS os entregues (independe da cascata).
- **OTD incluindo atrasos em aberto** = expedidos no prazo ÷ (**expedidos + vencidos não
  entregues**), onde "vencido não entregue" = grupo com prazo < hoje e sem evento de expedição.

⚠️ Esse número (ex.: 51%) é **menor** que o card "OTD Expedição" da cascata (ex.: 79%) e não
é divergência: a cascata só conta quem chegou íntegro na expedição; o global conta todos os
entregues, inclusive os que já tinham atrasado na produção. São perguntas diferentes.

### OTD por etapa — cascata (diagnóstico: onde furou)

| Etapa | Evento de referência | No prazo se |
|---|---|---|
| Planejamento | Saída ADM 11.3 | faltavam ≥ N dias p/ o prazo (N configurável, padrão 5) |
| Produção | 1ª Entrada em QUALIDADE; senão, última Saída de processo produtivo (≠ QUALIDADE/ADM) | antes do prazo |
| Qualidade | Saída QUALIDADE 10.2 | antes do prazo |
| Expedição | Saída ADM 11.4 | antes do prazo |

**Cascata**: se uma etapa atrasou, as seguintes ficam **não avaliadas** (null) — o
atraso é atribuído à primeira etapa que falhou, não se propaga como "culpa" das demais.
% OTD por etapa = ok / (ok + atrasadas), ignorando as não avaliadas.

> Etapa **Estoque** (Entrada ADM 11.4) foi **removida** (12/07/2026) — o apontamento de
> entrada no estoque deixou de ser feito (peças vão direto pra expedição). Se voltar a ser
> apontado, readicionar a etapa entre Qualidade e Expedição.

**Ranking por cliente**: OTD de entrega (número realizado) por cliente, piores primeiro.
A soma dos clientes fecha com o número global.

## Produtividade da inspeção (qualidade.html)

- Conta **só eventos de Saída** (a inspeção de processo 10.1 aponta entrada+saída —
  contar entrada duplicaria; a final 10.2 hoje só aponta saída, por isso **não** se
  calcula tempo de inspeção).
- **Lotes** = nº de eventos de Saída · **Peças** = soma de `quantidade_produzida`.
- Tipos: 10.1 = inspeção de processo · 10.2 = inspeção final.

## Tempo por operação (operadores.html — Performance)

- Pareamento Entrada→Saída por pedido+código+processo, em ordem cronológica: cada
  Entrada consome a **próxima** Saída livre; Entrada seguida de outra Entrada fica
  "sem saída" (não conta tempo).
- Exclusões do tempo médio: pares iniciados em fim de semana/feriado (esquecimento de
  fechar infla o tempo) — sinalizados, não contados.
- Sinalizações: < 2 min "muito rápido"; > 24h "mais de um dia".

## Situação na Expedição (expedicao.html / demanda)

Derivada de `status()` + flag `concluido`: "Pronto p/ expedir" = concluído manual OU
status ∈ {aprovada, em_estoque, expedida}. O `exp_status` (pendente/separado/expedido)
é controle **do almoxarifado**, separado do status do apontamento.

## Ao criar indicador novo

1. Verificar se as regras acima já respondem — não inventar contagem paralela.
2. Se precisar de regra nova: propor ao usuário, e depois de aprovada **registrar aqui
   e no CLAUDE.md** antes de considerar pronto.
3. Validar contra a linha do tempo de 2–3 peças reais antes de entregar.
