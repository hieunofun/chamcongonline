-- Cách ly nhiều công ty trong cùng một Supabase project bằng company_id + RLS.
BEGIN;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.company_id
  FROM public.users AS u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_hr_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id
  FROM public.users AS u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_hr_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(u.role, 'user')
  FROM public.users AS u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_hr_profile_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_hr_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_hr_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_hr_role() TO authenticated;

ALTER TABLE public.users ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.users ALTER COLUMN company_id SET NOT NULL;

-- Tenant-scoped employee identifiers may repeat in different companies.
DROP INDEX IF EXISTS public.users_employee_id_unique;
DROP INDEX IF EXISTS public.users_username_unique;
CREATE UNIQUE INDEX IF NOT EXISTS users_company_employee_id_unique
  ON public.users(company_id, employee_id)
  WHERE employee_id IS NOT NULL AND employee_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS users_company_username_unique
  ON public.users(company_id, username)
  WHERE username IS NOT NULL AND username <> '';

-- Keep auth_user_id globally unique, and prevent deleting a company from
-- silently NULLing a required tenant assignment on its user profiles.
DO $$
DECLARE
  users_company_attnum SMALLINT;
  existing_fk RECORD;
BEGIN
  SELECT attnum INTO users_company_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.users'::REGCLASS
    AND attname = 'company_id'
    AND NOT attisdropped;

  FOR existing_fk IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.users'::REGCLASS
      AND confrelid = 'public.companies'::REGCLASS
      AND contype = 'f'
      AND conkey = ARRAY[users_company_attnum]::SMALLINT[]
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', existing_fk.conname);
  END LOOP;
END
$$;

ALTER TABLE public.users
  ADD CONSTRAINT users_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE public.hr_records ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.attendance_penalties ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.employee_status_history ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.performance_reviews ADD COLUMN IF NOT EXISTS company_id UUID;

DO $$
DECLARE
  target_table REGCLASS;
  constraint_name TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'public.hr_records'::REGCLASS,
    'public.attendance_penalties'::REGCLASS,
    'public.employee_status_history'::REGCLASS,
    'public.performance_reviews'::REGCLASS
  ]
  LOOP
    constraint_name := replace(target_table::TEXT, '.', '_') || '_company_id_fkey';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = target_table
        AND contype = 'f'
        AND confrelid = 'public.companies'::REGCLASS
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (company_id)%'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE',
        target_table,
        constraint_name
      );
    END IF;
  END LOOP;
END
$$;

-- Dữ liệu trước khi multi-tenant thuộc Công ty 22.
UPDATE public.hr_records AS record
SET company_id = company.id
FROM public.companies AS company
WHERE record.company_id IS NULL
  AND record.id LIKE company.id::TEXT || '::%';

UPDATE public.hr_records
SET company_id = '00000000-0000-0000-0000-000000000022'::UUID
WHERE company_id IS NULL;

UPDATE public.attendance_penalties
SET company_id = '00000000-0000-0000-0000-000000000022'::UUID
WHERE company_id IS NULL;

UPDATE public.employee_status_history
SET company_id = '00000000-0000-0000-0000-000000000022'::UUID
WHERE company_id IS NULL;

UPDATE public.performance_reviews
SET company_id = '00000000-0000-0000-0000-000000000022'::UUID
WHERE company_id IS NULL;

ALTER TABLE public.hr_records
  ALTER COLUMN company_id SET DEFAULT public.current_company_id(),
  ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.attendance_penalties
  ALTER COLUMN company_id SET DEFAULT public.current_company_id(),
  ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.employee_status_history
  ALTER COLUMN company_id SET DEFAULT public.current_company_id(),
  ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.performance_reviews
  ALTER COLUMN company_id SET DEFAULT public.current_company_id(),
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hr_records_company_collection
  ON public.hr_records(company_id, collection);
CREATE INDEX IF NOT EXISTS idx_attendance_penalties_company_month
  ON public.attendance_penalties(company_id, month);
