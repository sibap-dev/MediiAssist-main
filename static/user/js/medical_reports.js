
        let healthReports = JSON.parse(localStorage.getItem('mediassist_reports') || '[]');

        const REPORT_TYPE_META = {
            blood_sugar: { label: 'Blood Sugar Test', icon: 'fas fa-tint', color: '#d9534f' },
            blood_pressure: { label: 'Blood Pressure', icon: 'fas fa-heartbeat', color: '#1f6fb2' },
            cholesterol: { label: 'Cholesterol Panel', icon: 'fas fa-vial', color: '#9158cc' },
            bmi: { label: 'BMI / Weight Check', icon: 'fas fa-weight', color: '#3ca66b' },
            general: { label: 'General Health Check', icon: 'fas fa-stethoscope', color: '#1f8a95' }
        };

        function escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function showToast(message) {
            const t = document.getElementById('toast');
            t.textContent = message;
            t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 2100);
        }

        function openLogReportModal() {
            document.getElementById('logReportModal').classList.add('show');
            resetFormState();
        }

        function closeLogReportModal() {
            document.getElementById('logReportModal').classList.remove('show');
        }

        function resetFormState() {
            document.getElementById('logReportForm').reset();
            document.getElementById('reportDate').value = new Date().toISOString().split('T')[0];
            document.querySelectorAll('.report-fields').forEach(f => { f.style.display = 'none'; });
        }

        function toggleReportFields() {
            const type = document.getElementById('reportType').value;
            document.querySelectorAll('.report-fields').forEach(f => { f.style.display = 'none'; });
            const map = {
                blood_sugar: 'bloodSugarFields',
                blood_pressure: 'bpFields',
                cholesterol: 'cholFields',
                bmi: 'bmiFields',
                general: 'generalFields'
            };
            if (map[type]) {
                document.getElementById(map[type]).style.display = 'block';
            }
        }

        function handleLogReport(event) {
            event.preventDefault();
            const type = document.getElementById('reportType').value;
            const date = document.getElementById('reportDate').value;
            if (!type || !date) {
                showToast('Report type and date are required.');
                return;
            }

            const notes = document.getElementById('reportNotes').value.trim();
            const doctor = document.getElementById('reportDoctor').value.trim();
            const meta = REPORT_TYPE_META[type] || REPORT_TYPE_META.general;
            let values = {};

            if (type === 'blood_sugar') {
                const fasting = document.getElementById('fastingBs').value;
                const pp = document.getElementById('ppBs').value;
                if (fasting) values['Fasting BS'] = fasting + ' mg/dL';
                if (pp) values['Post Meal BS'] = pp + ' mg/dL';
            } else if (type === 'blood_pressure') {
                const sys = document.getElementById('bpSystolic').value;
                const dia = document.getElementById('bpDiastolic').value;
                if (sys) values['Systolic'] = sys + ' mmHg';
                if (dia) values['Diastolic'] = dia + ' mmHg';
            } else if (type === 'cholesterol') {
                const total = document.getElementById('cholTotal').value;
                const ldl = document.getElementById('cholLdl').value;
                if (total) values['Total'] = total + ' mg/dL';
                if (ldl) values['LDL'] = ldl + ' mg/dL';
            } else if (type === 'bmi') {
                const weight = parseFloat(document.getElementById('weight').value);
                const heightCm = parseFloat(document.getElementById('height').value);
                if (!isNaN(weight)) values['Weight'] = weight + ' kg';
                if (!isNaN(weight) && !isNaN(heightCm) && heightCm > 0) {
                    const h = heightCm / 100;
                    const bmi = (weight / (h * h)).toFixed(1);
                    values['BMI'] = bmi;
                }
            } else {
                const l1 = document.getElementById('gen1Label').value.trim();
                const v1 = document.getElementById('gen1Value').value.trim();
                const l2 = document.getElementById('gen2Label').value.trim();
                const v2 = document.getElementById('gen2Value').value.trim();
                if (l1 && v1) values[l1] = v1;
                if (l2 && v2) values[l2] = v2;
            }

            const report = {
                id: Date.now(),
                type,
                date,
                values,
                notes,
                doctor,
                label: meta.label,
                icon: meta.icon,
                color: meta.color
            };

            healthReports.unshift(report);
            localStorage.setItem('mediassist_reports', JSON.stringify(healthReports));
            renderReports();
            updateMetricsSummary();
            closeLogReportModal();
            showToast('Report saved successfully.');
        }

        function renderReports() {
            const grid = document.getElementById('reportsGrid');
            const empty = document.getElementById('reportsEmptyState');
            Array.from(grid.querySelectorAll('.report-card')).forEach(c => c.remove());

            if (healthReports.length === 0) {
                empty.style.display = '';
                return;
            }

            empty.style.display = 'none';
            healthReports.forEach(report => {
                const valuesHtml = Object.entries(report.values || {}).map(([k, v]) =>
                    '<div class="value-box"><div class="k">' + escapeHtml(k) + '</div><div class="v">' + escapeHtml(v) + '</div></div>'
                ).join('');

                const dateText = report.date ? new Date(report.date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                }) : '--';

                const card = document.createElement('article');
                card.className = 'report-card';
                card.innerHTML =
                    '<div class="report-head">' +
                    '<div class="report-icon" style="background: linear-gradient(135deg,' + report.color + ',' + report.color + 'aa)"><i class="' + report.icon + '"></i></div>' +
                    '<div><h4>' + escapeHtml(report.label) + '</h4><span>' + escapeHtml(report.doctor || 'Self-logged') + '</span></div>' +
                    '</div>' +
                    (valuesHtml ? '<div class="report-values">' + valuesHtml + '</div>' : '') +
                    (report.notes ? '<div class="report-notes">' + escapeHtml(report.notes) + '</div>' : '') +
                    '<div class="report-foot"><span><i class="fas fa-calendar-alt"></i> ' + escapeHtml(dateText) + '</span>' +
                    '<button class="danger-btn" onclick="deleteReport(' + report.id + ')"><i class="fas fa-trash-alt"></i></button></div>';
                grid.appendChild(card);
            });
        }

        function deleteReport(id) {
            if (!confirm('Delete this report?')) return;
            healthReports = healthReports.filter(r => r.id !== id);
            localStorage.setItem('mediassist_reports', JSON.stringify(healthReports));
            renderReports();
            updateMetricsSummary();
            showToast('Report deleted.');
        }

        function setCardState(cardId, badgeId, state, text) {
            const card = document.getElementById(cardId);
            const badge = document.getElementById(badgeId);
            badge.textContent = text;

            const colorMap = {
                normal: ['#e6f5ea', '#2d7d4f'],
                warning: ['#fff4de', '#9d6a12'],
                danger: ['#fde7e6', '#a53d38'],
                neutral: ['#eaf2fb', '#37658e']
            };
            const colors = colorMap[state] || colorMap.neutral;
            card.style.borderColor = colors[0];
            badge.style.background = colors[0];
            badge.style.color = colors[1];
        }

        function updateMetricsSummary() {
            const bsReport = healthReports.find(r => r.type === 'blood_sugar');
            const bpReport = healthReports.find(r => r.type === 'blood_pressure');
            const bmiReport = healthReports.find(r => r.type === 'bmi');
            const cholReport = healthReports.find(r => r.type === 'cholesterol');

            if (bsReport) {
                const fasting = parseFloat(Object.values(bsReport.values || {})[0]);
                if (!isNaN(fasting)) {
                    document.getElementById('metricBloodSugar').textContent = fasting + ' mg/dL';
                    if (fasting < 100) setCardState('metricBSCard', 'metricBSStatus', 'normal', 'Normal');
                    else if (fasting < 126) setCardState('metricBSCard', 'metricBSStatus', 'warning', 'Pre-Diabetic');
                    else setCardState('metricBSCard', 'metricBSStatus', 'danger', 'High');
                }
            }

            if (bpReport) {
                const vals = Object.values(bpReport.values || {});
                const sys = parseFloat(vals[0]);
                const dia = parseFloat(vals[1]);
                if (!isNaN(sys) && !isNaN(dia)) {
                    document.getElementById('metricBP').textContent = sys + '/' + dia;
                    if (sys < 120 && dia < 80) setCardState('metricBPCard', 'metricBPStatus', 'normal', 'Normal');
                    else if (sys < 130) setCardState('metricBPCard', 'metricBPStatus', 'warning', 'Elevated');
                    else setCardState('metricBPCard', 'metricBPStatus', 'danger', 'High');
                }
            }

            if (bmiReport) {
                const vals = Object.values(bmiReport.values || {});
                const bmi = parseFloat(vals[1] || vals[0]);
                if (!isNaN(bmi)) {
                    document.getElementById('metricBMI').textContent = bmi;
                    if (bmi < 18.5) setCardState('metricBMICard', 'metricBMIStatus', 'warning', 'Underweight');
                    else if (bmi < 25) setCardState('metricBMICard', 'metricBMIStatus', 'normal', 'Normal');
                    else if (bmi < 30) setCardState('metricBMICard', 'metricBMIStatus', 'warning', 'Overweight');
                    else setCardState('metricBMICard', 'metricBMIStatus', 'danger', 'Obese');
                }
            }

            if (cholReport) {
                const chol = parseFloat(Object.values(cholReport.values || {})[0]);
                if (!isNaN(chol)) {
                    document.getElementById('metricCholesterol').textContent = chol + ' mg/dL';
                    if (chol < 200) setCardState('metricCholCard', 'metricCholStatus', 'normal', 'Desirable');
                    else if (chol < 240) setCardState('metricCholCard', 'metricCholStatus', 'warning', 'Borderline');
                    else setCardState('metricCholCard', 'metricCholStatus', 'danger', 'High');
                }
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('logReportForm').addEventListener('submit', handleLogReport);
            resetFormState();
            renderReports();
            updateMetricsSummary();
        });
    
