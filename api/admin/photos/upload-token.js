const fs = require("fs");
const { handleUpload } = require("@vercel/blob/client");
const { requireAdmin } = require("../../_lib/admin-guard");

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

// Stesso meccanismo di api/admin/blob-version.js: require(".../package.json")
// è bloccato dal campo "exports" del pacchetto, la lettura diretta da
// filesystem no. Duplicato qui (temporaneamente) solo per il debug.
function debugServerVersion() {
  try {
    const resolvedEntry = require.resolve("@vercel/blob");
    const marker = "/node_modules/@vercel/blob/";
    const idx = resolvedEntry.indexOf(marker);
    if (idx === -1) return null;
    const pkgJsonPath = resolvedEntry.slice(0, idx + marker.length) + "package.json";
    return JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")).version;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }

  // --- LOG TEMPORANEO DI DEBUG: rimuovere una volta trovata la causa del 400 ---
  console.log("[upload-token DEBUG] versione @vercel/blob lato server:", debugServerVersion());
  console.log("[upload-token DEBUG] body ricevuto dal client:", JSON.stringify(body));
  // --- FINE LOG TEMPORANEO ---

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // --- LOG TEMPORANEO ---
        console.log("[upload-token DEBUG] onBeforeGenerateToken pathname:", pathname, "clientPayload:", clientPayload);
        // --- FINE LOG TEMPORANEO ---
        return {
          allowedContentTypes: ALLOWED_TYPES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({}),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // --- LOG TEMPORANEO ---
        console.log("[upload-token DEBUG] onUploadCompleted blob:", JSON.stringify(blob), "tokenPayload:", tokenPayload);
        // --- FINE LOG TEMPORANEO ---
        // Il salvataggio su Supabase avviene tramite /api/admin/photos/finalize,
        // chiamato esplicitamente dal browser subito dopo che l'upload diretto
        // a Blob è completato — non ci appoggiamo al webhook onUploadCompleted.
      },
    });

    // --- LOG TEMPORANEO ---
    console.log("[upload-token DEBUG] jsonResponse restituito al client:", JSON.stringify(jsonResponse));
    // --- FINE LOG TEMPORANEO ---
    res.status(200).json(jsonResponse);
  } catch (error) {
    console.log("[upload-token DEBUG] handleUpload ha lanciato un errore:", error && error.message, error && error.stack);
    res.status(400).json({ ok: false, error: (error && error.message) || "upload_token_error" });
  }
};
