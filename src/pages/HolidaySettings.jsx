import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { fbGet, fbUpdate } from '../services/firebase'
import { getCompanyIdForUser } from '../utils/companyContext'
import { normalizeAttendanceShiftSettings } from '../utils/attendanceShift'
import './HolidaySettings.css'

const sortHolidays = holidays => [...(holidays || [])]
  .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(String(item?.date || '')))
  .sort((left, right) => left.date.localeCompare(right.date))

function HolidaySettings() {
  const { user } = useAuth()
  const companyId = useMemo(() => getCompanyIdForUser(user), [user])
  const [holidays, setHolidays] = useState([])
  const [holidayDate, setHolidayDate] = useState('')
  const [holidayName, setHolidayName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const stored = await fbGet('hr/attendanceSettings/default', companyId)
      setHolidays(sortHolidays(normalizeAttendanceShiftSettings(stored).holidays))
    } catch (requestError) {
      setError(requestError.message || 'Không tải được cài đặt ngày lễ.')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const addHoliday = () => {
    setError('')
    setNotice('')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) {
      setError('Vui lòng chọn ngày lễ.')
      return
    }
    setHolidays(current => sortHolidays([
      ...current.filter(item => item.date !== holidayDate),
      { date: holidayDate, name: holidayName.trim() }
    ]))
    setHolidayDate('')
    setHolidayName('')
  }

  const removeHoliday = date => {
    setNotice('')
    setHolidays(current => current.filter(item => item.date !== date))
  }

  const saveSettings = async () => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await fbUpdate('hr/attendanceSettings/default', { holidays: sortHolidays(holidays) }, companyId)
      setNotice('Đã lưu cài đặt ngày lễ. Hãy tổng hợp lại Bảng Công để cập nhật tháng liên quan.')
    } catch (requestError) {
      setError(requestError.message || 'Không lưu được cài đặt ngày lễ.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="holiday-settings-page">
      <header className="holiday-settings-head">
        <div>
          <h1>Cài đặt ngày lễ</h1>
          <p>Khai báo ngày lễ/ngày nghỉ để hiển thị chính xác trên Bảng Công.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={saveSettings} disabled={loading || saving}>
          <i className="fas fa-save"></i> {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
        </button>
      </header>

      {error && <div className="holiday-settings-alert is-error">{error}</div>}
      {notice && <div className="holiday-settings-alert is-success">{notice}</div>}

      <section className="holiday-settings-card">
        <div className="holiday-settings-form">
          <label>
            <span>Ngày</span>
            <input type="date" value={holidayDate} onChange={event => setHolidayDate(event.target.value)} />
          </label>
          <label>
            <span>Tên ngày lễ</span>
            <input type="text" value={holidayName} onChange={event => setHolidayName(event.target.value)} placeholder="Ví dụ: Quốc khánh" />
          </label>
          <button type="button" className="btn" onClick={addHoliday} disabled={loading || !holidayDate}>
            <i className="fas fa-plus"></i> Thêm ngày lễ
          </button>
        </div>

        {loading ? (
          <div className="holiday-settings-empty">Đang tải cài đặt...</div>
        ) : holidays.length === 0 ? (
          <div className="holiday-settings-empty">Chưa khai báo ngày lễ.</div>
        ) : (
          <div className="holiday-settings-list">
            {holidays.map(item => (
              <div className="holiday-settings-item" key={item.date}>
                <div>
                  <strong>{new Date(`${item.date}T00:00:00`).toLocaleDateString('vi-VN')}</strong>
                  <span>{item.name || 'Ngày lễ'}</span>
                </div>
                <button type="button" className="btn btn-icon" onClick={() => removeHoliday(item.date)} title="Xóa ngày lễ">
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default HolidaySettings
