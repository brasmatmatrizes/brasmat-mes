# Auditoria Técnica Completa — BRASMAT MES

**Fase:** 1 — Auditoria (somente diagnóstico, nenhuma alteração foi feita em nenhum arquivo, tabela, view, bucket ou configuração do Supabase durante este trabalho).

**Metodologia:** leitura completa do código-fonte das 13 páginas + `status.js`; medições empíricas reais contra o projeto Supabase em produção via `curl` (contagem exata de linhas, tamanho de payload, tempo de resposta) e leitura direta do painel de uso/billing do Supabase (dados de hoje, ciclo 27/jun–27/jul/2026). Toda conclusão abaixo é referenciada a um arquivo/linha ou a uma medição concreta; onde não foi possível confirmar diretamente (ex.: índices do banco, já que a chave pública não dá acesso a `pg_catalog`), isso está marcado explicitamente como **hipótese**.

---

## 1. Resumo Executivo

O sistema está, hoje, **longe de qualquer limite do plano gratuito** em termos absolutos — usou 0,42 GB dos 5 GB de egress mensal em ~5 dias (ritmo projetado: ~2,3 GB/mês), banco com 36 MB de 27 mil eventos, 7 conexões Realtime simultâneas no pico. **Mas a arquitetura tem pelo menos três padrões que crescem de forma desproporcional ao uso real** e que, mantidos como estão, vão consumir a cota gratuita muito antes do que o crescimento natural do negócio justificaria:

1. Duas páginas (`operadores.html` e `otd.html`) baixam a **tabela `producao_eventos` inteira** para o navegador a cada abertura — hoje isso já são ~16,6 MB e ~9,6 MB por carregamento, **crescendo ~190 KB/dia** junto com a produção.
2. Quatro páginas fazem **polling de 60s incondicional** (mesmo com o Realtime funcionando) recarregando a view `posicao_atual` inteira (734 KB hoje) — juntando isso com o Realtime disparando o mesmo recarregamento a cada apontamento em qualquer processo da fábrica, **20 usuários com o Kanban aberto o dia todo já consumiriam sozinhos mais egress do que a cota mensal inteira** (detalhe na seção 13).
3. Uma função (`enriquecerItem` em `demanda.html`) busca o **histórico completo de cada peça** só para ler a última linha, quando bastaria pedir 1 registro — um bug de eficiência concreto e barato de corrigir.

**A boa notícia:** nenhum desses pontos exige plano pago para ser resolvido. São três dias de trabalho de otimização (filtros server-side, `limit=1` em vez de histórico completo, invalidação incremental em vez de recarga total) que multiplicam a "vida útil" do plano gratuito por um fator grande — o Plano de Ação (seção 15) já está ordenado por esse critério.

---

## 2. Visão Geral da Arquitetura

Frontend estático (13 arquivos `.html`, ~6.650 linhas no total, sem build) + `status.js` compartilhado, servido pela Vercel; backend Supabase (Postgres + PostgREST + Realtime + Storage), acessado só com a chave pública (anon). Sem camada de API própria, sem autenticação de usuário, sem cache de aplicação. Detalhe completo em [ARQUITETURA.md](ARQUITETURA.md) (já produzido nesta mesma sessão) — esta auditoria assume esse documento como verdade e vai direto aos problemas.

---

## 3. Pontos Fortes

- **Simplicidade radical do deploy** — qualquer alteração vira produção com um `git push`, sem pipeline de build para quebrar.
- **Uso correto de Realtime como conceito** — a decisão de reagir a mudanças em vez de só fazer polling burro é a escolha certa; o problema (seção 6/8) é *o que* cada callback recarrega, não a ideia de usar Realtime.
- **`status.js` centraliza corretamente as regras de negócio mais importantes** (tipo V/I, status, progresso) — evita a pior forma de duplicação (regra de negócio divergente entre telas).
- **Cache de tipo por sessão em `expedicao.html`** (`TIPO_CACHE`) já evita reconsultar o mesmo item repetidamente dentro da mesma visita — é o único ponto do sistema que já pensa em evitar trabalho redundante.
- **RLS habilitado (ainda que permissivo)** — pelo menos existe a camada, o que facilita endurecer no futuro sem reescrever a aplicação.
- Uso de `Promise.all` para paralelizar buscas por item em `expedicao.enriquecerTipos` e `demanda.enriquecerItem` — evita o pior cenário (N requisições *sequenciais*), mesmo que N requisições paralelas por item continue sendo o padrão errado (seção 6).

## 4. Pontos Fracos

- Nenhuma página faz filtragem/paginação real no servidor para os dados que realmente crescem sem limite (`producao_eventos`) — tudo assume "a tabela é pequena o suficiente para caber na memória do navegador".
- Todo recarregamento de dados (polling ou Realtime) é "tudo de novo", nunca incremental — não existe conceito de "só atualizar a peça que mudou".
- Duplicação de lógica de busca de tipo V/I em **quatro lugares diferentes** (`index.html`, `cliente.html`, `demanda.html`, `expedicao.html`) com a mesma query, cada uma escrita à mão.
- Sanitização de saída inconsistente (`esc()` só escapa aspas simples, não é uma proteção de HTML) — funciona por convenção manual em alguns lugares, não em todos.
- Nenhum teste automatizado, nenhum ambiente de staging — qualquer regressão de performance só aparece em produção.

---

## 5. Gargalos Encontrados

Esta seção lista os gargalos técnicos centrais; o detalhe formal (evidência, gravidade, impacto, soluções) de cada um está nas seções 6–11, organizados por área. Ordem de gravidade, do pior para o menor:

