
import { createClient } from '@supabase/supabase-js'

const cleanEnv = (val) => (typeof val === 'string' ? val.replace(/^[\uFEFF\s]+|[\uFEFF\s]+$/g, '') : val)

const supabaseUrl = cleanEnv(import.meta.env.VITE_SUPABASE_URL)
const supabaseAnonKey = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY)

const OLD_COMPANY_SUPABASE_HOST = 'xrxhfjecwpwqalbtbyui'

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Thiếu cấu hình Supabase cho Công ty B. Mở file .env và điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY của project Supabase mới.'
  )
}

if (supabaseUrl.includes(OLD_COMPANY_SUPABASE_HOST)) {
  throw new Error(
    'NGUY HIỂM: Phát hiện cấu hình URL của Supabase Công ty cũ (Company A). Hãy đổi VITE_SUPABASE_URL trong file .env sang Supabase Project B mới!'
  )
}

if (supabaseUrl.includes('your-company-b-project-id')) {
  console.warn(
    'CẢNH BÁO: Bạn chưa cấu hình VITE_SUPABASE_URL thật trong file .env. Vui lòng mở file .env và điền thông tin Supabase mới của Công ty B.'
  )
}

export const DEFAULT_COMPANY_ID =
  cleanEnv(import.meta.env.VITE_DEFAULT_COMPANY_ID) || '00000000-0000-0000-0000-000000000022'

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)

