import { collection, doc, setDoc, updateDoc, deleteDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { supabase } from '../supabaseClient';
import { Report } from '../types';
import { format, subDays, isAfter, parseISO } from 'date-fns';

/**
 * Normalizes any date input to yyyy-MM-dd string
 */
export const normalizeDateStr = (d: any): string => {
  if (!d) return format(new Date(), 'yyyy-MM-dd');
  if (typeof d === 'string') {
    // If it's already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(d.trim())) return d.trim();
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) return format(parsed, 'yyyy-MM-dd');
  }
  if (d instanceof Date) return format(d, 'yyyy-MM-dd');
  if (typeof d?.toDate === 'function') return format(d.toDate(), 'yyyy-MM-dd');
  return format(new Date(), 'yyyy-MM-dd');
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
  const firestorePayload = {
    ...itemData,
    id,
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
      barcode: itemData.barcode || '',
      nama_barang: itemData.itemDescription || itemData.nama_barang || itemData.item_name || '',
      item_name: itemData.itemDescription || itemData.nama_barang || itemData.item_name || '',
      sku: itemData.sku || itemData.item_code || '',
      qty: Number(itemData.quantity || itemData.qty || 1),
      quantity: Number(itemData.quantity || itemData.qty || 1),
      status: itemData.status || '',
      modul_fisik: itemData.modul_fisik || itemData.status || '',
      category: itemData.category || '',
      marketplace: itemData.marketplace || 'Umum',
      pic: itemData.pic || itemData.createdBy || '',
      keterangan: itemData.keterangan || itemData.notes || '',
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
    if (updateData.pic !== undefined) supabaseUpdate.pic = updateData.pic;
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

/**
 * 7-Day Rolling Sync: Syncs Firestore records from the last 7 days into Supabase
 */
export async function syncLast7DaysToSupabase(): Promise<{ totalSynced: number }> {
  const sevenDaysAgoStr = format(subDays(new Date(), 7), 'yyyy-MM-dd');
  
  // Ambil data Firestore dari 7 hari terakhir
  const snapshot = await getDocs(collection(db, 'reports'));
  const rows: any[] = [];

  snapshot.forEach((docSnap) => {
    const d = docSnap.data();
    const dateStr = normalizeDateStr(d.inputDate || d.date || d.logDate);
    
    // Hanya ambil data dalam rentang 7 hari terakhir
    if (dateStr >= sevenDaysAgoStr) {
      rows.push({
        id: docSnap.id,
        barcode: d.barcode || '',
        nama_barang: d.itemDescription || d.nama_barang || d.item_name || '',
        item_name: d.itemDescription || d.nama_barang || d.item_name || '',
        sku: d.sku || d.item_code || '',
        qty: Number(d.quantity || d.qty || 1),
        quantity: Number(d.quantity || d.qty || 1),
        status: d.status || '',
        modul_fisik: d.modul_fisik || d.status || '',
        category: d.category || '',
        marketplace: d.marketplace || 'Umum',
        pic: d.pic || d.createdBy || '',
        keterangan: d.keterangan || d.notes || '',
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
  });

  // Hapus data lama di Supabase yang sudah > 7 hari
  await supabase
    .from('reports')
    .delete()
    .lt('date', sevenDaysAgoStr);

  // Batch upsert ke Supabase
  let successCount = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase
      .from('reports')
      .upsert(chunk, { onConflict: 'id' });

    if (!error) {
      successCount += chunk.length;
    } else {
      console.error("Supabase sync batch error:", error);
    }
  }

  return { totalSynced: successCount };
}
