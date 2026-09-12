import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  signInAnonymously,
  User
} from 'firebase/auth';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc, 
  limit, 
  where, 
  or, 
  Timestamp 
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { Report, OperationType, UserProfile, DashboardStats } from './types';
import { handleFirestoreError, normalizeDate } from './utils';
import { recalculateStats } from './stats';
import { ErrorBoundary } from './ErrorBoundary';
import ReportForm from './ReportForm';
import ReportTable from './ReportTable';
import Dashboard from './Dashboard';
import AdminPanel from './AdminPanel';
import DataMatcher from './DataMatcher';
import CloudVault from './CloudVault';
import DailyOrders from './DailyOrders';
import BundlingAdminStock from './BundlingAdminStock';
import PackingListCheck from './PackingListCheck';
import ShippingMatcher from './ShippingMatcher';
import StaffSchedule from './StaffSchedule';
import AdminDataImport from './AdminDataImport';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Table as TableIcon, 
  LogOut, 
  Layout,
  User as UserIcon,
  Loader2,
  Database,
  Package,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Shield,
  UserX,
  ArrowRightLeft,
  Cloud,
  PackageX,
  AlertCircle,
  Menu,
  X,
  TrendingUp,
  FolderSearch,
  Calendar,
  Key,
  ChevronLeft,
  CloudDownload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateTOTPCode } from './totp';
import GlobalNotificationBanner from './GlobalNotificationBanner';

