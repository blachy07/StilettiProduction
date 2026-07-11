const crypto = require("crypto");
const { supabase } = require("../../_lib/db");
const { requireAdmin } = require("../../_lib/admin-guard");

function makeSlug() {
  return crypto.randomBytes(6).toString("hex");
}

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("deliveries")
      .select("*, photos(count)")
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ ok: false, error: "db_error" });
      return;
    }

    const deliveries = (data || []).map((d) => ({
      id: d.id,
      slug: d.slug,
      clientName: d.client_name,
      title: d.title,
      pin: d.pin,
      status: d.status,
      expiresAt: d.expires_at,
      createdAt: d.created_at,
      lastAccessedAt: d.last_accessed_at,
      photoCount: (d.photos && d.photos[0] && d.photos[0].count) || 0,
    }));

    res.status(200).json({ ok: true, deliveries });
    return;
  }

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }

    const { clientName, title, pin, expiresAt, notes } = body || {};

    if (typeof clientName !== "string" || !clientName.trim() || typeof title !== "string" || !title.trim()) {
      res.status(400).json({ ok: false, error: "bad_request" });
      return;
    }
    if (typeof pin !== "string" || !pin.trim()) {
      res.status(400).json({ ok: false, error: "missing_pin" });
      return;
    }

    const slug = makeSlug();

    const { data, error } = await supabase
      .from("deliveries")
      .insert({
        slug,
        client_name: clientName.trim(),
        title: title.trim(),
        pin: pin.trim().toUpperCase(),
        notes: notes || null,
        expires_at: expiresAt || null,
        status: "active",
      })
      .select()
      .single();

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
        slug: data.slug,
        clientName: data.client_name,
        title: data.title,
        pin: data.pin,
        status: data.status,
        expiresAt: data.expires_at,
        createdAt: data.created_at,
      },
    });
    return;
  }

  res.status(405).json({ ok: false, error: "method_not_allowed" });
};
