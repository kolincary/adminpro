import React, { useState, useEffect } from 'react';
import { 
  Cloud, 
  Upload, 
  Download, 
  Trash2, 
  FileSpreadsheet, 
  Clock, 
  User as UserIcon, 
  Search, 
  FileUp, 
  Loader2, 
  FileText, 
  Calendar as CalendarIcon,
  Sparkles
} from 'lucide-react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc,
  serverTimestamp,
  writeBatch,
  limit
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { User } from 'firebase/auth';
import * as XLSX from 'xlsx-js-style';
import { format, isSameDay } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import Toast, { ToastType } from './Toast';
import { motion, AnimatePresence } from 'motion/react';

interface VaultItem {
  id: string;
  fileName: string;
  fileData?: string; // Original file content in base64
  mimeType?: string; // Original mime type
  data: any[];
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: any;
  notes: string;
}

interface CloudVaultProps {
  user: User;
  isAdmin: boolean;
  isDevMode: boolean;
}

const CloudVault: React.FC<CloudVaultProps> = ({ user, isAdmin, isDevMode }) => {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; fileName: string } | null>(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: ToastType }>({
    visible: false,
    message: '',
    type: 'success'
  });

  const showToast = (message: string, type: ToastType) => {
    setToast({ visible: true, message, type });
  };

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'cloud_vault'), orderBy('uploadedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as VaultItem[];
      setItems(data);
      setLoading(false);
    }, (error) => {
      console.warn("cloud_vault sync error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Firestore document limit is 1MB. Base64 adds ~33% overhead.
    // 700KB is a safe limit to stay under 1MB including metadata.
    if (file.size > 700 * 1024) {
      showToast('Ukuran file terlalu besar (maks 700KB) untuk Cloud Vault', 'error');
      return;
    }

    setUploading(true);
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const arrayBuffer = evt.target?.result as ArrayBuffer;
        
        // Read for row count display (preview only)
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetNames = wb.SheetNames;
        const firstSheet = wb.Sheets[sheetNames[0]];
        const previewData = XLSX.utils.sheet_to_json(firstSheet);

        if (previewData.length === 0 && sheetNames.length === 1) {
          showToast('File Excel kosong', 'error');
          setUploading(false);
          return;
        }

        // Convert original file to base64 for "as-is" storage
        const base64Data = btoa(
          new Uint8Array(arrayBuffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ''
          )
        );

        await addDoc(collection(db, 'cloud_vault'), {
          fileName: file.name,
          fileData: base64Data,
          mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          data: previewData, // Keep JSON for row count display
          uploadedBy: user.uid,
          uploadedByName: user.displayName || 'Anonymous',
          uploadedAt: serverTimestamp(),
          notes: sheetNames.length > 1 
            ? `Berisi ${sheetNames.length} sheet. Preview: ${previewData.length} baris dari ${sheetNames[0]}`
            : `Diimpor ${previewData.length} baris`
        });

        showToast('Berhasil mengunggah file asli (Semua Sheet & Format Terjaga)', 'success');
      } catch (err) {
        console.error('Upload error:', err);
        showToast('Gagal mengunggah file. Pastikan ukuran di bawah 700KB.', 'error');
      } finally {
        setUploading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadItem = (item: VaultItem) => {
    try {
      if (item.fileData) {
        // Download original file from base64
        const binaryString = atob(item.fileData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: item.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showToast('Berhasil mengunduh file asli', 'success');
      } else {
        // Fallback for legacy items stored as JSON only
        const ws = XLSX.utils.json_to_sheet(item.data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Vault Data");
        XLSX.writeFile(wb, `Vault_${item.fileName}`);
        showToast('Berhasil mengunduh data (Format Terbatas)', 'success');
      }
    } catch (err) {
      console.error('Download error:', err);
      showToast('Gagal mengunduh data', 'error');
    }
  };

  const deleteItem = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteDoc(doc(db, 'cloud_vault', deleteConfirm.id));
      showToast('Data berhasil dihapus dari server', 'success');
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Gagal menghapus data dari server', 'error');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const clearAllVault = async () => {
    try {
      const batch = writeBatch(db);
      items.forEach(item => {
        batch.delete(doc(db, 'cloud_vault', item.id));
      });
      await batch.commit();
      showToast('Seluruh data di vault telah dihapus dari server', 'success');
    } catch (err) {
      console.error('Clear all error:', err);
      showToast('Gagal menghapus seluruh data', 'error');
    } finally {
      setClearAllConfirm(false);
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = (item.fileName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                         (item.uploadedByName?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    
    let matchesDate = true;
    if (dateFilter && item.uploadedAt) {
      const itemDate = item.uploadedAt.toDate();
      const filterDate = new Date(dateFilter);
      matchesDate = isSameDay(itemDate, filterDate);
    }

    return matchesSearch && matchesDate;
  });

  // Group items by date for the UI
  const groupedItems: { [key: string]: VaultItem[] } = {};
  filteredItems.forEach(item => {
    if (item.uploadedAt) {
      const dateKey = format(item.uploadedAt.toDate(), 'yyyy-MM-dd');
      if (!groupedItems[dateKey]) groupedItems[dateKey] = [];
      groupedItems[dateKey].push(item);
    } else {
      const dateKey = 'Just Now';
      if (!groupedItems[dateKey]) groupedItems[dateKey] = [];
      groupedItems[dateKey].push(item);
    }
  });

  const sortedDates = Object.keys(groupedItems).sort((a, b) => b.localeCompare(a));

  return (
    <div className="flex-1 w-full max-w-none mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Title Header Card */}
      <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-6 sm:p-8 backdrop-blur-md relative overflow-hidden shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="flex items-center gap-5 relative z-10">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-950/40 border border-emerald-400/30 shrink-0">
            <Cloud className="w-8 h-8 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Cloud Vault</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                v2.6-VAULT
              </span>
            </div>
            <p className="text-purple-300/60 text-xs sm:text-sm font-semibold mt-1">
              Penyimpanan & sinkronisasi data Excel lintas perangkat tim admin secara real-time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          {isAdmin && items.length > 0 && (
            <button
              onClick={() => setClearAllConfirm(true)}
              className="flex items-center gap-2 px-5 py-3 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-black rounded-xl transition-all shadow-lg text-[10px] uppercase tracking-widest active:scale-95"
            >
              <Trash2 className="w-4 h-4 text-rose-400" />
              Hapus Semua
            </button>
          )}
          <label className={`flex items-center gap-2 px-6 py-3 ${uploading ? 'bg-purple-950/40 text-purple-400 cursor-not-allowed border border-purple-900/30' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white cursor-pointer shadow-xl shadow-purple-950/40 border border-purple-400/30'} font-black rounded-xl transition-all text-[10px] uppercase tracking-widest active:scale-95`}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Mengunggah...' : 'Unggah Excel'}
            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-6 sm:p-8 backdrop-blur-md shadow-xl">
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400/60" />
            <input
              type="text"
              placeholder="Cari file atau pengunggah di vault..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-5 py-3 bg-[#0c0620] border border-purple-900/40 rounded-xl text-white placeholder-purple-400/30 text-xs font-semibold focus:ring-2 focus:ring-purple-500 outline-none transition-all"
            />
          </div>
          <div 
            className="relative w-full md:w-64 group cursor-pointer"
            onClick={(e) => {
              const input = e.currentTarget.querySelector('input');
              if (input && 'showPicker' in input) {
                try {
                  (input as any).showPicker();
                } catch (err) {
                  console.warn('showPicker() blocked or not supported:', err);
                }
              }
            }}
          >
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full pl-11 pr-5 py-3 bg-[#0c0620] border border-purple-900/40 rounded-xl text-white text-xs font-semibold focus:ring-2 focus:ring-purple-500 outline-none transition-all appearance-none cursor-pointer [color-scheme:dark] text-center"
            />
            <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400/60 group-focus-within:text-purple-300 transition-colors pointer-events-none" />
            {dateFilter && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setDateFilter('');
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-rose-400 uppercase tracking-widest hover:text-rose-300 z-10"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
            <p className="text-purple-300/60 font-black uppercase tracking-widest text-[10px]">Menghubungkan ke Vault...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-4 opacity-40">
            <FileUp className="w-16 h-16 text-purple-400" />
            <div className="text-center">
              <p className="text-sm font-black uppercase tracking-widest text-purple-300">Vault Kosong</p>
              <p className="text-xs font-semibold text-purple-400/70 mt-1">Unggah file Excel untuk membagikannya antar perangkat admin</p>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {sortedDates.map(dateKey => (
              <div key={dateKey} className="space-y-5">
                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-purple-900/30" />
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-[#0c0620] rounded-full border border-purple-900/40">
                    <CalendarIcon className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-[10px] font-black text-purple-300 uppercase tracking-[0.2em]">
                      {dateKey === 'Just Now' ? 'Baru Saja' : format(new Date(dateKey), 'dd MMMM yyyy', { locale: idLocale })}
                    </span>
                  </div>
                  <div className="h-px flex-1 bg-purple-900/30" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  <AnimatePresence>
                    {groupedItems[dateKey].map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="group relative bg-[#0c0620]/90 border border-purple-900/30 rounded-2xl p-5 hover:border-purple-500/50 transition-all hover:shadow-xl hover:shadow-purple-950/40"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="w-12 h-12 bg-purple-500/15 rounded-xl flex items-center justify-center text-purple-300 border border-purple-500/30">
                            <FileSpreadsheet className="w-6 h-6" />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => downloadItem(item)}
                              className="p-2.5 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500 hover:text-white rounded-xl transition-all border border-emerald-500/30"
                              title="Unduh File"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            {(isAdmin || isDevMode || item.uploadedBy === user.uid) && (
                              <button
                                onClick={() => setDeleteConfirm({ id: item.id, fileName: item.fileName })}
                                className="p-2.5 bg-rose-500/15 text-rose-300 hover:bg-rose-500 hover:text-white rounded-xl transition-all border border-rose-500/30"
                                title="Hapus dari Vault"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <h4 className="text-white font-black text-sm truncate mb-2 pr-2" title={item.fileName}>
                          {item.fileName}
                        </h4>
                        
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center gap-2 text-purple-300/60 font-semibold">
                            <Clock className="w-3.5 h-3.5 text-purple-400" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">
                              {item.uploadedAt ? format(item.uploadedAt.toDate(), 'HH:mm') : 'Baru saja'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-purple-300/60 font-semibold">
                            <UserIcon className="w-3.5 h-3.5 text-purple-400" />
                            <span className="text-[10px] font-bold uppercase tracking-wider truncate">
                              {item.uploadedByName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-indigo-300 font-bold">
                            <FileText className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="text-[10px] font-black uppercase tracking-wider">
                              {item.data.length} Baris Data
                            </span>
                          </div>
                        </div>

                        {item.notes && (
                          <div className="mt-3.5 pt-3 border-t border-purple-900/30">
                            <p className="text-[10px] text-purple-300/50 font-medium italic truncate">
                              "{item.notes}"
                            </p>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
              className="absolute inset-0 bg-black/75 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-[#130b2e] border border-purple-800/40 rounded-3xl p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-rose-500" />
              <div className="flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 bg-rose-500/15 rounded-2xl flex items-center justify-center text-rose-400 border border-rose-500/30">
                  <Trash2 className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-xl font-black text-white tracking-tight">Konfirmasi Penghapusan</h4>
                  <p className="text-purple-300/70 text-xs font-semibold leading-relaxed">
                    Apakah Anda yakin ingin menghapus file <span className="text-white font-bold">"{deleteConfirm.fileName}"</span> dari Cloud Vault? Tindakan ini akan menghapus data secara permanen dari server.
                  </p>
                </div>
                <div className="flex items-center gap-3 w-full">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 px-5 py-3 bg-[#0c0620] hover:bg-purple-950/40 text-purple-200 font-black rounded-xl transition-all text-[10px] uppercase tracking-widest border border-purple-900/40"
                  >
                    Batal
                  </button>
                  <button
                    onClick={deleteItem}
                    className="flex-1 px-5 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl transition-all shadow-xl shadow-rose-950/40 text-[10px] uppercase tracking-widest"
                  >
                    Hapus Permanen
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {clearAllConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setClearAllConfirm(false)}
              className="absolute inset-0 bg-black/75 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-[#130b2e] border border-purple-800/40 rounded-3xl p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-rose-500" />
              <div className="flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 bg-rose-500/15 rounded-2xl flex items-center justify-center text-rose-400 border border-rose-500/30">
                  <Trash2 className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-xl font-black text-white tracking-tight">Hapus Semua Data?</h4>
                  <p className="text-purple-300/70 text-xs font-semibold leading-relaxed">
                    Tindakan ini akan menghapus <span className="text-white font-bold">SELURUH</span> file yang ada di Cloud Vault secara permanen dari server.
                  </p>
                </div>
                <div className="flex items-center gap-3 w-full">
                  <button
                    onClick={() => setClearAllConfirm(false)}
                    className="flex-1 px-5 py-3 bg-[#0c0620] hover:bg-purple-950/40 text-purple-200 font-black rounded-xl transition-all text-[10px] uppercase tracking-widest border border-purple-900/40"
                  >
                    Batal
                  </button>
                  <button
                    onClick={clearAllVault}
                    className="flex-1 px-5 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl transition-all shadow-xl shadow-rose-950/40 text-[10px] uppercase tracking-widest"
                  >
                    Hapus Semua
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
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
};

export default CloudVault;
