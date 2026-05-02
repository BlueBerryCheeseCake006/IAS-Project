import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCqejQKlsXLaLWctcDlRJpnzchPvXfNNk4",
    authDomain: "ias-website-13e56.firebaseapp.com",
    projectId: "ias-website-13e56",
    storageBucket: "ias-website-13e56.firebasestorage.app",
    messagingSenderId: "101769660348",
    appId: "1:101769660348:web:426f0b058080d94b7f0db9",
    measurementId: "G-X1K9T4M7T9"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };