import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, doc, setDoc, query } from 'firebase/firestore';
import { db, auth } from './firebase';
import {
  Plus,
  Trash2,
  Loader2,
  Database,
  Download,
  Upload,
  X,
  FileSpreadsheet,
  ClipboardPaste,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import Toast, { ToastType } from './Toast';

interface MasterData {
  category: string;
  options: string[];
}

const CATEGORIES = [
  { id: 'status', label: 'Status/Keterangan' },
  { id: 'sku', label: 'SKU Barang' },
  { id: 'bundling_sku', label: 'Bundling SKU (Auto-Split)' },
  { id: 'pic', label: 'PIC Input Ginee' },
  { id: 'marketplace', label: 'Marketplace' }
];

interface MasterDataManagementProps {
  user?: any;
}

export default function MasterDataManagement({ user }: MasterDataManagementProps = {}) {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id);
  const [masterData, setMasterData] = useState<Record<string, string[]>>({});
  const [newOption, setNewOption] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type, visible: true });
  };

  useEffect(() => {
    const currentUser = user || auth.currentUser;
    if (!currentUser) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'master_data'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Record<string, string[]> = {};
      snapshot.docs.forEach(doc => {
        data[doc.id] = doc.data().options || [];
      });
      setMasterData(data);
      setLoading(false);
    }, (error) => {
      console.warn("master_data sync error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddOption = () => {
    if (!newOption.trim()) return;

    const currentOptions = masterData[activeCategory] || [];
    if (currentOptions.includes(newOption.trim())) {
      showToast('Opsi sudah ada!', 'error');
      return;
    }

    const updatedOptions = [...currentOptions, newOption.trim()].sort();
    saveOptions(activeCategory, updatedOptions);
    setNewOption('');
  };

  const handleDeleteOption = (optionToDelete: string) => {
    if (!confirm(`Hapus opsi "${optionToDelete}"?`)) return;

    const currentOptions = masterData[activeCategory] || [];
    const updatedOptions = currentOptions.filter(opt => opt !== optionToDelete);
    saveOptions(activeCategory, updatedOptions);
  };

  const saveOptions = async (category: string, options: string[]) => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'master_data', category), {
        category,
        options,
        updatedAt: new Date().toISOString()
      });
      showToast('Data master berhasil diperbarui.', 'success');
    } catch (error) {
      console.error('Error saving master data:', error);
      showToast('Gagal menyimpan data master.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const exportToExcel = () => {
    const currentOptions = masterData[activeCategory] || [];
    const label = CATEGORIES.find(c => c.id === activeCategory)?.label || activeCategory;

    const worksheet = XLSX.utils.json_to_sheet(
      currentOptions.map(opt => ({ [label]: opt }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Master Data");

    XLSX.writeFile(workbook, `Data_Master_${label.replace(/\//g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  const currentOptions = masterData[activeCategory] || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-purple-600/10 blur-[80px] rounded-full -mr-24 -mt-24 pointer-events-none" />

        <div className="p-6 sm:p-8 border-b border-purple-900/40 bg-[#0c0620]/60">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-purple-950/40 border border-purple-400/30 shrink-0">
                <Database className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white tracking-tight">Kontrol Master Data</h3>
                <p className="text-purple-400 text-xs font-black uppercase tracking-widest mt-0.5">Manajemen Parameter & Metadata Operasional</p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 group px-5 py-2.5 bg-[#0c0620] border border-purple-900/40 hover:border-purple-500/40 text-purple-200 font-black rounded-xl transition-all text-xs uppercase tracking-wider"
              >
                <Upload className="w-4 h-4 text-purple-400 group-hover:translate-y-[-2px] transition-transform" />
                Impor Dataset
              </button>
              <button
                onClick={exportToExcel}
                className="flex items-center gap-2 group px-5 py-2.5 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 text-emerald-300 font-black rounded-xl transition-all text-xs uppercase tracking-wider shadow-lg shadow-emerald-950/20"
              >
                <Download className="w-4 h-4 group-hover:translate-y-[2px] transition-transform" />
                Ekspor Dataset
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all border ${
                  activeCategory === cat.id
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 border-purple-400/30 text-white shadow-lg shadow-purple-950/40'
                    : 'bg-[#0c0620] text-purple-300/60 hover:text-white border-purple-900/40 hover:bg-purple-950/40'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <div className="flex-1 relative group">
              <Plus className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400/60 group-focus-within:text-purple-300 transition-colors" />
              <input
                type="text"
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                placeholder={`Masukkan entri ${CATEGORIES.find(c => c.id === activeCategory)?.label} baru...`}
                className="w-full pl-12 pr-4 py-3.5 bg-[#0c0620] border border-purple-900/40 rounded-xl text-white placeholder-purple-400/30 focus:ring-2 focus:ring-purple-500 outline-none transition-all text-xs font-semibold"
                onKeyPress={(e) => e.key === 'Enter' && handleAddOption()}
              />
            </div>
            <button
              onClick={handleAddOption}
              disabled={saving || !newOption.trim()}
              className="px-8 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-purple-950/40 text-xs uppercase tracking-widest active:scale-[0.98]"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              SIMPAN
            </button>
          </div>

          <div className="space-y-5">
            <div className="flex items-center justify-between px-1">
              <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest">
                REGISTRI AKTIF ({currentOptions.length} TOTAL)
              </h4>
            </div>

            {currentOptions.length === 0 ? (
              <div className="text-center py-16 bg-[#0c0620] rounded-2xl border border-dashed border-purple-900/40">
                <p className="text-purple-400/60 font-black uppercase tracking-widest text-xs">Tidak ada data untuk kategori ini</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {currentOptions.map((option) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={option}
                    className="flex items-center justify-between p-4 bg-[#0c0620] border border-purple-900/40 rounded-xl hover:border-purple-500/40 hover:bg-purple-950/20 transition-all group"
                  >
                    <span className="font-bold text-slate-200 truncate mr-3 text-xs tracking-wide">{option}</span>
                    <button
                      onClick={() => handleDeleteOption(option)}
                      className="p-1.5 text-purple-400/60 hover:text-rose-400 hover:bg-rose-500/15 rounded-lg transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-rose-500/30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showImportModal && (
          <ImportModal
            category={activeCategory}
            categoryLabel={CATEGORIES.find(c => c.id === activeCategory)?.label || ''}
            currentOptions={currentOptions}
            onClose={() => setShowImportModal(false)}
            onSave={(newOptions) => {
              saveOptions(activeCategory, newOptions);
              setShowImportModal(false);
            }}
          />
        )}
      </AnimatePresence>

      <Toast 
        isVisible={toast.visible}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, visible: false }))}
      />
    </div>
  );
}

interface ImportModalProps {
  category: string;
  categoryLabel: string;
  currentOptions: string[];
  onClose: () => void;
  onSave: (options: string[]) => void;
}

function ImportModal({ category, categoryLabel, currentOptions, onClose, onSave }: ImportModalProps) {
  const [importType, setImportType] = useState<'file' | 'paste'>('file');
  const [pastedData, setPastedData] = useState('');
  const [previewData, setPreviewData] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      const options = jsonData
        .map(row => String(row[0] || '').trim())
        .filter(val => val && val.toLowerCase() !== categoryLabel.toLowerCase());

      setPreviewData(Array.from(new Set(options)));
    };
    reader.readAsArrayBuffer(file);
  };

  const handlePasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPastedData(val);
    const lines = val.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    setPreviewData(Array.from(new Set(lines)));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleImport = () => {
    const merged = Array.from(new Set([...currentOptions, ...previewData])).sort();
    onSave(merged);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 30 }}
        className="bg-[#130b2e] w-full max-w-2xl rounded-3xl shadow-3xl overflow-hidden flex flex-col max-h-[90vh] border border-purple-900/40 relative"
      >
        <div className="p-6 sm:p-8 border-b border-purple-900/40 flex items-center justify-between bg-[#0c0620]/80 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-32 h-32 bg-purple-600/10 blur-[50px] rounded-full -ml-16 -mt-16 pointer-events-none" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-12 h-12 bg-purple-500/15 rounded-2xl flex items-center justify-center border border-purple-500/30 text-purple-300">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">Injeksi Dataset Master</h3>
              <p className="text-purple-400 text-[10px] font-black uppercase tracking-widest mt-0.5">{categoryLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 bg-[#130b2e] hover:bg-purple-950/40 text-purple-400 hover:text-white rounded-xl transition-all border border-purple-900/40">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 custom-scrollbar">
          <div className="flex p-1.5 bg-[#0c0620] rounded-xl border border-purple-900/40">
            <button
              onClick={() => setImportType('file')}
              className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                importType === 'file' 
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/40' 
                  : 'text-purple-400/60 hover:text-purple-200'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              File Spreadsheet
            </button>
            <button
              onClick={() => setImportType('paste')}
              className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                importType === 'paste' 
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/40' 
                  : 'text-purple-400/60 hover:text-purple-200'
              }`}
            >
              <ClipboardPaste className="w-4 h-4" />
              Tempel Massal
            </button>
          </div>

          {importType === 'file' ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all relative group overflow-hidden ${
                isDragging 
                  ? 'border-purple-400 bg-purple-500/15' 
                  : 'border-purple-900/40 bg-[#0c0620] hover:border-purple-500/50 hover:bg-purple-950/20'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".xlsx, .xls"
                className="hidden"
              />
              <div className="w-16 h-16 bg-purple-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-purple-500/30 text-purple-300 group-hover:scale-105 transition-transform">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <p className="text-white font-black text-sm mb-1">Mulai unggah dataset</p>
              <p className="text-purple-400/60 text-[10px] font-bold uppercase tracking-widest">Mendukung protokol .xlsx / .xls</p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-purple-300 uppercase tracking-widest px-1">Input Data Mentah (Satu entri per baris)</label>
              <textarea
                value={pastedData}
                onChange={handlePasteChange}
                placeholder="PROD-SKU-001&#10;PROD-SKU-002&#10;PROD-SKU-003"
                className="w-full h-48 px-4 py-3 bg-[#0c0620] border border-purple-900/40 rounded-xl text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all resize-none font-mono text-xs leading-relaxed placeholder-purple-400/30"
              />
            </div>
          )}

          {previewData.length > 0 && (
            <div className="space-y-3 animate-in fade-in duration-300">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Pratinjau Buffer ({previewData.length} data)</h4>
                <button onClick={() => setPreviewData([])} className="text-[10px] text-rose-400 font-black hover:underline uppercase tracking-widest">Bersihkan Buffer</button>
              </div>
              <div className="bg-[#0c0620] rounded-xl p-4 border border-purple-900/40 max-h-40 overflow-y-auto custom-scrollbar">
                <div className="flex flex-wrap gap-2">
                  {previewData.map((item, i) => (
                    <span key={i} className="px-2.5 py-1 bg-purple-500/15 border border-purple-500/30 rounded-lg text-[10px] font-bold text-purple-200">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 p-3.5 bg-amber-500/10 rounded-xl border border-amber-500/20">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-[10px] text-amber-300 font-bold uppercase tracking-tight">Sistem akan otomatis menghapus duplikat dan mengabaikan entri yang konflik.</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-purple-900/40 bg-[#0c0620]/80 flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-[#130b2e] hover:bg-purple-950/40 text-purple-300 font-black rounded-xl transition-all border border-purple-900/40 text-xs uppercase tracking-widest"
          >
            BATAL
          </button>
          <button
            onClick={handleImport}
            disabled={previewData.length === 0}
            className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-purple-950/40 text-xs uppercase tracking-widest active:scale-[0.98]"
          >
            <CheckCircle2 className="w-4 h-4" />
            MULAI INJEKSI
          </button>
        </div>
      </motion.div>
    </div>
  );
}