1. **Full table scan client-side de `producao_eventos`** em `operadores.html` e `otd.html` (seção 7/9).
2. **Recarga total (não incremental) de `posicao_atual` a cada evento + a cada 60s, em paralelo, em até 4 páginas** (seção 7/8).
3. **`enriquecerItem` busca histórico completo só para ler a última linha** (seção 9/10).
4. **Sobre-busca por operador em `apontamentos.html`** — baixa todo mundo, filtra um só no navegador (seção 9/10).
5. **N+1 de classificação V/I duplicado em 4 arquivos**, sem batching (seção 9/10).
6. **Sem debounce na busca ao vivo de `index.html`** — até 10 requisições paralelas por tecla digitada (seção 10).
7. **RLS totalmente permissivo com chave pública exposta** — qualquer um com a chave (já pública no JS) lê/escreve/apaga qualquer linha de qualquer tabela via API, sem passar pela UI (seção 11).

---

## 6. Problemas de Performance

### Problema P1 — `operadores.html` e `otd.html` carregam a tabela `producao_eventos` inteira no navegador

**Local:** `operadores.html:231-243` (`init()`), `otd.html:288-304` (`init()`).

**Evidências:** código faz `while(true){ fetch chunk de 1000 linhas, offset+=1000 } até a resposta vir vazia` — sem nenhum filtro de data ou de outro tipo. Medi diretamente contra a API em produção:
- `producao_eventos` tem hoje **27.026 linhas** (contagem exata via `Prefer: count=exact`).
- Um único chunk de 1000 linhas com as colunas que `operadores.html` pede pesa **614 KB**; com as colunas mais enxutas de `otd.html`, **355 KB**.
- Isso projeta o carregamento completo de hoje em **~16,6 MB** (`operadores.html`) e **~9,6 MB** (`otd.html`) *por abertura de página*, em ~27 requisições sequenciais (o `while` espera cada chunk terminar antes do próximo — não é paralelo).
- Taxa de crescimento da tabela: evento mais antigo em 06/04/2026, mais recente em 02/07/2026 → **~310 eventos/dia** em média. Ou seja, o payload dessas duas páginas cresce sozinho, todo dia, mesmo que o número de usuários do sistema não mude.

**Gravidade:** Crítica.

**Impacto atual:** cada abertura dessas duas páginas custa dezenas de requisições e ~10-17 MB de tráfego — a cota de 5 GB/mês do plano gratuito seria consumida com **pouco mais de 300 aberturas dessas duas páginas no mês inteiro**, contando só elas.

**Impacto futuro:** o payload cresce ~190 KB/dia (`otd`) a ~213 KB/dia (`operadores`) só de crescimento orgânico da produção — em 6 meses o carregamento de cada uma dessas páginas já estará na casa de 25-35 MB *por abertura*, dobrando de novo em outro ano. Isso é crescimento de custo **sem relação com quantos usuários o sistema tem** — é puro acúmulo histórico.

**Soluções possíveis:**
- **(A) Filtrar por período no servidor** (ex.: só carregar os últimos 30/90 dias por padrão, com opção de ampliar) — mesma lógica que `apontamentos.html` já usa com `data_evento=gte...lte...`. Vantagem: reduz o payload para uma fração fixa, independente do tamanho histórico da tabela. Desvantagem: nenhuma, é só adicionar o filtro que já existe em outra página do mesmo sistema. Custo: zero (não precisa de nada pago). Risco: baixo, mas precisa decidir com o usuário qual o período padrão certo para os indicadores de Performance/OTD.
- **(B) Criar uma view/RPC agregada no Postgres** que já devolve os totais por operador/processo/mês prontos, em vez de mandar a linha bruta para o navegador somar. Vantagem: reduz o payload de MB para KB. Desvantagem: exige DDL (função/view), que já está documentado como operação de credencial elevada no projeto. Custo: zero (Postgres já faz isso de graça, é só reorganizar onde a soma acontece). Risco: médio (mexe em SQL, precisa validar contra os números atuais da tela antes de trocar).
- **(C) Paginação real na UI** (o usuário escolhe o período, a página só busca aquele período) — mais simples que (B), resolve o mesmo problema que (A) mas dando controle ao usuário em vez de um padrão fixo.

**Dificuldade:** Baixa (opção A) a Média (opção B).

**Ganho esperado:** redução de ~90% no payload dessas duas páginas assim que um filtro de período razoável (ex.: 90 dias) for aplicado, já que a maior parte do histórico de 27 mil eventos não é usada para calcular indicadores do mês corrente.

**Vale a pena?** **Sim.** É o maior gargalo do sistema hoje, a correção mais simples (opção A) não exige nenhuma mudança de schema, e o ganho é imediato e proporcional ao tamanho da tabela — quanto mais o negócio cresce, mais essa correção compensa.

---

### Problema P2 — `apontamentos.html` baixa os eventos de **todos** os operadores e filtra um só no navegador

**Local:** `apontamentos.html:190-218` (`buscar()`).

**Evidências:** a query filtra só por `data_evento` (`gte`/`lte`); a seleção do operador (`nomeOp(r.operador)===op`) acontece depois, em JavaScript, sobre o array já baixado (`todos.filter(...)`). O comentário no próprio código admite isso: *"filtra por operador no browser (necessário pois nome pode ter prefixo numérico)"*.

**Gravidade:** Média.

**Impacto atual:** se 5 operadores lançaram apontamentos hoje e o usuário quer ver só 1, o sistema baixa os dados dos 5 para descartar 4/5 do que veio. Com o período padrão sendo "hoje", o impacto é pequeno hoje (poucas centenas de linhas/dia).

**Impacto futuro:** se o usuário ampliar o período (ex.: "este mês"), o payload cresce proporcionalmente ao número de operadores ativos no período inteiro, não só ao operador escolhido — o mesmo problema de fundo do P1, em escala menor porque tem filtro de data.

