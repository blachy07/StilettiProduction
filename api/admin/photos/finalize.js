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

  const { deliveryId, blobUrl, pathname, filename, contentType, size } = body || {};
  if (!deliveryId || !blobUrl || !pathname || !filename) {
    res.status(400).json({ ok: false, error: "bad_request" });
    return;
  }

  const { data: maxRow } = await supabase
    .from("photos")
    .select("position")
    .eq("delivery_id", deliveryId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = maxRow ? maxRow.position + 1000 : 1000;

  const { data, error } = await supabase
    .from("photos")
    .insert({
      delivery_id: deliveryId,
      blob_url: blobUrl,
      storage_pathname: pathname,
      filename,
      content_type: contentType || null,
      size_bytes: size || null,
      position: nextPosition,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ ok: false, error: "db_error" });
    return;
  }

  res.status(200).json({
    ok: true,
    photo: { id: data.id, name: data.filename, url: data.blob_url, contentType: data.content_type },
  });
};
