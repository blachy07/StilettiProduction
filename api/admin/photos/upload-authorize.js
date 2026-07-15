const { supabase } = require("../../_lib/db");
const { requireAdmin } = require("../../_lib/admin-guard");

// Bucket di storage per le foto/video delle consegne. Deve esistere ed essere
// impostato come "Public" nel dashboard Supabase (Storage), esattamente come
// prima i blob erano access:"public" — altrimenti la galleria (che usa l'URL
// direttamente come src di <img>/<video>) non riuscirebbe a leggerli.
const BUCKET = "deliveries";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
];

// SUPABASE_URL è del tipo https://<project-ref>.supabase.co — il ref è il
// primo segmento del dominio, necessario per costruire l'host TUS dedicato
// (<ref>.storage.supabase.co), che la documentazione Supabase indica come
// l'endpoint da usare per gli upload di file grandi.
function storageProjectRef() {
  const match = /^https:\/\/([^.]+)\.supabase\.co/.exec(process.env.SUPABASE_URL || "");
  return match ? match[1] : null;
}

module.exports = async (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }

  const { pathname, contentType } = body || {};
  if (!pathname || typeof pathname !== "string") {
    res.status(400).json({ ok: false, error: "missing_pathname" });
    return;
  }
  if (!ALLOWED_TYPES.includes(contentType)) {
    res.status(400).json({ ok: false, error: "content_type_not_allowed" });
    return;
  }

  const ref = storageProjectRef();
  if (!ref) {
    res.status(500).json({ ok: false, error: "bad_supabase_url_config" });
    return;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(pathname, { upsert: false });

  if (error || !data) {
    res.status(500).json({ ok: false, error: (error && error.message) || "signed_url_error" });
    return;
  }

  // getPublicUrl() è il metodo ufficiale dell'SDK (storage-js) per ottenere
  // l'URL pubblico di un oggetto — non una stringa costruita a mano.
  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);

  res.status(200).json({
    ok: true,
    token: data.token,
    path: data.path,
    bucket: BUCKET,
    apikey: process.env.SUPABASE_ANON_KEY,
    // Endpoint per token firmati: verificato nel codice sorgente reale di
    // supabase/storage (src/http/routes/tus/lifecycle.ts) — la route che
    // valida l'header x-signature è la variante con suffisso "/sign",
    // diversa dall'endpoint base usato per l'auth via JWT di sessione.
    tusEndpoint: `https://${ref}.storage.supabase.co/storage/v1/upload/resumable/sign`,
    publicUrl: publicUrlData.publicUrl,
  });
};