**Soluções possíveis:** usar um filtro `operador=like.*NOME*` do próprio PostgREST (que suporta `like`/`ilike` com wildcard, resolvendo o problema do prefixo numérico sem precisar trazer todo mundo). Vantagem: elimina o over-fetch por completo, sem mudar schema. Desvantagem: nenhuma relevante. Custo: zero. Risco: baixo — é trocar o filtro na URL da query, mesma função.

**Dificuldade:** Baixa.

**Ganho esperado:** proporcional ao número de operadores ativos no período — com 10 operadores ativos, ~90% menos dado trafegado numa busca por 1 operador.

**Vale a pena?** **Sim**, principalmente porque a correção é trivial (mudar um filtro), mas a prioridade é menor que P1 porque o período padrão ("hoje") já limita o dano.

---

### Problema P3 — `enriquecerItem` busca o histórico inteiro da peça só para usar a última linha

**Local:** `demanda.html:470` (`const eventos = await buscarHistorico(...)`) chamando `status.js:52` (`buscarHistorico`, que é `select=*...order=id.asc`, **sem `limit`**).

**Evidências:** a função `calcProgresso(eventos)` (`status.js:144-150`) usa só `eventos[eventos.length-1]` — a última posição do array. Ainda assim, `enriquecerItem` pede o histórico **completo e ordenado** da peça (que pode ter dezenas de eventos, uma linha por entrada/saída em cada processo) só para descartar tudo, exceto a última linha. Duas linhas abaixo, a mesma função já faz uma busca separada com `order=id.desc&limit=1` para outra informação (tipo V/I) — ou seja, o padrão certo já existe no mesmo arquivo, só não foi aplicado aqui.

**Gravidade:** Alta (é um bug de eficiência concreto, não uma questão de arquitetura).

**Impacto atual:** essa função roda para **cada item de cada cliente** aberto na Demanda, em paralelo (`Promise.all`), toda vez que a lista é aberta **e** toda vez que um apontamento em qualquer lugar da fábrica dispara o recarregamento via Realtime (`demanda.html:947`). Com 27 itens hoje, o desperdício já existe mas é pequeno em volume absoluto.

**Impacto futuro:** o desperdício é proporcional ao número de eventos por peça (que cresce com a complexidade do roteiro de fabricação) multiplicado pelo número de itens na demanda — os dois crescem com o negócio, então esse desperdício cresce em dois eixos ao mesmo tempo.

**Soluções possíveis:** trocar `buscarHistorico` por uma chamada com `order=id.desc&limit=1` (igual ao padrão já usado duas linhas abaixo no mesmo arquivo) — usar `calcProgressoRow(row)` (que já existe em `status.js:152`, feito exatamente para operar sobre uma única linha) em vez de `calcProgresso(eventos)`.

**Dificuldade:** Baixa — a função certa (`calcProgressoRow`) e o padrão de query certo já existem no próprio código, é só trocar a chamada.

**Ganho esperado:** proporcional ao número médio de eventos por peça; se uma peça típica passa por 10-20 operações, isso é uma redução de ~90-95% no payload dessa chamada específica.

**Vale a pena?** **Sim, e é a correção com melhor relação esforço/ganho de toda a auditoria** — literalmente trocar uma chamada de função por outra que já existe no mesmo arquivo.

---

## 7. Problemas de Escalabilidade

### Problema P4 — Recarga total (não incremental) de `posicao_atual` disparada por Realtime + polling de 60s, em até 4 páginas simultâneas

**Local:** `kanban.html:341-363`, `expedicao.html` (`init` + `setInterval(init,60000)` linha 533), `op-kanban.html:369,386`, todas chamando `buscarPosicao()` (`status.js:46-49`, `select=*&limit=10000` sobre `posicao_atual`).

**Evidências:**
- Medido diretamente: `posicao_atual?select=*&limit=10000` pesa **734 KB** hoje (971 linhas).
- As 4 páginas (`kanban`, `expedicao`, `op-kanban`, mais o polling equivalente em `apontamentos`) têm `setInterval(..., 60000)` **incondicional** — o comentário no código diz "rede de segurança caso o websocket caia", mas o `setInterval` roda sempre, não só quando o WebSocket de fato cai. Ou seja, mesmo com o Realtime funcionando perfeitamente, essas páginas já pagam o custo de recarregar tudo a cada 60 segundos, **em dobro** (uma vez pelo polling, potencialmente de novo pelo Realtime se algo mudou naquele minuto).
- Além disso, o handler de Realtime (`refreshDebounced`/`atualizarAuto`) não faz *merge* do evento recebido no estado local — ele **refaz a busca inteira** (`buscarPosicao()` de novo) a cada notificação de mudança em `producao_eventos`, com debounce de só 1,2s. Como qualquer apontamento em **qualquer processo, de qualquer peça, de qualquer operador** dispara esse evento, um dia de produção ativo (múltiplos operadores lançando apontamentos o tempo todo) pode gerar dezenas de recargas completas por hora, em cada aba aberta.

**Gravidade:** Crítica.

**Impacto atual:** com poucos usuários e uso moderado, ainda é administrável (~0,42 GB usados em 5 dias, dentro da cota).

**Impacto futuro:** ver a simulação detalhada na seção 13 — este é o problema que, sozinho, faz o sistema não escalar de forma saudável para além de um punhado de usuários com essas telas abertas o dia todo.

**Soluções possíveis:**
- **(A) Remover o polling de 60s quando o canal Realtime está conectado**, deixando-o só como *fallback* de verdade (ligado só quando a conexão WebSocket cair) — elimina a duplicação garantida hoje.
- **(B) Trocar recarga total por atualização incremental**: o payload do evento Realtime do Supabase já traz a linha que mudou (`payload.new`) — em vez de rebuscar as 971 linhas de `posicao_atual`, atualizar só a entrada correspondente no array local (`POS`) e re-renderizar. Vantagem: elimina praticamente todo o tráfego de recarga. Desvantagem: mais lógica no cliente para tratar merge de estado, e `posicao_atual` é uma *view* (o evento chega de `producao_eventos`, não da view diretamente — precisa reconstruir a "posição atual" daquela peça a partir do evento recebido, ou aceitar buscar só aquela peça específica em vez da tabela toda). Custo: zero. Risco: médio — exige mais cuidado para não introduzir inconsistência de estado.
- **(C) Aumentar o debounce** (de 1,2s para, digamos, 5-10s) — reduz a frequência de recarga em picos de atividade sem mudar a arquitetura. Solução paliativa, não resolve o fundo do problema, mas é a mais rápida de aplicar.

