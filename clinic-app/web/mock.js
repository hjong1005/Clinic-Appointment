// =====================================================================
// m1-mock.js — in-memory stand-in for m1-data.js.
// Same function names and shapes, no backend. Lets you click through the
// whole M1 UI with sample data. It also mimics the role rejections that
// RLS would enforce, so the restricted-Staff behaviour is visible offline.
//
// To preview the Staff experience, change ME.role to 'staff' (and ME.id
// to 'u-staff') below, then reload: Delete buttons disappear and you can
// only edit notes authored by Sam.
// =====================================================================

export const IS_MOCK = true
export const isConfigured = () => true

let ME = { id: 'u-admin', full_name: 'Ada Admin', role: 'admin' }   // ← role: 'admin' | 'staff'

// ---- seed data -------------------------------------------------------
const iso = (days, addMin = 0) => {
  const d = new Date(); d.setDate(d.getDate() + days); d.setMinutes(d.getMinutes() + addMin); d.setSeconds(0, 0)
  return d.toISOString()
}
let seq = 3
const store = {
  patients: [
    { id:'p1', full_name:'Maria Tan', date_of_birth:'1986-04-12', gender:'Female',
      phone:'+65 9123 4567', email:'maria.tan@example.com',
      emergency_contact_name:'Wei Tan', emergency_contact_phone:'+65 9876 5432', is_archived:false },
    { id:'p2', full_name:'James Lim, Jr. (O\'Brien)', date_of_birth:'1972-11-03', gender:'Male',
      phone:'+65 8222 1111', email:'', emergency_contact_name:'', emergency_contact_phone:'', is_archived:false },
    { id:'p3', full_name:'Priya Nair', date_of_birth:'1999-07-21', gender:'Female',
      phone:'', email:'priya@example.com',
      emergency_contact_name:'Anil Nair', emergency_contact_phone:'+65 8000 0000', is_archived:true },
  ],
  appts: [
    { id:'a1', patient_id:'p1', practitioner_id:'u-admin', appointment_type_id:'t1',
      start_time:iso(-20), end_time:iso(-20,30), is_confirmed:true,
      reason:'Annual review', appointment_type:{name:'Consultation',color:'#1F5F54'}, practitioner:{full_name:'Ada Admin'} },
    { id:'a2', patient_id:'p1', practitioner_id:'u-staff', appointment_type_id:'t2',
      start_time:iso(7), end_time:iso(7,15), is_confirmed:false,
      reason:'Follow-up', appointment_type:{name:'Follow-up',color:'#A9681E'}, practitioner:{full_name:'Sam Staff'} },
    { id:'a3', patient_id:'p2', practitioner_id:'u-admin', appointment_type_id:'t3',
      start_time:iso(-3), end_time:iso(-3,60), is_confirmed:true,
      reason:'Minor procedure', appointment_type:{name:'Procedure',color:'#B23B3B'}, practitioner:{full_name:'Ada Admin'} },
  ],
  notes: [
    { id:'n1', patient_id:'p1', note_body:'Patient reports improved sleep. Continue current plan; review in 6 weeks.',
      created_at:iso(-20,5), author_id:'u-admin', author:{full_name:'Ada Admin'} },
    { id:'n2', patient_id:'p1', note_body:'Front desk: updated mobile number on file.',
      created_at:iso(-5), author_id:'u-staff', author:{full_name:'Sam Staff'} },
  ],
  practitioners: [
    { id:'u-admin', full_name:'Ada Admin' },
    { id:'u-staff', full_name:'Sam Staff' },
  ],
  types: [
    { id:'t1', name:'Consultation', duration_minutes:30, color:'#1F5F54' },
    { id:'t2', name:'Follow-up',    duration_minutes:15, color:'#A9681E' },
    { id:'t3', name:'Procedure',    duration_minutes:60, color:'#B23B3B' },
  ],
}

const wait = (ms = 120) => new Promise(r => setTimeout(r, ms))
const copy = (x) => JSON.parse(JSON.stringify(x))
const lastVisit = (pid) => store.appts.filter(a => a.patient_id===pid && new Date(a.start_time) <  new Date())
  .map(a=>a.start_time).sort().pop() || null
const nextAppt  = (pid) => store.appts.filter(a => a.patient_id===pid && new Date(a.start_time) >= new Date())
  .map(a=>a.start_time).sort().shift() || null

// ---- auth & identity -------------------------------------------------
export async function signIn() { await wait(); return { user: ME } }
export async function signOut() { await wait() }
export async function getMyProfile() { await wait(); return copy(ME) }

