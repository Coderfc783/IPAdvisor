import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db, testFirestoreConnection } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}

export const handleFirestoreError = (error: any, operation: FirestoreErrorInfo['operationType'], path: string | null) => {
  if (error?.code === 'permission-denied') {
    const user = auth.currentUser;
    const info: FirestoreErrorInfo = {
      error: error.message,
      operationType: operation,
      path,
      authInfo: {
        userId: user?.uid || 'anonymous',
        email: user?.email || '',
        emailVerified: user?.emailVerified || false,
        isAnonymous: user?.isAnonymous || true,
        providerInfo: user?.providerData.map(p => ({
          providerId: p.providerId,
          displayName: p.displayName || '',
          email: p.email || ''
        })) || []
      }
    };
    throw new Error(JSON.stringify(info));
  }
  throw error;
};

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  saveUserProfile: (data: any) => Promise<void>;
  loadUserProfile: () => Promise<any>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    testFirestoreConnection();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const saveUserProfile = async (data: any) => {
    if (!user) return;
    try {
      const userDoc = doc(db, 'users', user.uid);
      await setDoc(userDoc, {
        ...data,
        userId: user.uid,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, 'write', `users/${user.uid}`);
    }
  };

  const loadUserProfile = async () => {
    if (!user) return null;
    try {
      const userDoc = doc(db, 'users', user.uid);
      const snapshot = await getDoc(userDoc);
      return snapshot.exists() ? snapshot.data() : null;
    } catch (e) {
      handleFirestoreError(e, 'get', `users/${user.uid}`);
    }
  };

  return (
    <FirebaseContext.Provider value={{ user, loading, saveUserProfile, loadUserProfile }}>
      {children}
    </FirebaseContext.Provider>
  );
}

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) throw new Error('useFirebase must be used within a FirebaseProvider');
  return context;
};