CREATE INDEX IF NOT EXISTS idx_employee_status_history_company
  ON public.employee_status_history(company_id);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_company
  ON public.performance_reviews(company_id);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhan_su ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_cong ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bang_cong_thang ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_row RECORD;
BEGIN
  FOR policy_row IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(ARRAY[
        'companies', 'users', 'nhan_su', 'cham_cong', 'bang_cong_thang',
        'hr_records', 'attendance_penalties', 'employee_status_history',
        'performance_reviews'
      ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_row.policyname, policy_row.tablename);
  END LOOP;
END
$$;

REVOKE ALL ON TABLE public.companies FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.users FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.nhan_su FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.cham_cong FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.bang_cong_thang FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.hr_records FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.attendance_penalties FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.employee_status_history FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.performance_reviews FROM PUBLIC, anon;

GRANT SELECT, UPDATE ON TABLE public.companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nhan_su TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cham_cong TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bang_cong_thang TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hr_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance_penalties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employee_status_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.performance_reviews TO authenticated;

CREATE POLICY companies_select_own ON public.companies
  FOR SELECT TO authenticated
  USING (id = public.current_company_id());
CREATE POLICY companies_update_own_admin ON public.companies
  FOR UPDATE TO authenticated
  USING (id = public.current_company_id() AND public.current_hr_role() = 'admin')
  WITH CHECK (id = public.current_company_id() AND public.current_hr_role() = 'admin');

CREATE POLICY users_select_own_tenant ON public.users
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR (
      company_id = public.current_company_id()
      AND public.current_hr_role() IN ('admin', 'hr', 'manager')
    )
  );
CREATE POLICY users_insert_own_tenant_admin ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_hr_role() = 'admin'
  );
CREATE POLICY users_update_own_tenant_admin ON public.users
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.current_hr_role() = 'admin')
  WITH CHECK (company_id = public.current_company_id() AND public.current_hr_role() = 'admin');
CREATE POLICY users_delete_own_tenant_admin ON public.users
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.current_hr_role() = 'admin');

CREATE POLICY nhan_su_tenant_staff ON public.nhan_su
  FOR ALL TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  );

CREATE POLICY cham_cong_tenant_staff ON public.cham_cong
  FOR ALL TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  );

CREATE POLICY bang_cong_thang_tenant_staff ON public.bang_cong_thang
  FOR ALL TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  );

CREATE POLICY hr_records_select_own_tenant ON public.hr_records
  FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND (
      public.current_hr_role() IN ('admin', 'hr', 'manager')
      OR collection = 'attendanceSettings'
      OR (
        collection = 'attendanceLogs'
        AND data ->> 'employeeId' = public.current_hr_profile_id()::TEXT
      )
    )
  );
CREATE POLICY hr_records_insert_tenant_staff ON public.hr_records
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  );
CREATE POLICY hr_records_update_tenant_staff ON public.hr_records
  FOR UPDATE TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  );
CREATE POLICY hr_records_delete_tenant_staff ON public.hr_records
  FOR DELETE TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  );

CREATE POLICY attendance_penalties_tenant_staff ON public.attendance_penalties
  FOR ALL TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  );

CREATE POLICY employee_status_history_tenant_staff ON public.employee_status_history
  FOR ALL TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  );

CREATE POLICY performance_reviews_select_tenant ON public.performance_reviews
  FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND (
      public.current_hr_role() IN ('admin', 'hr', 'manager')
      OR employee_id = public.current_hr_profile_id()
    )
  );
CREATE POLICY performance_reviews_write_tenant_staff ON public.performance_reviews
  FOR ALL TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_hr_role() IN ('admin', 'hr', 'manager')
  );

CREATE POLICY performance_reviews_insert_self ON public.performance_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.current_company_id()
    AND employee_id = public.current_hr_profile_id()
    AND public.current_hr_role() = 'user'
  );
