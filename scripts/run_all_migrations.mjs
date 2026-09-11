import fs from 'fs'
import path from 'path'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const { Client } = pg

const projectRef = 'abghublsyvuyangkyibz'
const dbPassword = process.env.DB_PASSWORD || ''
const region = process.env.SUPABASE_REGION || 'aws-0-ap-northeast-1'
const connectionString = dbPassword ? `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@${region}.pooler.supabase.com:6543/postgres` : ''

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://abghublsyvuyangkyibz.supabase.co'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function run() {
  console.log('1. Đang kết nối Postgres để chạy tất cả migrations...')
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  })

  await client.connect()

  const migrationFiles = [
    '20260827150000_add_auth_user_link.sql',
    '20260827151000_secure_employee_attendance.sql',
    '20260827170000_employee_online_attendance.sql',
    '20260907193000_shift_aware_online_attendance.sql',
    '20260908143000_configurable_attendance_shifts.sql',
    '20260911180000_attendance_penalties_table.sql',
    '20260911190000_attendance_logs_date_index.sql'
  ]

  for (const f of migrationFiles) {
    const fullPath = path.resolve('supabase/migrations', f)
    if (fs.existsSync(fullPath)) {
      console.log(`Đang chạy migration: ${f}...`)
      try {
        const sql = fs.readFileSync(fullPath, 'utf8')
        await client.query(sql)
        console.log(`✓ Thành công: ${f}`)
      } catch (err) {
        console.warn(`Lưu ý khi chạy ${f}: ${err.message}`)
      }
    }
  }

  await client.end()

  console.log('\n2. Đồng bộ liên kết auth_user_id cho tài khoản Admin...')
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const { data: listData } = await supabase.auth.admin.listUsers()
  const authUsers = listData?.users || []

  for (const authUser of authUsers) {
    const email = authUser.email
    console.log(`Đang liên kết profile cho: ${email} (auth_id: ${authUser.id})...`)

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('users')
        .update({
          auth_user_id: authUser.id,
          role: 'admin',
          employment_status: 'Chính thức'
        })
        .eq('id', existing.id)
      console.log(`✓ Đã update auth_user_id cho ${email}`)
    } else {
      await supabase
        .from('users')
        .insert({
          email,
          auth_user_id: authUser.id,
          name: email.split('@')[0],
          role: 'admin',
          employment_status: 'Chính thức',
          department: 'Ban Giám Đốc',
          position: 'Admin'
        })
      console.log(`✓ Đã insert profile mới với auth_user_id cho ${email}`)
    }
  }

  console.log('\n=========================================')
  console.log('>>> HOÀN TẤT ĐỒNG BỘ AUTH & MIGRATIONS <<<')
  console.log('=========================================')
}

run().catch(err => {
  console.error('Lỗi:', err)
  process.exit(1)
})
