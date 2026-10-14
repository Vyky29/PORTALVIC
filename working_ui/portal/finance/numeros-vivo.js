import { bootstrapDashboardSupabase } from "/portal/auth-handler.js?v=20260625-exec-single-session-exempt";

const mount = document.getElementById("numeros-vivo");
if (mount) {
  await bootstrapDashboardSupabase({ page: "ceo" });
  mount.innerHTML = panelHechos() + '<h2>Lo que dice el portal</h2><p class="meta" id="vivoMeta">Cargando facturas...</p><div id="vivoPortal"></div>';
  await panelPortal();
}

function gbp(n) {
  return "£" + Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function panelHechos() {
  return `
    <h2>Cifras en uso</h2>
    <p class="meta">Hoja al 14 oct 2026. Es la misma en todas las hojas en uso. Day Centre es Victor y Raul.</p>
    <div class="kpis">
      <div class="kpi"><div class="v">£212,125.30</div><div class="l">Day Centre, sep 25 a jul 26</div></div>
      <div class="kpi"><div class="v">£196,577.09</div><div class="l">Ya entrado. Fadi el 23 sep</div></div>
      <div class="kpi"><div class="v">£15,548.21</div><div class="l">Falta: Ikram £12,000 y Timi £3,548.21</div></div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="v">£93,247.54</div><div class="l">Remanente ahora</div></div>
      <div class="kpi"><div class="v">£26,790.77</div><div class="l">Victor por coger ahora</div></div>
      <div class="kpi"><div class="v">£46,623.77</div><div class="l">Raul por coger ahora</div></div>
    </div>
    <div class="note">Victor ya cogio £19,833 (Michelle £12,000 y £7,833 de julio). Cuando entren los £15,548.21, Victor coge £34,564.88 y Raul £54,397.87. Tarjetas hasta el 24 sep: Victor £18,422.72, Raul £19,088.99, Javier £10,753.21. Top hasta £20,000: £1,577.28, £911.01 y £9,246.79. La empresa pone £11,735.08.</div>
  `;
}

function potOf(r) {
  const b = (String(r.line_description || "") + " " + String(r.notes || "")).toLowerCase();
  return /day centre/.test(b) ? "Day Centre" : "Resto";
}

async function panelPortal() {
  const meta = document.getElementById("vivoMeta");
  const box = document.getElementById("vivoPortal");
  const client = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client;
  if (!client) {
    meta.textContent = "No hay sesion del portal.";
    return;
  }
  try {
    const cols = "invoice_number,amount_gbp,amount_paid_gbp,payment_status,share_status,billing_term,notes,line_description";
    const rows = [];
    for (let from = 0; from < 8000; from += 1000) {
      const { data, error } = await client.from("portal_parent_invoice_share").select(cols).range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push.apply(rows, data || []);
      if (!data || data.length < 1000) break;
    }
    const terms = {};
    const nhsOpen = [];
    rows.forEach((r) => {
      if (r.payment_status === "void" || r.share_status === "void") return;
      const term = r.billing_term || "sin termino";
      const face = Number(r.amount_gbp) || 0;
      const paid = Number(r.amount_paid_gbp) || 0;
      const left = Math.max(0, Math.round((face - paid) * 100) / 100);
      const pot = potOf(r);
      if (!terms[term]) terms[term] = { n: 0, paid: 0, left: 0, dcPaid: 0, dcLeft: 0, restPaid: 0, restLeft: 0 };
      const t = terms[term];
      t.n += 1;
      t.paid += paid;
      t.left += left;
      if (pot === "Day Centre") { t.dcPaid += paid; t.dcLeft += left; }
      else { t.restPaid += paid; t.restLeft += left; }
      const blob = (String(r.notes || "") + " " + String(r.line_description || "")).toLowerCase();
      if (left > 0.5 && /nhs/.test(blob) && /day centre/.test(blob)) {
        nhsOpen.push({ inv: r.invoice_number, left, term, desc: String(r.line_description || "").slice(0, 80) });
      }
    });
    let html = '<div class="wrap"><table><tr><th>Termino</th><th class="num">Facturas</th><th class="num">Cobrado</th><th class="num">Falta</th><th class="num">DC cobrado</th><th class="num">DC falta</th><th class="num">Resto cobrado</th><th class="num">Resto falta</th></tr>';
    Object.keys(terms).sort().forEach((k) => {
      const t = terms[k];
      html += `<tr><td>${esc(k)}</td><td class="num">${t.n}</td><td class="num">${gbp(t.paid)}</td><td class="num">${gbp(t.left)}</td><td class="num">${gbp(t.dcPaid)}</td><td class="num">${gbp(t.dcLeft)}</td><td class="num">${gbp(t.restPaid)}</td><td class="num">${gbp(t.restLeft)}</td></tr>`;
    });
    html += "</table></div>";
    nhsOpen.sort((a, b) => b.left - a.left);
    html += "<h3>NHS Day Centre que el portal deja sin cobrar</h3>";
    if (!nhsOpen.length) {
      html += '<p class="meta">El portal no deja ninguna factura NHS de Day Centre con importe pendiente.</p>';
    } else {
      html += '<div class="wrap"><table><tr><th>Factura</th><th>Termino</th><th>Detalle</th><th class="num">Falta</th></tr>';
      nhsOpen.slice(0, 40).forEach((r) => {
        html += `<tr><td>${esc(r.inv)}</td><td>${esc(r.term)}</td><td>${esc(r.desc)}</td><td class="num">${gbp(r.left)}</td></tr>`;
      });
      html += "</table></div>";
      html += '<div class="warn">Si el banco ya cobro y la factura sigue aqui, el portal no la tiene marcada como pagada. Fadi junio y julio, £22,662.50, entraron el 23 sep aunque el portal no lo diga.</div>';
    }
    box.innerHTML = html;
    meta.textContent = rows.length + " facturas, " + new Date().toLocaleString("en-GB", { timeZone: "Europe/London" }) + ".";
  } catch (err) {
    meta.textContent = "No se pudieron leer las facturas.";
    box.innerHTML = `<div class="warn">${esc(err && err.message ? err.message : err)}</div>`;
  }
}
