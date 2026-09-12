import React, { useState, useEffect } from 'react';
import { CloudDownload, AlertTriangle, Loader2, Trash2, Layers, Package, Search, X, Database, Users, Clock, CheckCircle2, RotateCcw, Filter, FolderOutput, ArrowRight, Copy, Check, Sparkles } from 'lucide-react';
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
         return true;
      }
      return false;
   };

   const fetchAdminImportData = async () => {
      setIsAdminFetching(true);
      try {
         await checkAutoClear('admin_data_import');
         
         const { collection, query, where, getDocs } = await import('firebase/firestore');
         const { db } = await import('./firebaseClient'); 
         const deviceId = getDeviceId();
         
         const q = query(collection(db, 'admin_data_import'), where("deviceId", "==", deviceId));
         const snapshot = await getDocs(q);
         
         const data: any[] = [];
         snapshot.forEach(doc => {
            data.push({ id: doc.id, ...doc.data() });
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
         fetchAdminImportData();
         
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
            return (a.movedAt || '') > (b.movedAt || '') ? -1 : 1;
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
            if (row.id) {
               batch.delete(doc(importCol, row.id));
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
         });
         
         await batch.commit();
         
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
      <div className="flex-1 w-full max-w-none mx-auto flex flex-col bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-500">
         {/* TABS HEADER */}
         <div className="w-full bg-[#0c0620] border-b border-purple-900/40 p-2.5 flex items-center justify-between overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max">
               <button
                  onClick={() => setAdminDataTab('DATA')}
                  className={`px-6 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 ${
                     adminDataTab === 'DATA' 
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/40' 
                        : 'text-purple-300/60 hover:text-white hover:bg-purple-950/40'
                  }`}
               >
                  <Database size={15} /> Data Admin (Supabase)
               </button>
               <button
                  onClick={() => setAdminDataTab('IMPORT')}
                  className={`px-6 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 ${
                     adminDataTab === 'IMPORT' 
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/40' 
                        : 'text-purple-300/60 hover:text-white hover:bg-purple-950/40'
                  }`}
               >
                  <CloudDownload size={15} /> Import Excel
               </button>
               <button
                  onClick={() => setAdminDataTab('MOVED')}
                  className={`px-6 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 ${
                     adminDataTab === 'MOVED' 
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/40' 
                        : 'text-purple-300/60 hover:text-white hover:bg-purple-950/40'
                  }`}
               >
                  <FolderOutput size={15} /> Data Terpilih
               </button>
            </div>
         </div>

         {/* Peringatan Auto-Clear untuk Import & Moved */}
         {(adminDataTab === 'IMPORT' || adminDataTab === 'MOVED') && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2 shrink-0">
               <AlertTriangle size={14} className="text-amber-400 shrink-0" />
               <p className="text-[11px] font-bold text-amber-300 uppercase tracking-wide">
                  Info: Data import & terpilih bersifat spesifik untuk sesi browser perangkat ini dan ter-refresh otomatis setiap pergantian hari (WIB).
               </p>
            </div>
         )}

         {/* ---------------------------------------------------------------------------------------- */}
         {/* TAB 1: DATA ADMIN */}
         {/* ---------------------------------------------------------------------------------------- */}
         {adminDataTab === 'DATA' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 border-b border-purple-900/30 bg-[#0e0728]/60">
                  <div className="bg-[#0c0620] p-4.5 rounded-xl border border-purple-900/30 flex items-center justify-between">
                     <div>
                        <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                           <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span> Total Scans
                        </div>
                        <h4 className="text-2xl font-black text-white">
                           {filteredScans.length.toLocaleString()}
                        </h4>
                     </div>
                     <div className="w-11 h-11 bg-indigo-500/15 border border-indigo-500/30 rounded-xl flex items-center justify-center text-indigo-300">
                        <Package size={22} />
                     </div>
                  </div>
                  <div className="bg-[#0c0620] p-4.5 rounded-xl border border-purple-900/30 flex items-center justify-between">
                     <div>
                        <div className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                           <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span> Active Staff
                        </div>
                        <h4 className="text-2xl font-black text-white">
                           {new Set(filteredScans.map(i => i.employee_name).filter(Boolean)).size.toLocaleString()}
                        </h4>
                     </div>
                     <div className="w-11 h-11 bg-purple-500/15 border border-purple-500/30 rounded-xl flex items-center justify-center text-purple-300">
                        <Users size={22} />
                     </div>
                  </div>
                  <div className="bg-[#0c0620] p-4.5 rounded-xl border border-purple-900/30 flex items-center justify-between">
                     <div>
                        <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                           <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Latest Scan
                        </div>
                        <h4 className="text-sm font-bold text-white line-clamp-1 mt-1 font-mono">
                           {scannedItems[0] ? new Date(scannedItems[0].timestamp).toLocaleString('id-ID') : '-'}
                        </h4>
                     </div>
                     <div className="w-11 h-11 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center justify-center text-emerald-300">
                        <Clock size={22} />
                     </div>
                  </div>
               </div>

               {/* Toolbar Data Admin */}
               <div className="p-4 border-b border-purple-900/30 flex items-center justify-between gap-4 flex-wrap bg-[#0c0620]">
                  <div className="flex items-center gap-2">
                     <button onClick={fetchScannedItems} className="p-2 bg-[#130b2e] hover:bg-purple-950/40 text-purple-200 rounded-xl border border-purple-900/40 transition-colors" title="Refresh">
                        <RotateCcw size={16} className={isScansLoading ? "animate-spin" : ""} />
                     </button>
                     <div className="flex items-center gap-2 bg-[#130b2e] px-3 py-1.5 rounded-xl border border-purple-900/40">
                        <Filter size={14} className="text-purple-400" />
                        <input type="date" value={scansDateFilter} onChange={(e) => { setScansDateFilter(e.target.value); setScansCurrentPage(1); }} className="bg-transparent text-xs font-bold text-purple-200 outline-none cursor-pointer [color-scheme:dark]" />
                     </div>
                     <div className="flex items-center gap-2 bg-[#130b2e] px-3 py-1.5 rounded-xl border border-purple-900/40">
                        <Filter size={14} className="text-purple-400" />
                        <select 
                           value={scansStaffFilter} 
                           onChange={(e) => { setScansStaffFilter(e.target.value); setScansCurrentPage(1); }} 
                           className="bg-transparent text-xs font-bold text-purple-200 outline-none w-32 cursor-pointer"
                        >
                           <option value="" className="bg-[#0c0620]">Semua Staff</option>
                           {Array.from(new Set(scannedItems.map(i => i.employee_name).filter(Boolean))).map(staff => (
                              <option key={staff} value={staff} className="bg-[#0c0620]">{staff}</option>
                           ))}
                        </select>
                     </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400/60" size={14} />
                        <input type="text" value={scansSearch} onChange={(e) => { setScansSearch(e.target.value); setScansCurrentPage(1); }} placeholder="Cari barcode, staff..." className="w-56 pl-8 pr-7 py-1.5 bg-[#130b2e] border border-purple-900/40 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-purple-500 text-white outline-none transition-all placeholder-purple-400/30" />
                        {scansSearch && <button onClick={() => { setScansSearch(""); setScansCurrentPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-purple-400 hover:text-white"><X size={14} /></button>}
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-purple-300/60">Tampilkan:</span>
                        <select className="bg-[#130b2e] border border-purple-900/40 text-purple-200 rounded-xl px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500" value={scansPageSize} onChange={(e) => { setScansPageSize(Number(e.target.value)); setScansCurrentPage(1); }}>
                           <option value={100} className="bg-[#0c0620]">100</option>
                           <option value={200} className="bg-[#0c0620]">200</option>
                           <option value={500} className="bg-[#0c0620]">500</option>
                        </select>
                     </div>
                  </div>
               </div>

               {/* Table Data Admin */}
               <div className="flex-1 overflow-auto custom-scrollbar">
                  {isScansLoading ? (
                     <div className="p-16 text-center flex flex-col items-center justify-center h-full">
                        <Loader2 className="animate-spin text-purple-400 mb-3" size={36} />
                        <p className="text-purple-300 font-bold text-xs">Memuat Data Scans...</p>
                     </div>
                  ) : filteredScans.length === 0 ? (
                     <div className="p-16 text-center text-purple-300/40 font-black text-xs uppercase tracking-widest">
                        Tidak ada data scan ditemukan.
                     </div>
                  ) : (
                     <table className="w-full text-left whitespace-nowrap text-xs border-collapse">
                        <thead className="bg-[#0c0620] border-b border-purple-900/40 sticky top-0 z-10 text-purple-300 font-black text-[10px] uppercase tracking-wider">
                           <tr>
                              <th className="p-3.5 border-r border-purple-900/30">No.</th>
                              <th className="p-3.5 border-r border-purple-900/30">Timestamp</th>
                              <th className="p-3.5 border-r border-purple-900/30">
                                 <div className="flex items-center justify-between">
                                    <span>Barcode Data</span>
                                    <button 
                                       onClick={() => {
                                          const barcodes = filteredScans.map(item => item.barcode).filter(Boolean).join('\n');
                                          navigator.clipboard.writeText(barcodes);
                                          setIsBarcodesCopied(true);
                                          setTimeout(() => setIsBarcodesCopied(false), 2000);
                                       }}
                                       className="flex items-center gap-1 px-2 py-0.5 bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 rounded-lg transition-colors border border-purple-500/30 text-[9px]"
                                       title="Salin semua barcode"
                                    >
                                       {isBarcodesCopied ? <><Check size={11} /> Disalin</> : <><Copy size={11} /> Copy All</>}
                                    </button>
                                 </div>
                              </th>
                              <th className="p-3.5 border-r border-purple-900/30">Staff</th>
                              <th className="p-3.5 border-r border-purple-900/30">Shift</th>
                              <th className="p-3.5 border-r border-purple-900/30">Role</th>
                              <th className="p-3.5">Status</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-purple-900/20 text-slate-200">
                           {filteredScans.slice((scansCurrentPage - 1) * scansPageSize, scansCurrentPage * scansPageSize).map((item, idx) => {
                              const absoluteIdx = (scansCurrentPage - 1) * scansPageSize + idx + 1;
                              return (
                                 <tr key={item.id || idx} className="hover:bg-purple-500/10 transition-colors">
                                    <td className="p-3.5 border-r border-purple-900/20 text-purple-400/60 font-mono font-bold">{absoluteIdx}</td>
                                    <td className="p-3.5 border-r border-purple-900/20 text-purple-200 font-mono">{new Date(item.timestamp).toLocaleString('id-ID')}</td>
                                    <td className="p-3.5 border-r border-purple-900/20 font-black text-indigo-300 font-mono tracking-wider">{item.barcode}</td>
                                    <td className="p-3.5 border-r border-purple-900/20 text-purple-100 font-bold">{item.employee_name}</td>
                                    <td className="p-3.5 border-r border-purple-900/20 text-purple-300/70 font-medium">{item.shift || '-'}</td>
                                    <td className="p-3.5 border-r border-purple-900/20"><span className="px-2 py-0.5 bg-purple-500/15 border border-purple-500/30 text-purple-300 rounded-md text-[9px] uppercase font-black tracking-wider">{item.role}</span></td>
                                    <td className="p-3.5">
                                       {item.status === 'COMPLETED' ? (
                                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/15 text-emerald-300 rounded-full text-[9px] font-black uppercase tracking-wider border border-emerald-500/30"><CheckCircle2 size={12} className="text-emerald-400" /> Selesai</span>
                                       ) : (
                                          <span className="px-2 py-0.5 bg-purple-950/40 text-purple-300 rounded-md border border-purple-900/30 text-[9px] font-black uppercase">{item.status}</span>
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
                  <div className="bg-[#0c0620] border-t border-purple-900/30 p-3 px-4 flex items-center justify-between shrink-0">
                     <span className="text-[10px] text-purple-300/60 font-bold">Menampilkan {(scansCurrentPage - 1) * scansPageSize + 1} - {Math.min(scansCurrentPage * scansPageSize, filteredScans.length)} dari {filteredScans.length}</span>
                     <div className="flex gap-2">
                        <button onClick={() => setScansCurrentPage(p => Math.max(1, p - 1))} disabled={scansCurrentPage === 1} className="px-3 py-1 bg-[#130b2e] border border-purple-900/40 rounded-xl text-xs font-bold disabled:opacity-30 hover:bg-purple-950/40 text-purple-200">Prev</button>
                        <button onClick={() => setScansCurrentPage(p => Math.min(Math.ceil(filteredScans.length / scansPageSize), p + 1))} disabled={scansCurrentPage * scansPageSize >= filteredScans.length} className="px-3 py-1 bg-[#130b2e] border border-purple-900/40 rounded-xl text-xs font-bold disabled:opacity-30 hover:bg-purple-950/40 text-purple-200">Next</button>
                     </div>
                  </div>
               )}
            </div>
         )}


         {/* ---------------------------------------------------------------------------------------- */}
         {/* TAB 2: IMPORT EXCEL */}
         {/* ---------------------------------------------------------------------------------------- */}
         {adminDataTab === 'IMPORT' && (
            <div className="flex-1 flex flex-col overflow-hidden p-6">
               <div className="flex flex-col h-full overflow-y-auto">
                  <div className="flex justify-between items-center mb-6">
                     <h3 className="text-base font-black text-white flex items-center gap-2 tracking-tight">
                        <CloudDownload size={20} className="text-purple-400" /> Data Admin Import (Device Session)
                     </h3>
                     <div className="flex gap-2">
                        <button onClick={fetchAdminImportData} disabled={isAdminFetching} className="p-2 bg-[#0c0620] hover:bg-purple-950/40 text-purple-200 rounded-xl border border-purple-900/40 transition-colors"><RotateCcw size={16} className={isAdminFetching ? "animate-spin" : ""} /></button>
                        {adminExcelData.length > 0 && (
                           <button onClick={() => clearCollectionByDevice('admin_data_import')} disabled={isAdminImporting || isAdminClearing} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 font-black rounded-xl text-xs transition-colors border border-rose-500/30 disabled:opacity-30"><Trash2 size={14} /> Clear Session</button>
                        )}
                     </div>
                  </div>
                  
                  {adminImportError && (
                     <div className="p-3 bg-rose-500/20 text-rose-300 text-xs rounded-xl mb-4 flex items-start gap-2 border border-rose-500/30">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" /><span>{adminImportError}</span>
                     </div>
                  )}

                  {isAdminFetching || isAdminImporting || isAdminClearing || isMoving ? (
                     <div className="flex flex-col items-center justify-center flex-1 border border-dashed border-purple-900/40 rounded-2xl min-h-[300px] bg-[#0c0620]/40">
                        <Loader2 size={40} className="text-purple-400 animate-spin mb-3" />
                        <p className="text-purple-300 font-bold text-xs">{isAdminClearing ? 'Menghapus Data...' : isMoving ? 'Memindah Data...' : isAdminImporting ? `Mengimpor: ${adminImportProgress.current} / ${adminImportProgress.total}` : 'Memuat Data...'}</p>
                     </div>
                  ) : adminExcelData.length === 0 ? (
                     <div className="grid grid-cols-1 gap-6 mb-6 shrink-0 max-w-2xl mx-auto w-full">
                        <div onDragOver={handleAdminDragOver} onDragLeave={handleAdminDragLeave} onDrop={handleAdminDrop} className={`p-10 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center min-h-[260px] transition-all duration-300 cursor-pointer ${isAdminDragOver ? 'border-purple-400 bg-purple-500/15 scale-[1.01]' : 'border-purple-900/40 bg-[#0c0620]/60 hover:border-purple-500/50 hover:bg-[#0c0620]/90'}`}>
                           <div className="p-4 bg-purple-500/15 rounded-2xl border border-purple-500/30 mb-4 animate-pulse"><CloudDownload size={40} className="text-purple-300" /></div>
                           <h4 className="font-black text-white text-base mb-1">Pilih atau Tarik File Excel</h4>
                           <p className="text-purple-300/60 text-xs font-semibold text-center mb-5">Mendukung format .xlsx dan .xls</p>
                           <label className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-7 py-3 rounded-xl cursor-pointer transition-all shadow-xl shadow-purple-950/40 text-xs font-black uppercase tracking-wider active:scale-[0.98]">
                              Browse File
                              <input type="file" accept=".xlsx, .xls" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAdminExcelUpload(file); }} className="hidden" />
                           </label>
                        </div>
                     </div>
                  ) : (
                     <div className="flex flex-col flex-grow">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 shrink-0">
                           <div className="bg-[#0c0620] p-4 rounded-xl border border-purple-900/30 flex items-center justify-between">
                              <div><p className="text-[9px] uppercase tracking-wider font-black text-indigo-400 mb-0.5">Total Baris (Item)</p><h4 className="text-xl font-black text-white">{adminExcelData.length.toLocaleString()}</h4></div>
                              <div className="w-9 h-9 bg-indigo-500/15 border border-indigo-500/30 rounded-xl flex items-center justify-center text-indigo-300"><Layers size={18} /></div>
                           </div>
                           <div className="bg-[#0c0620] p-4 rounded-xl border border-purple-900/30 flex items-center justify-between">
                              <div><p className="text-[9px] uppercase tracking-wider font-black text-purple-400 mb-0.5">Total Resi/Orderan</p><h4 className="text-xl font-black text-white">{new Set(adminExcelData.map(r => String(r['NO.'] || '').trim()).filter(Boolean)).size.toLocaleString()}</h4></div>
                              <div className="w-9 h-9 bg-purple-500/15 border border-purple-500/30 rounded-xl flex items-center justify-center text-purple-300"><Package size={18} /></div>
                           </div>
                           <div className="col-span-2 flex items-center justify-end gap-2 flex-wrap">
                               {selectedImportIds.length > 0 && (
                                  <button 
                                     onClick={moveSelectedDataBulk}
                                     disabled={isMoving}
                                     className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl transition-all border border-purple-400/30 text-xs font-black uppercase tracking-wider shadow-lg shadow-purple-950/40"
                                  >
                                     <ArrowRight size={13} /> Pindah {selectedImportIds.length} Terpilih
                                  </button>
                               )}
                              <button 
                                 onClick={() => handleCopyFullTable(filteredImportData, adminExcelColumns, 'import_full')}
                                 className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0c0620] hover:bg-purple-950/40 text-purple-200 rounded-xl transition-colors border border-purple-900/40 text-xs font-bold"
                              >
                                 {copiedColumn === 'import_full' ? <><Check size={13} /> Disalin</> : <><Copy size={13} /> Copy Tabel</>}
                              </button>
                              <div className="relative flex-grow max-w-xs">
                                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400/60" size={14} />
                                 <input type="text" value={adminImportSearch} onChange={(e) => { setAdminImportSearch(e.target.value); setAdminCurrentPage(1); }} placeholder="Cari ID Pesanan, AWB, MSKU..." className="w-full pl-8 pr-7 py-1.5 bg-[#0c0620] border border-purple-900/40 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-purple-500 text-white outline-none placeholder-purple-400/30" />
                                 {adminImportSearch && <button onClick={() => { setAdminImportSearch(""); setAdminCurrentPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-purple-400 hover:text-white"><X size={14} /></button>}
                              </div>
                              <div className="flex items-center gap-2">
                                 <span className="text-xs font-bold text-purple-300/60">Tampilkan:</span>
                                 <select className="bg-[#0c0620] border border-purple-900/40 text-purple-200 rounded-xl px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500" value={adminPageSize} onChange={(e) => { setAdminPageSize(Number(e.target.value)); setAdminCurrentPage(1); }}>
                                    <option value={100} className="bg-[#0c0620]">100 Baris</option>
                                    <option value={150} className="bg-[#0c0620]">150 Baris</option>
                                    <option value={200} className="bg-[#0c0620]">200 Baris</option>
                                    <option value={500} className="bg-[#0c0620]">500 Baris</option>
                                    <option value={100000} className="bg-[#0c0620]">Semua Data</option>
                                 </select>
                              </div>
                           </div>
                        </div>

                        <div className="flex flex-col flex-grow min-h-[300px] border border-purple-900/30 rounded-2xl overflow-hidden shadow-xl bg-[#0c0620]/60 relative">
                           <div className="overflow-auto flex-grow relative custom-scrollbar">
                              <table className="w-full text-left border-collapse text-xs whitespace-nowrap min-w-max">
                                 <thead className="bg-[#0c0620] border-b border-purple-900/40 sticky top-0 z-10 text-purple-300 font-black text-[10px] uppercase tracking-wider">
                                    <tr>
                                       <th className="px-4 py-3 border-r border-purple-900/30 w-10 text-center">
                                          <input 
                                             type="checkbox" 
                                             className="rounded border-purple-800 bg-[#130b2e] text-purple-600 focus:ring-purple-500 cursor-pointer"
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
                                       <th className="px-4 py-3 border-r border-purple-900/30">Action</th>
                                       <th className="px-4 py-3 border-r border-purple-900/30">#</th>
                                       {adminExcelColumns.map(col => (
                                          <th key={col} className="px-4 py-3 border-r border-purple-900/30">{col}</th>
                                       ))}
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y divide-purple-900/20 text-slate-200">
                                    {filteredImportData.slice((adminCurrentPage - 1) * adminPageSize, adminCurrentPage * adminPageSize).map((row, idx) => {
                                       const absoluteIdx = (adminCurrentPage - 1) * adminPageSize + idx;
                                       const isMergedCol = absoluteIdx === 0 || String(filteredImportData[absoluteIdx - 1]['NO.']) !== String(row['NO.']);
                                       
                                       return (
                                          <tr key={idx} className={`hover:bg-purple-500/10 transition-colors ${selectedImportIds.includes(row['ID Pesanan']) ? 'bg-purple-500/15' : ''}`}>
                                             <td className="px-4 py-2.5 border-r border-purple-900/20 text-center">
                                                {isMergedCol && (
                                                   <input 
                                                      type="checkbox" 
                                                      className="rounded border-purple-800 bg-[#130b2e] text-purple-600 focus:ring-purple-500 cursor-pointer"
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
                                             <td className="px-4 py-2.5 border-r border-purple-900/20">
                                                {isMergedCol && (
                                                   <button 
                                                      onClick={() => moveDataToSelected(row['ID Pesanan'])}
                                                      className="flex items-center gap-1 px-2.5 py-1 bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 rounded-lg text-[10px] font-bold uppercase transition-colors border border-purple-500/30"
                                                   >
                                                      <ArrowRight size={12} /> Pindah
                                                   </button>
                                                )}
                                             </td>
                                             <td className="px-4 py-2.5 border-r border-purple-900/20 text-purple-400/60 font-mono font-bold">{absoluteIdx + 1}</td>
                                             {adminExcelColumns.map(col => {
                                                const showValue = col !== 'NO.' || isMergedCol;
                                                return (
                                                   <td key={col} className="px-4 py-2.5 border-r border-purple-900/20 text-purple-200 font-mono">
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
                              <div className="bg-[#0c0620] border-t border-purple-900/30 p-3 px-4 flex items-center justify-between sticky bottom-0 z-10">
                                 <span className="text-[10px] text-purple-300/60 font-bold">Menampilkan {(adminCurrentPage - 1) * adminPageSize + 1} - {Math.min(adminCurrentPage * adminPageSize, filteredImportData.length)} dari {filteredImportData.length} baris</span>
                                 <div className="flex gap-2">
                                    <button onClick={() => setAdminCurrentPage(p => Math.max(1, p - 1))} disabled={adminCurrentPage === 1} className="px-3 py-1 bg-[#130b2e] border border-purple-900/40 rounded-xl text-xs font-bold disabled:opacity-30 hover:bg-purple-950/40 text-purple-200">Prev</button>
                                    <button onClick={() => setAdminCurrentPage(p => Math.min(Math.ceil(filteredImportData.length / adminPageSize), p + 1))} disabled={adminCurrentPage * adminPageSize >= filteredImportData.length} className="px-3 py-1 bg-[#130b2e] border border-purple-900/40 rounded-xl text-xs font-bold disabled:opacity-30 hover:bg-purple-950/40 text-purple-200">Next</button>
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
            <div className="flex-1 flex flex-col overflow-hidden p-6">
               <div className="flex flex-col h-full overflow-y-auto">
                  <div className="flex justify-between items-center mb-6">
                     <h3 className="text-base font-black text-white flex items-center gap-2 tracking-tight">
                        <FolderOutput size={20} className="text-purple-400" /> Data Terpilih / Pindahan (Device Session)
                     </h3>
                     <div className="flex gap-2">
                        <button onClick={fetchMovedData} disabled={isMovedFetching} className="p-2 bg-[#0c0620] hover:bg-purple-950/40 text-purple-200 rounded-xl border border-purple-900/40 transition-colors"><RotateCcw size={16} className={isMovedFetching ? "animate-spin" : ""} /></button>
                        {movedExcelData.length > 0 && (
                           <button onClick={() => clearCollectionByDevice('admin_data_moved')} disabled={isAdminClearing} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 font-black rounded-xl text-xs transition-colors border border-rose-500/30 disabled:opacity-30"><Trash2 size={14} /> Clear Selected</button>
                        )}
                     </div>
                  </div>

                  {isMovedFetching || isAdminClearing ? (
                     <div className="flex flex-col items-center justify-center flex-1 border border-dashed border-purple-900/40 rounded-2xl min-h-[300px] bg-[#0c0620]/40">
                        <Loader2 size={40} className="text-purple-400 animate-spin mb-3" />
                        <p className="text-purple-300 font-bold text-xs">{isAdminClearing ? 'Menghapus Data...' : 'Memuat Data...'}</p>
                     </div>
                  ) : movedExcelData.length === 0 ? (
                     <div className="flex flex-col items-center justify-center flex-1 border border-dashed border-purple-900/40 rounded-2xl min-h-[300px] bg-[#0c0620]/40">
                        <FolderOutput size={40} className="text-purple-400/40 mb-3" />
                        <p className="text-purple-300/60 font-bold text-xs uppercase tracking-widest">Belum ada data yang dipilih/dipindah.</p>
                     </div>
                  ) : (
                     <div className="flex flex-col flex-grow">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 shrink-0">
                           <div className="bg-[#0c0620] p-4 rounded-xl border border-purple-900/30 flex items-center justify-between">
                              <div><p className="text-[9px] uppercase tracking-wider font-black text-indigo-400 mb-0.5">Total Baris (Item)</p><h4 className="text-xl font-black text-white">{movedExcelData.length.toLocaleString()}</h4></div>
                              <div className="w-9 h-9 bg-indigo-500/15 border border-indigo-500/30 rounded-xl flex items-center justify-center text-indigo-300"><Layers size={18} /></div>
                           </div>
                           <div className="bg-[#0c0620] p-4 rounded-xl border border-purple-900/30 flex items-center justify-between">
                              <div><p className="text-[9px] uppercase tracking-wider font-black text-purple-400 mb-0.5">Total Resi/Orderan</p><h4 className="text-xl font-black text-white">{new Set(movedExcelData.map(r => String(r['NO.'] || '').trim()).filter(Boolean)).size.toLocaleString()}</h4></div>
                              <div className="w-9 h-9 bg-purple-500/15 border border-purple-500/30 rounded-xl flex items-center justify-center text-purple-300"><Package size={18} /></div>
                           </div>
                           <div className="col-span-2 flex items-center justify-end gap-2 flex-wrap">
                              <button 
                                 onClick={() => handleCopyFullTable(filteredMovedData, TARGET_MOVED_COLUMNS, 'moved_full')}
                                 className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0c0620] hover:bg-purple-950/40 text-purple-200 rounded-xl transition-colors border border-purple-900/40 text-xs font-bold"
                              >
                                 {copiedColumn === 'moved_full' ? <><Check size={13} /> Disalin</> : <><Copy size={13} /> Copy Tabel</>}
                              </button>
                              <div className="relative flex-grow max-w-xs">
                                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400/60" size={14} />
                                 <input type="text" value={movedSearch} onChange={(e) => { setMovedSearch(e.target.value); setMovedCurrentPage(1); }} placeholder="Cari ID Pesanan, AWB, MSKU..." className="w-full pl-8 pr-7 py-1.5 bg-[#0c0620] border border-purple-900/40 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-purple-500 text-white outline-none placeholder-purple-400/30" />
                                 {movedSearch && <button onClick={() => { setMovedSearch(""); setMovedCurrentPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-purple-400 hover:text-white"><X size={14} /></button>}
                              </div>
                              <div className="flex items-center gap-2">
                                 <span className="text-xs font-bold text-purple-300/60">Tampilkan:</span>
                                 <select className="bg-[#0c0620] border border-purple-900/40 text-purple-200 rounded-xl px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500" value={movedPageSize} onChange={(e) => { setMovedPageSize(Number(e.target.value)); setMovedCurrentPage(1); }}>
                                    <option value={100} className="bg-[#0c0620]">100 Baris</option>
                                    <option value={150} className="bg-[#0c0620]">150 Baris</option>
                                    <option value={200} className="bg-[#0c0620]">200 Baris</option>
                                    <option value={500} className="bg-[#0c0620]">500 Baris</option>
                                    <option value={100000} className="bg-[#0c0620]">Semua Data</option>
                                 </select>
                              </div>
                           </div>
                        </div>

                        <div className="flex flex-col flex-grow min-h-[300px] border border-purple-900/30 rounded-2xl overflow-hidden shadow-xl bg-[#0c0620]/60 relative">
                           <div className="overflow-auto flex-grow relative custom-scrollbar">
                              <table className="w-full text-left border-collapse text-xs whitespace-nowrap min-w-max">
                                 <thead className="bg-[#0c0620] border-b border-purple-900/40 sticky top-0 z-10 text-purple-300 font-black text-[10px] uppercase tracking-wider">
                                    <tr>
                                       <th className="px-4 py-3 border-r border-purple-900/30">#</th>
                                       {TARGET_MOVED_COLUMNS.map(col => (
                                          <th key={col} className="px-4 py-3 border-r border-purple-900/30">{col}</th>
                                       ))}
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y divide-purple-900/20 text-slate-200">
                                    {filteredMovedData.slice((movedCurrentPage - 1) * movedPageSize, movedCurrentPage * movedPageSize).map((row, idx) => {
                                       const absoluteIdx = (movedCurrentPage - 1) * movedPageSize + idx;
                                       
                                       return (
                                          <tr key={idx} className="hover:bg-purple-500/10 transition-colors">
                                             <td className="px-4 py-2.5 border-r border-purple-900/20 text-purple-400/60 font-mono font-bold">{absoluteIdx + 1}</td>
                                             {TARGET_MOVED_COLUMNS.map(col => {
                                                return (
                                                   <td key={col} className="px-4 py-2.5 border-r border-purple-900/20 text-purple-200 font-mono">
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
                              <div className="bg-[#0c0620] border-t border-purple-900/30 p-3 px-4 flex items-center justify-between sticky bottom-0 z-10">
                                 <span className="text-[10px] text-purple-300/60 font-bold">Menampilkan {(movedCurrentPage - 1) * movedPageSize + 1} - {Math.min(movedCurrentPage * movedPageSize, filteredMovedData.length)} dari {filteredMovedData.length} baris</span>
                                 <div className="flex gap-2">
                                    <button onClick={() => setMovedCurrentPage(p => Math.max(1, p - 1))} disabled={movedCurrentPage === 1} className="px-3 py-1 bg-[#130b2e] border border-purple-900/40 rounded-xl text-xs font-bold disabled:opacity-30 hover:bg-purple-950/40 text-purple-200">Prev</button>
                                    <button onClick={() => setMovedCurrentPage(p => Math.min(Math.ceil(filteredMovedData.length / movedPageSize), p + 1))} disabled={movedCurrentPage * movedPageSize >= filteredMovedData.length} className="px-3 py-1 bg-[#130b2e] border border-purple-900/40 rounded-xl text-xs font-bold disabled:opacity-30 hover:bg-purple-950/40 text-purple-200">Next</button>
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
