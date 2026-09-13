import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { 
  initializeFirestore, 
  memoryLocalCache
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firestore with memory local cache to prevent iframe storage/IndexedDB failures
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Auth persistence setup:", err);
});

let isSigningIn = false;
export const ensureFirebaseAuth = async (): Promise<any> => {
  if (auth.currentUser) return auth.currentUser;
  if (isSigningIn) {
    let checks = 0;
    while (isSigningIn && checks < 30) {
      await new Promise(r => setTimeout(r, 150));
      checks++;
      if (auth.currentUser) return auth.currentUser;
    }
    return auth.currentUser || null;
  }

  isSigningIn = true;
  try {
    if (auth.currentUser) return auth.currentUser;
    const { signInAnonymously } = await import('firebase/auth');
    
    // Quick race with 3.5s timeout to prevent network hang
    const authPromise = signInAnonymously(auth).then(cred => cred.user);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500));
    
    const user = await Promise.race([authPromise, timeoutPromise]);
    return user || auth.currentUser || null;
  } catch (err: any) {
    console.warn("[Firebase] Anonymous auth background notice:", err?.message || err);
  } finally {
    isSigningIn = false;
  }
  return auth.currentUser || null;
};

// Pre-warm Firebase auth in background
ensureFirebaseAuth().catch(() => {});

