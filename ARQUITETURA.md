# BRASMAT MES — Arquitetura do Sistema

Documento de referência para apresentação técnica. Cobre stack, frontend, backend,
modelo de dados e regras de negócio do sistema tal como está implementado hoje.

## 1. Visão geral

MES (Manufacturing Execution System) para a Brasmat, ferramentaria de matrizes de metal
duro. Acompanha o caminho de cada peça pela produção (retífica, torno, erosão, etc.), do
lançamento até a expedição ao cliente.

**Stack em uma frase:** frontend estático puro (sem build, sem framework, sem servidor
próprio) + Supabase (Postgres na nuvem) como backend completo (dados, auth-less API,
realtime e storage) + deploy automático via Vercel.

```
[Navegador]
   |
   |  HTML/CSS/JS estático (12 páginas), servido direto
   v
[Vercel]  <-- auto-deploy a cada git push na branch main
   |
   |  fetch() REST (PostgREST) + WebSocket (Realtime) + Storage API
   |  usando só a chave pública (anon key)
   v
[Supabase]
   ├─ Postgres (tabelas + views)
   ├─ Realtime (publication sobre 2 tabelas)
   └─ Storage (bucket público de anexos)
```

Não existe camada de aplicação/API própria, não existe autenticação de usuário, não
existe build step (webpack/vite/etc.) — cada página é servida como está no repositório.

## 2. Frontend

### 2.1 Padrão de cada página

Cada tela é um **único arquivo `.html` autocontido**: marcação, `<style>` inline e
`<script>` inline no mesmo arquivo. Não há bundler, não há transpilação, não há módulos
ES importados de outros arquivos (exceto o `status.js` compartilhado, carregado via
`<script src="status.js">`).

Isso é uma escolha deliberada: qualquer editor de texto + um `git push` já é o pipeline
de deploy completo. O trade-off é duplicação de código entre páginas (CSS do topbar,
helpers de fetch, etc.) — parcialmente mitigado pelo `status.js` compartilhado.

### 2.2 `status.js` — biblioteca compartilhada

Único arquivo JS reaproveitado entre todas as páginas. Concentra:

- **Config de conexão**: `SUPA_URL`, `SUPA_KEY` (chave pública/publishable) no topo.
- **`supaFetch(path)`** — wrapper de fetch para a REST API do PostgREST, já com headers
  `apikey`/`Authorization`.
- **`buscarPosicao()` / `buscarHistorico()`** — busca posição atual e histórico completo
  de uma peça (por pedido+código).
- **`getTipo(row)`** — classifica a peça em **V (Vendas)** ou **I (Industrialização)**,
  com fallback por razão social quando falta classificação fiscal.
- **`getSubop(row)`** — texto de sub-operação (ex.: qual etapa dentro de um processo).
- **`status(row)`** — deriva o status da peça (expedida, em_estoque, aprovada,
  aguardando, em_producao, liberada) a partir do último evento.
- **`calcProgresso()` / `calcProgressoRow()` / `renderProgresso()`** — cálculo e
  renderização da barra de progresso (`sequencial_operacao / quantidade_operacoes`).
- **`abrirPainelDetalhe()`** — painel de linha do tempo completa da peça, usado como
  "drill-down" a partir de várias telas (kanban, demanda, expedição, etc.).
- **`esc()`** — sanitização simples de strings para uso em template HTML inline.

Qualquer regra de negócio sobre "qual o tipo/status/progresso de uma peça" vive aqui —
as páginas apenas chamam essas funções, não reimplementam a lógica.

### 2.3 As 12 páginas

