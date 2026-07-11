const { supabase } = require("../../_lib/db");
const { requireAdmin } = require("../../_lib/admin-guard");

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  if (req.method !== "DELETE") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const id = req.query && req.query.id;
  if (!id) {
    res.status(400).json({ ok: false, error: "bad_request" });
    return;
  }

  const { data: photo } = await supabase.from("photos").select("blob_url").eq("id", id).maybeSingle();

  if (photo && photo.blob_url && !photo.blob_url.startsWith("/consegne/")) {
    try {
      const { del } = require("@vercel/blob");
      await del(photo.blob_url);
    } catch {
      // best-effort: non blocca l'eliminazione della riga dal database
    }
  }

  const { error } = await supabase.from("photos").delete().eq("id", id);
  if (error) {
    res.status(500).json({ ok: false, error: "db_error" });
    return;
  }

  res.status(200).json({ ok: true });
};
