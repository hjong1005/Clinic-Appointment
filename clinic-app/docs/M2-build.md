# M2 — Appointments & calendar: build notes

M2 delivers scheduling on top of the M0 `appointments` / `appointment_types`
tables: a calendar with day/week/month views, practitioner filtering,
type-coloured events, and create / reschedule / confirm / cancel
(spec §5.5, §5.6 and the M2 milestone in §7).

Files:

- `m2-data.js` — appointment data-access layer. Imports the Supabase client and `listPatients` from `m1-data.js`, so there's one client and one session across the app.
- `m2-calendar.html` — the calendar UI. The day/week time-grid reuses the lane-layout engine from your original `clients.html` (hour columns, overlap lanes, now-line, click-empty-to-create); month is a standard cell grid. Mock-aware exactly like the M1 page.
- Mock support lives in `m1-mock.js` (shared store) — it now also serves practitioners, types, and appointment CRUD, so the calendar is fully clickable offline.

## Running it

Same as M1. With no Supabase keys it loads the mock and shows the Demo-mode banner; with keys it uses `m2-data.js`. Serve over http (module imports), and because Supabase persists the session, signing in on the M1 page carries over to the calendar.

## What maps to the spec

| Spec | Where |
|---|---|
| §5.5 day / week / month views | the Day/Week/Month segmented control; week & day share the time-grid engine, month is a cell grid |
| §5.5 filter by practitioner | the "All practitioners" dropdown → `listAppointments({ practitionerId })` |
| §5.5 colour-coded by type | each event/chip is tinted from `appointment_type.color` |
| §5.5 click empty slot → create | clicking blank time (week/day) or a month cell opens the modal pre-filled with that date/time |
| §5.5 click appointment → view/edit | clicking an event opens it in the modal |
| §5.6 patient search, practitioner, type (auto-fills duration), date/time, reason | the appointment modal; selecting a type sets the slot length, so `end_time` is computed from `start_time + duration` |
| §5.6 confirm | the "Mark confirmed" toggle → `is_confirmed` |
| §5.6 changes / cancellation are manual | reschedule = edit and save; cancel = delete (`cancelAppointment`) |

A soft double-booking guard is included client-side: saving an appointment that overlaps an existing one for the *same practitioner* is blocked with a message. This mirrors the clash check in the original `clients.html`. For a hard guarantee you'd add a Postgres exclusion constraint later; the client check is the v1 convenience.

## Enforcement & audit (unchanged principle)

Every appointment write goes through RLS: any active staff/admin may create/edit/cancel, and `createAppointment` pins `created_by` to the caller so it can't be spoofed. Create/edit/cancel each fire the M0 audit trigger, so the calendar is fully covered by the audit log without extra wiring.

## Verified vs pending

The mock appointment layer is **run and tested** — practitioner/type listing, range reads with patient+type joins, the practitioner filter, and create/confirm/cancel all pass an automated check. The real `m2-data.js` path is syntax-clean and wired against the M0 schema but, like M1, hasn't been executed against a live project from here.

## Deferred

Automated reminders/confirmations and patient-facing self-booking are explicitly v2 (spec §8). Recurring appointments and drag-to-reschedule aren't in the spec and aren't built. Linking a clinical note to a specific appointment (`clinical_notes.appointment_id`) is supported by the schema and `addNote()`; surfacing it in the appointment modal is a small future addition.