CREATE POLICY performance_reviews_update_self ON public.performance_reviews
  FOR UPDATE TO authenticated
  USING (
    company_id = public.current_company_id()
    AND employee_id = public.current_hr_profile_id()
    AND public.current_hr_role() = 'user'
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND employee_id = public.current_hr_profile_id()
    AND public.current_hr_role() = 'user'
  );

-- A regular employee may save only their self-review fields. RLS controls the
-- row; this trigger prevents changing supervisor fields or final status.
CREATE OR REPLACE FUNCTION public.guard_performance_review_self_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT := public.current_hr_role();
  actor_profile UUID := public.current_hr_profile_id();
  actor_company UUID := public.current_company_id();
BEGIN
  IF auth.uid() IS NULL AND auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM actor_company THEN
    RAISE EXCEPTION 'Không được ghi đánh giá ngoài công ty đang đăng nhập';
  END IF;

  IF actor_role IN ('admin', 'hr', 'manager') THEN
    RETURN NEW;
  END IF;

  IF actor_role <> 'user' OR NEW.employee_id IS DISTINCT FROM actor_profile THEN
    RAISE EXCEPTION 'Chỉ được lưu phần tự đánh giá của hồ sơ đang đăng nhập';
  END IF;
  IF NEW.status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Nhân viên chỉ được lưu nháp hoặc nộp tự đánh giá';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.supervisor_assessment := '{}'::JSONB;
    NEW.supervisor_comment := NULL;
    NEW.supervisor_total_score := NULL;
    NEW.supervisor_grade := NULL;
  ELSE
    IF OLD.company_id IS DISTINCT FROM actor_company
      OR OLD.employee_id IS DISTINCT FROM actor_profile
      OR NEW.id IS DISTINCT FROM OLD.id
      OR NEW.month IS DISTINCT FROM OLD.month
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Không được chuyển hồ sơ đánh giá sang nhân viên, công ty hoặc tháng khác';
    END IF;
    IF OLD.status = 'submitted' AND (
      NEW.self_assessment IS DISTINCT FROM OLD.self_assessment
      OR NEW.self_comment IS DISTINCT FROM OLD.self_comment
      OR NEW.self_total_score IS DISTINCT FROM OLD.self_total_score
      OR NEW.self_grade IS DISTINCT FROM OLD.self_grade
      OR NEW.status IS DISTINCT FROM OLD.status
    ) THEN
      RAISE EXCEPTION 'Tự đánh giá đã nộp không thể chỉnh sửa';
    END IF;
    NEW.supervisor_assessment := OLD.supervisor_assessment;
    NEW.supervisor_comment := OLD.supervisor_comment;
    NEW.supervisor_total_score := OLD.supervisor_total_score;
    NEW.supervisor_grade := OLD.supervisor_grade;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS performance_reviews_guard_self_write ON public.performance_reviews;
CREATE TRIGGER performance_reviews_guard_self_write
  BEFORE INSERT OR UPDATE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_performance_review_self_write();

