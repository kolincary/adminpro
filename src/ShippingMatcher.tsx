import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileSpreadsheet, Search, RefreshCw, Layers, ArrowRightLeft, 
  CheckCircle2, AlertTriangle, HelpCircle, Clipboard, Trash2,
  Check, ArrowUpDown, ChevronLeft, ChevronRight, BarChart3, Database,
  ArrowUpRight, ArrowDownLeft, X, Package, ShieldCheck, Sparkles
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
    <div className="flex-1 w-full max-w-none mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Dynamic Toast Alert inside panel */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className={`fixed top-6 left-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl font-black text-xs tracking-wider uppercase border flex items-center gap-2 backdrop-blur-xl ${
              toastMessage.type === 'error' 
                ? 'bg-rose-950/90 text-rose-300 border-rose-500/40 shadow-rose-950/50' 
                : toastMessage.type === 'info'
                ? 'bg-purple-950/90 text-purple-300 border-purple-400/40 shadow-purple-950/50'
                : 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40 shadow-emerald-950/50'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {toastMessage.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Title Header Card */}
      <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-6 sm:p-8 backdrop-blur-md relative overflow-hidden shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="flex items-center gap-5 relative z-10">
          <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center border border-purple-400/30 shadow-xl shadow-purple-950/40 shrink-0">
            <ArrowRightLeft className="w-7 h-7 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Pencocok Pengiriman Logistik</h2>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/15 text-purple-300 border border-purple-500/30">
                <Sparkles className="w-3 h-3 text-purple-400" />
                Logistic Scanner Link
              </span>
            </div>
            <p className="text-purple-300/60 text-xs sm:text-sm font-semibold mt-1 max-w-3xl leading-relaxed">
              Mengecek silang (cross-match) data barcode yang discan oleh divisi logistik internal seller (saat bungkus barang) dengan log scan fisik ekspedisi/kurir saat pick-up.
            </p>
          </div>
        </div>
        <button
          onClick={handleExportExcel}
          className="h-11 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl tracking-wider text-xs uppercase cursor-pointer transition-all flex items-center justify-center gap-2 relative z-10 shadow-xl shadow-emerald-950/40 active:scale-95 border border-emerald-400/20 group"
        >
          <FileSpreadsheet className="w-4 h-4 transition-transform group-hover:scale-110" />
          Export Koreksi Excel
        </button>
      </div>

      {/* KPI Cards Bento Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-[#130b2e]/90 backdrop-blur-md border border-purple-900/30 rounded-2xl p-4.5 shadow-xl flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <ArrowUpRight className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-purple-300/60 block truncate">Total Internal</span>
            <p className="text-xl font-black text-white tracking-tight mt-0.5">{stats.internalCount}</p>
          </div>
        </div>

        <div className="bg-[#130b2e]/90 backdrop-blur-md border border-purple-900/30 rounded-2xl p-4.5 shadow-xl flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0">
            <ArrowDownLeft className="w-5 h-5 text-purple-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-purple-300/60 block truncate">Total Kurir</span>
            <p className="text-xl font-black text-white tracking-tight mt-0.5">{stats.courierCount}</p>
          </div>
        </div>

        <div className="bg-[#130b2e]/90 backdrop-blur-md border border-purple-900/30 rounded-2xl p-4.5 shadow-xl flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-purple-300/60 block truncate">Sesuai / Match</span>
            <p className="text-xl font-black text-emerald-400 tracking-tight mt-0.5">{stats.matchCount}</p>
          </div>
        </div>

        <div className="bg-[#130b2e]/90 backdrop-blur-md border border-rose-500/20 rounded-2xl p-4.5 shadow-xl flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-rose-300/70 block truncate">Tertinggal (Internal)</span>
            <p className="text-xl font-black text-rose-400 tracking-tight mt-0.5">{stats.internalOnlyCount}</p>
          </div>
        </div>

        <div className="bg-[#130b2e]/90 backdrop-blur-md border border-amber-500/20 rounded-2xl p-4.5 shadow-xl flex items-center gap-3.5 col-span-2 md:col-span-1">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-300/70 block truncate">Ganjil (Kurir Only)</span>
            <p className="text-xl font-black text-amber-400 tracking-tight mt-0.5">{stats.courierOnlyCount}</p>
          </div>
        </div>
      </div>

      {/* Main Comparative Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left column: raw paste textareas */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-6 relative overflow-hidden shadow-xl backdrop-blur-md">
            
            <div className="flex flex-row items-center justify-between mb-5">
              <span className="text-[10px] font-black text-purple-300 uppercase tracking-widest">Input Logs Pengiriman</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadDemoDataset}
                  className="px-3 py-1 bg-purple-500/15 border border-purple-500/30 hover:border-purple-500/50 text-[10px] font-black text-purple-300 rounded-lg uppercase tracking-wider transition cursor-pointer"
                >
                  Contoh Demo
                </button>
                <button
                  type="button"
                  onClick={handleClearInputs}
                  className="p-1 text-purple-400/60 hover:text-rose-400 transition cursor-pointer"
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
                  <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest">
                    1. Log Scan Divisi Logistik (Internal Seller)
                  </label>
                  <span className="text-[10px] font-mono font-black text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-0.5 rounded-full">
                    {parseBarcodes(internalRawInput).length} Resi
                  </span>
                </div>
                <div className="relative">
                  <textarea
                    placeholder="Scan resi di sini / atau copy paste log resi baris per baris..."
                    value={internalRawInput}
                    onChange={(e) => {
                      setInternalRawInput(e.target.value);
                      setCurrentPage(1);
                    }}
                    rows={6}
                    className="w-full p-4 bg-[#0c0620] border border-purple-900/40 rounded-xl text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 transition resize-none custom-scrollbar placeholder-purple-400/30"
                  />
                  <Clipboard className="absolute right-4 bottom-4 w-4 h-4 text-purple-500/40 pointer-events-none" />
                </div>
                <p className="text-[10px] text-purple-300/50 leading-normal italic font-medium">
                  * Tips: Letakkan kursor dalam kotak di atas, lalu scan berkali-kali menggunakan barcode scanner.
                </p>
              </div>

              {/* Courier Logs Barcodes Textarea input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest">
                    2. Log Manifest Kurir (Ekspedisi Scan)
                  </label>
                  <span className="text-[10px] font-mono font-black text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
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
                    className="w-full p-4 bg-[#0c0620] border border-purple-900/40 rounded-xl text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 transition resize-none custom-scrollbar placeholder-purple-400/30"
                  />
                  <Clipboard className="absolute right-4 bottom-4 w-4 h-4 text-purple-500/40 pointer-events-none" />
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* Right column: live matching list and discrepancies highlights */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-6 shadow-xl backdrop-blur-md flex-1 flex flex-col">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-purple-300" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base tracking-tight">Hasil Koreksi Logistik</h3>
                  <p className="text-[10px] text-purple-300/60 uppercase tracking-widest font-semibold mt-0.5">Live comparisons of scanned packages</p>
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
                  className="w-full pl-9 pr-4 py-2 bg-[#0c0620] border border-purple-900/40 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition placeholder-purple-400/30 font-semibold"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400/60" />
              </div>
            </div>

            {/* Filter category state Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-[#0c0620] border border-purple-900/40 rounded-xl mb-4.5 text-center">
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
                  className={`py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition cursor-pointer ${
                    selectedStatusFilter === tab.id 
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-950/40' 
                      : 'text-purple-300/60 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Listings table diff list */}
            <div className="overflow-x-auto rounded-xl border border-purple-900/30 relative bg-[#0c0620]/60 flex-1 min-h-[300px] custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b border-purple-900/40 bg-[#0c0620] text-purple-300 font-black text-[10px] tracking-wider uppercase">
                    <th className="py-3 px-4 text-center">No</th>
                    <th className="py-3 px-4">Nomor Resi / Barcode</th>
                    <th className="py-3 px-4 text-center">Scan Seller</th>
                    <th className="py-3 px-4 text-center">Scan Kurir</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-900/20 text-slate-200 text-xs">
                  {paginatedListings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-16 text-center text-purple-300/40 font-black text-xs uppercase tracking-widest">
                        Masukkan list scan resi logistik di sebelah kiri untuk menampilkan analisis pembandingan.
                      </td>
                    </tr>
                  ) : (
                    paginatedListings.map((item, idx) => {
                      const rowNum = (currentPage - 1) * itemsPerPage + idx + 1;
                      return (
                        <tr key={item.barcode} className="hover:bg-purple-500/10 transition-all">
                          <td className="py-3 px-4 text-center font-mono font-bold text-purple-400/60 max-w-[40px]">{rowNum}</td>
                          <td className="py-3 px-4 font-mono font-bold text-purple-100 uppercase tracking-tight">{item.barcode}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full font-mono font-black text-[9px] ${item.inInternal ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-transparent text-purple-500/30'}`}>
                              {item.inInternal ? 'SCANNED' : 'UNSCANNED'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full font-mono font-black text-[9px] ${item.inCourier ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-transparent text-purple-500/30'}`}>
                              {item.inCourier ? 'SCANNED' : 'UNSCANNED'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {item.status === 'MATCH' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-300 font-black text-[9px] bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> MATCH
                              </span>
                            ) : item.status === 'INTERNAL_ONLY' ? (
                              <span className="inline-flex items-center gap-1 text-rose-300 font-black text-[9px] bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 rounded-full">
                                <AlertTriangle className="w-3 h-3 text-rose-400 animate-pulse" /> TERTINGGAL (INTERNAL)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-300 font-black text-[9px] bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                                <HelpCircle className="w-3 h-3 text-amber-400" /> GANJIL (KURIR ONLY)
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
                <span className="text-[10px] text-purple-300/60 font-bold">
                  Menampilkan <span className="text-white">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-white">{Math.min(currentPage * itemsPerPage, filteredListings.length)}</span> dari <span className="text-white">{filteredListings.length}</span> entries
                </span>
                
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-1 px-3 bg-[#0c0620] border border-purple-900/40 hover:bg-purple-950/40 text-purple-200 rounded-xl text-[11px] transition cursor-pointer disabled:opacity-30 flex items-center gap-1 font-bold"
                  >
                    <ChevronLeft className="w-4 h-4" /> Sebelum
                  </button>
                  <span className="text-xs font-black text-purple-300 font-mono">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-1 px-3 bg-[#0c0620] border border-purple-900/40 hover:bg-purple-950/40 text-purple-200 rounded-xl text-[11px] transition cursor-pointer disabled:opacity-30 flex items-center gap-1 font-bold"
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
