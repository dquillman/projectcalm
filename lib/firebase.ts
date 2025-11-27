import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBCGyuLI8Z0Ytwmj87UcJZBBh8M8VbNec8",
  authDomain: "project-calm-f7327.firebaseapp.com",
  projectId: "project-calm-f7327",
  storageBucket: "project-calm-f7327.firebasestorage.app",
  messagingSenderId: "18229369569",
  appId: "1:18229369569:web:2b1673182b45232b84f5a0",
  measurementId: "G-B0W6M0D4LZ"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
