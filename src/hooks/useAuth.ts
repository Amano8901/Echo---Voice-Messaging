import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const initialProfile: UserProfile = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || 'Anonymous',
          email: firebaseUser.email || '',
          photoURL: firebaseUser.photoURL || undefined,
          lastSeen: serverTimestamp(),
        };

        // Sync user to Firestore
        await setDoc(doc(db, 'users', firebaseUser.uid), initialProfile, { merge: true });
        setUser(firebaseUser);

        // Listen to profile changes
        unsubscribeProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (snapshot) => {
          if (snapshot.exists()) {
            setProfile(snapshot.data() as UserProfile);
          }
        });
      } else {
        setUser(null);
        setProfile(null);
        if (unsubscribeProfile) unsubscribeProfile();
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  return { user, profile, loading };
}
