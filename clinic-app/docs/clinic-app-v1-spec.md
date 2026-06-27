# Clinic Management Web App — v1 Product Specification

**Status:** Draft for build
**Owner:** Product
**Scope:** v1 (MVP). Items beyond v1 are listed under "Out of scope" at the end.

---

## 1. Goal

A secure, multi-user web application for a small clinic (2–10 staff) to manage patient records and appointments. Access is restricted to authorised staff, and what each person can see and do depends on their role.

**v1 success criteria**

- Staff can log in securely with role-appropriate access.
- A patient record can be created, found, viewed, and edited.
- An appointment can be booked, viewed on a calendar, and confirmed; changes and cancellations are made manually.
- Clinical notes are recorded against patients, with the only access boundary being Admin vs Staff.
- Every meaningful action is recorded in an audit log.

---

## 2. Architecture

| Layer | Choice | Why |
|---|---|---|
| Code & version control | GitHub repository | As requested; standard workflow |
| Frontend hosting | GitHub Pages, Netlify, or Vercel | Static hosting for the UI |
| Frontend framework | React (or plain HTML/JS if preferred) | Component-based, well-supported |
| Auth + database | **Supabase** (Postgres + Auth + Row-Level Security) | Server-side enforced permissions; SQL fits structured records; generous free tier |
| Notifications (v2) | Supabase + email/SMS provider | Deferred to v2 |

**Key principle:** all access rules are enforced **server-side** via Supabase Row-Level Security (RLS), never only in the browser. The frontend hides controls for UX, but the database is the real gatekeeper.

---

## 3. Roles & permissions

Two roles in v1.

| Capability | Admin | Staff |
|---|:---:|:---:|
| Log in | ✅ | ✅ |
| View patient demographics | ✅ | ✅ |
| Create / edit patient demographics | ✅ | ✅ |
| Archive / restore patient | ✅ | ✅ |
| View clinical notes | ✅ | ✅ |
| Create / edit clinical notes | ✅ | ✅ (own) |
| View appointments | ✅ | ✅ |
| Create / reschedule / cancel appointments | ✅ | ✅ |
| Manage users (create manually, deactivate, set roles) | ✅ | ❌ |
| Manage clinic settings & appointment types | ✅ | ❌ |
| View audit log | ✅ | ❌ |

Notes:
- **Staff** is a single combined role covering both clinical and front-desk duties. All staff can view and create clinical notes; there is no front-desk/clinical separation in v1. If a privacy boundary is needed later, splitting Staff back into two roles is a straightforward change because clinical notes already live in their own table (see §4).
- "Own" clinical notes = notes authored by that staff member. Any staff member can read all notes but edits only their own (configurable).
- The only access boundary in v1 is **Admin vs Staff**: Admin adds user management, clinic settings, and the audit log on top of everything Staff can do. This boundary must be enforced with RLS, not just hidden in the UI.

---

## 4. Data model

Field types are indicative (Postgres). `id` columns are UUIDs. Timestamps are `timestamptz`.

### `profiles`
Extends Supabase Auth. One row per staff user.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | matches auth user id |
| full_name | text | |
| username | text | unique; login identifier |
| phone | text | |
| role | enum | `admin` / `staff` |
| is_active | boolean | deactivate instead of delete |
| created_at | timestamptz | |

### `patients`

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| full_name | text | |
| date_of_birth | date | |
| gender | text | |
| phone | text | |
| email | text | |
| emergency_contact_name | text | |
| emergency_contact_phone | text | |
| is_archived | boolean | soft delete; default false |
| created_at | timestamptz | |

### `clinical_notes`
Kept in a separate table for clean structure, per-note audit, and to keep the option open of re-introducing a clinical/front-desk access split later without restructuring data.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| patient_id | uuid (FK → patients) | |
| appointment_id | uuid (FK → appointments) | nullable |
| author_id | uuid (FK → profiles) | |
| note_body | text | |
| created_at | timestamptz | |

### `appointment_types`

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | e.g. "Consultation", "Follow-up" |
| duration_minutes | integer | default slot length |
| color | text | calendar display |
| is_active | boolean | |

