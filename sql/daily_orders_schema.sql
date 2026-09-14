-- ==============================================================================
-- SCHEMA TABEL DAILY_ORDERS UNTUK SUPABASE
-- Project: tpewylwthmlnfhzohlgu
-- Jalankan skrip ini di Supabase SQL Editor:
-- https://supabase.com/dashboard/project/tpewylwthmlnfhzohlgu/sql
-- ==============================================================================

-- 1. Buat Tabel daily_orders jika belum ada
CREATE TABLE IF NOT EXISTS public.daily_orders (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    input_date DATE NOT NULL DEFAULT CURRENT_DATE,
    input_time VARCHAR(10) NOT NULL,
    shopee INTEGER DEFAULT 0,
    tiktok INTEGER DEFAULT 0,
    lazada INTEGER DEFAULT 0,
    tiktok_home INTEGER DEFAULT 0,
    shopee_home INTEGER DEFAULT 0,
    blibli INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0,
    created_by TEXT,
    user_email TEXT,
    user_id TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Buat Index untuk performa query cepat berdasarkan tanggal & waktu
CREATE INDEX IF NOT EXISTS idx_daily_orders_input_date ON public.daily_orders(input_date DESC, input_time DESC);
CREATE INDEX IF NOT EXISTS idx_daily_orders_created_at ON public.daily_orders(created_at DESC);

-- 3. Aktifkan Row Level Security (RLS)
ALTER TABLE public.daily_orders ENABLE ROW LEVEL SECURITY;

-- 4. Buat Policy agar semua role (anon & authenticated) dapat membaca dan menulis
DROP POLICY IF EXISTS "Allow public read daily_orders" ON public.daily_orders;
CREATE POLICY "Allow public read daily_orders" 
ON public.daily_orders FOR SELECT 
TO anon, authenticated 
USING (true);

DROP POLICY IF EXISTS "Allow public insert daily_orders" ON public.daily_orders;
CREATE POLICY "Allow public insert daily_orders" 
ON public.daily_orders FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update daily_orders" ON public.daily_orders;
CREATE POLICY "Allow public update daily_orders" 
ON public.daily_orders FOR UPDATE 
TO anon, authenticated 
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete daily_orders" ON public.daily_orders;
CREATE POLICY "Allow public delete daily_orders" 
ON public.daily_orders FOR DELETE 
TO anon, authenticated 
USING (true);

-- 5. Tambahkan ke Realtime Publication Supabase agar perubahan ter-update instan
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'daily_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_orders;
  END IF;
END $$;
