/* ===============================
   MyNeedUrban — firebase-config.js
   Firebase initialisation shared by every page.

   Import this file as './firebase-config.js?v=<same version as the HTML>'
   from every module. A different URL (e.g. no ?v=) loads a second copy of
   the module — a second Firebase app, and doubled listeners.
   =============================== */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  setDoc,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyCPcuAit4o2Kc_EQ6QDinIg2VArOhYfikg",
  authDomain: "myneedurban-ec1c9.firebaseapp.com",
  projectId: "myneedurban-ec1c9",
  storageBucket: "myneedurban-ec1c9.firebasestorage.app",
  messagingSenderId: "938179747414",
  appId: "1:938179747414:web:b60e962c9521f3fc96e5f7"
};

// Web Push public key: Firebase console → Project settings → Cloud Messaging →
// Web Push certificates. Used only when an admin taps "Alerts on" on the
// admin page. If this is not your project's key, push registration fails
// quietly and in-page alerts still work.
const VAPID_KEY = 'BLx7pPzUiGi_Nm3ZUiIGKg1mSW_pSfYHk3XVmN5R8qVwE2LVqXoKVUyHdH6Q3oEVkP8NiSg2D9fR7JdZpMQkFcE';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export {
  app, db, auth, VAPID_KEY,
  // Firestore helpers
  collection, addDoc, serverTimestamp, setDoc, doc, getDoc,
  query, where, orderBy, limit, onSnapshot, updateDoc,
  // Auth helpers
  RecaptchaVerifier, signInWithPhoneNumber,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, onAuthStateChanged, signOut
};
