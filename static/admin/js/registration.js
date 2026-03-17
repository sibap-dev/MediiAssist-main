
        // DOM Elements
        const steps = document.querySelectorAll('.step');
        const progressFill = document.getElementById('progressFill');
        const formSections = document.querySelectorAll('.form-section');
        const successMessage = document.getElementById('successMessage');
        const successText = document.getElementById('successText');

        // Form data storage
        const adminData = {
            personal: {},
            hospital: {},
            role: {}
        };

        // Current step
        let currentStep = 1;

        // Initialize with email from signup (simulated)
        document.addEventListener('DOMContentLoaded', function() {
            // Set today as max date for DOB
            const today = new Date().toISOString().split('T')[0];
            const dobInput = document.getElementById('dob');
            if (dobInput) {
                // Set max date to today
                dobInput.max = today;
                
                // Set default date to 30 years ago
                const thirtyYearsAgo = new Date();
                thirtyYearsAgo.setFullYear(thirtyYearsAgo.getFullYear() - 30);
                dobInput.valueAsDate = thirtyYearsAgo;
            }
            
            // Auto-generate employee ID
            generateEmployeeId();
        });

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

        // Auto-capitalize admin name as user types
        const fullNameInput = document.getElementById('fullName');
        if (fullNameInput) {
            fullNameInput.addEventListener('input', function() {
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

        // Generate employee ID
        function generateEmployeeId() {
            const prefix = 'MEDI';
            const randomNum = Math.floor(1000 + Math.random() * 9000);
            const date = new Date();
            const year = date.getFullYear().toString().slice(-2);
            const employeeId = `${prefix}${year}${randomNum}`;
            document.getElementById('employeeId').value = employeeId;
        }

        // Update progress bar
        function updateProgress() {
            const percentage = ((currentStep - 1) / 2) * 100;
            progressFill.style.width = percentage + '%';
            
            // Update step indicators
            steps.forEach(step => {
                const stepNum = parseInt(step.getAttribute('data-step'));
                step.classList.remove('active', 'completed');
                
                if (stepNum < currentStep) {
                    step.classList.add('completed');
                } else if (stepNum === currentStep) {
                    step.classList.add('active');
                }
            });
            
            // Show current form section
            formSections.forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(`step${currentStep}Form`).classList.add('active');
            
            // Scroll to top on mobile
            if (window.innerWidth < 768) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }

        // Validate current step
        function validateStep(step) {
            let isValid = true;
            resetErrors();
            
            if (step === 1) {
                // Personal Info validation
                const fullName = document.getElementById('fullName').value.trim();
                const email = document.getElementById('email').value.trim();
                const phone = document.getElementById('phone').value.trim();
                const dob = document.getElementById('dob').value;
                const gender = document.getElementById('gender').value;
                const address = document.getElementById('address').value.trim();
                
                if (!fullName) {
                    showError('fullName', 'Full name is required');
                    isValid = false;
                }

                if (!email) {
                    showError('email', 'Email is required');
                    isValid = false;
                } else if (!validateEmail(email)) {
                    showError('email', 'Please enter a valid email address');
                    isValid = false;
                }
                
                if (!phone) {
                    showError('phone', 'Phone number is required');
                    isValid = false;
                } else if (!validatePhone(phone)) {
                    showError('phone', 'Please enter a valid phone number');
                    isValid = false;
                }
                
                if (!dob) {
                    showError('dob', 'Date of birth is required');
                    isValid = false;
                }
                
                if (!gender) {
                    showError('gender', 'Please select gender');
                    isValid = false;
                }
                
                if (!address) {
                    showError('address', 'Address is required');
                    isValid = false;
                }
                
                if (isValid) {
                    adminData.personal = { fullName, email, phone, dob, gender, address };
                }
            }
            else if (step === 2) {
                // Hospital Info validation
                const hospitalName = document.getElementById('hospitalName').value.trim();
                const hospitalType = document.getElementById('hospitalType').value;
                const hospitalAddress = document.getElementById('hospitalAddress').value.trim();
                const hospitalContact = document.getElementById('hospitalContact').value.trim();
                const licenseNumber = document.getElementById('licenseNumber').value.trim();
                
                if (!hospitalName) {
                    showError('hospitalName', 'Hospital name is required');
                    isValid = false;
                }
                
                if (!hospitalType) {
                    showError('hospitalType', 'Hospital type is required');
                    isValid = false;
                }
                
                if (!hospitalAddress) {
                    showError('hospitalAddress', 'Hospital address is required');
                    isValid = false;
                }
                
                if (!hospitalContact) {
                    showError('hospitalContact', 'Hospital contact is required');
                    isValid = false;
                } else if (!validatePhone(hospitalContact)) {
                    showError('hospitalContact', 'Please enter a valid contact number');
                    isValid = false;
                }
                
                if (!licenseNumber) {
                    showError('licenseNumber', 'License number is required');
                    isValid = false;
                }
                
                if (isValid) {
                    adminData.hospital = { hospitalName, hospitalType, hospitalAddress, hospitalContact, licenseNumber };
                }
            }
            else if (step === 3) {
                // Admin Role validation
                const adminRole = document.getElementById('adminRole').value;
                const department = document.getElementById('department').value;
                const password = document.getElementById('password').value;
                const employeeId = document.getElementById('employeeId').value.trim();
                const adminNotes = document.getElementById('adminNotes').value.trim();
                
                // Get selected permissions
                const permissions = [];
                document.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
                    permissions.push(checkbox.value);
                });
                
                if (!adminRole) {
                    showError('adminRole', 'Admin role is required');
                    isValid = false;
                }
                
                if (!department) {
                    showError('department', 'Department is required');
                    isValid = false;
                }

                if (!password) {
                    showError('password', 'Password is required');
                    isValid = false;
                } else if (password.length < 6) {
                    showError('password', 'Password must be at least 6 characters');
                    isValid = false;
                }
                
                if (permissions.length === 0) {
                    alert('Please select at least one permission');
                    isValid = false;
                }
                
                if (isValid) {
                    adminData.role = { adminRole, department, employeeId, adminNotes, permissions, password };
                }
            }
            
            return isValid;
        }

        // Phone validation
        function validatePhone(phone) {
            const re = /^[\+]?[1-9][\d]{0,15}$/;
            return re.test(phone.replace(/[\s\-\(\)]/g, ''));
        }

        // Email validation
        function validateEmail(email) {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return re.test(email);
        }

        // Show error
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
        function resetErrors() {
            const errors = document.querySelectorAll('.error-message');
            const errorInputs = document.querySelectorAll('.input-field.error');
            
            errors.forEach(error => error.style.display = 'none');
            errorInputs.forEach(input => input.classList.remove('error'));
        }

        // Next button for step 1
        document.getElementById('nextBtn1').addEventListener('click', function() {
            if (validateStep(1)) {
                currentStep = 2;
                updateProgress();
            }
        });

        // Next button for step 2
        document.getElementById('nextBtn2').addEventListener('click', function() {
            if (validateStep(2)) {
                currentStep = 3;
                updateProgress();
            }
        });

        // Back button for step 2
        document.getElementById('backBtn2').addEventListener('click', function() {
            currentStep = 1;
            updateProgress();
        });

        // Back button for step 3
        document.getElementById('backBtn3').addEventListener('click', function() {
            currentStep = 2;
            updateProgress();
        });

        // Back button
        document.getElementById('cancelBtn').addEventListener('click', function() {
            if (confirm('Go back to signup selection? All entered data will be lost.')) {
                window.location.href = '/?tab=signup';
            }
        });

        // Submit registration
        document.getElementById('submitBtn').addEventListener('click', async function() {
            if (validateStep(3)) {
                const submitBtn = document.getElementById('submitBtn');
                submitBtn.classList.add('loading');
                submitBtn.disabled = true;
                try {
                    const payload = {
                        fullName: adminData.personal.fullName,
                        email: document.getElementById('email').value,
                        phone: adminData.personal.phone,
                        dob: adminData.personal.dob,
                        gender: adminData.personal.gender,
                        address: adminData.personal.address,
                        hospitalName: adminData.hospital.hospitalName,
                        hospitalType: adminData.hospital.hospitalType,
                        hospitalAddress: adminData.hospital.hospitalAddress,
                        hospitalContact: adminData.hospital.hospitalContact,
                        licenseNumber: adminData.hospital.licenseNumber,
                        adminRole: adminData.role.adminRole,
                        department: adminData.role.department,
                        employeeId: adminData.role.employeeId,
                        adminNotes: adminData.role.adminNotes,
                        permissions: adminData.role.permissions,
                        password: adminData.role.password
                    };

                    const response = await fetch('/auth/register/admin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    const result = await response.json().catch(() => ({}));

                    if (response.ok && result.success) {
                        successText.textContent = 'Admin registration successful! Redirecting to sign in...';
                        successMessage.style.display = 'block';

                        setTimeout(() => {
                            window.location.href = '/?tab=login';
                        }, 1500);
                    } else {
                        const message = result.message || 'Registration failed. Please try again.';
                        alert(message);
                    }
                } catch (error) {
                    alert('Unable to reach server. Please try again.');
                } finally {
                    submitBtn.classList.remove('loading');
                    submitBtn.disabled = false;
                }
            }
        });

        // Keyboard navigation
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                
                if (currentStep === 1) {
                    document.getElementById('nextBtn1').click();
                } else if (currentStep === 2) {
                    document.getElementById('nextBtn2').click();
                } else if (currentStep === 3) {
                    document.getElementById('submitBtn').click();
                }
            } else if (e.key === 'Escape') {
                resetErrors();
            }
        });
    
