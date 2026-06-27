-- =====================================================================
-- M0 · 03_audit_and_seed.sql
-- Audit logging (spec §6) + the first admin user.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Write-audit trigger.
-- Fires on INSERT/UPDATE/DELETE. entity_type is passed as a trigger arg.
-- SECURITY DEFINER so it can write to audit_log despite RLS.
-- NOTE: SELECT/'view' cannot be captured by triggers in Postgres — those
-- are logged by the app calling log_view() below.
-- ---------------------------------------------------------------------
create or replace function public.write_audit()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_action public.audit_action;
  v_entity uuid;
begin
  if    tg_op = 'INSERT' then v_action := 'create'; v_entity := new.id;
  elsif tg_op = 'UPDATE' then v_action := 'update'; v_entity := new.id;
  elsif tg_op = 'DELETE' then v_action := 'delete'; v_entity := old.id;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id)
  values (auth.uid(), v_action, tg_argv[0], v_entity);

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger audit_patients
  after insert or update or delete on public.patients
  for each row execute function public.write_audit('patient');

create trigger audit_appointments
  after insert or update or delete on public.appointments
  for each row execute function public.write_audit('appointment');

create trigger audit_clinical_notes
  after insert or update or delete on public.clinical_notes
  for each row execute function public.write_audit('clinical_note');

-- ---- View logging (app-driven) --------------------------------------
-- Call from the client when a record is opened:
--   await supabase.rpc('log_view', { p_entity_type: 'patient', p_entity_id: id })
create or replace function public.log_view(p_entity_type text, p_entity_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_active_staff() then
    raise exception 'not authorised';
  end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id)
  values (auth.uid(), 'view', p_entity_type, p_entity_id);
end;
$$;

-- ---- keep appointments.updated_at fresh -----------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

create trigger appointments_touch
  before update on public.appointments
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- Seed the first admin.
-- Chicken-and-egg: there is no admin yet to "create users", so the very
-- first admin must be made out-of-band. Two steps:
--
--   1) Create the auth user (one of):
--        • Supabase dashboard → Authentication → Add user, OR
--        • supabase.auth.admin.createUser({ email, password, email_confirm:true })
--      Copy the resulting user UUID.
--
--   2) Insert the matching profile (replace the UUID below):
-- =====================================================================
-- insert into public.profiles (id, full_name, username, role, is_active)
-- values ('00000000-0000-0000-0000-000000000000', 'Clinic Admin', 'admin', 'admin', true);

-- ---- Optional starter appointment types -----------------------------
insert into public.appointment_types (name, duration_minutes, color, is_active) values
  ('Consultation', 30, '#1F5F54', true),
  ('Follow-up',    15, '#A9681E', true),
  ('Accupuncture',    90, '#B23B3B', true);
