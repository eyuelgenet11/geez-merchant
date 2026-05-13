importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCJtJ30P0mlbxjG31Klc2qKhRoF9FkF_s4",
  authDomain: "geez-market.firebaseapp.com",
  projectId: "geez-market",
  storageBucket: "geez-market.firebasestorage.app",
  messagingSenderId: "1060637839102",
  appId: "1:1060637839102:web:f0247ee88ca5a3a29f9faf"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png' // Modify this to your actual logo path
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
