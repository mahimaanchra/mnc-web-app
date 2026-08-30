import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC7GncgRyU8zXHsrJUbcokXd1JFHCV3Fac",
  authDomain: "mnc-cafe-app.firebaseapp.com",
  projectId: "mnc-cafe-app",
  storageBucket: "mnc-cafe-app.firebasestorage.app",
  messagingSenderId: "398818212520",
  appId: "1:398818212520:web:d1a33545aa640a76cf609d",
  measurementId: "G-PC8K39NRE6",
};

const app = initializeApp(firebaseConfig);

export const db      = getFirestore(app, "mnc-cafe-db");
export const storage = getStorage(app);
export const auth    = getAuth(app);

export default app;
