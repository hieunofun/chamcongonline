-- =============================================================================
-- CÔNG TY B (COMPANY B) — DỮ LIỆU DEMO GIẢ LẬP ĐỂ TEST
-- File này hoàn toàn KHÔNG sử dụng bất kỳ dữ liệu thật nào của Công ty A.
-- Chỉ tạo 1 công ty mẫu và 8 nhân viên giả lập theo đúng mẫu Excel (Ảnh 2).
-- Chạy script này trên SQL Editor của Supabase Project MỚI (Company B).
-- =============================================================================

DO $$
DECLARE
    v_company_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
    v_nv1 UUID := '00000000-0000-0000-0001-000000000001'::UUID;
    v_nv2 UUID := '00000000-0000-0000-0001-000000000002'::UUID;
    v_nv3 UUID := '00000000-0000-0000-0001-000000000003'::UUID;
    v_nv4 UUID := '00000000-0000-0000-0001-000000000004'::UUID;
    v_nv5 UUID := '00000000-0000-0000-0001-000000000005'::UUID;
    v_nv6 UUID := '00000000-0000-0000-0001-000000000006'::UUID;
    v_nv7 UUID := '00000000-0000-0000-0001-000000000007'::UUID;
    v_nv8 UUID := '00000000-0000-0000-0001-000000000008'::UUID;
    v_day DATE;
    v_dow INTEGER;
    v_val TEXT;
    v_cong NUMERIC(5,2);
    v_nhan_su_ids UUID[] := ARRAY[v_nv1, v_nv2, v_nv3, v_nv4, v_nv5, v_nv6, v_nv7, v_nv8];
    v_id UUID;
BEGIN
    -- 1. TẠO CÔNG TY DEMO B
    INSERT INTO public.companies (id, code, name, address, phone)
    VALUES (
        v_company_id,
        'COMPANY_B',
        'Công ty TNHH Demo B',
        'Tầng 5, Tòa nhà Innovation, Hà Nội',
        '0901234567'
    )
    ON CONFLICT (id) DO UPDATE 
    SET name = EXCLUDED.name, updated_at = now();

    -- 2. TẠO 8 NHÂN SỰ DEMO (Khớp theo Ảnh 2)
    INSERT INTO public.nhan_su (id, company_id, ma_nhan_vien, ho_ten, chuc_vu, bo_phan, ca_lam, trang_thai)
    VALUES 
        (v_nv1, v_company_id, '00001', 'Lê Trung Sỹ', 'Nhân viên', 'Kinh doanh', 'Ca ngày', 'Đang làm việc'),
        (v_nv2, v_company_id, '00002', 'Tạ Trần Thanh Tùng', 'Nhân viên', 'Kỹ thuật', 'Ca ngày', 'Đang làm việc'),
        (v_nv3, v_company_id, '00003', 'Nguyễn Thị Mai', 'Kế toán viên', 'Kế toán', 'Ca ngày', 'Đang làm việc'),
        (v_nv4, v_company_id, '00004', 'Trần Quốc Đạt', 'Trưởng phòng KD', 'Kinh doanh', 'Ca ngày', 'Đang làm việc'),
        (v_nv5, v_company_id, '00005', 'Đào Xuân Quyết', 'Nhân viên Vận hành', 'Vận hành', 'Ca ngày', 'Đang làm việc'),
        (v_nv6, v_company_id, '00006', 'Nguyễn Minh Hiếu', 'Kỹ sư hệ thống', 'Kỹ thuật', 'Ca ngày', 'Đang làm việc'),
        (v_nv7, v_company_id, '00007', 'Nguyễn Hồng Hạnh', 'Điều phối viên', 'Vận hành', 'Ca ngày', 'Đang làm việc'),
        (v_nv8, v_company_id, '00008', 'Nguyễn Thị Thùy Linh', 'Chuyên viên Hành chính', 'Hành chính', 'Ca ngày', 'Đang làm việc')
    ON CONFLICT (company_id, ma_nhan_vien) DO UPDATE
    SET ho_ten = EXCLUDED.ho_ten, chuc_vu = EXCLUDED.chuc_vu, bo_phan = EXCLUDED.bo_phan, updated_at = now();

    -- 3. TẠO DỮ LIỆU CHẤM CÔNG DEMO THÁNG 2026-08 (Ma trận 31 ngày)
    FOREACH v_id IN ARRAY v_nhan_su_ids LOOP
        FOR i IN 1..31 LOOP
            v_day := make_date(2026, 8, i);
            v_dow := EXTRACT(DOW FROM v_day); -- 0: Chủ nhật, 6: Thứ 7

            IF v_dow = 0 THEN
                -- Chủ nhật nghỉ: công = 0
                v_val := '0';
                v_cong := 0;
            ELSE
                -- Ngày thường: công = 1
                v_val := '1';
                v_cong := 1.0;
            END IF;

            INSERT INTO public.cham_cong (
                company_id,
                nhan_su_id,
                ngay,
                gia_tri_goc,
                gio_vao,
                gio_ra,
                ca_lam,
                tong_cong,
                tang_ca,
                phep_su_dung
            )
            VALUES (
                v_company_id,
                v_id,
                v_day,
                v_val,
                CASE WHEN v_cong > 0 THEN '08:00:00'::TIME ELSE NULL END,
                CASE WHEN v_cong > 0 THEN '17:00:00'::TIME ELSE NULL END,
                'Ca ngày',
                v_cong,
                CASE WHEN i IN (10, 20) AND v_dow != 0 THEN 1.5 ELSE 0 END,
                0
            )
            ON CONFLICT (company_id, nhan_su_id, ngay) DO UPDATE
            SET gia_tri_goc = EXCLUDED.gia_tri_goc,
                tong_cong = EXCLUDED.tong_cong,
                tang_ca = EXCLUDED.tang_ca,
                updated_at = now();
        END LOOP;
    END LOOP;

    -- 4. TẠO BẢNG TỔNG HỢP CÔNG THÁNG 2026-08 DEMO (Mô phỏng Ảnh 1)
    INSERT INTO public.bang_cong_thang (
        company_id, nhan_su_id, thang, tong_cong, tang_ca, phep_su_dung, cong_lam_le, cong_le, so_lan_tre_som, phut_tre_som, xac_nhan
    )
    SELECT 
        c.company_id,
        c.nhan_su_id,
        '2026-08',
        COALESCE(SUM(c.tong_cong), 0),
        COALESCE(SUM(c.tang_ca), 0),
        COALESCE(SUM(c.phep_su_dung), 0),
        COALESCE(SUM(c.cong_lam_le), 0),
        COALESCE(SUM(c.cong_le), 0),
        0,
        0,
        false
    FROM public.cham_cong c
    WHERE c.company_id = v_company_id
      AND c.ngay >= '2026-08-01' AND c.ngay <= '2026-08-31'
    GROUP BY c.company_id, c.nhan_su_id
    ON CONFLICT (company_id, nhan_su_id, thang) DO UPDATE
    SET tong_cong = EXCLUDED.tong_cong,
        tang_ca = EXCLUDED.tang_ca,
        updated_at = now();

END $$;
