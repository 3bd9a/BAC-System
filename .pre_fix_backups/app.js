/**
 * BAC 2027 Intelligent Study Operating System
 * 🧠 Frontend Application - Client-side Logic
 */

const API_BASE = '';

// ============================================================
// 📦 POMODORO MODULES
// ============================================================
let settingsManager = null;
let audioManager = null;
let notificationManager = null;
let statisticsManager = null;
let pomodoroTimer = null;

async function loadPomodoroModules() {
    try {
        const settingsMod = await import('./pomodoro/pomodoro-settings.js');
        settingsManager = settingsMod.settingsManager;

        const audioMod = await import('./pomodoro/audio-manager.js');
        audioManager = audioMod.audioManager;

        const notifMod = await import('./pomodoro/notifications.js');
        notificationManager = notifMod.notificationManager;

        const statsMod = await import('./pomodoro/statistics.js');
        statisticsManager = statsMod.statisticsManager;

        const timerMod = await import('./pomodoro/pomodoro-timer.js');
        pomodoroTimer = timerMod.pomodoroTimer;
    } catch (e) {
        console.warn('Pomodoro modules failed to load, using fallback legacy timer:', e);
    }
}

// ============================================================
// 📦 STATE MANAGEMENT
// ============================================================
const state = {
    subjects: [],
    dashboard: null,
    tasks: JSON.parse(localStorage.getItem('bac_tasks') || '[]'),
    pomodoro: {
        sessions: JSON.parse(localStorage.getItem('bac_pomodoro') || '0'),
        todaySessions: JSON.parse(localStorage.getItem('bac_pomodoro_today') || '0'),
        lastDate: localStorage.getItem('bac_pomodoro_date') || ''
    },
    currentPage: 'dashboard',
    theme: localStorage.getItem('bac_theme') || 'dark'
};

// ============================================================
// 🚀 INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    console.log('🚀 Initializing BAC 2027 System...');
    try {
        // Set current date
        const now = new Date();
        const dateStr = now.toLocaleDateString('ar-DZ', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        document.getElementById('current-date').textContent = dateStr;

        // Set default date in daily log
        document.getElementById('log-date').value = now.toISOString().split('T')[0];

        // Apply theme
        if (state.theme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            document.getElementById('toggle-theme').textContent = '☀️';
        }

        // Setup event listeners
        setupNavigation();
        setupThemeToggle();
        setupDailyLogForm();
        setupPomodoro();
        setupTasks();
        setupSearch();
        setupKnowledgeGraph();
        setupOfflineMode();

        console.log('📊 Loading dashboard...');
        // Load data
        const dashPromise = loadDashboard();
        const subjectsPromise = loadSubjects();
        await Promise.all([dashPromise, subjectsPromise]);

        console.log('✅ Data loaded, switching view...');
        // Hide loading, show dashboard
        document.getElementById('loading').classList.remove('active');
        document.getElementById('page-dashboard').classList.add('active');
        console.log('🎉 App initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        document.getElementById('loading').innerHTML = `
            <div class="loading-container">
                <div style="color: var(--danger); font-size: 48px; margin-bottom: 16px;">⚠️</div>
                <h2>فشل تحميل النظام</h2>
                <p style="color: var(--text-secondary); font-size: 13px; max-width: 400px; text-align: center; margin-top: 8px;">
                    ${error.message}<br>
                    تأكد من تشغيل السيرفر على http://localhost:3000
                </p>
                <button onclick="location.reload()" class="btn-primary" style="margin-top: 16px;">🔄 إعادة المحاولة</button>
            </div>
        `;
    }
}

// ============================================================
// 🔄 API HELPERS
// ============================================================
// تعديل: حماية دوال Fetch API للتحقق من صحة الاستجابة قبل معالجتها
// إضافة: AbortController مع مهلة 10 ثوانٍ لمنع التجميد
const FETCH_TIMEOUT = 10000; // 10 seconds

async function apiGet(endpoint) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        const res = await fetch(`${API_BASE}${endpoint}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) {
            const text = await res.text();
            let errorMsg = `HTTP ${res.status}`;
            try {
                const errJson = JSON.parse(text);
                errorMsg = errJson.error || errorMsg;
            } catch (_) {}
            return { success: false, error: errorMsg };
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return await res.json();
        }
        return { success: false, error: 'Invalid response content-type from server' };
    } catch (e) {
        console.error('API GET error:', e);
        if (e.name === 'AbortError') {
            return { success: false, error: 'انتهت مهلة الطلب (10 ثوانٍ)' };
        }
        return { success: false, error: e.message };
    }
}

async function apiPost(endpoint, data) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
            const text = await res.text();
            let errorMsg = `HTTP ${res.status}`;
            try {
                const errJson = JSON.parse(text);
                errorMsg = errJson.error || errorMsg;
            } catch (_) {}
            return { success: false, error: errorMsg };
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return await res.json();
        }
        return { success: false, error: 'Invalid response content-type from server' };
    } catch (e) {
        console.error('API POST error:', e);
        if (e.name === 'AbortError') {
            return { success: false, error: 'انتهت مهلة الطلب (10 ثوانٍ)' };
        }
        return { success: false, error: e.message };
    }
}

