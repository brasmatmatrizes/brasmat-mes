// ============================================================
// STATUS.JS — Lógica central BRASMAT MES
// ============================================================

const SUPA_URL = "https://hjvlznijsgdwurtsyukl.supabase.co";
const SUPA_KEY = "sb_publishable_3N0kbWDpJ542n_aWeFzUqQ_pmVGrFiB";

const SUBOP_ELAB  = "11.3";
const SUBOP_ALMO  = "11.4";
const SUBOP_INSP  = "10.2";

const COR = {
  "RETÍFICA PLANA":"#3B7FFF","RETÍFICA CILÍNDRICA INTERNA":"#9B5DE5",
  "RETÍFICA CILÍNDRICA EXTERNA":"#7C3AED","TORNO":"#059669",
  "EROSÃO A FIO":"#DC2626","EROSÃO PENETRAÇÃO":"#B91C1C",
  "FORMA":"#D97706","BRUNIDORA":"#0891B2","POLIMENTO":"#DB2777",
  "PRENSA":"#65A30D","QUALIDADE":"#F59E0B","SERVIÇO EXTERNO":"#6B7280",
  "ADMINISTRATIVO":"#4B5563"
};

const COLUNAS_KANBAN = [
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

// ---- FETCH ----
async function supaFetch(path){
  const r = await fetch(SUPA_URL + path, {
    headers:{ apikey: SUPA_KEY, Authorization:"Bearer "+SUPA_KEY }
  });
  return r.json();
}

// Busca posição atual via view (rápido — um registro por peça)
async function buscarPosicao(){
  const r = await supaFetch("/rest/v1/posicao_atual?select=*&limit=10000");
  return Array.isArray(r) ? r : [];
}

// Busca histórico completo de UMA peça (chamado só ao abrir detalhe)
async function buscarHistorico(pedido, codigo){
  const p = encodeURIComponent(pedido);
  const c = encodeURIComponent(codigo);
  const r = await supaFetch(
    `/rest/v1/producao_eventos?select=*&pedido=eq.${p}&codigo_peca=eq.${c}&order=id.asc`
  );
  return Array.isArray(r) ? r : [];
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
function diasCls(d){ return d>=6?"danger":d>=3?"warn":"ok"; }
function diasStr(d){ return d===0?"hoje":d===1?"1 dia":d+" dias"; }
function fmtDt(d){
  if(!d) return "—";
  const dt=new Date(d);
  return dt.toLocaleDateString("pt-BR")+" "+dt.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}

function status(row){
  if(!row) return {s:"?",label:"Desconhecido",cor:"#6E7A92",ico:"❓"};
  const evt  = String(row.evento||"").trim().toUpperCase();
  const proc = String(row.processo||"").trim().toUpperCase();
  const sub  = getSubop(row);
  const ent  = evt==="ENTRADA";
  const sai  = evt==="SAÍDA"||evt==="SAIDA";
  if(sai&&proc.includes("ADMINISTRATIVO")&&sub.includes(SUBOP_ALMO))
    return {s:"expedida",   label:"Expedida",                         cor:"#2DBF7E",ico:"🚚"};
  if(ent&&proc.includes("ADMINISTRATIVO")&&sub.includes(SUBOP_ALMO))
    return {s:"em_estoque", label:"Em estoque — aguardando expedição", cor:"#2DBF7E",ico:"📦"};
  if(sai&&proc.includes("QUALIDADE")&&sub.includes(SUBOP_INSP))
    return {s:"aprovada",   label:"Aprovada — indo para estoque",      cor:"#2DBF7E",ico:"✅"};
  if(sai&&proc.includes("ADMINISTRATIVO")&&sub.includes(SUBOP_ELAB))
    return {s:"aguardando", label:"Aguardando primeiro operador",      cor:"#F5A623",ico:"⏳"};
  if(ent)
    return {s:"em_producao",label:"Em processo",cor:COR[proc]||"#3B7FFF",ico:"⚙️"};
  if(sai)
    return {s:"liberada",   label:"Entre processos",                   cor:"#A8B2C8",ico:"➡️"};
  return {s:"?",label:"Desconhecido",cor:"#6E7A92",ico:"❓"};
}

function esc(s){ return String(s||"").replace(/'/g,"\\'"); }

// Escape para conteúdo/atributo HTML (diferente de esc(), que só serve para strings dentro de onclick='...')
function escHtml(s){
  return String(s||"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function getTipo(row){
  const cf = String(row.classificacao_fiscal||"").trim().toLowerCase();
  if(cf.includes("vend"))   return {label:"V", full:"Vendas",          cor:"#3B7FFF", bg:"rgba(59,127,255,0.15)"};
  if(cf.includes("indust")) return {label:"I", full:"Industrialização", cor:"#F5A623", bg:"rgba(245,166,35,0.15)"};
  const rs = String(row.razao_social||"").trim().toLowerCase();
  if(rs.includes("brasmat")) return {label:"V", full:"Vendas",          cor:"#3B7FFF", bg:"rgba(59,127,255,0.15)"};
  if(rs.includes("mota"))    return {label:"I", full:"Industrialização", cor:"#F5A623", bg:"rgba(245,166,35,0.15)"};
  return null;
}

function renderTipoBadge(row){
  const t = getTipo(row);
  if(!t) return "";
  return `<span style="font-size:10px;font-family:var(--mono);font-weight:600;padding:2px 8px;border-radius:6px;background:${t.bg};color:${t.cor};border:1px solid ${t.cor}44">${t.label} · ${t.full}</span>`;
}

// Busca anexos (desenho/roteiro) cadastrados na Demanda do Cliente para esta peça
async function buscarAnexosDemanda(pedido, codigo){
  const c = encodeURIComponent(codigo||"");
  const ped = pedido ? `&pedido=eq.${encodeURIComponent(pedido)}` : "";
  try{
    const rows = await supaFetch(`/rest/v1/demanda_itens?select=desenho_url,fluxo_url&codigo_peca=eq.${c}${ped}&order=id.desc`);
    if(Array.isArray(rows)){
      for(const r of rows){ if(r.desenho_url||r.fluxo_url) return {desenho_url:r.desenho_url||null, fluxo_url:r.fluxo_url||null}; }
    }
  }catch(e){}
  return {desenho_url:null, fluxo_url:null};
}

// Renderiza os ícones de anexo (só aparecem quando existe o arquivo)
function renderAnexosIcons(a){
  if(!a || (!a.desenho_url && !a.fluxo_url)) return "";
  const base = "display:inline-flex;align-items:center;gap:5px;font-size:11px;font-family:var(--mono);padding:4px 10px;border-radius:6px;text-decoration:none";
  let h = '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">';
  if(a.desenho_url) h += `<a href="${a.desenho_url}" target="_blank" rel="noopener" title="Abrir desenho (PDF)" style="${base};background:rgba(59,127,255,0.12);color:var(--accent);border:1px solid rgba(59,127,255,0.3)">📐 Desenho</a>`;
  if(a.fluxo_url)   h += `<a href="${a.fluxo_url}" target="_blank" rel="noopener" title="Abrir roteiro (PDF)" style="${base};background:rgba(45,191,126,0.12);color:var(--ok);border:1px solid rgba(45,191,126,0.3)">📋 Roteiro</a>`;
  h += '</div>';
  return h;
}

function calcProgresso(eventos){
  const ultimo = eventos[eventos.length-1];
  const total  = parseInt(ultimo.quantidade_operacoes)||0;
  const cur    = parseInt(ultimo.sequencial_operacao)||0;
  if(!total||!cur) return null;
  return {pct:Math.min(100,Math.round(cur/total*100)), cur, max:total};
}

function calcProgressoRow(row){
  const total = parseInt(row.quantidade_operacoes)||0;
  const cur   = parseInt(row.sequencial_operacao)||0;
  if(!total||!cur) return null;
  return {pct:Math.min(100,Math.round(cur/total*100)), cur, max:total};
}

function renderProgresso(prog){
  if(!prog) return "";
  const cor = prog.pct>=80?"var(--ok)":prog.pct>=40?"var(--accent)":"var(--warn)";
  return `<div style="margin:10px 0 14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
      <span style="font-size:10px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;letter-spacing:0.07em">Progresso da Peça</span>
      <span style="font-size:11px;font-family:var(--mono);font-weight:500;color:${cor}">${prog.pct}% · op. ${prog.cur}/${prog.max}</span>
    </div>
    <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden">
      <div style="height:100%;width:${prog.pct}%;background:${cor};border-radius:3px;transition:width 0.4s ease"></div>
    </div>
  </div>`;
}

// Renderiza painel de detalhe de uma peça (compartilhado por todas as telas)
async function abrirPainelDetalhe(pedido, codigo, panelId, titleId, bodyId){
  const panel = document.getElementById(panelId);
  const title = document.getElementById(titleId);
  const body  = document.getElementById(bodyId);
  panel.classList.add("open");
  title.innerHTML = `<div style="font-size:15px;font-weight:500;color:var(--text);font-family:var(--mono)">${codigo}</div><div style="font-size:12px;color:var(--text2);font-family:var(--mono);margin-top:2px">Pedido: ${pedido}</div>`;
  body.innerHTML  = `<div class="loading"><div class="spinner"></div>carregando...</div>`;

  const eventos = await buscarHistorico(pedido, codigo);
  if(!eventos.length){ body.innerHTML="<p style='color:var(--text3);font-size:13px;padding:16px'>Sem eventos.</p>"; return; }

  const ultimo = eventos[eventos.length-1];
  const st     = status(ultimo);
  const dias   = diasDesde(ultimo);
  const dc     = diasCls(dias);
  const ret    = eventos.filter(r=>String(r.retrabalho||"").trim()).length;
  const prog   = calcProgresso(eventos);
  const anexos = await buscarAnexosDemanda(pedido, codigo);
  const prazo  = ultimo.prazo_entrega||"—";
  const prazoD = prazo!=="—"?new Date(prazo):null;
  const prazoFmtBR = prazoD ? prazoD.toLocaleDateString("pt-BR") : "—";
  const prazoOk= prazoD?(prazoD>new Date()?`<span style="color:var(--ok)">✓</span>`:`<span style="color:var(--danger)">⚠</span>`):"";
  const prazoCor = prazoD&&prazoD<new Date() ? "var(--danger)" : "var(--text2)";

  // Atualiza o título para incluir prazo no cabeçalho fixo
  title.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div style="font-size:15px;font-weight:500;color:var(--text);font-family:var(--mono)">${codigo}</div>
        ${renderTipoBadge(ultimo)}
      </div>
      <div style="font-size:12px;color:var(--text2);font-family:var(--mono);margin-top:2px">Pedido: ${pedido}${ultimo.os&&String(ultimo.os).trim()?' · OS: '+String(ultimo.os).trim():''}</div>
      ${renderAnexosIcons(anexos)}
    </div>
    <div style="text-align:center;padding:0 12px">
      <div style="font-size:10px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px">Prazo</div>
      <div style="font-size:13px;font-weight:500;color:${prazoCor};font-family:var(--mono)">${prazoFmtBR} ${prazoOk}</div>
    </div>`;

  const tl = eventos.map((ev,i)=>{
    const isUlt = i===eventos.length-1;
    const evtS  = String(ev.evento||"").trim().toUpperCase();
    const isEnt = evtS==="ENTRADA";
    const dot   = isUlt&&isEnt?"atual":isEnt?"entrada":"saida";
    const sub   = getSubop(ev);
    let dur="";
    if(!isEnt&&i>0){
      const ant=eventos[i-1];
      if(ant&&String(ant.evento||"").trim().toUpperCase()==="ENTRADA"){
        const ms=new Date(ev.data_evento)-new Date(ant.data_evento);
        if(ms>0){const h=Math.floor(ms/3600000);const d=Math.floor(h/24);dur=`<span style="font-size:10px;font-family:var(--mono);padding:2px 7px;border-radius:6px;background:var(--bg3);color:var(--text2)">${d>0?d+"d ":""}${h%24}h</span>`;}
      }
    }

    // Cor da data — vermelho se o evento aconteceu depois do prazo de entrega
    const prazoRef = eventos.find(e=>e.prazo_entrega&&String(e.prazo_entrega).trim());
    const prazoDate = prazoRef ? new Date(prazoRef.prazo_entrega) : null;
    const evDate = ev.data_evento ? new Date(ev.data_evento) : null;
    const dataVencida = prazoDate && evDate && evDate > prazoDate;
    const dataCor = dataVencida ? "var(--danger)" : "var(--text3)";
    const dataIco = dataVencida ? "⚠" : "📅";

    return `<li class="tl-item">
      <div class="tl-dot ${dot}"></div>
      <div class="tl-card${isUlt&&isEnt?" atual":""}">
        <div class="tl-top">
          <span class="tl-proc">${ev.processo||"—"}</span>
          <span class="tl-evt ${isEnt?"ent":"sai"}">${evtS}</span>
          ${isUlt?`<span class="tl-tag">${st.ico} ${st.label}</span>`:""}
          ${ev.retrabalho&&String(ev.retrabalho).trim()?`<span class="tl-ret">retrabalho</span>`:""}
          ${dataVencida?`<span style="font-size:10px;padding:1px 7px;border-radius:8px;background:rgba(240,69,69,0.12);color:var(--danger)">fora do prazo</span>`:""}
        </div>
        <div class="tl-sub">${sub}</div>
        <div class="tl-foot">
          <span class="tl-m">👤 ${ev.operador||"—"}</span>
          <span style="font-size:11px;font-family:var(--mono);color:${dataCor}">${dataIco} ${fmtDt(ev.data_evento)}</span>
          ${ev.sequencial_operacao?`<span class="tl-m">op. ${ev.sequencial_operacao}</span>`:""}
          ${ev.quantidade_produzida&&String(ev.quantidade_produzida).trim()?`<span style="font-size:11px;font-family:var(--mono);color:var(--ok);background:rgba(45,191,126,0.1);padding:1px 7px;border-radius:6px">📦 ${ev.quantidade_produzida} pç</span>`:""}
          ${dur}
        </div>
        ${ev.observacao&&String(ev.observacao).trim()?`<div class="tl-obs">${ev.observacao}</div>`:""}
      </div>
    </li>`;
  }).join("");

  body.innerHTML=`
    ${renderProgresso(prog)}
    <div class="mgrid">
      <div class="mb"><div class="ml">cliente</div><div class="mv">${ultimo.cliente||"—"}</div></div>
      <div class="mb"><div class="ml">eventos</div><div class="mv">${eventos.length}</div></div>
      <div class="mb"><div class="ml">retrabalhos</div><div class="mv" style="color:${ret>0?"var(--danger)":"var(--ok)"}">${ret}</div></div>
      <div class="mb"><div class="ml">operador atual</div><div class="mv">${ultimo.operador?String(ultimo.operador).replace(/^\d+_/,""):"—"}</div></div>
    </div>
    ${st.s==="em_producao"?`
    <div class="pos-card">
      <div style="width:4px;height:40px;border-radius:2px;background:${COR[String(ultimo.processo||"").trim().toUpperCase()]||"#6E7A92"};flex-shrink:0"></div>
      <div style="flex:1"><div class="ml">posição atual</div><div style="font-size:14px;font-weight:500;color:var(--text)">${ultimo.processo||"—"}</div><div style="font-size:11px;color:var(--text2);margin-top:2px">${getSubop(ultimo)}</div></div>
      <div style="text-align:right"><div style="font-size:16px;font-weight:500;font-family:var(--mono);color:var(--${dc})">${diasStr(dias)}</div><div class="ml">neste setor</div></div>
    </div>`:""}
    <div class="tl-lbl">linha do tempo</div>
    <ul class="timeline">${tl}</ul>`;
}
