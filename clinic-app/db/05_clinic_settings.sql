-- =====================================================================
-- M3 · m3-schema.sql
-- The only new table M3 needs. Clinic profile for the settings screen
-- (spec §5.8). appointment_types and audit_log already exist from M0,
-- and their policies (admin-write types, admin-read audit) already cover
-- what M3's admin screens require.
--
-- Run after the M0 + M1 SQL.
-- =====================================================================

-- Single-row table: the boolean PK defaulting to true + the check
-- constraint means there can only ever be one settings row.
create table public.clinic_settings (
  id          boolean primary key default true,
  clinic_name text,
  address     text,
  hours       text,
  updated_at  timestamptz not null default now(),
  constraint clinic_settings_singleton check (id)
);

alter table public.clinic_settings enable row level security;

-- All active staff may read the clinic profile; only admins may change it.
create policy clinic_settings_select on public.clinic_settings
  for select using (is_active_staff());

create policy clinic_settings_write on public.clinic_settings
  for all using (is_admin()) with check (is_admin());

-- Seed the single row (runs as owner, bypasses RLS).
insert into public.clinic_settings (id, clinic_name, address, hours)
values (true, 'My Clinic', '', '')
on conflict (id) do nothing;
