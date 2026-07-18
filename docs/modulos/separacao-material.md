# Separação de Material / Rastreabilidade de Matéria-Prima

Especificação de módulo — descoberta em 18/07/2026, a partir da entrevista com o usuário e
da planilha real `GESTÃO RASTREABILIDADE DE MATERIAL.xlsx` (628 linhas de histórico,
fev–jul/2026).

## 1. Dor / objetivo

Entre o **Cadastro Item** (Comercial cadastra a peça) e o **Cadastro Roteiro** (Engenharia
monta o roteiro) existe um processo hoje controlado só em planilha Excel manual: a
**separação da matéria-prima**. É, segundo o usuário, "um dos maiores gargalos da empresa" —
sem rastreabilidade estruturada, sem visibilidade em tempo real, dependente de atualização
manual em toda movimentação. O objetivo é transformar isso num fluxo rastreável dentro do
sistema: saber a qualquer momento em que estágio está cada material de cada lote, prever
atrasos antes que aconteçam, e só liberar o roteiro quando o kit de material estiver completo.

## 2. Fluxo hoje

1. Comercial cadastra o item (Cadastro Item — já existe no sistema).
2. Comercial envia o desenho ao PCP.
3. PCP analisa o desenho e decide quais materiais o item precisa: **Metal Duro** (sempre) +
   opcionalmente **Carcaça de Aço** e/ou **Luva**.
4. PCP inicia a preparação de cada material — vai atrás de estoque, compra, usinagem
   terceirizada e tratamento térmico, conforme o caso de cada um.
5. PCP anota manualmente na planilha: um status resumido por material (`STATUS MD` /
   `STATUS CARCAÇA` / `STATUS LUVA`), um status geral do kit (`STATUS KIT`: "✅ LIBERADO" ou
   "FALTA: <material>"), e datas de Entrada/Saída em cada etapa de cada material.
6. Quando o kit fica completo, é liberado — só então a Engenharia pode montar o roteiro.

**Achados reais na planilha (evidência, não suposição):**
- A mesma OS+código às vezes gera **mais de uma linha de acompanhamento** — confirmado pelo
  usuário: acontece quando a quantidade do item é **dividida em lotes** com progresso
  diferente (ex.: de 4 peças, 2 já tinham material adiantado de antes — já em tratamento
  térmico/quase prontas — e 2 não tinham nada).
- Em pelo menos uma célula de data, alguém digitou o texto **"OK"** em vez de uma data real
  (linha 138, coluna TT Carcaça) — isso quebra qualquer cálculo de prazo. O sistema novo não
  pode permitir isso.
- Nenhuma coluna registra **fornecedor/terceiro** — só datas de entrada/saída por etapa.
- A planilha **nunca é limpa/arquivada** — cresce para sempre (628 linhas desde fev/2026,
  ritmo de ~120 registros/mês).
- `STATUS KIT` e os `STATUS <material>` são digitados à mão pela pessoa, não calculados a
  partir das datas — inconsistência entre os dois é possível e provavelmente já acontece.

**Etapas reais observadas por material** (das colunas Entrada/Saída da planilha):
- **Metal Duro** (2 etapas): `MD COMPRA` → `SEPARAÇÃO MD`
- **Carcaça de Aço** (5 etapas): `SEPARAR AÇO ESTOQUE` → `COMPRA AÇO` → `USINAGEM CARCAÇA` →
  `TT CARCAÇA` (tratamento térmico) → `SEPARAÇÃO BLANK FINAL`
- **Luva** (5 etapas, mesmo padrão da Carcaça): `SEPARAR AÇO ESTOQUE` → `COMPRA AÇO LUVA` →
  `USINAGEM LUVA` → `TT LUVA` → `SEPARAÇÃO BLANK FINAL`

## 3. Fluxo proposto

1. Comercial cadastra o item — sem mudança (já existe).
2. PCP abre o item recém-cadastrado e registra um ou mais **lotes** — cada lote tem sua
   própria quantidade (a soma dos lotes bate com a quantidade do item) e sua composição
   (quais dos 3 materiais ele precisa).
