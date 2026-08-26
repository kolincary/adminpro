import React, { useState } from 'react';
import { Clipboard, FileSpreadsheet, CheckCircle2, XCircle, Trash2, Copy, ArrowRightLeft, Search } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import Toast, { ToastType } from './Toast';

interface MatchResult {
  logistik: string;
  kurir: string;
  cancel: string;
  status: 'match' | 'logistik_only' | 'kurir_only' | 'cancel_only' | 'multi_match';
}

const DataMatcher: React.FC = () => {
  const [logistikInput, setLogistikInput] = useState('');
  const [kurirInput, setKurirInput] = useState('');
  const [cancelInput, setCancelInput] = useState('');
  const [results, setResults] = useState<MatchResult[]>([]);
  const [filter, setFilter] = useState<'all' | 'match' | 'logistik_only' | 'kurir_only' | 'cancel_only'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: ToastType }>({
    visible: false,
    message: '',
    type: 'success'
  });

  const showToast = (message: string, type: ToastType) => {
    setToast({ visible: true, message, type });
  };

  const processData = () => {
    const logistikLines = logistikInput.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
    const kurirLines = kurirInput.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
    const cancelLines = cancelInput.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');

    if (logistikLines.length === 0 && kurirLines.length === 0 && cancelLines.length === 0) {
      showToast('Masukkan data terlebih dahulu', 'error');
      return;
    }

    const allItems = Array.from(new Set([...logistikLines, ...kurirLines, ...cancelLines]));
    const logistikSet = new Set(logistikLines);
    const kurirSet = new Set(kurirLines);
    const cancelSet = new Set(cancelLines);
    
    const matched: MatchResult[] = [];

    allItems.forEach(item => {
      const inLogistik = logistikSet.has(item);
      const inKurir = kurirSet.has(item);
      const inCancel = cancelSet.has(item);

      let status: MatchResult['status'] = 'match';
      if (inLogistik && inKurir && !inCancel) status = 'match';
      else if (inLogistik && !inKurir && !inCancel) status = 'logistik_only';
      else if (!inLogistik && inKurir && !inCancel) status = 'kurir_only';
      else if (!inLogistik && !inKurir && inCancel) status = 'cancel_only';
      else status = 'multi_match';

      matched.push({
        logistik: inLogistik ? item : '',
        kurir: inKurir ? item : '',
        cancel: inCancel ? item : '',
        status
      });
    });

    setResults(matched);
    setFilter('all');
    showToast(`Berhasil memproses ${matched.length} data`, 'success');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Berhasil disalin ke clipboard', 'success');
  };

  const copyColumn = (type: 'logistik' | 'kurir' | 'cancel') => {
    const text = filteredResults
      .map(r => {
        if (type === 'logistik') return r.logistik;
        if (type === 'kurir') return r.kurir;
        return r.cancel;
      })
      .filter(t => t !== '')
      .join('\n');
    copyToClipboard(text);
  };

  const exportToExcel = () => {
    if (filteredResults.length === 0) {
      showToast('Tidak ada data untuk diekspor', 'error');
      return;
    }

    const data = filteredResults.map(r => ({
      'Data Logistik': r.logistik,
      'Data Kurir': r.kurir,
      'Data Cancel': r.cancel,
      'Status': r.status.toUpperCase().replace('_', ' ')
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hasil Pencocokan");
    
    const fileName = `Hasil_Match_${filter.toUpperCase()}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`Berhasil mengekspor ${filteredResults.length} data (${filter})`, 'success');
  };

  const clearAll = () => {
    setLogistikInput('');
    setKurirInput('');
    setCancelInput('');
    setResults([]);
    setFilter('all');
    setSearchTerm('');
    showToast('Data dibersihkan', 'success');
  };

  const filteredResults = results.filter(r => {
    const matchesFilter = filter === 'all' || r.status === filter || (filter === 'match' && r.status === 'multi_match');
    const matchesSearch = searchTerm === '' || 
      (r.logistik?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
      (r.kurir?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (r.cancel?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-900/20 border border-white/10">
            <ArrowRightLeft className="w-8 h-8 text-white" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-white tracking-tight text-shadow-sm">Pencocok Data Excel</h3>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">Sinkronisasi Logistik vs Kurir</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={clearAll}
            className="flex items-center gap-2 px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-rose-900/20 text-[10px] uppercase tracking-widest"
          >
            <Trash2 className="w-4 h-4" />
            Bersihkan
          </button>
          <button
            onClick={exportToExcel}
            disabled={results.length === 0}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white font-black rounded-2xl transition-all shadow-xl shadow-emerald-900/20 text-[10px] uppercase tracking-widest"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Ekspor Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-4">
          <div className="flex items-center justify-between px-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Data Scan Logistik</label>
            <span className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full">
              {logistikInput.split(/\n/).filter(l => l.trim()).length} Baris
            </span>
          </div>
          <textarea
            value={logistikInput}
            onChange={(e) => setLogistikInput(e.target.value)}
            placeholder="Tempel data logistik di sini..."
            className="w-full h-64 bg-[#0f172a] border border-white/10 rounded-3xl p-6 text-white text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none custom-scrollbar"
          />
        </div>

        <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-4">
          <div className="flex items-center justify-between px-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Data Scan Kurir</label>
            <span className="text-[10px] font-black text-violet-400 bg-violet-500/10 px-3 py-1 rounded-full">
              {kurirInput.split(/\n/).filter(l => l.trim()).length} Baris
            </span>
          </div>
          <textarea
            value={kurirInput}
            onChange={(e) => setKurirInput(e.target.value)}
            placeholder="Tempel data kurir di sini..."
            className="w-full h-64 bg-[#0f172a] border border-white/10 rounded-3xl p-6 text-white text-sm font-mono focus:ring-2 focus:ring-violet-500 outline-none transition-all resize-none custom-scrollbar"
          />
        </div>

        <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-4">
          <div className="flex items-center justify-between px-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Data Scan Cancel</label>
            <span className="text-[10px] font-black text-rose-400 bg-rose-500/10 px-3 py-1 rounded-full">
              {cancelInput.split(/\n/).filter(l => l.trim()).length} Baris
            </span>
          </div>
          <textarea
            value={cancelInput}
            onChange={(e) => setCancelInput(e.target.value)}
            placeholder="Tempel data cancel di sini..."
            className="w-full h-64 bg-[#0f172a] border border-white/10 rounded-3xl p-6 text-white text-sm font-mono focus:ring-2 focus:ring-rose-500 outline-none transition-all resize-none custom-scrollbar"
          />
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={processData}
          className="group relative px-12 py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-[32px] transition-all shadow-2xl shadow-indigo-900/40 text-xs uppercase tracking-[0.2em] flex items-center gap-4"
        >
          <ArrowRightLeft className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
          Mulai Pencocokan Data
        </button>
      </div>

      {results.length > 0 && (
        <div className="glass-card rounded-[48px] border-white/5 overflow-hidden shadow-2xl animate-in zoom-in duration-500">
          <div className="p-8 border-b border-white/5 space-y-6 bg-white/[0.02]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <Search className="w-6 h-6 text-indigo-400" />
                <h4 className="text-lg font-black text-white tracking-tight">Hasil Pencocokan</h4>
              </div>
              
              <div className="flex flex-wrap items-center gap-2 bg-[#0f172a] p-1.5 rounded-2xl border border-white/5">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'all' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Semua ({results.length})
                </button>
                <button
                  onClick={() => setFilter('match')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'match' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Match ({results.filter(r => r.status === 'match' || r.status === 'multi_match').length})
                </button>
                <button
                  onClick={() => setFilter('logistik_only')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'logistik_only' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Logistik Only ({results.filter(r => r.status === 'logistik_only').length})
                </button>
                <button
                  onClick={() => setFilter('kurir_only')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'kurir_only' ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/40' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Kurir Only ({results.filter(r => r.status === 'kurir_only').length})
                </button>
                <button
                  onClick={() => setFilter('cancel_only')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'cancel_only' ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Cancel Only ({results.filter(r => r.status === 'cancel_only').length})
                </button>
                
                <div className="w-px h-6 bg-white/10 mx-1" />
                
                <button
                  onClick={exportToExcel}
                  className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/20 flex items-center gap-2"
                  title="Ekspor Hasil Filter"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Ekspor {filter === 'all' ? 'Semua' : filter === 'match' ? 'Match' : filter === 'logistik_only' ? 'Logistik' : filter === 'kurir_only' ? 'Kurir' : 'Cancel'}
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari data spesifik..."
                className="w-full pl-12 pr-6 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#0f172a] border-b border-white/5">
                  <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                    <div className="flex items-center justify-between">
                      Logistik
                      <button onClick={() => copyColumn('logistik')} className="p-2 hover:bg-white/10 rounded-xl transition-all text-indigo-400" title="Salin Kolom">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                    <div className="flex items-center justify-between">
                      Kurir
                      <button onClick={() => copyColumn('kurir')} className="p-2 hover:bg-white/10 rounded-xl transition-all text-violet-400" title="Salin Kolom">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                    <div className="flex items-center justify-between">
                      Cancel
                      <button onClick={() => copyColumn('cancel')} className="p-2 hover:bg-white/10 rounded-xl transition-all text-rose-400" title="Salin Kolom">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-center w-40">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {filteredResults.map((res, idx) => (
                  <tr 
                    key={idx} 
                    className={`hover:bg-white/[0.04] transition-all group ${
                      res.status === 'logistik_only' ? 'bg-indigo-500/[0.02]' : 
                      res.status === 'kurir_only' ? 'bg-violet-500/[0.02]' : 
                      res.status === 'cancel_only' ? 'bg-rose-500/[0.02]' : ''
                    }`}
                  >
                    <td className="px-8 py-4 text-sm font-mono text-slate-300">
                      {res.logistik || <span className="text-slate-700 italic">---</span>}
                    </td>
                    <td className="px-8 py-4 text-sm font-mono text-slate-300">
                      {res.kurir || <span className="text-slate-700 italic">---</span>}
                    </td>
                    <td className="px-8 py-4 text-sm font-mono text-slate-300">
                      {res.cancel || <span className="text-slate-700 italic">---</span>}
                    </td>
                    <td className="px-8 py-4 text-center">
                      <div className="flex justify-center">
                        {res.status === 'match' ? (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 text-[9px] font-black uppercase tracking-widest">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Match
                          </div>
                        ) : res.status === 'multi_match' ? (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20 text-[9px] font-black uppercase tracking-widest">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Multi Match
                          </div>
                        ) : res.status === 'logistik_only' ? (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20 text-[9px] font-black uppercase tracking-widest">
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            Logistik
                          </div>
                        ) : res.status === 'kurir_only' ? (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 text-violet-400 rounded-full border border-violet-500/20 text-[9px] font-black uppercase tracking-widest">
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            Kurir
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 text-rose-400 rounded-full border border-rose-500/20 text-[9px] font-black uppercase tracking-widest">
                            <XCircle className="w-3.5 h-3.5" />
                            Cancel
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredResults.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-4 opacity-20">
                        <Search className="w-12 h-12 text-slate-500" />
                        <p className="text-sm font-black uppercase tracking-widest text-slate-500">Data tidak ditemukan</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Toast
        isVisible={toast.visible}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, visible: false }))}
      />
    </div>
  );
};

export default DataMatcher;
