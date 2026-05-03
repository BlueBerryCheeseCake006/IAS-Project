// assets/js/session.js
const DB_KEY = 'codeBreakerDB';
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
let idleTimeoutHandle = null;
let idleMonitoringBound = false;

function createDefaultUser(overrides = {}) {
    return {
        username: 'admin',
        email: 'nathanielrodrigueza3@gmail.com',
        password: 'btoa("Admin123!")',
        role: 'admin',
        twoFactorEnabled: true,
        forcePasswordReset: false,
        securityQuestion: 'What is the name of this system?',
        securityAnswer: btoa('codebreaker'),
        sessionInfo: {
            currentDevice: 'Windows / Chrome',
            otherSessions: []
        },
        ...overrides
    };
}

function createDefaultDB() {
    return {
        users: [createDefaultUser()],
        logs: [],
        lockouts: {},
        resetTokens: {}
    };
}

function normalizeUser(user = {}) {
    return {
        ...user,
        twoFactorEnabled: user.twoFactorEnabled !== false,
        forcePasswordReset: Boolean(user.forcePasswordReset),
        sessionInfo: {
            currentDevice: 'Windows / Chrome',
            otherSessions: [],
            ...(user.sessionInfo || {})
        }
    };
}

function normalizeDB(rawDB) {
    const source = rawDB && typeof rawDB === 'object' ? rawDB : createDefaultDB();
    const users = Array.isArray(source.users) && source.users.length ? source.users.map(normalizeUser) : createDefaultDB().users;

    if (!users.some((user) => user.username === 'admin')) {
        users.unshift(createDefaultUser());
    }

    return {
        users,
        logs: Array.isArray(source.logs) ? source.logs : [],
        lockouts: source.lockouts && typeof source.lockouts === 'object' ? source.lockouts : {},
        resetTokens: source.resetTokens && typeof source.resetTokens === 'object' ? source.resetTokens : {}
    };
}

if (!localStorage.getItem(DB_KEY)) {
    localStorage.setItem(DB_KEY, JSON.stringify(createDefaultDB()));
}

const db = normalizeDB(JSON.parse(localStorage.getItem(DB_KEY)));

