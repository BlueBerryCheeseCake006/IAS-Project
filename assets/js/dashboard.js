// assets/js/dashboard.js
let adminLogFiltersBound = false;
let userToDelete = null;

// ─── USER DASHBOARD ───────────────────────────────────────────────────────────

function renderUserAuditLog(username) {
    const auditBody = document.getElementById('auditLogBody');
    if (!auditBody) return;

    const logs = db.logs
        .filter(l => l.username === username &&
            (l.status.toLowerCase().includes('login') || l.status.toLowerCase().includes('otp')))
        .sort((a, b) => (b.time || 0) - (a.time || 0))
        .slice(0, 5);

    auditBody.innerHTML = logs.length
        ? logs.map(l => `<tr><td>${escapeHtml(l.timestamp)}</td><td>${escapeHtml(l.status)}</td></tr>`).join('')
        : '<tr><td colspan="2">No login history yet.</td></tr>';
}

function renderUserProfile(user) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    set('profileUsername',        user.username);
    set('profileEmail',           user.email);
    set('profileRole',            user.role === 'admin' ? 'Administrator' : 'Standard User');
    set('profileTwoFactor',       user.twoFactorEnabled !== false ? '✔ Enabled' : '✘ Disabled');
    set('profileSecurityQuestion', user.securityQuestion || '⚠ Not set — add one below for extra protection');
}

function renderUserDashboard() {
    const activeSession = enforceSession('user');
    if (!activeSession) return;

    const user = findUserByUsername(activeSession.username);
    if (!user) return;

    const notice = consumeSessionNotice();
    const userNotice = document.getElementById('userNotice');
    if (userNotice && notice) userNotice.innerText = notice;

    const currentDevice   = user.sessionInfo?.currentDevice || 'Unknown';
    const otherSessions   = Array.isArray(user.sessionInfo?.otherSessions) ? user.sessionInfo.otherSessions : [];

    document.getElementById('currentDevice').innerText        = currentDevice;
    document.getElementById('currentDeviceSummary').innerText = currentDevice;
    document.getElementById('otherSessionCount').innerText    = String(otherSessions.length);
    document.getElementById('otherSessionSummary').innerText  = otherSessions.length
        ? `Other sessions: ${otherSessions.join(', ')}`
        : 'No other sessions detected.';

    renderUserProfile(user);
    renderUserAuditLog(user.username);

    // 2FA toggle
    const twoFactorToggle = document.getElementById('twoFactorToggle');
    const twoFactorLabel  = document.getElementById('twoFactorLabel');
    twoFactorToggle.checked  = user.twoFactorEnabled !== false;
    twoFactorLabel.innerText = user.twoFactorEnabled !== false ? 'Enabled' : 'Disabled';

    twoFactorToggle.addEventListener('change', () => {
        user.twoFactorEnabled = twoFactorToggle.checked;
        saveDB();
        logActivity(user.username, twoFactorToggle.checked ? 'Enabled 2FA' : 'Disabled 2FA');
        twoFactorLabel.innerText = twoFactorToggle.checked ? 'Enabled' : 'Disabled';
        renderUserProfile(user);
        if (userNotice) userNotice.innerText = twoFactorToggle.checked ? 'Email OTP enabled.' : 'Email OTP disabled.';
    });

    // Password change
    document.getElementById('passwordChangeForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const current  = document.getElementById('currentPassword').value;
        const next     = document.getElementById('newPassword').value;
        const confirm  = document.getElementById('confirmNewPassword').value;
        const errEl    = document.getElementById('passwordChangeError');
        const okEl     = document.getElementById('passwordChangeSuccess');
        errEl.innerText = '';
        okEl.innerText  = '';

        if (!passwordMatches(user.password || user.passwordHash, current)) {
            errEl.innerText = 'Current password is incorrect.'; return;
        }
        if (next !== confirm) {
            errEl.innerText = 'New passwords do not match.'; return;
        }
        if (!isStrongPassword(next)) {
            errEl.innerText = 'Password must be 8+ chars with uppercase, lowercase, and a number.'; return;
        }

        user.password     = hashPassword(next);
        user.passwordHash = hashPassword(next);
        saveDB();
        logActivity(user.username, 'Password Changed');
        okEl.innerText = 'Password updated successfully.';
        e.target.reset();
    });

    // Security question setup
    const sqForm = document.getElementById('securityQuestionForm');
    if (sqForm) {
        const sqSelect = document.getElementById('sqSelect');
        const sqAnswer = document.getElementById('sqAnswer');
        const sqError  = document.getElementById('sqError');
        const sqSuccess= document.getElementById('sqSuccess');

        // Pre-fill if already set
        if (user.securityQuestion) {
            Array.from(sqSelect.options).forEach(opt => {
                if (opt.value === user.securityQuestion) opt.selected = true;
            });
        }

        sqForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sqError.innerText  = '';
            sqSuccess.innerText= '';
            const q = sqSelect.value;
            const a = sqAnswer.value.trim().toLowerCase();
            if (!q)  { sqError.innerText = 'Please select a question.'; return; }
            if (!a)  { sqError.innerText = 'Please enter your answer.'; return; }

            user.securityQuestion = q;
            user.securityAnswer   = btoa(a);
            saveDB();
            logActivity(user.username, 'Updated Security Question');
            sqAnswer.value   = '';
            sqSuccess.innerText = 'Security question saved successfully.';
            renderUserProfile(user);
        });
    }

    const signOutOtherSessionsBtn = document.getElementById('signOutOtherSessionsBtn');
    if (signOutOtherSessionsBtn) {
        signOutOtherSessionsBtn.addEventListener('click', () => {
            user.sessionInfo.otherSessions = [];
            saveDB();
            logActivity(user.username, 'Signed Out of All Other Sessions');
            document.getElementById('otherSessionCount').innerText = '0';
            document.getElementById('otherSessionSummary').innerText = 'No other sessions detected.';
            if (userNotice) userNotice.innerText = 'Other sessions have been signed out.';
        });
    }
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────