### `appointments`

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| patient_id | uuid (FK → patients) | |
| practitioner_id | uuid (FK → profiles) | |
| appointment_type_id | uuid (FK → appointment_types) | |
| start_time | timestamptz | |
| end_time | timestamptz | |
| is_confirmed | boolean | confirmed or not; default false |
| reason | text | chief complaint / purpose |
| created_by | uuid (FK → profiles) | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `audit_log`

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| actor_id | uuid (FK → profiles) | |
| action | enum | `view` / `create` / `update` / `delete` |
| entity_type | text | e.g. `patient`, `appointment`, `clinical_note` |
| entity_id | uuid | |
| metadata | jsonb | optional context |
| created_at | timestamptz | |

---

## 5. Screens

### 5.1 Login
- Username + password; enforce password strength on account creation.
- MFA required for `admin` accounts.
- Redirect to Dashboard on success; clear error messaging on failure.

### 5.2 Dashboard (landing screen)
- Today's appointments (time, patient, practitioner, confirmed status).
- Quick stats: appointments today, upcoming this week.
- Quick actions: "New appointment", "New patient", "Find patient".

### 5.3 Patients — list
- Searchable table (name, phone, last visit).
- Filter: active / archived.
- "Add patient" button.
- Row click → Patient detail.

### 5.4 Patient — detail
- **Demographics** panel (editable per role).
- **Appointment history** for this patient.
- **Clinical notes** tab — visible to all logged-in staff and admin in v1.
- Archive / restore (all staff & admin).

### 5.5 Appointments — calendar
- Day / week / month views.
- Filter by practitioner.
- Color-coded by appointment type.
- Click empty slot → create; click appointment → view/edit.

### 5.6 Appointment — create / edit
- Select patient (search), practitioner, type (auto-fills duration), date/time, reason.
- Confirm the appointment. Any later changes or cancellation are made manually by the user editing or removing the appointment.

### 5.7 Admin — user management
- Admin manually creates user accounts (username, role), and can deactivate them.
- Visible to admin only.

### 5.8 Admin — settings
- Clinic profile (name, address, hours).
- Manage appointment types (name, duration, color).

---

## 6. Security & compliance (Singapore PDPA-aware)

- **HTTPS everywhere** (encryption in transit); Supabase encrypts at rest.
- **RLS on every table** — permissions enforced in the database, matching the matrix in §3.
- **Audit log** for view/create/update/delete on patients, clinical notes, and appointments.
- **Session timeout** with auto-logout after inactivity.
- **MFA** for admin accounts.
- **Soft delete / archive** via `is_archived` rather than hard deletion; archived patients are hidden from default views but recoverable. Permanent (hard) deletion is admin-only and logged.
- **Backups** — rely on Supabase automated backups; verify the schedule.
- **Data minimisation & consent** — only collect fields needed for care/scheduling; have a documented retention policy. The v1 patient record is intentionally lean (no national ID, address, or free-text notes), which reduces the sensitivity of the data you hold.
- This spec is product guidance, not legal advice — before going live with real patient data, confirm obligations under the PDPA and any MOH/health-records requirements with a qualified advisor.

---

## 7. Build sequence (milestones)

| Milestone | Deliverable |
|---|---|
| **M0 — Foundation** | Repo + frontend scaffold; Supabase project; auth + roles; full schema with RLS; seed an admin user |
| **M1 — Patients** | Patient list, search, create, view, edit, archive/restore; clinical notes |
| **M2 — Appointments** | Calendar views, create/edit, confirm, link to patients |
| **M3 — Polish & ship** | Dashboard, user management, settings, audit log surfacing, deploy frontend |

All three of your "must-have" areas (login/roles, records, scheduling) land within v1; this is just the order that lets each piece rest on the one before it.

---

## 8. Out of scope (v2+)

- Automated email/SMS reminders and confirmations.
- Patient-facing self-service booking.
- Analytics/reporting dashboards and CSV export.
- Billing / invoicing / payments.
- Document/file attachments (referrals, scans).
- Multi-clinic / multi-location support.
