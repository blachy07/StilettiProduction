const { supabase } = require("../../_lib/db");
const { requireAdmin } = require("../../_lib/admin-guard");

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;

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

  const { deliveryId, blobUrl, pathname, filename, contentType, size, position } = body || {};
  if (!deliveryId || !blobUrl || !pathname || !filename || typeof position !== "number") {
    res.status(400).json({ ok: false, error: "bad_request" });
    return;
  }

  const { data, error } = await supabase
    .from("photos")
    .insert({
      delivery_id: deliveryId,
      blob_url: blobUrl,
      storage_pathname: pathname,
      filename,
      content_type: contentType || null,
      size_bytes: size || null,
      position,
    })
    .select()
    .single();

  if (error) {
    // storage_pathname è unique: se questa stessa richiesta viene ritentata
    // dal client dopo aver già avuto successo lato server (risposta persa in
    // rete), qui va trattata come un successo idempotente, non come un errore.
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("photos")
        .select("*")
        .eq("storage_pathname", pathname)
        .maybeSingle();

      if (existing) {
        res.status(200).json({
          ok: true,
          photo: { id: existing.id, name: existing.filename, url: existing.blob_url, contentType: existing.content_type },
        });
        return;
      }
    }

    res.status(500).json({ ok: false, error: "db_error" });
    return;
  }

  res.status(200).json({
    ok: true,
    photo: { id: data.id, name: data.filename, url: data.blob_url, contentType: data.content_type },
  });
};
