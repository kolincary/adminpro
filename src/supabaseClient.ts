import { createClient } from '@supabase/supabase-js';

// Kredensial Database Utama & Supabase Auth Project
const DEFAULT_URL = 'https://tpewylwthmlnfhzohlgu.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZXd5bHd0aG1sbmZoem9obGd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNjQ1MjksImV4cCI6MjEwNDk0MDUyOX0.QmnmNSgeM4i9UDZGnPcsDFr88ybTXOJ5rbBPkokebWI';

// Kredensial Database Baru (1 Maret)
const DEFAULT_NEW_URL = 'https://tpewylwthmlnfhzohlgu.supabase.co';
const DEFAULT_NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZXd5bHd0aG1sbmZoem9obGd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNjQ1MjksImV4cCI6MjEwNDk0MDUyOX0.QmnmNSgeM4i9UDZGnPcsDFr88ybTXOJ5rbBPkokebWI';

// Helper: Menarik konfigurasi dari localStorage jika pengguna menggantinya dari UI Setting
const getConfig = () => {
   try {
      const storedUrl = localStorage.getItem('supabase_url');
      const storedKey = localStorage.getItem('supabase_key');
      
      // Jika tersimpan URL project lama, bersihkan agar selalu mengarah ke project utama tpewylwthmlnfhzohlgu
      if (storedUrl && !storedUrl.includes('tpewylwthmlnfhzohlgu')) {
         localStorage.removeItem('supabase_url');
         localStorage.removeItem('supabase_key');
         return { url: DEFAULT_URL, key: DEFAULT_KEY };
      }
      
      const url = storedUrl || DEFAULT_URL;
      const key = storedKey || DEFAULT_KEY;
      return { url, key };
   } catch (e) {
      return { url: DEFAULT_URL, key: DEFAULT_KEY };
   }
};

let config = getConfig();

// Helper to safely access and sanitize Supabase session token from localStorage
const safeAuthStorage = {
  getItem: (key: string) => {
    try {
      const val = localStorage.getItem(key);
      if (!val) return null;
      try {
        const parsed = JSON.parse(val);
        // If token expired more than 3 days ago and has no valid current session, purge it to prevent 500 refresh loop
        if (parsed && typeof parsed.expires_at === 'number') {
          const nowSec = Math.floor(Date.now() / 1000);
          if (parsed.expires_at > 0 && nowSec > parsed.expires_at + 86400 * 3) {
            localStorage.removeItem(key);
            return null;
          }
        }
      } catch (e) {}
      return val;
    } catch (e) {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }
};

const clientOptions = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: safeAuthStorage
  }
};

// Export Client utama yang digunakan di seluruh aplikasi (Auth, Profiles, Draft, Data Scan Admin)
export let supabase = createClient(config.url, config.key, clientOptions);
export let supabaseNew = supabase;

/**
 * Panggil ini jika pengguna mengganti Kredensial API dari Modal Pengaturan (Settings)
 */
export const refreshSupabaseClients = () => {
   config = getConfig();
   supabase = createClient(config.url, config.key, clientOptions);
   supabaseNew = supabase;
};


