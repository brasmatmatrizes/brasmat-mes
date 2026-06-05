// ============================================================
// STATUS.JS — Lógica central + cache compartilhado
// ============================================================

const SUPABASE_URL = "https://hjvlznijsgdwurtsyukl.supabase.co";
const SUPABASE_KEY = "sb_publishable_3N0kbWDpJ542n_aWeFzUqQ_pmVGrFiB";
const CACHE_KEY    = "brasmat_eventos_cache";
const CACHE_TS_KEY = "brasmat_eventos_ts";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

const SUBOP_ELABORACAO   = "11.3";
const SUBOP_ALMOXARIFADO = "11.4";
const SUBOP_INSPECAO_FINAL = "10.2";

const COR_PROCESSO = {
  "RETÍFICA PLANA":"#3B7FFF","RETÍFICA CILÍNDRICA INTERNA":"#9B5DE5",
  "RETÍFICA CILÍNDRICA EXTERNA":"#7C3AED","TORNO":"#059669",
  "EROSÃO A FIO":"#DC2626","EROSÃO PENETRAÇÃO":"#B91C1C",
  "FORMA":"#D97706","BRUNIDORA":"#0891B2","POLIMENTO":"#DB2777",
  "PRENSA":"#65A30D","QUALIDADE":"#F59E0B","SERVIÇO EXTERNO":"#6B7280",
  "ADMINISTRATIVO":"#4B5563"
};

const PROCESSOS_KANBAN = [
  {key:"RETÍFICA PLANA",              label:"Retífica Plana",      cor:"#3B7FFF"},
  {key:"RETÍFICA CILÍNDRICA INTERNA", label:"Ret. Cil. Interna",   cor:"#9B5DE5"},
  {key:"RETÍFICA CILÍNDRICA EXTERNA", label:"Ret. Cil. Externa",   cor:"#7C3AED"},
  {key:"TORNO",                       label:"Torno",               cor:"#059669"},
  {key:"EROSÃO A FIO",                label:"Erosão a Fio",        cor:"#DC2626"},
  {key:"EROSÃO PENETRAÇÃO",           label:"Erosão Penetração",   cor:"#B91C1C"},
  {key:"FORMA",                       label:"Forma",               cor:"#D97706"},
  {key:"BRUNIDORA",                   label:"Brunidora",           cor:"#0891B2"},
  {key:"POLIMENTO",                   label:"Polimento",           cor:"#DB2777"},
  {key:"PRENSA",                      label:"Prensa",              cor:"#65A30D"},
  {key:"QUALIDADE",                   label:"Qualidade",           cor:"#F59E0B"},
  {key:"SERVIÇO EXTERNO",             label:"Serviço Externo",     cor:"#6B7280"},
  {key:"ADMINISTRATIVO",              label:"Administrativo",      cor:"#4B5563"}
];

// ---- CACHE ----
async function fetchSupabase(path){
  const r = await fetch(SUPABASE_URL + path, {
    headers:{apikey:SUPABASE_KEY, Authorization:"Bearer "+SUPABASE_KEY}
  });
  return r.json();
}

async function carregarEventos(forceRefresh){
  // Verifica cache
  if(!forceRefresh){
    try{
      const ts = parseInt(sessionStorage.getItem(CACHE_TS_KEY)||"0");
      if(Date.now()-ts < CACHE_TTL_MS){
        const cached = sessionStorage.getItem(CACHE_KEY);
        if(cached){
          const dados = JSON.parse(cached);
          if(Array.isArray(dados)&&dados.length>0) return dados;
        }
      }
    }catch(e){}
  }
  // Busca no Supabase
  let todos=[],offset=0;
  while(true){
    const chunk = await fetchSupabase(
      `/rest/v1/producao_eventos?select=id,pedido,codigo_peca,cliente,processo,operador,evento,data_evento,sequencial_operacao,observacao,retrabalho,prazo_entrega,quantidade_produzida,quantidade_solicitada,operacao_retifica_plana,operacao_retifica_cilindrica_interna,operacao_retifica_cilindrica_externa,operacao_erosao_fio,operacao_forma,operacao_polimento,operacao_brunidora,operacao_prensa,operacao_torno,operacao_qualidade,operacao_administrativo,operacao_servico_externo,operacao_erosao_penetracao&order=id.asc&limit=1000&offset=${offset}`
    );
    if(!Array.isArray(chunk)||chunk.length===0) break;
    todos=todos.concat(chunk);
    if(chunk.length<1000) break;
    offset+=1000;
  }
  // Salva cache
  try{
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(todos));
    sessionStorage.setItem(CACHE_TS_KEY, String(Date.now()));
  }catch(e){}
  return todos;
}

