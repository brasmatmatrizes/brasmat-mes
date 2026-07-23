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

- **Lote = componente** (revisão 19/07/2026, ver seção 10): cada linha já é um lote de UMA
  posição (núcleo/carcaça/luva) de um item — não existe mais um "lote" separado agrupando as
  três posições. Tem sua própria **quantidade**, número automático **escopado por posição**
  (o núcleo tem sua numeração 1,2,3..., a carcaça tem a dela, independente) e o **material
  real** dela (Metal Duro ou Aço — só o núcleo varia; carcaça e luva são sempre Aço). Cada
  lote é um cartão do kanban, com sua própria linha do tempo, totalmente independente das
  outras posições do mesmo item — o núcleo pode ter 2 lotes enquanto a carcaça tem só 1.
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
  não (aviso, sem bloquear) — granular (quantos lotes prontos de quantos no total), não binário.
- **Separação Relatório** (`separacao-relatorio.html`, só leitura, PCP + Engenharia + dono):
  companheira do Kanban pra quando o histórico crescer — uma linha por componente, filtros
  (cliente, período pela data de criação do lote, material, etapa/status), 2 cards de contagem
  (sem tendência, volume ainda baixo demais pra isso valer a pena) e impressão em dois modos:
  lista filtrada inteira, ou um lote específico com histórico completo. O Kanban continua sendo
  onde se trabalha (arrastar = registrar evento); esta tela é só consulta.
- **Visibilidade de conjunto de lotes**: quando um item tem mais de 1 lote, cartão e painel de
  detalhe do Kanban (e a sugestão/cabeçalho do Cadastro Roteiro) mostram quantos lotes do
  conjunto já estão prontos — pra ninguém interpretar que o processo terminou só porque um
  lote isolado chegou em Pronto.

## 6. Fora do escopo por ora

- **Fornecedor/terceiro** (quem está com o material) — decisão do usuário, fica pra depois.
- **Preço/custo de compra** — fica pra depois; além disso exigiria o marco de autenticação
  antes (regra do projeto: custo não pode ficar exposto publicamente).
- **Saldo de estoque com quantidade** (quanto tem de cada material no almoxarifado) — este
  módulo só registra "o material X deste lote está em estoque", não controla o saldo geral.

## 6.1 Bloqueio mínimo de material no Cadastro Roteiro (revisão 19/07/2026)

A decisão original ("bloqueio automático fica pra depois, nesta fase é só aviso visual") foi
**revista** depois de acontecer na prática: existe 1 roteiro real criado pra um item sem
nenhum material separado. A partir de 19/07/2026:

- **Criar um roteiro novo** exige que o item tenha **pelo menos 1 componente** (qualquer
  posição, qualquer lote — não precisa ser o lote inteiro completo) já na etapa Pronto, OU que
  o item esteja marcado **Ferramenta interna** (`itens.ferramenta_interna`, checkbox no
  Cadastro Item) — ferramentas/dispositivos internos usados pra fabricar a peça do cliente
  (não são a peça do cliente em si) podem ter roteiro antes de qualquer matéria-prima da peça
  final estar no local.
- **Bloqueio é duro, sem confirmação manual** — a única saída é a flag de ferramenta interna.
- **Roteiro já existente nunca é bloqueado** — a regra vale só no momento de criar; editar,
  imprimir ou excluir um roteiro já cadastrado continua liberado (o roteiro real citado acima
  continua acessível, intocado).
- O sinal visual (banner na busca e no cabeçalho do editor) mostra 3 estados: bloqueado
  (🔒 vermelho), parcialmente pronto/liberado (⏳ amarelo, com detalhe por lote) e ferramenta
  interna (🔧 roxo) — além do ✓ verde quando 100% completo.

## 7. Decisões firmadas (não re-perguntar)

- **PCP é o único ator** que mexe nisso — não precisa de sincronização entre múltiplos
  usuários editando o mesmo lote (diferente da Demanda Cliente).
- **Cada posição do item pode ter mais de um lote, de forma independente das outras**
  (revisão 19/07/2026, seção 10) — quantidade dividida quando parte já tinha material
  adiantado de antes, sem forçar as outras posições a dividir junto. Número do lote é
  **sempre automático**, escopado por posição.
- **Núcleo pode ser Metal Duro ou Aço** — não é fixo; Carcaça e Luva, quando existem, são
  sempre Aço.
