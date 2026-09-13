import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { auth } from './firebase';
import { FirestoreErrorInfo, OperationType } from './types';

/**
 * Normalizes date from Firestore (handles Timestamp, Date, or String)
 */
export function normalizeDate(val: any): string {
  if (val === undefined || val === null || val === '') return '';

  // 1. If it's a numeric Excel Serial Date (either number or numeric string like "46233.29180555556" or 46233)
  const num = Number(val);
  if (!isNaN(num) && num > 25000 && num < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const dateObj = new Date(excelEpoch.getTime() + num * 86400000);
    const year = dateObj.getUTCFullYear();
    const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  let dateObj: Date;
  if (val && typeof val.toDate === 'function') {
    dateObj = val.toDate();
  } else if (val instanceof Date) {
    dateObj = val;
  } else if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return '';

    // Check string representation of Excel serial date
    const numMatch = trimmed.match(/^(\d{5}(?:\.\d+)?)$/);
    if (numMatch) {
      const serialNum = Number(numMatch[1]);
      if (!isNaN(serialNum) && serialNum > 25000 && serialNum < 60000) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const dateObj = new Date(excelEpoch.getTime() + serialNum * 86400000);
        const year = dateObj.getUTCFullYear();
        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }

    // Format DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }
    // Format YYYY-MM-DD
    const ymdMatch = trimmed.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (ymdMatch) {
      return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
    }
    // Format D/M/YYYY (no leading zeros)
    const parts = trimmed.split(/[\/-]/);
    if (parts.length === 3) {
      if (parts[2].length >= 4) {
         return `${parts[2].slice(0, 4)}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      if (parts[0].length === 4) {
         return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
    }
    return trimmed;
  } else {
    return String(val);
  }
  
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Notice: ', JSON.stringify(errInfo));
  // Only throw on explicit write/delete user action, not on passive background read/list
  if (operationType === OperationType.CREATE || operationType === OperationType.UPDATE || operationType === OperationType.DELETE) {
    throw new Error(errInfo.error);
  }
}
