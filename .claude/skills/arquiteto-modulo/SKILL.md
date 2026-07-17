---
name: arquiteto-modulo
description: Playbook para criar um módulo novo no BRASMAT MES (nova página + novas tabelas Supabase), do desenho do schema ao deploy. Use SEMPRE que o usuário pedir uma "tela nova", "página nova", "módulo novo", "cadastro novo" ou qualquer funcionalidade que exija tabela nova no banco — ex.: roteiros de processo, estoque, orçamento, inspeção. Garante que todo módulo nasça no mesmo padrão do que já funciona (design system, nav, RLS, realtime, regressão). NÃO usar para mudança que não é módulo novo (indicador, ajuste de tela existente, coluna avulsa em tabela já existente sem tela nova) — nesses casos use `strategic-thinker` → `solution-architect` → `builder`.
---

# Arquiteto de módulo (BRASMAT MES)

Esta skill existe porque o sistema vai crescer de 13 páginas para um ERP+MES completo
(ver roadmap na memória do projeto). Cada módulo novo precisa nascer **igual ao que já
funciona** — não inventar padrão novo. O usuário não é programador: mostrar o desenho
do módulo (tabelas + tela) e obter aprovação **antes** de criar qualquer coisa.

## Caso trivial

Se for só uma coluna nova ou uma tabelinha auxiliar pequena, sem tela nova — aplique só o passo 2 (schema) direto, sem rodar o playbook inteiro (não precisa do checklist completo de nav/regressão/backup pra isso).

## Exemplos

**Deve disparar esta skill:**
- "Quero um cadastro novo de estoque."
- "Preciso de uma tela pra roteiros de processo."

**NÃO deve disparar (vai direto para outro lugar):**
- "Adiciona um indicador de tempo parado." (sem tabela nova) → `strategic-thinker`.
- "Muda a ordem das colunas dessa tabela." → edição direta.

## Ordem de trabalho

### 1. Desenhar e mostrar antes de criar

Apresentar ao usuário, em linguagem simples:
- quais tabelas novas (nome, colunas principais, o que cada uma guarda);
- como a tela vai funcionar (o que aparece, o que o usuário faz nela);
- como se conecta ao que já existe (pedido+código, demanda, apontamentos).

Só seguir depois do "ok".

### 2. Criar o schema no Supabase

Consultar a skill `modelagem-dados-mes` para as convenções de dados. Padrões fixos:

- DDL exige credencial elevada: **Management API** (`https://api.supabase.com/v1/projects/{ref}/database/query`)
  com PAT `sbp_...`, ou o MCP do Supabase se conectado. Credencial é transitória — nunca
  no código/git; pedir para rotacionar depois.
- Toda tabela nova: `grant all on <tabela> to anon, authenticated;` + RLS habilitado com
  policy permissiva `using(true) with check(true)` (padrão atual do projeto — vai mudar
  quando houver autenticação, ver marco da Fase 3 no roadmap).
- Colunas filtradas com frequência ganham **índice desde a criação**.
- Se a tela precisa atualizar em tempo real: adicionar a tabela à publication
  `supabase_realtime`.

### 3. Criar a página

- Arquivo `.html` **autocontido** na raiz (HTML + CSS inline + JS inline), como as demais.
- Tema: `<link rel="stylesheet" href="design.css">` (variáveis `:root`) — nunca copiar
  bloco de cores. Reset `*{box-sizing...}` fica por página.
- Carregar `status.js` e reutilizar o que existe: `supaFetch`, `status()`, `getSubop`,
  `calcProgressoRow`, `escHtml`, `abrirPainelDetalhe` (linha do tempo), `renderTipoBadge`.
- Topbar padrão com `.nav` (e `.mobile-nav` se houver) — copiar de uma página recente.
- Realtime (se aplicável): subscription via `@supabase/supabase-js` CDN + fallback
  `setInterval` 60s **condicionado** a canal não-`SUBSCRIBED` (padrão `_rtConectado`,
  ver `kanban.html`).
- Aplicar as lições da auditoria (estão na memória `licoes-auditoria-tecnica` e no
  `AUDITORIA_TECNICA.md`): fetch enxuto (`select=` só do que usa, `limit`), filtro no
  servidor, filtro de data padrão p/ tabelas grandes, debounce em busca ao vivo,
  `escHtml()` em tudo que o usuário digita e vai para `innerHTML`.
- Se a tela é para operador de chão de fábrica: consultar a skill `ux-operador`.

### 4. Integrar ao sistema

- **Menu**: a página nova entra no `.nav` de **todas** as páginas, na posição acordada
  com o usuário — atualizar via script Node que reescreve o bloco `.nav` (padrão do
  projeto), nunca na mão página por página.
- **CLAUDE.md**: atualizar a lista de páginas, a seção de dados do Supabase (tabelas
  novas) e regras de negócio firmadas que o módulo criar.
- **Regra de ouro dos dados**: lookup sempre por **pedido + código**, nunca só código.

### 5. Verificar e entregar

1. Rodar a skill `verificar-regressao` (todas as páginas, não só a nova — o nav mudou
   em todas).
2. Testar o fluxo principal do módulo no preview com dados reais (só leitura; gravação
   só simulada com interceptação de fetch, ou com aprovação explícita do usuário).
3. Antes da primeira carga de dados reais: rodar a skill `backup-dados`.
4. Commit + push (mensagem em inglês) — deploy automático na Vercel; lembrar Ctrl+F5.

## Checklist final (copiar na resposta ao usuário)

- [ ] Tabelas criadas com grant + RLS + índices (+ realtime se aplicável)
- [ ] Página autocontida usando design.css + status.js
- [ ] Nav atualizado em todas as páginas
- [ ] CLAUDE.md atualizado (páginas, dados, regras)
- [ ] Lições da auditoria aplicadas (fetch enxuto, filtro no servidor, escHtml)
- [ ] verificar-regressao passou
- [ ] backup-dados rodado antes de dados reais
- [ ] Commit + push feitos
