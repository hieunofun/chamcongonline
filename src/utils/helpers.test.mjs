import assert from 'node:assert/strict'
import test from 'node:test'
import { getEmployeeEmploymentStatus, mapUserToApp } from './helpers.js'

test('không suy diễn hồ sơ có employment_status rỗng thành Chính thức', () => {
  const employee = mapUserToApp({
    id: 'employee-1',
    name: 'Nhân viên chưa đánh dấu',
    employment_status: '',
    status: 'Chính thức'
  })
  assert.equal(getEmployeeEmploymentStatus(employee), '')
})

test('giữ đúng trạng thái HR đã đánh dấu và fallback legacy khi không có cột mới', () => {
  assert.equal(getEmployeeEmploymentStatus({ employmentStatus: 'Thử việc' }), 'Thử việc')
  assert.equal(getEmployeeEmploymentStatus({ status: 'Nghỉ việc' }), 'Nghỉ việc')
})
