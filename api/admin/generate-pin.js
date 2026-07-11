const { supabase } = require("../_lib/db");
const { requireAdmin } = require("../_lib/admin-guard");

// Niente 0/O/1/I/L per evitare ambiguità quando il PIN viene letto/scritto a mano.
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 6;

function randomPin() {
  let pin = "";
  for (let i = 0; i < LENGTH; i++) {
    pin += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return pin;
}

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  for (let attempt = 0; attempt < 20; attempt++) {
    const pin = randomPin();
    const { data } = await supabase.from("deliveries").select("id").eq("pin", pin).maybeSingle();
    if (!data) {
      res.status(200).json({ ok: true, pin });
      return;
    }
  }

  res.status(500).json({ ok: false, error: "could_not_generate_pin" });
};
