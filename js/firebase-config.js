/* ===============================
   MyNeedUrban — firebase-config.js
   Firebase initialization for website
   =============================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyCPcuAit4o2Kc_EQ6QDinIg2VArOhYfikg",
  authDomain: "myneedurban-ec1c9.firebaseapp.com",
  projectId: "myneedurban-ec1c9",
  storageBucket: "myneedurban-ec1c9.firebasestorage.app",
  messagingSenderId: "938179747414",
  appId: "1:938179747414:web:b60e962c9521f3fc96e5f7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth, collection, addDoc, serverTimestamp };
