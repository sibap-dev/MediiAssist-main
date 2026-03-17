
        // Data - Will be loaded from API
        let medicines = [];
        let currentMedicineFilter = 'ongoing';
        let medicineReminderSettings = {};
        const reminderTimerHandles = new Map();
        let currentUserProfile = null;
        const DEFAULT_USER_SETTINGS = {
            showPrescriptionAlerts: true,
            showExpiryAlerts: true,
            showDoseReminders: true
        };
        let currentUserSettings = { ...DEFAULT_USER_SETTINGS };
        
        // Initialize family members array as empty (will be loaded from server/database in future)
        const familyMembers = [];

        // Ticker alerts - populated dynamically from user's own prescriptions

        // DOM Elements
        const menuToggle = document.getElementById('menuToggle');
        const medicinesList = document.getElementById('medicinesList');
        const familyMembersContainer = document.getElementById('familyMembers');
        const medicineCount = document.getElementById('medicineCount');
        const familyCount = document.getElementById('familyCount');

        // Initialize
        document.addEventListener('DOMContentLoaded', async function() {
            loadUserSettings();
            setupEventListeners();
            setupFormDates();
            loadFamilyMembers();
            updateCounts();

            // Render core content first for faster perceived load.
            await fetchUserProfile();
            await refreshUserMedicines();

            // Load ticker after medicines are visible.
            setTimeout(() => {
                loadAlertTicker();
            }, 0);
        });

        // Load Alert Ticker - pulls from user's own prescription alerts only
        async function loadAlertTicker() {
            const track = document.getElementById('alertTickerTrack');
            const badge = document.querySelector('.notification-badge');
            if (!track) return;

            try {
                const [alertsResp, medsResp] = await Promise.all([
                    fetch('/user/medicine-alerts'),
                    fetch('/user/medicines')
                ]);
                const alertsData = await alertsResp.json();
                const medsData = await medsResp.json();

                const items = [];

                // Separate urgent alerts (HIGH/CRITICAL/MEDIUM) from reminders (LOW)
                const filteredAlerts = applyTickerAlertPreferences(alertsData.success ? (alertsData.alerts || []) : []);
                const urgentAlerts = filteredAlerts.filter(a => a.severity !== 'LOW');
                const reminderAlerts = filteredAlerts.filter(a => a.severity === 'LOW');

                // Update notification badge - count urgent alerts only (not routine reminders)
                if (badge) {
                    badge.style.display = urgentAlerts.length > 0 ? '' : 'none';
                }

                // Show urgent alerts first in ticker
                urgentAlerts.forEach(a => items.push({ icon: a.icon, text: a.message }));

                // Then dose reminders
                reminderAlerts.forEach(a => items.push({ icon: a.icon, text: a.message }));

                // Fill in any remaining active meds as simple reminders if no dose-reminder alerts exist
                if (reminderAlerts.length === 0 && medsData.success && medsData.medicines && medsData.medicines.length > 0) {
                    medsData.medicines.slice(0, 3).forEach(med => {
                        items.push({
                            icon: 'fas fa-capsules',
                            text: 'Reminder: ' + med.medicineName + (med.dosage ? ' \u2014 ' + med.dosage : '')
                        });
                    });
                }

                // Fallback if nothing at all
                if (items.length === 0) {
                    items.push({ icon: 'fas fa-check-circle', text: 'No active alerts. All your prescriptions are up to date.' });
                }

                const alertsHTML = items.map(item =>
                    '<div class="alert-ticker-item"><i class="' + item.icon + '"></i><span>' + item.text + '</span></div>'
                ).join('');

                // Duplicate for seamless infinite scroll
                track.innerHTML = alertsHTML + alertsHTML;

            } catch (err) {
                console.error('Ticker load error:', err);
                track.innerHTML = '<div class="alert-ticker-item"><i class="fas fa-info-circle"></i><span>Could not load alerts. Please refresh.</span></div>';
            }
        }

        // Fetch user profile from server
        async function fetchUserProfile() {
            try {
                const response = await fetch('/user/profile');
                const data = await response.json();
                
                if (data.success && data.user) {
                    const user = data.user;
                    currentUserProfile = user;
                    loadUserSettings();
                    loadMedicineReminderSettings();
                    // Update user name in top bar
                    const userNameElement = document.querySelector('.user-info h4');
                    const userIdElement = document.querySelector('.user-info p');
                    const userAvatarElement = document.querySelector('.user-avatar');
                    
                    if (userNameElement) {
                        userNameElement.textContent = user.fullName || 'User';
                    }
                    if (userIdElement) {
                        userIdElement.textContent = `Patient ID: ${user.userCode}`;
                    }
                    if (userAvatarElement) {
                        const initials = user.fullName
                            .split(' ')
                            .map(n => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2);
                        userAvatarElement.textContent = initials || 'U';
                    }

                    // Keep profile modal fields synced with latest server state
                    const fullNameInput = document.getElementById('profileFullName');
                    const genderInput = document.getElementById('profileGender');
                    const emailInput = document.getElementById('profileEmail');
                    const mobileInput = document.getElementById('profileMobile');
                    const userCodeInput = document.getElementById('profileUserCode');

                    if (fullNameInput) fullNameInput.value = user.fullName || '';
                    if (genderInput) genderInput.value = (user.gender || '').toLowerCase();
                    if (emailInput) emailInput.value = user.email || '';
                    if (mobileInput) mobileInput.value = user.mobile || '';
                    if (userCodeInput) userCodeInput.value = user.userCode || '';
                }
            } catch (error) {
                console.error('Error fetching user profile:', error);
            }

            return currentUserProfile;
        }

        // Fetch medicines from server API (single source for dashboard list)
        async function refreshUserMedicines() {
            try {
                const response = await fetch('/api/user/prescriptions');
                const data = await response.json();
                
                if (data.success && data.prescriptions) {
                    medicines = data.prescriptions.map(prescription => ({
                        id: prescription.id,
                        name: prescription.medicine_name,
                        dosage: prescription.dosage_info.amount,
                        frequency: prescription.dosage_info.short,
                        fullDosage: prescription.dosage_info.full,
                        times: prescription.dosage_info.times,
                        for: prescription.prescribed_for === 'self' ? 'Self' : `${prescription.child_name} (${prescription.child_age}y)`,
                        startDate: prescription.start_date,
                        expiryDate: prescription.end_date || null,
                        quantity: prescription.quantity ? `${prescription.quantity} units` : 'As needed',
                        nextDose: prescription.next_dose_text || calculateNextDose(prescription.dosage_info.times),
                        instructions: prescription.instructions || 'Follow as prescribed',
                        status: prescription.status || 'active',
                        dosesTaken: prescription.doses_taken,
                        dosesTotal: prescription.doses_total,
                        dosesRemaining: prescription.doses_remaining,
                        nextDoseAt: prescription.next_dose_at,
                        prescribedBy: prescription.admin_name
                    }));
                } else {
                    medicines = [];
                }

                loadMedicines();
                updateCounts();
            } catch (error) {
                console.error('Error fetching medicines:', error);
                // Load empty medicines list if API fails
                medicines = [];
                loadMedicines();
            }

            return medicines;
        }

        // Helper function to close sidebar
        function closeSidebar() {
            const sidebar = document.querySelector('.sidebar');
            const mainContent = document.querySelector('.main-content');
            const backdrop = document.getElementById('sidebarBackdrop');
            
            sidebar.classList.remove('open');
            mainContent.classList.remove('shifted');
            backdrop.classList.remove('active');
            document.body.classList.remove('sidebar-open');
            // Also reset inline styles
            sidebar.style.transform = '';
            backdrop.style.opacity = '';
            backdrop.style.visibility = '';
        }

        // Setup Event Listeners
        function setupEventListeners() {
            // Menu toggle
            menuToggle.addEventListener('click', function() {
                const sidebar = document.querySelector('.sidebar');
                const mainContent = document.querySelector('.main-content');
                const backdrop = document.getElementById('sidebarBackdrop');
                const menuIcon = menuToggle.querySelector('i');
                const isOpen = sidebar.classList.contains('open');
                const isMobile = window.innerWidth < 768;
                
                console.log('Menu toggle clicked, isMobile:', isMobile, 'isOpen:', isOpen);
                
                if (isOpen) {
                    // Close sidebar
                    sidebar.classList.remove('open');
                    sidebar.style.transform = 'translateX(-100%)';
                    mainContent.classList.remove('shifted');
                    backdrop.classList.remove('active');
                    backdrop.style.opacity = '0';
                    backdrop.style.visibility = 'hidden';
                    document.body.classList.remove('sidebar-open');
                } else {
                    // Open sidebar - force visibility with inline styles
                    sidebar.classList.add('open');
                    sidebar.style.transform = 'translateX(0)';
                    document.body.classList.add('sidebar-open');
                    
                    // Always show backdrop on mobile, push content on desktop
                    if (isMobile) {
                        backdrop.classList.add('active');
                        backdrop.style.opacity = '1';
                        backdrop.style.visibility = 'visible';
                        mainContent.classList.remove('shifted');
                    } else {
                        backdrop.classList.remove('active');
                        backdrop.style.opacity = '0';
                        backdrop.style.visibility = 'hidden';
                        mainContent.classList.add('shifted');
                    }
                    
                    console.log('Sidebar opened, transform:', sidebar.style.transform);
                }
            });

            // Handle window resize - dynamically adjust sidebar state
            let resizeTimeout;
            
            function handleResize() {
                const sidebar = document.querySelector('.sidebar');
                const mainContent = document.querySelector('.main-content');
                const backdrop = document.getElementById('sidebarBackdrop');
                const isMobile = window.innerWidth < 768;
                const isOpen = sidebar.classList.contains('open');
                
                if (isOpen) {
                    if (isMobile) {
                        // Mobile mode: overlay with backdrop
                        backdrop.classList.add('active');
                        mainContent.classList.remove('shifted');
                    } else {
                        // Desktop mode: push content, no backdrop
                        backdrop.classList.remove('active');
                        mainContent.classList.add('shifted');
                    }
                } else {
                    // Sidebar is closed, ensure clean state
                    backdrop.classList.remove('active');
                    mainContent.classList.remove('shifted');
                }
            }
            
            window.addEventListener('resize', function() {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(handleResize, 16); // ~60fps
            });
            
            // Also run on orientation change for mobile devices
            window.addEventListener('orientationchange', function() {
                setTimeout(handleResize, 100);
            });

            // Close sidebar when clicking on nav items (mobile only)
            document.querySelectorAll('.nav-item').forEach(item => {
                item.addEventListener('click', function() {
                    if (window.innerWidth < 768) {
                        closeSidebar();
                    }
                });
            });

            // Close sidebar when clicking outside (on mobile)
            document.addEventListener('click', function(e) {
                const sidebar = document.querySelector('.sidebar');
                const menuToggle = document.getElementById('menuToggle');
                
                if (window.innerWidth < 768 &&
                    sidebar.classList.contains('open') &&
                    !sidebar.contains(e.target) &&
                    !menuToggle.contains(e.target)) {
                    closeSidebar();
                }
            });

            // Backdrop click
            document.getElementById('sidebarBackdrop').addEventListener('click', function() {
                closeSidebar();
            });

            // Form submissions
            document.getElementById('addMedicineForm').addEventListener('submit', handleAddMedicine);
            document.getElementById('addMemberForm').addEventListener('submit', handleAddMember);
            document.getElementById('editProfileForm').addEventListener('submit', handleEditProfile);
            document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);

            const memberRelationInput = document.getElementById('memberRelation');
            if (memberRelationInput) {
                memberRelationInput.addEventListener('change', syncFamilyMemberGenderFromRelation);
            }

            // Close modals on overlay click
            document.querySelectorAll('.modal-overlay').forEach(overlay => {
                overlay.addEventListener('click', function(e) {
                    if (e.target === this) {
                        this.classList.remove('show');
                        this.style.display = 'none';
                    }
                });
            });

            // Add family member button
            document.addEventListener('click', function(e) {
                if (e.target.closest('.add-family-btn')) {
                    openAddMemberModal();
                }
            });
        }

        // Setup Form Dates
        function setupFormDates() {
            const today = new Date().toISOString().split('T')[0];
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 30);
            
            const startDateInput = document.getElementById('medStartDate');
            const expiryDateInput = document.getElementById('medExpiryDate');
            
            if (startDateInput) startDateInput.value = today;
            if (expiryDateInput) expiryDateInput.valueAsDate = futureDate;
        }

        // Load Medicines
        function loadMedicines() {
            displayMedicines();
        }

        function isMedicineExpired(medicine) {
            if (!medicine || !medicine.expiryDate) return false;
            const expiry = new Date(medicine.expiryDate);
            if (Number.isNaN(expiry.getTime())) return false;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            expiry.setHours(0, 0, 0, 0);
            return expiry < today;
        }

        function getFilteredMedicines() {
            if (currentMedicineFilter === 'completed') {
                return medicines.filter(medicine => medicine.status === 'over');
            }
            if (currentMedicineFilter === 'expired') {
                return medicines.filter(medicine => isMedicineExpired(medicine));
            }
            if (currentMedicineFilter === 'all') {
                return medicines;
            }
            return medicines.filter(medicine => medicine.status !== 'over');
        }

        function setMedicineFilter(filterType) {
            currentMedicineFilter = filterType;

            const buttons = document.querySelectorAll('.medicine-filter-btn');
            buttons.forEach(button => {
                button.classList.toggle('active', button.dataset.filter === filterType);
            });

            displayMedicines();
            updateCounts();
        }

        function displayMedicines() {
            medicinesList.innerHTML = '';
            const filteredMedicines = getFilteredMedicines();
            
            if (filteredMedicines.length === 0) {
                const emptyTitleByFilter = {
                    ongoing: 'No Ongoing Medicines',
                    completed: 'No Completed Medicines',
                    expired: 'No Expired Medicines',
                    all: 'No Medicines'
                };

                medicinesList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-pills"></i>
                        <h3>${emptyTitleByFilter[currentMedicineFilter] || 'No Medicines'}</h3>
                        <p>Add your medicines to start tracking and receive reminders</p>
                    </div>
                `;
                return;
            }
            
            filteredMedicines.forEach(medicine => {
                const medicineCard = createMedicineCard(medicine);
                medicinesList.appendChild(medicineCard);
                scheduleReminderNotification(medicine);
            });

            updateCounts();
        }

        function calculateNextDose(times) {
            if (!times || times.length === 0) {
                return 'As needed';
            }
            
            const now = new Date();
            const currentTime = now.getHours() * 60 + now.getMinutes();
            
            // Convert time strings to minutes
            const timesInMinutes = times.map(time => {
                const [hours, minutes] = time.split(':').map(Number);
                return hours * 60 + minutes;
            }).sort((a, b) => a - b);
            
            // Find next dose time
            for (let timeInMinutes of timesInMinutes) {
                if (timeInMinutes > currentTime) {
                    const hours = Math.floor(timeInMinutes / 60);
                    const minutes = timeInMinutes % 60;
                    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                }
            }
            
            // If no time today, return first time tomorrow
            const firstTime = timesInMinutes[0];
            const hours = Math.floor(firstTime / 60);
            const minutes = firstTime % 60;
            return `Tomorrow ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }

        // Create Medicine Card
        function createMedicineCard(medicine) {
            const card = document.createElement('div');
            card.className = 'medicine-card';
            const reminderEnabled = isReminderEnabled(medicine.id);
            const statusMeta = getMedicineStatusMeta(medicine.status);
            const dosesSummary = medicine.dosesTotal
                ? `${medicine.dosesTaken || 0}/${medicine.dosesTotal} taken`
                : 'Schedule based';
            card.innerHTML = `
                <div class="medicine-header">
                    <h3 class="medicine-name">
                        <i class="fas fa-capsules"></i>
                        ${medicine.name}
                    </h3>
                    <span class="medicine-status ${statusMeta.className}">
                        ${statusMeta.label}
                    </span>
                </div>
                
                <div class="medicine-details">
                    <div class="detail-item">
                        <span class="detail-label">Dosage</span>
                        <span class="detail-value">${medicine.dosage}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Frequency</span>
                        <span class="detail-value">${medicine.frequency}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Quantity</span>
                        <span class="detail-value">${medicine.quantity}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Expiry</span>
                        <span class="detail-value">${formatDate(medicine.expiryDate)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Progress</span>
                        <span class="detail-value">${dosesSummary}</span>
                    </div>
                </div>
                
                <div class="medicine-for">
                    <i class="fas fa-user"></i>
                    <span>${medicine.for}</span>
                </div>
                
                <div class="dosage-schedule">
                    <span>Next Dose:</span>
                    <span class="next-dose">${medicine.nextDose}</span>
                </div>
                
                <div class="medicine-actions">
                    <button class="med-action-btn btn-reminder ${reminderEnabled ? 'active' : ''}" onclick="setReminder(${medicine.id})">
                        <i class="fas fa-bell"></i>
                        <span>${reminderEnabled ? 'Reminder On' : 'Set Reminder'}</span>
                    </button>
                    <button class="med-action-btn btn-details" onclick="showMedicineDetails(${medicine.id})">
                        <i class="fas fa-info-circle"></i>
                        <span>Details</span>
                    </button>
                </div>
            `;
            return card;
        }

        function getMedicineStatusMeta(status) {
            if (status === 'over') {
                return { className: 'status-over', label: 'Over' };
            }
            if (status === 'expiring') {
                return { className: 'status-expiring', label: 'Expiring Soon' };
            }
            return { className: 'status-active', label: 'Active' };
        }

        // Load Family Members
        function loadFamilyMembers() {
            familyMembersContainer.innerHTML = '';
            
            if (familyMembers.length === 0) {
                familyMembersContainer.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-users"></i>
                        <h3>No Family Members</h3>
                        <p>Add your family members to manage their health together</p>
                    </div>
                `;
            } else {
                familyMembers.forEach(member => {
                    const familyCard = createFamilyCard(member);
                    familyMembersContainer.appendChild(familyCard);
                });
            }
            
            // Always add "Add Member" card
            const addCard = document.createElement('div');
            addCard.className = 'family-card add-family-btn';
            addCard.innerHTML = `
                <i class="fas fa-plus-circle"></i>
                <span>Add Family Member</span>
            `;
            familyMembersContainer.appendChild(addCard);
        }

        // Create Family Card
        function createFamilyCard(member) {
            const card = document.createElement('div');
            card.className = 'family-card';
            card.innerHTML = `
                <div class="member-avatar">${getInitials(member.name)}</div>
                <div class="member-name">${member.name}</div>
                <div class="member-relation">${member.relation}</div>
                <div class="member-age">${member.age} years</div>
            `;
            card.onclick = () => viewFamilyMember(member.id);
            return card;
        }

        // Get Initials
        function getInitials(name) {
            return name.split(' ').map(word => word[0]).join('').toUpperCase();
        }

        // Format Date
        function formatDate(dateString) {
            if (!dateString) return 'Not set';
            const date = new Date(dateString);
            if (Number.isNaN(date.getTime())) return 'Not set';
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        }

        // Update Counts
        function updateCounts() {
            const activeMedicines = medicines.filter(m => m.status === 'active').length;
            const completedMedicines = medicines.filter(m => m.status === 'over').length;
            const expiredMedicines = medicines.filter(m => isMedicineExpired(m)).length;
            const labelByFilter = {
                ongoing: `${activeMedicines} Ongoing`,
                completed: `${completedMedicines} Completed`,
                expired: `${expiredMedicines} Expired`,
                all: `${medicines.length} Total`
            };
            medicineCount.textContent = labelByFilter[currentMedicineFilter] || `${activeMedicines} Ongoing`;
            familyCount.textContent = `${familyMembers.length} Members`;
        }

        // Modal Functions
        function openAddMedicineModal() {
            const modal = document.getElementById('addMedicineModal');
            modal.classList.add('show');
            modal.style.display = 'flex';
        }

        function openAddMemberModal() {
            const modal = document.getElementById('addMemberModal');
            modal.classList.add('show');
            modal.style.display = 'flex';

            // Reset relation/gender defaults each time modal opens.
            const relationInput = document.getElementById('memberRelation');
            const genderInput = document.getElementById('memberGender');
            if (relationInput) relationInput.value = '';
            if (genderInput) genderInput.value = '';
        }

        function syncFamilyMemberGenderFromRelation() {
            const relationInput = document.getElementById('memberRelation');
            const genderInput = document.getElementById('memberGender');
            if (!relationInput || !genderInput) return;

            const relation = relationInput.value;
            const inferredGenderByRelation = {
                son: 'male',
                father: 'male',
                brother: 'male',
                daughter: 'female',
                mother: 'female',
                sister: 'female',
            };

            const inferred = inferredGenderByRelation[relation];
            if (inferred) {
                genderInput.value = inferred;
            }
        }

        async function openProfileModal(event) {
            if (event) event.preventDefault();
            if (!currentUserProfile) {
                await fetchUserProfile();
            }
            const modal = document.getElementById('editProfileModal');
            if (!modal) {
                showToast('Profile modal is unavailable right now', 'error');
                return;
            }
            modal.classList.add('show');
            modal.style.display = 'flex';
        }

        async function handleEditProfile(e) {
            e.preventDefault();

            const payload = {
                fullName: document.getElementById('profileFullName').value.trim(),
                gender: document.getElementById('profileGender').value,
                email: document.getElementById('profileEmail').value.trim(),
                mobile: document.getElementById('profileMobile').value.trim()
            };

            if (!payload.fullName) {
                showToast('Full name is required', 'error');
                return;
            }
            if (!payload.mobile) {
                showToast('Mobile number is required', 'error');
                return;
            }

            try {
                const response = await fetch('/user/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();

                if (!response.ok || !data.success) {
                    showToast(data.message || 'Failed to update profile', 'error');
                    return;
                }

                currentUserProfile = data.user || null;
                await fetchUserProfile();
                closeModal('editProfileModal');
                showToast('Profile updated successfully!', 'success');
            } catch (error) {
                console.error('Error updating profile:', error);
                showToast('Error updating profile', 'error');
            }
        }

        function getSettingsStorageKey() {
            return currentUserProfile && currentUserProfile.userCode
                ? 'mediassist_user_settings_' + currentUserProfile.userCode
                : 'mediassist_user_settings';
        }

        function loadUserSettings() {
            try {
                const rawSettings = localStorage.getItem(getSettingsStorageKey());
                currentUserSettings = rawSettings
                    ? { ...DEFAULT_USER_SETTINGS, ...JSON.parse(rawSettings) }
                    : { ...DEFAULT_USER_SETTINGS };
            } catch (error) {
                console.error('Error loading user settings:', error);
                currentUserSettings = { ...DEFAULT_USER_SETTINGS };
            }

            populateSettingsForm();
        }

        function populateSettingsForm() {
            const prescriptionAlerts = document.getElementById('settingsPrescriptionAlerts');
            const expiryAlerts = document.getElementById('settingsExpiryAlerts');
            const doseReminders = document.getElementById('settingsDoseReminders');

            if (prescriptionAlerts) prescriptionAlerts.checked = !!currentUserSettings.showPrescriptionAlerts;
            if (expiryAlerts) expiryAlerts.checked = !!currentUserSettings.showExpiryAlerts;
            if (doseReminders) doseReminders.checked = !!currentUserSettings.showDoseReminders;
        }

        function applyTickerAlertPreferences(alerts) {
            return (alerts || []).filter(alert => {
                if (alert.type === 'DOSE_REMINDER') return currentUserSettings.showDoseReminders;
                if (alert.type === 'PRESCRIPTION_EXPIRED' || alert.type === 'REFILL_DUE') return currentUserSettings.showPrescriptionAlerts;
                if (alert.type === 'MEDICINE_EXPIRED' || alert.type === 'MEDICINE_EXPIRY_SOON') return currentUserSettings.showExpiryAlerts;
                return true;
            });
        }

        async function openSettingsModal(event) {
            if (event) event.preventDefault();
            if (!currentUserProfile) {
                await fetchUserProfile();
            }
            loadUserSettings();
            const modal = document.getElementById('settingsModal');
            if (!modal) {
                showToast('Settings modal is unavailable right now', 'error');
                return;
            }
            modal.classList.add('show');
            modal.style.display = 'flex';
        }

        async function handleSettingsSubmit(e) {
            e.preventDefault();

            currentUserSettings = {
                showPrescriptionAlerts: document.getElementById('settingsPrescriptionAlerts').checked,
                showExpiryAlerts: document.getElementById('settingsExpiryAlerts').checked,
                showDoseReminders: document.getElementById('settingsDoseReminders').checked
            };

            try {
                localStorage.setItem(getSettingsStorageKey(), JSON.stringify(currentUserSettings));
                closeModal('settingsModal');
                await loadAlertTicker();
                if (document.getElementById('alertsSection').classList.contains('active-section')) {
                    await loadMedicineAlerts();
                }
                showToast('Settings saved successfully!', 'success');
            } catch (error) {
                console.error('Error saving settings:', error);
                showToast('Could not save settings', 'error');
            }
        }

        async function handleDeleteAccount(event) {
            if (event) event.preventDefault();

            const confirmed = confirm('Delete your account permanently? This will remove your profile and medicine history and cannot be undone.');
            if (!confirmed) {
                return;
            }

            try {
                const response = await fetch('/user/delete-account', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await response.json();

                if (!response.ok || !data.success) {
                    showToast(data.message || 'Could not delete account', 'error');
                    return;
                }

                showToast('Account deleted successfully', 'success');
                setTimeout(() => {
                    window.location.href = data.redirectUrl || '/';
                }, 500);
            } catch (error) {
                console.error('Error deleting account:', error);
                showToast('Could not delete account', 'error');
            }
        }

        function closeModal(modalId) {
            const modal = document.getElementById(modalId);
            modal.classList.remove('show');
            modal.style.display = 'none';
        }

        // Logout Handler
        function handleLogout(event) {
            event.preventDefault();
            
            if (confirm('Are you sure you want to logout?')) {
                // Redirect to logout endpoint
                window.location.href = '/auth/logout';
            }
        }

        // Form Handlers
        function handleAddMedicine(e) {
            e.preventDefault();
            
            const newMedicine = {
                id: medicines.length + 1,
                name: document.getElementById('medName').value,
                dosage: document.getElementById('medDosage').value,
                for: document.getElementById('medicineFor').selectedOptions[0].text,
                startDate: document.getElementById('medStartDate').value,
                expiryDate: document.getElementById('medExpiryDate').value,
                quantity: document.getElementById('medQuantity').value,
                frequency: document.getElementById('medFrequency').value,
                instructions: document.getElementById('medInstructions').value,
                status: 'active',
                nextDose: getNextDoseTime()
            };
            
            medicines.push(newMedicine);
            loadMedicines();
            updateCounts();
            closeModal('addMedicineModal');
            showToast('Medicine added successfully!', 'success');
            
            // Reset form
            e.target.reset();
            setupFormDates();
        }

        function handleAddMember(e) {
            e.preventDefault();

            const relationInput = document.getElementById('memberRelation');
            const genderInput = document.getElementById('memberGender');
            const nameInput = document.getElementById('memberName');
            const ageInput = document.getElementById('memberAge');

            const relationValue = relationInput ? relationInput.value : '';
            const relationLabel = relationInput && relationInput.selectedIndex >= 0
                ? relationInput.options[relationInput.selectedIndex].text
                : relationValue;
            const genderValue = genderInput ? genderInput.value : '';

            const invalidGenderByRelation = {
                son: 'female',
                father: 'female',
                brother: 'female',
                daughter: 'male',
                mother: 'male',
                sister: 'male',
            };
            if (invalidGenderByRelation[relationValue] === genderValue) {
                showToast('Selected gender does not match the chosen relationship. Please check.', 'error');
                return;
            }
            
            const newMember = {
                id: familyMembers.length + 1,
                name: nameInput ? nameInput.value.trim() : '',
                relation: relationLabel,
                age: ageInput ? ageInput.value : '',
                gender: genderValue
            };
            
            familyMembers.push(newMember);
            loadFamilyMembers();
            updateCounts();
            closeModal('addMemberModal');
            showToast('Family member added successfully!', 'success');
            
            // Reset form
            e.target.reset();
        }

        // Helper Functions
        function getNextDoseTime() {
            const times = ['08:00 AM', '09:00 AM', '01:00 PM', '06:00 PM', '08:00 PM'];
            return times[Math.floor(Math.random() * times.length)];
        }

        function getReminderStorageKey() {
            return currentUserProfile && currentUserProfile.userCode
                ? 'mediassist_medicine_reminders_' + currentUserProfile.userCode
                : 'mediassist_medicine_reminders';
        }

        function loadMedicineReminderSettings() {
            try {
                const raw = localStorage.getItem(getReminderStorageKey());
                medicineReminderSettings = raw ? JSON.parse(raw) : {};
            } catch (error) {
                console.error('Error loading reminder settings:', error);
                medicineReminderSettings = {};
            }
        }

        function saveMedicineReminderSettings() {
            try {
                localStorage.setItem(getReminderStorageKey(), JSON.stringify(medicineReminderSettings));
            } catch (error) {
                console.error('Error saving reminder settings:', error);
            }
        }

        function isReminderEnabled(medicineId) {
            return !!(medicineReminderSettings[String(medicineId)] && medicineReminderSettings[String(medicineId)].enabled);
        }

        function parseDoseTimeToDate(nextDoseText) {
            if (!nextDoseText || nextDoseText === 'As needed') {
                return null;
            }

            const now = new Date();
            let target = null;

            const tomorrowMatch = nextDoseText.match(/^Tomorrow\s+(\d{2}):(\d{2})$/i);
            if (tomorrowMatch) {
                target = new Date(now);
                target.setDate(target.getDate() + 1);
                target.setHours(Number(tomorrowMatch[1]), Number(tomorrowMatch[2]), 0, 0);
                return target;
            }

            const hhmmMatch = nextDoseText.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
            if (!hhmmMatch) {
                return null;
            }

            let hours = Number(hhmmMatch[1]);
            const minutes = Number(hhmmMatch[2]);
            const ampm = hhmmMatch[3] ? hhmmMatch[3].toUpperCase() : null;

            if (ampm === 'PM' && hours < 12) hours += 12;
            if (ampm === 'AM' && hours === 12) hours = 0;

            target = new Date(now);
            target.setHours(hours, minutes, 0, 0);
            if (target <= now) {
                target.setDate(target.getDate() + 1);
            }
            return target;
        }

        function scheduleReminderNotification(medicine) {
            if (medicine.status === 'over') {
                return;
            }

            const key = String(medicine.id);
            const existingTimer = reminderTimerHandles.get(key);
            if (existingTimer) {
                clearTimeout(existingTimer);
                reminderTimerHandles.delete(key);
            }

            if (!isReminderEnabled(medicine.id)) {
                return;
            }

            const target = parseDoseTimeToDate(medicine.nextDose);
            if (!target) {
                return;
            }

            const delay = target.getTime() - Date.now();
            if (delay <= 0) {
                return;
            }

            const timer = setTimeout(() => {
                const title = 'MediAssist Reminder';
                const message = `Time to take ${medicine.name}${medicine.dosage ? ' (' + medicine.dosage + ')' : ''}`;

                if (window.Notification && Notification.permission === 'granted') {
                    new Notification(title, { body: message });
                }
                showToast(message, 'info');
                reminderTimerHandles.delete(key);
            }, delay);

            reminderTimerHandles.set(key, timer);
        }

        function showNotifications() {
            showSection('alerts', document.querySelector('.notification-btn'));
        }

        function setReminder(medicineId) {
            const medicine = medicines.find(m => m.id === medicineId);
            if (!medicine) {
                showToast('Medicine not found', 'error');
                return;
            }

            const key = String(medicineId);
            const currentlyEnabled = isReminderEnabled(medicineId);

            if (currentlyEnabled) {
                const disable = confirm(`Turn off reminder for ${medicine.name}?`);
                if (!disable) return;

                medicineReminderSettings[key] = { enabled: false, updatedAt: new Date().toISOString() };
                saveMedicineReminderSettings();

                const timer = reminderTimerHandles.get(key);
                if (timer) {
                    clearTimeout(timer);
                    reminderTimerHandles.delete(key);
                }

                loadMedicines();
                showToast(`Reminder turned off for ${medicine.name}`, 'success');
                return;
            }

            medicineReminderSettings[key] = { enabled: true, updatedAt: new Date().toISOString() };
            saveMedicineReminderSettings();

            if (window.Notification && Notification.permission === 'default') {
                Notification.requestPermission().catch(() => {});
            }

            scheduleReminderNotification(medicine);
            loadMedicines();
            showToast(`Reminder is on for ${medicine.name}`, 'success');
        }

        function ensureMedicineDetailsModal() {
            let modal = document.getElementById('medicineDetailsModal');
            if (modal) return modal;

            modal = document.createElement('div');
            modal.id = 'medicineDetailsModal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width:560px;">
                    <div class="modal-header">
                        <h2 class="modal-title"><i class="fas fa-info-circle"></i> Medicine Details</h2>
                        <button class="close-modal" onclick="closeModal('medicineDetailsModal')">&times;</button>
                    </div>
                    <div class="modal-body" id="medicineDetailsContent"></div>
                </div>
            `;

            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    closeModal('medicineDetailsModal');
                }
            });

            document.body.appendChild(modal);
            return modal;
        }

        async function showMedicineDetails(medicineId) {
            const fallbackMedicine = medicines.find(m => m.id === medicineId);
            if (!fallbackMedicine) {
                showToast('Medicine not found', 'error');
                return;
            }

            let medicineData = null;
            try {
                const response = await fetch(`/user/medicines/${medicineId}`);
                const data = await response.json();
                if (response.ok && data.success && data.medicine) {
                    medicineData = data.medicine;
                }
            } catch (error) {
                console.error('Error fetching medicine details:', error);
            }

            const modal = ensureMedicineDetailsModal();
            const content = document.getElementById('medicineDetailsContent');
            const med = medicineData || {
                medicineName: fallbackMedicine.name,
                dosage: fallbackMedicine.dosage,
                prescribedFor: fallbackMedicine.for,
                quantity: fallbackMedicine.quantity,
                endDate: fallbackMedicine.expiryDate,
                instructions: fallbackMedicine.instructions,
                prescribedBy: fallbackMedicine.prescribedBy || 'Doctor',
                startDate: fallbackMedicine.startDate,
                isActive: true
            };

            const expiry = med.endDate ? formatDate(med.endDate) : 'Not set';
            const startDate = med.startDate ? formatDate(med.startDate) : 'Not set';
            content.innerHTML = `
                <div style="display:grid;gap:12px;">
                    <div><strong>Medicine:</strong> ${med.medicineName || fallbackMedicine.name}</div>
                    <div><strong>Dosage:</strong> ${med.dosage || 'As prescribed'}</div>
                    <div><strong>Prescribed For:</strong> ${med.prescribedFor || fallbackMedicine.for || 'Self'}</div>
                    <div><strong>Prescribed By:</strong> ${med.prescribedBy || 'Doctor'}</div>
                    <div><strong>Quantity:</strong> ${med.quantity || fallbackMedicine.quantity || 'As needed'}</div>
                    <div><strong>Start Date:</strong> ${startDate}</div>
                    <div><strong>Expiry Date:</strong> ${expiry}</div>
                    <div><strong>Next Dose:</strong> ${fallbackMedicine.nextDose || 'As needed'}</div>
                    <div><strong>Status:</strong> ${med.isActive ? 'Active' : 'Inactive'}</div>
                    <div><strong>Instructions:</strong> ${med.instructions || 'No additional instructions'}</div>
                </div>
                <div class="form-actions" style="margin-top:20px;">
                    <button type="button" class="modal-btn modal-btn-secondary" onclick="removeMedicine(${medicineId})" style="background:#fff1f2;color:#b42318;border:1px solid #fda4af;">
                        <i class="fas fa-trash-alt"></i><span>Remove Medicine</span>
                    </button>
                    <button type="button" class="modal-btn modal-btn-secondary" onclick="closeModal('medicineDetailsModal')">
                        <i class="fas fa-times"></i><span>Close</span>
                    </button>
                </div>
            `;

            modal.classList.add('show');
            modal.style.display = 'flex';
        }

        async function removeMedicine(medicineId) {
            const medicine = medicines.find(m => m.id === medicineId);
            if (!medicine) {
                showToast('Medicine not found', 'error');
                return;
            }

            const confirmed = confirm(`Remove ${medicine.name} from your active medicines list?`);
            if (!confirmed) {
                return;
            }

            try {
                const response = await fetch(`/user/medicines/${medicineId}`, { method: 'DELETE' });
                const data = await response.json();

                if (!response.ok || !data.success) {
                    showToast(data.message || 'Could not remove medicine', 'error');
                    return;
                }

                medicines = medicines.filter(m => m.id !== medicineId);
                delete medicineReminderSettings[String(medicineId)];
                saveMedicineReminderSettings();

                const timer = reminderTimerHandles.get(String(medicineId));
                if (timer) {
                    clearTimeout(timer);
                    reminderTimerHandles.delete(String(medicineId));
                }

                displayMedicines();
                await loadAlertTicker();
                showToast(data.message || 'Medicine removed successfully', 'success');
            } catch (error) {
                console.error('Error removing medicine:', error);
                showToast('Network error while removing medicine', 'error');
            }
        }

        function viewFamilyMember(memberId) {
            const member = familyMembers.find(m => m.id === memberId);
            if (member) {
                showToast(`Viewing ${member.name}'s profile`, 'info');
            }
        }

        // Toast Notification
        function showToast(message, type = 'success') {
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerHTML = `
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            `;
            
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.style.animation = 'slideOutRight 0.3s ease forwards';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
            
            // Add slide out animation
            if (!document.querySelector('#toast-animations')) {
                const style = document.createElement('style');
                style.id = 'toast-animations';
                style.textContent = `
                    @keyframes slideOutRight {
                        from { transform: translateX(0); opacity: 1; }
                        to { transform: translateX(100%); opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }
        }

        // Responsive adjustments
        window.addEventListener('resize', function() {
            if (window.innerWidth >= 768) {
                document.querySelector('.sidebar').style.display = 'flex';
            } else {
                document.querySelector('.sidebar').style.display = 'none';
            }
        });

        // Initial responsive check
        if (window.innerWidth < 768) {
            document.querySelector('.sidebar').style.display = 'none';
        }

        // Password Change Modal
        const passwordChangeModal = document.createElement('div');
        passwordChangeModal.id = 'passwordChangeModal';
        passwordChangeModal.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 2000;
            justify-content: center;
            align-items: center;
        `;
        passwordChangeModal.innerHTML = `
            <div style="background: white; padding: 30px; border-radius: 12px; max-width: 400px; width: 90%; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <button type="button" onclick="closePasswordChangeModal()" style="float:right;background:none;border:none;font-size:1.4rem;line-height:1;color:#6b7280;cursor:pointer;">&times;</button>
                <h2 style="margin-top: 0; color: var(--primary); text-align: center;">Change Password</h2>
                <p id="passwordChangeMessage" style="text-align: center; color: #666; margin-bottom: 25px;">This is your first login. Please set a new password for your account.</p>
                <form id="passwordChangeForm" style="display: flex; flex-direction: column; gap: 15px;">
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">New Password:</label>
                        <input type="password" id="newPassword" placeholder="Enter new password" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;" required>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Confirm Password:</label>
                        <input type="password" id="confirmPassword" placeholder="Confirm password" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;" required>
                    </div>
                    <button type="submit" style="background: var(--primary); color: white; border: none; padding: 12px; border-radius: 6px; font-size: 16px; font-weight: 600; cursor: pointer;">Change Password</button>
                    <button type="button" onclick="closePasswordChangeModal()" style="background:#eef4f8;color:#1d3f59;border:none;padding:12px;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer;">Cancel</button>
                </form>
            </div>
        `;
        document.body.appendChild(passwordChangeModal);

        function openPasswordChangeModal(event) {
            if (event) event.preventDefault();
            const message = document.getElementById('passwordChangeMessage');
            if (message) {
                message.textContent = 'Update your account password anytime from settings.';
            }
            closeModal('settingsModal');
            passwordChangeModal.style.display = 'flex';
        }

        function closePasswordChangeModal() {
            passwordChangeModal.style.display = 'none';
        }

        // Handle password change form submission
        document.getElementById('passwordChangeForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (!newPassword || !confirmPassword) {
                showToast('Both fields are required', 'error');
                return;
            }

            if (newPassword !== confirmPassword) {
                showToast('Passwords do not match', 'error');
                return;
            }

            try {
                const response = await fetch('/user/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newPassword, confirmPassword })
                });
                const data = await response.json();

                if (data.success) {
                    showToast('Password changed successfully!', 'success');
                    closePasswordChangeModal();
                } else {
                    showToast(data.message || 'Failed to change password', 'error');
                }
            } catch (error) {
                showToast('Error changing password', 'error');
            }
        });

        // Check if user needs to change password on page load
        async function checkPasswordChangeRequired() {
            try {
                const response = await fetch('/user/profile');
                const data = await response.json();

                if (data.success && data.user && data.user.mustChangePassword) {
                    const message = document.getElementById('passwordChangeMessage');
                    if (message) {
                        message.textContent = 'This is your first login. Please set a new password for your account.';
                    }
                    passwordChangeModal.style.display = 'flex';
                }
            } catch (error) {
                console.error('Error checking password status:', error);
            }
        }

        // Call password check after fetching user profile
        checkPasswordChangeRequired();

    