// ============================================================
// 🧭 NAVIGATION
// ============================================================
function setupNavigation() {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(page) {
    // Handle SRS pages (separate HTML files)
    if (page === 'flashcards') {
        window.location.href = 'cards.html';
        return;
    }
    if (page === 'review') {
        window.location.href = 'review.html';
        return;
    }

    // Update sidebar
    document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`.menu-item[data-page="${page}"]`)?.classList.add('active');

    // Update page visibility
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`)?.classList.add('active');

    state.currentPage = page;

    // Load page-specific data
    if (page === 'analytics') loadAnalytics();
    if (page === 'subjects') loadSubjectsView();
    if (page === 'tasks') renderTasks();
}

// ============================================================
// 🌗 THEME TOGGLE
// ============================================================
function setupThemeToggle() {
    document.getElementById('toggle-theme').addEventListener('click', () => {
        const newTheme = state.theme === 'dark' ? 'light' : 'dark';
        state.theme = newTheme;
        document.documentElement.setAttribute('data-theme', newTheme);
        document.getElementById('toggle-theme').textContent = newTheme === 'dark' ? '🌙' : '☀️';
        localStorage.setItem('bac_theme', newTheme);
    });
}

// ============================================================
// 📊 DASHBOARD
// ============================================================
async function loadDashboard() {
    const result = await apiGet('/api/dashboard');
    if (!result.success) {
        showToast('فشل تحميل البيانات', 'error');
        return;
    }

    state.dashboard = result.data;
    renderDashboard(result.data);
}

function renderDashboard(data) {
    // BAC Readiness Score
    const bac = data.bacReadiness;
    document.getElementById('bac-score-display').textContent = `${bac.score}/100`;
    document.getElementById('bac-progress-fill').style.width = `${bac.score}%`;
    
    // Sidebar score
    document.querySelector('.mini-score-value').textContent = bac.score;

    // BAC Breakdown
    const breakdownEl = document.getElementById('bac-breakdown');
    breakdownEl.innerHTML = Object.entries(bac.breakdown).map(([key, val]) => `
        <div class="breakdown-item">
            <div class="value">${val}</div>
            <div class="label">${getBreakdownLabel(key)}</div>
        </div>
    `).join('');

    // Weak points
    const weakEl = document.getElementById('bac-weak-points');
    weakEl.innerHTML = bac.weakPoints.length > 0 
        ? bac.weakPoints.map(w => `<div>⚠️ ${w}</div>`).join('')
        : '<div style="background: rgba(107,203,119,0.1); border-right-color: var(--success)">✅ لا توجد نقاط ضعف ملحوظة</div>';

    // Recommendations
    const recEl = document.getElementById('bac-recommendations');
    recEl.innerHTML = bac.recommendations.map(r => `<div>💡 ${r}</div>`).join('');

    // Stats row
    document.getElementById('stat-total-lessons').textContent = data.progress.totalLessons;
    document.getElementById('stat-completed').textContent = data.progress.completedLessons;
    document.getElementById('stat-progress').textContent = `${data.progress.overallProgress}%`;
    document.getElementById('stat-review-needed').textContent = data.progress.reviewNeededCount;
    
    // Streak
    document.getElementById('streak-display').textContent = `🔥 ${data.streak} يوم`;

    // Today summary
    renderTodaySummary(data.today);

    // Suggestions
    renderSuggestions(data.suggestion);

    // Reviews today
    renderReviews(data.reviewsToday);

    // Subject progress bars
    renderSubjectBars(data.progress.subjects);
}

function getBreakdownLabel(key) {
    const labels = {
        coverage: 'تغطية البرنامج',
        review: 'المراجعات',
        consistency: 'الاستمرارية',
        hours: 'ساعات الدراسة',
        tasks: 'إنجاز المهام'
    };
    return labels[key] || key;
}

function renderTodaySummary(today) {
    const el = document.getElementById('today-content');
    if (!today) {
        el.innerHTML = `<p class="empty-state">لم يتم تسجيل أي نشاط اليوم 😴</p>
            <button class="btn-primary" onclick="navigateTo('daily-log')">📝 سجل الآن</button>`;
        return;
    }
    
    const totalHours = Math.floor(today.totalMinutes / 60);
    const totalMins = today.totalMinutes % 60;
    
    // Safe DOM creation instead of innerHTML for XSS protection
    el.textContent = '';
    
    const statRow = document.createElement('div');
    statRow.className = 'stat-row';
    statRow.style.marginBottom = '10px';
    statRow.innerHTML = `<div>⏱️ ${totalHours}h ${totalMins}m</div>
        <div>⭐ ${'⭐'.repeat(Math.round(today.productivityScore/2))}</div>`;
    el.appendChild(statRow);
    
    const subjectDiv = document.createElement('div');
    subjectDiv.style.cssText = 'font-size:13px;color:var(--text-secondary)';
    
    (today.subjects || []).forEach(s => {
        const text = document.createElement('div');
        text.textContent = `📖 ${s.name}: ${(s.lessons || []).join(', ')}`;
        subjectDiv.appendChild(text);
    });
    
    el.appendChild(subjectDiv);
}

function renderSuggestions(suggestion) {
    const el = document.getElementById('suggestion-content');
    if (!suggestion || !suggestion.suggestedSubject) {
        el.innerHTML = `<p class="empty-state">تحليل البيانات قيد التشغيل...</p>`;
        return;
    }
    
    let html = '';
    if (suggestion.suggestedLesson) {
        html += `<div class="suggestion-item">
            <span class="subject-icon">${suggestion.suggestedSubject.icon}</span>
            <div>
                <div class="lesson-name">${suggestion.suggestedLesson.name}</div>
                <div style="font-size:12px;color:var(--text-muted)">${suggestion.suggestedSubject.name}</div>
            </div>
        </div>`;
    }
    
    if (suggestion.reviewQueue?.length > 0) {
        html += `<div style="margin-top:8px;font-size:13px;color:var(--text-muted)">
            🔄 ${suggestion.reviewQueue.length} دروس تحتاج مراجعة
        </div>`;
    }
    
    el.innerHTML = html || `<p class="empty-state">${suggestion.message || 'كل شيء على ما يرام 🎉'}</p>`;
}

function renderReviews(reviews) {
    const el = document.getElementById('review-content');
    if (!reviews || reviews.length === 0) {
        el.innerHTML = `<p class="empty-state">✅ لا توجد مراجعات مطلوبة اليوم</p>`;
        return;
    }
    
    el.innerHTML = reviews.map(r => `
        <div class="review-item">
            <span>${r.subjectIcon || '📖'}</span>
            <div>
                <div class="review-subject">${r.subject}</div>
                <div class="review-name">${r.lesson}</div>
            </div>
            <span class="review-overdue">${isOverdue(r.nextReview) ? '⚠️ متأخرة' : ''}</span>
        </div>
    `).join('');
}

function isOverdue(dateStr) {
    if (!dateStr) return false;
    const today = new Date();
    const reviewDate = new Date(dateStr);
    return reviewDate < today;
}

function renderSubjectBars(subjects) {
    const el = document.getElementById('subjects-progress-list');
    el.innerHTML = subjects.map(s => {
        const color = s.progress >= 70 ? 'var(--success)' : s.progress >= 40 ? 'var(--warning)' : 'var(--danger)';
        return `
            <div style="margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:2px">
                    <span>${s.icon} ${s.name}</span>
                    <span>${s.progress}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-bar-fill" style="width:${s.progress}%;background:${color}"></div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// 📝 DAILY LOG FORM
// ============================================================
function setupDailyLogForm() {
    document.getElementById('add-subject-btn').addEventListener('click', addSubjectEntry);
    document.getElementById('add-task-btn').addEventListener('click', addTaskEntry);
    document.getElementById('add-goal-btn').addEventListener('click', addGoalEntry);
    document.getElementById('daily-log-form').addEventListener('submit', saveDailyLog);

    // Empty the container and create first row programmatically (with proper events)
    const container = document.getElementById('subjects-log-container');
    container.innerHTML = '';
    addSubjectEntry(); // creates first row with events wired
}

//polyfill: منع تكرار الطلبات باستخدام متغير subjectsPromise
let subjectsPromise = null;

async function populateSubjectSelects(targetSelect) {
    // استخدام وعد جارٍ لتجنب الطلبات المتكررة
    if (!subjectsPromise) {
        subjectsPromise = apiGet('/api/subjects');
    }
    
    const result = await subjectsPromise;
    if (result.success && result.data) {
        state.subjects = result.data;
    }

    if (state.subjects.length === 0) {
        // Fallback: returned empty, release promise so next call can retry
        subjectsPromise = null;
    }

    const optionHtml = '<option value="">اختر المادة</option>' +
        state.subjects.map(s => `<option value="${s.id}">${s.icon} ${s.name}</option>`).join('');

    if (targetSelect) {
        // Only populate the specified select (preserves other selections)
        targetSelect.innerHTML = optionHtml;
    } else {
        // Populate all (initial call)
        document.querySelectorAll('.subject-select').forEach(select => {
            select.innerHTML = optionHtml;
        });
    }
}

function addSubjectEntry() {
    const container = document.getElementById('subjects-log-container');
    const entry = document.createElement('div');
    entry.className = 'subject-log-entry';
    entry.innerHTML = `
        <select class="form-input subject-select" style="flex:2">
            <option value="">اختر المادة</option>
        </select>
        <select class="form-input subject-lesson" style="flex:3">
            <option value="">اختر الدرس</option>
        </select>
        <input type="number" class="form-input subject-minutes" placeholder="الدقائق" style="flex:1" min="0">
        <input type="text" class="form-input subject-notes" placeholder="ملاحظات" style="flex:2">
        <button type="button" class="btn-remove-subject btn-icon">❌</button>
    `;
    container.appendChild(entry);

    // Only populate the NEW entry's select (preserves other rows' selections)
    const newSelect = entry.querySelector('.subject-select');
    populateSubjectSelects(newSelect);
    setupSubjectChangeHandler(entry);

    entry.querySelector('.btn-remove-subject').addEventListener('click', () => {
        entry.remove();
    });
}

/**
 * When subject changes, dynamically load lessons into the lesson dropdown
 */
function setupSubjectChangeHandler(entry) {
    const subjectSelect = entry.querySelector('.subject-select');
    const lessonSelect = entry.querySelector('.subject-lesson');

    if (!subjectSelect || !lessonSelect) return;

    subjectSelect.addEventListener('change', () => {
        const subjectId = subjectSelect.value;
        const previousLesson = lessonSelect.value;
        const subject = state.subjects.find(s => s.id === subjectId);

        lessonSelect.innerHTML = '<option value="">اختر الدرس</option>';

        if (subject && subject.chapters) {
            for (const chapter of subject.chapters) {
                if (chapter.lessons && chapter.lessons.length > 0) {
                    const group = document.createElement('optgroup');
                    group.label = chapter.name;
                    for (const lesson of chapter.lessons) {
                        const option = document.createElement('option');
                        option.value = lesson.name;
                        option.textContent = `${lesson.name}`;
                        group.appendChild(option);
                    }
                    lessonSelect.appendChild(group);
                }
            }
        }
        
        // إعادة تحديد الدرس السابق إن كان متوفراً في المادة الجديدة
        if (previousLesson) {
            lessonSelect.value = previousLesson;
        }
    });
}

function addTaskEntry() {
    const container = document.getElementById('tasks-completed-container');
    const entry = document.createElement('div');
    entry.className = 'task-entry';
    entry.innerHTML = `<input type="text" class="form-input" placeholder="أضف مهمة منجزة">`;
    container.appendChild(entry);
}

function addGoalEntry() {
    const container = document.getElementById('goals-container');
    const entry = document.createElement('div');
    entry.className = 'goal-entry';
    entry.innerHTML = `<input type="text" class="form-input" placeholder="هدف للغد">`;
    container.appendChild(entry);
}

async function saveDailyLog(e) {
    e.preventDefault();
    const btn = document.getElementById('save-daily-btn');
    const status = document.getElementById('save-status');
    
    btn.disabled = true;
    btn.textContent = '⏳ جاري الحفظ...';

    // Gather data
    const subjectEntries = document.querySelectorAll('.subject-log-entry');
    const subjects = [];
    let totalMinutes = 0;

    subjectEntries.forEach(entry => {
        const select = entry.querySelector('.subject-select');
        const lesson = entry.querySelector('.subject-lesson').value;
        const minutes = parseInt(entry.querySelector('.subject-minutes').value) || 0;
        const notes = entry.querySelector('.subject-notes').value;

        if (select.value && lesson) {
            subjects.push({
                id: select.value,
                name: select.options[select.selectedIndex].text.replace(/^[^\s]+\s/, ''),
                lesson: lesson,
                minutes: minutes,
                notes: notes
            });
            totalMinutes += minutes;
        }
    });

    const taskInputs = document.querySelectorAll('#tasks-completed-container .task-entry input');
    const tasksCompleted = Array.from(taskInputs).map(i => i.value).filter(v => v.trim());

    const goalInputs = document.querySelectorAll('#goals-container .goal-entry input');
    const tomorrowGoals = Array.from(goalInputs).map(i => i.value).filter(v => v.trim());

    const data = {
        date: document.getElementById('log-date').value,
        mood: document.getElementById('log-mood').value,
        productivityScore: parseInt(document.getElementById('log-productivity').value) || 5,
        totalMinutes: totalMinutes,
        subjects: subjects,
        tasksCompleted: tasksCompleted,
        tomorrowGoals: tomorrowGoals
    };

    const result = await apiPost('/api/daily/save', data);

    if (result.success) {
        status.textContent = '✅ تم الحفظ بنجاح!';
        status.style.color = 'var(--success)';
        showToast(`✅ ${result.message}`);
        
        // Refresh dashboard
        await loadDashboard();
        
        // Reset form after 2 seconds
        setTimeout(() => {
            status.textContent = '';
            btn.disabled = false;
            btn.textContent = '💾 حفظ اليوم';
        }, 2000);
    } else {
        status.textContent = `❌ ${result.error}`;
        status.style.color = 'var(--danger)';
        btn.disabled = false;
        btn.textContent = '💾 حفظ اليوم';
    }
}

// ============================================================
// 📚 SUBJECTS VIEW
// ============================================================
async function loadSubjects() {
    const result = await apiGet('/api/subjects');
    if (result.success) {
        state.subjects = result.data;
    }
}

async function loadSubjectsView() {
    const grid = document.getElementById('subjects-grid');
    const result = await apiGet('/api/subjects');
    
    if (!result.success) {
        grid.innerHTML = '<p class="empty-state">فشل تحميل المواد</p>';
        return;
    }

    state.subjects = result.data;

    grid.innerHTML = result.data.map((s, index) => {
        const color = s.progress >= 70 ? 'var(--success)' : s.progress >= 40 ? 'var(--warning)' : 'var(--danger)';
        return `
            <div class="subject-card" onclick="showSubjectDetail(${index})">
                <div class="subject-card-header">
                    <span class="subject-card-icon">${s.icon}</span>
                    <div>
                        <div class="subject-card-title">${s.name}</div>
                        <div style="font-size:12px;color:var(--text-muted)">${s.nameLatin}</div>
                    </div>
                </div>
                <div class="subject-card-progress">
                    <div class="progress-bar">
                        <div class="progress-bar-fill" style="width:${s.progress}%;background:${color}"></div>
                    </div>
                    <div class="subject-card-stats">
                        <span>${s.progress}%</span>
                        <span>${getCompletedCount(s)}/${getTotalCount(s)} درس</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getCompletedCount(subject) {
    let count = 0;
    (subject.chapters || []).forEach(c => count += c.completedCount);
    return count;
}

function getTotalCount(subject) {
    let count = 0;
    (subject.chapters || []).forEach(c => count += c.totalCount);
    return count;
}

function showSubjectDetail(index) {
    const subject = state.subjects[index];
    if (!subject) return;

    const modal = document.getElementById('subject-detail');
    document.getElementById('subject-detail-title').textContent = `${subject.icon} ${subject.name}`;

    const body = document.getElementById('subject-detail-body');
    
    if (!subject.chapters || subject.chapters.length === 0) {
        body.innerHTML = '<p class="empty-state">لا توجد دروس متاحة بعد</p>';
    } else {
        body.innerHTML = subject.chapters.map(chapter => `
            <div class="chapter-section">
                <div class="chapter-title">${chapter.name}</div>
                ${chapter.lessons.map(lesson => `
                    <div class="lesson-item" onclick="toggleLessonStatus(${index}, '${escapeStr(lesson.name)}')">
                        <span class="lesson-status-btn">${getStatusSymbol(lesson.status)}</span>
                        <span class="lesson-name">${lesson.name}</span>
                        <span class="lesson-status-badge badge-${lesson.status}">${getStatusLabel(lesson.status)}</span>
                    </div>
                `).join('')}
            </div>
        `).join('');
    }

    modal.style.display = 'flex';

    // Close modal handlers
    modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}

// تعديل: حماية من XSS عبر تحويل الأحرف الخطرة إلى كيانات HTML
// يمنع حقن أكواد HTML/JS داخل النصوص التي تعرض في الـ Modals
function escapeStr(str) {
    if (typeof str !== 'string') return '';
    const escapeMap = {
        '&': '&',
        '<': '<',
        '>': '>',
        '"': '"',
        "'": '&#x27;',
        '/': '&#x2F;'
    };
    return str.replace(/[&<>"'\/]/g, char => escapeMap[char]);
}

function getStatusSymbol(status) {
    const symbols = {
        'not_started': '❌',
        'in_progress': '⏳',
        'completed': '✔',
        'review_needed': '🔁'
    };
    return symbols[status] || '❌';
}

function getStatusLabel(status) {
    const labels = {
        'not_started': 'لم يبدأ',
        'in_progress': 'قيد الدراسة',
        'completed': 'تم',
        'review_needed': 'مراجعة'
    };
    return labels[status] || status;
}

async function toggleLessonStatus(subjectIndex, lessonName) {
    const subject = state.subjects[subjectIndex];
    if (!subject) return;

    // Find current status
    let currentStatus = 'not_started';
    for (const chapter of subject.chapters || []) {
        const lesson = chapter.lessons.find(l => l.name === lessonName);
        if (lesson) {
            currentStatus = lesson.status;
            break;
        }
    }

    // Cycle status
    const statusCycle = ['not_started', 'in_progress', 'completed', 'review_needed', 'not_started'];
    const nextIndex = statusCycle.indexOf(currentStatus) + 1;
    const newStatus = statusCycle[nextIndex] || 'not_started';

    const result = await apiPost('/api/lessons/update', {
        subjectId: subject.id,
        lessonName: lessonName,
        status: newStatus
    });

    if (result.success) {
        showToast(`✅ ${result.message}`);
        // Refresh
        await loadSubjects();
        showSubjectDetail(subjectIndex);
        await loadDashboard();
    } else {
        showToast(`❌ ${result.error}`, 'error');
    }
}

// ============================================================
// 📈 ANALYTICS
// ============================================================
async function loadAnalytics() {
    const result = await apiGet('/api/analytics');
    if (!result.success) return;

    renderAnalyticsStats(result.data);
    renderProgressChart(result.data.progress);
    renderHoursChart(result.data.dailyLogs);
}

function renderAnalyticsStats(data) {
    const el = document.getElementById('analytics-stats');
    const weeklyHours = Math.round(data.weeklyMinutes / 60);
    const avgHours = Math.round(data.avgDailyMinutes / 60 * 10) / 10;

    el.innerHTML = `
        <div class="analytics-stat-item">
            <div class="value">${data.progress.overallProgress}%</div>
            <div class="label">التقدم العام</div>
        </div>
        <div class="analytics-stat-item">
            <div class="value">${weeklyHours}h</div>
            <div class="label">ساعات هذا الأسبوع</div>
        </div>
        <div class="analytics-stat-item">
            <div class="value">${avgHours}h</div>
            <div class="label">المعدل اليومي</div>
        </div>
        <div class="analytics-stat-item">
            <div class="value">${data.progress.completedLessons}</div>
            <div class="label">دروس مكتملة</div>
        </div>
        <div class="analytics-stat-item">
            <div class="value">${data.progress.totalLessons}</div>
            <div class="label">إجمالي الدروس</div>
        </div>
        <div class="analytics-stat-item">
            <div class="value">${data.progress.reviewNeededCount}</div>
            <div class="label">دروس للمراجعة</div>
        </div>
    `;
}

function renderProgressChart(progress) {
    const canvas = document.getElementById('progress-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Check valid canvas dimensions before drawing
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;
    
    canvas.width = w * 2;
    canvas.height = h * 2;
    ctx.scale(2, 2);

    const padding = 40;
    const chartW = w - padding * 2;
    const chartH = h - padding * 2;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Subjects data
    const subjects = progress.subjects || [];
    const names = subjects.map(s => s.nameLatin.substring(0, 3));
    const values = subjects.map(s => s.progress);

    // Background
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(padding, padding, chartW, chartH);

    // Bars
    const barWidth = chartW / subjects.length * 0.6;
    const gap = chartW / subjects.length;

    values.forEach((val, i) => {
        const x = padding + gap * i + (gap - barWidth) / 2;
        const barH = (val / 100) * chartH;
        const y = padding + chartH - barH;

        // Bar
        const gradient = ctx.createLinearGradient(x, y, x, padding + chartH);
        gradient.addColorStop(0, '#00d4aa');
        gradient.addColorStop(1, '#004d3a');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barH);

        // Label
        ctx.fillStyle = '#a0a0b8';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(names[i], x + barWidth / 2, padding + chartH + 14);

        // Value on top
        ctx.fillStyle = '#00d4aa';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(`${val}%`, x + barWidth / 2, y - 4);
    });
}

function renderHoursChart(dailyLogs) {
    const canvas = document.getElementById('hours-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;
    
    canvas.width = w * 2;
    canvas.height = h * 2;
    ctx.scale(2, 2);

    const padding = 40;
    const chartW = w - padding * 2;
    const chartH = h - padding * 2;

    ctx.clearRect(0, 0, w, h);

    const hours = dailyLogs.map(l => Math.round((l.totalMinutes || 0) / 60 * 10) / 10).reverse();
    const dates = dailyLogs.map(l => {
        const d = new Date(l.date + 'T12:00:00');
        return `${d.getDate()}/${d.getMonth() + 1}`;
    }).reverse();

    if (hours.length === 0) {
        ctx.fillStyle = '#6c6c8a';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('لا توجد بيانات بعد', w / 2, h / 2);
        return;
    }

    const maxVal = Math.max(6, ...hours);
    const pointSpacing = chartW / Math.max(1, hours.length - 1);

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = '#4d96ff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    hours.forEach((val, i) => {
        const x = padding + i * pointSpacing;
        const y = padding + chartH - (val / maxVal) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill area
    ctx.lineTo(padding + (hours.length - 1) * pointSpacing, padding + chartH);
    ctx.lineTo(padding, padding + chartH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(77, 150, 255, 0.1)';
    ctx.fill();

    // Draw points and labels
    hours.forEach((val, i) => {
        const x = padding + i * pointSpacing;
        const y = padding + chartH - (val / maxVal) * chartH;

        // Point
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#4d96ff';
        ctx.fill();

        // Date label
        if (i % 2 === 0 || i === hours.length - 1) {
            ctx.fillStyle = '#6c6c8a';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(dates[i] || '', x, padding + chartH + 14);
        }

        // Value
        ctx.fillStyle = '#4d96ff';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(`${val}h`, x, y - 8);
    });
}

// ============================================================
// ⏱️ POMODORO TIMER (v3 - modular)
// ============================================================
function setupPomodoro() {
    let isFocusMode = false;
    let settingsOpen = false;

    // Reset today sessions if new day
    const today = new Date().toDateString();
    if (state.pomodoro.lastDate !== today) {
        state.pomodoro.todaySessions = 0;
        state.pomodoro.lastDate = today;
        savePomodoroState();
    }

    // If new modular timer loaded, bind it
    if (pomodoroTimer) {
        const updateUI = () => {
            document.getElementById('pomodoro-timer').textContent = pomodoroTimer.getFormattedTime();
            document.getElementById('pomodoro-label').textContent = pomodoroTimer.getLabel();
            document.getElementById('pomodoro-today').textContent = pomodoroTimer.getTodaySessionsCount();
            document.getElementById('pomodoro-total').textContent = state.pomodoro.sessions + pomodoroTimer.cycleCount;
            updateModeButtons(pomodoroTimer.state);
        };

        pomodoroTimer.onTick = () => updateUI();
        pomodoroTimer.onComplete = async () => {
            state.pomodoro.sessions++;
            state.pomodoro.todaySessions++;
            savePomodoroState();
            updateUI();
            renderPomodoroChart();
            showToast('🎉 انتهت الجلسة! خذ استراحة');
            // Sync total display if needed
            document.getElementById('pomodoro-total').textContent = state.pomodoro.sessions + pomodoroTimer.cycleCount;
        };
        pomodoroTimer.onStateChange = () => updateUI();

        updateUI();

        document.getElementById('pomodoro-start').addEventListener('click', () => {
            pomodoroTimer.start();
            if (!isFocusMode) { toggleFocusMode(true); isFocusMode = true; }
        });
        document.getElementById('pomodoro-pause').addEventListener('click', () => pomodoroTimer.pause());
        document.getElementById('pomodoro-reset').addEventListener('click', () => {
            pomodoroTimer.resetTimer();
            toggleFocusMode(false); isFocusMode = false;
        });
    } else {
        // Legacy timer fallback (existing behavior preserved)
        let timer = null;
        let totalMs = 25 * 60 * 1000;
        let remainingMs = totalMs;
        let lastTick = null;
        let isRunning = false;

        updateTimerDisplay();
        document.getElementById('pomodoro-today').textContent = state.pomodoro.todaySessions;
        document.getElementById('pomodoro-total').textContent = state.pomodoro.sessions;

        document.querySelectorAll('.pomodoro-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (isRunning) return;
                document.querySelectorAll('.pomodoro-mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                totalMs = parseInt(btn.dataset.minutes) * 60 * 1000;
                remainingMs = totalMs;
                updateTimerDisplay();
            });
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && isRunning) {
                const now = Date.now();
                const elapsed = now - lastTick;
                remainingMs = Math.max(0, remainingMs - elapsed);
                lastTick = now;
                updateTimerDisplay();
            }
        });

        document.getElementById('pomodoro-start').addEventListener('click', () => {
            if (isRunning) return;
            isRunning = true;
            lastTick = Date.now();
            if (!isFocusMode) { toggleFocusMode(true); isFocusMode = true; }
            timer = setInterval(() => {
                const now = Date.now();
                const elapsed = now - lastTick;
                lastTick = now;
                remainingMs = Math.max(0, remainingMs - elapsed);
                updateTimerDisplay();
                if (remainingMs <= 0) {
                    clearInterval(timer); isRunning = false;
                    state.pomodoro.sessions++; state.pomodoro.todaySessions++;
                    savePomodoroState();
                    document.getElementById('pomodoro-today').textContent = state.pomodoro.todaySessions;
                    document.getElementById('pomodoro-total').textContent = state.pomodoro.sessions;
                    showToast('🎉 انتهت الجلسة! خذ استراحة');
                }
            }, 200);
        });

        document.getElementById('pomodoro-pause').addEventListener('click', () => {
            clearInterval(timer); isRunning = false;
        });

        document.getElementById('pomodoro-reset').addEventListener('click', () => {
            clearInterval(timer); isRunning = false;
            toggleFocusMode(false); isFocusMode = false;
            totalMs = parseInt(document.querySelector('.pomodoro-mode-btn.active').dataset.minutes) * 60 * 1000;
            remainingMs = totalMs;
            updateTimerDisplay();
        });

        function updateTimerDisplay() {
            const totalSec = Math.ceil(remainingMs / 1000);
            const mins = Math.floor(totalSec / 60);
            const secs = totalSec % 60;
            document.getElementById('pomodoro-timer').textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
    }

    // Mode buttons (shared)
    document.querySelectorAll('.pomodoro-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (pomodoroTimer && pomodoroTimer.status !== 'idle') return;
            const mode = btn.dataset.mode;
            if (pomodoroTimer) {
                pomodoroTimer.setMode(mode);
            }
        });
    });

    // Settings modal
    const settingsBtn = document.getElementById('pomodoro-settings-btn');
    const settingsModal = document.getElementById('pomodoro-settings-modal');
    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', () => {
            settingsOpen = !settingsOpen;
            settingsModal.style.display = settingsOpen ? 'block' : 'none';
            if (settingsOpen) loadSettingsToModal();
        });
        settingsModal.querySelector('.close-modal').addEventListener('click', () => {
            settingsOpen = false;
            settingsModal.style.display = 'none';
        });
        document.getElementById('save-pomodoro-settings').addEventListener('click', saveSettingsFromModal);
    }

    // ESC key to exit focus mode
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isFocusMode) {
            toggleFocusMode(false);
            isFocusMode = false;
        }
    });

    function updateModeButtons(state) {
        document.querySelectorAll('.pomodoro-mode-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === state);
        });
    }

    function toggleFocusMode(active) {
        const sidebar = document.getElementById('sidebar');
        const topbar = document.getElementById('topbar');
        const app = document.getElementById('app');
        const pomContainer = document.querySelector('.pomodoro-container');

        if (active) {
            sidebar.style.display = 'none';
            topbar.style.display = 'none';
            document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
            const page = document.getElementById('page-pomodoro');
            if (page) {
                page.style.display = 'flex';
                page.style.alignItems = 'center';
                page.style.justifyContent = 'center';
                page.style.height = '100vh';
            }
            if (pomContainer) pomContainer.style.transform = 'scale(1.3)';
            app.style.background = 'var(--bg-primary)';
        } else {
            sidebar.style.display = '';
            topbar.style.display = '';
            document.querySelectorAll('.page').forEach(p => p.style.display = '');
            const page = document.getElementById('page-pomodoro');
            if (page) {
                page.style.height = '';
                page.style.alignItems = '';
                page.style.justifyContent = '';
            }
            if (pomContainer) pomContainer.style.transform = '';
            app.style.background = '';
        }
    }

    function loadSettingsToModal() {
        if (!settingsManager) return;
        const s = settingsManager.get();
        document.getElementById('setting-work').value = s.work;
        document.getElementById('setting-short-break').value = s.shortBreak;
        document.getElementById('setting-long-break').value = s.longBreak;
        document.getElementById('setting-sound-enabled').checked = s.soundEnabled;
        document.getElementById('setting-sound-volume').value = s.soundVolume;
        document.getElementById('setting-notifications-enabled').checked = s.notificationsEnabled;
    }

    function saveSettingsFromModal() {
        if (!settingsManager) return;
        const newSettings = {
            work: parseInt(document.getElementById('setting-work').value) || 25,
            shortBreak: parseInt(document.getElementById('setting-short-break').value) || 5,
            longBreak: parseInt(document.getElementById('setting-long-break').value) || 15,
            soundEnabled: document.getElementById('setting-sound-enabled').checked,
            soundVolume: parseFloat(document.getElementById('setting-sound-volume').value),
            notificationsEnabled: document.getElementById('setting-notifications-enabled').checked,
        };
        settingsManager.update(newSettings);

        // Re-init timer config
        if (pomodoroTimer) {
            pomodoroTimer._initDefaults();
            pomodoroTimer.resetTimer();
        }

        settingsOpen = false;
        document.getElementById('pomodoro-settings-modal').style.display = 'none';
        showToast('✅ تم حفظ الإعدادات');
        renderPomodoroChart();
    }

    // Initial chart render
    renderPomodoroChart();
}

function renderPomodoroChart() {
    if (!statisticsManager) return;
    const canvas = document.getElementById('pomodoro-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const daily = statisticsManager.getDailyStats(14);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * 2;
    canvas.height = h * 2;
    ctx.scale(2, 2);

    const padding = { top: 20, right: 20, bottom: 30, left: 40 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    if (daily.length === 0) {
        ctx.fillStyle = '#6c6c8a';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('لا توجد بيانات بعد', w / 2, h / 2);
        return;
    }

    const maxSessions = Math.max(1, ...daily.map(d => d.sessions));
    const barWidth = chartW / daily.length * 0.6;
    const gap = chartW / daily.length;

    daily.forEach((d, i) => {
        const x = padding.left + gap * i + (gap - barWidth) / 2;
        const barH = (d.sessions / maxSessions) * chartH;
        const y = padding.top + chartH - barH;

        const gradient = ctx.createLinearGradient(x, y, x, padding.top + chartH);
        gradient.addColorStop(0, '#00d4aa');
        gradient.addColorStop(1, '#004d3a');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barH);

        // Label
        const dateObj = new Date(d.date + 'T12:00:00');
        const label = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
        ctx.fillStyle = '#a0a0b8';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + barWidth / 2, padding.top + chartH + 14);

        // Value
        if (d.sessions > 0) {
            ctx.fillStyle = '#00d4aa';
            ctx.font = 'bold 9px sans-serif';
            ctx.fillText(d.sessions, x + barWidth / 2, y - 4);
        }
    });
}

function savePomodoroState() {
    localStorage.setItem('bac_pomodoro', state.pomodoro.sessions);
    localStorage.setItem('bac_pomodoro_today', state.pomodoro.todaySessions);
    localStorage.setItem('bac_pomodoro_date', state.pomodoro.lastDate);
}

// ============================================================
// ✅ TASKS
// ============================================================
function setupTasks() {
    document.getElementById('add-task-btn-main').addEventListener('click', addNewTask);
    document.getElementById('new-task-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addNewTask();
    });
}

function addNewTask() {
    const input = document.getElementById('new-task-input');
    const type = document.getElementById('new-task-type').value;
    const text = input.value.trim();

    if (!text) return;

    state.tasks.push({
        id: Date.now(),
        text: text,
        type: type,
        completed: false,
        createdAt: new Date().toISOString()
    });

    input.value = '';
    saveTasks();
    renderTasks();
    showToast('✅ تم إضافة المهمة');
}

function renderTasks() {
    const el = document.getElementById('tasks-list');

    if (state.tasks.length === 0) {
        el.innerHTML = '<p class="empty-state">لا توجد مهام بعد</p>';
        return;
    }

    // Use DOM API instead of innerHTML for XSS protection
    el.textContent = '';
    state.tasks.forEach(task => {
        const item = document.createElement('div');
        item.className = `tasks-list-item ${task.completed ? 'task-completed' : ''}`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'task-checkbox';
        checkbox.checked = task.completed;
        checkbox.addEventListener('change', () => toggleTask(task.id));

        const textSpan = document.createElement('span');
        textSpan.className = 'task-text';
        textSpan.textContent = task.text;

        const badge = document.createElement('span');
        badge.className = 'task-type-badge';
        badge.textContent = getTaskTypeLabel(task.type);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'task-delete-btn';
        deleteBtn.textContent = '✕';
        deleteBtn.addEventListener('click', () => deleteTask(task.id));

        item.appendChild(checkbox);
        item.appendChild(textSpan);
        item.appendChild(badge);
        item.appendChild(deleteBtn);
        el.appendChild(item);
    });
}

function toggleTask(id) {
    const task = state.tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        saveTasks();
        renderTasks();
    }
}

function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    saveTasks();
    renderTasks();
}

function getTaskTypeLabel(type) {
    const labels = { daily: 'يومية', weekly: 'أسبوعية', review: 'مراجعة', exam: 'امتحان' };
    return labels[type] || type;
}

function saveTasks() {
    localStorage.setItem('bac_tasks', JSON.stringify(state.tasks));
}

// ============================================================
// 🔍 SEARCH
// ============================================================
function setupSearch() {
    document.getElementById('search-btn').addEventListener('click', performSearch);
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
}

// ============================================================
// 🧠 KNOWLEDGE GRAPH
// ============================================================
let knowledgeGraphData = null;
let selectedNode = null;

function setupKnowledgeGraph() {
    const loadBtn = document.getElementById('load-graph-btn');
    if (loadBtn) {
        loadBtn.addEventListener('click', loadKnowledgeGraph);
    }

    const canvas = document.getElementById('knowledge-graph-canvas');
    if (canvas) {
        canvas.addEventListener('click', handleGraphClick);
    }
}

async function loadKnowledgeGraph() {
    const statsEl = document.getElementById('graph-stats');
    const btn = document.getElementById('load-graph-btn');
    btn.disabled = true;
    btn.textContent = '⏳ جاري التحميل...';
    statsEl.textContent = '';

    try {
        const result = await apiGet('/api/vault/graph');
        if (!result.success) {
            showToast('فشل تحميل الرسم البياني', 'error');
            return;
        }

        knowledgeGraphData = result.data;
        const graph = knowledgeGraphData;

        statsEl.textContent = `📊 ${graph.nodes.length} عقدة | ${graph.edges.length} رابط`;

        drawKnowledgeGraph(graph);
        showToast(`✅ تم تحميل ${graph.nodes.length} عقدة و ${graph.edges.length} رابط`);
    } catch (e) {
        showToast('فشل تحميل الرسم البياني', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔄 تحميل الرسم البياني';
    }
}

function drawKnowledgeGraph(graph) {
    const canvas = document.getElementById('knowledge-graph-canvas');
    if (!canvas || !graph) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // الإعدادات الأساسية
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim() || '#1e1e32';
    ctx.fillRect(0, 0, w, h);

    if (graph.nodes.length === 0) {
        ctx.fillStyle = '#6c6c8a';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('لا توجد بيانات متاحة', w / 2, h / 2);
        return;
    }

    // توزيع العقد في دائرة
    const centerX = w / 2;
    const centerY = h / 2;
    const radius = Math.min(w, h) * 0.35;
    const nodeMap = new Map();

    graph.nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / graph.nodes.length;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        nodeMap.set(node.id, { x, y, node });
    });

    // رسم الروابط
    ctx.strokeStyle = 'rgba(100,100,140,0.3)';
    ctx.lineWidth = 1;
    for (const edge of graph.edges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (source && target) {
            ctx.beginPath();
            ctx.moveTo(source.x, source.y);
            ctx.lineTo(target.x, target.y);
            ctx.stroke();
        }
    }

    // رسم العقد
    for (const [id, { x, y, node }] of nodeMap) {
        let color = '#4a90e2';
        let radius = 6;

        if (node.type === 'tag') {
            color = '#50c878';
            radius = 8;
        } else if (node.unresolved) {
            color = '#888';
            radius = 4;
        }

        // ظل
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(x + 2, y + 2, radius, 0, Math.PI * 2);
        ctx.fill();

        // العقدة
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // الحدود
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // النص
        ctx.fillStyle = '#ddd';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        const label = node.type === 'tag' ? `#${node.name}` : (node.path ? node.path.split('/').pop() : node.id);
        ctx.fillText(label, x, y - radius - 6);
    }
}

function handleGraphClick(e) {
    const canvas = document.getElementById('knowledge-graph-canvas');
    if (!canvas || !knowledgeGraphData) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // البحث عن أقرب عقدة
    const w = canvas.width;
    const h = canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const radius = Math.min(w, h) * 0.35;

    let closest = null;
    let minDist = 20; // مسافة الحد الأدنى

    knowledgeGraphData.nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / knowledgeGraphData.nodes.length;
        const nx = centerX + radius * Math.cos(angle);
        const ny = centerY + radius * Math.sin(angle);
        const dist = Math.sqrt((x - nx) ** 2 + (y - ny) ** 2);
        if (dist < minDist) {
            minDist = dist;
            closest = node;
        }
    });

    const detailsEl = document.getElementById('graph-details');
    const contentEl = document.getElementById('graph-details-content');

    if (closest) {
        selectedNode = closest;
        detailsEl.style.display = 'block';

        let html = `
            <div style="margin-bottom:8px">
                <strong>${closest.type === 'tag' ? '🏷️ ' : '📄 '}${closest.id}</strong>
                <span class="badge-${closest.type}">${closest.type}</span>
            </div>
        `;

        if (closest.path) {
            html += `<div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">📁 ${closest.path}</div>`;
        }
        if (closest.frontmatter && Object.keys(closest.frontmatter).length > 0) {
            html += `<div style="font-size:12px;margin-bottom:4px">📋 Frontmatter: ${JSON.stringify(closest.frontmatter).substring(0, 100)}</div>`;
        }
        if (closest.tags && closest.tags.length > 0) {
            html += `<div style="font-size:12px;margin-bottom:4px">🏷️ الوسوم: ${closest.tags.map(t => '#' + t).join(' ')}</div>`;
        }
        if (closest.wordCount) {
            html += `<div style="font-size:12px;margin-bottom:4px">📝 عدد الكلمات: ${closest.wordCount}</div>`;
        }

        // الروابط
        const links = knowledgeGraphData.edges.filter(e => e.source === closest.id || e.target === closest.id);
        if (links.length > 0) {
            html += `<div style="font-size:12px;margin-top:8px">🔗 الروابط (${links.length}):</div><ul style="font-size:11px;max-height:120px;overflow-y:auto">`;
            links.slice(0, 20).forEach(l => {
                const other = l.source === closest.id ? l.target : l.source;
                html += `<li>${l.relation}: ${other}</li>`;
            });
            html += '</ul>';
        }

        contentEl.innerHTML = html;
    } else {
        detailsEl.style.display = 'none';
    }
}

