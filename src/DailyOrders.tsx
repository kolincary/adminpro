import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';
import { supabase } from './supabaseClient';
import { DailyOrder, UserProfile } from './types';
import Toast, { ToastType } from './Toast';
import { 
  Calendar, Clock, PlusCircle, Search, Trash2, Edit3, Save, X, 
  FileSpreadsheet, Loader2, ChevronLeft, ChevronRight,
  BarChart3, Database, Sparkles, RefreshCw, Code2, Copy, Check, ExternalLink, AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import XLSX from 'xlsx-js-style';

interface TimeManualInputProps {
  value: string;
  onChange: (newValue: string) => void;
  className?: string;
  isSmall?: boolean;
}

function TimeManualInput({ value, onChange, className = "", isSmall = false }: TimeManualInputProps) {
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);

  const parts = (value || "").split(":");
  const currentHour = parts[0] || "";
  const currentMinute = parts[1] || "";

  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9]/g, "");
    if (val.length > 2) val = val.slice(0, 2);
    if (val.length === 2) {
      const hNum = parseInt(val, 10);
      if (hNum > 23) val = "23";
    }

    const nextVal = `${val}:${currentMinute}`;
    onChange(nextVal);

    if (val.length === 2 && minuteRef.current) {
      minuteRef.current.focus();
      minuteRef.current.select();
    }
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9]/g, "");
    if (val.length > 2) val = val.slice(0, 2);
    if (val.length === 2) {
      const mNum = parseInt(val, 10);
      if (mNum > 59) val = "59";
    }

    const nextVal = `${currentHour}:${val}`;
    onChange(nextVal);
  };

  const handleHourKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowRight" && hourRef.current) {
      const cursor = hourRef.current.selectionStart;
      if (cursor === currentHour.length && minuteRef.current) {
        minuteRef.current.focus();
        e.preventDefault();
      }
    }
  };

  const handleMinuteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && currentMinute.length === 0 && hourRef.current) {
      hourRef.current.focus();
      setTimeout(() => {
        if (hourRef.current) {
          hourRef.current.selectionStart = hourRef.current.selectionEnd = currentHour.length;
        }
      }, 0);
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && minuteRef.current) {
      const cursor = minuteRef.current.selectionStart;
      if (cursor === 0 && hourRef.current) {
        hourRef.current.focus();
        e.preventDefault();
      }
    }
  };

  const handleContainerBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }

    let paddedHour = currentHour;
    let paddedMin = currentMinute;

    if (!paddedHour && !paddedMin) return;

    if (paddedHour.length === 1) paddedHour = '0' + paddedHour;
    if (paddedHour.length === 0) paddedHour = '00';
    if (paddedMin.length === 1) paddedMin = '0' + paddedMin;
    if (paddedMin.length === 0) paddedMin = '00';

    if (paddedHour !== currentHour || paddedMin !== currentMinute) {
      onChange(`${paddedHour}:${paddedMin}`);
    }
  };

  return (
    <div 
      onBlur={handleContainerBlur}
      className={`flex items-center justify-center bg-[#0c0620]/90 border border-purple-900/40 rounded-xl transition focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500/30 ${
        isSmall ? "px-2 py-0.5 gap-0.5 text-xs inline-flex" : "px-3 py-2 gap-1 w-full text-sm flex"
      } ${className}`}
    >
      <input
        ref={hourRef}
        type="text"
        inputMode="numeric"
        placeholder="HH"
        value={currentHour}
        onChange={handleHourChange}
        onKeyDown={handleHourKeyDown}
        className={`bg-transparent text-center text-white outline-none font-mono placeholder-purple-300/30 p-0 ${
          isSmall ? "w-5 text-purple-300 font-bold" : "w-8 text-white font-bold"
        }`}
      />
      <span className="text-purple-400/60 font-mono font-bold select-none">:</span>
      <input
        ref={minuteRef}
        type="text"
        inputMode="numeric"
        placeholder="MM"
        value={currentMinute}
        onChange={handleMinuteChange}
        onKeyDown={handleMinuteKeyDown}
        className={`bg-transparent text-center text-white outline-none font-mono placeholder-purple-300/30 p-0 ${
          isSmall ? "w-5 text-purple-300 font-bold" : "w-8 text-white font-bold"
        }`}
      />
    </div>
  );
}

interface DailyOrdersProps {
  user: any;
  userProfile: UserProfile | null;
}

const SQL_SCHEMA_CODE = `-- ==============================================================================
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

-- 5. Tambahkan ke Realtime Publication Supabase
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
END $$;`;

