const { createClient } = require("@supabase/supabase-js");

// Client condiviso, usato solo lato server (mai esposto al browser). Usa la
// service-role key, che scavalca la Row Level Security attivata sulle tabelle
// in supabase/migrations/0001_init.sql — per questo non deve MAI finire in
// codice eseguito nel browser, solo dentro le Vercel Functions in api/.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

module.exports = { supabase };
