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
  console.log('1. Đang kết nối Postgres để tạo bảng users, hr_records...')
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  })

  await client.connect()
  console.log('✓ Kết nối DB thành công!')

  const fullSetupSql = fs.readFileSync(path.resolve('supabase/full_setup.sql'), 'utf8')
  await client.query(fullSetupSql)
  console.log('✓ Thực thi full_setup.sql thành công (đã có users, hr_records...)!')
  await client.end()

  console.log('\n2. Đang tạo tài khoản Admin trong Supabase Auth...')
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const defaultUserPassword = process.env.ADMIN_DEFAULT_PASSWORD || '123456'
  const usersToCreate = [
    {
      email: 'admin1@gmail.com',
      password: defaultUserPassword,
      name: 'Quản trị viên'
    }
  ]

  for (const item of usersToCreate) {
    console.log(`Đang xử lý tài khoản ${item.email}...`)
    
    // Tìm trong Auth
    const { data: listData } = await supabase.auth.admin.listUsers()
    let authUser = (listData?.users || []).find(u => u.email.toLowerCase() === item.email.toLowerCase())

    if (authUser) {
      await supabase.auth.admin.updateUserById(authUser.id, {
        password: item.password,
        email_confirm: true
      })
      console.log(`✓ Đã cập nhật mật khẩu cho ${item.email}`)
    } else {
      const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
        email: item.email,
        password: item.password,
        email_confirm: true,
        user_metadata: { role: 'admin', name: item.name }
      })
      if (createErr) {
        console.error(`Lỗi tạo user ${item.email}:`, createErr.message)
        continue
      }
      authUser = createData.user
      console.log(`✓ Đã tạo thành công Auth user: ${item.email}`)
    }

    // Đảm bảo có profile trong bảng public.users
    const { data: existingProfile } = await supabase
      .from('users')
      .select('id')
      .eq('email', item.email)
      .maybeSingle()

    if (existingProfile) {
      await supabase
        .from('users')
        .update({
          auth_user_id: authUser.id,
          role: 'admin',
          name: item.name,
          employment_status: 'Chính thức',
          department: 'Ban Giám Đốc',
          position: 'Admin'
        })
        .eq('id', existingProfile.id)
      console.log(`✓ Đã liên kết profile users cho ${item.email}`)
    } else {
      await supabase
        .from('users')
        .insert({
          email: item.email,
          name: item.name,
          role: 'admin',
          auth_user_id: authUser.id,
          employment_status: 'Chính thức',
          department: 'Ban Giám Đốc',
          position: 'Admin',
          employee_id: 'ADMIN_' + item.email.split('@')[0].toUpperCase()
        })
      console.log(`✓ Đã tạo mới profile users cho ${item.email}`)
    }
  }

  console.log('\n======================================================')
  console.log('>>> TẠO TÀI KHOẢN VÀ CSDL ĐĂNG NHẬP THÀNH CÔNG 100% <<<')
  console.log('======================================================')
}

run().catch(err => {
  console.error('Lỗi:', err)
  process.exit(1)
})
