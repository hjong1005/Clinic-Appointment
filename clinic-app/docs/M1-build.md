# M1 — Patients: build notes

M1 delivers the records half of the app on top of the M0 schema:
**patient list, search, create, view, edit, archive/restore, and clinical notes**
(spec §5.3, §5.4 and the M1 milestone in §7).

Files:

- `m1-views.sql` — a `patient_summary` view for the list's "last visit" column. Run it once, after the M0 SQL.
- `m1-data.js` — the data-access layer. Every function is a Supabase call; this is where M1 meets your RLS.
- `m1-patients.html` — a runnable reference UI reusing the Client Book design language (pine/amber, Fraunces + Inter, list/detail split).

## Running it

1. Apply `m1-views.sql` in the Supabase SQL editor (M0 must already be in place).
2. Put your project keys above the module script in `m1-patients.html`:
   ```html
   <script>
     window.SUPABASE_URL  = "https://YOUR-PROJECT.supabase.co";
     window.SUPABASE_ANON = "your-anon-public-key";
   </script>
   ```
3. Serve the folder (`m1-patients.html` + `m1-data.js` side by side) over http — a module import won't run from `file://`. Any static server works, e.g. `npx serve`.
4. Sign in as the seeded admin, or any staff user you've created.

If keys are missing the app shows a setup card instead of crashing; if you're signed out it shows a login card.

## What maps to the spec

| Spec | Where |
|---|---|
| §5.3 searchable list (name/phone), active/archived filter, add, row→detail | `listPatients()` + the list column and Active/Archived segmented control |
| §5.3 "last visit" | `patient_summary.last_visit` (and `next_appointment` drives the list badge) |
| §5.4 demographics panel, editable | demographics panel + the patient modal (now carries DOB, gender, emergency contacts) |
| §5.4 appointment history | `listPatientAppointments()` → history tab (read-only; full CRUD is M2) |
| §5.4 clinical notes tab, visible to all staff/admin | notes tab; `listNotes()` returns all notes for the patient |
| §5.4 archive / restore | `setArchived()`, available to all staff & admin |

## How roles show up (and why the UI flags aren't the real rule)

The UI reads `state.me.role` only to decide which buttons to render:

- **Delete patient** and **Delete note** appear for admins only.
- **Edit note** appears on your own notes (any staff) or on any note (admin).
- Everything else — view, create, edit patient, archive/restore, add note — is shown to all signed-in staff.

These are conveniences. The actual enforcement is the M0 RLS: if a Staff user calls `deletePatient()` or edits someone else's note, the database rejects it and `m1-data.js` surfaces a plain message ("Only an admin can…", "You can only edit notes you wrote"). That's the design principle from §2 in practice — hide for tidiness, enforce in Postgres.

Two audit touchpoints are already wired: opening a patient calls the `log_view` rpc, and every create/edit/delete writes an audit row via the M0 triggers. Surfacing that log to admins is an M3 screen.

## Acceptance checks for "M1 done"

- Create a patient with the full field set; it appears in the active list and writes a `create` audit row.
- Search matches on name, phone, and email; the Archived tab shows only archived patients.
- Archiving moves a patient out of the active list and into Archived; restoring reverses it.
- A note added by Staff A is visible to Staff B, but Staff B sees no Edit control on it — and a forced `updateNote` call is rejected by RLS.
- A Staff user sees no Delete button; an admin does, and deleting writes a `delete` audit row.
- The patient list's "last visit" reflects the most recent past appointment once M2 data exists.

## Deliberately deferred

Appointment scheduling (create/reschedule/cancel, the calendar) is M2 — the history tab here is read-only and will populate once M2 lands. The dashboard, user management, settings, and the audit-log viewer are M3. The note↔appointment link (`clinical_notes.appointment_id`) is in the schema and supported by `addNote()`, but the UI for attaching a note to a specific visit waits until appointments exist.

---

## Update: hardening + offline demo + test users

Three changes since the first cut, aimed at making M1 verifiable rather than just plausible.

**1. Search is now injection-proof.** The old version built a PostgREST `.or()` filter by string interpolation, which broke on commas or parentheses in the search term (and used the wrong wildcard char). It's been replaced by `search_patients()` in `m1-views.sql` — a parameterized Postgres function where the term is a bound argument and LIKE metacharacters are escaped. `listPatients()` now calls it via `supabase.rpc(...)`. A name like `Lim, Jr. (O'Brien)` searches cleanly.

**2. Demo mode — runs with zero setup.** Open `m1-patients.html` with no keys and it loads `m1-mock.js`, an in-memory stand-in with sample patients, notes, and appointments, and shows a "Demo mode" banner. Every flow is clickable, nothing is saved. The mock also mirrors the role rejections RLS would enforce ("Only an admin can delete a note", etc.), so you can feel the role split offline. To preview the Staff view, set `ME.role = 'staff'` near the top of `m1-mock.js` and reload. The moment you add real Supabase keys, the same UI switches to the live `m1-data.js` layer automatically. *(The mock logic is exercised by an automated check — list/search/create/archive/notes all pass, including the punctuation search.)*

**3. Seed test users for real verification.** `seed-users.mjs` creates an `admin` and a `staff` user (auth account + `profiles` row) against a real project, using the service-role key server-side. With both users you can confirm the rule that matters: sign in as `sam`, and not only is the Delete control hidden on Ada's note — a forced `deleteNote()` from the console is rejected by the database. That's the proof that the boundary lives in Postgres, not the UI.

### Honest status after these changes

The mock path is genuinely *run and tested*. The real Supabase path is correct-by-construction and now syntax-clean and consistently wired, but still hasn't been executed against a live project from here — apply the M0 + M1 SQL, seed users, and run the acceptance checks above to close that gap. The username→email login convention is still a deliberate convention rather than a finished auth product.
