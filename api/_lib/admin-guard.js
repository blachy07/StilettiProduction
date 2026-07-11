const { verify } = require("./auth");

const ADMIN_SECRET = process.env.ADMIN_SECRET;

function getCookie(req, name) {
  const header = req.headers && req.headers.cookie;
  if (!header) return null;
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

// Chiamata come prima riga di ogni route in api/admin/*. Ritorna il payload
// della sessione se valido, altrimenti scrive già la risposta 401 e ritorna null
// (il chiamante deve fare `if (!requireAdmin(req, res)) return;`).
function requireAdmin(req, res) {
  const token = getCookie(req, "admin_session");
  const data = verify(token, ADMIN_SECRET);

  if (!data || data.role !== "admin") {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }

  return data;
}

module.exports = { requireAdmin, getCookie };