- **Um cartão do kanban = um lote (posição física)**, sempre — evita travar dois processos de
  material diferentes num cartão só.
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
2. **Visibilidade de conjunto de lotes + Relatório ✅ (18/07/2026)**: resumo de conjunto de
   lotes reaproveitado entre Kanban e Cadastro Roteiro (`materialResumoItem`, `status.js`) +
   tela `separacao-relatorio.html` (histórico, filtros, 2 modos de impressão).
3. **Bloqueio mínimo de material no Cadastro Roteiro ✅ (19/07/2026)**: coluna
   `itens.ferramenta_interna` + regra de bloqueio na criação de roteiro (ver seção 6.1) +
   banner visual de status (bloqueado/parcial/ferramenta interna/completo).
4. **Mesa de Planejamento ✅ (19/07/2026)**: ver seção 9 — substitui o formulário "Novo lote"
   por um planejamento consolidado de todos os lotes do item antes de qualquer cartão existir
   no Kanban.
5. **Lote por posição, não por item ✅ (19/07/2026)**: ver seção 10 — corrige a Mesa pra
   permitir que núcleo, carcaça e luva tenham cada um sua própria quantidade de lotes.
6. *(Futuro)* Fornecedor/terceiro por evento.
7. *(Futuro)* Saldo de estoque de fato (quantidade, não só estágio).
8. *(Futuro)* Se o volume de histórico justificar: tendência, ranking por cliente e gargalo
   por etapa na tela de Relatório (hoje ela só tem contagem, de propósito — ver análise
   estratégica da conversa de 18/07/2026).

## 9. Mesa de Planejamento (19/07/2026)

**Dor**: o formulário "Novo lote" (dentro do próprio Kanban) só criava 1 lote por vez — uma
peça com 8 núcleos em 4 trajetórias diferentes (2 comprar, 2 em estoque, 2 já usinados
aguardando TT, 2 do zero) exigia abrir o formulário 4 vezes, redigitando núcleo/carcaça/luva
toda vez, sem visão consolidada do que já tinha sido planejado.

**Solução**: substituído por uma **Mesa de Planejamento** — um overlay aberto a partir da
mesma busca, por item, ANTES de qualquer cartão existir no Kanban:

- **Estrutura da peça** (chips no topo: núcleo MD/Aço, +Carcaça, +Luva) — molde permanente,
  editável a qualquer momento; toda linha de lote nova/existente herda automaticamente as
  posições ativas (`mesaSincronizarComponentes`).
- **Lotes como linhas** — a primeira linha já nasce com a quantidade total restante do item;
  **dividir** (`mesaDividir`) fatia a quantidade de uma linha em duas, **duplicar**
  (`mesaDuplicar`) clona composição+situação — ambos evitam redigitar.
- **Barra de alocação** — soma em tempo real (rascunho + lotes já existentes) vs. quantidade
  total do item, com aviso visual se passar do total.
- **Mini-trilha clicável por componente** — clicar num ponto marca **fato** ("já está aqui",
  vira evento real ao salvar, mesmo comportamento do antigo "situação atual"). Só enquanto o
  componente ainda está em Aguardando (fato=0), aparecem chips de **intenção** ("entra por") —
  as etapas intermediárias do material (exclui Aguardando e Pronto), puramente informativo,
  gravado em `material_lote_componentes.entrada_prevista_ordem`. Intenção nunca vira evento
  sozinha; só documenta o plano até o material físico realmente aparecer.
- **Lotes já criados** aparecem na Mesa como linha-resumo só leitura (clicar abre o histórico
  normal do componente).
- **Planejamento concluído** — checkbox por item (`itens.plano_separacao_concluido`),
  salvável mesmo sem nenhum lote novo no rascunho (ex.: só confirmar que o planejamento já
  feito antes está fechado).
- **Gravação em bloco** — um único clique em "Criar lotes" grava todos os lotes + componentes
  do rascunho + eventos iniciais dos componentes marcados como fato, em sequência (não
  paralelo, pra manter a numeração automática do lote determinística). Soma diferente da
  quantidade do item gera confirmação (não bloqueio — decisão firmada na seção 7 continua
  valendo).

**Banco**: 2 colunas aditivas, nenhuma tabela nova —
`material_lote_componentes.entrada_prevista_ordem` (int, nullable) e
`itens.plano_separacao_concluido` (bool, default false).

**Kanban**: zero mudança de comportamento — trilha de colunas, drag = evento, card =
componente, status calculado, tudo como antes. A Mesa só passou a ser a origem dos cartões
(no lugar do formulário antigo).