| Página | Arquivo | Função |
|---|---|---|
| Buscar Peça | `index.html` | Busca por código/pedido/OS, abre a linha do tempo completa da peça |
| Demanda Cliente | `demanda.html` | Gestão da carteira de pedidos por cliente: itens, prazos, anexos, prioridade/crítico, ordenação manual |
| Expedição | `expedicao.html` | Tela do almoxarifado: itens agrupados por cliente/tipo, situação (pronto/produção), marcação pendente→separado→expedido, impressão |
| Kanban | `kanban.html` | Quadro de peças por status de produção |
| Painel | `op-kanban.html` | Card por operador (ativo/parado), tempo sem atividade, config de quais operadores exibir |
| Consulta Cliente | `cliente.html` | Consulta voltada ao cliente final |
| Apontamentos | `apontamentos.html` | Lista de apontamentos de processo por operador, em tempo real |
| Prazos | `prazos.html` | Visão de prazos de entrega |
| OTD | `otd.html` | On-Time Delivery — indicador de cumprimento de prazo |
| Ordens em Aberto | `ordens.html` | Ordens de produção ainda não finalizadas |
| Peças paradas | `paradas.html` | Peças sem movimentação há X dias |
| Performance | `operadores.html` | Indicadores de produtividade por operador |

O menu de navegação (`.nav`) é idêntico e nessa mesma ordem em todas as páginas — mudança
de menu é feita via script que reescreve esse bloco em todos os arquivos de uma vez.

> Existe também um `peca.html` no repositório — é uma versão antiga/órfã da tela de
> Buscar Peça, não linkada em nenhum menu nem referenciada por nenhuma outra página.
> Não faz parte do sistema em uso; é lixo de uma iteração anterior.

### 2.4 Design system

Variáveis CSS centralizadas em `:root` (`--bg`, `--bg2/3/4`, `--text`, `--accent`, `--ok`,
`--warn`, `--danger`, `--mono`, `--sans`), repetidas (copiadas) no topo do `<style>` de
cada página — tema escuro, mono `IBM Plex Mono` para dados/código, `IBM Plex Sans` para
texto. Não há CSS compartilhado via `<link>`; a consistência visual é mantida "na mão",
copiando o mesmo bloco de variáveis entre arquivos.

### 2.5 Tempo real

5 das 12 páginas (`demanda`, `expedicao`, `kanban`, `op-kanban`, `apontamentos`) carregam
`@supabase/supabase-js` via CDN e assinam mudanças (`postgres_changes`) nas tabelas
`producao_eventos` e/ou `demanda_itens`, atualizando a tela instantaneamente quando um
apontamento é lançado no chão de fábrica ou um item de demanda muda. Todas têm fallback
via `setInterval` de 60s, caso o WebSocket caia.

## 3. Backend (Supabase)

Projeto Supabase (ref `hjvlznijsgdwurtsyukl`), Postgres gerenciado. O frontend nunca usa
credencial elevada — só a **chave pública (anon/publishable)**, definida em `status.js`.

### 3.1 Tabelas

- **`producao_eventos`** — fato central: um registro por evento (Entrada/Saída) de cada
  peça em cada processo/suboperação. Campos-chave: `pedido`, `codigo_peca`, `processo`,
  `evento`, `data_evento`, `os`, `operador`, `cliente`, `prazo_entrega`,
  `quantidade_solicitada`, `quantidade_produzida`, `retrabalho`, `sequencial_operacao`,
  `quantidade_operacoes`, `razao_social`, `classificacao_fiscal`, `operacao_*` (por setor).
- **`demanda_itens`** — itens da tela Demanda Cliente: `cliente`, `codigo_peca`, `pedido`,
  `os`, `descricao`, `data_desejada`, `prazo_confirmado`, `desenho_url`, `fluxo_url`,
  `concluido`, `critico`, `observacao`, `ordem` (posição manual na lista), `exp_status`
  (`pendente`/`separado`/`expedido`, usado pelo almoxarifado), `created_at`, `updated_at`.
- **`demanda_clientes`** — personalização por cliente: `cliente` (PK), `nome_fantasia`,
  `cor` (hex) — usado na Demanda e na Expedição.
- **`kanban_operadores`** — operadores selecionáveis no Painel: `operador` (PK), `ordem`.

### 3.2 Views

