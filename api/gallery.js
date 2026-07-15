const { supabase } = require("./_lib/db");
const { verify } = require("./_lib/auth");
const { logEvent } = require("./_lib/activity");

const SECRET = process.env.CONSEGNA_SECRET || "dev-secret-change-me";

module.exports = async (req, res) => {
  const token = req.query && req.query.token;
  const data = verify(token, SECRET);

  if (!data) {
    res.status(401).json({ ok: false, error: "invalid_or_expired_token" });
    return;
  }

  const { data: delivery } = await supabase
    .from("deliveries")
    .select("*")
    .eq("slug", data.slug)
    .maybeSingle();

  if (!delivery || delivery.status !== "active") {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }

  if (delivery.expires_at && new Date(delivery.expires_at).getTime() < Date.now()) {
    res.status(410).json({ ok: false, error: "expired" });
    return;
  }

  const { data: photos } = await supabase
    .from("photos")
    .select("*")
    .eq("delivery_id", delivery.id)
    .order("position", { ascending: true });

  await supabase
    .from("deliveries")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("id", delivery.id);

  await logEvent("gallery_viewed", {
    deliveryId: delivery.id,
    deliverySlug: delivery.slug,
    actor: "client",
  });

  const images = (photos || []).map((p) => ({
    id: p.id,
    name: p.filename,
    url: p.blob_url,
    // Fallback sull'originale se manca (video, o foto caricate prima
    // dell'introduzione della preview, o generazione preview fallita).
    previewUrl: p.preview_url || p.blob_url,
  }));

  res.status(200).json({
    ok: true,
    title: delivery.title,
    clientName: delivery.client_name,
    images,
  });
};
