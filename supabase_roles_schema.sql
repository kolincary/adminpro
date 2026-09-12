-- =========================================================================
-- SUPABASE PROFILES & USER ROLES SETUP (Admin Report Pro)
-- =========================================================================
-- Jalankan skrip ini di SQL Editor dashboard Supabase Anda:
-- Project: https://supabase.com/dashboard/project/ymolrxscthxxtlmnxmob/sql
-- =========================================================================

-- 1. Berikan Izin Schema Public
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- 2. Buat Tabel Profiles untuk menampung Data User dan Role
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff', 'leader', 'viewer')),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Berikan izin akses penuh ke tabel profiles
GRANT ALL ON TABLE public.profiles TO postgres, anon, authenticated, service_role;

-- 3. Aktifkan Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Kebijakan Keamanan (RLS Policies)
-- A. Semua user yang login (authenticated) dapat membaca data profiles (untuk list staf / admin patrol)
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" 
  ON public.profiles 
  FOR SELECT 
  TO authenticated 
  USING (true);

-- B. User dapat menginsert profil mereka sendiri
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" 
  ON public.profiles 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = id);

-- C. User dapat mengupdate profil mereka sendiri (display_name, avatar_url, last_active_at)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" 
  ON public.profiles 
  FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- D. Service Role / Admin dapat mengelola semua profile & role
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" 
  ON public.profiles 
  FOR ALL 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 5. Trigger Otomatis: Buat Profil saat User Login Google Pertama Kali
-- DIBUNGKUS DENGAN EXCEPTION BLOCK AGAR TIDAK PERNAH MENGGAGALKAN LOGIN GOOGLE
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  user_full_name TEXT;
  user_avatar TEXT;
  user_role TEXT;
BEGIN
  BEGIN
    -- Ambil metadata nama dari akun Google
    user_full_name := COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1),
      'User'
    );
    
    -- Ambil metadata foto dari akun Google
    user_avatar := COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture',
      ''
    );

    -- Set role: developer default jadi admin, staf lainnya default 'staff'
    IF NEW.email = 'jgilbeth92@gmail.com' THEN
      user_role := 'admin';
    ELSE
      user_role := 'staff';
    END IF;

    -- Insert atau Update profil
    INSERT INTO public.profiles (id, email, display_name, avatar_url, role, last_active_at, created_at, updated_at)
    VALUES (NEW.id, NEW.email, user_full_name, user_avatar, user_role, NOW(), NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
    SET 
      email = EXCLUDED.email,
      display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      last_active_at = NOW(),
      updated_at = NOW();

  EXCEPTION WHEN OTHERS THEN
    -- PENTING: Jangan pernah gagalkan registrasi akun auth.users jika terjadi error profil!
    RAISE WARNING 'handle_new_user error: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Pasang Trigger HANYA pada INSERT ke auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- QUERY BANTUAN UNTUK PENGELOLAAN ROLE:
-- =========================================================================
-- Lihat semua user & role:
-- SELECT id, email, display_name, role, last_active_at FROM public.profiles ORDER BY created_at DESC;

-- Jadikan user sebagai Admin:
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'email_user@gmail.com';

-- Jadikan user sebagai Staff biasa:
-- UPDATE public.profiles SET role = 'staff' WHERE email = 'email_user@gmail.com';
