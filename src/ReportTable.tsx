import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, addDoc, setDoc, serverTimestamp, getDoc, updateDoc, limit } from 'firebase/firestore';
import { db, auth } from './firebase';
import { Report, OperationType, UserProfile } from './types';
import { handleFirestoreError, normalizeDate } from './utils';
import Toast, { ToastType } from './Toast';
import { 
  Search, Filter, Trash2, ChevronLeft, ChevronRight, FileSpreadsheet, 
  AlertTriangle, X, ChevronDown, Calendar, RotateCcw, CheckSquare, Square, 
  Loader2, Edit2, Save, RefreshCcw, Download, Upload, Sparkles, Check, 
  Eye, EyeOff, SlidersHorizontal, Database
} from 'lucide-react';
import { format, isSameDay, parseISO, isToday } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import XLSX from 'xlsx-js-style';
import { writeBatch } from 'firebase/firestore';

import { updateDashboardStats } from './stats';
import { supabase } from './supabaseClient';
import { saveReportDual, updateReportDual, deleteReportDual } from './services/dualStorage';

interface ReportTableProps {
  reports: Report[];
  category?: 'retur' | 'retur2' | 'stok_lt3' | 'rusak_internal' | 'eliminasi_rusak';
  statusFilter?: string;
  forcePhysicalLayout?: boolean;
  user: any;
  userProfile: UserProfile | null;
  defaultToday?: boolean;
  globalDateFilter?: string;
  setGlobalDateFilter?: (date: string) => void;
}

