-- ==============================================================================
-- SCHEMA TABEL ADMIN_CREDENTIALS UNTUK SUPABASE
-- Jalankan skrip ini di SQL Editor Supabase Anda
-- ==============================================================================

-- 1. Buat Tabel admin_credentials
CREATE TABLE IF NOT EXISTS public.admin_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Aktifkan Row Level Security (RLS)
ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;

-- 3. Policy agar aplikasi dapat membaca kredensial login
DROP POLICY IF EXISTS "Allow public read admin_credentials" ON public.admin_credentials;
CREATE POLICY "Allow public read admin_credentials" ON public.admin_credentials FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert admin_credentials" ON public.admin_credentials;
CREATE POLICY "Allow public insert admin_credentials" ON public.admin_credentials FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update admin_credentials" ON public.admin_credentials;
CREATE POLICY "Allow public update admin_credentials" ON public.admin_credentials FOR UPDATE USING (true);

-- 4. Masukkan Akun Default Admin & Developer
INSERT INTO public.admin_credentials (username, password, role, name)
VALUES 
    ('admin', 'dev1010', 'admin', 'Super Administrator'),
    ('administrator', 'dev1010', 'admin', 'Lead Admin'),
    ('developer', 'dev1010', 'admin', 'Developer Support')
ON CONFLICT (username) DO UPDATE 
SET password = EXCLUDED.password,
    role = EXCLUDED.role,
    updated_at = NOW();

-- 5. Cek Hasil
SELECT * FROM public.admin_credentials;
