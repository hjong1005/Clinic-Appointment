# M3 — Dashboard & admin: build notes

M3 completes v1: the dashboard everyone lands on, plus the admin-only
screens for user management, clinic settings + appointment types, and the
audit log (spec §5.2, §5.7, §5.8, §6). This is where the admin/staff
boundary from M0 finally gets a face.

Files:

- `m3-schema.sql` — the one new table, `clinic_settings` (single-row, admin-write). Run it after M0 + M1. `appointment_types` and `audit_log` already exist from M0 with the right policies.
- `m3-data.js` — admin + dashboard data layer, reusing the client/auth from `m1-data.js` and the calendar read from `m2-data.js`.
- `m3-admin.html` — the UI. A top-nav app: **Dashboard** (all roles) and, for admins only, **Users**, **Settings**, **Audit log**.
- `create-user-function.ts` — a Supabase Edge Function for provisioning logins (see the constraint below).
- Mock support is in the shared `m1-mock.js`, so the whole admin area is clickable offline.

## The one real constraint: creating logins

Everything in M3 is browser-safe except *creating a new auth user*. That needs the **service-role key**, which must never reach the browser. So account creation runs server-side in `create-user-function.ts`, and the Users screen calls it via `supabase.functions.invoke('create-user', …)`. The function:

1. checks the **caller** is an active admin (the service-role key bypasses RLS, so it verifies the role itself rather than trusting it),
2. creates the auth user with the `username@clinic.local` convention,
3. inserts the `profiles` row — and rolls back the auth user if that insert fails, so you never get an orphan.

Deploy it with `supabase functions deploy create-user`. Everything else — setting roles, deactivating users, editing settings and types, reading the audit log — is a normal table write/read gated by M0 RLS.

In demo mode there's no Edge Function, so "Add user" just appends a row, which is enough to see the flow.

## What maps to the spec

| Spec | Where |
|---|---|
| §5.2 today's appointments, confirmed status | Dashboard "Today's schedule" panel with a Confirmed/Unconfirmed pill |
| §5.2 quick stats (today, upcoming this week) | the two stat cards from `getDashboard()` |
| §5.2 quick actions | buttons linking to the patients and calendar pages |
| §5.7 create users, set roles, deactivate | Users table: role dropdown, active toggle, Add-user modal → Edge Function |
| §5.8 clinic profile (name, address, hours) | Settings → clinic profile form → `clinic_settings` |
| §5.8 manage appointment types (name, duration, colour) | Settings → types table with add/edit and active toggle |
| §6 audit log surfaced to admins | Audit log table (time, actor, action, entity, id); read is admin-only via RLS |

## Verification

Run and tested against the mock:

- **Admin path** — dashboard stats + today list, user listing, role change, user creation, settings load/save, type listing/creation, audit read, and audit filtering all pass.
- **Staff path** — flipping the mock identity to staff, every admin-only call (`createUser`, `setUserRole`, `setUserActive`, `saveClinicSettings`, `createType`, `listAuditLog`) is rejected, while the dashboard still loads. This is the same allow/deny split RLS enforces on the real backend.

Pending, as with M1/M2: the live Supabase path (and the Edge Function) are wired and syntax-clean but haven't been executed against a real project from here. MFA-for-admins (spec §5.1) is configured in Supabase Auth and enforced at the app/session level — it isn't a code artifact in these files.

## v1 is now feature-complete (in sketch)

With M0–M3, every §1 success criterion is represented: secure role-based login, patient records, calendar scheduling with confirm, clinical notes with the admin/staff boundary, and an audit log. What remains is the repo assembly — folder structure, top-level README, and the one consolidation (the multi-milestone mock is still named `m1-mock.js`).