export default function DailyOrders({ user, userProfile }: DailyOrdersProps) {
  const [orders, setOrders] = useState<DailyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [supabaseTableMissing, setSupabaseTableMissing] = useState(false);
  
  // Form State
  const [inputDate, setInputDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [inputTime, setInputTime] = useState('');
  const [shopee, setShopee] = useState<string>('');
  const [tiktok, setTiktok] = useState<string>('');
  const [lazada, setLazada] = useState<string>('');
  const [tiktokHome, setTiktokHome] = useState<string>('');
  const [shopeeHome, setShopeeHome] = useState<string>('');
  const [blibli, setBlibli] = useState<string>('');
  
  // Filter/Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  
  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<DailyOrder>>({});
  
  // Delete Confirmation Modal State
  const [deleteConfirmId, setDeleteConfirmId] = useState<{ id: string; createdBy: string } | null>(null);
  
  // Sync & SQL Modal State
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Toast Alert State
  const [toast, setToast] = useState<{ message: string; type: ToastType; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });
  const [actionLoading, setActionLoading] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Secret Dev Mode Trigger ('devmodenew')
  const [showDevMode, setShowDevMode] = useState(false);
  const keyBufferRef = useRef('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      
      if (e.key === 'Backspace') {
        keyBufferRef.current = keyBufferRef.current.slice(0, -1);
        return;
      }

      if (e.key && e.key.length === 1) {
        keyBufferRef.current = (keyBufferRef.current + e.key.toLowerCase()).slice(-20);
        if (keyBufferRef.current.endsWith('devmodenew')) {
          keyBufferRef.current = '';
          setShowDevMode((prev) => {
            const next = !prev;
            if (next) {
              triggerToast('⚡ Dev Mode Aktif: Tombol SQL Schema & Sinkronisasi ditampilkan!', 'info');
            } else {
              triggerToast('🔒 Dev Mode dinonaktifkan: Tombol developer disembunyikan.', 'info');
            }
            return next;
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  const triggerToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type, visible: true });
  };

  // Fallback to fetch from Firestore if Supabase table is not yet created
  const fetchOrdersFromFirestore = async () => {
    try {
      const snap = await getDocs(collection(db, 'daily_orders'));
      const fetched: DailyOrder[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        fetched.push({
          id: docSnap.id,
          inputDate: d.inputDate || d.input_date || '',
          inputTime: d.inputTime || d.input_time || '',
          shopee: Number(d.shopee) || 0,
          tiktok: Number(d.tiktok) || 0,
          lazada: Number(d.lazada) || 0,
          tiktokHome: Number(d.tiktokHome || d.tiktok_home) || 0,
          shopeeHome: Number(d.shopeeHome || d.shopee_home) || 0,
          blibli: Number(d.blibli) || 0,
          total: Number(d.total) || 0,
          createdBy: d.createdBy || d.created_by || '',
          createdAt: d.createdAt || d.created_at || null
        });
      });

      fetched.sort((a, b) => {
        const dateA = a.inputDate || '';
        const dateB = b.inputDate || '';
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        const timeA = a.inputTime || '';
        const timeB = b.inputTime || '';
        return timeB.localeCompare(timeA);
      });

      setOrders(fetched);
    } catch (fsErr) {
      console.warn("Firestore fallback error:", fsErr);
    }
  };

  // Retrieve records directly from Supabase (Primary Database for Daily Orders)
  const fetchOrdersFromSupabase = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('daily_orders')
        .select('*')
        .order('input_date', { ascending: false })
        .order('input_time', { ascending: false });

      if (error) {
        console.warn("Supabase daily_orders notice:", error.message);
        if (
          error.code === '42P01' || 
          error.code === 'PGRST205' || 
          error.message.toLowerCase().includes('relation') || 
          error.message.toLowerCase().includes('not exist') ||
          error.message.toLowerCase().includes('schema cache')
        ) {
          setSupabaseTableMissing(true);
        }
        await fetchOrdersFromFirestore();
        return;
      }

      if (data) {
        setSupabaseTableMissing(false);
        const mapped: DailyOrder[] = data.map((d: any) => ({
          id: String(d.id),
          inputDate: d.input_date || d.inputDate || '',
          inputTime: d.input_time || d.inputTime || '',
          shopee: Number(d.shopee) || 0,
          tiktok: Number(d.tiktok) || 0,
          lazada: Number(d.lazada) || 0,
          tiktokHome: Number(d.tiktok_home !== undefined ? d.tiktok_home : d.tiktokHome) || 0,
          shopeeHome: Number(d.shopee_home !== undefined ? d.shopee_home : d.shopeeHome) || 0,
          blibli: Number(d.blibli) || 0,
          total: Number(d.total) || 0,
          createdBy: d.created_by || d.createdBy || '',
          createdAt: d.created_at || d.createdAt || null
        }));

        setOrders(mapped);
      }
    } catch (err: any) {
      console.warn("Supabase fetch exception:", err);
      await fetchOrdersFromFirestore();
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Realtime Supabase Subscription
  useEffect(() => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }

    fetchOrdersFromSupabase();

    const channel = supabase
      .channel('realtime_daily_orders_feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_orders' }, () => {
        fetchOrdersFromSupabase(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Safe numeric conversion helper
  const parseNum = (val: string): number => {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  };

  // Form Auto-calculated Total
  const liveTotal = useMemo(() => {
    return parseNum(shopee) + 
           parseNum(tiktok) + 
           parseNum(lazada) + 
           parseNum(tiktokHome) + 
           parseNum(shopeeHome) + 
           parseNum(blibli);
  }, [shopee, tiktok, lazada, tiktokHome, shopeeHome, blibli]);

  // Insert Record into Supabase
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      triggerToast('Anda harus masuk terlebih dahulu.', 'error');
      return;
    }

    const timeRegex = /^[0-9]{2}:[0-9]{2}$/;
    if (!inputDate || !inputTime || !timeRegex.test(inputTime)) {
      triggerToast('Pilih tanggal dan masukkan waktu penarikan (Format HH:MM) dengan lengkap.', 'error');
      return;
    }

    setActionLoading(true);

    const effectiveCreatedBy = userProfile?.displayName || user?.email || 'User';

    const supabasePayload = {
      input_date: inputDate,
      input_time: inputTime,
      shopee: parseNum(shopee),
      tiktok: parseNum(tiktok),
      lazada: parseNum(lazada),
      tiktok_home: parseNum(tiktokHome),
      shopee_home: parseNum(shopeeHome),
      blibli: parseNum(blibli),
      total: liveTotal,
      created_by: effectiveCreatedBy,
      user_email: user?.email || '',
      user_id: user?.uid || 'anonymous'
    };

    try {
      const { data, error } = await supabase
        .from('daily_orders')
        .insert([supabasePayload])
        .select();

      if (error) {
        // If table doesn't exist yet, write to Firestore and alert user
        console.error("Supabase insert error:", error);
        await addDoc(collection(db, 'daily_orders'), {
          ...supabasePayload,
          inputDate,
          inputTime,
          tiktokHome: parseNum(tiktokHome),
          shopeeHome: parseNum(shopeeHome),
          createdAt: serverTimestamp()
        });
        await fetchOrdersFromFirestore();
        triggerToast('Data disimpan ke Firestore (Tabel Supabase belum dibuat, silakan jalankan SQL schema)', 'warning');
      } else {
        // Reset input fields
        setShopee('');
        setTiktok('');
        setLazada('');
        setTiktokHome('');
        setShopeeHome('');
        setBlibli('');
        setInputTime('');
        
        triggerToast('✅ Data orderan harian berhasil disimpan ke Supabase!');
        await fetchOrdersFromSupabase(true);
      }
    } catch (err: any) {
      console.error("Submit error:", err);
      triggerToast(`Gagal menyimpan data: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Record from Supabase
  const handleDelete = (id: string, createdBy: string) => {
    setDeleteConfirmId({ id, createdBy });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    setActionLoading(true);
    const targetId = deleteConfirmId.id;

    try {
      const { error } = await supabase
        .from('daily_orders')
        .delete()
        .eq('id', targetId);

      if (error) {
        console.warn("Supabase delete failed, trying Firestore fallback:", error);
        await deleteDoc(doc(db, 'daily_orders', targetId));
      } else {
        // Also cleanup from Firestore if mirroring existed
        deleteDoc(doc(db, 'daily_orders', targetId)).catch(() => {});
      }

      setOrders(prev => prev.filter(o => o.id !== targetId));
      setDeleteConfirmId(null);
      triggerToast('Data harian berhasil dihapus.');
    } catch (err: any) {
      console.error("Delete error:", err);
      setDeleteConfirmId(null);
      triggerToast(`Gagal menghapus data: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Start Edit Mode
  const handleStartEdit = (item: DailyOrder) => {
    setEditingId(item.id || null);
    setEditForm({ ...item });
  };

  // Handle Edit Input Change
  const handleEditChange = (field: keyof DailyOrder, value: string | number) => {
    setEditForm((prev) => {
      const updated = { ...prev, [field]: value };
      
      if (['shopee', 'tiktok', 'lazada', 'tiktokHome', 'shopeeHome', 'blibli'].includes(field as string)) {
        const shopeeVal = parseNum(String(field === 'shopee' ? value : updated.shopee || 0));
        const tiktokVal = parseNum(String(field === 'tiktok' ? value : updated.tiktok || 0));
        const lazadaVal = parseNum(String(field === 'lazada' ? value : updated.lazada || 0));
        const tiktokHomeVal = parseNum(String(field === 'tiktokHome' ? value : updated.tiktokHome || 0));
        const shopeeHomeVal = parseNum(String(field === 'shopeeHome' ? value : updated.shopeeHome || 0));
        const blibliVal = parseNum(String(field === 'blibli' ? value : updated.blibli || 0));
        updated.total = shopeeVal + tiktokVal + lazadaVal + tiktokHomeVal + shopeeHomeVal + blibliVal;
      }
      return updated;
    });
  };

  // Save Edit Record to Supabase
  const handleSaveEdit = async (id: string) => {
    if (!editForm.inputDate || !editForm.inputTime) {
      triggerToast('Tanggal dan waktu harus diisi.', 'error');
      return;
    }

    const payload = {
      input_date: editForm.inputDate,
      input_time: editForm.inputTime,
      shopee: parseNum(String(editForm.shopee || 0)),
      tiktok: parseNum(String(editForm.tiktok || 0)),
      lazada: parseNum(String(editForm.lazada || 0)),
      tiktok_home: parseNum(String(editForm.tiktokHome || 0)),
      shopee_home: parseNum(String(editForm.shopeeHome || 0)),
      blibli: parseNum(String(editForm.blibli || 0)),
      total: editForm.total || 0,
      updated_at: new Date().toISOString()
    };

    try {
      const { error } = await supabase
        .from('daily_orders')
        .update(payload)
        .eq('id', id);

      if (error) {
        console.warn("Supabase update error, falling back to Firestore:", error);
        await updateDoc(doc(db, 'daily_orders', id), {
          inputDate: editForm.inputDate,
          inputTime: editForm.inputTime,
          shopee: parseNum(String(editForm.shopee || 0)),
          tiktok: parseNum(String(editForm.tiktok || 0)),
          lazada: parseNum(String(editForm.lazada || 0)),
          tiktokHome: parseNum(String(editForm.tiktokHome || 0)),
          shopeeHome: parseNum(String(editForm.shopeeHome || 0)),
          blibli: parseNum(String(editForm.blibli || 0)),
          total: editForm.total || 0,
        });
      }

      triggerToast('✅ Data harian berhasil diperbarui.');
      setEditingId(null);
      await fetchOrdersFromSupabase(true);
    } catch (err: any) {
      console.error("Save edit error:", err);
      triggerToast(`Gagal memperbarui data: ${err.message}`, 'error');
    }
  };

  // 1-Click Sync Firestore to Supabase
  const handleSyncFirestoreToSupabase = async () => {
    setIsSyncing(true);
    try {
      const snapshot = await getDocs(collection(db, 'daily_orders'));
      if (snapshot.empty) {
        triggerToast('Tidak ada data orderan harian di Firestore untuk disinkronkan.', 'error');
        setIsSyncing(false);
        setIsSyncModalOpen(false);
        return;
      }

      const rows: any[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        rows.push({
          id: docSnap.id,
          input_date: d.inputDate || d.input_date || d.date || format(new Date(), 'yyyy-MM-dd'),
          input_time: d.inputTime || d.input_time || '00:00',
          shopee: Number(d.shopee) || 0,
          tiktok: Number(d.tiktok) || 0,
          lazada: Number(d.lazada) || 0,
          tiktok_home: Number(d.tiktokHome !== undefined ? d.tiktokHome : d.tiktok_home) || 0,
          shopee_home: Number(d.shopeeHome !== undefined ? d.shopeeHome : d.shopee_home) || 0,
          blibli: Number(d.blibli) || 0,
          total: Number(d.total) || 0,
          created_by: d.createdBy || d.created_by || 'Firestore Migration',
          user_email: d.userEmail || d.user_email || '',
          user_id: d.userId || d.user_id || ''
        });
      });

      let successCount = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const { error } = await supabase
          .from('daily_orders')
          .upsert(chunk, { onConflict: 'id' });

        if (error) throw error;
        successCount += chunk.length;
      }

      triggerToast(`⚡ Sukses menyinkronkan ${successCount} data orderan harian ke Supabase!`, 'success');
      await fetchOrdersFromSupabase();
    } catch (err: any) {
      console.error("Sync Firestore to Supabase error:", err);
      const msg = err.message || '';
      if (err.code === 'PGRST205' || msg.includes('schema cache') || msg.includes('daily_orders') || msg.includes('relation')) {
        setSupabaseTableMissing(true);
        triggerToast('⚠️ Tabel daily_orders belum dibuat di Supabase. Silakan jalankan Skrip SQL di SQL Editor terlebih dahulu (klik tombol Skema SQL).', 'error');
        setIsSqlModalOpen(true);
      } else {
        triggerToast(`Gagal sinkronisasi: ${msg}`, 'error');
      }
    } finally {
      setIsSyncing(false);
      setIsSyncModalOpen(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_SCHEMA_CODE);
    setCopiedSql(true);
    triggerToast('📋 Skrip SQL berhasil disalin ke clipboard!');
    setTimeout(() => setCopiedSql(false), 3000);
  };

  // Filtering Logic
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const dateMatch = !dateFilter || order.inputDate === dateFilter;
      const searchStr = `${order.inputDate} ${order.inputTime}`.toLowerCase();
      const stringMatch = !searchTerm || searchStr.includes(searchTerm.toLowerCase());
      return dateMatch && stringMatch;
    });
  }, [orders, dateFilter, searchTerm]);

  // Aggregate Metrics over filtered list
  const totalsSummary = useMemo(() => {
    return filteredOrders.reduce(
      (acc, curr) => {
        acc.shopee += curr.shopee;
        acc.tiktok += curr.tiktok;
        acc.lazada += curr.lazada;
        acc.tiktokHome += curr.tiktokHome;
        acc.shopeeHome += curr.shopeeHome;
        acc.blibli += curr.blibli;
        acc.total += curr.total;
        return acc;
      },
      { shopee: 0, tiktok: 0, lazada: 0, tiktokHome: 0, shopeeHome: 0, blibli: 0, total: 0 }
    );
  }, [filteredOrders]);

  // Pagination bounds
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredOrders, currentPage]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage) || 1;

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredOrders.length === 0) {
      triggerToast('Tidak ada data harian untuk di-export.', 'error');
      return;
    }

    const wsData = [
      ['LAPORAN ORDERAN HARIAN — ADMIN REPORT PRO (SUPABASE)'],
      [`Dicetak pada: ${format(new Date(), 'dd-MM-yyyy HH:mm')} oleh ${userProfile?.displayName || user?.email}`],
      [],
      ['TANGGAL', 'WAKTU', 'SHOPEE', 'TIKTOK', 'LAZADA', 'TIKTOK HOME', 'SHOPEE HOME', 'BLIBLI', 'TOTAL']
    ];

    filteredOrders.forEach((o) => {
      wsData.push([
        o.inputDate,
        o.inputTime,
        o.shopee,
        o.tiktok,
        o.lazada,
        o.tiktokHome,
        o.shopeeHome,
        o.blibli,
        o.total
      ]);
    });

    wsData.push([]);
    wsData.push([
      'TOTAL REKAPITULASI',
      '',
      totalsSummary.shopee,
      totalsSummary.tiktok,
      totalsSummary.lazada,
      totalsSummary.tiktokHome,
      totalsSummary.shopeeHome,
      totalsSummary.blibli,
      totalsSummary.total
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
      { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, 
      { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }
    ];

    const titleStyle = { font: { name: 'Arial', sz: 14, bold: true, color: { rgb: '312e81' } } };
    const subtitleStyle = { font: { name: 'Arial', sz: 10, italic: true, color: { rgb: '6b7280' } } };
    const headerStyle = {
      font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'ffffff' } },
      fill: { fgColor: { rgb: '4f46e5' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: '4f46e5' } },
        bottom: { style: 'medium', color: { rgb: '312e81' } }
      }
    };
    const rowStyle = {
      font: { name: 'Arial', sz: 10 },
      alignment: { horizontal: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: 'e5e7eb' } } }
    };
    const summaryStyle = {
      font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'ffffff' } },
      fill: { fgColor: { rgb: '1e1b4b' } },
      alignment: { horizontal: 'center' }
    };

    ws['A1'].s = titleStyle;
    ws['A2'].s = subtitleStyle;

    const headerRowIdx = 3;
    for (let colIdx = 0; colIdx < 9; colIdx++) {
      const cellRef = XLSX.utils.encode_cell({ r: headerRowIdx, c: colIdx });
      if (ws[cellRef]) ws[cellRef].s = headerStyle;
    }

    const startRecordRow = 4;
    const endRecordRow = 4 + filteredOrders.length;
    for (let r = startRecordRow; r < endRecordRow; r++) {
      for (let c = 0; c < 9; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (ws[cellRef]) ws[cellRef].s = rowStyle;
      }
    }

    const totalRowIdx = endRecordRow + 1;
    for (let c = 0; c < 9; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: totalRowIdx, c });
      if (ws[cellRef]) ws[cellRef].s = summaryStyle;
    }

    XLSX.utils.book_append_sheet(wb, ws, "Rekap Orderan Harian");
    XLSX.writeFile(wb, `Rekap_Orderan_Harian_Supabase_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    triggerToast('Excel berhasil diexport!');
  };

  return (
    <div className="flex-1 w-full max-w-none mx-auto space-y-6 relative z-10 pb-10">
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="time"]::-webkit-calendar-picker-indicator {
          opacity: 0 !important;
          cursor: pointer !important;
          background: transparent !important;
        }
      `}</style>
      
      {/* Toast Alert */}
      <Toast 
        message={toast.message} 
        type={toast.type} 
        isVisible={toast.visible} 
        onClose={() => setToast(prev => ({ ...prev, visible: false }))} 
      />

      {/* Supabase Table Missing Warning Banner */}
      {supabaseTableMissing && (
        <div className="bg-amber-950/60 border border-amber-500/50 p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-amber-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="font-bold text-xs">Tabel Supabase `daily_orders` belum terdeteksi</p>
              <p className="text-[11px] text-amber-300/80">Jalankan SQL Schema di Supabase SQL Editor untuk mengaktifkan database Supabase &amp; fitur Realtime.</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setIsSqlModalOpen(true)}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-black font-extrabold text-xs rounded-xl shadow transition cursor-pointer flex items-center gap-1.5"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Buka SQL Editor</span>
            </button>
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              DATA ORDERAN HARIAN
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[#06241a] text-[#34d399] border border-emerald-500/40 tracking-wider flex items-center gap-1.5 shadow-sm">
              <Database className="w-3 h-3 text-emerald-400" />
              <span>Supabase Engine</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
            Input manual data print admin/jumlah orderan masuk setelah dilakukan penarikan data per jam dari masing-masing marketplace (Terhubung Realtime ke Supabase).
          </p>
        </div>

        {/* Action Header Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Dev Mode Actions (Revealed only by typing 'devmodenew') */}
          <AnimatePresence>
            {showDevMode && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, x: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95, x: 20 }}
                className="flex flex-wrap items-center gap-2"
              >
                {/* Dev Mode Badge with Close Toggle */}
                <button
                  onClick={() => {
                    setShowDevMode(false);
                    triggerToast('🔒 Dev Mode dinonaktifkan.', 'info');
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold hover:bg-amber-500/30 transition cursor-pointer"
                  title="Sembunyikan Menu Developer"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  <span>DEV MODE</span>
                  <X className="w-3.5 h-3.5 ml-0.5 text-amber-400" />
                </button>

                {/* SQL Schema Button */}
                <button
                  onClick={() => setIsSqlModalOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#1e1040] hover:bg-[#2b175a] border border-purple-500/40 text-purple-200 text-xs font-bold transition cursor-pointer shadow-md"
                  title="Lihat & Salin Skrip SQL Editor Supabase"
                >
                  <Code2 className="w-4 h-4 text-purple-400" />
                  <span>SQL Schema</span>
                </button>

                {/* Sync Firestore -> Supabase Button */}
                <button
                  onClick={() => setIsSyncModalOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-bold shadow-lg shadow-teal-900/30 active:scale-95 transition-all cursor-pointer"
                  title="Pindahkan seluruh data dari Firestore ke Supabase"
                >
                  <RefreshCw className="w-4 h-4 text-teal-200" />
                  <span>Sinkronkan ke Supabase</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick Excel Export (Always Visible) */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 active:scale-95 transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
            <span>Export ke Excel</span>
          </button>
        </div>
      </div>

      {/* 4 Analytics KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
        {/* Shopee Card */}
        <div className="relative overflow-hidden bg-[#130b2e]/90 border border-orange-500/25 hover:border-orange-500/50 p-4 sm:p-5 rounded-2xl shadow-xl flex flex-col justify-between transition-all group min-h-[120px] sm:min-h-[140px]">
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80 group-hover:opacity-95 group-hover:scale-105 transition-all duration-500 pointer-events-none"
            style={{ backgroundImage: `url('/images/orderan/shopee-bg.webp')` }}
          />
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div className="flex items-center justify-end mb-2 pt-1">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#2f1308]/90 border border-orange-600/40 flex items-center justify-center text-orange-400 group-hover:scale-110 shadow-sm shadow-orange-950 transition-transform">
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <span className="text-xl sm:text-2xl md:text-3xl font-black text-white drop-shadow-lg">{totalsSummary.shopee.toLocaleString('id-ID')}</span>
            <span className="text-[10px] sm:text-[11px] text-slate-300 font-medium mt-1 drop-shadow-md">Total order tercatat</span>
          </div>
        </div>
        
        {/* TikTok Card */}
        <div className="relative overflow-hidden bg-[#130b2e]/90 border border-cyan-500/25 hover:border-cyan-500/50 p-4 sm:p-5 rounded-2xl shadow-xl flex flex-col justify-between transition-all group min-h-[120px] sm:min-h-[140px]">
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80 group-hover:opacity-95 group-hover:scale-105 transition-all duration-500 pointer-events-none"
            style={{ backgroundImage: `url('/images/orderan/tiktok-bg.webp')` }}
          />
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div className="flex items-center justify-end mb-2 pt-1">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#082830]/90 border border-cyan-600/40 flex items-center justify-center text-cyan-400 group-hover:scale-110 shadow-sm shadow-cyan-950 transition-transform">
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <span className="text-xl sm:text-2xl md:text-3xl font-black text-white drop-shadow-lg">{(totalsSummary.tiktok + totalsSummary.tiktokHome).toLocaleString('id-ID')}</span>
            <span className="text-[10px] sm:text-[11px] text-slate-300 font-medium mt-1 drop-shadow-md">Regular &amp; Home Store</span>
          </div>
        </div>

        {/* Lazada & Blibli Card */}
        <div className="relative overflow-hidden bg-[#130b2e]/90 border border-blue-500/25 hover:border-blue-500/50 p-4 sm:p-5 rounded-2xl shadow-xl flex flex-col justify-between transition-all group min-h-[120px] sm:min-h-[140px]">
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80 group-hover:opacity-95 group-hover:scale-105 transition-all duration-500 pointer-events-none"
            style={{ backgroundImage: `url('/images/orderan/lazada-blibli-bg.webp')` }}
          />
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div className="flex items-center justify-end mb-2 pt-1">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#0b244d]/90 border border-blue-600/40 flex items-center justify-center text-blue-400 group-hover:scale-110 shadow-sm shadow-blue-950 transition-transform">
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <span className="text-xl sm:text-2xl md:text-3xl font-black text-white drop-shadow-lg">{(totalsSummary.lazada + totalsSummary.blibli).toLocaleString('id-ID')}</span>
            <span className="text-[10px] sm:text-[11px] text-slate-300 font-medium mt-1 drop-shadow-md">Lazada + Blibli tercatat</span>
          </div>
        </div>

        {/* Akumulasi Total Card */}
        <div className="relative overflow-hidden bg-[#130b2e]/90 border border-purple-500/40 hover:border-purple-400/70 p-4 sm:p-5 rounded-2xl shadow-xl flex flex-col justify-between transition-all group min-h-[120px] sm:min-h-[140px]">
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80 group-hover:opacity-95 group-hover:scale-105 transition-all duration-500 pointer-events-none"
            style={{ backgroundImage: `url('/images/orderan/total-orders-bg.webp')` }}
          />
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div className="flex items-center justify-end mb-2 pt-1">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-purple-900/60 border border-purple-500/50 flex items-center justify-center text-purple-300 group-hover:scale-110 shadow-sm shadow-purple-950 transition-transform">
                <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <span className="text-2xl sm:text-3xl md:text-4xl font-black text-purple-300 font-mono drop-shadow-lg">{totalsSummary.total.toLocaleString('id-ID')}</span>
            <span className="text-[10px] sm:text-[11px] text-teal-300 font-bold mt-1 drop-shadow-md">↗ Dari semua platform</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Input Form (Left 4 cols) vs Table (Right 8 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        
        {/* Form Container */}
        <div className="xl:col-span-4 h-fit">
          <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between gap-2 mb-5">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-purple-400" />
                <h2 className="text-base font-bold text-white">Input Orderan Hari Ini</h2>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-950/80 border border-emerald-500/30 text-emerald-400">
                Supabase DB
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* DateTime Handlers */}
              <div className="grid grid-cols-2 gap-3">
                <div 
                  className="space-y-1 cursor-pointer"
                  onClick={(e) => {
                    const input = e.currentTarget.querySelector('input');
                    if (input) {
                      try { (input as any).showPicker(); } catch (err) {}
                    }
                  }}
                >
                  <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1.5 cursor-pointer">
                    <Calendar className="w-3.5 h-3.5 text-purple-400" /> Tanggal
                  </label>
                  <input
                    type="date"
                    required
                    value={inputDate}
                    onChange={(e) => setInputDate(e.target.value)}
                    onClick={(e) => { e.stopPropagation(); try { (e.currentTarget as any).showPicker(); } catch (err) {} }}
                    onFocus={(e) => { try { (e.currentTarget as any).showPicker(); } catch (err) {} }}
                    style={{ colorScheme: 'dark' }}
                    className="w-full bg-[#0c0620]/90 border border-purple-900/40 rounded-xl px-3 py-2 text-white font-medium text-xs focus:outline-none focus:border-purple-500 transition cursor-pointer"
                  />
                </div>

                <div className="space-y-1 flex flex-col">
                  <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-purple-400" /> Waktu Tarik
                  </label>
                  <TimeManualInput
                    value={inputTime}
                    onChange={setInputTime}
                  />
                </div>
              </div>

              {/* Platform Inputs */}
              <div className="pt-2 border-t border-purple-900/20">
                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-3">Marketplace Quantities</p>
                
                <div className="space-y-3">
                  {/* Shopee & Tiktok */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Shopee</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={shopee}
                        onChange={(e) => setShopee(e.target.value)}
                        className="w-full bg-[#0c0620]/90 border border-purple-900/40 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-purple-500 transition"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Tiktok</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={tiktok}
                        onChange={(e) => setTiktok(e.target.value)}
                        className="w-full bg-[#0c0620]/90 border border-purple-900/40 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-purple-500 transition"
                      />
                    </div>
                  </div>

                  {/* Lazada & Tiktok Home */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Lazada</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={lazada}
                        onChange={(e) => setLazada(e.target.value)}
                        className="w-full bg-[#0c0620]/90 border border-purple-900/40 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-purple-500 transition"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Tiktok Home</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={tiktokHome}
                        onChange={(e) => setTiktokHome(e.target.value)}
                        className="w-full bg-[#0c0620]/90 border border-purple-900/40 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-purple-500 transition"
                      />
                    </div>
                  </div>

                  {/* Shopee Home & Blibli */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Shopee Home</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={shopeeHome}
                        onChange={(e) => setShopeeHome(e.target.value)}
                        className="w-full bg-[#0c0620]/90 border border-purple-900/40 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-purple-500 transition"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">Blibli</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={blibli}
                        onChange={(e) => setBlibli(e.target.value)}
                        className="w-full bg-[#0c0620]/90 border border-purple-900/40 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-purple-500 transition"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Total Summary Capsule */}
              <div className="p-3.5 bg-purple-950/40 border border-purple-700/30 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Total Otomatis</span>
                  <p className="text-xs text-slate-300 mt-0.5">Semua marketplace</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-purple-300 tracking-tight font-mono">{liveTotal.toLocaleString('id-ID')}</span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={actionLoading}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl py-3 text-xs sm:text-sm transition-all shadow-lg shadow-purple-600/30 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>Simpan ke Supabase</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* List Table Container */}
        <div className="xl:col-span-8 flex flex-col space-y-4">
          
          {/* Filters controls bar */}
          <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-auto sm:flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400/60" />
              <input
                type="text"
                placeholder="Cari berdasarkan tanggal / jam..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#0c0620]/90 border border-purple-900/40 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
              />
            </div>

            <div className="flex gap-2 w-full sm:w-auto shrink-0">
              <div className="flex items-center gap-2 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl px-3 py-1.5 w-full sm:w-auto">
                <Calendar className="w-3.5 h-3.5 text-pink-400" />
                <input
                  type="date"
                  placeholder="Filter Tanggal"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                  className="bg-transparent border-none text-white text-xs outline-none cursor-pointer"
                />
                {dateFilter && (
                  <button onClick={() => setDateFilter('')} className="p-0.5 hover:bg-white/10 rounded cursor-pointer">
                    <X className="w-3 h-3 text-slate-400" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Table Card */}
          <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl overflow-hidden shadow-xl flex-1 flex flex-col relative">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[780px]">
                <thead>
                  <tr className="border-b border-purple-900/30 bg-[#0c0620]">
                    <th className="p-3.5 text-[10px] font-black uppercase text-purple-300 tracking-wider">Tanggal</th>
                    <th className="p-3.5 text-[10px] font-black uppercase text-purple-300 tracking-wider">Jam Tarik</th>
                    <th className="p-3.5 text-[10px] font-black uppercase text-slate-400 tracking-wider text-center">Shopee</th>
                    <th className="p-3.5 text-[10px] font-black uppercase text-slate-400 tracking-wider text-center">TikTok</th>
                    <th className="p-3.5 text-[10px] font-black uppercase text-slate-400 tracking-wider text-center">Lazada</th>
                    <th className="p-3.5 text-[10px] font-black uppercase text-pink-400 tracking-wider text-center">TT Home</th>
                    <th className="p-3.5 text-[10px] font-black uppercase text-indigo-400 tracking-wider text-center">SP Home</th>
                    <th className="p-3.5 text-[10px] font-black uppercase text-slate-400 tracking-wider text-center">Blibli</th>
                    <th className="p-3.5 text-[10px] font-black uppercase text-purple-300 tracking-wider text-center bg-purple-950/40 border-l border-purple-900/30">Total</th>
                    <th className="p-3.5 text-[10px] font-black uppercase text-purple-300 tracking-wider text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-900/20">
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="p-12 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
                          <span className="text-xs font-medium">Memuat data orderan harian dari Supabase...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-12 text-center text-slate-500 text-xs">
                        <Database className="w-8 h-8 mx-auto opacity-30 mb-2" />
                        Belum ada catatan orderan harian atau pencarian Anda tidak ditemukan.
                      </td>
                    </tr>
                  ) : (
                    paginatedOrders.map((order) => {
                      const isEditing = editingId === order.id;
                      return (
                        <tr key={order.id} className="hover:bg-purple-950/30 transition text-xs">
                          
                          {/* Tanggal */}
                          <td className="p-3.5 font-bold text-white whitespace-nowrap">
                            {isEditing ? (
                              <input
                                type="date"
                                value={editForm.inputDate || ''}
                                onChange={(e) => handleEditChange('inputDate', e.target.value)}
                                style={{ colorScheme: 'dark' }}
                                className="bg-[#0c0620] border border-purple-600 text-white rounded-lg px-2 py-1 text-xs outline-none w-32 cursor-pointer inline-block"
                              />
                            ) : (
                              format(new Date(order.inputDate), 'dd MMM yyyy')
                            )}
                          </td>

                          {/* Jam Tarik */}
                          <td className="p-3.5 font-medium text-purple-300 font-mono whitespace-nowrap">
                            {isEditing ? (
                              <TimeManualInput value={editForm.inputTime || ''} onChange={(val) => handleEditChange('inputTime', val)} isSmall={true} />
                            ) : (
                              order.inputTime
                            )}
                          </td>

                          {/* Shopee */}
                          <td className="p-3.5 text-center font-mono">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editForm.shopee ?? 0}
                                onChange={(e) => handleEditChange('shopee', Number(e.target.value))}
                                className="bg-[#0c0620] border border-purple-600 text-white text-center rounded-lg px-2 py-1 text-xs outline-none w-16"
                              />
                            ) : (
                              order.shopee.toLocaleString('id-ID')
                            )}
                          </td>

                          {/* TikTok */}
                          <td className="p-3.5 text-center font-mono">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editForm.tiktok ?? 0}
                                onChange={(e) => handleEditChange('tiktok', Number(e.target.value))}
                                className="bg-[#0c0620] border border-purple-600 text-white text-center rounded-lg px-2 py-1 text-xs outline-none w-16"
                              />
                            ) : (
                              order.tiktok.toLocaleString('id-ID')
                            )}
                          </td>

                          {/* Lazada */}
                          <td className="p-3.5 text-center font-mono">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editForm.lazada ?? 0}
                                onChange={(e) => handleEditChange('lazada', Number(e.target.value))}
                                className="bg-[#0c0620] border border-purple-600 text-white text-center rounded-lg px-2 py-1 text-xs outline-none w-16"
                              />
                            ) : (
                              order.lazada.toLocaleString('id-ID')
                            )}
                          </td>

                          {/* TT Home */}
                          <td className="p-3.5 text-center text-pink-400 font-mono">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editForm.tiktokHome ?? 0}
                                onChange={(e) => handleEditChange('tiktokHome', Number(e.target.value))}
                                className="bg-[#0c0620] border border-purple-600 text-white text-center rounded-lg px-2 py-1 text-xs outline-none w-16"
                              />
                            ) : (
                              order.tiktokHome.toLocaleString('id-ID')
                            )}
                          </td>

                          {/* SP Home */}
                          <td className="p-3.5 text-center text-indigo-300 font-mono">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editForm.shopeeHome ?? 0}
                                onChange={(e) => handleEditChange('shopeeHome', Number(e.target.value))}
                                className="bg-[#0c0620] border border-purple-600 text-white text-center rounded-lg px-2 py-1 text-xs outline-none w-16"
                              />
                            ) : (
                              order.shopeeHome.toLocaleString('id-ID')
                            )}
                          </td>

                          {/* Blibli */}
                          <td className="p-3.5 text-center font-mono">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editForm.blibli ?? 0}
                                onChange={(e) => handleEditChange('blibli', Number(e.target.value))}
                                className="bg-[#0c0620] border border-purple-600 text-white text-center rounded-lg px-2 py-1 text-xs outline-none w-16"
                              />
                            ) : (
                              order.blibli.toLocaleString('id-ID')
                            )}
                          </td>

                          {/* Total Column */}
                          <td className="p-3.5 text-center font-black bg-purple-950/40 text-purple-300 font-mono text-sm border-l border-purple-900/30">
                            {isEditing ? (
                              editForm.total?.toLocaleString('id-ID')
                            ) : (
                              order.total.toLocaleString('id-ID')
                            )}
                          </td>

                          {/* Aksi Controls */}
                          <td className="p-3.5 text-right">
                            <div className="flex justify-end gap-2">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => handleSaveEdit(order.id!)}
                                    className="p-1 px-2.5 text-xs text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    <span>Simpan</span>
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    className="p-1 px-2.5 text-xs text-slate-300 bg-white/10 hover:bg-white/20 rounded-lg flex items-center gap-1 transition cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>Batal</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleStartEdit(order)}
                                    className="p-1.5 bg-purple-900/30 text-purple-300 hover:text-white hover:bg-purple-800/50 rounded-lg transition-colors cursor-pointer border border-purple-700/30"
                                    title="Edit Catatan"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(order.id!, order.createdBy)}
                                    className="p-1.5 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 hover:text-white rounded-lg transition-colors cursor-pointer border border-rose-700/30"
                                    title="Hapus Catatan"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination & Summary footer bar */}
            {filteredOrders.length > 0 && (
              <div className="p-3.5 border-t border-purple-900/30 bg-[#0c0620] flex flex-col sm:flex-row items-center justify-between gap-3 mt-auto">
                <span className="text-xs text-slate-400 font-medium">
                  Menampilkan <span className="text-white font-bold">{Math.min(currentPage * itemsPerPage, filteredOrders.length)}</span> dari <span className="text-white font-bold">{filteredOrders.length}</span> rekap orderan
                </span>
                
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-1.5 bg-[#130b2e] border border-purple-900/40 hover:bg-purple-900/30 text-white rounded-lg transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-white px-2">
                    Hal {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-1.5 bg-[#130b2e] border border-purple-900/40 hover:bg-purple-900/30 text-white rounded-lg transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Sync Confirmation Modal */}
      <AnimatePresence>
        {isSyncModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSyncing && setIsSyncModalOpen(false)}
              className="absolute inset-0 bg-[#050212]/85 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="relative w-full max-w-lg bg-[#130b2e] border border-teal-500/50 rounded-3xl p-6 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-teal-950/80 border border-teal-500/40 flex items-center justify-center text-teal-300">
                  <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Sinkronkan Firestore ke Supabase</h3>
                  <p className="text-xs text-slate-400">Migrasi &amp; Salin semua data orderan harian lama ke Supabase</p>
                </div>
              </div>

              <div className="bg-[#0c0620]/90 border border-purple-900/40 p-4 rounded-2xl mb-5 space-y-2 text-xs text-slate-300 leading-relaxed">
                <p>Fitur ini akan:</p>
                <ul className="list-disc pl-4 space-y-1 text-slate-400">
                  <li>Membaca seluruh catatan dari collection Firestore <code className="text-teal-300 font-mono font-bold">daily_orders</code>.</li>
                  <li>Melakukan upsert langsung ke tabel Supabase <code className="text-teal-300 font-mono font-bold">daily_orders</code>.</li>
                  <li>Data di Firestore <strong>tidak akan dihapus</strong>, melainkan disalin dan disinkronkan secara aman.</li>
                </ul>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={() => setIsSyncModalOpen(false)}
                  className="bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 font-bold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={handleSyncFirestoreToSupabase}
                  className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-extrabold py-2.5 px-5 rounded-xl text-xs transition shadow-lg shadow-teal-950/40 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sedang Menyinkronkan...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>Mulai Sinkronisasi Sekarang</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SQL Schema Modal */}
      <AnimatePresence>
        {isSqlModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSqlModalOpen(false)}
              className="absolute inset-0 bg-[#050212]/85 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="relative w-full max-w-2xl bg-[#130b2e] border border-purple-900/60 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between pb-4 border-b border-purple-900/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-950/80 border border-purple-500/40 flex items-center justify-center text-purple-300">
                    <Code2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-white">SQL Schema: daily_orders</h3>
                    <p className="text-xs text-slate-400">Jalankan skrip ini di SQL Editor Supabase</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSqlModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="my-4 overflow-y-auto flex-1 bg-[#070314] p-4 rounded-2xl border border-purple-900/40 font-mono text-[11px] text-purple-200 leading-relaxed relative group">
                <pre className="whitespace-pre-wrap select-all">{SQL_SCHEMA_CODE}</pre>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-purple-900/30">
                <a
                  href="https://supabase.com/dashboard/project/ymolrxscthxxtlmnxmob/sql"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-300 hover:text-purple-200 underline flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka Supabase SQL Editor Dashboard</span>
                </a>

                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleCopySql}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg transition cursor-pointer"
                  >
                    {copiedSql ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedSql ? 'Tersalin!' : 'Salin Skrip SQL'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmId(null)}
              className="absolute inset-0 bg-[#050212]/85 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="relative w-full max-w-md bg-[#130b2e] border border-purple-900/50 rounded-3xl p-6 shadow-2xl overflow-hidden text-center"
            >
              <div className="mx-auto w-12 h-12 bg-rose-950/60 rounded-2xl flex items-center justify-center mb-4 border border-rose-600/30">
                <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              
              <h3 className="text-lg font-extrabold text-white mb-2">Konfirmasi Hapus</h3>
              <p className="text-slate-300 text-xs leading-relaxed mb-6">
                Apakah Anda yakin ingin menghapus catatan orderan harian ini dari database? Tindakan ini bersifat permanen dan tidak dapat dibatalkan.
              </p>
              
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 font-bold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs transition shadow-lg shadow-rose-950/40 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Hapus Data</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
