import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';
import { OperationType, UserProfile } from './types';
import { handleFirestoreError } from './utils';
import Toast, { ToastType } from './Toast';
import SearchableSelect, { SearchableSelectHandle } from './SearchableSelect';
import { 
  Calendar, PlusCircle, Search, Trash2, X, FileSpreadsheet, Loader2, 
  ArrowUpDown, ChevronLeft, ChevronRight, Package, Inbox, AlertTriangle, 
  Minus, Plus, Clipboard, User as UserIcon, Tag, Info, ArrowUpRight, ArrowDownLeft,
  Boxes, Sparkles, TrendingUp, CheckCircle2, Download
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import XLSX from 'xlsx-js-style';

interface BundlingAdminStockProps {
  user: any;
  userProfile: UserProfile | null;
}

export interface BundlingLog {
  id: string;
  date: string;
  sku: string;
  quantity: number;
  type: 'MASUK' | 'KELUAR';
  pic: string;
  notes?: string;
  createdBy: string;
  createdAt: any;
  userEmail: string;
}

export default function BundlingAdminStock({ user, userProfile }: BundlingAdminStockProps) {
  const [logs, setLogs] = useState<BundlingLog[]>([]);
  const [masterData, setMasterData] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const skuSelectRef = useRef<SearchableSelectHandle>(null);
  const [showMarquee, setShowMarquee] = useState(false);

  useEffect(() => {
    const checkMarqueeTime = () => {
      const now = new Date();
      const min = now.getMinutes();
      const shouldShow = (min >= 0 && min < 5) || (min >= 30 && min < 35);
      setShowMarquee(shouldShow);
    };
    checkMarqueeTime();
    const timer = setInterval(checkMarqueeTime, 10000);
    return () => clearInterval(timer);
  }, []);

  // Form state
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [type, setType] = useState<'MASUK' | 'KELUAR'>('MASUK');
  const [pic, setPic] = useState('');
  const [notes, setNotes] = useState('');

  // Tables state
  const [searchTerm, setSearchTerm] = useState('');
  const [summarySearch, setSummarySearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  
  // Modals / Alerts
  const [deleteConfirmId, setDeleteConfirmId] = useState<BundlingLog | null>(null);
  
  // Toast Alert State
  const [toast, setToast] = useState<{ message: string; type: ToastType; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });

  const triggerToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type, visible: true });
  };

  // 1. Fetch Master Data options
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'master_data'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Record<string, string[]> = {};
      snapshot.docs.forEach(doc => {
        data[doc.id] = doc.data().options || [];
      });
      setMasterData(data);
      if (data.pic_ginee && data.pic_ginee.length > 0) {
        setPic(localStorage.getItem('selectedBundlingAdminPic') || data.pic_ginee[0]);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // 2. Fetch Bundling Stock Logs
  useEffect(() => {
    if (!user) {
      setLogs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'stok_bundling_admin'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLogs: BundlingLog[] = [];
      snapshot.docs.forEach((doc) => {
        const d = doc.data();
        fetchedLogs.push({
          id: doc.id,
          date: d.date || '',
          sku: d.sku || '',
          quantity: Number(d.quantity) || 0,
          type: d.type || 'MASUK',
          pic: d.pic || '',
          notes: d.notes || '',
          createdBy: d.createdBy || '',
          createdAt: d.createdAt,
          userEmail: d.userEmail || ''
        });
      });

      const getCreatedTime = (log: BundlingLog) => {
        if (!log.createdAt) return 0;
        if (typeof log.createdAt === 'number') return log.createdAt;
        if (typeof log.createdAt === 'string') return new Date(log.createdAt).getTime();
        if (log.createdAt && typeof (log.createdAt as any).toMillis === 'function') {
          return (log.createdAt as any).toMillis();
        }
        if (log.createdAt && typeof (log.createdAt as any).seconds === 'number') {
          return (log.createdAt as any).seconds * 1000;
        }
        return 0;
      };

      fetchedLogs.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateA !== dateB) {
          return dateB.localeCompare(dateA);
        }
        return getCreatedTime(b) - getCreatedTime(a);
      });

      setLogs(fetchedLogs);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching logs:", error);
      handleFirestoreError(error, OperationType.READ, 'stok_bundling_admin');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Compute Realtime Stock Summary per SKU
  const stockSummary = useMemo(() => {
    const summaryMap: Record<string, { masuk: number; keluar: number; balance: number }> = {};
    
    logs.forEach(log => {
      const targetSku = log.sku.trim().toUpperCase();
      if (!targetSku) return;
      if (!summaryMap[targetSku]) {
        summaryMap[targetSku] = { masuk: 0, keluar: 0, balance: 0 };
      }
      if (log.type === 'MASUK') {
        summaryMap[targetSku].masuk += log.quantity;
        summaryMap[targetSku].balance += log.quantity;
      } else if (log.type === 'KELUAR') {
        summaryMap[targetSku].keluar += log.quantity;
        summaryMap[targetSku].balance -= log.quantity;
      }
    });

    return Object.entries(summaryMap).map(([skuKey, stats]) => ({
      sku: skuKey,
      ...stats
    })).sort((a, b) => a.sku.localeCompare(b.sku));
  }, [logs]);

  // KPIs
  const totalStockOnHand = useMemo(() => {
    return stockSummary.reduce((acc, curr) => acc + curr.balance, 0);
  }, [stockSummary]);

  const totalMasukAll = useMemo(() => {
    return logs.filter(l => l.type === 'MASUK').reduce((acc, curr) => acc + curr.quantity, 0);
  }, [logs]);

  const totalKeluarAll = useMemo(() => {
    return logs.filter(l => l.type === 'KELUAR').reduce((acc, curr) => acc + curr.quantity, 0);
  }, [logs]);

  // Filtered Stock Summary for Search
  const filteredSummary = useMemo(() => {
    if (!summarySearch.trim()) return stockSummary;
    const term = summarySearch.toLowerCase();
    return stockSummary.filter(item => item.sku.toLowerCase().includes(term));
  }, [stockSummary, summarySearch]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    if (!searchTerm.trim()) return logs;
    const term = searchTerm.toLowerCase();
    return logs.filter(l => 
      l.sku.toLowerCase().includes(term) ||
      l.pic.toLowerCase().includes(term) ||
      (l.notes && l.notes.toLowerCase().includes(term)) ||
      l.date.includes(term)
    );
  }, [logs, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim()) {
      triggerToast('Pilih atau ketik SKU terlebih dahulu!', 'error');
      return;
    }
    if (!quantity || quantity <= 0) {
      triggerToast('Jumlah unit harus lebih dari 0!', 'error');
      return;
    }
    if (!pic.trim()) {
      triggerToast('Pilih PIC Admin yang bertanggung jawab!', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const cleanSku = sku.trim().toUpperCase();
      const currentStockItem = stockSummary.find(s => s.sku === cleanSku);
      const currentBalance = currentStockItem ? currentStockItem.balance : 0;

      if (type === 'KELUAR' && quantity > currentBalance) {
        if (!window.confirm(`Perhatian: Sisa stok saat ini (${currentBalance}) lebih kecil dari jumlah keluar (${quantity}). Tetap lanjutkan?`)) {
          setActionLoading(false);
          return;
        }
      }

      await addDoc(collection(db, 'stok_bundling_admin'), {
        date,
        sku: cleanSku,
        quantity: Number(quantity),
        type,
        pic: pic.trim(),
        notes: notes.trim(),
        createdAt: serverTimestamp(),
        createdBy: user?.displayName || user?.email || 'admin',
        userEmail: user?.email || ''
      });

      triggerToast(`Berhasil mencatat mutasi ${type} untuk SKU: ${cleanSku}!`, 'success');
      localStorage.setItem('selectedBundlingAdminPic', pic.trim());

      setSku('');
      setQuantity(1);
      setNotes('');
      if (skuSelectRef.current) {
        skuSelectRef.current.focus();
      }
    } catch (err) {
      console.error('Error submitting log:', err);
      handleFirestoreError(err, OperationType.CREATE, 'stok_bundling_admin');
      triggerToast('Gagal menyimpan mutasi. Silakan periksa koneksi.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteLog = (log: BundlingLog) => {
    setDeleteConfirmId(log);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteDoc(doc(db, 'stok_bundling_admin', deleteConfirmId.id));
      triggerToast('Log mutasi berhasil dihapus dari database.', 'success');
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Error deleting log:', err);
      handleFirestoreError(err, OperationType.DELETE, `stok_bundling_admin/${deleteConfirmId.id}`);
      triggerToast('Gagal menghapus log mutasi.', 'error');
    }
  };

  const handleExportExcel = () => {
    try {
      const wsData = [
        ['No', 'Tanggal', 'SKU Barang Bundling', 'Tipe Alur', 'Jumlah', 'PIC Admin', 'Keterangan / Notes'],
        ...logs.map((l, index) => [
          index + 1,
          l.date,
          l.sku,
          l.type,
          l.quantity,
          l.pic,
          l.notes || '-'
        ])
      ];

      const wsSummary = [
        ['No', 'SKU Barang Bundling', 'Total Masuk (IN)', 'Total Keluar (OUT)', 'Sisa Stok Rak (OnHand)'],
        ...stockSummary.map((s, index) => [
          index + 1,
          s.sku,
          s.masuk,
          s.keluar,
          s.balance
        ])
      ];

      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.aoa_to_sheet(wsData);
      const ws2 = XLSX.utils.aoa_to_sheet(wsSummary);

      XLSX.utils.book_append_sheet(wb, ws2, 'Sisa Stok Rak');
      XLSX.utils.book_append_sheet(wb, ws1, 'Riwayat Log Mutasi');

      XLSX.writeFile(wb, `Stok_Bundling_Admin_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      triggerToast('File Excel Rekapitulasi Stok berhasil diunduh.', 'success');
    } catch (err) {
      console.error('Export excel error:', err);
      triggerToast('Gagal membuat file Excel.', 'error');
    }
  };

  const stepQuantity = (delta: number) => {
    setQuantity(prev => Math.max(1, prev + delta));
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in relative">
      <Toast 
        message={toast.message} 
        type={toast.type} 
        isVisible={toast.visible} 
        onClose={() => setToast(prev => ({ ...prev, visible: false }))} 
      />

      {/* Marquee reminder if applicable */}
      {showMarquee && (
        <div className="bg-gradient-to-r from-purple-950 via-indigo-950 to-purple-950 border border-purple-500/40 px-4 py-2 rounded-2xl overflow-hidden shadow-lg shadow-purple-950/40">
          <div className="whitespace-nowrap animate-marquee flex items-center gap-6 text-xs font-bold text-purple-200">
            <span className="flex items-center gap-1.5 text-pink-400">
              <Sparkles className="w-4 h-4" /> PENGINGAT OPERASIONAL:
            </span>
            <span>Pastikan seluruh pergerakan barang bundling masuk &amp; keluar selalu dicatat secara real-time agar inventori rak tetap akurat.</span>
          </div>
        </div>
      )}

      {/* Header Panel */}
      <div className="bg-[#130b2e]/90 border border-purple-900/30 p-6 md:p-7 rounded-2xl shadow-xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-purple-600/10 blur-[130px] rounded-full pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 p-3.5 bg-gradient-to-tr from-purple-600/25 to-indigo-600/25 rounded-2xl flex items-center justify-center border border-purple-500/30 shadow-lg shadow-purple-950/50">
              <Boxes className="w-7 h-7 text-purple-400" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">Stok Bundling Admin</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 tracking-wider uppercase">
                  v2.6-BUNDLING
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-sm shadow-emerald-400" />
                <p className="text-purple-300/80 text-xs font-bold uppercase tracking-widest">
                  Live Inventori Rak &amp; Mutasi Fisik • {stockSummary.length} SKU Terdata
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleExportExcel}
            className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-950/40 flex items-center gap-2 text-xs"
          >
            <Download className="w-4 h-4" />
            <span>Export Rekap Excel</span>
          </button>
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Stock on Hand */}
        <div className="bg-[#130b2e]/90 border border-purple-900/30 p-5 rounded-2xl shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-purple-300/70 uppercase tracking-widest block mb-1">Total Stok di Rak</span>
            <span className="text-2xl sm:text-3xl font-black text-white">{totalStockOnHand.toLocaleString()}</span>
            <span className="text-[10px] text-purple-400/80 block mt-0.5 font-bold">Unit Fisik Tersedia</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Package className="w-6 h-6" />
          </div>
        </div>

        {/* Total Masuk */}
        <div className="bg-[#130b2e]/90 border border-purple-900/30 p-5 rounded-2xl shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-emerald-400/80 uppercase tracking-widest block mb-1">Total Masuk (IN)</span>
            <span className="text-2xl sm:text-3xl font-black text-emerald-400">+{totalMasukAll.toLocaleString()}</span>
            <span className="text-[10px] text-emerald-300/60 block mt-0.5 font-bold">Akumulasi Mutasi Masuk</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>

        {/* Total Keluar */}
        <div className="bg-[#130b2e]/90 border border-purple-900/30 p-5 rounded-2xl shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-rose-400/80 uppercase tracking-widest block mb-1">Total Keluar (OUT)</span>
            <span className="text-2xl sm:text-3xl font-black text-rose-400">-{totalKeluarAll.toLocaleString()}</span>
            <span className="text-[10px] text-rose-300/60 block mt-0.5 font-bold">Akumulasi Mutasi Keluar</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <ArrowDownLeft className="w-6 h-6" />
          </div>
        </div>

        {/* SKU Aktif */}
        <div className="bg-[#130b2e]/90 border border-purple-900/30 p-5 rounded-2xl shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-cyan-400/80 uppercase tracking-widest block mb-1">SKU Aktif</span>
            <span className="text-2xl sm:text-3xl font-black text-cyan-400">{stockSummary.length}</span>
            <span className="text-[10px] text-cyan-300/60 block mt-0.5 font-bold">Item Terdaftar di Rak</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Tag className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Grid: Form Left, Balances & History Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form Mutasi */}
        <div className="lg:col-span-4 bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-5">
          <div className="flex items-center gap-2 text-xs font-black text-purple-300 uppercase tracking-wider pb-3 border-b border-purple-900/30">
            <PlusCircle className="w-4 h-4 text-purple-400" />
            <span>Form Input Mutasi Rak</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tanggal Mutasi */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Tanggal Info</label>
              <div className="relative">
                <input
                  required
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white focus:ring-2 focus:ring-purple-500 outline-none text-xs [color-scheme:dark]"
                />
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400/60 pointer-events-none" />
              </div>
            </div>

            {/* Tipe Mutasi: MASUK vs KELUAR */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Tipe Alur Mutasi</label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl">
                <button
                  type="button"
                  onClick={() => setType('MASUK')}
                  className={`py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    type === 'MASUK' 
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50' 
                      : 'text-purple-300/60 hover:text-purple-200'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>MASUK (IN)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('KELUAR')}
                  className={`py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    type === 'KELUAR' 
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/50' 
                      : 'text-purple-300/60 hover:text-purple-200'
                  }`}
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>KELUAR (OUT)</span>
                </button>
              </div>
            </div>

            {/* SKU Autocomplete Select */}
            <div className="space-y-1.5">
              <SearchableSelect
                ref={skuSelectRef}
                label="SKU Barang Bundling"
                required
                colorTheme="purple"
                options={Array.from(new Set([...(masterData.sku || []), ...(masterData.bundling_sku || [])]))}
                value={sku}
                onChange={setSku}
                placeholder="Pilih atau ketik SKU..."
                allowCustom={true}
              />
            </div>

            {/* Quantity adjustment with Plus and Minus triggers */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Jumlah Unit</label>
              <div className="flex items-center bg-[#0c0620]/90 border border-purple-900/40 rounded-xl overflow-hidden p-1">
                <button
                  type="button"
                  onClick={() => stepQuantity(-1)}
                  className="w-9 h-9 flex items-center justify-center text-purple-300 hover:text-white hover:bg-purple-800/30 rounded-lg transition"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  required
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="flex-1 bg-transparent text-center text-white font-mono font-bold text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => stepQuantity(1)}
                  className="w-9 h-9 flex items-center justify-center text-purple-300 hover:text-white hover:bg-purple-800/30 rounded-lg transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex justify-between px-1">
                {[-10, -5, +5, +10].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => stepQuantity(val)}
                    className="text-[10px] font-black text-purple-300 hover:text-white bg-purple-900/30 hover:bg-purple-900/50 border border-purple-700/30 px-2 py-0.5 rounded-md transition"
                  >
                    {val > 0 ? `+${val}` : val}
                  </button>
                ))}
              </div>
            </div>

            {/* PIC selection */}
            <div className="space-y-1.5">
              <SearchableSelect
                label="PIC Admin Bertanggung Jawab"
                required
                colorTheme="emerald"
                options={masterData.pic_ginee || masterData.pic || []}
                value={pic}
                onChange={setPic}
                placeholder="Pilih PIC Admin..."
              />
            </div>

            {/* Notes input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Keterangan / Tujuan Mutasi</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Contoh: Tambah stok rak, Kirim orderan..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white text-xs focus:ring-2 focus:ring-purple-500 outline-none placeholder-purple-400/30"
                />
                <Info className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400/50" />
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={actionLoading}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black rounded-xl py-3 text-xs uppercase tracking-wider transition-all shadow-lg shadow-purple-950/50 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan Mutasi Stok</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Sisa Stok Rak Chips & History Table */}
        <div className="lg:col-span-8 space-y-6">
          {/* Section 1: Sisa Stok Rak Khusus Admin */}
          <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-6 shadow-xl backdrop-blur-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <Clipboard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-white text-sm">Sisa Stok Rak Khusus Admin</h3>
                  <p className="text-[10px] text-purple-300/70">Klik chip untuk memilih SKU langsung</p>
                </div>
              </div>
              
              <div className="relative w-full sm:w-60">
                <input
                  type="text"
                  placeholder="Cari SKU di rak..."
                  value={summarySearch}
                  onChange={(e) => setSummarySearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-xs text-white placeholder-purple-400/30 focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400/50" />
              </div>
            </div>

            {/* Chips Container */}
            {filteredSummary.length === 0 ? (
              <div className="border border-purple-900/30 rounded-xl bg-[#0c0620]/60 py-6 text-center text-purple-300/50 text-xs">
                Belum ada data stok di rak atau pencarian tidak cocok.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[190px] overflow-y-auto custom-scrollbar pr-1">
                {filteredSummary.map((item) => (
                  <div
                    key={item.sku}
                    onClick={() => {
                      setSku(item.sku);
                      triggerToast(`Dipilih SKU: ${item.sku}. Silakan input mutasi.`);
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group active:scale-95 ${
                      item.balance <= 0 
                        ? 'bg-rose-950/20 border-rose-500/30 hover:bg-rose-900/30' 
                        : item.balance <= 2 
                        ? 'bg-amber-950/20 border-amber-500/30 hover:bg-amber-900/30'
                        : 'bg-[#0c0620]/90 border-purple-900/40 hover:border-purple-600/50 hover:bg-purple-950/30'
                    }`}
                  >
                    <span className="text-[10px] font-mono font-bold text-purple-200 truncate group-hover:text-white transition-colors" title={item.sku}>
                      {item.sku}
                    </span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-[10px] font-medium text-purple-400/60">Sisa:</span>
                      <span className={`text-sm font-black font-mono ${
                        item.balance <= 0 ? 'text-rose-400' : item.balance <= 2 ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {item.balance}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Historis Mutasi Table */}
          <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-6 shadow-xl backdrop-blur-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-white text-sm">Riwayat Transaksi Mutasi</h3>
                  <p className="text-[10px] text-purple-300/70">Daftar keluar masuk stok rak bundling</p>
                </div>
              </div>

              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Cari SKU, PIC, catatan..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-8 py-2 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-xs text-white placeholder-purple-400/30 focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400/50" />
                {searchTerm && (
                  <button 
                    onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-purple-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-purple-900/30 bg-[#0c0620]/90 shadow-md">
              <table className="w-full text-left border-collapse min-w-[650px]">
                <thead>
                  <tr className="border-b border-purple-900/30 bg-[#0e0725] text-purple-300 font-black text-[10px] tracking-wider uppercase">
                    <th className="py-3 px-3 text-center">No</th>
                    <th className="py-3 px-3">Tanggal</th>
                    <th className="py-3 px-3">SKU Barang</th>
                    <th className="py-3 px-3 text-center">Tipe</th>
                    <th className="py-3 px-3 text-center">Jumlah</th>
                    <th className="py-3 px-3">PIC Admin</th>
                    <th className="py-3 px-3">Keterangan</th>
                    <th className="py-3 px-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-900/20 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-purple-300/50">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                          <span>Sinkronisasi data real-time...</span>
                        </div>
                      </td>
                    </tr>
                  ) : paginatedLogs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-purple-300/50 font-medium">
                        Tidak ada log mutasi yang ditemukan.
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map((log, idx) => {
                      const rowNum = (currentPage - 1) * itemsPerPage + idx + 1;
                      return (
                        <tr key={log.id} className="hover:bg-purple-950/20 transition-colors">
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-purple-400/60">{rowNum}</td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-purple-200">
                            {format(new Date(log.date), 'dd MMM yyyy')}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-white font-mono">{log.sku}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                              log.type === 'MASUK' 
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            }`}>
                              {log.type === 'MASUK' ? 'MASUK' : 'KELUAR'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-black text-white text-xs">{log.quantity}</td>
                          <td className="py-2.5 px-3 font-medium text-purple-200">
                            <div className="flex items-center gap-1.5">
                              <UserIcon className="w-3.5 h-3.5 text-purple-400" />
                              <span>{log.pic}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 max-w-[180px] truncate text-purple-300/70 italic" title={log.notes}>
                            {log.notes || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => handleDeleteLog(log)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                              title="Hapus log mutasi"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 px-1">
                <span className="text-[11px] text-purple-300/70 font-medium">
                  Menampilkan <span className="text-white font-bold">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-white font-bold">{Math.min(currentPage * itemsPerPage, filteredLogs.length)}</span> dari <span className="text-white font-bold">{filteredLogs.length}</span> rekam
                </span>
                
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-1 px-3 bg-[#0c0620] border border-purple-900/40 hover:bg-purple-900/30 text-white rounded-lg text-xs transition disabled:opacity-30 flex items-center gap-1 font-bold"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Sebelum
                  </button>
                  <span className="text-xs font-black text-purple-300 font-mono">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-1 px-3 bg-[#0c0620] border border-purple-900/40 hover:bg-purple-900/30 text-white rounded-lg text-xs transition disabled:opacity-30 flex items-center gap-1 font-bold"
                  >
                    Berikut <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmId(null)}
              className="absolute inset-0 bg-black/75 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="relative w-full max-w-md bg-[#130b2e] border border-purple-800/40 rounded-3xl p-6 shadow-2xl overflow-hidden text-center shadow-purple-950/80"
            >
              <div className="mx-auto w-12 h-12 bg-rose-500/15 rounded-2xl flex items-center justify-center mb-4 border border-rose-500/30 text-rose-400">
                <Trash2 className="w-6 h-6" />
              </div>
              
              <h3 className="text-lg font-black text-white mb-2">Konfirmasi Hapus Log Mutasi</h3>
              <p className="text-purple-300/80 text-xs leading-relaxed mb-6">
                Apakah Anda yakin ingin menghapus mutasi <span className="font-bold text-white uppercase">{deleteConfirmId.type}</span> untuk SKU <span className="font-bold text-white font-mono">{deleteConfirmId.sku}</span> sebesar <span className="font-bold text-white">{deleteConfirmId.quantity}</span> unit?
              </p>
              
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 bg-[#0c0620] border border-purple-900/40 hover:bg-purple-900/30 text-purple-300 font-bold py-2.5 px-4 rounded-xl text-xs transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="flex-1 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-black py-2.5 px-4 rounded-xl text-xs transition shadow-lg shadow-rose-950/50 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus Log
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
