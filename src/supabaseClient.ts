import { createClient } from '@supabase/supabase-js';

// Kredensial Database Default
const DEFAULT_URL = 'https://lxhwyrzxgqvosecnhfli.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4aHd5cnp4Z3F2b3NlY25oZmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NzQ3MjEsImV4cCI6MjA4NTE1MDcyMX0.32gBAnMHN9R4eWl-Tu2NxivrM7c7Kqctk9XEvdpKf94';

// Kredensial Database Baru (1 Maret)
const DEFAULT_NEW_URL = 'https://ymolrxscthxxtlmnxmob.supabase.co';
const DEFAULT_NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (masukkan token Anda)';

// Kredensial Database Special (Old)
const DEFAULT_SPECIAL_OLD_URL = 'https://opdcyccwracapxfxisfw.supabase.co';
const DEFAULT_SPECIAL_OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (masukkan token Anda)';

// Helper: Menarik konfigurasi dari localStorage jika pengguna menggantinya dari UI Setting
const getConfig = () => {
   try {
      const url = localStorage.getItem('supabase_url') || DEFAULT_URL;
      const key = localStorage.getItem('supabase_key') || DEFAULT_KEY;
      const newUrl = localStorage.getItem('supabase_new_url') || DEFAULT_NEW_URL;
      const newKey = localStorage.getItem('supabase_new_key') || DEFAULT_NEW_KEY;
      const specialOldUrl = localStorage.getItem('supabase_special_old_url') || DEFAULT_SPECIAL_OLD_URL;
      const specialOldKey = localStorage.getItem('supabase_special_old_key') || DEFAULT_SPECIAL_OLD_KEY;
      return { url, key, newUrl, newKey, specialOldUrl, specialOldKey };
   } catch (e) {
      return { url: DEFAULT_URL, key: DEFAULT_KEY, newUrl: DEFAULT_NEW_URL, newKey: DEFAULT_NEW_KEY, specialOldUrl: DEFAULT_SPECIAL_OLD_URL, specialOldKey: DEFAULT_SPECIAL_OLD_KEY };
   }
};

let config = getConfig();

// Export Client yang bisa digunakan langsung di seluruh aplikasi
export let supabase = createClient(config.url, config.key);
export let supabaseNew = createClient(config.newUrl, config.newKey);
export let supabaseSpecialOld = createClient(config.specialOldUrl, config.specialOldKey);

// Dedicated Client untuk Supabase Cancel Fisik (pbogwmplcbzuugjmgvtl)
const CANCEL_FISIK_URL = 'https://pbogwmplcbzuugjmgvtl.supabase.co';
const CANCEL_FISIK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBib2d3bXBsY2J6dXVnam1ndnRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUwMDgsImV4cCI6MjEwMDgzMTAwOH0.DhC4E_MtDjLgwjWucrmO4ZOTtk0GAk7x0ktzIrsUbc4';
export let supabaseCancelFisik = createClient(CANCEL_FISIK_URL, CANCEL_FISIK_KEY);

/**
 * Panggil ini jika pengguna mengganti Kredensial API dari Modal Pengaturan (Settings)
 */
export const refreshSupabaseClients = () => {
   config = getConfig();
   supabase = createClient(config.url, config.key);
   supabaseNew = createClient(config.newUrl, config.newKey);
   supabaseSpecialOld = createClient(config.specialOldUrl, config.specialOldKey);
};
