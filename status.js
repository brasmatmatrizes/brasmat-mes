// ============================================================
// STATUS.JS — Lógica central BRASMAT MES
// ============================================================

const SUPA_URL = "https://hjvlznijsgdwurtsyukl.supabase.co";
const SUPA_KEY = "sb_publishable_3N0kbWDpJ542n_aWeFzUqQ_pmVGrFiB";

const SUBOP_ELAB  = "11.3";
const SUBOP_ALMO  = "11.4";
const SUBOP_INSP  = "10.2"; // inspeção final
const SUBOP_INSP_PROC = "10.1"; // inspeção de processo

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

// Colunas pedidas de posicao_atual. Explícitas em vez de select=*: as 13 colunas
// operacao_* estão fora porque a view já entrega o mesmo valor resolvido em
// `suboperacao` (só uma delas tem valor por linha, as outras 12 vêm sempre vazias —
// e em JSON o nome de cada coluna se repete em TODA linha). Corta o payload de
// 963 kB para ~496 kB por chamada, sem perder informação nenhuma.
const POS_COLS = "id,pedido,codigo_peca,cliente,processo,operador,evento,data_evento,prazo_entrega,retrabalho,os,quantidade_solicitada,suboperacao";

// Busca posição atual via view (rápido — um registro por peça)
// Pagina em blocos de 1000: o Supabase limita toda resposta REST a 1000 linhas
// por padrão (db-max-rows), então um só fetch com limit=10000 é truncado em silêncio
// assim que a view passar de 1000 peças.
async function buscarPosicao(){
  let all = [], offset = 0;
  const pageSize = 1000;
  while(true){
    const r = await supaFetch(`/rest/v1/posicao_atual?select=${POS_COLS}&order=id.asc&limit=${pageSize}&offset=${offset}`);
    const page = Array.isArray(r) ? r : [];
    all = all.concat(page);
    if(page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

// Busca histórico completo de UMA peça (chamado só ao abrir detalhe)
// Histórico de UMA peça (linha do tempo). Lê a view `historico_peca`, não a tabela:
// ela já descarta os apontamentos duplicados no servidor (11.934 registros gravados 2x
// pelo script do Forms antes da correção de 03/07/2026 — a peça CF117110/2604315-1
// baixava 138 eventos sendo 82 reais) e entrega só as 18 colunas que a linha do tempo
// usa, com `suboperacao` já resolvida. Medido: 128 kB -> 39 kB nessa peça.
// Os registros originais continuam intactos em producao_eventos.
async function buscarHistorico(pedido, codigo){
  const p = encodeURIComponent(pedido);
  const c = encodeURIComponent(codigo);
  const r = await supaFetch(
    `/rest/v1/historico_peca?select=*&pedido=eq.${p}&codigo_peca=eq.${c}&order=id.asc`
  );
  return Array.isArray(r) ? r : [];
}

// ---- HELPERS ----
function getSubop(row){
  if(!row) return "—";
  // Linhas de posicao_atual já vêm resolvidas na coluna calculada da view. Linhas de
  // producao_eventos (histórico, painel de detalhe, apontamentos) não têm essa coluna —
  // para elas as 13 colunas originais continuam sendo o caminho. Também serve de rede:
  // se a view voltasse ao formato antigo, isto segue funcionando sem nenhuma alteração.
  if(row.suboperacao !== undefined) return String(row.suboperacao||"").trim() || "—";
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

// Busca anexos (desenho/roteiro) e presença na Demanda do Cliente para esta peça
async function buscarAnexosDemanda(pedido, codigo){
  const c = encodeURIComponent(codigo||"");
  const ped = pedido ? `&pedido=eq.${encodeURIComponent(pedido)}` : "";
  let res = {desenho_url:null, fluxo_url:null, emDemanda:false, cliente:null};
  try{
    const rows = await supaFetch(`/rest/v1/demanda_itens?select=cliente,desenho_url,fluxo_url&codigo_peca=eq.${c}${ped}&order=id.desc`);
    if(Array.isArray(rows) && rows.length){
      const comUrl = rows.find(r=>r.desenho_url||r.fluxo_url);
      res = {
        desenho_url: comUrl ? (comUrl.desenho_url||null) : null,
        fluxo_url:   comUrl ? (comUrl.fluxo_url||null)   : null,
        emDemanda: true,
        cliente: rows[0].cliente || null
      };
    }
  }catch(e){}
  // Fallback: desenho anexado no Cadastro Item (itens.desenho_url) quando a Demanda não tem um próprio.
  // É o mesmo 📐 Desenho (não cria ícone novo) — a Demanda tem prioridade quando também anexou.
  if(!res.desenho_url){
    try{
      const it = await supaFetch(`/rest/v1/itens?select=desenho_url&codigo_peca=eq.${c}${ped}&order=id.desc&limit=1`);
      if(Array.isArray(it) && it[0] && it[0].desenho_url) res.desenho_url = it[0].desenho_url;
    }catch(e){}
  }
  return res;
}

// Renderiza os ícones de anexo (só aparecem quando existe o arquivo) e o atalho para a Demanda Cliente.
// temRoteiroMes: quando a peça tem roteiro cadastrado no MES (Engenharia), mostra o botão de consulta
// na tela (modelo novo, sem PDF) — coexiste com o 📋 Roteiro do PDF anexado na Demanda.
function renderAnexosIcons(a, pedido, codigo, temRoteiroMes){
  if(!a || (!a.desenho_url && !a.fluxo_url && !a.emDemanda && !temRoteiroMes)) return "";
  const base = "display:inline-flex;align-items:center;gap:5px;font-size:11px;font-family:var(--mono);padding:4px 10px;border-radius:6px;text-decoration:none";
  let h = '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">';
  if(a.desenho_url) h += `<a href="${a.desenho_url}" target="_blank" rel="noopener" title="Abrir desenho (PDF)" style="${base};background:rgba(59,127,255,0.12);color:var(--accent);border:1px solid rgba(59,127,255,0.3)">📐 Desenho</a>`;
  if(temRoteiroMes) h += `<button onclick="abrirConsultaRoteiro('${String(pedido||"").replace(/'/g,"\\'")}','${String(codigo||"").replace(/'/g,"\\'")}')" title="Ver roteiro cadastrado no MES" style="${base};background:rgba(45,191,126,0.12);color:var(--ok);border:1px solid rgba(45,191,126,0.3);cursor:pointer">📋 Roteiro (MES)</button>`;
  if(a.fluxo_url)   h += `<a href="${a.fluxo_url}" target="_blank" rel="noopener" title="Abrir roteiro (PDF)" style="${base};background:rgba(45,191,126,0.12);color:var(--ok);border:1px solid rgba(45,191,126,0.3)">📋 Roteiro (PDF)</a>`;
  if(a.emDemanda){
    const url = `demanda.html?cliente=${encodeURIComponent(a.cliente||"")}&codigo=${encodeURIComponent(codigo||"")}&pedido=${encodeURIComponent(pedido||"")}`;
    h += `<a href="${url}" title="Ver na Demanda Cliente" style="${base};background:rgba(155,93,229,0.12);color:#9B5DE5;border:1px solid rgba(155,93,229,0.3)">🔔 Em Demanda</a>`;
  }
  h += '</div>';
  return h;
}

// Total de operações do roteiro cadastrado (Engenharia) — 0 se a peça não tem roteiro
async function buscarTotalRoteiro(pedido, codigo){
  try{
    const p = encodeURIComponent(pedido||""), c = encodeURIComponent(codigo||"");
    const r = await supaFetch(`/rest/v1/roteiros?select=roteiro_itens(count)&pedido=eq.${p}&codigo_peca=eq.${c}&limit=1`);
    if(Array.isArray(r)&&r[0]&&r[0].roteiro_itens&&r[0].roteiro_itens[0]) return parseInt(r[0].roteiro_itens[0].count)||0;
  }catch(e){}
  return 0;
}

// ---- Consulta do roteiro cadastrado no MES (roteiros + roteiro_itens) ----
// Modelo novo, alternativo ao PDF anexado na Demanda: quando a peça tem roteiro na Engenharia,
// a sequência de operações é mostrada direto na tela (sem PDF). Se não tem roteiro no MES,
// segue valendo o PDF (fluxo) anexado na Demanda como hoje. Lookup por pedido+código.
async function buscarRoteiroMes(pedido, codigo){
  try{
    const p = encodeURIComponent(pedido||""), c = encodeURIComponent(codigo||"");
    const r = await supaFetch(`/rest/v1/roteiros?select=*,roteiro_itens(*)&pedido=eq.${p}&codigo_peca=eq.${c}&limit=1`);
    if(Array.isArray(r) && r[0] && Array.isArray(r[0].roteiro_itens) && r[0].roteiro_itens.length){
      const itens = r[0].roteiro_itens.slice().sort((a,b)=>(parseInt(a.sequencia)||0)-(parseInt(b.sequencia)||0));
      return { header:r[0], itens };
    }
  }catch(e){}
  return null;
}

function linhaConsultaRoteiro(it){
  return `<tr style="border-bottom:1px solid var(--border)">
    <td style="text-align:center;padding:8px 6px;font-family:var(--mono)">${it.sequencia}ª</td>
    <td style="text-align:center;padding:8px 6px;font-family:var(--mono);color:var(--text2)">${escHtml(it.operacao_codigo||"")}</td>
    <td style="padding:8px 6px">${escHtml(it.operacao_descricao||"")}</td>
    <td style="padding:8px 6px;color:var(--text2)">${escHtml(it.observacao||"")}</td>
  </tr>`;
}

function renderConsultaRoteiroHTML(h, itens){
  const tipo = getTipo(h);
  const tipoBadge = tipo ? `<span style="font-size:10px;font-family:var(--mono);font-weight:600;padding:2px 8px;border-radius:6px;background:${tipo.bg};color:${tipo.cor};border:1px solid ${tipo.cor}44">${tipo.label} · ${tipo.full}</span>` : "";
  const prazo = h.prazo_entrega ? new Date(h.prazo_entrega).toLocaleDateString("pt-BR") : "—";
  const meta = [
    h.pedido?`Pedido: <span style="color:var(--text)">${escHtml(String(h.pedido))}</span>`:"",
    h.os?`OS: <span style="color:var(--text)">${escHtml(String(h.os))}</span>`:"",
    h.quantidade?`Qtd: <span style="color:var(--text)">${escHtml(String(h.quantidade))} pç</span>`:"",
    h.cliente?`Cliente: <span style="color:var(--text)">${escHtml(String(h.cliente))}</span>`:"",
    `Prazo: <span style="color:var(--text)">${prazo}</span>`
  ].filter(Boolean).join(" · ");
  // agrupa por subcomponente adjacente (mesmo critério do impresso da Engenharia)
  const temSub = itens.some(it=>String(it.subcomponente||"").trim());
  let rows = "";
  if(temSub){
    const grupos = [];
    itens.forEach(it=>{
      const s = String(it.subcomponente||"").trim()||"—";
      let g = grupos.length && grupos[grupos.length-1].nome===s ? grupos[grupos.length-1] : null;
      if(!g){ g={nome:s,itens:[]}; grupos.push(g); }
      g.itens.push(it);
    });
    grupos.forEach(g=>{
      rows += `<tr><td colspan="4" style="padding:11px 8px 5px;font-size:10px;font-weight:700;letter-spacing:.05em;color:var(--accent);text-transform:uppercase;border-bottom:1px solid var(--border)">▸ ${escHtml(g.nome)}</td></tr>`;
      g.itens.forEach(it=>rows+=linhaConsultaRoteiro(it));
    });
  }else{
    itens.forEach(it=>rows+=linhaConsultaRoteiro(it));
  }
  const engLink = `engenharia.html?pedido=${encodeURIComponent(h.pedido||"")}&codigo=${encodeURIComponent(h.codigo_peca||"")}`;
  return `
    <div style="padding:16px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-family:var(--mono);font-size:15px;font-weight:600;color:var(--text)">${escHtml(h.codigo_peca||"")}</span>
      ${tipoBadge}
      <span style="margin-left:auto;font-size:11px;font-family:var(--mono);color:var(--ok);background:rgba(45,191,126,0.12);padding:3px 9px;border-radius:6px">📋 Roteiro no MES · ${itens.length} ${itens.length===1?"operação":"operações"}</span>
      <button onclick="document.getElementById('consultaRoteiroOv').style.display='none'" title="Fechar" style="background:none;border:1px solid var(--border);color:var(--text2);width:28px;height:28px;border-radius:7px;cursor:pointer;font-size:14px">✕</button>
    </div>
    <div style="padding:11px 18px;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:11px;color:var(--text3);line-height:1.9">${meta}</div>
    <div style="padding:6px 18px 14px;max-height:60vh;overflow:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px;color:var(--text)">
        <thead><tr style="color:var(--text3);font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.06em">
          <th style="text-align:center;padding:9px 6px;width:44px">Seq</th>
          <th style="text-align:center;padding:9px 6px;width:46px">Cód</th>
          <th style="text-align:left;padding:9px 6px">Processo</th>
          <th style="text-align:left;padding:9px 6px;width:34%">Observações</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:14px">
        <a href="${engLink}" style="font-size:11px;font-family:var(--mono);color:var(--text2);border:1px solid var(--border);padding:6px 12px;border-radius:7px;text-decoration:none">✎ abrir na Engenharia</a>
      </div>
    </div>`;
}

// Abre o modal de consulta do roteiro do MES (compartilhado por todas as telas). Cria o overlay
// sob demanda (não precisa existir no HTML de cada página); busca o roteiro ao abrir.
async function abrirConsultaRoteiro(pedido, codigo){
  let ov = document.getElementById("consultaRoteiroOv");
  if(!ov){
    ov = document.createElement("div");
    ov.id = "consultaRoteiroOv";
    ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:36px 16px;overflow:auto";
    ov.addEventListener("click", e=>{ if(e.target===ov) ov.style.display="none"; });
    document.body.appendChild(ov);
  }
  const card = html=>`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;max-width:660px;width:100%;overflow:hidden">${html}</div>`;
  ov.style.display = "flex";
  ov.innerHTML = card(`<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">carregando roteiro...</div>`);
  const r = await buscarRoteiroMes(pedido, codigo);
  if(!r){
    ov.innerHTML = card(`<div style="padding:32px;text-align:center;color:var(--text3);font-size:13px">Sem roteiro cadastrado no MES para esta peça.<div style="margin-top:14px"><button onclick="document.getElementById('consultaRoteiroOv').style.display='none'" style="background:none;border:1px solid var(--border);color:var(--text2);padding:6px 16px;border-radius:7px;cursor:pointer">fechar</button></div></div>`);
    return;
  }
  ov.innerHTML = card(renderConsultaRoteiroHTML(r.header, r.itens));
}

// Resumo dos lotes de um item na Separação de Material. Cada componente (material_lote_componentes)
// já É um lote — uma posição (núcleo/carcaça/luva) com sua própria quantidade e numeração, independente
// das outras posições do mesmo item (núcleo pode ter 2 lotes enquanto a carcaça tem só 1, por ex.).
// "completo" = todo componente do item chegou em Pronto — não existe mais pareamento núcleo↔carcaça↔luva.
// Recebe os arrays já carregados pela página chamadora (sem fetch próprio).
function materialResumoItem(itemId, dados){
  const comps = (dados.componentes||[]).filter(c=>c.item_id===itemId);
  if(!comps.length) return null;
  const maxOrdem = Math.max(...(dados.estagios||[]).map(e=>e.ordem), 0);
  const ordemDoComponente = compId=>{
    const u = (dados.ultimos||[]).find(x=>x.componente_id===compId);
    return u ? u.estagio_ordem : 0;
  };
  const detalhe = comps.map(c=>({
    id: c.id, posicao: c.posicao, numero: c.lote_numero, quantidade: c.quantidade,
    completo: ordemDoComponente(c.id) >= maxOrdem
  })).sort((a,b)=> a.posicao===b.posicao ? a.numero-b.numero : a.posicao.localeCompare(b.posicao));
  const prontos = detalhe.filter(d=>d.completo).length;
  const algumComponentePronto = prontos > 0;
  return { total: detalhe.length, prontos, completo: prontos===detalhe.length, algumComponentePronto, detalhe };
}

// Regra: um item dispensa a Separação de Material (não precisa de lote Pronto pra
// liberar o roteiro) quando é ferramenta interna OU quando é de Industrialização —
// nesse caso o material vem do cliente e já está em mãos, não passa pelo PCP.
function itemDispensaSeparacao(item){
  if(!item) return false;
  if(item.ferramenta_interna) return true;
  const t = getTipo(item);
  return !!(t && t.label === "I");
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
  let prog     = calcProgresso(eventos);
  // Se a peça tem roteiro cadastrado (Engenharia), o total de operações vem do roteiro
  const rotTotal = await buscarTotalRoteiro(pedido, codigo);
  if(rotTotal>0){
    const curOp = parseInt(ultimo.sequencial_operacao)||0;
    if(curOp) prog = {pct:Math.min(100,Math.round(curOp/rotTotal*100)), cur:curOp, max:rotTotal};
  }
  const anexos = await buscarAnexosDemanda(pedido, codigo);
  const prazo  = ultimo.prazo_entrega||"—";
  const prazoD = prazo!=="—"?new Date(prazo):null;
  const prazoFmtBR = prazoD ? prazoD.toLocaleDateString("pt-BR") : "—";
  const prazoOk= prazoD?(prazoD>new Date()?`<span style="color:var(--ok)">✓</span>`:`<span style="color:var(--danger)">⚠</span>`):"";
  const prazoCor = prazoD&&prazoD<new Date() ? "var(--danger)" : "var(--text2)";
  const qtdSol = ultimo.quantidade_solicitada&&String(ultimo.quantidade_solicitada).trim() ? String(ultimo.quantidade_solicitada).trim()+" pç" : "—";

  // Atualiza o título para incluir prazo e quantidade solicitada no cabeçalho fixo
  title.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div style="font-size:15px;font-weight:500;color:var(--text);font-family:var(--mono)">${codigo}</div>
        ${renderTipoBadge(ultimo)}
      </div>
      <div style="font-size:12px;color:var(--text2);font-family:var(--mono);margin-top:2px">Pedido: ${pedido}${ultimo.os&&String(ultimo.os).trim()?' · OS: '+String(ultimo.os).trim():''}</div>
      ${renderAnexosIcons(anexos, pedido, codigo, rotTotal>0)}
    </div>
    <div style="display:flex;gap:8px;flex-shrink:0">
      <div style="text-align:center;padding:0 12px">
        <div style="font-size:10px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px">Qtd. solicitada</div>
        <div style="font-size:13px;font-weight:500;color:var(--text);font-family:var(--mono)">${qtdSol}</div>
      </div>
      <div style="text-align:center;padding:0 12px">
        <div style="font-size:10px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px">Prazo</div>
        <div style="font-size:13px;font-weight:500;color:${prazoCor};font-family:var(--mono)">${prazoFmtBR} ${prazoOk}</div>
      </div>
    </div>`;

  // Conteúdo do card de um evento — usado tanto na linha do tempo quanto no resumo fixo do último evento
  function renderTlCard(ev, i, isUlt){
    const evtS  = String(ev.evento||"").trim().toUpperCase();
    const isEnt = evtS==="ENTRADA";
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

    return `<div class="tl-card${isUlt&&isEnt?" atual":""}">
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
      </div>`;
  }

  const tl = eventos.map((ev,i)=>{
    const isUlt = i===eventos.length-1;
    const isEnt = String(ev.evento||"").trim().toUpperCase()==="ENTRADA";
    const dot   = isUlt&&isEnt?"atual":isEnt?"entrada":"saida";
    return `<li class="tl-item">
      <div class="tl-dot ${dot}"></div>
      ${renderTlCard(ev, i, isUlt)}
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
    <div class="tl-lbl">última operação registrada</div>
    ${renderTlCard(ultimo, eventos.length-1, true)}
    <div class="tl-lbl">linha do tempo</div>
    <ul class="timeline">${tl}</ul>`;
}

document.querySelectorAll(".nav-group > .nb-group").forEach(function(btn){
  btn.addEventListener("click", function(e){
    e.stopPropagation();
    var g = btn.parentElement;
    var wasOpen = g.classList.contains("open");
    document.querySelectorAll(".nav-group.open").forEach(function(o){ o.classList.remove("open"); });
    if(!wasOpen) g.classList.add("open");
  });
});
document.addEventListener("click", function(e){
  document.querySelectorAll(".nav-group.open").forEach(function(g){
    if(!g.contains(e.target)) g.classList.remove("open");
  });
});

// ============================================================
// EDIÇÃO DE APONTAMENTO (compartilhado: apontamentos.html + editar-apontamento.html)
// Corrige um apontamento errado direto no producao_eventos (a "raiz" que o MES lê;
// Forms/planilha não voltam atrás — ver CLAUDE.md). Toda edição:
//  - pede senha (guardada só como hash — não é cofre, é trava contra edição acidental);
//  - grava o antes/depois em apontamento_edicoes (rastro de auditoria).
// A página que chama define window.onApontamentoEditado = fn pra recarregar após salvar.
// ============================================================
const AP_EDIT_HASH = "de039caae34be4424263c71865d7bf45d5f4de4fbeb2b6fd1277c16331c52430";
const AP_EDIT_CAMPOS = [
  {campo:"operador",              label:"Operador",               tipo:"operador"},
  {campo:"evento",               label:"Evento",                 tipo:"select", opcoes:["Entrada","Saída","Em Análise"], aviso:"muda o status da peça"},
  {campo:"quantidade_produzida", label:"Qtd produzida",          tipo:"text"},
  {campo:"quantidade_solicitada",label:"Qtd solicitada",         tipo:"text"},
  {campo:"sequencial_operacao",  label:"Sequencial da operação", tipo:"text", aviso:"muda a barra de progresso"},
  {campo:"retrabalho",           label:"Retrabalho",             tipo:"select", opcoes:["","Retrabalho","Não Conforme"]},
  {campo:"data_evento",          label:"Data e hora",            tipo:"datetime"}
];
let _apEditRow = null;
let _apEditPendingId = null;
let _apEditBusy = false;
let _apOperadores = null;

async function supaSend(path, method, body, prefer){
  const r = await fetch(SUPA_URL + path, {
    method,
    headers:{ apikey:SUPA_KEY, Authorization:"Bearer "+SUPA_KEY, "Content-Type":"application/json", Prefer: prefer||"return=minimal" },
    body: body!==undefined ? JSON.stringify(body) : undefined
  });
  if(r.status===204) return null;
  const j = await r.json().catch(()=>null);
  if(!r.ok) throw new Error((j&&j.message)||("HTTP "+r.status));
  return j;
}
async function _sha256Hex(str){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function _nomeOp(raw){ return String(raw||"").replace(/^\d+_/,"").trim(); }
function _dtToInput(iso){
  if(!iso) return "";
  const d=new Date(iso); if(isNaN(d)) return "";
  const p=n=>String(n).padStart(2,"0");
  return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes());
}
async function _carregarOperadores(){
  if(_apOperadores) return _apOperadores;
  try{
    const rows = await supaFetch("/rest/v1/operadores_distintos?select=operador&limit=1000");
    const set = new Set();
    (Array.isArray(rows)?rows:[]).forEach(r=>{ const o=String(r.operador||"").trim(); if(o) set.add(o); });
    _apOperadores = [...set].sort((a,b)=>_nomeOp(a).localeCompare(_nomeOp(b),"pt-BR"));
  }catch(e){ _apOperadores = []; }
  return _apOperadores;
}

function _ensureEdicaoModal(){
  if(document.getElementById("apEdModal")) return;
  const st = document.createElement("style");
  st.textContent = `
  .aped-ov{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:none;align-items:center;justify-content:center;padding:16px}
  .aped-ov.show{display:flex}
  .aped-box{background:var(--bg2);border:1px solid var(--border);border-radius:14px;width:100%;max-width:460px;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5)}
  .aped-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--border)}
  .aped-title{font-size:15px;font-weight:500;color:var(--text)}
  .aped-x{background:transparent;border:none;color:var(--text3);font-size:18px;cursor:pointer;line-height:1}
  .aped-x:hover{color:var(--text)}
  .aped-ctx{padding:12px 18px;background:var(--bg3);font-size:12px;color:var(--text2);line-height:1.7;border-bottom:1px solid var(--border)}
  .aped-ctx b{color:var(--text);font-family:var(--mono)}
  .aped-body{padding:14px 18px;display:flex;flex-direction:column;gap:12px}
  .aped-f label{display:block;font-size:11px;color:var(--text3);margin-bottom:4px;font-family:var(--mono)}
  .aped-f .apav{color:var(--warn);font-size:10px;margin-left:6px}
  .aped-inp{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 11px;font-size:13px;color:var(--text);outline:none;font-family:var(--sans)}
  .aped-inp:focus{border-color:var(--accent)}
  .aped-foot{padding:14px 18px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:10px}
  .aped-err{font-size:12px;color:var(--danger);min-height:0}
  .aped-actions{display:flex;gap:8px;justify-content:flex-end}
  .aped-btn{background:transparent;border:1px solid var(--border);border-radius:8px;padding:8px 16px;font-size:13px;color:var(--text2);cursor:pointer;font-family:var(--sans)}
  .aped-btn:hover{border-color:var(--border2);color:var(--text)}
  .aped-btn-acc{background:var(--accent);border-color:var(--accent);color:#fff}
  .aped-btn-acc:hover{background:#1A4FCC}
  .aped-btn-acc:disabled{opacity:0.5;cursor:default}`;
  document.head.appendChild(st);
  const div = document.createElement("div");
  div.id = "apEdModal"; div.className = "aped-ov";
  div.innerHTML = `<div class="aped-box">
    <div class="aped-head"><div class="aped-title">✎ Editar apontamento</div><button class="aped-x" onclick="fecharEdicaoApontamento()">✕</button></div>
    <div id="apEdGate">
      <div class="aped-body">
        <div style="font-size:12px;color:var(--text2);line-height:1.6">🔒 Digite a senha para editar o apontamento.</div>
        <div class="aped-f"><label>Senha</label><input type="password" class="aped-inp" id="apEdSenha" autocomplete="off" onkeydown="if(event.key==='Enter')_desbloquearEdicaoApontamento()"></div>
        <div class="aped-err" id="apEdGateErr"></div>
      </div>
      <div class="aped-foot">
        <div class="aped-actions">
          <button class="aped-btn" onclick="fecharEdicaoApontamento()">Cancelar</button>
          <button class="aped-btn aped-btn-acc" onclick="_desbloquearEdicaoApontamento()">Continuar</button>
        </div>
      </div>
    </div>
    <div id="apEdEdit" style="display:none">
      <div class="aped-ctx" id="apEdCtx"></div>
      <div class="aped-body" id="apEdBody"></div>
      <div class="aped-foot">
        <div class="aped-err" id="apEdErr"></div>
        <div class="aped-actions">
          <button class="aped-btn" onclick="fecharEdicaoApontamento()">Cancelar</button>
          <button class="aped-btn aped-btn-acc" id="apEdSalvar" onclick="_salvarEdicaoApontamento()">Salvar edição</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(div);
  div.addEventListener("click", e=>{ if(e.target===div) fecharEdicaoApontamento(); });
}
function _apEdErr(msg){ const e=document.getElementById("apEdErr"); if(e) e.textContent=msg||""; }
function fecharEdicaoApontamento(){ const m=document.getElementById("apEdModal"); if(m) m.classList.remove("show"); }

// Passo 1: clicar no ✎ abre só a tela de senha (não carrega/mostra os campos ainda).
function abrirEdicaoApontamento(id){
  _ensureEdicaoModal();
  _apEditRow = null;
  _apEditPendingId = id;
  document.getElementById("apEdSenha").value = "";
  const ge = document.getElementById("apEdGateErr"); if(ge) ge.textContent = "";
  document.getElementById("apEdGate").style.display = "";
  document.getElementById("apEdEdit").style.display = "none";
  document.getElementById("apEdModal").classList.add("show");
  const inp = document.getElementById("apEdSenha"); if(inp) setTimeout(()=>inp.focus(), 30);
}

// Passo 2: senha correta → mostra os campos e carrega o apontamento.
async function _desbloquearEdicaoApontamento(){
  const senha = document.getElementById("apEdSenha").value;
  const ge = document.getElementById("apEdGateErr");
  if(!senha){ if(ge) ge.textContent = "Digite a senha."; return; }
  if(await _sha256Hex(senha) !== AP_EDIT_HASH){ if(ge) ge.textContent = "Senha incorreta."; return; }
  document.getElementById("apEdGate").style.display = "none";
  document.getElementById("apEdEdit").style.display = "";
  await _carregarFormEdicao(_apEditPendingId);
}

async function _carregarFormEdicao(id){
  document.getElementById("apEdCtx").innerHTML = "";
  document.getElementById("apEdBody").innerHTML = `<div style="color:var(--text3);font-size:12px;padding:8px 0">carregando…</div>`;
  _apEdErr("");
  let row, ops;
  try{
    [row, ops] = await Promise.all([
      supaFetch(`/rest/v1/producao_eventos?id=eq.${encodeURIComponent(id)}&select=*`),
      _carregarOperadores()
    ]);
  }catch(e){ document.getElementById("apEdBody").innerHTML = `<div style="color:var(--danger);font-size:12px">Erro ao carregar: ${escHtml(e.message)}</div>`; return; }
  row = Array.isArray(row) ? row[0] : null;
  if(!row){ document.getElementById("apEdBody").innerHTML = `<div style="color:var(--danger);font-size:12px">Apontamento não encontrado.</div>`; return; }
  _apEditRow = row;
  document.getElementById("apEdCtx").innerHTML =
    `<b>${escHtml(row.codigo_peca||"—")}</b> · pedido ${escHtml(row.pedido||"—")} · OS ${escHtml(row.os||"—")}<br>`+
    `${escHtml(String(row.processo||"").trim()||"—")} · ${escHtml(getSubop(row))}`;
  document.getElementById("apEdBody").innerHTML = AP_EDIT_CAMPOS.map(f=>{
    const cur = f.campo==="data_evento" ? _dtToInput(row.data_evento) : (row[f.campo]==null?"":String(row[f.campo]));
    const aviso = f.aviso ? `<span class="apav">⚠ ${escHtml(f.aviso)}</span>` : "";
    let input;
    if(f.tipo==="operador"){
      const opts = (ops||[]).map(o=>`<option value="${escHtml(o)}"${o===cur?" selected":""}>${escHtml(_nomeOp(o))}</option>`).join("");
      input = `<select class="aped-inp" data-campo="${f.campo}">${opts}</select>`;
    }else if(f.tipo==="select"){
      const opts = f.opcoes.map(o=>`<option value="${escHtml(o)}"${o===cur?" selected":""}>${escHtml(o||"—")}</option>`).join("");
      input = `<select class="aped-inp" data-campo="${f.campo}">${opts}</select>`;
    }else if(f.tipo==="datetime"){
      input = `<input type="datetime-local" class="aped-inp" data-campo="${f.campo}" value="${escHtml(cur)}">`;
    }else{
      input = `<input type="text" class="aped-inp" data-campo="${f.campo}" value="${escHtml(cur)}">`;
    }
    return `<div class="aped-f"><label>${escHtml(f.label)}${aviso}</label>${input}</div>`;
  }).join("") +
    `<div class="aped-f"><label>Seu nome (opcional — fica no histórico)</label><input type="text" class="aped-inp" id="apEdPor" autocomplete="off"></div>`+
    `<div class="aped-f"><label>Motivo da correção (opcional)</label><input type="text" class="aped-inp" id="apEdMotivo" autocomplete="off"></div>`;
}

async function _salvarEdicaoApontamento(){
  if(!_apEditRow || _apEditBusy) return;
  // senha já validada no passo 1 (_desbloquearEdicaoApontamento)
  // monta o diff só com o que mudou
  const patch = {}, campos = {};
  document.querySelectorAll("#apEdBody [data-campo]").forEach(el=>{
    const f = AP_EDIT_CAMPOS.find(x=>x.campo===el.getAttribute("data-campo"));
    const novo = el.value;
    if(f.campo==="data_evento"){
      const orig = _dtToInput(_apEditRow.data_evento);
      if(novo && novo!==orig){ patch.data_evento = new Date(novo).toISOString(); campos.data_evento = {de:fmtDt(_apEditRow.data_evento), para:fmtDt(patch.data_evento)}; }
    }else{
      const orig = _apEditRow[f.campo]==null ? "" : String(_apEditRow[f.campo]);
      if(novo!==orig){
        patch[f.campo] = novo;
        const disp = f.campo==="operador" ? [_nomeOp(orig), _nomeOp(novo)] : [orig, novo];
        campos[f.campo] = {de:disp[0], para:disp[1]};
      }
    }
  });
  if(!Object.keys(patch).length){ _apEdErr("Nada foi alterado."); return; }
  _apEditBusy = true;
  const btn = document.getElementById("apEdSalvar");
  if(btn){ btn.disabled = true; btn.textContent = "Salvando…"; }
  try{
    await supaSend(`/rest/v1/producao_eventos?id=eq.${encodeURIComponent(_apEditRow.id)}`, "PATCH", patch, "return=minimal");
    await supaSend("/rest/v1/apontamento_edicoes", "POST", {
      evento_id: _apEditRow.id,
      pedido: _apEditRow.pedido || null,
      codigo_peca: _apEditRow.codigo_peca || null,
      campos,
      editado_por: (document.getElementById("apEdPor").value||"").trim() || null,
      motivo: (document.getElementById("apEdMotivo").value||"").trim() || null
    }, "return=minimal");
    _apEdErr("");
    fecharEdicaoApontamento();
    if(typeof window.onApontamentoEditado === "function") window.onApontamentoEditado();
  }catch(e){
    _apEdErr("Erro ao salvar: " + (e&&e.message||e));
  }
  _apEditBusy = false;
  if(btn){ btn.disabled = false; btn.textContent = "Salvar edição"; }
}