// ============================================================
// ✅ TASKS
// ============================================================

async function performSearch() {
    const query = document.getElementById('search-input').value.trim();
    const resultsEl = document.getElementById('search-results');

    if (!query || query.length < 2) {
        resultsEl.innerHTML = '<p class="empty-state">اكتب كلمتين على الأقل للبحث</p>';
        return;
    }

    resultsEl.innerHTML = '<div class="loading-spinner" style="width:24px;height:24px;margin:20px auto"></div>';

    const result = await apiGet(`/api/search?q=${encodeURIComponent(query)}`);

    if (!result.success || !result.data || result.data.length === 0) {
        resultsEl.innerHTML = '<p class="empty-state">لا توجد نتائج</p>';
        return;
    }

    // Use safe DOM creation instead of innerHTML
    resultsEl.textContent = '';
    result.data.forEach(item => {
        const container = document.createElement('div');
        container.className = 'search-result-item';

        const pathDiv = document.createElement('div');
        pathDiv.className = 'search-result-path';
        pathDiv.textContent = `📁 ${item.path}`;

        const nameDiv = document.createElement('div');
        nameDiv.className = 'search-result-name';
        nameDiv.textContent = item.name;

        container.appendChild(pathDiv);
        container.appendChild(nameDiv);

        item.matches.forEach(m => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'search-result-line';
            lineDiv.textContent = `سطر ${m.line}: `;

            // Safely create highlighted text using DOM
            const textNode = document.createTextNode(m.text);
            const markNode = document.createElement('mark');
            markNode.textContent = m.text;
            lineDiv.appendChild(markNode);
            container.appendChild(lineDiv);
        });

        resultsEl.appendChild(container);
    });
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// � TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ============================================================
// 📡 OFFLINE MODE & LIVE SYNC (SSE)
// ============================================================
function setupOfflineMode() {
    // Show offline indicator if no server
    if (!navigator.onLine) {
        showOfflineIndicator();
    }

    window.addEventListener('online', () => {
        hideOfflineIndicator();
        showToast('✅ تم استعادة الاتصال');
        loadDashboard();
    });

    window.addEventListener('offline', () => {
        showOfflineIndicator();
        showToast('⚠️ أنت الآن offline - يمكنك القراءة فقط', 'error');
    });

    // Connect to SSE for live updates
    connectSSE();
    
    // Update connection status indicator
    updateConnectionStatus();
}

