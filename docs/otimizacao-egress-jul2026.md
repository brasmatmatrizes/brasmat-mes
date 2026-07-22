# Otimização de egress do Supabase — julho/2026

Registro do episódio: o consumo de dados quase dobrou em julho, o primeiro diagnóstico
estava errado, e a causa real era outra. Guardado porque **o raciocínio importa mais que
o resultado** — se o consumo voltar a subir, este documento diz onde olhar primeiro e
quais caminhos já foram descartados (e por quê).

Para o passo a passo de *como medir*, use a skill `verificar-uso-supabase`.

---

## 1. O sintoma

Ciclo 27/06–27/07/2026, plano gratuito (5 GB de egress):

- **2,59 GB usados** (~50% da cota) antes da metade do ciclo
- Consumo diário saltou de ~20-100 MB (fim de junho) para **~237 MB** (21/jul)
- Nenhum aumento equivalente de uso: `producao_eventos` cresce ~173 linhas/dia,
  **menos** que os ~310/dia medidos na auditoria de 02/07

Ou seja: o sistema gastava mais enquanto a fábrica apontava menos.

---

## 2. O primeiro diagnóstico — e por que estava errado

**Sugerido inicialmente:** que os apontamentos disparavam recargas em excesso via
Realtime, e que a correção era *espaçar* (aumentar o debounce de 3s para 20-60s nas
telas menos críticas). Chegou-se a montar um mapeamento de "onde pode atrasar" vs "onde
precisa ser instantâneo".

**Por que estava errado:** o número total foi lido sem olhar a composição. Duas
medições derrubaram a hipótese:

1. **Frequência real dos apontamentos.** 2.426 eventos em 14 dias = ~173/dia. Em ~10h
   úteis, é **1 apontamento a cada ~3,5 minutos**. Um debounce de 60s quase não teria o
   que agrupar — a maior parte dos eventos já chega isolada.

   | Janela de debounce | Recargas em 14 dias |
   |---|---|
   | 3s (o de então) | 2.385 |
   | 20s | 2.066 |
   | 60s | 1.567 |

   Redução teórica máxima de ~34%, e só se o tráfego viesse mesmo dos eventos.

2. **O tráfego não vinha dos eventos.** Nos logs da API, as recargas de `posicao_atual`
   apareciam em intervalos de **exatamente 60,0 segundos** — 59,6s / 60,4s / 60,0s /
   60,0s / 59,9s... Apontamento não chega com essa regularidade. `setInterval` chega.

**Lição:** nunca propor correção a partir do total. A composição por tipo (tooltip do
gráfico no painel) e a cadência nos logs contam uma história diferente do número.

---

## 3. A causa real

O `setInterval` de fallback só roda enquanto `_rtConectado === false`. Se ele estava
rodando em cadência perfeita o dia todo, **o canal Realtime estava caído e nunca
voltava**.

O motivo estava no código: o callback do `subscribe` apenas *registrava* o status —
nunca reagia a `CLOSED` / `CHANNEL_ERROR` / `TIMED_OUT`. Uma vez caído (rede oscilando,
máquina suspensa, instabilidade do Supabase — os logs do serviço mostram erros de pool
de conexão no período), o canal ficava caído **para sempre**, e a aba passava a viver do
fallback.

Consequência dupla, e a segunda é pior que a primeira:

| | Efeito |
|---|---|
| **Custo** | 914 kB/minuto por aba nessa situação = ~55 MB/hora, com a fábrica parada ou não. ~4 horas-aba disso explicam o dia inteiro de consumo |
| **Confiabilidade** | A tela ficava **até 1 minuto atrasada, sem nenhum aviso**. O instantâneo que o negócio precisa já não existia em algumas abas — e ninguém sabia |

Confirmado por contraste: abrindo o Kanban durante a análise, `_rtConectado` retornava
`true`. Não era bug determinístico de código — era queda de conexão sem recuperação.

Composição do egress no dia de pico (21/jul), que fecha o raciocínio:

```
PostgREST  95,3%   225,5 MB   ← consultas à API
Realtime    3,9%     9,3 MB
Storage     0,8%     2,0 MB   ← imagens/anexos: irrelevantes
```

---

## 4. O que foi aplicado

| # | Mudança | Commit | Ganho |
|---|---|---|---|
| 1 | **Reconexão automática do Realtime** nas 5 páginas com canal (Kanban, Painel, Expedição, Apontamentos, Demanda). Backoff exponencial 2s→30s; ao *re*conectar, refaz a busca uma vez para recuperar o período offline | `537dcf6` | elimina a causa raiz |
| 2 | **Fallback de 60s → 180s.** Com a reconexão funcionando, ele vira último recurso real (Supabase inalcançável), cenário em que insistir mais rápido não ajudaria | `537dcf6` | limita o pior caso |
| 3 | **Expedição: handler separado por tabela.** `demanda_itens` (edição concorrente, ~50 kB) tem recarga leve própria, reaproveitando o `POSMAP` em memória; só `producao_eventos` dispara a recarga completa. Antes, marcar 1 item como separado puxava as 1.246 peças | `537dcf6` | 8-20% |
| 4 | **Coluna calculada `suboperacao`** na view + `POS_COLS` explícito no `buscarPosicao()` | `f5eca9b` | **48% de cada carga** |

