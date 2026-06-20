/**
 * BAC 2027 - Analytics Enhancer (Chart.js)
 * 📊 الآن يعتمد على بيانات واردة من app.js بدلاً من استدعاء API بنفسه
 */

// Store chart instances for cleanup
const charts = {};

/**
 * Destroy all existing charts
 */
function destroyAllCharts() {
    Object.values(charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            try { chart.destroy(); } catch (e) { /* ignore */ }
        }
    });
    charts.progress = null;
    charts.hours = null;
    charts.subjects = null;
    charts.productivity = null;
}

/**
 * Render all charts using Chart.js
 * @param {Object} data - البيانات القادمة من /api/analytics
 */
function renderAllCharts(data) {
    destroyAllCharts();

    const progress = data.progress;
    const dailyLogs = data.dailyLogs || [];

    // 1. تقدم المواد (Bar Chart)
    const progressCanvas = document.getElementById('progress-chart');
    if (progressCanvas && progress.subjects) {
        const subjects = progress.subjects;
        const labels = subjects.map(s => s.nameLatin);
        const values = subjects.map(s => s.progress);

        charts.progress = new Chart(progressCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'التقدم (%)',
                    data: values,
                    backgroundColor: 'rgba(0, 212, 170, 0.8)',
                    borderColor: 'rgba(0, 212, 170, 1)',
                    borderWidth: 2,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
                }
            }
        });
    }

    // 2. ساعات الدراسة (Line Chart)
    const hoursCanvas = document.getElementById('hours-chart');
    if (hoursCanvas && dailyLogs.length > 0) {
        const labels = dailyLogs.map(l => {
            const d = new Date(l.date + 'T12:00:00');
            return `${d.getDate()}/${d.getMonth() + 1}`;
        }).reverse();
        const values = dailyLogs.map(l => Math.round((l.totalMinutes || 0) / 60 * 10) / 10).reverse();

        charts.hours = new Chart(hoursCanvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'ساعات الدراسة',
                    data: values,
                    borderColor: '#4d96ff',
                    backgroundColor: 'rgba(77, 150, 255, 0.2)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointBackgroundColor: '#4d96ff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => v + 'h' } }
                }
            }
        });
    }

    // 3. توزيع المواد (Doughnut Chart)
    const distCanvas = document.getElementById('subject-distribution-chart');
    if (distCanvas && progress.subjects) {
        const subjects = progress.subjects;
        const colors = ['#00d4aa', '#4d96ff', '#ff9f40', '#ff6384', '#9966ff', '#ffcd56', '#c9cbcf', '#36a2eb'];
        
        charts.subjects = new Chart(distCanvas, {
            type: 'doughnut',
            data: {
                labels: subjects.map(s => s.nameLatin),
                datasets: [{
                    data: subjects.map(s => s.totalCount || 1),
                    backgroundColor: colors.slice(0, subjects.length),
                    borderWidth: 2,
                    borderColor: '#1a1a2e'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'right', labels: { font: { size: 11 } } }
                }
            }
        });
    }

    // 4. الإنتاجية (Bar Chart)
    const prodCanvas = document.getElementById('productivity-chart');
    if (prodCanvas && dailyLogs.length > 0) {
        const last7Days = [];
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            last7Days.push(d.toISOString().split('T')[0]);
        }

        const labels = last7Days.map(d => {
            const dt = new Date(d + 'T12:00:00');
            return `${dt.getDate()}/${dt.getMonth() + 1}`;
        });
        const values = last7Days.map(d => {
            const log = dailyLogs.find(l => l.date === d);
            return log ? (log.productivityScore || 0) : 0;
        });

        charts.productivity = new Chart(prodCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'مؤشر الإنتاجية',
                    data: values,
                    backgroundColor: 'rgba(255, 159, 64, 0.7)',
                    borderColor: 'rgba(255, 159, 64, 1)',
                    borderWidth: 2,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, max: 10, ticks: { stepSize: 2 } }
                }
            }
        });
    }
}

// تصدير الدالة للنطاق العالمي
window.AnalyticsEnhancer = {
    renderAll: renderAllCharts
};