function renderAdminMetrics() {
    document.getElementById('totalUsersMetric').innerText      = String(db.users.length);
    document.getElementById('lockedAccountsMetric').innerText  = String(
        Object.keys(db.lockouts).filter(u => db.lockouts[u] > Date.now()).length
    );
    document.getElementById('failedLoginsMetric').innerText    = String(getFailedLoginsLast24Hours());
}

function renderAdminUserManagement() {
    const body = document.getElementById('userManagementBody');
    if (!body) return;

    body.innerHTML = db.users.map(user => {
        const isLocked         = Boolean(db.lockouts[user.username] && db.lockouts[user.username] > Date.now());
        const forceResetChecked = user.forcePasswordReset ? 'checked' : '';
        const isAdmin          = user.username === 'admin';
        const roleBadge        = user.role === 'admin'
            ? `<span class="role-badge admin">Admin</span>`
            : `<span class="role-badge user">User</span>`;

        return `
            <tr>
                <td>${escapeHtml(user.username)}</td>
                <td>${escapeHtml(user.email)}</td>
                <td>${roleBadge}</td>
                <td style="color:${isLocked ? 'var(--error)' : 'var(--success)'}">
                    ${isLocked ? '🔒 Locked' : '✔ Active'}
                </td>
                <td>${user.twoFactorEnabled !== false ? 'On' : 'Off'}</td>
                <td>
                    <label class="toggle" style="justify-content:center;">
                        <input type="checkbox" ${forceResetChecked}
                            onchange="toggleForceReset('${escapeHtml(user.username)}', this.checked)">
                        <span class="toggle-track"><span class="toggle-thumb"></span></span>
                        <span>${user.forcePasswordReset ? 'On' : 'Off'}</span>
                    </label>
                </td>
                <td style="display:flex; gap:8px; flex-wrap:wrap;">
                    ${isLocked
                        ? `<button type="button" class="secondary" style="width:auto;padding:6px 12px;"
                               onclick="unlockUser('${escapeHtml(user.username)}')">Unlock</button>`
                        : ''}
                    ${!isAdmin
                        ? `<button type="button" class="danger" style="width:auto;padding:6px 12px;"
                               onclick="openDeleteModal('${escapeHtml(user.username)}')">Delete</button>`
                        : '<span style="color:var(--text-muted);font-size:12px;">Protected</span>'}
                </td>
            </tr>`;
    }).join('');
}

function renderAdminLogs() {
    const userFilter  = document.getElementById('logUserFilter');
    const eventFilter = document.getElementById('logEventFilter');

    const doRender = () => displayLogs({ username: userFilter.value, eventType: eventFilter.value });

    if (!adminLogFiltersBound) {
        userFilter.addEventListener('input', doRender);
        eventFilter.addEventListener('change', doRender);
        document.getElementById('clearLogFiltersBtn').addEventListener('click', () => {
            userFilter.value  = '';
            eventFilter.value = '';
            doRender();
        });
        adminLogFiltersBound = true;
    }
    doRender();
}

// ─── ADD USER ─────────────────────────────────────────────────────────────────

function openAddUserModal() {
    document.getElementById('newUserEmail').value    = '';
    document.getElementById('newUserUsername').value = '';
    document.getElementById('newUserPassword').value = '';
    document.getElementById('newUserRole').value     = 'user';
    document.getElementById('addUserError').innerText = '';
    document.getElementById('addUserModal').classList.add('open');
}

function closeAddUserModal() {
    document.getElementById('addUserModal').classList.remove('open');
}

