const crypto = require("crypto");
const { sign } = require("../_lib/auth");

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH; // formato "saltHex:hashHex" (scrypt)
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 ore

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;

  const [saltHex, hashHex] = stored.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = crypto.scryptSync(password, salt, expected.length);

  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
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

  const { username, password } = body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ ok: false, error: "bad_request" });
    return;
  }

  const usernameOk = username === ADMIN_USERNAME;
  const passwordOk = verifyPassword(password, ADMIN_PASSWORD_HASH);

  if (!usernameOk || !passwordOk) {
    res.status(401).json({ ok: false, error: "invalid_credentials" });
    return;
  }

  const token = sign({ role: "admin", exp: Date.now() + SESSION_TTL_MS }, ADMIN_SECRET);

  res.setHeader(
    "Set-Cookie",
    `admin_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  );
  res.status(200).json({ ok: true });
};
