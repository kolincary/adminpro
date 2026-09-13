-- ==============================================================================
-- SCHEMA TABEL DAILY_ORDERS UNTUK SUPABASE
-- Jalankan skrip ini di SQL Editor Supabase Anda untuk sinkronisasi otomatis
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.daily_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Buat index untuk mempercepat query berdasarkan tanggal
CREATE INDEX IF NOT EXISTS idx_daily_orders_input_date ON public.daily_orders(input_date DESC);

-- Enable RLS
ALTER TABLE public.daily_orders ENABLE ROW LEVEL SECURITY;

-- Policy agar semua role (anon & authenticated) dapat membaca dan menulis
DROP POLICY IF EXISTS "Allow public read daily_orders" ON public.daily_orders;
CREATE POLICY "Allow public read daily_orders" ON public.daily_orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert daily_orders" ON public.daily_orders;
CREATE POLICY "Allow public insert daily_orders" ON public.daily_orders FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update daily_orders" ON public.daily_orders;
CREATE POLICY "Allow public update daily_orders" ON public.daily_orders FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete daily_orders" ON public.daily_orders;
CREATE POLICY "Allow public delete daily_orders" ON public.daily_orders FOR DELETE USING (true);
