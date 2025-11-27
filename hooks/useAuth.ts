/* @jsxRuntime classic */
/* @jsx React.createElement */
// Use global React from UMD build
const { useState, useEffect } = React as typeof React;

import { User, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (u) => {
            if (u) {
                console.log("Auth state restored:", u.uid);
                setUser(u);
                setLoading(false);
            } else {
                console.log("No user found, signing in anonymously...");
                signInAnonymously(auth).catch((error) => {
                    console.error("Anonymous auth failed", error);
                    setLoading(false);
                });
            }
        });

        return unsubscribe;
    }, []);

    return { user, loading };
}
