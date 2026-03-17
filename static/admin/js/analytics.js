
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        //  MediAssist â€” Inventory Analytics Page (JavaScript)
        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        //
        //  HOW THIS PAGE STAYS UP-TO-DATE (Real-Time Automation)
        //  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        //  This page does NOT use WebSockets, polling, or timers.
        //  Instead, it relies on a simple but effective pattern:
        //
        //    1. The backend (app.py) runs the rule engine SYNCHRONOUSLY
        //       after every stock-changing event (purchase, restock, edit).
        //       By the time any such request completes, the `realtime_alerts`
        //       and `medicine_stock` tables in PostgreSQL are already updated.
        //
        //    2. This page fetches data from 4 REST endpoints on load:
        //         /admin/inventory/dashboard  â†’ summary cards + chart data
        //         /admin/inventory/alerts     â†’ alerts table
        //         /admin/inventory/stock      â†’ stock levels table + bar chart
        //         /admin/tft-predictions      â†’ ML demand forecast cards
        //       Each endpoint reads directly from PostgreSQL â€” no cache.
        //
        //    3. After user actions ON THIS PAGE (Add Stock, Resolve Alert,
        //       Run Analysis), the relevant fetch functions are called again,
        //       so the UI refreshes immediately.
        //
        //  DATA SOURCES (PostgreSQL tables)
        //  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        //    medicine_stock   â†’ stock levels, reorder_level, expiry_date
        //    realtime_alerts  â†’ auto-generated alerts from rule engine
        //    tft_predictions  â†’ ML demand forecasts (read-only, async)
        //
        //  WHY NO WEBSOCKET / POLLING:
        //    This is a single-admin dashboard.  Data changes happen through
        //    this admin's own actions (purchases, restocks).  Each action
        //    triggers an immediate re-fetch, so the page is always fresh.
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        //  State
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        let allAlerts = [];
        let chartInstances = {};

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        //  Initialization
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        document.addEventListener('DOMContentLoaded', () => {
            initSidebarMenu();
            // On page load, fetch all data from PostgreSQL via REST endpoints.
            // Each function below makes an independent fetch() call.
            // The DB is already up-to-date because the rule engine ran
            // synchronously during the last stock-changing event.
            loadDashboard();   // â†’ /admin/inventory/dashboard (summary + charts)
            loadAlerts();      // â†’ /admin/inventory/alerts    (alerts table)
            loadStock();       // â†’ /admin/inventory/stock     (stock table + chart)
            loadPredictions(); // â†’ /admin/tft-predictions     (ML forecast cards)
        });

        function closeSidebar() {
            const sidebar = document.getElementById('sidebar');
            const backdrop = document.getElementById('sidebarBackdrop');
            if (!sidebar || !backdrop) return;
            sidebar.classList.remove('open');
            backdrop.classList.remove('active');
            document.body.classList.remove('sidebar-open');
        }

        function initSidebarMenu() {
            const menuToggle = document.getElementById('menuToggle');
            const sidebar = document.getElementById('sidebar');
            const backdrop = document.getElementById('sidebarBackdrop');
            if (!menuToggle || !sidebar || !backdrop) return;

            menuToggle.addEventListener('click', function() {
                const isOpen = sidebar.classList.contains('open');
                if (isOpen) {
                    closeSidebar();
                } else {
                    sidebar.classList.add('open');
                    backdrop.classList.add('active');
                    document.body.classList.add('sidebar-open');
                }
            });

            backdrop.addEventListener('click', closeSidebar);

            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && sidebar.classList.contains('open')) {
                    closeSidebar();
                }
            });
        }

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        //  Data Loading
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

        async function loadDashboard() {
            // Fetches aggregated dashboard data from /admin/inventory/dashboard.
            // This endpoint reads from medicine_stock and realtime_alerts tables.
            // Because the rule engine already ran after the last stock change,
            // the data returned here is guaranteed to be up-to-date.
            try {
                const res = await fetch('/admin/inventory/dashboard');
                const data = await res.json();
                if (!data.success) return;

                const d = data.dashboard;

                // â”€â”€ Populate summary cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                // These values come directly from PostgreSQL queries:
                //   total_medicines = COUNT(*) from medicine_stock
                //   healthy_stock   = total - out_of_stock - low_stock
                //   low_stock       = stock > 0 AND stock â‰¤ reorder_level (alert_type: REORDER_REQUIRED)
                //   out_of_stock    = stock â‰¤ 0
                //   expiring_soon   = expiry_date within 30 days
                //   alerts.total    = unresolved alerts in realtime_alerts
                document.getElementById('totalMedicines').textContent = d.total_medicines;
                document.getElementById('healthyStock').textContent = d.healthy_stock;
                document.getElementById('lowStock').textContent = d.low_stock;
                document.getElementById('outOfStock').textContent = d.out_of_stock;
                document.getElementById('expiringSoon').textContent = d.expiring_soon;
                document.getElementById('totalAlerts').textContent = d.alerts.total;

                document.getElementById('lastUpdated').innerHTML =
                    `<i class="fas fa-clock"></i> Last updated: ${new Date().toLocaleTimeString()}`;

                // Alert banner
                updateAlertBanner(d.alerts);

                // Severity doughnut
                renderSeverityChart(d.alerts);

                // Alert distribution pie
                renderAlertPieChart(d.alerts.breakdown || {});

            } catch (e) {
                console.error('Dashboard load error:', e);
            }
        }

        async function loadAlerts() {
            // Fetches from /admin/inventory/alerts â†’ reads realtime_alerts table.
            // These alerts were auto-generated by inventory_engine.py after the
            // last stock-changing event.  No manual trigger needed.
            try {
                const res = await fetch('/admin/inventory/alerts');
                const data = await res.json();
                if (!data.success) return;

                allAlerts = data.alerts;
                renderAlertsTable(allAlerts);
            } catch (e) {
                console.error('Alerts load error:', e);
                document.getElementById('alertsTableBody').innerHTML =
                    `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Failed to load alerts</h3></div></td></tr>`;
            }
        }

        async function loadStock() {
            // Fetches from /admin/inventory/stock â†’ reads medicine_stock table.
            // Each medicine's current_stock, reorder_level, and expiry_date
            // are live values updated by the purchase and restock flows.
            try {
                const res = await fetch('/admin/inventory/stock');
                const data = await res.json();
                if (!data.success) return;

                renderStockTable(data.stock);
                renderStockBarChart(data.stock);
            } catch (e) {
                console.error('Stock load error:', e);
            }
        }

        async function loadPredictions() {
            // Fetches from /admin/tft-predictions â†’ reads tft_predictions table.
            // NOTE: ML predictions are ASYNCHRONOUS and READ-ONLY.
            // They are generated offline by the TFT model (train_tft.py)
            // and loaded into the DB by save_to_db.py.  The real-time
            // rule engine reads them for demand-vs-stock alerts, but
            // NEVER retrains the model during a request.
            try {
                const res = await fetch('/admin/tft-predictions', { cache: 'no-store' });
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                const data = await res.json();
                if (!data.success) {
                    renderPredictionCards([]);
                    renderDemandBarChart([]);
                    return;
                }

                const predictions = Array.isArray(data.predictions) ? data.predictions : [];
                const dayLabels = Array.isArray(data.day_labels) && data.day_labels.length === 7
                    ? data.day_labels
                    : null;
                renderPredictionCards(predictions, dayLabels);
                renderDemandBarChart(predictions);
            } catch (e) {
                console.error('Predictions load error:', e);
                const grid = document.getElementById('predictionsGrid');
                if (grid) {
                    grid.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-exclamation-triangle"></i>
                            <h3>Unable to Load Predictions</h3>
                            <p>Check admin session and API/database connectivity.</p>
                        </div>`;
                }
                renderDemandBarChart([]);
            }
        }

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        //  Alert Banner
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

        function updateAlertBanner(alerts) {
            const banner = document.getElementById('alertBanner');
            if (alerts.critical > 0) {
                banner.className = 'alert-banner critical fade-in';
                banner.innerHTML = `
                    <div class="alert-banner-icon"><i class="fas fa-radiation"></i></div>
                    <div class="alert-banner-text">
                        <h3>\u26A0\uFE0F ${alerts.critical} Critical Alert${alerts.critical > 1 ? 's' : ''} \u2014 Immediate Action Required</h3>
                        <p>${alerts.total} total active alerts. ${alerts.high} high severity, ${alerts.medium} medium severity.</p>
                    </div>`;
                banner.style.display = 'flex';
            } else if (alerts.high > 0) {
                banner.className = 'alert-banner warning fade-in';
                banner.innerHTML = `
                    <div class="alert-banner-icon"><i class="fas fa-exclamation-triangle"></i></div>
                    <div class="alert-banner-text">
                        <h3>${alerts.high} High Priority Alert${alerts.high > 1 ? 's' : ''}</h3>
                        <p>${alerts.total} total active alerts need attention.</p>
                    </div>`;
                banner.style.display = 'flex';
            } else if (alerts.total > 0) {
                banner.className = 'alert-banner warning fade-in';
                banner.innerHTML = `
                    <div class="alert-banner-icon"><i class="fas fa-info-circle"></i></div>
                    <div class="alert-banner-text">
                        <h3>${alerts.total} Active Alert${alerts.total > 1 ? 's' : ''}</h3>
                        <p>Inventory needs attention. Review alerts below.</p>
                    </div>`;
                banner.style.display = 'flex';
            } else {
                banner.className = 'alert-banner healthy fade-in';
                banner.innerHTML = `
                    <div class="alert-banner-icon"><i class="fas fa-check-circle"></i></div>
                    <div class="alert-banner-text">
                        <h3>\u2705 All Clear \u2014 Inventory is Healthy</h3>
                        <p>No alerts at this time. System is running smoothly.</p>
                    </div>`;
                banner.style.display = 'flex';
            }
        }

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        //  Tables
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

        function renderAlertsTable(alerts) {
            const tbody = document.getElementById('alertsTableBody');
            if (!alerts.length) {
                tbody.innerHTML = `
                    <tr><td colspan="7">
                        <div class="empty-state">
                            <i class="fas fa-check-circle"></i>
                            <h3>No Active Alerts</h3>
                            <p>All inventory levels are healthy.</p>
                        </div>
                    </td></tr>`;
                return;
            }

            tbody.innerHTML = alerts.map(a => `
                <tr>
                    <td><strong>${a.medicine_name}</strong></td>
                    <td>${a.medicine_category || '\u2014'}</td>
                    <td><span class="alert-type-badge ${a.alert_type.toLowerCase()}">${formatAlertType(a.alert_type)}</span></td>
                    <td><span class="severity-badge ${a.severity.toLowerCase()}">${a.severity}</span></td>
                    <td><strong>${a.current_stock}</strong> units</td>
                    <td style="max-width:280px; font-size:0.85rem; color:var(--gray);">${a.message}</td>
                    <td>
                        ${a.is_resolved
                            ? '<span style="color:var(--success);font-weight:600;"><i class="fas fa-check"></i> Resolved</span>'
                            : `<button class="resolve-btn" onclick="resolveAlert(${a.id})"><i class="fas fa-check"></i> Resolve</button>`
                        }
                    </td>
                </tr>
            `).join('');
        }

        function renderStockTable(stock) {
            const tbody = document.getElementById('stockTableBody');
            if (!stock.length) {
                tbody.innerHTML = `
                    <tr><td colspan="8">
                        <div class="empty-state">
                            <i class="fas fa-box-open"></i>
                            <h3>No Stock Records</h3>
                            <p>Add medicines to start tracking inventory.</p>
                        </div>
                    </td></tr>`;
                return;
            }

            tbody.innerHTML = stock.map(s => {
                // Use each medicine's own reorder_level for stock status.
                // This matches the rule engine's per-medicine thresholds.
                // Show the ACTUAL value from the database â€” never fake it with a fallback.
                const reorderLvl = s.reorder_level;
                const reorderForCalc = reorderLvl || 30;
                const pct = Math.min(100, (s.current_stock / Math.max(reorderForCalc * 3, 1)) * 100);
                const barClass = s.current_stock <= 0 ? 'critical'
                    : s.current_stock <= reorderForCalc ? 'low'
                    : 'good';
                const expiryStr = s.expiry_date
                    ? new Date(s.expiry_date).toLocaleDateString()
                    : '\u2014';
                const restocked = s.last_restocked
                    ? new Date(s.last_restocked).toLocaleDateString()
                    : 'Never';
                // Show the actual reorder_level â€” if not set, show "Not Set" in red
                const reorderDisplay = reorderLvl
                    ? `<strong>${reorderLvl}</strong>`
                    : `<span style="color:#dc3545;font-style:italic">Not set</span>`;
                // Escape medicine name for use in JS string attributes
                const safeName = s.medicine_name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                // Build a data attribute with values for the edit modal
                const editData = encodeURIComponent(JSON.stringify({
                    id: s.id,
                    medicine_name: s.medicine_name,
                    current_stock: s.current_stock,
                    reorder_level: s.reorder_level,
                    category: s.category,
                    expiry_date: s.expiry_date,
                }));

                return `
                <tr>
                    <td><strong>${s.medicine_name}</strong></td>
                    <td>${s.category || '\u2014'}</td>
                    <td><strong>${s.current_stock}</strong></td>
                    <td style="min-width:120px;">
                        <div class="stock-bar">
                            <div class="stock-bar-fill ${barClass}" style="width:${pct}%"></div>
                        </div>
                    </td>
                    <td>${expiryStr}</td>
                    <td>${reorderDisplay}</td>
                    <td>${restocked}</td>
                    <td>
                        <div class="action-btns">
                            <button class="edit-btn" onclick="openEditStockModal('${editData}')"
                                title="Edit stock details">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="delete-btn" onclick="deleteStock(${s.id}, '${safeName}')"
                                title="Remove from inventory">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        }

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        //  Charts
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

        // â”€â”€â”€ Shared chart defaults â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        Chart.defaults.font.family = "'Segoe UI', system-ui, -apple-system, sans-serif";
        Chart.defaults.color = '#64748B';

        // Helper: build a vertical gradient on a bar chart canvas
        function barGradient(ctx, chartArea, topHex, botHex) {
            if (!chartArea) return topHex;
            const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, topHex);
            g.addColorStop(1, botHex);
            return g;
        }

        // Helper: darken a hex colour slightly for hover state
        function darken(hex, amt = 20) {
            const n = parseInt(hex.replace('#',''), 16);
            const r = Math.max(0, (n >> 16 & 0xff) - amt);
            const g = Math.max(0, (n >>  8 & 0xff) - amt);
            const b = Math.max(0, (n       & 0xff) - amt);
            return `rgb(${r},${g},${b})`;
        }

        // Custom plugin: draw a soft glow ring behind doughnut arcs
        const doughnutGlowPlugin = {
            id: 'doughnutGlow',
            beforeDraw(chart) {
                const { ctx, chartArea } = chart;
                if (!chartArea || chart.config.type !== 'doughnut') return;
                const cx = (chartArea.left + chartArea.right) / 2;
                const cy = (chartArea.top  + chartArea.bottom) / 2;
                const r  = Math.min(chartArea.width, chartArea.height) / 2;
                ctx.save();
                ctx.shadowBlur = 28;
                ctx.shadowColor = 'rgba(42,92,130,0.14)';
                ctx.beginPath();
                ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
                ctx.closePath();
                ctx.strokeStyle = 'rgba(42,92,130,0.06)';
                ctx.lineWidth = r * 0.32;
                ctx.stroke();
                ctx.restore();
            }
        };
        Chart.register(doughnutGlowPlugin);

        function renderSeverityChart(alerts) {
            if (chartInstances.severity) chartInstances.severity.destroy();
            const ctx = document.getElementById('severityDoughnut').getContext('2d');
            const total = (alerts.critical || 0) + (alerts.high || 0) + (alerts.medium || 0);

            chartInstances.severity = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: [
                        `Critical (${alerts.critical || 0})`,
                        `High (${alerts.high || 0})`,
                        `Medium (${alerts.medium || 0})`
                    ],
                    datasets: [{
                        data: [alerts.critical || 0, alerts.high || 0, alerts.medium || 0],
                        backgroundColor: [
                            'rgba(220,53,69,0.90)',
                            'rgba(249,115,22,0.90)',
                            'rgba(255,193,7,0.90)'
                        ],
                        hoverBackgroundColor: ['#b91c1c', '#c2410c', '#b45309'],
                        borderWidth: 5,
                        borderColor: '#fff',
                        hoverOffset: 12,
                        spacing: 2,
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: true, cutout: '70%',
                    animation: {
                        animateRotate: true, animateScale: true,
                        duration: 1200, easing: 'easeInOutCubic'
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 20, font: { size: 12, weight: '700' },
                                usePointStyle: true, pointStyle: 'circle'
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15,23,42,0.92)',
                            titleFont: { weight: '700', size: 13 },
                            bodyFont: { size: 12 }, padding: 14, cornerRadius: 10,
                            callbacks: {
                                label: c => {
                                    const pct = total ? ((c.parsed / total) * 100).toFixed(1) : 0;
                                    return `  ${c.label}  \u2014  ${pct}%`;
                                }
                            }
                        }
                    }
                },
                plugins: [{
                    id: 'centerText',
                    afterDraw(chart) {
                        const { width, height, ctx } = chart;
                        ctx.save();
                        const cx = width / 2, cy = height / 2;
                        // glow circle
                        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, height * 0.22);
                        rg.addColorStop(0, 'rgba(42,92,130,0.08)');
                        rg.addColorStop(1, 'rgba(42,92,130,0)');
                        ctx.beginPath();
                        ctx.arc(cx, cy, height * 0.28, 0, Math.PI * 2);
                        ctx.fillStyle = rg;
                        ctx.fill();
                        // big number
                        ctx.font = `800 ${Math.round(height / 7.5)}px Segoe UI, system-ui`;
                        ctx.fillStyle = '#1E293B';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(total, cx, cy - height * 0.04);
                        // label
                        ctx.font = `500 ${Math.round(height / 14)}px Segoe UI`;
                        ctx.fillStyle = '#94a3b8';
                        ctx.fillText('active alerts', cx, cy + height * 0.07);
                        ctx.restore();
                    }
                }]
            });
        }

        function renderAlertPieChart(breakdown) {
            if (chartInstances.alertPie) chartInstances.alertPie.destroy();
            const labels = Object.keys(breakdown).map(formatAlertType);
            const values = Object.values(breakdown);
            // Vivid but harmonious palette
            const colors = [
                'rgba(220,53,69,0.88)',  'rgba(249,115,22,0.88)',
                'rgba(255,193,7,0.88)',  'rgba(232,62,140,0.88)',
                'rgba(42,92,130,0.88)',  'rgba(0,168,168,0.88)',
                'rgba(139,92,246,0.88)'
            ];
            const hColors = ['#b91c1c','#c2410c','#b45309','#9d174d','#1e3a5f','#006868','#5b21b6'];

            const ctx = document.getElementById('alertPieChart').getContext('2d');
            if (!labels.length) {
                chartInstances.alertPie = new Chart(ctx, {
                    type: 'doughnut',
                    data: { labels: ['All Clear \u2714'], datasets: [{ data: [1], backgroundColor: ['rgba(40,167,69,0.15)'], borderWidth: 0 }] },
                    options: {
                        responsive: true, maintainAspectRatio: true, cutout: '70%',
                        animation: { duration: 1000, easing: 'easeInOutCubic' },
                        plugins: { legend: { position: 'bottom', labels: { font: { size: 13, weight: '700' }, color: '#28A745', usePointStyle: true } } }
                    }
                });
                return;
            }

            chartInstances.alertPie = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data: values,
                        backgroundColor: colors.slice(0, labels.length),
                        hoverBackgroundColor: hColors.slice(0, labels.length),
                        borderWidth: 5, borderColor: '#fff',
                        hoverOffset: 12, spacing: 2,
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: true, cutout: '62%',
                    animation: { animateRotate: true, duration: 1100, easing: 'easeInOutCubic' },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { padding: 16, font: { size: 11, weight: '700' }, usePointStyle: true, pointStyle: 'circle' }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15,23,42,0.92)',
                            titleFont: { weight: '700', size: 13 },
                            bodyFont: { size: 12 }, padding: 14, cornerRadius: 10,
                            callbacks: { label: c => `  ${c.label}: ${c.parsed} alert${c.parsed !== 1 ? 's' : ''}` }
                        }
                    }
                }
            });
        }

        function renderStockBarChart(stock) {
            if (chartInstances.stockBar) chartInstances.stockBar.destroy();
            const canvasEl = document.getElementById('stockBarChart');
            const ctx = canvasEl.getContext('2d');

            if (!stock.length) {
                chartInstances.stockBar = new Chart(ctx, {
                    type: 'bar',
                    data: { labels: ['No data'], datasets: [{ data: [0], backgroundColor: '#e8edf2' }] },
                    options: { responsive: true, maintainAspectRatio: true }
                });
                return;
            }

            const labels = stock.map(s => s.medicine_name.length > 16 ? s.medicine_name.substring(0, 16) + '\u2026' : s.medicine_name);
            const values = stock.map(s => s.current_stock);

            // Gradient fill based on stock health: top = vivid, bottom = washed
            const colorMap = stock.map(s => {
                const rl = s.reorder_level || 30;
                if (s.current_stock <= 0)         return { t: '#ef4444', b: '#fca5a5' };
                if (s.current_stock <= rl * 0.33) return { t: '#f97316', b: '#fed7aa' };
                if (s.current_stock <= rl)         return { t: '#f59e0b', b: '#fde68a' };
                return                              { t: '#10b981', b: '#a7f3d0' };
            });

            chartInstances.stockBar = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Units in Stock',
                        data: values,
                        backgroundColor(context) {
                            const chart = context.chart;
                            const { ctx: c, chartArea } = chart;
                            if (!chartArea) return colorMap[context.dataIndex]?.t || '#10b981';
                            const { t, b } = colorMap[context.dataIndex] || { t: '#10b981', b: '#a7f3d0' };
                            return barGradient(c, chartArea, t, b);
                        },
                        hoverBackgroundColor: colorMap.map(c => darken(c.t.replace('rgba', 'rgb').replace(/,[^,]+\)/, ')'))),
                        borderRadius: { topLeft: 10, topRight: 10, bottomLeft: 0, bottomRight: 0 },
                        borderSkipped: false,
                        borderWidth: 0,
                        barPercentage: 0.68,
                        categoryPercentage: 0.8,
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: true,
                    animation: { duration: 1200, easing: 'easeInOutCubic',
                        onProgress(anim) {
                            // subtle scale-up from bottom
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(15,23,42,0.92)',
                            titleFont: { weight: '800', size: 13, family: 'Segoe UI' },
                            bodyFont: { size: 12 }, padding: 14, cornerRadius: 10,
                            displayColors: true, boxWidth: 10, boxHeight: 10, boxPadding: 4,
                            callbacks: {
                                label: c => `  ${c.parsed.y.toLocaleString()} units in stock`,
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Units', color: '#94a3b8', font: { size: 11, weight: '600' } },
                            grid: { color: 'rgba(148,163,184,0.12)', lineWidth: 1 },
                            border: { display: false },
                            ticks: { color: '#94a3b8', font: { size: 11 }, padding: 6 }
                        },
                        x: {
                            grid: { display: false },
                            border: { display: false },
                            ticks: { maxRotation: 35, minRotation: 0, color: '#64748B', font: { size: 10.5, weight: '600' }, padding: 4 }
                        },
                    }
                }
            });
        }

        function renderDemandBarChart(predictions) {
            if (chartInstances.demand) chartInstances.demand.destroy();
            const ctx = document.getElementById('demandBarChart').getContext('2d');

            if (!predictions.length) {
                chartInstances.demand = new Chart(ctx, {
                    type: 'bar',
                    data: { labels: ['No data'], datasets: [{ data: [0], backgroundColor: '#e8edf2' }] },
                    options: { responsive: true, maintainAspectRatio: true }
                });
                return;
            }

            const toNum = (v) => {
                const n = Number(v);
                return Number.isFinite(n) ? n : 0;
            };
            const labels = predictions.map(p => p.series_id);
            const avgDemand = predictions.map(p => {
                const total = toNum(p.day_1) + toNum(p.day_2) + toNum(p.day_3) + toNum(p.day_4) + toNum(p.day_5) + toNum(p.day_6) + toNum(p.day_7);
                return parseFloat((total / 7).toFixed(1));
            });

            // Vivid gradient pairs: [top, bottom] per drug class
            const gradPairs = [
                { t: '#7c3aed', b: '#c4b5fd' },   // M01AB - indigo
                { t: '#2563eb', b: '#93c5fd' },   // M01AE - blue
                { t: '#0891b2', b: '#a5f3fc' },   // N02BA - cyan
                { t: '#059669', b: '#6ee7b7' },   // N02BE - emerald
                { t: '#d97706', b: '#fde68a' },   // N05B  - amber
                { t: '#dc2626', b: '#fca5a5' },   // N05C  - red
                { t: '#db2777', b: '#f9a8d4' },   // R03   - pink
                { t: '#475569', b: '#cbd5e1' },   // R06   - slate
            ];

            chartInstances.demand = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Avg Daily Demand (units)',
                        data: avgDemand,
                        backgroundColor(context) {
                            const chart = context.chart;
                            const { ctx: c, chartArea } = chart;
                            const pair = gradPairs[context.dataIndex % gradPairs.length];
                            if (!chartArea) return pair.t;
                            return barGradient(c, chartArea, pair.t, pair.b);
                        },
                        hoverBackgroundColor: gradPairs.map(p => darken(p.t.replace('#', ''), 0) + ''),
                        borderRadius: { topLeft: 10, topRight: 10, bottomLeft: 0, bottomRight: 0 },
                        borderSkipped: false,
                        borderWidth: 0,
                        barPercentage: 0.65,
                        categoryPercentage: 0.8,
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: true,
                    animation: { duration: 1300, easing: 'easeInOutCubic' },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(15,23,42,0.92)',
                            titleFont: { weight: '800', size: 13, family: 'Segoe UI' },
                            bodyFont: { size: 12 }, padding: 14, cornerRadius: 10,
                            displayColors: true, boxWidth: 10, boxHeight: 10, boxPadding: 4,
                            callbacks: {
                                title: items => `${items[0].label}  (Drug Class)`,
                                label: c => `  Avg ${c.parsed.y} units/day   (7-day TFT forecast)`,
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Avg Daily Units', color: '#94a3b8', font: { size: 11, weight: '600' } },
                            grid: { color: 'rgba(148,163,184,0.12)', lineWidth: 1 },
                            border: { display: false },
                            ticks: { color: '#94a3b8', font: { size: 11 }, padding: 6 }
                        },
                        x: {
                            grid: { display: false },
                            border: { display: false },
                            ticks: { color: '#64748B', font: { size: 11, weight: '700' }, padding: 4 }
                        }
                    }
                }
            });
        }

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        //  Prediction Cards
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

        // Drug class friendly names map
        const DRUG_CLASS_NAMES = {
            'M01AB': 'Anti-inflammatories', 'M01AE': 'Propionic Acid Drugs',
            'N02BA': 'Salicylates (Aspirin)', 'N02BE': 'Paracetamol / Anilides',
            'N05B': 'Anxiolytics', 'N05C': 'Hypnotics & Sedatives',
            'R03': 'Anti-asthmatics', 'R06': 'Antihistamines'
        };

        function renderPredictionCards(predictions, apiDayLabels = null) {
            const grid = document.getElementById('predictionsGrid');
            if (!predictions.length) {
                grid.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-brain"></i>
                        <h3>No Predictions Available</h3>
                        <p>Run the TFT model to generate demand forecasts.</p>
                    </div>`;
                return;
            }

            const dayLabels = apiDayLabels || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

            grid.innerHTML = predictions.map(p => {
                const toNum = (v) => {
                    const n = Number(v);
                    return Number.isFinite(n) ? n : 0;
                };
                const days = [toNum(p.day_1), toNum(p.day_2), toNum(p.day_3), toNum(p.day_4), toNum(p.day_5), toNum(p.day_6), toNum(p.day_7)];
                const avg = (days.reduce((a, b) => a + b, 0) / 7);
                const maxVal = Math.max(...days);
                const minVal = Math.min(...days);
                const maxIndices = days
                    .map((val, idx) => (val === maxVal ? idx : -1))
                    .filter(idx => idx >= 0);
                const isFlatWeek = maxIndices.length === days.length;
                const peakIdx = isFlatWeek ? -1 : maxIndices[maxIndices.length - 1];
                const minIdx = days.indexOf(minVal);
                const trend = days[6] > days[0] ? 'up' : days[6] < days[0] ? 'down' : 'flat';
                const trendIcon = trend === 'up' ? 'fa-arrow-trend-up' : trend === 'down' ? 'fa-arrow-trend-down' : 'fa-minus';
                const trendLabel = trend === 'up' ? 'Rising demand' : trend === 'down' ? 'Falling demand' : 'Steady demand';
                const friendlyName = DRUG_CLASS_NAMES[p.series_id] || p.series_id;

                // Demand level chip
                const demandLevel = avg >= 80 ? 'high' : avg >= 40 ? 'medium' : 'low';
                const demandLevelLabel = avg >= 80 ? 'High Demand' : avg >= 40 ? 'Moderate' : 'Low Demand';

                // Sparkline bars
                const sparkBars = days.map((val, i) => {
                    const pct = maxVal > 0 ? Math.max(10, (val / maxVal) * 100) : 10;
                    const isPeak = peakIdx >= 0 && i === peakIdx;
                    const color = isPeak ? '#2A5C82' : trend === 'up' ? '#3A7CA5' : trend === 'down' ? '#64748B' : '#00A8A8';
                    const opacity = maxVal > 0 ? (0.5 + (val / maxVal) * 0.5) : 0.5;
                    return `<div class="spark-bar-wrap">
                        <div class="spark-bar ${isPeak ? 'peak' : ''}" style="height:${pct}%;background:${color};opacity:${opacity};"></div>
                    </div>`;
                }).join('');

                // Day rows
                const dayRows = days.map((val, i) => {
                    const isPeak = peakIdx >= 0 && i === peakIdx;
                    const isMin = i === minIdx;
                    return `
                    <div class="prediction-day ${isPeak ? 'is-peak' : ''} ${isMin && !isPeak ? 'is-min' : ''}">
                        ${isPeak ? '<span class="peak-badge">PEAK</span>' : ''}
                        <div class="prediction-day-label">${dayLabels[i]}</div>
                        <div class="prediction-day-value">${val.toFixed(1)}</div>
                    </div>`;
                }).join('');

                // Insight text
                const weekTotal = days.reduce((a, b) => a + b, 0).toFixed(0);
                const peakSentence = peakIdx >= 0
                    ? `Peak demand on <strong>${dayLabels[peakIdx]}</strong> (${maxVal.toFixed(1)} units).`
                    : 'No single peak day detected this week (flat demand).';
                const insightText = `Expected <strong>~${weekTotal} total units</strong> across the week. ${peakSentence} ${trend === 'up' ? 'Demand is <strong>increasing</strong> toward end of week.' : trend === 'down' ? 'Demand is <strong>declining</strong> toward end of week.' : 'Demand stays <strong>steady</strong> throughout the week.'}`;

                return `
                <div class="prediction-card">
                    <div class="prediction-card-header">
                        <div class="prediction-card-title-group">
                            <div class="prediction-card-series">${p.series_id}</div>
                            <div class="prediction-card-label">${friendlyName}</div>
                        </div>
                        <div class="prediction-card-stats">
                            <div class="prediction-card-avg">~${avg.toFixed(1)} units/day</div>
                            <div class="prediction-trend ${trend}"><i class="fas ${trendIcon}"></i> ${trendLabel}</div>
                        </div>
                    </div>
                    <!-- mini sparkline -->
                    <div class="prediction-sparkline">${sparkBars}</div>
                    <!-- day detail row -->
                    <div class="prediction-days">${dayRows}</div>
                    <!-- plain-language insight -->
                    <div class="prediction-insight"><span class="demand-level-chip ${demandLevel}">${demandLevelLabel}</span>&nbsp; ${insightText}</div>
                </div>`;
            }).join('');
        }

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        //  Actions
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

        async function runFullAnalysis() {
            // Manual trigger: POST /admin/inventory/analyze
            // This re-runs the rule engine against ALL medicines.
            // Normally NOT needed â€” the engine runs automatically after
            // every stock change.  This button is for:
            //   â€¢ Initial setup (after bulk CSV import)
            //   â€¢ Recovery (if alerts seem stale)
            //   â€¢ Research (force a full re-evaluation)
            showToast('Running full inventory analysis...', 'info');
            try {
                const res = await fetch('/admin/inventory/analyze', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    showToast(`Analysis complete: ${data.analysis.alerts_generated} alert(s) generated`, 'success');
                    // Reload all data
                    loadDashboard();
                    loadAlerts();
                    loadStock();
                } else {
                    showToast(data.message || 'Analysis failed', 'error');
                }
            } catch (e) {
                showToast('Error running analysis', 'error');
            }
        }

        async function resolveAlert(alertId) {
            // Marks an alert as resolved (is_resolved = True).
            // This is a MANUAL action â€” the admin acknowledges the alert.
            // NOTE: On the next stock change for this medicine, the rule
            // engine will delete old alerts and re-evaluate from scratch.
            // So resolved alerts are automatically cleaned up.
            try {
                const res = await fetch(`/admin/inventory/alerts/${alertId}/resolve`, { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    showToast('Alert resolved', 'success');
                    loadAlerts();
                    loadDashboard();
                } else {
                    showToast(data.message || 'Failed to resolve', 'error');
                }
            } catch (e) {
                showToast('Error resolving alert', 'error');
            }
        }

        async function deleteStock(stockId, medicineName) {
            // Permanently removes a medicine from inventory.
            // This deletes the MedicineStock record AND all associated alerts.
            // Historical purchase records are NOT affected (kept for audit).
            if (!confirm(`Delete "${medicineName}" from inventory?\n\nThis will remove the stock record and all its alerts.\nHistorical purchase records will be kept.`)) {
                return;
            }

            try {
                const res = await fetch(`/admin/inventory/stock/${stockId}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    showToast(`${medicineName} deleted (${data.alerts_removed} alert(s) removed)`, 'success');
                    // Reload all sections to reflect the deletion
                    loadDashboard();
                    loadAlerts();
                    loadStock();
                } else {
                    showToast(data.message || 'Failed to delete', 'error');
                }
            } catch (e) {
                showToast('Error deleting medicine', 'error');
            }
        }

        async function editReorderLevel() {
            // DEPRECATED â€” replaced by openEditStockModal()
        }

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        //  Edit Stock Modal
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

        function openEditStockModal(encodedData) {
            // Decode the stock data and pre-populate the edit form.
            const data = JSON.parse(decodeURIComponent(encodedData));
            document.getElementById('editStockId').value = data.id;
            document.getElementById('editStockTitle').textContent = data.medicine_name;
            document.getElementById('editCurrentStock').value = data.current_stock;
            document.getElementById('editReorderLevel').value = data.reorder_level || '';
            document.getElementById('editCategory').value = data.category || '';
            document.getElementById('editExpiryDate').value = data.expiry_date || '';
            document.getElementById('editStockModal').classList.add('active');
        }

        function closeEditStockModal() {
            document.getElementById('editStockModal').classList.remove('active');
        }

        // Close modal on backdrop click
        document.getElementById('editStockModal').addEventListener('click', function(e) {
            if (e.target === this) closeEditStockModal();
        });

        // Close modals on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                if (document.getElementById('editStockModal').classList.contains('active')) closeEditStockModal();
                if (document.getElementById('addStockModal').classList.contains('active')) closeAddStockModal();
            }
        });

        async function submitEditStock() {
            // Sends PUT to /admin/inventory/stock/<id> with the updated fields.
            // The backend automatically re-runs inventory analysis after the update,
            // so alerts will be refreshed based on the new stock/reorder values.
            const stockId = document.getElementById('editStockId').value;
            const payload = {};

            // Only send fields that were filled in, so partial edits work.
            const currentStock = document.getElementById('editCurrentStock').value;
            if (currentStock !== '') payload.current_stock = parseInt(currentStock);

            const reorderLevel = document.getElementById('editReorderLevel').value;
            if (reorderLevel !== '') payload.reorder_level = parseInt(reorderLevel);

            const category = document.getElementById('editCategory').value;
            payload.category = category || null;

            const expiryDate = document.getElementById('editExpiryDate').value;
            payload.expiry_date = expiryDate || null;

            try {
                const res = await fetch(`/admin/inventory/stock/${stockId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const data = await res.json();
                if (data.success) {
                    showToast(`${data.medicine_name} updated \u2014 Stock: ${data.current_stock}`, 'success');
                    closeEditStockModal();
                    // Reload everything â€” analysis already ran on the server side
                    loadDashboard();
                    loadAlerts();
                    loadStock();
                } else {
                    showToast(data.message || 'Failed to update', 'error');
                }
            } catch (e) {
                showToast('Error updating stock', 'error');
            }
        }

        function filterAlerts(severity, btnEl) {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btnEl.classList.add('active');

            if (severity === 'all') {
                renderAlertsTable(allAlerts);
            } else {
                renderAlertsTable(allAlerts.filter(a => a.severity === severity));
            }
        }

        function exportAlerts() {
            if (!allAlerts.length) {
                showToast('No alerts to export', 'info');
                return;
            }

            const headers = ['Medicine', 'Category', 'Alert Type', 'Severity', 'Stock', 'Message'];
            const rows = allAlerts.map(a => [
                a.medicine_name, a.medicine_category || '', a.alert_type,
                a.severity, a.current_stock, `"${a.message}"`
            ]);
            const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `inventory_alerts_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
            URL.revokeObjectURL(url);
            showToast('Alerts exported as CSV', 'success');
        }

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        //  Add Stock Modal
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

        function openAddStockModal() { document.getElementById('addStockModal').classList.add('active'); }
        function closeAddStockModal() { document.getElementById('addStockModal').classList.remove('active'); }

        // Close modal on backdrop click
        document.getElementById('addStockModal').addEventListener('click', function(e) {
            if (e.target === this) closeAddStockModal();
        });

        async function submitStock(e) {
            // Sends POST to /admin/inventory/stock.
            // The backend will:
            //   1. Insert or update the medicine_stock row.
            //   2. AUTOMATICALLY run trigger_inventory_analysis().
            //   3. Return the updated stock level + analysis results.
            // After success, we re-fetch dashboard + alerts + stock
            // to reflect the changes on this page instantly.
            e.preventDefault();
            const payload = {
                medicine_name: document.getElementById('stockMedicineName').value.trim(),
                quantity: parseInt(document.getElementById('stockQuantity').value),
                unit_price: document.getElementById('stockUnitPrice').value || null,
                category: document.getElementById('stockCategory').value || null,
                expiry_date: document.getElementById('stockExpiryDate').value || null,
                reorder_level: document.getElementById('stockReorderLevel').value
                    ? parseInt(document.getElementById('stockReorderLevel').value)
                    : null,
                supplier: document.getElementById('stockSupplier').value.trim() || null,
            };

            try {
                const res = await fetch('/admin/inventory/stock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const data = await res.json();

                if (data.success) {
                    showToast(`${data.action === 'added' ? 'Added' : 'Restocked'} ${data.medicine_name} \u2014 Stock: ${data.new_stock_level}`, 'success');
                    closeAddStockModal();
                    document.getElementById('addStockForm').reset();
                    // Reload everything (analysis already ran on server side)
                    loadDashboard();
                    loadAlerts();
                    loadStock();
                } else {
                    showToast(data.message || 'Failed to add stock', 'error');
                }
            } catch (e) {
                showToast('Error adding stock', 'error');
            }
        }

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        //  Helpers
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

        function formatAlertType(type) {
            return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }

        function showToast(message, type = 'info') {
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
            toast.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 3500);
        }
    
