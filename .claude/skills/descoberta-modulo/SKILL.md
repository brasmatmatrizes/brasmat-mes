---
name: descoberta-modulo
description: Conduz a conversa de descoberta de um módulo novo do BRASMAT MES — entrevista o usuário (dono da Brasmat, não-programador) sobre como o processo funciona hoje na prática, ajuda ele a pensar no que importa, prioriza o que implementar primeiro e transforma as respostas em especificação escrita. Use SEMPRE que o usuário disser "vamos pensar no módulo de...", "quero te explicar como funciona...", "me ajuda a decidir o que implementar", "vamos estudar o orçamento/roteiro/estoque/inspeção", ou quando for iniciar qualquer módulo da Fase 2/3 do roadmap sem especificação pronta. NÃO usar quando a mudança não envolve tabela/domínio de negócio novo (ajuste em módulo existente, indicador novo sobre dado que já existe, mudança de UX) — nesses casos use a `strategic-thinker`.
---

# Descoberta de módulo (BRASMAT MES)

Esta skill existe porque o conhecimento dos processos está na cabeça do usuário — dono
da ferramentaria, não-programador — e o papel aqui é de **consultor que entrevista bem**,
não de programador que sai criando tela. O resultado de uma descoberta é uma
especificação escrita e aprovada, que depois alimenta a skill `arquiteto-modulo`.

## Regras da conversa

- **Um módulo por vez.** Se ele misturar assuntos, anotar o outro e voltar ao foco.
- **Poucas perguntas por mensagem** (2–3 no máximo) — conversa, não formulário.
- **Linguagem dele, não de sistema**: perguntar sobre OS, peça, matriz, cliente, prazo;
  nunca sobre "entidade", "schema", "workflow".
- **Partir de um caso real**: "me conta o último orçamento que você fez, do pedido do
  cliente até mandar o preço" rende mais que perguntas abstratas. Pedir exemplos com
  peças/clientes reais (FEY, CISER, ACUMENT, METALAC).
- **Devolver o entendimento**: a cada bloco, resumir "entendi assim: ..." e pedir
  confirmação antes de seguir. Ele corrige barato agora, caro depois.
- **Como é hoje antes de como vai ser**: papel? Excel? WhatsApp? sistema externo? O
  módulo substitui ou convive com isso?
- **Registrar o que ficou firmado por escrito** (ver "Saída" abaixo) — decisões de
  negócio não podem morar só na conversa.
- Para contexto de negócio (clientes, posicionamento, precificação), a skill `brasmat`
  tem o perfil da empresa — usar em conjunto quando o tema for comercial.

## O que descobrir (roteiro da entrevista)

1. **Dor**: o que hoje dá trabalho/erro/retrabalho nesse processo? O que ele quer parar
   de fazer na mão?
2. **Fluxo real**: passo a passo de um caso concreto recente, com quem faz o quê.
3. **Informações**: o que se anota/consulta em cada passo (campos, documentos, medidas).
4. **Volumes e frequência**: quantas vezes por dia/semana; quantos itens; quem usa
   (escritório × chão de fábrica — define se `ux-operador` se aplica).
5. **Ligações**: como conecta com o que o sistema já tem (pedido+código, demanda,
   apontamentos, expedição).
6. **Exceções**: o que acontece quando dá errado (cliente muda pedido, material
   reprovado, retrabalho) — exceção mal pensada é o que quebra módulo.

## Banco de perguntas por módulo (Fase 2/3 do roadmap)

**Roteiros de processo** — Quem define a sequência de operações de uma peça nova, e onde
isso fica registrado hoje? Existe tempo estimado por operação (e quem estima)? Duas peças
parecidas reaproveitam roteiro? O roteiro muda depois de iniciado? O PDF de "fluxo" anexado
na Demanda hoje é o roteiro — o que ele tem que o sistema precisaria ter estruturado?

**Estoque / separação / rastreabilidade** — Como o metal duro chega (fornecedor, certificado,
corrida/lote)? Onde fica guardado e como se acha? Quem separa material para uma OS e como
registra? Cliente já pediu rastreabilidade (de qual lote veio esta matriz)? O que acontece
com sobra/retalho?

**Inspeção / relatórios de qualidade** — O que o inspetor mede hoje e onde anota? O cliente
recebe relatório dimensional (em que formato)? Quais instrumentos usam? O que acontece com
peça reprovada? Existe plano de inspeção por peça (quais cotas medir) ou o inspetor decide?

**Orçamento** — Me conta o último orçamento: o que o cliente mandou, como você calculou,
em quanto tempo respondeu? O que entra no preço (material, horas por processo, margem,
imposto V/I)? Onde estão os valores de hora-máquina? Quantos orçamentos por semana, e
quantos viram pedido? ⚠ Lembrar: módulo de orçamento exige autenticação antes (custos não
podem ficar públicos — ver `modelagem-dados-mes`).

**Carteira de clientes** — Como você decide hoje o que produz primeiro quando dois clientes
apertam? Como promete prazo para pedido novo (olha a carga da fábrica?)? O que a Demanda
Cliente atual não responde que você gostaria?

## Priorização (ajudar a decidir o que implementar)

Ao final da descoberta, montar com ele uma tabela simples: para cada parte do módulo,
**quanto dói hoje** (alto/médio/baixo) × **esforço** (alto/médio/baixo). Propor sempre um
**primeiro pedaço utilizável** (MVP): a menor versão que ele já usaria na semana seguinte —
nunca o módulo inteiro de uma vez. O usuário preza o que funciona; entregar pequeno e
funcionando vale mais que grande e pela metade.

## Caso trivial

Se o que parece módulo novo, no fim das contas, é só uma tela nova sobre dado que **já existe** (sem tabela nova) — encaminhe direto para a `strategic-thinker`, sem rodar a entrevista completa.

## Exemplos

**Deve disparar esta skill:**
- "Vamos pensar no módulo de orçamento."
- "Quero te explicar como funciona a separação de material no almoxarifado."

**NÃO deve disparar (vai direto para outro lugar):**
- "Quero um indicador novo de OTD por operador." (dado já existe) → `strategic-thinker`.
- "Preciso de uma tela pra ver os apontamentos de hoje." (sem tabela nova) → `strategic-thinker`.

## Saída — especificação do módulo

Gravar em `docs/modulos/<modulo>.md` no repo (criar a pasta na primeira vez), contendo:

1. **Dor / objetivo** — em uma frase, por que o módulo existe.
2. **Fluxo hoje** — como é feito atualmente.
3. **Fluxo proposto** — passo a passo com quem faz o quê no sistema.
4. **Dados** — o que precisa ser guardado (em linguagem simples; a tradução para
   tabelas é papel da `modelagem-dados-mes`).
5. **Telas** — quais, para quem (gestão × operador).
6. **Fora do escopo por ora** — o que ficou explicitamente para depois.
7. **Decisões firmadas** — respostas dele que não devem ser re-perguntadas.
8. **Fases de implementação** — MVP primeiro.

Especificação aprovada pelo usuário → daí sim entra a `arquiteto-modulo` para construir.
