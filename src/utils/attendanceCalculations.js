import { attendanceTimeToMinutes } from './attendanceShift.js'

/**
 * Một ngày công đủ được quy đổi từ đúng 480 phút làm việc thực tế.
 * Không dùng số giờ đã làm tròn từ Excel để tính lại tổng tháng.
 */
export const STANDARD_WORK_MINUTES = 8 * 60

const finiteNumber = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const roundDecimal = (value, digits = 2) => {
  const factor = 10 ** digits
  return Math.round((finiteNumber(value) + Number.EPSILON) * factor) / factor
}

const firstPresent = (...values) =>
  values.find(value => value !== null && value !== undefined && String(value).trim() !== '')

/**
 * Tính số phút giữa cặp Vào/Ra. Ca đêm được nối sang ngày kế tiếp thay vì
 * tạo số âm. `breakMinutes` chỉ được trừ khi được cấu hình rõ ràng; mặc định
 * dữ liệu chấm công được tính đúng theo chênh lệch Vào → Ra.
 */
export const calculateWorkedMinutes = ({
  checkIn,
  checkOut,
  breakMinutes = 0
} = {}) => {
  const inMinutes = attendanceTimeToMinutes(checkIn)
  const outMinutes = attendanceTimeToMinutes(checkOut)
  if (inMinutes === null || outMinutes === null) return null

  let elapsed = outMinutes - inMinutes
  if (elapsed < 0) elapsed += 24 * 60
  if (elapsed <= 0) return 0

  const unpaidBreak = Math.max(0, finiteNumber(breakMinutes))
  return Math.max(0, elapsed - unpaidBreak)
}

const manualOvertimeHours = log => {
  const fields = ['tc1', 'tc2', 'tc3']
  const hasManualValue = fields.some(field =>
    log && log[field] !== null && log[field] !== undefined &&
    String(log[field]).trim() !== '' && finiteNumber(log[field]) > 0
  )
  if (!hasManualValue) return { hasValue: false, hours: 0 }

  return {
    hasValue: true,
    hours: Math.max(0, fields.reduce((total, field) => total + finiteNumber(log[field]), 0))
  }
}

/**
 * Tính Công/Giờ/Tăng ca cho một bản ghi.
 *
 * - Có đủ Vào/Ra: luôn lấy phút thực tế từ hai mốc giờ, bỏ qua `hours`,
 *   `tongGio` và `cong` cũ do máy/Excel gửi lên.
 * - Không có Vào/Ra: giữ số giờ/công nguồn để không làm mất dữ liệu import
 *   dạng mã công (1, 0.5, P...).
 * - Tăng ca thủ công (TC1/TC2/TC3) luôn được ưu tiên. Tự động tách phần vượt
 *   480 phút chỉ chạy khi bản ghi không đánh dấu `overtimeAutoDisabled`.
 */
export const calculateAttendanceMetrics = ({
  log = {},
  checkIn = firstPresent(log.checkIn, log.vao),
  checkOut = firstPresent(log.checkOut, log.ra),
  standardMinutes = STANDARD_WORK_MINUTES,
  breakMinutes = 0,
  autoCalculateOvertime = true,
  fallbackHours,
  fallbackWorkdays
} = {}) => {
  const standard = Math.max(1, finiteNumber(standardMinutes, STANDARD_WORK_MINUTES))
  const workedMinutes = calculateWorkedMinutes({ checkIn, checkOut, breakMinutes })
  const hasPunchPair = workedMinutes !== null
  const manual = manualOvertimeHours(log)
  const sourceHours = finiteNumber(
    firstPresent(fallbackHours, log.hours, log.soGio, log.gio),
    0
  )

  if (!hasPunchPair) {
    const sourceWorkdays = fallbackWorkdays !== undefined && fallbackWorkdays !== null
      ? Math.max(0, finiteNumber(fallbackWorkdays))
      : Math.min(Math.max(0, sourceHours * 60) / standard, 1)
    return {
      hasPunchPair: false,
      workedMinutes: Math.max(0, sourceHours * 60),
      regularMinutes: Math.min(Math.max(0, sourceHours * 60), standard),
      overtimeMinutes: manual.hasValue ? manual.hours * 60 : 0,
      hours: Math.max(0, sourceHours),
      regularWorkdays: sourceWorkdays,
      overtimeHours: manual.hasValue ? manual.hours : 0,
      overtimeSource: manual.hasValue ? 'manual' : 'none'
    }
  }

  const regularMinutes = Math.min(workedMinutes, standard)
  const excessMinutes = Math.max(0, workedMinutes - standard)
  const automaticAllowed = autoCalculateOvertime && !log.overtimeAutoDisabled
  const overtimeHours = manual.hasValue
    ? manual.hours
    : automaticAllowed
      ? excessMinutes / 60
      : 0

  return {
    hasPunchPair: true,
    workedMinutes,
    regularMinutes,
    overtimeMinutes: overtimeHours * 60,
    hours: workedMinutes / 60,
    regularWorkdays: regularMinutes / standard,
    overtimeHours,
    overtimeSource: manual.hasValue ? 'manual' : automaticAllowed ? 'automatic' : 'disabled'
  }
}

export const getAttendanceHoliday = (date, attendanceSettings = {}) => {
  const dateKey = String(date || '').slice(0, 10)
  if (!dateKey) return null
  const holidays = Array.isArray(attendanceSettings?.holidays)
    ? attendanceSettings.holidays
    : []
  return holidays
    .map(item => {
      if (typeof item === 'string') return { date: item.slice(0, 10), name: '' }
      return {
        date: String(item?.date || item?.day || '').slice(0, 10),
        name: String(item?.name || item?.label || '').trim()
      }
    })
    .find(item => item.date === dateKey) || null
}
