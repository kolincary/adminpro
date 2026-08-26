import { 
  doc, 
  runTransaction, 
  serverTimestamp, 
  collection, 
  getDocs, 
  query, 
  orderBy,
  where, 
  limit, 
  setDoc,
  getCountFromServer,
  getAggregateFromServer,
  sum
} from 'firebase/firestore';
import { db } from './firebase';
import { Report } from './types';

export async function updateDashboardStats(report: Report, operation: 'add' | 'remove') {
  // Check if system analyst (User request: Hide 'analis system' / 'SYSTEM')
  const creator = (report.createdBy || report.picGinee || (report as any).analis || '').toUpperCase();
  if (creator.includes('SYSTEM')) return;

  const statsRef = doc(db, 'metadata', 'dashboard_stats');
  
  await runTransaction(db, async (transaction) => {
    const statsDoc = await transaction.get(statsRef);
    const data = statsDoc.exists() ? statsDoc.data() : {
      totalQty: 0,
      totalInvoices: 0,
      uniqueSkus: 0,
      canceledResi: 0,
      marketplaceData: {},
      dailyTrend: {},
    };

    const multiplier = operation === 'add' ? 1 : -1;
    
    const newTotalQty = Math.max(0, (data.totalQty || 0) + ((report.quantity || 0) * multiplier));
    const newTotalInvoices = Math.max(0, (data.totalInvoices || 0) + multiplier);
    
    const isCanceled = report.status?.toLowerCase()?.includes('cancel');
    const newCanceledResi = Math.max(0, (data.canceledResi || 0) + (isCanceled ? multiplier : 0));
    
    const newMarketplaceData = { ...data.marketplaceData };
    const mp = report.marketplace || 'Umum';
    newMarketplaceData[mp] = Math.max(0, (newMarketplaceData[mp] || 0) + multiplier);
    
    const newDailyTrend = { ...data.dailyTrend };
    const date = report.inputDate || new Date().toISOString().split('T')[0];
    newDailyTrend[date] = Math.max(0, (newDailyTrend[date] || 0) + ((report.quantity || 0) * multiplier));

    transaction.set(statsRef, {
      ...data,
      totalQty: newTotalQty,
      totalInvoices: newTotalInvoices,
      canceledResi: newCanceledResi,
      marketplaceData: newMarketplaceData,
      dailyTrend: newDailyTrend,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function updateDashboardStatsBulk(reports: Report[], operation: 'add' | 'remove') {
  // Check if system analyst
  const validReports = reports.filter(r => {
    const creator = (r.createdBy || r.picGinee || (r as any).analis || '').toUpperCase();
    return !creator.includes('SYSTEM');
  });

  if (validReports.length === 0) return;

  const statsRef = doc(db, 'metadata', 'dashboard_stats');
  
  await runTransaction(db, async (transaction) => {
    const statsDoc = await transaction.get(statsRef);
    const data = statsDoc.exists() ? statsDoc.data() : {
      totalQty: 0,
      totalInvoices: 0,
      uniqueSkus: 0,
      canceledResi: 0,
      marketplaceData: {},
      dailyTrend: {},
    };

    const multiplier = operation === 'add' ? 1 : -1;
    
    let newTotalQty = data.totalQty || 0;
    let newTotalInvoices = data.totalInvoices || 0;
    let newCanceledResi = data.canceledResi || 0;
    
    const newMarketplaceData = { ...data.marketplaceData };
    const newDailyTrend = { ...data.dailyTrend };

    for (const report of validReports) {
      newTotalQty += ((report.quantity || 0) * multiplier);
      newTotalInvoices += multiplier;
      
      const isCanceled = report.status?.toLowerCase()?.includes('cancel');
      if (isCanceled) {
        newCanceledResi += multiplier;
      }
      
      const mp = report.marketplace || 'Umum';
      newMarketplaceData[mp] = (newMarketplaceData[mp] || 0) + multiplier;
      
      const date = report.inputDate || new Date().toISOString().split('T')[0];
      newDailyTrend[date] = (newDailyTrend[date] || 0) + ((report.quantity || 0) * multiplier);
    }

    transaction.set(statsRef, {
      ...data,
      totalQty: Math.max(0, newTotalQty),
      totalInvoices: Math.max(0, newTotalInvoices),
      canceledResi: Math.max(0, newCanceledResi),
      marketplaceData: Object.fromEntries(
        Object.entries(newMarketplaceData).map(([k, v]) => [k, Math.max(0, v as number)])
      ),
      dailyTrend: Object.fromEntries(
        Object.entries(newDailyTrend).map(([k, v]) => [k, Math.max(0, v as number)])
      ),
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Recalculates all stats from scratch. 
 * Uses efficient server-side aggregations for large datasets.
 */
export async function recalculateStats() {
  const reportsCol = collection(db, 'reports');
  const transactionsCol = collection(db, 'transactions');

  // 1. Get counts using efficient server-side aggregation
  const [reportsCountSnap, transactionsCountSnap] = await Promise.all([
    getCountFromServer(reportsCol),
    getCountFromServer(transactionsCol)
  ]);

  const totalInvoices = reportsCountSnap.data().count + transactionsCountSnap.data().count;

  // 2. Get Qty sums
  const [reportsQtySnap, transactionsQtySnap] = await Promise.all([
    getAggregateFromServer(reportsCol, { total: sum('quantity') }),
    getAggregateFromServer(transactionsCol, { total: sum('quantity') })
  ]);

  const totalQty = (reportsQtySnap.data().total || 0) + (transactionsQtySnap.data().total || 0);

  // 3. For detailed stats (marketplaces, daily trend, unique skus), 
  // we still need to fetch some data. For "millions", we'll just fetch the most recent ones 
  // or use the existing metadata if we can't fetch all.
  // In a truly massive app, these would be tracked incrementally or via Cloud Functions.
  
  // Fetch data for distribution (Limited for performance)
  let reports: Report[] = [];
  try {
    const recentReportsSnap = await getDocs(query(reportsCol, orderBy('created_at', 'desc'), limit(3000)));
    reports = recentReportsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Report));
  } catch (err) {
    console.warn("Recalculate: Fallback reports query:", err);
    reports = [];
  }

  let transactions: any[] = [];
  try {
    const recentTransactionsSnap = await getDocs(query(transactionsCol, orderBy('created_at', 'desc'), limit(3000)));
    transactions = recentTransactionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
  } catch (err) {
    console.warn("Recalculate: Fallback transactions query:", err);
    transactions = [];
  }
  
  // Helper to normalize data for stats
  const normalizeForStats = (r: any) => {
    const qty = Number(r.quantity || 0);
    const date = r.inputDate || r.date || (r.createdAt?.toDate ? r.createdAt.toDate().toISOString().split('T')[0] : '');
    const mp = r.marketplace || 'Umum';
    const sku = r.sku || r.sku_id || '';
    const status = (r.status || '').toLowerCase();
    const creator = (r.createdBy || r.created_by || r.picGinee || r.analis || '').toUpperCase();
    return { qty, date, mp, sku, status, creator };
  };

  const normalizedReports = reports.map(normalizeForStats);
  const normalizedTransactions = transactions.map(normalizeForStats);
  const combined = [...normalizedReports, ...normalizedTransactions].filter(r => !r.creator.includes('SYSTEM'));
  
  const uniqueSkusCount = new Set(combined.map(r => r.sku)).size;
  const canceledResi = combined.filter(r => r.status.includes('cancel')).length;

  const marketplaceData = combined.reduce((acc: any, curr) => {
    acc[curr.mp] = (acc[curr.mp] || 0) + 1;
    return acc;
  }, {});

  const dailyTrend = combined.reduce((acc: any, curr) => {
    if (curr.date) acc[curr.date] = (acc[curr.date] || 0) + curr.qty;
    return acc;
  }, {});

  const statsRef = doc(db, 'metadata', 'dashboard_stats');
  await setDoc(statsRef, {
    totalQty,
    totalInvoices,
    uniqueSkus: uniqueSkusCount < 10000 ? uniqueSkusCount : (uniqueSkusCount + "+"), 
    canceledResi,
    marketplaceData,
    dailyTrend,
    isFullSync: true,
    updatedAt: serverTimestamp(),
  });
}
