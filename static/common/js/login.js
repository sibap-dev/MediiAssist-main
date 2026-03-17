        const APP_CONFIG = window.MEDIASSIST_CONFIG || {};
        const EMAILJS_PUBLIC_KEY  = APP_CONFIG.emailjsPublicKey || '';
        const EMAILJS_SERVICE_ID  = APP_CONFIG.emailjsServiceId || '';
        const EMAILJS_TEMPLATE_ID = APP_CONFIG.emailjsTemplateId || '';

        // DOM Elements
        const loginTab = document.getElementById('loginTab');
        const signupTab = document.getElementById('signupTab');
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        const forgotPasswordForm = document.getElementById('forgotPasswordForm');
        const successMessage = document.getElementById('successMessage');
        const adminCodeGroup = document.getElementById('adminCodeGroup');
        const successText = document.getElementById('successText');

        // Current user type for both forms
        let currentUserType = {
            login: 'user',
            signup: 'user'
        };

        let loginMobileHintState = {
            lastCheckedMobile: '',
            lastShownKey: ''
        };

        async function checkLoginMobileStatus(showPopup = false) {
            if (currentUserType.login !== 'user') return;

            const mobileInput = document.getElementById('loginMobile');
            const passwordInput = document.getElementById('loginPassword');
            if (!mobileInput) return;

            const mobile = (mobileInput.value || '').replace(/\D/g, '');
            if (mobile.length !== 10) return;

            if (loginMobileHintState.lastCheckedMobile === mobile && !showPopup) return;

            try {
                const response = await fetch('/auth/login/mobile-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mobile })
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok || !result.success) return;

                loginMobileHintState.lastCheckedMobile = mobile;
                const status = result.status || '';
                const popupKey = `${mobile}:${status}`;

                if (status === 'unregistered') {
                    if (passwordInput) passwordInput.placeholder = 'Enter your password';
                    if (showPopup && loginMobileHintState.lastShownKey !== popupKey) {
                        alert('This number is not registered. Please register first.');
                        loginMobileHintState.lastShownKey = popupKey;
                    }
                } else if (status === 'new') {
                    if (passwordInput) passwordInput.placeholder = 'Enter mobile number as password';
                    if (showPopup && loginMobileHintState.lastShownKey !== popupKey) {
                        alert('New user detected. Enter your mobile number as password.');
                        loginMobileHintState.lastShownKey = popupKey;
                    }
                } else {
                    if (passwordInput) passwordInput.placeholder = 'Enter your password';
                    if (showPopup && loginMobileHintState.lastShownKey !== popupKey) {
                        alert('Existing user detected. Please enter your password.');
                        loginMobileHintState.lastShownKey = popupKey;
                    }
                }
            } catch (err) {
                // Silent fail: popup hints should not block login.
            }
        }


        // Switch between tabs
        function switchTab(tabName) {
            // Update tabs
            loginTab.classList.toggle('active', tabName === 'login');
            signupTab.classList.toggle('active', tabName === 'signup');
            
            // Update forms visibility
            loginForm.classList.toggle('active', tabName === 'login');
            signupForm.classList.toggle('active', tabName === 'signup');
            forgotPasswordForm.classList.toggle('active', tabName === 'forgot');
            
            // Reset forgot-password form to Step 1 whenever it is (re-)shown
            if (tabName === 'forgot') {
                const s1 = document.getElementById('forgotStep1');
                const s2 = document.getElementById('forgotStep2');
                const s3 = document.getElementById('forgotStep3');
                const ind1 = document.getElementById('resetStepInd1');
                const ind2 = document.getElementById('resetStepInd2');
                const ind3 = document.getElementById('resetStepInd3');
                const conn1 = document.getElementById('resetStepConnector1');
                const conn2 = document.getElementById('resetStepConnector2');
                if (s1)   s1.style.display = 'block';
                if (s2)   s2.style.display = 'none';
                if (s3)   s3.style.display = 'none';
                if (ind1) { ind1.classList.add('active'); }
                if (ind2) { ind2.classList.remove('active'); }
                if (ind3) { ind3.classList.remove('active'); }
                if (conn1) conn1.classList.remove('done');
                if (conn2) conn2.classList.remove('done');
                // Default selections
                selectResetRole('user');
                selectResetMethod('email');
            }

            // Hide success message when switching tabs
            successMessage.style.display = 'none';
            
            // Reset errors
            resetAllErrors();
            
            // Auto-focus on first input
            setTimeout(() => {
                const activeForm = document.querySelector('.auth-form.active');
                if (activeForm) {
                    const firstInput = activeForm.querySelector('input');
                    if (firstInput) firstInput.focus();
                }
            }, 100);
        }

        // Show forgot password form
        function showForgotPassword() {
            switchTab('forgot');
        }

        // Select user type (User/Admin)
        function selectUserType(formType, userType, evt) {
            currentUserType[formType] = userType;
            
            // Update UI for selected type
            const form = document.getElementById(formType + 'Form');
            const cards = form.querySelectorAll('.user-type-card');
            cards.forEach(card => {
                card.classList.remove('selected');
            });
            
            // Add selected class to clicked card (or fallback to matching value)
            if (evt && evt.target) {
                evt.target.closest('.user-type-option').querySelector('.user-type-card').classList.add('selected');
            } else {
                const input = form.querySelector(`input[name="${formType}Type"][value="${userType}"]`);
                if (input) {
                    input.closest('.user-type-option').querySelector('.user-type-card').classList.add('selected');
                }
            }
            
            // Show/hide admin code field for signup (if present)
            if (formType === 'signup' && adminCodeGroup) {
                if (userType === 'admin') {
                    adminCodeGroup.style.display = 'block';
                    const adminCodeInput = document.getElementById('adminCode');
                    if (adminCodeInput) adminCodeInput.required = true;
                } else {
                    adminCodeGroup.style.display = 'none';
                    const adminCodeInput = document.getElementById('adminCode');
                    if (adminCodeInput) adminCodeInput.required = false;
                }
            }

            // Show password/OTP options only for user sign-in
            if (formType === 'login') {
                resetAllErrors();
                const authMethodGroup = document.getElementById('loginAuthMethodGroup');
                const mobileGroup = document.getElementById('loginMobileGroup');
                const mobileInput = document.getElementById('loginMobile');
                const passwordGroup = document.getElementById('loginPasswordGroup');
                const otpGroup = document.getElementById('loginOtpGroup');
                const emailLabel = document.getElementById('loginEmailLabel');
                const emailInput = document.getElementById('loginEmail');
                const passwordInput = document.getElementById('loginPassword');

                if (userType === 'admin') {
                    if (mobileGroup) mobileGroup.style.display = 'block';
                    if (mobileInput) mobileInput.required = false;
                    if (authMethodGroup) authMethodGroup.style.display = 'none';
                    if (otpGroup) otpGroup.style.display = 'none';
                    if (passwordGroup) passwordGroup.style.display = 'block';
                    if (emailLabel) emailLabel.innerHTML = 'Email Address';
                    if (emailInput) emailInput.required = true;
                    if (passwordInput) passwordInput.placeholder = 'Enter your password';
                    selectAuthMethod('password');
                } else {
                    if (mobileGroup) mobileGroup.style.display = 'block';
                    if (mobileInput) mobileInput.required = true;
                    if (authMethodGroup) authMethodGroup.style.display = 'block';
                    if (emailLabel) emailLabel.innerHTML = 'Email Address <span class="optional-tag">(Optional)</span>';
                    if (emailInput) emailInput.required = false;
                    const currentMethod = document.querySelector('input[name="loginMethod"]:checked')?.value || 'password';
                    selectAuthMethod(currentMethod);
                }

                loginMobileHintState.lastCheckedMobile = '';
                loginMobileHintState.lastShownKey = '';
            }
        }

        // Toggle password visibility
        function togglePassword(inputId, button) {
            const input = document.getElementById(inputId);
            const icon = button.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
                button.setAttribute('aria-label', 'Hide password');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
                button.setAttribute('aria-label', 'Show password');
            }
        }

        // Check password strength
        function checkPasswordStrength() {
            const password = document.getElementById('signupPassword').value;
            const strengthBar = document.getElementById('passwordStrengthBar');
            let strength = 0;
            
            if (password.length >= 8) strength += 25;
            if (/[A-Z]/.test(password)) strength += 25;
            if (/[0-9]/.test(password)) strength += 25;
            if (/[^A-Za-z0-9]/.test(password)) strength += 25;
            
            strengthBar.style.width = strength + '%';
            
            // Update color based on strength
            if (strength < 50) {
                strengthBar.style.backgroundColor = '#DC3545';
            } else if (strength < 75) {
                strengthBar.style.backgroundColor = '#FFC107';
            } else {
                strengthBar.style.backgroundColor = '#28A745';
            }
        }

        // Show error message
        function showError(inputId, message) {
            const errorElement = document.getElementById(inputId + 'Error');
            const inputElement = document.getElementById(inputId);
            
            if (errorElement && inputElement) {
                errorElement.textContent = message;
                errorElement.style.display = 'block';
                inputElement.classList.add('error');
                
                // Scroll to error on mobile
                if (window.innerWidth < 768) {
                    errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }

        // Reset all errors
        function resetAllErrors() {
            const errors = document.querySelectorAll('.error-message');
            const errorInputs = document.querySelectorAll('.input-field.error');
            
            errors.forEach(error => error.style.display = 'none');
            errorInputs.forEach(input => input.classList.remove('error'));
        }

        // Validate email format
        function validateEmail(email) {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return re.test(email);
        }

        // Validate phone number
        function validatePhone(phone) {
            const re = /^[\+]?[1-9][\d]{0,15}$/;
            return re.test(phone.replace(/[\s\-\(\)]/g, ''));
        }

        // Select auth method (Password/OTP)
        function selectAuthMethod(method, evt) {
            const cards = document.querySelectorAll('.auth-method-card');
            cards.forEach(card => card.classList.remove('selected'));

            if (evt && evt.currentTarget) {
                evt.currentTarget.classList.add('selected');
            } else {
                const input = document.querySelector(`input[name="loginMethod"][value="${method}"]`);
                if (input) {
                    const label = input.closest('.auth-method-option').querySelector('.auth-method-card');
                    if (label) label.classList.add('selected');
                }
            }

            document.getElementById('loginPasswordOption').checked = method === 'password';
            document.getElementById('loginOtpOption').checked = method === 'otp';
            const passwordGroup = document.getElementById('loginPasswordGroup');
            const otpGroup = document.getElementById('loginOtpGroup');
            const passwordInput = document.getElementById('loginPassword');
            const otpInput = document.getElementById('loginOtp');

            if (passwordGroup) passwordGroup.style.display = method === 'password' ? 'block' : 'none';
            if (otpGroup) otpGroup.style.display = method === 'otp' ? 'block' : 'none';
            if (passwordInput) passwordInput.required = method === 'password';
            // OTP input only required once user has been sent an OTP â€” managed dynamically
            if (otpInput) otpInput.required = false;

            // Reset OTP login phase back to "Send OTP" button whenever method switches
            if (method === 'otp') {
                const sendSection = document.getElementById('loginSendOtpSection');
                const inputSection = document.getElementById('loginOtpInputSection');
                if (sendSection) sendSection.style.display = 'block';
                if (inputSection) { inputSection.style.display = 'none'; }
                // Show the Send button again
                const sendBtn = document.getElementById('loginSendOtpBtn');
                if (sendBtn) sendBtn.style.display = 'block';
                if (otpInput) otpInput.value = '';
            }
        }

        // â”€â”€ OTP Login helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        let _loginOtpSent = false;

        async function sendLoginOtp(isResend) {
            resetAllErrors();
            const mobile = document.getElementById('loginMobile').value.trim();
            if (!mobile || !validatePhone(mobile)) {
                showError('loginMobile', 'Please enter a valid 10-digit mobile number first');
                return;
            }

            const sendBtn = document.getElementById('loginSendOtpBtn');
            if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sendingâ€¦'; }

            try {
                const res = await fetch('/auth/login/send-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mobile })
                });
                const data = await res.json().catch(() => ({}));

                if (!res.ok || !data.success) {
                    showError('loginMobile', data.message || 'Failed to send OTP. Please try again.');
                    if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send OTP to Mobile'; }
                    return;
                }

                // Transition to OTP input phase
                _loginOtpSent = true;
                const sendSection = document.getElementById('loginSendOtpSection');
                const inputSection = document.getElementById('loginOtpInputSection');
                if (sendSection) sendSection.style.display = 'none';
                if (inputSection) { inputSection.style.display = 'block'; }

                if (isResend) {
                    // Brief confirmation
                    const otpInput = document.getElementById('loginOtp');
                    if (otpInput) otpInput.value = '';
                    const tmp = document.createElement('div');
                    tmp.style.cssText = 'color:#155724;font-size:0.85rem;margin-top:4px';
                    tmp.textContent = 'New OTP sent!';
                    inputSection.appendChild(tmp);
                    setTimeout(() => tmp.remove(), 3000);
                }
            } catch (err) {
                showError('loginMobile', 'Network error. Please try again.');
                if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send OTP to Mobile'; }
            }
        }
        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        // Show loading state on button
        function setButtonLoading(buttonId, isLoading) {
            const button = document.getElementById(buttonId);
            if (button) {
                if (isLoading) {
                    button.classList.add('loading');
                    button.disabled = true;
                } else {
                    button.classList.remove('loading');
                    button.disabled = false;
                }
            }
        }

        // Handle login form submission
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            resetAllErrors();
            
            const email = document.getElementById('loginEmail').value.trim();
            const mobile = document.getElementById('loginMobile').value.trim();
            const selectedMethod = document.querySelector('input[name="loginMethod"]:checked')?.value;
            const password = document.getElementById('loginPassword').value;
            const otp = document.getElementById('loginOtp').value.trim();
            const userType = currentUserType.login;
            const method = userType === 'admin' ? 'password' : selectedMethod;
            
            let isValid = true;
            
            if (userType === 'admin') {
                if (!email) {
                    showError('loginEmail', 'Email is required');
                    isValid = false;
                } else if (!validateEmail(email)) {
                    showError('loginEmail', 'Please enter a valid email address');
                    isValid = false;
                }
            } else {
                // Validate optional email
                if (email && !validateEmail(email)) {
                    showError('loginEmail', 'Please enter a valid email address');
                    isValid = false;
                }

                // Validate mobile
                if (!mobile) {
                    showError('loginMobile', 'Mobile number is required');
                    isValid = false;
                } else if (!validatePhone(mobile)) {
                    showError('loginMobile', 'Please enter a valid mobile number');
                    isValid = false;
                }
            }
            
            // Validate auth method
            if (!method) {
                showError('loginMethod', 'Please choose Password or OTP');
                isValid = false;
            } else if (method === 'password') {
                if (!password) {
                    showError('loginPassword', 'Password is required');
                    isValid = false;
                } else if (password.length < 6) {
                    showError('loginPassword', 'Password must be at least 6 characters');
                    isValid = false;
                }
            } else if (method === 'otp') {
                const inputSection = document.getElementById('loginOtpInputSection');
                const otpVisible = inputSection && inputSection.style.display !== 'none';
                if (!otpVisible || !_loginOtpSent) {
                    // User hasn't sent OTP yet â€” prompt them
                    showError('loginMobile', 'Please click "Send OTP to Mobile" first');
                    isValid = false;
                } else if (!otp) {
                    showError('loginOtp', 'OTP is required');
                    isValid = false;
                } else if (!/^\d{4,6}$/.test(otp)) {
                    showError('loginOtp', 'OTP must be 4 to 6 digits');
                    isValid = false;
                }
            }
            
            if (isValid) {
                setButtonLoading('loginSubmitBtn', true);

                try {
                    const response = await fetch('/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userType,
                            email,
                            mobile,
                            method,
                            password,
                            otp
                        })
                    });

                    const result = await response.json().catch(() => ({}));

                    setButtonLoading('loginSubmitBtn', false);

                    if (response.ok && result.success) {
                        successText.textContent = 'Login successful! Redirecting...';
                        successMessage.style.display = 'block';
                        successMessage.style.backgroundColor = '#D4EDDA';
                        successMessage.style.color = '#155724';

                        setTimeout(() => {
                            window.location.href = result.redirect || '/';
                        }, 800);
                    } else {
                        const message = result.message || 'Login failed. Please try again.';
                        if (method === 'otp') {
                            showError('loginOtp', message);
                        } else if (userType === 'admin') {
                            showError('loginPassword', message);
                        } else {
                            showError('loginPassword', message);
                        }
                    }
                } catch (error) {
                    setButtonLoading('loginSubmitBtn', false);
                    showError('loginPassword', 'Unable to reach server. Please try again.');
                }
            }
        });

        // Handle signup form submission
        signupForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const userType = currentUserType.signup;
            if (userType === 'admin') {
                window.location.href = '/admin/registration';
            } else {
                window.location.href = '/user/registration';
            }
        });

        // â”€â”€â”€ Reset Password multi-step logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        let resetState = { role: 'user', method: 'email', identifier: '' };

        function selectResetRole(role, evt) {
            resetState.role = role;
            document.getElementById('resetRoleUser').checked = role === 'user';
            document.getElementById('resetRoleAdmin').checked = role === 'admin';
            document.querySelectorAll('#forgotPasswordForm .user-type-option .user-type-card')
                .forEach(c => c.classList.remove('selected'));
            if (evt && evt.currentTarget) {
                evt.currentTarget.classList.add('selected');
            } else {
                const inp = document.querySelector(`input[name="resetRole"][value="${role}"]`);
                if (inp) {
                    const card = inp.closest('.user-type-option')?.querySelector('.user-type-card');
                    if (card) card.classList.add('selected');
                }
            }
        }

        function selectResetMethod(method, evt) {
            resetState.method = method;
            document.getElementById('resetMethodEmail').checked = method === 'email';
            document.getElementById('resetMethodMobile').checked = method === 'mobile';
            document.querySelectorAll('#forgotPasswordForm .auth-method-card')
                .forEach(c => c.classList.remove('selected'));
            if (evt && evt.currentTarget) {
                evt.currentTarget.classList.add('selected');
            } else {
                const inp = document.querySelector(`input[name="resetMethod"][value="${method}"]`);
                if (inp) {
                    const card = inp.closest('.auth-method-option')?.querySelector('.auth-method-card');
                    if (card) card.classList.add('selected');
                }
            }
            document.getElementById('resetEmailGroup').style.display  = method === 'email'  ? 'block' : 'none';
            document.getElementById('resetMobileGroup').style.display = method === 'mobile' ? 'block' : 'none';
        }

        async function sendResetOtp(isResend = false) {
            resetAllErrors();
            const role   = document.querySelector('input[name="resetRole"]:checked')?.value  || 'user';
            const method = document.querySelector('input[name="resetMethod"]:checked')?.value || 'email';
            let identifier;
            if (method === 'email') {
                identifier = (document.getElementById('resetEmail').value || '').trim();
                if (!identifier) { showError('resetEmail', 'Email is required'); return; }
                if (!validateEmail(identifier)) { showError('resetEmail', 'Enter a valid email address'); return; }
            } else {
                identifier = (document.getElementById('resetMobile').value || '').replace(/\D/g, '').trim();
                if (!identifier) { showError('resetMobile', 'Mobile number is required'); return; }
                if (identifier.length < 10) { showError('resetMobile', 'Enter a valid 10-digit mobile number'); return; }
            }
            resetState = { role, method, identifier };

            const btn = document.getElementById('sendOtpBtn');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'; }

            try {
                // â”€â”€ Step 1: Ask Flask to generate & store OTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                const resp = await fetch('/auth/forgot-password/request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role, method, identifier })
                });
                const result = await resp.json().catch(() => ({}));

                if (!resp.ok) {
                    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send OTP'; }
                    const errId = method === 'email' ? 'resetEmail' : 'resetMobile';
                    showError(errId, result.message || 'Failed to send OTP.');
                    return;
                }

                if (method === 'email' && !result.email_otp) {
                    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send OTP'; }
                    showError('resetEmail', result.message || 'Unable to prepare reset email.');
                    return;
                }

                if (method === 'email' && result.emailjs_enabled) {
                    if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID) {
                        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send OTP'; }
                        showError('resetEmail', 'EmailJS is not configured on the page.');
                        return;
                    }

                    if (!result.email_otp) {
                        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send OTP'; }
                        showError('resetEmail', 'OTP generation failed. Please try again.');
                        return;
                    }

                    try {
                        await emailjs.send(
                            EMAILJS_SERVICE_ID,
                            EMAILJS_TEMPLATE_ID,
                            {
                                to_email: identifier,
                                otp_code: result.email_otp,
                                user_name: result.email_role_label || (role === 'admin' ? 'Admin' : 'User')
                            },
                            {
                                publicKey: EMAILJS_PUBLIC_KEY
                            }
                        );
                    } catch (emailErr) {
                        console.error('[EmailJS] Failed to send forgot-password email:', emailErr);
                        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send OTP'; }
                        const emailErrMsg = emailErr?.text || emailErr?.message || 'Failed to send reset email through EmailJS.';
                        showError('resetEmail', emailErrMsg);
                        return;
                    }
                }

                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send OTP'; }

                if (!isResend) {
                    document.getElementById('forgotStep1').style.display  = 'none';
                    document.getElementById('forgotStep2').style.display  = 'block';
                    // Step indicator: activate step 2
                    document.getElementById('resetStepInd1').classList.remove('active');
                    document.getElementById('resetStepInd2').classList.add('active');
                    document.getElementById('resetStepConnector1').classList.add('done');
                    // Preview
                    const label = method === 'email' ? 'Gmail' : 'mobile number';
                    document.getElementById('resetToPreview').innerHTML =
                        `OTP sent to your <strong>${label}</strong>: <em>${identifier}</em>`;
                } else {
                    successText.textContent = 'New OTP sent!';
                    successMessage.style.display = 'block';
                    setTimeout(() => { successMessage.style.display = 'none'; }, 3000);
                }
            } catch (err) {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send OTP'; }
                const errId = (resetState.method === 'email') ? 'resetEmail' : 'resetMobile';
                showError(errId, 'Server error. Please try again.');
            }
        }

        async function verifyOtp() {
            resetAllErrors();
            const otp = (document.getElementById('resetOtp').value || '').trim();
            if (!otp || !/^\d{6}$/.test(otp)) { showError('resetOtp', 'Enter the 6-digit OTP'); return; }

            const btn = document.getElementById('verifyOtpBtn');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...'; }

            try {
                const resp = await fetch('/auth/forgot-password/validate-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        role:       resetState.role,
                        method:     resetState.method,
                        identifier: resetState.identifier,
                        otp
                    })
                });
                const result = await resp.json().catch(() => ({}));
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Verify OTP'; }

                if (resp.ok && result.success) {
                    // Store verified OTP in state for final step
                    resetState.verifiedOtp = otp;
                    // Move to step 3
                    document.getElementById('forgotStep2').style.display = 'none';
                    document.getElementById('forgotStep3').style.display = 'block';
                    document.getElementById('resetStepInd2').classList.remove('active');
                    document.getElementById('resetStepInd3').classList.add('active');
                    document.getElementById('resetStepConnector2').classList.add('done');
                    // Clear password fields
                    document.getElementById('resetNewPassword').value = '';
                    document.getElementById('resetConfirmPassword').value = '';
                } else {
                    showError('resetOtp', result.message || 'Invalid OTP. Please try again.');
                }
            } catch (err) {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Verify OTP'; }
                showError('resetOtp', 'Server error. Please try again.');
            }
        }

        async function confirmResetPassword() {
            resetAllErrors();
            const newPassword     = (document.getElementById('resetNewPassword').value     || '');
            const confirmPassword = (document.getElementById('resetConfirmPassword').value || '');

            let valid = true;
            if (!newPassword)                { showError('resetNewPassword', 'New password is required'); valid = false; }
            else if (newPassword.length < 6) { showError('resetNewPassword', 'Password must be at least 6 characters'); valid = false; }
            if (newPassword !== confirmPassword) { showError('resetConfirmPassword', 'Passwords do not match'); valid = false; }
            if (!valid) return;

            const btn = document.getElementById('resetPasswordBtn');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...'; }

            try {
                const resp = await fetch('/auth/forgot-password/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        role:        resetState.role,
                        method:      resetState.method,
                        identifier:  resetState.identifier,
                        otp:         resetState.verifiedOtp,
                        newPassword
                    })
                });
                const result = await resp.json().catch(() => ({}));
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle"></i> Reset Password'; }

                if (resp.ok && result.success) {
                    successText.textContent = 'Password reset successfully! Redirecting to sign in...';
                    successMessage.style.display = 'block';
                    successMessage.style.backgroundColor = '#D4EDDA';
                    successMessage.style.color = '#155724';
                    setTimeout(() => switchTab('login'), 3000);
                } else {
                    showError('resetNewPasswordError', result.message || 'Reset failed. Please try again.');
                }
            } catch (err) {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle"></i> Reset Password'; }
                showError('resetNewPasswordError', 'Server error. Please try again.');
            }
        }

        function backToResetStep1() {
            document.getElementById('forgotStep1').style.display = 'block';
            document.getElementById('forgotStep2').style.display = 'none';
            document.getElementById('forgotStep3').style.display = 'none';
            document.getElementById('resetStepInd1').classList.add('active');
            document.getElementById('resetStepInd2').classList.remove('active');
            document.getElementById('resetStepInd3').classList.remove('active');
            document.getElementById('resetStepConnector1').classList.remove('done');
            document.getElementById('resetStepConnector2').classList.remove('done');
            resetAllErrors();
        }

        function backToResetStep2() {
            document.getElementById('forgotStep3').style.display = 'none';
            document.getElementById('forgotStep2').style.display = 'block';
            document.getElementById('resetStepInd3').classList.remove('active');
            document.getElementById('resetStepInd2').classList.add('active');
            document.getElementById('resetStepConnector2').classList.remove('done');
            resetAllErrors();
        }

        // Demo functions
        function showTerms() {
            alert('Terms of Service: This is a demo application. In production, this would link to your actual terms.');
            return false;
        }

        function showPrivacy() {
            alert('Privacy Policy: This is a demo application. In production, this would link to your actual privacy policy.');
            return false;
        }

        // Capitalize name field - proper title case
        function capitalizeName(value) {
            if (!value) return '';
            return value
                .toLowerCase()
                .split(' ')
                .map(word => {
                    if (word.length === 0) return '';
                    return word.charAt(0).toUpperCase() + word.slice(1);
                })
                .join(' ');
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY) {
                emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
            }

            // Set default user type selections
            selectUserType('login', 'user');
            selectUserType('signup', 'user');
            
            // Show requested tab (default to login)
            const tabParam = new URLSearchParams(window.location.search).get('tab');
            const initialTab = tabParam === 'signup' ? 'signup' : 'login';
            switchTab(initialTab);
            
            // Auto-focus on login email when login tab is active
            if (initialTab === 'login') {
                const loginEmail = document.getElementById('loginEmail');
                if (loginEmail) loginEmail.focus();
            }

            // Ensure correct auth method field is visible on load and on change
            const loginMethodRadios = document.querySelectorAll('input[name="loginMethod"]');
            loginMethodRadios.forEach(radio => {
                radio.addEventListener('change', function() {
                    selectAuthMethod(this.value);
                });
            });
            const initialMethod = document.querySelector('input[name="loginMethod"]:checked')?.value || 'password';
            selectAuthMethod(initialMethod);

            // Allow only digits in login mobile number
            const loginMobileField = document.getElementById('loginMobile');
            loginMobileField.addEventListener('input', function(e) {
                let value = e.target.value.replace(/\D/g, '');
                if (value.length > 10) {
                    value = value.substring(0, 10);
                }
                e.target.value = value;

                if (value.length < 10) {
                    loginMobileHintState.lastCheckedMobile = '';
                    loginMobileHintState.lastShownKey = '';
                }
                if (value.length === 10) {
                    checkLoginMobileStatus(false);
                }
            });
            loginMobileField.addEventListener('blur', function() {
                checkLoginMobileStatus(true);
            });

            // Allow only digits in reset mobile field
            const resetMobileField = document.getElementById('resetMobile');
            if (resetMobileField) {
                resetMobileField.addEventListener('input', function(e) {
                    let value = e.target.value.replace(/\D/g, '');
                    if (value.length > 10) value = value.substring(0, 10);
                    e.target.value = value;
                });
            }

            // Allow only digits in OTP field
            const resetOtpField = document.getElementById('resetOtp');
            if (resetOtpField) {
                resetOtpField.addEventListener('input', function(e) {
                    e.target.value = e.target.value.replace(/\D/g, '').substring(0, 6);
                });
            }

            // Auto-capitalize name field a  s user types
            const nameField = document.getElementById('signupName');
            if (nameField) {
                nameField.addEventListener('input', function(e) {
                    const start = this.selectionStart;
                    const end = this.selectionEnd;
                    const value = this.value;
                    const capitalized = capitalizeName(value);
                    
                    if (value !== capitalized) {
                        this.value = capitalized;
                        this.setSelectionRange(start, end);
                    }
                });
            }
            
            // Demo credentials for testing
            console.log('Demo Credentials:');
            console.log('Admin: admin@mediassist.com / password: Admin123');
            console.log('User: user@mediassist.com / password: User123');
            console.log('Admin Code: ADMIN2024');
        });

        // Handle keyboard navigation
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                resetAllErrors();
            }
        });
    
