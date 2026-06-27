// =====================================================================
// seed-users.mjs — create test users so role behaviour is verifiable.
//
// Creates two auth users (admin + staff) using the username→email
// convention and inserts their matching profiles rows. This is the
// out-of-band bootstrap from the M0 runbook: there's no admin yet to
// "create users" through the app, so the first ones are made here.
//
// Uses the SERVICE ROLE key — server-side only. NEVER ship this key to
// a browser. Run it from your machine, then delete the env values.
//
//   npm init -y && npm install @supabase/supabase-js
//   export SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
//   node seed-users.mjs
//
// Then sign in at m1-patients.html:
//   admin / Passw0rd!admin   → sees Delete controls, can edit any note
//   sam   / Passw0rd!staff   → no Delete, can edit only their own notes
// =====================================================================

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.')
  process.exit(1)
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const users = [
  { username: 'admin', full_name: 'Ada Admin', role: 'admin', password: 'Passw0rd!admin' },
  { username: 'sam',   full_name: 'Sam Staff', role: 'staff', password: 'Passw0rd!staff' },
]

async function findUserIdByEmail(email) {
  // listUsers is paginated; one page is plenty for a seed of two.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users.find(u => u.email === email)?.id ?? null
}

for (const u of users) {
  const email = `${u.username}@clinic.local`
  let userId

  const { data, error } = await admin.auth.admin.createUser({
    email, password: u.password, email_confirm: true,
  })

  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      userId = await findUserIdByEmail(email)
      console.log(`• ${u.username}: auth user already existed, reusing`)
    } else {
      console.error(`✗ ${u.username}: ${error.message}`); continue
    }
  } else {
    userId = data.user.id
  }

  if (!userId) { console.error(`✗ ${u.username}: could not resolve user id`); continue }

  const { error: pErr } = await admin.from('profiles').upsert({
    id: userId, username: u.username, full_name: u.full_name, role: u.role, is_active: true,
  })
  if (pErr) console.error(`✗ ${u.username}: profile — ${pErr.message}`)
  else      console.log(`✓ ${u.username} (${u.role}) ready`)
}

console.log('\nDone. Verify the role split:')
console.log('  1. Sign in as sam; open Maria Tan; you should see no Delete on Ada\'s note.')
console.log('  2. As sam, run in the browser console:')
console.log("     await (await import('./m1-data.js')).deleteNote('<a-note-id>')")
console.log('     → RLS rejects it, proving the rule lives in the database, not the UI.')
