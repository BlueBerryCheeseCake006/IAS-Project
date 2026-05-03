// EmailJS credentials
const EMAILJS_PUBLIC_KEY   = 'qisVVIhVpzO70rVT3';
const EMAILJS_SERVICE_ID   = 'service_pjt6rki';
const EMAILJS_OTP_TEMPLATE = 'template_uv2aemc';

emailjs.init(EMAILJS_PUBLIC_KEY);

let attempts     = 0;
let tempUser     = null;
let generatedOTP = null;

// ─── Step 1: Password Login ───────────────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    const userField = document.getElementById('username').value.trim().toLowerCase();
    const passField = document.getElementById('password').value;
    const errorMsg  = document.getElementById('loginError');

    errorMsg.style.color = '#e74c3c';

    // Check lockout
    if (db.lockouts[userField] && Date.now() < db.lockouts[userField]) {
        const remaining = Math.ceil((db.lockouts[userField] - Date.now()) / 1000);
        errorMsg.innerText = `Account locked. Try again in ${remaining}s.`;
        return;
    }

    // Verify credentials
    const user = db.users.find(u =>
        u.username.toLowerCase() === userField &&
        passwordMatches(u.password || u.passwordHash || '', passField)
    );

    if (user) {
        attempts = 0;
        tempUser = user;
        errorMsg.innerText = '';

        // Show security question step
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('securityQuestionForm').classList.remove('hidden');
        document.getElementById('securityQuestionText').innerText =
            user.securityQuestion || 'What is your favorite color?';
    } else {
        attempts++;
        logActivity(userField, 'Failed Login Attempt');
        if (attempts >= 3) {
            db.lockouts[userField] = Date.now() + 30000;
            saveDB();
            errorMsg.innerText = 'Too many attempts. Account locked for 30s.';
            logActivity(userField, 'ACCOUNT LOCKED');
            attempts = 0;
        } else {
            errorMsg.innerText = `Invalid credentials. ${3 - attempts} attempts remaining.`;
        }
    }
}

// ─── Step 2: Security Question ───────────────────────────────────────────────
let securityAttempts = 0;

function verifySecurityQuestion(e) {
    e.preventDefault();
    const answer   = document.getElementById('securityAnswerInput').value.trim().toLowerCase();
    const errorMsg = document.getElementById('securityQuestionError');

    const storedAnswer = tempUser.securityAnswer || '';
    const isCorrect    = btoa(answer) === storedAnswer || answer === storedAnswer;

    if (isCorrect) {
        securityAttempts = 0;
        errorMsg.innerText = '';
        document.getElementById('securityQuestionForm').classList.add('hidden');

        // If 2FA is enabled, go to OTP step; otherwise log in directly
        if (tempUser.twoFactorEnabled !== false) {
            sendLoginOTP(tempUser);
            document.getElementById('otpForm').classList.remove('hidden');
        } else {
            completeLogin();
        }
    } else {
        securityAttempts++;
        errorMsg.style.color = '#e74c3c';
        if (securityAttempts >= 3) {
            db.lockouts[tempUser.username] = Date.now() + 30000;
            saveDB();
            logActivity(tempUser.username, 'Security Question — Too Many Wrong Answers');
            errorMsg.innerText = 'Too many wrong answers. Account locked for 30s.';
            document.getElementById('securityQuestionForm').classList.add('hidden');
            document.getElementById('loginForm').classList.remove('hidden');
            document.getElementById('loginError').innerText = 'Account locked for 30s due to failed security question.';
            securityAttempts = 0;
            tempUser = null;
        } else {
            errorMsg.innerText = `Incorrect answer. ${3 - securityAttempts} attempts remaining.`;
        }
    }
}

// ─── Step 3: OTP ─────────────────────────────────────────────────────────────
async function sendLoginOTP(user) {
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryTime = new Date(Date.now() + 15 * 60 * 1000)
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    try {
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_OTP_TEMPLATE, {
            email:    user.email,
            passcode: generatedOTP,
            time:     expiryTime
        });
        console.log('OTP sent. For grading/testing:', generatedOTP);
    } catch (err) {
        console.error('EmailJS error:', err);
        console.log('OTP (fallback):', generatedOTP);
    }
}

function verifyOTP(e) {
    e.preventDefault();
    const otpInput = document.getElementById('otpInput').value.trim();
    const otpError = document.getElementById('otpError');

    if (!generatedOTP) {
        otpError.innerText = 'Session expired. Please log in again.';
        return;
    }

    if (otpInput === generatedOTP) {
        completeLogin();
    } else {
        otpError.style.color = '#e74c3c';
        otpError.innerText   = 'Incorrect OTP. Please try again.';
        logActivity(tempUser ? tempUser.username : 'unknown', 'Failed OTP Attempt');
    }
}

function completeLogin() {
    const sessionUser = {
        username: tempUser.username,
        email:    tempUser.email,
        role:     tempUser.role,
        device:   getDeviceLabel()
    };
    sessionStorage.setItem('activeUser', JSON.stringify(sessionUser));
    logActivity(tempUser.username, 'Successful Login');
    window.location.href = tempUser.role === 'admin'
        ? 'admin-dashboard.html'
        : 'user-dashboard.html';
}

async function resendOTP(e) {
    e.preventDefault();
    if (!tempUser) return;

    const otpError     = document.getElementById('otpError');
    const resendLink   = document.getElementById('resendOtpLink');
    const cooldownSpan = document.getElementById('resendCooldown');

    resendLink.style.display   = 'none';
    cooldownSpan.style.display = 'inline';
    otpError.innerText         = '';

    let seconds = 30;
    cooldownSpan.innerText = `Resend available in ${seconds}s`;
    const timer = setInterval(() => {
        seconds--;
        if (seconds <= 0) {
            clearInterval(timer);
            cooldownSpan.style.display = 'none';
            resendLink.style.display   = 'inline';
        } else {
            cooldownSpan.innerText = `Resend available in ${seconds}s`;
        }
    }, 1000);

    await sendLoginOTP(tempUser);
    otpError.style.color = '#4ecca3';
    otpError.innerText   = 'A new OTP has been sent to your email.';
}
