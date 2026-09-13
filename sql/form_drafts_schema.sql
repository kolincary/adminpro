-- ==============================================================================
-- SKEMA TABEL DRAFT FORM INPUT RETUR & ELIMINASI STOK RUSAK (FORM_DRAFTS)
-- ==============================================================================
-- Jalankan skrip ini di Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ymolrxscthxxtlmnxmob/sql
-- ==============================================================================

-- 1. Buat Tabel form_drafts
CREATE TABLE IF NOT EXISTS public.form_drafts (
    id TEXT PRIMARY KEY, -- Format ID: {username}_{category} (contoh: 'helen_retur', 'developer_rusak_internal')
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    category TEXT NOT NULL, -- 'retur', 'retur2', 'stok_lt3', 'rusak_internal', dll
    header_data JSONB DEFAULT '{}'::jsonb,
    items JSONB DEFAULT '[]'::jsonb,
    input_item JSONB DEFAULT '{}'::jsonb,
    entry_mode TEXT DEFAULT 'batch',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index untuk pencarian cepat berdasarkan username dan kategori
CREATE INDEX IF NOT EXISTS idx_form_drafts_username ON public.form_drafts (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_form_drafts_user_category ON public.form_drafts (LOWER(username), category);

-- 3. Aktifkan Row Level Security (RLS)
ALTER TABLE public.form_drafts ENABLE ROW LEVEL SECURITY;

-- 4. Hapus policy lama jika ada
DROP POLICY IF EXISTS "Enable all access for form_drafts" ON public.form_drafts;
DROP POLICY IF EXISTS "Allow anon read form_drafts" ON public.form_drafts;
DROP POLICY IF EXISTS "Allow anon write form_drafts" ON public.form_drafts;

-- 5. Buat Policy Akses Publik untuk Anon dan Authenticated
CREATE POLICY "Enable all access for form_drafts"
ON public.form_drafts
FOR ALL
USING (true)
WITH CHECK (true);

-- 6. Berikan Hak Akses ke role anon, authenticated, service_role
GRANT ALL ON TABLE public.form_drafts TO anon;
GRANT ALL ON TABLE public.form_drafts TO authenticated;
GRANT ALL ON TABLE public.form_drafts TO service_role;

-- 7. Tampilkan tabel yang berhasil dibuat
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'form_drafts'
ORDER BY ordinal_position;
