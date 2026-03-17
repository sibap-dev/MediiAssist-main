
        // DOM Elements
        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('mainContent');
        const purchaseCard = document.getElementById('purchaseCard');
        const purchaseModal = document.getElementById('purchaseModal');
        const openModalBtn = document.getElementById('openModalBtn');
        const closeModal = document.getElementById('closeModal');
        const cancelPurchase = document.getElementById('cancelPurchase');
        const alertBtn = document.getElementById('alertBtn');
        const settingsBtn = document.getElementById('settingsBtn');
        const purchaseForm = document.getElementById('purchaseForm');
        const purchaseForSelect = document.getElementById('purchaseFor');
        const childDetails = document.getElementById('childDetails');
        const medicineItems = document.getElementById('medicineItems');
        const addMoreMedicine = document.getElementById('addMoreMedicine');
        const grandTotalElement = document.getElementById('grandTotal');
        const userContactInput = document.getElementById('userContact');
        const userIdInput = document.getElementById('userId');
        const userFullNameInput = document.getElementById('userFullName');
        const userEmailInput = document.getElementById('userEmail');

        // Medicine counter
        let medicineCounter = 1;

        // Simplified and robust admin profile loading
        async function fetchAdminProfile() {
            console.log('ðŸ”„ Loading admin profile...');
            
            try {
                const response = await fetch('/admin/profile', {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    credentials: 'same-origin'
                });
                
                console.log('ðŸ“¡ Profile response status:', response.status);
                
                if (response.status === 401) {
                    console.warn('âš ï¸  Authentication required');
                    showAuthenticationError();
                    return;
                }
                
                if (response.status === 403) {
                    console.warn('âš ï¸  Admin access required');
                    showAccessDeniedError();
                    return;
                }
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const text = await response.text();
                console.log('ðŸ“„ Raw response:', text.substring(0, 200));
                
                let data;
                try {
                    data = JSON.parse(text);
                } catch (parseError) {
                    console.error('âŒ JSON parse error:', parseError);
                    console.log('Raw response that failed to parse:', text);
                    throw new Error('Invalid JSON response from server');
                }
                
                console.log('âœ… Parsed profile data:', data);
                
                if (data.success && data.admin) {
                    const admin = data.admin;
                    console.log('ðŸ‘¤ Admin data:', admin);
                    
                    // Update UI elements safely
                    updateElementText('adminName', admin.fullName || 'Admin');
                    updateElementText('adminRole', admin.adminRole || 'System Administrator');
                    
                    // Update avatar
                    const adminAvatarElement = document.getElementById('adminAvatar');
                    if (adminAvatarElement && admin.fullName) {
                        const fullName = admin.fullName || 'Admin User';
                        const initials = fullName
                            .split(' ')
                            .map(n => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2);
                        adminAvatarElement.textContent = initials || 'A';
                    }
                    
                    // Show welcome notification
                    showNotification(`Welcome back, ${admin.fullName || 'Admin'}!`, 'success');
                    console.log('âœ… Admin profile loaded successfully');
                    
                } else {
                    console.warn('âš ï¸  Invalid profile response:', data);
                    setFallbackAdminData();
                }
                
            } catch (error) {
                console.error('âŒ Error loading admin profile:', error);
                setFallbackAdminData();
                showNotification('Profile loaded with default values', 'warning');
            }
        }
        
        // Helper function to safely update text content
        function updateElementText(elementId, text) {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = text;
                console.log(`âœ… Updated ${elementId}:`, text);
            } else {
                console.warn(`âš ï¸  Element not found: ${elementId}`);
            }
        }
        
        // Set fallback admin data
        function setFallbackAdminData() {
            updateElementText('adminName', 'Admin');
            updateElementText('adminRole', 'System Administrator');
            
            const adminAvatarElement = document.getElementById('adminAvatar');
            if (adminAvatarElement) {
                adminAvatarElement.textContent = 'A';
            }
        }
        
        // Handle authentication errors
        function showAuthenticationError() {
            setFallbackAdminData();
            
            // Update stats to show authentication required
            const statsElements = ['statPatients', 'statAccuracy'];
            statsElements.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '<i class="fas fa-lock"></i>';
            });
            
            // Update descriptions
            const descPatients = document.getElementById('descPatients');
            if (descPatients) {
                descPatients.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right: 5px; color: var(--warning);"></i> Please log in to view dashboard data';
            }
            
            const descAnalytics = document.getElementById('descAnalytics');
            if (descAnalytics) {
                descAnalytics.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right: 5px; color: var(--warning);"></i> Please log in to view analytics data';
            }
            
            showNotification('Please log in to access admin features', 'error');
            
            // Show login prompt after a delay
            setTimeout(() => {
                if (confirm('You need to log in to access the admin dashboard. Go to login page?')) {
                    window.location.href = '/';
                }
            }, 3000);
        }
        
        // Handle access denied errors
        function showAccessDeniedError() {
            setFallbackAdminData();
            
            // Update stats to show access denied
            const statsElements = ['statPatients', 'statAccuracy'];
            statsElements.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '<i class="fas fa-ban"></i>';
            });
            
            // Update descriptions
            const descPatients = document.getElementById('descPatients');
            if (descPatients) {
                descPatients.innerHTML = '<i class="fas fa-ban" style="margin-right: 5px; color: var(--danger);"></i> Admin access required';
            }
            
            const descAnalytics = document.getElementById('descAnalytics');
            if (descAnalytics) {
                descAnalytics.innerHTML = '<i class="fas fa-ban" style="margin-right: 5px; color: var(--danger);"></i> Admin access required';
            }
            
            showNotification('Admin access required', 'error');
            
            // Show access denied message
            setTimeout(() => {
                alert('You do not have admin privileges. Please contact your administrator.');
            }, 3000);
        }

        // Call fetchAdminProfile when DOM is ready
        document.addEventListener('DOMContentLoaded', function() {
            fetchAdminProfile();
            fetchDashboardStats();
        });

        // Fetch dashboard stats and update UI
        async function fetchDashboardStats() {
            try {
                const response = await fetch('/admin/dashboard-stats');
                
                if (response.status === 401) {
                    console.warn('âš ï¸  Authentication required for dashboard stats');
                    showAuthenticationError();
                    return;
                }
                
                if (response.status === 403) {
                    console.warn('âš ï¸  Admin access required for dashboard stats');
                    showAccessDeniedError();
                    return;
                }
                
                const data = await response.json();
                
                if (data.success && data.stats) {
                    const s = data.stats;

                    // â”€â”€ Patient card â”€â”€
                    const elPatients = document.getElementById('statPatients');
                    if (elPatients) elPatients.textContent = s.total_patients.toLocaleString();

                    const elNew = document.getElementById('statNewToday');
                    if (elNew) elNew.textContent = s.new_patients_today;

                    const elPurchases = document.getElementById('statPurchases');
                    if (elPurchases) elPurchases.textContent = s.total_purchases.toLocaleString();

                    const elPurchasesToday = document.getElementById('statPurchasesToday');
                    if (elPurchasesToday) elPurchasesToday.textContent = s.purchases_today;

                    const descP = document.getElementById('descPatients');
                    if (descP) {
                        const rev = s.total_revenue > 0
                            ? `\u20B9${s.total_revenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} total revenue. `
                            : '';
                        descP.textContent = `${rev}${s.new_patients_today} new today, ${s.purchases_today} purchases today.`;
                    }

                    // â”€â”€ Analytics card â”€â”€
                    const elAcc = document.getElementById('statAccuracy');
                    if (elAcc) elAcc.textContent = `${s.inventory_accuracy}%`;

                    const elInStock = document.getElementById('statInStock');
                    if (elInStock) elInStock.textContent = s.in_stock;

                    const elLow = document.getElementById('statLowStock');
                    if (elLow) elLow.textContent = s.low_stock_count;

                    const elOut = document.getElementById('statOutOfStock');
                    if (elOut) elOut.textContent = s.out_of_stock;

                    const descA = document.getElementById('descAnalytics');
                    if (descA) {
                        const parts = [];
                        if (s.total_medicines > 0) parts.push(`${s.total_medicines} medicines tracked`);
                        if (s.expiring_soon > 0) parts.push(`${s.expiring_soon} expiring soon`);
                        if (s.expired > 0) parts.push(`${s.expired} expired`);
                        if (s.rt_active_alerts > 0) {
                            let alertText = `${s.rt_active_alerts} active alert${s.rt_active_alerts > 1 ? 's' : ''}`;
                            if (s.rt_critical > 0) alertText += ` (${s.rt_critical} critical)`;
                            parts.push(alertText);
                        }
                        descA.textContent = parts.length > 0
                            ? parts.join('. ') + '.'
                            : 'No inventory data yet. Add medicines to start tracking.';
                    }

                    // Color-code accuracy
                    if (elAcc) {
                        if (s.inventory_accuracy >= 80) elAcc.style.color = 'var(--success)';
                        else if (s.inventory_accuracy >= 50) elAcc.style.color = 'var(--warning)';
                        else elAcc.style.color = 'var(--danger)';
                    }

                    console.log('Dashboard stats updated:', s);
                }
            } catch (error) {
                console.error('Error fetching dashboard stats:', error);
                // Show error state
                const els = ['statPatients', 'statAccuracy'];
                els.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = '\u2014';
                });
            }
        }

        // Auto-fetch user details when mobile number is entered
        if (userContactInput) {
            userContactInput.addEventListener('blur', async function() {
                const mobile = this.value.trim();
                
                if (mobile.length < 10) {
                    return; // Don't search if mobile is too short
                }

                try {
                    const response = await fetch('/admin/search-user', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mobile: mobile })
                    });

                    const data = await response.json();

                    if (data.success && data.exists) {
                        // User found - auto-fill details
                        if (userIdInput) userIdInput.value = data.userId;
                        if (userFullNameInput) userFullNameInput.value = data.fullName;
                        if (userEmailInput) userEmailInput.value = data.email;
                        
                        showNotification('User found and auto-filled!', 'success');
                    } else {
                        // User not found - only clear system-populated fields.
                        // Do NOT clear userFullName: the admin may have already typed it.
                        if (userIdInput) userIdInput.value = '';
                        if (userEmailInput) userEmailInput.value = '';
                    }
                } catch (error) {
                    console.error('Error searching user:', error);
                }
            });
        }

        // Auto-capitalize user full name as user types
        if (userFullNameInput) {
            userFullNameInput.addEventListener('input', function() {
                // Capitalize first letter of each word
                const capitalized = this.value
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');
                this.value = capitalized;
            });
        }

        // Toggle Sidebar
        function closeSidebar() {
            const backdrop = document.getElementById('sidebarBackdrop');
            
            sidebar.classList.remove('open');
            mainContent.classList.remove('shifted');
            backdrop.classList.remove('active');
            document.body.classList.remove('sidebar-open');
            sidebar.style.transform = '';
            backdrop.style.opacity = '';
            backdrop.style.visibility = '';
        }

        menuToggle.addEventListener('click', function() {
            const backdrop = document.getElementById('sidebarBackdrop');
            const menuIcon = menuToggle.querySelector('i');
            const isOpen = sidebar.classList.contains('open');
            const isMobile = window.innerWidth < 768;

            if (isOpen) {
                closeSidebar();
            } else {
                // Open sidebar
                sidebar.classList.add('open');
                sidebar.style.transform = 'translateX(0)';
                document.body.classList.add('sidebar-open');

                if (isMobile) {
                    // Mobile: overlay with backdrop, no content push
                    backdrop.classList.add('active');
                    backdrop.style.opacity = '1';
                    backdrop.style.visibility = 'visible';
                    mainContent.classList.remove('shifted');
                } else {
                    // Desktop: push content, no backdrop
                    backdrop.classList.remove('active');
                    backdrop.style.opacity = '0';
                    backdrop.style.visibility = 'hidden';
                    mainContent.classList.add('shifted');
                }
            }
        });

        // Handle window resize
        let resizeTimeout;
        function handleResize() {
            const backdrop = document.getElementById('sidebarBackdrop');
            const isMobile = window.innerWidth < 768;
            const isOpen = sidebar.classList.contains('open');

            if (isOpen) {
                if (isMobile) {
                    backdrop.classList.add('active');
                    mainContent.classList.remove('shifted');
                } else {
                    backdrop.classList.remove('active');
                    mainContent.classList.add('shifted');
                }
            } else {
                backdrop.classList.remove('active');
                mainContent.classList.remove('shifted');
            }
        }

        window.addEventListener('resize', function() {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(handleResize, 16);
        });

        window.addEventListener('orientationchange', function() {
            setTimeout(handleResize, 100);
        });

        // Backdrop click to close sidebar
        document.getElementById('sidebarBackdrop').addEventListener('click', function() {
            closeSidebar();
        });

        // Close sidebar on nav item click (mobile)
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', function() {
                if (window.innerWidth < 768) {
                    closeSidebar();
                }
            });
        });

        // Close sidebar on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && sidebar.classList.contains('open')) {
                closeSidebar();
            }
        });

        // Close sidebar when clicking outside (mobile)
        document.addEventListener('click', function(e) {
            if (window.innerWidth < 768 &&
                sidebar.classList.contains('open') &&
                !sidebar.contains(e.target) &&
                !menuToggle.contains(e.target)) {
                closeSidebar();
            }
        });

        // Show/Hide Child Details based on selection
        purchaseForSelect.addEventListener('change', function() {
            if (this.value === 'child') {
                childDetails.classList.add('active');
            } else {
                childDetails.classList.remove('active');
            }
        });

        // Open Purchase Modal
        purchaseCard.addEventListener('click', () => {
            purchaseModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        });

        openModalBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            purchaseModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        });

        // Close Modal Functions
        const closeModalFunc = () => {
            purchaseModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        };

        closeModal.addEventListener('click', closeModalFunc);
        cancelPurchase.addEventListener('click', closeModalFunc);

        // Close modal when clicking outside
        purchaseModal.addEventListener('click', (e) => {
            if (e.target === purchaseModal) {
                closeModalFunc();
            }
        });

        // Alert Button Functionality
        alertBtn.addEventListener('click', () => {
            alertBtn.classList.toggle('pulse');
            showNotification('You have 3 new alerts! Check the Alerts panel.');
        });

        // Settings Button
        settingsBtn.addEventListener('click', () => {
            showNotification('Settings panel would open here.');
        });

        // Calculate item total
        function calculateItemTotal(index) {
            const item = document.querySelector(`.medicine-item[data-index="${index}"]`);
            const quantity = parseFloat(item.querySelector('.quantity').value) || 0;
            const unitPrice = parseFloat(item.querySelector('.unit-price').value) || 0;
            const total = (quantity * unitPrice).toFixed(2);
            item.querySelector('.item-total').value = total;
            calculateGrandTotal();
        }

        // Calculate grand total
        function calculateGrandTotal() {
            let grandTotal = 0;
            const itemTotals = document.querySelectorAll('.item-total');
            itemTotals.forEach(item => {
                grandTotal += parseFloat(item.value) || 0;
            });
            grandTotalElement.textContent = grandTotal.toFixed(2);
        }

        // Enhanced dosage selection functions
        function selectFrequency(index, frequency) {
            updateDosageOptions(index, 'frequency', frequency);
            generateTimeInputs(index, parseInt(frequency));
            updateDosagePreview(index);
        }

        function selectTiming(index, timing) {
            updateDosageOptions(index, 'timing', timing);
            updateDosagePreview(index);
        }

        function updateDosageOptions(index, type, value) {
            const options = document.querySelectorAll(`[name="${type}${index}"]`);
            options.forEach(option => {
                const parent = option.parentElement;
                if (option.value === value) {
                    parent.classList.add('selected');
                } else {
                    parent.classList.remove('selected');
                }
            });
        }

        function generateTimeInputs(index, frequency) {
            const timeInputsContainer = document.getElementById(`timeInputs${index}`);
            const specificTimesGroup = document.getElementById(`specificTimesGroup${index}`);
            
            if (frequency > 1) {
                specificTimesGroup.style.display = 'block';
                timeInputsContainer.innerHTML = '';
                
                const defaultTimes = {
                    2: ['08:00', '20:00'],
                    3: ['08:00', '14:00', '20:00'],
                    4: ['08:00', '12:00', '16:00', '20:00']
                };
                
                const times = defaultTimes[frequency] || [];
                
                for (let i = 0; i < frequency; i++) {
                    const timeInput = document.createElement('input');
                    timeInput.type = 'time';
                    timeInput.className = 'time-input';
                    timeInput.value = times[i] || '';
                    timeInput.placeholder = `Time ${i + 1}`;
                    timeInput.onchange = () => updateDosagePreview(index);
                    timeInputsContainer.appendChild(timeInput);
                }
            } else {
                specificTimesGroup.style.display = 'none';
            }
        }

        function updateDosagePreview(index) {
            const frequencyInput = document.querySelector(`[name="frequency${index}"]:checked`);
            const timingInput = document.querySelector(`[name="timing${index}"]:checked`);
            const dosageAmountInput = document.querySelector(`.medicine-item[data-index="${index}"] .dosage-amount`);
            const timeInputs = document.querySelectorAll(`#timeInputs${index} .time-input`);
            
            const previewText = document.getElementById(`previewText${index}`);
            
            if (!previewText) {
                console.warn(`Preview text element not found for index ${index}`);
                return;
            }
            
            if (!frequencyInput || !timingInput) {
                previewText.innerHTML = 'Select frequency and timing above';
                return;
            }
            
            const frequency = parseInt(frequencyInput.value);
            const timing = timingInput.value;
            const amount = dosageAmountInput ? dosageAmountInput.value || '1 dose' : '1 dose';
            
            const timingMap = {
                'BF': 'Before Food',
                'AF': 'After Food',
                'WF': 'With Food',
                'E': 'Empty Stomach'
            };
            
            const timingShort = {
                'BF': 'BF',
                'AF': 'AF',
                'WF': 'WF',
                'E': 'ES'
            };
            
            let preview = `<i class="fas fa-pills"></i> ${amount} - ${frequency} Time${frequency > 1 ? 's' : ''} ${timingShort[timing]}`;
            
            // Add specific times if available
            const times = Array.from(timeInputs).map(input => input.value).filter(time => time);
            if (times.length > 0) {
                preview += ` (${times.join(', ')})`;
            }
            
            previewText.innerHTML = preview;
        }

        // Select dosage (legacy function for compatibility)
        function selectDosage(index, value) {
            // This function is kept for backward compatibility
            // New enhanced system uses selectFrequency and selectTiming
        }

        // Add new medicine item
        addMoreMedicine.addEventListener('click', () => {
            const newIndex = medicineCounter;
            medicineCounter++;
            
            const newMedicineItem = document.createElement('div');
            newMedicineItem.className = 'medicine-item';
            newMedicineItem.setAttribute('data-index', newIndex);
            newMedicineItem.innerHTML = `
                <div class="medicine-header">
                    <h4 class="medicine-title">
                        <i class="fas fa-pills"></i>
                        Medicine #${medicineCounter}
                    </h4>
                    <button type="button" class="remove-medicine" onclick="removeMedicineItem(${newIndex})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="form-grid">
                    <div class="input-group">
                        <label class="input-label">Medicine Name</label>
                        <input type="text" class="input-field medicine-name" placeholder="Enter medicine name" required>
                    </div>
                    <div class="input-group">
                        <label class="input-label">Medicine Category (TFT)</label>
                        <select class="input-field medicine-category">
                            <option value="">Auto-detect from name</option>
                            <option value="M01AB">M01AB - Anti-inflammatory</option>
                            <option value="M01AE">M01AE - Propionic acid</option>
                            <option value="N02BA">N02BA - Salicylic acid</option>
                            <option value="N02BE">N02BE - Anilides (Paracetamol)</option>
                            <option value="N05B">N05B - Anxiolytics</option>
                            <option value="N05C">N05C - Hypnotics/Sedatives</option>
                            <option value="R03">R03 - Anti-asthmatics</option>
                            <option value="R06">R06 - Antihistamines</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label class="input-label">Quantity</label>
                        <input type="number" class="input-field quantity" placeholder="10" min="1" required oninput="calculateItemTotal(${newIndex})">
                    </div>
                    <div class="input-group">
                        <label class="input-label">Unit Price (&#8377;)</label>
                        <input type="number" class="input-field unit-price" placeholder="25.99" step="0.01" required oninput="calculateItemTotal(${newIndex})">
                    </div>
                    <div class="input-group">
                        <label class="input-label">Total Amount (&#8377;)</label>
                        <input type="text" class="input-field item-total" placeholder="0.00" readonly>
                    </div>
                </div>

                <div class="form-grid">
                    <div class="input-group">
                        <label class="input-label">Purchase Date</label>
                        <input type="date" class="input-field purchase-date" required>
                    </div>
                    <div class="input-group">
                        <label class="input-label">Expiry Date</label>
                        <input type="date" class="input-field expiry-date" required>
                    </div>
                </div>

                <!-- Enhanced Dosage Selection -->
                <div class="input-group">
                    <label class="input-label">Dosage Amount</label>
                    <input type="text" class="input-field dosage-amount" placeholder="e.g., 1 tablet, 5ml, 500mg" required>
                </div>

                <div class="input-group">
                    <label class="input-label">Frequency per Day</label>
                    <div class="dosage-options">
                        <label class="dosage-option">
                            <input type="radio" name="frequency${newIndex}" value="1" onclick="selectFrequency(${newIndex}, this.value)">
                            Once Daily
                        </label>
                        <label class="dosage-option">
                            <input type="radio" name="frequency${newIndex}" value="2" onclick="selectFrequency(${newIndex}, this.value)">
                            Twice Daily
                        </label>
                        <label class="dosage-option">
                            <input type="radio" name="frequency${newIndex}" value="3" onclick="selectFrequency(${newIndex}, this.value)">
                            Thrice Daily
                        </label>
                        <label class="dosage-option">
                            <input type="radio" name="frequency${newIndex}" value="4" onclick="selectFrequency(${newIndex}, this.value)">
                            Four Times
                        </label>
                    </div>
                </div>

                <div class="input-group">
                    <label class="input-label">Timing Relation to Food</label>
                    <div class="dosage-options">
                        <label class="dosage-option">
                            <input type="radio" name="timing${newIndex}" value="BF" onclick="selectTiming(${newIndex}, this.value)">
                            Before Food (BF)
                        </label>
                        <label class="dosage-option">
                            <input type="radio" name="timing${newIndex}" value="AF" onclick="selectTiming(${newIndex}, this.value)" checked>
                            After Food (AF)
                        </label>
                        <label class="dosage-option">
                            <input type="radio" name="timing${newIndex}" value="WF" onclick="selectTiming(${newIndex}, this.value)">
                            With Food (WF)
                        </label>
                        <label class="dosage-option">
                            <input type="radio" name="timing${newIndex}" value="E" onclick="selectTiming(${newIndex}, this.value)">
                            Empty Stomach (ES)
                        </label>
                    </div>
                </div>

                <div class="input-group" id="specificTimesGroup${newIndex}" style="display: none;">
                    <label class="input-label">Specific Times (Optional)</label>
                    <div class="time-inputs" id="timeInputs${newIndex}">
                        <!-- Time inputs will be generated based on frequency -->
                    </div>
                </div>

                <div class="dosage-preview" id="dosagePreview${newIndex}">
                    <div class="preview-label">Dosage Summary:</div>
                    <div class="preview-text" id="previewText${newIndex}">Select frequency and timing above</div>
                </div>
            `;
            
            medicineItems.appendChild(newMedicineItem);
            
            // Set today's date for the new item
            const today = new Date().toISOString().split('T')[0];
            const purchaseDate = newMedicineItem.querySelector('.purchase-date');
            if (purchaseDate) {
                purchaseDate.value = today;
            }
            
            // Set expiry date to 1 year from today
            const nextYear = new Date();
            nextYear.setFullYear(nextYear.getFullYear() + 1);
            const expiryDate = newMedicineItem.querySelector('.expiry-date');
            if (expiryDate) {
                expiryDate.valueAsDate = nextYear;
            }
            
            // Initialize enhanced dosage system for new item
            const timingInput = newMedicineItem.querySelector(`[name="timing${newIndex}"][value="AF"]`);
            if (timingInput) {
                timingInput.checked = true;
                selectTiming(newIndex, 'AF');
            }
            
            const frequencyInput = newMedicineItem.querySelector(`[name="frequency${newIndex}"][value="1"]`);
            if (frequencyInput) {
                frequencyInput.checked = true;
                selectFrequency(newIndex, '1');
            }
        });

        // Remove medicine item
        function removeMedicineItem(index) {
            const item = document.querySelector(`.medicine-item[data-index="${index}"]`);
            if (item) {
                item.remove();
                calculateGrandTotal();
                
                // Renumber remaining items
                const remainingItems = document.querySelectorAll('.medicine-item');
                remainingItems.forEach((item, idx) => {
                    const title = item.querySelector('.medicine-title');
                    if (title) {
                        title.innerHTML = `<i class="fas fa-pills"></i> Medicine #${idx + 1}`;
                    }
                    item.setAttribute('data-index', idx);
                });
                
                medicineCounter = remainingItems.length;
            }
        }

        // Form Submission
        purchaseForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const data = {
                userId: document.getElementById('userId').value.trim(),
                userFullName: document.getElementById('userFullName').value.trim(),
                userContact: document.getElementById('userContact').value.trim(),
                userEmail: document.getElementById('userEmail').value.trim(),
                purchaseFor: purchaseForSelect.value,
                childName: document.getElementById('childName').value.trim(),
                childAge: document.getElementById('childAge').value.trim(),
                childGender: document.getElementById('childGender').value,
                purchaserGender: document.getElementById('purchaserGender').value,
                purchaserAge: document.getElementById('purchaserAge').value.trim(),
                paymentMethod: document.getElementById('paymentMethod').value,
                grandTotal: grandTotalElement.textContent
            };

            const medicines = [];
            const medicineElements = document.querySelectorAll('.medicine-item');
            medicineElements.forEach((item) => {
                const dataIndex = item.getAttribute('data-index');
                
                // Get frequency and timing values with fallbacks
                const frequencyInput = item.querySelector(`input[name="frequency${dataIndex}"]:checked`);
                const timingInput = item.querySelector(`input[name="timing${dataIndex}"]:checked`);
                const dosageAmountInput = item.querySelector('.dosage-amount');
                const timeInputs = item.querySelectorAll(`#timeInputs${dataIndex} .time-input`);
                
                // Collect specific times
                const specificTimes = Array.from(timeInputs)
                    .map(input => input.value)
                    .filter(time => time);
                
                const medicine = {
                    name: item.querySelector('.medicine-name').value,
                    category: item.querySelector('.medicine-category')?.value || '',
                    quantity: item.querySelector('.quantity').value,
                    unitPrice: item.querySelector('.unit-price').value,
                    total: item.querySelector('.item-total').value,
                    purchaseDate: item.querySelector('.purchase-date').value,
                    expiryDate: item.querySelector('.expiry-date').value,
                    // Enhanced dosage fields with safe fallbacks
                    dosageAmount: dosageAmountInput ? dosageAmountInput.value : '',
                    frequency: frequencyInput ? frequencyInput.value : '1',
                    timing: timingInput ? timingInput.value : 'AF',
                    specificTimes: specificTimes.length > 0 ? specificTimes : null,
                    // Legacy fields for backward compatibility
                    dosage: dosageAmountInput ? dosageAmountInput.value : (item.querySelector(`input[name="dosage${dataIndex}"]:checked`)?.value || 'Not specified'),
                    customDosage: item.querySelector('.custom-dosage-input')?.value || ''
                };
                medicines.push(medicine);
            });

            data.medicines = medicines;

            fetch('/admin/purchases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
                .then(response => response.json().then(result => ({ response, result })))
                .then(({ response, result }) => {
                    if (response.ok && result.success) {
                        showNotification('Purchase recorded successfully with ' + medicines.length + ' medicine(s)!', 'success');
                        closeModalFunc();

                        purchaseForm.reset();
                        medicineItems.innerHTML = '';
                        medicineCounter = 1;

                        addMoreMedicine.click();
                        grandTotalElement.textContent = '0.00';
                    } else {
                        const message = result.message || 'Failed to save purchase.';
                        showNotification(message, 'error');
                    }
                })
                .catch(() => {
                    showNotification('Unable to reach server. Please try again.', 'error');
                });
        });

        // Set up event listeners for first medicine item
        document.addEventListener('DOMContentLoaded', function() {
            // Set today's date for first item
            const today = new Date().toISOString().split('T')[0];
            const firstPurchaseDate = document.querySelector('.purchase-date');
            if (firstPurchaseDate) {
                firstPurchaseDate.value = today;
            }
            
            // Set expiry date to 1 year from today for first item
            const nextYear = new Date();
            nextYear.setFullYear(nextYear.getFullYear() + 1);
            const firstExpiryDate = document.querySelector('.expiry-date');
            if (firstExpiryDate) {
                firstExpiryDate.valueAsDate = nextYear;
            }
            
            // Initialize enhanced dosage system for first item
            const firstTimingInput = document.querySelector('[name="timing0"][value="AF"]');
            if (firstTimingInput) {
                firstTimingInput.checked = true;
                selectTiming(0, 'AF');
            }
            
            const firstFrequencyInput = document.querySelector('[name="frequency0"][value="1"]');
            if (firstFrequencyInput) {
                firstFrequencyInput.checked = true;
                selectFrequency(0, '1');
            }

            // Keep first medicine total in sync while typing
            const firstQuantity = document.querySelector('.quantity');
            const firstUnitPrice = document.querySelector('.unit-price');
            if (firstQuantity && firstUnitPrice) {
                firstQuantity.addEventListener('input', () => calculateItemTotal(0));
                firstUnitPrice.addEventListener('input', () => calculateItemTotal(0));
            }
        });

        // Notification Function
        function showNotification(message, type = 'info') {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'success' ? 'var(--success)' : 'var(--primary)'};
                color: white;
                padding: 15px 25px;
                border-radius: var(--radius);
                box-shadow: var(--shadow);
                z-index: 3000;
                animation: slideIn 0.3s ease;
                display: flex;
                align-items: center;
                gap: 10px;
            `;
            
            notification.innerHTML = `
                <i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i>
                ${message}
            `;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }, 3000);
            
            if (!document.querySelector('#notification-styles')) {
                const style = document.createElement('style');
                style.id = 'notification-styles';
                style.textContent = `
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    @keyframes slideOut {
                        from { transform: translateX(0); opacity: 1; }
                        to { transform: translateX(100%); opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }
        }

        // Logout Handler
        function handleLogout(event) {
            event.preventDefault();
            if (confirm('Are you sure you want to logout?')) {
                // Redirect to logout endpoint
                window.location.href = '/auth/logout';
            }
        }

        // Registrations Modal Functions
        function showRegistrationsModal() {
            const modal = document.getElementById('registrationsModal');
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
            fetchPatients(); // Load patients when modal opens
        }

        function closeRegistrationsModal() {
            const modal = document.getElementById('registrationsModal');
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        // Fetch all patients
        async function fetchPatients(searchTerm = '') {
            try {
                const tableBody = document.getElementById('patientsTableBody');
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 40px; color: var(--gray);">
                            <i class="fas fa-spinner fa-spin" style="margin-right: 10px;"></i>
                            Loading patients...
                        </td>
                    </tr>
                `;

                const response = await fetch('/admin/patients');
                const data = await response.json();

                if (data.success && data.patients) {
                    displayPatients(data.patients, searchTerm);
                } else {
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="6" style="text-align: center; padding: 40px; color: var(--gray);">
                                <i class="fas fa-exclamation-triangle" style="margin-right: 10px;"></i>
                                Failed to load patients
                            </td>
                        </tr>
                    `;
                }
            } catch (error) {
                console.error('Error fetching patients:', error);
                const tableBody = document.getElementById('patientsTableBody');
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 40px; color: var(--gray);">
                            <i class="fas fa-exclamation-triangle" style="margin-right: 10px;"></i>
                            Error loading patients
                        </td>
                    </tr>
                `;
            }
        }

        // Display patients in table
        function displayPatients(patients, searchTerm = '') {
            const tableBody = document.getElementById('patientsTableBody');
            let filteredPatients = patients;

            // Filter patients if search term provided
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                filteredPatients = patients.filter(patient =>
                    (patient.user_code && patient.user_code.toLowerCase().includes(term)) ||
                    (patient.full_name && patient.full_name.toLowerCase().includes(term)) ||
                    (patient.mobile && patient.mobile.includes(term))
                );
            }

            if (filteredPatients.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 40px; color: var(--gray);">
                            <i class="fas fa-search" style="margin-right: 10px;"></i>
                            No patients found matching "${searchTerm}"
                        </td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = filteredPatients.map(patient => {
                const displayName = patient.full_name || patient.mobile || patient.user_code || 'N/A';
                return `
                <tr>
                    <td>${patient.user_code || 'N/A'}</td>
                    <td>${displayName}</td>
                    <td>${patient.mobile || 'N/A'}</td>
                    <td>${patient.email || 'N/A'}</td>
                    <td>${new Date(patient.created_at).toLocaleDateString()}</td>
                    <td>
                        <span class="status-badge ${patient.is_active ? 'active' : 'inactive'}">
                            ${patient.is_active ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td>
                        <button class="delete-user-btn" onclick="openDeleteModal(${patient.id}, '${displayName.replace(/'/g, "\\'")}')"
                            title="Delete user" style="background:none;border:none;cursor:pointer;color:#DC3545;font-size:1rem;padding:6px 10px;border-radius:6px;transition:var(--transition);">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>
                `;
            }).join('');
        }

        // Delete user helpers
        let _deleteUserId = null;

        function openDeleteModal(userId, userName) {
            _deleteUserId = userId;
            document.getElementById('deleteUserName').textContent = `User: ${userName}`;
            document.getElementById('deleteUserModal').style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        function closeDeleteModal() {
            _deleteUserId = null;
            document.getElementById('deleteUserModal').style.display = 'none';
            document.body.style.overflow = 'auto';
            // Always reset the button so it's not stuck on next open
            const btn = document.querySelector('#deleteUserModal button[onclick="confirmDeleteUser()"]');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete User'; }
        }

        async function confirmDeleteUser() {
            if (!_deleteUserId) return;
            const btn = document.querySelector('#deleteUserModal button[onclick="confirmDeleteUser()"]');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...'; }

            try {
                const response = await fetch(`/admin/delete-user/${_deleteUserId}`, { method: 'DELETE' });
                const data = await response.json();

                if (data.success) {
                    closeDeleteModal();
                    showNotification('User deleted successfully.', 'success');
                    fetchPatients(); // Refresh the list
                    fetchDashboardStats(); // Update patient count on dashboard
                } else {
                    showNotification(data.message || 'Failed to delete user.', 'error');
                    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete User'; }
                }
            } catch (err) {
                showNotification('Network error. Please try again.', 'error');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete User'; }
            }
        }

        // Search patients
        function searchPatients() {
            const searchInput = document.getElementById('searchInput');
            const searchTerm = searchInput.value.trim();
            fetchPatients(searchTerm);
        }

        // Search on Enter key
        document.addEventListener('DOMContentLoaded', function() {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        searchPatients();
                    }
                });
            }
        });
    