// ---- patients --------------------------------------------------------
export async function listPatients({ search = '', archived = false } = {}) {
  await wait()
  const t = search.trim().toLowerCase()
  return store.patients
    .filter(p => !!p.is_archived === archived)
    .filter(p => !t || [p.full_name, p.phone, p.email].some(v => (v||'').toLowerCase().includes(t)))
    .map(p => ({ id:p.id, full_name:p.full_name, phone:p.phone, email:p.email,
      is_archived:p.is_archived, last_visit:lastVisit(p.id), next_appointment:nextAppt(p.id) }))
    .sort((a,b) => a.full_name.localeCompare(b.full_name))
}
export async function getPatient(id) {
  await wait(); const p = store.patients.find(x=>x.id===id)
  if (!p) throw new Error('Could not load this patient.'); return copy(p)
}
export async function createPatient(fields) {
  await wait(); const p = { id:'p'+(++seq), is_archived:false, ...blankNulls(fields) }
  store.patients.push(p); return copy(p)
}
export async function updatePatient(id, fields) {
  await wait(); const p = store.patients.find(x=>x.id===id)
  if (!p) throw new Error('Could not save changes.'); Object.assign(p, blankNulls(fields)); return copy(p)
}
export async function setArchived(id, archived) {
  await wait(); const p = store.patients.find(x=>x.id===id); if (p) p.is_archived = archived
}
export async function deletePatient(id) {
  await wait()
  if (ME.role !== 'admin') throw new Error('Only an admin can permanently delete a patient.')
  store.patients = store.patients.filter(x=>x.id!==id)
  store.notes    = store.notes.filter(x=>x.patient_id!==id)
  store.appts    = store.appts.filter(x=>x.patient_id!==id)
}
export async function logPatientView() { /* no-op in mock */ }

// ---- appointment history --------------------------------------------
export async function listPatientAppointments(patientId) {
  await wait()
  return copy(store.appts.filter(a=>a.patient_id===patientId)
    .sort((a,b)=> new Date(b.start_time) - new Date(a.start_time)))
}

// ---- clinical notes --------------------------------------------------
export async function listNotes(patientId) {
  await wait()
  return copy(store.notes.filter(n=>n.patient_id===patientId)
    .sort((a,b)=> new Date(b.created_at) - new Date(a.created_at)))
}
export async function addNote(patientId, body) {
  await wait()
  const n = { id:'n'+(++seq), patient_id:patientId, note_body:body, created_at:new Date().toISOString(),
    author_id:ME.id, author:{ full_name:ME.full_name } }
  store.notes.push(n); return copy(n)
}
export async function updateNote(id, body) {
  await wait(); const n = store.notes.find(x=>x.id===id)
  if (!n) throw new Error('Could not save the note.')
  if (ME.role !== 'admin' && n.author_id !== ME.id) throw new Error('You can only edit notes you wrote.')
  n.note_body = body; return copy(n)
}
export async function deleteNote(id) {
  await wait()
  if (ME.role !== 'admin') throw new Error('Only an admin can delete a note.')
  store.notes = store.notes.filter(x=>x.id!==id)
}

// ---- helpers ---------------------------------------------------------
function blankNulls(obj) { const o={}; for (const [k,v] of Object.entries(obj)) o[k]= v===''? null : v; return o }

// ---- M2: appointments (mirrors m2-data.js) ---------------------------
const embed = (a) => ({
  ...a,
  patient: { full_name: store.patients.find(p=>p.id===a.patient_id)?.full_name || 'Unknown' },
  practitioner: { full_name: store.practitioners.find(u=>u.id===a.practitioner_id)?.full_name || '—' },
  appointment_type: (() => { const t = store.types.find(t=>t.id===a.appointment_type_id); return t ? { name:t.name, color:t.color } : null })(),
})

export async function listPractitioners() { await wait(); return copy(store.practitioners) }
export async function listAppointmentTypes() { await wait(); return copy(store.types) }

export async function listAppointments({ from, to, practitionerId = null } = {}) {
  await wait()
  const f = new Date(from), t = new Date(to)
  return store.appts
    .filter(a => { const s = new Date(a.start_time); return s >= f && s < t })
    .filter(a => !practitionerId || a.practitioner_id === practitionerId)
    .sort((a,b) => new Date(a.start_time) - new Date(b.start_time))
    .map(a => copy(embed(a)))
}
export async function getAppointment(id) {
  await wait(); const a = store.appts.find(x=>x.id===id)
  if (!a) throw new Error('Could not load this appointment.'); return copy(a)
}
export async function createAppointment(fields) {
  await wait(); const a = { id:'a'+(++seq), is_confirmed:false, ...fields }
  store.appts.push(a); return copy(embed(a))
}
export async function updateAppointment(id, fields) {
  await wait(); const a = store.appts.find(x=>x.id===id)
  if (!a) throw new Error('Could not save the appointment.'); Object.assign(a, fields); return copy(embed(a))
}
export async function setConfirmed(id, confirmed) {
  await wait(); const a = store.appts.find(x=>x.id===id); if (a) a.is_confirmed = confirmed
}
export async function cancelAppointment(id) {
  await wait(); store.appts = store.appts.filter(x=>x.id!==id)
}

