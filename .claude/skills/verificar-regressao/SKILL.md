---
name: verificar-regressao
description: Verifica se as 13 páginas do BRASMAT MES continuam funcionando depois de uma alteração no código (especialmente em status.js ou design.css, que são compartilhados). Use SEMPRE que o usuário pedir para "verificar regressão", "conferir se nada quebrou", "testar as páginas", "rodar o teste geral", ou depois de qualquer mudança em arquivo compartilhado (status.js, design.css) — mesmo sem pedido explícito, oferecer a verificação. Abre cada página no preview, confere erros de console e se o conteúdo principal renderizou.
---

# Verificar regressão (BRASMAT MES)

Esta skill existe porque as 13 páginas compartilham `status.js` e `design.css`: uma mudança
feita para uma tela pode quebrar outra silenciosamente. O usuário preza acima de tudo
**não quebrar o que já funciona** — esta é a rede de proteção.

## Quando rodar

- Depois de qualquer edição em `status.js` ou `design.css` → verificação completa (13 páginas).
- Depois de edição em uma página específica → verificação da página editada + verificação
  rápida de 2–3 páginas vizinhas (que usam as mesmas funções).
- Quando o usuário pedir explicitamente.

## Passo 1 — subir o preview

Use `preview_start` com o nome `brasmat-mes` (config em `.claude/launch.json`).
Se já houver servidor rodando (`preview_list`), reutilize.

## Passo 2 — varrer as páginas

As 13 páginas, na ordem do menu:

| # | Página | O que deve aparecer para considerar OK |
|---|--------|----------------------------------------|
| 1 | `index.html` | Campo de busca de peça habilitado; contador de peças no topo |
| 2 | `demanda.html` | Select de cliente populado; resumo "Demandas em aberto" com cards de clientes |
| 3 | `expedicao.html` | Itens agrupados por cliente (ou placeholder se não houver itens) |
| 4 | `kanban.html` | Colunas de processo com cards; filtros de operador/cliente populados |
| 5 | `op-kanban.html` | Cards de operadores (verde/amarelo) |
| 6 | `cliente.html` | Textarea da lista + botão "Localizar peças" |
| 7 | `apontamentos.html` | Tabela/lista de apontamentos carregada |
| 8 | `prazos.html` | Conteúdo de prazos carregado |
| 9 | `otd.html` | Indicador OTD carregado |
| 10 | `ordens.html` | Lista de ordens carregada |
| 11 | `paradas.html` | Conteúdo de paradas carregado |
| 12 | `operadores.html` | Performance de operadores carregada |
| 13 | `qualidade.html` | Cards de lotes/peças inspecionados carregados |

**Método eficiente (validado):** carregar as páginas em iframes ocultos, em lotes de
4–5 por chamada de `preview_eval` — os erros de console dos iframes aparecem no console
principal, então uma única checagem de `preview_console_logs` ao final cobre tudo:

```js
(async function(){
  const pages=['demanda.html','expedicao.html','kanban.html','op-kanban.html'];
  const out=[];
  for(const p of pages){
    const f=document.createElement('iframe');
    f.style.cssText='width:1200px;height:800px;position:absolute;left:-9999px';
    f.src='/'+p;
    document.body.appendChild(f);
    await new Promise(res=>{f.onload=res;});
    await new Promise(res=>setTimeout(res,2800));
    const d=f.contentDocument;
    out.push({p, len:(d.body.innerText||'').length,
      nav:d.querySelectorAll('.nav a,.nav button').length,
      loading:!!d.querySelector('.loading')});
    f.remove();
  }
  return JSON.stringify(out);
})();
```

Critérios de aprovação por página:
- `len` compatível com conteúdo real (página presa em "carregando" fica com texto mínimo);
- `nav` > 0 (menu presente);
- `loading: false` (nenhum spinner travado);
- ao final da varredura, `preview_console_logs` com `level: "error"` vazio —
  **qualquer erro de console é reprovação**.

Referência de `len` saudável na última varredura completa (04/07/2026): index ~225,
demanda ~1100, expedicao ~8000, kanban ~2700, op-kanban ~1200, cliente ~450,
apontamentos ~840, prazos ~40000, otd ~19000, ordens ~4500, paradas ~31000,
operadores ~1600, qualidade ~1000. Valores muito abaixo desses merecem inspeção
manual com `preview_snapshot` (os dados variam, então use como ordem de grandeza,
não como valor exato).

## Passo 3 — verificação funcional da página alterada

Além do carregamento, exercite a funcionalidade que foi mexida (clicar filtro, abrir
linha do tempo, digitar busca...). Use os dados reais que já estão no banco — só leitura;
**nunca** gravar/alterar dados do banco durante a verificação (não clicar em salvar,
incluir na demanda, marcar checkbox de item etc.). Se precisar testar um fluxo de
gravação, interceptar o `fetch` via `preview_eval` e simular a resposta, como já é
prática nas verificações deste projeto.

## Passo 4 — relatório

Apresente um resumo curto por página: ✅ OK / ❌ problema (com o erro de console ou o
sintoma). Se houver reprovação, diagnostique e corrija antes de commit/push — o deploy
na Vercel é automático a cada push no `main`.

## Limitações conhecidas

- `preview_screenshot` às vezes dá timeout neste ambiente sem a página estar quebrada —
  não usar screenshot como critério; console + conteúdo bastam.
- Realtime não é testável no preview de forma confiável; o fallback de 60s cobre.
- Páginas dependem de dados reais do Supabase: se o banco estiver fora, rode primeiro
  a skill `verificar-acesso-sistema` para não confundir indisponibilidade com regressão.