**Dificuldade:** Baixa (A e C) a Média/Alta (B, a solução definitiva).

**Ganho esperado:** (A) sozinho corta pela metade o pior caso de duplicação; (C) reduz picos; (B) é a única que resolve de fato o crescimento proporcional ao número de usuários simultâneos — ganho estimado de 80-95% no tráfego dessas 4 páginas somadas.

**Vale a pena?** **Sim.** Recomendo (A)+(C) como correção imediata (baixo risco, baixo esforço) e (B) como evolução estrutural quando houver tempo — não precisa ser tudo de uma vez.

---

## 8. Problemas do Supabase

### Problema P5 — Fan-out de 5 canais Realtime distintos para o mesmo evento

**Local:** `kanban.html:357-359`, `expedicao.html:526-529`, `op-kanban.html:380-382`, `demanda.html:955-957`, `apontamentos.html:474-476` — cada um cria seu próprio `channel()` com `.on("postgres_changes",{event:"*",...,table:"producao_eventos"},...)`.

**Evidências:** medido no painel do projeto: **Realtime Concurrent Peak Connections: 7** hoje, **2.686 mensagens Realtime** em ~5 dias de ciclo. Cada apontamento novo em `producao_eventos` é transmitido a **todos os canais abertos em todas as abas** dessas 5 páginas, simultaneamente — se 10 pessoas estão com o Kanban aberto e mais 5 com a Expedição, um único apontamento gera 15 mensagens Realtime (uma por aba conectada àquele canal), cada uma disparando o recarregamento total descrito no P4.

**Gravidade:** Média (hoje) — o volume de mensagens está bem abaixo de qualquer limite conhecido do plano gratuito — mas **o efeito colateral (P4) é que faz isso ser um problema real**, já que cada mensagem recebida vira uma recarga completa de dados, não é a mensagem em si que pesa.

**Impacto atual:** baixo, dado o volume atual de usuários simultâneos.

**Impacto futuro:** cresce linearmente com (nº de eventos de produção) × (nº de abas abertas) — ambos tendem a crescer junto com o negócio.

**Soluções possíveis:** já cobertas pelo P4 (o problema real não é ter 5 canais, é o que cada canal faz ao disparar) — mas vale considerar consolidar em um único canal compartilhado por página em vez de recriar a subscrição a cada `init()`/reload (hipótese a confirmar: verificar se `iniciarRealtime()` é chamado mais de uma vez por sessão em algum fluxo, o que deixaria canais duplicados abertos na mesma aba — não encontrei evidência disso no código lido, mas vale um teste manual abrindo o DevTools > Network > WS ao navegar entre "voltar"/recarregar dentro da mesma página).

**Dificuldade:** Baixa (a correção real está no P4).

**Ganho esperado:** depende do P4.

**Vale a pena?** Ver P4 — este item é mais um sintoma do mesmo problema do que uma causa separada.

---

### Problema P6 — Projeto sujeito a auto-pausa por inatividade (comportamento documentado do plano gratuito)

**Local:** não é um problema de código — é uma característica do plano gratuito da Supabase.

**Evidências:** já vivenciamos nesta mesma sessão um caso de indisponibilidade (posteriormente identificado como incidente de plataforma, não pausa) — mas o mecanismo de auto-pausa por inatividade de projetos gratuitos existe e é diferente de um incidente de plataforma. **Hipótese a confirmar**: qual o período exato de inatividade que dispara a pausa (histórico documentado publicamente da Supabase costuma ser em torno de 7 dias, mas isso pode mudar — conferir em supabase.com/pricing antes de tomar qualquer decisão baseada nesse número).

**Gravidade:** Baixa no caso deste projeto específico — o sistema tem uso diário constante (chão de fábrica lançando apontamentos o tempo todo), então a inatividade de vários dias seguidos que dispararia a pausa é um cenário improvável na prática (só aconteceria em um fim de semana prolongado sem nenhum acesso, feriados longos, etc.).

**Impacto atual/futuro:** só relevante para períodos de parada da fábrica (férias coletivas, por exemplo) — vale ter um lembrete de calendário para algum acesso mínimo durante esses períodos, se aplicável.

**Soluções possíveis:** nenhuma ação de código necessária; monitorar se há previsão de paradas prolongadas na operação.

**Dificuldade:** N/A.

**Ganho esperado:** N/A — é gestão operacional, não técnica.

**Vale a pena?** Não é uma correção de sistema — é só um ponto de atenção operacional.

---

## 9. Problemas do Banco de Dados

### Problema P7 — Índices não confirmados nas colunas mais filtradas (HIPÓTESE)

**Local:** `producao_eventos` — colunas usadas em filtros `WHERE`/`eq`/`ilike` em praticamente toda consulta do sistema: `pedido`, `codigo_peca`, `cliente`, `operador`, `data_evento`.

**Evidências:** a chave pública (anon) não dá acesso a `pg_catalog`/`information_schema` via PostgREST por padrão, então **não consegui confirmar diretamente** se essas colunas têm índice — isto é uma hipótese a verificar, não um fato observado. O que **é** fato observado: toda página do sistema, sem exceção, filtra `producao_eventos` por `pedido+codigo_peca` (lookup de tipo/progresso) ou por `data_evento` (relatórios) ou por `operador` (apontamentos/painel) — se essas colunas não tiverem índice, cada uma dessas dezenas de consultas por item/página vira um scan sequencial na tabela inteira (hoje 27 mil linhas, crescendo ~310/dia).

