import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp, onSnapshot, query, setDoc, getDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { OperationType } from './types';
import { handleFirestoreError } from './utils';
import { format, isToday } from 'date-fns';
import { Loader2, PlusCircle, Trash2, Plus, X, RotateCcw, AlertCircle, Send, Calendar, ClipboardPaste } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import SearchableSelect, { SearchableSelectHandle } from './SearchableSelect';
import Toast, { ToastType } from './Toast';
import ConfirmModal from './ConfirmModal';

import { updateDashboardStats, updateDashboardStatsBulk } from './stats';

const DEFAULT_PIC_OPTIONS = [
  "ISMI (GTL)", "ISMI (TK HOME)", "ISMI (SORTIR)", "ISMI (SP HOME)", "ISMI (LZD)",
  "IRDA (GTL)", "IRDA (TK HOME)", "IRDA (SORTIR)", "IRDA (SP HOME)", "IRDA (LZD)",
  "HELENITA (GTL)", "HELENITA (TK HOME)", "HELENITA (SORTIR)", "HELENITA (SP HOME)", "HELENITA (LZD)",
  "APRILIA (GTL)", "APRILIA (TK HOME)", "APRILIA (SORTIR)", "APRILIA (SP HOME)", "APRILIA (LZD)",
  "AINUL (GTL)", "AINUL (TK HOME)", "AINUL (SORTIR)", "AINUL (SP HOME)", "AINUL (LZD)",
  "NOVI (GTL)", "NOVI (TK HOME)", "NOVI (SORTIR)", "NOVI (SP HOME)", "NOVI (LZD)",
  "NOPIYA (GTL)", "NOPIYA (TK HOME)", "NOPIYA (SORTIR)", "NOPIYA (SP HOME)", "NOPIYA (LZD)",
  "ZAHRA (GTL)", "ZAHRA (TK HOME)", "ZAHRA (SORTIR)", "ZAHRA (SP HOME)", "ZAHRA (LZD)",
  "ISMI", "IRDA", "HELENITA", "APRILIA", "AINUL", "NOVI", "NOPIYA", "ZAHRA"
];

const DEFAULT_MARKETPLACE_OPTIONS = ["Shopee", "Tokopedia", "Lazada", "TikTok Shop", "Blibli", "Lainnya"];

interface ItemRow {
  sku: string;
  quantity: number;
  status: string;
  itemDescription: string;
  logDate?: string;
  invoiceNumber?: string;
}

