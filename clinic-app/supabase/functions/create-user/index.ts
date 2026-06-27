// =====================================================================
// supabase/functions/create-user/index.ts
//
// Creating an auth user needs the service-role key, which must NEVER be
// in the browser. So account provisioning (spec §5.7) runs here, in an
// Edge Function, and the admin UI calls it with supabase.functions.invoke.
//
// The function:
//   1. verifies the CALLER is a signed-in admin (defence in depth — the
//      service-role key bypasses RLS, so we must check the role ourselves),
//   2. creates the auth user with the username→email convention,
//   3. inserts the matching profiles row.
//
// Deploy:  supabase functions deploy create-user
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to
//          Edge Functions automatically in a Supabase project.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'


const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // --- 1. confirm the caller is an active admin ---
    const authHeader = req.headers.get('Authorization') ?? ''
    const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await asCaller.auth.getUser()
    if (!user) return json({ error: 'Not signed in.' }, 401)

    const { data: me } = await asCaller
      .from('profiles').select('role, is_active').eq('id', user.id).single()
    if (!me || me.role !== 'admin' || !me.is_active) {
      return json({ error: 'Admins only.' }, 403)
    }

    // --- 2 & 3. provision with the service role ---
    const { username, full_name, role, password } = await req.json()
    if (!username || !full_name || !['admin', 'staff'].includes(role) || !password) {
      return json({ error: 'username, full_name, role (admin|staff) and password are required.' }, 400)
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
    const email = username.includes('@') ? username : `${username}@clinic.local`

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (cErr) return json({ error: cErr.message }, 400)

    const { error: pErr } = await admin.from('profiles').insert({
      id: created.user.id, username, full_name, role, is_active: true,
    })
    if (pErr) {
      // roll back the auth user so we don't leave an orphan
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: pErr.message }, 400)
    }

    return json({ id: created.user.id, username, role }, 200)
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500)
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