**Gravidade:** Alta **se a hipótese se confirmar** (não sabemos ainda).

**Impacto atual:** se não houver índice, o tempo de resposta de cada consulta individual (hoje na casa de 0,3-0,8s conforme medi) tende a piorar de forma mais que proporcional ao crescimento da tabela — 27 mil linhas ainda é pequeno o bastante para o Postgres "aguentar" um scan sequencial rápido; em 200-300 mil linhas, a diferença entre ter e não ter índice fica muito mais visível.

**Impacto futuro:** com o volume de consultas por item (P8 abaixo) multiplicado pelo crescimento da tabela, a ausência de índice nas colunas certas é o tipo de problema que "não aparece" hoje e vira lentidão perceptível de uma hora para outra quando a tabela cruza um certo tamanho.

**Soluções possíveis:** pedir para alguém com acesso ao SQL Editor do Supabase (ou usar a Management API com um Personal Access Token, como já é feito para outras alterações de schema neste projeto) rodar `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='producao_eventos';` para confirmar. Se faltarem índices em `pedido`, `codigo_peca`, `data_evento` e `operador`, criar `CREATE INDEX` para cada um (idealmente um índice composto em `(pedido, codigo_peca)`, já que é sempre o par usado junto). **Nada disso deve ser executado nesta fase de auditoria** — é uma recomendação para a Fase 2, mediante autorização.

**Dificuldade:** Baixa (é rodar uma consulta de verificação) a Média (criar índice em tabela de 27 mil linhas é rápido; ficaria mais delicado se a tabela já estivesse na casa de milhões).

**Ganho esperado:** se a hipótese se confirmar, ganho potencialmente grande (ordens de magnitude) no tempo de resposta de cada consulta filtrada — mas **não posso estimar percentual sem confirmar primeiro se o índice já existe ou não**.

**Vale a pena?** **Sim, ao menos a verificação** — é барата (uma consulta de leitura) e remove uma incerteza importante do resto da auditoria.

---

### Problema P8 — Consultas N+1 para classificação V/I duplicadas em 4 arquivos

**Local:** `index.html:184-191`, `cliente.html:238-270` (até 3 consultas por busca), `demanda.html:475` e `556`, `expedicao.html:236` (dentro de `enriquecerTipos`).

**Evidências:** todas fazem a mesma consulta — `producao_eventos?select=razao_social,classificacao_fiscal&codigo_peca=eq.X&pedido=eq.Y&or=(razao_social.not.is.null,classificacao_fiscal.not.is.null)&order=id.desc&limit=1` — uma vez **por item exibido**, em vez de uma única consulta batched para todos os itens de uma vez (o PostgREST suporta `codigo_peca=in.(a,b,c,...)`, embora o `order+limit=1 por grupo` exija ou uma função RPC no Postgres, ou aceitar trazer mais linhas e agrupar no cliente).

**Gravidade:** Média.

**Impacto atual:** com 27 itens na Demanda e poucas dezenas de peças na Expedição, o número de requisições paralelas por carregamento de página é pequeno (a única exceção seria se um cliente tivesse uma lista de itens grande).

**Impacto futuro:** cresce linearmente com o número de itens simultâneos na tela — e cada requisição extra é uma conexão a mais aberta no Postgres ao mesmo tempo (o plano Nano tem um teto de conexões — vimos "23/60" no painel no momento da auditoria de acesso anterior).

**Soluções possíveis:** criar uma função Postgres (RPC) tipo `get_tipos_lote(pares jsonb)` que devolve a classificação de vários pares pedido+código de uma vez, chamada uma única vez por tela em vez de N vezes. Alternativa mais simples sem mexer em SQL: buscar um lote maior (`codigo_peca=in.(...)` sem o filtro de pedido) e resolver o "pedido certo" no cliente, aceitando alguma imprecisão nos poucos casos de código duplicado entre pedidos — mais simples, porém reintroduz o risco que already foi corrigido nesta mesma sessão (mistura de tipo entre pedidos diferentes do mesmo código) — **não recomendo essa alternativa** por esse motivo.

**Dificuldade:** Média (a solução robusta exige uma função no banco, que é DDL/credencial elevada).

**Ganho esperado:** proporcional ao número de itens por tela — reduziria de N requisições para 1 por carregamento.

**Vale a pena?** **Sim, mas com prioridade menor que P1/P3/P4** — o volume atual de itens é pequeno o bastante para isso não doer ainda.

---

## 10. Problemas do Front-end

### Problema P9 — Busca ao vivo em `index.html` sem debounce, disparando até 10 requisições paralelas por tecla

**Local:** `index.html:196-222` (`addEventListener("input", ...)`).

**Evidências:** o listener roda a cada tecla digitada, sem nenhum `setTimeout`/debounce. A filtragem em si é local (sobre o array `POS` já carregado), mas para cada um dos até 10 resultados exibidos, se o tipo V/I ainda não é conhecido, dispara um `buscarTipo()` (`forEach(async...)`, ou seja, todos de uma vez, sem esperar o anterior). Digitar um código de 6 caracteres pode, no pior caso, gerar ~6 renders × até 10 requisições = até 60 requisições HTTP para uma única busca.

**Gravidade:** Baixa a Média (o volume de uso de uma busca manual é naturalmente baixo comparado às páginas de monitoramento contínuo).

**Impacto atual:** pequeno — poucas pessoas buscando ao mesmo tempo, poucos caracteres.

**Impacto futuro:** cresce com o número de usuários simultâneos usando a busca — o tipo de problema que só aparece em auditorias como esta, silencioso no dia a dia.

