# The Client Book — Clinic Management (v1)

A secure, multi-user web app for a small clinic (2–10 staff): role-based login,
patient records, calendar scheduling, clinical notes, and an audit log.
Built to `docs/clinic-app-v1-spec.md`.

The frontend is plain HTML/JS with **no build step**. The backend is **Supabase**
(Postgres + Auth + Row-Level Security). The defining principle: **all access
rules are enforced in the database via RLS** — the UI only hides controls for
tidiness, it is never the gatekeeper.

---

## Repository layout

```
clinic-app/
├── README.md
├── db/                         # ordered SQL migrations — run in sequence
│   ├── 01_schema.sql           # tables + enums
│   ├── 02_rls.sql              # row-level security policies (the real gate)
│   ├── 03_audit_and_seed.sql   # audit triggers, view-logging rpc, first admin
│   ├── 04_views.sql            # patient_summary + parameterized search
│   └── 05_clinic_settings.sql  # clinic profile table
├── web/                        # the app — serve this folder over http
│   ├── index.html              # landing / launcher
│   ├── patients.html           # patient records + clinical notes (M1)
│   ├── calendar.html           # appointments calendar (M2)
│   ├── admin.html              # dashboard + admin screens (M3)
│   ├── config.js               # ← put your Supabase keys here
│   ├── data-core.js            # auth, patients, clinical notes
│   ├── data-appointments.js    # appointments
│   ├── data-admin.js           # users, settings, audit, dashboard
│   └── mock.js                 # in-memory demo data (no backend needed)
├── scripts/
│   └── seed-users.mjs          # create test users (admin + staff)
├── supabase/functions/create-user/
│   └── index.ts                # Edge Function: provision logins (admin only)
└── docs/
    ├── clinic-app-v1-spec.md   # the product spec
    └── M0–M3 build notes
```

---

## Try it now (no backend)

With no keys configured the app runs in **demo mode** on sample data:

```bash
cd web
python3 -m http.server 8000      # or: npx serve
# open http://localhost:8000/index.html
```

Click through patients, the calendar, and the dashboard. Nothing is saved.
To preview the restricted **Staff** experience, set `ME.role = 'staff'` near the
top of `web/mock.js` and reload — Delete controls vanish and the admin screens
disappear, mirroring what RLS does live.

> Serve over http — ES module imports don't run from a `file://` path.

---

## Full setup (live)

### Prerequisites
- A Supabase project (free tier is fine)
- Node 18+ (for the seed script)
- Supabase CLI (only for the Edge Function)

### 1. Database

Set up the database in your Supabase project before running the application.

1. Open your Supabase project and navigate to **SQL Editor**.
2. Execute the SQL scripts located in the `db/` directory **in the following order**:

   * `01_schema.sql`
   * `02_rls.sql`
   * `03_audit_and_seed.sql`
   * `04_views.sql`
   * `05_clinic_settings.sql`
3. For each file:

   * Create a new SQL query in the SQL Editor.
   * Copy and paste the contents of the SQL file.
   * Click **Run** (or press **Cmd + Enter** on macOS).
   * Ensure the script executes successfully before proceeding to the next file.
4. Verify the database setup:

   * Navigate to **Table Editor** in the Supabase dashboard.
   * Confirm that the expected tables have been created.
   * If `03_audit_and_seed.sql` includes seed data, verify that the corresponding tables contain the expected sample records.
   * Ensure no errors were reported while executing any of the SQL scripts.

> **Note:** The SQL scripts must be executed in the specified order, as each script may depend on database objects created by the preceding scripts.


### 2. Auth settings
- **Username login** maps to a synthetic email, `username@clinic.local`. Users are created with that scheme (see steps 3–4), so signing in with `admin` resolves to `admin@clinic.local`.
- Turn on **password strength** requirements.
- Enable **MFA (TOTP)** and require it for admin accounts (spec §5.1, §6).
- Set a short **session timeout** for auto-logout on inactivity.

### 3. Seed the first users
There's no admin yet to create users in-app, so bootstrap from your machine:

```bash
cd scripts
npm init -y && npm install @supabase/supabase-js
export SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"   # secret — never commit
node seed-users.mjs
```

Creates `admin` / `Passw0rd!admin` and `sam` / `Passw0rd!staff`.
(Alternatively: create one auth user in the dashboard and run the seed insert at the bottom of `db/03_audit_and_seed.sql`.)

### 4. Deploy the create-user function (for in-app account creation)
Only the Admin → Users **“Add user”** button needs this; role and active-status
changes don't.

```bash
supabase functions deploy create-user
```

### 5. Frontend config
Edit `web/config.js` with your **Project URL** and **anon key**
(Settings → API). The anon key is public — RLS protects the data.

### 6. Serve & sign in
```bash
cd web && python3 -m http.server 8000
# open http://localhost:8000/index.html and sign in
```

Because Supabase persists the session, signing in on one page carries across all three.

---

## Verify the security boundary

The point of the architecture is that permissions live in Postgres, not the UI.
Confirm it:

1. Sign in as **sam** (staff): no Delete controls on records, and Users/Settings/Audit are hidden.
2. Prove the database — not the UI — is enforcing it. In the browser console:
   ```js
   await (await import('./data-core.js')).deleteNote('<some-note-id>')
   // → rejected by RLS, even though you bypassed the interface
   ```

---

## How it's built (milestones)

- **M0 — Foundation:** schema, RLS, auth, seeded admin — `docs/M0-setup.md`
- **M1 — Patients:** records, search, archive, clinical notes — `docs/M1-build.md`
- **M2 — Appointments:** day/week/month calendar, confirm, cancel — `docs/M2-build.md`
- **M3 — Dashboard & admin:** stats, users, settings, audit log — `docs/M3-build.md`

---

## Status (honest)

- The **in-memory mock path is run and tested**, including the admin/staff role split (staff is rejected from every admin operation; the dashboard still loads).
- The **live Supabase path** is syntax-clean and wired against the schema, but has **not yet been executed against a real project end-to-end** from the authoring environment. The setup steps above are the way to close that gap. The `username→email` convention and the Edge Function are likewise unrun until a live bring-up.

---

## Security & compliance (Singapore PDPA-aware)

RLS on every table; an append-only audit log; soft-delete via archive (hard delete
is admin-only and logged); MFA for admins; a deliberately minimal patient record.
This is product guidance, **not legal advice** — confirm PDPA and any MOH /
health-records obligations with a qualified advisor before handling real patient
data. See `docs/clinic-app-v1-spec.md` §6.

## Out of scope (v2+)

Automated reminders/confirmations, patient self-service booking, reporting/exports,
billing, file attachments, and multi-location support.
