-- Schema iniziale per il sistema di Consegna (deliveries + photos + activity_log).
-- Esegui questo file per intero nell'SQL Editor di Supabase, una sola volta.

create extension if not exists pgcrypto;

create table deliveries (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  client_name       text not null,
  title             text not null,
  pin               text not null unique,
  notes             text,
  status            text not null default 'active',
  expires_at        timestamptz,
  download_count    integer not null default 0,
  last_accessed_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table photos (
  id                uuid primary key default gen_random_uuid(),
  delivery_id       uuid not null references deliveries(id) on delete cascade,
  blob_url          text not null,
  storage_pathname  text not null unique,
  filename          text not null,
  content_type      text,
  size_bytes        bigint,
  position          double precision not null,
  is_cover          boolean not null default false,
  download_count    integer not null default 0,
  created_at        timestamptz not null default now()
);

create unique index one_cover_per_delivery on photos (delivery_id) where is_cover;
create index photos_delivery_position_idx on photos (delivery_id, position);

create table activity_log (
  id                bigserial primary key,
  delivery_id       uuid references deliveries(id) on delete set null,
  delivery_slug     text,
  event_type        text not null,
  actor             text not null,
  meta              jsonb,
  created_at        timestamptz not null default now()
);

create index activity_log_delivery_idx on activity_log (delivery_id, created_at desc);
create index activity_log_created_idx on activity_log (created_at desc);

-- Difesa in profondità: RLS attiva ma senza policy = accesso negato di default
-- per i ruoli anon/authenticated. Solo la service-role key (usata esclusivamente
-- lato server nelle Vercel Functions, mai nel browser) bypassa RLS per design.
alter table deliveries enable row level security;
alter table photos enable row level security;
alter table activity_log enable row level security;
