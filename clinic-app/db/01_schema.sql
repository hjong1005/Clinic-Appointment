-- =====================================================================
-- M0 · 01_schema.sql
-- Tables, enums, and indexes for the Clinic Management app (spec §4).
-- Run order: 01_schema  →  02_rls  →  03_audit_and_seed
-- Apply in the Supabase SQL editor or via `supabase db push`.
-- =====================================================================

-- ---- Enums -----------------------------------------------------------
create type public.user_role     as enum ('admin', 'staff');
create type public.audit_action  as enum ('view', 'create', 'update', 'delete');

-- ---- profiles --------------------------------------------------------
-- One row per staff user. `id` mirrors auth.users.id (1:1).
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  username    text not null unique,
  phone       text,
  role        public.user_role not null default 'staff',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---- patients --------------------------------------------------------
create table public.patients (
  id                       uuid primary key default gen_random_uuid(),
  full_name                text not null,
  date_of_birth            date,
  gender                   text,
  phone                    text,
  email                    text,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  is_archived              boolean not null default false,
  created_at               timestamptz not null default now()
);
create index patients_active_name_idx on public.patients (is_archived, full_name);

-- ---- appointment_types ----------------------------------------------
create table public.appointment_types (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  duration_minutes  integer not null default 30,
  color             text,
  is_active         boolean not null default true
);

-- ---- appointments ----------------------------------------------------
create table public.appointments (
  id                   uuid primary key default gen_random_uuid(),
  patient_id           uuid not null references public.patients(id) on delete cascade,
  practitioner_id      uuid not null references public.profiles(id),
  appointment_type_id  uuid references public.appointment_types(id),
  start_time           timestamptz not null,
  end_time             timestamptz not null,
  is_confirmed         boolean not null default false,
  reason               text,
  created_by           uuid not null references public.profiles(id) default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint appt_time_order check (end_time > start_time)
);
create index appointments_start_idx        on public.appointments (start_time);
create index appointments_practitioner_idx on public.appointments (practitioner_id, start_time);
create index appointments_patient_idx      on public.appointments (patient_id);

-- ---- clinical_notes --------------------------------------------------
-- Separate table (spec §4): per-note authorship + the option to re-introduce
-- a clinical/front-desk access split later without restructuring data.
create table public.clinical_notes (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients(id) on delete cascade,
  appointment_id  uuid references public.appointments(id) on delete set null,
  author_id       uuid not null references public.profiles(id) default auth.uid(),
  note_body       text not null,
  created_at      timestamptz not null default now()
);
create index clinical_notes_patient_idx on public.clinical_notes (patient_id, created_at desc);

-- ---- audit_log -------------------------------------------------------
-- Append-only. Written by triggers (create/update/delete) and by a
-- SECURITY DEFINER rpc for 'view' events. No UPDATE/DELETE allowed.
create table public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles(id),
  action       public.audit_action not null,
  entity_type  text not null,          -- 'patient' | 'appointment' | 'clinical_note'
  entity_id    uuid,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx  on public.audit_log (entity_type, entity_id);
