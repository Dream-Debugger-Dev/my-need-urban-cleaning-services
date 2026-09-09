/* ===============================
   MyNeedUrban — firebase-messaging-sw.js
   FCM background push notification handler
   Must be at the root of the site.
   =============================== */

importScripts('https://www.gstatic.com/firebasejs/11.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCPcuAit4o2Kc_EQ6QDinIg2VArOhYfikg",
  authDomain: "myneedurban-ec1c9.firebaseapp.com",
  projectId: "myneedurban-ec1c9",
  storageBucket: "myneedurban-ec1c9.firebasestorage.app",
  messagingSenderId: "938179747414",
  appId: "1:938179747414:web:b60e962c9521f3fc96e5f7"
});

const messaging = firebase.messaging();

// Handle background messages (app not in foreground)
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'MyNeedUrban', {
    body: body || '',
    icon: '/assets/pwa/icon-192.png',
    badge: '/assets/pwa/icon-maskable-192.png',
    data: payload.data || {},
  });
});
