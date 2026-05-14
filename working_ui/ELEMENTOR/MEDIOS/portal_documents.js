const PORTAL_DOCUMENTS_BUCKET = "documents";

/** Same host as this module (avoids www vs apex “Failed to fetch” on dynamic import). */
function portalAuthModuleUrl() {
  try {
    if (typeof import.meta !== "undefined" && import.meta.url) {
      return new URL("./auth-handler.js?v=20260423-3", import.meta.url).href;
    }
  } catch (_) {}
  return "https://www.clubsensational.org/wp-content/uploads/2026/05/auth-handler.js?v=20260423-3";
}

function portalIsLikelyNetworkError(err) {
  const msg = String(err && err.message ? err.message : err || "").toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network request failed");
}

async function portalDelay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function portalSanitizeFilenamePart(value) {
  return String(value || "")
    .trim()
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "document";
}

async function portalGetSupabaseClient() {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const mod = await import(portalAuthModuleUrl());
      if (!mod || typeof mod.getSupabaseClient !== "function") {
        throw new Error("Supabase client is not available.");
      }
      return mod.getSupabaseClient();
    } catch (err) {
      lastErr = err;
      if (attempt < 2 && portalIsLikelyNetworkError(err)) {
        await portalDelay(450 * (attempt + 1));
        continue;
      }
      break;
    }
  }
  const raw = lastErr && lastErr.message ? String(lastErr.message) : "Unknown error";
  if (portalIsLikelyNetworkError(lastErr)) {
    throw new Error(
      "Network error loading portal auth or talking to Supabase. Check connection, then that auth-handler.js is uploaded and reachable. (" +
        raw +
        ")"
    );
  }
  throw lastErr instanceof Error ? lastErr : new Error(raw);
}

export async function portalRequireUser() {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const supabase = await portalGetSupabaseClient();
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const user = data && data.user ? data.user : null;
      if (!user || !user.id) throw new Error("User not authenticated.");
      return { supabase, user };
    } catch (err) {
      lastErr = err;
      if (attempt < 2 && portalIsLikelyNetworkError(err)) {
        await portalDelay(450 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error("User not authenticated.");
}

export async function portalUploadPdfAndCreateDocument(options) {
  const opts = options || {};
  const blob = opts.blob;
  if (!(blob instanceof Blob)) {
    throw new Error("PDF blob is required.");
  }
  const documentType = String(opts.document_type || "").trim();
  const category = String(opts.category || "").trim();
  const title = String(opts.title || "").trim();
  const sourcePage = String(opts.source_page || "").trim();
  if (!documentType || !category || !title || !sourcePage) {
    throw new Error("Missing document metadata.");
  }

  const reuse = opts.reuseAuth;
  const hasReuse =
    reuse &&
    reuse.supabase &&
    typeof reuse.supabase.from === "function" &&
    reuse.supabase.storage &&
    reuse.user &&
    reuse.user.id;
  const { supabase, user } = hasReuse
    ? { supabase: reuse.supabase, user: reuse.user }
    : await portalRequireUser();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${stamp}_${portalSanitizeFilenamePart(title)}.pdf`;
  const storagePath = `${user.id}/${sourcePage}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from(PORTAL_DOCUMENTS_BUCKET)
    .upload(storagePath, blob, {
      contentType: "application/pdf",
      upsert: false
    });
  if (uploadError) {
    const u = String(uploadError.message || uploadError || "");
    const extra = [uploadError.statusCode, uploadError.error].filter(Boolean).join(" ");
    throw new Error(u + (extra ? " (" + extra + ")" : ""));
  }

  const relatedDate =
    opts.related_date == null || opts.related_date === ""
      ? null
      : String(opts.related_date).trim().slice(0, 10);

  const row = {
    user_id: user.id,
    document_type: documentType,
    category,
    title,
    related_date: relatedDate || null,
    related_client: opts.related_client || null,
    related_session_key: opts.related_session_key || null,
    file_url: storagePath,
    source_page: sourcePage
  };
  const { data, error: insertError } = await supabase
    .from("documents")
    .insert([row])
    .select("id, created_at, title, category, document_type, file_url, source_page")
    .single();
  if (insertError) {
    const parts = [
      insertError.message,
      insertError.code,
      insertError.details,
      insertError.hint
    ].filter(Boolean);
    throw new Error(parts.join(" — ") || "documents insert failed");
  }

  return data;
}

export async function portalListMyDocuments() {
  const { supabase, user } = await portalRequireUser();
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, category, document_type, created_at, related_date, file_url, source_page")
    .eq("user_id", user.id)
    .is("hidden_by_user_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Soft-hide: row stays in DB (audit / admin snapshots); staff no longer sees it in My Documents. */
export async function portalHideMyDocumentFromList(docId) {
  const id = String(docId || "").trim();
  if (!id) throw new Error("Missing document id.");
  const { supabase } = await portalRequireUser();
  const { error } = await supabase.rpc("hide_my_document", { doc_id: id });
  if (error) throw error;
}

export async function portalCreateDocumentSignedUrl(fileUrl, expiresInSeconds = 3600) {
  const storagePath = String(fileUrl || "").trim();
  if (!storagePath) throw new Error("Missing file path.");
  const { supabase } = await portalRequireUser();
  const { data, error } = await supabase.storage
    .from(PORTAL_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  return data && data.signedUrl ? data.signedUrl : "";
}
