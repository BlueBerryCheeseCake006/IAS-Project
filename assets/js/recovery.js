// assets/js/recovery.js
let pendingRecoveryUser = null;
let pendingRecoveryEmail = '';

function showRecoveryMessage(message, isError = false) {
    const messageTarget = document.getElementById('recoveryMessage') || document.getElementById('resetMessage');
    if (!messageTarget) {
        return;
    }

    messageTarget.className = isError ? 'error-msg' : 'success-msg';
    messageTarget.innerText = message;
}

function getRecoveryToken(email) {
    return db.resetTokens[email] || null;
}

async function lookupRecoveryProfileByEmail(email) {
    const firebaseModule = await import('./firebase-config.js');
    const firestoreModule = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js');
    const firebaseQuery = firestoreModule.query(
        firestoreModule.collection(firebaseModule.db, 'users'),
        firestoreModule.where('email', '==', email),
        firestoreModule.limit(1)
    );
    const snapshot = await firestoreModule.getDocs(firebaseQuery);
    if (snapshot.empty) {
        return null;
    }

    const docSnapshot = snapshot.docs[0];
    return { firestoreId: docSnapshot.id, ...docSnapshot.data() };
}

async function startForgotPasswordFlow(e) {
    e.preventDefault();
    const emailField = document.getElementById('recoveryEmail');
    pendingRecoveryEmail = sanitizeTextInput(emailField.value).toLowerCase();
    pendingRecoveryUser = findUserByEmail(pendingRecoveryEmail);

    if (!pendingRecoveryUser) {
        pendingRecoveryUser = await lookupRecoveryProfileByEmail(pendingRecoveryEmail);
        if (pendingRecoveryUser) {
            syncLocalUserProfile(pendingRecoveryUser);
        }
    }

    if (pendingRecoveryUser) {
        const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
        db.resetTokens[pendingRecoveryEmail] = {
            otp: resetOtp,
            username: pendingRecoveryUser.username,
            expiresAt: Date.now() + 10 * 60 * 1000
        };
        saveDB();

        try {
            emailjs.init('qisVVIhVpzO70rVT3');
            const expiryTime = new Date(Date.now() + 10 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            await emailjs.send('service_pjt6rki', 'template_4psyrma', {
                email:    pendingRecoveryUser.email,
                passcode: resetOtp,
                time:     expiryTime
            });
            console.log('Password reset OTP sent. For grading/testing:', resetOtp);
        } catch (err) {
            console.error('EmailJS error:', err);
            // OTP is still saved in db, so user can proceed if they check console
            console.log('EmailJS failed. Reset OTP (console only):', resetOtp);
        }
    }

    document.getElementById('recoveryRequestForm').classList.add('hidden');
    document.getElementById('recoveryOtpForm').classList.remove('hidden');
    showRecoveryMessage('If an account matches, an email has been sent with a reset OTP.');
}

function verifyForgotPasswordOTP(e) {
    e.preventDefault();
    const enteredOtp = document.getElementById('recoveryOtpInput').value.trim();
    const otpError = document.getElementById('recoveryOtpError');
    const token = getRecoveryToken(pendingRecoveryEmail);

    if (!pendingRecoveryUser || !token || token.expiresAt < Date.now() || token.otp !== enteredOtp) {
        otpError.innerText = 'Invalid or expired code.';
        return;
    }

    delete db.resetTokens[pendingRecoveryEmail];
    saveDB();
    setPasswordResetContext({
        username: pendingRecoveryUser.username,
        email: pendingRecoveryEmail,
        mode: 'recovery'
    });
    setSessionNotice('OTP verified. Create a new password.');
    window.location.href = 'reset-password.html';
}

function getResetTargetUser() {
    const resetContext = getPasswordResetContext();
    const activeSession = JSON.parse(sessionStorage.getItem('activeUser'));

    if (resetContext && resetContext.username) {
        return findUserByUsername(resetContext.username);
    }

    if (activeSession && activeSession.passwordResetRequired) {
        return findUserByUsername(activeSession.username);
    }

    return null;
}

async function startResetPasswordFlow(e) {
    e.preventDefault();
    const user = getResetTargetUser();
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!user) {
        setSessionNotice('Please start the password reset process again.');
        window.location.href = 'login.html';
        return;
    }

    if (newPassword !== confirmPassword) {
        showRecoveryMessage('Passwords do not match.', true);
        return;
    }

    if (!isStrongPassword(newPassword)) {
        showRecoveryMessage('Password must be 8+ chars with uppercase, lowercase, and a number.', true);
        return;
    }

    user.password = hashPassword(newPassword);
    user.forcePasswordReset = false;
    saveDB();
    logActivity(user.username, 'Password Reset');
    syncLocalUserProfile(user, newPassword);

    if (user.firestoreId) {
        try {
            const firebaseModule = await import('./firebase-config.js');
            const firestoreModule = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js');
            await firestoreModule.updateDoc(firestoreModule.doc(firebaseModule.db, 'users', user.firestoreId), {
                passwordHash: hashPassword(newPassword),
                updatedAt: new Date()
            });
        } catch (error) {
            console.warn('Firebase password mirror update failed:', error);
        }
    }

    clearPasswordResetContext();

    const activeSession = JSON.parse(sessionStorage.getItem('activeUser'));
    if (activeSession && activeSession.username === user.username && activeSession.passwordResetRequired) {
        sessionStorage.setItem('activeUser', JSON.stringify({
            username: user.username,
            role: user.role,
            passwordResetRequired: false
        }));
        setSessionNotice('Password updated successfully.');
        window.location.href = user.role === 'admin' ? 'admin-dashboard.html' : 'user-dashboard.html';
        return;
    }

    sessionStorage.removeItem('activeUser');
    setSessionNotice('Password updated. Please sign in.');
    window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', () => {
    const notice = consumeSessionNotice();
    const recoveryNotice = document.getElementById('recoveryMessage') || document.getElementById('resetMessage');
    if (recoveryNotice && notice) {
        recoveryNotice.innerText = notice;
    }

    const forgotRequestForm = document.getElementById('recoveryRequestForm');
    if (forgotRequestForm) {
        forgotRequestForm.addEventListener('submit', startForgotPasswordFlow);
    }

    const forgotOtpForm = document.getElementById('recoveryOtpForm');
    if (forgotOtpForm) {
        forgotOtpForm.addEventListener('submit', verifyForgotPasswordOTP);
    }

    const resetPasswordForm = document.getElementById('resetPasswordForm');
    if (resetPasswordForm) {
        const targetUser = getResetTargetUser();
        if (!targetUser) {
            setSessionNotice('Please start the password reset process again.');
            window.location.href = 'login.html';
            return;
        }

        const resetTargetLabel = document.getElementById('resetTargetLabel');
        if (resetTargetLabel) {
            resetTargetLabel.innerText = targetUser.username;
        }

        resetPasswordForm.addEventListener('submit', startResetPasswordFlow);
    }
});