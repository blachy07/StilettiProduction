-- Versione compressa (preview) delle foto, generata lato client al momento
-- dell'upload e usata solo per la visualizzazione nella galleria del cliente.
-- Il file originale (blob_url/storage_pathname) resta invariato ed è quello
-- usato per il download. Nullable: i video non hanno una preview, e le foto
-- caricate prima di questa modifica non ne hanno una (fallback sull'originale
-- gestito lato applicazione, non qui).
alter table photos add column preview_url text;
alter table photos add column preview_pathname text unique;
