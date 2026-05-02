// assets/js/password-ui.js
function getPasswordStrength(password) {
    const normalizedPassword = String(password ?? '');
    const hasLength = normalizedPassword.length >= 8;
    const hasLowercase = /[a-z]/.test(normalizedPassword);
    const hasUppercase = /[A-Z]/.test(normalizedPassword);
    const hasNumber = /\d/.test(normalizedPassword);
    const hasSymbol = /[^A-Za-z0-9]/.test(normalizedPassword);

    if (!hasLength) {
        return { label: 'Weak', percent: 20, className: 'weak' };
    }

    let score = 0;
    if (hasLowercase) score += 1;
    if (hasUppercase) score += 1;
    if (hasNumber) score += 1;
    if (hasSymbol) score += 1;

    if (score <= 2) {
        return { label: 'Weak', percent: 35, className: 'weak' };
    }

    if (score === 3) {
        return { label: 'Moderate', percent: 68, className: 'medium' };
    }

    return { label: 'Strong', percent: 100, className: 'strong' };
}

function updatePasswordStrengthMeter(inputElement, fillElement, labelElement) {
    if (!inputElement || !fillElement || !labelElement) {
        return;
    }

    const strength = getPasswordStrength(inputElement.value);
    fillElement.style.width = `${strength.percent}%`;
    fillElement.classList.remove('weak', 'medium', 'strong');
    fillElement.classList.add(strength.className);
    labelElement.innerText = `Password strength: ${strength.label.toLowerCase()}`;
}

document.addEventListener('DOMContentLoaded', () => {
    const usernameField = document.getElementById('regUsername');
    if (usernameField) {
        usernameField.addEventListener('input', () => {
            usernameField.value = sanitizeTextInput(usernameField.value);
        });
    }

    const registerPassword = document.getElementById('regPassword');
    const registerMeter = document.getElementById('regPasswordMeter');
    const registerLabel = document.getElementById('regPasswordStrengthText');
    if (registerPassword && registerMeter && registerLabel) {
        registerPassword.addEventListener('input', () => updatePasswordStrengthMeter(registerPassword, registerMeter, registerLabel));
        updatePasswordStrengthMeter(registerPassword, registerMeter, registerLabel);
    }

    const resetPassword = document.getElementById('newPassword');
    const resetMeter = document.getElementById('newPasswordMeter');
    const resetLabel = document.getElementById('newPasswordStrengthText');
    if (resetPassword && resetMeter && resetLabel) {
        resetPassword.addEventListener('input', () => updatePasswordStrengthMeter(resetPassword, resetMeter, resetLabel));
        updatePasswordStrengthMeter(resetPassword, resetMeter, resetLabel);
    }
});