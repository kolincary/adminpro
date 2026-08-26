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
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  const currentOptions = masterData[activeCategory] || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="glass-card rounded-[40px] border-white/5 overflow-hidden shadow-2xl relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 blur-[80px] rounded-full -mr-24 -mt-24 pointer-events-none" />

        <div className="p-10 border-b border-white/5 bg-white/[0.02]">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-10">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-900/20 border border-white/10">
                <Database className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white tracking-tight">Kontrol Master</h3>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">Manajemen Parameter Operasional</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 group px-6 py-3 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 font-black rounded-2xl transition-all text-xs uppercase tracking-widest"
              >
                <Upload className="w-4 h-4 text-indigo-400 group-hover:translate-y-[-2px] transition-transform" />
                Impor Dataset
              </button>
              <button
                onClick={exportToExcel}
                className="flex items-center gap-2 group px-6 py-3 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 font-black rounded-2xl transition-all text-xs uppercase tracking-widest shadow-xl shadow-emerald-900/10"
              >
                <Download className="w-4 h-4 group-hover:translate-y-[2px] transition-transform" />
                Ekspor Dataset
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] transition-all border ${activeCategory === cat.id
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-900/40'
                    : 'bg-[#0f172a] text-slate-500 hover:text-white border-white/5 hover:bg-white/5'
                  }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-10">
          <div className="flex gap-4 mb-12">
            <div className="flex-1 relative group">
              <Plus className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-indigo-400 transition-colors" />
              <input
                type="text"
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                placeholder={`Masukkan entri ${CATEGORIES.find(c => c.id === activeCategory)?.label} baru...`}
                className="w-full pl-12 pr-6 py-4 bg-[#080c18] border border-white/5 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all font-medium placeholder:text-slate-700"
                onKeyPress={(e) => e.key === 'Enter' && handleAddOption()}
              />
            </div>
            <button
              onClick={handleAddOption}
              disabled={saving || !newOption.trim()}
              className="glow-btn px-10 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-black rounded-2xl transition-all flex items-center gap-3 shadow-2xl shadow-indigo-900/30 text-sm uppercase tracking-widest"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              SIMPAN
            </button>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">
                REGISTRI AKTIF ({currentOptions.length} TOTAL)
              </h4>
            </div>

            {currentOptions.length === 0 ? (
              <div className="text-center py-20 bg-white/[0.01] rounded-[32px] border border-dashed border-white/5">
                <p className="text-slate-600 font-bold uppercase tracking-widest text-xs">Tidak ada data untuk kategori ini</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentOptions.map((option) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={option}
                    className="flex items-center justify-between p-5 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.05] hover:border-indigo-500/30 transition-all group shadow-sm"
                  >
                    <span className="font-bold text-slate-200 truncate mr-3 tracking-wide">{option}</span>
                    <button
                      onClick={() => handleDeleteOption(option)}
                      className="p-2.5 text-slate-700 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-rose-500/20"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 30 }}
        className="bg-[#0f172a] w-full max-w-2xl rounded-[48px] shadow-3xl overflow-hidden flex flex-col max-h-[90vh] border border-white/10"
      >
        <div className="p-10 border-b border-white/5 flex items-center justify-between bg-white/[0.02] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/5 blur-[50px] rounded-full -ml-16 -mt-16 pointer-events-none" />
          <div className="flex items-center gap-5 relative z-10">
            <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
              <Upload className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-white tracking-tight">Injeksi Data</h3>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">{categoryLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
          <div className="flex p-1.5 bg-[#080c18] rounded-2xl border border-white/5">
            <button
              onClick={() => setImportType('file')}
              className={`flex-1 flex items-center justify-center gap-3 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${importType === 'file' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-900/40' : 'text-slate-500 hover:text-slate-300'
                }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              File Spreadsheet
            </button>
            <button
              onClick={() => setImportType('paste')}
              className={`flex-1 flex items-center justify-center gap-3 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${importType === 'paste' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-900/40' : 'text-slate-500 hover:text-slate-300'
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
              className={`border-2 border-dashed rounded-[40px] p-16 text-center cursor-pointer transition-all relative group overflow-hidden ${isDragging ? 'border-indigo-500 bg-indigo-500/5' : 'border-white/5 hover:border-indigo-500/30 hover:bg-white/[0.01]'
                }`}
            >
              <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity blur-[100px]" />
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".xlsx, .xls"
                className="hidden"
              />
              <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/5 group-hover:scale-110 transition-transform relative z-10">
                <FileSpreadsheet className="w-10 h-10 text-slate-500" />
              </div>
              <p className="text-slate-300 font-bold mb-2 relative z-10">Mulai unggah dataset</p>
              <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest relative z-10">Mendukung protokol .xlsx / .xls</p>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Input Data Mentah (Satu entri per baris)</label>
              <textarea
                value={pastedData}
                onChange={handlePasteChange}
                placeholder="PROD-SKU-001&#10;PROD-SKU-002&#10;PROD-SKU-003"
                className="w-full h-56 px-6 py-5 bg-[#080c18] border border-white/5 rounded-[32px] text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none font-mono text-xs leading-relaxed placeholder:text-slate-800"
              />
            </div>
          )}

          {previewData.length > 0 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between px-2">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pratinjau Buffer ({previewData.length} data)</h4>
                <button onClick={() => setPreviewData([])} className="text-[10px] text-rose-400 font-black hover:underline uppercase tracking-widest">Bersihkan Buffer</button>
              </div>
              <div className="bg-[#080c18] rounded-3xl p-6 border border-white/5 max-h-48 overflow-y-auto custom-scrollbar">
                <div className="flex flex-wrap gap-2">
                  {previewData.map((item, i) => (
                    <span key={i} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold text-slate-300">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-[10px] text-amber-500/80 font-black uppercase tracking-tight">Sistem akan otomatis menghapus duplikat dan mengabaikan entri yang konflik.</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-10 border-t border-white/5 bg-white/[0.02] flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-4.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-black rounded-2xl transition-all border border-white/5 text-xs uppercase tracking-widest"
          >
            BATAL
          </button>
          <button
            onClick={handleImport}
            disabled={previewData.length === 0}
            className="flex-1 py-4.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-3 shadow-2xl shadow-indigo-900/30 text-xs uppercase tracking-widest"
          >
            <CheckCircle2 className="w-5 h-5" />
            MULAI INJEKSI
          </button>
        </div>
      </motion.div>
    </div>
  );
}