**Soluções possíveis:** adicionar debounce de ~250-300ms no listener antes de rodar a filtragem/enriquecimento — padrão já usado em outras partes do próprio sistema (o Realtime de várias páginas já usa debounce, é só replicar a técnica aqui).

**Dificuldade:** Baixa.

**Ganho esperado:** redução de ~80-90% no número de requisições de enriquecimento de tipo durante uma busca digitada.

**Vale a pena?** **Sim** — é barato e rápido, mesmo não sendo o gargalo mais urgente.

---

### Problema P10 — Duplicação de lógica de negócio entre as 13 páginas

**Local:** todo o repositório — cada página repete o bloco de variáveis CSS (`:root{...}`), o HTML do menu de navegação, e (como visto no P8) a lógica de busca de tipo V/I.

**Evidências:** já documentado no `ARQUITETURA.md` desta mesma auditoria — mudança de menu exige reescrever o bloco `.nav` em todos os 13 arquivos via script; mudança de paleta de cores exige o mesmo para o bloco `:root`.

**Gravidade:** Baixa como *performance* (não afeta o usuário final diretamente), Média como *risco de manutenção*.

**Impacto atual:** já observado nesta sessão — alterações de padrão visual/menu exigem reescrever várias páginas de uma vez, com risco de esquecer uma.

**Impacto futuro:** quanto mais páginas o sistema ganhar, mais cara fica cada mudança de padrão — é um custo que cresce com o tamanho do sistema, não com o número de usuários.

**Soluções possíveis:** extrair o bloco de variáveis CSS e o menu para um único arquivo (`design.css`, `nav.js`) carregado via `<link>`/`<script src>` em vez de copiado — mantendo a filosofia "sem build" do projeto (é só um arquivo estático a mais, sem precisar de bundler). A lógica de busca de tipo V/I (P8) poderia virar uma função só em `status.js`, chamada pelas 4 páginas em vez de reimplementada.

**Dificuldade:** Baixa (extrair CSS/menu) a Média (unificar a lógica de tipo, que tem pequenas variações de contexto entre as páginas).

**Ganho esperado:** não é ganho de performance, é redução do tempo/risco de manutenção futura — difícil de quantificar em %, mas o histórico desta própria sessão (várias mudanças que precisaram tocar 13 arquivos de uma vez) já é evidência de que o custo é real.

**Vale a pena?** **Sim, mas é o item de menor urgência desta auditoria** — não é performance nem risco de indisponibilidade, é qualidade de manutenção a médio prazo.

---

## 11. Problemas de Segurança

### Problema P11 — RLS totalmente permissivo (`using(true) with check(true)`) com a chave pública exposta no JS

**Local:** todas as tabelas (`producao_eventos`, `demanda_itens`, `demanda_clientes`, `kanban_operadores`), conforme documentado no próprio `CLAUDE.md` do projeto como convenção padrão para tabelas novas — e confirmado indiretamente pelo fato de **toda escrita do sistema** (criar/editar/apagar item de demanda, marcar exp_status, configurar operador do painel) ser feita por `fetch` direto do navegador com a chave pública, sem nenhuma validação server-side.

**Evidências:** `SUPA_URL` e `SUPA_KEY` estão em texto plano em `status.js`, carregado publicamente por qualquer visitante de `brasmat-mes.vercel.app` (o site não tem tela de login). Qualquer pessoa que abra o DevTools do navegador tem, em segundos, as credenciais completas para ler, escrever ou apagar qualquer linha de qualquer uma das 4 tabelas diretamente via `curl`/Postman, **sem passar pela interface do sistema**.

**Gravidade:** Alta em termos absolutos de superfície de ataque — **mitigada na prática** pelo fato de ser um sistema interno, sem divulgação pública do link, sem dado sensível de terceiros (não há CPF, dado financeiro ou de cartão) — mas ainda assim é uma exposição real: um erro humano (compartilhar o link/print de tela com alguém de fora, um ex-funcionário guardando a URL) vira acesso de escrita/exclusão total ao banco de produção.

**Impacto atual:** nenhum incidente conhecido, mas a porta está aberta.

**Impacto futuro:** cresce com o número de pessoas que sabem da existência do link — quanto mais o sistema é usado e divulgado internamente (inclusive esta auditoria, que será compartilhada com uma equipe de desenvolvedores), maior a chance de a URL/chave circularem informalmente.

**Soluções possíveis:**
- **(A) Aceitar o risco como está**, documentando-o formalmente (o que esta auditoria já faz) — é a postura de muitos sistemas internos pequenos, mas deve ser uma decisão consciente, não um acaso.
- **(B) Adicionar autenticação leve** (ex.: Supabase Auth com login simples por e-mail/senha para os poucos usuários internos, RLS passando a exigir `auth.uid()` em vez de `true`) — eliminaria o acesso anônimo por completo. Vantagem: fecha a porta de vez. Desvantagem: exige tela de login, gestão de usuários, e ajustar toda consulta/escrita do sistema para passar pela sessão autenticada — é a mudança de maior escopo de toda a auditoria. Custo: ainda gratuito no plano free da Supabase (Auth incluso), mas custo de desenvolvimento é o maior desta lista.
- **(C) Meio-termo: obscurecer/restringir por Edge Function** — criar uma função intermediária que valida algo simples (ex.: um token compartilhado só conhecido pelos usuários internos) antes de repassar ao Postgres — reduz o risco de descoberta acidental sem o custo total de um sistema de login completo.

**Dificuldade:** Baixa (A, é só documentar) a Alta (B, retrabalho significativo em todas as páginas).

**Ganho esperado:** (B) elimina o risco quase por completo; (C) reduz sem eliminar.

**Vale a pena?** **Depende de uma decisão de negócio, não técnica** — recomendo ao menos registrar formalmente que esse é um risco aceito conscientemente (opção A), e considerar (B) se em algum momento o sistema passar a lidar com dado mais sensível ou ficar acessível para além da rede/pessoal de confiança de hoje.