function updateConnectionStatus() {
    const statusEl = document.getElementById('connection-status');
    if (!statusEl) return;
    
    if (navigator.onLine) {
        statusEl.style.display = 'inline';
        statusEl.style.background = 'var(--success)';
        statusEl.textContent = '🟢';
    } else {
        statusEl.style.display = 'inline';
        statusEl.style.background = 'var(--danger)';
        statusEl.textContent = '🔴';
    }
}

function connectSSE() {
    const eventSource = new EventSource('/api/events');
    
    eventSource.onopen = () => {
        console.log('📡 SSE connected');
        hideOfflineIndicator();
        updateConnectionStatus();
    };

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleSSEEvent(data);
        } catch (e) {
            console.error('SSE parse error:', e);
        }
    };

    eventSource.onerror = (err) => {
        console.error('SSE error:', err);
        eventSource.close();
        // Retry after 5 seconds
        setTimeout(connectSSE, 5000);
    };
}

function handleSSEEvent(data) {
    switch (data.type) {
        case 'vault-changed':
            console.log('📁 Vault changed:', data.action, data.path);
            // Reload dashboard data when vault changes
            if (state.currentPage === 'dashboard') {
                loadDashboard();
            }
            if (state.currentPage === 'subjects') {
                loadSubjectsView();
            }
            break;
        case 'daily_log_saved':
            console.log('📝 Daily log saved:', data.date);
            if (state.currentPage === 'dashboard') {
                loadDashboard();
            }
            break;
        case 'lesson_updated':
            console.log('📚 Lesson updated:', data.lesson, data.status);
            // Refresh subjects if viewing them
            if (state.currentPage === 'subjects') {
                loadSubjectsView();
            }
            break;
        case 'connected':
            console.log('✅ SSE connected');
            break;
    }
}

function showOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
        indicator.classList.add('show');
    }
}

function hideOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
        indicator.classList.remove('show');
    }
}

// Make functions global for onclick handlers
window.showSubjectDetail = showSubjectDetail;
window.toggleLessonStatus = toggleLessonStatus;
window.toggleTask = toggleTask;
window.deleteTask = deleteTask;
window.navigateTo = navigateTo;
