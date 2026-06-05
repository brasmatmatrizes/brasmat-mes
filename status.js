// ============================================================
// STATUS.JS — Lógica central + carregamento lazy
// ============================================================

const SUPABASE_URL = "https://hjvlznijsgdwurtsyukl.supabase.co";
const SUPABASE_KEY = "sb_publishable_3N0kbWDpJ542n_aWeFzUqQ_pmVGrFiB";

// Campos resumidos — usados no carregamento inicial (todas as telas)
const CAMPOS_RESUMO = "id,pedido,codigo_peca,cliente,processo,operador,evento,data_evento,prazo_entrega,retrabalho,operacao_retifica_plana,operacao_retifica_cilindrica_interna,operacao_retifica_cilindrica_externa,operacao_erosao_fio,operacao_forma,operacao_polimento,operacao_brunidora,operacao_prensa,operacao_torno,operacao_qualidade,operacao_administrativo,operacao_servico_externo,operacao_erosao_penetracao";

// Campos completos — usados só ao abrir o detalhe de UMA peça
const CAMPOS_DETALHE = "id,pedido,codigo_peca,cliente,processo,operador,evento,data_evento,sequencial_operacao,observacao,retrabalho,prazo_entrega,quantidade_produzida,quantidade_solicitada,operacao_retifica_plana,operacao_retifica_cilindrica_interna,operacao_retifica_cilindrica_externa,operacao_erosao_fio,operacao_forma,operacao_polimento,operacao_brunidora,operacao_prensa,operacao_torno,operacao_qualidade,operacao_administrativo,operacao_servico_externo,operacao_erosao_penetracao";

const SUBOP_ELABORACAO    = "11.3";
const SUBOP_ALMOXARIFADO  = "11.4";
const SUBOP_INSPECAO_FINAL= "10.2";

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

// ---- FETCH BASE ----
async function fetchSupabase(path){
  const r = await fetch(SUPABASE_URL + path, {
    headers:{apikey:SUPABASE_KEY, Authorization:"Bearer "+SUPABASE_KEY}
  });
  return r.json();
}

// ---- CARREGAMENTO INICIAL: só campos resumidos ----
async function carregarEventos(){
  let todos=[], offset=0;
  while(true){
    const chunk = await fetchSupabase(
      `/rest/v1/producao_eventos?select=${CAMPOS_RESUMO}&order=id.asc&limit=1000&offset=${offset}`
    );
    if(!Array.isArray(chunk)||chunk.length===0) break;
    todos = todos.concat(chunk);
    if(chunk.length < 1000) break;
    offset += 1000;
  }
  return todos;
}

// ---- DETALHE LAZY: busca histórico completo de UMA peça ----
async function carregarDetalhe(pedido, codigo){
  const pedidoEnc  = encodeURIComponent(pedido);
  const codigoEnc  = encodeURIComponent(codigo);
  const dados = await fetchSupabase(
    `/rest/v1/producao_eventos?select=${CAMPOS_DETALHE}&pedido=eq.${pedidoEnc}&codigo_peca=eq.${codigoEnc}&order=id.asc`
  );
  return Array.isArray(dados) ? dados : [];
}

// ---- HELPERS ----
function getSubop(row){
  const cols=["operacao_retifica_plana","operacao_retifica_cilindrica_interna","operacao_retifica_cilindrica_externa","operacao_erosao_fio","operacao_forma","operacao_polimento","operacao_brunidora","operacao_prensa","operacao_torno","operacao_qualidade","operacao_administrativo","operacao_servico_externo","operacao_erosao_penetracao"];
  for(const c of cols){ if(row[c]&&String(row[c]).trim()) return String(row[c]).trim(); }
  return "—";
}

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
  if(!row) return {status:"desconhecido",label:"Desconhecido",cor:"#6E7A92",icone:"❓"};
  const evt  = String(row.evento||"").trim().toUpperCase();
  const proc = String(row.processo||"").trim().toUpperCase();
  const subop= getSubop(row);
  const isEnt= evt==="ENTRADA";
  const isSai= evt==="SAÍDA"||evt==="SAIDA";
  if(isSai&&proc.includes("ADMINISTRATIVO")&&subop.includes(SUBOP_ALMOXARIFADO))
    return {status:"expedida",   label:"Expedida",                        cor:"#2DBF7E",icone:"🚚"};
  if(isEnt&&proc.includes("ADMINISTRATIVO")&&subop.includes(SUBOP_ALMOXARIFADO))
    return {status:"em_estoque", label:"Em estoque — aguardando expedição",cor:"#2DBF7E",icone:"📦"};
  if(isSai&&proc.includes("QUALIDADE")&&subop.includes(SUBOP_INSPECAO_FINAL))
    return {status:"aprovada",   label:"Aprovada — indo para estoque",     cor:"#2DBF7E",icone:"✅"};
  if(isSai&&proc.includes("ADMINISTRATIVO")&&subop.includes(SUBOP_ELABORACAO))
    return {status:"aguardando", label:"Aguardando primeiro operador",     cor:"#F5A623",icone:"⏳"};
  if(isEnt)
    return {status:"em_producao",label:"Em processo — "+(row.processo||""),cor:COR_PROCESSO[proc]||"#3B7FFF",icone:"⚙️"};
  if(isSai)
    return {status:"liberada",   label:"Liberada — aguardando próx. processo",cor:"#A8B2C8",icone:"➡️"};
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