// Migration: update admin email and security question if still using old defaults
const adminUser = db.users.find(u => u.username === 'admin');
if (adminUser) {
    if (adminUser.email !== 'nathanielrodrigueza3@gmail.com') {
        adminUser.email = 'nathanielrodrigueza3@gmail.com';
    }
    if (adminUser.securityAnswerHash && !adminUser.securityAnswer) {
        adminUser.securityAnswer = adminUser.securityAnswerHash;
        delete adminUser.securityAnswerHash;
    }
    if (!adminUser.securityQuestion) {
        adminUser.securityQuestion = 'What is the name of this system?';
        adminUser.securityAnswer   = btoa('codebreaker');
    }
    localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function saveDB() {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function syncLocalUserProfile(profile, password = null) {
    if (!profile || !profile.username) {
        return null;
    }

    const normalizedUsername = sanitizeTextInput(profile.username);
    const existingUser = findUserByUsername(normalizedUsername);
    const passwordHash = password ? hashPassword(password) : (profile.passwordHash || existingUser?.password || existingUser?.passwordHash || hashPassword('Temp1234!'));
    const nextUser = {
        username: normalizedUsername,
        email: profile.email || existingUser?.email || '',
        password: passwordHash,
        passwordHash,
        role: profile.role || existingUser?.role || 'user',
        twoFactorEnabled: profile.twoFactorEnabled !== undefined ? profile.twoFactorEnabled : (existingUser?.twoFactorEnabled !== false),
        forcePasswordReset: Boolean(profile.forcePasswordReset ?? existingUser?.forcePasswordReset),
        sessionInfo: {
            currentDevice: profile.sessionInfo?.currentDevice || existingUser?.sessionInfo?.currentDevice || 'Windows / Chrome',
            otherSessions: Array.isArray(profile.sessionInfo?.otherSessions)
                ? profile.sessionInfo.otherSessions
                : (Array.isArray(existingUser?.sessionInfo?.otherSessions) ? existingUser.sessionInfo.otherSessions : [])
        }
    };

    if (existingUser) {
        Object.assign(existingUser, nextUser);
    } else {
        db.users.push(nextUser);
    }

    saveDB();
    return nextUser;
}

function sanitizeTextInput(value) {
    return String(value ?? '').replace(/[<>"'`]/g, '').trim();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function hashPassword(password) {
    try {
        return btoa(password);
    } catch (error) {
        return password;
    }
}

function passwordMatches(storedPassword, plainPassword) {
    const encodedPassword = hashPassword(plainPassword);
    return storedPassword === encodedPassword
        || storedPassword === `btoa("${plainPassword}")`
        || storedPassword === `btoa('${plainPassword}')`;
}

function findUserByUsername(username) {
    const normalizedUsername = String(username ?? '').toLowerCase();
    return db.users.find((user) => user.username.toLowerCase() === normalizedUsername);
}

function findUserByEmail(email) {
    const normalizedEmail = String(email ?? '').toLowerCase();
    return db.users.find((user) => user.email.toLowerCase() === normalizedEmail);
}

function updateUser(username, updates) {
    const user = findUserByUsername(username);
    if (!user) {
        return null;
    }

    Object.assign(user, updates);
    saveDB();
    return user;
}

function getDeviceLabel() {
    const userAgent = navigator.userAgent;
    const os = /Windows/i.test(userAgent)
        ? 'Windows'
        : /Mac/i.test(userAgent)
            ? 'macOS'
            : /Android/i.test(userAgent)
                ? 'Android'
                : /iPhone|iPad|iPod/i.test(userAgent)
                    ? 'iOS'
                    : /Linux/i.test(userAgent)
                        ? 'Linux'
                        : 'Unknown OS';

    const browser = /Edg/i.test(userAgent)
        ? 'Edge'
        : /Chrome/i.test(userAgent)
            ? 'Chrome'
            : /Firefox/i.test(userAgent)
                ? 'Firefox'
                : /Safari/i.test(userAgent)
                    ? 'Safari'
                    : 'Browser';

    return `${os}/${browser}`;
}

function getSessionNotice() {
    return sessionStorage.getItem('sessionNotice') || '';
}

function consumeSessionNotice() {
    const message = getSessionNotice();
    if (message) {
        sessionStorage.removeItem('sessionNotice');
    }
    return message;
}

function setSessionNotice(message) {
    sessionStorage.setItem('sessionNotice', message);
}

function setPasswordResetContext(context) {
    sessionStorage.setItem('passwordResetContext', JSON.stringify(context));
}

function getPasswordResetContext() {
    try {
        return JSON.parse(sessionStorage.getItem('passwordResetContext'));
    } catch (error) {
        return null;
    }
}

function clearPasswordResetContext() {
    sessionStorage.removeItem('passwordResetContext');
}

function startIdleTimeout() {
    if (typeof window === 'undefined') {
        return;
    }

    if (idleTimeoutHandle) {
        clearTimeout(idleTimeoutHandle);
    }

    idleTimeoutHandle = setTimeout(() => {
        sessionStorage.removeItem('activeUser');
        clearPasswordResetContext();
        setSessionNotice('Session expired due to inactivity.');
        window.location.href = 'login.html';
    }, IDLE_TIMEOUT_MS);
}

function refreshIdleTimeout() {
    const activeSession = JSON.parse(sessionStorage.getItem('activeUser'));
    if (activeSession) {
        startIdleTimeout();
    }
}

function bindIdleTracking() {
    if (idleMonitoringBound || typeof window === 'undefined') {
        return;
    }

    idleMonitoringBound = true;
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach((eventName) => {
        window.addEventListener(eventName, refreshIdleTimeout, { passive: true });
    });
    window.addEventListener('focus', refreshIdleTimeout);
}

function initializeSessionMonitoring() {
    bindIdleTracking();
    if (JSON.parse(sessionStorage.getItem('activeUser'))) {
        startIdleTimeout();
    }
}

function enforceSession(requiredRole = null) {
    const activeSession = JSON.parse(sessionStorage.getItem('activeUser'));
    if (!activeSession) {
        setSessionNotice('Please sign in to continue.');
        window.location.href = 'login.html';
        return null;
    }

    if (requiredRole && activeSession.role !== requiredRole) {
        window.location.href = activeSession.role === 'admin' ? 'admin-dashboard.html' : 'user-dashboard.html';
        return null;
    }

    initializeSessionMonitoring();
    return activeSession;
}

function isStrongPassword(password) {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
}

function logout() {
    sessionStorage.removeItem('activeUser');
    clearPasswordResetContext();
    setSessionNotice('You have been signed out.');
    window.location.href = 'login.html';
}

window.db = db;
window.saveDB = saveDB;
window.syncLocalUserProfile = syncLocalUserProfile;
window.findUserByUsername = findUserByUsername;
window.findUserByEmail = findUserByEmail;
window.updateUser = updateUser;
window.sanitizeTextInput = sanitizeTextInput;
window.escapeHtml = escapeHtml;
window.hashPassword = hashPassword;
window.passwordMatches = passwordMatches;
window.getDeviceLabel = getDeviceLabel;
window.getSessionNotice = getSessionNotice;
window.consumeSessionNotice = consumeSessionNotice;
window.setSessionNotice = setSessionNotice;
window.setPasswordResetContext = setPasswordResetContext;
window.getPasswordResetContext = getPasswordResetContext;
window.clearPasswordResetContext = clearPasswordResetContext;
window.enforceSession = enforceSession;
window.isStrongPassword = isStrongPassword;
window.logout = logout;