# Separação de Material / Rastreabilidade de Matéria-Prima

Especificação de módulo — descoberta em 18/07/2026, a partir da entrevista com o usuário e
da planilha real `GESTÃO RASTREABILIDADE DE MATERIAL.xlsx` (628 linhas de histórico,
fev–jul/2026).

> **Revisão 18/07/2026 (pós-MVP, corrigida pelo usuário depois de testar):** duas mudanças
> importantes em relação à descoberta original — (1) o "núcleo" da peça **não é sempre Metal
> Duro**, pode ser Aço também (só Carcaça e Luva são sempre Aço); (2) o painel visual não é
> 3 colunas de status — é um **kanban de arrastar e soltar de verdade**, com as etapas reais
> como colunas, e **um cartão por peça física** (não por lote inteiro), pra não travar dois
> processos de material diferentes num cartão só. Seções 3–5, 7 e 8 abaixo já refletem essa
> revisão; a seção 2 (fluxo hoje / achados na planilha) continua como registro histórico da
> descoberta original.

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
2. PCP abre o item recém-cadastrado e cria um ou mais **lotes** — cada lote tem sua própria
   quantidade (a soma dos lotes bate com a quantidade do item, sem travar isso) e sua
   **composição**: sempre um **núcleo** (Metal Duro *ou* Aço — a peça pode não ter nada de
   Metal Duro) + opcionalmente **Carcaça** (sempre Aço) e/ou **Luva** (sempre Aço).
3. Cada posição (núcleo/carcaça/luva) do lote vira **um cartão** no kanban — não um cartão por
   lote inteiro, porque núcleo e carcaça podem estar em processos completamente diferentes ao
   mesmo tempo (ex.: núcleo já pronto, carcaça ainda na usinagem) e um cartão só não dá conta
   dos dois.
4. O PCP **arrasta o cartão** para a coluna que representa onde o material está agora — o
   arraste em si registra o evento (data real, automática). Colunas: Compra → Recebido/Estoque
   → Usinagem → Tratamento Térmico → Pronto (mais "Aguardando" antes de qualquer evento). Um
   cartão de Metal Duro só usa Compra e Pronto — pula direto as colunas que não se aplicam a
   ele (não precisa arrastar por etapas que não existem pro seu material).
5. O sistema **calcula automaticamente** a coluna atual de cada cartão a partir do último
   evento — nunca digitado à parte.
6. Quando todos os cartões (componentes) de um lote chegam em "Pronto", o lote fica **"kit
   completo"**; quando todos os lotes de um item estão completos, o item fica sinalizado como
   **pronto para o Roteiro** — a Engenharia vê esse sinal ao abrir o Cadastro Roteiro (aviso
   visual, **não** bloqueio automático nesta fase).

## 4. Dados (linguagem simples — a tradução para tabelas é papel da `modelagem-dados-mes` /
`arquiteto-modulo`)

- **Lote**: pertence a um item (pedido+código+OS, do `itens`); tem uma quantidade própria
  (pode ser menor que a quantidade total do item, se dividido); numerado automaticamente
  (1, 2, 3... quando dividido) — o PCP nunca digita esse número.
- **Componente**: uma peça física dentro de um lote — sua **posição** (núcleo/carcaça/luva) e
  o **material real** dela (Metal Duro ou Aço). O material **não é fixo por posição**: só o
  núcleo varia entre os dois; carcaça e luva são sempre Aço. Cada componente é um cartão do
  kanban, com sua própria linha do tempo, independente dos outros componentes do mesmo lote.
- **Evento**: um registro por movimento de um componente para uma coluna/estágio (o arraste em
  si) — tipo de estágio + data. **Imutável** — não se edita, só se registra um novo (mesmo
  padrão de `producao_eventos`).
- **Catálogo de estágios**: uma trilha **única e compartilhada** entre os dois materiais (não
  um catálogo por material) — cada estágio diz se vale para Metal Duro, para Aço, ou os dois.
  Precisa ser **configurável** (tabela, não fixo no código), caso o processo mude no futuro.
- Sem fornecedor, sem preço/custo nesta fase (decisão do usuário).

## 5. Telas

- **Kanban de Separação de Material** (PCP, uso de escritório): colunas = as etapas reais
  (Aguardando / Compra / Recebido-Estoque / Usinagem / Tratamento Térmico / Pronto); um cartão
  por componente (núcleo/carcaça/luva), mostrando código/pedido/OS, a posição, o material e há
  quanto tempo está parado ali. **Arrastar o cartão registra o evento** — não precisa abrir
  formulário pra apontar. Um cartão só pode ser solto em coluna que se aplica ao seu material
  (o navegador já bloqueia visualmente soltar onde não pode). Clicar (sem arrastar) abre o
  histórico do cartão + o status das outras peças do mesmo lote + botão pra **excluir o cartão**
  (se o lote ficar sem nenhum componente, ele é removido junto). "✓ kit completo" aparece
  quando todos os componentes do lote chegam em Pronto.
- Ponto de entrada a partir do **Cadastro Item**: buscar o item e criar o(s) lote(s) — escolher
  núcleo (obrigatório, Metal Duro ou Aço) e marcar se também precisa de Carcaça/Luva. Pra cada
  peça marcada, o PCP também informa a **situação atual** (diagnóstico inicial: onde ela já
  está — ex. "carcaça já usinada e temperada" cria o cartão direto na coluna Tratamento
  Térmico, sem precisar arrastar do zero por etapas que já aconteceram antes de entrar no
  sistema).
- Sinal visual no **Cadastro Roteiro**: mostrar se o material do item já está pronto ou ainda
  não (aviso, sem bloquear).

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
  adiantado de antes. Número do lote é **sempre automático**.
- **Núcleo pode ser Metal Duro ou Aço** — não é fixo; Carcaça e Luva, quando existem, são
  sempre Aço.
- **Um cartão do kanban = um componente (posição física)**, nunca um lote inteiro — evita
  travar dois processos de material diferentes num cartão só.
- **Trilha de colunas única e compartilhada** entre Metal Duro e Aço (não um catálogo por
  material) — cartão de Metal Duro pula direto as colunas que não se aplicam a ele.
- **Arrastar o cartão é a forma de registrar o evento** — sem formulário/botão intermediário,
  pedido explícito do usuário: "o apontamento das etapas tem que ser muito simples e fácil".
- **Histórico nunca é apagado nem arquivado** — mesmo padrão do resto do sistema.
- **Datas de evento são sempre datas reais**, nunca texto livre (corrige o problema real
  encontrado na planilha atual).

## 8. Fases de implementação

1. **MVP ✅ (18/07/2026)**: modelo de dados (lote + componente + catálogo único de estágios
   configurável + evento por movimento) + kanban de arrastar-e-soltar (cartão por componente,
   colunas = etapas reais) + status calculado automaticamente (não digitado) + sinal "kit
   completo" + integração de mão dupla com Cadastro Item (criar lote) e Cadastro Roteiro
   (aviso de material pronto/pendente).
2. *(Futuro)* Fornecedor/terceiro por evento.
3. *(Futuro)* Saldo de estoque de fato (quantidade, não só estágio).
