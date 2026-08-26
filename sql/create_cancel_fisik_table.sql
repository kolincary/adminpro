-- ====================================================================
-- SUPABASE SQL EDITOR SCRIPT: INVENTARIS / INPUT CANCEL FISIK
-- Project: https://pbogwmplcbzuugjmgvtl.supabase.co
-- ====================================================================

-- 1. Buat Tabel cancel_fisik_reports (jika belum ada)
CREATE TABLE IF NOT EXISTS public.cancel_fisik_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal_log DATE DEFAULT CURRENT_DATE,
    tgl_input_ginee DATE,
    pic_input_ginee TEXT,
    marketplace TEXT,
    analis_pic TEXT,
    modul_fisik TEXT DEFAULT 'Cancel Fisik',
    referensi_invoice TEXT,
    location_rak TEXT,
    sku TEXT,
    product_name TEXT,
    status_aset TEXT DEFAULT 'Cancel Fisik',
    qty INT DEFAULT 1,
    keterangan TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT
);

-- 2. Buat Indeks untuk Performa Pencarian & Filter Cepat
CREATE INDEX IF NOT EXISTS idx_cancel_fisik_tanggal ON public.cancel_fisik_reports(tanggal_log);
CREATE INDEX IF NOT EXISTS idx_cancel_fisik_invoice ON public.cancel_fisik_reports(referensi_invoice);
CREATE INDEX IF NOT EXISTS idx_cancel_fisik_sku ON public.cancel_fisik_reports(sku);

-- 3. Aktifkan Row Level Security (RLS)
ALTER TABLE public.cancel_fisik_reports ENABLE ROW LEVEL SECURITY;

-- 4. Buat Policy Kebijakan Akses (Public Read, Insert, Update, Delete)
DROP POLICY IF EXISTS "Allow All Public Operations" ON public.cancel_fisik_reports;
CREATE POLICY "Allow All Public Operations"
ON public.cancel_fisik_reports
FOR ALL
USING (true)
WITH CHECK (true);

-- 5. Berikan Izin Akses Anon & Authenticated Role
GRANT ALL ON TABLE public.cancel_fisik_reports TO anon;
GRANT ALL ON TABLE public.cancel_fisik_reports TO authenticated;
GRANT ALL ON TABLE public.cancel_fisik_reports TO service_role;