---

### Problema P12 — Escape de HTML inconsistente (`esc()` só trata aspas simples)

**Local:** `status.js:102` (`function esc(s){ return String(s||"").replace(/'/g,"\\'"); }`), usada para montar atributos `onclick='...'` — não é uma função de sanitização de conteúdo HTML. Alguns pontos do código adicionam manualmente `.replace(/</g,"&lt;")` para texto exibido (`expedicao.html:351`, textarea de observação em `demanda.html:878`), mas isso não é aplicado de forma sistemática a todo campo de texto livre (ex.: código de peça digitado manualmente para "item novo").

**Gravidade:** Baixa a Média — é um sistema interno, sem cadastro público de usuários, mas ainda assim é uma inconsistência que uma auditoria de segurança formal reprovaria.

**Impacto atual:** exigiria alguém internamente digitar algo malicioso em um campo (ex.: código de peça) para ter efeito — cenário de baixa probabilidade num sistema interno de chão de fábrica, mas não impossível (erro de digitação colando conteúdo de outro lugar, por exemplo).

**Impacto futuro:** se o sistema ganhar mais campos de texto livre (comentários, observações adicionais), o risco cresce proporcionalmente se a mesma falta de padronização for repetida.

**Soluções possíveis:** criar uma função `escHtml()` central em `status.js` (escapando `<`, `>`, `&`, `"`) e usá-la em todo lugar que hoje interpola valor de banco em `innerHTML` — separar claramente "escape para atributo/onclick" (o `esc()` atual) de "escape para conteúdo HTML" (função nova).

**Dificuldade:** Baixa.

**Ganho esperado:** elimina a inconsistência; não há "percentual" aplicável, é uma correção binária (protegido/não protegido).

**Vale a pena?** **Sim**, é barato e reduz uma classe inteira de erro futuro, mesmo com risco prático atual baixo.

---

## 12. Consumo Estimado de Recursos (hoje, medido)

| Métrica | Valor medido hoje | Cota Plano Free | Observação |
|---|---|---|---|
| Egress (banda) | 0,42 GB em ~5 dias do ciclo | 5 GB/mês | Ritmo projetado ~2,3 GB/mês **no padrão de uso atual** — mas isso não inclui uso pesado de `operadores.html`/`otd.html` no período medido |
| Tamanho do banco | 0,036 GB (36 MB) | ~0,5 GB (verificar valor atual em supabase.com/pricing) | Não é o recurso mais próximo do limite — ver seção 13 |
| Storage (bucket de anexos) | 0,003 GB (3 MB) | ~1 GB (verificar valor atual) | Bem longe do limite |
| Realtime — conexões simultâneas (pico) | 7 | ~200 (verificar valor atual) | Longe do limite hoje |
| Realtime — mensagens | 2.686 em ~5 dias | ~2 milhões/mês (verificar valor atual) | Longe do limite hoje |
| Linhas em `producao_eventos` | 27.026 | — | Crescendo ~310/dia |
| Linhas em `posicao_atual` (view) | 971 | — | Cresce com nº de peças distintas ativas, não com histórico |
| Linhas em `demanda_itens` | 27 | — | Pequeno, cresce com carteira de pedidos ativa |

**Nota importante:** os valores de cota do plano gratuito acima estão marcados como "verificar valor atual" onde não confirmei diretamente no painel durante esta auditoria — a Supabase já mudou esses números no passado, então qualquer decisão que dependa do valor exato deve reconferir em supabase.com/pricing antes de agir.

---

## 13. Simulação para 20, 30, 50 e 100 usuários

Premissa de simulação: usuários com pelo menos uma das páginas "always-on" (Kanban, Expedição, Painel) abertas durante um turno de 8 horas — cenário plausível para supervisores/chão de fábrica acompanhando o quadro o dia todo, que é exatamente o caso de uso para o qual essas páginas foram desenhadas.

Cálculo-base (medido, não estimado): `buscarPosicao()` = 734 KB por chamada, hoje. Cada uma das 3 páginas "always-on" chama isso a cada 60s (polling incondicional, P4) **mais** a cada evento de produção (debounce 1,2s) — para a simulação, uso só o piso do polling de 60s (cenário conservador/otimista, ignorando os disparos extras do Realtime):

- 1 aba, 1 hora: 60 × 734 KB ≈ **44 MB/hora**
- 1 aba, turno de 8h: ≈ **352 MB/dia**

| Usuários simultâneos (1 aba "always-on" cada) | Egress projetado/dia (só polling, piso) | Egress projetado/mês (22 dias úteis) | Vs. cota de 5 GB/mês |
|---|---|---|---|
| 20 | ~7,0 GB | ~155 GB | **Estoura a cota mensal em menos de 1 dia** |
| 30 | ~10,6 GB | ~232 GB | Estoura ainda mais rápido |
| 50 | ~17,6 GB | ~387 GB | Estoura em horas |
| 100 | ~35,2 GB | ~774 GB | Estoura em minutos/poucas horas |

**Isso é o achado mais importante de toda a simulação**: mesmo com **apenas 20 usuários**, se cada um deixar uma dessas páginas aberta o turno inteiro, o polling de 60s sozinho (sem contar Realtime, sem contar `operadores.html`/`otd.html`) já consome a cota mensal inteira **em menos de um dia**. Isso não é um cenário de "100 usuários no futuro distante" — é um risco real e imediato assim que o número de pessoas com essas telas abertas simultaneamente crescer um pouco além do que existe hoje.

