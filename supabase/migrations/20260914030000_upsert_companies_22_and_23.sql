-- Chuẩn hóa tên Công ty 22 và tạo sẵn tenant Công ty 23 không kèm dữ liệu nhân sự.
UPDATE public.companies
SET
  code = 'COMPANY_22',
  name = 'Công ty TNHH Demo 22',
  updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000022'::UUID;

INSERT INTO public.companies (id, code, name)
VALUES (
  '00000000-0000-0000-0000-000000000023'::UUID,
  'COMPANY_23',
  'Công ty TNHH Demo 23'
)
ON CONFLICT (id) DO UPDATE
SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  updated_at = now();