function limparCache(){
  try{
    sessionStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem(CACHE_TS_KEY);
  }catch(e){}
}

// ---- HELPERS ----
function getSubop(row){
  const cols=["operacao_retifica_plana","operacao_retifica_cilindrica_interna","operacao_retifica_cilindrica_externa","operacao_erosao_fio","operacao_forma","operacao_polimento","operacao_brunidora","operacao_prensa","operacao_torno","operacao_qualidade","operacao_administrativo","operacao_servico_externo","operacao_erosao_penetracao"];
  for(const c of cols){ if(row[c]&&String(row[c]).trim()) return String(row[c]).trim(); }
  return "—";
}

function subopContem(row,codigo){ return getSubop(row).includes(codigo); }

function diasDesde(row){
  if(!row.data_evento) return 0;
  return Math.floor((Date.now()-new Date(row.data_evento))/(1000*60*60*24));
}
function diasClass(d){ return d>=6?"danger":d>=3?"warn":"ok"; }
function diasLabel(d){ return d===0?"hoje":d===1?"1 dia":d+" dias"; }
function fmtData(d){
  if(!d) return "—";
  const dt=new Date(d);
  return dt.toLocaleDateString("pt-BR")+" "+dt.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}

function calcularStatus(row){
  if(!row) return {status:"desconhecido",label:"Desconhecido",cor:"#4E5A72",icone:"❓"};
  const evt  = String(row.evento||"").trim().toUpperCase();
  const proc = String(row.processo||"").trim().toUpperCase();
  const subop= getSubop(row);
  const isEnt= evt==="ENTRADA";
  const isSai= evt==="SAÍDA"||evt==="SAIDA";
  if(isSai&&proc.includes("ADMINISTRATIVO")&&subop.includes(SUBOP_ALMOXARIFADO))
    return {status:"expedida",    label:"Expedida",                      cor:"#2DBF7E",icone:"🚚"};
  if(isEnt&&proc.includes("ADMINISTRATIVO")&&subop.includes(SUBOP_ALMOXARIFADO))
    return {status:"em_estoque",  label:"Em estoque — aguardando expedição",cor:"#2DBF7E",icone:"📦"};
  if(isSai&&proc.includes("QUALIDADE")&&subop.includes(SUBOP_INSPECAO_FINAL))
    return {status:"aprovada",    label:"Aprovada — indo para estoque",   cor:"#2DBF7E",icone:"✅"};
  if(isSai&&proc.includes("ADMINISTRATIVO")&&subop.includes(SUBOP_ELABORACAO))
    return {status:"aguardando",  label:"Aguardando primeiro operador",   cor:"#F5A623",icone:"⏳"};
  if(isEnt)
    return {status:"em_producao", label:"Em processo — "+(row.processo||""),cor:COR_PROCESSO[proc]||"#3B7FFF",icone:"⚙️"};
  if(isSai)
    return {status:"liberada",    label:"Liberada — aguardando próx. processo",cor:"#A8B2C8",icone:"➡️"};
  return {status:"desconhecido",label:"Desconhecido",cor:"#6E7A92",icone:"❓"};
}

function calcularPosicaoTodos(dados){
  const mapa={};
  dados.forEach(row=>{
    if(!row.pedido||!row.codigo_peca) return;
    const k=row.pedido+"||"+row.codigo_peca;
    if(!mapa[k]||row.id>mapa[k].id) mapa[k]=row;
  });
  return mapa;
}

function esc(s){ return String(s||"").replace(/'/g,"\\'"); }
