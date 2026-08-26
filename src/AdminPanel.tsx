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
import Toast, { ToastType } from './Toast';

import { recalculateStats } from './stats';
import { generateTOTPCode, getTOTPRemainingSeconds } from './totp';

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
  const [activeSubTab, setActiveSubTab] = useState<'backups' | 'blocked' | 'master' | 'settings' | 'sessions' | 'security' | 'notifications'>('backups');
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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (config && username === config.username && password === config.password) {
      setIsLoggedIn(true);
      setError('');
      localStorage.setItem('admin_session', JSON.stringify({ timestamp: Date.now() }));
    } else {
      setError('Invalid credentials');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('admin_session');
  };

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await setDoc(doc(db, 'admin_config', 'main'), {
        username: newUsername || config?.username,
        password: newPassword || config?.password,
        updatedAt: serverTimestamp()
      });
      setNewUsername('');
      setNewPassword('');
      showToast('Credentials updated successfully', 'success');
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
      <div className="max-w-md mx-auto mt-20">
        <div className="glass-card p-10 rounded-[40px] border-white/5 shadow-2xl">
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 bg-indigo-500/10 rounded-[32px] flex items-center justify-center text-indigo-400 border border-indigo-500/20 mb-6">
              <Shield className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">Admin Panel</h2>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2">Restricted Access</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Username</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-12 pr-5 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="Enter username"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-5 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="Enter password"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-400 text-xs font-bold">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-900/20 text-xs uppercase tracking-widest"
            >
              Authenticate
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
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-900/20 border border-white/10">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-white tracking-tight">Admin Control Center</h3>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">System Management & Security</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:gap-3 p-1.5 bg-white/5 rounded-2xl border border-white/5 w-full">
          <button
            onClick={() => setActiveSubTab('backups')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'backups' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <History className="w-3.5 h-3.5" />
            Backups
          </button>
          <button
            onClick={() => setActiveSubTab('blocked')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'blocked' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <UserX className="w-3.5 h-3.5" />
            Blocked
          </button>
          <button
            onClick={() => setActiveSubTab('sessions')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'sessions' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <Activity className="w-3.5 h-3.5" />
            Sesi & Update
          </button>
          <button
            onClick={() => setActiveSubTab('master')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'master' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <Database className="w-3.5 h-3.5" />
            Master Control
          </button>
          <button
            onClick={() => setActiveSubTab('settings')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'settings' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <Settings className="w-3.5 h-3.5" />
            Config
          </button>
          <button
            onClick={() => setActiveSubTab('security')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'security' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <Key className="w-3.5 h-3.5" />
            Keamanan 2FA
          </button>
          <button
            onClick={() => setActiveSubTab('notifications')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'notifications' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <BellRing className="w-3.5 h-3.5" />
            Notifikasi
          </button>
          <button
            onClick={handleLogout}
            className="flex-shrink-0 flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </div>

      <div className="mt-8">
        {activeSubTab === 'backups' && (
          <div className="glass-card rounded-[40px] border-white/5 overflow-hidden">
            <div className="p-8 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <h4 className="text-lg font-black text-white tracking-tight">Deleted Reports Backup</h4>
                {selectedBackupIds.length > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus Terpilih ({selectedBackupIds.length})
                  </button>
                )}
              </div>
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {backups.length} Records Saved
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/[0.02]">
                    <th className="px-8 py-5 w-10">
                      <button 
                        onClick={handleSelectAll}
                        className="text-slate-500 hover:text-indigo-400 transition-colors"
                      >
                        {selectedBackupIds.length === backups.length && backups.length > 0 ? (
                          <CheckSquare className="w-5 h-5 text-indigo-400" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Deleted At</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Invoice</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">SKU</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Qty</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Deleted By</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right">Ops</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {backups.map((backup) => (
                    <tr key={backup.id} className={`hover:bg-white/[0.04] transition-all group ${selectedBackupIds.includes(backup.id || '') ? 'bg-indigo-500/5' : ''}`}>
                      <td className="px-8 py-5">
                        <button 
                          onClick={() => backup.id && handleSelectOne(backup.id)}
                          className="text-slate-500 hover:text-indigo-400 transition-colors"
                        >
                          {selectedBackupIds.includes(backup.id || '') ? (
                            <CheckSquare className="w-5 h-5 text-indigo-400" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      </td>
                      <td className="px-8 py-5 text-sm text-slate-400 font-medium">
                        {backup.deletedAt?.toDate ? format(backup.deletedAt.toDate(), 'yyyy-MM-dd HH:mm') : '---'}
                      </td>
                      <td className="px-8 py-5 text-[13px] font-mono text-indigo-300/80 font-bold">{backup.originalData.invoiceNumber}</td>
                      <td className="px-8 py-5 text-xs font-black text-white tracking-wide">{backup.originalData.sku}</td>
                      <td className="px-8 py-5 text-sm">
                        <span className="bg-indigo-500/10 text-indigo-400 font-black px-2 py-1 rounded-lg border border-indigo-500/10">
                          {backup.originalData.quantity}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-xs text-slate-500 font-bold">{backup.deletedBy}</td>
                      <td className="px-8 py-5 text-right">
                        <button
                          onClick={() => backup.id && handleDeleteBackup(backup.id)}
                          className="p-2.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all border border-transparent hover:border-rose-500/20"
                          title="Developer Only"
                        >
                          <Trash2 className="w-4.5 h-4.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {backups.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-8 py-20 text-center text-slate-600 font-black text-[10px] uppercase tracking-widest">
                        No backups found
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
            <div className="glass-card p-8 rounded-[40px] border-white/5">
              <h4 className="text-lg font-black text-white tracking-tight mb-8">Block New User</h4>
              <div className="flex gap-4">
                <input
                  type="email"
                  id="block-email"
                  placeholder="Enter Gmail address to block"
                  className="flex-1 px-5 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-rose-500 outline-none transition-all"
                />
                <button
                  onClick={() => {
                    const input = document.getElementById('block-email') as HTMLInputElement;
                    handleBlockUser(input.value);
                    input.value = '';
                  }}
                  className="px-8 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-rose-900/20 text-xs uppercase tracking-widest"
                >
                  Block User
                </button>
              </div>
            </div>

            <div className="glass-card rounded-[40px] border-white/5 overflow-hidden">
              <div className="p-8 border-b border-white/5">
                <h4 className="text-lg font-black text-white tracking-tight">Blocked Users List</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02]">
                      <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Email</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Blocked At</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Blocked By</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right">Ops</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {blockedUsers.map((bu: any) => (
                      <tr key={bu.id} className="hover:bg-white/[0.04] transition-all group">
                        <td className="px-8 py-5 text-sm text-white font-bold">{bu.email}</td>
                        <td className="px-8 py-5 text-sm text-slate-400">
                          {bu.blockedAt?.toDate ? format(bu.blockedAt.toDate(), 'yyyy-MM-dd HH:mm') : '---'}
                        </td>
                        <td className="px-8 py-5 text-xs text-slate-500">{bu.blockedBy}</td>
                        <td className="px-8 py-5 text-right">
                          <button
                            onClick={() => bu.id && handleUnblockUser(bu.id)}
                            className="p-2.5 text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all border border-transparent hover:border-emerald-500/20"
                            title="Unblock"
                          >
                            <RefreshCcw className="w-4.5 h-4.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {blockedUsers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-8 py-20 text-center text-slate-600 font-black text-[10px] uppercase tracking-widest">
                          No blocked users
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
              <div className="glass-card p-8 rounded-[30px] border-white/5 flex flex-col justify-between">
                <div>
                  <h4 className="text-lg font-black text-white tracking-tight mb-2">Release Patrol & Cache Buster</h4>
                  <p className="text-slate-400 text-xs font-semibold leading-relaxed mb-6">
                    Membantu mengatasi browser user yang tidak ter-refresh setelah deployment update Netlify. Mengubah versi atau memaksa reload akan langsung menyegarkan browser seluruh staff secara real-time.
                  </p>
                  
                  <form onSubmit={handleUpdateSystemVersion} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Versi Target Sistem Terbaru</label>
                      <div className="flex gap-3">
                        <input
                          type="text"
                          value={newVersionInput}
                          onChange={(e) => setNewVersionInput(e.target.value)}
                          placeholder="Contoh: 2.4.3"
                          className="flex-1 px-4 py-3 bg-[#0f172a] border border-white/10 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                        <button
                          type="submit"
                          disabled={updatingVersion}
                          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-black rounded-xl transition-all uppercase tracking-wider"
                        >
                          {updatingVersion ? 'Saving...' : 'Set Versi'}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>

                <div className="pt-6 border-t border-white/5 mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <span className="block text-[9px] font-black uppercase text-slate-500 tracking-widest leading-none">STATUS VERSI AKTIF</span>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-lg font-black text-white">{appControlData?.currentVersion || '2.4.2'}</span>
                      <span className="text-[10px] font-semibold text-slate-400 px-2 py-0.5 bg-white/5 border border-white/10 rounded-full">
                        Client: {CLIENT_VERSION}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleForceGlobalRefresh}
                    disabled={updatingVersion}
                    className="flex items-center gap-2 px-6 py-3.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-lg shadow-amber-950/20 text-xs uppercase tracking-widest active:scale-[0.98]"
                    title="Memaksa semua user yang sedang membuka portal untuk me-reload halaman & membersihkan cache"
                  >
                    <RefreshCcw className={`w-4 h-4 ${updatingVersion ? 'animate-spin' : ''}`} />
                    Paksa Hard Reload (Bust Cache)
                  </button>
                </div>
              </div>

              {/* Security Advisory / Explanation of Deployment Caching Card */}
              <div className="glass-card p-8 rounded-[30px] border-white/5 bg-gradient-to-br from-indigo-950/20 to-transparent flex flex-col justify-between">
                <div>
                  <h4 className="text-sm font-black uppercase text-indigo-400 tracking-widest mb-3">Panduan Update & Caching</h4>
                  <div className="space-y-3.5 text-xs text-slate-300 font-medium leading-relaxed">
                    <p>
                      <strong className="text-white">Bagaimana cache browser bekerja?</strong> Saat Anda men-deploy update baru ke Netlify, file javascript & HTML akan di-cache secara otomatis oleh browser user untuk menjamin performa cepat.
                    </p>
                    <p>
                      <strong className="text-white">Mengapa user tidak melihat perubahan?</strong> Jika user tidak menutup tab atau merefresh browser secara manual, browser mereka akan terus menjalankan kode lama yang ada di memori aktif tab mereka.
                    </p>
                    <p>
                      <strong className="text-white">Solusi Resmi:</strong> Kami merancang listener real-time. Dengan mengklik tombol <strong className="text-amber-300">"Paksa Hard Reload"</strong>, browser semua user yang sedang online akan langsung dimuat ulang otomatis dengan parameter bypass cache (<code className="text-indigo-300">?u=[timestamp]</code>), menghapus file cache lama seketika tanpa perlu men-crash-kan website!
                    </p>
                  </div>
                </div>
                <div className="pt-4 text-[9px] text-[#8e85cf]/40 font-black uppercase tracking-widest mt-4 flex items-center gap-1.5 select-none">
                  <Shield className="w-3.5 h-3.5 text-indigo-500/50" />
                  Realtime Cache Control System
                </div>
              </div>
            </div>

            {/* 2. Sesi & User Patrol Database List representation */}
            <div className="glass-card rounded-[30px] border-white/5 overflow-hidden">
              <div className="p-8 border-b border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-lg font-black text-white tracking-tight">Active Sessions & Member Patrol</h4>
                  <p className="text-slate-400 text-xs font-semibold mt-1">Daftar staff terdaftar beserta pantauan aktivitas real-time dan opsi penghentian sesi paksa.</p>
                </div>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-3.5 py-1.5 border border-white/5 rounded-full select-none">
                  {allUsers.length} Staff Terdaftar
                </div>
              </div>

              <div className="overflow-x-auto text-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02]">
                      <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Nama Staff</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Status Online</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Terakhir Aktif</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Sesi Admin Status</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right">Aksi Kontrol</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {allUsers.map((usr: any) => {
                      // Check if online (active in custom past 5 mins window)
                      let isOnline = false;
                      if (usr.lastActiveAt) {
                        const activeDiff = currentTime - new Date(usr.lastActiveAt).getTime();
                        isOnline = activeDiff < 300000; // 5 mins range
                      }
                      
                      const forcedState = activeForceLogouts[usr.uid];
                      const isBlocked = blockedUsers.some((bu: any) => bu.id === usr.uid);

                      // Calculate remaining time for countdown UI
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
                        <tr key={usr.uid} className="hover:bg-white/[0.04] transition-all group">
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-indigo-500/10 text-indigo-400 font-bold rounded-xl flex items-center justify-center border border-indigo-500/20 text-xs">
                                {usr.displayName ? usr.displayName.slice(0, 2).toUpperCase() : 'ST'}
                              </div>
                              <div>
                                <span className="block text-sm text-white font-bold">{usr.displayName || 'Staf'}</span>
                                <span className="block text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{usr.email || usr.uid}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-5">
                            {isOnline ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full uppercase tracking-wider animate-pulse">
                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                                Online
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black text-slate-400 bg-white/5 border border-white/10 rounded-full uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full" />
                                Offline
                              </span>
                            )}
                          </td>
                          <td className="px-8 py-5 text-sm font-semibold text-slate-400">
                            {usr.lastActiveAt ? format(new Date(usr.lastActiveAt), 'yyyy-MM-dd HH:mm:ss') : 'Belum tercatat'}
                          </td>
                          <td className="px-8 py-5">
                            <div className="flex flex-wrap gap-1.5">
                              {usr.role === 'admin' ? (
                                <span className="px-2 py-0.5 text-[9px] font-black uppercase text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 rounded">ADMIN</span>
                              ) : (
                                <span className="px-2 py-0.5 text-[9px] font-black uppercase text-slate-400 bg-white/5 border border-white/10 rounded">STAFF</span>
                              )}
                              
                              {isForcedActive && (
                                <span className="px-2 py-0.5 text-[9px] font-black uppercase text-amber-400 bg-amber-500/15 border border-amber-500/25 rounded">SESI TERSETOP</span>
                              )}

                              {isBlocked && (
                                <span className="px-2 py-0.5 text-[9px] font-black uppercase text-rose-400 bg-rose-500/15 border border-rose-500/25 rounded">TERBLOKIR</span>
                              )}
                            </div>
                          </td>
                          <td className="px-8 py-5">
                            <div className="flex items-center justify-end gap-2">
                              {isForcedActive ? (
                                <button
                                  onClick={() => handleClearForceLogout(usr.uid)}
                                  className="px-3.5 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 rounded-xl transition-all text-[9px] font-black uppercase tracking-wider"
                                  title="Pulihkan akses sesi agar user bisa login kembali"
                                >
                                  Batalkan Paksa Logout ({Math.floor(remainingSeconds / 60)}:{(remainingSeconds % 60).toString().padStart(2, '0')})
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleForceLogoutUser(usr.uid, usr.email || usr.displayName)}
                                  className="px-3.5 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 rounded-xl transition-all text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 active:scale-[0.98]"
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
                        <td colSpan={5} className="px-8 py-20 text-center text-slate-500 font-extrabold text-[10px] uppercase tracking-widest">
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
            <div className="glass-card p-10 rounded-[40px] border-white/5 shadow-2xl">
              <div className="flex items-center gap-4 mb-10 pb-6 border-b border-white/5">
                <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                  <Key className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xl font-black text-white tracking-tight">Admin Credentials</h4>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-0.5">Update Panel Access</p>
                </div>
              </div>

              <form onSubmit={handleUpdateConfig} className="space-y-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">New Username</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full px-5 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder={config?.username || 'admin'}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-5 py-3.5 bg-[#0f172a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-900/20 text-xs uppercase tracking-widest"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  Save Changes
                </button>
              </form>

              <div className="mt-12 pt-10 border-t border-white/5">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-400 border border-amber-500/20">
                    <RefreshCcw className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black text-white tracking-tight">Maintenance</h4>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-0.5">System Optimization</p>
                  </div>
                </div>
                
                <div className="p-6 bg-amber-500/5 border border-amber-500/10 rounded-[32px] space-y-6">
                  <div className="flex items-start gap-4">
                    <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
                    <p className="text-xs text-slate-400 font-medium leading-relaxed">
                      Gunakan tombol di bawah untuk menghitung ulang seluruh statistik dashboard dari nol. Gunakan hanya jika angka di dashboard terasa tidak sinkron dengan data asli. Proses ini mungkin memakan waktu jika data sangat banyak.
                    </p>
                  </div>
                  <button
                    onClick={handleRecalculateStats}
                    disabled={isRecalculating}
                    className="w-full py-4 bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 font-black rounded-2xl transition-all flex items-center justify-center gap-3 border border-amber-500/20 text-xs uppercase tracking-widest disabled:opacity-50"
                  >
                    {isRecalculating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCcw className="w-5 h-5" />}
                    Recalculate Dashboard Stats
                  </button>
                </div>

                <div className="p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-[32px] space-y-6 mt-6">
                  <div className="flex items-start gap-4">
                    <Database className="w-5 h-5 text-indigo-400 mt-0.5" />
                    <p className="text-xs text-slate-400 font-medium leading-relaxed">
                      <strong>Inisialisasi Database Baru:</strong> Bila database Anda (<code className="text-xs text-indigo-300">stock-pro-admin</code>) masih kosong atau baru dibuat, klik tombol di bawah untuk mengisi data master default (PIC, Status Aset, Marketplace) serta setelan kontrol versi sistem secara otomatis.
                    </p>
                  </div>
                  <button
                    onClick={handleBootstrapDatabase}
                    disabled={isBootstrapping}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-3 text-xs uppercase tracking-widest active:scale-[0.98]"
                  >
                    {isBootstrapping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
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
            className="bg-[#0f172a] rounded-[2rem] border border-white/5 p-8"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                <Key className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h4 className="text-xl font-black text-white">Autentikasi Keamanan (2FA)</h4>
                <p className="text-slate-400 text-sm mt-1">Kelola akses staf menggunakan kode rahasia 6-digit.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-[#121b2f] p-6 rounded-3xl border border-white/5">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h5 className="font-bold text-white">Wajibkan Kode 2FA</h5>
                    <p className="text-xs text-slate-400 mt-1">Staf harus memasukkan kode untuk login</p>
                  </div>
                  <button
                    onClick={handleToggleAuthCode}
                    className={`w-14 h-8 rounded-full transition-colors relative flex items-center px-1 ${securityData?.authCodeRequired ? 'bg-emerald-500' : 'bg-slate-700'}`}
                  >
                    <div className={`w-6 h-6 rounded-full bg-white transition-transform ${securityData?.authCodeRequired ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                  <p className="text-sm text-blue-300 leading-relaxed">
                    Jika fitur ini <strong>ON</strong>, semua staf yang login menggunakan Google harus memasukkan kode 6 digit di bawah ini. Jika <strong>OFF</strong>, staf dapat login langsung.
                  </p>
                </div>
              </div>

              <div className="bg-[#121b2f] p-6 rounded-3xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-slate-800">
                  <div 
                    className="h-full bg-indigo-500 transition-all duration-1000 ease-linear"
                    style={{ width: `${(totpRemaining / 60) * 100}%` }}
                  />
                </div>
                
                <h5 className="font-black text-slate-400 tracking-widest text-xs uppercase mb-4">Kode Live Saat Ini</h5>
                
                <div className="text-5xl font-black tracking-[0.2em] text-white tabular-nums drop-shadow-2xl">
                  {currentTOTP || '------'}
                </div>
                
                <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-500">
                  <RefreshCcw className={`w-3 h-3 ${totpRemaining < 10 ? 'text-rose-400 animate-spin' : ''}`} />
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
            className="bg-[#0f172a] rounded-[2rem] border border-white/5 p-8"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                <Megaphone className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h4 className="text-xl font-black text-white">Notifikasi Global Real-Time</h4>
                <p className="text-slate-400 text-sm mt-1">Kirim pesan penting ke seluruh perangkat yang sedang aktif.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Form Send Notification */}
              <div className="bg-[#121b2f] p-6 rounded-3xl border border-white/5 space-y-6">
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Tipe Notifikasi</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'wa-alert', label: 'WhatsApp', icon: MessageCircle, color: 'emerald' },
                      { id: 'info', label: 'Info', icon: AlertCircle, color: 'indigo' },
                      { id: 'warning', label: 'Warning', icon: AlertCircle, color: 'amber' },
                      { id: 'success', label: 'Success', icon: CheckCircle2, color: 'blue' }
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setNotificationType(t.id as any)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                          notificationType === t.id 
                            ? `bg-${t.color}-500/20 border-${t.color}-500/50 text-${t.color}-400 shadow-[0_0_15px_rgba(var(--${t.color}-500),0.2)]` 
                            : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                        }`}
                      >
                        <t.icon className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Pesan Notifikasi</label>
                  <textarea
                    value={notificationMessage}
                    onChange={(e) => setNotificationMessage(e.target.value)}
                    placeholder="Ketik pesan untuk semua user..."
                    rows={3}
                    className="w-full bg-[#0f172a] text-white py-3 px-4 rounded-xl border border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none transition-all placeholder:text-white/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Durasi Tampil (Menit)</label>
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
                              ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                              : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 font-bold">Kustom:</span>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={notificationDuration}
                        onChange={(e) => setNotificationDuration(parseFloat(e.target.value) || 0)}
                        className="flex-1 bg-[#0f172a] text-white py-2 px-3 rounded-xl border border-white/10 focus:border-indigo-500 outline-none text-sm"
                        placeholder="Contoh: 10"
                      />
                      <span className="text-xs text-slate-500 font-bold">Menit</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={(e) => handleSendGlobalNotification(e)}
                  disabled={isSendingNotification || !notificationMessage.trim()}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 text-xs uppercase tracking-widest active:scale-[0.98]"
                >
                  {isSendingNotification ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                  Kirim Sekarang
                </button>
              </div>

              {/* Quick Actions & Status */}
              <div className="space-y-6">
                {activeGlobalAlert?.isActive && (
                  <div className="bg-rose-500/10 p-6 rounded-3xl border border-rose-500/20 animate-pulse">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h5 className="font-black text-rose-400 text-sm uppercase tracking-widest mb-1 flex items-center gap-2">
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

                <div className="bg-[#121b2f] p-6 rounded-3xl border border-white/5">
                  <h5 className="font-bold text-white mb-4 flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-emerald-400" />
                    Preset Cepat (1-Klik)
                  </h5>
                  <div className="space-y-3">
                    <button
                      onClick={() => handleSendGlobalNotification(undefined, 'wa-alert', 'Ada Chat WhatsApp masuk dari customer, mohon segera dicek!', 0.25)}
                      className="w-full flex items-center justify-between p-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl transition-all group"
                    >
                      <span className="text-sm font-semibold text-emerald-100">"Ada Chat WA Baru" (15 Detik)</span>
                      <Megaphone className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                    </button>
                    
                    <button
                      onClick={() => handleSendGlobalNotification(undefined, 'warning', 'Sistem sedang sibuk / lambat. Harap bersabar dan jangan refresh berulang kali.', 5)}
                      className="w-full flex items-center justify-between p-3.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-xl transition-all group"
                    >
                      <span className="text-sm font-semibold text-amber-100">"Sistem Sibuk" (5 Menit)</span>
                      <Megaphone className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                    </button>
                    
                    <button
                      onClick={() => handleSendGlobalNotification(undefined, 'info', 'Mohon selesaikan packing dan orderan secepatnya, jam pickup akan segera tiba.', 60)}
                      className="w-full flex items-center justify-between p-3.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-xl transition-all group"
                    >
                      <span className="text-sm font-semibold text-indigo-100">"Persiapan Pickup" (1 Jam)</span>
                      <Megaphone className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-start gap-3">
                  <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Notifikasi sekarang tidak bisa ditutup manual oleh staf. Pesan akan hilang secara otomatis sesuai timer atau dengan menekan tombol Hentikan Notifikasi di panel ini.
                  </p>
                </div>
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
