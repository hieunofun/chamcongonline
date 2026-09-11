-- =============================================================================
-- CÔNG TY B (COMPANY B) — SUPABASE SCHEMA CỐT LÕI
-- Chạy toàn bộ script này trên SQL Editor của project Supabase MỚI (Company B).
-- Tuyệt đối KHÔNG chạy trên project Supabase cũ của Công ty A.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. BẢNG companies (Quản lý thông tin công ty / tenant)
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    logo_url TEXT,
    address TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. BẢNG nhan_su (Hồ sơ nhân sự công ty B)
CREATE TABLE IF NOT EXISTS public.nhan_su (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    ma_nhan_vien TEXT NOT NULL,
    ho_ten TEXT NOT NULL,
    chuc_vu TEXT,
    bo_phan TEXT,
    ca_lam TEXT DEFAULT 'Ca ngày',
    trang_thai TEXT DEFAULT 'Đang làm việc',
    so_dien_thoai TEXT,
    email TEXT,
    ngay_vao_lam DATE,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_nhan_su_company_ma_nv UNIQUE (company_id, ma_nhan_vien)
);

-- 3. BẢNG cham_cong (Dữ liệu chấm công chi tiết theo ngày 01-31)
CREATE TABLE IF NOT EXISTS public.cham_cong (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nhan_su_id UUID NOT NULL REFERENCES public.nhan_su(id) ON DELETE CASCADE,
    ngay DATE NOT NULL,
    gia_tri_goc TEXT, -- Lưu nguyên giá trị gốc từ bảng công Excel: '0', '1', 'P', 'X', '0.5'...
    gio_vao TIME,
    gio_ra TIME,
    ca_lam TEXT,
    tang_ca NUMERIC(5, 2) DEFAULT 0,
    phep_su_dung NUMERIC(5, 2) DEFAULT 0,
    cong_lam_le NUMERIC(5, 2) DEFAULT 0,
    cong_le NUMERIC(5, 2) DEFAULT 0,
    tong_cong NUMERIC(5, 2) DEFAULT 0,
    notes TEXT,
    xac_nhan BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cham_cong_company_nhan_su_ngay UNIQUE (company_id, nhan_su_id, ngay)
);

-- 4. BẢNG bang_cong_thang (Tuỳ chọn: lưu snapshot chốt công theo tháng cho từng nhân sự)
CREATE TABLE IF NOT EXISTS public.bang_cong_thang (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nhan_su_id UUID NOT NULL REFERENCES public.nhan_su(id) ON DELETE CASCADE,
    thang TEXT NOT NULL, -- Định dạng 'YYYY-MM' ví dụ '2026-08'
    tong_cong NUMERIC(5, 2) DEFAULT 0,
    tang_ca NUMERIC(5, 2) DEFAULT 0,
    phep_su_dung NUMERIC(5, 2) DEFAULT 0,
    cong_lam_le NUMERIC(5, 2) DEFAULT 0,
    cong_le NUMERIC(5, 2) DEFAULT 0,
    so_lan_tre_som INTEGER DEFAULT 0,
    phut_tre_som INTEGER DEFAULT 0,
    xac_nhan BOOLEAN DEFAULT FALSE,
    ghi_chu TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_bang_cong_thang UNIQUE (company_id, nhan_su_id, thang)
);

-- 5. CHỈ MỤC TỐI ƯU HIỆU NĂNG (INDEXES)
CREATE INDEX IF NOT EXISTS idx_nhan_su_company ON public.nhan_su(company_id);
CREATE INDEX IF NOT EXISTS idx_nhan_su_ma_nv ON public.nhan_su(ma_nhan_vien);
CREATE INDEX IF NOT EXISTS idx_cham_cong_company_ngay ON public.cham_cong(company_id, ngay);
CREATE INDEX IF NOT EXISTS idx_cham_cong_nhan_su_ngay ON public.cham_cong(nhan_su_id, ngay);
CREATE INDEX IF NOT EXISTS idx_bang_cong_thang_company ON public.bang_cong_thang(company_id, thang);

-- 6. BẬT ROW LEVEL SECURITY (RLS)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhan_su ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_cong ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bang_cong_thang ENABLE ROW LEVEL SECURITY;

-- 7. CHÍNH SÁCH BẢO MẬT (POLICIES) CHO PHÉP CLIENT (ANON / AUTHENTICATED) TRUY VẤN
DROP POLICY IF EXISTS "Allow all for companies" ON public.companies;
CREATE POLICY "Allow all for companies" ON public.companies FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for nhan_su" ON public.nhan_su;
CREATE POLICY "Allow all for nhan_su" ON public.nhan_su FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for cham_cong" ON public.cham_cong;
CREATE POLICY "Allow all for cham_cong" ON public.cham_cong FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for bang_cong_thang" ON public.bang_cong_thang;
CREATE POLICY "Allow all for bang_cong_thang" ON public.bang_cong_thang FOR ALL USING (true) WITH CHECK (true);
