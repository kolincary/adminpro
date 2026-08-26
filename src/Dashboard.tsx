import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Report, DashboardStats } from './types';
import { Package, ShoppingBag, TrendingUp, AlertCircle, RefreshCcw } from 'lucide-react';

interface DashboardProps {
  stats?: DashboardStats;
  reports?: Report[]; // Fallback if stats not provided
}

export default function Dashboard({ stats: remoteStats, reports = [] }: DashboardProps) {
  const [isSyncing, setIsSyncing] = React.useState(false);

  const stats = useMemo(() => {
    if (remoteStats) {
      const pieData = Object.keys(remoteStats.marketplaceData).map(key => ({
        name: key,
        value: remoteStats.marketplaceData[key]
      }));

      const barData = Object.keys(remoteStats.dailyTrend)
        .sort()
        .map(date => ({
          date: date.split('-').slice(1).join('/'),
          qty: remoteStats.dailyTrend[date]
        }));

      return { ...remoteStats, pieData, barData };
    }

    // Fallback calculation (legacy)
    const totalQty = reports.reduce((acc, curr) => acc + curr.quantity, 0);
    const totalInvoices = reports.length;
    const uniqueSkus = new Set(reports.map(r => r.sku)).size;
    const canceledResi = reports.filter(r => r.status?.toLowerCase()?.includes('cancel')).length;

    // Marketplace Distribution
    const marketplaceData = reports.reduce((acc: any, curr) => {
      acc[curr.marketplace] = (acc[curr.marketplace] || 0) + 1;
      return acc;
    }, {});

    const pieData = Object.keys(marketplaceData).map(key => ({
      name: key,
      value: marketplaceData[key]
    }));

    // Daily Trend (Last 7 days)
    const dailyData = reports.reduce((acc: any, curr) => {
      const date = curr.inputDate;
      acc[date] = (acc[date] || 0) + curr.quantity;
      return acc;
    }, {});

    const barData = Object.keys(dailyData)
      .sort()
      .map(date => ({
        date: date.split('-').slice(1).join('/'),
        qty: dailyData[date]
      }));

    return { totalQty, totalInvoices, uniqueSkus, canceledResi, pieData, barData };
  }, [remoteStats, reports]);

  const COLORS = ['#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#6366f1'];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-card p-8 rounded-[32px] flex items-center gap-6 group hover:translate-y-[-4px] transition-all">
          <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400 border border-indigo-500/20 shadow-lg shadow-indigo-500/5 group-hover:scale-110 transition-transform">
            <TrendingUp className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-[0.15em] mb-1">Total Qty Fisik</p>
            <p className="text-3xl font-black text-white">{stats.totalQty.toLocaleString()}</p>
          </div>
        </div>

        <div className="glass-card p-8 rounded-[32px] flex items-center gap-6 group hover:translate-y-[-4px] transition-all">
          <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-500/5 group-hover:scale-110 transition-transform">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-[0.15em] mb-1">Total Invoice</p>
            <p className="text-3xl font-black text-white">{stats.totalInvoices.toLocaleString()}</p>
          </div>
          {remoteStats && (
            <button 
              onClick={async () => {
                if (window.confirm('Hitung ulang statistik dari server? Ini akan mensinkronkan jutaan data jika ada.')) {
                  setIsSyncing(true);
                  try {
                    const { recalculateStats } = await import('./stats');
                    await recalculateStats();
                    alert('Statistik berhasil diperbarui!');
                  } catch (error) {
                    console.error('Sync error:', error);
                    alert('Gagal memperbarui statistik. Silakan coba lagi.');
                  } finally {
                    setIsSyncing(false);
                  }
                }
              }}
              disabled={isSyncing}
              className={`ml-auto p-2 hover:bg-white/10 rounded-xl transition-all text-slate-500 hover:text-indigo-400 ${isSyncing ? 'cursor-not-allowed opacity-50' : ''}`}
              title="Sinkron Ulang Statistik"
            >
              <RefreshCcw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          )}
        </div>

        <div className="glass-card p-8 rounded-[32px] flex items-center gap-6 group hover:translate-y-[-4px] transition-all">
          <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-400 border border-amber-500/20 shadow-lg shadow-amber-500/5 group-hover:scale-110 transition-transform">
            <Package className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-[0.15em] mb-1">SKU Unik</p>
            <p className="text-3xl font-black text-white">{stats.uniqueSkus.toLocaleString()}</p>
          </div>
        </div>

        <div className="glass-card p-8 rounded-[32px] flex items-center gap-6 group hover:translate-y-[-4px] transition-all">
          <div className="w-14 h-14 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-400 border border-rose-500/20 shadow-lg shadow-rose-500/5 group-hover:scale-110 transition-transform">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-[0.15em] mb-1">Resi Batal</p>
            <p className="text-3xl font-black text-rose-400">{stats.canceledResi.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass-card p-8 rounded-[40px] border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[60px] rounded-full -mr-16 -mt-16" />
          <h3 className="text-sm font-bold text-slate-400 mb-8 uppercase tracking-[0.2em] flex items-center gap-3">
            <div className="w-2 h-2 bg-indigo-500 rounded-full" />
            Tren Qty Harian <span className="text-slate-600 font-medium">(7 Hari Terakhir)</span>
          </h3>
          <div className="h-[320px] w-full" style={{ minHeight: '320px', minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={stats.barData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)', color: '#fff' }}
                  itemStyle={{ color: '#fff', fontWeight: 700 }}
                />
                <Bar dataKey="qty" fill="url(#barGradient)" radius={[6, 6, 0, 0]} barSize={45}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={1} />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-8 rounded-[40px] border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/5 blur-[60px] rounded-full -mr-16 -mt-16" />
          <h3 className="text-sm font-bold text-slate-400 mb-8 uppercase tracking-[0.2em] flex items-center gap-3">
            <div className="w-2 h-2 bg-pink-500 rounded-full" />
            Distribusi Marketplace
          </h3>
          <div className="h-[320px] w-full flex flex-col md:flex-row items-center justify-center gap-8">
            <div className="w-full h-full md:w-3/5" style={{ minHeight: '260px', minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={stats.pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                  >
                    {stats.pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)', color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-4 w-full md:w-2/5 p-4 bg-white/5 rounded-3xl border border-white/5">
              {stats.pieData.map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full shadow-lg" style={{ backgroundColor: COLORS[index % COLORS.length], boxShadow: `0 0 10px ${COLORS[index % COLORS.length]}44` }} />
                    <span className="text-xs text-slate-300 font-bold tracking-wide group-hover:text-white transition-colors">{entry.name}</span>
                  </div>
                  <span className="text-xs font-black text-slate-500 group-hover:text-slate-300 transition-colors">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
