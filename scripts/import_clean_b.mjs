import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import xlsx from 'xlsx'

const url = process.env.VITE_SUPABASE_URL || 'https://abghublsyvuyangkyibz.supabase.co'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = createClient(url, key)

async function run() {
  console.log('=== BƯỚC 1: Xóa dữ liệu test cũ của Công ty 22 ===')
  const { count: delCcCount, error: delCcErr } = await supabase
    .from('cham_cong')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Đã xóa cham_cong cũ:', delCcCount, 'lỗi:', delCcErr)

  const { count: delHrCount, error: delHrErr } = await supabase
    .from('hr_records')
    .delete({ count: 'exact' })
    .in('collection', ['attendanceLogs', 'attendanceMonthSummaries'])
  console.log('Đã xóa hr_records cũ (attendanceLogs, attendanceMonthSummaries):', delHrCount, 'lỗi:', delHrErr)

  console.log('\n=== BƯỚC 2: Kiểm tra bảng nhan_su ===')
  const { data: nhanSuList, error: nsErr } = await supabase
    .from('nhan_su')
    .select('*')
    .order('ma_nhan_vien')
  console.log('Số nhân viên trong nhan_su:', nhanSuList.length)
  nhanSuList.forEach(ns => {
    console.log(`- Mã NV: ${ns.ma_nhan_vien} | Họ tên: ${ns.ho_ten} | Chức vụ: ${ns.chuc_vu} | ID: ${ns.id}`)
  })

  console.log('\n=== BƯỚC 3: Đọc file Excel Cong_T88_da_dien_du_lieu_test.xlsx ===')
  const buf = fs.readFileSync('Cong_T88_da_dien_du_lieu_test.xlsx')
  const wb = xlsx.read(buf, { type: 'array' })
  const ws = wb.Sheets['Thang']
  const jsonData = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' })

  // Trích xuất ngày từ hàng 2
  const dateCols = []
  jsonData[2].forEach((cell, idx) => {
    if (typeof cell === 'number' && cell >= 35000 && cell <= 65000) {
      const d = new Date(Math.round((cell - 25569) * 86400 * 1000))
      dateCols.push({ day: d.getUTCDate(), idx, month: d.getUTCMonth() + 1, year: d.getUTCFullYear() })
    }
  })
  console.log('Số cột ngày phát hiện:', dateCols.length)

  const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000022'
  const chamCongToInsert = []
  const hrLogsToInsert = []

  // Quét 8 nhân viên từ dòng 4..11
  for (let r = 4; r < jsonData.length; r++) {
    const row = jsonData[r]
    if (!row || !row[0]) continue
    const code = String(row[0]).trim()
    const name = String(row[1]).trim()
    const pos = String(row[2] || '').trim()

    const emp = nhanSuList.find(ns => ns.ma_nhan_vien === code || ns.ho_ten === name)
    if (!emp) {
      console.warn('Không tìm thấy nhân sự:', code, name)
      continue
    }

    // Cập nhật chức vụ từ Excel vào nhan_su
    if (pos && pos !== emp.chuc_vu) {
      await supabase.from('nhan_su').update({ chuc_vu: pos }).eq('id', emp.id)
    }

    dateCols.forEach(({ day, idx, month, year }) => {
      const cellVal = row[idx]
      if (cellVal === undefined || cellVal === null || String(cellVal).trim() === '') return

      const rawVal = String(cellVal).trim()
      const n = parseFloat(rawVal.replace(',', '.'))
      let hours = 0
      let cong = 0
      if (!isNaN(n)) {
        hours = Number(n.toFixed(2))
        cong = hours >= 7.5 ? 1.0 : Math.round((hours / 8) * 100) / 100
      }
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

      chamCongToInsert.push({
        company_id: DEFAULT_COMPANY_ID,
        nhan_su_id: emp.id,
        ngay: dateStr,
        gia_tri_goc: rawVal,
        gio_vao: hours > 0 ? '08:00:00' : null,
        gio_ra: hours > 0 ? '17:00:00' : null,
        ca_lam: emp.ca_lam || 'Ca ngày',
        tang_ca: 0,
        phep_su_dung: 0,
        cong_lam_le: 0,
        cong_le: 0,
        tong_cong: cong,
        notes: null,
        xac_nhan: false
      })

      const logId = `${emp.id}_${day}`
      hrLogsToInsert.push({
        id: `attendanceLogs::${logId}`,
        collection: 'attendanceLogs',
        data: {
          id: logId,
          employeeId: emp.id,
          employeeCode: emp.ma_nhan_vien,
          employeeName: emp.ho_ten,
          sourceEmployeeCode: emp.ma_nhan_vien,
          sourceEmployeeName: emp.ho_ten,
          position: pos || emp.chuc_vu,
          department: emp.bo_phan,
          date: dateStr,
          cong: cong,
          hours: hours,
          kyHieu: rawVal,
          rawVal: rawVal,
          notes: null,
          lateMinutes: 0,
          earlyMinutes: 0
        },
        updated_at: new Date().toISOString()
      })
    })
  }

  console.log('\n=== BƯỚC 4: Ghi dữ liệu vào bảng cham_cong ===')
  console.log('Tổng số bản ghi cham_cong cần insert:', chamCongToInsert.length)
  const BATCH = 50
  for (let i = 0; i < chamCongToInsert.length; i += BATCH) {
    const chunk = chamCongToInsert.slice(i, i + BATCH)
    const { error: insErr } = await supabase.from('cham_cong').insert(chunk)
    if (insErr) console.error('Lỗi insert cham_cong chunk:', insErr)
  }

  console.log('Ghi dữ liệu vào hr_records (attendanceLogs)...')
  for (let i = 0; i < hrLogsToInsert.length; i += BATCH) {
    const chunk = hrLogsToInsert.slice(i, i + BATCH)
    const { error: hrErr } = await supabase.from('hr_records').upsert(chunk, { onConflict: 'id' })
    if (hrErr) console.error('Lỗi insert hr_records chunk:', hrErr)
  }

  console.log('\n=== BƯỚC 5: Tạo snapshot bảng công tháng 2026-08 ===')
  // Tạo summaryRows cho 8 nhân viên
  const summaryRows = nhanSuList.map(emp => {
    const empLogs = hrLogsToInsert.filter(l => l.data.employeeId === emp.id)
    let totalCong = 0
    let totalHours = 0
    const daysObj = {}

    empLogs.forEach(l => {
      totalCong += l.data.cong
      totalHours += l.data.hours
      daysObj[l.data.date] = {
        hours: l.data.hours,
        workdays: l.data.cong,
        late: false,
        early: false,
        missingPunch: false,
        unapprovedAbsence: false,
        logs: [{ kyHieu: l.data.kyHieu, status: l.data.kyHieu }]
      }
    })

    return {
      employeeId: emp.id,
      employeeCode: emp.ma_nhan_vien,
      employeeName: emp.ho_ten,
      department: emp.bo_phan,
      position: emp.chuc_vu,
      shift: emp.ca_lam || 'Ca ngày',
      attendanceDays: empLogs.length,
      workdays: Math.round(totalCong * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      overtimeHours: 0,
      lateCount: 0,
      lateMinutes: 0,
      missingPunchCount: 0,
      notes: '',
      days: daysObj
    }
  })

  const snapshot = {
    month: '2026-08',
    generatedAt: new Date().toISOString(),
    sourceLogCount: chamCongToInsert.length,
    employeeCount: summaryRows.length,
    rows: summaryRows
  }

  await supabase.from('hr_records').upsert({
    id: 'attendanceMonthSummaries::2026-08',
    collection: 'attendanceMonthSummaries',
    data: snapshot,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' })

  console.log('\n=== BƯỚC 6: Báo cáo kết quả kiểm tra sau import ===')
  const { count: finalCcCount } = await supabase.from('cham_cong').select('*', { count: 'exact', head: true })
  console.log('1. Tổng số record trong bảng cham_cong:', finalCcCount)

  const { data: finalChamCong } = await supabase
    .from('cham_cong')
    .select('nhan_su_id, nhan_su(ma_nhan_vien, ho_ten, chuc_vu), tong_cong')
  
  const empStat = {}
  finalChamCong.forEach(r => {
    const code = r.nhan_su.ma_nhan_vien
    if (!empStat[code]) {
      empStat[code] = {
        'Họ và tên': r.nhan_su.ho_ten,
        'Chức vụ': r.nhan_su.chuc_vu,
        'Số ngày có công/giờ': 0,
        'Tổng công': 0
      }
    }
    empStat[code]['Số ngày có công/giờ']++
    empStat[code]['Tổng công'] += Number(r.tong_cong)
  })

  Object.keys(empStat).forEach(c => {
    empStat[c]['Tổng công'] = Math.round(empStat[c]['Tổng công'] * 100) / 100
  })

  console.log('2. Danh sách 8 nhân viên và tổng công tháng 8:')
  console.table(empStat)

  // Kiểm tra tài khoản hệ thống
  const { data: snapCheck } = await supabase
    .from('hr_records')
    .select('data')
    .eq('id', 'attendanceMonthSummaries::2026-08')
    .single()

  const snapNames = (snapCheck?.data?.rows || []).map(r => r.employeeName)
  console.log('3. Danh sách tên trên bảng công tháng 2026-08:', snapNames)
  const systemAccounts = snapNames.filter(n => n === 'Quản trị viên' || n === 'hoangcuong252003' || n === 'admin')
  console.log('4. Có account hệ thống lọt vào không?:', systemAccounts.length > 0 ? systemAccounts : 'KHÔNG (0 account)')
}

run().catch(console.error)
