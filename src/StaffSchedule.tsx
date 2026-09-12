import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, getDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { StaffSchedule } from './types';
import { 
  Calendar, ChevronLeft, ChevronRight, ChevronDown, Plus, X, User, 
  Trash2, ShieldAlert, Clock, DollarSign, Save, Edit2, FileSpreadsheet,
  Users, Sparkles, Download, Upload, CheckCircle2
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import XLSX from 'xlsx-js-style';

interface StaffScheduleProps {
  user: FirebaseUser | null;
}

const SHIFT_TYPES = ['Siang', 'Pagi', 'Cover Pagi', 'Cover Siang', 'Cuti', 'Off', 'Cuti Sakit', 'POT. JAM', 'POT. GAJI', ''];

export default function StaffScheduleComponent({ user }: StaffScheduleProps) {
  const isDeveloper = user?.email === 'jgilbeth92@gmail.com' || user?.email === 'developer@example.com';

  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [allTimeSchedules, setAllTimeSchedules] = useState<StaffSchedule[]>([]);
  const [staffNames, setStaffNames] = useState<string[]>([]);
  
  // Modal states
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isFastInputModalOpen, setIsFastInputModalOpen] = useState(false);
  const [fastInputData, setFastInputData] = useState('');
  const [isProcessingFastInput, setIsProcessingFastInput] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  
  const [editingCell, setEditingCell] = useState<{staff: string, date: string} | null>(null);
  const [editForm, setEditForm] = useState<{
    shiftType: string;
    hourDeduction: number;
  }>({ shiftType: '', hourDeduction: 0 });

  // Mobile View States
  const [mobileViewMode, setMobileViewMode] = useState<'day' | 'staff'>('day');
  const [selectedMobileDate, setSelectedMobileDate] = useState<Date>(new Date());
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date();
    if (today.getFullYear() === currentDate.getFullYear() && today.getMonth() === currentDate.getMonth()) {
      setSelectedMobileDate(today);
    } else {
      setSelectedMobileDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
    }
  }, [currentDate]);

  useEffect(() => {
    if (mobileViewMode === 'day') {
      const timer = setTimeout(() => {
        const selectedId = `mobile-date-btn-${selectedMobileDate.getDate()}`;
        const element = document.getElementById(selectedId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [selectedMobileDate, mobileViewMode]);

  // Drag to scroll states
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const onMouseLeave = () => setIsDragging(false);
  const onMouseUp = () => setIsDragging(false);
  
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const scrollByAmount = (amount: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // Global keyboard scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't scroll if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;
      
      if (e.key === 'ArrowLeft') {
        scrollByAmount(-300);
      } else if (e.key === 'ArrowRight') {
        scrollByAmount(300);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Generate days in month
  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const date = new Date(year, month, 1);
    const days = [];
    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [currentDate]);

  const monthStartStr = useMemo(() => {
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;
  }, [currentDate]);

  const monthEndStr = useMemo(() => {
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
  }, [currentDate]);

  // Fetch Staff Names
  useEffect(() => {
    const staffDocRef = doc(db, 'metadata', 'staff_names');
    const unsubscribe = onSnapshot(staffDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStaffNames(data.names || []);
      } else {
        setStaffNames([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Schedules for Current Month
  useEffect(() => {
    const q = query(
      collection(db, 'staff_schedules'),
      where('date', '>=', monthStartStr),
      where('date', '<=', monthEndStr)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const data: StaffSchedule[] = [];
      snap.forEach((d) => {
        data.push({ id: d.id, ...d.data() } as StaffSchedule);
      });
      setSchedules(data);
    }, (error) => {
      console.error('Error fetching schedules:', error);
    });
    return () => unsubscribe();
  }, [monthStartStr, monthEndStr]);

  // Fetch All Time Schedules for Subtotals
  useEffect(() => {
    const qAll = query(collection(db, 'staff_schedules'));
    const unsubscribeAll = onSnapshot(qAll, (snap) => {
      const data: StaffSchedule[] = [];
      snap.forEach((d) => {
        data.push({ id: d.id, ...d.data() } as StaffSchedule);
      });
      setAllTimeSchedules(data);
    });
    return () => unsubscribeAll();
  }, []);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleAddStaff = async () => {
    if (!isDeveloper || !newStaffName.trim()) return;
    try {
      const staffDocRef = doc(db, 'metadata', 'staff_names');
      const snap = await getDoc(staffDocRef);
      let currentNames = [];
      if (snap.exists()) {
        currentNames = snap.data().names || [];
      }
      if (!currentNames.includes(newStaffName.trim())) {
        await setDoc(staffDocRef, { names: [...currentNames, newStaffName.trim()] }, { merge: true });
      }
      setNewStaffName('');
      setIsStaffModalOpen(false);
    } catch (error) {
      console.error("Error adding staff:", error);
      alert("Gagal menambah staf.");
    }
  };

  const handleDeleteStaff = async (name: string) => {
    if (!isDeveloper) return;
    if (!confirm(`Hapus staf ${name}? (Jadwal lama tetap ada di database namun baris nama ini akan hilang)`)) return;
    try {
      const staffDocRef = doc(db, 'metadata', 'staff_names');
      const newNames = staffNames.filter(n => n !== name);
      await setDoc(staffDocRef, { names: newNames }, { merge: true });
    } catch (error) {
      console.error("Error deleting staff:", error);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = ['Nama Staf', ...daysInMonth.map(d => `${d.getDate()}`)];
    const data = [
      headers,
      ['Contoh Staf 1', 'Pagi', 'Siang', 'Off', 'Cuti', ...Array(daysInMonth.length - 4).fill('')],
      ['Contoh Staf 2 (Dgn Potongan Jam)', 'Pagi, -1.5', 'Siang, 2', '-1.5', ...Array(daysInMonth.length - 3).fill('')],
      ['Contoh Staf 3', ...Array(daysInMonth.length).fill('')]
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Jadwal');
    XLSX.writeFile(wb, `Template_Jadwal_Staf_${currentDate.getFullYear()}_${currentDate.getMonth() + 1}.xlsx`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        // Ensure empty cells are retained as empty strings instead of skipping
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
        
        // Convert to TSV format for the textarea, starting from row 1 to skip header if it contains 'Nama Staf'
        const startIndex = data.length > 0 && String(data[0][0]).toLowerCase().includes('nama staf') ? 1 : 0;
        const tsv = data.slice(startIndex).map(row => row.join('\t')).join('\n');
        setFastInputData(tsv);
      } catch (error) {
        console.error('Error reading Excel file:', error);
        alert('Gagal membaca file Excel.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ''; // Reset input
  };

  const handleFastInputSubmit = async () => {
    if (!isDeveloper) return;
    if (!fastInputData.trim()) {
      alert("Data tidak boleh kosong.");
      return;
    }
    
    setIsProcessingFastInput(true);
    try {
      const rows = fastInputData.split('\n').filter(row => row.trim() !== '');
      const batch = writeBatch(db);
      let batchCount = 0;
      
      const updatedStaffNames = new Set(staffNames);

      for (const row of rows) {
        const columns = row.split('\t').map(c => c.trim());
        if (columns.length < 2) continue; // Need at least name and 1 day
        
        const staff = columns[0];
        if (!staff) continue;
        
        updatedStaffNames.add(staff);
        
        for (let i = 1; i < columns.length && i <= daysInMonth.length; i++) {
          const shiftValue = columns[i];
          if (!shiftValue || (shiftValue.toLowerCase() === 'off' && shiftValue.length !== 3)) continue; // Skip empty cells
          
          const day = daysInMonth[i - 1];
          const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
          
          let shiftType = shiftValue;
          let hourDeduction = 0;
          
          if (shiftValue.includes(',')) {
            const parts = shiftValue.split(',');
            shiftType = parts[0].trim();
            hourDeduction = parseFloat(parts[1].trim()) || 0;
          } else {
            const parsedNum = parseFloat(shiftValue);
            if (!isNaN(parsedNum) && /^-?\d*\.?\d+$/.test(shiftValue.trim())) {
              shiftType = '';
              hourDeduction = parsedNum;
            }
          }
          
          // Normalize common shift names
          const lowerShift = shiftType.toLowerCase();
          if (lowerShift === 'pagi') shiftType = 'Pagi';
          else if (lowerShift === 'siang') shiftType = 'Siang';
          else if (lowerShift === 'cover pagi') shiftType = 'Cover Pagi';
          else if (lowerShift === 'cover siang') shiftType = 'Cover Siang';
          else if (lowerShift === 'cuti') shiftType = 'Cuti';
          else if (lowerShift === 'off') shiftType = 'Off';
          else if (lowerShift === 'cuti sakit') shiftType = 'Cuti Sakit';

          const docId = `${staff}_${dateStr}`;
          const docRef = doc(db, 'staff_schedules', docId);
          
          batch.set(docRef, {
            staffName: staff,
            date: dateStr,
            shiftType: shiftType as any,
            hourDeduction: hourDeduction,
            updatedAt: new Date().toISOString(),
            updatedBy: user?.email || 'unknown'
          });
          batchCount++;
          
          // Firebase batches are limited to 500 operations
          if (batchCount >= 450) {
            await batch.commit();
            batchCount = 0;
          }
        }
      }
      
      if (batchCount > 0) {
        await batch.commit();
      }
      
      // Update staff names if new ones were found
      if (updatedStaffNames.size > staffNames.length) {
        const staffDocRef = doc(db, 'metadata', 'staff_names');
        await setDoc(staffDocRef, { names: Array.from(updatedStaffNames) }, { merge: true });
      }

      setFastInputData('');
      setIsFastInputModalOpen(false);
      alert("Data berhasil disimpan secara massal!");
    } catch (error) {
      console.error("Error processing fast input:", error);
      alert("Terjadi kesalahan saat memproses data.");
    } finally {
      setIsProcessingFastInput(false);
    }
  };

  const openCellModal = (staff: string, dateObj: Date) => {
    if (!isDeveloper) {
      alert("Hanya akun Developer yang dapat mengubah jadwal staf.");
      return;
    }
    const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    const existing = schedules.find(s => s.staffName === staff && s.date === dateStr);
    
    setEditingCell({ staff, date: dateStr });
    setEditForm({
      shiftType: existing?.shiftType || '',
      hourDeduction: existing?.hourDeduction || 0
    });
  };

  const handleSaveCell = async () => {
    if (!isDeveloper || !editingCell) return;
    
    try {
      const docId = `${editingCell.staff}_${editingCell.date}`;
      const docRef = doc(db, 'staff_schedules', docId);

      if (editForm.shiftType === '' && editForm.hourDeduction === 0) {
        // If everything is cleared, delete the document
        const existing = schedules.find(s => s.staffName === editingCell.staff && s.date === editingCell.date);
        if (existing) {
          await deleteDoc(docRef);
        }
      } else {
        const scheduleData: StaffSchedule = {
          staffName: editingCell.staff,
          date: editingCell.date,
          shiftType: editForm.shiftType as any,
          hourDeduction: Number(editForm.hourDeduction) || 0,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.email || 'unknown'
        };
        await setDoc(docRef, scheduleData);
      }
      setEditingCell(null);
    } catch (error) {
      console.error("Error saving schedule:", error);
      alert("Gagal menyimpan jadwal.");
    }
  };

  const getCellData = (staff: string, dateObj: Date) => {
    const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    return schedules.find(s => s.staffName === staff && s.date === dateStr);
  };

  // UI Helpers
  const formatMonth = (date: Date) => {
    return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  };
  
  const getDayColor = (dayIndex: number) => {
    if (dayIndex === 0) return 'text-rose-400 bg-rose-950/20'; // Sunday
    if (dayIndex === 6) return 'text-purple-300 bg-purple-950/20'; // Saturday
    return 'text-slate-300';
  };

  const getShiftColor = (shiftType: string) => {
    switch (shiftType) {
      case 'Siang': return 'bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-sm shadow-amber-950/30';
      case 'Pagi': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-sm shadow-emerald-950/30';
      case 'Cover Pagi': return 'bg-sky-500/15 text-sky-300 border-sky-500/30 shadow-sm shadow-sky-950/30';
      case 'Cover Siang': return 'bg-orange-500/15 text-orange-300 border-orange-500/30 shadow-sm shadow-orange-950/30';
      case 'Cuti': return 'bg-purple-500/20 text-purple-300 border-purple-500/30 shadow-sm shadow-purple-950/30';
      case 'Off': return 'bg-slate-800/80 text-slate-400 border-slate-700/50';
      case 'Cuti Sakit': return 'bg-rose-500/15 text-rose-300 border-rose-500/30 shadow-sm shadow-rose-950/30';
      case 'POT. JAM': return 'bg-rose-600/20 text-rose-300 border-rose-500/40';
      case 'POT. GAJI': return 'bg-red-600/25 text-red-400 border-red-600/50';
      default: return 'bg-transparent border-transparent';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20 relative">
      {/* Header Panel */}
      <div className="bg-[#130b2e]/90 border border-purple-900/30 p-6 md:p-7 rounded-2xl shadow-xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-purple-600/10 blur-[130px] rounded-full pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 p-3.5 bg-gradient-to-tr from-purple-600/25 to-indigo-600/25 rounded-2xl flex items-center justify-center border border-purple-500/30 shadow-lg shadow-purple-950/50">
              <Calendar className="w-7 h-7 text-purple-400" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">Jadwal Staf Admin</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 tracking-wider uppercase">
                  v2.6-SHIFT
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-sm shadow-emerald-400" />
                <p className="text-purple-300/80 text-xs font-bold uppercase tracking-widest">
                  Live Manajemen Shift & Kehadiran • {staffNames.length} Staf Terdaftar
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* Month Navigator Capsule */}
            <div className="flex items-center gap-2 bg-[#0c0620]/90 backdrop-blur-md p-1.5 rounded-2xl border border-purple-900/40 shadow-inner">
              <button 
                onClick={handlePrevMonth} 
                className="p-2 hover:bg-purple-600/20 text-purple-300 hover:text-white rounded-xl transition-colors"
                title="Bulan Sebelumnya"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="px-3 font-black text-white min-w-[130px] text-center tracking-wide text-sm">
                {formatMonth(currentDate)}
              </div>
              <button 
                onClick={handleNextMonth} 
                className="p-2 hover:bg-purple-600/20 text-purple-300 hover:text-white rounded-xl transition-colors"
                title="Bulan Berikutnya"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Action Buttons */}
            {isDeveloper && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFastInputModalOpen(true)}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-950/40 flex items-center gap-2 text-xs"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Fast Excel</span>
                </button>
                <button
                  onClick={() => setIsStaffModalOpen(true)}
                  className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-purple-950/40 flex items-center gap-2 text-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Staf</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Shift Badges Legend Bar */}
        <div className="mt-6 pt-5 border-t border-purple-900/25 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-purple-300/60 font-bold uppercase text-[10px] tracking-wider mr-2">Legend Shift:</span>
          {['Pagi', 'Siang', 'Cover Pagi', 'Cover Siang', 'Cuti', 'Off', 'Cuti Sakit', 'POT. JAM', 'POT. GAJI'].map((shift) => (
            <span key={shift} className={`px-2.5 py-1 rounded-lg border font-bold ${getShiftColor(shift)}`}>
              {shift}
            </span>
          ))}
        </div>
      </div>

      {/* Mobile View */}
      <div className="block md:hidden space-y-4">
        {/* Toggle Mode */}
        <div className="flex bg-[#0c0620]/90 p-1.5 rounded-2xl border border-purple-900/40 backdrop-blur-md">
          <button
            onClick={() => setMobileViewMode('day')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${mobileViewMode === 'day' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-900/40' : 'text-purple-300/60 hover:text-purple-200'}`}
          >
            Tampilan Harian
          </button>
          <button
            onClick={() => setMobileViewMode('staff')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${mobileViewMode === 'staff' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-900/40' : 'text-purple-300/60 hover:text-purple-200'}`}
          >
            Per Anggota Staf
          </button>
        </div>

        {mobileViewMode === 'day' && (
          <div className="space-y-4 animate-fade-in">
            {/* Horizontal Date Slider */}
            <div className="flex overflow-x-auto gap-2 pb-2 custom-scrollbar snap-x">
              {daysInMonth.map((day) => {
                const isSelected = selectedMobileDate.getDate() === day.getDate();
                const isSunday = day.getDay() === 0;
                return (
                  <button
                    key={day.toISOString()}
                    id={`mobile-date-btn-${day.getDate()}`}
                    onClick={() => setSelectedMobileDate(day)}
                    className={`snap-center flex-shrink-0 w-16 h-20 rounded-2xl flex flex-col items-center justify-center border transition-all ${
                      isSelected 
                        ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 border-purple-400 text-white shadow-lg shadow-purple-900/50' 
                        : 'bg-[#130b2e]/90 border-purple-900/30 text-purple-300/70 hover:border-purple-700/50'
                    }`}
                  >
                    <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-purple-100' : isSunday ? 'text-rose-400' : 'text-purple-300/60'}`}>
                      {day.toLocaleDateString('id-ID', { weekday: 'short' })}
                    </span>
                    <span className={`text-2xl font-black mt-1 ${isSelected ? 'text-white' : isSunday ? 'text-rose-400' : 'text-slate-200'}`}>
                      {day.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Staff List for Selected Date */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-sm font-black text-purple-200 uppercase tracking-wider">
                  Jadwal Tanggal {selectedMobileDate.getDate()} {formatMonth(selectedMobileDate)}
                </h3>
                {isDeveloper && (
                  <div className="flex gap-2">
                    <button onClick={() => setIsFastInputModalOpen(true)} className="p-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl"><FileSpreadsheet className="w-4 h-4" /></button>
                    <button onClick={() => setIsStaffModalOpen(true)} className="p-2 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-xl"><Plus className="w-4 h-4" /></button>
                  </div>
                )}
              </div>

              {staffNames.length === 0 ? (
                <div className="text-center p-8 bg-[#130b2e]/90 rounded-2xl border border-purple-900/30 text-purple-300/60 text-sm">
                  Belum ada data staf terdaftar.
                </div>
              ) : (
                staffNames.map((staff) => {
                  const data = getCellData(staff, selectedMobileDate);
                  return (
                    <div 
                      key={staff} 
                      onClick={() => isDeveloper && openCellModal(staff, selectedMobileDate)}
                      className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-4 flex items-center justify-between active:scale-[0.99] transition-transform hover:border-purple-600/40"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-950/70 border border-purple-800/40 flex items-center justify-center text-xs font-black text-purple-300 uppercase shrink-0 shadow-inner">
                          {staff.substring(0, 2)}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-white">{staff}</p>
                          {data?.shiftType ? (
                            <span className={`mt-1 inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${getShiftColor(data.shiftType)}`}>
                              {data.shiftType}
                            </span>
                          ) : (
                            <span className="mt-1 inline-block text-[10px] font-medium text-slate-500 italic">Belum diset</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {(data?.hourDeduction !== 0 && data?.hourDeduction !== undefined) && (
                          <div className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${data.hourDeduction > 0 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border-rose-500/30'}`}>
                            {data.hourDeduction > 0 ? '+' : ''}{data.hourDeduction} Jam
                          </div>
                        )}
                        {isDeveloper && <ChevronRight className="w-4 h-4 text-purple-400/60 mt-1" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {mobileViewMode === 'staff' && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-sm font-black text-purple-200 uppercase tracking-wider">Rekapitulasi Jam Staf</h3>
              {isDeveloper && (
                <div className="flex gap-2">
                  <button onClick={() => setIsFastInputModalOpen(true)} className="p-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl"><FileSpreadsheet className="w-4 h-4" /></button>
                  <button onClick={() => setIsStaffModalOpen(true)} className="p-2 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-xl"><Plus className="w-4 h-4" /></button>
                </div>
              )}
            </div>
            
            {staffNames.length === 0 ? (
                <div className="text-center p-8 bg-[#130b2e]/90 rounded-2xl border border-purple-900/30 text-purple-300/60 text-sm">
                  Belum ada data staf terdaftar.
                </div>
            ) : (
              staffNames.map((staff) => {
                const totalMasuk = parseFloat((allTimeSchedules.filter(s => s.staffName === staff && (s.hourDeduction || 0) > 0).reduce((sum, s) => sum + (s.hourDeduction || 0), 0)).toFixed(2));
                const totalPotong = parseFloat((allTimeSchedules.filter(s => s.staffName === staff && (s.hourDeduction || 0) < 0).reduce((sum, s) => sum + (s.hourDeduction || 0), 0)).toFixed(2));
                const isExpanded = expandedStaff === staff;

                return (
                  <div key={staff} className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl overflow-hidden transition-all shadow-md">
                    <div 
                      onClick={() => setExpandedStaff(isExpanded ? null : staff)}
                      className="p-4 flex items-center justify-between active:bg-purple-950/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-950/70 border border-purple-800/40 flex items-center justify-center text-xs font-black text-purple-300 uppercase shrink-0 shadow-inner">
                          {staff.substring(0, 2)}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-white">{staff}</p>
                          <div className="flex gap-2 items-center mt-1">
                            <span className="text-[10px] font-black inline-block text-emerald-400">
                              Lembur: +{totalMasuk} Jam
                            </span>
                            <span className="text-purple-800">•</span>
                            <span className="text-[10px] font-black inline-block text-rose-400">
                              Potong: {totalPotong} Jam
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isDeveloper && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteStaff(staff); }}
                            className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
                            title="Hapus Staf"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <ChevronDown className={`w-5 h-5 text-purple-400/60 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="bg-[#0c0620]/95 p-4 border-t border-purple-900/30 grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {daysInMonth.map((day) => {
                          const data = getCellData(staff, day);
                          if (!data?.shiftType && !data?.hourDeduction) return null;
                          return (
                            <div 
                              key={day.toISOString()} 
                              onClick={() => isDeveloper && openCellModal(staff, day)}
                              className="bg-[#130b2e] p-2.5 rounded-xl border border-purple-900/30 flex flex-col justify-center items-center text-center gap-1 active:scale-95 transition-transform"
                            >
                              <span className="text-[10px] font-bold text-purple-300/80">Tgl {day.getDate()}</span>
                              {data?.shiftType && (
                                <div className={`text-[9px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${getShiftColor(data.shiftType)}`}>
                                  {data.shiftType}
                                </div>
                              )}
                              {(data?.hourDeduction !== 0 && data?.hourDeduction !== undefined) && (
                                <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${data.hourDeduction > 0 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border-rose-500/30'}`}>
                                  {data.hourDeduction > 0 ? '+' : ''}{data.hourDeduction} Jam
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {daysInMonth.every(day => !getCellData(staff, day)?.shiftType && !getCellData(staff, day)?.hourDeduction) && (
                          <div className="col-span-full text-center text-[11px] text-purple-300/40 py-3 italic">
                            Belum ada entri jadwal di bulan ini
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Main Calendar Grid (Desktop Only) */}
      <div className="hidden md:block bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md relative z-10 group/table">
        
        {/* Frozen Header for Month & Year */}
        <div className="bg-[#0c0620]/95 p-4 text-center border-b border-purple-900/40 shadow-inner sticky top-0 z-40 flex items-center justify-between px-6">
          <div className="flex items-center gap-2 text-xs font-bold text-purple-300/80 uppercase tracking-widest">
            <Users className="w-4 h-4 text-purple-400" />
            <span>Matriks Kehadiran Bulanan</span>
          </div>
          <span className="text-xl font-black text-white tracking-widest uppercase bg-gradient-to-r from-purple-400 to-indigo-300 bg-clip-text text-transparent">
            {formatMonth(currentDate)}
          </span>
          <div className="text-xs text-purple-400/60 font-medium">
            {isDeveloper ? 'Klik sel untuk mengedit shift' : 'Hanya lihat'}
          </div>
        </div>

        {/* Scroll Buttons */}
        <button 
          onClick={() => scrollByAmount(-400)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-30 p-2.5 bg-purple-600/90 hover:bg-purple-500 text-white rounded-r-2xl shadow-xl shadow-purple-950/60 opacity-0 group-hover/table:opacity-100 transition-opacity backdrop-blur-md border-r border-t border-b border-purple-400/30"
          title="Scroll Kiri"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
        <button 
          onClick={() => scrollByAmount(400)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-30 p-2.5 bg-purple-600/90 hover:bg-purple-500 text-white rounded-l-2xl shadow-xl shadow-purple-950/60 opacity-0 group-hover/table:opacity-100 transition-opacity backdrop-blur-md border-l border-t border-b border-purple-400/30"
          title="Scroll Kanan"
        >
          <ChevronRight className="w-7 h-7" />
        </button>

        <div 
          ref={scrollRef}
          className={`overflow-x-auto custom-scrollbar ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onMouseDown={onMouseDown}
          onMouseLeave={onMouseLeave}
          onMouseUp={onMouseUp}
          onMouseMove={onMouseMove}
        >
          <table className="w-full border-collapse text-left min-w-max select-none">
            <thead>
              <tr className="bg-[#0c0620]">
                <th className="sticky left-0 z-20 bg-[#0e0725] border-b border-r border-purple-900/40 p-3 md:p-4 min-w-[140px] md:min-w-[210px] shadow-[4px_0_15px_rgba(0,0,0,0.5)]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-black text-purple-300 uppercase tracking-widest truncate">Nama Staf</span>
                    {isDeveloper && (
                      <div className="flex gap-1.5">
                        <button 
                          onClick={() => setIsFastInputModalOpen(true)}
                          className="p-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 rounded-lg transition-colors flex items-center gap-1"
                          title="Fast Input Excel"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => setIsStaffModalOpen(true)}
                          className="p-1.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 rounded-lg transition-colors"
                          title="Tambah Staf Baru"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </th>
                <th className="md:sticky md:left-[210px] md:z-20 bg-[#0e0725] border-b border-r border-purple-900/40 p-2 md:p-4 min-w-[110px] md:min-w-[150px] md:shadow-[4px_0_15px_rgba(0,0,0,0.5)] text-center">
                  <span className="text-[10px] font-black text-purple-300 uppercase tracking-widest">Total Akumulasi</span>
                </th>
                {daysInMonth.map((day) => {
                  const isToday = new Date().toDateString() === day.toDateString();
                  return (
                    <th 
                      key={day.toISOString()} 
                      className={`border-b border-r border-purple-900/30 p-2 md:p-3 min-w-[85px] md:min-w-[105px] text-center transition-colors ${
                        isToday ? 'bg-purple-600/20 ring-1 ring-inset ring-purple-500/40' : getDayColor(day.getDay())
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-widest mb-0.5 opacity-80">
                        {day.toLocaleDateString('id-ID', { weekday: 'short' })}
                      </div>
                      <div className={`text-base md:text-lg font-black ${isToday ? 'text-purple-300' : 'text-white'}`}>
                        {day.getDate()}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {staffNames.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth.length + 2} className="p-12 text-center text-purple-300/50 bg-[#130b2e]/60">
                    Belum ada data staf. {isDeveloper && "Silakan tambah staf terlebih dahulu."}
                  </td>
                </tr>
              ) : (
                staffNames.map((staff) => (
                  <tr key={staff} className="border-b border-purple-900/20 hover:bg-purple-950/20 transition-colors group">
                    <td className="sticky left-0 z-20 bg-[#0e0725] group-hover:bg-[#150a36] border-r border-purple-900/40 p-3 md:p-4 shadow-[4px_0_15px_rgba(0,0,0,0.5)] transition-colors">
                      <div className="flex items-center justify-between gap-1 md:gap-2">
                        <div className="flex items-center gap-2 md:gap-3">
                          <div className="w-8 h-8 rounded-xl bg-purple-950/80 border border-purple-800/50 flex items-center justify-center text-xs font-black text-purple-300 uppercase shrink-0 shadow-inner">
                            {staff.substring(0, 2)}
                          </div>
                          <span className="font-bold text-[12px] md:text-sm text-white truncate max-w-[90px] md:max-w-none">{staff}</span>
                        </div>
                        {isDeveloper && (
                          <button 
                            onClick={() => handleDeleteStaff(staff)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-rose-500/10"
                            title="Hapus Staf"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="md:sticky md:left-[210px] md:z-20 bg-[#0e0725] group-hover:bg-[#150a36] border-r border-purple-900/40 p-2 md:p-3 md:shadow-[4px_0_15px_rgba(0,0,0,0.5)] transition-colors text-center">
                      <div className="flex flex-col gap-1 items-center justify-center">
                        <div className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap w-full">
                          +{parseFloat((allTimeSchedules.filter(s => s.staffName === staff && (s.hourDeduction || 0) > 0).reduce((sum, s) => sum + (s.hourDeduction || 0), 0)).toFixed(2))} Jam
                        </div>
                        <div className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap w-full">
                          {parseFloat((allTimeSchedules.filter(s => s.staffName === staff && (s.hourDeduction || 0) < 0).reduce((sum, s) => sum + (s.hourDeduction || 0), 0)).toFixed(2))} Jam
                        </div>
                      </div>
                    </td>
                    {daysInMonth.map((day) => {
                      const data = getCellData(staff, day);
                      return (
                        <td 
                          key={day.toISOString()} 
                          className={`p-2 border-r border-purple-900/20 relative ${isDeveloper ? 'cursor-pointer hover:bg-purple-600/15' : ''} transition-colors group/cell`}
                          onClick={() => isDeveloper && openCellModal(staff, day)}
                        >
                          <div className="min-h-[52px] md:min-h-[60px] flex flex-col justify-center gap-1">
                            {data?.shiftType && (
                              <div className={`text-[10px] md:text-[11px] font-black px-2 py-1 rounded-lg border text-center whitespace-nowrap ${getShiftColor(data.shiftType)}`}>
                                {data.shiftType}
                              </div>
                            )}
                            
                            {(data?.hourDeduction !== 0 && data?.hourDeduction !== undefined) && (
                              <div className={`text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md text-center border ${data.hourDeduction > 0 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border-rose-500/30'}`}>
                                {data.hourDeduction > 0 ? '+' : ''}{data.hourDeduction} Jam
                              </div>
                            )}

                            {!data?.shiftType && !data?.hourDeduction && isDeveloper && (
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                <Plus className="w-4 h-4 text-purple-400/60" />
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Staff Modal */}
      {isStaffModalOpen && isDeveloper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#130b2e] border border-purple-800/40 rounded-3xl w-full max-w-md p-6 md:p-8 shadow-2xl relative shadow-purple-950/80">
            <button 
              onClick={() => setIsStaffModalOpen(false)}
              className="absolute top-5 right-5 p-2 text-purple-300 hover:text-white bg-[#0c0620] hover:bg-purple-900/40 rounded-full border border-purple-800/40 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Tambah Staf Baru</h3>
                <p className="text-xs text-purple-300/70">Daftarkan anggota tim staf admin</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1 mb-2 block">Nama Lengkap Staf</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
                  <input
                    type="text"
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm placeholder-purple-400/30"
                    placeholder="Contoh: Budi Santoso..."
                    onKeyDown={(e) => e.key === 'Enter' && handleAddStaff()}
                  />
                </div>
              </div>
              <button 
                onClick={handleAddStaff}
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black rounded-xl transition-all shadow-xl shadow-purple-950/50 uppercase tracking-widest text-xs flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Simpan Staf</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fast Input Excel Modal */}
      {isFastInputModalOpen && isDeveloper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#130b2e] border border-purple-800/40 rounded-3xl w-full max-w-3xl p-6 md:p-8 shadow-2xl relative flex flex-col max-h-[90vh] shadow-purple-950/80">
            <button 
              onClick={() => setIsFastInputModalOpen(false)}
              className="absolute top-5 right-5 p-2 text-purple-300 hover:text-white bg-[#0c0620] hover:bg-purple-900/40 rounded-full border border-purple-800/40 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Fast Input dari Spreadsheet / Excel</h3>
                <p className="text-xs text-purple-300/70">Impor seluruh jadwal staf satu bulan secara instan</p>
              </div>
            </div>

            <div className="bg-[#0c0620]/80 p-3.5 rounded-xl border border-purple-900/30 text-xs text-purple-200/80 mb-4 leading-relaxed">
              <div className="font-bold text-white mb-1">Panduan Pengisian:</div>
              • Format Baris: <code>Nama Staf [Tab] Shift Tgl 1 [Tab] Shift Tgl 2 [Tab] ...</code><br/>
              • Shift & Potongan Jam: <code>Pagi, -1.5</code> atau <code>Siang, 2</code> | Hanya Potongan: <code>-1.5</code> | Hanya Shift: <code>Pagi</code>
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
              <button 
                onClick={handleDownloadTemplate}
                className="px-4 py-2.5 bg-[#0c0620] hover:bg-purple-900/30 text-purple-300 rounded-xl transition-colors text-xs font-bold border border-purple-800/40 flex items-center gap-2"
              >
                <Download className="w-4 h-4 text-purple-400" />
                <span>Unduh Template Excel</span>
              </button>
              
              <div className="relative overflow-hidden inline-block">
                <button className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl transition-colors text-xs font-bold shadow-lg shadow-emerald-950/40 flex items-center gap-2">
                  <Upload className="w-4 h-4" /> 
                  <span>Import File Excel (.xlsx)</span>
                </button>
                <input 
                  type="file" 
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  title="Klik untuk memilih file Excel"
                />
              </div>
            </div>
            
            <div className="flex-1 min-h-[220px] mb-4">
              <textarea
                value={fastInputData}
                onChange={(e) => setFastInputData(e.target.value)}
                className="w-full h-full p-4 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-purple-200 focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-mono whitespace-pre placeholder-purple-400/30"
                placeholder={`Contoh Format Copy-Paste dari Excel:\nBudi Santoso\tPagi\tSiang\tOff\tPagi\tPagi\nSiti Rahma\tSiang\tPagi\tPagi\tCuti\tOff`}
              />
            </div>
            
            <button 
              onClick={handleFastInputSubmit}
              disabled={isProcessingFastInput}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-xl shadow-emerald-950/50 uppercase tracking-widest text-xs flex justify-center items-center gap-2"
            >
              {isProcessingFastInput ? (
                <>Menyimpan Data...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Proses & Simpan Semua Jadwal</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Edit Cell Modal */}
      {editingCell && isDeveloper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#130b2e] border border-purple-800/40 rounded-3xl w-full max-w-sm p-6 shadow-2xl relative shadow-purple-950/80">
            <button 
              onClick={() => setEditingCell(null)}
              className="absolute top-4 right-4 p-2 text-purple-300 hover:text-white bg-[#0c0620] hover:bg-purple-900/40 rounded-full border border-purple-800/40 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="mb-6">
              <h3 className="text-lg font-black text-white">Edit Jadwal Shift</h3>
              <p className="text-xs text-purple-300 font-medium mt-1">
                {editingCell.staff} • {new Date(editingCell.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1 mb-2 block">Pilih Shift / Keterangan</label>
                <select
                  value={editForm.shiftType}
                  onChange={(e) => setEditForm(prev => ({ ...prev, shiftType: e.target.value }))}
                  className="w-full px-4 py-3 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                >
                  <option value="" className="bg-[#0c0620] text-slate-400">- Kosongkan Shift -</option>
                  {SHIFT_TYPES.filter(t => t !== '').map(type => (
                    <option key={type} value={type} className="bg-[#0c0620] text-white">{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1 mb-2 block">Potongan / Lembur Jam</label>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
                  <input
                    type="number"
                    value={editForm.hourDeduction || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, hourDeduction: parseFloat(e.target.value) || 0 }))}
                    className="w-full pl-11 pr-4 py-3 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl text-white outline-none focus:ring-2 focus:ring-purple-500 text-sm placeholder-purple-400/30"
                    placeholder="Contoh: 1.5 atau -2"
                    step="0.5"
                  />
                </div>
                <p className="text-[10px] text-purple-300/50 mt-1.5 px-1">Gunakan minus (-) untuk pulang cepat / izin, plus (+) untuk lembur.</p>
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  onClick={handleSaveCell}
                  className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-purple-950/50 flex items-center justify-center gap-2 text-sm"
                >
                  <Save className="w-4 h-4" />
                  Simpan Jadwal
                </button>
                <button 
                  onClick={() => {
                    setEditForm({ shiftType: '', hourDeduction: 0 });
                  }}
                  className="px-4 py-3 bg-[#0c0620] hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-purple-900/40 hover:border-rose-500/30 font-bold rounded-xl transition-all"
                  title="Hapus / Kosongkan Sel"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
