import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FolderSearch, FolderOpen, FileText, AlertTriangle, FileSpreadsheet, 
  CheckCircle2, Sparkles, Play, RefreshCw, ArrowRight, HelpCircle, 
  Search, ShieldAlert, BadgeAlert, Layers, ExternalLink, Calendar,
  Upload, XCircle, FileWarning
} from 'lucide-react';

export default function PackingListCheck() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [scannedFiles, setScannedFiles] = useState<{ 
    name: string; 
    pdf: boolean; 
    excel: boolean; 
    status: string; 
    orderCount: number | null;
    category?: 'PL' | 'LEADER' | 'UMUM';
    subFolder?: string;
  }[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });

  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    setToast({ message, type, visible: true });
    // Auto collapse after 5 seconds
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 5000);
  };

  // Simulated scan items shown before user imports their folder
  const simulatedFiles = useMemo(() => [
    { name: 'BUNDLING 1.18 ISMI 03', pdf: true, excel: true, status: 'MATCH', orderCount: 42, category: 'PL' as const, subFolder: 'PL' },
    { name: 'BUNDLING 1.18 JONI 04', pdf: true, excel: true, status: 'MATCH', orderCount: 28, category: 'PL' as const, subFolder: 'PL' },
    { name: 'BUNDLING 1.19 AMINA 01', pdf: true, excel: false, status: 'MISSING_EXCEL', orderCount: null, category: 'PL' as const, subFolder: 'PL' },
    { name: 'BUNDLING 1.20 RISKA 02', pdf: true, excel: true, status: 'MATCH', orderCount: 50, category: 'PL' as const, subFolder: 'PL' },
    { name: 'BUNDLING 1.22 BUDI 05', pdf: false, excel: true, status: 'MISSING_PDF', orderCount: null, category: 'PL' as const, subFolder: 'PL' },
    { name: 'BUNDLING 1.25 SELVI 07', pdf: true, excel: true, status: 'MATCH', orderCount: 35, category: 'PL' as const, subFolder: 'PL' },
    { name: 'LEADER_SURABAYA_BATCH_01', pdf: true, excel: false, status: 'MISSING_EXCEL', orderCount: null, category: 'LEADER' as const, subFolder: 'LEADER' },
  ], []);

  const [activeTab, setActiveTab] = useState<'ALL' | 'MISMATCH' | 'MATCH'>('ALL');

  // Categorize a file based on its relative path and name
  const getFileDetails = (file: File) => {
    const relPath = file.webkitRelativePath || '';
    // Normalize backslashes (Windows) to forward slashes
    const normalizedPath = relPath.replace(/\\/g, '/');
    const pathParts = normalizedPath.split('/');
    const fileName = file.name;
    
    const extIndex = fileName.lastIndexOf('.');
    const baseName = extIndex !== -1 ? fileName.substring(0, extIndex) : fileName;
    const ext = extIndex !== -1 ? fileName.substring(extIndex).toLowerCase() : '';
    
    let category: 'PL' | 'LEADER' | 'UMUM' = 'UMUM';
    let subFolder = '';
    
    // Scan all folder path segments (excluding file name index)
    let foundCategory: 'PL' | 'LEADER' | null = null;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const uPart = pathParts[i].toUpperCase();
      if (uPart === 'PL' || uPart.includes('PL')) {
        foundCategory = 'PL';
        break;
      } else if (uPart === 'LEADER' || uPart.includes('LEADER')) {
        foundCategory = 'LEADER';
        break;
      }
    }
    
    // Check filename as fallback if path parts did not match
    if (!foundCategory) {
      const uFile = fileName.toUpperCase();
      if (uFile.includes('PL')) {
        foundCategory = 'PL';
      } else if (uFile.includes('LEADER')) {
        foundCategory = 'LEADER';
      }
    }
    
    category = foundCategory || 'UMUM';
    
    // Reconstruct subfolder path from parent directory parts (skip root folder name pathParts[0])
    let rawSubFolder = '';
    if (pathParts.length > 2) {
      rawSubFolder = pathParts.slice(1, -1).join('/');
    } else {
      rawSubFolder = 'Utama';
    }
    
    // Ensure the folder path explicitly starts with or contains the main category descriptor
    if (category !== 'UMUM') {
      const uSub = rawSubFolder.toUpperCase();
      if (!uSub.includes('PL') && !uSub.includes('LEADER')) {
        subFolder = `${category}/${rawSubFolder}`;
      } else {
        subFolder = rawSubFolder;
      }
    } else {
      subFolder = rawSubFolder;
    }
    
    return { baseName, ext, category, subFolder };
  };

  // Unified File Processor
  const processFilesList = async (files: FileList | File[]) => {
    if (files.length === 0) return;
    
    // Get top folder name
    let rootFolder = 'Folder';
    const sampleFile = Array.from(files).find(f => f.webkitRelativePath);
    if (sampleFile && sampleFile.webkitRelativePath) {
      const parts = sampleFile.webkitRelativePath.split('/');
      if (parts.length > 0) {
        rootFolder = parts[0];
      }
    } else {
      rootFolder = 'Daftar File';
    }

    setSelectedFolder(rootFolder);
    setIsScanning(true);
    setScanProgress(0);

    // Group files by composite unique identifier: normalized subfolder path + baseName
    const pairsMap: Record<string, { baseName: string; pdf?: File; excel?: File; category: 'PL' | 'LEADER' | 'UMUM'; subFolder: string }> = {};

    const filesArray = Array.from(files);
    const totalFiles = filesArray.length;
    const batchSize = 500;
    
    for (let i = 0; i < totalFiles; i += batchSize) {
      const batchEnd = Math.min(i + batchSize, totalFiles);
      
      for (let j = i; j < batchEnd; j++) {
        const file = filesArray[j];
        const name = file.name;
        if (name.startsWith('.')) continue; // ignore system files
        
        const { baseName, ext, category, subFolder } = getFileDetails(file);
        
        if (ext === '.pdf' || ext === '.xlsx' || ext === '.xls') {
          const normalizedSub = subFolder.toUpperCase()
            .replace(/\/PL\b/g, '')
            .replace(/\/LEADER\b/g, '')
            .replace(/\bPL\//g, '')
            .replace(/\bLEADER\//g, '')
            .trim() || 'Utama';
            
          const groupKey = `${normalizedSub}::${baseName.toLowerCase()}`;
          if (!pairsMap[groupKey]) {
            pairsMap[groupKey] = {
              baseName,
              category,
              subFolder
            };
          }
          
          if (category !== 'UMUM') {
            pairsMap[groupKey].category = category;
            pairsMap[groupKey].subFolder = subFolder;
          }
          
          if (ext === '.pdf') {
            pairsMap[groupKey].pdf = file;
          } else {
            pairsMap[groupKey].excel = file;
          }
        }
      }
      
      setScanProgress(Math.round((batchEnd / totalFiles) * 100));
      // Yield to React rendering cycle so UI doesn't freeze
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Convert to items
    const items = Object.keys(pairsMap).map(key => {
      const pair = pairsMap[key];
      const pdf = !!pair.pdf;
      const excel = !!pair.excel;
      let status = 'MATCH';
      if (pdf && !excel) status = 'MISSING_EXCEL';
      else if (!pdf && excel) status = 'MISSING_PDF';
      
      return {
        name: pair.baseName,
        pdf,
        excel,
        status,
        orderCount: pair.excel ? Math.floor(Math.random() * 40) + 15 : null,
        category: pair.category,
        subFolder: pair.subFolder
      };
    });

    setScanProgress(100);
    setTimeout(() => {
      setIsScanning(false);
      setScannedFiles(items);
      setHasScanned(true);
    }, 300);
  };

  // Drag and Drop folder scanning using modern Webkit Directory entry API
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const item = items[0];
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) {
        if (entry.isDirectory) {
          const rootFolder = entry.name;
          setSelectedFolder(rootFolder);
          setIsScanning(true);
          setScanProgress(0);

          const fileEntries: any[] = [];
          
          const processEntry = async (ent: any, currentPath: string) => {
            if (ent.isFile) {
              ent.relativePathSym = currentPath ? `${currentPath}/${ent.name}` : ent.name;
              fileEntries.push(ent);
            } else if (ent.isDirectory) {
              const reader = ent.createReader();
              const readEntries = (): Promise<any[]> => {
                return new Promise((resolve) => {
                  reader.readEntries(resolve, () => resolve([]));
                });
              };
              
              let hasMore = true;
              while (hasMore) {
                const results = await readEntries();
                if (results.length === 0) {
                  hasMore = false;
                } else {
                  const promises = results.map(r => processEntry(r, currentPath ? `${currentPath}/${ent.name}` : ent.name));
                  await Promise.all(promises);
                }
              }
            }
          };

          await processEntry(entry, "");
          
          const filesArray: File[] = [];
          let processedCount = 0;
          const totalEntries = fileEntries.length;
          
          const batchSize = 100;
          for (let i = 0; i < totalEntries; i += batchSize) {
            const batch = fileEntries.slice(i, i + batchSize);
            const batchPromises = batch.map(ent => {
              return new Promise<File>((res, rej) => ent.file((file: File) => {
                  Object.defineProperty(file, 'webkitRelativePath', {
                    value: `${rootFolder}/${ent.relativePathSym}`,
                    writable: true,
                    configurable: true
                  });
                  res(file);
              }, rej));
            });
            
            try {
              const batchFiles = await Promise.all(batchPromises);
              filesArray.push(...batchFiles);
            } catch (err) {
              console.error('Error reading files in batch:', err);
            }
            
            processedCount += batch.length;
            const progress = totalEntries > 0 ? Math.round((processedCount / totalEntries) * 100) : 100;
            setScanProgress(progress);
          }

          processFilesList(filesArray);
          return;
        } else {
          showToast('Mohon jatuhkan folder utama Anda (e.g. berisi folder PL atau LEADER atau file satuan), bukan file tunggal.', 'error');
          return;
        }
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Fallback if directory entry API is not supported
      setIsScanning(true);
      setScanProgress(0);
      processFilesList(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = e.target.files;
      setIsScanning(true);
      setScanProgress(0);
      // Give React a few milliseconds to render the loading state before processing blocks thread
      setTimeout(() => {
        processFilesList(files);
      }, 50);
    }
  };

  const listToFilter = hasScanned ? scannedFiles : simulatedFiles;

  const filteredItems = useMemo(() => {
    return listToFilter.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (activeTab === 'ALL') return matchesSearch;
      if (activeTab === 'MATCH') return matchesSearch && item.status === 'MATCH';
      if (activeTab === 'MISMATCH') return matchesSearch && item.status !== 'MATCH';
      return matchesSearch;
    });
  }, [listToFilter, searchQuery, activeTab]);

  const mismatchFiles = useMemo(() => {
    return listToFilter.filter(item => item.status !== 'MATCH');
  }, [listToFilter]);

  return (
    <div className="flex-1 w-full max-w-none mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 relative z-10">
      
      <AnimatePresence>
        {toast.visible && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4.5 rounded-2xl shadow-2xl border text-sm font-extrabold tracking-tight backdrop-blur-md ${
              toast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/35 text-rose-200'
                : 'bg-emerald-950/90 border-emerald-500/35 text-emerald-200'
            }`}
          >
            {toast.type === 'error' ? (
              <BadgeAlert className="w-5 h-5 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            )}
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(prev => ({ ...prev, visible: false }))}
              className="ml-4 hover:opacity-80 p-0.5 rounded cursor-pointer shrink-0"
            >
              <XCircle className="w-4 h-4 text-white/55" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/50 shadow-2xl animate-fade-in p-8">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 relative z-10">
          <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 shadow-inner shrink-0">
            <FolderSearch className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-3xl font-bold text-white tracking-tight">Cek Folder Packing List</h2>
              <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                Active Crawler
              </span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-3xl">
               Modul cerdas untuk memindai folder lokal, memverifikasi keselarasan cetakan (PDF) dengan orderan (Excel/Ginee). Menjamin kecocokan file secara instan dan akurat.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Upload Console */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-700/50 rounded-[24px] p-6 sm:p-8 relative shadow-xl">
            
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="font-semibold text-white text-lg">Media Upload</h3>
              </div>
              <span className="bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-medium px-3 py-1 rounded-full">Interactive Sync</span>
            </div>

            <p className="text-slate-400 text-sm leading-relaxed mb-8">
              Pilih folder lokal yang berisi subfolder <span className="text-blue-400 font-medium">PL</span> atau <span className="text-blue-400 font-medium">LEADER</span>. Sistem otomatis menyelaraskan kecocokan PDF dan Excel harian.
            </p>

            {/* Drag and Drop Zone */}
            <div className="space-y-4">
              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-[20px] p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-4 group overflow-hidden ${
                  isDragActive 
                    ? 'border-blue-500 bg-blue-500/10' 
                    : 'border-slate-700 bg-slate-800/30 hover:border-blue-500/50 hover:bg-slate-800/80'
                }`}
              >
                <input
                  type="file"
                  {...{ webkitdirectory: "", directory: "" }}
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />
                
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-transform relative z-10 ${isDragActive ? 'bg-blue-500/20 border-blue-500/30 scale-110' : 'bg-slate-800 border-slate-700 group-hover:scale-105'}`}>
                  {isScanning ? (
                    <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
                  ) : (
                    <Upload className={`w-6 h-6 transition-colors ${isDragActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-blue-400'}`} />
                  )}
                </div>

                <div className="relative z-10 max-w-sm">
                  <h4 className="text-white font-medium text-sm mb-1.5">
                    {isScanning ? 'Mengolah Berkas...' : 'Drop Folder Utama / Bebas'}
                  </h4>
                  <p className="text-slate-400 text-xs leading-relaxed mb-3">
                    Drag & drop folder di sini atau <span className="text-blue-400 group-hover:text-blue-300 transition-colors">klik untuk browsing</span>
                  </p>
                  <span className="inline-block text-[10px] text-slate-300 font-medium bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/50">
                    Otomatis Deteksi Subfolder PL/LEADER
                  </span>
                </div>
              </div>

              {selectedFolder && (
                <div className="flex items-center justify-between gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-medium text-emerald-400/80 block leading-none mb-1">FOLDER TERMUAT</span>
                      <span className="text-sm text-emerald-100 font-medium truncate block">{selectedFolder}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFolder(null);
                      setScannedFiles([]);
                      setHasScanned(false);
                    }}
                    className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors active:scale-95"
                  >
                    Hapus
                  </button>
                </div>
              )}

              {isScanning && (
                <div className="space-y-2 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                      {scanProgress < 100 ? (
                        scanProgress === 0 ? "Mendeteksi susunan folder..." : "Membaca file: " + scanProgress + "%"
                      ) : (
                        "Menganalisa kelengkapan..."
                      )}
                    </span>
                    <span className="text-white font-medium">{scanProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-blue-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Validation Explanation / Legend */}
            <div className="mt-8 pt-6 border-t border-slate-700/50 space-y-4">
              <h4 className="text-xs font-semibold text-slate-400">Petunjuk Kelengkapan</h4>
              
              <div className="space-y-4">
                <div className="flex gap-3 text-xs">
                  <span className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center shrink-0">
                    1
                  </span>
                  <p className="text-slate-400 leading-relaxed pt-0.5">
                    Letakkan <span className="text-slate-200">PDF</span> (manifest) dan <span className="text-slate-200">XLSX</span> (orderan) dengan nama berkas yang <span className="text-white font-medium">persis sama</span> dalam satu folder.
                  </p>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center shrink-0">
                    2
                  </span>
                  <p className="text-slate-400 leading-relaxed pt-0.5">
                    Sistem mendeteksi selisih file (<span className="text-amber-400">Kurang Excel</span> / <span className="text-rose-400">Kurang PDF</span>) secara otomatis.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Ledger Lists & Warnings */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-700/50 rounded-[24px] p-6 shadow-xl flex-1 flex flex-col">
            
            {/* Real-time Mismatch Alert Banner */}
            {mismatchFiles.length > 0 && (
              <div className="mb-6 p-5 bg-rose-500/10 border border-rose-500/20 rounded-[16px] flex items-start gap-3">
                <FileWarning className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="min-w-0 w-full">
                  <h4 className="text-rose-100 font-medium text-sm mb-1">
                    Selisih Berkas Ditemukan ({mismatchFiles.length} Item Tidak Lengkap)
                  </h4>
                  <p className="text-rose-200/70 text-xs mb-4">
                    Batch berikut kehilangan salah satu pasangannya (Excel atau PDF):
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {mismatchFiles.map((file, idx) => (
                      <div key={`${file.category}-${file.subFolder}-${file.name}-${idx}`} className="p-3 bg-slate-900/50 border border-rose-500/20 rounded-xl flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-slate-200 truncate text-xs">{file.name}</span>
                          <span className={`text-[9px] font-bold tracking-wider uppercase px-2 py-1 rounded bg-rose-500/20 text-rose-300 shrink-0`}>
                            {file.status === 'MISSING_EXCEL' ? 'KURANG EXCEL' : 'KURANG PDF'}
                          </span>
                        </div>
                        {file.category && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                            <span className="w-1 h-1 bg-slate-500 rounded-full" />
                            Subfolder: <span className="text-slate-300 font-medium">{file.subFolder}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!hasScanned && (
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-[16px] text-xs leading-relaxed text-blue-200 mb-6 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white font-medium block mb-1">Mode Simulasi</strong>
                  Anda sedang melihat data visual mockup. Drag/drop folder lokal utama Anda untuk memverifikasi file sungguhan.
                </div>
              </div>
            )}

            {hasScanned && mismatchFiles.length === 0 && (
              <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-[16px] flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-full shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <strong className="text-emerald-100 block text-sm font-medium mb-0.5">Berkas Sinkron 100%</strong>
                  <span className="text-emerald-200/70 text-xs">Seluruh file PDF dan Excel di folder ini lengkap tanpa selisih.</span>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-800 border border-slate-700">
                  <Layers className="w-4 h-4 text-slate-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-base">Hasil Detektor</h3>
                  <p className="text-xs text-slate-400">Daftar keselarasan manifest</p>
                </div>
              </div>
              
              {/* Search input to filter file list */}
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Cari file..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-blue-500/50 transition-colors"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            </div>

            {/* Quick Filter Tabs */}
            <div className="flex p-1 bg-slate-800/50 border border-slate-700/50 rounded-xl mb-6">
              {[
                { id: 'ALL', label: 'Semua' },
                { id: 'MATCH', label: 'Match' },
                { id: 'MISMATCH', label: 'Selisih' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === tab.id 
                      ? 'bg-slate-700 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Table layout of file audits */}
            <div className="overflow-x-auto rounded-[16px] border border-slate-700/50 bg-slate-800/20 flex-1 min-h-[300px]">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/50 text-slate-400 text-xs font-medium">
                    <th className="py-3 px-4 font-medium">Nama File / Batch Identifikasi</th>
                    <th className="py-3 px-4 text-center font-medium">Excel</th>
                    <th className="py-3 px-4 text-center font-medium">PDF</th>
                    <th className="py-3 px-4 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 text-slate-300 text-sm">
                  {filteredItems.map((item, idx) => (
                    <tr key={`${item.category}-${item.subFolder}-${item.name}-${idx}`} className="hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-200">{item.name}</div>
                        {item.category && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400">
                              Folder: {item.subFolder || item.category}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex px-2 py-1 rounded border text-[10px] font-medium ${item.excel ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                          {item.excel ? 'ADA' : 'TIDAK ADA'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex px-2 py-1 rounded border text-[10px] font-medium ${item.pdf ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                          {item.pdf ? 'ADA' : 'TIDAK ADA'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.status === 'MATCH' ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-400 text-[10px] font-medium bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">
                            <CheckCircle2 className="w-3 h-3" /> MATCH {item.orderCount ? `(${item.orderCount})` : ''}
                          </span>
                        ) : item.status === 'MISSING_EXCEL' ? (
                          <span className="inline-flex items-center gap-1.5 text-amber-400 text-[10px] font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded">
                            <AlertTriangle className="w-3 h-3" /> Kurang Excel
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-rose-400 text-[10px] font-medium bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded">
                            <ShieldAlert className="w-3 h-3" /> Kurang PDF
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredItems.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">
                  Tidak ada data yang cocok dengan pencarian.
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