const getInvoiceStyle = (invoice: string) => {
  if (!invoice) return null;
  const styles = [
    { bg: 'from-blue-500/10 to-transparent', border: 'border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-500/10 border-blue-500/30' },
    { bg: 'from-emerald-500/10 to-transparent', border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/30' },
    { bg: 'from-amber-500/10 to-transparent', border: 'border-amber-500/30', text: 'text-amber-400', badge: 'bg-amber-500/10 border-amber-500/30' },
    { bg: 'from-fuchsia-500/10 to-transparent', border: 'border-fuchsia-500/30', text: 'text-fuchsia-400', badge: 'bg-fuchsia-500/10 border-fuchsia-500/30' },
    { bg: 'from-cyan-500/10 to-transparent', border: 'border-cyan-500/30', text: 'text-cyan-400', badge: 'bg-cyan-500/10 border-cyan-500/30' },
    { bg: 'from-rose-500/10 to-transparent', border: 'border-rose-500/30', text: 'text-rose-400', badge: 'bg-rose-500/10 border-rose-500/30' },
  ];
  let hash = 0;
  for (let i = 0; i < invoice.length; i++) {
    hash = invoice.charCodeAt(i) + ((hash << 5) - hash);
  }
  return styles[Math.abs(hash) % styles.length];
};

interface ReportFormProps {
  category?: 'retur' | 'retur2' | 'stok_lt3' | 'rusak_internal' | 'eliminasi_rusak';
  isCancelFisikOnly?: boolean;
  user: any;
}

export default function ReportForm({ category = 'retur', isCancelFisikOnly = false, user }: ReportFormProps) {
  const [loading, setLoading] = useState(false);
  const quantityRef = useRef<HTMLInputElement>(null);
  const skuSelectRef = useRef<SearchableSelectHandle>(null);

  const [masterData, setMasterData] = useState<Record<string, string[]>>({});
  const [headerData, setHeaderData] = useState({
    inputDate: format(new Date(), 'yyyy-MM-dd'),
    gineeInputDate: '',
    picGinee: (category === 'retur' || category === 'retur2' || category === 'rusak_internal' || category === 'stok_lt3') ? (localStorage.getItem('selectedPicGinee') || '') : '',
    marketplace: (category === 'retur' || category === 'retur2') ? (localStorage.getItem('selectedMarketplace') || '') : '',
    invoiceNumber: '',
    type: '',
    category: category,
    status: category === 'rusak_internal' ? 'Eliminasi Stok Rusak' : ((category === 'stok_lt3' || category === 'retur2') ? (localStorage.getItem('selectedMenuFisik') || '') : '')
  });

  useEffect(() => {
    setHeaderData(prev => ({
      ...prev,
      category,
      type: '',
      picGinee: (category === 'retur' || category === 'retur2' || category === 'rusak_internal' || category === 'stok_lt3') ? (localStorage.getItem('selectedPicGinee') || '') : prev.picGinee,
      marketplace: (category === 'retur' || category === 'retur2') ? (localStorage.getItem('selectedMarketplace') || '') : prev.marketplace,
      status: category === 'rusak_internal' ? 'Eliminasi Stok Rusak' : ((category === 'stok_lt3' || category === 'retur2') ? (localStorage.getItem('selectedMenuFisik') || '') : prev.status)
    }));
  }, [category]);

  const handlePicGineeChange = (val: string) => {
    setHeaderData(prev => ({ ...prev, picGinee: val }));
    if (category === 'retur' || category === 'retur2' || category === 'rusak_internal' || category === 'stok_lt3') {
      localStorage.setItem('selectedPicGinee', val);
    }
  };

  const handleMarketplaceChange = (val: string) => {
    setHeaderData(prev => ({ ...prev, marketplace: val }));
    if (category === 'retur' || category === 'retur2') {
      localStorage.setItem('selectedMarketplace', val);
    }
  };

  const handleResetPicGinee = () => {
    setHeaderData(prev => ({ ...prev, picGinee: '' }));
    localStorage.removeItem('selectedPicGinee');
  };

  const handleResetMarketplace = () => {
    setHeaderData(prev => ({ ...prev, marketplace: '' }));
    localStorage.removeItem('selectedMarketplace');
  };

  const handleStatusChange = (val: string) => {
    setHeaderData(prev => ({ ...prev, status: val }));
    if (category === 'stok_lt3' || category === 'retur2' || category === 'rusak_internal') {
      localStorage.setItem('selectedMenuFisik', val);
    }
  };

  const handleResetStatus = () => {
    setHeaderData(prev => ({ ...prev, status: '' }));
    localStorage.removeItem('selectedMenuFisik');
  };

  const [items, setItems] = useState<ItemRow[]>([
    { sku: '', quantity: 1, status: '', itemDescription: '' }
  ]);

  const [toast, setToast] = useState<{ message: string; type: ToastType; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isMassInputModalOpen, setIsMassInputModalOpen] = useState(false);
  const [massInputText, setMassInputText] = useState('');
  const [isDraftLoading, setIsDraftLoading] = useState(true);

  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [inputItem, setInputItem] = useState<ItemRow>({
    sku: '',
    quantity: 1,
    status: 'Eliminasi Stok Rusak',
    itemDescription: '',
    logDate: format(new Date(), 'yyyy-MM-dd')
  });

  // Load draft from Firestore or LocalStorage
  useEffect(() => {
    if (!user || !category) return;

    const loadDraft = async () => {
      setIsDraftLoading(true);
      const draftId = `${user.uid}_${category}`;
      if (!auth.currentUser) {
        // Load from LocalStorage
        try {
          const saved = localStorage.getItem(`draft_${draftId}`);
          if (saved) {
            const data = JSON.parse(saved);
            setHeaderData(prev => ({
              ...prev,
              ...data.headerData,
              category
            }));
            setItems(data.items || [{ sku: '', quantity: 1, status: '', itemDescription: '' }]);
          }
        } catch (e) {
          console.error('Error loading offline draft:', e);
        } finally {
          setIsDraftLoading(false);
        }
        return;
      }

      try {
        const draftDoc = await getDoc(doc(db, 'form_drafts', draftId));
        if (draftDoc.exists()) {
          const data = draftDoc.data();
          setHeaderData(prev => ({
            ...prev,
            ...data.headerData,
            category // Ensure category stays correct
          }));
          setItems(data.items || [{ sku: '', quantity: 1, status: '', itemDescription: '' }]);
        }
      } catch (error) {
        console.error('Error loading draft:', error);
        handleFirestoreError(error, OperationType.GET, `form_drafts/${draftId}`);
      } finally {
        setIsDraftLoading(false);
      }
    };

    loadDraft();
  }, [category, user]);

  // Save draft to Firestore or LocalStorage (Debounced)
  useEffect(() => {
    if (!user || !category || isDraftLoading) return;

    const saveDraft = async () => {
      setIsSavingDraft(true);
      const draftId = `${user.uid}_${category}`;
      if (!auth.currentUser) {
        // Save to LocalStorage
        try {
          const payload = {
            userId: user.uid,
            category,
            headerData,
            items,
            updatedAt: new Date().toISOString()
          };
          localStorage.setItem(`draft_${draftId}`, JSON.stringify(payload));
        } catch (error) {
          console.error('Error saving offline draft:', error);
        } finally {
          setTimeout(() => setIsSavingDraft(false), 1000);
        }
        return;
      }

      try {
        await setDoc(doc(db, 'form_drafts', draftId), {
          userId: user.uid,
          category,
          headerData,
          items,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error('Error saving draft:', error);
        handleFirestoreError(error, OperationType.WRITE, `form_drafts/${draftId}`);
      } finally {
        setTimeout(() => setIsSavingDraft(false), 1000);
      }
    };

    const timeoutId = setTimeout(saveDraft, 1500); // 1.5s debounce
    return () => clearTimeout(timeoutId);
  }, [headerData, items, category, user, isDraftLoading]);

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type, visible: true });
  };

  useEffect(() => {
    if (!auth.currentUser) {
      // Offline mode: fallback to local master_data from localStorage if any
      try {
        const saved = localStorage.getItem('master_data');
        if (saved) {
          setMasterData(JSON.parse(saved));
        }
      } catch (e) {
        console.warn('Error reading local master_data:', e);
      }
      return;
    }

    const q = query(collection(db, 'master_data'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Record<string, string[]> = {};
      snapshot.docs.forEach(doc => {
        data[doc.id] = doc.data().options || [];
      });
      setMasterData(data);
      try {
        localStorage.setItem('master_data', JSON.stringify(data));
      } catch (e) {
        // ignore storage quota errors
      }
    }, (error) => {
      console.warn("master_data sync permission denied / error:", error);
      // Fail secure and fallback to local cache
      try {
        const saved = localStorage.getItem('master_data');
        if (saved) {
          setMasterData(JSON.parse(saved));
        }
      } catch (e) {}
    });

    return () => unsubscribe();
  }, [user]);

   const addItemRow = () => {
    if (category === 'rusak_internal' || category === 'stok_lt3') {
      // Strict validation for rusak_internal and stok_lt3
      if (!headerData.picGinee) {
        showToast('Kolom Analis (PIC) wajib diisi!', 'error');
        return;
      }
      if (category === 'stok_lt3' && !headerData.status) {
        showToast('Modul Fisik wajib dipilih!', 'error');
        return;
      }
      if (!inputItem.logDate) {
        showToast('Tanggal Log wajib diisi!', 'error');
        return;
      }
      if (!inputItem.sku) {
        showToast('Tag Aset (SKU) wajib diisi!', 'error');
        return;
      }
      if (!inputItem.quantity || inputItem.quantity <= 0) {
        showToast('Kuantitas harus lebih dari 0!', 'error');
        return;
      }
      
      // If we have an initial empty item, replace it
      if (items.length === 1 && !items[0].sku) {
        setItems([{ ...inputItem, status: category === 'stok_lt3' ? headerData.status : inputItem.status }]);
      } else {
        setItems([...items, { ...inputItem, status: category === 'stok_lt3' ? headerData.status : inputItem.status }]);
      }

      setInputItem({
        sku: '',
        quantity: 1,
        status: category === 'rusak_internal' ? 'Eliminasi Stok Rusak' : headerData.status,
        itemDescription: '',
        logDate: format(new Date(), 'yyyy-MM-dd')
      });
      
      showToast('Item berhasil ditambahkan ke daftar.', 'success');
      
      // Focus back to SKU field
      setTimeout(() => skuSelectRef.current?.focus(), 0);
    } else {
      const firstStatus = items.length > 0 ? items[0].status : '';
      setItems([...items, { sku: '', quantity: 1, status: firstStatus, itemDescription: '' }]);
    }
  };

  const handleMassInput = () => {
    if (!massInputText.trim()) return;
    
    const rows = massInputText.split('\n').filter(Boolean);
    const newItems: ItemRow[] = rows.map(row => {
      const cols = row.split('\t');
      return {
        invoiceNumber: cols[0]?.trim() || '', // ID Pesanan
        status: '', // Status (Aset) dibuat kosong sesuai request
        itemDescription: cols[2]?.trim() || '', // Alasan Pembatalan
        sku: cols[3]?.trim() || '', // MSKU
        quantity: parseInt(cols[4]?.trim() || '1', 10) || 1, // Jumlah
        logDate: format(new Date(), 'yyyy-MM-dd')
      };
    }).filter(item => item.invoiceNumber || item.status || item.itemDescription || item.sku); // Allow if ANY data exists

    if (newItems.length > 0) {
      setItems(prev => {
        // If the only item is completely empty, replace it
        if (prev.length === 1 && !prev[0].sku && !prev[0].invoiceNumber && !prev[0].itemDescription) {
          return newItems;
        }
        return [...prev, ...newItems];
      });
      setIsMassInputModalOpen(false);
      setMassInputText('');
      showToast(`${newItems.length} item berhasil ditambahkan dari Input Massal!`, 'success');
    } else {
      showToast('Gagal memproses data. Pastikan format sesuai.', 'error');
    }
  };

  const removeItemRow = (index: number) => {
    if (category === 'rusak_internal') {
      const newItems = items.filter((_, i) => i !== index);
      // If we removed the last item, reset to initial empty state if needed, 
      // or just keep it empty. The UI handles empty items list.
      setItems(newItems.length === 0 ? [{ sku: '', quantity: 1, status: '', itemDescription: '' }] : newItems);
    } else {
      if (items.length === 1) return;
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItemRow = (index: number, field: keyof ItemRow, value: any) => {
    const newItems = [...items];
    let finalValue = value;

    // Remove spaces from SKU
    if (field === 'sku' && typeof value === 'string') {
      finalValue = value.replace(/\s+/g, '');
    }

    newItems[index] = { ...newItems[index], [field]: finalValue };

    if (field === 'status') {
      const currentInvoice = newItems[index].invoiceNumber;
      
      if (currentInvoice) {
        // Sync status for all items with the same invoiceNumber
        for (let i = 0; i < newItems.length; i++) {
          if (newItems[i].invoiceNumber === currentInvoice) {
            newItems[i].status = finalValue;
          }
        }
      } else if (index === 0 && (category === 'stok_lt3' || category === 'retur2' || category === 'rusak_internal')) {
        // Fallback: Sync status for all items if the first item's status is changed and no invoice exists
        for (let i = 1; i < newItems.length; i++) {
          newItems[i].status = finalValue;
        }
      }
    }

    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Additional Global Validation
    if (!headerData.picGinee) {
      showToast('Gagal Simpan: Kolom Analis (PIC) masih kosong!', 'error');
      return;
    }

    if (category !== 'rusak_internal' && !headerData.inputDate) {
      showToast('Gagal Simpan: Tanggal Log masih kosong!', 'error');
      return;
    }

    setLoading(true);
    try {
      const path = 'reports';

      // Filter out empty items
      const validItems = items.filter(item => item.sku && item.sku.trim() !== '');
      if (validItems.length === 0) {
        showToast('Minimal satu item harus diisi', 'error');
        setLoading(false);
        return;
      }

      if (category === 'retur' || category === 'retur2') {
        const missingInvoice = validItems.some(item => !item.invoiceNumber?.trim() && !headerData.invoiceNumber?.trim());
        if (missingInvoice) {
          showToast('Gagal Simpan: Referensi Invoice wajib diisi (di form atas atau per item)!', 'error');
          setLoading(false);
          return;
        }
      }

      const reportItemsData: any[] = [];
      // Save each item as a separate document
      const promises = validItems.map(async item => {
        const isBundling = masterData.bundling_sku?.includes(item.sku);
        const finalStatus = isBundling ? "Bundling Fisik" : ((category === 'retur2' || category === 'stok_lt3' || category === 'rusak_internal') ? headerData.status : item.status);
        
        const reportData: any = {
          ...headerData,
          ...item,
          inputDate: (category === 'rusak_internal' && item.logDate) ? item.logDate : headerData.inputDate,
          date: (category === 'rusak_internal' && item.logDate) ? item.logDate : headerData.inputDate,
          status: finalStatus,
          type: category === 'rusak_internal' ? 'OUT' : (headerData.type || ''),
          sku_id: item.sku,
          assetStatus: (category === 'retur2' || category === 'stok_lt3' || category === 'rusak_internal') ? item.status : undefined,
          quantity: Number(item.quantity),
          createdBy: user.uid,
          created_at: serverTimestamp(),
          createdAt: serverTimestamp()
        };

        reportItemsData.push(reportData);
        return addDoc(collection(db, path), reportData);
      });

      await Promise.all(promises);

      // Perform a single bulk dashboard stats update to prevent lock contention
      try {
        await updateDashboardStatsBulk(reportItemsData, 'add');
      } catch (e) {
        console.error('Error updating stats bulk:', e);
      }

      // Delete draft after successful submit
      try {
        const draftId = `${user.uid}_${category}`;
        if (!auth.currentUser) {
          localStorage.removeItem(`draft_${draftId}`);
        } else {
          await deleteDoc(doc(db, 'form_drafts', draftId));
        }
      } catch (e) {
        console.error('Error deleting draft:', e);
        if (auth.currentUser) {
          try {
            handleFirestoreError(e, OperationType.DELETE, `form_drafts/${user.uid}_${category}`);
          } catch (err) {}
        }
      }

      // Reset form
      setHeaderData(prev => ({
        ...prev,
        invoiceNumber: '',
      }));
      setItems([{ sku: '', quantity: 1, status: '', itemDescription: '' }]);

      showToast('Semua data berhasil disimpan ke sistem.', 'success');

      if (category === 'rusak_internal') {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('switchTab', { detail: 'damaged_goods_report' }));
        }, 1500);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'reports');
      showToast('Gagal menyimpan data. Silakan coba lagi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleHeaderChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const finalValue = name === 'invoiceNumber' ? value.toUpperCase() : value;
    setHeaderData(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleResetAll = async () => {
    // Clear localStorage
    localStorage.removeItem('selectedPicGinee');
    localStorage.removeItem('selectedMarketplace');
    localStorage.removeItem('selectedMenuFisik');

    setHeaderData({
      inputDate: format(new Date(), 'yyyy-MM-dd'),
      gineeInputDate: '',
      picGinee: '',
      marketplace: '',
      invoiceNumber: '',
      type: '',
      category: category,
      status: ''
    });
    setItems([{ sku: '', quantity: 1, status: '', itemDescription: '' }]);

    // Also delete draft
    try {
      const draftId = `${user.uid}_${category}`;
      if (!auth.currentUser) {
        localStorage.removeItem(`draft_${draftId}`);
      } else {
        await deleteDoc(doc(db, 'form_drafts', draftId));
      }
    } catch (e) {
      console.error('Error deleting draft:', e);
      if (auth.currentUser) {
        try {
          handleFirestoreError(e, OperationType.DELETE, `form_drafts/${user.uid}_${category}`);
        } catch (err) {}
      }
    }
    
    showToast('Form dan draft berhasil direset total.', 'success');
  };

  if (isDraftLoading) {
    return (
      <div className="glass-card rounded-[40px] p-12 animate-pulse">
        <div className="flex items-center gap-4 mb-10 pb-6 border-b border-white/5">
          <div className="w-12 h-12 bg-slate-800 rounded-2xl" />
          <div className="space-y-2">
            <div className="h-4 w-40 bg-slate-800 rounded" />
            <div className="h-3 w-24 bg-slate-800 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-2 w-16 bg-slate-800 rounded" />
              <div className="h-12 bg-slate-800 rounded-2xl" />
            </div>
          ))}
        </div>
        <div className="space-y-6">
          <div className="h-4 w-32 bg-slate-800 rounded" />
          <div className="h-32 bg-slate-800 rounded-[32px]" />
        </div>
      </div>
    );
  }

  return (
    <>
      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleResetAll}
        title="Reset Semua Inputan?"
        message="Tindakan ini akan menghapus semua data yang sedang diinput, termasuk draft yang tersimpan di database dan pilihan kolom (PIC, Marketplace, Modul). Data tidak dapat dikembalikan."
        confirmLabel="RESET TOTAL"
        cancelLabel="BATAL"
        type="danger"
      />

      {isMassInputModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#120a32] border border-indigo-500/30 rounded-3xl p-6 w-full max-w-2xl shadow-2xl relative">
            <button onClick={() => setIsMassInputModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X size={20} />
            </button>
            <h3 className="text-xl font-black text-white mb-2 flex items-center gap-2"><ClipboardPaste size={20} className="text-indigo-400" /> Input Massal Stok Lantai 3</h3>
            <p className="text-xs text-indigo-300 font-bold mb-4">Paste data langsung dari Excel/Spreadsheet. Urutan kolom harus: 1. ID Pesanan, 2. Status, 3. Alasan Pembatalan, 4. MSKU, 5. Jumlah</p>
            <textarea
              value={massInputText}
              onChange={(e) => setMassInputText(e.target.value)}
              className="w-full h-48 bg-[#0a0520] border border-white/10 rounded-xl p-4 text-xs font-mono text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none mb-4"
              placeholder="Paste di sini..."
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsMassInputModalOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-300 hover:bg-white/5 transition-colors">Batal</button>
              <button onClick={handleMassInput} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-black text-white transition-colors">Proses Data</button>
            </div>
          </div>
        </div>
      )}

      <Toast  
        message={toast.message} 
        type={toast.type} 
        isVisible={toast.visible} 
        onClose={() => setToast(prev => ({ ...prev, visible: false }))} 
      />
      <div className="glass-card rounded-[40px] p-8 md:p-12 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
        <div className="flex items-center justify-between mb-10 pb-6 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
              <PlusCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Registrasi Sistem</h2>
              <div className="flex items-center gap-3 mt-0.5">
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Inisialisasi Transfer Data</p>
                {isSavingDraft && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full animate-pulse">
                    <div className="w-1 h-1 bg-emerald-400 rounded-full" />
                    <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Autosaving...</span>
                  </div>
                )}
                {!isSavingDraft && !isDraftLoading && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 border border-white/10 rounded-full">
                    <div className="w-1 h-1 bg-slate-500 rounded-full" />
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Draft Tersimpan</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {category !== 'rusak_internal' && (
            <button
              type="button"
              onClick={() => setIsConfirmOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest"
            >
              <RotateCcw className="w-3 h-3" />
              Reset All
            </button>
          )}
        </div>

      <form id="report-form" onSubmit={handleSubmit} className="space-y-12">
          {category !== 'rusak_internal' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-8 bg-white/5 rounded-[32px] border border-white/5 relative">
              <div className="absolute inset-0 overflow-hidden rounded-[32px] pointer-events-none">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[50px] rounded-full -mr-16 -mt-16" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Tanggal Log</label>
                <div className="relative group">
                  <input
                    required
                    type="date"
                    name="inputDate"
                    value={headerData.inputDate}
                    onChange={handleHeaderChange}
                    autoComplete="off"
                    className="w-full pl-12 pr-5 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none appearance-none cursor-pointer [color-scheme:dark] text-center"
                  />
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors pointer-events-none" />
                </div>
              </div>

              {(category === 'retur' || category === 'retur2') && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Tgl Input Ginee</label>
                    <div className="relative group">
                      <input
                        type="date"
                        name="gineeInputDate"
                        value={headerData.gineeInputDate}
                        onChange={handleHeaderChange}
                        autoComplete="off"
                        className="w-full pl-12 pr-5 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none appearance-none cursor-pointer [color-scheme:dark] text-center"
                      />
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-2 relative">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">PIC Input Ginee *</label>
                      <button
                        type="button"
                        onClick={handleResetPicGinee}
                        className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-tighter"
                      >
                        Hapus
                      </button>
                    </div>
                    <SearchableSelect
                      required
                      options={masterData.pic?.length ? masterData.pic : DEFAULT_PIC_OPTIONS}
                      value={headerData.picGinee}
                      onChange={handlePicGineeChange}
                      placeholder="Pilih Analis"
                    />
                  </div>

                  <div className="space-y-2 relative">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Marketplace *</label>
                      <button
                        type="button"
                        onClick={handleResetMarketplace}
                        className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-tighter"
                      >
                        Hapus
                      </button>
                    </div>
                    <SearchableSelect
                      required
                      options={masterData.marketplace?.length ? masterData.marketplace : DEFAULT_MARKETPLACE_OPTIONS}
                      value={headerData.marketplace}
                      onChange={handleMarketplaceChange}
                      placeholder="Pilih Marketplace"
                    />
                  </div>
                </>
              )}

              {(category === 'retur2') && (
                <div className="space-y-2 relative">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Analis (PIC) *</label>
                    <button
                      type="button"
                      onClick={handleResetPicGinee}
                      className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-tighter"
                    >
                      Hapus
                    </button>
                  </div>
                  <SearchableSelect
                    required
                    options={masterData.pic?.length ? masterData.pic : DEFAULT_PIC_OPTIONS}
                    value={headerData.picGinee}
                    onChange={handlePicGineeChange}
                    placeholder="Pilih Analis"
                  />
                </div>
              )}

              {(category === 'retur2') && (
                <div className="space-y-2 relative">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Modul Fisik *</label>
                    <button
                      type="button"
                      onClick={handleResetStatus}
                      className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-tighter"
                    >
                      Hapus
                    </button>
                  </div>
                  <SearchableSelect
                    required
                    options={["Retur Fisik", "Cancel Fisik", "Rusak Fisik", "Bundling Fisik"]}
                    value={headerData.status}
                    onChange={handleStatusChange}
                    placeholder="Pilih Jalur Logika..."
                  />
                </div>
              )}

              {((category === 'retur2' && headerData.status === 'Retur Fisik')) && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tipe Transaksi</label>
                    {headerData.type && (
                      <button
                        type="button"
                        onClick={() => setHeaderData(prev => ({ ...prev, type: '' }))}
                        className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-tighter"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <select
                      name="type"
                      value={headerData.type}
                      onChange={handleHeaderChange}
                      className="w-full px-5 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none appearance-none"
                    >
                      <option value="">(Standar)</option>
                      <option value="COD">C.O.D</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Referensi Invoice</label>
                <div className="relative group/invoice">
                  <input
                    type="text"
                    name="invoiceNumber"
                    value={headerData.invoiceNumber}
                    onChange={handleHeaderChange}
                    placeholder="Nomor Invoice..."
                    autoComplete="off"
                    className="w-full px-5 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white placeholder:text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none font-mono pr-12"
                  />
                  {headerData.invoiceNumber && (
                    <button
                      type="button"
                      onClick={() => setHeaderData(prev => ({ ...prev, invoiceNumber: '' }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {(category === 'rusak_internal' || category === 'stok_lt3') && (
            <div className="space-y-6">
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-8 border-2 rounded-[32px] flex items-start gap-6 relative overflow-hidden group shadow-xl ${category === 'rusak_internal' ? 'bg-rose-500/20 border-rose-500/40 shadow-[0_0_50px_rgba(244,63,94,0.1)]' : 'bg-indigo-500/10 border-indigo-500/30'}`}
              >
                <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r ${category === 'rusak_internal' ? 'from-rose-500/10' : 'from-indigo-500/5'} to-transparent`} />
                <div className={`p-4 rounded-2xl relative z-10 shadow-lg ${category === 'rusak_internal' ? 'bg-rose-500/30' : 'bg-indigo-500/20'}`}>
                  <AlertCircle className={`w-8 h-8 ${category === 'rusak_internal' ? 'text-rose-400' : 'text-indigo-400'}`} />
                </div>
                <div className="space-y-2 relative z-10">
                  <h4 className={`text-lg font-black uppercase tracking-[0.2em] ${category === 'rusak_internal' ? 'text-rose-400' : 'text-indigo-300'}`}>
                    {category === 'rusak_internal' ? 'Peringatan Stok Rusak Lantai 3' : 'Logistik Kontrol Fisik'}
                  </h4>
                  <p className={`text-sm font-bold leading-relaxed max-w-2xl ${category === 'rusak_internal' ? 'text-rose-300/80' : 'text-indigo-200/70'}`}>
                    {category === 'rusak_internal' 
                      ? 'Menu ini khusus digunakan untuk pencatatan eliminasi stok rusak yang berasal dari Lantai 3.'
                      : 'Pastikan data modul fisik dan detail item sudah akurat sebelum didaftarkan ke sistem.'}
                  </p>
                </div>
              </motion.div>

              <div className="px-2 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-500 uppercase tracking-[0.2em]">Logistik Item</h3>
                  <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-1">Input data {category === 'rusak_internal' ? 'eliminasi stok rusak' : 'logistik fisik'}</p>
                </div>
                {category === 'stok_lt3' && (
                  <button type="button" onClick={() => setIsMassInputModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 rounded-lg text-xs font-bold transition-colors border border-indigo-500/30">
                    <ClipboardPaste size={14} /> Input Massal
                  </button>
                )}
              </div>

              <div className="p-8 border border-white/10 rounded-[32px] bg-white/5 space-y-6 shadow-xl relative">
                <div className="absolute inset-0 overflow-hidden rounded-[32px] pointer-events-none">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[50px] rounded-full -mr-16 -mt-16" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10 mb-2">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Analis (PIC) *</label>
                      <button type="button" onClick={handleResetPicGinee} className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-tighter">Hapus</button>
                    </div>
                    <SearchableSelect
                      required
                      options={masterData.pic?.length ? masterData.pic : DEFAULT_PIC_OPTIONS}
                      value={headerData.picGinee}
                      onChange={handlePicGineeChange}
                      placeholder="Pilih Analis"
                    />
                  </div>

                  {category === 'stok_lt3' && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Modul Fisik *</label>
                        <button type="button" onClick={handleResetStatus} className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-tighter">Hapus</button>
                      </div>
                      <SearchableSelect
                        required
                        options={["Retur Fisik", "Cancel Fisik", "Rusak Fisik", "Bundling Fisik"]}
                        value={headerData.status}
                        onChange={handleStatusChange}
                        placeholder="Pilih Jalur Logika..."
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Tanggal Log *</label>
                    <div className="relative group">
                      <input
                        required
                        type="date"
                        value={inputItem.logDate}
                        onChange={(e) => setInputItem(prev => ({ ...prev, logDate: e.target.value }))}
                        className="w-full pl-12 pr-5 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none appearance-none cursor-pointer [color-scheme:dark] text-center"
                      />
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
                  <div className="lg:col-span-1">
                    <SearchableSelect
                      ref={skuSelectRef}
                      label="Tag Aset (SKU) *"
                      required
                      options={Array.from(new Set([...(masterData.sku || []), ...(masterData.bundling_sku || [])]))}
                      value={inputItem.sku}
                      onChange={(val) => setInputItem(prev => ({ ...prev, sku: val }))}
                      onAfterSelect={() => {
                        setTimeout(() => quantityRef.current?.focus(), 0);
                      }}
                      placeholder="Identifikasi SKU"
                      allowCustom={true}
                    />
                  </div>

                  <div className="space-y-2 lg:col-span-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Status Aset *</label>
                    <SearchableSelect
                      required
                      options={masterData.status || []}
                      value={inputItem.status}
                      onChange={(val) => setInputItem(prev => ({ ...prev, status: val }))}
                      placeholder="Tentukan Kondisi"
                      allowCustom={true}
                    />
                  </div>

                  <div className="space-y-2 lg:col-span-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Spesifikasi Teknis</label>
                    <input
                      type="text"
                      value={inputItem.itemDescription}
                      onChange={(e) => setInputItem(prev => ({ ...prev, itemDescription: e.target.value }))}
                      placeholder="Masukkan parameter..."
                      className="w-full px-5 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Kuantitas *</label>
                    <div className="flex gap-3">
                      <input
                        ref={quantityRef}
                        required
                        type="number"
                        min="1"
                        value={inputItem.quantity}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setInputItem(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addItemRow();
                          }
                        }}
                        className="flex-1 px-5 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none font-bold"
                      />
                      <button
                        type="button"
                        onClick={addItemRow}
                        className="px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Added Items List */}
              {items.length > 0 && items[0].sku && (
                <div className="space-y-4 pt-4">
                  <div className="px-2 flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Daftar Item Terinput</h4>
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{items.filter(i => i.sku).length} Item</span>
                  </div>
                  
                  <div className="bg-white/5 border border-white/10 rounded-[24px] overflow-hidden shadow-2xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/5 bg-white/[0.02]">
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Tanggal</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Invoice</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">SKU</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Kuantitas</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Keterangan</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {items.map((item, idx) => item.sku && (
                          <tr key={idx} className="group hover:bg-white/[0.02] transition-colors">
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold text-slate-300">{item.logDate}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold text-indigo-300">{item.invoiceNumber || '-'}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-black text-white tracking-wide">{item.sku}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-black text-indigo-400">{item.quantity}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-[10px] text-slate-400 font-bold">{item.status || '-'}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-[10px] text-slate-500 italic line-clamp-1">{item.itemDescription || '-'}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => removeItemRow(idx)}
                                className="p-2 text-slate-600 hover:text-rose-400 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        {/* General Items Section for others */}
        {category !== 'rusak_internal' && category !== 'stok_lt3' && (
          <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <div>
              <h3 className="text-sm font-black text-slate-500 uppercase tracking-[0.2em]">Logistik Item</h3>
              <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-1">Pemetaan alokasi sumber daya</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsMassInputModalOpen(true)}
                className="flex items-center gap-2 text-xs font-black text-indigo-400 hover:text-indigo-300 transition-all bg-indigo-500/10 px-4 py-2.5 rounded-xl border border-indigo-500/20 group"
              >
                <ClipboardPaste size={14} className="group-hover:scale-110 transition-transform" />
                INPUT MASSAL
              </button>
              <button
                type="button"
                onClick={addItemRow}
                className="flex items-center gap-2 text-xs font-black text-indigo-400 hover:text-indigo-300 transition-all bg-indigo-500/10 px-4 py-2.5 rounded-xl border border-indigo-500/20 group"
              >
                <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                TAMBAH SUMBER DAYA
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {items.map((item, index) => {
              const groupStyle = item.invoiceNumber ? getInvoiceStyle(item.invoiceNumber) : null;
              
              return (
              <div key={index} className={`relative p-8 border rounded-[32px] hover:bg-white/[0.04] transition-all space-y-6 shadow-xl ${groupStyle ? `bg-gradient-to-br ${groupStyle.bg} ${groupStyle.border}` : 'bg-white/[0.02] border-white/5'}`}>
                {groupStyle && (
                  <div className={`absolute -top-3 left-8 px-4 py-1.5 border rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg z-10 ${groupStyle.badge} ${groupStyle.text}`}>
                    <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
                    Kesatuan Data
                  </div>
                )}

                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItemRow(index)}
                    className="absolute -top-3 -right-3 p-2.5 bg-[#0f172a] text-rose-400 border border-white/10 rounded-2xl hover:bg-rose-500 hover:text-white transition-all shadow-xl group"
                  >
                    <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  </button>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="lg:col-span-1">
                    <SearchableSelect
                      label="Tag Aset (SKU)"
                      required
                      options={Array.from(new Set([...(masterData.sku || []), ...(masterData.bundling_sku || [])]))}
                      value={item.sku}
                      onChange={(val) => updateItemRow(index, 'sku', val)}
                      placeholder="Identifikasi SKU"
                      allowCustom={true}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Kuantitas</label>
                    <input
                      required
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItemRow(index, 'quantity', e.target.value)}
                      autoComplete="off"
                      className="w-full px-5 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none font-bold"
                    />
                  </div>

                  <div className="lg:col-span-1">
                      <SearchableSelect
                        label="Status Aset"
                        required
                        options={masterData.status || []}
                        value={item.status}
                        onChange={(val) => updateItemRow(index, 'status', val)}
                        placeholder="Tentukan Kondisi"
                        allowCustom={true}
                      />
                  </div>

                  <div className="space-y-2 lg:col-span-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Referensi Invoice (Item)</label>
                    <input
                      type="text"
                      value={item.invoiceNumber || ''}
                      onChange={(e) => updateItemRow(index, 'invoiceNumber', e.target.value)}
                      placeholder="Otomatis / Ikut Global"
                      className="w-full px-5 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none text-xs font-mono"
                    />
                  </div>

                  <div className="md:col-span-2 lg:col-span-4 space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Spesifikasi Teknis</label>
                    <textarea
                      value={item.itemDescription}
                      onChange={(e) => updateItemRow(index, 'itemDescription', e.target.value)}
                      placeholder="Masukkan parameter lingkungan atau struktural terperinci..."
                      rows={1}
                      autoComplete="off"
                      className="w-full px-5 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none resize-none placeholder:text-slate-700 min-h-[58px]"
                    />
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}
      </form>
      </div>

      <div className="fixed bottom-10 right-10 z-[100]">
          <button
            type="submit"
            form="report-form"
            disabled={loading}
            className={`${category === 'rusak_internal' ? 'flex items-center gap-4 px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-[24px] transition-all shadow-[0_20px_50px_rgba(79,70,229,0.4)] hover:scale-105 active:scale-95 text-sm uppercase tracking-widest border border-white/20' : 'glow-btn flex items-center gap-3 px-16 py-4.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-2xl shadow-indigo-900/30 disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-widest'}`}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {category === 'rusak_internal' ? (
                  <>
                    <span>KIRIM</span>
                    <Send className="w-5 h-5" />
                  </>
                ) : (
                  <>
                    <span>EKSEKUSI KOMIT</span>
                    <Send className="w-5 h-5" />
                  </>
                )}
              </>
            )}
          </button>
        </div>
    </>
  );
}
