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

Compare com a última vez que você rodou isso. Medições de referência:

| Data | `producao_eventos` | `posicao_atual` | Crescimento |
|---|---|---|---|
| 02/07/2026 | 27.026 | 971 | ~310/dia |
| 22/07/2026 | 30.484 | 1.242 | ~173/dia |

Se a contagem estiver muito acima do esperado pela taxa de crescimento, investigue se
alguma tela está inserindo eventos duplicados.

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

## Passo 3 — se o Egress estiver alto, achar a causa (não pare no número)

O número sozinho não diz nada. **Sempre descubra a composição antes de propor
qualquer correção** — em 22/07/2026 uma análise que parou no total levou a um
diagnóstico errado (culpou os apontamentos; a causa real era outra).

**3a. Composição por tipo** — no gráfico "Egress per day" do painel, passe o mouse
sobre a barra de um dia. O tooltip abre a divisão real:

```
PostgREST Egress (95,3%):  225.536 MB   ← consultas normais à API
Storage Egress   (0,8%):     1.952 MB   ← arquivos/anexos
Realtime Egress  (3,9%):     9.276 MB   ← websocket
```

Se **PostgREST domina** (o normal aqui), o problema é volume de consulta — siga para 3b.
Não perca tempo com imagens/anexos: Storage nunca passou de ~10% neste projeto.

**3b. Quem está consultando** — use `get_logs` do MCP do Supabase (serviço `api`) e
olhe os **intervalos entre requisições repetidas** do mesmo endpoint:

- **Intervalos irregulares** (segundos, depois minutos) = Realtime disparando por
  apontamento. Comportamento esperado.
- **Intervalos de exatamente 60,0s / 180,0s** (a cadência de um `setInterval`) =
  **o polling de emergência está rodando**, ou seja, o canal Realtime daquela aba
  está caído. Foi assim que se descobriu o consumo de 22/07/2026: 914 kB por minuto,
  o dia todo, com a tela atrasada sem ninguém saber.

Cada tela tem uma assinatura própria de requisições, útil para saber qual está aberta:

| Tela | Assinatura no log |
|---|---|
| Kanban | `posicao_atual` + `demanda_itens?select=codigo_peca,pedido,critico` |
| Expedição | `posicao_atual` + `demanda_itens?select=*` + `demanda_clientes` |
| Demanda (visão geral) | `posicao_atual` + `demanda_itens?select=cliente,data_desejada,...` |
| Painel | `posicao_atual` + `producao_eventos?...order=id.desc` |

**3c. Confirmar no navegador** — abra a página e leia o estado real do canal:

```js
JSON.stringify({rtConectado:_rtConectado, estado:_rtCanal && _rtCanal.state, tentativa:_rtTentativa})
```

`estado:"joined"` = saudável. `closed`/`errored` com `tentativa` subindo = está tentando
reconectar (esperado logo após uma queda; preocupante se ficar assim).

**3d. Peso de cada recarga** — para dimensionar o impacto, meça o payload real (o
tamanho no banco engana: em JSON o nome de cada coluna se repete em toda linha):

```sql
select pg_size_pretty(sum(length(row_to_json(t)::text))::bigint) from posicao_atual t;
```

Referência 22/07/2026: **914 kB** por chamada de `buscarPosicao()` (1.242 linhas).
Regra de bolso: `egress_do_dia ÷ 0,914 MB` ≈ número de recargas completas no dia.

## Passo 4 — relatar

Monte uma tabela simples: métrica, valor atual, limite do plano gratuito, e se está
tranquilo ou perto do limite. Não precisa ser um relatório longo — o usuário só quer
saber se está tudo bem ou se algo pede atenção. Se algo estiver próximo do limite (ex.:
acima de 70-80% da cota), avise com destaque e traga junto **a causa** apurada no
Passo 3, não só o número (releia `AUDITORIA_TECNICA.md` para os pontos pesados já
identificados e corrigidos).

Medições de referência (ciclo 27/06–27/07/2026, plano gratuito = 5 GB):

| Métrica | Valor em 22/07 | Limite |
|---|---|---|
| Egress no período | 2,59 GB (~50%) | 5 GB |
| Egress/dia (pico) | ~237 MB | — |
| Database size | 41 MB | 500 MB |
| Storage size | 6 MB | 1 GB |
| Realtime peak connections | 11 | 200 |
| Realtime messages | 44.313 | 2 milhões |

Só o **Egress** merece acompanhamento — os outros estão em uma ordem de grandeza de
folga.

## Histórico de causas já diagnosticadas

- **22/07/2026 — polling de emergência preso ligado.** O canal Realtime caía e nunca
  reconectava (o `subscribe` só registrava o status, sem tratar
  `CLOSED`/`CHANNEL_ERROR`/`TIMED_OUT`), então a aba ficava permanentemente no
  `setInterval` de 60s, recarregando 914 kB por minuto mesmo sem apontamento nenhum —
  e exibindo dado atrasado sem avisar. Corrigido no commit `537dcf6` com reconexão
  automática (backoff 2s→30s), fallback afrouxado para 180s e handler leve para
  `demanda_itens` na Expedição. **Se o egress voltar a subir, cheque isto primeiro.**

## O que esta skill nunca deve fazer

- Não digitar credenciais/login no painel da Supabase.
- Não pedir Personal Access Token para esta checagem de rotina — o token só é
  necessário para alterações de schema (DDL), não para consultar o painel de uso.
- Não propor nem agendar verificações futuras automaticamente — é sob demanda, o
  usuário chama quando quiser.
