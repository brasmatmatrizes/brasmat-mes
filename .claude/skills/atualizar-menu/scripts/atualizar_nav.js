#!/usr/bin/env node
// Reescreve o bloco .nav (e .mobile-nav onde existir) de todas as paginas do menu.
// Fonte unica da estrutura do menu: a constante NAV abaixo.
// Uso: node atualizar_nav.js [caminho-do-repo] [--dry]
//   --dry  nao grava nada; so mostra o que mudaria em cada pagina.

const fs = require("fs");
const path = require("path");

// ===== ESTRUTURA CANONICA DO MENU (editar aqui para incluir/reordenar) =====
const NAV = [
  { page: "index.html", label: "Buscar Peça", mobile: "Buscar Peça" },
  {
    group: "Cliente",
    items: [
      { page: "demanda.html", label: "Demanda Cliente", mobile: "Demanda" },
      { page: "cliente.html", label: "Consulta Cliente", mobile: "Cliente" },
      { page: "expedicao.html", label: "Expedição", mobile: "Expedição" },
    ],
  },
  {
    group: "Produção",
    items: [
      { page: "kanban.html", label: "Kanban", mobile: "Kanban" },
      { page: "op-kanban.html", label: "Painel", mobile: "Painel" },
      { page: "apontamentos.html", label: "Apontamentos", mobile: "Apontamentos" },
      { page: "paradas.html", label: "Peças paradas", mobile: "Paradas" },
    ],
  },
  {
    group: "Indicadores",
    items: [
      { page: "prazos.html", label: "Prazos", mobile: "Prazos" },
      { page: "otd.html", label: "OTD", mobile: "OTD" },
      { page: "ordens.html", label: "Ordens em Aberto", mobile: "Ordens" },
      { page: "operadores.html", label: "Performance", mobile: "Performance" },
      { page: "qualidade.html", label: "Qualidade", mobile: "Qualidade" },
    ],
  },
  {
    group: "Cadastro",
    items: [
      { page: "cadastro-item.html", label: "Item", mobile: "Item" },
      { page: "separacao-material.html", label: "Separação", mobile: "Separação" },
      { page: "engenharia.html", label: "Roteiro", mobile: "Roteiro" },
    ],
  },
];
// ===========================================================================

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const REPO = args.find((a) => a !== "--dry") || ".";

function btn(cls, item, atual, mobile) {
  const label = mobile ? item.mobile : item.label;
  // data-href fica sempre presente (mesmo no botao ativo, que nao tem onclick) --
  // e o gancho que paginas com 2 itens de menu pro mesmo arquivo (ex.: Engenharia,
  // "Item existente"/"Item novo") usam em runtime pra saber qual botao e qual.
  return item.page === atual
    ? `<button class="${cls} active" data-href="${item.page}">${label}</button>`
    : `<button class="${cls}" data-href="${item.page}" onclick="navTo('${item.page}')">${label}</button>`;
}

function gerarBloco(atual, mobile, eol) {
  const cls = mobile ? "mnb" : "nb";
  const base = mobile ? "" : "  "; // indentacao do bloco no arquivo
  const wrap = mobile ? "mobile-nav" : "nav";
  const L = [];
  // primeira linha sem indentacao: a substituicao comeca exatamente na tag,
  // os espacos antes dela ja estao no arquivo
  L.push(`<div class="${wrap}">`);
  for (const entry of NAV) {
    if (entry.page) {
      L.push(`${base}  ${btn(cls, entry, atual, mobile)}`);
    } else {
      const ativa = entry.items.some((it) => it.page === atual);
      L.push(`${base}  <div class="nav-group${ativa ? " group-active" : ""}">`);
      L.push(`${base}    <button class="${cls} nb-group${ativa ? " active" : ""}">${entry.group} ▾</button>`);
      L.push(`${base}    <div class="nav-dropdown">`);
      for (const it of entry.items) L.push(`${base}      ${btn(cls, it, atual, mobile)}`);
      L.push(`${base}    </div>`);
      L.push(`${base}  </div>`);
    }
  }
  L.push(`${base}</div>`);
  return L.join(eol || "\n");
}

// Encontra o bloco <div class="X"> ... </div> balanceando divs aninhadas
function acharBloco(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) return null;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(src))) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) return { start, end: m.index + m[0].length };
  }
  return null;
}

// item.page pode levar querystring (ex.: "engenharia.html?modo=novo") quando dois itens
// do menu apontam pro mesmo arquivo com estados diferentes; o arquivo real (p/ existsSync
// e p/ achar o bloco .nav) e sempre a parte antes do "?".
function arquivoReal(pg) { return pg.split("?")[0]; }
const paginas = [...new Set(
  NAV.flatMap((e) => (e.page ? [e.page] : e.items.map((i) => i.page))).map(arquivoReal)
)];
let erros = 0;

for (const pg of paginas) {
  const fp = path.join(REPO, pg);
  if (!fs.existsSync(fp)) {
    console.log(`ERRO  ${pg}: arquivo nao encontrado`);
    erros++;
    continue;
  }
  let src = fs.readFileSync(fp, "utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n"; // respeita o fim de linha do arquivo
  const mudancas = [];

  for (const [marker, mobile] of [ ['<div class="nav">', false], ['<div class="mobile-nav">', true] ]) {
    const bloco = acharBloco(src, marker);
    if (!bloco) {
      if (!mobile) { console.log(`ERRO  ${pg}: bloco .nav nao encontrado`); erros++; }
      continue; // mobile-nav e opcional
    }
    const atualBloco = src.slice(bloco.start, bloco.end);
    const novo = gerarBloco(pg, mobile, eol);
    if (atualBloco !== novo) {
      mudancas.push(mobile ? ".mobile-nav" : ".nav");
      src = src.slice(0, bloco.start) + novo + src.slice(bloco.end);
    }
  }

  if (!mudancas.length) {
    console.log(`ok    ${pg}: ja esta igual ao canonico`);
  } else if (DRY) {
    console.log(`DRY   ${pg}: mudaria ${mudancas.join(" e ")}`);
  } else {
    fs.writeFileSync(fp, src);
    console.log(`FEITO ${pg}: reescrito ${mudancas.join(" e ")}`);
  }
}

process.exit(erros ? 1 : 0);
