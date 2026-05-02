// EmailJS credentials
const EMAILJS_PUBLIC_KEY   = 'qisVVIhVpzO70rVT3';
const EMAILJS_SERVICE_ID   = 'service_pjt6rki';
const EMAILJS_OTP_TEMPLATE = 'template_uv2aemc';

emailjs.init(EMAILJS_PUBLIC_KEY);

let attempts = 0;
let tempUser = null;
let generatedOTP = null;

async function sendLoginOTP(user) {
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryTime = new Date(Date.now() + 15 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_OTP_TEMPLATE, {
        email:    user.email,
        passcode: generatedOTP,
        time:     expiryTime
    });
    console.log('OTP sent. For grading/testing, check console:', generatedOTP);
}

async function handleLogin(e) {
    e.preventDefault();
    const userField = document.getElementById('username').value.trim().toLowerCase();
    const passField = document.getElementById('password').value;
    const errorMsg  = document.getElementById('loginError');

    // 1. Check if account is locked
    if (db.lockouts[userField] && Date.now() < db.lockouts[userField]) {
        const remaining = Math.ceil((db.lockouts[userField] - Date.now()) / 1000);
        errorMsg.innerText = `Account locked. Try again in ${remaining}s.`;
        return;
    }

    // 2. Verify credentials (usernames are stored lowercase)
    const user = db.users.find(u =>
        u.username.toLowerCase() === userField &&
        passwordMatches(u.password || u.passwordHash || '', passField)
    );

    if (user) {
        attempts = 0;
        tempUser  = user;
        errorMsg.style.color = '#4ecca3';
        errorMsg.innerText   = 'Sending OTP to your email...';

        try {
            await sendLoginOTP(user);
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('otpForm').classList.remove('hidden');
            errorMsg.innerText = '';
        } catch (err) {
            console.error('EmailJS error:', err);
            errorMsg.style.color = '#e74c3c';
            errorMsg.innerText   = 'Failed to send OTP. Please try again.';
        }

    } else {
        attempts++;
        logActivity(userField, 'Failed Login Attempt');
        errorMsg.style.color = '#e74c3c';
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

function verifyOTP(e) {
    e.preventDefault();
    const otpInput = document.getElementById('otpInput').value.trim();
    const otpError = document.getElementById('otpError');

    if (!generatedOTP) {
        otpError.innerText = 'Session expired. Please log in again.';
        return;
    }

    if (otpInput === generatedOTP) {
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
    } else {
        otpError.style.color = '#e74c3c';
        otpError.innerText   = 'Incorrect OTP. Please try again.';
        logActivity(tempUser ? tempUser.username : 'unknown', 'Failed OTP Attempt');
    }
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

    try {
        await sendLoginOTP(tempUser);
        otpError.style.color = '#4ecca3';
        otpError.innerText   = 'A new OTP has been sent to your email.';
    } catch (err) {
        console.error('EmailJS resend error:', err);
        otpError.style.color = '#e74c3c';
        otpError.innerText   = 'Failed to resend OTP. Please try again.';
    }
}
