/* @jsxRuntime classic */
/* @jsx React.createElement */
// Use global React from UMD build
const { useState, useEffect } = React as typeof React;

import {
    User,
    signInAnonymously,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    linkWithPopup,
    signInWithRedirect,
    linkWithRedirect,
    getRedirectResult,
    signOut as firebaseSignOut,
    AuthError
} from 'firebase/auth';
import { auth } from '../lib/firebase';

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Handle redirect result (for mobile sign-in)
        getRedirectResult(auth).then((result) => {
            if (result) {
                console.log("Redirect sign-in successful. User:", result.user.uid, "Anonymous:", result.user.isAnonymous);
                setUser(result.user);
            } else {
                console.log("No redirect result found.");
            }
        }).catch((error) => {
            console.error("Redirect sign-in failed", error);
            if (error.code === 'auth/credential-already-in-use') {
                alert("This account is already in use. Please sign out and sign in again.");
            }
        });

        const unsubscribe = onAuthStateChanged(auth, (u) => {
            console.log("Auth state changed. User:", u?.uid, "Anonymous:", u?.isAnonymous);
            if (u) {
                setUser(u);
                setLoading(false);
            } else {
                console.log("No user found, signing in anonymously...");
                setUser(null); // Clear the user state while we wait for anonymous sign-in
                signInAnonymously(auth).catch((error) => {
                    console.error("Anonymous auth failed", error);
                    setLoading(false);
                });
            }
        });

        return unsubscribe;
    }, []);

    const signInWithGoogle = async () => {
        const provider = new GoogleAuthProvider();

        // Check for retry flag (set when switching accounts)
        const isRetry = sessionStorage.getItem('auth_retry');
        if (isRetry) {
            sessionStorage.removeItem('auth_retry');
            console.log("Retry flag found. Skipping link and attempting direct sign-in...");
            try {
                await signInWithPopup(auth, provider);
                return;
            } catch (error: any) {
                console.error("Direct sign-in failed", error);
                alert("Sign in failed: " + error.message);
                return;
            }
        }

        try {
            if (auth.currentUser && auth.currentUser.isAnonymous) {

                // Try to link first using popup (better UX for desktop)
                await linkWithPopup(auth.currentUser, provider);


            } else {

                await signInWithPopup(auth, provider);

            }
        } catch (error: any) {
            console.error("Sign-in error caught:", error);
            const e = error as AuthError;
            // If popup is blocked or closed, or if we are on a device where popup is bad,
            // we might want to fallback to redirect.

            if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
                // Fallback to redirect for main sign-in
                // Note: We can't easily "link" with redirect here without losing the anonymous state 
                // unless we use linkWithRedirect.

                // If the user is anonymous and has no data (tablet case), we don't care about linking.
                // But we don't know that for sure.

                // Let's try linkWithRedirect if we are anonymous.
                if (auth.currentUser && auth.currentUser.isAnonymous) {
                    try {
                        await linkWithRedirect(auth.currentUser, provider);
                        return;
                    } catch (linkError) {
                        console.error("Link with redirect failed", linkError);
                    }
                }

                await signInWithRedirect(auth, provider);
            } else if (e.code === 'auth/credential-already-in-use') {
                // The Google account is already linked to another user.
                // We cannot "switch" automatically because of popup blockers.
                // SIMPLE SOLUTION: Sign out and ask user to sign in again.
                // We set a flag so the next attempt skips linking and just signs in.
                sessionStorage.setItem('auth_retry', 'true');
                await firebaseSignOut(auth);
                setUser(null);
                alert("This Google account is already associated with another profile.\n\nYou have been signed out. Please click 'Sign In' again to access that profile.");
            } else {
                console.error("Google sign in failed", error);
                alert("Sign in failed: " + e.message);
            }
        }
    };

    const logout = async () => {
        try {
            await firebaseSignOut(auth);
            // After logout, onAuthStateChanged will trigger.
            // If we want to force a new anonymous session immediately:
            // signInAnonymously(auth); // onAuthStateChanged handles this actually
        } catch (e) {
            console.error("Logout failed", e);
        }
    };

    return { user, loading, signInWithGoogle, logout };
}
