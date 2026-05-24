/**
 * Staff employment contract signing — uses Portal auth + documents bucket.
 */
const PORTAL_CONTRACT_LOGO = "portal/portal_crest.svg";

function portalContractParseBody(body) {
  try {
    const o = JSON.parse(String(body || "{}"));
    return {
      contract_id: String(o.contract_id || o.contractId || "").trim(),
      reference: String(o.reference || "").trim()
    };
  } catch (_) {
    return { contract_id: "", reference: "" };
  }
}

async function portalContractLoadModule() {
  const bases = ["./", "portal/"];
  for (const b of bases) {
    try {
      const url = b + "contract-core.js?v=20260521-1";
      if (typeof window !== "undefined" && window.ContractCore) return window.ContractCore;
      await import(/* @vite-ignore */ new URL(url, import.meta.url).href).catch(() => null);
      if (window.ContractCore) return window.ContractCore;
    } catch (_) {}
  }
  if (typeof window !== "undefined" && window.ContractCore) return window.ContractCore;
  throw new Error("contract-core.js not loaded");
}

async function portalContractGetAuth() {
  const mod = await import(
    /* @vite-ignore */ new URL("./auth-handler.js?v=20260521-1", import.meta.url).href
  );
  if (!mod || typeof mod.bootstrapDashboardSupabase !== "function") {
    throw new Error("auth-handler unavailable");
  }
  await mod.bootstrapDashboardSupabase({ page: "staff" });
  const box = window.__PORTAL_SUPABASE__;
  if (!box || !box.client || !box.session) throw new Error("Not signed in");
  return { supabase: box.client, user: box.session.user, profile: box.staff_profile };
}

export async function portalFetchMyContract(contractId) {
  const { supabase, user } = await portalContractGetAuth();
  const id = String(contractId || "").trim();
  if (!id) throw new Error("Missing contract id");
  const { data, error } = await supabase
    .from("employment_contracts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Contract not found");
  if (data.status === "completed") {
    return { completed: true, contract: data };
  }
  if (new Date(data.expires_at) < new Date()) {
    throw new Error("This contract link has expired. Contact HR.");
  }
  return { completed: false, contract: data };
}

export async function portalCompleteEmploymentContract(opts) {
  const o = opts || {};
  const contractId = String(o.contractId || "").trim();
  const employeeSignature = String(o.employeeSignature || "").trim();
  const employeeTypedName = String(o.employeeTypedName || "").trim();
  if (!contractId || !employeeSignature || !employeeTypedName) {
    throw new Error("Missing signature data");
  }

  const C = await portalContractLoadModule();
  const docsMod = await import(
    /* @vite-ignore */ new URL("./portal_documents.js?v=20260521-1", import.meta.url).href
  );

  const { supabase, user } = await portalContractGetAuth();
  const { data: row, error: fetchErr } = await supabase
    .from("employment_contracts")
    .select("*")
    .eq("id", contractId)
    .eq("user_id", user.id)
    .single();
  if (fetchErr || !row) throw new Error("Contract not found");
  if (row.status === "completed") throw new Error("Already signed");
  if (employeeTypedName.trim().toLowerCase() !== String(row.employee_name).trim().toLowerCase()) {
    throw new Error("Typed name must match your full name on the contract.");
  }

  const now = new Date().toISOString();
  const templateData = { ...(row.template_data || {}) };
  templateData.EMPLOYEE_SIGNATURE = "[Signed electronically]";
  templateData.EMPLOYEE_ACKNOWLEDGEMENT = "Confirmed";
  templateData.SIGNED_TIMESTAMP = now;
  templateData.EMPLOYEE_SIGNATURE_DATE = templateData.EMPLOYEE_SIGNATURE_DATE || now;

  const { error: updErr } = await supabase
    .from("employment_contracts")
    .update({
      status: "completed",
      employee_signature: employeeSignature,
      employee_typed_name: employeeTypedName,
      employee_acknowledged: true,
      template_data: templateData,
      completed_at: now,
      employee_signed_at: now
    })
    .eq("id", contractId)
    .eq("user_id", user.id);
  if (updErr) throw updErr;

  let documentRow = null;
  if (typeof html2pdf !== "undefined" && docsMod.portalUploadPdfAndCreateDocument) {
    const html = C.buildPdfHtml(templateData, {
      directorSignatureDataUrl: row.director_signature,
      employeeSignatureDataUrl: employeeSignature,
      logoDataUrl: C.logoDataUrl || ""
    });
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    wrap.style.cssText = "position:fixed;left:0;top:0;width:210mm;z-index:9999;background:#fff;";
    document.body.appendChild(wrap);
    try {
      const blob = await html2pdf()
        .set({
          margin: 12,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
        })
        .from(wrap)
        .outputPdf("blob");
      documentRow = await docsMod.portalUploadPdfAndCreateDocument({
        blob,
        document_type: "employment_contract",
        category: "HR",
        title: "Employment contract — " + (row.contract_reference || row.role || "Signed"),
        source_page: "contract_sign",
        related_date: row.contract_date,
        reuseAuth: { supabase, user }
      });
      if (documentRow && documentRow.id) {
        await supabase
          .from("employment_contracts")
          .update({ document_id: documentRow.id })
          .eq("id", contractId);
      }
    } finally {
      wrap.remove();
    }
  }

  return {
    ok: true,
    contractReference: row.contract_reference,
    document: documentRow,
    templateData
  };
}

export function portalContractSignPageUrl(contractId) {
  const base = typeof location !== "undefined" ? location.origin + location.pathname.replace(/[^/]+$/, "") : "";
  return base + "contract_sign.html?contract_id=" + encodeURIComponent(contractId);
}

export { portalContractParseBody, portalContractLoadModule };