export default function ReportTable({
  reports: initialReports,
  category,
  statusFilter,
  forcePhysicalLayout,
  user,
  userProfile,
  defaultToday,
  globalDateFilter,
  setGlobalDateFilter,
  loading: externalLoading
}: ReportTableProps & { loading?: boolean }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMarketplace, setFilterMarketplace] = useState('');
  const [isRangeMode, setIsRangeMode] = useState(globalDateFilter?.includes('/') || false);
  const [startDate, setStartDate] = useState(() => {
    if (globalDateFilter) return globalDateFilter.split('/')[0];
    if (category === 'rusak_internal') {
      const saved = localStorage.getItem('selectedDateFilter_rusak_internal');
      if (saved) return saved;
    }
    return '';
  });
  const [endDate, setEndDate] = useState(globalDateFilter?.split('/')[1] || '');
  const [localDateFilter, setLocalDateFilter] = useState(() => {
    if (globalDateFilter) return globalDateFilter;
    if (category === 'rusak_internal') {
      const saved = localStorage.getItem('selectedDateFilter_rusak_internal');
      if (saved) return saved;
    }
    return '';
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });
  const [bulkDeleteModal, setBulkDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Report>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [toastConfig, setToastConfig] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false
  });

  const showToast = (message: string, type: ToastType) => {
    setToastConfig({ message, type, isVisible: true });
  };

  // DevMode State untuk Import Data & Ekspor Original
  const [isDevModeUnlocked, setIsDevModeUnlocked] = useState(false);
  const keyBufferRef = useRef<string>('');

  // Import Modal State (DevMode)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
          showToast(nextState ? '🔓 DEV MODE UNLOCKED: Tombol Import Data & Ekspor Original Aktif!' : '🔒 DEV MODE LOCKED: Tombol DevMode Ditutup', 'success');
          return nextState;
        });
        keyBufferRef.current = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Download Template Excel/CSV
  const handleDownloadTemplate = async () => {
    try {
      const templateData = [
        {
          'Tanggal Log': format(new Date(), 'yyyy-MM-dd'),
          'Tgl Input Ginee': format(new Date(), 'yyyy-MM-dd'),
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
          'Keterangan': 'Barang cancel fisik'
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(templateData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Cancel Fisik');
      XLSX.writeFile(workbook, 'Template_Cancel_Fisik.xlsx');
    } catch (err: any) {
      alert('Gagal download template: ' + err.message);
    }
  };

  // Process File CSV / Excel
  const processFile = (file: File) => {
    setExcelFile(file);
    setImportStatus(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        if (jsonData.length === 0) {
          setImportStatus('File tidak memiliki data yang valid.');
          return;
        }
        setParsedData(jsonData);
      } catch (err: any) {
        setImportStatus('Gagal membaca file: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const getRowVal = (row: any, keys: string[]) => {
    const rowKeys = Object.keys(row);
    for (const k of keys) {
      const match = rowKeys.find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim());
      if (match && row[match] !== undefined && row[match] !== null) {
        return String(row[match]).trim();
      }
    }
    return '';
  };

  const handleExecuteImportToFirestore = async () => {
    if (!parsedData || parsedData.length === 0) return;
    setIsImporting(true);
    setImportStatus(null);

    try {
      const uniquePayloads: any[] = [];
      const seenSet = new Set<string>();
      let skippedDuplicates = 0;

      for (const row of parsedData) {
        const inv = getRowVal(row, ['referensi_invoice', 'referensi invoice', 'invoice', 'invoice_ref', 'inv / pemesanan', 'no pesanan', 'id pesanan', 'nomor resi']);
        const sku = getRowVal(row, ['sku', 'sku_id', 'sku / barcode', 'barcode', 'msku']);
        const qtyRaw = getRowVal(row, ['qty', 'quantity', 'jumlah', 'unit']);
        const qty = Number(qtyRaw) || 1;

        const rawDate = getRowVal(row, ['tanggal_log', 'tanggal log', 'log_date', 'inputdate', 'input_date', 'timestamp', 'tanggal', 'date']) || format(new Date(), 'yyyy-MM-dd');
        const logDate = normalizeDate(rawDate);

        const rawGineeDate = getRowVal(row, ['tgl_input_ginee', 'tgl input ginee', 'sinkron ginee', 'ginee_date']);
        const gineeDate = rawGineeDate ? normalizeDate(rawGineeDate) : null;

        const pic = getRowVal(row, ['analis_pic', 'analis (pic)', 'analis', 'pic_input_ginee', 'pic input ginee', 'pic ginee', 'pic']) || user?.email || 'DevMode';
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
          createdBy: user?.uid || 'DevMode User',
          createdAt: serverTimestamp(),
          created_at: serverTimestamp()
        };

        const uniqueKey = `${logDate}_${inv}_${sku}_${qty}`;
        if (seenSet.has(uniqueKey)) {
          skippedDuplicates++;
          continue;
        }
        seenSet.add(uniqueKey);
        uniquePayloads.push(firestorePayload);
      }

      // Batch write (Dual Storage Firestore + Supabase)
      let successCount = 0;
      for (const payload of uniquePayloads) {
        try {
          await saveReportDual(payload);
          successCount++;
        } catch (eFs) {}
      }

      const dupMsg = skippedDuplicates > 0 ? ` (${skippedDuplicates} data duplikat dilewati)` : '';
      showToast(`✅ Sukses meng-import ${successCount} data baru!${dupMsg}`, 'success');
      setIsImportModalOpen(false);
      setParsedData([]);
      setExcelFile(null);

      if (uniquePayloads.length > 0 && uniquePayloads[0].inputDate) {
        setStartDate(uniquePayloads[0].inputDate);
      }
      setTimeout(() => window.location.reload(), 1200);
    } catch (err: any) {
      setImportStatus('Gagal import data: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const itemsPerPage = 500;

  const dateFilter = globalDateFilter !== undefined ? globalDateFilter : localDateFilter;

  useEffect(() => {
    if (isRangeMode) {
      const range = startDate && endDate ? `${startDate}/${endDate}` : startDate;
      if (setGlobalDateFilter) setGlobalDateFilter(range);
      else setLocalDateFilter(range);
    } else {
      if (setGlobalDateFilter) setGlobalDateFilter(startDate);
      else setLocalDateFilter(startDate);
    }
    if (startDate) {
      if (category === 'rusak_internal') {
        localStorage.setItem('selectedDateFilter_rusak_internal', startDate);
      }
    }
  }, [startDate, endDate, isRangeMode, category]);

  const handleDateChange = (val: string) => {
    setStartDate(val);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteModal({ show: true, id });
  };

  const confirmDelete = async () => {
    if (!deleteModal.id) return;

    const reportToDelete = initialReports.find(r => r.id === deleteModal.id);
    if (!reportToDelete) return;

    setIsDeleting(true);
    try {
      // 1. Create Backup
      await addDoc(collection(db, 'backups'), {
        originalData: reportToDelete,
        deletedAt: serverTimestamp(),
        deletedBy: user?.uid || 'admin'
      });

      // 2. Delete Original (Dual Storage: Firestore & Supabase)
      const source = (reportToDelete as any)._source || 'reports';
      if (source === 'reports') {
        await deleteReportDual(deleteModal.id);
      } else {
        await deleteDoc(doc(db, source, deleteModal.id));
      }

      // 3. Update dashboard stats
      try {
        await updateDashboardStats(reportToDelete, 'remove');
      } catch (e) {
        console.error('Error updating stats:', e);
      }

      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(deleteModal.id!);
        return next;
      });
      setDeleteModal({ show: false, id: null });
      showToast('Data berhasil dihapus selamanya.', 'success');
    } catch (error) {
      const source = (initialReports.find(r => r.id === deleteModal.id) as any)?._source || 'reports';
      handleFirestoreError(error, OperationType.DELETE, `${source}/${deleteModal.id}`);
      showToast('Gagal menghapus data. Silakan coba lagi.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      const backupPromises: Promise<any>[] = [];

      for (const id of selectedIds) {
        const reportToDelete = initialReports.find(r => r.id === id);
        if (reportToDelete) {
          backupPromises.push(addDoc(collection(db, 'backups'), {
            originalData: reportToDelete,
            deletedAt: serverTimestamp(),
            deletedBy: user?.uid || 'admin'
          }));
          const source = (reportToDelete as any)._source || 'reports';
          batch.delete(doc(db, source, id));
        }
      }

      if (backupPromises.length > 0) {
        await Promise.all(backupPromises);
        await batch.commit();

        // Delete from Supabase reports as well
        try {
          await supabase.from('reports').delete().in('id', Array.from(selectedIds));
        } catch (sbErr) {
          console.warn("Supabase bulk delete notice:", sbErr);
        }

        setSelectedIds(new Set());
        setBulkDeleteModal(false);
        showToast(`Berhasil menghapus ${backupPromises.length} data.`, 'success');
      } else {
        showToast('Tidak ada data yang dipilih untuk dihapus.', 'error');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'bulk-delete');
      showToast('Gagal menghapus data massal.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditClick = (report: Report) => {
    setEditingId(report.id!);
    setEditForm({ ...report });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setIsSaving(true);
    try {
      const { id, createdAt, createdBy, ...updateData } = editForm as any;
      await updateReportDual(editingId, updateData);
      showToast('Data berhasil diperbarui', 'success');
      setEditingId(null);
      setEditForm({});
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reports/${editingId}`);
      showToast('Gagal memperbarui data', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === currentData.length && currentData.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentData.map(r => r.id!).filter(id => !!id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isStokLT3 = category === 'stok_lt3' || category === 'rusak_internal' || forcePhysicalLayout;
  const isExplorationMenu = !category && !statusFilter;

  const formatReportTime = (report: Report) => {
    let ts = (report as any)._sortTs;
    if (!ts && report.createdAt) {
      const ca = report.createdAt as any;
      if (typeof ca.toDate === 'function') {
        ts = ca.toDate().getTime();
      } else if (ca && ca.seconds !== undefined) {
        ts = ca.seconds * 1000 + (ca.nanoseconds || 0) / 1000000;
      } else if (typeof ca === 'number') {
        ts = ca;
      } else if (typeof ca === 'string') {
        const parsed = new Date(ca);
        ts = isNaN(parsed.getTime()) ? 0 : parsed.getTime();
      }
    }

    if (!ts) return '---';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return '---';
      const hrs = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      const secs = String(d.getSeconds()).padStart(2, '0');
      return `${hrs}:${mins}:${secs}`;
    } catch (e) {
      return '---';
    }
  };

  const filteredReports = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase().trim();
    const lowerStatusFilter = statusFilter?.toLowerCase().trim() || '';

    return initialReports.filter(report => {
      const rawStatus = (report.status || '').trim();
      const normStatus = (report.normalizedStatus || '').trim();
      const assetStatus = ((report as any).assetStatus || (report as any).status_aset || '').trim();
      const modulFisik = ((report as any).modul_fisik || '').trim();
      const reportCategory = (report.category || '').trim();

      const stLow = rawStatus.toLowerCase();
      const normLow = normStatus.toLowerCase();
      const assetLow = assetStatus.toLowerCase();
      const mfLow = modulFisik.toLowerCase();
      const catLow = reportCategory.toLowerCase();

      // Flags for explicit status designations
      const isExplicitCancel = mfLow === 'cancel fisik' || normLow === 'cancel fisik' || stLow === 'cancel fisik' || assetLow === 'cancel fisik' || stLow === 'cancel' || stLow === 'batal' || stLow === 'dibatalkan' || stLow.includes('cancel fisik') || mfLow.includes('cancel fisik');
      const isExplicitRusak = mfLow === 'rusak fisik' || normLow === 'rusak fisik' || stLow === 'rusak fisik' || assetLow === 'rusak fisik' || stLow === 'afkir fisik' || assetLow === 'afkir fisik' || mfLow === 'afkir fisik' || normLow === 'afkir fisik' || stLow.includes('rusak fisik');
      const isExplicitBundling = mfLow === 'bundling fisik' || normLow === 'bundling fisik' || stLow === 'bundling fisik' || assetLow === 'bundling fisik' || stLow.includes('bundling') || mfLow.includes('bundling');
      const isExplicitEliminasiRusak = normLow === 'eliminasi stok rusak' || stLow === 'eliminasi stok rusak' || assetLow === 'eliminasi stok rusak' || catLow === 'rusak_internal' || catLow === 'eliminasi_rusak' || report.type === 'OUT';
      const isExplicitRetur = mfLow === 'retur fisik' || normLow === 'retur fisik' || stLow === 'retur fisik' || assetLow === 'retur fisik' || (catLow === 'retur' && !isExplicitCancel && !isExplicitRusak && !isExplicitBundling);

      if (category) {
        const isStokLT3 = category === 'stok_lt3';
        const isRusakInternal = category === 'rusak_internal' || category === 'eliminasi_rusak';

        if (isStokLT3) {
          if (!isExplicitRusak && catLow !== 'stok_lt3' && stLow !== 'rusak fisik') return false;
        } else if (isRusakInternal) {
          if (!isExplicitEliminasiRusak) return false;
        }
      }

      if (lowerStatusFilter) {
        if (lowerStatusFilter === 'retur fisik') {
          // EXCLUDE cancel, rusak, bundling, eliminasi
          if (isExplicitCancel || isExplicitRusak || isExplicitBundling || isExplicitEliminasiRusak) return false;
          if (catLow === 'retur2' && mfLow !== 'retur fisik' && normLow !== 'retur fisik' && stLow !== 'retur fisik' && assetLow !== 'retur fisik') return false;
          
          const isReturMatch = isExplicitRetur || stLow.includes('retur') || assetLow.includes('retur') || mfLow.includes('retur');
          if (!isReturMatch) return false;
        } else if (lowerStatusFilter === 'cancel fisik') {
          // EXCLUDE retur, rusak, bundling, eliminasi
          if (isExplicitRetur && !isExplicitCancel) return false;
          if (isExplicitRusak || isExplicitBundling || isExplicitEliminasiRusak) return false;
          if (stLow.includes('retur') && !isExplicitCancel && !stLow.includes('cancel')) return false;
          if (assetLow.includes('retur') && !isExplicitCancel && !assetLow.includes('cancel')) return false;
          if (mfLow.includes('retur') && !isExplicitCancel && !mfLow.includes('cancel')) return false;
          
          const isCancelMatch = isExplicitCancel || stLow.includes('cancel') || assetLow.includes('cancel') || mfLow.includes('cancel') || normLow.includes('cancel');
          if (!isCancelMatch) return false;
        } else if (lowerStatusFilter === 'rusak fisik') {
          // EXCLUDE retur, cancel, bundling, eliminasi internal
          if (isExplicitRetur || isExplicitCancel || isExplicitBundling || isExplicitEliminasiRusak) return false;
          const isRusakMatch = isExplicitRusak || stLow.includes('rusak fisik') || assetLow.includes('rusak fisik') || mfLow.includes('rusak fisik');
          if (!isRusakMatch) return false;
        } else if (lowerStatusFilter === 'bundling fisik') {
          // EXCLUDE retur, cancel, rusak fisik, eliminasi
          if (isExplicitRetur || isExplicitCancel || isExplicitRusak || isExplicitEliminasiRusak) return false;
          const isBundlingMatch = isExplicitBundling || stLow.includes('bundling') || assetLow.includes('bundling') || mfLow.includes('bundling');
          if (!isBundlingMatch) return false;
        } else {
          if (normLow !== lowerStatusFilter && stLow !== lowerStatusFilter && assetLow !== lowerStatusFilter && mfLow !== lowerStatusFilter) return false;
        }
      }

      if (lowerSearch) {
        const matchesSearch =
          (report.invoiceNumber?.toLowerCase() || '').includes(lowerSearch) ||
          ((report as any).barcode?.toLowerCase() || '').includes(lowerSearch) ||
          (report.sku?.toLowerCase() || '').includes(lowerSearch) ||
          (report.picGinee?.toLowerCase() || '').includes(lowerSearch) ||
          ((report as any).analis?.toLowerCase() || '').includes(lowerSearch) ||
          (report.createdBy?.toLowerCase() || '').includes(lowerSearch) ||
          (report.status?.toLowerCase() || '').includes(lowerSearch);
        if (!matchesSearch) return false;
      }

      if (filterMarketplace && report.marketplace !== filterMarketplace) return false;

      const creator = (report.createdBy || report.picGinee || (report as any).analis || '').toUpperCase();
      if (creator.includes('SYSTEM')) return false;

      const activeDateFilter = isRangeMode && startDate && endDate 
        ? `${startDate}/${endDate}` 
        : (isRangeMode ? startDate : (startDate || ''));

      if (activeDateFilter) {
        const rawDate = report.inputDate || (report as any).date || '';
        const normalized = normalizeDate(rawDate);
        if (activeDateFilter.includes('/')) {
          const [start, end] = activeDateFilter.split('/');
          const normStart = normalizeDate(start);
          const normEnd = normalizeDate(end);
          if (normStart && normalized < normStart) return false;
          if (normEnd && normalized > normEnd) return false;
        } else {
          const normFilter = normalizeDate(activeDateFilter);
          if (normFilter && normalized !== normFilter && !normalized.startsWith(normFilter)) return false;
        }
      }

      if (!category && !statusFilter) {
        if (isExplicitEliminasiRusak) {
          return false;
        }
      }

      return true;
    });
  }, [initialReports, category, statusFilter, searchTerm, filterMarketplace, startDate, endDate, isRangeMode]);

  const totalPages = Math.ceil(filteredReports.length / itemsPerPage) || 1;
  const currentData = filteredReports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const isPhysicalStatusMenu = statusFilter === 'Retur Fisik' || statusFilter === 'Cancel Fisik' || statusFilter === 'Rusak Fisik' || statusFilter === 'Bundling Fisik' || statusFilter === 'Afkir Fisik' || forcePhysicalLayout;

  const exportToExcel = () => {
    let exportDataList = filteredReports;
    if (category === 'rusak_internal') {
      exportDataList = filteredReports.filter(r => r.status === 'Eliminasi Stok Rusak' || r.assetStatus === 'Eliminasi Stok Rusak');
      if (exportDataList.length === 0) {
        showToast('Tidak ada data dengan status Eliminasi Stok Rusak untuk diekspor', 'error');
        return;
      }
    }

    const sortedReports = [...exportDataList].sort((a, b) => {
      if (a.invoiceNumber < b.invoiceNumber) return -1;
      if (a.invoiceNumber > b.invoiceNumber) return 1;
      if (a.sku < b.sku) return -1;
      if (a.sku > b.sku) return 1;
      return 0;
    });

    let data: any[];
    let wscols: any[];
    let invoiceColIndex = 4;

    if (isPhysicalStatusMenu || isDevModeUnlocked) {
      data = sortedReports.map(r => {
        let resolvedModulFisik = (r as any).modul_fisik || statusFilter || 'Data Fisik';
        let resolvedAssetStatus = r.assetStatus || r.status || statusFilter || '';

        if (statusFilter === 'Retur Fisik') {
          resolvedModulFisik = 'Retur Fisik';
          if (!resolvedAssetStatus || resolvedAssetStatus === 'Cancel Fisik' || resolvedAssetStatus === 'Rusak Fisik') {
            resolvedAssetStatus = 'Retur Fisik';
          }
        } else if (statusFilter === 'Cancel Fisik') {
          resolvedModulFisik = 'Cancel Fisik';
          if (!resolvedAssetStatus || resolvedAssetStatus === 'Retur Fisik' || resolvedAssetStatus === 'Rusak Fisik') {
            resolvedAssetStatus = 'Cancel Fisik';
          }
        } else if (statusFilter === 'Rusak Fisik') {
          resolvedModulFisik = 'Rusak Fisik';
          if (!resolvedAssetStatus || resolvedAssetStatus === 'Retur Fisik' || resolvedAssetStatus === 'Cancel Fisik') {
            resolvedAssetStatus = 'Rusak Fisik';
          }
        } else if (statusFilter === 'Bundling Fisik') {
          resolvedModulFisik = 'Bundling Fisik';
          if (!resolvedAssetStatus || resolvedAssetStatus === 'Retur Fisik' || resolvedAssetStatus === 'Cancel Fisik') {
            resolvedAssetStatus = 'Bundling Fisik';
          }
        }

        return {
          'Tanggal Log': normalizeDate(r.inputDate || (r as any).tanggal_log || (r as any).log_date || ''),
          'Tgl Input Ginee': r.gineeInputDate || (r as any).tgl_input_ginee || (r as any).ginee_date || '',
          'PIC Input Ginee': r.picGinee || (r as any).pic_input_ginee || (r as any).pic_ginee || '',
          'Marketplace': r.marketplace || '',
          'Analis (PIC)': r.createdBy || (r as any).analis || (r as any).analis_pic || '',
          'Modul Fisik': resolvedModulFisik,
          'Referensi Invoice': r.invoiceNumber || (r as any).referensi_invoice || (r as any).invoice_ref || '',
          'Lokasi / Rak': r.location || (r as any).location_rak || (r as any).location || '',
          'SKU / Barcode': r.sku || '',
          'Nama Produk': r.itemDescription || (r as any).product_name || '',
          'Status Aset': resolvedAssetStatus,
          'QTY': Number(r.quantity || (r as any).qty) || 1,
          'Keterangan': r.itemDescription || (r as any).notes || (r as any).keterangan || ''
        };
      });
      wscols = [
        { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 18 },
        { wch: 15 }, { wch: 32 }, { wch: 15 }, { wch: 35 }, { wch: 40 },
        { wch: 18 }, { wch: 8 },  { wch: 35 }
      ];
      invoiceColIndex = 6;
    } else {
      data = sortedReports.map(r => ({
        'Timestamp': r.inputDate,
        'Sinkron Ginee': r.gineeInputDate || '-',
        'Analis': r.picGinee || r.createdBy || '-',
        'Marketplace': r.marketplace || '-',
        'Referensi/no pesanan/invoice': r.invoiceNumber,
        'Status/Keterangan': r.assetStatus || r.status || '-',
        'Keterangan Barang': r.itemDescription || '-',
        'SKU': r.sku,
        'Qty': r.quantity
      }));
      wscols = [
        { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 35 }, { wch: 25 }, { wch: 40 }, { wch: 42 }, { wch: 10 }
      ];
      invoiceColIndex = 4;
    }

    const worksheet = XLSX.utils.json_to_sheet(data);

    const merges: XLSX.Range[] = [];
    if (sortedReports.length > 0) {
      for (let i = 0; i < sortedReports.length; i++) {
        const currentInvoice = sortedReports[i].invoiceNumber;
        let j = i + 1;
        while (j < sortedReports.length && sortedReports[j].invoiceNumber === currentInvoice) {
          j++;
        }
        if (j - i > 1) {
          const colsToMerge = isPhysicalStatusMenu ? [0, 3] : [0, 1, 2, 3, 4];
          colsToMerge.forEach(col => {
            merges.push({
              s: { r: i + 1, c: col },
              e: { r: j, c: col }
            });
          });
          i = j - 1;
        }
      }
    }
    worksheet['!merges'] = merges;
    worksheet['!cols'] = wscols;

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!worksheet[cellAddress]) worksheet[cellAddress] = { t: 's', v: '' };

        worksheet[cellAddress].s = {
          border: {
            top: { style: 'thin' },
            bottom: { style: 'thin' },
            left: { style: 'thin' },
            right: { style: 'thin' }
          },
          alignment: { vertical: 'center', wrapText: true }
        };

        if (R === 0) {
          worksheet[cellAddress].s.font = { bold: true };
          worksheet[cellAddress].s.fill = { fgColor: { rgb: "F1F5F9" } };
          worksheet[cellAddress].s.alignment.horizontal = 'center';
        }
        if (C === invoiceColIndex && R > 0) {
          worksheet[cellAddress].t = 's';
        }
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan');
    let filename = `Laporan_${statusFilter || 'Admin'}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    if (category === 'rusak_internal') {
      filename = `Laporan_Barang_Rusak_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    }
    XLSX.writeFile(workbook, filename);
  };

  return (
    <div className="space-y-5 animate-fade-in pb-16 relative">
      {/* Top Filter & Actions Panel */}
      <div className="bg-[#130b2e]/90 border border-purple-900/30 p-4 rounded-2xl shadow-xl backdrop-blur-md sticky top-0 z-40 flex flex-col md:flex-row gap-3 justify-between items-start md:items-center">
        {/* Search Input */}
        <div className="relative flex-1 w-full group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400/60 group-focus-within:text-purple-300 transition-colors" />
          <input
            type="text"
            placeholder="Pencarian Cerdas (Invoice, SKU, PIC, Status)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-9 py-2.5 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white placeholder-purple-400/40 focus:ring-2 focus:ring-purple-500 outline-none text-xs font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-purple-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Date Filter & Options */}
        <div className="flex flex-wrap md:flex-nowrap gap-2.5 w-full md:w-auto items-center">
          {/* Single / Range toggle */}
          <div className="flex bg-[#0c0620]/90 border border-purple-900/40 rounded-xl p-1 gap-1">
            <button
              onClick={() => setIsRangeMode(false)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                !isRangeMode 
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-950/40' 
                  : 'text-purple-300/60 hover:text-white'
              }`}
            >
              Single
            </button>
            <button
              onClick={() => setIsRangeMode(true)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                isRangeMode 
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-950/40' 
                  : 'text-purple-300/60 hover:text-white'
              }`}
            >
              Range
            </button>
          </div>

          {/* Date Picker Inputs */}
          <div className="relative flex-1 md:w-auto flex gap-1.5 items-center">
            <div className="relative flex-1 group">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-8 pr-2 py-2 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white focus:ring-2 focus:ring-purple-500 outline-none text-xs font-medium cursor-pointer [color-scheme:dark] text-center"
                placeholder="Mulai"
              />
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400/60 pointer-events-none" />
            </div>

            {isRangeMode && (
              <div className="relative flex-1 group">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-8 pr-2 py-2 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white focus:ring-2 focus:ring-purple-500 outline-none text-xs font-medium cursor-pointer [color-scheme:dark] text-center"
                  placeholder="Selesai"
                />
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400/60 pointer-events-none" />
              </div>
            )}

            {/* Today Button */}
            <button
              onClick={() => {
                const today = format(new Date(), 'yyyy-MM-dd');
                setStartDate(today);
                if (isRangeMode) setEndDate(today);
                if (category === 'rusak_internal') {
                  localStorage.setItem('selectedDateFilter_rusak_internal', today);
                }
              }}
              className={`px-2.5 py-2 bg-[#0c0620] border rounded-xl text-[10px] font-bold transition-all ${
                startDate === format(new Date(), 'yyyy-MM-dd') && (!isRangeMode || endDate === startDate)
                  ? 'border-purple-500 text-purple-300 bg-purple-950/30'
                  : 'border-purple-900/40 text-purple-300/70 hover:text-white hover:bg-purple-900/20'
              }`}
            >
              Today
            </button>

            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  if (category === 'rusak_internal') {
                    localStorage.removeItem('selectedDateFilter_rusak_internal');
                  }
                }}
                className="p-2 bg-[#0c0620] border border-purple-900/40 rounded-xl text-purple-400 hover:text-rose-400"
                title="Hapus Tanggal"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Marketplace Select */}
          {!isStokLT3 && (
            <div className="relative flex-1 md:w-36 group">
              <select
                value={filterMarketplace}
                onChange={(e) => setFilterMarketplace(e.target.value)}
                className="w-full pl-3 pr-7 py-2 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white focus:ring-2 focus:ring-purple-500 outline-none appearance-none text-xs font-medium cursor-pointer"
              >
                <option value="">Marketplace</option>
                <option value="Shopee">Shopee</option>
                <option value="Tokopedia">Tokopedia</option>
                <option value="Lazada">Lazada</option>
                <option value="TikTok Shop">TikTok Shop</option>
                <option value="Blibli">Blibli</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400/60 pointer-events-none" />
            </div>
          )}

          {/* Reset All Filters */}
          <button
            onClick={() => {
              setFilterMarketplace('');
              setSearchTerm('');
              handleDateChange('');
              if (category === 'rusak_internal') {
                localStorage.removeItem('selectedDateFilter_rusak_internal');
              }
            }}
            className="p-2 bg-[#0c0620] border border-purple-900/40 rounded-xl text-purple-400 hover:text-white hover:bg-purple-900/30 transition-all"
            title="Reset Semua Filter"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Export Button */}
          <button
            onClick={exportToExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl transition-all shadow-md shadow-emerald-950/40 text-xs"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Ekspor</span>
          </button>

          {/* Bulk Delete Button */}
          {selectedIds.size > 0 && (
            <button
              onClick={() => setBulkDeleteModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-bold rounded-xl transition-all shadow-md shadow-rose-950/40 text-xs animate-in zoom-in duration-200"
            >
              <Trash2 className="w-4 h-4" />
              <span>Hapus ({selectedIds.size})</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md relative">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] custom-scrollbar relative">
          <table className="w-full text-left border-collapse table-auto min-w-[900px]">
            <thead className="sticky top-0 z-30">
              <tr className="bg-[#0c0620] border-b border-purple-900/40 text-purple-300 font-black text-[10px] tracking-wider uppercase">
                <th className="sticky left-0 z-40 bg-[#0e0725] px-3 py-3 w-10 border-r border-purple-900/40 shadow-[4px_0_12px_rgba(0,0,0,0.4)]">
                  <button
                    onClick={toggleSelectAll}
                    className="p-1 hover:bg-purple-800/30 rounded-lg transition-all text-purple-400"
                  >
                    {selectedIds.size === currentData.length && currentData.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-purple-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-3">Timestamp</th>
                {isExplorationMenu && (
                  <th className="px-3 py-3">Waktu</th>
                )}
                <th className="px-3 py-3">Sinkron Ginee</th>
                <th className="px-3 py-3">Analis</th>
                <th className="px-3 py-3">Marketplace</th>
                <th className="sticky left-10 z-40 bg-[#0e0725] px-3 py-3 border-r border-purple-900/40 shadow-[4px_0_12px_rgba(0,0,0,0.4)]">
                  {isPhysicalStatusMenu ? 'INV / PEMESANAN' : 'Referensi/Invoice'}
                </th>
                <th className="px-3 py-3">Status/Keterangan</th>
                {statusFilter === 'Retur Fisik' && (
                  <th className="px-3 py-3">Tipe</th>
                )}
                <th className="px-3 py-3">Keterangan Barang</th>
                <th className="px-3 py-3">SKU Barang</th>
                <th className="px-3 py-3 text-center">Qty</th>
                <th className="px-3 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-900/20 text-xs">
              {externalLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="animate-pulse">
                    <td className="sticky left-0 z-20 bg-[#0e0725] px-3 py-3.5"><div className="w-4 h-4 bg-purple-900/30 rounded" /></td>
                    <td className="px-3 py-3.5"><div className="h-3 w-16 bg-purple-900/30 rounded" /></td>
                    {isExplorationMenu && <td className="px-3 py-3.5"><div className="h-3 w-12 bg-purple-900/30 rounded" /></td>}
                    <td className="px-3 py-3.5"><div className="h-3 w-16 bg-purple-900/30 rounded" /></td>
                    <td className="px-3 py-3.5"><div className="h-3 w-16 bg-purple-900/30 rounded" /></td>
                    <td className="px-3 py-3.5"><div className="h-4 w-12 bg-purple-900/30 rounded-full" /></td>
                    <td className="sticky left-10 z-20 bg-[#0e0725] px-3 py-3.5"><div className="h-3 w-20 bg-purple-900/30 rounded" /></td>
                    <td className="px-3 py-3.5"><div className="h-3 w-16 bg-purple-900/30 rounded" /></td>
                    {statusFilter === 'Retur Fisik' && <td className="px-3 py-3.5"><div className="h-3 w-12 bg-purple-900/30 rounded" /></td>}
                    <td className="px-3 py-3.5"><div className="h-3 w-20 bg-purple-900/30 rounded" /></td>
                    <td className="px-3 py-3.5"><div className="h-3 w-20 bg-purple-900/30 rounded" /></td>
                    <td className="px-3 py-3.5 text-center"><div className="h-3 w-6 bg-purple-900/30 rounded mx-auto" /></td>
                    <td className="px-3 py-3.5 text-right"><div className="h-5 w-5 bg-purple-900/30 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={isExplorationMenu ? 16 : 15} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-4 max-w-sm mx-auto">
                      <div className="w-14 h-14 bg-purple-900/20 rounded-2xl flex items-center justify-center text-purple-400 border border-purple-700/30">
                        <Search className="w-7 h-7" />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-white mb-1">Data Tidak Ditemukan</h3>
                        <p className="text-purple-300/60 text-xs">
                          Tidak ada rekaman data yang cocok dengan filter tanggal atau pencarian saat ini.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSearchTerm('');
                          handleDateChange('');
                          setFilterMarketplace('');
                        }}
                        className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-md shadow-purple-950/50"
                      >
                        Hapus Filter
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                currentData.map((report) => (
                  <tr 
                    key={report.id} 
                    className={`hover:bg-purple-950/25 transition-colors group ${selectedIds.has(report.id!) ? 'bg-purple-600/15' : ''}`}
                  >
                    <td className="sticky left-0 z-20 bg-[#0e0725] group-hover:bg-[#150a36] px-3 py-2.5 border-r border-purple-900/40 shadow-[4px_0_12px_rgba(0,0,0,0.4)] transition-colors">
                      <button
                        onClick={() => report.id && toggleSelectRow(report.id)}
                        className="p-1 hover:bg-purple-800/30 rounded-lg transition-all text-purple-400/60 hover:text-purple-300"
                      >
                        {selectedIds.has(report.id!) ? (
                          <CheckSquare className="w-4 h-4 text-purple-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    {/* Timestamp */}
                    <td className="px-3 py-2.5 text-[11px] text-purple-300/80 font-medium whitespace-nowrap">
                      {editingId === report.id ? (
                        <input
                          type="date"
                          value={editForm.inputDate || ''}
                          onChange={(e) => setEditForm({ ...editForm, inputDate: e.target.value })}
                          className="bg-[#0c0620] border border-purple-800/60 rounded px-2 py-1 text-white text-xs [color-scheme:dark]"
                        />
                      ) : report.inputDate}
                    </td>

                    {/* Exploration time */}
                    {isExplorationMenu && (
                      <td className="px-3 py-2.5 text-[11px] text-purple-300 font-mono whitespace-nowrap">
                        {formatReportTime(report)}
                      </td>
                    )}

                    {/* Sinkron Ginee */}
                    <td className="px-3 py-2.5 text-[11px] text-purple-400/70 whitespace-nowrap">
                      {editingId === report.id ? (
                        <input
                          type="date"
                          value={editForm.gineeInputDate || ''}
                          onChange={(e) => setEditForm({ ...editForm, gineeInputDate: e.target.value })}
                          className="bg-[#0c0620] border border-purple-800/60 rounded px-2 py-1 text-white text-xs [color-scheme:dark]"
                        />
                      ) : (report.gineeInputDate || '---')}
                    </td>

                    {/* Analis */}
                    <td className="px-3 py-2.5 text-[11px] text-white font-bold whitespace-nowrap">
                      {editingId === report.id ? (
                        <input
                          type="text"
                          value={editForm.picGinee || ''}
                          onChange={(e) => setEditForm({ ...editForm, picGinee: e.target.value })}
                          className="bg-[#0c0620] border border-purple-800/60 rounded px-2 py-1 text-white text-xs"
                        />
                      ) : (report.picGinee || report.createdBy || (report as any).analis || (report as any).pic || '---')}
                    </td>

                    {/* Marketplace */}
                    <td className="px-3 py-2.5">
                      {editingId === report.id ? (
                        <select
                          value={editForm.marketplace || ''}
                          onChange={(e) => setEditForm({ ...editForm, marketplace: e.target.value })}
                          className="bg-[#0c0620] border border-purple-800/60 rounded px-2 py-1 text-white text-xs"
                        >
                          <option value="Shopee">Shopee</option>
                          <option value="Tokopedia">Tokopedia</option>
                          <option value="Lazada">Lazada</option>
                          <option value="TikTok Shop">TikTok Shop</option>
                          <option value="Lainnya">Lainnya</option>
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                          report.marketplace === 'Shopee' ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' :
                          report.marketplace === 'Tokopedia' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                          report.marketplace === 'Lazada' ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' :
                          report.marketplace === 'TikTok Shop' ? 'bg-rose-500/15 text-rose-300 border-rose-500/30' :
                          'bg-purple-950/40 text-purple-300 border-purple-800/30'
                        }`}>
                          {report.marketplace}
                        </span>
                      )}
                    </td>

                    {/* Invoice */}
                    <td className="sticky left-10 z-20 bg-[#0e0725] group-hover:bg-[#150a36] px-3 py-2.5 text-[11px] font-mono text-purple-300 font-bold border-r border-purple-900/40 shadow-[4px_0_12px_rgba(0,0,0,0.4)] transition-colors whitespace-nowrap">
                      {editingId === report.id ? (
                        <input
                          type="text"
                          value={editForm.invoiceNumber || ''}
                          onChange={(e) => setEditForm({ ...editForm, invoiceNumber: e.target.value })}
                          className="bg-[#0c0620] border border-purple-800/60 rounded px-2 py-1 text-white text-xs font-mono"
                        />
                      ) : (report.invoiceNumber || (report as any).invoice_number || (report as any).referensi_invoice || report.barcode || '---')}
                    </td>

                    {/* Status / Keterangan */}
                    <td className="px-3 py-2.5 text-[11px] text-purple-200 font-medium whitespace-nowrap">
                      {editingId === report.id ? (
                        <input
                          type="text"
                          value={editForm.status || ''}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                          className="bg-[#0c0620] border border-purple-800/60 rounded px-2 py-1 text-white text-xs"
                        />
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-purple-950/40 text-purple-300 border border-purple-800/30 text-[10px] font-bold">
                          {report.assetStatus || report.status || '---'}
                        </span>
                      )}
                    </td>

                    {/* Type for Retur Fisik */}
                    {statusFilter === 'Retur Fisik' && (
                      <td className="px-3 py-2.5 text-[11px] text-emerald-400 font-bold whitespace-nowrap">
                        {editingId === report.id ? (
                          <select
                            value={editForm.type || ''}
                            onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                            className="bg-[#0c0620] border border-purple-800/60 rounded px-2 py-1 text-white text-xs"
                          >
                            <option value="">Standard</option>
                            <option value="COD">COD</option>
                          </select>
                        ) : (report.type || 'Standard')}
                      </td>
                    )}

                    {/* Keterangan Barang */}
                    <td className="px-3 py-2.5">
                      {editingId === report.id ? (
                        <input
                          type="text"
                          value={editForm.itemDescription || ''}
                          onChange={(e) => setEditForm({ ...editForm, itemDescription: e.target.value })}
                          className="bg-[#0c0620] border border-purple-800/60 rounded px-2 py-1 text-white text-xs"
                        />
                      ) : (
                        <div className="text-[10px] text-purple-300/70 italic line-clamp-1 max-w-[120px]" title={report.itemDescription}>
                          {report.itemDescription || '---'}
                        </div>
                      )}
                    </td>

                    {/* SKU */}
                    <td className="px-3 py-2.5 text-[11px] font-bold text-white font-mono tracking-tight whitespace-nowrap">
                      {editingId === report.id ? (
                        <input
                          type="text"
                          value={editForm.sku || ''}
                          onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                          className="bg-[#0c0620] border border-purple-800/60 rounded px-2 py-1 text-white text-xs font-mono"
                        />
                      ) : report.sku}
                    </td>

                    {/* Qty */}
                    <td className="px-3 py-2.5 text-xs font-black text-purple-300 text-center">
                      {editingId === report.id ? (
                        <input
                          type="number"
                          value={editForm.quantity || 0}
                          onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value) })}
                          className="bg-[#0c0620] border border-purple-800/60 rounded px-2 py-1 text-white text-xs w-12 text-center"
                        />
                      ) : report.quantity}
                    </td>

                    {/* Ops / Actions */}
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {editingId === report.id ? (
                          <>
                            <button
                              onClick={handleSaveEdit}
                              disabled={isSaving}
                              className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-all"
                              title="Simpan"
                            >
                              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1 text-purple-400 hover:bg-purple-900/30 rounded-lg transition-all"
                              title="Batal"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleEditClick(report)}
                              className="p-1 text-purple-400/70 hover:text-purple-300 hover:bg-purple-900/30 rounded-lg transition-all"
                              title="Edit Data"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => report.id && handleDeleteClick(report.id)}
                              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                              title="Hapus Data"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-6 py-3.5 bg-[#0c0620]/95 border-t border-purple-900/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-[11px] text-purple-300/70 font-medium">
            Menampilkan <span className="text-white font-bold">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-white font-bold">{Math.min(currentPage * itemsPerPage, filteredReports.length)}</span> dari <span className="text-white font-bold">{filteredReports.length}</span> rekam
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="p-1 px-3 bg-[#130b2e] border border-purple-900/40 hover:bg-purple-900/30 text-white rounded-lg transition disabled:opacity-30 flex items-center gap-1 font-bold text-xs"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Sebelum
            </button>
            <span className="text-xs font-black text-purple-300 font-mono">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="p-1 px-3 bg-[#130b2e] border border-purple-900/40 hover:bg-purple-900/30 text-white rounded-lg transition disabled:opacity-30 flex items-center gap-1 font-bold text-xs"
            >
              Berikut <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {(deleteModal.show || bulkDeleteModal) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#130b2e] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-purple-800/40 p-6 text-center shadow-purple-950/80"
            >
              <div className="w-12 h-12 bg-rose-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-500/30 text-rose-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-white mb-2">
                {bulkDeleteModal ? 'Konfirmasi Hapus Massal' : 'Konfirmasi Hapus Data'}
              </h3>
              <p className="text-purple-300/80 text-xs leading-relaxed mb-6">
                {bulkDeleteModal
                  ? `Apakah Anda yakin ingin menghapus permanen ${selectedIds.size} baris data yang dipilih?`
                  : 'Apakah Anda yakin ingin menghapus permanen baris data rekaman ini?'}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setDeleteModal({ show: false, id: null });
                    setBulkDeleteModal(false);
                  }}
                  className="flex-1 py-2.5 px-4 bg-[#0c0620] hover:bg-purple-900/30 text-purple-300 font-bold rounded-xl transition-all border border-purple-900/40 text-xs"
                >
                  Batal
                </button>
                <button
                  onClick={bulkDeleteModal ? handleBulkDelete : confirmDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-50 text-white font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-950/50 text-xs uppercase tracking-wider"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  <span>Hapus {bulkDeleteModal ? 'Semua' : 'Data'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Toast
        isVisible={toastConfig.isVisible}
        message={toastConfig.message}
        type={toastConfig.type}
        onClose={() => setToastConfig(prev => ({ ...prev, isVisible: false }))}
      />
    </div>
  );
}
