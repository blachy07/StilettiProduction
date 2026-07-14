const { requireAdmin } = require("../_lib/admin-guard");

// Il browser carica @vercel/blob/client da CDN (esm.sh) per poter fare upload
// diretto senza un bundler. Il protocollo di token tra client e server è
// specifico della versione: se il client usasse una versione diversa da
// quella realmente installata lato server (es. "@latest" risolto in momenti
// diversi sui due lati), la generazione del token riesce ma la richiesta
// finale verso lo storage Vercel viene rifiutata con 400 — esattamente il
// sintomo osservato. Questo endpoint espone la versione ESATTA installata
// lato server, così il client può caricare da CDN quella stessa versione,
// eliminando la possibilità di disallineamento invece di limitarsi a
// indovinare un numero fisso.
module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  let version = null;
  try {
    version = require("@vercel/blob/package.json").version;
  } catch {
    version = null;
  }

  res.status(200).json({ ok: true, version });
};
