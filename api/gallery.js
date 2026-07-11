const crypto = require("crypto");
const deliveries = require("./_data/deliveries.json");

const SECRET = process.env.CONSEGNA_SECRET || "dev-secret-change-me";

function toBase64Url(base64) {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(base64url) {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function verify(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;

  const [payload, sig] = token.split(".");
  const expected = toBase64Url(crypto.createHmac("sha256", SECRET).update(payload).digest("base64"));

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const data = JSON.parse(fromBase64Url(payload).toString("utf8"));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  const token = req.query && req.query.token;
  const data = verify(token);

  if (!data) {
    res.status(401).json({ ok: false, error: "invalid_or_expired_token" });
    return;
  }

  const match = deliveries.find((d) => d.slug === data.slug);
  if (!match) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }

  const images = match.images.map((name) => ({
    name,
    url: `/consegne/${encodeURIComponent(match.folder)}/${encodeURIComponent(name)}`,
  }));

  res.status(200).json({
    ok: true,
    title: match.title,
    clientName: match.clientName,
    images,
  });
};
