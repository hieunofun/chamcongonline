import { useEffect, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'

// Internal component for searchable input
const SearchableInput = ({ label, name, value, onChange, options = [], disabled, placeholder, required }) => {
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Filter options based on input
  // Display all options if input is empty, or filter by includes
  const filteredOptions = options.filter(opt =>
    !value || opt.toLowerCase().includes(value.toLowerCase())
  )

  return (
    <div className="form-group" style={{ position: 'relative' }}>
      <label>{label}</label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} // Delay to allow click
        autoComplete="off"
      />

      {/* Custom Dropdown */}
      {showSuggestions && !disabled && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '0 0 6px 6px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          zIndex: 1000,
          maxHeight: '200px',
          overflowY: 'auto',
          marginTop: '-1px'
        }}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, idx) => (
              <div
                key={idx}
                onClick={() => {
                  // Simulate change event
                  onChange({ target: { name, value: opt } })
                  setShowSuggestions(false)
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: idx === filteredOptions.length - 1 ? 'none' : '1px solid #f1f5f9',
                  color: '#334155',
                  transition: 'background 0.2s',
                  fontSize: '14px'
                }}
                onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                onMouseLeave={(e) => e.target.style.background = '#fff'}
              >
                {opt}
              </div>
            ))
          ) : (
            null
          )}
        </div>
      )}
    </div>
  )
}

function RecruitmentPlanModal({ plan, isOpen, onClose, onSave, readOnly = false, departments = [], positions = [] }) {
  const [formData, setFormData] = useState({
    bo_phan: '',
    vi_tri: '',
    nhan_su_hien_co: '',
    dinh_bien: '',
    ghi_chu: ''
  })

  useEffect(() => {
    if (plan) {
      setFormData({
        bo_phan: plan.bo_phan || '',
        vi_tri: plan.vi_tri || '',
        nhan_su_hien_co: plan.nhan_su_hien_co || '',
        dinh_bien: plan.dinh_bien || '',
        ghi_chu: plan.ghi_chu || ''
      })
    } else {
      resetForm()
    }
  }, [plan, isOpen])

  const resetForm = () => {
    setFormData({
      bo_phan: '',
      vi_tri: '',
      nhan_su_hien_co: '',
      dinh_bien: '',
      ghi_chu: ''
    })
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (readOnly) return

    try {
      const payload = {
        bo_phan: formData.bo_phan.trim(),
        vi_tri: formData.vi_tri.trim(),
        nhan_su_hien_co: Number(formData.nhan_su_hien_co || 0),
        dinh_bien: Number(formData.dinh_bien || 0),
        ghi_chu: formData.ghi_chu.trim()
      }

      if (!payload.bo_phan || !payload.vi_tri) {
        alert('Vui lòng nhập Bộ phận và Vị trí')
        return
      }

      if (plan && plan.id) {
        await fbUpdate(`hr/recruitmentPlans/${plan.id}`, payload)
      } else {
        await fbPush('hr/recruitmentPlans', payload)
      }

      onSave()
      onClose()
      resetForm()
    } catch (error) {
      alert('Lỗi khi lưu: ' + error.message)
    }
  }

  if (!isOpen) return null

  const getTitle = () => {
    if (readOnly) return 'Chi tiết định biên nhân sự'
    return plan ? 'Sửa định biên nhân sự' : 'Tạo mới định biên nhân sự'
  }

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className={readOnly ? "fas fa-eye" : "fas fa-users-cog"}></i>
            {getTitle()}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <SearchableInput
                label="Bộ phận *"
                name="bo_phan"
                value={formData.bo_phan}
                onChange={handleChange}
                options={departments}
                disabled={readOnly}
                required
                placeholder="Nhập hoặc chọn bộ phận"
              />
              <SearchableInput
                label="Vị trí *"
                name="vi_tri"
                value={formData.vi_tri}
                onChange={handleChange}
                options={positions}
                disabled={readOnly}
                required
                placeholder="Nhập hoặc chọn vị trí"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Nhân sự hiện có</label>
                <input
                  type="number"
                  name="nhan_su_hien_co"
                  value={formData.nhan_su_hien_co}
                  onChange={handleChange}
                  min="0"
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Định biên</label>
                <input
                  type="number"
                  name="dinh_bien"
                  value={formData.dinh_bien}
                  onChange={handleChange}
                  min="0"
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Ghi chú</label>
              <textarea
                name="ghi_chu"
                value={formData.ghi_chu}
                onChange={handleChange}
                rows="3"
                placeholder="VD: Mở rộng thị trường, bổ sung nhân sự Ads cứng..."
                disabled={readOnly}
              />
            </div>

            <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={onClose}>
                {readOnly ? 'Đóng' : 'Hủy'}
              </button>
              {!readOnly && (
                <button type="submit" className="btn btn-primary">
                  <i className="fas fa-save"></i>
                  Lưu
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default RecruitmentPlanModal


