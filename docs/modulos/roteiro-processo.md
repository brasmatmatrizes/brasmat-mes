# Módulo: Cadastro de Roteiro de Processo

## 1. Dor / objetivo

O roteiro de processo (sequência de operações que uma peça percorre) hoje é montado numa
planilha Excel com macro (VBA), impresso em PDF e anexado manualmente na Demanda Cliente.
O objetivo é trazer esse cadastro pra dentro do MES — mantendo a facilidade de uso da
planilha (clicar numa operação da lista já adiciona na sequência) — e fazer o roteiro
alimentar o próprio sistema (progresso da peça, comparação com o que foi apontado),
não só servir de documento impresso.

## 2. Fluxo hoje

- O gestor de produção monta o roteiro do zero, olhando o desenho da peça (não reaproveita
  roteiro de peça parecida).
- Usa uma planilha (`PROCESSOS - TESTE PILOTO MACRO.xlsm`) com uma aba "Lista" de ~60
  operações padrão (código `X.Y` + descrição, agrupadas por família: retífica furo,
  retífica plana, retífica externa, fio, forma, polimento, brunir, encarcaçar, torno,
  inspeção, administrativo, tratamento, erosão).
- Cada roteiro fica numa aba com cabeçalho (Código, Pedido, Qtd, OS) e uma tabela de
  sequência (Sequência, Cód. Operação, Processo, Visto Operador, Observações). A lista de
  operações fica replicada como paleta fixa ao lado; duplo-clique nela insere a próxima
  linha da tabela automaticamente.
- Peças com subcomponentes (ex.: matriz com inferior, superior, luva) usam uma aba por
  subcomponente hoje — mas o código da peça é um só; subcomponente é uma divisão dentro do
  roteiro, não um código de peça separado.
- No final: salva cópia, exporta PDF com nome padronizado, imprime, e cola um QR Code
  (gerado a partir de um link) na planilha.
- O PDF resultante é anexado manualmente no campo "fluxo" da Demanda Cliente
  (`demanda_itens.fluxo_url`).

## 3. Fluxo proposto

- Tela nova (`engenharia.html`) para cadastrar o roteiro de uma peça+pedido, com **dois
  jeitos de cadastro**:
  - **Peça existente**: busca por pedido/código/OS (igual às outras telas) — Qtd e OS já
    vêm do sistema (posição atual).
  - **Peça nova**: quando a busca não encontra nada, oferece cadastrar o roteiro mesmo
    assim, digitando código, pedido, OS e quantidade na mão — para o gestor de produção
    poder desenhar o roteiro **antes** da peça passar pelo Forms (planejamento adiantado).
    Fica marcada como "peça nova" na lista até que o Forms alimente o sistema de verdade.
  - Cabeçalho da peça existente já vem preenchido do sistema.
  - Paleta de operações do catálogo, visível ao lado, com clique (equivalente ao duplo-clique
    do Excel) adicionando a operação na próxima linha da sequência — sem digitar.
  - Cada linha: sequência (automática), subcomponente (escolhido de uma lista), código +
    descrição da operação (vem do clique na paleta), observações (texto livre).
  - Coluna "Visto Operador" do Excel não entra — o sistema já sabe quem apontou via
    `producao_eventos.operador`.
  - Tela de administração do catálogo de operações (cadastrar/editar operação: código +
    descrição + família) — acessível ao gestor de produção, não só ao dono.
  - Gera o PDF/impressão a partir do roteiro cadastrado (substitui o anexo manual de
    "fluxo" na Demanda) e mantém a geração de QR Code.
- **QR Code do impresso = link do Forms pré-preenchido, montado automaticamente**
  (decisão firmada 06/07/2026): o sistema monta sozinho a URL
  `.../viewform?usp=pp_url&entry.NNN=...` do Forms "PILOTO 2 REV.A Rastreabilidade de
  Processo", preenchendo Razão Social, Classificação Fiscal, Código, Pedido, OS,
  Quantidade Solicitada, **Quantidade de Operações Planejadas (= nº de linhas do
  roteiro)**, Cliente e Prazo de Entrega. O operador escaneia e completa o resto
  (Operador, Evento, Máquina/Operação, etc.). Os `entry.ID` estão fixos no
  `engenharia.html` (constante `FORM_ENTRY`); se o Forms for recriado, reconferir.
  - **Peça existente**: Cliente/Tipo/Prazo vêm de `producao_eventos` — QR sai sem digitar
    nada além do que já é do sistema.
  - **Peça nova**: como não há apontamento ainda, o painel "Item novo" pede também Tipo
    (Vendas/Brasmat ou Industrialização/Mota → preenche Razão Social + Classificação
    Fiscal), Cliente (lista `roteiro_clientes`, espelho do dropdown do Forms) e Prazo.
  - Campo "Link do Forms manual" continua existindo como **override opcional** (se
    preenchido, usa ele no lugar do automático).
  - **Lista de clientes** (`roteiro_clientes`): espelha o dropdown do Forms (28 opções na
    carga inicial). Decisão do usuário: quando o Forms mudar, ele pede e a lista é
    **re-sincronizada do Forms** (extraída do HTML público do formulário), não mantida à
    mão na tela.
