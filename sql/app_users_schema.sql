-- ==============================================================================
-- SKEMA TABEL PENGGUNA (APP_USERS) UNTUK LOGIN USERNAME & PASSWORD
-- ==============================================================================
-- Jalankan skrip ini di Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ymolrxscthxxtlmnxmob/sql
-- ==============================================================================

-- 1. Buat Tabel app_users
CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT,
    role TEXT DEFAULT 'staff' CHECK (role IN ('admin', 'staff', 'developer')),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index untuk pencarian cepat case-insensitive
CREATE INDEX IF NOT EXISTS idx_app_users_username_lower ON public.app_users (LOWER(username));

-- 3. Aktifkan Row Level Security (RLS)
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- 4. Hapus policy lama jika ada
DROP POLICY IF EXISTS "Enable all access for app_users" ON public.app_users;
DROP POLICY IF EXISTS "Allow anon read app_users" ON public.app_users;
DROP POLICY IF EXISTS "Allow anon write app_users" ON public.app_users;

-- 5. Buat Policy Akses Publik untuk Anon dan Authenticated
CREATE POLICY "Enable all access for app_users"
ON public.app_users
FOR ALL
USING (true)
WITH CHECK (true);

-- 6. Berikan Hak Akses ke role anon, authenticated, service_role
GRANT ALL ON TABLE public.app_users TO anon;
GRANT ALL ON TABLE public.app_users TO authenticated;
GRANT ALL ON TABLE public.app_users TO service_role;

-- 7. Seed Akun Pengguna Sesuai Permintaan
INSERT INTO public.app_users (username, password, display_name, email, role, is_active)
VALUES 
  ('developer', 'dev1010', 'Developer', 'developer@example.com', 'admin', true),
  ('admin', 'dev1010', 'Administrator Utama', 'jgilbeth92@gmail.com', 'admin', true),
  ('helen', '123456', 'Helen', 'helen@kalindo.local', 'staff', true),
  ('aprilia', '123456', 'Aprilia', 'aprilia@kalindo.local', 'staff', true),
  ('irda', '123456', 'Irda', 'irda@kalindo.local', 'staff', true),
  ('ainul', '123456', 'Ainul', 'ainul@kalindo.local', 'staff', true),
  ('ismi', '123456', 'Ismi', 'ismi@kalindo.local', 'staff', true),
  ('nopiya', '123456', 'Nopiya', 'nopiya@kalindo.local', 'staff', true),
  ('zahra', '123456', 'Zahra', 'zahra@kalindo.local', 'staff', true),
  ('novi', '123456', 'Novi', 'novi@kalindo.local', 'staff', true)
ON CONFLICT (username) DO UPDATE SET
  password = EXCLUDED.password,
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role,
  is_active = true;

-- 8. Tampilkan data user yang telah dibuat
SELECT id, username, display_name, role, is_active, created_at FROM public.app_users ORDER BY role DESC, username ASC;
