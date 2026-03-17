
        // DOM Elements
        const registrationForm = document.getElementById('userRegistrationForm');
        const successMessage = document.getElementById('successMessage');
        const successText = document.getElementById('successText');
        const submitBtn = document.getElementById('submitBtn');
        const cancelBtn = document.getElementById('cancelBtn');

        // Selected gender
        let selectedGender = '';

        // Select gender function
        function selectGender(gender, evt) {
            selectedGender = gender;
            
            // Update UI
            const genderCards = document.querySelectorAll('.gender-card');
            genderCards.forEach(card => {
                card.classList.remove('selected');
            });
            
            // Add selected class to clicked card (or fallback to matching label)
            if (evt && evt.currentTarget) {
                evt.currentTarget.classList.add('selected');
            } else {
                const input = document.getElementById(gender);
                if (input) {
                    const label = input.closest('.gender-option').querySelector('.gender-card');
                    if (label) label.classList.add('selected');
                }
            }
            
            // Update radio button
            document.getElementById(gender).checked = true;
            
            // Clear gender error
            document.getElementById('genderError').style.display = 'none';
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

        // Auto-capitalize user name as user types
        const userNameInput = document.getElementById('userName');
        if (userNameInput) {
            userNameInput.addEventListener('input', function() {
                const start = this.selectionStart;
                const end = this.selectionEnd;
                const value = this.value;
                const capitalized = capitalizeName(value);

                if (value !== capitalized) {
                    this.value = capitalized;
                    if (start !== null && end !== null) {
                        this.setSelectionRange(start, end);
                    }
                }
            });
        }

        // Generate User ID
        function generateUserId(name, phone) {
            // Extract first 3 letters of name
            const namePart = name.substring(0, 3).toUpperCase();
            
            // Extract last 4 digits of phone
            const phoneDigits = phone.replace(/\D/g, '');
            const phonePart = phoneDigits.substring(phoneDigits.length - 4);
            
            // Generate random number
            const randomNum = Math.floor(100 + Math.random() * 900);
            
            // Format: MED-ABC-1234-456
            return `MED-${namePart}-${phonePart}-${randomNum}`;
        }

        // Validate email
        function validateEmail(email) {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return re.test(email);
        }

        // Validate phone number
        function validatePhone(phone) {
            const re = /^[\+]?[1-9][\d]{9,14}$/;
            return re.test(phone.replace(/[\s\-\(\)]/g, ''));
        }

        // Validate name
        function validateName(name) {
            return name.length >= 2 && /^[a-zA-Z\s]+$/.test(name);
        }

        // Check password strength
        function checkPasswordStrength(password) {
            let strength = 'weak';
            if (password.length >= 8 &&
                /[a-z]/.test(password) &&
                /[A-Z]/.test(password) &&
                /[0-9]/.test(password) &&
                /[^a-zA-Z0-9]/.test(password)) {
                strength = 'strong';
            } else if (password.length >= 6 &&
                       /[a-z]/.test(password) &&
                       /[A-Z]/.test(password) &&
                       /[0-9]/.test(password)) {
                strength = 'good';
            }
            return strength;
        }

        // Update password strength bar
        const passwordInput = document.getElementById('password');
        if (passwordInput) {
            passwordInput.addEventListener('input', function() {
                const strength = checkPasswordStrength(this.value);
                const strengthBar = document.getElementById('strengthBar');
                
                strengthBar.classList.remove('weak', 'good', 'strong');
                if (this.value.length > 0) {
                    strengthBar.classList.add(strength);
                }
            });
        }

        // Show error
        function showError(inputId, message) {
            const errorElement = document.getElementById(inputId + 'Error');
            const inputElement = document.getElementById(inputId);
            
            if (errorElement && inputElement) {
                errorElement.textContent = message;
                errorElement.style.display = 'block';
                inputElement.classList.add('error');
            }
        }

        // Reset errors
        function resetErrors() {
            const errors = document.querySelectorAll('.error-message');
            const errorInputs = document.querySelectorAll('.input-field.error');
            
            errors.forEach(error => error.style.display = 'none');
            errorInputs.forEach(input => input.classList.remove('error'));
        }


        // Handle form submission
        registrationForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            resetErrors();
            
            const userName = document.getElementById('userName').value.trim();
            const email = document.getElementById('email').value.trim();
            const mobileNumber = document.getElementById('mobileNumber').value.trim();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            let isValid = true;
            
            // Validate user name
            if (!userName) {
                showError('userName', 'User name is required');
                isValid = false;
            } else if (!validateName(userName)) {
                showError('userName', 'Please enter a valid name (letters and spaces only)');
                isValid = false;
            }
            
            // Validate mobile number
            if (!mobileNumber) {
                showError('mobileNumber', 'Mobile number is required');
                isValid = false;
            } else if (!validatePhone(mobileNumber)) {
                showError('mobileNumber', 'Please enter a valid 10-digit mobile number');
                isValid = false;
            }

            // Validate optional email
            if (email && !validateEmail(email)) {
                showError('email', 'Please enter a valid email address');
                isValid = false;
            }

            // Validate password
            if (!password) {
                showError('password', 'Password is required');
                isValid = false;
            } else if (password.length < 6) {
                showError('password', 'Password must be at least 6 characters');
                isValid = false;
            }

            // Validate confirm password
            if (!confirmPassword) {
                showError('confirmPassword', 'Please confirm your password');
                isValid = false;
            } else if (confirmPassword !== password) {
                showError('confirmPassword', 'Passwords do not match');
                isValid = false;
            }

            
            // Validate gender
            if (!selectedGender) {
                showError('gender', 'Please select your gender');
                isValid = false;
            }
            
            if (isValid) {
                submitBtn.classList.add('loading');
                submitBtn.disabled = true;

                try {
                    const response = await fetch('/auth/register/user', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userName,
                            email,
                            mobileNumber,
                            gender: selectedGender,
                            password
                        })
                    });

                    const result = await response.json().catch(() => ({}));

                    if (response.ok && result.success) {
                        const userId = result.userId || '';
                        document.getElementById('userId').value = userId;

                        successText.innerHTML = `
                            <strong>Registration successful!</strong><br>
                            Your User ID: <strong>${userId}</strong><br>
                            Please save this ID for future reference.
                        `;
                        successMessage.style.display = 'block';

                        document.getElementById('userName').value = '';
                        document.getElementById('email').value = '';
                        document.getElementById('mobileNumber').value = '';
                        document.getElementById('password').value = '';
                        document.getElementById('confirmPassword').value = '';
                        document.getElementById('strengthBar').classList.remove('weak', 'good', 'strong');
                        document.querySelectorAll('.gender-card').forEach(card => {
                            card.classList.remove('selected');
                        });
                        selectedGender = '';
                        document.querySelectorAll('input[type="radio"]').forEach(radio => {
                            radio.checked = false;
                        });
                    } else {
                        const message = result.message || 'Registration failed. Please try again.';
                        showError('mobileNumber', message);
                    }
                } catch (error) {
                    showError('mobileNumber', 'Unable to reach server. Please try again.');
                } finally {
                    submitBtn.classList.remove('loading');
                    submitBtn.disabled = false;
                }

                setTimeout(() => {
                    successMessage.style.display = 'none';
                }, 10000);
            }
        });

        // Back button
        cancelBtn.addEventListener('click', function() {
            if (confirm('Go back to signup selection? All entered data will be lost.')) {
                window.location.href = '/?tab=signup';
            }
        });

        // Auto-focus on name input
        document.addEventListener('DOMContentLoaded', function() {
            document.getElementById('userName').focus();
            
            // Demo credentials for testing
            console.log('Demo User Data:');
            console.log('Name: John Smith');
            console.log('Mobile: 9876543210');
            console.log('Gender: Male/Female/Other');
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                resetErrors();
                successMessage.style.display = 'none';
            }
            
            if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
                e.preventDefault();
            }
        });

        // Allow only digits in mobile number
        document.getElementById('mobileNumber').addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            
            if (value.length > 10) {
                value = value.substring(0, 10);
            }
            
            e.target.value = value;
        });

        // Clear error when user starts typing
        document.querySelectorAll('.input-field').forEach(input => {
            input.addEventListener('input', function() {
                const errorId = this.id + 'Error';
                const errorElement = document.getElementById(errorId);
                if (errorElement) {
                    errorElement.style.display = 'none';
                    this.classList.remove('error');
                }
            });
        });
    
