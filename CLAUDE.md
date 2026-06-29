# BRASMAT MES

Sistema de execução de manufatura (MES) para a Brasmat — ferramentaria de matrizes de metal duro. Acompanha o caminho de cada peça pela produção (retífica, torno, erosão, etc.), do lançamento à expedição.

## Arquitetura

- **Front-end estático puro** — sem build, sem servidor próprio. Cada página é um `.html` autocontido (HTML + CSS inline em `<style>` + JS inline em `<script>`).
- **`status.js`** — lógica central compartilhada por todas as páginas: fetch ao Supabase, `status()`, helpers de progresso/tipo, e o painel de linha do tempo (`abrirPainelDetalhe`).
- **Supabase** (PostgreSQL na nuvem) é o backend. O front usa **só a chave pública (publishable)** definida no topo do `status.js` (`SUPA_URL`, `SUPA_KEY`). Project ref: `hjvlznijsgdwurtsyukl`.
- Deploy automático via **Vercel** (`brasmat-mes.vercel.app`) a cada push no `main`. Após mudança, lembrar de Ctrl+F5 (cache).

## Páginas (12)

`index.html` (Buscar Peça), `demanda.html` (Demanda Cliente), `expedicao.html` (Expedição), `kanban.html`, `op-kanban.html` (Painel), `cliente.html` (Consulta Cliente), `apontamentos.html`, `prazos.html`, `otd.html`, `ordens.html`, `paradas.html`, `operadores.html` (Performance).

O menu de navegação (`.nav` no topbar) deve conter as 12 páginas, em **todas** as páginas, na mesma ordem (a sequência acima). Reordenar/inserir via script Node que reescreve o bloco `.nav` (e `.mobile-nav` onde existir).

- **Expedição** (`expedicao.html`): tela simples para o almoxarifado. Lê todos os itens de `demanda_itens`, agrupa por cliente (cor/nome fantasia de `demanda_clientes`) e ordena por situação. Situação derivada do status da peça (`posicao_atual`/`status()`) + flag `concluido`: "Em produção" / "Pronto p/ expedir" / "Expedido (sistema)". Almoxarifado marca cada item Pendente/Separado/Expedido (coluna `exp_status` em `demanda_itens`). Filtro por exp_status no topo. Clicar no código abre a linha do tempo.

- **Painel** (`op-kanban.html`, menu "Painel"): card por operador (verde+bolinha piscando = operando; amarelo estático = sem atividade), ordenado por atividade; nº de itens em aberto; clicar mostra as peças do operador. Config (⚙) escolhe operadores (tabela `kanban_operadores`). Flag "Prov. erro (5+d)" destaca operador com item ≥5d; flag "Tempo parado" (timer) mostra no canto inferior direito do card o tempo sem atividade (último evento em `producao_eventos`). Realtime + fallback 60s. Nomes sem prefixo numérico.

## Dados Supabase

- **`producao_eventos`** (tabela) — um registro por evento (Entrada/Saída) de cada peça em cada processo. Colunas-chave: `pedido`, `codigo_peca`, `processo`, `evento`, `data_evento`, `os`, `operador`, `cliente`, `prazo_entrega`, `quantidade_solicitada`, `quantidade_produzida`, `retrabalho`, `sequencial_operacao`, `quantidade_operacoes`, `razao_social`, `classificacao_fiscal`, `operacao_*` (subop por setor).
- **`posicao_atual`** (view) — posição atual (último evento) de cada peça, um registro por peça+pedido. **NÃO tem** `razao_social`, `classificacao_fiscal`, `sequencial_operacao` nem `quantidade_operacoes` — esses só existem em `producao_eventos`.
- **`demanda_itens`** (tabela) — itens da Demanda Cliente. Colunas: `id`, `cliente`, `codigo_peca`, `pedido`, `os`, `descricao`, `data_desejada`, `prazo_confirmado`, `desenho_url`, `fluxo_url`, `concluido` (bool), `observacao`, `ordem` (int, ordenação dos cards), `exp_status` (almoxarifado: `pendente`/`separado`/`expedido`), `created_at`, `updated_at`. RLS liberado para `anon`.
- **`demanda_clientes`** (tabela) — personalização por cliente: `cliente` (PK = nome real), `nome_fantasia`, `cor` (hex). Usada na Demanda e na Expedição (cor de fundo + nome curto).
- **`kanban_operadores`** (tabela) — operadores selecionados para o Painel: `operador` (PK), `ordem`.
- **`operadores_distintos`** (view) — `select distinct operador from producao_eventos` (lista completa p/ a config do Painel).
- **Bucket `demanda-arquivos`** (Storage, público) — anexos de desenho/roteiro (PDF **ou imagem** — `allowed_mime_types` liberado). Caminho: `CLIENTE/CODIGO/{desenho|fluxo}-{timestamp}.ext`. Ao remover anexo / trocar / remover item, o arquivo é apagado do bucket.
- **Realtime** habilitado (publication `supabase_realtime`) nas tabelas `producao_eventos` e `demanda_itens`. Kanban, Painel e Expedição usam `@supabase/supabase-js` (CDN) para atualizar instantaneamente; todas têm fallback `setInterval` (60s).
- Criação de tabela/coluna/view/bucket exige credencial elevada (ver seção própria). Tabelas novas seguem o padrão: `grant all to anon, authenticated` + RLS com policy permissiva `using(true) with check(true)`.