3. Para cada material de cada lote, o PCP registra os **eventos** conforme acontecem (ex.:
   "entrou em separação de estoque", "saiu — foi para compra", "entrou em usinagem", "voltou
   da usinagem", "entrou em tratamento térmico", "voltou — disponível para montagem"). Cada
   evento tem **data real obrigatória** — nunca texto livre.
4. O sistema **calcula automaticamente** o estágio atual de cada material (a partir do
   último evento) e o status do kit do lote — "aguardando X" ou "kit completo" — em vez de
   alguém digitar isso à parte.
5. **Painel visual** (mesmo espírito do Painel de operadores, `op-kanban.html`) mostra os
   lotes em andamento, agrupados/coloridos por estágio, pra enxergar rápido o que está
   travando e desde quando.
6. Quando todos os componentes de um lote chegam a "disponível", o lote fica "completo"; quando
   todos os lotes de um item estão completos, o item fica sinalizado como **pronto para o
   Roteiro** — a Engenharia vê esse sinal ao abrir o Cadastro Roteiro (aviso visual, **não**
   bloqueio automático nesta fase).

## 4. Dados (linguagem simples — a tradução para tabelas é papel da `modelagem-dados-mes` /
`arquiteto-modulo`)

- **Lote**: pertence a um item (pedido+código+OS, do `itens`); tem uma quantidade própria
  (pode ser menor que a quantidade total do item, se dividido); sabe quais dos 3 materiais
  precisa.
- **Evento de material**: pertence a um lote + a um material (Metal Duro / Carcaça / Luva);
  tem um tipo de evento (do catálogo de estágios daquele material) e uma data. **Evento
  imutável** — não se edita, só se registra um novo (mesmo padrão de `producao_eventos`).
- **Catálogo de estágios por material**: a sequência de estágios possíveis de cada material
  (Metal Duro tem 2; Carcaça e Luva têm 5 cada) — precisa ser **configurável** (tabela, não
  fixo no código), caso o processo mude no futuro.
- Sem fornecedor, sem preço/custo nesta fase (decisão do usuário).

## 5. Telas

- **Painel de Separação de Material** (PCP, uso de escritório): cartão por lote, tipo
  kanban, agrupado/colorido por estágio ou por "o que está faltando"; clicar no cartão abre o
  lote e permite registrar o próximo evento de cada material.
- Ponto de entrada a partir do **Cadastro Item**: opção de já criar o(s) lote(s) e composição
  logo depois de cadastrar o item (ou numa fila "itens aguardando análise do PCP").
- Sinal visual no **Cadastro Roteiro**: mostrar se o material do item já está liberado ou
  ainda não (aviso, sem bloquear).

## 6. Fora do escopo por ora

- **Fornecedor/terceiro** (quem está com o material) — decisão do usuário, fica pra depois.
- **Preço/custo de compra** — fica pra depois; além disso exigiria o marco de autenticação
  antes (regra do projeto: custo não pode ficar exposto publicamente).
- **Saldo de estoque com quantidade** (quanto tem de cada material no almoxarifado) — este
  módulo só registra "o material X deste lote está em estoque", não controla o saldo geral.
- **Bloqueio automático** do Cadastro Roteiro até o kit estar completo — nesta fase é só
  aviso visual.

## 7. Decisões firmadas (não re-perguntar)

- **PCP é o único ator** que mexe nisso — não precisa de sincronização entre múltiplos
  usuários editando o mesmo lote (diferente da Demanda Cliente).
- **Um item pode ter mais de um lote** — quantidade dividida quando parte já tinha material
  adiantado de antes.
- **Cada material tem sua timeline própria de estágios**, independente dos outros materiais
  do mesmo lote.
- **Histórico nunca é apagado nem arquivado** — mesmo padrão do resto do sistema.
- **Datas de evento são sempre datas reais**, nunca texto livre (corrige o problema real
  encontrado na planilha atual).
- **Painel visual (tipo kanban) é a primeira entrega**, não uma lista simples — decisão
  explícita do usuário, mesmo que isso signifique mais trabalho de tela antes de validar o
  modelo de dados.

## 8. Fases de implementação

1. **MVP**: modelo de dados (lote + eventos por material + catálogo de estágios
   configurável) + Painel visual tipo kanban (cartão por lote) + registrar evento a partir do
   cartão + status calculado automaticamente (não digitado).
2. Integração de mão dupla: criar lote(s) a partir do Cadastro Item; sinal de "material
   pronto" no Cadastro Roteiro.
3. *(Futuro)* Fornecedor/terceiro por evento.
4. *(Futuro)* Saldo de estoque de fato (quantidade, não só estágio).
