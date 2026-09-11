import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://abghublsyvuyangkyibz.supabase.co'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const demoEmployees = [
  {
    employee_id: '00001',
    name: 'Lê Trung Sỹ',
    department: 'Kinh doanh',
    position: 'Nhân viên',
    branch: 'HCM',
    shift: 'Ca ngày',
    employment_status: 'Chính thức',
    status: 'Đang làm việc',
    role: 'user'
  },
  {
    employee_id: '00002',
    name: 'Tạ Trần Thanh Tùng',
    department: 'Kỹ thuật',
    position: 'Nhân viên',
    branch: 'HCM',
    shift: 'Ca ngày',
    employment_status: 'Chính thức',
    status: 'Đang làm việc',
    role: 'user'
  },
  {
    employee_id: '00003',
    name: 'Nguyễn Thị Mai',
    department: 'Kế toán',
    position: 'Kế toán viên',
    branch: 'HCM',
    shift: 'Ca ngày',
    employment_status: 'Chính thức',
    status: 'Đang làm việc',
    role: 'user'
  },
  {
    employee_id: '00004',
    name: 'Trần Quốc Đạt',
    department: 'Kinh doanh',
    position: 'Trưởng phòng KD',
    branch: 'HCM',
    shift: 'Ca ngày',
    employment_status: 'Chính thức',
    status: 'Đang làm việc',
    role: 'user'
  },
  {
    employee_id: '00005',
    name: 'Đào Xuân Quyết',
    department: 'Vận hành',
    position: 'Nhân viên Vận hành',
    branch: 'HCM',
    shift: 'Ca ngày',
    employment_status: 'Chính thức',
    status: 'Đang làm việc',
    role: 'user'
  },
  {
    employee_id: '00006',
    name: 'Nguyễn Minh Hiếu',
    department: 'Kỹ thuật',
    position: 'Kỹ sư hệ thống',
    branch: 'HCM',
    shift: 'Ca ngày',
    employment_status: 'Chính thức',
    status: 'Đang làm việc',
    role: 'user'
  },
  {
    employee_id: '00007',
    name: 'Nguyễn Hồng Hạnh',
    department: 'Vận hành',
    position: 'Điều phối viên',
    branch: 'HCM',
    shift: 'Ca ngày',
    employment_status: 'Chính thức',
    status: 'Đang làm việc',
    role: 'user'
  },
  {
    employee_id: '00008',
    name: 'Nguyễn Thị Thùy Linh',
    department: 'Hành chính',
    position: 'Chuyên viên Hành chính',
    branch: 'HCM',
    shift: 'Ca ngày',
    employment_status: 'Chính thức',
    status: 'Đang làm việc',
    role: 'user'
  }
]

async function run() {
  console.log('Đang đồng bộ 8 nhân viên demo vào bảng users...')
  for (const emp of demoEmployees) {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('employee_id', emp.employee_id)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('users')
        .update(emp)
        .eq('id', existing.id)
      console.log(`✓ Đã cập nhật ${emp.employee_id} - ${emp.name}`)
    } else {
      const { error } = await supabase
        .from('users')
        .insert(emp)
      if (error) {
        console.error(`Lỗi insert ${emp.employee_id}:`, error.message)
      } else {
        console.log(`✓ Đã thêm mới ${emp.employee_id} - ${emp.name}`)
      }
    }
  }

  const { data: allUsers } = await supabase.from('users').select('id, employee_id, name')
  console.log('\nDanh sách users hiện có trong Supabase B:')
  console.table(allUsers)
}

run()
