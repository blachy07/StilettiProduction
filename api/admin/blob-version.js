const fs = require("fs");
const { requireAdmin } = require("../_lib/admin-guard");

// require("@vercel/blob/package.json") falliva silenziosamente: sotto Node
// moderno, un pacchetto con un campo "exports" nel proprio package.json
// blocca il require di qualunque sottopercorso non esplicitamente elencato
// (probabilmente "./package.json" non lo è). Qui bypassiamo il problema
// leggendo il file direttamente da filesystem — non è una risoluzione di
// modulo, quindi la restrizione "exports" non si applica.
function findInstalledVersion(pkgName) {
  const resolvedEntry = require.resolve(pkgName); // "." è sempre esportato: questo require è permesso
  const marker = `/node_modules/${pkgName}/`;
  const idx = resolvedEntry.indexOf(marker);
  if (idx === -1) return null;
  const pkgJsonPath = resolvedEntry.slice(0, idx + marker.length) + "package.json";
  return JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")).version;
}

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  let version = null;
  let debugError = null;
  try {
    version = findInstalledVersion("@vercel/blob");
  } catch (err) {
    debugError = err && err.message;
  }

  // --- LOG TEMPORANEO DI DEBUG: rimuovere una volta trovata la causa del 400 ---
  console.log("[blob-version DEBUG] version:", version, "debugError:", debugError);
  // --- FINE LOG TEMPORANEO ---

  res.status(200).json({ ok: true, version, debugError });
};
