
        /* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
           SECTION NAVIGATION
        ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */
        function showSection(sectionName, clickedNavItem) {
            const targetMap = {
                'dashboard': 'dashboardSection',
                'reports':   'reportsSection',
                'health':    'healthSection',
                'alerts':    'alertsSection'
            };

            // Force-hide ALL feature sections first
            document.querySelectorAll('.feature-section').forEach(s => {
                s.classList.remove('active-section');
                s.style.display = 'none';
            });

            // Force-show target section
            const target = document.getElementById(targetMap[sectionName]);
            if (target) {
                target.classList.add('active-section');
                target.style.display = 'block';
                target.style.animation = 'none';
                // trigger reflow to restart animation
                void target.offsetHeight;
                target.style.animation = 'sectionFadeIn 0.4s ease';
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }

            // Update nav active states
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            if (clickedNavItem) clickedNavItem.classList.add('active');

            // Close sidebar on mobile
            if (window.innerWidth < 768) {
                try { closeSidebar(); } catch(e) {}
            }

            // Lazy-init sections on first visit
            if (sectionName === 'reports') initReportsSection();
            if (sectionName === 'health')   initHealthSection();
            if (sectionName === 'alerts')   initAlertsSection();
        }

        // On page load, make sure only dashboardSection is visible
        document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('.feature-section').forEach(s => {
                s.style.display = 'none';
            });
            const dash = document.getElementById('dashboardSection');
            if (dash) dash.style.display = 'block';
        });

        /* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
           ΓöÇΓöÇΓöÇ MEDICINE ALERTS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
        ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */

        let alertsInitialized = false;

        function initAlertsSection() {
            if (alertsInitialized) return;
            alertsInitialized = true;
            loadMedicineAlerts();
        }

        async function loadMedicineAlerts() {
            const list = document.getElementById('alertsList');
            const summary = document.getElementById('alertsSummary');
            if (!list) return;

            list.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><h3>Loading...</h3></div>';
            if (summary) summary.style.display = 'none';

            try {
                const response = await fetch('/user/medicine-alerts');
                const data = await response.json();

                if (!data.success) {
                    list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>Could not load alerts</h3><p>' + (data.message || 'Please try again.') + '</p></div>';
                    return;
                }

                const alerts = data.alerts || [];

                // Summary bar
                if (summary && alerts.length > 0) {
                    const critical  = alerts.filter(a => a.severity === 'CRITICAL').length;
                    const high      = alerts.filter(a => a.severity === 'HIGH').length;
                    const medium    = alerts.filter(a => a.severity === 'MEDIUM').length;
                    const low       = alerts.filter(a => a.severity === 'LOW').length;
                    let summaryHtml = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">';
                    if (critical) summaryHtml += '<span style="background:#fde8e8;color:#b91c1c;border:1px solid #fca5a5;border-radius:999px;padding:5px 12px;font-weight:700;font-size:0.82rem;"><i class="fas fa-exclamation-triangle"></i> ' + critical + ' Critical</span>';
                    if (high)     summaryHtml += '<span style="background:#fff3de;color:#92400e;border:1px solid #fcd34d;border-radius:999px;padding:5px 12px;font-weight:700;font-size:0.82rem;"><i class="fas fa-exclamation-circle"></i> ' + high + ' High</span>';
                    if (medium)   summaryHtml += '<span style="background:#e0f2fe;color:#0369a1;border:1px solid #7dd3fc;border-radius:999px;padding:5px 12px;font-weight:700;font-size:0.82rem;"><i class="fas fa-info-circle"></i> ' + medium + ' Medium</span>';
                    if (low)      summaryHtml += '<span style="background:#dcfce7;color:#166534;border:1px solid #86efac;border-radius:999px;padding:5px 12px;font-weight:700;font-size:0.82rem;"><i class="fas fa-capsules"></i> ' + low + ' Reminder' + (low > 1 ? 's' : '') + '</span>';
                    summaryHtml += '</div>';
                    summary.innerHTML = summaryHtml;
                    summary.style.display = 'block';
                }

                renderMedicineAlerts(alerts);
            } catch (err) {
                console.error('Error loading alerts:', err);
                if (list) list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>Error Loading Alerts</h3><p>Please check your connection and try again.</p></div>';
            }
        }

        function renderMedicineAlerts(alerts) {
            const list = document.getElementById('alertsList');
            if (!list) return;

            if (alerts.length === 0) {
                list.innerHTML = '<div class="empty-state" style="border:1px dashed #c8e6c9;background:#f1f8f2;"><i class="fas fa-check-circle" style="color:#3ca66b;"></i><h3 style="color:#2d6a4f;">All Clear!</h3><p style="color:#52796f;">You have no active medicine alerts. Stay healthy!</p></div>';
                return;
            }

            const severityConfig = {
                CRITICAL: { bg: '#fff5f5', border: '#feb2b2', badge: '#b91c1c', badgeBg: '#fde8e8', label: 'Critical' },
                HIGH:     { bg: '#fffbeb', border: '#fcd34d', badge: '#92400e', badgeBg: '#fff3de', label: 'High' },
                MEDIUM:   { bg: '#f0f9ff', border: '#7dd3fc', badge: '#0369a1', badgeBg: '#e0f2fe', label: 'Medium' },
                LOW:      { bg: '#f0fdf4', border: '#86efac', badge: '#166534', badgeBg: '#dcfce7', label: 'Reminder' }
            };

            list.innerHTML = alerts.map(alert => {
                const cfg = severityConfig[alert.severity] || severityConfig.MEDIUM;
                return '<div style="border:1px solid ' + cfg.border + ';border-radius:14px;background:' + cfg.bg + ';padding:14px 16px;margin-bottom:12px;display:flex;gap:14px;align-items:flex-start;">'
                    + '<div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,' + alert.color + ',' + alert.color + '88);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.1rem;flex-shrink:0;"><i class="' + alert.icon + '"></i></div>'
                    + '<div style="flex:1;">'
                    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px;">'
                    + '<strong style="font-size:0.97rem;color:#1d3f59;">' + alert.medicine + '</strong>'
                    + '<span style="background:' + cfg.badgeBg + ';color:' + cfg.badge + ';border:1px solid ' + cfg.border + ';border-radius:999px;padding:3px 10px;font-weight:700;font-size:0.74rem;">' + cfg.label + '</span>'
                    + '</div>'
                    + '<p style="margin:0;font-size:0.88rem;color:#37566e;line-height:1.5;">' + alert.message + '</p>'
                    + '</div></div>';
            }).join('');
        }

        /* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
           ΓöÇΓöÇΓöÇ MEDICAL REPORT ANALYSIS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
        ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */

        let healthReports = JSON.parse(localStorage.getItem('mediassist_reports') || '[]');
        let reportsInitialized = false;

        const REPORT_TYPE_META = {
            blood_sugar:    { label: 'Blood Sugar Test',    icon: 'fas fa-tint',          color: '#DC3545' },
            blood_pressure: { label: 'Blood Pressure',      icon: 'fas fa-heartbeat',     color: '#2A5C82' },
            cholesterol:    { label: 'Cholesterol Panel',   icon: 'fas fa-vial',          color: '#6F42C1' },
            bmi:            { label: 'BMI / Weight Check',  icon: 'fas fa-weight',        color: '#28A745' },
            complete_blood: { label: 'Complete Blood Count',icon: 'fas fa-flask',         color: '#FD7E14' },
            general:        { label: 'General Health Check',icon: 'fas fa-stethoscope',   color: '#00A8A8' }
        };

        function initReportsSection() {
            if (reportsInitialized) { renderReports(); return; }
            reportsInitialized = true;
            // Setup form
            document.getElementById('logReportForm').addEventListener('submit', handleLogReport);
            // Set today's date
            document.getElementById('reportDate').value = new Date().toISOString().split('T')[0];
            renderReports();
            updateMetricsSummary();
        }

        function openLogReportModal() {
            const modal = document.getElementById('logReportModal');
            modal.classList.add('show');
            modal.style.display = 'flex';
            // reset fields
            document.querySelectorAll('.report-fields').forEach(f => f.style.display = 'none');
            document.getElementById('reportType').value = '';
            document.getElementById('reportDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('reportNotes').value = '';
            document.getElementById('reportDoctor').value = '';
        }

        function toggleReportFields() {
            const type = document.getElementById('reportType').value;
            document.querySelectorAll('.report-fields').forEach(f => f.style.display = 'none');
            const fieldMap = {
                blood_sugar:   'bloodSugarFields',
                blood_pressure:'bpFields',
                cholesterol:   'cholFields',
                bmi:           'bmiFields',
                complete_blood:'generalFields',
                general:       'generalFields'
            };
            if (fieldMap[type]) document.getElementById(fieldMap[type]).style.display = 'block';
        }

        function handleLogReport(e) {
            e.preventDefault();
            const type     = document.getElementById('reportType').value;
            const date     = document.getElementById('reportDate').value;
            const notes    = document.getElementById('reportNotes').value.trim();
            const doctor   = document.getElementById('reportDoctor').value.trim();
            const meta     = REPORT_TYPE_META[type] || {};
            let values = {};

            if (type === 'blood_sugar') {
                values = {
                    'Fasting BS': document.getElementById('fastingBs').value + ' mg/dL',
                    'Post-Meal BS': document.getElementById('ppBs').value + ' mg/dL'
                };
            } else if (type === 'blood_pressure') {
                const sys = document.getElementById('bpSystolic').value;
                const dia = document.getElementById('bpDiastolic').value;
                values = { 'Systolic': sys + ' mmHg', 'Diastolic': dia + ' mmHg' };
            } else if (type === 'cholesterol') {
                values = {
                    'Total': document.getElementById('cholTotal').value + ' mg/dL',
                    'LDL': document.getElementById('cholLdl').value + ' mg/dL'
                };
            } else if (type === 'bmi') {
                const w = parseFloat(document.getElementById('weight').value);
                const h = parseFloat(document.getElementById('height').value) / 100;
                const bmi = h > 0 ? (w / (h * h)).toFixed(1) : '\u2014';
                values = { 'Weight': w + ' kg', 'BMI': bmi };
            } else {
                const l1 = document.getElementById('gen1Label').value;
                const v1 = document.getElementById('gen1Value').value;
                const l2 = document.getElementById('gen2Label').value;
                const v2 = document.getElementById('gen2Value').value;
                if (l1 && v1) values[l1] = v1;
                if (l2 && v2) values[l2] = v2;
            }

            const report = {
                id: Date.now(),
                type, date, values, notes, doctor,
                label: meta.label || type,
                icon: meta.icon || 'fas fa-file-medical',
                color: meta.color || '#2A5C82'
            };

            healthReports.unshift(report);
            localStorage.setItem('mediassist_reports', JSON.stringify(healthReports));
            renderReports();
            updateMetricsSummary();
            closeModal('logReportModal');
            showToast('Health report saved successfully!', 'success');
        }

        function renderReports() {
            const grid = document.getElementById('reportsGrid');
            const empty = document.getElementById('reportsEmptyState');
            if (!grid) return;

            // Remove old cards (preserve empty state element)
            Array.from(grid.children).forEach(c => { if (!c.id) c.remove(); });

            if (healthReports.length === 0) {
                if (empty) empty.style.display = '';
                return;
            }
            if (empty) empty.style.display = 'none';

            healthReports.forEach(report => {
                const card = document.createElement('div');
                card.className = 'report-card';
                const valueItems = Object.entries(report.values || {}).map(([k, v]) => `
                    <div class="report-value-item">
                        <div class="report-value-label">${k}</div>
                        <div class="report-value-num">${v}</div>
                    </div>`).join('');
                const dateFormatted = new Date(report.date).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric'
                });
                card.innerHTML = `
                    <div class="report-card-header">
                        <div class="report-type-icon" style="background:linear-gradient(135deg,${report.color},${report.color}99)">
                            <i class="${report.icon}"></i>
                        </div>
                        <div class="report-card-meta">
                            <h4>${report.label}</h4>
                            <span>${report.doctor || 'Self-logged'}</span>
                        </div>
                    </div>
                    ${valueItems ? `<div class="report-card-values">${valueItems}</div>` : ''}
                    ${report.notes ? `<div class="report-card-notes">${report.notes}</div>` : ''}
                    <div class="report-card-footer">
                        <span class="report-date-tag"><i class="fas fa-calendar-alt"></i> ${dateFormatted}</span>
                        <div class="report-action-btns">
                            <button class="report-btn report-btn-del" onclick="deleteReport(${report.id})">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>`;
                grid.appendChild(card);
            });
        }

        function deleteReport(id) {
            if (!confirm('Delete this report?')) return;
            healthReports = healthReports.filter(r => r.id !== id);
            localStorage.setItem('mediassist_reports', JSON.stringify(healthReports));
            renderReports();
            updateMetricsSummary();
            showToast('Report deleted.', 'success');
        }

        function updateMetricsSummary() {
            // Blood Sugar
            const bsReport = healthReports.find(r => r.type === 'blood_sugar');
            if (bsReport && bsReport.values) {
                const fasting = parseFloat(Object.values(bsReport.values)[0]);
                if (!isNaN(fasting)) {
                    document.getElementById('metricBloodSugar').textContent = fasting + ' mg/dL';
                    const card = document.getElementById('metricBloodSugar').closest('.metric-card');
                    const badge = document.getElementById('metricBSStatus');
                    if (fasting < 100) { card.className = 'metric-card normal'; badge.textContent = 'Normal'; }
                    else if (fasting < 126) { card.className = 'metric-card warning'; badge.textContent = 'Pre-Diabetic'; }
                    else { card.className = 'metric-card danger'; badge.textContent = 'High'; }
                }
            }
            // BP
            const bpReport = healthReports.find(r => r.type === 'blood_pressure');
            if (bpReport && bpReport.values) {
                const vals = Object.values(bpReport.values);
                const sys = parseFloat(vals[0]);
                const dia = parseFloat(vals[1]);
                if (!isNaN(sys) && !isNaN(dia)) {
                    document.getElementById('metricBP').textContent = sys + '/' + dia;
                    const card = document.getElementById('metricBP').closest('.metric-card');
                    const badge = document.getElementById('metricBPStatus');
                    if (sys < 120 && dia < 80) { card.className = 'metric-card normal'; badge.textContent = 'Normal'; }
                    else if (sys < 130) { card.className = 'metric-card warning'; badge.textContent = 'Elevated'; }
                    else { card.className = 'metric-card danger'; badge.textContent = 'High'; }
                }
            }
            // BMI
            const bmiReport = healthReports.find(r => r.type === 'bmi');
            if (bmiReport && bmiReport.values) {
                const bmiVals = Object.values(bmiReport.values);
                const bmi = parseFloat(bmiVals[1] || bmiVals[0]);
                if (!isNaN(bmi)) {
                    document.getElementById('metricBMI').textContent = bmi;
                    const card = document.getElementById('metricBMI').closest('.metric-card');
                    const badge = document.getElementById('metricBMIStatus');
                    if (bmi < 18.5) { card.className = 'metric-card warning'; badge.textContent = 'Underweight'; }
                    else if (bmi < 25) { card.className = 'metric-card normal'; badge.textContent = 'Normal'; }
                    else if (bmi < 30) { card.className = 'metric-card warning'; badge.textContent = 'Overweight'; }
                    else { card.className = 'metric-card danger'; badge.textContent = 'Obese'; }
                }
            }
            // Cholesterol
            const cholReport = healthReports.find(r => r.type === 'cholesterol');
            if (cholReport && cholReport.values) {
                const cholVals = Object.values(cholReport.values);
                const chol = parseFloat(cholVals[0]);
                if (!isNaN(chol)) {
                    document.getElementById('metricCholesterol').textContent = chol + ' mg/dL';
                    const card = document.getElementById('metricCholesterol').closest('.metric-card');
                    const badge = document.getElementById('metricCholStatus');
                    if (chol < 200) { card.className = 'metric-card normal'; badge.textContent = 'Desirable'; }
                    else if (chol < 240) { card.className = 'metric-card warning'; badge.textContent = 'Borderline'; }
                    else { card.className = 'metric-card danger'; badge.textContent = 'High'; }
                }
            }
        }

        /* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
           ΓöÇΓöÇΓöÇ HEALTH MONITORING SYSTEM ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
        ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */

        // ΓöÇΓöÇΓöÇ Conditions Knowledge Base ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
        const CONDITIONS_DB = [
            {
                name: 'Fever',
                icon: '≡ƒñÆ',
                description: 'Elevated body temperature usually caused by an infection or inflammation.',
                severity: 55,
                severityText: 'Moderate',
                keywords: ['fever', 'high temperature', 'chills', 'sweating', 'body ache', 'shivering', 'hot skin'],
                remedies: [
                    { icon: 'fas fa-mug-hot', title: 'Ginger & Honey Tea', desc: 'Boil ginger in water, add honey. Drink 2-3 times daily to reduce fever.' },
                    { icon: 'fas fa-tint', title: 'Stay Hydrated', desc: 'Drink plenty of water, ORS, coconut water, or clear soups every hour.' },
                    { icon: 'fas fa-bed', title: 'Complete Bed Rest', desc: 'Rest in a cool, well-ventilated room. Avoid strenuous activities.' },
                    { icon: 'fas fa-compress-arrows-alt', title: 'Cold Compress', desc: 'Apply a cool, damp cloth on forehead and wrists to bring temperature down.' },
                    { icon: 'fas fa-leaf', title: 'Tulsi & Black Pepper', desc: 'Boil 10 Tulsi leaves + 5 black pepper corns. Strain and drink warm.' }
                ],
                activities: [
                    { icon: 'fas fa-bed',       title: 'Complete Bed Rest' },
                    { icon: 'fas fa-glass-water',title: 'Drink every 30 min' },
                    { icon: 'fas fa-wind',        title: 'Stay in cool room' },
                    { icon: 'fas fa-ban',         title: 'Avoid spicy food' }
                ],
                warnings: [
                    'Fever above 103°F (39.4°C) — seek medical attention immediately',
                    'Fever lasting more than 3 days without improvement',
                    'Fever accompanied by severe headache, stiff neck, or rash',
                    'Fever in infants under 3 months — always consult a doctor'
                ]
            },
            {
                name: 'Common Cold',
                icon: '≡ƒñº',
                description: 'A viral infection of the upper respiratory tract causing nasal symptoms and mild discomfort.',
                severity: 30,
                severityText: 'Mild',
                keywords: ['runny nose', 'sneezing', 'sore throat', 'congestion', 'stuffy nose', 'nasal discharge', 'mild cough'],
                remedies: [
                    { icon: 'fas fa-mug-hot', title: 'Steam Inhalation', desc: 'Inhale steam from hot water with Vicks/eucalyptus oil for 10 mins, 3x/day.' },
                    { icon: 'fas fa-lemon', title: 'Vitamin C Boost', desc: 'Eat oranges, amla, or take Vitamin C supplements to boost immunity.' },
                    { icon: 'fas fa-pepper-hot', title: 'Garlic Soup', desc: 'Boil crushed garlic in hot broth. Garlic has strong antiviral properties.' },
                    { icon: 'fas fa-tint', title: 'Saltwater Gargle', desc: 'Gargle with warm saltwater 3-4 times daily to soothe throat.' },
                    { icon: 'fas fa-honey-pot', title: 'Tulsi & Honey', desc: 'Mix Tulsi juice with raw honey. Take 1 tsp twice daily.' }
                ],
                activities: [
                    { icon: 'fas fa-bed',      title: 'Adequate sleep (8h+)' },
                    { icon: 'fas fa-walking',  title: 'Short gentle walks' },
                    { icon: 'fas fa-wind',     title: 'Fresh air ventilation' },
                    { icon: 'fas fa-hands-wash', title: 'Wash hands frequently' }
                ],
                warnings: [
                    'Symptoms lasting more than 10 days — may be bacterial',
                    'High fever (above 103°F) alongside cold symptoms',
                    'Difficulty breathing or wheezing',
                    'Ear pain or severe sinus pressure'
                ]
            },
            {
                name: 'Headache',
                icon: '≡ƒÿú',
                description: 'Pain or discomfort in the head, scalp, or neck — often tension or migraine related.',
                severity: 40,
                severityText: 'Moderate',
                keywords: ['headache', 'head pain', 'migraine', 'throbbing', 'head pressure', 'dizziness', 'light sensitivity'],
                remedies: [
                    { icon: 'fas fa-spa', title: 'Peppermint Oil Massage', desc: 'Apply diluted peppermint oil to temples and forehead. Has cooling effect.' },
                    { icon: 'fas fa-tint', title: 'Hydrate Immediately', desc: 'Dehydration is a common cause. Drink 2-3 glasses of water right away.' },
                    { icon: 'fas fa-mug-hot', title: 'Ginger Tea', desc: 'Ginger reduces inflammation. Drink warm ginger tea to relieve pain.' },
                    { icon: 'fas fa-compress', title: 'Cold/Hot Compress', desc: 'Cold pack for migraine; warm pack for tension headache on neck/shoulders.' },
                    { icon: 'fas fa-leaf', title: 'Clove & Salt', desc: 'Inhale crushed cloves in a cloth. Clove has pain-relieving eugenol.' }
                ],
                activities: [
                    { icon: 'fas fa-eye-slash',   title: 'Rest in dark quiet room' },
                    { icon: 'fas fa-head-side',   title: 'Neck stretches' },
                    { icon: 'fas fa-massage',     title: 'Temple massage' },
                    { icon: 'fas fa-mobile-alt',  title: 'Reduce screen time' }
                ],
                warnings: [
                    'Sudden severe "thunderclap" headache — call emergency services',
                    'Headache with fever, stiff neck, and confusion',
                    'Headache after a head injury',
                    'Worsening headache that doesn\'t respond to any remedies after 24h'
                ]
            },
            {
                name: 'Stomach Upset / Indigestion',
                icon: '≡ƒñó',
                description: 'Discomfort in the stomach including nausea, bloating, and indigestion.',
                severity: 35,
                severityText: 'Mild-Moderate',
                keywords: ['stomach pain', 'nausea', 'vomiting', 'bloating', 'indigestion', 'gas', 'acidity', 'heartburn', 'upset stomach'],
                remedies: [
                    { icon: 'fas fa-leaf', title: 'Jeera (Cumin) Water', desc: 'Boil 1 tsp cumin seeds in water. Drink warm to relieve bloating and gas.' },
                    { icon: 'fas fa-mug-hot', title: 'Ginger Lemon Tea', desc: 'Mix ginger juice + lemon juice + honey in warm water. Drink slowly.' },
                    { icon: 'fas fa-apple-alt', title: 'BRAT Diet', desc: 'Banana, Rice, Applesauce, Toast — bland foods that are gentle on the stomach.' },
                    { icon: 'fas fa-fire', title: 'Ajwain (Carom Seeds)', desc: 'Chew 1/2 tsp ajwain with a pinch of salt for immediate gas and acidity relief.' },
                    { icon: 'fas fa-glass-water', title: 'Coconut Water', desc: 'Rehydrates naturally and soothes the digestive system.' }
                ],
                activities: [
                    { icon: 'fas fa-walking',  title: 'Gentle 10-min walk' },
                    { icon: 'fas fa-ban',      title: 'Avoid heavy/spicy food' },
                    { icon: 'fas fa-chair',    title: 'Sit upright after meals' },
                    { icon: 'fas fa-spa',      title: 'Gentle belly massage' }
                ],
                warnings: [
                    'Severe abdominal pain that doesn\'t subside after 2 hours',
                    'Blood in vomit or stool',
                    'Signs of dehydration: dry mouth, no urination, dark urine',
                    'Persistent vomiting for more than 24 hours'
                ]
            },
            {
                name: 'Cough',
                icon: '≡ƒÿ«ΓÇì≡ƒÆ¿',
                description: 'Cough can be dry or productive, often caused by irritation, infection, or allergies.',
                severity: 35,
                severityText: 'Mild',
                keywords: ['cough', 'dry cough', 'wet cough', 'chest congestion', 'mucus', 'phlegm', 'wheezing'],
                remedies: [
                    { icon: 'fas fa-honey-pot', title: 'Honey & Ginger', desc: 'Mix 1 tsp honey with few drops of ginger juice. Take 3x daily.' },
                    { icon: 'fas fa-mug-hot', title: 'Turmeric Milk', desc: 'Golden milk (turmeric + warm milk) before bed soothes chest and throat.' },
                    { icon: 'fas fa-leaf', title: 'Tulsi Decoction', desc: 'Boil Tulsi leaves, ginger, black pepper, and cloves. Strain and drink warm.' },
                    { icon: 'fas fa-wind', title: 'Steam Inhalation', desc: 'Inhale steam with a few drops of eucalyptus oil to loosen chest congestion.' },
                    { icon: 'fas fa-lemon', title: 'Lemon Salt Warm Water', desc: 'A glass of warm water with lemon juice and a pinch of salt helps soothe.' }
                ],
                activities: [
                    { icon: 'fas fa-bed',        title: 'Rest & sleep well' },
                    { icon: 'fas fa-lungs',      title: 'Deep breathing exercises' },
                    { icon: 'fas fa-ban',        title: 'Avoid cold beverages' },
                    { icon: 'fas fa-hands-wash', title: 'Cover mouth when coughing' }
                ],
                warnings: [
                    'Cough lasting more than 3 weeks',
                    'Coughing up blood',
                    'Cough with high fever and difficulty breathing',
                    'Cough causing chest pain or shortness of breath'
                ]
            },
            {
                name: 'Body Pain & Fatigue',
                icon: '≡ƒÿ⌐',
                description: 'General body aches and exhaustion, often from viral illness, overexertion, or stress.',
                severity: 40,
                severityText: 'Moderate',
                keywords: ['body ache', 'muscle pain', 'fatigue', 'tiredness', 'weakness', 'joint pain', 'exhaustion', 'lethargy'],
                remedies: [
                    { icon: 'fas fa-hot-tub', title: 'Epsom Salt Bath', desc: 'Soak in warm water with 2 cups epsom salt for 20 mins to relax muscles.' },
                    { icon: 'fas fa-leaf', title: 'Ashwagandha', desc: 'Take ashwagandha supplement or powder in warm milk to reduce fatigue.' },
                    { icon: 'fas fa-mug-hot', title: 'Turmeric & Pepper Tea', desc: 'Anti-inflammatory — boil turmeric and black pepper in milk or water.' },
                    { icon: 'fas fa-massage', title: 'Oil Massage', desc: 'Warm sesame or coconut oil massage on aching areas to improve circulation.' },
                    { icon: 'fas fa-apple-alt', title: 'Iron-Rich Foods', desc: 'Eat spinach, lentils, dates, and jaggery to restore energy levels.' }
                ],
                activities: [
                    { icon: 'fas fa-bed',       title: 'Get 8-10 hours of sleep' },
                    { icon: 'fas fa-spa',       title: 'Gentle yoga / stretching' },
                    { icon: 'fas fa-ban',       title: 'Avoid intense exercise' },
                    { icon: 'fas fa-glass-water',title: 'Stay well hydrated' }
                ],
                warnings: [
                    'Extreme fatigue with shortness of breath',
                    'Body pain lasting more than a week without fever',
                    'Sudden unexplained severe muscle weakness',
                    'Pain in chest, left arm, or jaw — seek emergency care'
                ]
            },
            {
                name: 'Sore Throat',
                icon: '≡ƒñò',
                description: 'Pain, scratchiness, or irritation in the throat, often worsened by swallowing.',
                severity: 30,
                severityText: 'Mild',
                keywords: ['sore throat', 'throat pain', 'swallowing pain', 'scratchy throat', 'throat irritation'],
                remedies: [
                    { icon: 'fas fa-glass-water', title: 'Saltwater Gargle', desc: 'Mix 1/2 tsp salt in warm water. Gargle for 30 seconds, 4-5x daily.' },
                    { icon: 'fas fa-honey-pot', title: 'Honey & Warm Water', desc: '2 tsp honey in warm water or tea. Coat and soothe the throat lining.' },
                    { icon: 'fas fa-leaf', title: 'Licorice (Mulethi)', desc: 'Boil mulethi root in water. Gargle or drink as tea for anti-inflammatory relief.' },
                    { icon: 'fas fa-pepper-hot', title: 'Ginger Clove Tea', desc: 'Boil 5 cloves + ginger. Natural antiseptic and pain reliever.' },
                    { icon: 'fas fa-tint', title: 'Stay Hydrated & Warm', desc: 'Warm soups, broths, and herbal teas keep throat lubricated and ease pain.' }
                ],
                activities: [
                    { icon: 'fas fa-ban',      title: 'Avoid cold drinks & ice' },
                    { icon: 'fas fa-wind',     title: 'Humidify the air' },
                    { icon: 'fas fa-comment-slash', title: 'Rest your voice' },
                    { icon: 'fas fa-hands-wash', title: 'Wash hands often' }
                ],
                warnings: [
                    'Sore throat with high fever (above 101°F) for more than 2 days',
                    'Difficulty opening the mouth or swallowing',
                    'Drooling or inability to swallow saliva',
                    'White or yellow patches visible on tonsils'
                ]
            },
            {
                name: 'Diarrhea',
                icon: '≡ƒÜ╜',
                description: 'Loose or watery stools, often caused by infection, food poisoning, or digestive issues.',
                severity: 50,
                severityText: 'Moderate',
                keywords: ['diarrhea', 'loose motions', 'loose stools', 'frequent stools', 'watery stools', 'food poisoning'],
                remedies: [
                    { icon: 'fas fa-tint', title: 'ORS Solution', desc: 'Drink ORS (Oral Rehydration Solution) after every loose motion to prevent dehydration.' },
                    { icon: 'fas fa-leaf', title: 'Banana & Curd', desc: 'Ripe banana with fresh curd (probiotics) helps restore gut bacteria.' },
                    { icon: 'fas fa-apple-alt', title: 'BRAT Diet', desc: 'Banana, Rice, Applesauce, Toast — binding foods that firm up stools.' },
                    { icon: 'fas fa-pepper-hot', title: 'Ginger & Fenugreek', desc: 'Mix ginger juice + fenugreek powder in yogurt. Natural anti-diarrheal.' },
                    { icon: 'fas fa-glass-water', title: 'Coconut Water', desc: 'Excellent natural electrolyte replacement to prevent dehydration.' }
                ],
                activities: [
                    { icon: 'fas fa-bed',      title: 'Complete rest' },
                    { icon: 'fas fa-ban',      title: 'Avoid dairy, fat, spice' },
                    { icon: 'fas fa-tint',     title: 'Sip fluids constantly' },
                    { icon: 'fas fa-hands-wash', title: 'Strict hand hygiene' }
                ],
                warnings: [
                    'More than 6 episodes in 24 hours',
                    'Blood or mucus in stools',
                    'Signs of dehydration: dizzy, no urination, sunken eyes',
                    'Severe abdominal cramping or high fever alongside diarrhea'
                ]
            },
            {
                name: 'Cold & Flu',
                icon: '≡ƒñº',
                description: 'Influenza or severe cold with multiple system symptoms including fever and body aches.',
                severity: 60,
                severityText: 'Moderate-High',
                keywords: ['flu', 'influenza', 'cold and fever', 'body ache and fever', 'runny nose and fever', 'chills and cough'],
                remedies: [
                    { icon: 'fas fa-mug-hot', title: 'Kashayam / Kadha', desc: 'Boil Tulsi, ginger, cinnamon, black pepper, cloves in water. Drink warm 3x/day.' },
                    { icon: 'fas fa-leaf', title: 'Elderberry Syrup', desc: 'Or have amla juice — rich in Vitamin C, reduces flu duration.' },
                    { icon: 'fas fa-wind', title: 'Steam Inhalation', desc: 'With eucalyptus oil. Clears nasal passages and chest congestion.' },
                    { icon: 'fas fa-tint', title: 'Hydrate Constantly', desc: 'Warm water, soups, ORS every 30 minutes throughout the day.' },
                    { icon: 'fas fa-honey-pot', title: 'Honey + Cinnamon', desc: '1 tsp each mixed in warm water — boosts immunity and soothes symptoms.' }
                ],
                activities: [
                    { icon: 'fas fa-bed',         title: 'Complete bed rest' },
                    { icon: 'fas fa-thermometer', title: 'Monitor temperature' },
                    { icon: 'fas fa-ban',          title: 'Avoid going outside' },
                    { icon: 'fas fa-mask',         title: 'Wear a mask' }
                ],
                warnings: [
                    'Difficulty breathing or shortness of breath',
                    'Persistent chest pain or pressure',
                    'Sudden dizziness, confusion, or severe vomiting',
                    'Symptoms improve then return with fever + worsening cough'
                ]
            }
        ];

        // All unique symptom keywords for quick buttons
        const ALL_SYMPTOMS = [...new Set(CONDITIONS_DB.flatMap(c => c.keywords))].sort();
        let selectedSymptoms = [];
        let healthInitialized = false;

        function initHealthSection() {
            if (healthInitialized) return;
            healthInitialized = true;
            renderSymptomButtons();
        }

        function renderSymptomButtons() {
            const grid = document.getElementById('quickSymptomsGrid');
            if (!grid) return;
            // Select a curated subset for display (not all 60+ keywords)
            const displaySymptoms = [
                'fever','chills','headache','body ache','runny nose','sneezing',
                'sore throat','cough','dry cough','nausea','vomiting','bloating',
                'diarrhea','fatigue','weakness','dizziness','sweating','joint pain',
                'chest congestion','congestion','muscle pain','shivering','acidity',
                'throat pain','loose motions','migraine','flu','wheezing','gas'
            ];
            grid.innerHTML = displaySymptoms.map(s => `
                <button class="quick-symptom-btn" data-symptom="${s}" onclick="toggleSymptomChip('${s}', this)">
                    ${s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
            `).join('');
        }

        function toggleSymptomChip(symptom, btn) {
            const idx = selectedSymptoms.indexOf(symptom);
            if (idx === -1) {
                selectedSymptoms.push(symptom);
                btn.classList.add('selected');
            } else {
                selectedSymptoms.splice(idx, 1);
                btn.classList.remove('selected');
            }
            renderChips();
            document.getElementById('checkHealthBtn').disabled = selectedSymptoms.length === 0;
        }

        function removeSymptom(symptom) {
            selectedSymptoms = selectedSymptoms.filter(s => s !== symptom);
            // deselect the quick btn if present
            const btn = document.querySelector(`[data-symptom="${symptom}"]`);
            if (btn) btn.classList.remove('selected');
            renderChips();
            document.getElementById('checkHealthBtn').disabled = selectedSymptoms.length === 0;
        }

        function renderChips() {
            const container = document.getElementById('symptomChipsContainer');
            const placeholder = document.getElementById('chipPlaceholder');
            // Remove existing chips
            Array.from(container.querySelectorAll('.symptom-chip')).forEach(c => c.remove());
            if (selectedSymptoms.length === 0) {
                if (placeholder) placeholder.style.display = 'flex';
            } else {
                if (placeholder) placeholder.style.display = 'none';
                selectedSymptoms.forEach(s => {
                    const chip = document.createElement('span');
                    chip.className = 'symptom-chip';
                    chip.innerHTML = `${s} <span class="remove-chip" onclick="removeSymptom('${s}')"><i class="fas fa-times"></i></span>`;
                    container.appendChild(chip);
                });
            }
        }

        function analyzeSymptoms() {
            if (selectedSymptoms.length === 0) return;
            // Score each condition
            const scored = CONDITIONS_DB.map(c => {
                const score = selectedSymptoms.filter(sym =>
                    c.keywords.some(k => k.includes(sym) || sym.includes(k))
                ).length;
                return { ...c, score };
            }).filter(c => c.score > 0).sort((a, b) => b.score - a.score);

            const match = scored[0];
            if (!match) {
                showToast('No strong match found. Please consult a doctor for an accurate diagnosis.', 'warning');
                return;
            }
            renderHealthResult(match);
        }

        function renderHealthResult(condition) {
            document.getElementById('conditionIcon').textContent = condition.icon;
            document.getElementById('conditionName').textContent = condition.name;
            document.getElementById('conditionDesc').textContent = condition.description;
            // Severity bar
            const fill = document.getElementById('severityFill');
            const sevText = document.getElementById('severityText');
            fill.style.width = '0%';
            setTimeout(() => { fill.style.width = condition.severity + '%'; }, 50);
            sevText.textContent = condition.severityText;
            // Remedies
            const remediesBody = document.getElementById('remediesBody');
            remediesBody.innerHTML = condition.remedies.map(r => `
                <div class="remedy-item">
                    <div class="remedy-icon-wrap"><i class="${r.icon}"></i></div>
                    <div class="remedy-text">
                        <strong>${r.title}</strong>
                        <span>${r.desc}</span>
                    </div>
                </div>`).join('');
            // Activities
            const activitiesBody = document.getElementById('activitiesBody');
            activitiesBody.innerHTML = condition.activities.map(a => `
                <div class="activity-item">
                    <div class="activity-icon-wrap"><i class="${a.icon}"></i></div>
                    <div class="activity-text"><strong>${a.title}</strong></div>
                </div>`).join('');
            // Doctor warnings
            const warningList = document.getElementById('doctorWarningList');
            warningList.innerHTML = condition.warnings.map(w => `<li>${w}</li>`).join('');
            // Show result panel
            const resultPanel = document.getElementById('healthResultPanel');
            resultPanel.classList.add('show');
            resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        function resetHealthChecker() {
            selectedSymptoms = [];
            document.querySelectorAll('.quick-symptom-btn').forEach(b => b.classList.remove('selected'));
            renderChips();
            document.getElementById('checkHealthBtn').disabled = true;
            document.getElementById('healthResultPanel').classList.remove('show');
            document.getElementById('symptomChipsContainer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    