// Renderiza o painel de detalhe de uma peça (usado em todas as telas)
async function renderDetalhe(pedido, codigo, containerBody, containerTitle){
  containerTitle.innerHTML=
    `<div style="font-size:15px;font-weight:700;color:var(--text);font-family:var(--mono)">${codigo}</div>
     <div style="font-size:12px;color:var(--text2);font-family:var(--mono);margin-top:2px">Pedido: ${pedido}</div>`;
  containerBody.innerHTML=`<div style="display:flex;align-items:center;gap:10px;padding:40px;color:var(--text3);font-family:var(--mono);font-size:12px"><div class="spinner"></div>carregando histórico...</div>`;

  // Busca lazy — só esta peça, campos completos
  const eventos = await carregarDetalhe(pedido, codigo);

  if(!eventos.length){
    containerBody.innerHTML="<p style='color:var(--text3);font-size:13px;padding:16px'>Sem eventos.</p>";
    return;
  }

  const ultimo   = eventos[eventos.length-1];
  const st       = calcularStatus(ultimo);
  const proc     = String(ultimo.processo||"").trim();
  const corProc  = COR_PROCESSO[proc.toUpperCase()]||"#6E7A92";
  const subopAt  = getSubop(ultimo);
  const diasAt   = diasDesde(ultimo);
  const dc       = diasClass(diasAt);
  const retrabalhos = eventos.filter(r=>String(r.retrabalho||"").trim()).length;
  const prazo    = ultimo.prazo_entrega||"—";
  const prazoDate= prazo!=="—"?new Date(prazo):null;
  const prazoOk  = prazoDate?(prazoDate>new Date()?`<span style="color:var(--ok)">✓</span>`:`<span style="color:var(--danger)">⚠</span>`):"";
  const leadDias = Math.max(0,Math.floor((new Date(ultimo.data_evento)-new Date(eventos[0].data_evento))/(1000*60*60*24)));

  const tlHtml = eventos.map((ev,i)=>{
    const isUlt = i===eventos.length-1;
    const evtStr= String(ev.evento||"").trim().toUpperCase();
    const isEnt = evtStr==="ENTRADA";
    const dotC  = isUlt&&isEnt?"atual":isEnt?"entrada":"saida";
    const subop = getSubop(ev);
    let durHtml = "";
    if(!isEnt&&i>0){
      const ant=eventos[i-1];
      if(ant&&String(ant.evento||"").trim().toUpperCase()==="ENTRADA"){
        const ms=new Date(ev.data_evento)-new Date(ant.data_evento);
        if(ms>0){const h=Math.floor(ms/3600000);const d=Math.floor(h/24);durHtml=`<span style="font-size:11px;font-family:var(--mono);padding:2px 7px;border-radius:8px;background:var(--bg3);color:var(--text2)">${d>0?d+"d ":""}${h%24}h</span>`;}
      }
    }
    return `<li class="tl-item">
      <div class="tl-dot ${dotC}"></div>
      <div class="tl-card${isUlt&&isEnt?" atual":""}">
        <div class="tl-top">
          <span class="tl-proc">${ev.processo||"—"}</span>
          <span class="tl-evt ${isEnt?"evt-entrada":"evt-saida"}">${evtStr}</span>
          ${isUlt?`<span class="tl-atual-tag">${st.icone} ${st.label}</span>`:""}
          ${ev.retrabalho&&String(ev.retrabalho).trim()?`<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:rgba(240,69,69,0.12);color:var(--danger)">retrabalho</span>`:""}
        </div>
        <div class="tl-sub">${subop}</div>
        <div class="tl-foot">
          <span class="tl-meta">👤 ${ev.operador||"—"}</span>
          <span class="tl-meta">📅 ${fmtData(ev.data_evento)}</span>
          ${ev.sequencial_operacao?`<span class="tl-meta">op. ${ev.sequencial_operacao}</span>`:""}
          ${durHtml}
        </div>
        ${ev.observacao&&String(ev.observacao).trim()?`<div style="margin-top:6px;font-size:11px;color:var(--text3);border-top:1px solid var(--border);padding-top:5px">${ev.observacao}</div>`:""}
      </div>
    </li>`;
  }).join("");

  containerBody.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
      <div style="background:var(--bg3);border-radius:8px;padding:10px 12px"><div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.07em">cliente</div><div style="font-size:13px;font-weight:500;color:var(--text)">${ultimo.cliente||"—"}</div></div>
      <div style="background:var(--bg3);border-radius:8px;padding:10px 12px"><div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.07em">prazo</div><div style="font-size:13px;font-weight:500;color:var(--text)">${prazo} ${prazoOk}</div></div>
      <div style="background:var(--bg3);border-radius:8px;padding:10px 12px"><div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.07em">eventos</div><div style="font-size:13px;font-weight:500;color:var(--text)">${eventos.length}</div></div>
      <div style="background:var(--bg3);border-radius:8px;padding:10px 12px"><div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.07em">retrabalhos</div><div style="font-size:13px;font-weight:500;color:${retrabalhos>0?"var(--danger)":"var(--ok)"}">${retrabalhos}</div></div>
    </div>
    ${st.status==="em_producao"?`
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <div style="width:4px;height:40px;border-radius:2px;background:${corProc};flex-shrink:0"></div>
      <div style="flex:1"><div style="font-size:10px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px">posição atual</div><div style="font-size:14px;font-weight:600;color:var(--text)">${proc}</div><div style="font-size:11px;color:var(--text2);margin-top:2px">${subopAt}</div></div>
      <div style="text-align:right"><div style="font-size:16px;font-weight:600;font-family:var(--mono);color:var(--${dc})">${diasLabel(diasAt)}</div><div style="font-size:11px;color:var(--text3)">neste setor</div></div>
    </div>`:""}
    <div style="font-size:10px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:var(--text3);font-family:var(--mono);margin-bottom:12px">linha do tempo</div>
    <ul class="timeline">${tlHtml}</ul>`;
}

function esc(s){ return String(s||"").replace(/'/g,"\\'"); }
