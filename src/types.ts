export interface Report {
  id?: string;
  category: 'retur' | 'retur2' | 'stok_lt3' | 'rusak_internal' | 'eliminasi_rusak';
  type?: string;
  inputDate: string;
  gineeInputDate?: string;
  picGinee?: string;
  marketplace: string;
  invoiceNumber: string;
  status?: string;
  normalizedStatus?: string;
  assetStatus?: string;
  itemDescription?: string;
  sku: string;
  quantity: number;
  createdBy: string;
  createdAt: any; // Firestore Timestamp or serverTimestamp
  updatedAt?: any;
  _source?: string;
}

export interface Backup {
  id?: string;
  originalData: Report;
  deletedAt: any;
  deletedBy: string;
}

export interface AdminConfig {
  username: string;
  password: string; // This will be stored as a simple string for now as requested, though hashing is better.
  updatedAt: any;
}

export interface BlockedUser {
  email: string;
  blockedAt: any;
  blockedBy: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: 'admin' | 'staff';
}

export interface DailyOrder {
  id?: string;
  inputDate: string;
  inputTime: string;
  shopee: number;
  tiktok: number;
  lazada: number;
  tiktokHome: number;
  shopeeHome: number;
  blibli: number;
  total: number;
  createdBy: string;
  createdAt: any;
}

export interface DashboardStats {
  totalQty: number;
  totalInvoices: number;
  uniqueSkus: number;
  canceledResi: number;
  marketplaceData: Record<string, number>;
  dailyTrend: Record<string, number>;
  updatedAt: any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export interface StaffSchedule {
  id?: string;
  staffName: string;
  date: string; // YYYY-MM-DD
  shiftType: 'Pagi' | 'Siang' | 'Cover Pagi' | 'Cover Siang' | 'Cuti' | 'Off' | 'Cuti Sakit' | '';
  hourDeduction: number; // e.g., 1 (lembur), -1 (pulang cepat)
  salaryDeduction?: number; // in currency amount
  updatedAt?: any;
  updatedBy?: string;
}
