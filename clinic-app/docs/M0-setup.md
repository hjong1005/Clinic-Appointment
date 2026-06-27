# M0 — Foundation: setup runbook

This is the milestone everything else rests on (spec §7, M0):
**repo + frontend scaffold, Supabase project, auth + roles, full schema with RLS, seeded admin.**
It is almost entirely backend — the visible app barely changes during M0, which is expected.

The three SQL files are applied in order:

1. `01_schema.sql` — enums, tables, indexes (spec §4)
2. `02_rls.sql` — helper functions + Row-Level Security policies (spec §3)
3. `03_audit_and_seed.sql` — audit triggers, view-logging rpc, admin seed (spec §6)

---

## 1. Create the Supabase project

- New project → note the **Project URL** and **anon public key** (frontend) and the **service-role key** (server/admin scripts only — never ship this to the browser).
- SQL editor → run the three files in order. Each is idempotent enough to read top-to-bottom; if you re-run, drop the schema first.

## 2. Configure Auth

- **Username + password.** Supabase Auth is email-based, so map "username" to a synthetic email (`username@clinic.local`) or enable a username flow; store the human username in `profiles.username`.
- **Password strength** is enforced at account creation in Auth settings (min length, complexity).
- **MFA for admins (spec §5.1, §6).** Enable TOTP in Auth → MFA. Enforce it in the app by checking the session's assurance level (`aal2`) before allowing admin screens; optionally gate admin RLS later on `auth.jwt()->>'aal'`.
- **Session timeout (spec §6).** Set a short JWT expiry and refresh window, and add an idle-timeout auto-logout in the client.

## 3. Seed the first admin

There is no admin yet to "create users," so the first one is made out-of-band:

1. Create the auth user (dashboard *Add user*, or `supabase.auth.admin.createUser` with the service-role key).
2. Uncomment the `insert into public.profiles ...` block at the bottom of `03_audit_and_seed.sql`, paste the new user's UUID, and run it.

After this, that admin creates all further users through the app (spec §5.7): create the auth user via an admin-only server function, then insert the matching `profiles` row with the chosen role.

## 4. Frontend scaffold

The uploaded `clients.html` is a good visual starting point — the calendar, list/detail layout, and modals can be reused as the shell. The change M0 forces is the **data layer**: every `window.storage` read/write becomes a Supabase call, and the local PIN screen is replaced by real auth.

```js
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// login (username mapped to synthetic email)
await supabase.auth.signInWithPassword({ email, password })

// who am I? — drives which controls to show (UX only; RLS is the real gate)
const { data: me } = await supabase
  .from('profiles').select('role, is_active').eq('id', user.id).single()

// patients list (RLS returns only what this user may see)
const { data: patients } = await supabase
  .from('patients').select('*').eq('is_archived', false).order('full_name')

// log a view for the audit trail
await supabase.rpc('log_view', { p_entity_type: 'patient', p_entity_id: id })
```

The important mental shift: hiding a button in the UI is **not** a permission. The policies in `02_rls.sql` are what actually stop a Staff user from, say, reading the audit log — even if they hand-craft the API call.

---

## How this maps to the §3 permission matrix

| Capability | Enforced by |
|---|---|
| Admin vs Staff split | `is_admin()` / `is_active_staff()` helpers used in every policy |
| Staff edit **own** clinical notes only | `notes_update` → `is_admin() or author_id = auth.uid()` |
| Manage users / settings / audit log = admin | `profiles_*` writes, `appt_types_write`, `audit_select` all gated on `is_admin()` |
| Deactivated users lose all access | every helper requires `is_active = true` |
| Hard delete is admin-only and logged | `patients_delete` → `is_admin()`; `audit_patients` trigger records it |

## What M0 deliberately does *not* include

Carried into M1–M3, not M0: the patient list/detail UI, the calendar wiring, the dashboard, the user-management and settings screens, and surfacing the audit log for admins. Also out of v1 entirely (spec §8): reminders, self-service booking, reporting, billing, attachments, multi-location.

## Acceptance checks for "M0 done"

- A seeded admin can log in; MFA is required for that login.
- A Staff user logging in **cannot** select from `audit_log` or insert into `profiles` (RLS denies it at the API, not just the UI).
- Creating/editing/deleting a patient, appointment, or note writes a row to `audit_log`.
- A Staff user can edit their own note but not another author's.
- A deactivated user can authenticate but every table query returns nothing / is denied.
