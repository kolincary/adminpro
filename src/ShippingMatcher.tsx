import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileSpreadsheet, Search, RefreshCw, Layers, ArrowRightLeft, 
  CheckCircle2, AlertTriangle, HelpCircle, Clipboard, Trash2,
  Check, ArrowUpDown, ChevronLeft, ChevronRight, BarChart3, Database,
  ArrowUpRight, ArrowDownLeft, X, Package, ShieldCheck
} from 'lucide-react';
import XLSX from 'xlsx-js-style';
import { format } from 'date-fns';

export default function ShippingMatcher() {
  const [internalRawInput, setInternalRawInput] = useState('');
  const [courierRawInput, setCourierRawInput] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'MATCH' | 'INTERNAL_ONLY' | 'COURIER_ONLY'>('ALL');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Show dynamic brief toast inside component
  const triggerToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Pre-populate realistic tracking datasets for demonstration
  const handleLoadDemoDataset = () => {
    const rawInternalDemo = [
      'SPXID048924914022',
      'SPXID048924914023',
      'SPXID048924914024',
      'SPXID048924914025',
      'SPXID048924914026',
      'SPXID048924914027',
      'SPXID048924914028',
      'SPXID048924914029',
      'SPXID048924914030', // matched
      'JP812849102431',
      'JP812849102432',
      'JP812849102433', // matched
      'JP812849102434', // internal only (stuck in warehouse)
      'JP812849102435', // internal only
      'NL04918290124A',
      'NL04918290124B'
    ].join('\n');

    const rawCourierDemo = [
      'SPXID048924914022',
      'SPXID048924914023',
      'SPXID048924914024',
      'SPXID048924914025',
      'SPXID048924914026',
      'SPXID048924914027',
      'SPXID048924914028',
      'SPXID048924914029',
      'SPXID048924914030', // matched
      'JP812849102431',
      'JP812849102432',
      'JP812849102433', // matched
      'JP812849111999', // courier only scan discrepancy
      'JP812849111888', // courier only scan discrepancy
      'NL04918290124A',
      'NL04918290124B'
    ].join('\n');

    setInternalRawInput(rawInternalDemo);
    setCourierRawInput(rawCourierDemo);
    setCurrentPage(1);
    triggerToast('Dataset contoh berhasil di-load! Klik tombol scan/cocokkan.', 'info');
  };

  const handleClearInputs = () => {
    setInternalRawInput('');
    setCourierRawInput('');
    setCurrentPage(1);
    triggerToast('Seluruh input logs dibersihkan.');
  };

  // Extractor for parsed arrays
  const parseBarcodes = (rawText: string): string[] => {
    return rawText
      .split(/[\n,;]+/)
      .map(item => item.trim().toUpperCase())
      .filter(item => item.length > 0);
  };

  // Core diff comparison engine
  const matchedData = useMemo(() => {
    const internalList = parseBarcodes(internalRawInput);
    const courierList = parseBarcodes(courierRawInput);

    const internalSet = new Set(internalList);
    const courierSet = new Set(courierList);

    const allInvolvedBarcodes = Array.from(new Set([...internalList, ...courierList]));

    const computed = allInvolvedBarcodes.map(barcode => {
      const inInternal = internalSet.has(barcode);
      const inCourier = courierSet.has(barcode);

      let status: 'MATCH' | 'INTERNAL_ONLY' | 'COURIER_ONLY' = 'MATCH';
      if (inInternal && !inCourier) {
        status = 'INTERNAL_ONLY'; // Belum diserahkan / tidak discan ekspedisi
      } else if (!inInternal && inCourier) {
        status = 'COURIER_ONLY';  // Error: Discan kurir tapi tidak terdaftar internal
      }

      return {
        barcode,
        inInternal,
        inCourier,
        status
      };
    });

    return computed;
  }, [internalRawInput, courierRawInput]);

  // Statistics summaries
  const stats = useMemo(() => {
    const internalCount = parseBarcodes(internalRawInput).length;
    const courierCount = parseBarcodes(courierRawInput).length;
    const matchCount = matchedData.filter(item => item.status === 'MATCH').length;
    const internalOnlyCount = matchedData.filter(item => item.status === 'INTERNAL_ONLY').length;
    const courierOnlyCount = matchedData.filter(item => item.status === 'COURIER_ONLY').length;

    return {
      internalCount,
      courierCount,
      matchCount,
      internalOnlyCount,
      courierOnlyCount,
      matchPercentage: internalCount > 0 ? Math.round((matchCount / internalCount) * 100) : 0
    };
  }, [matchedData, internalRawInput, courierRawInput]);

  // Filter listings by query & status
  const filteredListings = useMemo(() => {
    return matchedData.filter(item => {
      const matchesSearch = item.barcode.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = selectedStatusFilter === 'ALL' || item.status === selectedStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [matchedData, searchQuery, selectedStatusFilter]);

  // Pagination compute
  const totalPages = Math.ceil(filteredListings.length / itemsPerPage);
  const paginatedListings = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredListings.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredListings, currentPage, itemsPerPage]);

  const handleExportExcel = () => {
    if (matchedData.length === 0) {
      triggerToast('Tidak ada data analisis pengiriman untuk diexport.', 'error');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Mismatched list (Internal tapi belum terscan kurir)
    const discrepancyData = matchedData
      .filter(item => item.status !== 'MATCH')
      .map((item, idx) => ({
        "NO": idx + 1,
        "NO RESI / BARCODE": item.barcode,
        "TANGGUNG JAWAB": item.status === 'INTERNAL_ONLY' ? 'PENYEDIA/INTERNAL SELLER' : 'EKSPEDISI/KURIR',
        "KETERANGAN": item.status === 'INTERNAL_ONLY' 
          ? 'Barang Sudah Dipacking (Scan Internal), Tapi Belum Di-Scan Kurir. Hubungi Ekspedisi!' 
          : 'Ganjil: Di-Scan Kurir Tapi Tidak Terdeteksi Log Internal Divisi Logistik.'
      }));

    const wsDiscrepancy = XLSX.utils.json_to_sheet(discrepancyData);

    // Full analysis sheets
    const fullAnalysisData = matchedData.map((item, idx) => ({
      "NO": idx + 1,
      "NO RESI": item.barcode,
      "SCAN SELLER INTERNAL": item.inInternal ? 'ADA' : 'TIDAK',
      "SCAN EKSPEDISI KURIR": item.inCourier ? 'ADA' : 'TIDAK',
      "STATUS VALIDATOR": item.status === 'MATCH' ? 'MATCH' : item.status
    }));
    const wsFull = XLSX.utils.json_to_sheet(fullAnalysisData);

    // Style helper
    const headStyle = {
      font: { name: 'Inter', bold: true, color: { rgb: 'FFFFFF' }, size: 10 },
      fill: { fgColor: { rgb: 'e11d48' } },
      alignment: { horizontal: 'center' }
    };

    ['A1', 'B1', 'C1', 'D1'].forEach(c => {
      if (wsDiscrepancy[c]) wsDiscrepancy[c].s = headStyle;
    });

    const headStyleFull = { ...headStyle, fill: { fgColor: { rgb: '312E81' } } };
    ['A1', 'B1', 'C1', 'D1', 'E1'].forEach(c => {
      if (wsFull[c]) wsFull[c].s = headStyleFull;
    });

    XLSX.utils.book_append_sheet(wb, wsDiscrepancy, "Laporan Selisih Pengiriman");
    XLSX.utils.book_append_sheet(wb, wsFull, "Analisis Penuh");

    XLSX.writeFile(wb, `Logistik_Match_Laporan_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    triggerToast('Laporan selisih scan logistik berhasil diexport ke Excel!');
  };

  return (
    <div className="flex-1 w-full max-w-none mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 relative z-10">
      
      {/* Dynamic Toast Alert inside panel */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className={`fixed top-6 left-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl font-black text-xs tracking-wider uppercase border flex items-center gap-2 ${
              toastMessage.type === 'error' 
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' 
                : toastMessage.type === 'info'
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-400/40'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {toastMessage.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Title Header Block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/5 border border-white/10 p-6 sm:p-8 rounded-[30px] backdrop-blur-2xl relative overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-indigo-500/10 opacity-30 pointer-events-none" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 bg-indigo-500/20 rounded-2xl flex items-center justify-center border border-indigo-500/30 shadow-lg shadow-indigo-950/25">
            <ArrowRightLeft className="w-7 h-7 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-white leading-none tracking-tight">Pencocok Pengiriman Logistik</h2>
              <span className="hidden sm:inline-flex bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border border-indigo-500/30">Logistic Scanner Link</span>
            </div>
            <p className="text-slate-400 text-xs sm:text-sm mt-1.5 max-w-3xl leading-relaxed">
              Mengecek silang (cross-match) data barcode yang discan oleh divisi logistik internal seller (saat bungkus barang) dengan log scan fisik yang diterbitkan ekspedisi/kurir saat pick-up. Mendeteksi barang tertinggal dan selisih resi dalam hitungan detik.
            </p>
          </div>
        </div>
        <button
          onClick={handleExportExcel}
          className="h-11 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-2xl tracking-wider text-xs uppercase cursor-pointer transition-all flex items-center justify-center gap-2 relative z-10 shadow-lg shadow-emerald-950/40 active:scale-95 border border-emerald-400/20 group hover:border-emerald-400/40"
        >
          <FileSpreadsheet className="w-4 h-4 transition-transform group-hover:scale-110" />
          Export Koreksi Excel
        </button>
      </div>

      {/* KPI Cards bento design block */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-[#181140]/40 backdrop-blur-md border border-white/10 rounded-2xl p-4.5 shadow-xl flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <ArrowUpRight className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block truncate">Total Internal</span>
            <p className="text-lg font-black text-white tracking-tight mt-0.5">{stats.internalCount}</p>
          </div>
        </div>

        <div className="bg-[#181140]/40 backdrop-blur-md border border-white/10 rounded-2xl p-4.5 shadow-xl flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block truncate">Total Kurir</span>
            <p className="text-lg font-black text-white tracking-tight mt-0.5">{stats.courierCount}</p>
          </div>
        </div>

        <div className="bg-[#181140]/40 backdrop-blur-md border border-white/10 rounded-2xl p-4.5 shadow-xl flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block truncate">Sesuai / Match</span>
            <p className="text-lg font-black text-emerald-400 tracking-tight mt-0.5">{stats.matchCount}</p>
          </div>
        </div>

        <div className="bg-[#181140]/40 backdrop-blur-md border border-rose-500/20 rounded-2xl p-4.5 shadow-xl flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-rose-500/15 border border-rose-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-[#f43f5e] block truncate">Tertinggal (Internal Only)</span>
            <p className="text-lg font-black text-rose-400 tracking-tight mt-0.5">{stats.internalOnlyCount}</p>
          </div>
        </div>

        <div className="bg-[#181140]/40 backdrop-blur-md border border-amber-500/20 rounded-2xl p-4.5 shadow-xl flex items-center gap-3.5 col-span-2 md:col-span-1">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-[#f59e0b] block truncate">Ganjil (Courier Only)</span>
            <p className="text-lg font-black text-amber-400 tracking-tight mt-0.5">{stats.courierOnlyCount}</p>
          </div>
        </div>
      </div>

      {/* Main comparative engine columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left column: raw paste textareas */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#181140]/45 border border-white/11 rounded-[32px] p-6 relative overflow-hidden shadow-xl backdrop-blur-xl">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-emerald-500 via-indigo-500 to-rose-500" />
            
            <div className="flex flex-row items-center justify-between mb-5">
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Input Logs Pengiriman</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadDemoDataset}
                  className="px-2.5 py-1 bg-indigo-500/20 border border-indigo-400/25 hover:border-indigo-400/50 text-[10px] font-black text-indigo-300 rounded-lg uppercase tracking-wider transition cursor-pointer"
                >
                  Contoh Demo
                </button>
                <button
                  type="button"
                  onClick={handleClearInputs}
                  className="p-1 text-slate-500 hover:text-white transition cursor-pointer"
                  title="Clear inputs"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              
              {/* Internal Logs Barcodes Textarea input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                    1. Log Scan Divisi Logistik (Internal Seller)
                  </label>
                  <span className="text-[10px] font-mono font-bold text-indigo-300">
                    {parseBarcodes(internalRawInput).length} Resi
                  </span>
                </div>
                <div className="relative">
                  <textarea
                    placeholder="Whip out scanner, scan resi di sini / atau copy paste log resi baris per baris..."
                    value={internalRawInput}
                    onChange={(e) => {
                      setInternalRawInput(e.target.value);
                      setCurrentPage(1);
                    }}
                    rows={6}
                    className="w-full p-4 bg-[#110931]/70 border border-white/10 rounded-2xl text-white font-mono text-xs focus:outline-none focus:border-indigo-400 transition resize-none custom-scrollbar"
                  />
                  <Clipboard className="absolute right-4.5 bottom-4.5 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
                <p className="text-[10px] text-slate-400 leading-normal italic">
                  * Tips: Scanner Logistik memancarkan data secara linear. Cukup letakkan kursor dalam box di atas, lalu scan berkali-kali.
                </p>
              </div>

              {/* Courier Logs Barcodes Textarea input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                    2. Log Manifest Kurir (Ekspedisi Scan)
                  </label>
                  <span className="text-[10px] font-mono font-bold text-emerald-400">
                    {parseBarcodes(courierRawInput).length} Resi
                  </span>
                </div>
                <div className="relative">
                  <textarea
                    placeholder="Copy paste list nomor resi pengiriman yang discan/diambil oleh kurir ekspedisi..."
                    value={courierRawInput}
                    onChange={(e) => {
                      setCourierRawInput(e.target.value);
                      setCurrentPage(1);
                    }}
                    rows={6}
                    className="w-full p-4 bg-[#110931]/70 border border-white/10 rounded-2xl text-white font-mono text-xs focus:outline-none focus:border-emerald-400 transition resize-none custom-scrollbar"
                  />
                  <Clipboard className="absolute right-4.5 bottom-4.5 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* Right column: live matching list and discrepancies highlights */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-[#181140]/45 border border-white/11 rounded-[32px] p-6 shadow-xl backdrop-blur-xl flex-1 flex flex-col">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">Hasil Koreksi Logistik</h3>
                  <p className="text-[10px] text-slate-400 leading-none mt-0.5">Live comparisons of scanned packages</p>
                </div>
              </div>

              {/* Search results */}
              <div className="relative w-full sm:w-56">
                <input
                  type="text"
                  placeholder="Cari Nomor Resi..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-4 py-2 bg-[#110931]/60 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400 transition"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            </div>

            {/* Filter category state Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-[#110931]/50 border border-white/10 rounded-2xl mb-4.5 text-center">
              {[
                { id: 'ALL', label: 'Semua' },
                { id: 'MATCH', label: 'Match' },
                { id: 'INTERNAL_ONLY', label: 'Belum Kirim' },
                { id: 'COURIER_ONLY', label: 'Ganjil / Dispute' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setSelectedStatusFilter(tab.id as any);
                    setCurrentPage(1);
                  }}
                  className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition cursor-pointer ${selectedStatusFilter === tab.id ? 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Listings table diff list */}
            <div className="overflow-x-auto rounded-2xl border border-white/10 shadow-lg relative bg-[#110931]/40 flex-1 min-h-[300px]">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b border-white/10 bg-[#160e3a]/80 text-[#a89eff] font-black text-[10px] tracking-wider uppercase">
                    <th className="py-3 px-4.5 text-center">No</th>
                    <th className="py-3 px-4">Nomor Resi / Barcode</th>
                    <th className="py-3 px-4 text-center">Scan Seller</th>
                    <th className="py-3 px-4 text-center">Scan Kurir</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200 text-xs">
                  {paginatedListings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 font-semibold">
                        Masukkan list scan resi logistik di sebelah kiri untuk menampilkan analisis pembandingan.
                      </td>
                    </tr>
                  ) : (
                    paginatedListings.map((item, idx) => {
                      const rowNum = (currentPage - 1) * itemsPerPage + idx + 1;
                      return (
                        <tr key={item.barcode} className="hover:bg-white/5 transition-all">
                          <td className="py-3.5 px-4.5 text-center font-mono font-bold text-slate-400 max-w-[40px]">{rowNum}</td>
                          <td className="py-3.5 px-4 font-mono font-bold text-white uppercase tracking-tight">{item.barcode}</td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded font-mono font-black text-[9px] ${item.inInternal ? 'bg-indigo-500/20 text-indigo-300' : 'bg-transparent text-slate-600'}`}>
                              {item.inInternal ? 'SCANNED' : 'UNSCANNED'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded font-mono font-black text-[9px] ${item.inCourier ? 'bg-emerald-500/20 text-emerald-400' : 'bg-transparent text-slate-600'}`}>
                              {item.inCourier ? 'SCANNED' : 'UNSCANNED'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {item.status === 'MATCH' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-extrabold text-[9px] bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" /> MATCH
                              </span>
                            ) : item.status === 'INTERNAL_ONLY' ? (
                              <span className="inline-flex items-center gap-1 text-rose-400 font-extrabold text-[9px] bg-rose-500/10 border border-rose-500/20 px-2 a.5 py-0.5 rounded-full" title="Packed & scanned but expedistion has not picked up">
                                <AlertTriangle className="w-3 h-3 animate-pulse" /> TERTINGGAL (INTERNAL)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-400 font-extrabold text-[9px] bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full" title="Courier scanned but seller never registered scan">
                                <HelpCircle className="w-3 h-3" /> GANJIL (KURIR ONLY)
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination block */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-5 px-1">
                <span className="text-[10px] text-slate-400 font-bold">
                  Menampilkan <span className="text-white">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-white">{Math.min(currentPage * itemsPerPage, filteredListings.length)}</span> dari <span className="text-white">{filteredListings.length}</span> entries
                </span>
                
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-1 px-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl text-[11px] transition cursor-pointer disabled:opacity-30 flex items-center gap-1 font-bold"
                  >
                    <ChevronLeft className="w-4 h-4" /> Sebelum
                  </button>
                  <span className="text-xs font-black text-slate-300 font-mono">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-1 px-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl text-[11px] transition cursor-pointer disabled:opacity-30 flex items-center gap-1 font-bold"
                  >
                    Berikut <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>

    </div>
  );
}