### Detalhe da mudança #4

`posicao_atual` carregava 13 colunas `operacao_*`, uma por setor. Como a peça só está em
um setor por vez, **12 das 13 vêm sempre vazias** — mas em JSON o nome de toda coluna se
repete em toda linha, então as 13 respondiam por ~metade do payload.

A view passou a expor `suboperacao`: um `coalesce` do primeiro valor não-vazio, que
replica exatamente o que `getSubop()` (`status.js`) sempre fez.

Verificações antes de aplicar:

- **Exclusividade:** das 1.242 linhas, 1.233 têm exatamente uma coluna preenchida, 9 têm
  nenhuma, **0 têm duas ou mais**. "O primeiro preenchido" é, na prática, "o único".
- **Equivalência:** recalculando a lógica antiga do zero dentro do banco e comparando
  linha a linha — **1.244 de 1.244 idênticas, zero divergências**.
- **Payload real medido na rede:** 782 kB → 405 kB por página de 1000 linhas (**48%**).

**Feita de forma aditiva de propósito:** a coluna nova entrou *por último*, via
`CREATE OR REPLACE VIEW` (sem `DROP`), e as 13 originais continuam existindo. Resultado:
não houve um instante sequer em que `posicao_atual` deixasse de existir, os grants foram
preservados, e abas com o site antigo em cache seguiram funcionando idênticas. **As duas
versões convivem — ninguém precisou recarregar nada.** Aplicado com a fábrica em uso.

> ⚠️ O percurso das 13 colunas em `getSubop()` **não é código morto e não deve ser
> removido**: é o único caminho para linhas de `producao_eventos` (linha do tempo,
> apontamentos, performance de operadores), que não têm a coluna calculada.

---

## 5. O que foi deliberadamente descartado

**Merge incremental** (atualizar só a linha que mudou, em vez de recarregar tudo) —
listado como solução (B) do Problema P4 na auditoria original.

Motivo: a recarga total funciona como **autocorreção**. Se um evento de Realtime se
perde para a peça X, o próximo apontamento de qualquer outra peça traz X de volta ao
estado certo. Com merge incremental essa rede desaparece, e a falha passa a ser
**invisível** — a peça aparece normal na tela, só que com informação errada. Hoje, o
sintoma equivalente (peça sumindo da lista) pelo menos era visível.

Dado que o canal **já provou que cai**, a recarga total é a escolha resiliente. O custo
dela se resolve reduzindo *frequência* e *tamanho* — que foi o caminho seguido.

**Espaçar o debounce** foi descartado depois da medição da seção 2: pouco ganho real, e
custaria justamente o instantâneo que o negócio precisa.

**Remover as 13 colunas `operacao_*` da view:** desnecessário. O ganho vem de o site
*pedir* menos, não de a view *ter* menos. Manter as 13 custa nada e preserva a
compatibilidade para sempre. É a única parte que exigiria janela sem uso (`DROP` +
recriação) — e não precisa acontecer.

---

## 6. Como acompanhar

Peça "verificar uso do Supabase" — a skill cobre a medição e o diagnóstico.

**Se o egress voltar a subir, nesta ordem:**

1. **Cadência nos logs da API.** Intervalos exatos de 180,0s = fallback rodando = canal
   caído de novo. Foi a causa de 22/07.
2. **`select=*` novo em `posicao_atual`.** Alguma tela nova pode ter deixado de usar
   `POS_COLS` (`status.js`) e voltado a puxar tudo.
3. **Composição por tipo** no tooltip do painel, antes de qualquer hipótese.

**Estado do canal, direto no navegador:**

```js
JSON.stringify({rtConectado:_rtConectado, estado:_rtCanal && _rtCanal.state, tentativa:_rtTentativa})
```

`"joined"` = saudável. `closed`/`errored` com `tentativa` subindo = tentando reconectar
(normal logo após uma queda; preocupante se ficar assim).

---

## 7. Números de referência (22/07/2026, pós-correções)

| Métrica | Valor | Limite do plano |
|---|---|---|
| Egress no ciclo | 2,59 GB | 5 GB |
| Database size | 41 MB | 500 MB |
| Storage size | 6 MB | 1 GB |
| Realtime peak connections | 11 | 200 |
| Realtime messages | 44.313 | 2 milhões |
| `producao_eventos` | 30.484 linhas (~173/dia) | — |
| `posicao_atual` | 1.246 linhas | — |
| Payload de `buscarPosicao()` | **405 kB**/1000 linhas (era 782 kB) | — |

Só o egress merece acompanhamento — os demais têm uma ordem de grandeza de folga.

Regra de bolso: `egress_do_dia ÷ 0,4 MB` ≈ número de recargas completas no dia.

---

## 8. Pendente

Nada bloqueante. Os efeitos das correções ainda **não apareceram no painel** no momento
deste registro (a Supabase atualiza o número de hora em hora) — vale reconferir o
consumo diário em 2-3 dias e comparar com a linha de base acima.