- Ligação com o resto do sistema:
  - A quantidade de operações do roteiro passa a alimentar automaticamente o cálculo de
    progresso da peça (hoje `quantidade_operacoes` é digitado a cada apontamento) — acaba
    a redigitação desse número.
  - Fase 2: comparar o roteiro planejado com o que foi realmente apontado em
    `producao_eventos` (etapa pulada, fora de ordem, operação não prevista) e mostrar um
    alerta visual (sem bloquear nada) para as peças que divergiram.
- Vale tanto para peças de Vendas (V) quanto de Industrialização (I).

## 4. Dados (linguagem simples — tradução pra tabela é papel da `modelagem-dados-mes`)

- **Catálogo de operações**: código (ex. `2.2`), descrição (ex. "Ret. Plana Esq."), família
  (ex. "Retífica plana"). Mantido pelo gestor de produção, muda com frequência.
- **Roteiro por peça+pedido**: pedido, código da peça, cabeçalho (Qtd, OS).
- **Itens do roteiro**: sequência, subcomponente (de uma lista), operação (referência ao
  catálogo), observações. Vários itens por roteiro, ordenados.
- **Lista de subcomponentes possíveis**: (ex. Inferior, Superior, Luva) — precisa existir
  como lista mantida em algum lugar (a definir tamanho/onde durante a modelagem).

## 5. Telas

- **Cadastro de roteiro** (gestão/escritório — gestor de produção): tela principal, paleta +
  tabela, busca por pedido+código.
- **Catálogo de operações** (gestão — gestor de produção mantém): tela simples de
  adicionar/editar operação.
- Ambas são telas de escritório (não chão de fábrica) — `ux-operador` não se aplica aqui,
  mas o roteiro impresso/PDF gerado é o que acompanha a peça no chão de fábrica.

## 6. Fora do escopo por ora (Fase 2+)

- Comparação automática entre roteiro planejado e apontamento real (alerta de divergência).
- Reaproveitar roteiro de peça parecida (copiar/colar) — não foi pedido; avaliar se surge
  necessidade depois.
- Definir tecnicamente *como* a quantidade de operações do roteiro vai substituir o campo
  digitado em `producao_eventos.quantidade_operacoes` (se é leitura no cálculo do MES, ou
  se altera o apontamento via Google Forms/Apps Script) — decisão técnica para a fase de
  arquitetura (`arquiteto-modulo`).

## 7. Decisões firmadas (não re-perguntar)

- Roteiro serve tanto de documento (impresso/QR) quanto para direcionar o sistema
  (progresso automático + comparação futura).
- Catálogo de operações muda com frequência; precisa de tela própria de manutenção,
  mantida pelo gestor de produção (não só pelo dono).
- Subcomponente (inferior/superior/luva) é uma divisão dentro do roteiro de uma única
  peça+pedido, não um código de peça separado — escolhido de uma lista ao cadastrar a linha.
  Gestor de produção monta o roteiro do zero (não reaproveita de peça parecida).
- Divergência entre planejado e real: só alerta visual, sem bloquear (fase 2).
- Roteiro cadastrado deve gerar o PDF que hoje é anexado manualmente em
  `demanda_itens.fluxo_url` — substituindo esse anexo manual.
- A quantidade de operações do roteiro deve alimentar automaticamente o cálculo de
  progresso da peça (fim da digitação manual desse número).
- Vale para peças Vendas (V) e Industrialização (I).

## 8. Fases de implementação

1. **MVP — Cadastro do roteiro**: tela de cadastro (paleta + tabela + subcomponente),
   catálogo de operações com manutenção pelo gestor, geração de PDF/QR Code substituindo o
   anexo manual da Demanda, e progresso da peça passando a usar a quantidade de operações
   do roteiro.
2. **Fase 2 — Comparação com apontamento real**: alerta visual quando o que foi apontado em
   `producao_eventos` diverge do roteiro planejado (etapa pulada, fora de ordem, operação
   não prevista).
