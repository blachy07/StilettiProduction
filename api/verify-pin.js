const { supabase } = require("./_lib/db");
const { sign } = require("./_lib/auth");
const { logEvent } = require("./_lib/activity");

const SECRET = process.env.CONSEGNA_SECRET || "dev-secret-change-me";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 ore
const MAX_FAILED_ATTEMPTS = 8;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minuti

function getClientIp(req) {
  const fwd = req.headers && req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return "unknown";
}

// Blocco anti-bruteforce: un PIN di 6 caratteri ha molte combinazioni possibili,
// ma senza un limite ai tentativi resterebbe comunque indovinabile per forza bruta
// da uno script. Contiamo i fallimenti recenti dello stesso IP nella finestra e
// blocchiamo temporaneamente, senza bisogno di infrastruttura aggiuntiva (Redis ecc.).
async function countRecentFailures(ip) {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "pin_verify_failed")
    .eq("meta->>ip", ip)
    .gte("created_at", since);
  return count || 0;
}

module.exports = async (req, res) => {
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

  const rawPin = body && body.pin;
  if (typeof rawPin !== "string" || !rawPin.trim()) {
    res.status(400).json({ ok: false, error: "bad_request" });
    return;
  }

  const ip = getClientIp(req);
  const pin = rawPin.trim().toUpperCase();

  const failures = await countRecentFailures(ip);
  if (failures >= MAX_FAILED_ATTEMPTS) {
    res.status(429).json({ ok: false, error: "too_many_attempts" });
    return;
  }

  const { data: match } = await supabase
    .from("deliveries")
    .select("*")
    .eq("pin", pin)
    .maybeSingle();

  if (!match || match.status !== "active") {
    await logEvent("pin_verify_failed", { actor: "client", meta: { ip } });
    res.status(401).json({ ok: false, error: "invalid_pin" });
    return;
  }

  if (match.expires_at && new Date(match.expires_at).getTime() < Date.now()) {
    await logEvent("pin_verify_expired", {
      deliveryId: match.id,
      deliverySlug: match.slug,
      actor: "client",
      meta: { ip },
    });
    res.status(410).json({ ok: false, error: "expired" });
    return;
  }

  const token = sign({ slug: match.slug, exp: Date.now() + TOKEN_TTL_MS }, SECRET);

  await logEvent("pin_verify_success", {
    deliveryId: match.id,
    deliverySlug: match.slug,
    actor: "client",
    meta: { ip },
  });

  res.status(200).json({
    ok: true,
    token,
    title: match.title,
    clientName: match.client_name,
  });
};
