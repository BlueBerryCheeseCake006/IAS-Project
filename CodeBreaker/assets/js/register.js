import { auth, db as firestoreDb } from './firebase-config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const notice = consumeSessionNotice();
    const sessionNotice = document.getElementById('sessionNotice');
    if (sessionNotice && notice) {
        sessionNotice.innerText = notice;
    }
});

async function handleRegister(e) {
    e.preventDefault();
    const user = sanitizeTextInput(document.getElementById('regUsername').value).toLowerCase();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const pass = document.getElementById('regPassword').value;
    const errorMsg = document.getElementById('regError');

    if (!isStrongPassword(pass)) {
        errorMsg.innerText = 'Password must be 8+ chars with uppercase, lowercase, and a number.';
        return;
    }

    try {
        const usernameQuery = query(collection(firestoreDb, 'users'), where('username', '==', user), limit(1));
        const usernameSnapshot = await getDocs(usernameQuery);
        if (usernameSnapshot.size || findUserByUsername(user)) {
            errorMsg.innerText = 'That username is already taken. Please choose a different one.';
            return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const firebaseUser = userCredential.user;
        const profile = {
            username: user,
            email,
            role: 'user',
            twoFactorEnabled: true,
            forcePasswordReset: false,
            sessionInfo: {
                currentDevice: getDeviceLabel(),
                otherSessions: []
            },
            passwordHash: hashPassword(pass),
            firebaseUid: firebaseUser.uid,
            createdAt: serverTimestamp()
        };

        await setDoc(doc(firestoreDb, 'users', firebaseUser.uid), profile);
        syncLocalUserProfile(profile, pass);
        logActivity(user, 'Account Created');
        setSessionNotice('Registration complete. Please sign in.');
        window.location.href = 'login.html';
    } catch (error) {
        const code = error?.code || '';
        if (code === 'auth/email-already-in-use') {
            errorMsg.innerText = 'That email address is already registered. Try logging in or use a different email.';
        } else if (code === 'auth/invalid-email') {
            errorMsg.innerText = 'Please enter a valid email address.';
        } else if (code === 'auth/weak-password') {
            errorMsg.innerText = 'Password is too weak. Use at least 8 characters with uppercase, lowercase, and a number.';
        } else if (code === 'auth/network-request-failed') {
            errorMsg.innerText = 'Network error. Please check your connection and try again.';
        } else {
            errorMsg.innerText = 'Registration failed. Please try again.';
        }
    }
}

window.handleRegister = handleRegister;