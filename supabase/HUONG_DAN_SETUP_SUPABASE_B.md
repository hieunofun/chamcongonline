# HƯỚNG DẪN CÀI ĐẶT SUPABASE CHO CÔNG TY B (DỰ ÁN MỚI)

> ⚠️ **CẢNH BÁO QUAN TRỌNG**:
> Tuyệt đối KHÔNG chạy các lệnh SQL bên dưới trên Supabase của Công ty A (`xrxhfjecwpwqalbtbyui`).
> Hãy tạo một Project Supabase MỚI HOÀN TOÀN trên dashboard https://supabase.com.

---

### Bước 1: Tạo Project Supabase Mới
1. Đăng nhập https://supabase.com.
2. Bấm **New project** → Đặt tên (VD: `HR-Company-B`) → Chọn database password → Chọn Region gần (Singapore).
3. Đợi vài phút để Supabase khởi tạo project.

---

### Bước 2: Chạy Schema & Seed Data
1. Tại menu bên trái của Dashboard Supabase mới, bấm chọn **SQL Editor** (`>_`).
2. Mở file [01_schema_company_b.sql](file:///d:/hr/HR-Company-B/supabase/01_schema_company_b.sql):
   - Copy toàn bộ nội dung dán vào SQL Editor.
   - Bấm **Run** (Ctrl + Enter).
   - Kiểm tra kết quả: Tạo thành công các bảng `companies`, `nhan_su`, `cham_cong`, `bang_cong_thang`.
3. Mở file [02_seed_demo_b.sql](file:///d:/hr/HR-Company-B/supabase/02_seed_demo_b.sql):
   - Copy toàn bộ nội dung dán vào SQL Editor.
   - Bấm **Run**.
   - Kết quả: Đã nạp sẵn 1 công ty mẫu và 8 nhân viên demo (Lê Trung Sỹ, Tạ Trần Thanh Tùng, Nguyễn Thị Mai...) cùng bảng công tháng 2026-08 giả lập.

---

### Bước 3: Cấu hình File `.env` cho Dự án
1. Vào mục **Project Settings** → **API** trên dashboard Supabase mới.
2. Copy 2 thông tin:
   - **Project URL** (VD: `https://abcdefghijklmnop.supabase.co`)
   - **anon public key** (chuỗi ký tự dài bắt đầu bằng `sb_publishable_...` hoặc `eyJ...`)
3. Mở file [d:/hr/HR-Company-B/.env](file:///d:/hr/HR-Company-B/.env) và dán thông tin vào:
   ```env
   VITE_SUPABASE_URL="https://abcdefghijklmnop.supabase.co"
   VITE_SUPABASE_ANON_KEY="sb_publishable_..."
   VITE_DEFAULT_COMPANY_ID="00000000-0000-0000-0000-000000000001"
   ```

---

### Bước 4: Khởi chạy Dự án
Mở terminal tại thư mục `d:\hr\HR-Company-B` và chạy:
```bash
npm run dev
```
Dự án sẽ khởi chạy và kết nối trực tiếp đến Supabase mới của Công ty B, hoàn toàn cách ly với Công ty A.
