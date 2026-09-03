import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, addDoc, setDoc, serverTimestamp, getDoc, updateDoc, limit } from 'firebase/firestore';
import { db, auth } from './firebase';
import { Report, OperationType, UserProfile } from './types';
import { handleFirestoreError, normalizeDate } from './utils';
import Toast, { ToastType } from './Toast';
import { Search, Filter, Trash2, ChevronLeft, ChevronRight, FileSpreadsheet, AlertTriangle, X, ChevronDown, Calendar, RotateCcw, CheckSquare, Square, Loader2, Edit2, Save, RefreshCcw, Download, Upload, Sparkles, Check, Eye, EyeOff, SlidersHorizontal } from 'lucide-react';
import { format, isSameDay, parseISO, isToday } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import XLSX from 'xlsx-js-style';
import { writeBatch } from 'firebase/firestore';

import { updateDashboardStats } from './stats';
import { supabaseCancelFisik } from './supabaseClient';

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
    const saved = localStorage.getItem(category === 'rusak_internal' ? 'selectedDateFilter_rusak_internal' : 'selectedLogDate');
    if (saved) return saved;
    return defaultToday ? format(new Date(), 'yyyy-MM-dd') : '';
  });
  const [endDate, setEndDate] = useState(globalDateFilter?.split('/')[1] || '');
  const [localDateFilter, setLocalDateFilter] = useState(() => {
    if (globalDateFilter) return globalDateFilter;
    const saved = localStorage.getItem(category === 'rusak_internal' ? 'selectedDateFilter_rusak_internal' : 'selectedLogDate');
    if (saved) return saved;
    return defaultToday ? format(new Date(), 'yyyy-MM-dd') : '';
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
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

        if (json.length === 0) {
          setImportStatus('File CSV/Excel kosong.');
          setParsedData([]);
        } else {
          setParsedData(json);
        }
      } catch (err: any) {
        setImportStatus('Gagal membaca file: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // Helper fleksibel untuk mengekstrak nilai kolom CSV/Excel tanpa masalah kapitalisasi/spasi/tanda hubung
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

  // Submit Import data dengan Anti-Duplikat Otomatis (Cek Referensi Invoice + SKU)
  const handleExecuteImportToFirestore = async () => {
    if (parsedData.length === 0) return;
    setIsImporting(true);
    setImportStatus(null);

    const getRowKey = (inv: string, sku: string) => `${(inv || '').trim().toLowerCase()}_${(sku || '').trim().toLowerCase()}`;
    const existingKeys = new Set<string>();

    // 1. Kumpulkan kombinasi invoice + sku yang sudah ada di memori
    initialReports.forEach((r: any) => {
      if (r.invoiceNumber || r.sku) {
        existingKeys.add(getRowKey(r.invoiceNumber || '', r.sku || ''));
      }
    });

    // 2. Kumpulkan juga dari Supabase untuk memastikan 100% akurat
    try {
      const { data: existingSp } = await supabaseCancelFisik
        .from('cancel_fisik_reports')
        .select('referensi_invoice, sku');
      if (existingSp) {
        existingSp.forEach((r: any) => {
          if (r.referensi_invoice || r.sku) {
            existingKeys.add(getRowKey(r.referensi_invoice || '', r.sku || ''));
          }
        });
      }
    } catch (e) {}

    // Filter file import hanya untuk baris yang belum ada di database
    let skippedDuplicates = 0;
    const uniquePayloads: any[] = [];
    const uniqueRawRows: any[] = [];

    parsedData.forEach(row => {
      const inv = getRowVal(row, ['referensi_invoice', 'referensi invoice', 'referensi/no pesanan/invoice', 'invoice', 'invoice_ref', 'invoice_number', 'inv / pemesanan', 'inv']);
      const sku = getRowVal(row, ['sku', 'sku_id', 'sku / barcode', 'barcode', 'item_code']);
      const qtyRaw = getRowVal(row, ['qty', 'quantity', 'jumlah']);
      const qty = Number(qtyRaw) || 1;

      const rawDate = getRowVal(row, ['tanggal_log', 'tanggal log', 'log_date', 'inputdate', 'input_date', 'timestamp', 'tanggal', 'date']) || format(new Date(), 'yyyy-MM-dd');
      const logDate = normalizeDate(rawDate);

      const rawGineeDate = getRowVal(row, ['tgl_input_ginee', 'tgl input ginee', 'sinkron ginee', 'ginee_date']);
      const gineeDate = rawGineeDate ? normalizeDate(rawGineeDate) : null;

      const pic = getRowVal(row, ['analis_pic', 'analis (pic)', 'analis', 'pic_input_ginee', 'pic input ginee', 'pic ginee', 'pic']) || user?.email || 'DevMode';
      const mp = getRowVal(row, ['marketplace', 'pasar']) || 'Shopee';
      const desc = getRowVal(row, ['product_name', 'nama produk', 'keterangan barang', 'status/keterangan', 'keterangan', 'notes', 'itemdescription']) || '';
      const loc = getRowVal(row, ['location_rak', 'lokasi / rak', 'lokasi', 'rak', 'location']) || '';

      const key = getRowKey(inv, sku);
      if (inv && sku && existingKeys.has(key)) {
        skippedDuplicates++;
        return; // Skip duplikat!
      }
      if (inv && sku) existingKeys.add(key); // Cegah duplikat di dalam file itu sendiri

      uniqueRawRows.push(row);
      uniquePayloads.push({
        tanggal_log: logDate,
        tgl_input_ginee: gineeDate,
        pic_input_ginee: pic,
        marketplace: mp,
        analis_pic: pic,
        modul_fisik: 'Cancel Fisik',
        referensi_invoice: inv,
        location_rak: loc,
        sku: sku,
        product_name: desc,
        status_aset: 'Cancel Fisik',
        qty: qty,
        keterangan: desc,
        created_by: user?.email || user?.uid || 'DevMode User'
      });
    });

    if (uniquePayloads.length === 0) {
      showToast(`ℹ️ Semua ${parsedData.length} baris data dalam file sudah ada di database (0 duplikat di-import).`, 'error');
      setIsImportModalOpen(false);
      setParsedData([]);
      setExcelFile(null);
      setIsImporting(false);
      return;
    }

    let successCount = 0;
    try {
      // 1. Simpan ke Supabase Cancel Fisik
      try {
        const { error: spErr } = await supabaseCancelFisik
          .from('cancel_fisik_reports')
          .insert(uniquePayloads);

        if (!spErr) successCount = uniquePayloads.length;
        else console.warn("Supabase import insert warn:", spErr);
      } catch (eSp) {
        console.warn("Supabase import exception:", eSp);
      }

      // 2. Simpan ke Firestore (collection reports)
      for (const row of uniqueRawRows) {
        const inv = getRowVal(row, ['referensi_invoice', 'referensi invoice', 'referensi/no pesanan/invoice', 'invoice', 'invoice_ref', 'invoice_number', 'inv / pemesanan', 'inv']);
        const sku = getRowVal(row, ['sku', 'sku_id', 'sku / barcode', 'barcode', 'item_code']);
        const qtyRaw = getRowVal(row, ['qty', 'quantity', 'jumlah']);
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

        try {
          await addDoc(collection(db, 'reports'), firestorePayload);
          if (successCount === 0) successCount++;
        } catch (eFs) {}
      }

      const dupMsg = skippedDuplicates > 0 ? ` (${skippedDuplicates} data duplikat dilewati)` : '';
      showToast(`✅ Sukses meng-import ${uniquePayloads.length} data baru!${dupMsg}`, 'success');
      setIsImportModalOpen(false);
      setParsedData([]);
      setExcelFile(null);

      if (uniquePayloads.length > 0 && uniquePayloads[0].tanggal_log) {
        setStartDate(uniquePayloads[0].tanggal_log);
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
        deletedBy: user.uid
      });

      // 2. Delete Original
      const source = (reportToDelete as any)._source || 'reports';
      await deleteDoc(doc(db, source, deleteModal.id));

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
          // Create backup
          backupPromises.push(addDoc(collection(db, 'backups'), {
            originalData: reportToDelete,
            deletedAt: serverTimestamp(),
            deletedBy: user.uid
          }));
          // Add to delete batch
          const source = (reportToDelete as any)._source || 'reports';
          batch.delete(doc(db, source, id));
        }
      }

      if (backupPromises.length > 0) {
        await Promise.all(backupPromises);
        await batch.commit();
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
      const reportRef = doc(db, 'reports', editingId);
      const { id, createdAt, createdBy, ...updateData } = editForm as any;
      await updateDoc(reportRef, updateData);
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
      const reportStatus = report.normalizedStatus || report.status || '';
      const reportCategory = report.category || '';

      // 1. Search Filter (hande search later)

      // 2. Category Filter (Highly Inclusive fallback)
      const matchesExactlyByStatus = lowerStatusFilter && (reportStatus.toLowerCase().trim() === lowerStatusFilter);

      // If we are looking for a specific category, allow it if either category matches or status implies it
      if (category) {
        const isStokLT3 = category === 'stok_lt3';
        const isRusakInternal = category === 'rusak_internal' || category === 'eliminasi_rusak';

        // STO LT3 Logic: Must be explicitly stok_lt3 or have status 'Rusak Fisik'
        const isActuallyLT3 = reportCategory === 'stok_lt3' || reportStatus === 'Rusak Fisik';

        // INTERNAL Logic: Must be explicitly internal/eliminasi or have 'Eliminasi Stok Rusak' status OR type 'OUT'
        // [MODIFIKASI]: Includekan status 'Rusak Fisik' juga di Log Barang Rusak sesuai permintaan user agar data terlihat
        const isActuallyInternal = reportCategory === 'rusak_internal' ||
          reportCategory === 'eliminasi_rusak' ||
          reportStatus === 'Eliminasi Stok Rusak' ||
          reportStatus === 'Rusak Fisik' || // Include Physical Damage here too
          report.type === 'OUT';

        const isRetur2 = category === 'retur2' || lowerStatusFilter === 'cancel fisik';
        const isActuallyRetur2 = reportCategory === 'retur2' || reportStatus === 'Cancel Fisik' || (report as any).modul_fisik === 'Cancel Fisik';

        // Match if:
        // 1. Explicit request for LT3 and item is LT3
        // 2. Explicit request for Internal and item is Internal
        // 3. Explicit request for Retur2/Cancel Fisik
        // 4. User specifically filtered for this EXACT status (override)
        const categoryMatch = (isStokLT3 && isActuallyLT3) ||
          (isRusakInternal && isActuallyInternal) ||
          (isRetur2 && isActuallyRetur2);

        if (!categoryMatch && !matchesExactlyByStatus) return false;
      }

      // 3. Status Filter
      if (lowerStatusFilter) {
        if (reportStatus.toLowerCase().trim() !== lowerStatusFilter) return false;
      }

      // 4. Search Filter - Optimize by checking lowercase
      if (lowerSearch) {
        const matchesSearch =
          (report.invoiceNumber?.toLowerCase() || '').includes(lowerSearch) ||
          (report.sku?.toLowerCase() || '').includes(lowerSearch) ||
          (report.picGinee?.toLowerCase() || '').includes(lowerSearch) ||
          (report.status?.toLowerCase() || '').includes(lowerSearch);
        if (!matchesSearch) return false;
      }

      // 5. Marketplace Filter
      if (filterMarketplace && report.marketplace !== filterMarketplace) return false;

      // 6. Analyst Filter (User Request: Remove 'analis system' / 'SYSTEM')
      const creator = (report.createdBy || report.picGinee || (report as any).analis || '').toUpperCase();
      if (creator.includes('SYSTEM')) return false;

      // 7. Date Filter
      if (dateFilter && typeof report.inputDate === 'string') {
        const normalized = normalizeDate(report.inputDate);
        if (dateFilter.includes('/')) {
          const [start, end] = dateFilter.split('/');
          if (start && normalized < start) return false;
          if (end && normalized > end) return false;
        } else {
          if (normalized !== dateFilter && !normalized.startsWith(dateFilter)) return false;
        }
      }

      // 8. User Request: Deduplicate "Eksplorasi Laporan" and handle exclusions
      if (!category && !statusFilter) {
        const physicalStatuses = [
          'Retur Fisik',
          'Cancel Fisik',
          'Rusak Fisik',
          'Bundling Fisik',
          'Afkir Fisik',
          'Afkir Fisik (LT3)'
        ];

        const source = (report as any)._source || 'reports';
        const reportStatus = report.normalizedStatus || report.status || '';
        const reportCategory = report.category || '';

        // A. Handle Physical Data Deduplication
        // [MODIFIKASI]: User ingin semua data fisik tetap muncul di Eksplorasi Laporan.
        // Sebelumnya di sini ada filter source === 'reports' yang menyembunyikan data fisik, sekarang dihapus.

        // B. Handle Special Categories (Eliminasi/Internal)
        // These are purely for tracking and should not clog the main exploration report.
        if (reportCategory === 'rusak_internal' || reportCategory === 'eliminasi_rusak' || reportStatus === 'Eliminasi Stok Rusak') {
          return false;
        }

        // C. Sembunyikan Marketplace 'Umum'
        // Data dengan marketplace 'Umum' disembunyikan dari Eksplorasi Laporan sesuai permintaan.
        const mp = (report.marketplace || '').toUpperCase();
        if (mp === 'UMUM') {
          return false;
        }
      }

      return true;
    });
  }, [initialReports, category, statusFilter, searchTerm, filterMarketplace, dateFilter]);

  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
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

    // Sort data
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
      data = sortedReports.map(r => ({
        'Tanggal Log': normalizeDate(r.inputDate || (r as any).tanggal_log || (r as any).log_date || ''),
        'Tgl Input Ginee': r.gineeInputDate || (r as any).tgl_input_ginee || (r as any).ginee_date || '',
        'PIC Input Ginee': r.picGinee || (r as any).pic_input_ginee || (r as any).pic_ginee || '',
        'Marketplace': r.marketplace || '',
        'Analis (PIC)': r.createdBy || (r as any).analis || (r as any).analis_pic || '',
        'Modul Fisik': (r as any).modul_fisik || statusFilter || 'Data Fisik',
        'Referensi Invoice': r.invoiceNumber || (r as any).referensi_invoice || (r as any).invoice_ref || '',
        'Lokasi / Rak': r.location || (r as any).location_rak || (r as any).location || '',
        'SKU / Barcode': r.sku || '',
        'Nama Produk': r.itemDescription || (r as any).product_name || '',
        'Status Aset': r.assetStatus || r.status || statusFilter || '',
        'QTY': Number(r.quantity || (r as any).qty) || 1,
        'Keterangan': r.itemDescription || (r as any).notes || (r as any).keterangan || ''
      }));
      wscols = [
        { wch: 15 }, // Tanggal Log
        { wch: 15 }, // Tgl Input Ginee
        { wch: 18 }, // PIC Input Ginee
        { wch: 15 }, // Marketplace
        { wch: 18 }, // Analis (PIC)
        { wch: 15 }, // Modul Fisik
        { wch: 32 }, // Referensi Invoice
        { wch: 15 }, // Lokasi / Rak
        { wch: 35 }, // SKU / Barcode
        { wch: 40 }, // Nama Produk
        { wch: 18 }, // Status Aset
        { wch: 8 },  // QTY
        { wch: 35 }, // Keterangan
      ];
      invoiceColIndex = 6;
    } else {
      // Original format for Eksplorasi Laporan and others
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

    // Merges
    const merges: XLSX.Range[] = [];
    if (sortedReports.length > 0) {
      for (let i = 0; i < sortedReports.length; i++) {
        const currentInvoice = sortedReports[i].invoiceNumber;
        let j = i + 1;
        while (j < sortedReports.length && sortedReports[j].invoiceNumber === currentInvoice) {
          j++;
        }
        if (j - i > 1) {
          // Merge based on layout
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center glass-card p-4 rounded-[32px] border-white/5 sticky top-[116px] z-[60] shadow-2xl backdrop-blur-xl mb-4">
        <div className="absolute inset-0 overflow-hidden rounded-[32px] pointer-events-none">
          <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/5 blur-[50px] rounded-full -ml-16 -mt-16" />
        </div>

        <div className="relative flex-1 w-full group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
          <input
            type="text"
            placeholder="Pencarian Cerdas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white placeholder:text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none text-sm font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap md:flex-nowrap gap-3 w-full md:w-auto items-center">
          <div className="flex bg-[#0f172a] border border-white/10 rounded-2xl p-1 gap-1">
            <button
              onClick={() => setIsRangeMode(false)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${!isRangeMode ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Single
            </button>
            <button
              onClick={() => setIsRangeMode(true)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${isRangeMode ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Range
            </button>
          </div>

          <div className="relative flex-1 md:w-auto flex gap-2">
            <div className="relative flex-1 group">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-9 pr-2 py-2.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none text-xs font-medium cursor-pointer [color-scheme:dark] text-center"
                placeholder="Mulai"
              />
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors pointer-events-none" />
            </div>

            {isRangeMode && (
              <div className="relative flex-1 group">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-9 pr-2 py-2.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none text-xs font-medium cursor-pointer [color-scheme:dark] text-center"
                  placeholder="Selesai"
                />
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors pointer-events-none" />
              </div>
            )}

            <div className="flex gap-1">
              <button
                onClick={() => {
                  const today = format(new Date(), 'yyyy-MM-dd');
                  setStartDate(today);
                  if (isRangeMode) setEndDate(today);
                  if (category === 'rusak_internal') {
                    localStorage.setItem('selectedDateFilter_rusak_internal', today);
                  }
                }}
                className={`px-2 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[9px] font-bold text-slate-400 hover:text-white hover:bg-white/10 transition-all ${startDate === format(new Date(), 'yyyy-MM-dd') && (!isRangeMode || endDate === startDate) ? 'border-indigo-500 text-indigo-400' : ''}`}
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
                  className="p-2.5 bg-white/5 border border-white/10 rounded-2xl text-slate-500 hover:text-rose-400"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {!isStokLT3 && (
            <div className="relative flex-1 md:w-44 group">
              <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
              <select
                value={filterMarketplace}
                onChange={(e) => setFilterMarketplace(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none appearance-none text-sm font-medium cursor-pointer"
              >
                <option value="">Marketplace</option>
                <option value="Shopee">Shopee</option>
                <option value="Tokopedia">Tokopedia</option>
                <option value="Lazada">Lazada</option>
                <option value="TikTok Shop">TikTok Shop</option>
                <option value="Blibli">Blibli</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>
          )}

          <button
            onClick={() => {
              setFilterMarketplace('');
              setSearchTerm('');
              handleDateChange(''); // Clear date filter entirely on reset
              if (category === 'rusak_internal') {
                localStorage.removeItem('selectedDateFilter_rusak_internal');
              }
            }}
            className="p-2.5 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 text-slate-400 hover:text-white transition-all"
            title="Reset Semua Filter"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={exportToExcel}
            className="glow-btn flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-emerald-900/20 text-[10px] uppercase tracking-widest"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden lg:inline">Ekspor</span>
          </button>

          {isDevModeUnlocked && (
            <>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-emerald-900/20 text-[10px] uppercase tracking-widest cursor-pointer animate-pulse"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Import Data (DevMode)</span>
              </button>

              <button
                onClick={exportToExcel}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-cyan-900/20 text-[10px] uppercase tracking-widest cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Ekspor Original</span>
              </button>
            </>
          )}

          {selectedIds.size > 0 && (
            <button
              onClick={() => setBulkDeleteModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-rose-900/20 text-[10px] uppercase tracking-widest animate-in zoom-in duration-300"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden lg:inline">Hapus ({selectedIds.size})</span>
            </button>
          )}
        </div>
      </div>

      <div className="glass-card rounded-[32px] border-white/5 overflow-hidden shadow-2xl relative">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-350px)] custom-scrollbar relative">
          <table className="w-full text-left border-collapse table-auto">
            <thead className="sticky top-0 z-40">
              <tr className="bg-[#0f172a] border-b border-white/5">
                <th className="sticky left-0 z-50 bg-[#0f172a] px-3 py-3 w-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                  <button
                    onClick={toggleSelectAll}
                    className="p-1 hover:bg-white/10 rounded-lg transition-all text-slate-500 hover:text-indigo-400"
                  >
                    {selectedIds.size === currentData.length && currentData.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-indigo-500" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-3 text-[9px] font-black text-slate-500 uppercase tracking-wider">Timestamp</th>
                {isExplorationMenu && (
                  <th className="px-3 py-3 text-[9px] font-black text-slate-500 uppercase tracking-wider">Waktu</th>
                )}
                <th className="px-3 py-3 text-[9px] font-black text-slate-500 uppercase tracking-wider">Sinkron Ginee</th>
                <th className="px-3 py-3 text-[9px] font-black text-slate-500 uppercase tracking-wider">Analis</th>
                <th className="px-3 py-3 text-[9px] font-black text-slate-500 uppercase tracking-wider">Marketplace</th>
                <th className="sticky left-10 z-50 bg-[#0f172a] px-3 py-3 text-[9px] font-black text-slate-500 uppercase tracking-wider shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                  {isPhysicalStatusMenu ? 'INV / PEMESANAN' : 'Referensi/no pesanan/invoice'}
                </th>
                <th className="px-3 py-3 text-[9px] font-black text-slate-500 uppercase tracking-wider">Status/Keterangan</th>
                {statusFilter === 'Retur Fisik' && (
                  <th className="px-3 py-3 text-[9px] font-black text-slate-500 uppercase tracking-wider">Type</th>
                )}
                <th className="px-3 py-3 text-[9px] font-black text-slate-500 uppercase tracking-wider">Keterangan Barang</th>
                <th className="px-3 py-3 text-[9px] font-black text-slate-500 uppercase tracking-wider">SKU</th>
                <th className="px-3 py-3 text-[9px] font-black text-slate-500 uppercase tracking-wider text-center">Qty</th>
                <th className="px-3 py-3 text-[9px] font-black text-slate-500 uppercase tracking-wider text-right">Ops</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {externalLoading ? (
                Array.from({ length: 12 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="animate-pulse border-b border-white/[0.02]">
                    <td className="sticky left-0 z-30 bg-[#0f172a] px-3 py-4 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                      <div className="w-4 h-4 bg-slate-800 rounded" />
                    </td>
                    <td className="px-3 py-4"><div className="h-3 w-20 bg-slate-800 rounded" /></td>
                    {isExplorationMenu && (
                      <td className="px-3 py-4"><div className="h-3 w-12 bg-slate-800 rounded" /></td>
                    )}
                    <td className="px-3 py-4"><div className="h-3 w-20 bg-slate-800 rounded" /></td>
                    <td className="px-3 py-4"><div className="h-3 w-16 bg-slate-800 rounded" /></td>
                    <td className="px-3 py-4"><div className="h-4 w-12 bg-slate-800 rounded-full" /></td>
                    <td className="sticky left-10 z-30 bg-[#0f172a] px-3 py-4 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                      <div className="h-3 w-24 bg-slate-800 rounded" />
                    </td>
                    <td className="px-3 py-4"><div className="h-3 w-20 bg-slate-800 rounded" /></td>
                    {statusFilter === 'Retur Fisik' && (
                      <td className="px-3 py-4"><div className="h-3 w-12 bg-slate-800 rounded" /></td>
                    )}
                    <td className="px-3 py-4"><div className="h-3 w-24 bg-slate-800 rounded" /></td>
                    <td className="px-3 py-4"><div className="h-3 w-24 bg-slate-800 rounded" /></td>
                    <td className="px-3 py-4 text-center"><div className="h-3 w-8 bg-slate-800 rounded mx-auto" /></td>
                    <td className="px-3 py-4 text-right"><div className="h-6 w-6 bg-slate-800 rounded-lg ml-auto" /></td>
                  </tr>
                ))
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={isExplorationMenu ? 16 : 15} className="px-8 py-24 text-center">
                    <div className="flex flex-col items-center gap-6 max-w-sm mx-auto">
                      <div className="w-20 h-20 bg-slate-800/20 rounded-[32px] flex items-center justify-center text-slate-700 border border-white/5">
                        <Search className="w-10 h-10" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-white mb-2 tracking-tight">Data Tidak Ditemukan</h3>
                        <p className="text-slate-500 text-xs font-medium leading-relaxed uppercase tracking-widest">
                          Tidak ada rekaman yang cocok dengan filter saat ini. Coba hapus filter tanggal atau kata kunci pencarian.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSearchTerm('');
                          handleDateChange('');
                          setFilterMarketplace('');
                        }}
                        className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-900/20 text-[10px] uppercase tracking-[0.2em]"
                      >
                        Hapus Semua Filter
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                currentData.map((report) => (
                  <tr key={report.id} className={`hover:bg-white/[0.04] transition-all group ${selectedIds.has(report.id!) ? 'bg-indigo-500/5' : ''}`}>
                    <td className="sticky left-0 z-30 bg-[#0f172a] px-3 py-3 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                      <button
                        onClick={() => report.id && toggleSelectRow(report.id)}
                        className="p-1 hover:bg-white/10 rounded-lg transition-all text-slate-500 hover:text-indigo-400"
                      >
                        {selectedIds.has(report.id!) ? (
                          <CheckSquare className="w-4 h-4 text-indigo-500" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-[10px] text-slate-400 font-medium whitespace-nowrap">
                      {editingId === report.id ? (
                        <div className="relative group">
                          <input
                            type="date"
                            value={editForm.inputDate || ''}
                            onChange={(e) => setEditForm({ ...editForm, inputDate: e.target.value })}
                            className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-white w-32 pl-8 appearance-none cursor-pointer [color-scheme:dark]"
                          />
                          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 group-focus-within:text-indigo-400 transition-colors pointer-events-none" />
                        </div>
                      ) : report.inputDate}
                    </td>
                    {isExplorationMenu && (
                      <td className="px-3 py-3 text-[10px] text-indigo-300 font-semibold whitespace-nowrap">
                        {formatReportTime(report)}
                      </td>
                    )}
                    <td className="px-3 py-3 text-[10px] text-slate-500 whitespace-nowrap">
                      {editingId === report.id ? (
                        <div className="relative group">
                          <input
                            type="date"
                            value={editForm.gineeInputDate || ''}
                            onChange={(e) => setEditForm({ ...editForm, gineeInputDate: e.target.value })}
                            className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-white w-32 pl-8 appearance-none cursor-pointer [color-scheme:dark]"
                          />
                          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 group-focus-within:text-indigo-400 transition-colors pointer-events-none" />
                        </div>
                      ) : (report.gineeInputDate || '---')}
                    </td>
                    <td className="px-3 py-3 text-[10px] text-slate-200 font-bold whitespace-nowrap">
                      {editingId === report.id ? (
                        <input
                          type="text"
                          value={editForm.picGinee || ''}
                          onChange={(e) => setEditForm({ ...editForm, picGinee: e.target.value })}
                          className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-white w-20"
                        />
                      ) : (report.picGinee || report.createdBy || '---')}
                    </td>
                    <td className="px-3 py-3">
                      {editingId === report.id ? (
                        <select
                          value={editForm.marketplace || ''}
                          onChange={(e) => setEditForm({ ...editForm, marketplace: e.target.value })}
                          className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-white text-[10px]"
                        >
                          <option value="Shopee">Shopee</option>
                          <option value="Tokopedia">Tokopedia</option>
                          <option value="Lazada">Lazada</option>
                          <option value="TikTok Shop">TikTok Shop</option>
                          <option value="Lainnya">Lainnya</option>
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border
                          ${report.marketplace === 'Shopee' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                            report.marketplace === 'Tokopedia' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                              report.marketplace === 'Lazada' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                report.marketplace === 'TikTok Shop' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                  'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                          {report.marketplace}
                        </span>
                      )}
                    </td>
                    <td className="sticky left-10 z-30 bg-[#0f172a] px-3 py-3 text-[10px] font-mono text-indigo-300/80 font-bold shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                      {editingId === report.id ? (
                        <input
                          type="text"
                          value={editForm.invoiceNumber || ''}
                          onChange={(e) => setEditForm({ ...editForm, invoiceNumber: e.target.value })}
                          className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-white w-24"
                        />
                      ) : report.invoiceNumber}
                    </td>
                    <td className="px-3 py-3 text-[10px] text-slate-400 font-medium whitespace-nowrap">
                      {editingId === report.id ? (
                        <input
                          type="text"
                          value={editForm.status || ''}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                          className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-white w-24"
                        />
                      ) : (
                        <div className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                          {report.assetStatus || report.status || '---'}
                        </div>
                      )}
                    </td>
                    {statusFilter === 'Retur Fisik' && (
                      <td className="px-3 py-3 text-[10px] text-emerald-400 font-bold whitespace-nowrap">
                        {editingId === report.id ? (
                          <select
                            value={editForm.type || ''}
                            onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                            className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-white text-[10px]"
                          >
                            <option value="">Standard</option>
                            <option value="COD">COD</option>
                          </select>
                        ) : (report.type || 'Standard')}
                      </td>
                    )}
                    <td className="px-3 py-3">
                      {editingId === report.id ? (
                        <input
                          type="text"
                          value={editForm.itemDescription || ''}
                          onChange={(e) => setEditForm({ ...editForm, itemDescription: e.target.value })}
                          className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-white w-24"
                        />
                      ) : (
                        <div className="text-[9px] text-slate-600 font-medium line-clamp-1 max-w-[100px] leading-relaxed italic" title={report.itemDescription}>
                          {report.itemDescription || '---'}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[10px] font-black text-indigo-400 tracking-tight whitespace-nowrap">
                      {editingId === report.id ? (
                        <input
                          type="text"
                          value={editForm.sku || ''}
                          onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                          className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-white w-24"
                        />
                      ) : report.sku}
                    </td>
                    <td className="px-3 py-3 text-[10px] font-black text-white text-center">
                      {editingId === report.id ? (
                        <input
                          type="number"
                          value={editForm.quantity || 0}
                          onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value) })}
                          className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-white w-12"
                        />
                      ) : report.quantity}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {editingId === report.id ? (
                          <>
                            <button
                              onClick={handleSaveEdit}
                              disabled={isSaving}
                              className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all border border-transparent hover:border-emerald-500/20"
                              title="Simpan"
                            >
                              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1 text-slate-400 hover:bg-white/10 rounded-lg transition-all border border-transparent hover:border-white/20"
                              title="Batal"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleEditClick(report)}
                              className="p-1 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all border border-transparent hover:border-indigo-500/20"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => report.id && handleDeleteClick(report.id)}
                              className="p-1 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all border border-transparent hover:border-rose-500/20"
                              title="Hapus"
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

        {/* Pagination */}
        <div className="px-8 py-6 bg-white/[0.01] border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">
              Rekaman <span className="text-slate-400">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredReports.length)}</span> dari <span className="text-slate-400">{filteredReports.length}</span> Komitmen
            </div>
          </div>
          <div className="flex gap-3">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 disabled:opacity-20 transition-all text-slate-400 hover:text-white"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1.5 px-4 font-black text-xs">
              <span className="text-indigo-400">{currentPage}</span>
              <span className="text-slate-800">/</span>
              <span className="text-slate-600">{totalPages || 1}</span>
            </div>
            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 disabled:opacity-20 transition-all text-slate-400 hover:text-white"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Modern Dark Delete Confirmation Modal */}
      <AnimatePresence>
        {(deleteModal.show || bulkDeleteModal) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-[#0f172a] w-full max-w-md rounded-[48px] shadow-3xl overflow-hidden border border-white/10"
            >
              <div className="p-10 text-center relative overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-rose-500/10 blur-[60px] rounded-full -mt-20" />
                <div className="w-20 h-20 bg-rose-500/10 rounded-[32px] flex items-center justify-center mx-auto mb-8 border border-rose-500/20 shadow-lg shadow-rose-900/10">
                  <AlertTriangle className="w-10 h-10 text-rose-500" />
                </div>
                <h3 className="text-2xl font-black text-white mb-4 tracking-tight">
                  {bulkDeleteModal ? 'Penghapusan Massal' : 'Pencabutan Akses'}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-6 font-medium">
                  {bulkDeleteModal
                    ? `Konfirmasi penghapusan permanen ${selectedIds.size} rekaman data terpilih. Tindakan ini tidak dapat dibatalkan.`
                    : 'Konfirmasi penghapusan permanen rekaman data terpilih. Tindakan ini tidak dapat dibatalkan.'}
                </p>

                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setDeleteModal({ show: false, id: null });
                      setBulkDeleteModal(false);
                    }}
                    className="flex-1 py-4 px-6 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-black rounded-2xl transition-all border border-white/5 text-xs uppercase tracking-widest"
                  >
                    BATAL
                  </button>
                  <button
                    onClick={bulkDeleteModal ? handleBulkDelete : confirmDelete}
                    disabled={isDeleting}
                    className="flex-1 py-4 px-6 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:opacity-50 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-3 shadow-2xl shadow-rose-900/30 text-xs uppercase tracking-widest"
                  >
                    {isDeleting ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <X className="w-5 h-5" />
                    )}
                    HAPUS {bulkDeleteModal ? 'SEMUA' : 'DATA'}
                  </button>
                </div>
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
      {/* MODAL IMPORT DATA CSV / EXCEL (DEV MODE) - Render via Portal */}
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
                    Import Data CSV / Excel ke Firestore
                    <span className="px-2 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-300 rounded-full font-mono border border-emerald-400/30">
                      DEV MODE
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Drag & Drop file CSV/Excel atau pilih dari explorer untuk dimasukkan ke Firestore.
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
              <div className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/10">
                <div>
                  <h4 className="text-sm font-bold text-white">Template Format Data</h4>
                  <p className="text-xs text-slate-400">Download template format kolom CSV / Excel yang didukung.</p>
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
                onClick={() => document.getElementById('report-table-excel-input')?.click()}
              >
                <input
                  id="report-table-excel-input"
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processFile(file);
                  }}
                />
                <Upload className={`w-12 h-12 mb-3 ${isDragOver ? 'text-emerald-400 animate-bounce' : 'text-slate-400'}`} />
                <p className="text-sm font-bold text-white mb-1">
                  {excelFile ? excelFile.name : 'Tarik & Lepas File CSV / Excel di sini, atau klik untuk memilih'}
                </p>
                <p className="text-xs text-slate-400">Format yang didukung: .csv, .xlsx, .xls</p>
              </div>

              {importStatus && (
                <div className="p-4 bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-2xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{importStatus}</span>
                </div>
              )}

              {parsedData.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Preview Data ({parsedData.length} baris terdeteksi)
                    </h4>
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                      <Check className="w-4 h-4" /> Siap dimasukkan ke Firestore
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
                            <td className="p-3 font-bold text-white">{getRowVal(row, ['referensi_invoice', 'referensi invoice', 'invoice', 'invoice_ref', 'inv / pemesanan']) || '-'}</td>
                            <td className="p-3 text-indigo-400">{getRowVal(row, ['sku', 'sku_id', 'sku / barcode', 'barcode']) || '-'}</td>
                            <td className="p-3 truncate max-w-[200px]">{getRowVal(row, ['product_name', 'nama produk', 'keterangan barang', 'status/keterangan', 'keterangan']) || '-'}</td>
                            <td className="p-3">{getRowVal(row, ['qty', 'quantity', 'jumlah']) || 1}</td>
                            <td className="p-3 text-rose-400">{getRowVal(row, ['modul_fisik', 'status_aset', 'status']) || 'Cancel Fisik'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsedData.length > 10 && (
                    <p className="text-[11px] text-slate-400 text-center italic">
                      + Menampilkan 10 dari total {parsedData.length} baris data CSV/Excel.
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
                onClick={handleExecuteImportToFirestore}
                disabled={parsedData.length === 0 || isImporting}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mengimport ke Firestore...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Import {parsedData.length} Data ke Firestore</span>
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
