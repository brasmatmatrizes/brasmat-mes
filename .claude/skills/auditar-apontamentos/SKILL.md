---
name: auditar-apontamentos
description: Audita a qualidade dos dados de apontamento em producao_eventos do BRASMAT MES — detecta duplicatas exatas, entradas sem saída e outros padrões que inflam os indicadores. Use SEMPRE que o usuário desconfiar de um número ("esse indicador parece alto/errado"), pedir para "auditar apontamentos", "verificar duplicidade", "conferir os dados da qualidade", ou antes de construir indicador novo que agregue contagens de producao_eventos.
---

# Auditar apontamentos (BRASMAT MES)

Esta skill existe porque já foi **confirmado** (02/07/2026) que o sistema externo de
apontamento inseria registros duplicados: ~40% dos eventos de Saída de QUALIDADE eram
duplicatas exatas. A origem é **fora deste repo** (o front só faz GET) — aqui só se
mede, exibe e reporta.

> **Status em 22/07/2026: resolvido na origem.** A correção no script do Google
> (`LockService`) funcionou — **zero duplicatas novas desde 04/07/2026**, verificado dia
> a dia. O que resta são **11.934 registros duplicados históricos** (abr a 03/07), que
> continuam no banco por decisão do usuário. A linha do tempo já não os exibe nem os
> baixa (view `historico_peca`, ver seção "O que já foi feito"). Se for medir de novo,
> **filtre por período** — misturar o histórico contaminado com os dados atuais dá a
> impressão falsa de problema ativo.

## ⚠️ O que NÃO é anomalia (regra do usuário, 22/07/2026)

Confirmado pelo dono da Brasmat. **Não reportar estes casos como problema** — são
normais na operação:

| Padrão | Por que é normal |
|---|---|
| **Mesma operação apontada mais de uma vez** (peça volta ao mesmo processo em outro momento) | acontece o tempo todo: retrabalho, reentrada, ajuste. São apontamentos legítimos e distintos |
| **`sequencial_operacao` maior que `quantidade_operacoes`** (ex.: "op. 18ª de 17") | normal para eles; a peça pode receber operação além do previsto no roteiro. Não é erro de dado |

**O único caso que é problema de verdade:** o **mesmo registro gravado duas vezes**, com
**todos** os campos idênticos, **inclusive a data/hora até o milissegundo** — dois `id`
diferentes no Supabase guardando o mesmo apontamento. Foi isso que o `LockService`
corrigiu.

Critério exato de duplicata (o mesmo usado pela view `historico_peca`):

```
pedido + codigo_peca + processo + evento + operador + data_evento
```

Basta **um** desses diferir e são dois apontamentos distintos — mantê-los. Como
`data_evento` tem milissegundos, dois apontamentos reais nunca colidem.

## Como rodar (só leitura)

Preferir o MCP do Supabase (`execute_sql`, projeto `hjvlznijsgdwurtsyukl`) — só
`SELECT`, nunca DELETE/UPDATE. Sem o MCP, usar a REST com a chave anon (agregações
limitadas — avisar que a auditoria fica parcial).

### 1. Duplicatas exatas (o achado principal)

```sql
-- grupos idênticos inseridos mais de uma vez (QUALIDADE; trocar o filtro p/ outros processos)
select pedido, codigo_peca, evento, operador, data_evento,
       operacao_qualidade, quantidade_produzida, count(*) as n
from producao_eventos
where processo ilike '%qualidade%'
group by 1,2,3,4,5,6,7
having count(*) > 1
order by n desc;
```

```sql
-- escala: total de linhas excedentes por processo e evento
select processo, evento,
       count(*) - count(distinct (pedido, codigo_peca, evento, operador, data_evento, quantidade_produzida)) as excedentes,
       count(*) as total
from producao_eventos
group by 1,2
order by excedentes desc;
```

### 2. Entradas sem saída antigas (operação esquecida aberta)

```sql
-- último evento por peça+processo é uma ENTRADA (data_evento é text: precisa ::timestamptz)
select pedido, codigo_peca, processo, operador, max(data_evento::timestamptz) as desde
from producao_eventos
group by 1,2,3,4
having max(data_evento::timestamptz) < now() - interval '7 days'
   and (array_agg(evento order by data_evento::timestamptz desc))[1] ilike 'entrada'
order by desde asc
limit 50;
```

### 3. Expedida com eventos depois (reabertura pós-expedição)

```sql
-- peça marcada Expedida (Saída + ADMINISTRATIVO + subop 11.4) que depois recebeu novos eventos
with expedidas as (
  select pedido, codigo_peca, data_evento::timestamptz as dt_exp
  from producao_eventos
  where processo ilike '%administrativo%' and evento ilike 'sa%da'
    and operacao_administrativo ilike '%11.4%'
)
select e.pedido, e.codigo_peca, e.dt_exp as expedida_em,
       count(pe.*) as eventos_depois,
       min(pe.data_evento::timestamptz) as primeiro_depois,
       max(pe.data_evento::timestamptz) as ultimo_depois,
       array_agg(distinct pe.processo) as processos_depois
from expedidas e
join producao_eventos pe
  on pe.pedido = e.pedido and pe.codigo_peca = e.codigo_peca
 and pe.data_evento::timestamptz > e.dt_exp
group by 1,2,3
order by eventos_depois desc;
```

### 4. Comparar com a linha de base

Números medidos em **02/07/2026** (dados desde abril/2026) para saber se piorou/melhorou:
- QUALIDADE: 3.146 eventos no total, 1.616 de Saída; **1.352 linhas excedentes**
  (653 nas Saídas — a métrica que o dashboard conta).
- Por inspetor (Saídas excedentes): Gustavo Rangel 40,6%, Lucas Lopes 34,8%, os outros
  dois com pouco volume chegam a 60%. **Sistêmico** — não é hábito de uma pessoa.

