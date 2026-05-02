// assets/js/logger.js
function logActivity(username, status) {
    const now = new Date();
    db.logs.push({
        id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: now.toLocaleString(),
        time: now.getTime(),
        username,
        status
    });
    saveDB();
}

function getLogs({ username = '', eventType = '', onlyRecentMs = null } = {}) {
    const normalizedUsername = sanitizeTextInput(username).toLowerCase();
    const normalizedEventType = sanitizeTextInput(eventType).toLowerCase();
    const cutoffTime = typeof onlyRecentMs === 'number' ? Date.now() - onlyRecentMs : null;

    return db.logs
        .filter((log) => {
            const matchesUsername = !normalizedUsername || log.username.toLowerCase().includes(normalizedUsername);
            const matchesEventType = !normalizedEventType || log.status.toLowerCase().includes(normalizedEventType);
            const matchesTime = cutoffTime === null || (log.time || 0) >= cutoffTime;
            return matchesUsername && matchesEventType && matchesTime;
        })
        .slice()
        .sort((left, right) => (right.time || 0) - (left.time || 0));
}

function getRecentLoginAttempts(username, limit = 5) {
    return db.logs
        .filter((log) => log.username.toLowerCase().includes(sanitizeTextInput(username).toLowerCase())
            && (log.status.toLowerCase().includes('login') || log.status.toLowerCase().includes('otp')))
        .slice()
        .sort((left, right) => (right.time || 0) - (left.time || 0))
        .slice(0, limit);
}

function getFailedLoginsLast24Hours() {
    return getLogs({ eventType: 'failed', onlyRecentMs: 24 * 60 * 60 * 1000 }).length;
}

function displayLogs(options = {}) {
    const logTable = document.getElementById('logTableBody');
    if (!logTable) {
        return;
    }

    const logs = getLogs(options);
    if (!logs.length) {
        logTable.innerHTML = '<tr><td colspan="3">No matching log entries.</td></tr>';
        return;
    }

    logTable.innerHTML = logs.map((log) => `
        <tr>
            <td>${escapeHtml(log.timestamp)}</td>
            <td>${escapeHtml(log.username)}</td>
            <td>${escapeHtml(log.status)}</td>
        </tr>
    `).join('');
}

window.logActivity = logActivity;
window.getLogs = getLogs;
window.getRecentLoginAttempts = getRecentLoginAttempts;
window.getFailedLoginsLast24Hours = getFailedLoginsLast24Hours;
window.displayLogs = displayLogs;