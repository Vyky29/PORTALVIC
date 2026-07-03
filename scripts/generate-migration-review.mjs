#!/usr/bin/env node
/**
 * Regenerates working_ui/migration-review.html from supabase/migrations.
 * Run: node scripts/generate-migration-review.mjs
 */
import fs from "fs";
import path from "path";

const OUT = "working_ui/migration-review.html";
const SUPA = "supabase/migrations";
const DB = "database/migrations";

const files = fs.readdirSync(SUPA)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const dbFiles = fs.existsSync(DB)
  ? fs.readdirSync(DB).filter((f) => f.endsWith(".sql")).sort()
  : [];
const dbSet = new Set(dbFiles);
const supaSet = new Set(files);

function read(f) {
  return fs.readFileSync(path.join(SUPA, f), "utf8");
}

function extractObjects(content) {
  const objs = { tables: new Set(), functions: new Set(), policies: new Set() };
  let m;
  const patterns = [
    [/create table if not exists\s+(?:public\.)?([^\s(]+)/gi, "tables"],
    [/create table\s+(?:public\.)?([^\s(]+)/gi, "tables"],
    [/alter table\s+(?:public\.)?([^\s(]+)/gi, "tables"],
    [/create or replace function\s+(?:public\.)?([^\s(]+)/gi, "functions"],
    [/create policy\s+"?([^"\n]+)"?\s+on\s+(?:public\.)?([^\s]+)/gi, "policies"],
    [/insert into\s+(?:public\.)?([^\s(]+)/gi, "tables"],
    [/update\s+(?:public\.)?([^\s]+)/gi, "tables"],
  ];
  for (const [re, kind] of patterns) {
    const re2 = new RegExp(re.source, re.flags);
    while ((m = re2.exec(content))) {
      objs[kind].add(
        kind === "policies" ? `${m[2]}::${m[1]}` : m[1].replace(/"/g, "")
      );
    }
  }
  return objs;
}

const CLUSTER_RULES = [
  {
    id: "bootstrap",
    re: /bootstrap|foundation|enable_rls_clients|supabase_admin_project|staff_profile_self_update/,
    title: "Bootstrap y base del portal",
    desc: "Primeras tablas, RLS inicial y RPC de arranque. Necesario en Supabase vacío.",
    affects: "Auth staff, tablas core, políticas base.",
  },
  {
    id: "session_feedback",
    re: /session_feedback|feedback_shared|feedback_status|parent_feedback|disruption|portal_admin_session_feedback/,
    title: "Feedback de sesión",
    desc: "Formulario staff, listado admin RPC, padres, sanitizado IA.",
    affects: "portal-session-feedback.html, admin Sessions hub.",
  },
  {
    id: "achievements",
    re: /achievement|participant.*photo|inbox.*photo|camera/,
    title: "Logros y fotos",
    desc: "Inbox fotos, storage, finalize, permisos cámara.",
    affects: "portal_participant_achievements.js, admin inbox.",
  },
  {
    id: "parent_portal",
    re: /parent_portal|parent_contacts|parent_swim|parent_whatsapp|parent_portal_message/,
    title: "Portal padres",
    desc: "Login familias, mensajes, WhatsApp inbound.",
    affects: "Flujos familias.",
  },
  {
    id: "roster_overrides",
    re: /schedule_override|roster_row|portal_roster|slot_|makeup|trial|cancel_|youssef|fadi|chaitanya|eddie|roberto|westway|sunday_202/,
    title: "Roster y overrides",
    desc: "Cuadrícula + muchos one-shots (cancel/trial por día).",
    affects: "Bookings, session cards, scheduling.",
  },
  {
    id: "timesheet_payroll",
    re: /timesheet|payroll|payslip|role_rate|contractor_invoice|expense/,
    title: "Timesheets y nómina",
    desc: "Horas, cron payroll, payslips, contractor invoice.",
    affects: "Timesheet staff, admin finance.",
  },
  {
    id: "staff_auth",
    re: /staff_profile|auth\.|login|username|admin_or_ceo|ceo_|sevitha|exec|planner_access|office_route|portal_admin/,
    title: "Staff, auth, admin/CEO",
    desc: "Perfiles, aliases, rutas admin, RLS exec.",
    affects: "login routing, admin_dashboard.",
  },
  {
    id: "announcements",
    re: /announcement|calendar_announcement|ack_insert/,
    title: "Anuncios",
    desc: "Contenido editorial insertado por SQL.",
    affects: "Campana avisos, push.",
  },
  {
    id: "push_notifications",
    re: /push_subscription|webpush|webhook|vapid|late_feedback/,
    title: "Push y crons digest",
    desc: "Web push, webhooks DB→edge, digest feedback tarde.",
    affects: "PWA push, edge crons.",
  },
  {
    id: "dm_comms",
    re: /staff_dm|internal_dm|executive_dm|dm_image|dm_voice|wellbeing/,
    title: "DM y wellbeing",
    desc: "Chat interno, wellbeing check-in.",
    affects: "DM modules, wellbeing page.",
  },
  {
    id: "documents_hr",
    re: /employment_contract|participant_document|madre_|hr_contract|hr_records/,
    title: "HR y documentos",
    desc: "Contratos, MADRE, documentos participante.",
    affects: "hr_contract.html, documents.",
  },
  {
    id: "visits_leads",
    re: /visit_session|lead_session|lead_directory|lead_peer/,
    title: "Visitas y leads",
    desc: "Visit pulse, lead reports.",
    affects: "Lead overview tools.",
  },
  {
    id: "participants",
    re: /participant_catalog|participants_and_parent|participant_general|participant_avatar|client_payment|waiting_list/,
    title: "Participantes y pagos",
    desc: "Catálogo, avatares, client_payments.",
    affects: "Participants admin, Orders.",
  },
  {
    id: "cancellations_absence",
    re: /cancellation_report|absent|quick_mark|peer_absent/,
    title: "Cancelaciones y ausencias",
    desc: "Informes cancelación, quick marks.",
    affects: "Sessions hub tabs.",
  },
  {
    id: "live_map",
    re: /live_map|live_location/,
    title: "Mapa live staff",
    desc: "Ubicaciones staff admin.",
    affects: "Live presence bar.",
  },
  {
    id: "misc",
    re: /.*/,
    title: "Otros",
    desc: "Fixes varios.",
    affects: "Caso a caso.",
  },
];

function assignCluster(filename, content) {
  const hay = `${filename} ${content.slice(0, 2500)}`;
  for (const rule of CLUSTER_RULES) {
    if (rule.id !== "misc" && rule.re.test(hay)) return rule;
  }
  return CLUSTER_RULES.find((r) => r.id === "misc");
}

function classifyKind(filename, content) {
  const hasDDL = /create table|create or replace function|create policy|alter table/i.test(
    content
  );
  const dataLines = /^insert into|^update |^delete from/m.test(content);
  const isRosterFix =
    /youssef|fadi|chaitanya|eddie|roberto|carlos|andres|makeup|trial|cancel.*2026|westway|jun\d{2}|jul\d{2}|sunday_2026/i.test(
      filename
    );
  if (isRosterFix || (dataLines && !hasDDL)) return "one-shot";
  if (hasDDL || /create or replace function/i.test(content)) return "structural";
  return "mixed";
}

const functionOwners = {};
const items = files.map((f) => {
  const content = read(f);
  const objs = extractObjects(content);
  const cluster = assignCluster(f, content);
  const kind = classifyKind(f, content);
  const m = f.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
  objs.functions.forEach((fn) => {
    if (!functionOwners[fn]) functionOwners[fn] = [];
    functionOwners[fn].push(f);
  });
  const comment = content
    .split("\n")
    .filter((l) => l.trim().startsWith("--"))
    .map((l) => l.replace(/^--\s?/, "").trim())
    .filter((l) => l && !/^=/.test(l))
    .slice(0, 4)
    .join("\n");
  return {
    id: f,
    file: f,
    day: m ? `${m[1]}-${m[2]}-${m[3]}` : "?",
    time: m ? `${m[4]}:${m[5]}` : "",
    clusterId: cluster.id,
    clusterTitle: cluster.title,
    clusterDesc: cluster.desc,
    clusterAffects: cluster.affects,
    kind,
    comment,
    hasDbCopy: dbSet.has(f),
    objs: {
      tables: [...objs.tables].slice(0, 6),
      functions: [...objs.functions].slice(0, 6),
      policies: [...objs.policies].slice(0, 4),
    },
  };
});

const supersededInfo = {};
for (const [fn, list] of Object.entries(functionOwners)) {
  if (list.length < 2) continue;
  for (let i = 0; i < list.length - 1; i++) {
    if (!supersededInfo[list[i]]) supersededInfo[list[i]] = [];
    supersededInfo[list[i]].push({ fn, later: list[list.length - 1] });
  }
}

function autoRec(it) {
  const sup = supersededInfo[it.id];
  const content = read(it.file);
  if (it.kind === "one-shot")
    return {
      rec: "archive",
      label: "One-shot",
      why: "Dato puntual (roster/anuncio). En Portal prod ya aplicado — defer por defecto. Sigue en carpeta git por historial.",
    };
  if (sup?.length)
    return {
      rec: "chain",
      label: "Cadena RPC",
      why: `CREATE OR REPLACE posterior sobre ${sup.map((s) => s.fn).join(", ")}. Mantener en CLI en orden; no es duplicado.`,
    };
  if (it.kind === "structural")
    return {
      rec: "essential",
      label: "Esencial",
      why: "Esquema, RLS o RPC — el portal actual lo necesita. Keep en CLI.",
    };
  if (it.clusterId === "announcements" && /insert/i.test(content))
    return {
      rec: "archive",
      label: "Anuncio",
      why: "INSERT de contenido — defer salvo clonar entorno.",
    };
  return {
    rec: "review",
    label: "Revisar tú",
    why: "Mezcla esquema + datos o webhook/cron — decide si sigue activo en prod.",
  };
}

for (const it of items) {
  it.superseded = supersededInfo[it.id] || null;
  it.auto = autoRec(it);
}

const clusters = {};
for (const it of items) {
  if (!clusters[it.clusterId]) {
    const def = CLUSTER_RULES.find((r) => r.id === it.clusterId);
    clusters[it.clusterId] = {
      id: it.clusterId,
      title: def.title,
      desc: def.desc,
      affects: def.affects,
      items: [],
    };
  }
  clusters[it.clusterId].items.push(it);
}
const clusterList = Object.values(clusters).sort(
  (a, b) => b.items.length - a.items.length
);

const defaultDecisions = {};
for (const it of items) {
  if (it.auto.rec === "essential" || it.auto.rec === "chain")
    defaultDecisions[it.id] = "keep";
  else if (it.auto.rec === "archive") defaultDecisions[it.id] = "defer";
}

const onlyDb = dbFiles.filter((f) => !supaSet.has(f));
const onlySupa = files.filter((f) => !dbSet.has(f));
const reviewItems = items.filter((i) => i.auto.rec === "review");

const stats = {
  total: items.length,
  essential: items.filter((i) => i.auto.rec === "essential").length,
  chain: items.filter((i) => i.auto.rec === "chain").length,
  archive: items.filter((i) => i.auto.rec === "archive").length,
  review: reviewItems.length,
  dbMirror: items.filter((i) => i.hasDbCopy).length,
  onlySupa: onlySupa.length,
  onlyDb: onlyDb.length,
  manualTotal: reviewItems.length + onlyDb.length,
};

const manualReview = {
  inCliMixed: reviewItems.map((i) => ({
    file: i.file,
    kind: i.kind,
    cluster: i.clusterTitle,
    why: i.auto.why,
    comment: i.comment,
  })),
  onlyDatabaseFolder: onlyDb.map((f) => ({
    file: f,
    note: "NO está en supabase/migrations — el CLI de Portal no la aplica. Espejo viejo o borrador local.",
  })),
};

const data = {
  generatedAt: new Date().toISOString(),
  stats,
  defaultDecisions,
  manualReview,
  clusters: clusterList,
};

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Revisión migraciones Portal</title>
<style>
:root{--bg:#eef1f6;--card:#fff;--ink:#152030;--muted:#5a6a7a;--line:#d8dfe8;--essential:#0a6e4a;--essential-bg:#e6f5ee;--chain:#2563eb;--chain-bg:#eef4ff;--archive:#b45309;--archive-bg:#fff7ed;--review:#64748b;--review-bg:#f1f5f9;--warn:#dc2626;--warn-bg:#fef2f2}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.5}
.wrap{max-width:1100px;margin:0 auto;padding:16px 16px 100px}
header,.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin-bottom:16px}
header h1,.panel h2{margin:0 0 8px;font-size:1.25rem}
.lead{color:var(--muted);font-size:14px;margin:0}
.callout{background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:12px 14px;font-size:13px;margin:12px 0}
.callout-warn{background:var(--warn-bg);border-color:#fca5a5}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.stat{background:var(--bg);border-radius:8px;padding:8px 12px;font-size:12px;min-width:88px}
.stat b{display:block;font-size:1.1rem}
.toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.toolbar input,.toolbar select{padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:14px}
.toolbar input{flex:1 1 180px}
.btn{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer}
.btn--primary{background:var(--essential);color:#fff;border-color:var(--essential)}
.manual-list{font-size:13px;margin:0;padding:0;list-style:none}
.manual-list li{border-bottom:1px solid var(--line);padding:10px 0;overflow-wrap:anywhere}
.manual-list li:last-child{border-bottom:none}
.manual-list code{font-size:11px}
.manual-list .sub{color:var(--muted);font-size:12px;margin-top:4px}
.cluster{margin-bottom:16px;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.cluster-head{padding:14px 16px;background:#f8fafc;border-bottom:1px solid var(--line);cursor:pointer}
.cluster-head h3{margin:0 0 4px;font-size:1rem}
.cluster-meta{font-size:12px;color:var(--muted)}
.cluster-desc{font-size:13px;margin:6px 0 0}
.cluster-body{display:none}.cluster.is-open .cluster-body{display:block}
.mig{border-bottom:1px solid var(--line);padding:12px 16px}
.mig:last-child{border-bottom:none}
.mig--essential{background:var(--essential-bg)}.mig--chain{background:var(--chain-bg)}.mig--archive{background:var(--archive-bg)}.mig--review{background:var(--review-bg)}
.mig-file{font-family:monospace;font-size:11px;word-break:break-all}
.badge{font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;margin-right:4px;background:#e2e8f0}
.badge--essential{background:#bbf7d0}.badge--chain{background:#bfdbfe}.badge--archive{background:#fed7aa}.badge--review{background:#cbd5e1}
.mig p{margin:6px 0;font-size:13px;color:var(--muted);overflow-wrap:anywhere}
.mig-comment{font-family:monospace;font-size:11px;background:#f1f5f9;padding:6px;border-radius:4px;white-space:pre-wrap}
.mig-actions{margin-top:8px;display:flex;gap:6px}
.act{border:none;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer}
.act--keep{background:var(--essential);color:#fff}.act--defer{background:var(--archive-bg);color:var(--archive);border:1px solid #fdba74}
.act.is-on{outline:2px solid var(--ink)}
.sticky{position:fixed;bottom:0;left:0;right:0;background:rgba(21,32,48,.94);color:#fff;padding:10px 16px;font-size:13px;z-index:20}
</style>
</head>
<body>
<div class="wrap">
<header>
<h1>Migraciones — recomendación automática aplicada</h1>
<p class="lead"><strong>${stats.total}</strong> en CLI (<code>supabase/migrations/</code>) · 
<strong>${stats.essential + stats.chain}</strong> Keep auto · 
<strong>${stats.archive}</strong> Guardar sin usar auto · 
<strong>${stats.manualTotal}</strong> para decidir tú (${stats.review} en CLI + ${stats.onlyDb} solo en database/)</p>
<div class="callout"><strong>Los 39</strong> que viste son archivos <em>solo</em> en <code>database/migrations/</code> — <strong>no van al CLI</strong> de Portal. Son espejos viejos. Las <strong>13</strong> "Revisar" sí están en CLI y necesitan tu ojo.</div>
<div class="stats" id="stats"></div>
<div class="toolbar">
<input type="search" id="q" placeholder="Buscar…"/>
<select id="fRec"><option value="">Todas</option><option value="essential">Esencial</option><option value="chain">Cadena</option><option value="archive">One-shot</option><option value="review">Revisar (${stats.review})</option></select>
<select id="fUser"><option value="">Tu decisión</option><option value="keep">Keep</option><option value="defer">Sin usar</option><option value="unset">Sin marcar</option></select>
<button class="btn btn--primary" id="resetAuto">Reset → recomendación automática</button>
<button class="btn" id="export">Export JSON</button>
</div>
</header>

<section class="panel callout-warn" id="manualPanel">
<h2>Decidir tú (${stats.manualTotal} archivos)</h2>
<p class="lead" style="margin-bottom:12px">Solo estas listas requieren decisión manual antes de limpiar el repo. El resto ya tiene Keep/Defer automático.</p>
<h3 style="font-size:14px;margin:16px 0 8px">A) En CLI — revisar (${stats.review})</h3>
<ul class="manual-list" id="reviewList"></ul>
<h3 style="font-size:14px;margin:16px 0 8px">B) Solo en database/ — NO en CLI (${stats.onlyDb})</h3>
<p class="lead" style="font-size:12px;margin-bottom:8px">Probablemente ya absorbidas por migraciones con otro nombre en supabase/. Opciones: borrar espejo, o archivar en local-vault.</p>
<ul class="manual-list" id="onlyDbList"></ul>
</section>

<div id="root"></div>
</div>
<div class="sticky" id="foot"></div>
<script>
var DATA=${JSON.stringify(data)};
var KEY='portalMigrationReview_v3';
var decisions=Object.assign({}, DATA.defaultDecisions);
try{
  var saved=localStorage.getItem(KEY);
  if(saved) decisions=JSON.parse(saved);
}catch(e){}

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function save(){localStorage.setItem(KEY,JSON.stringify(decisions))}

function counts(){
  var k=0,d=0,u=0;
  DATA.clusters.forEach(function(c){c.items.forEach(function(it){
    var x=decisions[it.id]; if(x==='keep')k++; else if(x==='defer')d++; else u++;
  })});
  return {keep:k,defer:d,unset:u};
}

function renderManual(){
  var rl=document.getElementById('reviewList');
  rl.innerHTML=DATA.manualReview.inCliMixed.map(function(r){
    return '<li><code>'+esc(r.file)+'</code> <span class="badge badge--review">'+esc(r.cluster)+'</span><div class="sub">'+esc(r.why)+'</div></li>';
  }).join('');
  document.getElementById('onlyDbList').innerHTML=DATA.manualReview.onlyDatabaseFolder.map(function(r){
    return '<li><code>'+esc(r.file)+'</code><div class="sub">'+esc(r.note)+'</div></li>';
  }).join('');
}

function renderStats(){
  var c=counts(),s=DATA.stats;
  document.getElementById('stats').innerHTML=
    '<div class="stat"><b>'+(s.essential+s.chain)+'</b>Keep auto</div>'+
    '<div class="stat"><b>'+s.archive+'</b>Defer auto</div>'+
    '<div class="stat"><b style="color:#dc2626">'+s.manualTotal+'</b>Decidir tú</div>'+
    '<div class="stat"><b style="color:var(--essential)">'+c.keep+'</b>Tu Keep</div>'+
    '<div class="stat"><b>'+c.defer+'</b>Tu defer</div>';
  document.getElementById('foot').textContent='Keep: '+c.keep+' · Defer: '+c.defer+' · Sin marcar: '+c.unset;
}

function match(it){
  var q=(document.getElementById('q').value||'').trim().toLowerCase();
  var fr=document.getElementById('fRec').value;
  var fu=document.getElementById('fUser').value;
  if(fr&&it.auto.rec!==fr)return false;
  if(fu){ var d=decisions[it.id]?'keep':'unset'; if(decisions[it.id]==='defer')d='defer'; if(fu==='unset'&&!decisions[it.id])return true; if(fu!==d)return false; if(fu==='unset')return false; }
  if(!q)return true;
  return (it.file+' '+it.comment+' '+it.auto.why).toLowerCase().indexOf(q)>=0;
}

function render(){
  renderStats(); renderManual();
  var html='';
  DATA.clusters.forEach(function(cl){
    var vis=cl.items.filter(match);
    if(!vis.length)return;
    html+='<section class="cluster is-open"><div class="cluster-head" data-t="1">';
    html+='<h3>'+esc(cl.title)+' <span class="cluster-meta">('+vis.length+')</span></h3>';
    html+='<p class="cluster-desc">'+esc(cl.desc)+'</p></div><div class="cluster-body">';
    vis.forEach(function(it){
      var dec=decisions[it.id]||'';
      html+='<article class="mig mig--'+it.auto.rec+'"><div class="mig-file">'+esc(it.file)+'</div>';
      html+='<span class="badge badge--'+it.auto.rec+'">'+esc(it.auto.label)+'</span>';
      if(it.hasDbCopy)html+='<span class="badge">espejo database/</span>';
      if(it.comment)html+='<div class="mig-comment">'+esc(it.comment)+'</div>';
      html+='<p>'+esc(it.auto.why)+'</p>';
      html+='<div class="mig-actions">';
      html+='<button type="button" class="act act--keep'+(dec==='keep'?' is-on':'')+'" data-a="keep" data-i="'+esc(it.id)+'">Keep</button>';
      html+='<button type="button" class="act act--defer'+(dec==='defer'?' is-on':'')+'" data-a="defer" data-i="'+esc(it.id)+'">Guardar sin usar</button>';
      html+='</div></article>';
    });
    html+='</div></section>';
  });
  document.getElementById('root').innerHTML=html||'<p>Nada con este filtro.</p>';
}

document.getElementById('root').addEventListener('click',function(ev){
  var t=ev.target;
  if(t.dataset.t){t.closest('.cluster').classList.toggle('is-open');return}
  if(t.dataset.a){ var id=t.dataset.i,a=t.dataset.a; decisions[id]=decisions[id]===a?undefined:a; if(!decisions[id])delete decisions[id]; save(); render(); }
});
document.getElementById('q').oninput=render;
document.getElementById('fRec').onchange=render;
document.getElementById('fUser').onchange=render;
document.getElementById('resetAuto').onclick=function(){
  if(!confirm('Restaurar Keep/Defer automático (177 keep + 90 defer)?'))return;
  decisions=Object.assign({}, DATA.defaultDecisions);
  save(); render();
};
document.getElementById('export').onclick=function(){
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify({decisions:decisions,manualReview:DATA.manualReview,stats:DATA.stats},null,2)],{type:'application/json'}));
  a.download='portal-migration-decisions-v3.json'; a.click();
};
render();
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log("Wrote", OUT, `${(html.length / 1024).toFixed(0)}KB`);
console.log("Manual review:", stats.manualTotal, "=", stats.review, "CLI +", stats.onlyDb, "database-only");
