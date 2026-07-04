---
name: ux-operador
description: Padrões de interface para telas de chão de fábrica do BRASMAT MES — usadas por operadores de máquina (retífica, torno, erosão) e almoxarifado, muitas vezes em tablet/celular, com luva, em pé. Use SEMPRE que criar ou alterar tela cujo usuário principal é operador/almoxarifado (apontamento, consulta de desenho, separação de material, painel de setor) — diferente das telas de gestão (demanda, indicadores), que são de escritório.
---

# UX de operador (BRASMAT MES)

Telas de gestão (Demanda, OTD, Qualidade) são para quem está sentado com mouse.
Telas de operador são outra coisa: chão de fábrica, tablet ou celular, mão suja/com
luva, pouca paciência e pouca familiaridade com sistema. `expedicao.html` (almoxarifado)
e `op-kanban.html` (painel de setor) são as referências vivas do projeto.

## Regras de interação

- **Alvo de toque grande**: botões e áreas clicáveis com no mínimo ~44px de altura;
  espaçamento generoso entre alvos para não clicar errado com dedo/luva.
- **Mínimo de digitação**: preferir seleção (botões de estado tipo Pendente/Separado/
  Expedido, listas, filtros prontos) a campo de texto. Quando digitação for inevitável
  (buscar código), aceitar busca parcial e mostrar sugestões cedo (com debounce).
- **Um toque para o documento**: desenho/roteiro PDF abre direto em nova aba
  (`target="_blank"`), sem modal intermediário — operador consulta e volta.
- **Feedback imediato e visível**: ação salvou → mudança visual na hora (cor do botão,
  selo), sem depender de mensagem pequena. Falhou → aviso claro e o estado anterior
  volta (nunca fingir que salvou).
- **Nada de confirmação em cascata** para ações reversíveis; confirmação só para o
  que é destrutivo de verdade.

## Regras visuais

- Tema escuro do `design.css` (chão de fábrica costuma ter tela com reflexo — manter
  contraste alto; texto essencial em `--text`, nunca só em `--text3`).
- **Códigos de peça/pedido sempre em `--mono`** e tamanho maior que o texto ao redor —
  é o que o operador confere contra a OS de papel.
- Estado é **cor + ícone + palavra** (verde 🚚 Expedido), nunca só cor — luz da fábrica
  e daltonismo tornam cor sozinha insuficiente.
- Informação por item: no máximo o que cabe numa olhada (código, o que fazer, estado).
  Detalhe extra vai para a linha do tempo (`abrirPainelDetalhe`), não para o card.
- Layout responsivo até ~375px de largura; testar com `preview_resize` preset mobile.
  Sidebar/filtros colapsam em mobile (padrão `sb-toggle-btn` já existente).

## Regras de dados

- A tela abre já mostrando o que interessa **sem exigir configuração** (padrões prontos:
  setor do operador, dia corrente, itens abertos primeiro).
- Atualização automática: realtime + fallback 60s (padrão do projeto) — operador não
  recarrega página.
- Tolerar rede ruim de fábrica: fetch com estado de "carregando" visível e retry
  simples; nunca tela branca silenciosa.

## Checklist ao entregar tela de operador

- [ ] Testada em `preview_resize` mobile (375px) e desktop
- [ ] Alvos de toque ≥ 44px, códigos em fonte mono destacada
- [ ] Estado com cor + ícone + palavra
- [ ] PDF abre em um toque
- [ ] Feedback imediato de salvar/falhar
- [ ] Realtime + fallback funcionando