// ---- M3: admin + dashboard (mirrors m3-data.js) ----------------------
store.users = [
  { id:'u-admin', full_name:'Ada Admin', username:'admin', role:'admin', is_active:true, created_at:iso(-120) },
  { id:'u-staff', full_name:'Sam Staff', username:'sam',   role:'staff', is_active:true, created_at:iso(-90) },
]
store.settings = { id:true, clinic_name:'Sunbird Family Clinic', address:'12 Orchard Rd, Singapore 238801', hours:'Mon–Fri 9:00–18:00 · Sat 9:00–13:00' }
store.audit = [
  { id:'g1', action:'create', entity_type:'patient',       entity_id:'p1', created_at:iso(-20,5),  actor:{full_name:'Ada Admin'} },
  { id:'g2', action:'create', entity_type:'appointment',   entity_id:'a1', created_at:iso(-20,6),  actor:{full_name:'Ada Admin'} },
  { id:'g3', action:'view',   entity_type:'patient',       entity_id:'p1', created_at:iso(-5,1),   actor:{full_name:'Sam Staff'} },
  { id:'g4', action:'update', entity_type:'clinical_note', entity_id:'n2', created_at:iso(-5,2),   actor:{full_name:'Sam Staff'} },
  { id:'g5', action:'update', entity_type:'appointment',   entity_id:'a3', created_at:iso(-3,0),   actor:{full_name:'Ada Admin'} },
]
const requireAdmin = () => { if (ME.role !== 'admin') throw new Error('Admins only.') }

export async function getDashboard() {
  await wait()
  const now = new Date()
  const start = new Date(now); start.setHours(0,0,0,0)
  const weekEnd = new Date(start); weekEnd.setDate(weekEnd.getDate()+7)
  const all = await listAppointments({ from: start.toISOString(), to: new Date(start.getTime()+8*864e5).toISOString() })
  const today = all.filter(a => { const d=new Date(a.start_time); return d.toDateString()===now.toDateString() })
  const week = all.filter(a => { const d=new Date(a.start_time); return d>=now && d<weekEnd })
  return { today, stats: { todayCount: today.length, weekCount: week.length } }
}

export async function listUsers() { await wait(); return copy(store.users) }
export async function setUserRole(id, role) { await wait(); requireAdmin(); const u=store.users.find(x=>x.id===id); if(u) u.role=role }
export async function setUserActive(id, isActive) { await wait(); requireAdmin(); const u=store.users.find(x=>x.id===id); if(u) u.is_active=isActive }
export async function createUser({ username, full_name, role }) {
  await wait(); requireAdmin()
  if (store.users.some(u=>u.username===username)) throw new Error('That username is already taken.')
  const u = { id:'u'+(++seq), username, full_name, role, is_active:true, created_at:new Date().toISOString() }
  store.users.push(u); store.practitioners.push({ id:u.id, full_name })
  return copy(u)
}

export async function getClinicSettings() { await wait(); return copy(store.settings) }
export async function saveClinicSettings(fields) { await wait(); requireAdmin(); Object.assign(store.settings, fields) }

export async function listAllTypes() { await wait(); return copy(store.types.map(t=>({ ...t, is_active: t.is_active!==false }))) }
export async function createType({ name, duration_minutes, color }) {
  await wait(); requireAdmin(); const t={ id:'t'+(++seq), name, duration_minutes, color, is_active:true }; store.types.push(t); return copy(t)
}
export async function updateType(id, fields) { await wait(); requireAdmin(); const t=store.types.find(x=>x.id===id); if(t) Object.assign(t, fields) }
export async function setTypeActive(id, isActive) { return updateType(id, { is_active:isActive }) }

export async function listAuditLog({ limit=200, action='', entityType='' } = {}) {
  await wait(); requireAdmin()
  return copy(store.audit
    .filter(g => !action || g.action===action)
    .filter(g => !entityType || g.entity_type===entityType)
    .sort((a,b)=> new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit))
}
