# BRASMAT MES

Sistema de execução de manufatura (MES) para a Brasmat — ferramentaria de matrizes de metal duro. Acompanha o caminho de cada peça pela produção (retífica, torno, erosão, etc.), do lançamento à expedição.

## Arquitetura

- **Front-end estático puro** — sem build, sem servidor próprio. Cada página é um `.html` autocontido (HTML + CSS inline em `<style>` + JS inline em `<script>`).
- **`status.js`** — lógica central compartilhada por todas as páginas: fetch ao Supabase, `status()`, helpers de progresso/tipo, e o painel de linha do tempo (`abrirPainelDetalhe`).
- **Supabase** (PostgreSQL na nuvem) é o backend. O front usa **só a chave pública (publishable)** definida no topo do `status.js` (`SUPA_URL`, `SUPA_KEY`). Project ref: `hjvlznijsgdwurtsyukl`.
- Deploy automático via **Vercel** (`brasmat-mes.vercel.app`) a cada push no `main`. Após mudança, lembrar de Ctrl+F5 (cache).

## Páginas (10)

`index.html` (Buscar Peça), `ordens.html`, `kanban.html`, `paradas.html`, `apontamentos.html`, `operadores.html` (Performance), `prazos.html`, `otd.html`, `cliente.html` (Consulta Cliente), `demanda.html` (Demanda Cliente).

O menu de navegação (`.nav` no topbar) deve conter as 10 páginas, em **todas** as páginas, na mesma ordem.

## Dados Supabase

- **`producao_eventos`** (tabela) — um registro por evento (Entrada/Saída) de cada peça em cada processo. Colunas-chave: `pedido`, `codigo_peca`, `processo`, `evento`, `data_evento`, `os`, `operador`, `cliente`, `prazo_entrega`, `quantidade_solicitada`, `quantidade_produzida`, `retrabalho`, `sequencial_operacao`, `quantidade_operacoes`, `razao_social`, `classificacao_fiscal`, `operacao_*` (subop por setor).
- **`posicao_atual`** (view) — posição atual (último evento) de cada peça, um registro por peça+pedido. **NÃO tem** `razao_social`, `classificacao_fiscal`, `sequencial_operacao` nem `quantidade_operacoes` — esses só existem em `producao_eventos`.
- **`demanda_itens`** (tabela) — itens da tela Demanda Cliente. Colunas: `id`, `cliente`, `codigo_peca`, `pedido`, `os`, `descricao`, `data_desejada`, `prazo_confirmado`, `desenho_url`, `fluxo_url`, `concluido` (bool), `created_at`, `updated_at`. RLS liberado para `anon` (tela aberta, sem login).
- **Bucket `demanda-arquivos`** (Storage, público) — PDFs de desenho/roteiro. Caminho: `CLIENTE/CODIGO/{desenho|fluxo}-{timestamp}.pdf`.

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