function confirmAddUser() {
    const email    = document.getElementById('newUserEmail').value.trim().toLowerCase();
    const username = sanitizeTextInput(document.getElementById('newUserUsername').value).toLowerCase();
    const password = document.getElementById('newUserPassword').value;
    const role     = document.getElementById('newUserRole').value;
    const errEl    = document.getElementById('addUserError');

    errEl.innerText = '';

    if (!email || !username || !password) {
        errEl.innerText = 'All fields are required.'; return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errEl.innerText = 'Please enter a valid email address.'; return;
    }
    if (findUserByUsername(username)) {
        errEl.innerText = 'That username is already taken.'; return;
    }
    if (db.users.find(u => u.email.toLowerCase() === email)) {
        errEl.innerText = 'That email is already registered.'; return;
    }
    if (!isStrongPassword(password)) {
        errEl.innerText = 'Password must be 8+ chars with uppercase, lowercase, and a number.'; return;
    }

    const newUser = {
        username,
        email,
        password:           hashPassword(password),
        passwordHash:       hashPassword(password),
        role,
        twoFactorEnabled:   true,
        forcePasswordReset: false,
        securityQuestion:   '',
        securityAnswer:     '',
        sessionInfo:        { currentDevice: 'Unknown', otherSessions: [] }
    };

    db.users.push(newUser);
    saveDB();
    logActivity('admin', `Created account for ${username} (${role})`);

    closeAddUserModal();
    refreshAdminDashboard();

    const notice = document.getElementById('adminNotice');
    if (notice) notice.innerText = `User "${username}" created successfully.`;
}

// ─── DELETE USER ──────────────────────────────────────────────────────────────

function openDeleteModal(username) {
    userToDelete = username;
    document.getElementById('deleteUserMsg').innerText =
        `Are you sure you want to permanently delete "${username}"? This cannot be undone.`;
    document.getElementById('deleteUserModal').classList.add('open');
}

function closeDeleteModal() {
    userToDelete = null;
    document.getElementById('deleteUserModal').classList.remove('open');
}

function confirmDeleteUser() {
    if (!userToDelete) return;

    const idx = db.users.findIndex(u => u.username === userToDelete);
    if (idx !== -1) {
        db.users.splice(idx, 1);
        delete db.lockouts[userToDelete];
        saveDB();
        logActivity('admin', `Deleted account: ${userToDelete}`);
    }

    const notice = document.getElementById('adminNotice');
    if (notice) notice.innerText = `User "${userToDelete}" has been deleted.`;

    closeDeleteModal();
    refreshAdminDashboard();
}

// ─── SHARED HELPERS ───────────────────────────────────────────────────────────

function toggleForceReset(username, value) {
    const user = findUserByUsername(username);
    if (!user) return;
    user.forcePasswordReset = value;
    saveDB();
    logActivity('admin', `${value ? 'Enabled' : 'Disabled'} force password reset for ${username}`);
    refreshAdminDashboard();
}

function unlockUser(username) {
    delete db.lockouts[username];
    saveDB();
    logActivity('admin', `Unlocked ${username}`);
    refreshAdminDashboard();
    const notice = document.getElementById('adminNotice');
    if (notice) notice.innerText = `${username} has been unlocked.`;
}

function setupAdminSecurityQuestion(adminSession) {
    const admin = findUserByUsername(adminSession.username);
    if (!admin) return;

    const sqDisplay = document.getElementById('adminSqDisplay');
    if (sqDisplay) sqDisplay.innerText = admin.securityQuestion || 'Not set';

    const sqForm = document.getElementById('adminSqForm');
    if (!sqForm) return;

    const sqSelect = document.getElementById('adminSqSelect');
    if (admin.securityQuestion) {
        Array.from(sqSelect.options).forEach(opt => {
            if (opt.value === admin.securityQuestion) opt.selected = true;
        });
    }

    sqForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = document.getElementById('adminSqSelect').value;
        const a = document.getElementById('adminSqAnswer').value.trim().toLowerCase();
        const errEl = document.getElementById('adminSqError');
        const okEl  = document.getElementById('adminSqSuccess');
        errEl.innerText = '';
        okEl.innerText  = '';

        if (!q) { errEl.innerText = 'Please select a question.'; return; }
        if (!a) { errEl.innerText = 'Please enter your answer.'; return; }

        admin.securityQuestion = q;
        admin.securityAnswer   = btoa(a);
        saveDB();
        logActivity(admin.username, 'Updated Security Question');
        document.getElementById('adminSqAnswer').value = '';
        document.getElementById('adminSqDisplay').innerText = q;
        okEl.innerText = 'Security question saved successfully.';
    });
}

function refreshAdminDashboard() {
    renderAdminMetrics();
    renderAdminUserManagement();
    renderAdminLogs();
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // User dashboard
    if (document.getElementById('auditLogBody')) {
        renderUserDashboard();
    }

    // Admin dashboard
    if (document.getElementById('userManagementBody')) {
        const adminSession = enforceSession('admin');
        if (adminSession) {
            const notice = consumeSessionNotice();
            if (notice) document.getElementById('adminNotice').innerText = notice;
            refreshAdminDashboard();
            setupAdminSecurityQuestion(adminSession);
        }
    }
});