-- Disable the legacy password lookup RPC; login is through Supabase Auth.
DO $$
BEGIN
  IF to_regprocedure('public.check_credentials(text,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.check_credentials(text, text) FROM PUBLIC, anon, authenticated';
  END IF;
END
$$;

-- These SECURITY DEFINER RPCs serve only the authenticated profile resolved
-- from auth.uid(); every settings/log read and write is scoped by company_id.
CREATE OR REPLACE FUNCTION public.get_online_attendance_today()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.users%ROWTYPE;
  v_timezone TEXT := 'Asia/Ho_Chi_Minh';
  v_today DATE;
  v_settings JSONB;
  v_shift JSONB;
  v_record JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Bạn chưa đăng nhập';
  END IF;

  SELECT * INTO v_profile
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND company_id = public.current_company_id()
  LIMIT 1;
  IF NOT FOUND OR v_profile.company_id IS NULL THEN
    RAISE EXCEPTION 'Tài khoản chưa liên kết với hồ sơ nhân sự của công ty';
  END IF;

  SELECT data INTO v_settings
  FROM public.hr_records
  WHERE company_id = v_profile.company_id
    AND collection = 'attendanceSettings'
    AND id IN (
      v_profile.company_id::TEXT || '::attendanceSettings::default',
      'attendanceSettings::default'
    )
  ORDER BY CASE WHEN id = v_profile.company_id::TEXT || '::attendanceSettings::default' THEN 0 ELSE 1 END,
    updated_at DESC
  LIMIT 1;

  v_timezone := COALESCE(NULLIF(v_settings ->> 'timezone', ''), v_timezone);
  v_shift := public.attendance_shift_for_profile(v_profile, v_settings);
  v_today := (clock_timestamp() AT TIME ZONE v_timezone)::DATE;

  SELECT data INTO v_record
  FROM public.hr_records
  WHERE company_id = v_profile.company_id
    AND collection = 'attendanceLogs'
    AND data ->> 'employeeId' = v_profile.id::TEXT
    AND data ->> 'date' = to_char(v_today, 'YYYY-MM-DD')
  ORDER BY CASE WHEN COALESCE(data ->> 'checkIn', data ->> 'vao', '') <> '' THEN 0 ELSE 1 END,
    CASE WHEN id LIKE v_profile.company_id::TEXT || '::attendanceLogs::%' THEN 0 ELSE 1 END,
    updated_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'date', to_char(v_today, 'YYYY-MM-DD'),
    'shiftName', v_shift ->> 'name',
    'standardCheckIn', v_shift ->> 'standardCheckIn',
    'standardCheckOut', v_shift ->> 'standardCheckOut',
    'timezone', v_timezone,
    'record', v_record
  );
END
$$;

