import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, getDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { StaffSchedule } from './types';
import { 
  Calendar, ChevronLeft, ChevronRight, ChevronDown, Plus, X, User, 
  Trash2, ShieldAlert, Clock, DollarSign, Save, Edit2, FileSpreadsheet
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
      console.log('Fetched schedules:', data);
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
          if (!shiftValue || shiftValue.toLowerCase() === 'off' && shiftValue.length !== 3) continue; // Skip empty cells
          
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
      
      console.log('Saving schedule:', { docId, editForm });

      if (editForm.shiftType === '' && editForm.hourDeduction === 0) {
        // If everything is cleared, delete the document
        console.log('Deleting schedule because everything is cleared');
        const existing = schedules.find(s => s.staffName === editingCell.staff && s.date === editingCell.date);
        if (existing) {
          await deleteDoc(docRef);
          console.log('Deleted successfully');
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
        console.log('Setting doc with data:', scheduleData);
        await setDoc(docRef, scheduleData);
        console.log('SetDoc successful');
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
    if (dayIndex === 0) return 'text-rose-400 bg-rose-500/10'; // Sunday
    return 'text-slate-300';
  };

  const getShiftColor = (shiftType: string) => {
    switch (shiftType) {
      case 'Siang': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'Pagi': return 'bg-teal-500/20 text-teal-300 border-teal-500/30';
      case 'Cover Pagi': return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
      case 'Cover Siang': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'Cuti': return 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30';
      case 'Off': return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
      case 'Cuti Sakit': return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'POT. JAM': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'POT. GAJI': return 'bg-red-600/20 text-red-400 border-red-600/30';
      default: return 'bg-transparent border-transparent';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-24 relative">
      {/* Header Panel */}
      <div className="glass-card p-6 md:p-8 rounded-[32px] border-indigo-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-500/20 rounded-2xl flex items-center justify-center border border-indigo-500/30 shadow-lg shadow-indigo-500/20">
              <Calendar className="w-7 h-7 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">Jadwal Staf Admin</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest">Manajemen Shift & Kehadiran</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-[#0f172a]/80 backdrop-blur-md p-2 rounded-2xl border border-white/10">
            <button onClick={handlePrevMonth} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <ChevronLeft className="w-5 h-5 text-indigo-400" />
            </button>
            <div className="px-4 font-bold text-white min-w-[140px] text-center tracking-wide">
              {formatMonth(currentDate)}
            </div>
            <button onClick={handleNextMonth} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <ChevronRight className="w-5 h-5 text-indigo-400" />
            </button>
          </div>
        </div>


      </div>

      {/* Mobile View */}
      <div className="block md:hidden space-y-4">
        {/* Toggle Mode */}
        <div className="flex bg-[#0f172a]/80 p-1.5 rounded-2xl border border-white/10 backdrop-blur-md">
          <button
            onClick={() => setMobileViewMode('day')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${mobileViewMode === 'day' ? 'bg-indigo-500/20 text-indigo-300 shadow-sm' : 'text-slate-400'}`}
          >
            Harian
          </button>
          <button
            onClick={() => setMobileViewMode('staff')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${mobileViewMode === 'staff' ? 'bg-indigo-500/20 text-indigo-300 shadow-sm' : 'text-slate-400'}`}
          >
            Per Staf
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
                        ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/30' 
                        : 'bg-[#121b2f] border-white/5 text-slate-400 hover:border-white/10'
                    }`}
                  >
                    <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-indigo-100' : isSunday ? 'text-rose-400' : 'text-slate-500'}`}>
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
                <h3 className="text-sm font-bold text-slate-300">Jadwal Tgl {selectedMobileDate.getDate()}</h3>
                {isDeveloper && (
                  <div className="flex gap-2">
                    <button onClick={() => setIsFastInputModalOpen(true)} className="p-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg"><FileSpreadsheet className="w-4 h-4" /></button>
                    <button onClick={() => setIsStaffModalOpen(true)} className="p-1.5 bg-indigo-500/20 text-indigo-300 rounded-lg"><Plus className="w-4 h-4" /></button>
                  </div>
                )}
              </div>

              {staffNames.length === 0 ? (
                <div className="text-center p-8 bg-[#121b2f] rounded-3xl border border-white/5 text-slate-500 text-sm">
                  Belum ada data staf.
                </div>
              ) : (
                staffNames.map((staff) => {
                  const data = getCellData(staff, selectedMobileDate);
                  return (
                    <div 
                      key={staff} 
                      onClick={() => isDeveloper && openCellModal(staff, selectedMobileDate)}
                      className="bg-[#121b2f] border border-white/5 rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-transform"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 uppercase shrink-0 shadow-inner">
                          {staff.substring(0, 2)}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-200">{staff}</p>
                          {data?.shiftType ? (
                            <span className={`mt-1 inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${getShiftColor(data.shiftType)}`}>
                              {data.shiftType}
                            </span>
                          ) : (
                            <span className="mt-1 inline-block text-[10px] font-medium text-slate-500">Tidak ada jadwal</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {(data?.hourDeduction !== 0 && data?.hourDeduction !== undefined) && (
                          <div className={`text-[10px] font-bold px-2 py-0.5 rounded border ${data.hourDeduction > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                            {data.hourDeduction > 0 ? '+' : ''}{data.hourDeduction} Jam
                          </div>
                        )}
                        {isDeveloper && <ChevronRight className="w-4 h-4 text-slate-600 mt-1" />}
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
              <h3 className="text-sm font-bold text-slate-300">Ringkasan Bulan Ini</h3>
              {isDeveloper && (
                <div className="flex gap-2">
                  <button onClick={() => setIsFastInputModalOpen(true)} className="p-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg"><FileSpreadsheet className="w-4 h-4" /></button>
                  <button onClick={() => setIsStaffModalOpen(true)} className="p-1.5 bg-indigo-500/20 text-indigo-300 rounded-lg"><Plus className="w-4 h-4" /></button>
                </div>
              )}
            </div>
            
            {staffNames.length === 0 ? (
                <div className="text-center p-8 bg-[#121b2f] rounded-3xl border border-white/5 text-slate-500 text-sm">
                  Belum ada data staf.
                </div>
            ) : (
              staffNames.map((staff) => {
                const totalMasuk = parseFloat((allTimeSchedules.filter(s => s.staffName === staff && (s.hourDeduction || 0) > 0).reduce((sum, s) => sum + (s.hourDeduction || 0), 0)).toFixed(2));
                const totalPotong = parseFloat((allTimeSchedules.filter(s => s.staffName === staff && (s.hourDeduction || 0) < 0).reduce((sum, s) => sum + (s.hourDeduction || 0), 0)).toFixed(2));
                const isExpanded = expandedStaff === staff;

                return (
                  <div key={staff} className="bg-[#121b2f] border border-white/5 rounded-2xl overflow-hidden transition-all">
                    <div 
                      onClick={() => setExpandedStaff(isExpanded ? null : staff)}
                      className="p-4 flex items-center justify-between active:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 uppercase shrink-0 shadow-inner">
                          {staff.substring(0, 2)}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-200">{staff}</p>
                          <div className="flex gap-2 items-center mt-1">
                            <span className="text-[10px] font-black inline-block text-emerald-400">
                              Masuk: +{totalMasuk} Jam
                            </span>
                            <span className="text-slate-600">|</span>
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
                            className="p-2 text-slate-600 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="bg-[#0a0f1c] p-4 border-t border-white/5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {daysInMonth.map((day) => {
                          const data = getCellData(staff, day);
                          if (!data?.shiftType && !data?.hourDeduction) return null;
                          return (
                            <div 
                              key={day.toISOString()} 
                              onClick={() => isDeveloper && openCellModal(staff, day)}
                              className="bg-[#121b2f] p-2.5 rounded-xl border border-white/5 flex flex-col justify-center items-center text-center gap-1 active:scale-95 transition-transform"
                            >
                              <span className="text-[10px] font-bold text-slate-400">Tgl {day.getDate()}</span>
                              {data?.shiftType && (
                                <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${getShiftColor(data.shiftType)}`}>
                                  {data.shiftType}
                                </div>
                              )}
                              {(data?.hourDeduction !== 0 && data?.hourDeduction !== undefined) && (
                                <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${data.hourDeduction > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                                  {data.hourDeduction > 0 ? '+' : ''}{data.hourDeduction} Jam
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {daysInMonth.every(day => !getCellData(staff, day)?.shiftType && !getCellData(staff, day)?.hourDeduction) && (
                          <div className="col-span-full text-center text-[10px] text-slate-500 py-2">
                            Belum ada entri jadwal bulan ini
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
      <div className="hidden md:block glass-card rounded-[32px] border-white/10 overflow-hidden relative z-10 group/table">
        
        {/* Frozen Header for Month & Year */}
        <div className="bg-[#0f172a]/80 p-4 text-center border-b border-white/10 shadow-inner sticky top-0 z-40">
          <span className="text-2xl font-black text-white tracking-widest uppercase">{formatMonth(currentDate)}</span>
        </div>

        {/* Scroll Buttons */}
        <button 
          onClick={() => scrollByAmount(-400)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-30 p-2 bg-indigo-600/80 hover:bg-indigo-500 text-white rounded-r-2xl shadow-lg opacity-0 group-hover/table:opacity-100 transition-opacity backdrop-blur-md"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
        <button 
          onClick={() => scrollByAmount(400)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-30 p-2 bg-indigo-600/80 hover:bg-indigo-500 text-white rounded-l-2xl shadow-lg opacity-0 group-hover/table:opacity-100 transition-opacity backdrop-blur-md"
        >
          <ChevronRight className="w-8 h-8" />
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
              <tr className="bg-[#0f172a]/60">
                <th className="sticky left-0 z-20 bg-[#121b2f] border-b border-r border-white/10 p-3 md:p-4 min-w-[130px] md:min-w-[200px] shadow-[4px_0_12px_rgba(0,0,0,0.3)]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest truncate">Nama Staf</span>
                    {isDeveloper && (
                      <div className="flex gap-1">
                        <button 
                          onClick={() => setIsFastInputModalOpen(true)}
                          className="p-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 rounded-lg transition-colors flex items-center gap-1"
                          title="Fast Input (Excel)"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setIsStaffModalOpen(true)}
                          className="p-1.5 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 rounded-lg transition-colors"
                          title="Tambah Staf"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </th>
                <th className="md:sticky md:left-[200px] md:z-20 bg-[#121b2f] border-b border-r border-white/10 p-2 md:p-4 min-w-[100px] md:min-w-[140px] md:shadow-[4px_0_12px_rgba(0,0,0,0.3)]">
                  <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Semua Bulan</span>
                </th>
                {daysInMonth.map((day) => (
                  <th 
                    key={day.toISOString()} 
                    className={`border-b border-white/10 p-2 md:p-3 min-w-[80px] md:min-w-[100px] text-center ${getDayColor(day.getDay())}`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1 opacity-70">
                      {day.toLocaleDateString('id-ID', { weekday: 'short' })}
                    </div>
                    <div className="text-lg font-black">{day.getDate()}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staffNames.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth.length + 1} className="p-8 text-center text-slate-500">
                    Belum ada data staf. {isDeveloper && "Silakan tambah staf terlebih dahulu."}
                  </td>
                </tr>
              ) : (
                staffNames.map((staff) => (
                  <tr key={staff} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                    <td className="sticky left-0 z-20 bg-[#121b2f] group-hover:bg-[#162038] border-r border-white/10 p-3 md:p-4 shadow-[4px_0_12px_rgba(0,0,0,0.3)] transition-colors">
                      <div className="flex items-center justify-between gap-1 md:gap-2">
                        <div className="flex items-center gap-2 md:gap-3">
                          <div className="hidden md:flex w-8 h-8 rounded-full bg-slate-800 border border-slate-700 items-center justify-center text-xs font-bold text-slate-300 uppercase shrink-0">
                            {staff.substring(0, 2)}
                          </div>
                          <span className="font-semibold text-[11px] md:text-sm text-slate-200 truncate max-w-[80px] md:max-w-none">{staff}</span>
                        </div>
                        {isDeveloper && (
                          <button 
                            onClick={() => handleDeleteStaff(staff)}
                            className="p-1.5 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-rose-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="md:sticky md:left-[200px] md:z-20 bg-[#121b2f] group-hover:bg-[#162038] border-r border-white/10 p-2 md:p-3 md:shadow-[4px_0_12px_rgba(0,0,0,0.3)] transition-colors text-center">
                      <div className="flex flex-col gap-1 items-center justify-center">
                        <div className="text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap w-full">
                          Masuk: +{parseFloat((allTimeSchedules.filter(s => s.staffName === staff && (s.hourDeduction || 0) > 0).reduce((sum, s) => sum + (s.hourDeduction || 0), 0)).toFixed(2))} Jam
                        </div>
                        <div className="text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap w-full">
                          Potong: {parseFloat((allTimeSchedules.filter(s => s.staffName === staff && (s.hourDeduction || 0) < 0).reduce((sum, s) => sum + (s.hourDeduction || 0), 0)).toFixed(2))} Jam
                        </div>
                      </div>
                    </td>
                    {daysInMonth.map((day) => {
                      const data = getCellData(staff, day);
                      return (
                        <td 
                          key={day.toISOString()} 
                          className={`p-2 border-r border-white/5 relative ${isDeveloper ? 'cursor-pointer hover:bg-white/5' : ''} transition-colors group/cell`}
                          onClick={() => isDeveloper && openCellModal(staff, day)}
                        >
                          <div className="min-h-[50px] md:min-h-[60px] flex flex-col justify-center gap-1">
                            {data?.shiftType && (
                              <div className={`text-[9px] md:text-[10px] font-bold px-1 md:px-2 py-1 rounded border text-center whitespace-nowrap ${getShiftColor(data.shiftType)}`}>
                                {data.shiftType}
                              </div>
                            )}
                            
                            {(data?.hourDeduction !== 0 && data?.hourDeduction !== undefined) && (
                              <div className={`text-[9px] md:text-[10px] font-bold px-1 md:px-1.5 py-0.5 rounded text-center border ${data.hourDeduction > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                                {data.hourDeduction > 0 ? '+' : ''}{data.hourDeduction} Jam
                              </div>
                            )}

                            {!data?.shiftType && !data?.hourDeduction && isDeveloper && (
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                <Plus className="w-4 h-4 text-slate-500" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <button 
              onClick={() => setIsStaffModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-white/5 rounded-full"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-xl font-black text-white mb-6">Tambah Staf Baru</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 mb-2 block">Nama Staf</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Masukkan nama staf..."
                    onKeyDown={(e) => e.key === 'Enter' && handleAddStaff()}
                  />
                </div>
              </div>
              <button 
                onClick={handleAddStaff}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl transition-all shadow-xl shadow-indigo-900/20 uppercase tracking-widest text-xs"
              >
                Simpan Staf
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fast Input Excel Modal */}
      {isFastInputModalOpen && isDeveloper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-3xl p-6 shadow-2xl relative flex flex-col max-h-[90vh]">
            <button 
              onClick={() => setIsFastInputModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-white/5 rounded-full"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-xl font-black text-white mb-2">Fast Input dari Excel</h3>
            <p className="text-xs text-slate-400 mb-4">
              Copy kolom dari Spreadsheet/Excel (Format baris: Nama Staf, lalu shift Tanggal 1, shift Tanggal 2, dst) lalu Paste ke kotak di bawah. Atau Anda bisa mengunduh template dan mengimport filenya langsung.
              <br/><br/>
              <b>Cara Input Potongan Jam:</b><br/>
              • Shift & Potongan: <code>Pagi, -1.5</code> atau <code>Siang, 2</code><br/>
              • Hanya Potongan: <code>-1.5</code><br/>
              • Hanya Shift: <code>Pagi</code>
            </p>

            <div className="flex flex-wrap gap-3 mb-4">
              <button 
                onClick={handleDownloadTemplate}
                className="px-4 py-2.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-xl transition-colors text-xs font-bold border border-indigo-500/30 flex items-center gap-2"
              >
                Unduh Template Excel
              </button>
              
              <div className="relative overflow-hidden inline-block">
                <button className="px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-xl transition-colors text-xs font-bold border border-emerald-500/30 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" /> Import File Excel / Drag & Drop
                </button>
                <input 
                  type="file" 
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  title="Klik untuk memilih file Excel atau Drag & Drop ke sini"
                />
              </div>
            </div>
            
            <div className="flex-1 min-h-[300px] mb-4">
              <textarea
                value={fastInputData}
                onChange={(e) => setFastInputData(e.target.value)}
                className="w-full h-full p-4 bg-[#121b2f] border border-white/10 rounded-xl text-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-mono whitespace-pre"
                placeholder={`Contoh Format Copy-Paste dari Excel:\nJohn Doe\tPagi\tSiang\tOff\tPagi\nJane Smith\tSiang\tPagi\tPagi\tCuti`}
              />
            </div>
            
            <button 
              onClick={handleFastInputSubmit}
              disabled={isProcessingFastInput}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-xl shadow-emerald-900/20 uppercase tracking-widest text-xs flex justify-center items-center gap-2"
            >
              {isProcessingFastInput ? (
                <>Menyimpan Data...</>
              ) : (
                <><FileSpreadsheet className="w-4 h-4" /> Proses & Simpan Jadwal</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Edit Cell Modal */}
      {editingCell && isDeveloper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-sm p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setEditingCell(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-white/5 rounded-full"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="mb-6">
              <h3 className="text-lg font-black text-white">Edit Jadwal</h3>
              <p className="text-xs text-indigo-300 font-medium mt-1">
                {editingCell.staff} • {new Date(editingCell.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 mb-2 block">Status / Shift</label>
                <select
                  value={editForm.shiftType}
                  onChange={(e) => setEditForm(prev => ({ ...prev, shiftType: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-indigo-500"
                >
                  <option value="" className="bg-slate-900">- Kosongkan -</option>
                  {SHIFT_TYPES.filter(t => t !== '').map(type => (
                    <option key={type} value={type} className="bg-slate-900">{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 mb-2 block">Potongan Jam (Lembur / Cepat)</label>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="number"
                    value={editForm.hourDeduction || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, hourDeduction: parseFloat(e.target.value) || 0 }))}
                    className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-indigo-500"
                    placeholder="Contoh: 1 atau -1"
                    step="0.5"
                  />
                </div>
                <p className="text-[9px] text-slate-500 mt-1.5 px-1">Gunakan minus (-) untuk pulang cepat, plus (+) untuk lembur.</p>
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  onClick={handleSaveCell}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Simpan
                </button>
                <button 
                  onClick={() => {
                    setEditForm({ shiftType: '', hourDeduction: 0 });
                  }}
                  className="px-4 py-3 bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-white/10 hover:border-rose-500/20 font-bold rounded-xl transition-all"
                  title="Hapus / Kosongkan"
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
