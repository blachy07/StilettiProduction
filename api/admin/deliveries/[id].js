const { supabase } = require("../../_lib/db");
const { requireAdmin } = require("../../_lib/admin-guard");

const BUCKET = "deliveries";

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const id = req.query && req.query.id;
  if (!id) {
    res.status(400).json({ ok: false, error: "bad_request" });
    return;
  }

  if (req.method === "GET") {
    const { data: delivery } = await supabase.from("deliveries").select("*").eq("id", id).maybeSingle();
    if (!delivery) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }

    const { data: photos } = await supabase
      .from("photos")
      .select("*")
      .eq("delivery_id", id)
      .order("position", { ascending: true });

    res.status(200).json({
      ok: true,
      delivery: {
        id: delivery.id,
        slug: delivery.slug,
        clientName: delivery.client_name,
        title: delivery.title,
        pin: delivery.pin,
        status: delivery.status,
        expiresAt: delivery.expires_at,
        notes: delivery.notes,
        createdAt: delivery.created_at,
        lastAccessedAt: delivery.last_accessed_at,
        downloadCount: delivery.download_count,
      },
      photos: (photos || []).map((p) => ({
        id: p.id,
        name: p.filename,
        url: p.blob_url,
        contentType: p.content_type,
        sizeBytes: p.size_bytes,
      })),
    });
    return;
  }

  if (req.method === "PATCH") {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }
    body = body || {};

    const updates = { updated_at: new Date().toISOString() };
    if (typeof body.clientName === "string") updates.client_name = body.clientName.trim();
    if (typeof body.title === "string") updates.title = body.title.trim();
    if (typeof body.pin === "string" && body.pin.trim()) updates.pin = body.pin.trim().toUpperCase();
    if (typeof body.notes === "string") updates.notes = body.notes;
    if (body.expiresAt !== undefined) updates.expires_at = body.expiresAt || null;
    if (typeof body.status === "string") updates.status = body.status;

    const { data, error } = await supabase.from("deliveries").update(updates).eq("id", id).select().single();

    if (error) {
      if (error.code === "23505") {
        res.status(409).json({ ok: false, error: "pin_taken" });
        return;
      }
      res.status(500).json({ ok: false, error: "db_error" });
      return;
    }

    res.status(200).json({
      ok: true,
      delivery: {
        id: data.id,
        clientName: data.client_name,
        title: data.title,
        pin: data.pin,
        status: data.status,
        expiresAt: data.expires_at,
      },
    });
    return;
  }

  if (req.method === "DELETE") {
    const { data: photos } = await supabase
      .from("photos")
      .select("storage_pathname, preview_pathname")
      .eq("delivery_id", id);

    if (photos && photos.length) {
      const paths = photos.flatMap((p) => [p.storage_pathname, p.preview_pathname]).filter(Boolean);
      if (paths.length) {
        try {
          await supabase.storage.from(BUCKET).remove(paths);
        } catch {
          // best-effort: non blocca l'eliminazione della consegna dal database
        }
      }
    }

    const { error } = await supabase.from("deliveries").delete().eq("id", id);
    if (error) {
      res.status(500).json({ ok: false, error: "db_error" });
      return;
    }

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ ok: false, error: "method_not_allowed" });
};
