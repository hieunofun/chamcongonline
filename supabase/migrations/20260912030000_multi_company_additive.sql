-- =============================================================================
-- PHASE 2: ADDITIVE MIGRATION CHO MULTI-COMPANY (KHÔNG PHÁ DỮ LIỆU HIỆN CÓ)
-- =============================================================================

-- 1. Bổ sung cột status cho bảng companies
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 2. Bổ sung cột company_id cho bảng users
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_company_id ON public.users(company_id);

-- 3. Bổ sung cột user_id cho bảng nhan_su
ALTER TABLE public.nhan_su
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nhan_su_user_id ON public.nhan_su(user_id);

-- 4. Bổ sung cột tong_gio, nguon_cham_cong, ghi_chu cho bảng cham_cong
ALTER TABLE public.cham_cong
ADD COLUMN IF NOT EXISTS tong_gio NUMERIC(5, 2) DEFAULT 0;

ALTER TABLE public.cham_cong
ADD COLUMN IF NOT EXISTS nguon_cham_cong TEXT DEFAULT 'machine_import';

ALTER TABLE public.cham_cong
ADD COLUMN IF NOT EXISTS ghi_chu TEXT;

-- Bổ sung CHECK constraint cho nguon_cham_cong: machine_import, online, manual
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_cham_cong_nguon_cham_cong'
    ) THEN
        ALTER TABLE public.cham_cong
        ADD CONSTRAINT chk_cham_cong_nguon_cham_cong
        CHECK (nguon_cham_cong IN ('machine_import', 'online', 'manual'));
    END IF;
END $$;

-- 5. Cập nhật nhẹ (non-destructive) cho 167 bản ghi cham_cong hiện tại
UPDATE public.cham_cong
SET
  nguon_cham_cong = COALESCE(nguon_cham_cong, 'machine_import'),
  tong_gio = CASE
    WHEN tong_gio IS NULL OR tong_gio = 0 THEN
      CASE
        WHEN gia_tri_goc ~ '^[0-9]+(\.[0-9]+)?$' THEN gia_tri_goc::numeric(5,2)
        WHEN tong_cong > 0 THEN round(tong_cong * 8, 2)
        ELSE 0
      END
    ELSE tong_gio
  END,
  ghi_chu = COALESCE(ghi_chu, notes)
WHERE nguon_cham_cong IS NULL OR tong_gio IS NULL OR tong_gio = 0;
