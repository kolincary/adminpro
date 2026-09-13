import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { 
  signOut,
  signInAnonymously
} from 'firebase/auth';
import { supabase } from './supabaseClient';
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
import { auth, db, ensureFirebaseAuth } from './firebase';
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
  LayoutGrid,
  ShoppingCart,
  PlusCircle, 
  PackagePlus,
  Table as TableIcon, 
  LogOut, 
  Layout,
  User as UserIcon,
  Loader2,
  Database,
  Package,
  Boxes,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Shield,
  UserX,
  ArrowRightLeft,
  GitCompare,
  ClipboardCheck,
  Truck,
  Cloud,
  PackageX,
  AlertCircle,
  AlertTriangle,
  Menu,
  X,
  TrendingUp,
  FolderSearch,
  Calendar,
  Key,
  ChevronLeft,
  CloudDownload,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateTOTPCode } from './totp';
import GlobalNotificationBanner from './GlobalNotificationBanner';

const EMPTY_ARRAY: any[] = [];
const CLIENT_VERSION = "2.4.2";
const APP_LOAD_TIME = Date.now();

function AppContent() {
  const [user, setUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('adminPro_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('adminPro_userProfile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isBlocked, setIsBlocked] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<any>(() => auth.currentUser);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    import('firebase/auth').then(({ onAuthStateChanged }) => {
      unsub = onAuthStateChanged(auth, (fbUser) => {
        setFirebaseUser(fbUser);
      });
    });
    ensureFirebaseAuth().then((fbUser) => {
      if (fbUser) setFirebaseUser(fbUser);
    }).catch(() => {});
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const [loading, setLoading] = useState<boolean>(() => {
    try {
      const hasUser = !!localStorage.getItem('adminPro_user') || !!localStorage.getItem('adminPro_devUser');
      return !hasUser;
    } catch {
      return true;
    }
  });
  const [isDataLoading, setIsDataLoading] = useState(false);
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const [isAdminRoute] = useState<boolean>(() => {
    return window.location.pathname.startsWith('/admin');
  });

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      return 'staff_schedule';
    }
    const urlParams = new URLSearchParams(window.location.search);
    const tabFromUrl = urlParams.get('tab');
    if (tabFromUrl) return tabFromUrl;
    return localStorage.getItem('adminPro_activeTab') || 'dashboard';
  });

  useEffect(() => {
    if (!isMobileDevice) {
      localStorage.setItem('adminPro_activeTab', activeTab);
    } else if (activeTab !== 'staff_schedule') {
      setActiveTab('staff_schedule');
    }
  }, [activeTab, isMobileDevice]);

  const handleTabClick = (tab: string, e?: React.MouseEvent) => {
    if (e) {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) {
        return;
      }
      e.preventDefault();
    }
    setActiveTab(tab);
    setIsMobileSidebarOpen(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.pushState({ tab }, '', url.toString());
    } catch (err) {
      console.warn('Error updating history:', err);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const tabFromUrl = urlParams.get('tab');
      if (tabFromUrl) {
        setActiveTab(tabFromUrl);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [reports, setReports] = useState<Report[]>([]);
  const [transactions, setTransactions] = useState<Report[]>([]);
  const [globalDateFilter, setGlobalDateFilter] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [globalSearchTerm, setGlobalSearchTerm] = useState<string>('');
  const [globalMarketplaceFilter, setGlobalMarketplaceFilter] = useState<string>('');
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [isFisikOpen, setIsFisikOpen] = useState(false);
  const isRecalculatingRef = useRef(false);
  const [devUser, setDevUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('adminPro_devUser');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const updateDevUser = (val: any) => {
    setDevUser(val);
    if (val) {
      localStorage.setItem('adminPro_devUser', JSON.stringify(val));
    } else {
      localStorage.removeItem('adminPro_devUser');
    }
  };
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
  const [tempUser, setTempUser] = useState<any>(null);
  
  const [currentTime, setCurrentTime] = useState(() => {
    const d = new Date();
    return d.toTimeString().split(' ')[0].replace(/:/g, '.');
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setCurrentTime(d.toTimeString().split(' ')[0].replace(/:/g, '.'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Global Anti-History / Autocomplete Suppressor
  useEffect(() => {
    const handleInputFocus = (e: Event) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        if (el.getAttribute('autocomplete') !== 'off') el.setAttribute('autocomplete', 'off');
        if (el.getAttribute('autocorrect') !== 'off') el.setAttribute('autocorrect', 'off');
        if (el.getAttribute('autocapitalize') !== 'off') el.setAttribute('autocapitalize', 'off');
        if (el.getAttribute('spellcheck') !== 'false') el.setAttribute('spellcheck', 'false');
      }
    };

    document.addEventListener('focusin', handleInputFocus, true);
    document.addEventListener('focus', handleInputFocus, true);
    document.addEventListener('pointerdown', handleInputFocus, true);

    return () => {
      document.removeEventListener('focusin', handleInputFocus, true);
      document.removeEventListener('focus', handleInputFocus, true);
      document.removeEventListener('pointerdown', handleInputFocus, true);
    };
  }, []);

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
      if (!firebaseUser && !auth.currentUser) return;

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
  }, [user, devUser, firebaseUser]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const newTyped = (typedChars + e.key).slice(-7);
      setTypedChars(newTyped);
      if (newTyped === 'devmode') {
        handleQuickAccess();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [typedChars]);

  // Permanent session: Track last active date without automatic sign-outs
  useEffect(() => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    if (user || devUser) {
      localStorage.setItem('last_active_date', todayStr);
    }
  }, [user, devUser]);

  // Real-time listener for force logouts & version updates
  useEffect(() => {
    if (!user) return;
    if (!firebaseUser && !auth.currentUser) return;

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
  }, [user, firebaseUser]);

  const formatSupabaseUser = (sbUser: any): any => {
    if (!sbUser) return null;
    const name = sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || sbUser.email?.split('@')[0] || 'Staf';
    const photo = sbUser.user_metadata?.avatar_url || sbUser.user_metadata?.picture || '';
    return {
      ...sbUser,
      uid: sbUser.id,
      id: sbUser.id,
      email: sbUser.email || '',
      displayName: name,
      photoURL: photo,
      isAnonymous: false
    };
  };

  const finalizeLogin = async (currentUserParam: any) => {
    const normUser = formatSupabaseUser(currentUserParam);
    setUser(normUser);
    try {
      localStorage.setItem('adminPro_user', JSON.stringify(normUser));
    } catch (e) {}
    setLoading(false);

    // Background ensure Firebase anonymous auth
    ensureFirebaseAuth().then((fbUser) => {
      if (fbUser) setFirebaseUser(fbUser);
    }).catch(fbErr => {
      console.warn("Firebase background anonymous auth:", fbErr);
    });

    if (normUser.isAnonymous) {
      const devProfile: UserProfile = {
        uid: normUser.uid,
        email: 'jgilbeth92@gmail.com',
        displayName: 'Administrator (Bypass)',
        role: 'admin'
      };
      updateDevUser(devProfile);
      setUserProfile(devProfile);
      try {
        localStorage.setItem('adminPro_userProfile', JSON.stringify(devProfile));
      } catch (e) {}
    } else {
      updateDevUser(null);
      const isSuperAdmin = normUser.email === 'jgilbeth92@gmail.com' || normUser.email === 'developer@example.com';
      
      const defaultProfile: UserProfile = {
        uid: normUser.uid || normUser.id,
        email: normUser.email,
        displayName: normUser.displayName,
        role: isSuperAdmin ? 'admin' : 'staff'
      };

      // 1. Fetch & Sync Role from Supabase 'profiles' table safely
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', normUser.id)
          .maybeSingle();

        if (error) {
          // If Supabase profiles table query errors (e.g. 500 or 400), don't fail, use OAuth profile
          setUserProfile(defaultProfile);
          try {
            localStorage.setItem('adminPro_userProfile', JSON.stringify(defaultProfile));
          } catch (e) {}
        } else if (profile) {
          const profileData: UserProfile = {
            uid: profile.id,
            email: profile.email || normUser.email,
            displayName: profile.display_name || normUser.displayName,
            role: (profile.role || (isSuperAdmin ? 'admin' : 'staff')) as 'admin' | 'staff'
          };
          setUserProfile(profileData);
          try {
            localStorage.setItem('adminPro_userProfile', JSON.stringify(profileData));
          } catch (e) {}
          
          // Non-blocking update last_active_at in Supabase
          supabase
            .from('profiles')
            .update({ last_active_at: new Date().toISOString() })
            .eq('id', normUser.id)
            .then(() => {})
            .catch(() => {});
        } else {
          const initialRole: 'admin' | 'staff' = isSuperAdmin ? 'admin' : 'staff';
          const newProfile = {
            id: normUser.id,
            email: normUser.email,
            display_name: normUser.displayName,
            avatar_url: normUser.photoURL,
            role: initialRole,
            last_active_at: new Date().toISOString()
          };
          supabase.from('profiles').upsert(newProfile).then(() => {}).catch(() => {});
          setUserProfile(defaultProfile);
          try {
            localStorage.setItem('adminPro_userProfile', JSON.stringify(defaultProfile));
          } catch (e) {}
        }
      } catch (sbProfileErr) {
        setUserProfile(defaultProfile);
        try {
          localStorage.setItem('adminPro_userProfile', JSON.stringify(defaultProfile));
        } catch (e) {}
      }

      // 2. Backward compatibility sync to Firestore 'users' collection
      try {
        if (auth.currentUser) {
          const userRef = doc(db, 'users', normUser.uid);
          const profileData = {
            uid: normUser.uid,
            email: normUser.email,
            displayName: normUser.displayName,
            role: isSuperAdmin ? 'admin' : 'staff',
            lastActiveAt: new Date().toISOString()
          };
          await setDoc(userRef, profileData, { merge: true });
        }
      } catch (err) {
        console.warn("Firestore user sync warning:", err);
      }
    }
  };

  useEffect(() => {
    // 0. Check URL query & hash for OAuth error or description and clean up address bar
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const hashStr = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
      const hashParams = new URLSearchParams(hashStr);

      const errorDesc = searchParams.get('error_description') || hashParams.get('error_description') || searchParams.get('error') || hashParams.get('error');
      if (errorDesc) {
        let cleanMsg = decodeURIComponent(errorDesc).replace(/\+/g, ' ');
        if (cleanMsg.toLowerCase().includes('database error saving new user')) {
          cleanMsg = 'Gagal menyimpan user baru ke Supabase: Harap jalankan skrip SQL di Supabase SQL Editor untuk memperbarui trigger tabel profiles.';
        }
        setAuthError(cleanMsg);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (err) {
      console.warn("URL error parse error:", err);
    }

    // 1. Initial Session Check from Supabase
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        if (session?.user) {
          const normUser = formatSupabaseUser(session.user);
          const isBypass = normUser.email === 'jgilbeth92@gmail.com' || normUser.email === 'developer@example.com';

          if (!isBypass) {
            try {
              await ensureFirebaseAuth();
              if (auth.currentUser) {
                const securitySnap = await getDoc(doc(db, 'metadata', 'security'));
                const is2FARequired = securitySnap.exists() && securitySnap.data().authCodeRequired === true;
                const is2FAVerified = localStorage.getItem('2fa_verified') === 'true';

                if (is2FARequired && !is2FAVerified) {
                  setTempUser(normUser);
                  setShow2FAModal(true);
                  setLoading(false);
                  return;
                }
              }
            } catch (secErr) {
              // Silently handle if security doc is restricted
            }
          }

          await finalizeLogin(normUser);
          if (window.location.hash.includes('access_token')) {
            window.history.replaceState(null, '', window.location.pathname);
          }
        } else {
          // If no active Supabase session, check if there's a cached user
          const savedUser = localStorage.getItem('adminPro_user');
          const savedDev = localStorage.getItem('adminPro_devUser');
          if (savedUser) {
            try {
              const parsed = JSON.parse(savedUser);
              setUser(parsed);
              const savedProf = localStorage.getItem('adminPro_userProfile');
              if (savedProf) setUserProfile(JSON.parse(savedProf));
            } catch (e) {}
          } else if (!savedDev) {
            localStorage.removeItem('2fa_verified');
            localStorage.removeItem('login_timestamp_ms');
            setUser(null);
            setUserProfile(null);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error("Supabase getSession error:", err);
        setLoading(false);
      }
    });

    // 2. Subscribe to Supabase Auth State Changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session?.user) {
          const normUser = formatSupabaseUser(session.user);
          const isBypass = normUser.email === 'jgilbeth92@gmail.com' || normUser.email === 'developer@example.com';

          if (!isBypass) {
            try {
              await ensureFirebaseAuth();
              if (auth.currentUser) {
                const securitySnap = await getDoc(doc(db, 'metadata', 'security'));
                const is2FARequired = securitySnap.exists() && securitySnap.data().authCodeRequired === true;
                const is2FAVerified = localStorage.getItem('2fa_verified') === 'true';

                if (is2FARequired && !is2FAVerified) {
                  setTempUser(normUser);
                  setShow2FAModal(true);
                  setLoading(false);
                  return;
                }
              }
            } catch (secErr) {
              // Silently handle if security doc is restricted
            }
          }

          await finalizeLogin(normUser);
          if (window.location.hash.includes('access_token')) {
            window.history.replaceState(null, '', window.location.pathname);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('2fa_verified');
        localStorage.removeItem('login_timestamp_ms');
        localStorage.removeItem('adminPro_devUser');
        localStorage.removeItem('adminPro_user');
        localStorage.removeItem('adminPro_userProfile');
        setUser(null);
        setUserProfile(null);
        setDevUser(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
    try {
      await supabase.auth.signOut();
      await signOut(auth);
    } catch (e) {}
  };

  const currentUser = useMemo(() => user || devUser, [user, devUser]);
  const isAdmin = useMemo(() => userProfile?.role === 'admin', [userProfile]);

  // Update activity status periodically (every 2 minutes) for active online users
  useEffect(() => {
    if (!currentUser || currentUser.uid === 'dev-user-id') return;
    if (!firebaseUser && !auth.currentUser) return;

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
  }, [currentUser, firebaseUser]);

  // Fetch from 'reports' and 'transactions'
  useEffect(() => {
    if (!user && !devUser) {
      setReports(EMPTY_ARRAY);
      setTransactions(EMPTY_ARRAY);
      setIsDataLoading(false);
      return;
    }

    if (!firebaseUser && !auth.currentUser) {
      setIsDataLoading(true);
      ensureFirebaseAuth().then((fbUser) => {
        if (fbUser) setFirebaseUser(fbUser);
      }).catch(() => {});
      return;
    }

    setIsDataLoading(true);
    let reportsDone = false;
    let transactionsDone = false;

    const checkDone = () => {
      if (reportsDone && transactionsDone) {
        setIsDataLoading(false);
      }
    };

    // Cleanup functions
    const unsubs: (() => void)[] = [];

    // Unified processing functions
    const processSnapReports = (snapshot: any) => {
      const mapped = snapshot.docs.map((d: any) => mapReportDoc(d));
      setReports(mapped);
      reportsDone = true;
      setIsDataLoading(false);
    };

    const processSnapTransactions = (snapshot: any) => {
      const mapped = snapshot.docs.map((d: any) => mapTransactionDoc(d));
      setTransactions(mapped);
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
      
      // ELIMINASI / RUSAK INTERNAL (Only when explicitly marked as internal elimination)
      if (
        s === 'OUT' || 
        s === 'ELIMINASI' || 
        s.includes('ELIMINASI INTERNAL') ||
        s.includes('ELIMINASI STOK RUSAK') ||
        s.includes('RUSAK_INTERNAL') ||
        s.includes('RUSAK_LT3') ||
        s.includes('RUSAK_LANTAI3')
      ) return 'Eliminasi Stok Rusak';
      
      if (s.includes('RETUR')) return 'Retur Fisik';
      if (s.includes('CANCEL') || s === 'BATAL' || s === 'DIBATALKAN') return 'Cancel Fisik';
      if (s.includes('BUNDLING') || s.includes('BUNDLE')) return 'Bundling Fisik';
      
      return String(status || type || '');
    };

    const getInferredCategory = (status: string, currentCategory: string, type: string, source: string, sku: string): string => {
      if (currentCategory === 'retur' || currentCategory === 'retur2') return currentCategory;
      if (currentCategory === 'rusak_internal' || currentCategory === 'eliminasi_rusak') return 'rusak_internal';
      if (currentCategory === 'stok_lt3') return 'stok_lt3';

      if (status === 'Eliminasi Stok Rusak' || type === 'OUT' || type === 'RUSAK_INTERNAL') return 'rusak_internal';
      if (status === 'Rusak Fisik') return 'stok_lt3';
      
      return currentCategory || 'retur';
    };

    const mapReportDoc = (doc: any) => {
      const d = doc.data();
      const sku = d.sku || d.sku_id || d.item_code || '';
      const normalizedStatus = getNormalizedStatus(d.status, '');
      const category = getInferredCategory(normalizedStatus, d.category, '', 'reports', sku);
      
      const createdAt = d.created_at || d.createdAt || d.timestamp || d.updatedAt || null;
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

    // Realtime listeners for all reports and transactions
    const reportsQuery = query(collection(db, 'reports'));
    unsubs.push(onSnapshot(reportsQuery, processSnapReports, (err) => {
      console.warn("Reports Sync Error:", err);
      if (err.message.includes('quota')) setQuotaExceeded(true);
      reportsDone = true;
      setIsDataLoading(false);
      checkDone();
    }));

    const transactionsQuery = query(
      collection(db, 'transactions'),
      limit(1500)
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

  }, [user, devUser, firebaseUser]);

  // Fetch Dashboard Stats
  useEffect(() => {
    if (!user && !devUser) return;
    if (!firebaseUser && !auth.currentUser) return;

    const unsubscribeStats = onSnapshot(doc(db, 'metadata', 'dashboard_stats'), (snapshot) => {
      if (snapshot.exists()) {
        setDashboardStats(snapshot.data() as DashboardStats);
      } else if (!isRecalculatingRef.current && (isAdmin || user?.email === 'jgilbeth92@gmail.com' || devUser)) {
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
  }, [user, devUser, isAdmin, firebaseUser]);

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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account'
          }
        }
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Supabase Google Login error:', error);
      if (
        error?.message?.includes('popup') ||
        error?.message?.includes('cancel') ||
        error?.message?.includes('closed')
      ) {
        console.log('Login cancelled or closed by user.');
        return;
      }
      setAuthError(error?.message || 'Gagal masuk dengan akun Google melalui Supabase.');
    } finally {
      isLoggingInRef.current = false;
      setIsLoggingIn(false);
    }
  };

  const handleQuickAccess = async () => {
    if (isLoggingInRef.current) return;
    isLoggingInRef.current = true;
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      localStorage.setItem('login_timestamp_ms', Date.now().toString());
      try {
        await signInAnonymously(auth);
      } catch (e) {}
      
      const devProfile = {
        uid: 'dev-user-id',
        id: 'dev-user-id',
        email: 'jgilbeth92@gmail.com',
        displayName: 'Administrator (Bypass)',
        role: 'admin' as const,
        isAnonymous: true
      };
      updateDevUser(devProfile);
      setUser(devProfile);
      setUserProfile({
        uid: 'dev-user-id',
        email: 'jgilbeth92@gmail.com',
        displayName: 'Administrator (Bypass)',
        role: 'admin'
      });
      setLoading(false);
    } catch (err: any) {
      console.warn('Anonymous Auth fallback to local dev session:', err);
      setLoading(false);
    } finally {
      isLoggingInRef.current = false;
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('login_timestamp_ms');
    localStorage.removeItem('2fa_verified');
    localStorage.removeItem('adminPro_devUser');
    localStorage.removeItem('adminPro_user');
    localStorage.removeItem('adminPro_userProfile');
    try {
      await supabase.auth.signOut();
      await signOut(auth);
    } catch (e) {
      console.warn("Logout warning:", e);
    }
    setUser(null);
    setUserProfile(null);
    updateDevUser(null);
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

                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-slate-200"></div>
                      <span className="flex-shrink mx-2 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Atau Opsi Darurat</span>
                      <div className="flex-grow border-t border-slate-200"></div>
                    </div>

                    <button
                      type="button"
                      onClick={handleQuickAccess}
                      disabled={isLoggingIn}
                      className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-2 border border-slate-200 cursor-pointer disabled:opacity-50"
                    >
                      <Shield className="w-4 h-4 text-indigo-600" />
                      <span>Masuk Langsung (Bypass & Muat Data)</span>
                    </button>
                  </div>
                </div>

                {/* Supabase Authentication Error Alert Box */}
                {authError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-4 rounded-2xl bg-amber-50 border border-amber-200 mt-4 overflow-hidden text-left"
                  >
                    <div className="flex gap-2.5">
                      <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="space-y-2 z-10 w-full font-sans text-slate-700">
                        <div className="text-xs text-[#78350f]">
                          <h4 className="font-extrabold uppercase text-amber-900">Supabase Auth Notice</h4>
                          <p className="mt-1 leading-snug text-[11px] text-slate-600">{authError}</p>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleLogin}
                            className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>Coba Login Lagi</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleQuickAccess}
                            className="py-2 px-3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-all flex items-center justify-center cursor-pointer shrink-0"
                          >
                            <span>Bypass Masuk</span>
                          </button>
                        </div>
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
    <div className="min-h-screen h-screen overflow-hidden bg-[#0c0721] text-slate-100 flex flex-col font-sans">
      <GlobalNotificationBanner />

      {/* Top Header Navbar - 100% Exact Screenshot Matching */}
      <header className="w-full bg-[#0c0721] border-b border-purple-900/30 px-4 sm:px-8 py-2.5 flex items-center justify-between z-50 shrink-0 shadow-md select-none">
        {/* Left Branding */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMobileSidebarOpen(true)}
            className="md:hidden p-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl transition-all border border-white/10 cursor-pointer mr-1"
            title="Buka Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="w-9 h-9 rounded-xl bg-purple-950/80 border border-purple-800/40 flex items-center justify-center text-pink-500 shadow-lg shadow-purple-950/40 shrink-0">
            <Activity className="w-5 h-5 text-pink-500" strokeWidth={2.5} />
          </div>
          
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-white text-base sm:text-lg tracking-tight leading-none">
                ADMIN REPORT <span className="text-pink-500">PRO</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#2e1065] text-[#c084fc] border border-purple-500/40 tracking-wider leading-none">
                v2.6.4-PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-normal leading-tight mt-0.5 hidden sm:block">
              Warehouse Operations &amp; Reconciliation Suite
            </p>
          </div>
        </div>

        {/* Right Status Badges & Actions */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          {/* Live Sync Clock Pill */}
          <div className="hidden sm:flex items-center gap-2 bg-[#052e16]/80 border border-emerald-500/40 px-3.5 py-1.5 rounded-full text-emerald-400 font-mono text-xs shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="font-bold text-[11px] uppercase tracking-wider text-emerald-400">LIVE SYNC</span>
            <span className="text-slate-300 font-mono font-medium text-xs ml-1">{currentTime}</span>
          </div>

          {/* User Profile Capsule */}
          <div className="flex items-center gap-2.5 bg-[#19103c] border border-purple-800/50 px-3 py-1 rounded-full shadow-inner">
            <div className="w-7 h-7 rounded-full bg-purple-700 border border-purple-500/40 flex items-center justify-center text-white font-black text-xs uppercase shadow shrink-0">
              {currentUser?.displayName ? currentUser.displayName.slice(0, 1) : 'J'}
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold text-white truncate max-w-[130px] leading-tight">
                {currentUser?.displayName || 'J. Gilbeth (Super Admin)'}
              </span>
              <span className="text-[9px] font-black text-pink-400 uppercase tracking-widest leading-none mt-0.5">
                {userProfile?.role === 'admin' ? 'ADMIN' : 'STAFF'}
              </span>
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-rose-500/40 bg-rose-950/30 text-rose-300 hover:bg-rose-900/50 hover:text-white transition-all text-xs font-bold shadow-sm cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 rotate-180" />
            <span>Keluar</span>
          </button>
        </div>
      </header>

      {/* Main Body Layout (Sidebar + Main Content View) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile Drawer Overlay */}
        {isMobileSidebarOpen && (
          <div 
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-45 md:hidden"
          />
        )}

        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 top-[57px] md:top-0 md:static z-50 w-64 bg-[#0e0728] border-r border-purple-900/20 flex flex-col justify-between transform transition-transform duration-300 ease-in-out md:translate-x-0 select-none ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex-1 min-h-0 relative flex flex-col">
            <nav 
              ref={navRef}
              onScroll={checkScroll}
              className="flex-1 px-3.5 py-4 space-y-4 overflow-y-auto custom-scrollbar"
            >
              {/* UTAMA & ANALITIK */}
              <div className="space-y-1">
                <div className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  UTAMA &amp; ANALITIK
                </div>
                <a
                  href="?tab=dashboard"
                  onClick={(e) => handleTabClick('dashboard', e)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-2xl transition-all cursor-pointer ${
                    activeTab === 'dashboard'
                      ? 'border border-purple-400/80 bg-gradient-to-r from-purple-600/30 to-indigo-600/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <LayoutGrid className={`w-4 h-4 ${activeTab === 'dashboard' ? 'text-purple-300' : 'text-slate-400'}`} />
                  <span className="font-semibold text-xs tracking-wide">Insight Dashboard</span>
                </a>

                <a
                  href="?tab=daily_orders"
                  onClick={(e) => handleTabClick('daily_orders', e)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'daily_orders'
                      ? 'border border-purple-400/80 bg-gradient-to-r from-purple-600/30 to-indigo-600/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <ShoppingCart className={`w-4 h-4 ${activeTab === 'daily_orders' ? 'text-purple-300' : 'text-slate-400'}`} />
                  <span className="font-semibold text-xs tracking-wide">Orderan Harian</span>
                </a>

                <a
                  href="?tab=staff_schedule"
                  onClick={(e) => handleTabClick('staff_schedule', e)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'staff_schedule'
                      ? 'border border-purple-400/80 bg-gradient-to-r from-purple-600/30 to-indigo-600/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Calendar className={`w-4 h-4 ${activeTab === 'staff_schedule' ? 'text-purple-300' : 'text-slate-400'}`} />
                    <span className="font-semibold text-xs tracking-wide">Jadwal Staf Admin</span>
                  </div>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    Live
                  </span>
                </a>
              </div>

              {/* INPUT OPERASIONAL */}
              <div className="space-y-1">
                <div className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  INPUT OPERASIONAL
                </div>
                <a
                  href="?tab=input_retur2"
                  onClick={(e) => handleTabClick('input_retur2', e)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'input_retur2' || activeTab === 'input_retur'
                      ? 'border border-purple-400/80 bg-gradient-to-r from-purple-600/30 to-indigo-600/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <PackagePlus className={`w-4 h-4 ${activeTab === 'input_retur2' ? 'text-purple-300' : 'text-slate-400'}`} />
                  <span className="font-semibold text-xs tracking-wide">Input Retur / Lt 3</span>
                </a>

                <a
                  href="?tab=rusak_internal"
                  onClick={(e) => handleTabClick('rusak_internal', e)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'rusak_internal'
                      ? 'border border-purple-400/80 bg-gradient-to-r from-purple-600/30 to-indigo-600/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <PackageX className={`w-4 h-4 ${activeTab === 'rusak_internal' ? 'text-purple-300' : 'text-slate-400'}`} />
                  <span className="font-semibold text-xs tracking-wide">Eliminasi Stok Rusak</span>
                </a>

                <a
                  href="?tab=stok_bundling_admin"
                  onClick={(e) => handleTabClick('stok_bundling_admin', e)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'stok_bundling_admin'
                      ? 'border border-purple-400/80 bg-gradient-to-r from-purple-600/30 to-indigo-600/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Boxes className={`w-4 h-4 ${activeTab === 'stok_bundling_admin' ? 'text-purple-300' : 'text-slate-400'}`} />
                  <span className="font-semibold text-xs tracking-wide">Stok Bundling Admin</span>
                </a>
              </div>

              {/* DATA FISIK GUDANG Accordion */}
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setIsFisikOpen(!isFisikOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Package className="w-4 h-4 text-pink-400" />
                    <span className="font-bold text-[10px] text-pink-400 uppercase tracking-wider">DATA FISIK GUDANG</span>
                  </div>
                  {isFisikOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                </button>

                <AnimatePresence>
                  {isFisikOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden pl-7 space-y-1"
                    >
                      {[
                        { id: 'retur_fisik', label: 'Retur Fisik' },
                        { id: 'cancel_fisik', label: 'Cancel Fisik' },
                        { id: 'rusak_fisik', label: 'Rusak Fisik' },
                        { id: 'bundling_fisik', label: 'Bundling Fisik' },
                      ].map((subItem) => (
                        <a
                          key={subItem.id}
                          href={`?tab=${subItem.id}`}
                          onClick={(e) => handleTabClick(subItem.id, e)}
                          className={`block w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                            activeTab === subItem.id
                              ? 'text-purple-300 font-bold bg-purple-500/15 border-l-2 border-purple-400'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                          }`}
                        >
                          {subItem.label}
                        </a>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* LOG & DATA MASTER */}
              <div className="space-y-1">
                <div className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  LOG &amp; DATA MASTER
                </div>
                <a
                  href="?tab=table"
                  onClick={(e) => handleTabClick('table', e)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'table'
                      ? 'border border-purple-400/80 bg-gradient-to-r from-purple-600/30 to-indigo-600/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <TableIcon className={`w-4 h-4 ${activeTab === 'table' ? 'text-purple-300' : 'text-slate-400'}`} />
                  <span className="font-semibold text-xs tracking-wide">Eksplorasi Laporan</span>
                </a>

                <a
                  href="?tab=damaged_goods_report"
                  onClick={(e) => handleTabClick('damaged_goods_report', e)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'damaged_goods_report'
                      ? 'border border-purple-400/80 bg-gradient-to-r from-purple-600/30 to-indigo-600/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <AlertTriangle className={`w-4 h-4 ${activeTab === 'damaged_goods_report' ? 'text-purple-300' : 'text-slate-400'}`} />
                  <span className="font-semibold text-xs tracking-wide">Log Barang Rusak</span>
                </a>
              </div>

              {/* REKONSILIASI & ARSIP */}
              <div className="space-y-1">
                <div className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  REKONSILIASI &amp; ARSIP
                </div>
                <a
                  href="?tab=matcher"
                  onClick={(e) => handleTabClick('matcher', e)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'matcher'
                      ? 'border border-purple-400/80 bg-gradient-to-r from-purple-600/30 to-indigo-600/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <GitCompare className={`w-4 h-4 ${activeTab === 'matcher' ? 'text-purple-300' : 'text-slate-400'}`} />
                  <span className="font-semibold text-xs tracking-wide">Pencocok Data Excel</span>
                </a>

                <a
                  href="?tab=packing_list_check"
                  onClick={(e) => handleTabClick('packing_list_check', e)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'packing_list_check'
                      ? 'border border-purple-400/80 bg-gradient-to-r from-purple-600/30 to-indigo-600/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <ClipboardCheck className={`w-4 h-4 ${activeTab === 'packing_list_check' ? 'text-purple-300' : 'text-slate-400'}`} />
                  <span className="font-semibold text-xs tracking-wide">Cek Packing List</span>
                </a>

                <a
                  href="?tab=shipping_matcher"
                  onClick={(e) => handleTabClick('shipping_matcher', e)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'shipping_matcher'
                      ? 'border border-purple-400/80 bg-gradient-to-r from-purple-600/30 to-indigo-600/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Truck className={`w-4 h-4 ${activeTab === 'shipping_matcher' ? 'text-purple-300' : 'text-slate-400'}`} />
                  <span className="font-semibold text-xs tracking-wide">Pencocok Logistik</span>
                </a>

                <a
                  href="?tab=vault"
                  onClick={(e) => handleTabClick('vault', e)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'vault'
                      ? 'border border-purple-400/80 bg-gradient-to-r from-purple-600/30 to-indigo-600/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Database className={`w-4 h-4 ${activeTab === 'vault' ? 'text-purple-300' : 'text-slate-400'}`} />
                  <span className="font-semibold text-xs tracking-wide">Cloud Vault</span>
                </a>

                <a
                  href="?tab=admin_data_import"
                  onClick={(e) => handleTabClick('admin_data_import', e)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'admin_data_import'
                      ? 'border border-purple-400/80 bg-gradient-to-r from-purple-600/30 to-indigo-600/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CloudDownload className={`w-4 h-4 ${activeTab === 'admin_data_import' ? 'text-purple-300' : 'text-slate-400'}`} />
                    <span className="font-semibold text-xs tracking-wide">Data Admin Import</span>
                  </div>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Batch
                  </span>
                </a>
              </div>

              {/* SISTEM ADMINISTRATOR */}
              <div className="space-y-1 pt-2 pb-4">
                <div className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  SISTEM ADMINISTRATOR
                </div>
                <a
                  href="?tab=admin"
                  onClick={(e) => handleTabClick('admin', e)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-pink-500/30 bg-pink-950/20 text-pink-300 hover:bg-pink-900/40 transition-all cursor-pointer ${
                    activeTab === 'admin' ? 'ring-2 ring-pink-500/60 shadow-lg shadow-pink-500/20' : ''
                  }`}
                >
                  <Shield className="w-4 h-4 text-pink-400" />
                  <span className="font-bold text-xs tracking-wide">Panel Administrator</span>
                </a>
              </div>
            </nav>
          </div>
        </aside>

        {/* Main Content View Area */}
        <main className="flex-1 overflow-y-auto bg-[#0a041c] p-4 sm:p-7 custom-scrollbar select-text">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="w-full h-full"
            >
              {activeTab === 'dashboard' && <Dashboard stats={dashboardStats || undefined} reports={allReports} onNavigateTab={handleTabClick} />}
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
        </main>
      </div>
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
