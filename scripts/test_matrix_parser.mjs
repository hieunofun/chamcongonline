import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('d:/hr/HrmSpeeGo/node_modules/xlsx')
import { parseMatrixSheet } from '../src/utils/excelMatrixParser.js'

const workbook = XLSX.readFile('d:/hr/HR-Company-B/Mau_Bang_Cong_Matrix_Thang_8_2026.xlsx')
const sheetName = workbook.SheetNames[0]
const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' })

const result = parseMatrixSheet(sheetData, '2026-08')

console.log('=== TEST RESULT ===')
console.log('Days in month:', result.daysInMonth)
console.log('Total employees found:', result.employees.length)
console.log('Employees list:', result.employees.map(e => `${e.ma_nhan_vien} - ${e.ho_ten} (${e.chuc_vu})`))
console.log('Total attendance records:', result.attendanceRecords.length)
console.log('Sample summary row 1:', result.summaries[0])
console.log('Matrix row 1 day 01:', result.matrixRows[0].days['01'])
console.log('Matrix row 1 day 03:', result.matrixRows[0].days['03'])
