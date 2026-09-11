import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL || 'https://abghublsyvuyangkyibz.supabase.co'
const key = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Bh4bVd43jTP7VZ2rh8TUfA_IMH072o7'
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

console.log('Testing connection to Supabase Project B:', url)
const supabase = createClient(url, key)

async function test() {
  try {
    const { data: comp, error: compErr } = await supabase.from('companies').select('*').limit(5)
    console.log('companies table check:', { data: comp, error: compErr ? compErr.message : null })

    const { data: nhanSu, error: nsErr } = await supabase.from('nhan_su').select('*').limit(5)
    console.log('nhan_su table check:', { data: nhanSu, error: nsErr ? nsErr.message : null })

    const { data: chamCong, error: ccErr } = await supabase.from('cham_cong').select('*').limit(5)
    console.log('cham_cong table check:', { data: chamCong, error: ccErr ? ccErr.message : null })
  } catch (err) {
    console.error('Error during test:', err.message)
  }
}

test()
