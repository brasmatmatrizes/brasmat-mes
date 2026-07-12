---
name: auditar-apontamentos
description: Audita a qualidade dos dados de apontamento em producao_eventos do BRASMAT MES — detecta duplicatas exatas, entradas sem saída e outros padrões que inflam os indicadores. Use SEMPRE que o usuário desconfiar de um número ("esse indicador parece alto/errado"), pedir para "auditar apontamentos", "verificar duplicidade", "conferir os dados da qualidade", ou antes de construir indicador novo que agregue contagens de producao_eventos.
---

# Auditar apontamentos (BRASMAT MES)

Esta skill existe porque já foi **confirmado** (02/07/2026) que o sistema externo de
apontamento insere registros duplicados: ~40% dos eventos de Saída de QUALIDADE eram
duplicatas exatas. A origem é **fora deste repo** (o front só faz GET) — aqui só se
mede, exibe e reporta. Decisão do usuário à época: não agir (sem dedupe, sem alerta);
se ele reabrir o assunto, atualizar os números e apresentar opções de novo.

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

## O que fazer com o resultado

1. **Mostrar a evidência antes de qualquer proposta** (convenção do projeto): números
   atuais × linha de base, com 2–3 exemplos concretos de grupos duplicados.
2. Se o usuário quiser agir, as opções conhecidas — em ordem de intrusividade:
   a) **reportar** a quem mantém o sistema de apontamento (causa raiz, fora do repo);
   b) **dedupe na agregação** dos indicadores (contar `distinct` do grupo idêntico) —
      muda números de dashboards, avisar que os valores vão cair;
   c) **alerta visual** nas telas afetadas, sem mudar contagem.
3. **Nunca** apagar/alterar linhas de `producao_eventos` — o dado de origem é externo
   e imutável por convenção; qualquer correção é na exibição/agregação.
4. Registrar a decisão (memória + CLAUDE.md se virar regra firmada) e atualizar a
   linha de base desta skill se novos números forem medidos.
