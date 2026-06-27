// =====================================================================
// M3 · m3-data.js
// Admin + dashboard data-access layer (spec §5.2, §5.7, §5.8).
// Reuses the client/auth from m1-data.js and the calendar read from
// m2-data.js. The admin-only operations rely on M0 RLS: a Staff caller
// is rejected by the database, the UI just hides the screens.
// =====================================================================

import { supabase } from './data-core.js'
import { listAppointments } from './data-appointments.js'

export const IS_MOCK = false
export { signIn, signOut, getMyProfile } from './data-core.js'
export { listAppointments }

// ---- Dashboard (spec §5.2) ------------------------------------------
// One fetch over the next 8 days, then derive "today" and "this week".
export async function getDashboard() {
  const now = new Date()
  const start = new Date(now); start.setHours(0,0,0,0)
  const horizon = new Date(start); horizon.setDate(horizon.getDate()+8)
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate()+7)

  const appts = await listAppointments({ from: start.toISOString(), to: horizon.toISOString() })
  const isToday = (a) => { const d=new Date(a.start_time); return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate() }
  const today = appts.filter(isToday)
  const upcomingWeek = appts.filter(a => { const d=new Date(a.start_time); return d>=now && d<weekEnd })
  return { today, stats: { todayCount: today.length, weekCount: upcomingWeek.length } }
}

// ---- Users (spec §5.7) ----------------------------------------------
export async function listUsers() {
  const { data, error } = await supabase
    .from('profiles').select('id, full_name, username, role, is_active, created_at')
    .order('full_name')
  if (error) throw friendly(error, 'Could not load users.')
  return data
}
export async function setUserRole(id, role) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
  if (error) throw friendly(error, 'Only an admin can change roles.')
}
export async function setUserActive(id, isActive) {
  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', id)
  if (error) throw friendly(error, 'Only an admin can deactivate users.')
}
// Provisioning runs in the create-user Edge Function (service role).
export async function createUser({ username, full_name, role, password }) {
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { username, full_name, role, password },
  })
  if (error) throw friendly(error, 'Could not create the user.')
  if (data?.error) throw new Error(data.error)
  return data
}

// ---- Clinic settings (spec §5.8) ------------------------------------
export async function getClinicSettings() {
  const { data, error } = await supabase.from('clinic_settings').select('*').eq('id', true).single()
  if (error) throw friendly(error, 'Could not load clinic settings.')
  return data
}
export async function saveClinicSettings({ clinic_name, address, hours }) {
  const { error } = await supabase.from('clinic_settings')
    .update({ clinic_name, address, hours, updated_at: new Date().toISOString() }).eq('id', true)
  if (error) throw friendly(error, 'Only an admin can change clinic settings.')
}

// ---- Appointment types management (spec §5.8) -----------------------
export async function listAllTypes() {
  const { data, error } = await supabase
    .from('appointment_types').select('id, name, duration_minutes, color, is_active').order('name')
  if (error) throw friendly(error, 'Could not load appointment types.')
  return data
}
export async function createType({ name, duration_minutes, color }) {
  const { data, error } = await supabase.from('appointment_types')
    .insert({ name, duration_minutes, color, is_active: true }).select().single()
  if (error) throw friendly(error, 'Only an admin can add types.')
  return data
}
export async function updateType(id, fields) {
  const { error } = await supabase.from('appointment_types').update(fields).eq('id', id)
  if (error) throw friendly(error, 'Only an admin can edit types.')
}
export async function setTypeActive(id, isActive) {
  return updateType(id, { is_active: isActive })
}

// ---- Audit log viewer (spec §6; admin-only via RLS) -----------------
export async function listAuditLog({ limit = 200, action = '', entityType = '' } = {}) {
  let q = supabase
    .from('audit_log')
    .select('id, action, entity_type, entity_id, created_at, actor:profiles!actor_id(full_name)')
    .order('created_at', { ascending: false }).limit(limit)
  if (action) q = q.eq('action', action)
  if (entityType) q = q.eq('entity_type', entityType)
  const { data, error } = await q
  if (error) throw friendly(error, 'Only an admin can view the audit log.')
  return data
}

function friendly(error, fallback) { const e = new Error(fallback); e.cause = error; return e }
