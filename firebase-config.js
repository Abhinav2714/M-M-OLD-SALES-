/* ==========================================================================
   FIREBASE CONFIGURATION
   ==========================================================================
   1. Go to https://console.firebase.google.com
   2. Create a new project (free "Spark" plan is enough for 10-15 users)
   3. Click the "</>" (Web) icon to register a web app
   4. Copy the config object Firebase gives you and paste the values below
   5. In the Firebase console, enable:
      - Build > Authentication > Sign-in method > Email/Password (enable it)
      - Build > Firestore Database > Create database (start in "production mode")
   6. Paste your Firestore security rules from FIREBASE_SETUP.md
   ========================================================================== */

const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

// Initialize Firebase (compat SDK loaded via CDN in index.html)
firebase.initializeApp(firebaseConfig);

// Export shared instances used by app.js
const auth = firebase.auth();
const db = firebase.firestore();
