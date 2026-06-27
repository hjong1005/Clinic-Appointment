// =====================================================================
// M2 · m2-data.js
// Appointments data-access layer (spec §5.5, §5.6). Reuses the Supabase
// client + patient search from m1-data.js so there's one auth session
// and one client across the app.
//
// As in M1, RLS is the real gate: any active staff/admin may create,
// reschedule, confirm, or cancel; created_by is pinned to the caller so
// it can't be spoofed. These functions just surface the result.
// =====================================================================

import { supabase, listPatients } from './data-core.js'

export const IS_MOCK = false
export { listPatients }                 // re-exported for the patient picker

// ---- reference data --------------------------------------------------
export async function listPractitioners() {
  const { data, error } = await supabase
    .from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
  if (error) throw friendly(error, 'Could not load practitioners.')
  return data
}

export async function listAppointmentTypes() {
  const { data, error } = await supabase
    .from('appointment_types').select('id, name, duration_minutes, color')
    .eq('is_active', true).order('name')
  if (error) throw friendly(error, 'Could not load appointment types.')
  return data
}

// ---- calendar read (spec §5.5) --------------------------------------
// from/to are ISO strings bounding the visible range; practitionerId optional.
export async function listAppointments({ from, to, practitionerId = null } = {}) {
  let q = supabase
    .from('appointments')
    .select('id, start_time, end_time, is_confirmed, reason, ' +
            'patient_id, practitioner_id, appointment_type_id, ' +
            'patient:patients(full_name), ' +
            'practitioner:profiles!practitioner_id(full_name), ' +
            'appointment_type:appointment_types(name,color)')
    .gte('start_time', from)
    .lt('start_time', to)
    .order('start_time', { ascending: true })
  if (practitionerId) q = q.eq('practitioner_id', practitionerId)

  const { data, error } = await q
  if (error) throw friendly(error, 'Could not load the calendar.')
  return data
}

export async function getAppointment(id) {
  const { data, error } = await supabase.from('appointments').select('*').eq('id', id).single()
  if (error) throw friendly(error, 'Could not load this appointment.')
  return data
}

// ---- create / reschedule / confirm / cancel (spec §5.6) -------------
export async function createAppointment(fields) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('appointments').insert({ ...fields, created_by: user.id }).select().single()
  if (error) throw friendly(error, 'Could not create the appointment.')
  return data            // audit row written by the M0 trigger
}

export async function updateAppointment(id, fields) {
  const { data, error } = await supabase
    .from('appointments').update(fields).eq('id', id).select().single()
  if (error) throw friendly(error, 'Could not save the appointment.')
  return data
}

export async function setConfirmed(id, confirmed) {
  const { error } = await supabase.from('appointments').update({ is_confirmed: confirmed }).eq('id', id)
  if (error) throw friendly(error, 'Could not update confirmation.')
}

// Cancellation in v1 is a manual delete (spec §5.6); logged by the trigger.
export async function cancelAppointment(id) {
  const { error } = await supabase.from('appointments').delete().eq('id', id)
  if (error) throw friendly(error, 'Could not cancel the appointment.')
}

// re-export auth helpers so the calendar page is self-contained
export { signIn, signOut, getMyProfile } from './data-core.js'

function friendly(error, fallback) { const e = new Error(fallback); e.cause = error; return e }
