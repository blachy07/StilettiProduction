const { supabase } = require("./db");

// Il log attività è best-effort: un suo fallimento (es. rete, tabella momentaneamente
// non raggiungibile) non deve mai bloccare il flusso principale (verifica PIN, galleria).
async function logEvent(eventType, { deliveryId = null, deliverySlug = null, actor, meta = null } = {}) {
  try {
    await supabase.from("activity_log").insert({
      event_type: eventType,
      delivery_id: deliveryId,
      delivery_slug: deliverySlug,
      actor,
      meta,
    });
  } catch {
    // ignorato di proposito
  }
}

module.exports = { logEvent };