> A mesma `codigo_peca` pode existir em **vários pedidos**, cada um com `razao_social`/tipo diferente. Sempre que buscar tipo/progresso, filtrar por **pedido + código**, não só por código.

## Regras de negócio firmadas

- **Tipo V/I** (`getTipo` em status.js): `classificacao_fiscal` ("Vendas"→V, "Industrialização"→I); fallback `razao_social` (Brasmat→V/Vendas, Mota→I/Industrialização). Lookup sempre por **pedido+código**, pegando o registro mais recente com o campo preenchido (`order=id.desc`). V = azul, I = laranja.
- **Barra de progresso** (`calcProgresso`/`renderProgresso`): `sequencial_operacao / quantidade_operacoes` do último evento. A linha do tempo é a referência — replicar o mesmo cálculo nos cards (buscar histórico + `calcProgresso`).
- **Status da peça** (`status()`): expedida, em_estoque, aprovada, aguardando, em_producao, liberada — definido por evento + processo + suboperação (constantes `SUBOP_*`).
- **Ícones de anexo** na linha do tempo (`renderAnexosIcons`): 📐 Desenho / 📋 Roteiro só aparecem se houver PDF cadastrado na demanda daquela peça (lookup por pedido+código).
- **Kanban**: peças que estão em alguma demanda ficam com card de **fundo vermelho claro** (`.card-demanda`).
- **Demanda Cliente**: cliente vem da base; busca de item por código/pedido/OS (igual Buscar Peça) com opção "item novo" só quando não acha nada; **salvamento automático** (sem botão, debounce); check manual **"Concluído"** por item (sobrepõe o progresso quando apontamento está errado); ao remover anexo / trocar PDF / remover item, o arquivo é **apagado do bucket** (`supaDeleteArquivo`).

## Convenções de trabalho

- **Edições cirúrgicas**: mexer só no que foi pedido. Não refatorar, renomear ou "melhorar" o entorno sem pedir. O usuário preza muito o que já funciona.
- **Commit + push a cada alteração** concluída (o usuário acompanha pelo deploy). Mensagens de commit em inglês.
- **Mostrar/explicar antes** de fazer mudanças estruturais ou investigações; ao corrigir divergência de dados, mostrar a evidência antes.
- **Design system**: usar as variáveis CSS de `:root` (`--bg`, `--accent`, `--ok`, `--warn`, `--danger`, `--mono`, etc.) — idênticas em todas as páginas. Manter o padrão visual existente.
- Idioma com o usuário: **português**.

## Eficiência de contexto (pedido do usuário)

- Respostas **curtas e diretas**, sem reexplicar o que já está neste CLAUDE.md.
- Ler **só os trechos necessários** dos arquivos (faixas de linhas), nunca o arquivo inteiro à toa.
- Buscas e comandos **enxutos** — `grep` direcionado, sem despejar saídas grandes.
- Editar **direto no ponto certo**, sem releituras desnecessárias.

## Operações que exigem credencial elevada

A chave pública NÃO cria tabelas/buckets. Para DDL: **Management API** (`https://api.supabase.com/v1/projects/{ref}/database/query`) com **Personal Access Token** (`sbp_...`), ou **service_role** para Storage. Essas credenciais são sensíveis — usar de forma transitória, nunca colocar no código/git, e pedir para o usuário rotacionar depois.
