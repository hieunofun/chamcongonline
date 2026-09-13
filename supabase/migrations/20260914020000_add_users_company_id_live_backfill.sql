-- Ensure every existing user profile belongs to Company B (UUID 22) while
-- keeping the migration safe to run whether the additive multi-company
-- migration has already added users.company_id or not.
BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS company_id UUID;

DO $$
DECLARE
  users_company_attnum SMALLINT;
  companies_id_attnum SMALLINT;
BEGIN
  SELECT attnum INTO users_company_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass
    AND attname = 'company_id'
    AND NOT attisdropped;

  SELECT attnum INTO companies_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.companies'::regclass
    AND attname = 'id'
    AND NOT attisdropped;

  IF users_company_attnum IS NULL OR companies_id_attnum IS NULL THEN
    RAISE EXCEPTION 'users.company_id or companies.id is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid = 'public.users'::regclass
      AND confrelid = 'public.companies'::regclass
      AND conkey = ARRAY[users_company_attnum]::SMALLINT[]
      AND confkey = ARRAY[companies_id_attnum]::SMALLINT[]
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_company_id_to_companies_id_fkey
      FOREIGN KEY (company_id)
      REFERENCES public.companies(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_users_company_id
  ON public.users(company_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.companies
    WHERE id = '00000000-0000-0000-0000-000000000022'::UUID
  ) THEN
    RAISE EXCEPTION 'Company B UUID 22 must exist before assigning users';
  END IF;
END
$$;

ALTER TABLE public.users
  ALTER COLUMN company_id SET DEFAULT '00000000-0000-0000-0000-000000000022'::UUID;

-- Only fill missing tenant IDs; preserve any explicit existing assignment.
UPDATE public.users
SET company_id = '00000000-0000-0000-0000-000000000022'::UUID
WHERE company_id IS NULL;

COMMIT;
