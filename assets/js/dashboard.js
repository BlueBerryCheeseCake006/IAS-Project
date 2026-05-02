// assets/js/dashboard.js
let adminLogFiltersBound = false;

function renderUserAuditLog(username) {
    const auditBody = document.getElementById('auditLogBody');
    if (!auditBody) {
        return;
    }

    const auditLogs = db.logs
        .filter((log) => log.username === username && (log.status.toLowerCase().includes('login') || log.status.toLowerCase().includes('otp')))
        .slice()
        .sort((left, right) => (right.time || 0) - (left.time || 0))
        .slice(0, 5);

    if (!auditLogs.length) {
        auditBody.innerHTML = '<tr><td colspan="2">No login history yet.</td></tr>';
        return;
    }

    auditBody.innerHTML = auditLogs.map((log) => `
        <tr>
            <td>${escapeHtml(log.timestamp)}</td>
            <td>${escapeHtml(log.status)}</td>
        </tr>
    `).join('');
}

function renderUserDashboard() {
    const activeSession = enforceSession('user');
    if (!activeSession) {
        return;
    }

    const user = findUserByUsername(activeSession.username);
    if (!user) {
        return;
    }

    const notice = consumeSessionNotice();
    const userNotice = document.getElementById('userNotice');
    if (userNotice && notice) {
        userNotice.innerText = notice;
    }

    const currentDevice = user.sessionInfo?.currentDevice || 'Unknown';
    const otherSessions = Array.isArray(user.sessionInfo?.otherSessions) ? user.sessionInfo.otherSessions : [];

    document.getElementById('currentDevice').innerText = currentDevice;
    document.getElementById('currentDeviceSummary').innerText = currentDevice;
    document.getElementById('otherSessionCount').innerText = String(otherSessions.length);
    document.getElementById('otherSessionSummary').innerText = otherSessions.length
        ? `Other sessions: ${otherSessions.join(', ')}`
        : 'No other sessions detected.';

    const twoFactorToggle = document.getElementById('twoFactorToggle');
    const twoFactorLabel = document.getElementById('twoFactorLabel');
    twoFactorToggle.checked = user.twoFactorEnabled !== false;
    twoFactorLabel.innerText = user.twoFactorEnabled !== false ? 'Enabled' : 'Disabled';

    renderUserAuditLog(user.username);

    twoFactorToggle.addEventListener('change', () => {
        user.twoFactorEnabled = twoFactorToggle.checked;
        saveDB();
        logActivity(user.username, twoFactorToggle.checked ? 'Enabled 2FA Preferences' : 'Disabled 2FA Preferences');
        twoFactorLabel.innerText = twoFactorToggle.checked ? 'Enabled' : 'Disabled';
        if (userNotice) {
            userNotice.innerText = twoFactorToggle.checked ? 'Email OTP has been enabled.' : 'Email OTP has been disabled.';
        }
    });

    const passwordChangeForm = document.getElementById('passwordChangeForm');
    passwordChangeForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmNewPassword').value;
        const errorNode = document.getElementById('passwordChangeError');
        const successNode = document.getElementById('passwordChangeSuccess');

        errorNode.innerText = '';
        successNode.innerText = '';

        if (!passwordMatches(user.password, currentPassword)) {
            errorNode.innerText = 'Current password is incorrect.';
            return;
        }

        if (newPassword !== confirmPassword) {
            errorNode.innerText = 'New passwords do not match.';
            return;
        }

        if (!isStrongPassword(newPassword)) {
            errorNode.innerText = 'Password must be 8+ chars with uppercase, lowercase, and a number.';
            return;
        }

        user.password = hashPassword(newPassword);
        saveDB();
        logActivity(user.username, 'Password Updated From Dashboard');

        try {
            const firebaseModule = await import('./firebase-config.js');
            const authModule = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js');
            const firestoreModule = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js');
            const firebaseUser = firebaseModule.auth.currentUser;

            if (firebaseUser && firebaseUser.email === user.email) {
                const credential = authModule.EmailAuthProvider.credential(firebaseUser.email, currentPassword);
                await authModule.reauthenticateWithCredential(firebaseUser, credential);
                await authModule.updatePassword(firebaseUser, newPassword);
            }

            if (user.firestoreId) {
                await firestoreModule.updateDoc(firestoreModule.doc(firebaseModule.db, 'users', user.firestoreId), {
                    passwordHash: hashPassword(newPassword),
                    updatedAt: new Date()
                });
            }
        } catch (error) {
            console.warn('Firebase password sync failed:', error);
        }

        successNode.innerText = 'Password updated successfully.';
        passwordChangeForm.reset();
        const meterFill = document.getElementById('newPasswordMeter');
        const meterLabel = document.getElementById('newPasswordStrengthText');
        if (meterFill && meterLabel) {
            updatePasswordStrengthMeter(document.getElementById('newPassword'), meterFill, meterLabel);
        }
    });

    const signOutOtherSessionsBtn = document.getElementById('signOutOtherSessionsBtn');
    signOutOtherSessionsBtn.addEventListener('click', () => {
        user.sessionInfo.otherSessions = [];
        saveDB();
        logActivity(user.username, 'Signed out of all other sessions');
        document.getElementById('otherSessionCount').innerText = '0';
        document.getElementById('otherSessionSummary').innerText = 'No other sessions detected.';
        if (userNotice) {
            userNotice.innerText = 'Other sessions have been signed out.';
        }
    });
}

