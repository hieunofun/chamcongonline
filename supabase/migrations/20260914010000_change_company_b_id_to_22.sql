-- Đổi ID Công ty B từ UUID đại diện 1 sang UUID đại diện 22.
-- Script tự tìm mọi khóa ngoại trực tiếp tới public.companies(id),
-- nên vẫn an toàn khi các bảng multi-company mới được bổ sung sau này.
DO $$
DECLARE
  old_company_id CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
  new_company_id CONSTANT UUID := '00000000-0000-0000-0000-000000000022';
  original_company_code TEXT;
  original_company JSONB;
  company_reference RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM public.companies WHERE id = old_company_id)
     AND EXISTS (SELECT 1 FROM public.companies WHERE id = new_company_id) THEN
    RAISE EXCEPTION
      'Không thể đổi company ID: cả ID cũ (%) và ID mới (%) đều đã tồn tại',
      old_company_id,
      new_company_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.companies WHERE id = old_company_id) THEN
    SELECT code, to_jsonb(companies)
    INTO original_company_code, original_company
    FROM public.companies
    WHERE id = old_company_id;

    -- Giải phóng unique key companies.code trong chính transaction này.
    UPDATE public.companies
    SET code = original_company_code || '__migrating_from_1'
    WHERE id = old_company_id;

    original_company := jsonb_set(
      original_company,
      '{id}',
      to_jsonb(new_company_id)
    );

    -- jsonb_populate_record giúp giữ nguyên cả các cột companies được bổ sung về sau.
    EXECUTE
      'INSERT INTO public.companies '
      || 'SELECT * FROM jsonb_populate_record(NULL::public.companies, $1)'
    USING original_company;

    FOR company_reference IN
      SELECT
        constraint_table.oid::regclass AS table_name,
        referencing_column.attname AS column_name
      FROM pg_constraint AS foreign_key
      JOIN pg_class AS constraint_table
        ON constraint_table.oid = foreign_key.conrelid
      JOIN LATERAL unnest(foreign_key.conkey) WITH ORDINALITY AS referencing_key(attnum, position)
        ON TRUE
      JOIN LATERAL unnest(foreign_key.confkey) WITH ORDINALITY AS referenced_key(attnum, position)
        ON referenced_key.position = referencing_key.position
      JOIN pg_attribute AS referencing_column
        ON referencing_column.attrelid = foreign_key.conrelid
       AND referencing_column.attnum = referencing_key.attnum
      JOIN pg_attribute AS referenced_column
        ON referenced_column.attrelid = foreign_key.confrelid
       AND referenced_column.attnum = referenced_key.attnum
      WHERE foreign_key.contype = 'f'
        AND foreign_key.confrelid = 'public.companies'::regclass
        AND referenced_column.attname = 'id'
    LOOP
      EXECUTE format(
        'UPDATE %s SET %I = $1 WHERE %I = $2',
        company_reference.table_name,
        company_reference.column_name,
        company_reference.column_name
      )
      USING new_company_id, old_company_id;
    END LOOP;

    DELETE FROM public.companies WHERE id = old_company_id;
  ELSIF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = new_company_id) THEN
    RAISE EXCEPTION
      'Không tìm thấy công ty với ID cũ (%) hoặc ID mới (%)',
      old_company_id,
      new_company_id;
  END IF;
END
$$;
