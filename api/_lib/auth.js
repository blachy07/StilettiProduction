const crypto = require("crypto");

function toBase64Url(base64) {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(base64url) {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

// Firma un payload JSON come "<payload-base64url>.<firma-base64url>" usando HMAC-SHA256.
// Usato sia per i token di accesso PIN dei clienti sia (con un secret diverso) per i
// cookie di sessione admin: la firma garantisce che il payload non sia stato alterato
// e che sia stato emesso da chi conosce il secret, senza bisogno di uno store lato server.
function sign(payloadObj, secret) {
  const payload = toBase64Url(Buffer.from(JSON.stringify(payloadObj)).toString("base64"));
  const sig = toBase64Url(crypto.createHmac("sha256", secret).update(payload).digest("base64"));
  return `${payload}.${sig}`;
}

// Verifica firma + scadenza (`exp`, timestamp in ms). Ritorna il payload se valido, altrimenti null.
// Il confronto della firma usa crypto.timingSafeEqual per evitare timing attack.
function verify(token, secret) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;

  const [payload, sig] = token.split(".");
  const expected = toBase64Url(crypto.createHmac("sha256", secret).update(payload).digest("base64"));

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

module.exports = { sign, verify };
