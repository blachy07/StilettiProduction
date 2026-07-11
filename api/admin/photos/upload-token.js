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

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_TYPES,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // Il salvataggio su Supabase avviene tramite /api/admin/photos/finalize,
        // chiamato esplicitamente dal browser subito dopo che l'upload diretto
        // a Blob è completato — non ci appoggiamo al webhook onUploadCompleted.
      },
    });

    res.status(200).json(jsonResponse);
  } catch (error) {
    res.status(400).json({ ok: false, error: (error && error.message) || "upload_token_error" });
  }
};
