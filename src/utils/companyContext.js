import { DEFAULT_COMPANY_ID } from '../services/supabase'

export const getCompanyIdForUser = (user) => {
  const companyId = user?.company_id || user?.companyId || user?.company?.id
  return String(companyId || '').trim() || DEFAULT_COMPANY_ID
}

export const getCompanyNameForContext = (company, user) => {
  const candidates = [
    company?.name,
    company?.company_name,
    company?.ten_cong_ty,
    user?.company_name,
    user?.companyName,
    user?.ten_cong_ty,
    user?.tenCongTy,
    user?.company?.name
  ]
  const name = candidates.find(value => String(value || '').trim())
  return String(name || 'Công ty chưa khai báo').trim()
}