Entradas sem saída (peça+processo cujo último evento é Entrada), medidas em
**04/07/2026**: **371 de 7.362** grupos (peça+pedido+processo+operador), **5%** do total.
Pior processo é 11–ADMINISTRATIVO (120 abertas, 118 há +30 dias), seguido de
4–EROSÃO A FIO (41), 10–QUALIDADE (40), 6–POLIMENTO (35), 2–RETÍFICA PLANA (31) — as
outras 8 somam o restante. Por operador também é espalhado (Vinicius da Mota Oliveira
lidera com 125, mas outros 14 operadores têm de 6 a 40 cada) — **sistêmico**, não vício
de uma pessoa. Decisão do usuário em 04/07/2026: só quantificar por ora, sem agir ainda.

Expedida-com-eventos-depois, medido em **04/07/2026**: **19 pares pedido+código** têm
eventos registrados depois do evento que marca "Expedida" (Saída+ADMINISTRATIVO+11.4),
de 1 evento isolado até 78 eventos (ciclo de produção inteiro de novo). Testado: o
`cliente` nunca muda entre antes/depois nesses 19 casos (descarta reaproveitamento de
código **entre clientes diferentes**, mas não descarta reaproveitamento do mesmo pedido
pelo mesmo cliente num lote novo). **Usuário confirmou (04/07/2026) que as 3 causas
conhecidas acontecem de fato, ao mesmo tempo**: (a) retrabalho real pós-expedição sem
marcar o campo `retrabalho`, (b) Saída/ADMINISTRATIVO batida cedo demais por engano
(peça ainda não tinha terminado), (c) pedido/código reaproveitado num lote novo do mesmo
cliente. Não dá pra distinguir as 3 só com SQL — exige conhecimento de chão de fábrica
caso a caso. Ver query completa na seção 3.

### 5. Duplicatas — números atuais (22/07/2026)

```sql
-- escala total, com o critério oficial (6 campos, milissegundo incluso)
with d as (
  select pedido, codigo_peca, processo, evento, operador, data_evento, count(*) as vezes
  from producao_eventos group by 1,2,3,4,5,6 having count(*) > 1
)
select count(*) as grupos, sum(vezes-1) as excedentes from d;
```

```sql
-- por dia: confirma que parou (deve dar 0% a partir de 04/07/2026)
with d as (
  select pedido, codigo_peca, processo, evento, operador, data_evento, count(*) as vezes
  from producao_eventos where data_evento ~ '^\d{4}-\d{2}-\d{2}T'
  group by 1,2,3,4,5,6
),
tot as (select to_char(data_evento::timestamptz,'YYYY-MM-DD') as dia, count(*) as n
        from producao_eventos where data_evento ~ '^\d{4}-\d{2}-\d{2}T' group by 1),
dup as (select to_char(data_evento::timestamptz,'YYYY-MM-DD') as dia, sum(vezes-1) as ex
        from d where vezes>1 group by 1)
select t.dia, t.n as registros, coalesce(x.ex,0) as duplicados,
       round(100.0*coalesce(x.ex,0)/t.n,1) as pct
from tot t left join dup x using (dia) order by t.dia desc limit 30;
```

Medido em 22/07/2026: **9.922 grupos, 11.934 excedentes** (39% da tabela), todos
anteriores a 04/07. Confere com a diferença entre o Forms (18.868 respostas) e o banco
(30.641 registros) — sobram só 161 sem explicação (0,5%).

Distribuição: **851 pares peça+pedido** afetados (~2 de cada 3), média de 14 excedentes
cada, pior caso 63.

## O que já foi feito (não refazer)

- **Origem corrigida** (`LockService` no script do Google) — duplicação nova parou em
  04/07/2026.
- **Linha do tempo** lê a view `historico_peca`, que aplica o critério de 6 campos **no
  servidor** — os duplicados não são baixados nem exibidos (128 kB → 39 kB numa peça de
  138 eventos). Ver `docs/otimizacao-egress-jul2026.md`.
- **`posicao_atual` nunca foi afetada** — o `DISTINCT ON` da view já devolve uma linha
  por peça. Status, posição, progresso e OTD sempre estiveram corretos: olham o *último*
  evento, e duplicar não muda qual é o último.
- **O que continua distorcido:** contagens de **volume** no período abr–jun (produtividade,
  nº de inspeções). Os painéis que somam volume já tinham dedução própria como proteção.

## O que fazer com o resultado

1. **Mostrar a evidência antes de qualquer proposta** (convenção do projeto): números
   atuais × linha de base, com 2–3 exemplos concretos de grupos duplicados.
2. Se o usuário quiser agir, as opções conhecidas — em ordem de intrusividade:
   a) **reportar** a quem mantém o sistema de apontamento (causa raiz, fora do repo);
   b) **dedupe na agregação** dos indicadores (contar `distinct` do grupo idêntico) —
      muda números de dashboards, avisar que os valores vão cair;
   c) **alerta visual** nas telas afetadas, sem mudar contagem.
3. **Nunca** apagar/alterar linhas de `producao_eventos` — o dado de origem é externo
   e imutável por convenção; qualquer correção é na exibição/agregação. Reafirmado em
   22/07/2026 sobre os 11.934 duplicados: sem PITR no plano gratuito, apagar é
   irreversível, e uma view resolve o efeito prático sem tocar no dado.
4. **Deduplicar no servidor, não no navegador**, quando o objetivo incluir consumo de
   dados: filtrar depois do download esconde o repetido mas não economiza banda nenhuma.
5. Registrar a decisão (memória + CLAUDE.md se virar regra firmada) e atualizar a
   linha de base desta skill se novos números forem medidos.