## 10. Lote por posição, não por item (19/07/2026)

**Dor** (achada em uso real logo após a Mesa v1 acima entrar no ar): o "lote" amarrava
núcleo+carcaça+luva num pacote único com uma quantidade só. Dividir o núcleo em 2 lotes
(2+4, trajetórias diferentes) dividia a carcaça junto — mesmo quando a carcaça era, na
prática, uma barra de aço só, cortada em 6 depois, sem nenhuma razão pra acompanhar a
divisão do núcleo. "Eu queria dois lotes de núcleo e um lote só de carcaça" — pedido direto
do usuário, e o sistema não permitia.

**Causa raiz**: o modelo original (`material_lotes` + `material_lote_componentes`) tratava
"lote" como um contêiner de posições, presumindo que núcleo/carcaça/luva de uma mesma peça
sempre andam juntos em quantidade — o que é comum, mas não é regra. Cada material tem sua
própria cadeia de fornecimento (o núcleo de metal duro vem picado em pedidos diferentes; o
aço da carcaça pode ser uma barra só usinada em lote).

**Correção**: `material_lote_componentes` passou a carregar `item_id`, `quantidade`,
`observacao` e `lote_numero` diretamente — cada linha já É um lote, de uma posição só.
`lote_numero` é **escopado por item+posição** (não por item): o núcleo tem sua sequência
1,2,3..., a carcaça tem a dela, totalmente independente. A tabela `material_lotes` foi
**apagada** — nada mais dependia dela além dos campos que ela guardava.

- **Mesa**: virou uma seção independente por posição ativa (núcleo, carcaça, luva), cada
  uma com sua própria barra de alocação e sua própria lista de lotes — dividir/duplicar
  numa posição não afeta as outras. Reabrir a Mesa de um item que já tem lotes salvos
  recompõe os chips de estrutura a partir do que existe (não força re-marcar); desligar um
  chip com lotes reais mantém a seção visível em modo só-consulta (nunca "esconde" dado
  real).
- **`materialResumoItem`** (status.js): completude passou a ser por item — "todos os lotes
  (de todas as posições) chegaram em Pronto" —, sem depender de pareamento núcleo↔carcaça↔
  luva, que nunca existiu de verdade no processo real.
- **Kanban**: card e trilha continuam idênticos — cada card já era 1 componente/1 posição
  desde o MVP, isso não mudou. Só o rótulo "lote N" passou a ser escopado por posição
  ("lote 2 de 3" conta só os lotes daquela posição, não do item inteiro).
- **Relatório e Roteiro**: atualizados pra ler os campos direto do componente (sem mais
  join com `material_lotes`); a regra de bloqueio do Roteiro (seção 6.1) não mudou de
  comportamento, só a consulta por trás.
- **Migração**: os dados existentes (todos ainda de teste) foram preservados 1:1 — cada
  par núcleo+carcaça do modelo antigo virou 2 lotes independentes com a mesma numeração,
  sem perda de histórico de eventos.

## 11. Mesa em etapas — assistente (23/07/2026)

**Dor**: a Mesa mostrava tudo de uma vez (chips de estrutura + todas as posições + todos os
lotes + trilhas na mesma tela). Quem planeja precisava decidir várias coisas ao mesmo tempo,
com a informação de cada posição competindo pela atenção. Era a parte do módulo que mais
consumiu tempo e continuava difícil de usar.

**Solução**: a mesma Mesa, uma decisão por tela — um **assistente** com barra de progresso:

- **Etapa 1 — Estrutura da peça**: "Do que essa peça é feita?". Cartões grandes de escolha
  (não mais chips): Núcleo Metal Duro / Núcleo Aço (exclusivos entre si) e, opcionais,
  Carcaça de Aço / Luva de Aço. Posição que **já tem lote salvo** aparece travada (🔒) —
  não dá pra tirar da estrutura uma parte que já virou cartão no Kanban.
- **Etapas 2..N — uma por posição escolhida**, na ordem núcleo → carcaça → luva. Cada tela
  pergunta "**em quantos lotes novos** essa parte vai ser separada?" (botões 0–5 e "+ mais",
  `mesaDefinirNLotes`/`mesaRepartir` repartem automaticamente a quantidade que falta alocar),
  mostra a barra de alocação da posição e um cartão por lote com quantidade, observação,
  dividir/duplicar/remover e a trilha "**onde este lote está agora?**" — agora com botões
  rotulados e ícone por etapa, no lugar das bolinhas mudas. Lote ainda em Aguardando mostra
  os chips de intenção ("deve entrar por"). Lotes já criados aparecem no fim da tela da
  própria posição.