**Primeiro gargalo a aparecer, nesta ordem:**
1. **Egress (banda)** — por causa do P4 (recarga total de `posicao_atual` a cada 60s por aba aberta), é de longe o primeiro limite a ser atingido, muito antes de qualquer limite de banco de dados ou de conexões.
2. **Conexões diretas ao Postgres** — vimos no painel um pool de conexões (Nano compute) sendo usado a ~23/60 no momento observado; com múltiplas abas abertas fazendo requisições PostgREST simultâneas (cada uma abre e fecha conexão rapidamente, mas picos de muitos usuários ao mesmo tempo podem esgotar o pool momentaneamente), seria o segundo gargalo, mas só relevante depois de resolver o primeiro (egress já teria "matado" a experiência do usuário antes disso, com respostas lentas/bloqueadas por excesso de tráfego).
3. **Realtime concurrent connections** — terceiro gargalo, hoje longe (7 de um teto bem mais alto), só se tornaria relevante em uma escala de usuários bem maior que 100, e só depois dos dois primeiros já terem sido corrigidos ou já terem causado degradação.

**Conclusão da simulação:** o sistema **não está pronto, hoje, para 20+ usuários simultâneos com as telas de monitoramento abertas o dia todo**, mas o motivo não é falta de capacidade do Supabase — é o padrão de "recarregar tudo a cada 60s, para todo mundo" (P4) sendo aplicado a um recurso que já pesa 734 KB e só vai crescer. Corrigindo P4 (seção 7), esse teto sobe drasticamente, provavelmente o suficiente para os 100 usuários sem precisar de plano pago.

---

## 14. Recomendações Priorizadas

| Prioridade | Problema | Gravidade | Impacto | Dificuldade | Ganho Esperado | Solução Recomendada |
|---|---|---|---|---|---|---|
| 1 | P4 — recarga total a cada 60s/evento (posicao_atual, 4 páginas) | Crítica | Crítico (bloqueia escala a 20+ usuários) | Baixa (mitigação) / Média (fix definitivo) | 80-95% do tráfego dessas páginas | Remover polling redundante quando Realtime ativo + aumentar debounce; depois evoluir para merge incremental |
| 2 | P1 — full table scan em `operadores.html`/`otd.html` | Crítica | Alto, cresce ~200 KB/dia sozinho | Baixa | ~90% do payload dessas 2 páginas | Filtrar por período no servidor (ex.: 90 dias padrão) |
| 3 | P3 — `enriquecerItem` busca histórico completo por 1 linha | Alta | Baixo hoje, cresce com nº de operações/peça | Baixa (trivial) | 90-95% do payload dessa chamada | Trocar `buscarHistorico`+`calcProgresso` por query `limit=1`+`calcProgressoRow` (já existe no código) |
| 4 | P7 — índices não confirmados (hipótese) | Alta (se confirmado) | Desconhecido até verificar | Baixa (verificação) | A definir | Rodar `pg_indexes` via SQL Editor; criar índices em `pedido`, `codigo_peca`, `data_evento`, `operador` se faltarem |
| 5 | P2 — over-fetch por operador em apontamentos | Média | Baixo hoje, cresce com período ampliado | Baixa | ~90% em buscas por operador único | Filtro `operador=like.*NOME*` no servidor |
| 6 | P8 — N+1 de tipo V/I em 4 arquivos | Média | Baixo hoje, cresce com itens/tela | Média | Proporcional a nº de itens | RPC batched ou consolidar lógica |
| 7 | P9 — busca sem debounce em index.html | Baixa/Média | Baixo | Baixa | ~80-90% das chamadas de busca | Debounce de 250-300ms |
| 8 | P12 — escape de HTML inconsistente | Baixa/Média | Baixo (uso interno) | Baixa | Elimina inconsistência | Função `escHtml()` central |
| 9 | P11 — RLS permissivo + chave pública | Alta (estrutural) | Depende de decisão de negócio | Alta (se optar por Auth) | Elimina acesso anônimo total | Decisão consciente de aceitar risco, ou Supabase Auth |
| 10 | P10 — duplicação de CSS/menu/lógica entre páginas | Baixa (perf) / Média (manutenção) | Cresce com nº de páginas | Baixa/Média | Não é performance, é manutenção | Extrair CSS/menu para arquivo compartilhado |
| 11 | P5 — fan-out de 5 canais Realtime | Média | Sintoma do P4 | Baixa | Depende do P4 | Resolver junto com P4 |
| 12 | P6 — auto-pausa por inatividade | Baixa | Só relevante em paradas prolongadas | N/A | N/A | Nenhuma ação de código; atenção operacional em períodos de parada |

---

## 15. Plano de Ação (apenas recomendações — nada foi implementado)

Ordem sugerida de execução, uma melhoria por vez, cada uma com autorização explícita antes de começar (conforme a regra desta auditoria):

1. Confirmar a hipótese do P7 (rodar a consulta de verificação de índices) — é só leitura, baixo custo, remove uma incerteza que afeta a priorização de tudo mais.
2. P3 — trocar a chamada de histórico completo por `limit=1` em `demanda.html` (menor esforço de toda a lista, ganho imediato).
3. P4 — remover o polling de 60s redundante quando o Realtime está ativo, e aumentar o debounce (mitigação rápida do maior risco de escala).
4. P1 — adicionar filtro de período padrão em `operadores.html` e `otd.html`.
5. P2 — trocar o filtro de operador para server-side em `apontamentos.html`.
6. Reavaliar P4 com uma solução definitiva de atualização incremental, se o volume de usuários justificar o esforço adicional.
7. P9, P12 — correções pequenas e independentes, podem entrar em qualquer ponto do cronograma.
8. P8, P10 — itens de manutenção/eficiência de médio prazo, sem urgência de escala.
9. P11 — decisão de negócio a discutir separadamente (não é uma "correção", é uma escolha de postura de segurança).

**Nenhuma dessas ações será executada até autorização explícita ("pode implementar", "pode corrigir", "vamos para a Fase 2", ou equivalente).**
