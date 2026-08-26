import React, { useState, useEffect } from 'react';
import { CloudDownload, AlertTriangle, Loader2, Trash2, Layers, Package, Search, X, Database, Users, Clock, CheckCircle2, RotateCcw, Filter, FolderOutput, ArrowRight, Copy, Check } from 'lucide-react';
import { supabase } from './supabaseClient';

// ------------------------------------------
// HELPER FUNCTIONS
// ------------------------------------------
const getDeviceId = () => {
   let id = localStorage.getItem('kalindo_device_id');
   if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('kalindo_device_id', id);
   }
   return id;
};

const getTodayWIB = () => {
   // Format ISO YYYY-MM-DD di zona waktu Asia/Jakarta
   return new Date().toLocaleString("en-CA", { timeZone: "Asia/Jakarta" }).split(',')[0];
};

export default function AdminDataImport({ user }: { user?: any }) {
   const [adminDataTab, setAdminDataTab] = useState<'DATA' | 'IMPORT' | 'MOVED'>('DATA');

   // State Import Excel
   const [adminExcelFile, setAdminExcelFile] = useState<File | null>(null);
   const [adminExcelData, setAdminExcelData] = useState<any[]>([]);
   const [adminExcelColumns, setAdminExcelColumns] = useState<string[]>([]);
   const [adminImportError, setAdminImportError] = useState<string | null>(null);
   const [isAdminImporting, setIsAdminImporting] = useState(false);
   const [adminImportProgress, setAdminImportProgress] = useState({ current: 0, total: 0 });
   const [isAdminDragOver, setIsAdminDragOver] = useState(false);
   const [adminPageSize, setAdminPageSize] = useState<number>(100);
   const [adminCurrentPage, setAdminCurrentPage] = useState<number>(1);
   const [isAdminFetching, setIsAdminFetching] = useState(false);
   const [isAdminClearing, setIsAdminClearing] = useState(false);
   const [adminImportSearch, setAdminImportSearch] = useState("");

   // State Moved Data
   const [movedExcelData, setMovedExcelData] = useState<any[]>([]);
   const [isMovedFetching, setIsMovedFetching] = useState(false);
   const [movedSearch, setMovedSearch] = useState("");
   const [movedPageSize, setMovedPageSize] = useState<number>(100);
   const [movedCurrentPage, setMovedCurrentPage] = useState<number>(1);
   const [isMoving, setIsMoving] = useState(false);
   
   // State Bulk Select Import
   const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);

   // State Data Admin (Supabase)
   const [scannedItems, setScannedItems] = useState<any[]>([]);
   const [isScansLoading, setIsScansLoading] = useState(false);
   const [scansSearch, setScansSearch] = useState("");
   const [scansCurrentPage, setScansCurrentPage] = useState(1);
   const [scansPageSize, setScansPageSize] = useState(100);
   const [scansDateFilter, setScansDateFilter] = useState(() => {
      const today = new Date();
      return today.toISOString().split('T')[0];
   });
   const [scansStaffFilter, setScansStaffFilter] = useState('');
   const [isBarcodesCopied, setIsBarcodesCopied] = useState(false);
   const [copiedColumn, setCopiedColumn] = useState<string | null>(null);

   const TARGET_MOVED_COLUMNS = ['ID Pesanan', 'Status', 'Alasan Pembatalan', 'MSKU', 'Jumlah'];
   const ADMIN_DATA_COLUMNS = ['timestamp', 'barcode', 'employee_name', 'shift', 'role', 'status'];

   const handleCopyColumnData = (colName: string, dataList: any[]) => {
      const textToCopy = dataList.map(item => item[colName] || '').join('\n');
      navigator.clipboard.writeText(textToCopy);
      setCopiedColumn(colName);
      setTimeout(() => setCopiedColumn(null), 2000);
   };

   const handleCopyFullTable = (dataList: any[], columns: string[], type: string) => {
      const rows = dataList.map(item => {
         return columns.map(col => {
            const val = col === 'timestamp' && item[col] ? new Date(item[col]).toLocaleString('id-ID') : item[col];
            return String(val ?? '').replace(/\n/g, ' ');
         }).join('\t');
      });
      const textToCopy = rows.join('\n');
      navigator.clipboard.writeText(textToCopy);
      setCopiedColumn(type);
      setTimeout(() => setCopiedColumn(null), 2000);
   };

   // ------------------------------------------
   // 1. SUPABASE FETCH (TAB DATA ADMIN)
   // ------------------------------------------
   const fetchScannedItems = async () => {
      setIsScansLoading(true);
      try {
         let q = supabase.from('scanned_items').select('*').eq('role', 'ADMIN').order('timestamp', { ascending: false });
         if (scansDateFilter) {
            const startOfDay = new Date(scansDateFilter);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(scansDateFilter);
            endOfDay.setHours(23, 59, 59, 999);
            q = q.gte('timestamp', startOfDay.getTime()).lte('timestamp', endOfDay.getTime());
         }
         const { data, error } = await q;
         if (error) throw error;
         setScannedItems(data || []);
      } catch (err: any) {
         console.error("Gagal mengambil data scan:", err);
      } finally {
         setIsScansLoading(false);
      }
   };

   useEffect(() => {
      if (adminDataTab === 'DATA') {
         fetchScannedItems();
      }
   }, [adminDataTab, scansDateFilter]);


   // ------------------------------------------
   // 2. FIRESTORE IMPORT DATA (TAB IMPORT)
   // ------------------------------------------
   const checkAutoClear = async (collectionName: string) => {
      const deviceId = getDeviceId();
      const todayWIB = getTodayWIB();
      
      const { collection, query, where, getDocs, writeBatch } = await import('firebase/firestore');
      const { db } = await import('./firebaseClient'); 
      
      // Ambil data milik device ini yang tanggalnya BUKAN hari ini
      const q = query(collection(db, collectionName), where("deviceId", "==", deviceId));
      const snapshot = await getDocs(q);
      
      let needClear = false;
      const docsToDelete: any[] = [];
      
      snapshot.forEach(doc => {
         const data = doc.data();
         if (data.dateWIB && data.dateWIB !== todayWIB) {
            needClear = true;
            docsToDelete.push(doc.ref);
         }
      });
      
      if (needClear) {
         console.log(`Auto-clearing outdated data for device ${deviceId} in ${collectionName}`);
         let currentBatch = writeBatch(db);
         let count = 0;
         for (const ref of docsToDelete) {
            currentBatch.delete(ref);
            count++;
            if (count % 400 === 0) {
               await currentBatch.commit();
               currentBatch = writeBatch(db);
            }
         }
         if (count % 400 !== 0) await currentBatch.commit();
         return true; // Indicates it was cleared
      }
      return false;
   };

   const fetchAdminImportData = async () => {
      setIsAdminFetching(true);
      try {
         const cleared = await checkAutoClear('admin_data_import');
         
         const { collection, query, where, getDocs } = await import('firebase/firestore');
         const { db } = await import('./firebaseClient'); 
         const deviceId = getDeviceId();
         
         const q = query(collection(db, 'admin_data_import'), where("deviceId", "==", deviceId));
         const snapshot = await getDocs(q);
         
         const data: any[] = [];
         snapshot.forEach(doc => {
            data.push({ id: doc.id, ...doc.data() }); // Simpan Doc ID buat delete nanti
         });
         
         data.sort((a, b) => {
            if (a.importedAt === b.importedAt) {
               return (a.originalRowIndex || 0) - (b.originalRowIndex || 0);
            }
            return (a.importedAt || '') > (b.importedAt || '') ? 1 : -1;
         });
         
         setAdminExcelData(data);
         if (data.length > 0) {
            let cols: string[] = [];
            if (data[0]._columnOrder) {
               try {
                  cols = JSON.parse(data[0]._columnOrder);
               } catch (e) {}
            }
            if (cols.length === 0) {
               cols = Object.keys(data[0]).filter(k => 
                  !['importedAt', 'importedBy', 'originalRowIndex', 'deviceId', 'dateWIB', 'id', '_columnOrder', 'movedAt'].includes(k)
               );
            }
            setAdminExcelColumns(cols);
         } else {
            setAdminExcelColumns([]);
         }
      } catch (err: any) {
         console.error("Fetch import error:", err);
      } finally {
         setIsAdminFetching(false);
      }
   };

   const clearCollectionByDevice = async (collectionName: string) => {
      if (!window.confirm(`Hapus semua data di tab ini? (Akan menghapus data khusus device ini saja)`)) return;
      setIsAdminClearing(true);
      try {
         const { collection, query, where, getDocs, writeBatch } = await import('firebase/firestore');
         const { db } = await import('./firebaseClient'); 
         const deviceId = getDeviceId();
         
         const q = query(collection(db, collectionName), where("deviceId", "==", deviceId));
         const snapshot = await getDocs(q);
         
         let currentBatch = writeBatch(db);
         let count = 0;
         for (const document of snapshot.docs) {
            currentBatch.delete(document.ref);
            count++;
            if (count % 400 === 0) {
               await currentBatch.commit();
               currentBatch = writeBatch(db);
            }
         }
         if (count % 400 !== 0) await currentBatch.commit();
         
         if (collectionName === 'admin_data_import') {
            setAdminExcelData([]);
            setAdminExcelFile(null);
         } else {
            setMovedExcelData([]);
         }
         alert("Data berhasil dihapus dari database.");
      } catch (err: any) {
         alert("Gagal menghapus data: " + err.message);
      } finally {
         setIsAdminClearing(false);
      }
   };

   const handleAdminDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsAdminDragOver(true);
   };

   const handleAdminDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsAdminDragOver(false);
   };

   const handleAdminDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsAdminDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
         const name = file.name.toLowerCase();
         if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
            handleAdminExcelUpload(file);
         } else {
            setAdminImportError("Hanya mendukung file Excel (.xlsx atau .xls).");
         }
      }
   };

   const handleAdminExcelUpload = async (file: File) => {
      setAdminExcelFile(file);
      setAdminImportError(null);
      setAdminExcelData([]);
      setAdminExcelColumns([]);

      try {
         const reader = new FileReader();
         reader.onload = async (e) => {
            try {
               const data = e.target?.result;
               const XLSX = await import('xlsx');
               const workbook = XLSX.read(data, { type: 'binary' });
               const firstSheetName = workbook.SheetNames[0];
               const worksheet = workbook.Sheets[firstSheetName];
               const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

               if (json.length > 0) {
                  let lastNo = "";
                  const processedJson = json.map((row: any) => {
                     const cleanRow = { ...row };
                     if (cleanRow['NO.'] && String(cleanRow['NO.']).trim() !== '') {
                        lastNo = String(cleanRow['NO.']).trim();
                     } else {
                        cleanRow['NO.'] = lastNo;
                     }
                     return cleanRow;
                  });

                  const cols = Object.keys(processedJson[0] as object);
                  setAdminExcelColumns(cols);
                  handleAdminFirestoreImport(processedJson, file, cols);
               } else {
                  setAdminImportError("File Excel kosong.");
               }
            } catch (err: any) {
               setAdminImportError("Gagal membaca file Excel: " + err.message);
            }
         };
         reader.onerror = () => setAdminImportError("Gagal membaca file.");
         reader.readAsBinaryString(file);
      } catch (err: any) {
         setAdminImportError(err.message || String(err));
      }
   };

   const handleAdminFirestoreImport = async (data: any[], file: File, columns: string[]) => {
      setIsAdminImporting(true);
      setAdminImportError(null);
      setAdminImportProgress({ current: 0, total: data.length });

      try {
         const { writeBatch, doc, collection } = await import('firebase/firestore');
         const { db } = await import('./firebaseClient');
         
         const deviceId = getDeviceId();
         const dateWIB = getTodayWIB();
         const userEmail = user?.email || 'UNKNOWN_USER';

         const batchSize = 400;
         let currentProcessed = 0;
         let currentBatch = writeBatch(db);
         let batchCount = 0;
         const targetCollectionRef = collection(db, 'admin_data_import');

         for (let i = 0; i < data.length; i++) {
            const rowData = data[i];
            const newDocRef = doc(targetCollectionRef);
            
            currentBatch.set(newDocRef, {
               ...rowData,
               originalRowIndex: i,
               importedAt: new Date().toISOString(),
               importedBy: userEmail,
               deviceId: deviceId,
               dateWIB: dateWIB,
               _columnOrder: JSON.stringify(columns)
            });
            batchCount++;

            if (batchCount === batchSize) {
               await currentBatch.commit();
               currentProcessed += batchCount;
               setAdminImportProgress({ current: currentProcessed, total: data.length });
               currentBatch = writeBatch(db);
               batchCount = 0;
               await new Promise(resolve => setTimeout(resolve, 300));
            }
         }

         if (batchCount > 0) {
            await currentBatch.commit();
            currentProcessed += batchCount;
         }

         alert(`Berhasil mengimpor ${currentProcessed} baris ke Firestore untuk device ini!`);
         setAdminExcelFile(null);
         fetchAdminImportData(); // Re-fetch untuk mendapat document IDs
         
      } catch (err: any) {
         setAdminImportError("Gagal simpan ke Firestore: " + (err.message || String(err)));
      } finally {
         setIsAdminImporting(false);
         setAdminImportProgress({ current: 0, total: 0 });
      }
   };


   // ------------------------------------------
   // 3. FIRESTORE MOVED DATA (TAB MOVED)
   // ------------------------------------------
   const fetchMovedData = async () => {
      setIsMovedFetching(true);
      try {
         await checkAutoClear('admin_data_moved');
         
         const { collection, query, where, getDocs } = await import('firebase/firestore');
         const { db } = await import('./firebaseClient'); 
         const deviceId = getDeviceId();
         
         const q = query(collection(db, 'admin_data_moved'), where("deviceId", "==", deviceId));
         const snapshot = await getDocs(q);
         
         const data: any[] = [];
         snapshot.forEach(doc => {
            data.push({ id: doc.id, ...doc.data() });
         });
         
         data.sort((a, b) => {
            if (a.movedAt === b.movedAt) {
               if (a.importedAt === b.importedAt) {
                  return (a.originalRowIndex || 0) - (b.originalRowIndex || 0);
               }
               return (a.importedAt || '') > (a.importedAt || '') ? 1 : -1;
            }
            return (a.movedAt || '') > (b.movedAt || '') ? -1 : 1; // Terakhir dipindah di atas
         });
         setMovedExcelData(data);
         if (data.length > 0) {
            let cols: string[] = [];
            if (data[0]._columnOrder) {
               try {
                  cols = JSON.parse(data[0]._columnOrder);
               } catch (e) {}
            }
            if (cols.length === 0) {
               cols = Object.keys(data[0]).filter(k => 
                  !['importedAt', 'importedBy', 'originalRowIndex', 'deviceId', 'dateWIB', 'id', '_columnOrder', 'movedAt'].includes(k)
               );
            }
            setAdminExcelColumns(cols);
         }
         
      } catch (err: any) {
         console.error("Fetch moved data error:", err);
      } finally {
         setIsMovedFetching(false);
      }
   };

   useEffect(() => {
      if (adminDataTab === 'IMPORT') fetchAdminImportData();
      if (adminDataTab === 'MOVED') fetchMovedData();
   }, [adminDataTab]);

   const moveDataToSelected = async (idPesanan: string) => {
      if (!idPesanan) return;
      setIsMoving(true);
      
      try {
         // Temukan semua baris di state saat ini yang punya ID Pesanan sama
         const rowsToMove = adminExcelData.filter(r => r['ID Pesanan'] === idPesanan);
         if (rowsToMove.length === 0) {
            setIsMoving(false);
            return;
         }
         
         const { writeBatch, doc, collection } = await import('firebase/firestore');
         const { db } = await import('./firebaseClient');
         const deviceId = getDeviceId();
         const dateWIB = getTodayWIB();
         const movedAt = new Date().toISOString();
         
         const importCol = collection(db, 'admin_data_import');
         const movedCol = collection(db, 'admin_data_moved');
         
         const batch = writeBatch(db);
         
         rowsToMove.forEach(row => {
            // Hapus dari import collection
            if (row.id) {
               batch.delete(doc(importCol, row.id));
            }
            // Tambah ke moved collection
            const newDocRef = doc(movedCol);
            // Salin data tanpa ID aslinya
            const { id, ...cleanRow } = row;
            batch.set(newDocRef, {
               ...cleanRow,
               movedAt,
               deviceId,
               dateWIB,
               _columnOrder: row._columnOrder || '[]'
            });
         });
         
         await batch.commit();
         
         // Update Local State Optimistically
         setAdminExcelData(prev => prev.filter(r => r['ID Pesanan'] !== idPesanan));
         setSelectedImportIds(prev => prev.filter(id => id !== idPesanan));
         
      } catch (err: any) {
         alert("Gagal memindah data: " + err.message);
      } finally {
         setIsMoving(false);
      }
   };

   const moveSelectedDataBulk = async () => {
      if (selectedImportIds.length === 0) return;
      if (!window.confirm(`Yakin memindah ${selectedImportIds.length} ID Pesanan ke Data Terpilih?`)) return;
      
      setIsMoving(true);
      
      try {
         const rowsToMove = adminExcelData.filter(r => selectedImportIds.includes(r['ID Pesanan']));
         if (rowsToMove.length === 0) {
            setIsMoving(false);
            return;
         }
         
         const { writeBatch, doc, collection } = await import('firebase/firestore');
         const { db } = await import('./firebaseClient');
         const deviceId = getDeviceId();
         const dateWIB = getTodayWIB();
         const movedAt = new Date().toISOString();
         
         const importCol = collection(db, 'admin_data_import');
         const movedCol = collection(db, 'admin_data_moved');
         
         let batch = writeBatch(db);
         let opCount = 0;
         
         for (const row of rowsToMove) {
            if (row.id) {
               batch.delete(doc(importCol, row.id));
               opCount++;
            }
            const newDocRef = doc(movedCol);
            const { id, ...cleanRow } = row;
            batch.set(newDocRef, {
               ...cleanRow,
               movedAt,
               deviceId,
               dateWIB,
               _columnOrder: row._columnOrder || '[]'
            });
            opCount++;
            
            if (opCount >= 400) {
               await batch.commit();
               batch = writeBatch(db);
               opCount = 0;
            }
         }
         
         if (opCount > 0) {
            await batch.commit();
         }
         
         setAdminExcelData(prev => prev.filter(r => !selectedImportIds.includes(r['ID Pesanan'])));
         setSelectedImportIds([]);
         
      } catch (err: any) {
         alert("Gagal memindah data massal: " + err.message);
      } finally {
         setIsMoving(false);
      }
   };


   // ------------------------------------------
   // RENDER UI
   // ------------------------------------------

   // Filters
   const searchScansLower = scansSearch.toLowerCase();
   const filteredScans = scannedItems.filter(r => {
      const matchSearch = scansSearch ? (
         String(r.barcode || '').toLowerCase().includes(searchScansLower) ||
         String(r.employee_name || '').toLowerCase().includes(searchScansLower) ||
         String(r.role || '').toLowerCase().includes(searchScansLower) ||
         String(r.status || '').toLowerCase().includes(searchScansLower)
      ) : true;
      const matchStaff = scansStaffFilter ? r.employee_name === scansStaffFilter : true;
      return matchSearch && matchStaff;
   });

   const searchImportLower = adminImportSearch.toLowerCase();
   const filteredImportData = adminImportSearch ? adminExcelData.filter(r => 
      String(r['ID Pesanan'] || '').toLowerCase().includes(searchImportLower) ||
      String(r['AWB/No. Tracking'] || '').toLowerCase().includes(searchImportLower) ||
      String(r['MSKU'] || '').toLowerCase().includes(searchImportLower)
   ) : adminExcelData;

   const searchMovedLower = movedSearch.toLowerCase();
   const filteredMovedData = movedSearch ? movedExcelData.filter(r => 
      String(r['ID Pesanan'] || '').toLowerCase().includes(searchMovedLower) ||
      String(r['AWB/No. Tracking'] || '').toLowerCase().includes(searchMovedLower) ||
      String(r['MSKU'] || '').toLowerCase().includes(searchMovedLower)
   ) : movedExcelData;

   return (
      <div className="w-full h-full flex flex-col bg-[#120a32] relative rounded-2xl overflow-hidden shadow-sm">
         {/* TABS HEADER */}
         <div className="w-full bg-[#1a0f44] relative shrink-0 z-20 shadow-sm border-gray-200 dark:border-white/10 overflow-x-auto">
            <div className="flex bg-black/20 min-w-max">
               <button
                  onClick={() => setAdminDataTab('DATA')}
                  className={`px-8 py-4 text-sm font-black tracking-wider uppercase transition-all duration-300 flex items-center gap-2 border-gray-200 dark:border-white/10 ${adminDataTab === 'DATA' ? 'text-pink-400 bg-[#120a32] border-b-pink-500' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
               >
                  <Database size={16} /> Data Admin
               </button>
               <button
                  onClick={() => setAdminDataTab('IMPORT')}
                  className={`px-8 py-4 text-sm font-black tracking-wider uppercase transition-all duration-300 flex items-center gap-2 border-gray-200 dark:border-white/10 ${adminDataTab === 'IMPORT' ? 'text-pink-400 bg-[#120a32] border-b-pink-500' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
               >
                  <CloudDownload size={16} /> Import Excel
               </button>
               <button
                  onClick={() => setAdminDataTab('MOVED')}
                  className={`px-8 py-4 text-sm font-black tracking-wider uppercase transition-all duration-300 flex items-center gap-2 ${adminDataTab === 'MOVED' ? 'text-pink-400 bg-[#120a32] border-b-pink-500' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
               >
                  <FolderOutput size={16} /> Data Terpilih
               </button>
            </div>
         </div>

         {/* Peringatan Auto-Clear untuk Import & Moved */}
         {(adminDataTab === 'IMPORT' || adminDataTab === 'MOVED') && (
            <div className="bg-amber-500/10 border-amber-200 dark:border-amber-500/20 px-4 py-2 flex items-center gap-2 shrink-0">
               <AlertTriangle size={14} className="text-amber-400" />
               <p className="text-[11px] font-bold text-amber-300 uppercase tracking-wide">
                  Info: Data import & terpilih spesifik untuk perangkat ini. Data akan OTOMATIS TERHAPUS jika berganti hari (Zona Waktu WIB).
               </p>
            </div>
         )}

         {/* ---------------------------------------------------------------------------------------- */}
         {/* TAB 1: DATA ADMIN */}
         {/* ---------------------------------------------------------------------------------------- */}
         {adminDataTab === 'DATA' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#120a32]">
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 border-gray-200 dark:border-white/10 bg-white/5">
                  <div className="p-5 border-gray-200 dark:border-white/10 flex items-center justify-between group">
                     <div>
                        <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                           <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span> Total Scans
                        </div>
                        <h4 className="text-3xl font-black text-white group-hover:scale-105 transition-transform origin-left">
                           {filteredScans.length.toLocaleString()}
                        </h4>
                     </div>
                     <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-400 shadow-inner">
                        <Package size={24} />
                     </div>
                  </div>
                  <div className="p-5 border-gray-200 dark:border-white/10 flex items-center justify-between group">
                     <div>
                        <div className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                           <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span> Active Staff
                        </div>
                        <h4 className="text-3xl font-black text-white group-hover:scale-105 transition-transform origin-left">
                           {new Set(filteredScans.map(i => i.employee_name).filter(Boolean)).size.toLocaleString()}
                        </h4>
                     </div>
                     <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-400 shadow-inner">
                        <Users size={24} />
                     </div>
                  </div>
                  <div className="p-5 flex items-center justify-between group">
                     <div>
                        <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                           <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Latest Scan
                        </div>
                        <h4 className="text-sm font-bold text-white group-hover:scale-105 transition-transform origin-left line-clamp-1">
                           {scannedItems[0] ? new Date(scannedItems[0].timestamp).toLocaleString('id-ID') : '-'}
                        </h4>
                     </div>
                     <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 shadow-inner">
                        <Clock size={24} />
                     </div>
                  </div>
               </div>
               {/* Toolbar Data Admin */}
               <div className="p-4 border-gray-200 dark:border-white/10 flex items-center justify-between gap-4 flex-wrap bg-[#1a0f44]">
                  <div className="flex items-center gap-2">
                     <button onClick={fetchScannedItems} className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors" title="Refresh">
                        <RotateCcw size={18} className={isScansLoading ? "animate-spin" : ""} />
                     </button>
                     <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                        <Filter size={16} className="text-gray-400" />
                        <input type="date" value={scansDateFilter} onChange={(e) => { setScansDateFilter(e.target.value); setScansCurrentPage(1); }} className="bg-transparent text-sm font-bold text-slate-200 outline-none" />
                     </div>
                     <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                        <Filter size={16} className="text-gray-400" />
                        <select 
                           value={scansStaffFilter} 
                           onChange={(e) => { setScansStaffFilter(e.target.value); setScansCurrentPage(1); }} 
                           className="bg-transparent text-sm font-bold text-slate-200 outline-none w-32"
                        >
                           <option value="" className="bg-[#0f172a]">Semua Staff</option>
                           {Array.from(new Set(scannedItems.map(i => i.employee_name).filter(Boolean))).map(staff => (
                              <option key={staff} value={staff} className="bg-[#0f172a]">{staff}</option>
                           ))}
                        </select>
                     </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input type="text" value={scansSearch} onChange={(e) => { setScansSearch(e.target.value); setScansCurrentPage(1); }} placeholder="Cari barcode, nama..." className="w-64 pl-9 pr-8 py-1.5 bg-black/30 border border-white/10 rounded-lg text-xs font-bold focus:ring-2 focus:ring-indigo-500 text-white outline-none transition-all" />
                        {scansSearch && <button onClick={() => { setScansSearch(""); setScansCurrentPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"><X size={14} /></button>}
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400">Tampilkan:</span>
                        <select className="bg-black/30 border border-white/10 text-white rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500" value={scansPageSize} onChange={(e) => { setScansPageSize(Number(e.target.value)); setScansCurrentPage(1); }}>
                           <option value={100}>100</option>
                           <option value={200}>200</option>
                           <option value={500}>500</option>
                        </select>
                     </div>
                  </div>
               </div>
               {/* Table Data Admin */}
               <div className="flex-1 overflow-auto bg-[#120a32]">
                  {isScansLoading ? (
                     <div className="p-10 text-center flex flex-col items-center justify-center h-full"><Loader2 className="animate-spin text-indigo-500 mb-4" size={40} /><p className="text-slate-400 font-bold">Memuat Data Scans...</p></div>
                  ) : filteredScans.length === 0 ? (
                     <div className="p-10 text-gray-500 dark:text-slate-400 font-bold">Tidak ada data scan ditemukan.</div>
                  ) : (
                     <table className="w-full text-left whitespace-nowrap text-sm">
                        <thead className="bg-[#1a0f44] border-gray-200 dark:border-white/10 sticky top-0 z-10 shadow-sm">
                           <tr>
                              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-gray-200 dark:border-white/5">No.</th>
                              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-gray-200 dark:border-white/5">Timestamp</th>
                              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-gray-200 dark:border-white/5">
                                 <div className="flex items-center justify-between">
                                    <span>Barcode Data</span>
                                    <button 
                                       onClick={() => {
                                          const barcodes = filteredScans.map(item => item.barcode).filter(Boolean).join('\n');
                                          navigator.clipboard.writeText(barcodes);
                                          setIsBarcodesCopied(true);
                                          setTimeout(() => setIsBarcodesCopied(false), 2000);
                                       }}
                                       className="flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded transition-colors border border-white/10"
                                       title="Salin semua barcode"
                                    >
                                       {isBarcodesCopied ? <><Check size={12} /> Disalin</> : <><Copy size={12} /> Copy All</>}
                                    </button>
                                 </div>
                              </th>
                              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-gray-200 dark:border-white/5">Staff</th>
                              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-gray-200 dark:border-white/5">Shift</th>
                              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-gray-200 dark:border-white/5">Role</th>
                              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                           {filteredScans.slice((scansCurrentPage - 1) * scansPageSize, scansCurrentPage * scansPageSize).map((item, idx) => {
                              const absoluteIdx = (scansCurrentPage - 1) * scansPageSize + idx + 1;
                              return (
                                 <tr key={item.id || idx} className="hover:bg-white/5 transition-colors">
                                    <td className="p-4 border-gray-100 dark:border-white/5 text-slate-500 font-mono font-medium">{absoluteIdx}</td>
                                    <td className="p-4 border-gray-100 dark:border-white/5 text-slate-300 font-mono">{new Date(item.timestamp).toLocaleString('id-ID')}</td>
                                    <td className="p-4 border-gray-100 dark:border-white/5 font-black text-indigo-400 font-mono tracking-wider">{item.barcode}</td>
                                    <td className="p-4 border-gray-100 dark:border-white/5 text-slate-200 font-bold">{item.employee_name}</td>
                                    <td className="p-4 border-gray-100 dark:border-white/5 text-slate-400 font-medium">{item.shift || '-'}</td>
                                    <td className="p-4 border-gray-100 dark:border-white/5 text-slate-400 font-medium"><span className="px-2 py-1 bg-white/10 rounded-md text-[10px] uppercase font-bold tracking-wider">{item.role}</span></td>
                                    <td className="p-4">
                                       {item.status === 'COMPLETED' ? (
                                          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-[10px] font-bold uppercase tracking-wider w-fit border border-emerald-500/20"><CheckCircle2 size={12} /> Selesai</span>
                                       ) : (
                                          <span className="px-2 py-1 bg-white/5 text-slate-400 rounded border border-white/10 text-xs font-bold">{item.status}</span>
                                       )}
                                    </td>
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  )}
               </div>
               {filteredScans.length > 0 && (
                  <div className="bg-[#1a0f44] border-gray-200 dark:border-white/10 p-3 flex items-center justify-between shrink-0">
                     <span className="text-gray-500 dark:text-slate-400 font-bold">Menampilkan {(scansCurrentPage - 1) * scansPageSize + 1} - {Math.min(scansCurrentPage * scansPageSize, filteredScans.length)} dari {filteredScans.length}</span>
                     <div className="flex gap-2">
                        <button onClick={() => setScansCurrentPage(p => Math.max(1, p - 1))} disabled={scansCurrentPage === 1} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-bold disabled:opacity-50 hover:bg-white/10 text-white">Prev</button>
                        <button onClick={() => setScansCurrentPage(p => Math.min(Math.ceil(filteredScans.length / scansPageSize), p + 1))} disabled={scansCurrentPage * scansPageSize >= filteredScans.length} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-bold disabled:opacity-50 hover:bg-white/10 text-white">Next</button>
                     </div>
                  </div>
               )}
            </div>
         )}


         {/* ---------------------------------------------------------------------------------------- */}
         {/* TAB 2: IMPORT EXCEL */}
         {/* ---------------------------------------------------------------------------------------- */}
         {adminDataTab === 'IMPORT' && (
            <div className="flex-1 flex flex-col overflow-hidden bg-[#120a32] p-4">
               <div className="flex flex-col h-full overflow-y-auto bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-6">
                  <div className="flex justify-between items-center mb-6">
                     <h3 className="text-lg font-black text-white flex items-center gap-2">
                        <CloudDownload size={22} className="text-indigo-400" /> Data Admin Import (Device Session)
                     </h3>
                     <div className="flex gap-3">
                        <button onClick={fetchAdminImportData} disabled={isAdminFetching} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"><RotateCcw size={16} className={isAdminFetching ? "animate-spin" : ""} /></button>
                        {adminExcelData.length > 0 && (
                           <button onClick={() => clearCollectionByDevice('admin_data_import')} disabled={isAdminImporting || isAdminClearing} className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold rounded-xl text-sm transition-colors border border-rose-500/20 disabled:opacity-50"><Trash2 size={16} /> Clear Session Data</button>
                        )}
                     </div>
                  </div>
                  
                  {adminImportError && (
                     <div className="p-3 bg-rose-500/20 text-rose-300 text-xs rounded-xl mb-4 flex items-start gap-2 border border-rose-500/30">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" /><span>{adminImportError}</span>
                     </div>
                  )}

                  {isAdminFetching || isAdminImporting || isAdminClearing || isMoving ? (
                     <div className="flex flex-col items-center justify-center flex-1 border-dashed border-white/10 rounded-2xl min-h-[300px]">
                        <Loader2 size={48} className="text-indigo-400 animate-spin mb-4" />
                        <p className="text-slate-400 font-bold">{isAdminClearing ? 'Menghapus Data...' : isMoving ? 'Memindah Data...' : isAdminImporting ? `Mengimpor: ${adminImportProgress.current} / ${adminImportProgress.total}` : 'Memuat Data...'}</p>
                     </div>
                  ) : adminExcelData.length === 0 ? (
                     <div className="grid grid-cols-1 gap-6 mb-6 shrink-0 max-w-2xl mx-auto w-full">
                        <div onDragOver={handleAdminDragOver} onDragLeave={handleAdminDragLeave} onDrop={handleAdminDrop} className={`p-10 rounded-2xl border-dashed flex flex-col items-center justify-center min-h-[260px] transition-all duration-300 cursor-pointer ${isAdminDragOver ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10 shadow-lg shadow-indigo-500/10 scale-[1.01]' : 'border-white/20 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-500/5'}`}>
                           <div className="p-5 bg-indigo-500/10 rounded-full shadow-inner mb-5 animate-pulse"><CloudDownload size={48} className="text-indigo-400" /></div>
                           <h4 className="font-bold text-gray-900 dark:text-white mb-2">Pilih atau Tarik File Excel</h4>
                           <p className="text-gray-500 dark:text-center mb-6">Mendukung format .xlsx dan .xls</p>
                           <label className="bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 dark:from-indigo-600 dark:to-violet-600 dark:hover:from-indigo-500 dark:hover:to-violet-500 text-white px-8 py-3 rounded-xl cursor-pointer transition-all duration-300 shadow-lg hover:shadow-indigo-500/20 text-sm font-bold active:scale-[0.98]">
                              Browse File
                              <input type="file" accept=".xlsx, .xls" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAdminExcelUpload(file); }} className="hidden" />
                           </label>
                        </div>
                     </div>
                  ) : (
                     <div className="flex flex-col flex-grow">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 shrink-0">
                           <div className="bg-indigo-500/10 p-4 rounded-2xl border border-indigo-500/20 flex items-center justify-between">
                              <div><p className="text-[10px] uppercase tracking-wider font-bold text-indigo-400 mb-1">Total Baris (Item)</p><h4 className="text-2xl font-black text-white">{adminExcelData.length.toLocaleString()}</h4></div>
                              <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-300"><Layers size={20} /></div>
                           </div>
                           <div className="bg-purple-500/10 p-4 rounded-2xl border border-purple-500/20 flex items-center justify-between">
                              <div><p className="text-[10px] uppercase tracking-wider font-bold text-purple-400 mb-1">Total Resi/Orderan</p><h4 className="text-2xl font-black text-white">{new Set(adminExcelData.map(r => String(r['NO.'] || '').trim()).filter(Boolean)).size.toLocaleString()}</h4></div>
                              <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-300"><Package size={20} /></div>
                           </div>
                           <div className="col-span-2 flex items-center justify-end gap-3 flex-wrap">
                               {selectedImportIds.length > 0 && (
                                  <button 
                                     onClick={moveSelectedDataBulk}
                                     disabled={isMoving}
                                     className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors border border-indigo-600 text-xs font-bold shadow-md shadow-indigo-500/20"
                                  >
                                     <ArrowRight size={14} /> Pindah {selectedImportIds.length} Terpilih
                                  </button>
                               )}
                              <button 
                                 onClick={() => handleCopyFullTable(filteredImportData, adminExcelColumns, 'import_full')}
                                 className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors border border-white/10 text-xs font-bold"
                              >
                                 {copiedColumn === 'import_full' ? <><Check size={14} /> Disalin</> : <><Copy size={14} /> Copy Tabel</>}
                              </button>
                              <div className="relative flex-grow max-w-xs">
                                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                 <input type="text" value={adminImportSearch} onChange={(e) => { setAdminImportSearch(e.target.value); setAdminCurrentPage(1); }} placeholder="Cari ID Pesanan, AWB, MSKU..." className="w-full pl-9 pr-8 py-1.5 bg-[#0f172a] border border-white/10 rounded-lg text-xs font-bold focus:ring-2 focus:ring-indigo-500 text-white outline-none" />
                                 {adminImportSearch && <button onClick={() => { setAdminImportSearch(""); setAdminCurrentPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"><X size={14} /></button>}
                              </div>
                              <div className="flex items-center gap-2">
                                 <span className="text-xs font-bold text-slate-400">Tampilkan:</span>
                                 <select className="bg-[#0f172a] border border-white/10 text-white rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500" value={adminPageSize} onChange={(e) => { setAdminPageSize(Number(e.target.value)); setAdminCurrentPage(1); }}>
                                    <option value={100}>100 Baris</option>
                                    <option value={150}>150 Baris</option>
                                    <option value={200}>200 Baris</option>
                                    <option value={500}>500 Baris</option>
                                    <option value={100000}>Semua Data</option>
                                 </select>
                              </div>
                           </div>
                        </div>

                        <div className="flex flex-col flex-grow min-h-[300px] border border-white/10 rounded-2xl overflow-hidden shadow-sm bg-[#0a0520] relative">
                           <div className="overflow-auto flex-grow relative">
                              <table className="w-full text-left border-collapse text-xs whitespace-nowrap min-w-max">
                                 <thead className="bg-[#120a32] border-gray-200 dark:border-white/10 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                       <th className="px-4 py-3 border-r border-white/5 text-slate-400 font-bold bg-[#120a32] w-10 text-center">
                                          <input 
                                             type="checkbox" 
                                             className="rounded border-white/20 bg-black/20 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                                             checked={
                                                filteredImportData.length > 0 && 
                                                new Set(filteredImportData.map(r => r['ID Pesanan'])).size > 0 &&
                                                [...new Set(filteredImportData.map(r => r['ID Pesanan']))].every(id => selectedImportIds.includes(id))
                                             }
                                             onChange={(e) => {
                                                const allVisibleIds = [...new Set(filteredImportData.map(r => r['ID Pesanan']))];
                                                if (e.target.checked) {
                                                   const newIds = new Set([...selectedImportIds, ...allVisibleIds]);
                                                   setSelectedImportIds(Array.from(newIds));
                                                } else {
                                                   setSelectedImportIds(selectedImportIds.filter(id => !allVisibleIds.includes(id)));
                                                }
                                             }}
                                          />
                                       </th>
                                       <th className="px-4 py-3 border-r border-white/5 text-slate-400 font-bold bg-[#120a32]">Action</th>
                                       <th className="px-4 py-3 border-r border-white/5 text-slate-400 font-bold bg-[#120a32]">#</th>
                                       {adminExcelColumns.map(col => (
                                          <th key={col} className="px-4 py-3 border-r border-white/5 text-slate-400 font-bold bg-[#120a32]">{col}</th>
                                       ))}
                                    </tr>
                                 </thead>
                                 <tbody>
                                    {filteredImportData.slice((adminCurrentPage - 1) * adminPageSize, adminCurrentPage * adminPageSize).map((row, idx) => {
                                       const absoluteIdx = (adminCurrentPage - 1) * adminPageSize + idx;
                                       const isMergedCol = absoluteIdx === 0 || String(filteredImportData[absoluteIdx - 1]['NO.']) !== String(row['NO.']);
                                       
                                       return (
                                          <tr key={idx} className={`border-gray-100 dark:border-white/5 hover:bg-white/5 transition-colors ${selectedImportIds.includes(row['ID Pesanan']) ? 'bg-indigo-500/10' : ''}`}>
                                             <td className="px-4 py-2.5 border-gray-100 dark:border-white/5 text-center">
                                                {isMergedCol && (
                                                   <input 
                                                      type="checkbox" 
                                                      className="rounded border-white/20 bg-black/20 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                                                      checked={selectedImportIds.includes(row['ID Pesanan'])}
                                                      onChange={(e) => {
                                                         if (e.target.checked) {
                                                            setSelectedImportIds(prev => [...prev, row['ID Pesanan']]);
                                                         } else {
                                                            setSelectedImportIds(prev => prev.filter(id => id !== row['ID Pesanan']));
                                                         }
                                                      }}
                                                   />
                                                )}
                                             </td>
                                             <td className="px-4 py-2.5 border-gray-100 dark:border-white/5">
                                                {isMergedCol && (
                                                   <button 
                                                      onClick={() => moveDataToSelected(row['ID Pesanan'])}
                                                      className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-[10px] font-bold uppercase transition-colors border border-white/10"
                                                   >
                                                      <ArrowRight size={12} /> Pindah
                                                   </button>
                                                )}
                                             </td>
                                             <td className="px-4 py-2.5 border-gray-100 dark:border-white/5 text-slate-500 font-mono font-medium">{absoluteIdx + 1}</td>
                                             {adminExcelColumns.map(col => {
                                                const showValue = col !== 'NO.' || isMergedCol;
                                                return (
                                                   <td key={col} className="px-4 py-2.5 border-gray-100 dark:border-white/5 text-slate-300 font-mono">
                                                      {showValue ? String(row[col] ?? '') : ''}
                                                   </td>
                                                );
                                             })}
                                          </tr>
                                       );
                                    })}
                                 </tbody>
                              </table>
                           </div>
                           
                           {filteredImportData.length > 0 && adminPageSize < filteredImportData.length && (
                              <div className="bg-[#120a32] border-gray-200 dark:border-white/10 p-3 flex items-center justify-between sticky bottom-0 z-10">
                                 <span className="text-gray-500 dark:text-slate-400 font-bold">Menampilkan {(adminCurrentPage - 1) * adminPageSize + 1} - {Math.min(adminCurrentPage * adminPageSize, filteredImportData.length)} dari {filteredImportData.length} baris</span>
                                 <div className="flex gap-2">
                                    <button onClick={() => setAdminCurrentPage(p => Math.max(1, p - 1))} disabled={adminCurrentPage === 1} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-bold disabled:opacity-50 hover:bg-white/10 text-white">Prev</button>
                                    <button onClick={() => setAdminCurrentPage(p => Math.min(Math.ceil(filteredImportData.length / adminPageSize), p + 1))} disabled={adminCurrentPage * adminPageSize >= filteredImportData.length} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-bold disabled:opacity-50 hover:bg-white/10 text-white">Next</button>
                                 </div>
                              </div>
                           )}
                        </div>
                     </div>
                  )}
               </div>
            </div>
         )}


         {/* ---------------------------------------------------------------------------------------- */}
         {/* TAB 3: DATA TERPILIH (MOVED) */}
         {/* ---------------------------------------------------------------------------------------- */}
         {adminDataTab === 'MOVED' && (
            <div className="flex-1 flex flex-col overflow-hidden bg-[#120a32] p-4">
               <div className="flex flex-col h-full overflow-y-auto bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-6">
                  <div className="flex justify-between items-center mb-6">
                     <h3 className="text-lg font-black text-white flex items-center gap-2">
                        <FolderOutput size={22} className="text-indigo-400" /> Data Terpilih / Pindahan (Device Session)
                     </h3>
                     <div className="flex gap-3">
                        <button onClick={fetchMovedData} disabled={isMovedFetching} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"><RotateCcw size={16} className={isMovedFetching ? "animate-spin" : ""} /></button>
                        {movedExcelData.length > 0 && (
                           <button onClick={() => clearCollectionByDevice('admin_data_moved')} disabled={isAdminClearing} className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold rounded-xl text-sm transition-colors border border-rose-500/20 disabled:opacity-50"><Trash2 size={16} /> Clear Selected Data</button>
                        )}
                     </div>
                  </div>

                  {isMovedFetching || isAdminClearing ? (
                     <div className="flex flex-col items-center justify-center flex-1 border-dashed border-white/10 rounded-2xl min-h-[300px]">
                        <Loader2 size={48} className="text-indigo-400 animate-spin mb-4" />
                        <p className="text-slate-400 font-bold">{isAdminClearing ? 'Menghapus Data...' : 'Memuat Data...'}</p>
                     </div>
                  ) : movedExcelData.length === 0 ? (
                     <div className="flex flex-col items-center justify-center flex-1 border-dashed border-white/10 rounded-2xl min-h-[300px]">
                        <FolderOutput size={48} className="text-slate-600 mb-4" />
                        <p className="text-slate-400 font-bold">Belum ada data yang dipilih/dipindah.</p>
                     </div>
                  ) : (
                     <div className="flex flex-col flex-grow">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 shrink-0">
                           <div className="bg-indigo-500/10 p-4 rounded-2xl border border-indigo-500/20 flex items-center justify-between">
                              <div><p className="text-[10px] uppercase tracking-wider font-bold text-indigo-400 mb-1">Total Baris (Item)</p><h4 className="text-2xl font-black text-white">{movedExcelData.length.toLocaleString()}</h4></div>
                              <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-300"><Layers size={20} /></div>
                           </div>
                           <div className="bg-purple-500/10 p-4 rounded-2xl border border-purple-500/20 flex items-center justify-between">
                              <div><p className="text-[10px] uppercase tracking-wider font-bold text-purple-400 mb-1">Total Resi/Orderan</p><h4 className="text-2xl font-black text-white">{new Set(movedExcelData.map(r => String(r['NO.'] || '').trim()).filter(Boolean)).size.toLocaleString()}</h4></div>
                              <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-300"><Package size={20} /></div>
                           </div>
                           <div className="col-span-2 flex items-center justify-end gap-3 flex-wrap">
                              <button 
                                 onClick={() => handleCopyFullTable(filteredMovedData, TARGET_MOVED_COLUMNS, 'moved_full')}
                                 className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors border border-white/10 text-xs font-bold"
                              >
                                 {copiedColumn === 'moved_full' ? <><Check size={14} /> Disalin</> : <><Copy size={14} /> Copy Tabel</>}
                              </button>
                              <div className="relative flex-grow max-w-xs">
                                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                 <input type="text" value={movedSearch} onChange={(e) => { setMovedSearch(e.target.value); setMovedCurrentPage(1); }} placeholder="Cari ID Pesanan, AWB, MSKU..." className="w-full pl-9 pr-8 py-1.5 bg-[#0f172a] border border-white/10 rounded-lg text-xs font-bold focus:ring-2 focus:ring-indigo-500 text-white outline-none" />
                                 {movedSearch && <button onClick={() => { setMovedSearch(""); setMovedCurrentPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"><X size={14} /></button>}
                              </div>
                              <div className="flex items-center gap-2">
                                 <span className="text-xs font-bold text-slate-400">Tampilkan:</span>
                                 <select className="bg-[#0f172a] border border-white/10 text-white rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500" value={movedPageSize} onChange={(e) => { setMovedPageSize(Number(e.target.value)); setMovedCurrentPage(1); }}>
                                    <option value={100}>100 Baris</option>
                                    <option value={150}>150 Baris</option>
                                    <option value={200}>200 Baris</option>
                                    <option value={500}>500 Baris</option>
                                    <option value={100000}>Semua Data</option>
                                 </select>
                              </div>
                           </div>
                        </div>

                        <div className="flex flex-col flex-grow min-h-[300px] border border-white/10 rounded-2xl overflow-hidden shadow-sm bg-[#0a0520] relative">
                           <div className="overflow-auto flex-grow relative">
                              <table className="w-full text-left border-collapse text-xs whitespace-nowrap min-w-max">
                                 <thead className="bg-[#120a32] border-gray-200 dark:border-white/10 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                       <th className="px-4 py-3 border-r border-white/5 text-slate-400 font-bold bg-[#120a32]">#</th>
                                       {TARGET_MOVED_COLUMNS.map(col => (
                                          <th key={col} className="px-4 py-3 border-r border-white/5 text-slate-400 font-bold bg-[#120a32]">{col}</th>
                                       ))}
                                    </tr>
                                 </thead>
                                 <tbody>
                                    {filteredMovedData.slice((movedCurrentPage - 1) * movedPageSize, movedCurrentPage * movedPageSize).map((row, idx) => {
                                       const absoluteIdx = (movedCurrentPage - 1) * movedPageSize + idx;
                                       
                                       return (
                                          <tr key={idx} className="border-gray-100 dark:border-white/5 hover:bg-white/5 transition-colors">
                                             <td className="px-4 py-2.5 border-gray-100 dark:border-white/5 text-slate-500 font-mono font-medium">{absoluteIdx + 1}</td>
                                             {TARGET_MOVED_COLUMNS.map(col => {
                                                return (
                                                   <td key={col} className="px-4 py-2.5 border-gray-100 dark:border-white/5 text-slate-300 font-mono">
                                                      {String(row[col] ?? '')}
                                                   </td>
                                                );
                                             })}
                                          </tr>
                                       );
                                    })}
                                 </tbody>
                              </table>
                           </div>
                           
                           {filteredMovedData.length > 0 && movedPageSize < filteredMovedData.length && (
                              <div className="bg-[#120a32] border-gray-200 dark:border-white/10 p-3 flex items-center justify-between sticky bottom-0 z-10">
                                 <span className="text-gray-500 dark:text-slate-400 font-bold">Menampilkan {(movedCurrentPage - 1) * movedPageSize + 1} - {Math.min(movedCurrentPage * movedPageSize, filteredMovedData.length)} dari {filteredMovedData.length} baris</span>
                                 <div className="flex gap-2">
                                    <button onClick={() => setMovedCurrentPage(p => Math.max(1, p - 1))} disabled={movedCurrentPage === 1} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-bold disabled:opacity-50 hover:bg-white/10 text-white">Prev</button>
                                    <button onClick={() => setMovedCurrentPage(p => Math.min(Math.ceil(filteredMovedData.length / movedPageSize), p + 1))} disabled={movedCurrentPage * movedPageSize >= filteredMovedData.length} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-bold disabled:opacity-50 hover:bg-white/10 text-white">Next</button>
                                 </div>
                              </div>
                           )}
                        </div>
                     </div>
                  )}
               </div>
            </div>
         )}
      </div>
   );
}
