---
name: atualizar-menu
description: Atualiza o menu de navegação (.nav e .mobile-nav) de todas as páginas do BRASMAT MES de uma vez, a partir de uma estrutura canônica única. Use SEMPRE que criar página nova, renomear, reordenar ou remover página do menu — nunca editar o nav na mão página por página. Também serve para conferir se os menus estão consistentes entre as páginas.
---

# Atualizar menu (BRASMAT MES)

O menu precisa ser **idêntico em todas as páginas** (convenção do CLAUDE.md). Editar na
mão página por página gera deriva — esta skill mantém uma única fonte de verdade.

## Fonte de verdade

A estrutura canônica do menu vive na constante `NAV` no topo de
`scripts/atualizar_nav.js`: botão direto (Buscar Peça) + grupos dropdown (Cliente,
Produção, Indicadores), cada item com `label` (desktop) e `mobile` (rótulo curto).

Para incluir/reordenar/renomear página: **editar a constante `NAV`** e rodar o script.

## Como usar

1. Sempre começar com dry-run (não grava nada):
   ```
   node .claude/skills/atualizar-menu/scripts/atualizar_nav.js C:\Users\grafe\brasmat-mes --dry
   ```
   Saída por página: `ok` (já igual ao canônico) / `DRY ... mudaria .nav [e .mobile-nav]` /
   `ERRO` (bloco não encontrado — investigar antes de aplicar).
2. Revisar se as mudanças anunciadas fazem sentido e aplicar (sem `--dry`).
3. Verificar com a skill `verificar-regressao` (o nav muda em todas as páginas).
4. Commit + push.

## Como o script funciona

- Para cada página listada em `NAV`, localiza o bloco `<div class="nav">` (balanceando
  divs aninhadas) e o substitui pelo gerado; idem para `<div class="mobile-nav">`
  **onde existir** (nem toda página tem — não é erro).
- Página ativa: botão sem `onclick` com classe `active`; o grupo dela ganha
  `group-active` e o botão do grupo `active`.
- Respeita o fim de linha (CRLF/LF) de cada arquivo.
- Idempotente: rodar duas vezes seguidas → segunda vez tudo `ok`.

## Página nova (checklist junto com `arquiteto-modulo`)

1. Adicionar a página em `NAV` (grupo e posição acordados com o usuário).
2. A página nova precisa ter um bloco `<div class="nav">...</div>` no topbar (copiar de
   uma página existente — o conteúdo será sobrescrito pelo script).
3. Rodar dry-run → aplicar → todas as páginas passam a mostrar o item novo.
4. Atualizar a lista de páginas no CLAUDE.md.
