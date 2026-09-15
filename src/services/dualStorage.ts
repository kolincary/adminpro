import { collection, doc, setDoc, updateDoc, deleteDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { supabase } from '../supabaseClient';
import { Report } from '../types';
import { format, subDays, isAfter, parseISO } from 'date-fns';
import { getCleanAnalis, getCleanInvoice, normalizeDate } from '../utils';

/**
 * Normalizes any date input to yyyy-MM-dd string
 */
export const normalizeDateStr = (d: any): string => {
  if (!d) return format(new Date(), 'yyyy-MM-dd');
  return normalizeDate(d) || format(new Date(), 'yyyy-MM-dd');
};

/**
 * Returns true if date is within the rolling 7-day window (today down to 7 days ago)
 */
export const isWithin7Days = (dateStr: string): boolean => {
  try {
    const targetDate = parseISO(normalizeDateStr(dateStr));
    const sevenDaysAgo = subDays(new Date(), 8); // 7 full days buffer
    return isAfter(targetDate, sevenDaysAgo);
  } catch {
    return true;
  }
};

/**
 * Dual-Write: Save new Report to Firestore (Permanent) AND Supabase (7-Day Rolling Cache)
 */
export async function saveReportDual(itemData: Partial<Report> & Record<string, any>): Promise<string> {
  const docRef = doc(collection(db, 'reports'));
  const id = docRef.id;
  const dateStr = normalizeDateStr(itemData.inputDate || itemData.date || itemData.logDate);
  const nowIso = new Date().toISOString();

  // 1. Simpan ke Firebase Firestore (Permanent Lifetime Storage)
  const invoiceNumber = getCleanInvoice(itemData);
  const cleanAnalis = getCleanAnalis(itemData);
  const type = itemData.type || 'Standard';
  const gineeInputDate = itemData.gineeInputDate || itemData.ginee_input_date || null;
  const assetStatus = itemData.assetStatus || itemData.asset_status || itemData.status || '';

  const firestorePayload = {
    ...itemData,
    id,
    invoiceNumber,
    picGinee: cleanAnalis,
    analis: cleanAnalis,
    type,
    gineeInputDate,
    assetStatus,
    inputDate: dateStr,
    date: dateStr,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(docRef, firestorePayload);

  // 2. Simpan ke Supabase reports jika dalam rentang 7 hari (atau biarkan DB trigger yang membersihkan)
  try {
    const supabasePayload = {
      id,
      barcode: itemData.barcode || invoiceNumber || '',
      invoice_number: invoiceNumber,
      pic_ginee: cleanAnalis,
      analis: cleanAnalis,
      type: type,
      ginee_input_date: gineeInputDate,
      asset_status: assetStatus,
      nama_barang: itemData.itemDescription || itemData.nama_barang || itemData.item_name || '',
      item_name: itemData.itemDescription || itemData.nama_barang || itemData.item_name || '',
      sku: itemData.sku || itemData.item_code || '',
      qty: Number(itemData.quantity || itemData.qty || 1),
      quantity: Number(itemData.quantity || itemData.qty || 1),
      status: itemData.status || assetStatus || '',
      modul_fisik: itemData.modul_fisik || itemData.status || assetStatus || '',
      category: itemData.category || '',
      marketplace: itemData.marketplace || 'Umum',
      pic: cleanAnalis,
      keterangan: itemData.keterangan || itemData.notes || itemData.itemDescription || '',
      notes: itemData.notes || itemData.keterangan || '',
      date: dateStr,
      input_date: dateStr,
      image_url: itemData.image_url || itemData.imageUrl || '',
      user_id: itemData.userId || itemData.user_id || '',
      user_email: itemData.userEmail || itemData.user_email || '',
      created_by: itemData.createdBy || itemData.created_by || '',
      created_at: nowIso,
      updated_at: nowIso
    };

    const { error } = await supabase
      .from('reports')
      .upsert(supabasePayload, { onConflict: 'id' });

    if (error) {
      console.warn("Supabase dual-save notice (non-fatal):", error.message);
    }
  } catch (sbErr) {
    console.warn("Supabase dual-save catch notice:", sbErr);
  }

  return id;
}

/**
 * Dual-Write: Update Report in Firestore AND Supabase
 */
export async function updateReportDual(id: string, updateData: Partial<Report> & Record<string, any>): Promise<void> {
  const nowIso = new Date().toISOString();

  // 1. Update di Firestore
  try {
    const docRef = doc(db, 'reports', id);
    await updateDoc(docRef, {
      ...updateData,
      updatedAt: serverTimestamp()
    });
  } catch (fsErr) {
    console.error("Firestore update error:", fsErr);
    throw fsErr;
  }

  // 2. Update di Supabase
  try {
    const supabaseUpdate: Record<string, any> = {
      updated_at: nowIso
    };

    if (updateData.barcode !== undefined) supabaseUpdate.barcode = updateData.barcode;
    if (updateData.invoiceNumber !== undefined || updateData.invoice_number !== undefined || updateData.referensi_invoice !== undefined) {
      supabaseUpdate.invoice_number = getCleanInvoice(updateData);
    }
    if (updateData.picGinee !== undefined || updateData.pic_ginee !== undefined || updateData.analis !== undefined || updateData.pic !== undefined) {
      const p = getCleanAnalis(updateData);
      supabaseUpdate.pic_ginee = p;
      supabaseUpdate.analis = p;
      supabaseUpdate.pic = p;
    }
    if (updateData.type !== undefined) {
      supabaseUpdate.type = updateData.type;
    }
    if (updateData.gineeInputDate !== undefined || updateData.ginee_input_date !== undefined) {
      supabaseUpdate.ginee_input_date = updateData.gineeInputDate || updateData.ginee_input_date || null;
    }
    if (updateData.assetStatus !== undefined || updateData.asset_status !== undefined) {
      supabaseUpdate.asset_status = updateData.assetStatus || updateData.asset_status;
    }
    if (updateData.itemDescription !== undefined) {
      supabaseUpdate.nama_barang = updateData.itemDescription;
      supabaseUpdate.item_name = updateData.itemDescription;
    }
    if (updateData.sku !== undefined) supabaseUpdate.sku = updateData.sku;
    if (updateData.quantity !== undefined || updateData.qty !== undefined) {
      const q = Number(updateData.quantity || updateData.qty || 1);
      supabaseUpdate.qty = q;
      supabaseUpdate.quantity = q;
    }
    if (updateData.status !== undefined) supabaseUpdate.status = updateData.status;
    if (updateData.modul_fisik !== undefined) supabaseUpdate.modul_fisik = updateData.modul_fisik;
    if (updateData.category !== undefined) supabaseUpdate.category = updateData.category;
    if (updateData.marketplace !== undefined) supabaseUpdate.marketplace = updateData.marketplace;
    if (updateData.keterangan !== undefined) supabaseUpdate.keterangan = updateData.keterangan;
    if (updateData.inputDate !== undefined || updateData.date !== undefined) {
      const d = normalizeDateStr(updateData.inputDate || updateData.date);
      supabaseUpdate.date = d;
      supabaseUpdate.input_date = d;
    }

    const { error } = await supabase
      .from('reports')
      .update(supabaseUpdate)
      .eq('id', id);

    if (error) {
      console.warn("Supabase dual-update notice:", error.message);
    }
  } catch (sbErr) {
    console.warn("Supabase dual-update catch notice:", sbErr);
  }
}

/**
 * Dual-Write: Delete Report from Firestore AND Supabase
 */
export async function deleteReportDual(id: string): Promise<void> {
  // 1. Delete from Firestore
  try {
    await deleteDoc(doc(db, 'reports', id));
  } catch (fsErr) {
    console.error("Firestore delete error:", fsErr);
    throw fsErr;
  }

  // 2. Delete from Supabase
  try {
    const { error } = await supabase
      .from('reports')
      .delete()
      .eq('id', id);

    if (error) {
      console.warn("Supabase dual-delete notice:", error.message);
    }
  } catch (sbErr) {
    console.warn("Supabase dual-delete catch notice:", sbErr);
  }
}

/**
 * Bulk Dual-Write: Batch Save to Firestore and Supabase
 */
export async function saveReportsBulkDual(items: Array<Partial<Report> & Record<string, any>>): Promise<number> {
  let count = 0;
  for (const item of items) {
    try {
      await saveReportDual(item);
      count++;
    } catch (e) {
      console.error("Error bulk saving item:", e);
    }
  }
  return count;
}

export interface SyncProgress {
  current: number;
  total: number;
  percent: number;
  stage: string;
}

/**
 * 7-Day Rolling Sync: Syncs Firestore records from the last 7 days into Supabase
 */
export async function syncLast7DaysToSupabase(
  onProgress?: (progress: SyncProgress) => void
): Promise<{ totalSynced: number; totalRecords: number }> {
  const sevenDaysAgoStr = format(subDays(new Date(), 7), 'yyyy-MM-dd');
  
  onProgress?.({
    current: 0,
    total: 0,
    percent: 5,
    stage: 'Membaca data laporan 7 hari terakhir dari Firebase Firestore...'
  });

  // Ambil data Firestore dari 7 hari terakhir (dari koleksi reports dan transactions)
  const [snapReports, snapTransactions] = await Promise.all([
    getDocs(collection(db, 'reports')),
    getDocs(collection(db, 'transactions'))
  ]);

  const rows: any[] = [];
  const seenIds = new Set<string>();

  const processDoc = (docSnap: any) => {
    if (seenIds.has(docSnap.id)) return;
    seenIds.add(docSnap.id);

    const d = docSnap.data();
    const dateStr = normalizeDateStr(d.inputDate || d.date || d.logDate || d.tanggal || d.tanggal_log || d.timestamp);
    const invoiceNumber = getCleanInvoice(d);
    const cleanAnalis = getCleanAnalis(d);
    const rawStatus = d.status || d.assetStatus || d.modul_fisik || '';
    const type = d.type || (rawStatus.toUpperCase().includes('COD') ? 'COD' : 'Standard');
    const gineeInputDate = d.gineeInputDate || d.ginee_input_date || d.tgl_input_ginee || null;
    const assetStatus = d.assetStatus || d.asset_status || rawStatus;
    
    // Hanya ambil data dalam rentang 7 hari terakhir
    if (dateStr >= sevenDaysAgoStr) {
      rows.push({
        id: docSnap.id,
        barcode: d.barcode || invoiceNumber || '',
        invoice_number: invoiceNumber,
        pic_ginee: cleanAnalis,
        analis: cleanAnalis,
        type: type,
        ginee_input_date: gineeInputDate,
        asset_status: assetStatus,
        nama_barang: d.itemDescription || d.nama_barang || d.item_name || d.product_name || '',
        item_name: d.itemDescription || d.nama_barang || d.item_name || d.product_name || '',
        sku: d.sku || d.sku_id || d.item_code || d.msku || '',
        qty: Number(d.quantity || d.qty || d.jumlah || 1),
        quantity: Number(d.quantity || d.qty || d.jumlah || 1),
        status: rawStatus,
        modul_fisik: d.modul_fisik || rawStatus,
        category: d.category || '',
        marketplace: d.marketplace || d.pasar || 'Umum',
        pic: cleanAnalis,
        keterangan: d.keterangan || d.notes || d.itemDescription || '',
        notes: d.notes || d.keterangan || '',
        date: dateStr,
        input_date: dateStr,
        image_url: d.image_url || d.imageUrl || '',
        user_id: d.userId || d.user_id || '',
        user_email: d.userEmail || d.user_email || '',
        created_by: d.createdBy || d.created_by || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  };

  snapReports.forEach(processDoc);
  snapTransactions.forEach(processDoc);

  const totalRows = rows.length;
  if (totalRows === 0) {
    onProgress?.({
      current: 0,
      total: 0,
      percent: 100,
      stage: 'Tidak ada data laporan dalam rentang 7 hari terakhir di Firestore.'
    });
    return { totalSynced: 0, totalRecords: 0 };
  }

  onProgress?.({
    current: 0,
    total: totalRows,
    percent: 15,
    stage: `Ditemukan ${totalRows} data. Mengosongkan cache lama Supabase agar sinkronisasi bersih...`
  });

  // Hapus bersih data lama di Supabase reports sebelum menyinkronkan data baru
  try {
    await supabase
      .from('reports')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (cleanErr) {
    console.warn("Clean supabase reports warning:", cleanErr);
  }

  // Batch upsert ke Supabase
  let successCount = 0;
  const batchSize = 50; // batch size 50 untuk update progress yang responsif dan mulus
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('reports')
      .upsert(chunk, { onConflict: 'id' });

    if (!error) {
      successCount += chunk.length;
    } else {
      console.error("Supabase sync batch error:", error);
    }

    const currentProcessed = Math.min(i + chunk.length, totalRows);
    const percent = Math.min(98, Math.round(15 + (currentProcessed / totalRows) * 80));
    onProgress?.({
      current: currentProcessed,
      total: totalRows,
      percent,
      stage: `Mengunggah ke Supabase: ${currentProcessed} / ${totalRows} data (${percent}%)...`
    });
  }

  onProgress?.({
    current: totalRows,
    total: totalRows,
    percent: 100,
    stage: `Sinkronisasi selesai! ${successCount} data berhasil disinkronkan ke Supabase.`
  });

  return { totalSynced: successCount, totalRecords: totalRows };
}
