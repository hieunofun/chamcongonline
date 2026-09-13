import { createRequire } from 'module'
import path from 'path'
const require = createRequire(import.meta.url)
const XLSX = require('d:/hr/HrmSpeeGo/node_modules/xlsx')

const employees = [
  { code: '00001', name: 'Lê Trung Sỹ', position: 'Nhân viên' },
  { code: '00002', name: 'Tạ Trần Thanh Tùng', position: 'Nhân viên' },
  { code: '00003', name: 'Nguyễn Thị Mai', position: 'Kế toán' },
  { code: '00004', name: 'Trần Quốc Đạt', position: 'Kinh doanh' },
  { code: '00005', name: 'Đào Xuân Quyết', position: 'Vận hành' },
  { code: '00006', name: 'Nguyễn Minh Hiếu', position: 'Kỹ thuật' },
  { code: '00007', name: 'Nguyễn Hồng Hạnh', position: 'Vận hành' },
  { code: '00008', name: 'Nguyễn Thị Thùy Linh', position: 'Hành chính' },
]

// Tháng 8/2026: 31 ngày.
// 2026-08-01 là Thứ 7 (T7)
const dayOfWeekLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

const rows = []
// Row 1-3: Blank / Title
rows.push(['BẢNG CHẤM CÔNG THÁNG 08/2026 - CÔNG TY DEMO B'])
rows.push([])
rows.push([])
// Row 4: Group header
const row4 = ['', '', '']
for (let d = 1; d <= 31; d++) {
  row4.push(d === 1 ? 'Ngày trong tháng' : '')
}
rows.push(row4)

// Row 5: Column Headers
const row5 = ['Mã nhân viên', 'Họ và tên', 'Chức vụ']
for (let d = 1; d <= 31; d++) {
  row5.push(String(d).padStart(2, '0'))
}
rows.push(row5)

// Row 6: Day of week headers
const row6 = ['', '', '']
for (let d = 1; d <= 31; d++) {
  const date = new Date(2026, 7, d) // month 7 is August
  const dow = dayOfWeekLabels[date.getDay()]
  row6.push(dow)
}
rows.push(row6)

// Row 7+: Employee rows
employees.forEach(emp => {
  const empRow = [emp.code, emp.name, emp.position]
  for (let d = 1; d <= 31; d++) {
    const date = new Date(2026, 7, d)
    const isSunday = date.getDay() === 0
    if (d === 1) {
      empRow.push('0') // Exactly like in screenshot where 01 has 0
    } else if (isSunday) {
      empRow.push('0')
    } else {
      empRow.push('1')
    }
  }
  rows.push(empRow)
})

const wb = XLSX.utils.book_new()
const ws = XLSX.utils.aoa_to_sheet(rows)
XLSX.utils.book_append_sheet(wb, ws, 'BangCongThang8')

const outputPath = path.resolve('d:/hr/HR-Company-22/Mau_Bang_Cong_Matrix_Thang_8_2026.xlsx')
XLSX.writeFile(wb, outputPath)
console.log('Successfully created test excel matrix file at:', outputPath)
