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
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (auth.currentUser) return auth.currentUser;
        const { signInAnonymously } = await import('firebase/auth');
        const cred = await signInAnonymously(auth);
        return cred.user;
      } catch (err: any) {
        if (attempt === 3) {
          console.warn("[Firebase] Background anonymous auth attempt:", err?.message || err);
        } else {
          await new Promise(r => setTimeout(r, attempt * 800));
        }
      }
    }
  } finally {
    isSigningIn = false;
  }
  return auth.currentUser || null;
};

// Pre-warm Firebase auth in background
ensureFirebaseAuth().catch(() => {});

