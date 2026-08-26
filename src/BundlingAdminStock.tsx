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
  Minus, Plus, Clipboard, User as UserIcon, Tag, Info, ArrowUpRight, ArrowDownLeft
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
      // Show for first 5 minutes of every half hour: [00-05) and [30-35)
      const shouldShow = (min >= 0 && min < 5) || (min >= 30 && min < 35);
      setShowMarquee(shouldShow);
    };
    checkMarqueeTime();
    const timer = setInterval(checkMarqueeTime, 10000); // Check every 10 seconds
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

      // Sort client-side by date desc, then createdAt desc
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
      setLoading(false);
      try {
        handleFirestoreError(error, OperationType.GET, 'stok_bundling_admin');
      } catch (err) {
        console.error("Firestore loading error:", err);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Dynamic Inventory Summary (Map of SKU to quantities)
  const inventorySummary = useMemo(() => {
    const summary: Record<string, { sku: string; totalIn: number; totalOut: number; balance: number }> = {};
    
    logs.forEach((log) => {
      if (!summary[log.sku]) {
        summary[log.sku] = { sku: log.sku, totalIn: 0, totalOut: 0, balance: 0 };
      }
      if (log.type === 'MASUK') {
        summary[log.sku].totalIn += log.quantity;
      } else {
        summary[log.sku].totalOut += log.quantity;
      }
      summary[log.sku].balance = summary[log.sku].totalIn - summary[log.sku].totalOut;
    });

    return Object.values(summary).sort((a, b) => b.balance - a.balance);
  }, [logs]);

  // Filters for summary list
  const filteredSummary = useMemo(() => {
    return inventorySummary.filter(item => 
      item.sku.toLowerCase().includes(summarySearch.toLowerCase())
    );
  }, [inventorySummary, summarySearch]);

  // Filters for historical ledger logs list
  const filteredLogs = useMemo(() => {
    return logs.filter(log => 
      log.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.pic.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.notes && log.notes.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [logs, searchTerm]);

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      triggerToast('Anda harus login terlebih dahulu.', 'error');
      return;
    }
    if (!sku.trim()) {
      triggerToast('SKU Barang Bundling wajib diisi.', 'error');
      return;
    }
    if (quantity <= 0) {
      triggerToast('Jumlah unit harus lebih dari 0.', 'error');
      return;
    }
    if (!pic) {
      triggerToast('PIC Admin wajib diisi.', 'error');
      return;
    }

    // Double check if drawing more than balance
    if (type === 'KELUAR') {
      const parentSummary = inventorySummary.find(item => item.sku === sku);
      const currentBalance = parentSummary ? parentSummary.balance : 0;
      if (quantity > currentBalance) {
        if (!window.confirm(`Stok di rak admin untuk ${sku} hanya tersisa ${currentBalance} unit. Apakah Anda tetap ingin menarik keluar ${quantity} unit?`)) {
          return;
        }
      }
    }

    setActionLoading(true);
    const savePromise = addDoc(collection(db, 'stok_bundling_admin'), {
      date,
      sku: sku.trim(),
      quantity,
      type,
      pic,
      notes: notes.trim(),
      createdBy: user?.uid || auth.currentUser?.uid || '',
      createdAt: serverTimestamp(),
      userEmail: user?.email || auth.currentUser?.email || ''
    });

    // Save PIC preference
    localStorage.setItem('selectedBundlingAdminPic', pic);

    // Reset SKU, Quantity, Keterangan inputs immediately so the UI is ready for consecutive logs
    setSku('');
    setQuantity(1);
    setNotes('');

    // Stop loading immediately after 300ms since Firestore updates the lists instantly via onSnapshot latency compensation
    setTimeout(() => {
      setActionLoading(false);
      triggerToast(`Stok ${sku} berhasil dicatat sebagai 【${type}】.`);
      skuSelectRef.current?.focus();
    }, 300);

    // Track original write promise asynchronously in the background
    savePromise.catch((err) => {
      try {
        handleFirestoreError(err, OperationType.WRITE, 'stok_bundling_admin');
      } catch (firestoreErr: any) {
        let msg = 'Gagal menyimpan log stok bundling.';
        try {
          const parsed = JSON.parse(firestoreErr.message);
          msg += ` (${parsed.error || parsed})`;
        } catch {
          msg += ` (${firestoreErr.message || firestoreErr})`;
        }
        triggerToast(msg, 'error');
      }
      console.error(err);
    });
  };

  // Delete Log
  const handleDeleteLog = (log: BundlingLog) => {
    const isAdminUser = userProfile?.role === 'admin' || user?.email === 'jgilbeth92@gmail.com';
    const isOwner = user?.uid === log.createdBy;

    if (!isAdminUser && !isOwner) {
      triggerToast('Anda hanya diperbolehkan menghapus log yang Andat tulis sendiri.', 'error');
      return;
    }
    setDeleteConfirmId(log);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'stok_bundling_admin', deleteConfirmId.id));
      triggerToast('Log transaksi stok berhasil dihapus.');
    } catch (err) {
      triggerToast('Gagal menghapus log transaksi.', 'error');
      console.error(err);
    } finally {
      setActionLoading(false);
      setDeleteConfirmId(null);
    }
  };

  // Excel Export
  const handleExportExcel = () => {
    if (logs.length === 0) {
      triggerToast('Tidak ada log transaksi untuk diexport.', 'error');
      return;
    }

    const wb = XLSX.utils.book_new();
    
    // Summary Sheet
    const summaryData = inventorySummary.map((item, idx) => ({
      "NO": idx + 1,
      "SKU BUNDLING": item.sku,
      "TOTAL MASUK (IN)": item.totalIn,
      "TOTAL KELUAR (OUT)": item.totalOut,
      "SISA STOK RAK": item.balance
    }));
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);

    // Ledger Log Sheet
    const ledgerData = logs.map((log, idx) => ({
      "NO": idx + 1,
      "TANGGAL LOG": log.date,
      "SKU BUNDLING": log.sku,
      "TIPE ALUR": log.type,
      "QTY": log.quantity,
      "PIC ADMIN": log.pic,
      "CATATAN / LOGISTIK": log.notes || '-',
      "INPUT OLEH": log.userEmail
    }));
    const wsLedger = XLSX.utils.json_to_sheet(ledgerData);

    // Style helper
    const headStyle = {
      font: { name: 'Inter', bold: true, color: { rgb: 'FFFFFF' }, size: 10 },
      fill: { fgColor: { rgb: '312E81' } },
      alignment: { horizontal: 'center' }
    };

    // Apply header style to both
    ['A1', 'B1', 'C1', 'D1', 'E1'].forEach(c => { if (wsSummary[c]) wsSummary[c].s = headStyle; });
    ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'].forEach(c => { if (wsLedger[c]) wsLedger[c].s = headStyle; });

    wsSummary['!cols'] = [
      { wch: 8 },  // A
      { wch: 42 }, // B
      { wch: 24 }, // C
      { wch: 24 }, // D
      { wch: 24 }  // E
    ];

    wsLedger['!cols'] = [
      { wch: 8 },  // A
      { wch: 15 }, // B
      { wch: 42 }, // C
      { wch: 20 }, // D
      { wch: 10 }, // E
      { wch: 24 }, // F
      { wch: 40 }, // G
      { wch: 30 }  // H
    ];

    XLSX.utils.book_append_sheet(wb, wsSummary, "Ringkasan Stok Rak Admin");
    XLSX.utils.book_append_sheet(wb, wsLedger, "Log Alur Keluar Masuk");

    XLSX.writeFile(wb, `Stok_Bundling_Admin_Rak_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    triggerToast('Stok berhasil diexport ke Excel!');
  };

  // Handlers for quick adjusting quantities
  const stepQuantity = (val: number) => {
    setQuantity(prev => {
      const next = prev + val;
      return next < 1 ? 1 : next;
    });
  };

  // Pagination compute
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  return (
    <div className="flex-1 w-full max-w-none mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 relative z-10">
      
      {/* Toast Alert */}
      <Toast 
        message={toast.message} 
        type={toast.type} 
        isVisible={toast.visible} 
        onClose={() => setToast(prev => ({ ...prev, visible: false }))} 
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/5 border border-white/10 p-6 sm:p-8 rounded-[30px] backdrop-blur-2xl relative overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 to-pink-500/10 opacity-30 pointer-events-none" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 bg-indigo-500/20 rounded-2xl flex items-center justify-center border border-indigo-500/30 shadow-lg shadow-indigo-950/25">
            <Package className="w-7 h-7 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-white leading-none tracking-tight">Stok Bundling Admin</h2>
              <span className="hidden sm:inline-flex bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border border-indigo-500/30">Admin Shelf Tracker</span>
            </div>
            <p className="text-slate-400 text-xs sm:text-sm mt-1.5 max-w-3xl leading-relaxed">
              Manajemen mutasi keluar/masuk barang fisik bundling di rak khusus ruangan admin. Admin dapat memantau stok bundling secara real-time dan mengambil barang langsung tanpa picker saat print bundling satuan.
            </p>
          </div>
        </div>
        <button
          onClick={handleExportExcel}
          className="h-11 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-2xl tracking-wider text-xs uppercase cursor-pointer transition-all flex items-center justify-center gap-2 relative z-10 shadow-lg shadow-emerald-950/40 active:scale-95 border border-emerald-400/20 group hover:border-emerald-400/40"
        >
          <FileSpreadsheet className="w-4 h-4 transition-transform group-hover:scale-110" />
          Export Excel
        </button>
      </div>

      {/* Running Text Marquee Notification */}
      {showMarquee && (
        <div className="relative w-full bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 overflow-hidden flex items-center gap-3 shadow-lg shadow-amber-950/20 z-20">
          <div className="absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-[#120a32] via-[#120a32] to-transparent z-10 pointer-events-none flex items-center pl-4">
            <AlertTriangle className="w-5 h-5 text-amber-400 animate-bounce" />
          </div>
          <div className="flex-1 overflow-hidden relative w-full h-5">
            <div className="whitespace-nowrap absolute animate-marquee font-extrabold text-[11px] sm:text-xs text-amber-300 uppercase tracking-widest pl-10">
              PENTING: Wajib melakukan pemotongan stok pada menu "Stok Bundling Admin" jika Anda mengambil barang bundling fisik dari rak admin. Bagi siapapun yang mengambil bundling, harap segera melakukan konfirmasi ke petugas Admin. Terima kasih atas kerja samanya.
            </div>
          </div>
        </div>
      )}

      {/* Bento Stats Indicators Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-[#181140]/40 backdrop-blur-md border border-white/10 rounded-[28px] p-6 shadow-xl flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
            <Tag className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Macam SKU</span>
            <p className="text-2xl font-black text-white tracking-tight mt-0.5">{inventorySummary.length}</p>
          </div>
        </div>

        <div className="bg-[#181140]/40 backdrop-blur-md border border-white/10 rounded-[28px] p-6 shadow-xl flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/20 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#f59e0b]">Stok Menipis (≤ 2 Unit)</span>
            <p className="text-2xl font-black text-rose-400 tracking-tight mt-0.5">
              {inventorySummary.filter(item => item.balance <= 2).length} SKU
            </p>
          </div>
        </div>

        <div className="bg-[#181140]/40 backdrop-blur-md border border-white/10 rounded-[28px] p-6 shadow-xl flex items-center gap-5 sm:col-span-2 lg:col-span-1">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
            <Inbox className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Kumulatif Unit Terisi</span>
            <p className="text-2xl font-black text-violet-400 tracking-tight mt-0.5">
              {inventorySummary.reduce((sum, item) => sum + Math.max(0, item.balance), 0).toLocaleString('id-ID')} unit
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Input Form */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#181140]/45 border border-white/15 rounded-[32px] p-6 sm:p-7 relative overflow-hidden shadow-xl backdrop-blur-xl">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-violet-500 via-indigo-500 to-pink-500" />
            
            <div className="flex items-center gap-3 mb-6">
              <PlusCircle className="w-5 h-5 text-indigo-400" />
              <h3 className="font-extrabold text-white text-base">Catat Mutasi Stok Ruang Admin</h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Date Input */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tanggal Transaksi</label>
                <div id="div-date-container" className="relative">
                  <input
                    required
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-[#110931]/70 border border-white/10 rounded-2xl text-white font-semibold text-sm focus:outline-none focus:border-indigo-400 transition"
                  />
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                </div>
              </div>

              {/* Alur Stock: MASUK vs KELUAR selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tipe Mutasi</label>
                <div id="tipe-mutasi-tabs" className="grid grid-cols-2 gap-2.5 p-1 bg-[#110931]/60 border border-white/10 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setType('MASUK')}
                    className={`h-11 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${type === 'MASUK' ? 'bg-[#5e43f3] text-white shadow-md border border-indigo-400/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                  >
                    <ArrowUpRight className={`w-4 h-4 ${type === 'MASUK' ? 'text-emerald-400' : 'text-slate-500'}`} />
                    MASUK (IN)
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('KELUAR')}
                    className={`h-11 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${type === 'KELUAR' ? 'bg-indigo-950/80 text-white shadow-md border border-indigo-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                  >
                    <ArrowDownLeft className={`w-4 h-4 ${type === 'KELUAR' ? 'text-rose-400' : 'text-slate-500'}`} />
                    KELUAR (OUT)
                  </button>
                </div>
              </div>

              {/* SKU Autocomplete Select */}
              <div className="space-y-2">
                <SearchableSelect
                  ref={skuSelectRef}
                  label="SKU BARANG BUNDLING *"
                  required
                  options={Array.from(new Set([...(masterData.sku || []), ...(masterData.bundling_sku || [])]))}
                  value={sku}
                  onChange={setSku}
                  placeholder="Cari atau ketik SKU..."
                  allowCustom={true}
                />
              </div>

              {/* Quantity adjustment with Plus and Minus triggers */}
              <div id="quantity-control-parent" className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Jumlah Unit *</label>
                <div className="flex items-center bg-[#110931]/70 border border-white/10 rounded-2xl overflow-hidden p-1">
                  <button
                    type="button"
                    onClick={() => stepQuantity(-1)}
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    required
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 bg-transparent text-center text-white font-mono font-bold text-base focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => stepQuantity(1)}
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex justify-between px-1.5">
                  {[-10, -5, +5, +10].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => stepQuantity(val)}
                      className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 transition cursor-pointer bg-indigo-500/10 border border-indigo-400/10 hover:border-indigo-400/30 px-2 py-0.5 rounded-md mt-1"
                    >
                      {val > 0 ? `+${val}` : val}
                    </button>
                  ))}
                </div>
              </div>

              {/* PIC selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">PIC Admin *</label>
                <SearchableSelect
                  required
                  options={masterData.pic_ginee || masterData.pic || []}
                  value={pic}
                  onChange={setPic}
                  placeholder="Pilih PIC Admin..."
                />
              </div>

              {/* Notes input */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Keterangan / Tujuan</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Contoh: Tambah stok rak, Kirim orderan, dll."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-[#110931]/70 border border-white/10 rounded-2xl text-white text-sm focus:outline-none focus:border-indigo-400 transition"
                  />
                  <Info className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                </div>
              </div>

              {/* Submit button using elegant solid branding style */}
              <button
                type="submit"
                disabled={actionLoading}
                className="w-full bg-[#634be9] hover:bg-[#523ad4] text-white font-extrabold rounded-2xl py-3.5 text-sm transition-all shadow-lg shadow-indigo-950/40 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 border border-indigo-400/20 hover:border-indigo-400/40 mt-3"
              >
                {actionLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <PlusCircle className="w-5 h-5" />
                    Simpan Perubahan Stok
                  </>
                )}
              </button>

            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: Live inventories balance checklist & history logs */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Section: Live Rak Inventory balances list */}
          <div className="bg-[#181140]/45 border border-white/15 rounded-[32px] p-6 shadow-xl backdrop-blur-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <Clipboard className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">Sisa Stok Rak Khusus Admin</h3>
                  <p className="text-[10px] text-slate-400 leading-none mt-0.5">Live aggregated quantity on hand</p>
                </div>
              </div>
              
              {/* Filter */}
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Cari SKU di rak..."
                  value={summarySearch}
                  onChange={(e) => setSummarySearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[#110931]/60 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400 transition"
                />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            </div>

            {/* Balances scrollable bento-chips container */}
            {filteredSummary.length === 0 ? (
              <div className="border border-white/5 rounded-2xl bg-white/5 py-8 text-center text-slate-400 text-xs font-semibold">
                Belum ada mutasi stok terdata di rak ini / pencarian tidak cocok.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[195px] overflow-y-auto custom-scrollbar pr-1">
                {filteredSummary.map((item) => (
                  <div
                    key={item.sku}
                    onClick={() => {
                      setSku(item.sku);
                      triggerToast(`Dipilih SKU: ${item.sku}. Silakan input mutasi.`);
                    }}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group active:scale-95 ${
                      item.balance <= 0 
                        ? 'bg-rose-500/5 border-rose-500/20 hover:bg-rose-500/10' 
                        : item.balance <= 2 
                        ? 'bg-[#ea580c]/10 border-[#ea580c]/30 hover:bg-[#ea580c]/20'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    <span className="text-[10px] font-mono font-bold text-slate-400 truncate group-hover:text-indigo-300 transition-colors" title={item.sku}>
                      {item.sku}
                    </span>
                    <div className="flex items-baseline justify-between mt-2.5">
                      <span className="text-xs font-semibold text-slate-400 leading-none">Aset</span>
                      <span className={`text-base font-black font-mono leading-none ${
                        item.balance <= 0 ? 'text-rose-400' : item.balance <= 2 ? 'text-[#f97316]' : 'text-emerald-400'
                      }`}>
                        {item.balance}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Historical Ledger Logs Table */}
          <div className="bg-[#181140]/45 border border-white/15 rounded-[32px] p-6 shadow-xl backdrop-blur-xl flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">Historis Mutasi Keluar Masuk</h3>
                  <p className="text-[10px] text-slate-400 leading-none mt-0.5">Kelola riwayat mutasi rak secara ringkas</p>
                </div>
              </div>

              {/* History Search */}
              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  placeholder="Cari SKU, PIC, catatan logs..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-10 pr-10 py-2.5 bg-[#110931]/60 border border-white/10 rounded-2xl text-xs text-white focus:outline-none focus:border-indigo-400 transition"
                />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                {searchTerm && (
                  <button 
                    onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white bg-white/5 hover:bg-rose-500/80 rounded-full transition-all flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* List Table */}
            <div className="overflow-x-auto rounded-2xl border border-white/10 shadow-lg relative bg-[#110931]/40">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-white/10 bg-[#160e3a]/80 text-[#a89eff] font-black text-[10px] tracking-wider uppercase">
                    <th className="py-4 px-4.5 text-center">No</th>
                    <th className="py-4 px-4">Tanggal Info</th>
                    <th className="py-4 px-4">SKU Barang Bundling</th>
                    <th className="py-4 px-4 text-center">Tipe Alur</th>
                    <th className="py-4 px-4 text-center">Jumlah Qty</th>
                    <th className="py-4 px-4">PIC Admin</th>
                    <th className="py-4 px-4">Keterangan</th>
                    <th className="py-4 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                          Memproses sinkronisasi real-time...
                        </div>
                      </td>
                    </tr>
                  ) : paginatedLogs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-semibold">
                        Tidak ada log transaksi mutasi yang direkam.
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map((log, idx) => {
                      const rowNum = (currentPage - 1) * itemsPerPage + idx + 1;
                      return (
                        <tr key={log.id} className="hover:bg-white/5 transition-all">
                          <td className="py-3.5 px-4.5 text-center font-mono font-bold text-slate-400 max-w-[40px]">{rowNum}</td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-300">
                            {format(new Date(log.date), 'dd MMM yyyy')}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-white uppercase font-mono tracking-tight">{log.sku}</td>
                          <td className="py-1.5 px-4 text-center">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              log.type === 'MASUK' 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}>
                              {log.type === 'MASUK' ? 'MASUK (IN)' : 'KELUAR (OUT)'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center font-mono font-extrabold text-white text-sm">{log.quantity}</td>
                          <td className="py-3.5 px-4 font-bold text-indigo-200">
                            <div className="flex items-center gap-1.5">
                              <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
                              {log.pic}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 max-w-[200px] truncate text-slate-300 font-semibold italic" title={log.notes}>
                            {log.notes || '-'}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => handleDeleteLog(log)}
                              className="p-2 bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/15 text-rose-400 rounded-xl transition cursor-pointer"
                              title="Hapus log"
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
              <div className="flex items-center justify-between mt-5 px-1">
                <span className="text-[11px] text-slate-400 font-bold">
                  Menampilkan <span className="text-white">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-white">{Math.min(currentPage * itemsPerPage, filteredLogs.length)}</span> dari <span className="text-white">{filteredLogs.length}</span> rekam mutasi
                </span>
                
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-1 px-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl text-xs transition cursor-pointer disabled:opacity-30 flex items-center gap-1 font-bold"
                  >
                    <ChevronLeft className="w-4 h-4" /> Sebelum
                  </button>
                  <span className="text-xs font-black text-slate-300 font-mono">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-1 px-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl text-xs transition cursor-pointer disabled:opacity-30 flex items-center gap-1 font-bold"
                  >
                    Berikut <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* Delete Confirmation Modal using premium clean layout design */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmId(null)}
              className="absolute inset-0 bg-[#0c061c]/80 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="relative w-full max-w-md bg-[#181140]/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden text-center"
            >
              <div className="absolute top-0 left-0 w-full h-[3px] bg-rose-500" />
              
              <div className="mx-auto w-14 h-14 bg-rose-500/10 rounded-2xl flex items-center justify-center mb-4 border border-rose-500/20">
                <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              
              <h3 className="text-lg font-extrabold text-white mb-2">Konfirmasi Hapus</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-6">
                Apakah Anda yakin ingin menghapus log mutasi stok bundling untuk SKU <span className="font-bold text-white font-mono">{deleteConfirmId.sku}</span> sebesar <span className="font-bold text-white">{deleteConfirmId.quantity}</span> unit? Mutasi ini akan terhapus dari logistik admin.
              </p>
              
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 font-bold py-3 px-4 rounded-xl text-xs sm:text-sm transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-extrabold py-3 px-4 rounded-xl text-xs sm:text-sm transition shadow-lg shadow-rose-950/20 cursor-pointer flex items-center justify-center gap-2"
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
