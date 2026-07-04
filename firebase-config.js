/* ==========================================================================
   FIREBASE CONFIGURATION
   ========================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyCl_5PoJ4U9B0EK0s-TyCgxv7OwJaQJs90",
  authDomain: "brreddy-sales-portal-bf7cd.firebaseapp.com",
  projectId: "brreddy-sales-portal-bf7cd",
  storageBucket: "brreddy-sales-portal-bf7cd.firebasestorage.app",
  messagingSenderId: "56203776657",
  appId: "1:56203776657:web:495564753d990ad2866530"
};

// Initialize Firebase (compat SDK loaded via CDN in index.html)
firebase.initializeApp(firebaseConfig);

// Export shared instances used by app.js
const auth = firebase.auth();
const db = firebase.firestore();