- **`posicao_atual`** — último evento de cada peça, um registro por peça+pedido. **Não
  tem** `razao_social`, `classificacao_fiscal`, `sequencial_operacao` nem
  `quantidade_operacoes` (só existem na tabela bruta `producao_eventos`).
- **`operadores_distintos`** — `select distinct operador from producao_eventos`, para
  popular a lista de configuração do Painel.

⚠️ **Regra importante para quem for mexer**: a mesma `codigo_peca` pode aparecer em
**vários pedidos** com tipo/razão social diferentes. Toda busca de tipo/progresso deve
filtrar por **pedido + código**, nunca só por código.

### 3.3 Storage

Bucket `demanda-arquivos` (público) — anexos de desenho/roteiro (PDF ou imagem).
Caminho: `CLIENTE/CODIGO/{desenho|fluxo}-{timestamp}.ext`. Ao remover/trocar um anexo, o
arquivo correspondente é apagado do bucket pelo frontend (`supaDeleteArquivo`).

### 3.4 Realtime

Publication `supabase_realtime` habilitada nas tabelas `producao_eventos` e
`demanda_itens` — é o que alimenta as assinaturas WebSocket descritas em 2.5.

### 3.5 Segurança / modelo de acesso

- RLS liberado para a role `anon` em todas as tabelas (`using(true) with check(true)`) —
  não há autenticação de usuário nem multi-tenant; é um sistema interno.
- **DDL (criar tabela/coluna/view/bucket) não é possível com a chave pública.** Exige
  Management API (`api.supabase.com/v1/projects/{ref}/database/query`) com Personal
  Access Token, ou `service_role` para operações de Storage — credenciais usadas de
  forma transitória por quem administra, nunca versionadas no código.

## 4. Regras de negócio centrais

- **Tipo V/I**: `classificacao_fiscal` (Vendas→V, Industrialização→I), com fallback por
  `razao_social` (Brasmat→V, Mota→I). Sempre lookup por pedido+código, pegando o registro
  mais recente com o campo preenchido.
- **Progresso**: `sequencial_operacao / quantidade_operacoes` do último evento — mesma
  fórmula usada na linha do tempo e replicada nos cards de outras telas.
- **Status da peça**: derivado de evento + processo + suboperação (constantes
  `SUBOP_*`) — expedida, em_estoque, aprovada, aguardando, em_producao, liberada.
- **Anexos na timeline**: ícones de desenho/roteiro só aparecem se existir PDF cadastrado
  na Demanda daquela peça (lookup por pedido+código).
- **Crítico vs. em demanda** (kanban): peça em qualquer demanda = fundo vermelho estático;
  peça marcada como "crítico" = animação pulsante por cima, são conceitos independentes
  que podem coexistir.

## 5. Deploy

- Push em `main` → deploy automático na Vercel (`brasmat-mes.vercel.app`).
- Sem etapa de build: Vercel serve os arquivos estáticos como estão.
- Sem staging/ambiente de homologação — o deploy de `main` é direto para produção.
- Cache do navegador é a causa mais comum de "não atualizou" — recomienda-se Ctrl+F5
  após deploy.

## 6. Pontos de atenção para quem for evoluir o sistema

- **Sem testes automatizados** — validação é manual, no navegador, após cada deploy.
- **Sem TypeScript/linter** — JS solto por página, sujeito a divergência de padrão entre
  telas se não houver disciplina de copiar os mesmos helpers.
- **Duplicação de CSS/menu entre as 12 páginas** — qualquer mudança de padrão visual ou
  do menu precisa ser replicada manualmente (ou via script) em todos os arquivos.
- **Sem ambiente de staging** — mudanças vão direto para produção ao dar push em `main`.
- **Chave pública exposta no frontend é esperado e seguro** — é o modelo padrão do
  Supabase (RLS controla o que essa chave pode fazer); o que nunca pode vazar é a
  `service_role` ou o Personal Access Token de administração.
