const crypto = require("crypto");
const deliveries = require("./_data/deliveries.json");

const SECRET = process.env.CONSEGNA_SECRET || "dev-secret-change-me";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 ore

function toBase64Url(base64) {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(payloadObj) {
  const payload = toBase64Url(Buffer.from(JSON.stringify(payloadObj)).toString("base64"));
  const sig = toBase64Url(crypto.createHmac("sha256", SECRET).update(payload).digest("base64"));
  return `${payload}.${sig}`;
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

  const pin = body && body.pin;
  if (typeof pin !== "string" || !pin.trim()) {
    res.status(400).json({ ok: false, error: "bad_request" });
    return;
  }

  const match = deliveries.find((d) => d.pin === pin.trim());
  if (!match) {
    res.status(401).json({ ok: false, error: "invalid_pin" });
    return;
  }

  const token = sign({ slug: match.slug, exp: Date.now() + TOKEN_TTL_MS });

  res.status(200).json({
    ok: true,
    token,
    title: match.title,
    clientName: match.clientName,
  });
};
