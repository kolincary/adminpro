-- ==============================================================================
-- SCHEMA TABEL REPORTS (7-DAY ROLLING CACHE) UNTUK SUPABASE
-- Project: tpewylwthmlnfhzohlgu
-- Jalankan skrip ini di Supabase SQL Editor:
-- https://supabase.com/dashboard/project/tpewylwthmlnfhzohlgu/sql
-- ==============================================================================

-- 1. Buat Tabel reports jika belum ada
CREATE TABLE IF NOT EXISTS public.reports (
    id TEXT PRIMARY KEY,
    barcode TEXT,
    nama_barang TEXT,
    item_name TEXT,
    sku TEXT,
    qty INTEGER DEFAULT 1,
    quantity INTEGER DEFAULT 1,
    status TEXT,
    modul_fisik TEXT,
    category TEXT,
    marketplace TEXT,
    pic TEXT,
    keterangan TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    input_date DATE,
    image_url TEXT,
    user_id TEXT,
    user_email TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Buat Index untuk performa query cepat berdasarkan tanggal, status, dan barcode
CREATE INDEX IF NOT EXISTS idx_reports_date ON public.reports(date DESC);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_barcode ON public.reports(barcode);
CREATE INDEX IF NOT EXISTS idx_reports_sku ON public.reports(sku);
CREATE INDEX IF NOT EXISTS idx_reports_modul_fisik ON public.reports(modul_fisik);

-- 3. Aktifkan Row Level Security (RLS)
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 4. Buat Policy agar semua role (anon & authenticated) dapat membaca dan menulis
DROP POLICY IF EXISTS "Allow public read reports" ON public.reports;
CREATE POLICY "Allow public read reports" 
ON public.reports FOR SELECT 
TO anon, authenticated 
USING (true);

DROP POLICY IF EXISTS "Allow public insert reports" ON public.reports;
CREATE POLICY "Allow public insert reports" 
ON public.reports FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update reports" ON public.reports;
CREATE POLICY "Allow public update reports" 
ON public.reports FOR UPDATE 
TO anon, authenticated 
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete reports" ON public.reports;
CREATE POLICY "Allow public delete reports" 
ON public.reports FOR DELETE 
TO anon, authenticated 
USING (true);

-- 5. Fungsi Otomatis Pembersihan Data Berumur > 7 Hari (Rolling Retention)
CREATE OR REPLACE FUNCTION public.cleanup_reports_older_than_7_days()
RETURNS trigger AS $$
BEGIN
    DELETE FROM public.reports
    WHERE (date < (CURRENT_DATE - INTERVAL '7 days'))
       OR (created_at < (timezone('utc'::text, now()) - INTERVAL '8 days'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Pasang Trigger Pembersihan Otomatis Setiap Ada Insert Baru
DROP TRIGGER IF EXISTS trigger_cleanup_reports_7days ON public.reports;
CREATE TRIGGER trigger_cleanup_reports_7days
AFTER INSERT ON public.reports
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_reports_older_than_7_days();

-- 7. Tambahkan ke Realtime Publication Supabase
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
  END IF;
END $$;
