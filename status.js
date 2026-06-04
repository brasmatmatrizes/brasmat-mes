// ============================================================
// STATUS.JS — Lógica central de status de peça
// Incluir em todas as telas via <script src="status.js">
// ============================================================

const SUBOP_ELABORACAO  = "11.3";   // Elaboração do processo — sempre SAÍDA, é a largada
const SUBOP_ALMOXARIFADO = "11.4";  // Estoque Almoxarifado
const SUBOP_INSPECAO_FINAL = "10.2"; // Inspeção Final da Qualidade

const COR_PROCESSO = {
  "RETÍFICA PLANA":"#3B7FFF",
  "RETÍFICA CILÍNDRICA INTERNA":"#9B5DE5",
  "RETÍFICA CILÍNDRICA EXTERNA":"#7C3AED",
  "TORNO":"#059669",
  "EROSÃO A FIO":"#DC2626",
  "EROSÃO PENETRAÇÃO":"#B91C1C",
  "FORMA":"#D97706",
  "BRUNIDORA":"#0891B2",
  "POLIMENTO":"#DB2777",
  "PRENSA":"#65A30D",
  "QUALIDADE":"#F59E0B",
  "SERVIÇO EXTERNO":"#6B7280",
  "ADMINISTRATIVO":"#4B5563"
};

const PROCESSOS_KANBAN = [
  {key:"RETÍFICA PLANA",              label:"Retífica Plana",         cor:"#3B7FFF"},
  {key:"RETÍFICA CILÍNDRICA INTERNA", label:"Ret. Cil. Interna",      cor:"#9B5DE5"},
  {key:"RETÍFICA CILÍNDRICA EXTERNA", label:"Ret. Cil. Externa",      cor:"#7C3AED"},
  {key:"TORNO",                       label:"Torno",                  cor:"#059669"},
  {key:"EROSÃO A FIO",                label:"Erosão a Fio",           cor:"#DC2626"},
  {key:"EROSÃO PENETRAÇÃO",           label:"Erosão Penetração",      cor:"#B91C1C"},
  {key:"FORMA",                       label:"Forma",                  cor:"#D97706"},
  {key:"BRUNIDORA",                   label:"Brunidora",              cor:"#0891B2"},
  {key:"POLIMENTO",                   label:"Polimento",              cor:"#DB2777"},
  {key:"PRENSA",                      label:"Prensa",                 cor:"#65A30D"},
  {key:"QUALIDADE",                   label:"Qualidade",              cor:"#F59E0B"},
  {key:"SERVIÇO EXTERNO",             label:"Serviço Externo",        cor:"#6B7280"},
  {key:"ADMINISTRATIVO",              label:"Administrativo",         cor:"#4B5563"}
];

// Retorna a suboperação preenchida de um registro
function getSubop(row) {
  const cols = [
    "operacao_retifica_plana","operacao_retifica_cilindrica_interna",
    "operacao_retifica_cilindrica_externa","operacao_erosao_fio",
    "operacao_forma","operacao_polimento","operacao_brunidora",
    "operacao_prensa","operacao_torno","operacao_qualidade",
    "operacao_administrativo","operacao_servico_externo","operacao_erosao_penetracao"
  ];
  for (const c of cols) {
    if (row[c] && String(row[c]).trim()) return String(row[c]).trim();
  }
  return "—";
}

// Retorna true se a suboperação contém o código informado
function subopContem(row, codigo) {
  const s = getSubop(row);
  return s.includes(codigo);
}

// Dias desde a data do evento
function diasDesde(row) {
  if (!row.data_evento) return 0;
  return Math.floor((Date.now() - new Date(row.data_evento)) / (1000 * 60 * 60 * 24));
}

function diasClass(d) { return d >= 6 ? "danger" : d >= 3 ? "warn" : "ok"; }
function diasLabel(d) { return d === 0 ? "hoje" : d === 1 ? "1 dia" : d + " dias"; }

function fmtData(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR") + " " + dt.toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"});
}

/*
  STATUS POSSÍVEIS:
  -------------------------------------------------
  "em_producao"     → ENTRADA em processo produtivo normal
  "em_estoque"      → ENTRADA Administrativo 11.4 Almoxarifado
  "expedida"        → SAÍDA Administrativo 11.4 Almoxarifado
  "aprovada"        → SAÍDA Qualidade 10.2 Inspeção Final (indo para estoque)
  "aguardando"      → SAÍDA Administrativo 11.3 Elaboração (liberada, nenhum operador pegou)
  "liberada"        → SAÍDA de qualquer processo produtivo (entre processos)
*/
function calcularStatus(ultimoEvento) {
  if (!ultimoEvento) return { status: "desconhecido", label: "Desconhecido", cor: "#4E5A72" };

  const evt   = String(ultimoEvento.evento || "").trim().toUpperCase();
  const proc  = String(ultimoEvento.processo || "").trim().toUpperCase();
  const subop = getSubop(ultimoEvento);
  const isEntrada = evt === "ENTRADA";
  const isSaida   = evt === "SAÍDA" || evt === "SAIDA";

  // Expedida
  if (isSaida && proc.includes("ADMINISTRATIVO") && subop.includes(SUBOP_ALMOXARIFADO)) {
    return { status:"expedida", label:"Expedida", cor:"#2DBF7E", icone:"🚚" };
  }

  // Em estoque aguardando cliente
  if (isEntrada && proc.includes("ADMINISTRATIVO") && subop.includes(SUBOP_ALMOXARIFADO)) {
    return { status:"em_estoque", label:"Em estoque — aguardando expedição", cor:"#2DBF7E", icone:"📦" };
  }

  // Aprovada na inspeção final — indo para estoque
  if (isSaida && proc.includes("QUALIDADE") && subop.includes(SUBOP_INSPECAO_FINAL)) {
    return { status:"aprovada", label:"Aprovada — indo para estoque", cor:"#2DBF7E", icone:"✅" };
  }

  // Aguardando primeiro operador (elaboração do processo foi feita)
  if (isSaida && proc.includes("ADMINISTRATIVO") && subop.includes(SUBOP_ELABORACAO)) {
    return { status:"aguardando", label:"Aguardando primeiro operador", cor:"#F5A623", icone:"⏳" };
  }

  // Em produção
  if (isEntrada) {
    return { status:"em_producao", label:"Em processo — " + (ultimoEvento.processo || ""), cor: COR_PROCESSO[proc] || "#3B7FFF", icone:"⚙️" };
  }

  // Liberada entre processos
  if (isSaida) {
    return { status:"liberada", label:"Liberada — aguardando próximo processo", cor:"#8892AA", icone:"➡️" };
  }

  return { status:"desconhecido", label:"Desconhecido", cor:"#4E5A72", icone:"❓" };
}

// Calcula posição atual de todas as peças
// Retorna objeto { "pedido||codigo": ultimoEvento }
function calcularPosicaoTodos(dados) {
  const mapa = {};
  dados.forEach(row => {
    if (!row.pedido || !row.codigo_peca) return;
    const k = row.pedido + "||" + row.codigo_peca;
    if (!mapa[k] || row.id > mapa[k].id) mapa[k] = row;
  });
  return mapa;
}

function esc(s) { return String(s || "").replace(/'/g, "\\'"); }