CREATE OR REPLACE FUNCTION public.employee_online_check_in()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.users%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_timezone TEXT := 'Asia/Ho_Chi_Minh';
  v_local TIMESTAMP;
  v_today DATE;
  v_time TIME;
  v_settings JSONB;
  v_shift JSONB;
  v_standard TIME;
  v_late INTEGER;
  v_record_id TEXT;
  v_saved_id TEXT;
  v_data JSONB;
  v_day_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Bạn chưa đăng nhập';
  END IF;

  SELECT * INTO v_profile
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND company_id = public.current_company_id()
  LIMIT 1;
  IF NOT FOUND OR v_profile.company_id IS NULL THEN
    RAISE EXCEPTION 'Tài khoản chưa liên kết với hồ sơ nhân sự của công ty';
  END IF;

  SELECT data INTO v_settings
  FROM public.hr_records
  WHERE company_id = v_profile.company_id
    AND collection = 'attendanceSettings'
    AND id IN (
      v_profile.company_id::TEXT || '::attendanceSettings::default',
      'attendanceSettings::default'
    )
  ORDER BY CASE WHEN id = v_profile.company_id::TEXT || '::attendanceSettings::default' THEN 0 ELSE 1 END,
    updated_at DESC
  LIMIT 1;

  v_timezone := COALESCE(NULLIF(v_settings ->> 'timezone', ''), v_timezone);
  v_shift := public.attendance_shift_for_profile(v_profile, v_settings);
  v_standard := (v_shift ->> 'standardCheckIn')::TIME;
  v_local := v_now AT TIME ZONE v_timezone;
  v_today := v_local::DATE;
  v_time := v_local::TIME;
  v_late := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_time - v_standard)) / 60)::INTEGER);

  PERFORM pg_advisory_xact_lock(hashtext(v_profile.company_id::TEXT || ':' || v_profile.id::TEXT || ':' || v_today::TEXT));

  SELECT id, data INTO v_record_id, v_data
  FROM public.hr_records
  WHERE company_id = v_profile.company_id
    AND collection = 'attendanceLogs'
    AND data ->> 'employeeId' = v_profile.id::TEXT
    AND data ->> 'date' = to_char(v_today, 'YYYY-MM-DD')
  ORDER BY CASE WHEN COALESCE(data ->> 'checkIn', data ->> 'vao', '') <> '' THEN 0 ELSE 1 END,
    CASE WHEN id LIKE v_profile.company_id::TEXT || '::attendanceLogs::%' THEN 0 ELSE 1 END,
    updated_at DESC
  LIMIT 1;

  IF v_data IS NOT NULL AND COALESCE(v_data ->> 'checkIn', v_data ->> 'vao', '') <> '' THEN
    RAISE EXCEPTION 'Hôm nay bạn đã Check-in';
  END IF;

  v_record_id := COALESCE(
    v_record_id,
    v_profile.company_id::TEXT || '::attendanceLogs::online_' || v_profile.id::TEXT || '_' || to_char(v_today, 'YYYYMMDD')
  );
  v_day_name := CASE extract(isodow FROM v_today)
    WHEN 1 THEN 'Thứ 2' WHEN 2 THEN 'Thứ 3' WHEN 3 THEN 'Thứ 4'
    WHEN 4 THEN 'Thứ 5' WHEN 5 THEN 'Thứ 6' WHEN 6 THEN 'Thứ 7'
    ELSE 'Chủ nhật' END;

  v_data := COALESCE(v_data, '{}'::JSONB) || jsonb_build_object(
    'employeeId', v_profile.id::TEXT,
    'employeeCode', COALESCE(v_profile.employee_id, v_profile.username, ''),
    'employeeName', COALESCE(v_profile.name, ''),
    'department', COALESCE(v_profile.department, ''),
    'position', COALESCE(v_profile.position, ''),
    'shiftName', v_shift ->> 'name',
    'date', to_char(v_today, 'YYYY-MM-DD'),
    'dayOfWeek', v_day_name,
    'timestamp', v_now,
    'checkIn', v_now,
    'checkOut', NULL,
    'vao', to_char(v_time, 'HH24:MI'),
    'ra', '',
    'lateMinutes', v_late,
    'vaoTre', v_late,
    'earlyMinutes', 0,
    'raSom', 0,
    'hours', 0,
    'gio', 0,
    'tongGio', 0,
    'cong', 0,
    'workMode', 'online',
    'source', 'employee-online',
    'status', 'Đang làm'
  );

  INSERT INTO public.hr_records AS current_record (id, collection, company_id, data, updated_at)
  VALUES (v_record_id, 'attendanceLogs', v_profile.company_id, v_data, v_now)
  ON CONFLICT (id) DO UPDATE
    SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
    WHERE current_record.company_id = EXCLUDED.company_id
      AND current_record.collection = EXCLUDED.collection
  RETURNING id INTO v_saved_id;
  IF v_saved_id IS NULL THEN
    RAISE EXCEPTION 'Không thể ghi bản chấm công vào công ty hiện tại';
  END IF;

  RETURN jsonb_build_object(
    'date', to_char(v_today, 'YYYY-MM-DD'),
    'shiftName', v_shift ->> 'name',
    'standardCheckIn', to_char(v_standard, 'HH24:MI'),
    'record', v_data
  );
END
$$;

