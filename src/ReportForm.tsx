import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp, onSnapshot, query, setDoc, getDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { OperationType } from './types';
import { handleFirestoreError } from './utils';
import { format, isToday } from 'date-fns';
import { 
  Loader2, PlusCircle, Trash2, Plus, X, RotateCcw, AlertCircle, 
  Send, Calendar, ClipboardPaste, PackagePlus, AlertTriangle, 
  Boxes, ShieldAlert, CheckCircle2, Sparkles, FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import SearchableSelect, { SearchableSelectHandle } from './SearchableSelect';
import Toast, { ToastType } from './Toast';
import ConfirmModal from './ConfirmModal';

import { updateDashboardStats, updateDashboardStatsBulk } from './stats';

interface FieldErrors {
  headerMarketplace?: boolean;
  headerPic?: boolean;
  headerStatus?: boolean;
  inputItemSku?: boolean;
  inputItemStatus?: boolean;
  rows: Record<number, {
    marketplace?: boolean;
    invoiceNumber?: boolean;
    sku?: boolean;
    status?: boolean;
    quantity?: boolean;
  }>;
}

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
  marketplace?: string;
}

const getInvoiceStyle = (invoice: string) => {
  if (!invoice) return null;
  const styles = [
    { bg: 'from-purple-500/10 to-transparent', border: 'border-purple-500/30', text: 'text-purple-300', badge: 'bg-purple-500/20 border-purple-500/30' },
    { bg: 'from-emerald-500/10 to-transparent', border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-500/20 border-emerald-500/30' },
    { bg: 'from-amber-500/10 to-transparent', border: 'border-amber-500/30', text: 'text-amber-400', badge: 'bg-amber-500/20 border-amber-500/30' },
    { bg: 'from-cyan-500/10 to-transparent', border: 'border-cyan-500/30', text: 'text-cyan-400', badge: 'bg-cyan-500/20 border-cyan-500/30' },
    { bg: 'from-pink-500/10 to-transparent', border: 'border-pink-500/30', text: 'text-pink-400', badge: 'bg-pink-500/20 border-pink-500/30' },
    { bg: 'from-rose-500/10 to-transparent', border: 'border-rose-500/30', text: 'text-rose-400', badge: 'bg-rose-500/20 border-rose-500/30' },
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

  // Field errors state for visual validation feedback
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({ rows: {} });

  // Entry Mode: 'batch' (1 Invoice Global) vs 'single' (Per Baris)
  const [entryMode, setEntryMode] = useState<'batch' | 'single'>(() => {
    return (localStorage.getItem('reportForm_entryMode') as 'batch' | 'single') || 'batch';
  });

  const handleEntryModeChange = (mode: 'batch' | 'single') => {
    setEntryMode(mode);
    localStorage.setItem('reportForm_entryMode', mode);
  };

  const [masterData, setMasterData] = useState<Record<string, string[]>>({});
  const [headerData, setHeaderData] = useState({
    inputDate: localStorage.getItem('selectedLogDate') || format(new Date(), 'yyyy-MM-dd'),
    gineeInputDate: '',
    picGinee: (category === 'retur' || category === 'retur2' || category === 'rusak_internal' || category === 'stok_lt3') ? (localStorage.getItem('selectedPicGinee') || '') : '',
    marketplace: (category === 'retur' || category === 'retur2') ? (localStorage.getItem('selectedMarketplace') || '') : '',
    invoiceNumber: '',
    type: '',
    category: category,
    status: category === 'rusak_internal' ? 'Eliminasi Stok Rusak' : ((category === 'stok_lt3' || category === 'retur2') ? (localStorage.getItem('selectedMenuFisik') || '') : '')
  });

  const handleLogDateChange = (val: string) => {
    setInputItem(prev => ({ ...prev, logDate: val }));
    setHeaderData(prev => ({ ...prev, inputDate: val }));
    if (val) {
      localStorage.setItem('selectedLogDate', val);
    }
  };

  const handleResetLogDate = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setInputItem(prev => ({ ...prev, logDate: today }));
    setHeaderData(prev => ({ ...prev, inputDate: today }));
    localStorage.setItem('selectedLogDate', today);
  };

  useEffect(() => {
    setHeaderData(prev => ({
      ...prev,
      category,
      type: '',
      inputDate: localStorage.getItem('selectedLogDate') || prev.inputDate || format(new Date(), 'yyyy-MM-dd'),
      picGinee: (category === 'retur' || category === 'retur2' || category === 'rusak_internal' || category === 'stok_lt3') ? (localStorage.getItem('selectedPicGinee') || '') : prev.picGinee,
      marketplace: (category === 'retur' || category === 'retur2') ? (localStorage.getItem('selectedMarketplace') || '') : prev.marketplace,
      status: category === 'rusak_internal' ? 'Eliminasi Stok Rusak' : ((category === 'stok_lt3' || category === 'retur2') ? (localStorage.getItem('selectedMenuFisik') || '') : prev.status)
    }));
    setInputItem(prev => ({
      ...prev,
      logDate: localStorage.getItem('selectedLogDate') || prev.logDate || format(new Date(), 'yyyy-MM-dd'),
      status: category === 'rusak_internal' ? 'Eliminasi Stok Rusak' : prev.status
    }));
    setFieldErrors({ rows: {} });
  }, [category]);

  const handlePicGineeChange = (val: string) => {
    setHeaderData(prev => ({ ...prev, picGinee: val }));
    setFieldErrors(prev => ({ ...prev, headerPic: false }));
    if (category === 'retur' || category === 'retur2' || category === 'rusak_internal' || category === 'stok_lt3') {
      localStorage.setItem('selectedPicGinee', val);
    }
  };

  const handleMarketplaceChange = (val: string) => {
    setHeaderData(prev => ({ ...prev, marketplace: val }));
    setFieldErrors(prev => ({ ...prev, headerMarketplace: false }));
    if (category === 'retur' || category === 'retur2') {
      localStorage.setItem('selectedMarketplace', val);
    }
  };

  const handleResetPicGinee = () => {
    setHeaderData(prev => ({ ...prev, picGinee: '' }));
    setFieldErrors(prev => ({ ...prev, headerPic: false }));
    localStorage.removeItem('selectedPicGinee');
  };

  const handleResetMarketplace = () => {
    setHeaderData(prev => ({ ...prev, marketplace: '' }));
    setFieldErrors(prev => ({ ...prev, headerMarketplace: false }));
    localStorage.removeItem('selectedMarketplace');
  };

  const handleStatusChange = (val: string) => {
    setHeaderData(prev => ({ ...prev, status: val }));
    setFieldErrors(prev => ({ ...prev, headerStatus: false }));
    if (category === 'stok_lt3' || category === 'retur2' || category === 'rusak_internal') {
      localStorage.setItem('selectedMenuFisik', val);
    }
  };

  const handleResetStatus = () => {
    setHeaderData(prev => ({ ...prev, status: '' }));
    setFieldErrors(prev => ({ ...prev, headerStatus: false }));
    localStorage.removeItem('selectedMenuFisik');
  };

  const [items, setItems] = useState<ItemRow[]>([
    { sku: '', quantity: 1, status: '', itemDescription: '', invoiceNumber: '', marketplace: '' }
  ]);

  const [toast, setToast] = useState<{ message: string; type: ToastType; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isDraftLoading, setIsDraftLoading] = useState(true);

  // Single item entry state for rusak_internal / stok_lt3
  const [inputItem, setInputItem] = useState<ItemRow>({
    sku: '',
    quantity: 1,
    status: category === 'rusak_internal' ? 'Eliminasi Stok Rusak' : '',
    itemDescription: '',
    logDate: localStorage.getItem('selectedLogDate') || format(new Date(), 'yyyy-MM-dd')
  });

  // Mass input state
  const [isMassInputModalOpen, setIsMassInputModalOpen] = useState(false);
  const [massInputText, setMassInputText] = useState('');

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type, visible: true });
  };

  // Fetch Master Data
  useEffect(() => {
    const q = query(collection(db, 'master_data'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Record<string, string[]> = {};
      snapshot.docs.forEach(doc => {
        data[doc.id] = doc.data().options || [];
      });
      setMasterData(data);
    });
    return () => unsubscribe();
  }, []);

  // Load Draft
  useEffect(() => {
    if (!user) {
      setIsDraftLoading(false);
      return;
    }

    const loadDraft = async () => {
      try {
        const draftId = `${user.uid}_${category}`;
        let draftData: any = null;

        if (!auth.currentUser) {
          const localDraft = localStorage.getItem(`draft_${draftId}`);
          if (localDraft) {
            draftData = JSON.parse(localDraft);
          }
        } else {
          const docRef = doc(db, 'form_drafts', draftId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            draftData = docSnap.data();
          }
        }

        if (draftData) {
          if (draftData.headerData) {
            setHeaderData(prev => ({
              ...prev,
              ...draftData.headerData,
              category
            }));
          }
          if (draftData.items && draftData.items.length > 0) {
            setItems(draftData.items);
          }
          if (draftData.inputItem) {
            setInputItem(draftData.inputItem);
          }
          if (draftData.entryMode) {
            setEntryMode(draftData.entryMode);
          }
        }
      } catch (e) {
        console.error('Error loading draft:', e);
      } finally {
        setIsDraftLoading(false);
      }
    };

    loadDraft();
  }, [user, category]);

  // Save Draft (Debounced)
  useEffect(() => {
    if (isDraftLoading || !user) return;

    const saveDraftTimer = setTimeout(async () => {
      try {
        setIsSavingDraft(true);
        const draftId = `${user.uid}_${category}`;
        const draftData = {
          headerData,
          items,
          inputItem,
          entryMode,
          updatedAt: new Date().toISOString()
        };

        if (!auth.currentUser) {
          localStorage.setItem(`draft_${draftId}`, JSON.stringify(draftData));
        } else {
          await setDoc(doc(db, 'form_drafts', draftId), draftData, { merge: true });
        }
      } catch (e) {
        console.warn('Error saving draft:', e);
      } finally {
        setIsSavingDraft(false);
      }
    }, 1000);

    return () => clearTimeout(saveDraftTimer);
  }, [headerData, items, inputItem, entryMode, user, category, isDraftLoading]);

  const addItemRow = () => {
    if (category === 'rusak_internal' || category === 'stok_lt3') {
      if (!inputItem.sku) {
        showToast('Pilih SKU terlebih dahulu!', 'error');
        return;
      }
      setItems(prev => {
        const hasEmptyFirst = prev.length === 1 && !prev[0].sku;
        const newItem: ItemRow = {
          ...inputItem,
          status: category === 'rusak_internal' ? 'Eliminasi Stok Rusak' : inputItem.status,
          logDate: inputItem.logDate || headerData.inputDate,
          invoiceNumber: '',
          marketplace: ''
        };
        return hasEmptyFirst ? [newItem] : [...prev, newItem];
      });
      setInputItem(prev => ({
        ...prev,
        sku: '',
        quantity: 1,
        itemDescription: '',
        invoiceNumber: '',
        marketplace: ''
      }));
      setFieldErrors(prev => ({ ...prev, inputItemSku: false, inputItemStatus: false }));
      skuSelectRef.current?.focus();
    } else {
      setItems(prev => [
        ...prev,
        { sku: '', quantity: 1, status: '', itemDescription: '', invoiceNumber: '', marketplace: '' }
      ]);
    }
  };

  const removeItemRow = (index: number) => {
    if (items.length === 1) {
      setItems([{ sku: '', quantity: 1, status: '', itemDescription: '', invoiceNumber: '', marketplace: '' }]);
      setFieldErrors(prev => ({ ...prev, rows: {} }));
    } else {
      setItems(prev => prev.filter((_, i) => i !== index));
      setFieldErrors(prev => {
        const nextRows: typeof prev.rows = {};
        let newIdx = 0;
        items.forEach((_, i) => {
          if (i !== index) {
            if (prev.rows[i]) {
              nextRows[newIdx] = prev.rows[i];
            }
            newIdx++;
          }
        });
        return { ...prev, rows: nextRows };
      });
    }
  };

  const updateItemRow = (index: number, field: keyof ItemRow, value: any) => {
    // Clear error for this field if active
    setFieldErrors(prev => {
      if (!prev.rows[index] || !prev.rows[index][field as keyof typeof prev.rows[0]]) return prev;
      return {
        ...prev,
        rows: {
          ...prev.rows,
          [index]: {
            ...prev.rows[index],
            [field]: false
          }
        }
      };
    });

    setItems(prev => {
      const next = [...prev];
      const updatedItem = { ...next[index], [field]: value };

      // In single mode: If user enters/updates invoiceNumber, check if another row already has this invoiceNumber.
      // If yes, automatically copy Marketplace and Status Aset from that row!
      if (entryMode === 'single' && field === 'invoiceNumber' && typeof value === 'string') {
        const trimmedInvoice = value.trim().toUpperCase();
        if (trimmedInvoice) {
          const match = prev.find((it, idx) => idx !== index && it.invoiceNumber && it.invoiceNumber.trim().toUpperCase() === trimmedInvoice);
          if (match) {
            if (match.marketplace) {
              updatedItem.marketplace = match.marketplace;
            }
            if (match.status) {
              updatedItem.status = match.status;
            }
          }
        }
      }

      next[index] = updatedItem;
      return next;
    });
  };

  const handleMassInput = () => {
    if (!massInputText.trim()) return;
    const lines = massInputText.split('\n');
    const newItems: ItemRow[] = [];

    lines.forEach(line => {
      const parts = line.split('\t').map(p => p.trim());
      if (parts.length >= 4) {
        // [0] ID Pesanan, [1] Status, [2] Alasan, [3] MSKU, [4] Qty
        const invoiceNumber = parts[0] || '';
        const status = parts[1] || '';
        const reason = parts[2] || '';
        const sku = parts[3] || '';
        const quantity = parseInt(parts[4]) || 1;

        if (sku) {
          newItems.push({
            sku,
            quantity,
            status: category === 'rusak_internal' ? 'Eliminasi Stok Rusak' : (status || headerData.status || 'Retur Fisik'),
            itemDescription: reason,
            invoiceNumber,
            marketplace: headerData.marketplace || '',
            logDate: headerData.inputDate
          });
        }
      }
    });

    if (newItems.length > 0) {
      setItems(prev => {
        const hasEmptyFirst = prev.length === 1 && !prev[0].sku;
        return hasEmptyFirst ? newItems : [...prev, ...newItems];
      });
      setFieldErrors({ rows: {} });
      showToast(`${newItems.length} data berhasil diimpor!`, 'success');
      setIsMassInputModalOpen(false);
      setMassInputText('');
    } else {
      showToast('Format data tidak sesuai. Pastikan kolom dipisahkan oleh Tab.', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const newErrors: FieldErrors = { rows: {} };
    let hasError = false;
    let firstErrorMessage = '';

    // 1. Validasi Header untuk retur / retur2 / stok_lt3 / rusak_internal
    if (category === 'retur' || category === 'retur2' || category === 'stok_lt3' || category === 'rusak_internal') {
      if (!headerData.picGinee || !headerData.picGinee.trim()) {
        newErrors.headerPic = true;
        hasError = true;
        if (!firstErrorMessage) firstErrorMessage = 'PIC Analis wajib dipilih!';
      }
    }

    if (category === 'retur' || category === 'retur2') {
      if (entryMode === 'batch' && (!headerData.marketplace || !headerData.marketplace.trim())) {
        newErrors.headerMarketplace = true;
        hasError = true;
        if (!firstErrorMessage) firstErrorMessage = 'Marketplace wajib dipilih!';
      }
    }

    if (category === 'retur2' && (!headerData.status || !headerData.status.trim())) {
      newErrors.headerStatus = true;
      hasError = true;
      if (!firstErrorMessage) firstErrorMessage = 'Modul Fisik wajib dipilih!';
    }

    if (category === 'stok_lt3' && (!headerData.status || !headerData.status.trim())) {
      newErrors.headerStatus = true;
      hasError = true;
      if (!firstErrorMessage) firstErrorMessage = 'Modul Fisik wajib dipilih!';
    }

    // 2. Validasi Items
    if (category === 'rusak_internal' || category === 'stok_lt3') {
      const hasAddedItems = items.some(i => i.sku && i.sku.trim());
      if (!hasAddedItems) {
        if (!inputItem.sku || !inputItem.sku.trim()) {
          newErrors.inputItemSku = true;
          hasError = true;
          if (!firstErrorMessage) firstErrorMessage = 'Tag Aset (SKU) wajib dipilih dan ditambahkan ke daftar!';
        }
      }
    } else {
      // Retur / Retur2 mode
      if (items.length === 0) {
        hasError = true;
        if (!firstErrorMessage) firstErrorMessage = 'Harap tambahkan minimal 1 baris item!';
      } else {
        items.forEach((item, idx) => {
          const rowErr: { marketplace?: boolean; invoiceNumber?: boolean; sku?: boolean; status?: boolean; quantity?: boolean } = {};
          
          if (!item.sku || !item.sku.trim()) {
            rowErr.sku = true;
            hasError = true;
            if (!firstErrorMessage) firstErrorMessage = `Baris #${idx + 1}: Tag Aset (SKU) wajib dipilih!`;
          }

          if (!item.status || !item.status.trim()) {
            rowErr.status = true;
            hasError = true;
            if (!firstErrorMessage) firstErrorMessage = `Baris #${idx + 1}: Status Aset wajib dipilih!`;
          }

          if (!item.quantity || Number(item.quantity) <= 0) {
            rowErr.quantity = true;
            hasError = true;
            if (!firstErrorMessage) firstErrorMessage = `Baris #${idx + 1}: Kuantitas minimal 1!`;
          }

          if (entryMode === 'single') {
            if (!item.marketplace || !item.marketplace.trim()) {
              rowErr.marketplace = true;
              hasError = true;
              if (!firstErrorMessage) firstErrorMessage = `Baris #${idx + 1}: Marketplace wajib dipilih!`;
            }
            if (!item.invoiceNumber || !item.invoiceNumber.trim()) {
              rowErr.invoiceNumber = true;
              hasError = true;
              if (!firstErrorMessage) firstErrorMessage = `Baris #${idx + 1}: Referensi Invoice / Resi wajib diisi!`;
            }
          }

          if (Object.keys(rowErr).length > 0) {
            newErrors.rows[idx] = rowErr;
          }
        });
      }
    }

    if (hasError) {
      setFieldErrors(newErrors);
      showToast(firstErrorMessage || 'Lengkapi semua kolom wajib bertanda bintang (*)!', 'error');
      return;
    }

    setFieldErrors({ rows: {} });

    // Filter items to submit
    const validItems = (category === 'rusak_internal' || category === 'stok_lt3')
      ? items.filter(i => i.sku.trim() !== '')
      : items;

    if (validItems.length === 0) {
      showToast('Harap masukkan minimal 1 item/SKU yang valid!', 'error');
      return;
    }

    setLoading(true);

    try {
      const reportItemsData = validItems.map(item => {
        let resolvedMarketplace = headerData.marketplace || '';
        let resolvedInvoice = (item.invoiceNumber && item.invoiceNumber.trim()) ? item.invoiceNumber.trim() : (headerData.invoiceNumber ? headerData.invoiceNumber.trim() : '');

        if (entryMode === 'single' && (category === 'retur' || category === 'retur2')) {
          resolvedMarketplace = item.marketplace || '';
          resolvedInvoice = item.invoiceNumber ? item.invoiceNumber.trim() : '';
        }

        const effectiveDate = item.logDate || headerData.inputDate || format(new Date(), 'yyyy-MM-dd');
        const defaultStatus = category === 'rusak_internal' ? 'Eliminasi Stok Rusak' : 'Retur Fisik';
        const finalStatus = item.status || headerData.status || defaultStatus;

        return {
          date: effectiveDate,
          inputDate: effectiveDate,
          gineeInputDate: headerData.gineeInputDate || '',
          picGinee: headerData.picGinee || '',
          marketplace: resolvedMarketplace,
          invoiceNumber: resolvedInvoice,
          sku: item.sku,
          quantity: Number(item.quantity) || 1,
          status: finalStatus,
          assetStatus: finalStatus,
          modul_fisik: headerData.status || finalStatus,
          itemDescription: item.itemDescription || '',
          type: headerData.type || '',
          category: category,
          createdAt: serverTimestamp(),
          created_at: serverTimestamp(),
          timestamp: serverTimestamp(),
          createdBy: auth.currentUser?.uid || user?.uid || 'anonymous',
          userEmail: user?.email || '',
          userId: user?.uid || auth.currentUser?.uid || 'anonymous'
        };
      });

      // Submit reports
      for (const itemData of reportItemsData) {
        await addDoc(collection(db, 'reports'), itemData);
      }

      // Update Dashboard Stats Bulk
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
      }

      // Reset form
      setHeaderData(prev => ({
        ...prev,
        invoiceNumber: '',
      }));
      setItems([{ sku: '', quantity: 1, status: '', itemDescription: '', invoiceNumber: '', marketplace: '' }]);

      showToast('Semua data berhasil disimpan ke sistem.', 'success');

      if (category === 'rusak_internal') {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('switchTab', { detail: 'damaged_goods_report' }));
        }, 1200);
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
    if (name === 'inputDate') {
      if (value) {
        localStorage.setItem('selectedLogDate', value);
      }
      setInputItem(prev => ({ ...prev, logDate: value }));
    }
  };

  const handleResetAll = async () => {
    localStorage.removeItem('selectedPicGinee');
    localStorage.removeItem('selectedMarketplace');
    localStorage.removeItem('selectedMenuFisik');
    localStorage.removeItem('selectedLogDate');

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    setHeaderData({
      inputDate: todayStr,
      gineeInputDate: '',
      picGinee: '',
      marketplace: '',
      invoiceNumber: '',
      type: '',
      category: category,
      status: ''
    });
    setInputItem({
      sku: '',
      quantity: 1,
      status: category === 'rusak_internal' ? 'Eliminasi Stok Rusak' : '',
      itemDescription: '',
      logDate: todayStr
    });
    setItems([{ sku: '', quantity: 1, status: '', itemDescription: '', invoiceNumber: '', marketplace: '' }]);

    try {
      const draftId = `${user.uid}_${category}`;
      if (!auth.currentUser) {
        localStorage.removeItem(`draft_${draftId}`);
      } else {
        await deleteDoc(doc(db, 'form_drafts', draftId));
      }
    } catch (e) {
      console.error('Error deleting draft:', e);
    }
    
    showToast('Form dan draft berhasil direset total.', 'success');
  };

  const getCategoryInfo = () => {
    switch (category) {
      case 'rusak_internal':
        return {
          title: 'ELIMINASI STOK RUSAK',
          badge: 'v2.6-DAMAGE',
          subtitle: 'Pencatatan & Pengurangan Fisik Stok Rusak Lantai 3',
          icon: <AlertCircle className="w-7 h-7 text-rose-400" />,
          iconBg: 'from-rose-600/25 to-pink-600/25 border-rose-500/30 shadow-rose-950/50',
          badgeStyle: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          submitBtnStyle: 'from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 shadow-rose-950/50'
        };
      case 'stok_lt3':
        return {
          title: 'INPUT STOK LANTAI 3',
          badge: 'v2.6-STOCK',
          subtitle: 'Manajemen Logistik & Kontrol Fisik Barang Lantai 3',
          icon: <Boxes className="w-7 h-7 text-cyan-400" />,
          iconBg: 'from-cyan-600/25 to-blue-600/25 border-cyan-500/30 shadow-cyan-950/50',
          badgeStyle: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
          submitBtnStyle: 'from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-950/50'
        };
      default:
        return {
          title: 'INPUT RETUR / LT 3',
          badge: 'v2.6-RETUR',
          subtitle: 'Registrasi Alokasi Retur & Logistik Fisik Lantai 3',
          icon: <PackagePlus className="w-7 h-7 text-purple-400" />,
          iconBg: 'from-purple-600/25 to-indigo-600/25 border-purple-500/30 shadow-purple-950/50',
          badgeStyle: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
          submitBtnStyle: 'from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-950/50'
        };
    }
  };

  const catInfo = getCategoryInfo();

  if (isDraftLoading) {
    return (
      <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-8 md:p-12 animate-pulse space-y-6">
        <div className="flex items-center gap-4 pb-6 border-b border-purple-900/30">
          <div className="w-12 h-12 bg-purple-900/40 rounded-2xl" />
          <div className="space-y-2">
            <div className="h-4 w-48 bg-purple-900/40 rounded" />
            <div className="h-3 w-32 bg-purple-900/20 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-purple-900/20 rounded-xl" />
          ))}
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

      {/* Mass Input Modal */}
      {isMassInputModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#130b2e] border border-purple-800/40 rounded-3xl p-6 md:p-8 w-full max-w-2xl shadow-2xl relative shadow-purple-950/80">
            <button 
              onClick={() => setIsMassInputModalOpen(false)} 
              className="absolute top-5 right-5 p-2 text-purple-300 hover:text-white bg-[#0c0620] hover:bg-purple-900/40 rounded-full border border-purple-800/40 transition-colors"
            >
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <ClipboardPaste size={20} />
              </div>
              <h3 className="text-xl font-black text-white">Input Massal dari Spreadsheet / Excel</h3>
            </div>
            <p className="text-xs text-purple-300/70 mb-4 leading-relaxed">
              Copy-paste data langsung dari Excel / Google Sheets.<br/>
              <b>Urutan Kolom (Tab-separated):</b> <code>1. ID Pesanan</code> | <code>2. Status</code> | <code>3. Alasan / Keterangan</code> | <code>4. MSKU</code> | <code>5. Jumlah</code>
            </p>
            <textarea
              value={massInputText}
              onChange={(e) => setMassInputText(e.target.value)}
              className="w-full h-48 bg-[#0c0620]/90 border border-purple-900/40 rounded-2xl p-4 text-xs font-mono text-purple-100 placeholder-purple-400/30 focus:ring-2 focus:ring-purple-500 outline-none mb-4"
              placeholder={`Contoh:\nINV/2026/001\tRetur Fisik\tBarang Cacat\tSKU-ABC-01\t2\nINV/2026/002\tRetur Fisik\tSalah Ukuran\tSKU-XYZ-02\t1`}
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setIsMassInputModalOpen(false)} 
                className="px-5 py-2.5 rounded-xl font-bold text-purple-300 hover:text-white hover:bg-white/5 transition-colors text-xs"
              >
                Batal
              </button>
              <button 
                onClick={handleMassInput} 
                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl font-black text-white text-xs uppercase tracking-wider transition-all shadow-lg shadow-purple-950/40"
              >
                Proses Data
              </button>
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

      <div className="space-y-6 pb-24 relative animate-fade-in">
        {/* Top Header Card */}
        <div className="bg-[#130b2e]/90 border border-purple-900/30 p-6 md:p-7 rounded-2xl shadow-xl relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-purple-600/10 blur-[130px] rounded-full pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
            <div className="flex items-center gap-4">
              <div className={`w-13 h-13 p-3.5 bg-gradient-to-tr rounded-2xl flex items-center justify-center border shadow-lg ${catInfo.iconBg}`}>
                {catInfo.icon}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">{catInfo.title}</h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase border ${catInfo.badgeStyle}`}>
                    {catInfo.badge}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse shadow-sm shadow-purple-400" />
                  <p className="text-purple-300/80 text-xs font-bold uppercase tracking-widest">
                    {catInfo.subtitle}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isSavingDraft ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl animate-pulse">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Autosaving...</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0c0620]/80 border border-purple-900/40 rounded-xl">
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full" />
                  <span className="text-[10px] font-bold text-purple-300/70 uppercase tracking-widest">Draft Tersimpan</span>
                </div>
              )}

              {category !== 'rusak_internal' && (
                <button
                  type="button"
                  onClick={() => setIsConfirmOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-2 bg-[#0c0620] hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-purple-900/40 hover:border-rose-500/30 rounded-xl transition-all text-xs font-bold uppercase tracking-wider"
                  title="Reset Semua Inputan"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset All</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Warning Banner for Rusak Internal or Stok Lt 3 */}
        {(category === 'rusak_internal' || category === 'stok_lt3') && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-5 rounded-2xl border flex items-start gap-4 shadow-lg backdrop-blur-md ${
              category === 'rusak_internal' 
                ? 'bg-rose-950/30 border-rose-500/40 shadow-rose-950/20' 
                : 'bg-purple-950/30 border-purple-500/30 shadow-purple-950/20'
            }`}
          >
            <div className={`p-3 rounded-xl ${category === 'rusak_internal' ? 'bg-rose-500/20 text-rose-400' : 'bg-purple-500/20 text-purple-400'}`}>
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h4 className={`text-sm font-black uppercase tracking-wider ${category === 'rusak_internal' ? 'text-rose-300' : 'text-purple-200'}`}>
                {category === 'rusak_internal' ? 'Peringatan Pencatatan Stok Rusak' : 'Logistik Kontrol Fisik'}
              </h4>
              <p className="text-xs text-purple-300/80 font-medium leading-relaxed mt-0.5">
                {category === 'rusak_internal' 
                  ? 'Menu ini khusus untuk eliminasi & pengurangan fisik barang rusak dari Lantai 3.'
                  : 'Pastikan data modul fisik dan kuantitas aset terisi secara teliti sebelum dikomit ke database.'}
              </p>
            </div>
          </motion.div>
        )}

        {/* Mode Selector Toggle (Input Sekaligus vs Satu per Satu) */}
        {category !== 'rusak_internal' && category !== 'stok_lt3' && (
          <div className="bg-[#130b2e]/90 border border-purple-900/30 p-1.5 md:p-2 rounded-2xl flex items-center gap-2 shadow-xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => handleEntryModeChange('batch')}
              className={`flex-1 py-2.5 md:py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                entryMode === 'batch'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/50 border border-purple-400/30'
                  : 'text-purple-300/70 hover:text-white hover:bg-purple-900/20'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>Input Sekaligus (1 Invoice Global)</span>
            </button>
            <button
              type="button"
              onClick={() => handleEntryModeChange('single')}
              className={`flex-1 py-2.5 md:py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                entryMode === 'single'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/50 border border-purple-400/30'
                  : 'text-purple-300/70 hover:text-white hover:bg-purple-900/20'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Input Satu per Satu (Per Baris)</span>
            </button>
          </div>
        )}

        {/* Main Form Body */}
        <form id="report-form" onSubmit={handleSubmit} autoComplete="off" className="space-y-6">
          {/* Header Controls Card (for non-rusak_internal) */}
          {category !== 'rusak_internal' && (
            <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-6 md:p-7 shadow-xl space-y-5">
              <div className="flex items-center gap-2 text-xs font-black text-purple-300 uppercase tracking-wider pb-3 border-b border-purple-900/30">
                <FileText className="w-4 h-4 text-purple-400" />
                <span>Parameter Informasi Dokumen</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {/* Tanggal Log */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest">Tanggal Log *</label>
                    <button
                      type="button"
                      onClick={handleResetLogDate}
                      className="text-[10px] font-black text-purple-400 hover:text-purple-300 uppercase tracking-wider"
                    >
                      Hari Ini
                    </button>
                  </div>
                  <div className="relative group">
                    <input
                      required
                      type="date"
                      name="inputDate"
                      value={headerData.inputDate}
                      onChange={handleHeaderChange}
                      className="w-full pl-11 pr-4 py-3 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm cursor-pointer [color-scheme:dark]"
                    />
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400/60 pointer-events-none" />
                  </div>
                </div>

                {(category === 'retur' || category === 'retur2') && (
                  <>
                    {/* Tgl Input Ginee */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Tgl Input Ginee</label>
                      <div className="relative group">
                        <input
                          type="date"
                          name="gineeInputDate"
                          value={headerData.gineeInputDate}
                          onChange={handleHeaderChange}
                          className="w-full pl-11 pr-4 py-3 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm cursor-pointer [color-scheme:dark]"
                        />
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400/60 pointer-events-none" />
                      </div>
                    </div>

                    {/* PIC Input Ginee */}
                    <div className="space-y-2 relative">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest">PIC Input Ginee *</label>
                        <button
                          type="button"
                          onClick={handleResetPicGinee}
                          className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-wider"
                        >
                          Hapus
                        </button>
                      </div>
                      <SearchableSelect
                        required
                        colorTheme="emerald"
                        hasError={!!fieldErrors.headerPic}
                        options={masterData.pic?.length ? masterData.pic : DEFAULT_PIC_OPTIONS}
                        value={headerData.picGinee}
                        onChange={handlePicGineeChange}
                        placeholder="Pilih PIC Analis"
                      />
                    </div>

                    {/* Marketplace (Hanya tampil di Mode Sekaligus / Batch) */}
                    {entryMode === 'batch' && (
                      <div className="space-y-2 relative">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest">Marketplace *</label>
                          <button
                            type="button"
                            onClick={handleResetMarketplace}
                            className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-wider"
                          >
                            Hapus
                          </button>
                        </div>
                        <SearchableSelect
                          required
                          colorTheme="cyan"
                          hasError={!!fieldErrors.headerMarketplace}
                          options={masterData.marketplace?.length ? masterData.marketplace : DEFAULT_MARKETPLACE_OPTIONS}
                          value={headerData.marketplace}
                          onChange={handleMarketplaceChange}
                          placeholder="Pilih Marketplace"
                        />
                      </div>
                    )}
                  </>
                )}

                {(category === 'retur2') && (
                  <div className="space-y-2 relative">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest">Modul Fisik *</label>
                      <button
                        type="button"
                        onClick={handleResetStatus}
                        className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-wider"
                      >
                        Hapus
                      </button>
                    </div>
                    <SearchableSelect
                      required
                      colorTheme="amber"
                      hasError={!!fieldErrors.headerStatus}
                      options={["Retur Fisik", "Cancel Fisik", "Rusak Fisik", "Bundling Fisik"]}
                      value={headerData.status}
                      onChange={handleStatusChange}
                      placeholder="Pilih Jalur Logika..."
                    />
                  </div>
                )}

                {category === 'retur2' && headerData.status === 'Retur Fisik' && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest">Tipe Transaksi</label>
                      {headerData.type && (
                        <button
                          type="button"
                          onClick={() => setHeaderData(prev => ({ ...prev, type: '' }))}
                          className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-wider"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                    <select
                      name="type"
                      value={headerData.type}
                      onChange={handleHeaderChange}
                      className="w-full px-4 py-3 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                    >
                      <option value="">(Standar Non-COD)</option>
                      <option value="COD">C.O.D (Cash On Delivery)</option>
                    </select>
                  </div>
                )}

                {/* Referensi Invoice (Hanya tampil di Mode Sekaligus / Batch) */}
                {entryMode === 'batch' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Referensi Invoice / Resi</label>
                    <div className="relative">
                      <input
                        type="text"
                        name="invoiceNumber"
                        value={headerData.invoiceNumber}
                        onChange={handleHeaderChange}
                        placeholder="Nomor Invoice/Pesanan..."
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        className="w-full px-4 py-3 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white placeholder-purple-400/30 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none font-mono text-sm pr-10"
                      />
                      {headerData.invoiceNumber && (
                        <button
                          type="button"
                          onClick={() => setHeaderData(prev => ({ ...prev, invoiceNumber: '' }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-400 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Form Section for Rusak Internal or Stok Lt 3 */}
          {(category === 'rusak_internal' || category === 'stok_lt3') && (
            <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-6 md:p-7 shadow-xl space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-purple-900/30">
                <div className="flex items-center gap-2 text-xs font-black text-purple-300 uppercase tracking-wider">
                  <Boxes className="w-4 h-4 text-purple-400" />
                  <span>Input Data Barang &amp; Aset</span>
                </div>
                {category === 'stok_lt3' && (
                  <button 
                    type="button" 
                    onClick={() => setIsMassInputModalOpen(true)} 
                    className="flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-950/40 transition-all"
                  >
                    <ClipboardPaste size={14} /> Input Massal
                  </button>
                )}
              </div>

              {/* PIC, Modul & Date Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest">Analis (PIC) *</label>
                    <button type="button" onClick={handleResetPicGinee} className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-wider">Hapus</button>
                  </div>
                  <SearchableSelect
                    required
                    colorTheme="emerald"
                    hasError={!!fieldErrors.headerPic}
                    options={masterData.pic?.length ? masterData.pic : DEFAULT_PIC_OPTIONS}
                    value={headerData.picGinee}
                    onChange={handlePicGineeChange}
                    placeholder="Pilih PIC Analis"
                  />
                </div>

                {category === 'stok_lt3' && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest">Modul Fisik *</label>
                      <button type="button" onClick={handleResetStatus} className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-wider">Hapus</button>
                    </div>
                    <SearchableSelect
                      required
                      colorTheme="amber"
                      hasError={!!fieldErrors.headerStatus}
                      options={["Retur Fisik", "Cancel Fisik", "Rusak Fisik", "Bundling Fisik"]}
                      value={headerData.status}
                      onChange={handleStatusChange}
                      placeholder="Pilih Jalur Logika..."
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest">Tanggal Log *</label>
                    <button
                      type="button"
                      onClick={handleResetLogDate}
                      className="text-[10px] font-black text-purple-400 hover:text-purple-300 uppercase tracking-wider"
                    >
                      Hari Ini
                    </button>
                  </div>
                  <div className="relative group">
                    <input
                      required
                      type="date"
                      value={inputItem.logDate}
                      onChange={(e) => handleLogDateChange(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm cursor-pointer [color-scheme:dark]"
                    />
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400/60 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* SKU, Status, Keterangan & Qty Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 pt-2">
                <div className="lg:col-span-1">
                  <SearchableSelect
                    ref={skuSelectRef}
                    label="Tag Aset (SKU)"
                    required
                    colorTheme="purple"
                    hasError={!!fieldErrors.inputItemSku}
                    options={Array.from(new Set([...(masterData.sku || []), ...(masterData.bundling_sku || [])]))}
                    value={inputItem.sku}
                    onChange={(val) => {
                      setInputItem(prev => ({ ...prev, sku: val }));
                      setFieldErrors(prev => ({ ...prev, inputItemSku: false }));
                    }}
                    onAfterSelect={() => {
                      setTimeout(() => quantityRef.current?.focus(), 0);
                    }}
                    placeholder="Pilih / Ketik SKU..."
                    allowCustom={true}
                  />
                </div>

                <div className="space-y-2 lg:col-span-1">
                  <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Status Aset *</label>
                  <SearchableSelect
                    required
                    colorTheme="amber"
                    hasError={!!fieldErrors.inputItemStatus}
                    options={masterData.status || []}
                    value={inputItem.status}
                    onChange={(val) => {
                      setInputItem(prev => ({ ...prev, status: val }));
                      setFieldErrors(prev => ({ ...prev, inputItemStatus: false }));
                    }}
                    placeholder="Tentukan Kondisi"
                    allowCustom={true}
                  />
                </div>

                <div className="space-y-2 lg:col-span-1">
                  <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Spesifikasi / Keterangan</label>
                  <input
                    type="text"
                    value={inputItem.itemDescription}
                    onChange={(e) => setInputItem(prev => ({ ...prev, itemDescription: e.target.value }))}
                    placeholder="Detail kondisi barang..."
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="w-full px-4 py-3 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm placeholder-purple-400/30"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Kuantitas *</label>
                  <div className="flex gap-2">
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
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      className="flex-1 px-4 py-3 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none font-bold text-center"
                    />
                    <button
                      type="button"
                      onClick={addItemRow}
                      className="px-5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black rounded-xl transition-all shadow-md shadow-purple-950/40 flex items-center justify-center cursor-pointer"
                      title="Tambah Item ke List"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Added Items List Table */}
              {items.length > 0 && items[0].sku && (
                <div className="space-y-3 pt-4 border-t border-purple-900/30">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-xs font-black text-purple-300 uppercase tracking-wider">Daftar Item Terinput</h4>
                    <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">{items.filter(i => i.sku).length} Item Siap Komit</span>
                  </div>
                  
                  <div className="bg-[#0c0620]/90 border border-purple-900/40 rounded-2xl overflow-hidden shadow-lg">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-purple-900/30 bg-[#0e0725] text-purple-300 font-black text-[10px] tracking-wider uppercase">
                          <th className="px-5 py-3.5">Tanggal</th>
                          <th className="px-5 py-3.5">Invoice</th>
                          <th className="px-5 py-3.5">SKU Barang</th>
                          <th className="px-5 py-3.5 text-center">Jumlah</th>
                          <th className="px-5 py-3.5">Status</th>
                          <th className="px-5 py-3.5">Keterangan</th>
                          <th className="px-5 py-3.5 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-900/20 text-xs">
                        {items.map((item, idx) => item.sku && (
                          <tr key={idx} className="hover:bg-purple-950/20 transition-colors">
                            <td className="px-5 py-3 text-purple-200 font-medium">{item.logDate}</td>
                            <td className="px-5 py-3 text-purple-300 font-mono">{item.invoiceNumber || '-'}</td>
                            <td className="px-5 py-3 text-white font-bold font-mono">{item.sku}</td>
                            <td className="px-5 py-3 text-center font-black text-purple-300">{item.quantity}</td>
                            <td className="px-5 py-3 text-purple-300/80 font-semibold">{item.status || '-'}</td>
                            <td className="px-5 py-3 text-purple-400/70 italic truncate max-w-[200px]">{item.itemDescription || '-'}</td>
                            <td className="px-5 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => removeItemRow(idx)}
                                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
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

          {/* General Items Section for Retur */}
          {category !== 'rusak_internal' && category !== 'stok_lt3' && (
            <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-6 md:p-7 shadow-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-900/30">
                <div className="flex items-center gap-2 text-xs font-black text-purple-300 uppercase tracking-wider">
                  <Boxes className="w-4 h-4 text-purple-400" />
                  <span>Daftar Item Retur ({items.length} Baris)</span>
                  <span className="ml-2 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase border bg-purple-500/15 border-purple-500/30 text-purple-300">
                    {entryMode === 'batch' ? 'Mode: Sekaligus' : 'Mode: Satu per Satu'}
                  </span>
                </div>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsMassInputModalOpen(true)}
                    className="flex items-center gap-2 text-xs font-bold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 px-3.5 py-2 rounded-xl border border-emerald-500/30 transition-all shadow-sm"
                  >
                    <ClipboardPaste size={14} />
                    <span>Input Massal Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="flex items-center gap-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 px-3.5 py-2 rounded-xl transition-all shadow-md shadow-purple-950/40 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{entryMode === 'single' ? 'Tambah Baris' : 'Tambah Baris Item'}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {items.map((item, index) => {
                  const groupStyle = item.invoiceNumber ? getInvoiceStyle(item.invoiceNumber) : null;
                  const rowErr = fieldErrors.rows[index];
                  const rowHasError = rowErr && Object.values(rowErr).some(Boolean);
                  
                  return (
                    <div 
                      key={index} 
                      className={`relative p-5 md:p-6 border rounded-2xl transition-all space-y-4 shadow-md ${
                        rowHasError
                          ? 'bg-rose-950/20 border-rose-500/60 ring-2 ring-rose-500/30'
                          : groupStyle 
                            ? `bg-gradient-to-br ${groupStyle.bg} ${groupStyle.border}` 
                            : 'bg-[#0c0620]/80 border-purple-900/30 hover:border-purple-700/40'
                      }`}
                    >
                      {/* Left Badge: Invoice tag */}
                      {groupStyle && (
                        <div className={`absolute -top-3 left-6 px-3 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md z-10 ${groupStyle.badge} ${groupStyle.text}`}>
                          <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                          <span>
                            {item.marketplace ? `${item.marketplace} | ` : ''}Invoice: {item.invoiceNumber}
                          </span>
                        </div>
                      )}

                      {/* Right Alert Badge if row has missing required fields */}
                      {rowHasError && (
                        <div className="absolute -top-3 right-12 px-3 py-0.5 bg-rose-500/20 border border-rose-500/50 rounded-full text-[9px] font-black uppercase tracking-wider text-rose-300 flex items-center gap-1.5 shadow-md z-10 animate-pulse">
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          <span>Kolom Wajib Belum Lengkap</span>
                        </div>
                      )}

                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemRow(index)}
                          className="absolute -top-2.5 -right-2.5 p-1.5 bg-[#0c0620] text-slate-500 hover:text-rose-400 border border-purple-900/40 hover:border-rose-500/30 rounded-xl transition-all shadow-lg z-20"
                          title="Hapus Baris"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {entryMode === 'batch' ? (
                        /* TAMPILAN MODE SEKALIGUS (BATCH) */
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="lg:col-span-1">
                            <SearchableSelect
                              label="Tag Aset (SKU)"
                              required
                              colorTheme="purple"
                              hasError={!!rowErr?.sku}
                              options={Array.from(new Set([...(masterData.sku || []), ...(masterData.bundling_sku || [])]))}
                              value={item.sku}
                              onChange={(val) => updateItemRow(index, 'sku', val)}
                              placeholder="Pilih SKU..."
                              allowCustom={true}
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Kuantitas *</label>
                            <input
                              required
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItemRow(index, 'quantity', e.target.value)}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck={false}
                              className={`w-full px-4 py-3 bg-[#0c0620]/90 border rounded-xl text-white focus:ring-2 focus:ring-purple-500 outline-none font-bold text-center transition-all ${
                                rowErr?.quantity 
                                  ? 'border-rose-500 ring-2 ring-rose-500/50 bg-rose-950/20' 
                                  : 'border-purple-900/40'
                              }`}
                            />
                          </div>

                          <div className="lg:col-span-1">
                            <SearchableSelect
                              label="Status Aset"
                              required
                              colorTheme="amber"
                              hasError={!!rowErr?.status}
                              options={masterData.status || []}
                              value={item.status}
                              onChange={(val) => updateItemRow(index, 'status', val)}
                              placeholder="Tentukan Kondisi"
                              allowCustom={true}
                            />
                          </div>

                          <div className="space-y-2 lg:col-span-1">
                            <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Invoice Item (Opsional)</label>
                            <input
                              type="text"
                              value={item.invoiceNumber || ''}
                              onChange={(e) => updateItemRow(index, 'invoiceNumber', e.target.value)}
                              placeholder="Ikut Global jika kosong..."
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck={false}
                              className="w-full px-4 py-3 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white focus:ring-2 focus:ring-purple-500 outline-none text-xs font-mono placeholder-purple-400/30"
                            />
                          </div>

                          <div className="md:col-span-2 lg:col-span-4 space-y-2">
                            <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Keterangan / Alasan</label>
                            <input
                              type="text"
                              value={item.itemDescription}
                              onChange={(e) => updateItemRow(index, 'itemDescription', e.target.value)}
                              placeholder="Detail parameter atau alasan retur..."
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck={false}
                              className="w-full px-4 py-3 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white focus:ring-2 focus:ring-purple-500 outline-none text-xs placeholder-purple-400/30"
                            />
                          </div>
                        </div>
                      ) : (
                        /* TAMPILAN MODE SATU PER SATU (SINGLE) */
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                          {/* Marketplace Per Baris */}
                          <div className="space-y-2 lg:col-span-1">
                            <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Marketplace *</label>
                            <SearchableSelect
                              required
                              colorTheme="cyan"
                              hasError={!!rowErr?.marketplace}
                              options={masterData.marketplace?.length ? masterData.marketplace : DEFAULT_MARKETPLACE_OPTIONS}
                              value={item.marketplace || ''}
                              onChange={(val) => updateItemRow(index, 'marketplace', val)}
                              placeholder="Pilih Marketplace"
                            />
                          </div>

                          {/* Referensi Invoice / Resi Per Baris */}
                          <div className="space-y-2 lg:col-span-1">
                            <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Referensi Invoice / Resi *</label>
                            <input
                              required
                              type="text"
                              value={item.invoiceNumber || ''}
                              onChange={(e) => updateItemRow(index, 'invoiceNumber', e.target.value.toUpperCase())}
                              placeholder="Nomor Invoice/Pesanan..."
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck={false}
                              className={`w-full px-4 py-3 bg-[#0c0620]/90 border rounded-xl text-white focus:ring-2 focus:ring-purple-500 outline-none text-xs font-mono placeholder-purple-400/30 transition-all ${
                                rowErr?.invoiceNumber 
                                  ? 'border-rose-500 ring-2 ring-rose-500/50 bg-rose-950/20' 
                                  : 'border-purple-900/40'
                              }`}
                            />
                          </div>

                          {/* Tag Aset / SKU */}
                          <div className="lg:col-span-1">
                            <SearchableSelect
                              label="Tag Aset (SKU)"
                              required
                              colorTheme="purple"
                              hasError={!!rowErr?.sku}
                              options={Array.from(new Set([...(masterData.sku || []), ...(masterData.bundling_sku || [])]))}
                              value={item.sku}
                              onChange={(val) => updateItemRow(index, 'sku', val)}
                              placeholder="Pilih SKU..."
                              allowCustom={true}
                            />
                          </div>

                          {/* Kuantitas */}
                          <div className="space-y-2 lg:col-span-1">
                            <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Kuantitas *</label>
                            <input
                              required
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItemRow(index, 'quantity', e.target.value)}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck={false}
                              className={`w-full px-4 py-3 bg-[#0c0620]/90 border rounded-xl text-white focus:ring-2 focus:ring-purple-500 outline-none font-bold text-center transition-all ${
                                rowErr?.quantity 
                                  ? 'border-rose-500 ring-2 ring-rose-500/50 bg-rose-950/20' 
                                  : 'border-purple-900/40'
                              }`}
                            />
                          </div>

                          {/* Status Aset */}
                          <div className="lg:col-span-1">
                            <SearchableSelect
                              label="Status Aset"
                              required
                              colorTheme="amber"
                              hasError={!!rowErr?.status}
                              options={masterData.status || []}
                              value={item.status}
                              onChange={(val) => updateItemRow(index, 'status', val)}
                              placeholder="Tentukan Kondisi"
                              allowCustom={true}
                            />
                          </div>

                          {/* Keterangan / Alasan */}
                          <div className="sm:col-span-2 lg:col-span-5 space-y-2">
                            <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">Keterangan / Alasan</label>
                            <input
                              type="text"
                              value={item.itemDescription}
                              onChange={(e) => updateItemRow(index, 'itemDescription', e.target.value)}
                              placeholder="Detail parameter atau alasan retur..."
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck={false}
                              className="w-full px-4 py-3 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white focus:ring-2 focus:ring-purple-500 outline-none text-xs placeholder-purple-400/30"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Floating Submit Execution Button */}
      <div className="fixed bottom-6 right-8 sm:right-12 z-[100]">
        <button
          type="submit"
          form="report-form"
          disabled={loading}
          className={`flex items-center gap-3 px-8 py-3.5 bg-gradient-to-r ${catInfo.submitBtnStyle} text-white font-black rounded-2xl transition-all shadow-2xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-xs uppercase tracking-widest cursor-pointer border border-white/20`}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Memproses...</span>
            </>
          ) : (
            <>
              <span>{category === 'rusak_internal' ? 'EKSEKUSI ELIMINASI' : 'Kirim'}</span>
              <Send className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </>
  );
}