function renderAdminMetrics() {
    const totalUsersMetric = document.getElementById('totalUsersMetric');
    const lockedAccountsMetric = document.getElementById('lockedAccountsMetric');
    const failedLoginsMetric = document.getElementById('failedLoginsMetric');

    totalUsersMetric.innerText = String(db.users.length);
    lockedAccountsMetric.innerText = String(Object.keys(db.lockouts).filter((username) => db.lockouts[username] > Date.now()).length);
    failedLoginsMetric.innerText = String(getFailedLoginsLast24Hours());
}

function renderAdminUserManagement() {
    const body = document.getElementById('userManagementBody');
    if (!body) {
        return;
    }

    const rows = db.users.map((user) => {
        const isLocked = Boolean(db.lockouts[user.username] && db.lockouts[user.username] > Date.now());
        const forceResetChecked = user.forcePasswordReset ? 'checked' : '';
        const lockStatus = isLocked ? 'Locked' : 'Active';
        return `
            <tr>
                <td>${escapeHtml(user.username)}</td>
                <td>${escapeHtml(user.email)}</td>
                <td>${lockStatus}</td>
                <td>${user.twoFactorEnabled !== false ? 'Enabled' : 'Disabled'}</td>
                <td>
                    <label class="toggle">
                        <input type="checkbox" ${forceResetChecked} onchange="toggleForceReset('${escapeHtml(user.username)}', this.checked)">
                        <span class="toggle-track"><span class="toggle-thumb"></span></span>
                        <span>${user.forcePasswordReset ? 'On' : 'Off'}</span>
                    </label>
                </td>
                <td>
                    ${isLocked ? `<button type="button" class="secondary" onclick="unlockUser('${escapeHtml(user.username)}')">Unlock</button>` : '<span class="badge">No action needed</span>'}
                </td>
            </tr>
        `;
    }).join('');

    body.innerHTML = rows;
}

function renderAdminLogs() {
    const userFilter = document.getElementById('logUserFilter');
    const eventFilter = document.getElementById('logEventFilter');

    const renderFilteredLogs = () => {
        displayLogs({
            username: userFilter.value,
            eventType: eventFilter.value
        });
    };

    if (!adminLogFiltersBound) {
        userFilter.addEventListener('input', renderFilteredLogs);
        eventFilter.addEventListener('change', renderFilteredLogs);
        document.getElementById('clearLogFiltersBtn').addEventListener('click', () => {
            userFilter.value = '';
            eventFilter.value = '';
            renderFilteredLogs();
        });
        adminLogFiltersBound = true;
    }

    renderFilteredLogs();
}

function toggleForceReset(username, shouldForceReset) {
    const user = findUserByUsername(username);
    if (!user) {
        return;
    }

    user.forcePasswordReset = shouldForceReset;
    saveDB();
    logActivity('admin', `${shouldForceReset ? 'Enabled' : 'Disabled'} force password reset for ${username}`);
    renderAdminMetrics();
    renderAdminUserManagement();
    renderAdminLogs();
}

function unlockUser(username) {
    delete db.lockouts[username];
    saveDB();
    logActivity('admin', `Unlocked ${username}`);
    renderAdminMetrics();
    renderAdminUserManagement();
    renderAdminLogs();
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('auditLogBody')) {
        renderUserDashboard();
    }

    if (document.getElementById('userManagementBody')) {
        const adminSession = enforceSession('admin');
        if (adminSession) {
            renderAdminMetrics();
            renderAdminUserManagement();
            renderAdminLogs();
        }
    }
});