CREATE OR REPLACE FUNCTION public.employee_online_check_out()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.users%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_timezone TEXT := 'Asia/Ho_Chi_Minh';
  v_local TIMESTAMP;
  v_today DATE;
  v_time TIME;
  v_settings JSONB;
  v_shift JSONB;
  v_standard TIME;
  v_early INTEGER;
  v_record_id TEXT;
  v_data JSONB;
  v_checkin_time TIME;
  v_hours NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Bạn chưa đăng nhập';
  END IF;

  SELECT * INTO v_profile
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND company_id = public.current_company_id()
  LIMIT 1;
  IF NOT FOUND OR v_profile.company_id IS NULL THEN
    RAISE EXCEPTION 'Tài khoản chưa liên kết với hồ sơ nhân sự của công ty';
  END IF;

  SELECT data INTO v_settings
  FROM public.hr_records
  WHERE company_id = v_profile.company_id
    AND collection = 'attendanceSettings'
    AND id IN (
      v_profile.company_id::TEXT || '::attendanceSettings::default',
      'attendanceSettings::default'
    )
  ORDER BY CASE WHEN id = v_profile.company_id::TEXT || '::attendanceSettings::default' THEN 0 ELSE 1 END,
    updated_at DESC
  LIMIT 1;

  v_timezone := COALESCE(NULLIF(v_settings ->> 'timezone', ''), v_timezone);
  v_shift := public.attendance_shift_for_profile(v_profile, v_settings);
  v_standard := (v_shift ->> 'standardCheckOut')::TIME;
  v_local := v_now AT TIME ZONE v_timezone;
  v_today := v_local::DATE;
  v_time := v_local::TIME;
  v_early := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_standard - v_time)) / 60)::INTEGER);

  PERFORM pg_advisory_xact_lock(hashtext(v_profile.company_id::TEXT || ':' || v_profile.id::TEXT || ':' || v_today::TEXT));

  SELECT id, data INTO v_record_id, v_data
  FROM public.hr_records
  WHERE company_id = v_profile.company_id
    AND collection = 'attendanceLogs'
    AND data ->> 'employeeId' = v_profile.id::TEXT
    AND data ->> 'date' = to_char(v_today, 'YYYY-MM-DD')
  ORDER BY CASE WHEN COALESCE(data ->> 'checkIn', data ->> 'vao', '') <> '' THEN 0 ELSE 1 END,
    CASE WHEN id LIKE v_profile.company_id::TEXT || '::attendanceLogs::%' THEN 0 ELSE 1 END,
    updated_at DESC
  LIMIT 1;

  IF v_data IS NULL OR COALESCE(v_data ->> 'checkIn', v_data ->> 'vao', '') = '' THEN
    RAISE EXCEPTION 'Bạn cần Check-in trước';
  END IF;
  IF COALESCE(v_data ->> 'checkOut', v_data ->> 'ra', '') <> '' THEN
    RAISE EXCEPTION 'Hôm nay bạn đã Check-out';
  END IF;

  BEGIN
    IF COALESCE(v_data ->> 'vao', '') ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]' THEN
      v_checkin_time := (v_data ->> 'vao')::TIME;
    ELSE
      v_checkin_time := ((v_data ->> 'checkIn')::TIMESTAMPTZ AT TIME ZONE v_timezone)::TIME;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_checkin_time := v_time;
  END;

  v_hours := GREATEST(0, EXTRACT(EPOCH FROM (v_time - v_checkin_time)) / 3600);
  IF v_checkin_time <= TIME '12:00' AND v_time >= TIME '13:30' THEN
    v_hours := GREATEST(0, v_hours - 1.5);
  END IF;
  v_hours := round(v_hours, 1);

  v_data := v_data || jsonb_build_object(
    'shiftName', v_shift ->> 'name',
    'checkOut', v_now,
    'ra', to_char(v_time, 'HH24:MI'),
    'earlyMinutes', v_early,
    'raSom', v_early,
    'hours', v_hours,
    'gio', v_hours,
    'tongGio', v_hours,
    'cong', CASE WHEN v_hours >= 7.5 THEN 1 WHEN v_hours >= 3 THEN 0.5 ELSE 0 END,
    'status', CASE WHEN v_hours >= 7.5 THEN 'Đủ' ELSE 'Thiếu' END
  );

  UPDATE public.hr_records
  SET data = v_data, updated_at = v_now
  WHERE id = v_record_id
    AND company_id = v_profile.company_id
    AND collection = 'attendanceLogs';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy bản chấm công của công ty hiện tại';
  END IF;

  RETURN jsonb_build_object(
    'date', to_char(v_today, 'YYYY-MM-DD'),
    'shiftName', v_shift ->> 'name',
    'standardCheckOut', to_char(v_standard, 'HH24:MI'),
    'record', v_data
  );
END
$$;

REVOKE ALL ON FUNCTION public.get_online_attendance_today() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.employee_online_check_in() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.employee_online_check_out() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_online_attendance_today() TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_online_check_in() TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_online_check_out() TO authenticated;

COMMIT;