- **Etapa final — Revisão**: resumo por posição (nº de lotes novos, quantidades somadas,
  aviso quando a soma ≠ quantidade do item), checkbox "planejamento concluído" e o botão
  "✓ Criar N lotes". Nada é gravado antes disso — todas as etapas anteriores são rascunho
  em memória.
- **Croqui da peça** (aside fixo, `mesaCroquiSvg`): **desenho técnico com duas vistas
  projetadas no mesmo eixo** (1º diedro) — **vista frontal em corte**, com hachuras a 45°
  alternando o sentido entre peças vizinhas (núcleo 45°, luva −45°, carcaça 45° mais aberta),
  e **vista superior** em planta logo abaixo, ambas com linha de centro traço-ponto. A ordem
  física é do centro para fora: **núcleo → luva → carcaça** (a luva é intermediária, nunca
  externa), e o núcleo é sempre desenhado **furado no centro**, com Ø do furo ≈ 30% do Ø do
  núcleo (`mesaCamadasCroqui` calcula raio interno/externo de cada camada). Cores iguais às
  das posições no Kanban; a parte da etapa atual fica em destaque e as outras esmaecidas;
  legenda conta os lotes de cada parte. Some abaixo de 880px de largura.
  Sem cotas numéricas — o cadastro não guarda dimensões reais da peça.
- **Navegação**: "← Voltar" em todas as etapas (na primeira, "Cancelar") e "Próximo →"
  bloqueado enquanto o núcleo não tem material escolhido.

**Sem mudança de banco e sem mudança no Kanban** — `mesaSalvar` grava exatamente como antes
(lotes em sequência + evento inicial de quem foi marcado como fato). O modo "só-consulta"
de posição desligada com lotes reais (seção 10) deixou de existir: a posição agora fica
travada ligada, que é mais simples de entender e impossível de errar.

## 12. Núcleo duplo e croqui final (23/07/2026)

**Croqui** (ajustes pedidos na revisão da tela): a silhueta externa da vista frontal é um
**contorno fechado contínuo** (um retângulo próprio por cima dos preenchimentos), em vez de
peças desenhadas lado a lado cujas bordas se encontravam — o furo deixou de "romper" a linha
externa. Hachura de **metal duro é cruzada** (grade a 45°, duas linhas no `<pattern>`), aço
continua simples; luva mantém o sentido invertido em relação ao núcleo. Todos os textos
saíram do desenho (rótulos de vista, nota do furo) e a linha de centro também — o croqui fala
por si.

**Núcleo duplo**: a peça pode ter **um núcleo** (`posicao = nucleo`) ou **dois empilhados**
(`nucleo_superior` + `nucleo_inferior`), com ou sem luva e com ou sem carcaça em volta. Cada
núcleo tem o **seu próprio material** (um pode ser metal duro e o outro aço) e a **sua própria
lista de lotes** — são cartões independentes no Kanban, como qualquer outra posição.

- **Sem mudança de banco**: `material_lote_componentes.posicao` é texto livre (não há CHECK), e
  a unique `(item_id, posicao, lote_numero)` já numera por posição — os dois núcleos numeram
  independentes um do outro, sem migração.
- **Etapa 1 do assistente**: primeiro "1 núcleo" ou "2 núcleos (empilhados)", depois o material
  de cada um; "Próximo" exige o material de **todos** os núcleos escolhidos
  (`mesaNucleoCompleto`). Trocar entre 1 e 2 é bloqueado se já existe lote de núcleo salvo.
- **Etapas**: uma por núcleo (superior, depois inferior), seguidas de luva e carcaça.
- **Croqui**: o miolo vira um anel dividido em duas metades empilhadas na vista frontal
  (superior em cima, inferior embaixo, com a junta horizontal desenhada); a vista superior
  mostra o núcleo que aparece de cima, o superior.
- **Kanban e relatório**: `POS_LABEL` ganhou "Núcleo sup." / "Núcleo inf." nas duas telas e a
  pílula do card reusa a cor do núcleo. `materialResumoItem` (status.js) não precisou mudar —
  completude continua sendo "todos os lotes de todas as posições prontos".
