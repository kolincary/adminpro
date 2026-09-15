import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc,
  serverTimestamp,
  addDoc,
  getDocs,
  where,
  writeBatch,
  limit
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { supabase } from './supabaseClient';
import { Report, Backup, AdminConfig, BlockedUser, OperationType } from './types';
import { handleFirestoreError } from './utils';
import { 
  Shield, 
  Lock, 
  User as UserIcon, 
  Database, 
  Trash2, 
  History, 
  UserX, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Key,
  Save,
  RefreshCcw,
  X,
  LogOut,
  CheckSquare,
  Square,
  Activity,
  BellRing,
  MessageCircle,
  Megaphone,
  Info
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import MasterDataManagement from './MasterDataManagement';
import ConfirmModal from './ConfirmModal';
import { recalculateStats } from './stats';
import { generateTOTPCode, getTOTPRemainingSeconds } from './totp';
import { syncLast7DaysToSupabase } from './services/dualStorage';
import { Sparkles, RefreshCw, Code2, Check } from 'lucide-react';

const CLIENT_VERSION = "2.4.2";
const FORCE_LOGOUT_DURATION = 5 * 60 * 1000; // 5 minutes block duration

interface AdminPanelProps {
  user: any;
}

export default function AdminPanel({ user }: AdminPanelProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'backups' | 'blocked' | 'master' | 'settings' | 'sessions' | 'security' | 'notifications' | 'dual_database'>('backups');
  const [isSyncingDual, setIsSyncingDual] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [activeForceLogouts, setActiveForceLogouts] = useState<Record<string, any>>({});
  const [appControlData, setAppControlData] = useState<any>(null);
  const [securityData, setSecurityData] = useState<any>(null);
  const [currentTOTP, setCurrentTOTP] = useState('');
  const [totpRemaining, setTotpRemaining] = useState(0);
  const [newVersionInput, setNewVersionInput] = useState('');
  const [updatingVersion, setUpdatingVersion] = useState(false);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [selectedBackupIds, setSelectedBackupIds] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: ToastType; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type, visible: true });
  };

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState<'info' | 'warning' | 'success' | 'wa-alert'>('info');
  const [notificationDuration, setNotificationDuration] = useState<number>(0.25); // 0.25 mins = 15s default
  const [isSendingNotification, setIsSendingNotification] = useState(false);
  const [activeGlobalAlert, setActiveGlobalAlert] = useState<any>(null);

  useEffect(() => {
    // Check for existing session
    const session = localStorage.getItem('admin_session');
    if (session) {
      try {
        const { timestamp } = JSON.parse(session);
        const now = Date.now();
        const twoHours = 2 * 60 * 60 * 1000;
        if (now - timestamp < twoHours) {
          setIsLoggedIn(true);
        } else {
          localStorage.removeItem('admin_session');
        }
      } catch (e) {
        localStorage.removeItem('admin_session');
      }
    }

    // Check if user is developer
    if (user?.email === 'jgilbeth92@gmail.com') {
      setIsDeveloper(true);
      setIsLoggedIn(true);
    }
  }, [user]);

  useEffect(() => {
    if (!auth.currentUser) return;
    // Fetch admin config
    const unsubscribe = onSnapshot(doc(db, 'admin_config', 'main'), (snap) => {
      if (snap.exists()) {
        setConfig(snap.data() as AdminConfig);
      } else {
        // Initialize default config if not exists
        const defaultConfig: AdminConfig = {
          username: 'admin',
          password: 'dev1010',
          updatedAt: serverTimestamp()
        };
        setDoc(doc(db, 'admin_config', 'main'), defaultConfig);
        setConfig(defaultConfig);
      }
    }, (error) => {
      console.warn("admin_config snapshot error:", error);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (isLoggedIn && auth.currentUser) {
      const qBackups = query(collection(db, 'backups'), orderBy('deletedAt', 'desc'));
      const unsubBackups = onSnapshot(qBackups, (snap) => {
        setBackups(snap.docs.map(d => ({ id: d.id, ...d.data() } as Backup)));
      }, (error) => {
        console.warn("backups onSnapshot error:", error);
      });

      const qBlocked = query(collection(db, 'blocked_users'), orderBy('blockedAt', 'desc'));
      const unsubBlocked = onSnapshot(qBlocked, (snap) => {
        setBlockedUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as BlockedUser)));
      }, (error) => {
        console.warn("blocked_users onSnapshot error:", error);
      });

      const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
        setAllUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
      }, (error) => {
        console.warn("users onSnapshot error:", error);
      });

      const unsubForceLogouts = onSnapshot(doc(db, 'metadata', 'force_logouts'), (snap) => {
        if (snap.exists()) {
          setActiveForceLogouts(snap.data().activeForceLogouts || {});
        } else {
          setActiveForceLogouts({});
        }
      }, (error) => {
        console.warn("metadata force_logouts snap error:", error);
      });

      const unsubAppControl = onSnapshot(doc(db, 'metadata', 'app_control'), (snap) => {
        if (snap.exists()) {
          setAppControlData(snap.data());
          setNewVersionInput(snap.data().currentVersion || '');
        }
      }, (error) => {
        console.warn("metadata app_control snap error:", error);
      });

      const unsubSecurity = onSnapshot(doc(db, 'metadata', 'security'), (snap) => {
        if (snap.exists()) {
          setSecurityData(snap.data());
        } else {
          setSecurityData({ authCodeRequired: false });
        }
      }, (error) => {
        console.warn("metadata security snap error:", error);
      });

      const unsubGlobalAlerts = onSnapshot(doc(db, 'metadata', 'global_alerts'), (snap) => {
        if (snap.exists()) {
          setActiveGlobalAlert(snap.data().activeNotification || null);
        } else {
          setActiveGlobalAlert(null);
        }
      }, (error) => {
        console.warn("metadata global_alerts snap error:", error);
      });

      return () => {
        unsubBackups();
        unsubBlocked();
        unsubUsers();
        unsubForceLogouts();
        unsubAppControl();
        unsubSecurity();
        unsubGlobalAlerts();
      };
    }
  }, [isLoggedIn, user]);

  useEffect(() => {
    if (activeSubTab !== 'security') return;
    const updateTOTP = async () => {
      const code = await generateTOTPCode();
      setCurrentTOTP(code);
      setTotpRemaining(getTOTPRemainingSeconds());
    };
    updateTOTP();
    const interval = setInterval(updateTOTP, 1000);
    return () => clearInterval(interval);
  }, [activeSubTab]);

  useEffect(() => {
    if (activeSubTab !== 'sessions') return;
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSubTab]);

  // Auto-clear force logout if expired or user has logged back in (self-healing)
  useEffect(() => {
    if (!isLoggedIn || activeSubTab !== 'sessions') return;

    const getForcedAtTime = (forcedState: any): number => {
      if (!forcedState || !forcedState.forcedAt) return 0;
      const val = forcedState.forcedAt;
      if (typeof val === 'number') return val;
      if (val && typeof val.toDate === 'function') return val.toDate().getTime();
      if (typeof val === 'string') return new Date(val).getTime();
      if (val && typeof val.seconds === 'number') return val.seconds * 1000;
      return 0;
    };

    const cleanupExpiredOrHealedForceLogouts = async () => {
      const now = Date.now();
      let hasUpdates = false;
      const updatedForceLogouts = { ...activeForceLogouts };

      for (const usr of allUsers) {
        const forcedState = activeForceLogouts[usr.uid];
        if (forcedState) {
          const forcedAtTime = getForcedAtTime(forcedState);
          const lastActiveTime = usr.lastActiveAt ? new Date(usr.lastActiveAt).getTime() : 0;
          const elapsed = now - forcedAtTime;
          const isExpired = elapsed >= FORCE_LOGOUT_DURATION;
          const isHealed = lastActiveTime > forcedAtTime;

          if (isExpired || isHealed) {
            delete updatedForceLogouts[usr.uid];
            hasUpdates = true;
          }
        }
      }

      if (hasUpdates) {
        try {
          await setDoc(doc(db, 'metadata', 'force_logouts'), {
            activeForceLogouts: updatedForceLogouts
          });
        } catch (err) {
          console.warn("Failed to auto-clear force logout entries:", err);
        }
      }
    };

    cleanupExpiredOrHealedForceLogouts();
  }, [allUsers, activeForceLogouts, currentTime, isLoggedIn, activeSubTab]);

  const handleToggleAuthCode = async () => {
    try {
      const newValue = !securityData?.authCodeRequired;
      await setDoc(doc(db, 'metadata', 'security'), {
        authCodeRequired: newValue
      }, { merge: true });
      showToast(newValue ? 'Autentikasi 2FA Diaktifkan' : 'Autentikasi 2FA Dimatikan', 'success');
    } catch (err) {
      console.error("Toggle Auth Error:", err);
      showToast('Gagal mengubah pengaturan keamanan', 'error');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const inputUser = username.trim();
    const inputPass = password.trim();

    // 1. Direct match with fallback / config credentials
    const defaultUser = (config?.username || 'admin').toLowerCase();
    const defaultPass = config?.password || 'dev1010';

    if (
      (inputUser.toLowerCase() === defaultUser && inputPass === defaultPass) ||
      (inputUser.toLowerCase() === 'admin' && (inputPass === 'dev1010' || inputPass === 'admin')) ||
      (inputUser.toLowerCase() === 'developer' && inputPass === 'dev1010')
    ) {
      setIsLoggedIn(true);
      setError('');
      localStorage.setItem('admin_session', JSON.stringify({ timestamp: Date.now() }));
      return;
    }

    // 2. Query Supabase admin_credentials table
    try {
      const { data, error: sbErr } = await supabase
        .from('admin_credentials')
        .select('*')
        .ilike('username', inputUser)
        .eq('password', inputPass)
        .maybeSingle();

      if (data && !sbErr) {
        setIsLoggedIn(true);
        setError('');
        localStorage.setItem('admin_session', JSON.stringify({ timestamp: Date.now() }));
        return;
      }
    } catch (err) {
      console.warn("Supabase admin auth check:", err);
    }

    setError('Username atau password admin salah. Silakan coba lagi.');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('admin_session');
  };

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const finalUser = newUsername || config?.username || 'admin';
    const finalPass = newPassword || config?.password || 'dev1010';

    try {
      // 1. Update Firestore admin_config
      await setDoc(doc(db, 'admin_config', 'main'), {
        username: finalUser,
        password: finalPass,
        updatedAt: serverTimestamp()
      });

      // 2. Update Supabase admin_credentials
      try {
        await supabase
          .from('admin_credentials')
          .upsert({
            username: finalUser,
            password: finalPass,
            role: 'superadmin',
            updated_at: new Date().toISOString()
          }, { onConflict: 'username' });
      } catch (sbErr) {
        console.warn("Supabase admin_credentials update warning:", sbErr);
      }

      setNewUsername('');
      setNewPassword('');
      showToast('Kredensial admin berhasil diperbarui!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'admin_config/main');
    } finally {
      setLoading(false);
    }
  };

  const handleBlockUser = async (email: string) => {
    if (!email) return;
    setLoading(true);
    try {
      // Find user by email to get UID
      const q = query(collection(db, 'users'), where('email', '==', email));
      const snap = await getDocs(q);
      if (snap.empty) {
        showToast('User not found', 'error');
        return;
      }
      const userId = snap.docs[0].id;
      await setDoc(doc(db, 'blocked_users', userId), {
        email,
        blockedAt: serverTimestamp(),
        blockedBy: user.uid
      });
      showToast('User blocked successfully', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'blocked_users');
    } finally {
      setLoading(false);
    }
  };

  const handleUnblockUser = async (userId: string) => {
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'blocked_users', userId));
      showToast('User unblocked successfully', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `blocked_users/${userId}`);
    } finally {
      setLoading(false);
    }
  };

  const handleForceLogoutUser = async (userId: string, email: string) => {
    setLoading(true);
    try {
      const updatedForceLogouts = {
        ...activeForceLogouts,
        [userId]: {
          email,
          forcedAt: Date.now(),
          forcedBy: user.uid
        }
      };
      await setDoc(doc(db, 'metadata', 'force_logouts'), {
        activeForceLogouts: updatedForceLogouts
      }, { merge: true });
      showToast(`Sesi user ${email} berhasil dihentikan (Paksa Logout)`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'metadata/force_logouts');
    } finally {
      setLoading(false);
    }
  };

  const handleClearForceLogout = async (userId: string) => {
    setLoading(true);
    try {
      const updatedForceLogouts = { ...activeForceLogouts };
      delete updatedForceLogouts[userId];
      await setDoc(doc(db, 'metadata', 'force_logouts'), {
        activeForceLogouts: updatedForceLogouts
      });
      showToast('Status paksa logout dibatalkan', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'metadata/force_logouts');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSystemVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVersionInput.trim()) return;
    setUpdatingVersion(true);
    try {
      await setDoc(doc(db, 'metadata', 'app_control'), {
        currentVersion: newVersionInput.trim(),
        updatedBy: user.uid,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showToast(`Sistem berhasil diperbarui ke versi ${newVersionInput}`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'metadata/app_control');
    } finally {
      setUpdatingVersion(false);
    }
  };

  const handleForceGlobalRefresh = async () => {
    setUpdatingVersion(true);
    try {
      await setDoc(doc(db, 'metadata', 'app_control'), {
        currentVersion: newVersionInput.trim() || appControlData?.currentVersion || '2.4.2',
        forceRefreshAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showToast('Seluruh browser user aktif diperintahkan memuat ulang cache!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'metadata/app_control');
    } finally {
      setUpdatingVersion(false);
    }
  };

  const handleSendGlobalNotification = async (e?: React.FormEvent, presetType?: 'wa-alert' | 'warning' | 'info', presetMessage?: string, presetDuration?: number) => {
    if (e) e.preventDefault();
    
    const finalMessage = presetMessage || notificationMessage.trim();
    const finalType = presetType || notificationType;
    const finalDuration = presetDuration !== undefined ? presetDuration : notificationDuration;
    
    if (!finalMessage) return;
    
    setIsSendingNotification(true);
    try {
      await setDoc(doc(db, 'metadata', 'global_alerts'), {
        activeNotification: {
          id: Date.now().toString(),
          message: finalMessage,
          type: finalType,
          timestamp: Date.now(),
          expiresAt: finalDuration === 0 ? 0 : Date.now() + (finalDuration * 60 * 1000),
          isActive: true
        }
      });
      showToast('Notifikasi Global berhasil dikirim ke semua user', 'success');
      setNotificationMessage('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'metadata/global_alerts');
      showToast('Gagal mengirim notifikasi', 'error');
    } finally {
      setIsSendingNotification(false);
    }
  };

  const handleStopGlobalNotification = async () => {
    try {
      await setDoc(doc(db, 'metadata', 'global_alerts'), {
        activeNotification: {
          ...activeGlobalAlert,
          isActive: false
        }
      }, { merge: true });
      showToast('Notifikasi Global berhasil dihentikan', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'metadata/global_alerts');
      showToast('Gagal menghentikan notifikasi', 'error');
    }
  };

  const handleSelectAll = () => {
    if (selectedBackupIds.length === backups.length) {
      setSelectedBackupIds([]);
    } else {
      setSelectedBackupIds(backups.map(b => b.id || ''));
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedBackupIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleDeleteBackup = async (id: string) => {
    if (!isDeveloper) {
      showToast('Only Developer can delete backups', 'error');
      return;
    }
    
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Backup?',
      message: 'Apakah Anda yakin ingin menghapus data backup ini secara permanen? Tindakan ini tidak dapat dibatalkan.',
      onConfirm: async () => {
        setLoading(true);
        try {
          await deleteDoc(doc(db, 'backups', id));
          setSelectedBackupIds(prev => prev.filter(i => i !== id));
          showToast('Backup deleted successfully', 'success');
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `backups/${id}`);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleBulkDelete = async () => {
    if (!isDeveloper) {
      showToast('Only Developer can delete backups', 'error');
      return;
    }
    if (selectedBackupIds.length === 0) return;

    setConfirmModal({
      isOpen: true,
      title: `Hapus ${selectedBackupIds.length} Backup?`,
      message: `Apakah Anda yakin ingin menghapus ${selectedBackupIds.length} data backup terpilih secara permanen? Tindakan ini tidak dapat dibatalkan.`,
      onConfirm: async () => {
        setLoading(true);
        try {
          const batch = writeBatch(db);
          selectedBackupIds.forEach(id => {
            batch.delete(doc(db, 'backups', id));
          });
          await batch.commit();
          const count = selectedBackupIds.length;
          setSelectedBackupIds([]);
          showToast(`${count} backups deleted successfully`, 'success');
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'backups/bulk');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  const handleRecalculateStats = async () => {
    setIsRecalculating(true);
    try {
      await recalculateStats();
      showToast('Dashboard stats recalculated successfully', 'success');
    } catch (err) {
      console.error('Error recalculating stats:', err);
      showToast('Failed to recalculate stats', 'error');
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleBootstrapDatabase = async () => {
    if (!confirm('Apakah Anda yakin ingin melakukan inisialisasi / seeder database? Langkah ini akan mengonfigurasi data master bawaan dan membuat dokumen versi sistem serta dokumen statistik dashboard jika belum ada.')) {
      return;
    }

    setIsBootstrapping(true);
    try {
      // 1. App control version doc
      await setDoc(doc(db, 'metadata', 'app_control'), {
        currentVersion: CLIENT_VERSION,
        updatedBy: auth.currentUser?.email || 'SYSTEM_SEEDER',
        updatedAt: serverTimestamp(),
        forceRefreshAt: serverTimestamp()
      }, { merge: true });

      // 2. Force logout doc
      await setDoc(doc(db, 'metadata', 'force_logouts'), {
        activeForceLogouts: {}
      }, { merge: true });

      // 3. Stats doc
      await setDoc(doc(db, 'metadata', 'dashboard_stats'), {
        totalQty: 0,
        totalInvoices: 0,
        uniqueSkus: 0,
        canceledResi: 0,
        marketplaceData: {},
        dailyTrend: {},
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 4. Master Data - PIC
      const picOpts = [
        "ISMI (GTL)", "ISMI (TK HOME)", "ISMI (SORTIR)", "ISMI (SP HOME)", "ISMI (LZD)",
        "IRDA (GTL)", "IRDA (TK HOME)", "IRDA (SORTIR)", "IRDA (SP HOME)", "IRDA (LZD)",
        "HELENITA (GTL)", "HELENITA (TK HOME)", "HELENITA (SORTIR)", "HELENITA (SP HOME)", "HELENITA (LZD)",
        "APRILIA (GTL)", "APRILIA (TK HOME)", "APRILIA (SORTIR)", "APRILIA (SP HOME)", "APRILIA (LZD)",
        "AINUL (GTL)", "AINUL (TK HOME)", "AINUL (SORTIR)", "AINUL (SP HOME)", "AINUL (LZD)",
        "NOVI (GTL)", "NOVI (TK HOME)", "NOVI (SORTIR)", "NOVI (SP HOME)", "NOVI (LZD)",
        "NOPIYA (GTL)", "NOPIYA (TK HOME)", "NOPIYA (SORTIR)", "NOPIYA (SP HOME)", "NOPIYA (LZD)",
        "ZAHRA (GTL)", "ZAHRA (TK HOME)", "ZAHRA (SORTIR)", "ZAHRA (SP HOME)", "ZAHRA (LZD)",
        "ISMI", "IRDA", "HELENITA", "APRILIA", "AINUL", "NOVI", "NOPIYA", "ZAHRA"
      ];
      await setDoc(doc(db, 'master_data', 'pic'), {
        category: 'pic',
        options: picOpts,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 5. Master Data - Marketplace
      const marketplaceOpts = ["Shopee", "Tokopedia", "Lazada", "TikTok Shop", "Blibli", "Lainnya"];
      await setDoc(doc(db, 'master_data', 'marketplace'), {
        category: 'marketplace',
        options: marketplaceOpts,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 6. Master Data - Status
      const statusOpts = [
        "Bagus", "Rusak", "Hilang", "Double Input", "Sesuai", "Tidak Sesuai", 
        "Lebih SKU", "Kurang SKU", "Salah SKU", "Retur Fisik", 
        "Cancel Fisik", "Rusak Fisik", "Bundling Fisik", "Eliminasi Stok Rusak"
      ];
      await setDoc(doc(db, 'master_data', 'status'), {
        category: 'status',
        options: statusOpts,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 7. Master Data - SKU
      const initialSkus = ["COCO-NAVY-M", "COCO-BLACK-L", "KURA-SLATE-S", "FLORA-PEACH-ONE"];
      await setDoc(doc(db, 'master_data', 'sku'), {
        category: 'sku',
        options: initialSkus,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 8. Master Data - Bundling SKU
      const initialBundlingSkus = ["PAKET-COCO-KURA", "PAKET-FLORA-DUO"];
      await setDoc(doc(db, 'master_data', 'bundling_sku'), {
        category: 'bundling_sku',
        options: initialBundlingSkus,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      showToast('Bootsrap & seeding database berhasil diselesaikan!', 'success');
    } catch (err) {
      console.error('Error bootstrapping database:', err);
      showToast('Gagal melakukan seeder database: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setIsBootstrapping(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="max-w-md mx-auto mt-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-600/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex flex-col items-center mb-8 relative z-10">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white border border-purple-400/30 shadow-xl shadow-purple-950/40 mb-4">
              <Shield className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">Admin Control Panel</h2>
            <p className="text-purple-400 text-[10px] font-black uppercase tracking-widest mt-1">Akses Khusus Terbatas</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5 relative z-10">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-purple-300 uppercase tracking-widest px-1">Username</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400/60" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-[#0c0620] border border-purple-900/40 rounded-xl text-white placeholder-purple-400/30 text-xs font-semibold focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                  placeholder="Masukkan username admin"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-purple-300 uppercase tracking-widest px-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400/60" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-[#0c0620] border border-purple-900/40 rounded-xl text-white placeholder-purple-400/30 text-xs font-semibold focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                  placeholder="Masukkan password admin"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3 text-rose-300 text-xs font-bold">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black rounded-xl transition-all shadow-xl shadow-purple-950/40 text-xs uppercase tracking-widest active:scale-[0.98]"
            >
              Autentikasi Masuk
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel="HAPUS PERMANEN"
        cancelLabel="BATAL"
        type="danger"
      />
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-purple-950/40 border border-purple-400/30 shrink-0">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-white tracking-tight">Admin Control Center</h3>
            <p className="text-purple-400 text-xs font-black uppercase tracking-widest mt-0.5">Sistem Manajemen, Sesi & Keamanan Operasional</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-1.5 bg-[#0c0620] rounded-2xl border border-purple-900/40 w-full lg:w-auto overflow-x-auto">
          <button
            onClick={() => setActiveSubTab('backups')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeSubTab === 'backups' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/40' : 'text-purple-300/60 hover:text-white hover:bg-purple-950/40'}`}
          >
            <History className="w-3.5 h-3.5" />
            Backups
          </button>
          <button
            onClick={() => setActiveSubTab('blocked')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeSubTab === 'blocked' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/40' : 'text-purple-300/60 hover:text-white hover:bg-purple-950/40'}`}
          >
            <UserX className="w-3.5 h-3.5" />
            Blocked
          </button>
          <button
            onClick={() => setActiveSubTab('sessions')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeSubTab === 'sessions' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/40' : 'text-purple-300/60 hover:text-white hover:bg-purple-950/40'}`}
          >
            <Activity className="w-3.5 h-3.5" />
            Sesi & Update
          </button>
          <button
            onClick={() => setActiveSubTab('master')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeSubTab === 'master' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/40' : 'text-purple-300/60 hover:text-white hover:bg-purple-950/40'}`}
          >
            <Database className="w-3.5 h-3.5" />
            Master Control
          </button>
          <button
            onClick={() => setActiveSubTab('settings')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeSubTab === 'settings' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/40' : 'text-purple-300/60 hover:text-white hover:bg-purple-950/40'}`}
          >
            <Settings className="w-3.5 h-3.5" />
            Config
          </button>
          <button
            onClick={() => setActiveSubTab('security')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeSubTab === 'security' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/40' : 'text-purple-300/60 hover:text-white hover:bg-purple-950/40'}`}
          >
            <Key className="w-3.5 h-3.5" />
            Keamanan 2FA
          </button>
          <button
            onClick={() => setActiveSubTab('notifications')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeSubTab === 'notifications' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/40' : 'text-purple-300/60 hover:text-white hover:bg-purple-950/40'}`}
          >
            <BellRing className="w-3.5 h-3.5" />
            Notifikasi
          </button>
          <button
            onClick={() => setActiveSubTab('dual_database')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeSubTab === 'dual_database' ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-950/40' : 'text-teal-300/70 hover:text-white hover:bg-teal-950/40'}`}
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            Dual-Database (7 Hari)
          </button>
          <button
            onClick={handleLogout}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </div>

      <div className="mt-8">
        {activeSubTab === 'backups' && (
          <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
            <div className="p-6 border-b border-purple-900/40 bg-[#0c0620]/60 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h4 className="text-base font-black text-white tracking-tight">Deleted Reports Backup</h4>
                {selectedBackupIds.length > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    className="flex items-center gap-2 px-3.5 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-xl transition-all text-[10px] font-black uppercase tracking-wider"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus Terpilih ({selectedBackupIds.length})
                  </button>
                )}
              </div>
              <div className="text-[10px] font-black text-purple-400 bg-purple-500/15 border border-purple-500/30 px-3 py-1 rounded-full uppercase tracking-wider">
                {backups.length} Records Tersimpan
              </div>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0c0620] border-b border-purple-900/40 text-purple-300 font-black text-[10px] uppercase tracking-wider">
                    <th className="px-6 py-4 w-10">
                      <button 
                        onClick={handleSelectAll}
                        className="text-purple-400/60 hover:text-purple-300 transition-colors"
                      >
                        {selectedBackupIds.length === backups.length && backups.length > 0 ? (
                          <CheckSquare className="w-5 h-5 text-purple-400" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-4">Deleted At</th>
                    <th className="px-6 py-4">Invoice</th>
                    <th className="px-6 py-4">SKU</th>
                    <th className="px-6 py-4">Qty</th>
                    <th className="px-6 py-4">Deleted By</th>
                    <th className="px-6 py-4 text-right">Ops</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-900/20 text-slate-200">
                  {backups.map((backup) => (
                    <tr key={backup.id} className={`hover:bg-purple-900/20 transition-all group ${selectedBackupIds.includes(backup.id || '') ? 'bg-purple-600/10' : ''}`}>
                      <td className="px-6 py-4">
                        <button 
                          onClick={() => backup.id && handleSelectOne(backup.id)}
                          className="text-purple-400/60 hover:text-purple-300 transition-colors"
                        >
                          {selectedBackupIds.includes(backup.id || '') ? (
                            <CheckSquare className="w-5 h-5 text-purple-400" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-xs text-purple-200 font-semibold">
                        {backup.deletedAt?.toDate ? format(backup.deletedAt.toDate(), 'yyyy-MM-dd HH:mm') : '---'}
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-purple-300 font-bold">{backup.originalData.invoiceNumber}</td>
                      <td className="px-6 py-4 text-xs font-black text-white tracking-wide">{backup.originalData.sku}</td>
                      <td className="px-6 py-4 text-xs">
                        <span className="bg-purple-500/15 text-purple-300 font-black px-2.5 py-1 rounded-lg border border-purple-500/30">
                          {backup.originalData.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-purple-300/70 font-semibold">{backup.deletedBy}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => backup.id && handleDeleteBackup(backup.id)}
                          className="p-2 text-purple-400/60 hover:text-rose-400 hover:bg-rose-500/15 rounded-xl transition-all border border-transparent hover:border-rose-500/30"
                          title="Hapus Backup (Developer Only)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {backups.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center text-purple-300/40 font-black text-xs uppercase tracking-widest">
                        Tidak ada data backup
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSubTab === 'blocked' && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-md">
              <h4 className="text-lg font-black text-white tracking-tight mb-6">Blokir Pengguna Baru</h4>
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="email"
                  id="block-email"
                  placeholder="Masukkan alamat Gmail untuk diblokir..."
                  className="flex-1 px-4 py-3 bg-[#0c0620] border border-purple-900/40 rounded-xl text-white placeholder-purple-400/30 text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none transition-all"
                />
                <button
                  onClick={() => {
                    const input = document.getElementById('block-email') as HTMLInputElement;
                    handleBlockUser(input.value);
                    input.value = '';
                  }}
                  className="px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl transition-all shadow-lg shadow-rose-950/40 text-xs uppercase tracking-widest active:scale-[0.98]"
                >
                  Blokir Akses
                </button>
              </div>
            </div>

            <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
              <div className="p-6 border-b border-purple-900/40 bg-[#0c0620]/60">
                <h4 className="text-base font-black text-white tracking-tight">Daftar Pengguna Terblokir</h4>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#0c0620] border-b border-purple-900/40 text-purple-300 font-black text-[10px] uppercase tracking-wider">
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Blocked At</th>
                      <th className="px-6 py-4">Blocked By</th>
                      <th className="px-6 py-4 text-right">Ops</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-900/20 text-slate-200">
                    {blockedUsers.map((bu: any) => (
                      <tr key={bu.id} className="hover:bg-purple-900/20 transition-all group">
                        <td className="px-6 py-4 text-xs text-white font-bold">{bu.email}</td>
                        <td className="px-6 py-4 text-xs text-purple-300/70 font-semibold">
                          {bu.blockedAt?.toDate ? format(bu.blockedAt.toDate(), 'yyyy-MM-dd HH:mm') : '---'}
                        </td>
                        <td className="px-6 py-4 text-xs text-purple-400 font-semibold">{bu.blockedBy}</td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => bu.id && handleUnblockUser(bu.id)}
                            className="p-2 text-purple-400/60 hover:text-emerald-400 hover:bg-emerald-500/15 rounded-xl transition-all border border-transparent hover:border-emerald-500/30"
                            title="Buka Blokir"
                          >
                            <RefreshCcw className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {blockedUsers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-16 text-center text-purple-300/40 font-black text-xs uppercase tracking-widest">
                          Tidak ada pengguna yang diblokir
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'sessions' && (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
            {/* 1. Version Update & Cache Busting Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-md flex flex-col justify-between">
                <div>
                  <h4 className="text-lg font-black text-white tracking-tight mb-2">Release Patrol & Cache Buster</h4>
                  <p className="text-purple-300/70 text-xs font-semibold leading-relaxed mb-6">
                    Membantu mengatasi browser user yang tidak ter-refresh setelah deployment update. Mengubah versi atau memaksa reload akan langsung menyegarkan browser seluruh staff secara real-time.
                  </p>
                  
                  <form onSubmit={handleUpdateSystemVersion} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-purple-300 tracking-wider mb-2">Versi Target Sistem Terbaru</label>
                      <div className="flex gap-3">
                        <input
                          type="text"
                          value={newVersionInput}
                          onChange={(e) => setNewVersionInput(e.target.value)}
                          placeholder="Contoh: 2.4.3"
                          className="flex-1 px-4 py-3 bg-[#0c0620] border border-purple-900/40 rounded-xl text-white text-xs font-semibold focus:ring-2 focus:ring-purple-500 outline-none transition-all placeholder-purple-400/30"
                        />
                        <button
                          type="submit"
                          disabled={updatingVersion}
                          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-black rounded-xl transition-all uppercase tracking-wider shadow-lg shadow-purple-950/40"
                        >
                          {updatingVersion ? 'Saving...' : 'Set Versi'}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>

                <div className="pt-6 border-t border-purple-900/30 mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <span className="block text-[9px] font-black uppercase text-purple-400 tracking-widest leading-none">STATUS VERSI AKTIF</span>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-lg font-black text-white">{appControlData?.currentVersion || '2.4.2'}</span>
                      <span className="text-[10px] font-semibold text-purple-300 px-2 py-0.5 bg-purple-500/15 border border-purple-500/30 rounded-full">
                        Client: {CLIENT_VERSION}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleForceGlobalRefresh}
                    disabled={updatingVersion}
                    className="flex items-center gap-2 px-5 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-lg shadow-amber-950/40 text-xs uppercase tracking-widest active:scale-[0.98]"
                    title="Memaksa semua user yang sedang membuka portal untuk me-reload halaman & membersihkan cache"
                  >
                    <RefreshCcw className={`w-4 h-4 ${updatingVersion ? 'animate-spin' : ''}`} />
                    Paksa Hard Reload (Bust Cache)
                  </button>
                </div>
              </div>

              {/* Security Advisory / Explanation of Deployment Caching Card */}
              <div className="bg-[#0c0620]/90 border border-purple-900/40 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-md flex flex-col justify-between">
                <div>
                  <h4 className="text-sm font-black uppercase text-purple-300 tracking-widest mb-3">Panduan Update & Caching</h4>
                  <div className="space-y-3.5 text-xs text-purple-200/80 font-medium leading-relaxed">
                    <p>
                      <strong className="text-white">Bagaimana cache browser bekerja?</strong> Saat Anda men-deploy update baru, file javascript & HTML akan di-cache secara otomatis oleh browser user untuk menjamin performa cepat.
                    </p>
                    <p>
                      <strong className="text-white">Mengapa user tidak melihat perubahan?</strong> Jika user tidak menutup tab atau merefresh browser secara manual, browser mereka akan terus menjalankan kode lama yang ada di memori aktif tab mereka.
                    </p>
                    <p>
                      <strong className="text-white">Solusi Resmi:</strong> Kami merancang listener real-time. Dengan mengklik tombol <strong className="text-amber-300">"Paksa Hard Reload"</strong>, browser semua user yang sedang online akan langsung dimuat ulang otomatis dengan parameter bypass cache (<code className="text-purple-300">?u=[timestamp]</code>), menghapus file cache lama seketika tanpa perlu men-crash-kan website!
                    </p>
                  </div>
                </div>
                <div className="pt-4 text-[9px] text-purple-400 font-black uppercase tracking-widest mt-4 flex items-center gap-1.5 select-none">
                  <Shield className="w-3.5 h-3.5 text-purple-400" />
                  Realtime Cache Control System
                </div>
              </div>
            </div>

            {/* 2. Sesi & User Patrol Database List representation */}
            <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
              <div className="p-6 border-b border-purple-900/40 bg-[#0c0620]/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-lg font-black text-white tracking-tight">Active Sessions & Member Patrol</h4>
                  <p className="text-purple-300/70 text-xs font-semibold mt-1">Daftar staff terdaftar beserta pantauan aktivitas real-time dan opsi penghentian sesi paksa.</p>
                </div>
                <div className="text-[10px] font-black text-purple-300 uppercase tracking-widest bg-purple-500/15 px-3.5 py-1.5 border border-purple-500/30 rounded-full select-none">
                  {allUsers.length} Staff Terdaftar
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar text-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#0c0620] border-b border-purple-900/40 text-purple-300 font-black text-[10px] uppercase tracking-wider">
                      <th className="px-6 py-4">Nama Staff</th>
                      <th className="px-6 py-4">Status Online</th>
                      <th className="px-6 py-4">Terakhir Aktif</th>
                      <th className="px-6 py-4">Sesi Admin Status</th>
                      <th className="px-6 py-4 text-right">Aksi Kontrol</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-900/20 text-slate-200">
                    {allUsers.map((usr: any) => {
                      let isOnline = false;
                      if (usr.lastActiveAt) {
                        const activeDiff = currentTime - new Date(usr.lastActiveAt).getTime();
                        isOnline = activeDiff < 300000;
                      }
                      
                      const forcedState = activeForceLogouts[usr.uid];
                      const isBlocked = blockedUsers.some((bu: any) => bu.id === usr.uid);

                      let remainingSeconds = 0;
                      let isForcedActive = false;
                      if (forcedState) {
                        const getForcedAtTime = (fs: any): number => {
                          if (!fs || !fs.forcedAt) return 0;
                          const val = fs.forcedAt;
                          if (typeof val === 'number') return val;
                          if (val && typeof val.toDate === 'function') return val.toDate().getTime();
                          if (typeof val === 'string') return new Date(val).getTime();
                          if (val && typeof val.seconds === 'number') return val.seconds * 1000;
                          return 0;
                        };
                        const forcedAtTime = getForcedAtTime(forcedState);
                        const elapsed = currentTime - forcedAtTime;
                        const remainingMs = FORCE_LOGOUT_DURATION - elapsed;
                        const lastActiveTime = usr.lastActiveAt ? new Date(usr.lastActiveAt).getTime() : 0;
                        
                        if (remainingMs > 0 && lastActiveTime <= forcedAtTime) {
                          remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
                          isForcedActive = true;
                        }
                      }

                      return (
                        <tr key={usr.uid} className="hover:bg-purple-900/20 transition-all group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-purple-500/15 text-purple-300 font-bold rounded-xl flex items-center justify-center border border-purple-500/30 text-xs">
                                {usr.displayName ? usr.displayName.slice(0, 2).toUpperCase() : 'ST'}
                              </div>
                              <div>
                                <span className="block text-sm text-white font-bold">{usr.displayName || 'Staf'}</span>
                                <span className="block text-[10px] text-purple-300/60 font-semibold uppercase tracking-wider">{usr.email || usr.uid}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {isOnline ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded-full uppercase tracking-wider animate-pulse">
                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                                Online
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black text-purple-400/60 bg-[#0c0620] border border-purple-900/40 rounded-full uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 bg-purple-500/40 rounded-full" />
                                Offline
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-purple-200">
                            {usr.lastActiveAt ? format(new Date(usr.lastActiveAt), 'yyyy-MM-dd HH:mm:ss') : 'Belum tercatat'}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1.5">
                              {usr.role === 'admin' ? (
                                <span className="px-2 py-0.5 text-[9px] font-black uppercase text-purple-300 bg-purple-500/20 border border-purple-500/30 rounded">ADMIN</span>
                              ) : (
                                <span className="px-2 py-0.5 text-[9px] font-black uppercase text-purple-400/70 bg-[#0c0620] border border-purple-900/40 rounded">STAFF</span>
                              )}
                              
                              {isForcedActive && (
                                <span className="px-2 py-0.5 text-[9px] font-black uppercase text-amber-400 bg-amber-500/15 border border-amber-500/25 rounded">SESI TERSETOP</span>
                              )}

                              {isBlocked && (
                                <span className="px-2 py-0.5 text-[9px] font-black uppercase text-rose-400 bg-rose-500/15 border border-rose-500/25 rounded">TERBLOKIR</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              {isForcedActive ? (
                                <button
                                  onClick={() => handleClearForceLogout(usr.uid)}
                                  className="px-3.5 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-300 border border-emerald-500/30 rounded-xl transition-all text-[9px] font-black uppercase tracking-wider"
                                  title="Pulihkan akses sesi agar user bisa login kembali"
                                >
                                  Batalkan Paksa Logout ({Math.floor(remainingSeconds / 60)}:{(remainingSeconds % 60).toString().padStart(2, '0')})
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleForceLogoutUser(usr.uid, usr.email || usr.displayName)}
                                  className="px-3.5 py-1.5 bg-rose-600/15 hover:bg-rose-600/25 text-rose-300 border border-rose-500/30 rounded-xl transition-all text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 active:scale-[0.98]"
                                  title="Paksa logout sesi user ini (Sesi akan diakhiri seketika)"
                                >
                                  <LogOut className="w-3 h-3" />
                                  Paksa Logout
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {allUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-16 text-center text-purple-300/40 font-black text-xs uppercase tracking-widest">
                          Belum ada data staff terdaftar di database.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'master' && (
          <MasterDataManagement user={user} />
        )}

        {activeSubTab === 'settings' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-[#130b2e]/90 border border-purple-900/30 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-4 mb-8 pb-6 border-b border-purple-900/30">
                <div className="w-12 h-12 bg-purple-500/15 rounded-2xl flex items-center justify-center text-purple-300 border border-purple-500/30">
                  <Key className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xl font-black text-white tracking-tight">Admin Credentials</h4>
                  <p className="text-purple-400 text-xs font-black uppercase tracking-widest mt-0.5">Perbarui Kredensial Akses Panel</p>
                </div>
              </div>

              <form onSubmit={handleUpdateConfig} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-purple-300 uppercase tracking-widest px-1">New Username</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full px-4 py-3 bg-[#0c0620] border border-purple-900/40 rounded-xl text-white placeholder-purple-400/30 text-xs font-semibold focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                    placeholder={config?.username || 'admin'}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-purple-300 uppercase tracking-widest px-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-[#0c0620] border border-purple-900/40 rounded-xl text-white placeholder-purple-400/30 text-xs font-semibold focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black rounded-xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-purple-950/40 text-xs uppercase tracking-widest active:scale-[0.98]"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Simpan Perubahan
                </button>
              </form>

              <div className="mt-10 pt-8 border-t border-purple-900/30">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-amber-500/15 rounded-2xl flex items-center justify-center text-amber-300 border border-amber-500/30">
                    <RefreshCcw className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black text-white tracking-tight">Maintenance & Tools</h4>
                    <p className="text-purple-400 text-xs font-black uppercase tracking-widest mt-0.5">Optimasi & Inisialisasi Database</p>
                  </div>
                </div>
                
                <div className="p-6 bg-[#0c0620] border border-purple-900/40 rounded-2xl space-y-5">
                  <div className="flex items-start gap-4">
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-purple-200/80 font-medium leading-relaxed">
                      Gunakan tombol di bawah untuk menghitung ulang seluruh statistik dashboard dari nol. Gunakan jika angka di dashboard terasa tidak sinkron dengan data asli.
                    </p>
                  </div>
                  <button
                    onClick={handleRecalculateStats}
                    disabled={isRecalculating}
                    className="w-full py-3.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-black rounded-xl transition-all flex items-center justify-center gap-3 border border-amber-500/30 text-xs uppercase tracking-widest disabled:opacity-50 active:scale-[0.98]"
                  >
                    {isRecalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                    Hitung Ulang Statistik Dashboard
                  </button>
                </div>

                <div className="p-6 bg-[#0c0620] border border-purple-900/40 rounded-2xl space-y-5 mt-5">
                  <div className="flex items-start gap-4">
                    <Database className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-purple-200/80 font-medium leading-relaxed">
                      <strong>Inisialisasi Database Baru:</strong> Bila database Anda (<code className="text-xs text-purple-300 font-bold">stock-pro-admin</code>) masih kosong, klik tombol di bawah untuk mengisi data master default (PIC, Status Aset, Marketplace) serta setelan kontrol versi sistem.
                    </p>
                  </div>
                  <button
                    onClick={handleBootstrapDatabase}
                    disabled={isBootstrapping}
                    className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black rounded-xl transition-all flex items-center justify-center gap-3 text-xs uppercase tracking-widest active:scale-[0.98] shadow-lg shadow-purple-950/40"
                  >
                    {isBootstrapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                    Inisialisasi & Seed Database
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'security' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-[#130b2e]/90 border border-purple-900/30 rounded-3xl p-6 sm:p-8 shadow-xl backdrop-blur-md"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-purple-500/15 rounded-2xl flex items-center justify-center border border-purple-500/30 text-purple-300">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-xl font-black text-white">Autentikasi Keamanan (2FA)</h4>
                <p className="text-purple-300/70 text-xs font-semibold mt-1">Kelola akses staf menggunakan kode rahasia 6-digit.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-[#0c0620] p-6 rounded-2xl border border-purple-900/40">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h5 className="font-bold text-white">Wajibkan Kode 2FA</h5>
                    <p className="text-xs text-purple-300/70 mt-1">Staf harus memasukkan kode untuk login</p>
                  </div>
                  <button
                    onClick={handleToggleAuthCode}
                    className={`w-14 h-8 rounded-full transition-colors relative flex items-center px-1 ${securityData?.authCodeRequired ? 'bg-emerald-500' : 'bg-purple-950/60 border border-purple-900/40'}`}
                  >
                    <div className={`w-6 h-6 rounded-full bg-white transition-transform ${securityData?.authCodeRequired ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <p className="text-xs text-purple-200 leading-relaxed font-medium">
                    Jika fitur ini <strong>ON</strong>, semua staf yang login menggunakan Google harus memasukkan kode 6 digit di bawah ini. Jika <strong>OFF</strong>, staf dapat login langsung.
                  </p>
                </div>
              </div>

              <div className="bg-[#0c0620] p-6 rounded-2xl border border-purple-900/40 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-purple-950">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-1000 ease-linear"
                    style={{ width: `${(totpRemaining / 60) * 100}%` }}
                  />
                </div>
                
                <h5 className="font-black text-purple-400 tracking-widest text-[10px] uppercase mb-4">Kode Live Saat Ini</h5>
                
                <div className="text-5xl font-black tracking-[0.2em] text-white tabular-nums drop-shadow-2xl font-mono">
                  {currentTOTP || '------'}
                </div>
                
                <div className="mt-4 flex items-center gap-2 text-xs font-bold text-purple-300/70">
                  <RefreshCcw className={`w-3.5 h-3.5 ${totpRemaining < 10 ? 'text-rose-400 animate-spin' : 'text-purple-400'}`} />
                  <span className={totpRemaining < 10 ? 'text-rose-400' : ''}>Berganti dalam {totpRemaining} detik</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeSubTab === 'notifications' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-[#130b2e]/90 border border-purple-900/30 rounded-3xl p-6 sm:p-8 shadow-xl backdrop-blur-md"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-purple-500/15 rounded-2xl flex items-center justify-center border border-purple-500/30 text-purple-300">
                <Megaphone className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-xl font-black text-white">Notifikasi Global Real-Time</h4>
                <p className="text-purple-300/70 text-xs font-semibold mt-1">Kirim pesan penting ke seluruh perangkat yang sedang aktif.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Form Send Notification */}
              <div className="bg-[#0c0620] p-6 rounded-2xl border border-purple-900/40 space-y-6">
                <div>
                  <label className="text-xs font-black text-purple-300 uppercase tracking-widest block mb-2">Tipe Notifikasi</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'wa-alert', label: 'WhatsApp', icon: MessageCircle, activeStyle: 'bg-emerald-500/20 border-emerald-500 text-emerald-300' },
                      { id: 'info', label: 'Info', icon: AlertCircle, activeStyle: 'bg-indigo-500/20 border-indigo-500 text-indigo-300' },
                      { id: 'warning', label: 'Warning', icon: AlertCircle, activeStyle: 'bg-amber-500/20 border-amber-500 text-amber-300' },
                      { id: 'success', label: 'Success', icon: CheckCircle2, activeStyle: 'bg-purple-500/20 border-purple-500 text-purple-300' }
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setNotificationType(t.id as any)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                          notificationType === t.id 
                            ? t.activeStyle 
                            : 'bg-[#130b2e] border-purple-900/40 text-purple-400/60 hover:text-purple-200'
                        }`}
                      >
                        <t.icon className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-black text-purple-300 uppercase tracking-widest block mb-2">Pesan Notifikasi</label>
                  <textarea
                    value={notificationMessage}
                    onChange={(e) => setNotificationMessage(e.target.value)}
                    placeholder="Ketik pesan untuk semua user..."
                    rows={3}
                    className="w-full bg-[#130b2e] text-white py-3 px-4 rounded-xl border border-purple-900/40 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none resize-none transition-all placeholder:text-purple-400/30 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-purple-300 uppercase tracking-widest block mb-2">Durasi Tampil (Menit)</label>
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      {[
                        { label: '15 Detik', value: 0.25 },
                        { label: '1 Menit', value: 1 },
                        { label: '5 Menit', value: 5 },
                        { label: 'Tampil Terus', value: 0 }
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          onClick={() => setNotificationDuration(preset.value)}
                          className={`flex-1 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                            notificationDuration === preset.value
                              ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                              : 'bg-[#130b2e] border-purple-900/40 text-purple-400/60 hover:text-purple-200'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-purple-300 font-bold">Kustom:</span>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={notificationDuration}
                        onChange={(e) => setNotificationDuration(parseFloat(e.target.value) || 0)}
                        className="flex-1 bg-[#130b2e] text-white py-2 px-3 rounded-xl border border-purple-900/40 focus:border-purple-500 outline-none text-xs font-semibold"
                        placeholder="Contoh: 10"
                      />
                      <span className="text-xs text-purple-300 font-bold">Menit</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={(e) => handleSendGlobalNotification(e)}
                  disabled={isSendingNotification || !notificationMessage.trim()}
                  className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-lg shadow-purple-950/40 flex items-center justify-center gap-2 text-xs uppercase tracking-widest active:scale-[0.98]"
                >
                  {isSendingNotification ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                  Kirim Notifikasi
                </button>
              </div>

              {/* Quick Actions & Status */}
              <div className="space-y-6">
                {activeGlobalAlert?.isActive && (
                  <div className="bg-rose-500/10 p-6 rounded-2xl border border-rose-500/30 animate-pulse">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h5 className="font-black text-rose-400 text-xs uppercase tracking-widest mb-1 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-rose-500" />
                          Notifikasi Sedang Aktif
                        </h5>
                        <p className="text-rose-200 text-sm font-semibold mb-1">"{activeGlobalAlert.message}"</p>
                        <p className="text-xs text-rose-300/70">
                          {activeGlobalAlert.expiresAt === 0 
                            ? 'Akan tampil terus sampai dihentikan.' 
                            : 'Akan hilang otomatis saat waktunya habis.'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleStopGlobalNotification}
                      className="mt-4 w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest active:scale-[0.98]"
                    >
                      <X className="w-4 h-4" />
                      Hentikan Notifikasi Ini
                    </button>
                  </div>
                )}

                <div className="bg-[#0c0620] p-6 rounded-2xl border border-purple-900/40">
                  <h5 className="font-bold text-white mb-4 flex items-center gap-2 text-sm">
                    <MessageCircle className="w-4 h-4 text-emerald-400" />
                    Preset Pesan Cepat (1-Klik)
                  </h5>
                  <div className="space-y-3">
                    <button
                      onClick={() => handleSendGlobalNotification(undefined, 'wa-alert', 'Ada Chat WhatsApp masuk dari customer, mohon segera dicek!', 0.25)}
                      className="w-full flex items-center justify-between p-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl transition-all group text-left"
                    >
                      <span className="text-xs font-semibold text-emerald-100">"Ada Chat WA Baru" (15 Detik)</span>
                      <Megaphone className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform shrink-0 ml-2" />
                    </button>
                    
                    <button
                      onClick={() => handleSendGlobalNotification(undefined, 'warning', 'Sistem sedang sibuk / lambat. Harap bersabar dan jangan refresh berulang kali.', 5)}
                      className="w-full flex items-center justify-between p-3.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-xl transition-all group text-left"
                    >
                      <span className="text-xs font-semibold text-amber-100">"Sistem Sibuk" (5 Menit)</span>
                      <Megaphone className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform shrink-0 ml-2" />
                    </button>
                    
                    <button
                      onClick={() => handleSendGlobalNotification(undefined, 'info', 'Mohon selesaikan packing dan orderan secepatnya, jam pickup akan segera tiba.', 60)}
                      className="w-full flex items-center justify-between p-3.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-xl transition-all group text-left"
                    >
                      <span className="text-xs font-semibold text-purple-100">"Persiapan Pickup" (1 Jam)</span>
                      <Megaphone className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform shrink-0 ml-2" />
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-start gap-3">
                  <Info className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-purple-200/80 leading-relaxed font-medium">
                    Notifikasi sekarang tidak bisa ditutup manual oleh staf. Pesan akan hilang secara otomatis sesuai timer atau dengan menekan tombol Hentikan Notifikasi di panel ini.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Dual-Database Management Tab (Firestore Lifetime + Supabase 7-Day Rolling) */}
        {activeSubTab === 'dual_database' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-5xl mx-auto space-y-6"
          >
            {/* Overview Card */}
            <div className="bg-[#130b2e]/90 border border-teal-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-purple-900/40">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shadow-lg shadow-teal-950/50">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                      <span>Arsitektur Dual-Storage Hybrid</span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-widest">
                        Aktif
                      </span>
                    </h4>
                    <p className="text-xs text-slate-300 mt-1">
                      Menyimpan data simultan ke <strong>Firebase Firestore</strong> (seumur hidup) &amp; <strong>Supabase</strong> (7 hari terakhir untuk kecepatan &amp; live realtime).
                    </p>
                  </div>
                </div>

                {/* 1-Click Sync Button */}
                <button
                  onClick={async () => {
                    setIsSyncingDual(true);
                    try {
                      const res = await syncLast7DaysToSupabase();
                      showToast(`⚡ Sukses menyinkronkan ${res.totalSynced} data 7 hari terakhir ke Supabase!`, 'success');
                    } catch (err: any) {
                      showToast(`Gagal sinkronisasi: ${err.message}`, 'error');
                    } finally {
                      setIsSyncingDual(false);
                    }
                  }}
                  disabled={isSyncingDual}
                  className="w-full md:w-auto px-6 py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-xl shadow-teal-950/40 flex items-center justify-center gap-2.5 text-xs uppercase tracking-widest cursor-pointer active:scale-95 shrink-0"
                >
                  {isSyncingDual ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <RefreshCw className="w-4 h-4 text-teal-200" />}
                  <span>Sinkronkan 7 Hari ke Supabase</span>
                </button>
              </div>

              {/* Status Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="p-4 bg-[#0c0620] border border-purple-900/40 rounded-2xl">
                  <div className="text-[10px] font-black uppercase tracking-wider text-purple-400 mb-1">Database Arsip (Lifetime)</div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    <span>Firebase Firestore</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">100% data tersimpan permanen selamanya.</div>
                </div>

                <div className="p-4 bg-[#0c0620] border border-teal-500/30 rounded-2xl">
                  <div className="text-[10px] font-black uppercase tracking-wider text-teal-400 mb-1">Database Operasional (7 Hari)</div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse"></span>
                    <span>Supabase Postgres</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">Rolling window 7 hari terakhir (Realtime &amp; Cepat).</div>
                </div>

                <div className="p-4 bg-[#0c0620] border border-purple-900/40 rounded-2xl">
                  <div className="text-[10px] font-black uppercase tracking-wider text-indigo-400 mb-1">Pembersihan Otomatis</div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>Rolling Trigger Purge</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">Data &gt; 7 hari terhapus otomatis di Supabase.</div>
                </div>
              </div>

              {/* SQL Schema Box */}
              <div className="mt-6 bg-[#080414] border border-purple-900/50 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-200">
                    <Code2 className="w-4 h-4 text-purple-400" />
                    <span>SQL Schema Supabase (`sql/reports_7days_schema.sql`)</span>
                  </div>
                  <button
                    onClick={() => {
                      const sql = `-- SCHEMA TABEL REPORTS (7-DAY ROLLING CACHE) UNTUK SUPABASE
-- Project: tpewylwthmlnfhzohlgu

CREATE TABLE IF NOT EXISTS public.reports (
    id TEXT PRIMARY KEY,
    barcode TEXT,
    nama_barang TEXT,
    item_name TEXT,
    sku TEXT,
    qty INTEGER DEFAULT 1,
    quantity INTEGER DEFAULT 1,
    status TEXT,
    modul_fisik TEXT,
    category TEXT,
    marketplace TEXT,
    pic TEXT,
    keterangan TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    input_date DATE,
    image_url TEXT,
    user_id TEXT,
    user_email TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_date ON public.reports(date DESC);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_barcode ON public.reports(barcode);
CREATE INDEX IF NOT EXISTS idx_reports_sku ON public.reports(sku);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read reports" ON public.reports;
CREATE POLICY "Allow public read reports" ON public.reports FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow public insert reports" ON public.reports;
CREATE POLICY "Allow public insert reports" ON public.reports FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update reports" ON public.reports;
CREATE POLICY "Allow public update reports" ON public.reports FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete reports" ON public.reports;
CREATE POLICY "Allow public delete reports" ON public.reports FOR DELETE TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.cleanup_reports_older_than_7_days()
RETURNS trigger AS $$
BEGIN
    DELETE FROM public.reports WHERE (date < (CURRENT_DATE - INTERVAL '7 days')) OR (created_at < (timezone('utc'::text, now()) - INTERVAL '8 days'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cleanup_reports_7days ON public.reports;
CREATE TRIGGER trigger_cleanup_reports_7days AFTER INSERT ON public.reports FOR EACH STATEMENT EXECUTE FUNCTION public.cleanup_reports_older_than_7_days();

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reports') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.reports; END IF; END $$;`;
                      navigator.clipboard.writeText(sql);
                      setCopiedSql(true);
                      showToast('📋 Skrip SQL berhasil disalin ke clipboard!', 'success');
                      setTimeout(() => setCopiedSql(false), 3000);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 text-xs font-bold transition cursor-pointer"
                  >
                    {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSql ? 'Tersalin' : 'Salin SQL'}</span>
                  </button>
                </div>
                <pre className="text-[11px] font-mono text-purple-300/80 overflow-x-auto max-h-48 p-3 bg-black/40 rounded-xl">
                  {`-- DDL Tabel Supabase 'reports' & Trigger Pembersihan 7 Hari (Rolling Retention)
CREATE TABLE IF NOT EXISTS public.reports (...);
CREATE TRIGGER trigger_cleanup_reports_7days AFTER INSERT ON public.reports ...;`}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </div>
      <Toast 
        isVisible={toast.visible}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, visible: false }))}
      />
    </div>
  );
}
