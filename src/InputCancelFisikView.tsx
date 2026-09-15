import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { saveReportDual } from './services/dualStorage';
import ReportForm from './ReportForm';
import ReportTable from './ReportTable';
import { Report, UserProfile } from './types';
import { Layers, PlusCircle, Table, FileSpreadsheet, Upload, Download, X, Check, AlertCircle, Loader2, Sparkles, RefreshCw, Trash2 } from 'lucide-react';
import { normalizeDate } from './utils';

interface InputCancelFisikViewProps {
  allReports: Report[];
  currentUser: any;
  userProfile: UserProfile | null;
  globalDateFilter: string;
  setGlobalDateFilter: (val: string) => void;
  loading: boolean;
}

export default function InputCancelFisikView({
  allReports,
  currentUser,
  userProfile,
  globalDateFilter,
  setGlobalDateFilter,
  loading
}: InputCancelFisikViewProps) {
  const [activeTab, setActiveTab] = useState<'cancel_data' | 'stok_lt3'>('stok_lt3');

  // DevMode Unlock State
  const [isDevModeUnlocked, setIsDevModeUnlocked] = useState(false);
  const [devToast, setDevToast] = useState<string | null>(null);
  const keyBufferRef = useRef<string>('');

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Keyboard Listener untuk mengetik "devmode" (Toggle ON / Toggle OFF)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Abaikan jika mengetik di input / textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      keyBufferRef.current += e.key.toLowerCase();
      if (keyBufferRef.current.length > 20) {
        keyBufferRef.current = keyBufferRef.current.slice(-20);
      }

      if (keyBufferRef.current.includes('devmode')) {
        setIsDevModeUnlocked(prev => {
          const nextState = !prev;
          setDevToast(nextState ? '🔓 DEV MODE UNLOCKED: Tombol Import & Ekspor Original Aktif!' : '🔒 DEV MODE LOCKED: Tombol DevMode Ditutup');
          setTimeout(() => setDevToast(null), 4000);
          return nextState;
        });
        keyBufferRef.current = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Download Template Excel
  const handleDownloadTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      const templateData = [
        {
          'Tanggal Log': new Date().toISOString().split('T')[0],
          'Tgl Input Ginee': new Date().toISOString().split('T')[0],
          'PIC Input Ginee': 'Analis1',
          'Marketplace': 'Shopee',
          'Analis (PIC)': 'Analis1',
          'Modul Fisik': 'Cancel Fisik',
          'Referensi Invoice': 'INV/2026/001',
          'Lokasi / Rak': 'A-01-02',
          'SKU / Barcode': 'BRG-88912',
          'Nama Produk': 'Sample Barang Cancel A',
          'Status Aset': 'Cancel Fisik',
          'QTY': 1,
          'Keterangan': 'Barang retur cancel fisik'
        },
        {
          'Tanggal Log': new Date().toISOString().split('T')[0],
          'Tgl Input Ginee': new Date().toISOString().split('T')[0],
          'PIC Input Ginee': 'Analis2',
          'Marketplace': 'Tokopedia',
          'Analis (PIC)': 'Analis2',
          'Modul Fisik': 'Cancel Fisik',
          'Referensi Invoice': 'INV/2026/002',
          'Lokasi / Rak': 'B-03-01',
          'SKU / Barcode': 'BRG-88913',
          'Nama Produk': 'Sample Barang Cancel B',
          'Status Aset': 'Cancel Fisik',
          'QTY': 2,
          'Keterangan': 'Sample data import'
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(templateData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Cancel Fisik');
      XLSX.writeFile(workbook, 'Template_Input_Cancel_Fisik.xlsx');
    } catch (err: any) {
      alert('Gagal mendownload template: ' + err.message);
    }
  };

  // Function Ekspor Original sesuai susunan kolom yang diminta user
  const handleExportOriginal = async () => {
    try {
      const XLSX = await import('xlsx');
      const cancelReports = allReports.filter((r: any) => {
        const st = (r.status || '').toLowerCase().trim();
        const ast = (r.assetStatus || r.status_aset || '').toLowerCase().trim();
        const mf = (r.modul_fisik || '').toLowerCase().trim();
        const norm = (r.normalizedStatus || '').toLowerCase().trim();

        // Eksklusi total jika merupakan retur, rusak, atau bundling
        if (st === 'retur fisik' || ast === 'retur fisik' || mf === 'retur fisik' || norm === 'retur fisik') return false;
        if (st.includes('rusak') || ast.includes('rusak') || mf.includes('rusak') || norm.includes('rusak')) return false;
        if (st.includes('bundling') || ast.includes('bundling') || mf.includes('bundling') || norm.includes('bundling')) return false;

        return (
          st === 'cancel fisik' ||
          ast === 'cancel fisik' ||
          mf === 'cancel fisik' ||
          norm === 'cancel fisik' ||
          st.includes('cancel') ||
          ast.includes('cancel') ||
          mf.includes('cancel') ||
          norm.includes('cancel') ||
          (r.items && r.items.some((i: any) => (i.status || '').toLowerCase().includes('cancel')))
        );
      });

      const exportRows: any[] = [];

      cancelReports.forEach((rep: any) => {
        if (rep.items && rep.items.length > 0) {
          rep.items.forEach((item: any) => {
            exportRows.push({
              'Tanggal Log': rep.inputDate || rep.log_date || (rep.createdAt ? String(rep.createdAt) : ''),
              'Tgl Input Ginee': rep.gineeInputDate || rep.ginee_date || '',
              'PIC Input Ginee': rep.picGinee || rep.pic_ginee || rep.createdBy || '',
              'Marketplace': rep.marketplace || '',
              'Analis (PIC)': rep.createdBy || rep.analis || '',
              'Modul Fisik': 'Cancel Fisik',
              'Referensi Invoice': rep.invoiceNumber || rep.invoice_ref || rep.invoice || '',
              'Lokasi / Rak': item.location || rep.location || '',
              'SKU / Barcode': item.sku || item.barcode || rep.sku || '',
              'Nama Produk': item.productName || item.product_name || item.name || rep.itemDescription || '',
              'Status Aset': item.assetStatus || item.status || rep.assetStatus || rep.status || 'Cancel Fisik',
              'QTY': item.quantity || rep.quantity || 1,
              'Keterangan': item.itemDescription || item.notes || rep.itemDescription || rep.notes || ''
            });
          });
        } else {
          exportRows.push({
            'Tanggal Log': rep.inputDate || rep.log_date || (rep.createdAt ? String(rep.createdAt) : ''),
            'Tgl Input Ginee': rep.gineeInputDate || rep.ginee_date || '',
            'PIC Input Ginee': rep.picGinee || rep.pic_ginee || rep.createdBy || '',
            'Marketplace': rep.marketplace || '',
            'Analis (PIC)': rep.createdBy || rep.analis || '',
            'Modul Fisik': 'Cancel Fisik',
            'Referensi Invoice': rep.invoiceNumber || rep.invoice_ref || rep.invoice || '',
            'Lokasi / Rak': rep.location || '',
            'SKU / Barcode': rep.sku || '',
            'Nama Produk': rep.itemDescription || rep.product_name || '',
            'Status Aset': rep.assetStatus || rep.status || 'Cancel Fisik',
            'QTY': rep.quantity || 1,
            'Keterangan': rep.itemDescription || rep.notes || ''
          });
        }
      });

      const worksheet = XLSX.utils.json_to_sheet(exportRows.length > 0 ? exportRows : [
        {
          'Tanggal Log': new Date().toISOString().split('T')[0],
          'Tgl Input Ginee': new Date().toISOString().split('T')[0],
          'PIC Input Ginee': '-',
          'Marketplace': '-',
          'Analis (PIC)': '-',
          'Modul Fisik': 'Cancel Fisik',
          'Referensi Invoice': '-',
          'Lokasi / Rak': '-',
          'SKU / Barcode': '-',
          'Nama Produk': '-',
          'Status Aset': 'Cancel Fisik',
          'QTY': 0,
          'Keterangan': 'Tidak ada data'
        }
      ]);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Cancel Fisik Original');
      XLSX.writeFile(workbook, `Ekspor_Original_Cancel_Fisik_${new Date().toISOString().split('T')[0]}.xlsx`);

      setDevToast(`📊 Berhasil mengeskpor ${exportRows.length} data Cancel Fisik!`);
      setTimeout(() => setDevToast(null), 4000);
    } catch (err: any) {
      alert("Gagal melakukan Ekspor Original: " + err.message);
    }
  };

  // Process File Excel / CSV
  const processExcelFile = async (file: File) => {
    setExcelFile(file);
    setImportStatus(null);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const json: any[] = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

          if (json.length === 0) {
            setImportStatus('File Excel kosong atau format tidak sesuai.');
            setParsedData([]);
          } else {
            setParsedData(json);
          }
        } catch (err: any) {
          setImportStatus('Gagal membaca file: ' + err.message);
        }
      };
      reader.readAsBinaryString(file);
    } catch (err: any) {
      setImportStatus('Error: ' + err.message);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processExcelFile(file);
  };

  // Helper fleksibel untuk mengekstrak nilai kolom CSV/Excel tanpa masalah kasus/spasi/garis bawah
  const getRowVal = (row: any, keys: string[]): string => {
    if (!row || typeof row !== 'object') return '';
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
        return String(row[k]).trim();
      }
    }
    const rowKeys = Object.keys(row);
    for (const targetKey of keys) {
      const targetClean = targetKey.toLowerCase().replace(/[^a-z0-9]/g, '');
      const foundKey = rowKeys.find(rk => rk.toLowerCase().replace(/[^a-z0-9]/g, '') === targetClean);
      if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
        return String(row[foundKey]).trim();
      }
    }
    return '';
  };

  // Submit Import to Firestore
  const handleExecuteImport = async () => {
    if (parsedData.length === 0) return;
    setIsImporting(true);
    setImportStatus(null);

    try {
      let successCount = 0;
      for (const row of parsedData) {
        const rawDate = getRowVal(row, ['tanggal_log', 'tanggal log', 'log_date', 'inputdate', 'input_date', 'timestamp', 'tanggal', 'date']) || new Date().toISOString().split('T')[0];
        const logDate = normalizeDate(rawDate);

        const rawGineeDate = getRowVal(row, ['tgl_input_ginee', 'tgl input ginee', 'sinkron ginee', 'ginee_date']);
        const gineeDate = rawGineeDate ? normalizeDate(rawGineeDate) : null;

        const inv = getRowVal(row, ['referensi_invoice', 'referensi invoice', 'referensi/no pesanan/invoice', 'invoice', 'invoice_ref', 'inv / pemesanan', 'inv']);
        const sku = getRowVal(row, ['sku', 'sku_id', 'sku / barcode', 'barcode', 'item_code']);
        const qty = Number(getRowVal(row, ['qty', 'quantity', 'jumlah'])) || 1;
        const pic = getRowVal(row, ['analis_pic', 'analis (pic)', 'analis', 'pic_input_ginee', 'pic input ginee', 'pic ginee', 'pic']) || currentUser?.email || 'DevMode User';
        const mp = getRowVal(row, ['marketplace', 'pasar']) || 'Shopee';
        const desc = getRowVal(row, ['product_name', 'nama produk', 'keterangan barang', 'status/keterangan', 'keterangan', 'notes', 'itemdescription']) || '';
        const loc = getRowVal(row, ['location_rak', 'lokasi / rak', 'lokasi', 'rak', 'location']) || '';

        const firestorePayload = {
          inputDate: logDate,
          gineeInputDate: gineeDate || '',
          picGinee: pic,
          marketplace: mp,
          invoiceNumber: inv,
          status: 'Cancel Fisik',
          normalizedStatus: 'Cancel Fisik',
          assetStatus: 'Cancel Fisik',
          modul_fisik: 'Cancel Fisik',
          sku: sku,
          sku_id: sku,
          quantity: qty,
          itemDescription: desc,
          location: loc,
          category: 'retur2',
          createdBy: currentUser?.uid || 'DevMode User',
          createdAt: serverTimestamp(),
          created_at: serverTimestamp()
        };

        try {
          await saveReportDual(firestorePayload);
          successCount++;
        } catch (eFs) {
          console.warn("Dual save import error:", eFs);
        }
      }

      setDevToast(`✅ Sukses mengimport ${successCount} data Cancel Fisik ke Firestore!`);
      setTimeout(() => setDevToast(null), 5000);
      setIsImportModalOpen(false);
      setParsedData([]);
      setExcelFile(null);

      if (parsedData.length > 0) {
        const firstRawDate = getRowVal(parsedData[0], ['tanggal_log', 'tanggal log', 'log_date', 'inputdate', 'timestamp', 'date']);
        if (firstRawDate) setGlobalDateFilter(normalizeDate(firstRawDate));
      }
    } catch (err: any) {
      setImportStatus('Gagal import ke Firestore: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="w-full space-y-6 relative">
      {/* Toast Notification DevMode */}
      {devToast && (
        <div className="fixed top-5 right-5 z-[999999] bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-5 py-3 rounded-2xl shadow-2xl border border-emerald-400/30 flex items-center gap-3 animate-in slide-in-from-top-5 duration-300">
          <Sparkles className="w-5 h-5 text-amber-300 animate-spin" />
          <span className="font-bold text-xs sm:text-sm">{devToast}</span>
        </div>
      )}

      {/* Top Header Card with 2 Sub-Tabs & DevMode Buttons */}
      <div className="bg-[#120a32]/60 backdrop-blur-xl border border-white/10 p-5 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Layers className="w-5 h-5" />
            </span>
            Input Cancel Fisik
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Modul Gabungan Kumpulan Data Cancel Fisik & Form Input Stok Lantai 3
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {/* Tombol DevMode: Import Excel */}
          {isDevModeUnlocked && (
            <div className="flex flex-wrap items-center gap-2 bg-[#1a0f44] p-1.5 rounded-2xl border border-indigo-500/30 shadow-lg">
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-md border border-emerald-400/30 transition-all cursor-pointer animate-pulse"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Import Excel (DevMode)</span>
              </button>
            </div>
          )}

          {/* 2-Tab Selector */}
          <div className="flex items-center bg-black/40 p-1.5 rounded-2xl border border-white/10 w-full md:w-auto">
            <button
              onClick={() => setActiveTab('cancel_data')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                activeTab === 'cancel_data'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25 border border-indigo-400/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>Kumpulan Data Cancel Fisik</span>
            </button>

            <button
              onClick={() => setActiveTab('stok_lt3')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                activeTab === 'stok_lt3'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25 border border-indigo-400/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>Input Stok Cancel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab Contents */}
      {activeTab === 'cancel_data' && (
        <div className="animate-in fade-in duration-300">
          <ReportTable
            reports={allReports}
            statusFilter="Cancel Fisik"
            user={currentUser}
            userProfile={userProfile}
            forcePhysicalLayout={true}
            globalDateFilter={globalDateFilter}
            setGlobalDateFilter={setGlobalDateFilter}
            loading={loading}
          />
        </div>
      )}

      {activeTab === 'stok_lt3' && (
        <div className="animate-in fade-in duration-300">
          <ReportForm category="retur2" isCancelFisikOnly={true} user={currentUser} />
        </div>
      )}

      {/* MODAL IMPORT EXCEL (DEV MODE) - Render via Portal at document.body level */}
      {isImportModalOpen && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 w-screen h-screen">
          <div className="bg-[#120a32] border border-white/20 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] relative z-[100000]">
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#1a0f44]">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    Import Excel Data Cancel Fisik
                    <span className="px-2 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-300 rounded-full font-mono border border-emerald-400/30">
                      DEV MODE
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Drag & Drop file Excel/CSV atau pilih langsung dari komputer Anda.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Action Toolbar: Download Template */}
              <div className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/10">
                <div>
                  <h4 className="text-sm font-bold text-white">Template Format Excel</h4>
                  <p className="text-xs text-slate-400">Gunakan template resmi dengan kolom & format yang sesuai.</p>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-colors shadow-md cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Template</span>
                </button>
              </div>

              {/* Drag & Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all flex flex-col items-center justify-center cursor-pointer ${
                  isDragOver ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]' : 'border-white/20 bg-white/5 hover:border-white/40'
                }`}
                onClick={() => document.getElementById('excel-file-input')?.click()}
              >
                <input
                  id="excel-file-input"
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processExcelFile(file);
                  }}
                />
                <Upload className={`w-12 h-12 mb-3 ${isDragOver ? 'text-emerald-400 animate-bounce' : 'text-slate-400'}`} />
                <p className="text-sm font-bold text-white mb-1">
                  {excelFile ? excelFile.name : 'Tarik & Lepas File Excel di sini, atau klik untuk memilih'}
                </p>
                <p className="text-xs text-slate-400">Format yang didukung: .xlsx, .xls, .csv</p>
              </div>

              {/* Error / Status Alert */}
              {importStatus && (
                <div className="p-4 bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-2xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{importStatus}</span>
                </div>
              )}

              {/* Preview Parsed Data */}
              {parsedData.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Preview Data ({parsedData.length} baris terdeteksi)
                    </h4>
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                      <Check className="w-4 h-4" /> Siap diimport ke Supabase
                    </span>
                  </div>

                  <div className="max-h-48 overflow-auto rounded-2xl border border-white/10 bg-black/40">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-[#1a0f44] text-slate-400 sticky top-0">
                        <tr>
                          <th className="p-3 border-b border-white/10">No</th>
                          <th className="p-3 border-b border-white/10">Referensi Invoice</th>
                          <th className="p-3 border-b border-white/10">SKU / Barcode</th>
                          <th className="p-3 border-b border-white/10">Nama Produk</th>
                          <th className="p-3 border-b border-white/10">QTY</th>
                          <th className="p-3 border-b border-white/10">Modul Fisik</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono">
                        {parsedData.slice(0, 10).map((row, idx) => (
                          <tr key={idx} className="hover:bg-white/5">
                            <td className="p-3">{idx + 1}</td>
                            <td className="p-3 font-bold text-white">{row['Referensi Invoice'] || row['Invoice'] || '-'}</td>
                            <td className="p-3 text-indigo-400">{row['SKU / Barcode'] || row['SKU'] || '-'}</td>
                            <td className="p-3 truncate max-w-[200px]">{row['Nama Produk'] || row['Produk'] || '-'}</td>
                            <td className="p-3">{row['QTY'] || 1}</td>
                            <td className="p-3 text-rose-400">{row['Modul Fisik'] || 'Cancel Fisik'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsedData.length > 10 && (
                    <p className="text-[11px] text-slate-400 text-center italic">
                      + Menampilkan 10 dari total {parsedData.length} baris data Excel.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-white/10 flex items-center justify-between bg-[#1a0f44]">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={parsedData.length === 0 || isImporting}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mengimport ke Supabase...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Import {parsedData.length} Data ke Supabase</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
