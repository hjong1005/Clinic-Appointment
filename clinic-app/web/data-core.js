// =====================================================================
// M1 · m1-data.js
// Data-access layer for the Patients milestone (spec §5.3, §5.4).
//
// Every function here is a thin wrapper over a Supabase call. The point
// of M1 is that these queries lean on the M0 RLS policies: the client
// never decides who may do what — the database does. The UI only hides
// controls for tidiness. A Staff user can call deletePatient() all day;
// RLS returns an error.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Fill these in from your Supabase project (Settings → API).
export const SUPABASE_URL  = window.SUPABASE_URL  || ''
export const SUPABASE_ANON  = window.SUPABASE_ANON || ''

export const supabase =
  SUPABASE_URL && SUPABASE_ANON ? createClient(SUPABASE_URL, SUPABASE_ANON) : null

export const isConfigured = () => !!supabase
export const IS_MOCK = false

// ---- Auth & identity -------------------------------------------------
// Username login maps to a synthetic email (see M0 runbook §2).
export async function signIn(username, password) {
  const email = username.includes('@') ? username : `${username}@clinic.local`
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw friendly(error, 'Could not sign in. Check your username and password.')
  return data
}
export async function signOut() { await supabase.auth.signOut() }

// Returns { id, full_name, role, is_active } or null. Drives which
// controls the UI shows — NOT a substitute for RLS.
export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles').select('id, full_name, role, is_active').eq('id', user.id).single()
  if (error) throw friendly(error, 'Could not load your profile.')
  return data
}

// ---- Patients — list (spec §5.3) ------------------------------------
// Uses the patient_summary view for last_visit / next_appointment.
export async function listPatients({ search = '', archived = false } = {}) {
  // Search runs server-side via search_patients(); the term is a bound
  // parameter, so punctuation can't break the query or inject filters.
  const { data, error } = await supabase.rpc('search_patients', {
    p_term: search.trim(),
    p_archived: archived,
  })
  if (error) throw friendly(error, 'Could not load patients.')
  return data
}

// ---- Patient — detail (spec §5.4) -----------------------------------
export async function getPatient(id) {
  const { data, error } = await supabase.from('patients').select('*').eq('id', id).single()
  if (error) throw friendly(error, 'Could not load this patient.')
  return data
}

export async function createPatient(fields) {
  const { data, error } = await supabase.from('patients').insert(clean(fields)).select().single()
  if (error) throw friendly(error, 'Could not create the patient.')
  return data          // audit row written automatically by the M0 trigger
}

export async function updatePatient(id, fields) {
  const { data, error } = await supabase.from('patients').update(clean(fields)).eq('id', id).select().single()
  if (error) throw friendly(error, 'Could not save changes.')
  return data
}

// Archive / restore = a soft toggle of is_archived (all staff & admin).
export async function setArchived(id, archived) {
  const { error } = await supabase.from('patients').update({ is_archived: archived }).eq('id', id)
  if (error) throw friendly(error, archived ? 'Could not archive.' : 'Could not restore.')
}

// Hard delete is admin-only at the database level; a Staff caller gets
// an error from RLS, which we surface plainly.
export async function deletePatient(id) {
  const { error } = await supabase.from('patients').delete().eq('id', id)
  if (error) throw friendly(error, 'Only an admin can permanently delete a patient.')
}

// Record that a patient record was opened (spec §6 audit on 'view').
export async function logPatientView(id) {
  await supabase.rpc('log_view', { p_entity_type: 'patient', p_entity_id: id })
}

// ---- Appointment history for a patient (read; full CRUD is M2) -------
export async function listPatientAppointments(patientId) {
  const { data, error } = await supabase
    .from('appointments')
    .select('id, start_time, end_time, is_confirmed, reason, ' +
            'appointment_type:appointment_types(name,color), ' +
            'practitioner:profiles!practitioner_id(full_name)')
    .eq('patient_id', patientId)
    .order('start_time', { ascending: false })
  if (error) throw friendly(error, 'Could not load appointment history.')
  return data
}

// ---- Clinical notes (spec §5.4 tab) ---------------------------------
// Readable by all active staff/admin. Edit own only (or admin); delete
// admin only — all enforced by M0 policies, mirrored in the UI flags.
export async function listNotes(patientId) {
  const { data, error } = await supabase
    .from('clinical_notes')
    .select('id, note_body, created_at, author_id, author:profiles!author_id(full_name)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  if (error) throw friendly(error, 'Could not load clinical notes.')
  return data
}

export async function addNote(patientId, body, appointmentId = null) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('clinical_notes')
    .insert({ patient_id: patientId, note_body: body, appointment_id: appointmentId, author_id: user.id })
    .select('id, note_body, created_at, author_id, author:profiles!author_id(full_name)').single()
  if (error) throw friendly(error, 'Could not save the note.')
  return data
}

export async function updateNote(id, body) {
  const { data, error } = await supabase.from('clinical_notes')
    .update({ note_body: body }).eq('id', id).select().single()
  if (error) throw friendly(error, 'You can only edit notes you wrote.')
  return data
}

export async function deleteNote(id) {
  const { error } = await supabase.from('clinical_notes').delete().eq('id', id)
  if (error) throw friendly(error, 'Only an admin can delete a note.')
}

// ---- helpers ---------------------------------------------------------
// Strip empty strings so optional columns store NULL, not "".
function clean(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[k] = v === '' ? null : v
  return out
}
function friendly(error, fallback) {
  const e = new Error(fallback)
  e.cause = error
  return e
}
