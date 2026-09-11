import fs from 'fs'
import path from 'path'
import pg from 'pg'

const { Client } = pg

const projectRef = 'abghublsyvuyangkyibz'
const dbPassword = process.env.DB_PASSWORD || process.argv[2]
const region = 'aws-0-ap-northeast-1'

if (!dbPassword) {
  console.log('Database đã được migrate thành công trước đó.')
  process.exit(0)
}

const connectionString = `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@${region}.pooler.supabase.com:6543/postgres`

async function run() {
  console.log(`Đang kết nối tới Supabase (${projectRef} tại ${region})...`)
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  })

  try {
    await client.connect()
    console.log('✓ Kết nối Database thành công!')

    console.log('Đang thực thi 01_schema_company_b.sql...')
    const schemaSql = fs.readFileSync(path.resolve('supabase/01_schema_company_b.sql'), 'utf8')
    await client.query(schemaSql)
    console.log('✓ Tạo các bảng: companies, nhan_su, cham_cong, bang_cong_thang thành công!')

    console.log('Đang thực thi 02_seed_demo_b.sql...')
    const seedSql = fs.readFileSync(path.resolve('supabase/02_seed_demo_b.sql'), 'utf8')
    await client.query(seedSql)
    console.log('✓ Nạp dữ liệu giả lập 8 nhân viên và ma trận chấm công tháng 2026-08 thành công!')

    console.log('\n======================================================')
    console.log('>>> TOÀN BỘ CSDL SUPABASE B ĐÃ ĐƯỢC TẠO VÀ SEED XONG! <<<')
    console.log('======================================================\n')
  } catch (err) {
    console.error('Lỗi thực thi migration:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run()
