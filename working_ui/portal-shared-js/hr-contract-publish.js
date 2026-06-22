/**
 * Create employment contract + staff dashboard notice (same-origin Portal Vic).
 */
function portalRandomSigningToken() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function portalPublishEmploymentContract(supabase, authUserId, opts) {
  const o = opts || {};
  const templateData = o.templateData || {};
  const formPayload = o.formPayload || {};
  const contactEmail = String(o.employeeEmail || "").trim().toLowerCase();
  const portalAuthEmail = String(o.portalAuthEmail || contactEmail || "").trim().toLowerCase();
  const employeeName = String(o.employeeName || "").trim();
  const contractReference = String(o.contractReference || "").trim();
  const directorSignature = String(o.directorSignature || "").trim();

  if (!contractReference || !directorSignature || !contactEmail || !employeeName || !portalAuthEmail) {
    throw new Error("Missing required contract fields.");
  }

  const { data: staffUserId, error: rpcErr } = await supabase.rpc("portal_user_id_for_email", {
    p_email: portalAuthEmail
  });
  if (rpcErr) throw new Error(rpcErr.message || "Could not resolve employee Portal account.");
  if (!staffUserId) {
    const loginHint = formPayload.portalStaffLogin
      ? " Selected staff: " + formPayload.portalStaffLogin + "."
      : "";
    throw new Error(
      "No Portal login found for this staff member (" + portalAuthEmail + ")." + loginHint +
        " Ensure they exist in Supabase Auth (staff PIN sync)."
    );
  }

  const signingToken = portalRandomSigningToken();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const row = {
    signing_token: signingToken,
    contract_reference: contractReference,
    contract_version: templateData.CONTRACT_VERSION || "1.0",
    status: "awaiting_employee",
    user_id: staffUserId,
    employee_name: employeeName,
    employee_email: contactEmail,
    employee_address: templateData.EMPLOYEE_ADDRESS || "",
    contract_date: formPayload.contractDate || null,
    commencement_date: formPayload.commencementDate || null,
    role: templateData.JOB_TITLE || "",
    scale: templateData.ROLE_SCALE || "",
    delivery_rate: templateData.DELIVERY_RATE || "",
    director_name: templateData.DIRECTOR_NAME || "",
    form_payload: formPayload,
    template_data: templateData,
    director_signature: directorSignature,
    expires_at: expiresAt,
    created_by_user_id: authUserId,
    sent_at: now
  };

  const { data: contract, error: insErr } = await supabase
    .from("employment_contracts")
    .insert([row])
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message || "Could not save contract.");

  const annBody = JSON.stringify({
    contract_id: contract.id,
    reference: contractReference,
    employee_name: employeeName
  });

  const { data: ann, error: annErr } = await supabase
    .from("portal_staff_announcements")
    .insert([
      {
        title: "Sign employment contract" + (row.role ? " \u2014 " + row.role : ""),
        body: annBody,
        message_type: "contract_signing",
        priority: "high",
        audience_scope: "all_staff",
        delivery_scope: "single_user",
        target_user_id: staffUserId,
        target_staff_role: null,
        created_by: authUserId
      }
    ])
    .select("id")
    .single();

  if (annErr) throw new Error(annErr.message || "Contract saved but dashboard notice failed.");

  await supabase
    .from("employment_contracts")
    .update({ announcement_id: ann.id })
    .eq("id", contract.id);

  const signUrl =
    (typeof location !== "undefined" ? location.origin + location.pathname.replace(/[^/]+$/, "") : "") +
    "contract_sign.html?contract_id=" +
    encodeURIComponent(contract.id);

  return {
    contractId: contract.id,
    announcementId: ann.id,
    portalSignUrl: signUrl,
    staffUserId
  };
}

export async function portalListEmploymentContracts(supabase) {
  const { data, error } = await supabase
    .from("employment_contracts")
    .select(
      "id, contract_reference, employee_name, employee_email, role, scale, status, created_at, sent_at, completed_at, user_id"
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}
