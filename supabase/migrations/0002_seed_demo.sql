-- Inserisce la consegna demo esistente nel nuovo database, per verificare che il
-- flusso PIN -> galleria funzioni su Supabase prima di costruire l'upload su Blob.
-- Le foto puntano ancora ai file statici in consegne/ (percorso "legacy/..." nello
-- storage_pathname per non entrare in conflitto con i veri pathname di Vercel Blob
-- che verranno creati a partire dalla Fase 2). Esegui questo file nell'SQL Editor
-- di Supabase DOPO aver eseguito 0001_init.sql.

with new_delivery as (
  insert into deliveries (slug, client_name, title, pin, status)
  values (
    'esempio-40esimo',
    'Cliente di Esempio',
    '40° Esimo — Galleria Cliente',
    'K7XM3Q',
    'active'
  )
  returning id
)
insert into photos (delivery_id, blob_url, storage_pathname, filename, position)
select new_delivery.id, v.blob_url, v.storage_pathname, v.filename, v.position
from new_delivery,
  (values
    ('/consegne/esempio-40esimo/DSC03629.webp', 'legacy/esempio-40esimo/DSC03629.webp', 'DSC03629.webp', 1000::double precision),
    ('/consegne/esempio-40esimo/DSC03638.webp', 'legacy/esempio-40esimo/DSC03638.webp', 'DSC03638.webp', 2000::double precision),
    ('/consegne/esempio-40esimo/DSC03672.webp', 'legacy/esempio-40esimo/DSC03672.webp', 'DSC03672.webp', 3000::double precision)
  ) as v(blob_url, storage_pathname, filename, position);
