import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateAttendanceMetrics,
  calculateWorkedMinutes,
  getAttendanceHoliday
} from './attendanceCalculations.js'

test('tính Công từ phút thực tế và tách phần vượt 480 phút', () => {
  const result = calculateAttendanceMetrics({ checkIn: '08:30', checkOut: '15:24' })
  assert.equal(calculateWorkedMinutes({ checkIn: '08:30', checkOut: '15:24' }), 414)
  assert.equal(result.hours, 6.9)
  assert.equal(result.regularWorkdays, 0.8625)
  assert.equal(result.overtimeHours, 0)
})

test('không tạo số âm cho dữ liệu rỗng, cùng giờ hoặc ca đêm', () => {
  assert.equal(calculateWorkedMinutes({}), null)
  assert.equal(calculateWorkedMinutes({ checkIn: '08:00', checkOut: '08:00' }), 0)
  assert.equal(calculateWorkedMinutes({ checkIn: '22:00', checkOut: '06:00' }), 480)
  const overnight = calculateAttendanceMetrics({ checkIn: '22:00', checkOut: '07:00' })
  assert.equal(overnight.regularWorkdays, 1)
  assert.equal(overnight.overtimeHours, 1)
})

test('ưu tiên tăng ca HR nhập và cho phép tắt tự động khi import Excel', () => {
  const manual = calculateAttendanceMetrics({
    log: { tc1: 0.5 },
    checkIn: '08:00',
    checkOut: '18:00'
  })
  assert.equal(manual.overtimeHours, 0.5)

  const excel = calculateAttendanceMetrics({
    log: { overtimeAutoDisabled: true },
    checkIn: '08:00',
    checkOut: '18:00'
  })
  assert.equal(excel.overtimeHours, 0)
})

test('nhận diện ngày lễ đã được cấu hình', () => {
  const holiday = getAttendanceHoliday('2026-09-02', {
    holidays: [{ date: '2026-09-02', name: 'Quốc khánh' }]
  })
  assert.deepEqual(holiday, { date: '2026-09-02', name: 'Quốc khánh' })
  assert.equal(getAttendanceHoliday('2026-09-03', { holidays: [] }), null)
})