const EMPTY_ARRAY: any[] = [];
const CLIENT_VERSION = "2.4.2";
const APP_LOAD_TIME = Date.now();

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const [isAdminRoute] = useState<boolean>(() => {
    return window.location.pathname.startsWith('/admin');
  });

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      return 'staff_schedule';
    }
    return localStorage.getItem('adminPro_activeTab') || 'dashboard';
  });

  useEffect(() => {
    if (!isMobileDevice) {
      localStorage.setItem('adminPro_activeTab', activeTab);
    } else if (activeTab !== 'staff_schedule') {
      setActiveTab('staff_schedule');
    }
  }, [activeTab, isMobileDevice]);

  const [reports, setReports] = useState<Report[]>([]);
  const [transactions, setTransactions] = useState<Report[]>([]);
  const [globalDateFilter, setGlobalDateFilter] = useState<string>('');
  const [globalSearchTerm, setGlobalSearchTerm] = useState<string>('');
  const [globalMarketplaceFilter, setGlobalMarketplaceFilter] = useState<string>('');
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [isFisikOpen, setIsFisikOpen] = useState(false);
  const isRecalculatingRef = useRef(false);
  const [devUser, setDevUser] = useState<any>(null);
  const [typedChars, setTypedChars] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const isLoggingInRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);
  
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [authCodeInput, setAuthCodeInput] = useState('');
  const [authCodeError, setAuthCodeError] = useState('');
  const [tempUser, setTempUser] = useState<User | null>(null);

  const navRef = useRef<HTMLElement>(null);

  const checkScroll = () => {
    if (navRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = navRef.current;
      setCanScrollDown(scrollHeight - scrollTop > clientHeight + 5);
      setCanScrollUp(scrollTop > 5);
    }
  };

  useEffect(() => {
    // Check scroll on any render state or tab toggle / section expand
    const timer = setTimeout(checkScroll, 120);
    window.addEventListener('resize', checkScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkScroll);
    };
  }, [activeTab, isFisikOpen, reports, userProfile, isMobileSidebarOpen]);

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
    setIsMobileSidebarOpen(false);
  };

  useEffect(() => {
    const handleSwitchTab = (e: any) => {
      if (e.detail) handleTabClick(e.detail);
    };
    window.addEventListener('switchTab', handleSwitchTab);
    return () => window.removeEventListener('switchTab', handleSwitchTab);
  }, []);

  useEffect(() => {
    if (user) {
      if (user.isAnonymous) {
        setUserProfile({
          uid: user.uid,
          email: 'jgilbeth92@gmail.com',
          displayName: 'Pengembang (Bypass)',
          role: 'admin'
        });
        setIsBlocked(false);
        return;
      }
      const unsubProfile = onSnapshot(doc(db, 'users', user.uid), (snap) => {
        if (snap.exists()) {
          setUserProfile(snap.data() as UserProfile);
        } else {
          setUserProfile({
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || '',
            role: (user.email === 'jgilbeth92@gmail.com' || user.email === 'developer@example.com') ? 'admin' : 'staff'
          });
        }
      }, (error) => {
        console.warn("unsubProfile sync error:", error);
      });
      const unsubBlocked = onSnapshot(doc(db, 'blocked_users', user.uid), (snap) => {
        setIsBlocked(snap.exists());
      }, (error) => {
        console.warn("unsubBlocked sync error:", error);
      });
      return () => {
        unsubProfile();
        unsubBlocked();
      };
    } else if (devUser) {
      setUserProfile({
        uid: devUser.uid,
        email: devUser.email,
        displayName: devUser.displayName,
        role: 'admin'
      });
      setIsBlocked(false);
    } else {
      setUserProfile(null);
      setIsBlocked(false);
    }
  }, [user, devUser]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const newTyped = (typedChars + e.key).slice(-7);
      setTypedChars(newTyped);
      if (newTyped === 'devmode') {
        localStorage.setItem('login_timestamp_ms', Date.now().toString());
        setDevUser({
          uid: 'dev-user-id',
          email: 'developer@example.com',
          displayName: 'Developer Mode (Offline)'
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [typedChars]);

  // Double-Hardened session validation: signs out automatically upon day transitions
  useEffect(() => {
    const checkDayChange = async () => {
      const todayStr = new Date().toLocaleDateString('en-CA');
      const lastActiveDateStr = localStorage.getItem('last_active_date');
      
      if (user || devUser) {
        if (!lastActiveDateStr) {
          localStorage.setItem('last_active_date', todayStr);
        } else if (lastActiveDateStr !== todayStr) {
          const lastActiveDate = new Date(lastActiveDateStr);
          const today = new Date(todayStr);
          const diffTime = Math.abs(today.getTime() - lastActiveDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays >= 3) {
            localStorage.removeItem('last_active_date');
            try {
              await signOut(auth);
            } catch (e) {
              console.error('Sign Out failed during session expiration: ', e);
            }
            setUser(null);
            setDevUser(null);
          } else {
            // Refresh the rolling window since user is active today
            localStorage.setItem('last_active_date', todayStr);
          }
        }
      }
    };
    
    checkDayChange();
    
    // Check every 30 seconds for active users/open tabs
    const checkInterval = setInterval(checkDayChange, 30000);
    return () => clearInterval(checkInterval);
  }, [user, devUser]);

  // Real-time listener for force logouts & version updates
  useEffect(() => {
    if (!user) return;

    // 1. Force Logout Listener: listen on metadata/force_logouts (we list active force logouts here)
    const unsubForceLogout = onSnapshot(doc(db, 'metadata', 'force_logouts'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const userLogoutRequest = data?.activeForceLogouts?.[user.uid];
        if (userLogoutRequest) {
          const forcedAtValue = userLogoutRequest.forcedAt;
          
          let forcedAtTime = 0;
          if (forcedAtValue && typeof forcedAtValue === 'object' && 'toDate' in forcedAtValue) {
            forcedAtTime = forcedAtValue.toDate().getTime();
          } else if (typeof forcedAtValue === 'number') {
            forcedAtTime = forcedAtValue;
          } else if (forcedAtValue && typeof forcedAtValue === 'string') {
            forcedAtTime = new Date(forcedAtValue).getTime();
          }

          // If the forced-logout action was created after the user's current session started, trigger hard logout!
          if (forcedAtTime > APP_LOAD_TIME) {
            console.log("Forced logout matching timestamp - Logging out!");
            alert("Akses Sesi Anda telah diakhiri oleh Administrator. Klik OK untuk Keluar Aplikasi.");
            localStorage.removeItem('login_timestamp_ms');
            localStorage.removeItem('2fa_verified');
            signOut(auth).then(() => {
              window.location.reload();
            });
          }
        }
      }
    }, (err) => {
      console.warn("Metadata force_logouts listener read exception:", err);
    });

    // 2. Apps Version / Hard reload listener
    const unsubAppControl = onSnapshot(doc(db, 'metadata', 'app_control'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const dbVersion = data?.currentVersion;
        const forceRefreshAt = data?.forceRefreshAt;

        // Check if version mismatch
        if (dbVersion && dbVersion !== CLIENT_VERSION) {
          let forceRefreshTime = 0;
          if (forceRefreshAt && typeof forceRefreshAt === 'object' && 'toDate' in forceRefreshAt) {
            forceRefreshTime = forceRefreshAt.toDate().getTime();
          } else if (typeof forceRefreshAt === 'number') {
            forceRefreshTime = forceRefreshAt;
          } else if (forceRefreshAt && typeof forceRefreshAt === 'string') {
            forceRefreshTime = new Date(forceRefreshAt).getTime();
          }

          if (forceRefreshTime > APP_LOAD_TIME) {
            console.log("Force reload flag active from admin - reloading...");
            alert("Sistem diperbarui ke versi " + dbVersion + ". Halaman akan dimuat ulang untuk memperbarui cache sitem.");
            // Force hard reload (cache bust via query param so we bypass Service Worker/browser cache)
            window.location.href = window.location.pathname + "?u=" + Date.now();
          }
        }
      }
    }, (err) => {
      console.warn("Metadata app_control listener error:", err);
    });

    return () => {
      unsubForceLogout();
      unsubAppControl();
    };
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          // Check Strict 3-day (72h) login expiration
          const loginTsStr = localStorage.getItem('login_timestamp_ms');
          let shouldLogout = false;
          if (!loginTsStr) {
            // Legacy handling: set it now if it doesn't exist
            localStorage.setItem('login_timestamp_ms', Date.now().toString());
          } else {
            const loginTs = parseInt(loginTsStr, 10);
            const diffHours = (Date.now() - loginTs) / (1000 * 60 * 60);
            if (diffHours >= 72) {
              shouldLogout = true;
            }
          }

          if (shouldLogout) {
            localStorage.removeItem('login_timestamp_ms');
            localStorage.removeItem('2fa_verified');
            await signOut(auth);
            setUser(null);
            setDevUser(null);
            setLoading(false);
            return;
          }

          // Developer/Admin bypass
          const isBypass = currentUser.email === 'jgilbeth92@gmail.com' || currentUser.email === 'developer@example.com';

          if (!isBypass) {
            // Check 2FA Requirement
            try {
              const securitySnap = await getDoc(doc(db, 'metadata', 'security'));
              const is2FARequired = securitySnap.exists() && securitySnap.data().authCodeRequired === true;
              const is2FAVerified = localStorage.getItem('2fa_verified') === 'true';

              if (is2FARequired && !is2FAVerified) {
                setTempUser(currentUser);
                setShow2FAModal(true);
                setLoading(false);
                return;
              }
            } catch (secErr) {
              console.warn("Security check warning:", secErr);
            }
          }

          finalizeLogin(currentUser);
        } else {
          localStorage.removeItem('2fa_verified');
          localStorage.removeItem('login_timestamp_ms');
          setUser(null);
          setDevUser(null);
          setLoading(false);
        }
      } catch (error: any) {
        console.error('Auth state change error:', error);
        if (error?.message?.includes('quota') || error?.code === 'resource-exhausted') {
          setQuotaExceeded(true);
        }
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const finalizeLogin = (currentUser: User) => {
    setUser(currentUser);
    setLoading(false);
    if (currentUser.isAnonymous) {
      setDevUser({
        uid: currentUser.uid,
        email: 'developer@example.com',
        displayName: 'Developer Mode'
      });
    } else {
      // Check/Update user profile in background
      const userRef = doc(db, 'users', currentUser.uid);
      const isSuperAdmin = currentUser.email === 'jgilbeth92@gmail.com' || currentUser.email === 'developer@example.com';
      getDoc(userRef).then(async (userSnap) => {
        const existingData = userSnap.exists() ? userSnap.data() : {};
        const role = existingData?.role || (isSuperAdmin ? 'admin' : 'staff');
        const profileData = {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || existingData?.displayName || 'Staf',
          role: role,
          lastActiveAt: new Date().toISOString(),
          ...(!userSnap.exists() ? { createdAt: new Date().toISOString() } : {})
        };
        await setDoc(userRef, profileData, { merge: true });
      }).catch(err => console.warn("Profile Initialization Error:", err));
      setDevUser(null);
    }
  };

  const handleVerify2FA = async () => {
    setAuthCodeError('');
    if (!authCodeInput || authCodeInput.length !== 6) {
      setAuthCodeError('Kode harus 6 digit angka.');
      return;
    }
    
    const expectedCode = await generateTOTPCode();
    if (authCodeInput === expectedCode) {
      localStorage.setItem('2fa_verified', 'true');
      setShow2FAModal(false);
      if (tempUser) finalizeLogin(tempUser);
    } else {
      setAuthCodeError('Kode salah atau sudah kadaluarsa.');
    }
  };

  const handleCancel2FA = async () => {
    setShow2FAModal(false);
    setTempUser(null);
    await signOut(auth);
  };

  const currentUser = useMemo(() => user || devUser, [user, devUser]);
  const isAdmin = useMemo(() => userProfile?.role === 'admin', [userProfile]);

  // Update activity status periodically (every 2 minutes) for active online users
  useEffect(() => {
    if (!currentUser || currentUser.uid === 'dev-user-id') return;

    const updateActivity = async () => {
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        await setDoc(userRef, {
          lastActiveAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.warn("Failed to update real-time user presence:", err);
      }
    };

    const interval = setInterval(updateActivity, 120000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Fetch from 'reports' and 'transactions'
  useEffect(() => {
    if (!user) return;

    setIsDataLoading(true);
    let reportsDone = false;
    let transactionsDone = false;

    const checkDone = () => {
      if (reportsDone && transactionsDone) {
        setIsDataLoading(false);
      }
    };

    // Helper to merge results from multiple listeners
    const reportResults = new Map<string, Report>();
    const transactionResults = new Map<string, Report>();

    // Cleanup functions
    const unsubs: (() => void)[] = [];

    // Unified processing functions
    const processSnapReports = (snapshot: any) => {
      snapshot.docChanges().forEach((change: any) => {
        if (change.type === 'removed') {
          reportResults.delete(change.doc.id);
        } else {
          reportResults.set(change.doc.id, mapReportDoc(change.doc));
        }
      });
      setReports(Array.from(reportResults.values()));
      reportsDone = true;
      checkDone();
    };

    const processSnapTransactions = (snapshot: any) => {
      snapshot.docChanges().forEach((change: any) => {
        if (change.type === 'removed') {
          transactionResults.delete(change.doc.id);
        } else {
          transactionResults.set(change.doc.id, mapTransactionDoc(change.doc));
        }
      });
      setTransactions(Array.from(transactionResults.values()));
      transactionsDone = true;
      checkDone();
    };

    // Improved status normalizing helper
    const getNormalizedStatus = (status: any, type: any): string => {
      const s = String(status || type || '').toUpperCase().trim();
      
      // AFKIR / RUSAK FISIK (Prioritize FISIK check)
      if (
        s.includes('RUSAK FISIK') || 
        s.includes('RUSAK_FISIK') ||
        s.includes('AFKIR FISIK') ||
        (s.includes('FISIK') && s.includes('RUSAK')) ||
        s === 'DAMAGED'
      ) return 'Rusak Fisik';
      
      // ELIMINASI / RUSAK INTERNAL
      if (
        s === 'OUT' || 
        s === 'ELIMINASI' || 
        s === 'RUSAK' || 
        s.includes('INTERNAL') ||
        s.includes('ELIMINASI INTERNAL') ||
        s.includes('STOK RUSAK') ||
        s.includes('RUSAK_INTERNAL') ||
        s.includes('LOG BARANG RUSAK') ||
        s.includes('BARANG RUSAK') ||
        s.includes('LOG RUSAK') ||
        s.includes('RUSAK_LT3') ||
        s.includes('RUSAK_LANTAI3')
      ) return 'Eliminasi Stok Rusak';
      
      if (s.includes('RETUR')) return 'Retur Fisik';
      if (s.includes('CANCEL') || s === 'BATAL' || s === 'DIBATALKAN') return 'Cancel Fisik';
      if (s.includes('BUNDLING') || s.includes('BUNDLE')) return 'Bundling Fisik';
      
      return String(status || type || '');
    };

    const getInferredCategory = (status: string, currentCategory: string, type: string, source: string, sku: string): string => {
      // Priority 1: Explicit category
      if (currentCategory === 'rusak_internal' || currentCategory === 'eliminasi_rusak') return 'rusak_internal';
      if (currentCategory === 'stok_lt3') return 'stok_lt3';

      // Priority 2: Status match
      if (status === 'Eliminasi Stok Rusak') return 'rusak_internal';
      if (status === 'Rusak Fisik') return 'stok_lt3';
      
      // Priority 3: Type and other indicators
      if (type === 'OUT' || type === 'RUSAK_INTERNAL' || type === 'ELIMINASI') return 'rusak_internal';
      
      // Legacy data check (If SKU exists and status contains internal markers)
      const rawStatus = (status || '').toUpperCase();
      if (rawStatus.includes('INTERNAL') || rawStatus === 'OUT') return 'rusak_internal';

      return currentCategory || 'stok_lt3';
    };

    const mapReportDoc = (doc: any) => {
      const d = doc.data();
      const sku = d.sku || d.sku_id || d.item_code || '';
      const normalizedStatus = getNormalizedStatus(d.status, '');
      const category = getInferredCategory(normalizedStatus, d.category, '', 'reports', sku);
      
      const createdAt = d.createdAt || d.created_at || d.timestamp || d.updatedAt || null;
      let _sortTs = 0;
      let inputDateStr = d.inputDate || d.logDate || d.date || d.tanggal || '';

      if (createdAt) {
        if (typeof createdAt.toDate === 'function') _sortTs = createdAt.toDate().getTime();
        else if (createdAt instanceof Date) _sortTs = createdAt.getTime();
        else if (createdAt.seconds !== undefined) _sortTs = createdAt.seconds * 1000 + (createdAt.nanoseconds || 0) / 1000000;
        else if (typeof createdAt === 'number') _sortTs = createdAt;
        else if (typeof createdAt === 'string') {
          const dts = new Date(createdAt);
          _sortTs = isNaN(dts.getTime()) ? 0 : dts.getTime();
        }
      } 
      
      if (!inputDateStr && _sortTs > 0) {
        inputDateStr = new Date(_sortTs).toISOString().split('T')[0];
      }

      if (_sortTs === 0 && inputDateStr) {
        const dts = new Date(normalizeDate(inputDateStr));
        _sortTs = isNaN(dts.getTime()) ? 0 : dts.getTime();
      }

      return {
        id: doc.id,
        _source: 'reports',
        ...d,
        category,
        sku: d.sku || d.sku_id || d.item_code || '',
        quantity: d.quantity || d.qty || 0,
        inputDate: normalizeDate(inputDateStr),
        status: d.status || '',
        normalizedStatus,
        createdAt,
        _sortTs
      } as Report & { _sortTs: number };
    };

    const mapTransactionDoc = (doc: any) => {
      const d = doc.data();
      const sku = d.sku_id || d.sku || d.item_code || '';
      const normalizedStatus = getNormalizedStatus(d.status, d.type || '');
      const category = getInferredCategory(normalizedStatus, d.category, d.type || '', 'transactions', sku);
      
      const createdAt = d.created_at || d.createdAt || d.timestamp || d.updatedAt || null;
      let _sortTs = 0;
      let inputDateStr = d.date || d.inputDate || d.logDate || d.tanggal || '';

      if (createdAt) {
        if (typeof createdAt.toDate === 'function') _sortTs = createdAt.toDate().getTime();
        else if (createdAt instanceof Date) _sortTs = createdAt.getTime();
        else if (createdAt.seconds !== undefined) _sortTs = createdAt.seconds * 1000 + (createdAt.nanoseconds || 0) / 1000000;
        else if (typeof createdAt === 'number') _sortTs = createdAt;
        else if (typeof createdAt === 'string') {
          const dts = new Date(createdAt);
          _sortTs = isNaN(dts.getTime()) ? 0 : dts.getTime();
        }
      }
      
      if (!inputDateStr && _sortTs > 0) {
        inputDateStr = new Date(_sortTs).toISOString().split('T')[0];
      }

      if (_sortTs === 0 && inputDateStr) {
        const dts = new Date(normalizeDate(inputDateStr));
        _sortTs = isNaN(dts.getTime()) ? 0 : dts.getTime();
      }

      return {
        id: doc.id,
        ...d, // Spread all fields to avoid missing data
        _source: 'transactions',
        category,
        sku: d.sku_id || d.sku || d.item_code || '',
        quantity: d.quantity || d.qty || 0,
        inputDate: normalizeDate(inputDateStr),
        createdAt,
        createdBy: d.created_by || d.createdBy || d.analis || '',
        marketplace: d.marketplace || 'Umum',
        invoiceNumber: d.invoice_number || d.invoiceNumber || d.id,
        status: d.status || '',
        normalizedStatus,
        itemDescription: d.item_name || d.itemDescription || '',
        _sortTs
      } as Report & { _sortTs: number };
    };

    // Single listener per collection with a generous limit covers most recent activity
    // and keeps the connection stable (fixing "Could not reach backend" error)
    const reportsQuery = query(
      collection(db, 'reports'), 
      orderBy('created_at', 'desc'), 
      limit(2500)
    );
    unsubs.push(onSnapshot(reportsQuery, processSnapReports, (err) => {
      console.warn("Reports Sync Error:", err);
      if (err.message.includes('quota')) setQuotaExceeded(true);
      reportsDone = true;
      checkDone();
    }));

    const transactionsQuery = query(
      collection(db, 'transactions'), 
      orderBy('created_at', 'desc'), 
      limit(2500)
    );
    unsubs.push(onSnapshot(transactionsQuery, processSnapTransactions, (err) => {
      console.warn("Transactions Sync Error:", err);
      if (err.message.includes('quota')) setQuotaExceeded(true);
      transactionsDone = true;
      checkDone();
    }));

    return () => {
      unsubs.forEach(unsub => unsub());
    };

  }, [user]);

  // Fetch Dashboard Stats
  useEffect(() => {
    if (!user) return;

    const unsubscribeStats = onSnapshot(doc(db, 'metadata', 'dashboard_stats'), (snapshot) => {
      if (snapshot.exists()) {
        setDashboardStats(snapshot.data() as DashboardStats);
      } else if (!isRecalculatingRef.current && (isAdmin || user?.email === 'jgilbeth92@gmail.com')) {
        // If stats don't exist, try to initialize them (only once)
        isRecalculatingRef.current = true;
        console.log('App.tsx: Dashboard stats not found, initializing...');
        recalculateStats()
          .catch(err => console.error('Error initializing stats:', err))
          .finally(() => {
            isRecalculatingRef.current = false;
          });
      }
    }, (error) => {
      console.warn("Dashboard stats sync error:", error);
    });

    return () => unsubscribeStats();
  }, [user, isAdmin]);

  const allReports = useMemo(() => {
    if (reports.length === 0 && transactions.length === 0) return EMPTY_ARRAY;
    
    // Filter out 'analis system' / 'SYSTEM' as requested
    const combined = [...reports, ...transactions].filter(r => {
      const creator = (r.createdBy || r.picGinee || (r as any).analis || '').toUpperCase();
      return !creator.includes('SYSTEM');
    });

    // Sort combined data using the pre-calculated timestamp
    return combined.sort((a: any, b: any) => {
      const tA = a._sortTs || 0;
      const tB = b._sortTs || 0;
      
      if (tB !== tA) return tB - tA;
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [reports, transactions]);

  const handleLogin = async () => {
    if (isLoggingInRef.current) return;
    isLoggingInRef.current = true;
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      localStorage.setItem('login_timestamp_ms', Date.now().toString());
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (
        error?.code === 'auth/cancelled-popup-request' ||
        error?.code === 'auth/popup-closed-by-user' ||
        error?.message?.includes('cancelled-popup-request') ||
        error?.message?.includes('popup-closed-by-user')
      ) {
        console.log('Login popup was cancelled or closed by user.');
        return;
      }

      console.error('Login error:', error);
      if (error?.code === 'auth/popup-blocked' || error?.message?.includes('popup-blocked')) {
        setAuthError('Popup login Google diblokir oleh browser. Silakan aktifkan/izinkan popup di browser Anda dan coba lagi.');
      } else if (error?.code === 'auth/unauthorized-domain' || error?.message?.includes('unauthorized-domain')) {
        setAuthError('unauthorized-domain');
      } else if (error?.code === 'auth/network-request-failed' || error?.message?.includes('network-request-failed')) {
        setAuthError('Koneksi internet bermasalah. Silakan periksa jaringan Anda dan coba lagi.');
      } else {
        setAuthError(error?.message || 'Gagal masuk dengan akun Google.');
      }
    } finally {
      isLoggingInRef.current = false;
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('login_timestamp_ms');
    localStorage.removeItem('2fa_verified');
    signOut(auth);
    setUser(null);
    setDevUser(null);
  };

  if (quotaExceeded) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6">
        <div className="glass-card p-12 rounded-[48px] border-amber-500/20 text-center max-w-md">
          <div className="w-24 h-24 bg-amber-500/10 rounded-[32px] flex items-center justify-center text-amber-400 border border-amber-500/20 mx-auto mb-8">
            <AlertCircle className="w-12 h-12" />
          </div>
          <h2 className="text-3xl font-black text-white mb-4 tracking-tight">Limit Kuota Tercapai</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            Batas pembacaan database harian (Free Tier) telah tercapai. Sistem akan pulih secara otomatis setelah kuota direset oleh Google (biasanya setiap tengah malam).
          </p>
          <a
            href="https://firebase.google.com/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-4 bg-white/5 hover:bg-white/10 text-white font-black rounded-2xl transition-all border border-white/10 text-xs uppercase tracking-widest text-center"
          >
            Pelajari Tentang Kuota
          </a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#020617]">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-500/20 blur-[50px] animate-pulse rounded-full"></div>
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin relative z-10" />
        </div>
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-8 animate-pulse italic">
          Menyiapkan Lingkungan Kerja...
        </p>
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6">
        <div className="glass-card p-12 rounded-[48px] border-rose-500/20 text-center max-w-md">
          <div className="w-24 h-24 bg-rose-500/10 rounded-[32px] flex items-center justify-center text-rose-500 border border-rose-500/20 mx-auto mb-8">
            <UserX className="w-12 h-12" />
          </div>
          <h2 className="text-3xl font-black text-white mb-4 tracking-tight">Akses Diblokir</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            Akun Anda telah diblokir oleh administrator. Silakan hubungi tim IT untuk informasi lebih lanjut.
          </p>
          <button
            onClick={() => signOut(auth)}
            className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-black rounded-2xl transition-all border border-white/10 text-xs uppercase tracking-widest"
          >
            Keluar Sistem
          </button>
        </div>
      </div>
    );
  }

  if (show2FAModal) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6 select-none relative overflow-hidden">
        {/* Background Ambient */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-[20%] left-[20%] w-[40%] h-[40%] bg-[#4f46e5]/10 blur-[120px] rounded-full" />
        </div>
        
        <div className="glass-card p-10 rounded-[3rem] border-indigo-500/20 text-center max-w-sm w-full relative z-10">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50" />
          
          <div className="w-20 h-20 bg-indigo-500/10 rounded-[2rem] flex items-center justify-center text-indigo-400 border border-indigo-500/20 mx-auto mb-6 shadow-xl shadow-indigo-900/20">
            <Key className="w-10 h-10" />
          </div>
          
          <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Autentikasi 2FA</h2>
          <p className="text-slate-400 text-xs leading-relaxed mb-8">
            Admin telah mewajibkan keamanan berlapis. Masukkan 6 digit kode dari admin untuk melanjutkan.
          </p>

          <input
            type="text"
            value={authCodeInput}
            onChange={(e) => setAuthCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full bg-[#0f172a] text-white text-center text-3xl tracking-[0.3em] font-black py-4 rounded-2xl border border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none mb-2 transition-all placeholder:text-white/10"
            placeholder="000000"
            maxLength={6}
          />
          
          <div className="h-6 flex items-center justify-center mb-2">
            {authCodeError && (
              <p className="text-rose-400 text-xs font-bold animate-in fade-in slide-in-from-bottom-1">{authCodeError}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleCancel2FA}
              className="py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl transition-all border border-white/5 text-xs uppercase tracking-widest hover:text-white active:scale-95"
            >
              Batal
            </button>
            <button
              onClick={handleVerify2FA}
              disabled={authCodeInput.length !== 6}
              className="py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-lg shadow-indigo-900/20 text-xs uppercase tracking-widest active:scale-95"
            >
              Verifikasi
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isAdminRoute) {
    return (
      <div className="min-h-screen bg-[#020617] w-full overflow-y-auto font-sans text-slate-300">
        <header className="bg-[#120a32]/80 backdrop-blur-xl p-4 sm:px-8 flex justify-between items-center border-b border-white/10 sticky top-0 z-50">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/20">
               <Shield className="w-5 h-5 text-white" />
             </div>
             <div>
               <div className="text-white font-black tracking-wider uppercase text-sm leading-tight">Admin Route</div>
               <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Akses Rahasia</div>
             </div>
          </div>
          <button 
            onClick={() => window.location.href = '/'} 
            className="flex items-center gap-2 text-slate-300 hover:text-white transition-all bg-white/5 hover:bg-white/10 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border border-white/5"
          >
             <ChevronLeft className="w-4 h-4" /> 
             <span className="hidden sm:inline">Aplikasi Utama</span>
             <span className="sm:hidden">Kembali</span>
          </button>
        </header>
        <div className="p-4 sm:p-8 max-w-7xl mx-auto">
           <AdminPanel user={currentUser} />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen w-full bg-[#1b1245] flex flex-col justify-between font-sans relative overflow-hidden select-none">
        {/* Full-bleed Animated Background Blur Highlights */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-[#4f46e5]/10 blur-[140px] rounded-full" />
          <div className="absolute -bottom-[10%] -right-[10%] w-[60%] h-[60%] bg-[#db2777]/10 blur-[160px] rounded-full" />
          <div className="absolute top-[30%] right-[10%] w-[40%] h-[40%] bg-[#2563eb]/10 blur-[130px] rounded-full" />

          {/* Ambient lazy-spinning wind turbines matching the theme on mobile/tablet */}
          <div className="absolute bottom-[5%] left-[2%] w-48 h-96 opacity-[0.20] pointer-events-none select-none">
            <svg viewBox="0 0 100 150" className="w-full h-full">
              <path d="M47,150 L53,150 L51.5,50 L48.5,50 Z" fill="#6366f1" opacity="0.3" />
              <circle cx="50" cy="50" r="3.5" fill="#ffffff" />
              <g className="origin-[50px_50px] animate-[spin_12s_linear_infinite]">
                <path d="M50,50 C50,50 49,12 50,5 C51,12 50,50 50,50" fill="#ffffff" opacity="0.85" />
                <path d="M50,50 C50,50 86,72 90,75 C86,77 50,50 50,50" fill="#ffffff" opacity="0.8" />
                <path d="M50,50 C50,50 14,72 10,75 C14,77 50,50 50,50" fill="#ffffff" opacity="0.8" />
              </g>
            </svg>
          </div>
          <div className="absolute top-[12%] right-[5%] w-40 h-80 opacity-[0.16] pointer-events-none select-none">
            <svg viewBox="0 0 100 150" className="w-full h-full">
              <path d="M48,150 L52,150 L51,60 L49,60 Z" fill="#6366f1" opacity="0.25" />
              <circle cx="50" cy="60" r="2.5" fill="#f1f5f9" />
              <g className="origin-[50px_60px] animate-[spin_18s_linear_infinite]">
                <path d="M50,60 C50,60 49.2,25 50,18 C50.8,25 50,60 50,60" fill="#ccfbf1" opacity="0.8" />
                <path d="M50,60 C50,60 82,78 86,81 C82,83 50,60 50,60" fill="#ccfbf1" opacity="0.75" />
                <path d="M50,60 C50,60 18,78 14,81 C18,83 50,60 50,60" fill="#ccfbf1" opacity="0.75" />
              </g>
            </svg>
          </div>
        </div>

        {/* Outer Content Container - centering everything horizontally and taking full scale */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-12 py-6 sm:py-8 flex flex-col justify-between min-h-screen flex-1">
          
          {/* Top Header Section */}
          <header className="py-2 sm:py-4 flex justify-between items-center z-20">
            {/* App logo and name */}
            <div className="flex items-center gap-3">
              <div id="landing-logo-container" className="w-10 h-10 bg-[#634be9] rounded-xl flex items-center justify-center shadow-lg shadow-indigo-950/30 border border-indigo-400/20">
                <Shield id="landing-logo-icon" className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <span className="font-extrabold text-white text-base sm:text-lg tracking-tight">Admin Report Pro</span>
                <div className="text-[10px] text-[#b498ff] font-bold uppercase tracking-widest leading-none mt-0.5">SINKRONISASI AKTIF</div>
              </div>
            </div>

            {/* Navigation Links mimicking the reference mock */}
            <nav className="hidden lg:flex items-center gap-8 text-xs font-semibold uppercase tracking-widest text-[#a89eff]/60">
              <span className="text-[#e2e0ff] cursor-pointer hover:text-white transition-colors">Dasbor</span>
              <span className="cursor-not-allowed hover:text-indigo-300/20 transition-colors">Integrasi</span>
              <span className="cursor-not-allowed hover:text-indigo-300/20 transition-colors">Keamanan</span>
              <span className="cursor-not-allowed hover:text-indigo-300/20 transition-colors">Bantuan</span>
            </nav>

            {/* Top Right Status Widget (clean substitute without unrequested buttons) */}
            <div className="text-[10px] bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-indigo-250 font-medium tracking-wide">
              v4.2.0 • PRO
            </div>
          </header>

          {/* Core Content Grid */}
          <main className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-center flex-1 py-12">
            
            {/* Left Column: Interactive Vector Illustration */}
            <div className="lg:col-span-7 flex flex-col justify-center space-y-8 py-4 animate-fade-in">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase">Live Infrastructure Monitoring</span>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#f1f0fc] tracking-tight leading-none max-w-xl">
                  Smart Warehouse & <br />
                  <span className="text-[#a89eff]">Operations Control</span>
                </h1>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-md">
                  Kelola penerimaan barang, pelacakan SKU, dan analisis inventaris real-time secara terintegrasi dan aman.
                </p>
              </div>

              {/* Wind turbine / Solar dynamic interactive canvas */}
              <div className="flex relative w-full lg:max-w-xl aspect-[16/10] overflow-hidden rounded-2xl bg-gradient-to-b from-[#1b1245]/20 to-[#0c042d]/80 border border-white/5 p-4 items-end">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 500 300" fill="none">
                  {/* Atmosphere */}
                  <defs>
                    <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1e164f" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#080224" stopOpacity="0.8" />
                    </linearGradient>
                    <linearGradient id="beamGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#ec4899" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <rect width="500" height="300" fill="url(#skyGrad)" rx="16" />

                  {/* Constellation Lines */}
                  <path d="M50,80 L200,40 M200,40 L400,100 M400,100 L450,40" stroke="#4d3e91" strokeWidth="1" strokeDasharray="3,3" />
                  <circle cx="50" cy="80" r="2.5" fill="#a78bfa" className="animate-pulse" />
                  <circle cx="200" cy="40" r="3" fill="#ec4899" />
                  <circle cx="400" cy="100" r="2.5" fill="#f43f5e" />
                  <circle cx="450" cy="40" r="2" fill="#818cf8" />

                  {/* Aesthetic Clouds */}
                  <path d="M70,50 Q85,40 100,50 Q115,40 125,50 Q130,60 115,65 L80,65 Z" fill="#6366f1" opacity="0.1" />
                  <path d="M370,80 Q380,72 390,80 Q400,72 410,80 Q415,88 405,92 L380,92 Z" fill="#ec4899" opacity="0.08" />

                  {/* Hilly terrains */}
                  <path d="M0,300 L500,300 L500,240 C430,220 370,240 300,225 C220,210 120,230 0,215 Z" fill="#140b3c" />
                  <path d="M0,300 L500,300 L500,255 C460,250 400,240 350,255 C290,270 200,250 140,245 C80,240 40,255 0,250 Z" fill="#0d042f" />

                  {/* Solar Panel Blocks */}
                  <g transform="translate(60, 210)" stroke="#6366f1" strokeWidth="1.5">
                    <polygon points="10,25 60,10 75,35 25,50" fill="#241b65" />
                    <line x1="10" y1="25" x2="75" y2="35" stroke="#a78bfa" opacity="0.6" />
                    <line x1="60" y1="10" x2="25" y2="50" stroke="#a78bfa" opacity="0.6" />
                    <line x1="42" y1="30" x2="42" y2="65" stroke="#4c1d95" strokeWidth="4" />
                  </g>

                  <g transform="translate(130, 205)" stroke="#6366f1" strokeWidth="1.5">
                    <polygon points="10,25 60,10 75,35 25,50" fill="#25165c" />
                    <line x1="10" y1="25" x2="75" y2="35" stroke="#a78bfa" opacity="0.6" />
                    <line x1="60" y1="10" x2="25" y2="50" stroke="#a78bfa" opacity="0.6" />
                    <line x1="42" y1="30" x2="42" y2="70" stroke="#4c1d95" strokeWidth="4" />
                  </g>

                  {/* Energy beams */}
                  <path d="M102,240 L285,150 L420,240" stroke="url(#beamGrad)" strokeWidth="3" fill="none" opacity="0.7" />

                  <rect x="270" y="190" width="30" height="20" rx="3" fill="#1b004c" stroke="#ec4899" strokeWidth="1.5" />
                  <line x1="275" y1="195" x2="295" y2="195" stroke="#ec4899" strokeWidth="2" strokeDasharray="2,2" />
                  <line x1="275" y1="190" x2="275" y2="210" stroke="#ec4899" strokeWidth="1.5" />
                  <line x1="275" y1="200" x2="295" y2="200" stroke="#10b981" strokeWidth="1.5" />
                  <line x1="285" y1="210" x2="285" y2="230" stroke="#312e81" strokeWidth="3" />

                  {/* Vector Figures */}
                  <g transform="translate(50, 210)" opacity="0.9">
                    <circle cx="20" cy="15" r="4" fill="#a78bfa" />
                    <path d="M14,35 Q20,20 26,35 Z" fill="#818cf8" />
                  </g>

                  <g transform="translate(290, 200)" opacity="0.9">
                    <circle cx="20" cy="15" r="4" fill="#f472b6" />
                    <path d="M14,35 Q20,20 26,35 Z" fill="#f43f5e" />
                  </g>
                </svg>

                {/* Rotating wind turbine SVGs */}
                <div className="absolute top-10 left-[48%] w-16 h-36 opacity-85 pointer-events-none select-none">
                  <svg viewBox="0 0 100 150" className="w-full h-full">
                    <path d="M48,150 L52,150 L51,60 L49,60 Z" fill="#6366f1" opacity="0.25" />
                    <rect x="47" y="58" width="6" height="4" rx="1.5" fill="#a78bfa" opacity="0.8" />
                    <circle cx="50" cy="60" r="2.5" fill="#f1f5f9" />
                    <g className="origin-[50px_60px] animate-[spin_10s_linear_infinite]">
                      <path d="M50,60 C50,60 49.2,25 50,18 C50.8,25 50,60 50,60" fill="#ccfbf1" opacity="0.9" />
                      <path d="M50,60 C50,60 82,78 86,81 C82,83 50,60 50,60" fill="#ccfbf1" opacity="0.85" />
                      <path d="M50,60 C50,60 18,78 14,81 C18,83 50,60 50,60" fill="#ccfbf1" opacity="0.85" />
                    </g>
                  </svg>
                </div>

                <div className="absolute top-[2px] left-[66%] w-20 h-44 opacity-90 pointer-events-none select-none">
                  <svg viewBox="0 0 100 150" className="w-full h-full">
                    <path d="M47,150 L53,150 L51.5,50 L48.5,50 Z" fill="#6366f1" opacity="0.3" />
                    <rect x="46" y="48" width="8" height="5" rx="2" fill="#d8b4fe" />
                    <circle cx="50" cy="50" r="3" fill="#ffffff" />
                    <g className="origin-[50px_50px] animate-[spin_7s_linear_infinite]">
                      <path d="M50,50 C50,50 49,12 50,5 C51,12 50,50 50,50" fill="#ffffff" opacity="0.95" />
                      <path d="M50,50 C50,50 86,72 90,75 C86,77 50,50 50,50" fill="#ffffff" opacity="0.9" />
                      <path d="M50,50 C50,50 14,72 10,75 C14,77 50,50 50,50" fill="#ffffff" opacity="0.9" />
                    </g>
                  </svg>
                </div>

                <div className="absolute top-4 right-4 bg-[#110738]/90 border border-[#ab99ff]/20 backdrop-blur-md rounded-xl p-2 px-3 shadow-lg flex items-center gap-2">
                  <span className="h-2 w-2 bg-pink-500 rounded-full animate-ping" />
                  <span className="text-[10px] uppercase font-black tracking-widest text-[#f5f3ff]/90">GRID-NODE: GINEE_ONLINE</span>
                </div>
              </div>
            </div>

            {/* Right Column: Dynamic Crisp White Welcome Back / Login Dialog Card */}
            <div className="lg:col-span-5 flex justify-center z-10 w-full relative">
              <div className="bg-white rounded-[32px] p-8 sm:p-10 shadow-[0_25px_60px_rgba(10,5,30,0.5)] text-slate-800 w-full max-w-[420px] border border-slate-100 flex flex-col justify-between min-h-[350px] relative">
                
                {/* Visual Accent Bar */}
                <div className="absolute top-0 left-12 right-12 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-b-xl" />

                <div className="space-y-6 pt-2">
                  {/* Header Title */}
                  <div>
                    <h3 className="text-3xl font-black text-[#1e144f] tracking-tight leading-none">
                      Welcome Back...
                    </h3>
                    <p className="text-xs text-slate-400 font-medium mt-2.5 leading-relaxed">
                      Please sign in to access the administrator control dashboard.
                    </p>
                  </div>

                  {/* Interactive Login Options */}
                  <div className="space-y-4 pt-2">
                    {/* Exquisite Google Sign In Button */}
                    <button
                      onClick={handleLogin}
                      disabled={isLoggingIn}
                      className={`w-full flex items-center justify-center gap-3.5 px-6 py-4 bg-[#634be9] hover:bg-[#523cc7] text-white font-bold rounded-2xl text-xs sm:text-sm transition-all shadow-[0_4px_12px_rgba(99,75,233,0.2)] hover:shadow-[0_6px_20px_rgba(99,75,233,0.3)] active:scale-[0.98] group ${
                        isLoggingIn ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      {isLoggingIn ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin text-white shrink-0" />
                          <span className="tracking-wide text-white font-semibold">Menghubungkan ke Google...</span>
                        </>
                      ) : (
                        <>
                          {/* Brand-accurate Google 'G' Icon */}
                          <svg className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#ffffff" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#ffffff" opacity="0.9" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#ffffff" opacity="0.8" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#ffffff" opacity="0.9" />
                          </svg>
                          <span className="tracking-wide text-white">Masuk dengan Google</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Firestore Authentication Error Alert Box */}
                {authError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-4 rounded-2xl bg-amber-50 border border-amber-200 mt-4 overflow-hidden text-left"
                  >
                    <div className="flex gap-2.5">
                      <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="space-y-2 z-10 w-full font-sans text-slate-700">
                        {authError === 'unauthorized-domain' ? (
                          <div className="space-y-2">
                            <h4 className="text-xs font-black text-amber-800 uppercase tracking-wide">Domain Authorization Needed</h4>
                            <p className="text-[10.5px] leading-relaxed text-slate-600">
                              Google Sign-In requires this hostname to be authorized inside your Firebase Console settings.
                            </p>
                            
                            <div className="space-y-1">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Your Hostname:</span>
                              <div className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-slate-200 font-mono text-[10px] text-slate-800">
                                <span className="truncate flex-1 font-mono font-bold text-indigo-700">{window.location.hostname}</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(window.location.hostname);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                  }}
                                  className="text-[9px] font-bold text-indigo-700 hover:text-white transition-colors uppercase shrink-0 px-2 py-1 bg-slate-50 hover:bg-indigo-600 rounded border border-indigo-200"
                                >
                                  {copied ? 'Copied' : 'Copy'}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-[#78350f]">
                            <h4 className="font-extrabold uppercase text-amber-900">Auth Error</h4>
                            <p className="mt-1 leading-snug">{authError}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Secure Badge */}
                <div className="pt-6 border-t border-slate-100 mt-6 text-center text-slate-400 font-semibold text-[8px] uppercase tracking-widest flex items-center justify-center gap-1.5 select-none">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                  <span>Double-Authenticated Node Security</span>
                </div>

              </div>
            </div>

          </main>

          {/* Social Footer Bar */}
          <footer className="py-4 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center text-[#9da5f2]/40 text-xs font-semibold uppercase tracking-widest gap-4 z-10">
            <div>
              <span className="normal-case tracking-normal text-[#9a8bff]/60 font-medium">© 2026 Admin Report Pro • Hak Cipta Dilindungi.</span>
            </div>
            {/* Social Links on the Right */}
            <div className="flex items-center gap-6 text-[#9a8bff]/60 lowercase font-medium tracking-wide">
              <span className="hover:text-white cursor-not-allowed transition-colors">twitter</span>
              <span className="text-[#9a8bff]/30">—</span>
              <span className="hover:text-white cursor-not-allowed transition-colors">instagram</span>
            </div>
          </footer>

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden bg-[#120a32] text-slate-100 flex flex-col md:flex-row font-sans relative">
      <GlobalNotificationBanner />
      {/* Full-bleed Ambient Glow Highlights and Rotating Wind Turbines */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-[#4f46e5]/8 blur-[140px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[60%] h-[60%] bg-[#db2777]/8 blur-[160px] rounded-full" />
        <div className="absolute top-[30%] right-[10%] w-[40%] h-[40%] bg-[#2563eb]/8 blur-[130px] rounded-full" />

        {/* Ambient lazy-spinning wind turbines matching the landing page theme */}
        <div className="absolute bottom-[10%] right-[8%] w-24 h-56 opacity-[0.22] pointer-events-none select-none">
          <svg viewBox="0 0 100 150" className="w-full h-full">
            <path d="M47,150 L53,150 L51.5,50 L48.5,50 Z" fill="#6366f1" opacity="0.3" />
            <circle cx="50" cy="50" r="3.5" fill="#ffffff" />
            <g className="origin-[50px_50px] animate-[spin_12s_linear_infinite]">
              <path d="M50,50 C50,50 49,12 50,5 C51,12 50,50 50,50" fill="#ffffff" opacity="0.85" />
              <path d="M50,50 C50,50 86,72 90,75 C86,77 50,50 50,50" fill="#ffffff" opacity="0.8" />
              <path d="M50,50 C50,50 14,72 10,75 C14,77 50,50 50,50" fill="#ffffff" opacity="0.8" />
            </g>
          </svg>
        </div>

        <div className="absolute top-[25%] left-[24%] w-16 h-36 opacity-[0.14] pointer-events-none select-none">
          <svg viewBox="0 0 100 150" className="w-full h-full">
            <path d="M48,150 L52,150 L51,60 L49,60 Z" fill="#6366f1" opacity="0.25" />
            <circle cx="50" cy="60" r="2.5" fill="#f1f5f9" />
            <g className="origin-[50px_60px] animate-[spin_18s_linear_infinite]">
              <path d="M50,60 C50,60 49.2,25 50,18 C50.8,25 50,60 50,60" fill="#ccfbf1" opacity="0.8" />
              <path d="M50,60 C50,60 82,78 86,81 C82,83 50,60 50,60" fill="#ccfbf1" opacity="0.75" />
              <path d="M50,60 C50,60 18,78 14,81 C18,83 50,60 50,60" fill="#ccfbf1" opacity="0.75" />
            </g>
          </svg>
        </div>
      </div>

      {/* Mobile Drawer Overlay */}
      {isMobileSidebarOpen && (
        <div 
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-45 md:hidden"
        />
      )}

      {/* Sidebar - translucent premium cyber sidebar sliding drawer on mobile */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#181140]/95 backdrop-blur-2xl border-r border-white/10 flex flex-col transform transition-transform duration-300 ease-in-out md:sticky md:top-0 md:h-screen md:translate-x-0 ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-8 border-b border-white/10 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4">
            <div id="sidebar-logo-container" className="w-11 h-11 bg-[#634be9] rounded-xl flex items-center justify-center shadow-lg shadow-indigo-950/30 border border-indigo-400/20">
              <Shield id="sidebar-logo-icon" className="w-5.5 h-5.5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <span className="font-black text-white text-base tracking-tight">Admin Report Pro</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest">LIVE SYNC</span>
              </div>
            </div>
          </div>
          {/* Close Sidebar control */}
          <button
            onClick={() => setIsMobileSidebarOpen(false)}
            className="md:hidden p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Navigation section with top/bottom indicator overlays */}
        <div className="flex-1 min-h-0 relative flex flex-col">
          <nav 
            ref={navRef}
            onScroll={checkScroll}
            className="flex-1 p-6 space-y-2.5 overflow-y-auto custom-scrollbar"
          >
            {isMobileDevice ? (
              <button
                onClick={() => handleTabClick('staff_schedule')}
                className="w-full flex items-center gap-3.5 px-4.5 py-3 rounded-[15px] transition-all group sidebar-item-active"
              >
                <Calendar className="w-5 h-5 text-indigo-400" />
                <span className="font-semibold text-sm tracking-wide">Jadwal Staf Admin</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleTabClick('dashboard')}
                  className={`w-full flex items-center gap-3.5 px-4.5 py-3 rounded-[15px] transition-all group ${activeTab === 'dashboard' ? 'sidebar-item-active' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                  <LayoutDashboard className={`w-5 h-5 ${activeTab === 'dashboard' ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
                  <span className="font-semibold text-sm tracking-wide">Dashboard</span>
                </button>
    
                <button
                  onClick={() => handleTabClick('daily_orders')}
                  className={`w-full flex items-center gap-3.5 px-4.5 py-3 rounded-[15px] transition-all group ${activeTab === 'daily_orders' ? 'sidebar-item-active' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                  <TrendingUp className={`w-5 h-5 ${activeTab === 'daily_orders' ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
                  <span className="font-semibold text-sm tracking-wide">Orderan Harian</span>
                </button>
                <button
                  onClick={() => handleTabClick('staff_schedule')}
                  className={`w-full flex items-center gap-3.5 px-4.5 py-3 rounded-[15px] transition-all group ${activeTab === 'staff_schedule' ? 'sidebar-item-active' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                  <Calendar className={`w-5 h-5 ${activeTab === 'staff_schedule' ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
                  <span className="font-semibold text-sm tracking-wide">Jadwal Staf Admin</span>
                </button>
            
            <div className="pt-5 pb-1 px-4.5 text-[10px] font-black text-[#a89eff]/50 uppercase tracking-[0.15em]">Operasional</div>
            <button
              onClick={() => handleTabClick('input_retur2')}
              className={`w-full flex items-center gap-3.5 px-4.5 py-3 rounded-[15px] transition-all group ${activeTab === 'input_retur2' ? 'sidebar-item-active' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <PlusCircle className={`w-5 h-5 ${activeTab === 'input_retur2' ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
              <span className="font-semibold text-sm tracking-wide">Stok Lantai 3</span>
            </button>

            <button
              onClick={() => handleTabClick('rusak_internal')}
              className={`w-full flex items-center gap-3.5 px-4.5 py-3 rounded-[15px] transition-all group ${activeTab === 'rusak_internal' ? 'sidebar-item-active' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <PackageX className={`w-5 h-5 ${activeTab === 'rusak_internal' ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
              <span className="font-semibold text-sm tracking-wide">Eliminasi Stok Rusak</span>
            </button>

            <button
              onClick={() => handleTabClick('damaged_goods_report')}
              className={`w-full flex items-center gap-3.5 px-4.5 py-3 rounded-[15px] transition-all group ${activeTab === 'damaged_goods_report' ? 'sidebar-item-active' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <Database className={`w-5 h-5 ${activeTab === 'damaged_goods_report' ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
              <span className="font-semibold text-sm tracking-wide">Log Barang Rusak</span>
            </button>

            <div className="pt-5 pb-1 px-4.5 text-[10px] font-black text-[#a89eff]/50 uppercase tracking-[0.15em]">Alat Bantu Data</div>
            <button
              onClick={() => handleTabClick('matcher')}
              className={`w-full flex items-center gap-3.5 px-4.5 py-3 rounded-[15px] transition-all group ${activeTab === 'matcher' ? 'sidebar-item-active' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <ArrowRightLeft className={`w-5 h-5 ${activeTab === 'matcher' ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
              <span className="font-semibold text-sm tracking-wide">Pencocok Data</span>
            </button>

            <button
              onClick={() => handleTabClick('packing_list_check')}
              className={`w-full flex items-center gap-3.5 px-4.5 py-3 rounded-[15px] transition-all group ${activeTab === 'packing_list_check' ? 'sidebar-item-active' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <FolderSearch className={`w-5 h-5 ${activeTab === 'packing_list_check' ? 'text-rose-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
              <span className="font-semibold text-sm tracking-wide">Cek Packing List</span>
            </button>

            <button
              onClick={() => handleTabClick('shipping_matcher')}
              className={`w-full flex items-center gap-3.5 px-4.5 py-3 rounded-[15px] transition-all group ${activeTab === 'shipping_matcher' ? 'sidebar-item-active' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <ArrowRightLeft className={`w-5 h-5 ${activeTab === 'shipping_matcher' ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
              <span className="font-semibold text-sm tracking-wide">Pencocok Pengiriman</span>
            </button>

            <button
              onClick={() => handleTabClick('vault')}
              className={`w-full flex items-center gap-3.5 px-4.5 py-3 rounded-[15px] transition-all group ${activeTab === 'vault' ? 'sidebar-item-active' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <Cloud className={`w-5 h-5 ${activeTab === 'vault' ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
              <span className="font-semibold text-sm tracking-wide">Cloud Vault</span>
            </button>

            <button
              onClick={() => handleTabClick('admin_data_import')}
              className={`w-full flex items-center gap-3.5 px-4.5 py-3 rounded-[15px] transition-all group ${activeTab === 'admin_data_import' ? 'sidebar-item-active' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <CloudDownload className={`w-5 h-5 ${activeTab === 'admin_data_import' ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
              <span className="font-semibold text-sm tracking-wide">Data Admin Import</span>
            </button>

            <div className="pt-5 pb-1 px-4.5 text-[10px] font-black text-[#a89eff]/50 uppercase tracking-[0.15em]">Analitik</div>
            <button
              onClick={() => handleTabClick('table')}
              className={`w-full flex items-center gap-3.5 px-4.5 py-3 rounded-[15px] transition-all group ${activeTab === 'table' ? 'sidebar-item-active' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <TableIcon className={`w-5 h-5 ${activeTab === 'table' ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
              <span className="font-semibold text-sm tracking-wide">Eksplorasi Laporan</span>
            </button>

            <div className="pt-5 pb-1 px-4.5 text-[10px] font-black text-[#a89eff]/50 uppercase tracking-[0.15em]">Kontrol Inventaris</div>
            <div className="space-y-1">
              <button
                onClick={() => setIsFisikOpen(!isFisikOpen)}
                className={`w-full flex items-center justify-between px-4.5 py-3 rounded-[15px] transition-all text-slate-400 hover:text-white hover:bg-white/5`}
              >
                <div className="flex items-center gap-3.5">
                  <Package className="w-5 h-5 text-slate-400" />
                  <span className="font-semibold text-sm tracking-wide">Data Fisik</span>
                </div>
                {isFisikOpen ? <ChevronDown className="w-4 h-4 text-indigo-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              </button>
              
              <AnimatePresence>
                {isFisikOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden pl-11 space-y-1"
                  >
                    {[
                      { id: 'retur_fisik', label: 'Retur Fisik' },
                      { id: 'cancel_fisik', label: 'Cancel Fisik' },
                      { id: 'rusak_fisik', label: 'Rusak Fisik' },
                      { id: 'bundling_fisik', label: 'Bundling Fisik' },
                    ].map((subItem) => (
                      <button
                        key={subItem.id}
                        onClick={() => handleTabClick(subItem.id)}
                        className={`w-full text-left px-4.5 py-2.5 rounded-xl text-xs sm:text-sm transition-all ${activeTab === subItem.id ? 'text-indigo-300 font-bold bg-indigo-505/10 border-l-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                      >
                        {subItem.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                onClick={() => handleTabClick('stok_bundling_admin')}
                className={`w-full flex items-center gap-3.5 px-4.5 py-3 rounded-[15px] transition-all group ${activeTab === 'stok_bundling_admin' ? 'sidebar-item-active' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <Package className={`w-5 h-5 ${activeTab === 'stok_bundling_admin' ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
                <span className="font-semibold text-sm tracking-wide">Stok Bundling Admin</span>
              </button>
            </div>

            </>
            )}
          </nav>

          {/* Scroll Up Hint Indicator overlay */}
          {canScrollUp && (
            <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-[#181140] to-transparent pointer-events-none flex items-start justify-center pt-2.5 z-10">
              <div className="flex items-center gap-1 bg-[#4f46e5]/30 backdrop-blur-md border border-indigo-400/20 px-2 py-0.5 rounded-full shadow-md animate-fade-in">
                <ChevronUp className="w-3.5 h-3.5 text-indigo-300 animate-bounce" />
              </div>
            </div>
          )}

          {/* Scroll Down Hint Indicator overlay */}
          {canScrollDown && (
            <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-[#181140] via-[#181140]/90 to-transparent pointer-events-none flex items-end justify-center pb-2.5 z-10">
              <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/20 px-3.5 py-1.5 rounded-full shadow-lg shadow-black/40 animate-fade-in">
                <ChevronDown className="w-3.5 h-3.5 text-indigo-300 animate-bounce" />
                <span className="text-[10px] font-bold text-indigo-200 tracking-wider uppercase">Menu Lain di Bawah</span>
              </div>
            </div>
          )}
        </div>

        {/* User Card inside Sidebar */}
        <div className="p-6 border-t border-white/10 bg-[#140b33]/85">
          <div className="flex items-center gap-3.5 px-3 py-3.5 bg-white/5 border border-white/10 rounded-2xl mb-4 shadow-inner">
            <div id="user-avatar-container" className="w-10 h-10 bg-[#634be9] rounded-xl flex items-center justify-center border border-indigo-400/20 shadow-md text-white font-extrabold text-sm uppercase">
              {currentUser.displayName ? currentUser.displayName.slice(0, 2) : 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate leading-tight">{currentUser.displayName}</p>
              <p className="text-[10px] text-indigo-300 truncate font-semibold uppercase tracking-wider mt-0.5">{currentUser.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full h-11 flex items-center justify-center gap-2.5 px-4 bg-white/5 hover:bg-rose-500/10 text-slate-300 hover:text-rose-400 rounded-xl transition-all font-bold border border-white/5 hover:border-rose-500/20 text-xs uppercase tracking-wider cursor-pointer active:scale-[0.98]"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
          <div className="text-[9px] text-[#9185e4]/30 text-center font-bold uppercase tracking-widest mt-3.5">
            System Version {CLIENT_VERSION}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative z-10 flex flex-col h-full md:h-screen md:min-h-0">
        {/* Transparent Cyber-styled Header */}
        <header className="bg-[#120a32]/65 backdrop-blur-2xl border-b border-white/10 px-6 sm:px-10 py-6 flex flex-row justify-between items-center sticky top-0 z-40 gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-2.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl transition-all border border-white/10 cursor-pointer"
              title="Buka Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl sm:text-3xl font-black text-white tracking-tight leading-none">
                {activeTab === 'dashboard' ? 'Insight Dashboard' : 
                 (activeTab === 'input_retur' || activeTab === 'input_retur2') ? 'Stok Lantai 3' : 
                 activeTab === 'rusak_internal' ? 'Eliminasi Stok Rusak' : 
                 activeTab === 'damaged_goods_report' ? 'Log Barang Rusak' : 
                 activeTab === 'daily_orders' ? 'Data Orderan Harian' : 
                 activeTab === 'input_stok_lt3' ? 'Logistik Lantai 3' : 
                 activeTab === 'table' ? 'Eksplorasi Laporan' : 
                 activeTab === 'matcher' ? 'Pencocok Data Excel' :
                 activeTab === 'packing_list_check' ? 'Cek Folder Packing List' :
                 activeTab === 'shipping_matcher' ? 'Pencocok Pengiriman Logistik' :
                 activeTab === 'vault' ? 'Penyimpanan Cloud Vault' :
                 activeTab === 'admin_data_import' ? 'Data Admin Import' :
                 activeTab === 'retur_fisik' ? 'Retur Fisik' :
                 activeTab === 'cancel_fisik' ? 'Aset Dibatalkan' :
                 activeTab === 'rusak_fisik' ? 'Registri Kerusakan' :
                 activeTab === 'bundling_fisik' ? 'Perakitan Bundling' :
                 activeTab === 'stok_bundling_admin' ? 'Stok Bundling Admin' :
                 activeTab === 'staff_schedule' ? 'Jadwal Staf Admin' :
                 'Konfigurasi Global'}
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <span className="w-1.5 h-1.5 bg-[#db2777] rounded-full animate-pulse" />
                <p className="text-[#b498ff] text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] line-clamp-1">Modul Keunggulan Operasional</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 leading-none">Konektivitas Node</p>
              <div className="flex items-center gap-2 justify-end bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
                <div className="relative flex items-center justify-center h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </div>
                <p className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase">Infrastruktur Live</p>
              </div>
            </div>
          </div>
        </header>

        {/* Content Body Container */}
        <div className={`p-6 sm:p-10 mx-auto w-full flex-1 ${activeTab === 'table' || activeTab.includes('_fisik') ? 'max-w-[1600px]' : (activeTab === 'daily_orders' || activeTab === 'stok_bundling_admin' || activeTab === 'shipping_matcher' || activeTab === 'packing_list_check') ? 'max-w-none' : 'max-w-7xl'}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full h-full"
            >
              {activeTab === 'dashboard' && <Dashboard stats={dashboardStats || undefined} reports={allReports} />}
              {activeTab === 'input_retur' && <ReportForm category="retur" user={currentUser} />}
              {activeTab === 'input_retur2' && <ReportForm category="retur2" user={currentUser} />}
              {activeTab === 'rusak_internal' && <ReportForm category="rusak_internal" user={currentUser} />}
              {activeTab === 'damaged_goods_report' && <ReportTable reports={allReports} category="rusak_internal" user={currentUser} userProfile={userProfile} forcePhysicalLayout={true} globalDateFilter={globalDateFilter} setGlobalDateFilter={setGlobalDateFilter} loading={isDataLoading} />}
              {activeTab === 'daily_orders' && <DailyOrders user={currentUser} userProfile={userProfile} />}
              {activeTab === 'stok_bundling_admin' && <BundlingAdminStock user={currentUser} userProfile={userProfile} />}
              {activeTab === 'packing_list_check' && <PackingListCheck />}
              {activeTab === 'shipping_matcher' && <ShippingMatcher />}
              {activeTab === 'input_stok_lt3' && <ReportForm category="stok_lt3" user={currentUser} />}
              {activeTab === 'matcher' && <DataMatcher />}
              {activeTab === 'vault' && <CloudVault user={currentUser} isAdmin={isAdmin} isDevMode={!!devUser} />}
              {activeTab === 'table' && <ReportTable reports={allReports} user={currentUser} userProfile={userProfile} globalDateFilter={globalDateFilter} setGlobalDateFilter={setGlobalDateFilter} loading={isDataLoading} />}
              {activeTab === 'retur_fisik' && <ReportTable reports={allReports} statusFilter="Retur Fisik" user={currentUser} userProfile={userProfile} forcePhysicalLayout={true} globalDateFilter={globalDateFilter} setGlobalDateFilter={setGlobalDateFilter} loading={isDataLoading} />}
              {activeTab === 'cancel_fisik' && <ReportTable reports={allReports} statusFilter="Cancel Fisik" user={currentUser} userProfile={userProfile} forcePhysicalLayout={true} globalDateFilter={globalDateFilter} setGlobalDateFilter={setGlobalDateFilter} loading={isDataLoading} />}
              {activeTab === 'rusak_fisik' && <ReportTable reports={allReports} statusFilter="Rusak Fisik" user={currentUser} userProfile={userProfile} forcePhysicalLayout={true} globalDateFilter={globalDateFilter} setGlobalDateFilter={setGlobalDateFilter} loading={isDataLoading} />}
              {activeTab === 'bundling_fisik' && <ReportTable reports={allReports} statusFilter="Bundling Fisik" user={currentUser} userProfile={userProfile} forcePhysicalLayout={true} globalDateFilter={globalDateFilter} setGlobalDateFilter={setGlobalDateFilter} loading={isDataLoading} />}
              {activeTab === 'admin' && <AdminPanel user={currentUser} />}
              {activeTab === 'admin_data_import' && <AdminDataImport />}
              {activeTab === 'staff_schedule' && <StaffSchedule user={currentUser} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
