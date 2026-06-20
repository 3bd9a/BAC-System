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
function safeParseLocalStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
        console.warn('Failed to parse localStorage key "' + key + '":', e);
        return fallback;
    }
}

// ============================================================
// 🔒 SECURITY UTILITIES (FIXED)
// ============================================================
/**
 * Sanitize text for safe HTML rendering - escapes HTML special characters
 * Prevents XSS attacks by escaping dangerous characters
 */
function sanitizeHTML(text) {
    if (typeof text !== 'string') return '';
    var escapeMap = {
        '&': '&amp;',   // ✅ تم الإصلاح هنا
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;'
    };
    return text.replace(/[&<>"']/g, function(char) { return escapeMap[char]; });
}

// ✅ تم حذف دالة setSafeHTML من هنا لتجنب التعارض مع utils.js
// الآن نعتمد على setSafeHTML الموجودة في utils.js والتي تستخدم textContent الآمن

function getLocalStorageString(key, fallback) {
    if (fallback === undefined) fallback = '';
    try {
        return localStorage.getItem(key) || fallback;
    } catch (e) {
        console.warn('Failed to read localStorage key "' + key + '":', e);
        return fallback;
    }
}

var state = {
    subjects: [],
    dashboard: null,
    tasks: safeParseLocalStorage('bac_tasks', []),
    pomodoro: {
        sessions: safeParseLocalStorage('bac_pomodoro', 0),
        todaySessions: safeParseLocalStorage('bac_pomodoro_today', 0),
        lastDate: getLocalStorageString('bac_pomodoro_date', '')
    },
    currentPage: 'dashboard',
    theme: getLocalStorageString('bac_theme', 'dark')
};

// ============================================================
// 🚀 INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    initApp();
});

async function initApp() {
    console.log('🚀 Initializing BAC 2027 System...');
    try {
        var now = new Date();
        var dateStr = now.toLocaleDateString('ar-DZ', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        document.getElementById('current-date').textContent = dateStr;

        document.getElementById('log-date').value = now.toISOString().split('T')[0];

        if (state.theme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            document.getElementById('toggle-theme').textContent = '☀️';
        }

        setupNavigation();
        setupThemeToggle();
        setupDailyLogForm();
        await loadPomodoroModules();
        setupPomodoro();
        setupTasks();
        setupSearch();
        setupKnowledgeGraph();
        setupOfflineMode();

        console.log('📊 Loading dashboard...');
        var dashPromise = loadDashboard();
        var subjectsPromise = loadSubjects();
        await Promise.all([dashPromise, subjectsPromise]);

        console.log('✅ Data loaded, switching view...');
        document.getElementById('loading').classList.remove('active');
        document.getElementById('page-dashboard').classList.add('active');
        console.log('🎉 App initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        var loadEl = document.getElementById('loading');
        loadEl.innerHTML = '<div class="loading-container">' +
            '<div style="color: var(--danger); font-size: 48px; margin-bottom: 16px;">⚠️</div>' +
            '<h2>فشل تحميل النظام</h2>' +
            '<p style="color: var(--text-secondary); font-size: 13px; max-width: 400px; text-align: center; margin-top: 8px;">' +
            error.message + '<br>تأكد من تشغيل السيرفر على http://localhost:3000</p>' +
            '<button onclick="location.reload()" class="btn-primary" style="margin-top: 16px;">🔄 إعادة المحاولة</button>' +
            '</div>';
    }
}

// ============================================================
// 🔄 API HELPERS (Unified) - EXPOSED GLOBALLY
// ============================================================
var FETCH_TIMEOUT = 10000;

/**
 * Unified API request function
 */
async function apiRequest(method, endpoint, data) {
    try {
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, FETCH_TIMEOUT);
        
        var options = {
            method: method,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (method === 'POST' && data) {
            options.body = JSON.stringify(data);
        }

        var res = await fetch(API_BASE + endpoint, options);
        clearTimeout(timeoutId);

        if (!res.ok) {
            var text = await res.text();
            var errorMsg = 'HTTP ' + res.status;
            try {
                var errJson = JSON.parse(text);
                errorMsg = errJson.error || errorMsg;
            } catch (_) { }
            return { success: false, error: errorMsg };
        }

        var contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return await res.json();
        }
        return { success: false, error: 'Invalid response content-type from server' };
    } catch (e) {
        console.error('API ' + method + ' error:', e);
        if (e.name === 'AbortError') {
            return { success: false, error: 'انتهت مهلة الطلب (10 ثواني)' };
        }
        return { success: false, error: e.message };
    }
}

async function apiGet(endpoint) {
    return await apiRequest('GET', endpoint);
}

async function apiPost(endpoint, data) {
    return await apiRequest('POST', endpoint, data);
}

// ✅ ربط دوال API بالـ Window ليتمكن analytics-enhancer من استخدامها
window.apiGet = apiGet;
window.apiPost = apiPost;

// ============================================================
// 🧭 NAVIGATION
// ============================================================
function setupNavigation() {
    document.querySelectorAll('.menu-item').forEach(function(item) {
        item.addEventListener('click', function() {
            var page = item.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(page) {
    if (page === 'flashcards') {
        window.location.href = 'cards.html';
        return;
    }
    if (page === 'review') {
        window.location.href = 'review.html';
        return;
    }

    document.querySelectorAll('.menu-item').forEach(function(i) { i.classList.remove('active'); });
    var menuItem = document.querySelector('.menu-item[data-page="' + page + '"]');
    if (menuItem) menuItem.classList.add('active');

    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    var pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');

    state.currentPage = page;

    if (page === 'analytics') loadAnalytics();
    if (page === 'subjects') loadSubjectsView();
    if (page === 'tasks') renderTasks();
}

// ============================================================
// 🌗 THEME TOGGLE
// ============================================================
function setupThemeToggle() {
    document.getElementById('toggle-theme').addEventListener('click', function() {
        var newTheme = state.theme === 'dark' ? 'light' : 'dark';
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
    var result = await apiGet('/api/dashboard');
    if (!result.success) {
        showToast('فشل تحميل البيانات', 'error');
        return;
    }

    state.dashboard = result.data;
    renderDashboard(result.data);
}

function renderDashboard(data) {
    var bac = data.bacReadiness;
    document.getElementById('bac-score-display').textContent = bac.score + '/100';
    document.getElementById('bac-progress-fill').style.width = bac.score + '%';
    
    document.querySelector('.mini-score-value').textContent = bac.score;

    var breakdownEl = document.getElementById('bac-breakdown');
    breakdownEl.textContent = '';
    var breakdownEntries = Object.entries(bac.breakdown);
    for (var i = 0; i < breakdownEntries.length; i++) {
        var key = breakdownEntries[i][0];
        var val = breakdownEntries[i][1];
        var item = document.createElement('div');
        item.className = 'breakdown-item';
        var valueDiv = document.createElement('div');
        valueDiv.className = 'value';
        valueDiv.textContent = val;
        var labelDiv = document.createElement('div');
        labelDiv.className = 'label';
        labelDiv.textContent = getBreakdownLabel(key);
        item.appendChild(valueDiv);
        item.appendChild(labelDiv);
        breakdownEl.appendChild(item);
    }

    var weakEl = document.getElementById('bac-weak-points');
    weakEl.textContent = '';
    if (bac.weakPoints.length > 0) {
        for (var w = 0; w < bac.weakPoints.length; w++) {
            var weakDiv = document.createElement('div');
            weakDiv.textContent = '⚠️ ' + bac.weakPoints[w];
            weakEl.appendChild(weakDiv);
        }
    } else {
        var noWeakDiv = document.createElement('div');
        noWeakDiv.style.cssText = 'background: rgba(107,203,119,0.1); border-right-color: var(--success)';
        noWeakDiv.textContent = '✅ لا توجد نقاط ضعف ملحوظة';
        weakEl.appendChild(noWeakDiv);
    }

    var recEl = document.getElementById('bac-recommendations');
    recEl.textContent = '';
    for (var r = 0; r < bac.recommendations.length; r++) {
        var recDiv = document.createElement('div');
        recDiv.textContent = '💡 ' + bac.recommendations[r];
        recEl.appendChild(recDiv);
    }

    document.getElementById('stat-total-lessons').textContent = data.progress.totalLessons;
    document.getElementById('stat-completed').textContent = data.progress.completedLessons;
    document.getElementById('stat-progress').textContent = data.progress.overallProgress + '%';
    document.getElementById('stat-review-needed').textContent = data.progress.reviewNeededCount;
    
    document.getElementById('streak-display').textContent = '🔥 ' + data.streak + ' يوم';

    renderTodaySummary(data.today);
    renderSuggestions(data.suggestion);
    renderReviews(data.reviewsToday);
    renderSubjectBars(data.progress.subjects);
}

function getBreakdownLabel(key) {
    var labels = {
        coverage: 'تغطية البرنامج',
        review: 'المراجعات',
        consistency: 'الاستمرارية',
        hours: 'ساعات الدراسة',
        tasks: 'إنجاز المهام'
    };
    return labels[key] || key;
}

function renderTodaySummary(today) {
    var el = document.getElementById('today-content');
    if (!today) {
        el.innerHTML = '<p class="empty-state">لم يتم تسجيل أي نشاط اليوم 😴</p>';
        return;
    }
    
    var totalHours = Math.floor(today.totalMinutes / 60);
    var totalMins = today.totalMinutes % 60;
    
    el.textContent = '';
    
    var statRow = document.createElement('div');
    statRow.className = 'stat-row';
    statRow.style.marginBottom = '10px';
    statRow.innerHTML = '<div>⏱️ ' + totalHours + 'h ' + totalMins + 'm</div>';
    el.appendChild(statRow);
    
    var subjectDiv = document.createElement('div');
    subjectDiv.style.cssText = 'font-size:13px;color:var(--text-secondary)';
    
    var subjects = today.subjects || [];
    for (var i = 0; i < subjects.length; i++) {
        var text = document.createElement('div');
        text.textContent = '📖 ' + subjects[i].name + ': ' + (subjects[i].lessons || []).join(', ');
        subjectDiv.appendChild(text);
    }
    
    el.appendChild(subjectDiv);
}

function renderSuggestions(suggestion) {
    var el = document.getElementById('suggestion-content');
    if (!suggestion || !suggestion.suggestedSubject) {
        el.innerHTML = '<p class="empty-state">تحليل البيانات قيد التشغيل...</p>';
        return;
    }
    
    el.textContent = '';
    
    if (suggestion.suggestedLesson) {
        var item = document.createElement('div');
        item.className = 'suggestion-item';
        var iconSpan = document.createElement('span');
        iconSpan.className = 'subject-icon';
        iconSpan.textContent = suggestion.suggestedSubject.icon;
        var infoDiv = document.createElement('div');
        var nameDiv = document.createElement('div');
        nameDiv.className = 'lesson-name';
        nameDiv.textContent = suggestion.suggestedLesson.name;
        var subDiv = document.createElement('div');
        subDiv.style.cssText = 'font-size:12px;color:var(--text-muted)';
        subDiv.textContent = suggestion.suggestedSubject.name;
        infoDiv.appendChild(nameDiv);
        infoDiv.appendChild(subDiv);
        item.appendChild(iconSpan);
        item.appendChild(infoDiv);
        el.appendChild(item);
    }
    
    if (suggestion.reviewQueue && suggestion.reviewQueue.length > 0) {
        var reviewDiv = document.createElement('div');
        reviewDiv.style.cssText = 'margin-top:8px;font-size:13px;color:var(--text-muted)';
        reviewDiv.textContent = '🔄 ' + suggestion.reviewQueue.length + ' دروس تحتاج مراجعة';
        el.appendChild(reviewDiv);
    }
}

function renderReviews(reviews) {
    var el = document.getElementById('review-content');
    if (!reviews || reviews.length === 0) {
        el.innerHTML = '<p class="empty-state">✅ لا توجد مراجعات مطلوبة اليوم</p>';
        return;
    }
    
    el.textContent = '';
    for (var i = 0; i < reviews.length; i++) {
        var r = reviews[i];
        var item = document.createElement('div');
        item.className = 'review-item';
        
        var iconSpan = document.createElement('span');
        iconSpan.textContent = r.subjectIcon || '📖';
        
        var infoDiv = document.createElement('div');
        var subjectDiv = document.createElement('div');
        subjectDiv.className = 'review-subject';
        subjectDiv.textContent = r.subject;
        var lessonDiv = document.createElement('div');
        lessonDiv.className = 'review-name';
        lessonDiv.textContent = r.lesson;
        infoDiv.appendChild(subjectDiv);
        infoDiv.appendChild(lessonDiv);
        
        var statusSpan = document.createElement('span');
        statusSpan.className = 'review-overdue';
        statusSpan.textContent = isOverdue(r.nextReview) ? '⚠️ متأخرة' : '';
        
        item.appendChild(iconSpan);
        item.appendChild(infoDiv);
        item.appendChild(statusSpan);
        el.appendChild(item);
    }
}

function isOverdue(dateStr) {
    if (!dateStr) return false;
    var today = new Date();
    var reviewDate = new Date(dateStr);
    return reviewDate < today;
}

function renderSubjectBars(subjects) {
    var el = document.getElementById('subjects-progress-list');
    el.textContent = '';
    for (var i = 0; i < subjects.length; i++) {
        var s = subjects[i];
        var color = s.progress >= 70 ? 'var(--success)' : s.progress >= 40 ? 'var(--warning)' : 'var(--danger)';
        
        var container = document.createElement('div');
        container.style.cssText = 'margin-bottom:8px';
        
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;font-size:13px;margin-bottom:2px';
        var nameSpan = document.createElement('span');
        nameSpan.textContent = s.icon + ' ' + s.name;
        var pctSpan = document.createElement('span');
        pctSpan.textContent = s.progress + '%';
        header.appendChild(nameSpan);
        header.appendChild(pctSpan);
        
        var barContainer = document.createElement('div');
        barContainer.className = 'progress-bar';
        var barFill = document.createElement('div');
        barFill.className = 'progress-bar-fill';
        barFill.style.cssText = 'width:' + s.progress + '%;background:' + color;
        barContainer.appendChild(barFill);
        
        container.appendChild(header);
        container.appendChild(barContainer);
        el.appendChild(container);
    }
}

// ============================================================
// 📝 DAILY LOG FORM
// ============================================================
function setupDailyLogForm() {
    document.getElementById('add-subject-btn').addEventListener('click', addSubjectEntry);
    document.getElementById('add-task-btn').addEventListener('click', addTaskEntry);
    document.getElementById('add-goal-btn').addEventListener('click', addGoalEntry);
    document.getElementById('daily-log-form').addEventListener('submit', saveDailyLog);

    var container = document.getElementById('subjects-log-container');
    container.textContent = '';
    addSubjectEntry();
}

var subjectsPromise = null;

async function populateSubjectSelects(targetSelect) {
    if (!subjectsPromise) {
        subjectsPromise = apiGet('/api/subjects');
    }
    
    var result = await subjectsPromise;
    if (result.success && result.data) {
        state.subjects = result.data;
    }

    if (state.subjects.length === 0) {
        subjectsPromise = null;
    }

    var optionHtml = '<option value="">اختر المادة</option>';
    for (var i = 0; i < state.subjects.length; i++) {
        var s = state.subjects[i];
        optionHtml += '<option value="' + s.id + '">' + s.icon + ' ' + s.name + '</option>';
    }

    if (targetSelect) {
        targetSelect.innerHTML = optionHtml;
    } else {
        document.querySelectorAll('.subject-select').forEach(function(select) {
            select.innerHTML = optionHtml;
        });
    }
}

function addSubjectEntry() {
    var container = document.getElementById('subjects-log-container');
    var entry = document.createElement('div');
    entry.className = 'subject-log-entry';
    entry.innerHTML = '\
        <select class="form-input subject-select" style="flex:2">\
            <option value="">اختر المادة</option>\
        </select>\
        <select class="form-input subject-lesson" style="flex:3">\
            <option value="">اختر الدرس</option>\
        </select>\
        <input type="number" class="form-input subject-minutes" placeholder="الدقائق" style="flex:1" min="0">\
        <input type="text" class="form-input subject-notes" placeholder="ملاحظات" style="flex:2">\
        <button type="button" class="btn-remove-subject btn-icon">❌</button>\
    ';
    container.appendChild(entry);

    var newSelect = entry.querySelector('.subject-select');
    populateSubjectSelects(newSelect);
    setupSubjectChangeHandler(entry);

    entry.querySelector('.btn-remove-subject').addEventListener('click', function() {
        entry.remove();
    });
}

function setupSubjectChangeHandler(entry) {
    var subjectSelect = entry.querySelector('.subject-select');
    var lessonSelect = entry.querySelector('.subject-lesson');

    if (!subjectSelect || !lessonSelect) return;

    subjectSelect.addEventListener('change', function() {
        var subjectId = subjectSelect.value;
        var previousLesson = lessonSelect.value;
        var subject = null;
        for (var i = 0; i < state.subjects.length; i++) {
            if (state.subjects[i].id === subjectId) {
                subject = state.subjects[i];
                break;
            }
        }

        lessonSelect.innerHTML = '<option value="">اختر الدرس</option>';

        if (subject && subject.chapters) {
            for (var c = 0; c < subject.chapters.length; c++) {
                var chapter = subject.chapters[c];
                if (chapter.lessons && chapter.lessons.length > 0) {
                    var group = document.createElement('optgroup');
                    group.label = chapter.name;
                    for (var l = 0; l < chapter.lessons.length; l++) {
                        var lesson = chapter.lessons[l];
                        var option = document.createElement('option');
                        option.value = lesson.name;
                        option.textContent = lesson.name;
                        group.appendChild(option);
                    }
                    lessonSelect.appendChild(group);
                }
            }
        }
        
        if (previousLesson) {
            lessonSelect.value = previousLesson;
        }
    });
}

function addTaskEntry() {
    var container = document.getElementById('tasks-completed-container');
    var entry = document.createElement('div');
    entry.className = 'task-entry';
    entry.innerHTML = '<input type="text" class="form-input" placeholder="أضف مهمة منجزة">';
    container.appendChild(entry);
}

function addGoalEntry() {
    var container = document.getElementById('goals-container');
    var entry = document.createElement('div');
    entry.className = 'goal-entry';
    entry.innerHTML = '<input type="text" class="form-input" placeholder="هدف للغد">';
    container.appendChild(entry);
}

async function saveDailyLog(e) {
    e.preventDefault();
    var btn = document.getElementById('save-daily-btn');
    var status = document.getElementById('save-status');
    
    btn.disabled = true;
    btn.textContent = '⏳ جاري الحفظ...';

    var subjectEntries = document.querySelectorAll('.subject-log-entry');
    var subjects = [];
    var totalMinutes = 0;

    subjectEntries.forEach(function(entry) {
        var select = entry.querySelector('.subject-select');
        var lesson = entry.querySelector('.subject-lesson').value;
        var minutes = parseInt(entry.querySelector('.subject-minutes').value) || 0;
        var notes = entry.querySelector('.subject-notes').value;

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

    var taskInputs = document.querySelectorAll('#tasks-completed-container .task-entry input');
    var tasksCompleted = [];
    for (var i = 0; i < taskInputs.length; i++) {
        var val = taskInputs[i].value.trim();
        if (val) tasksCompleted.push(val);
    }

    var goalInputs = document.querySelectorAll('#goals-container .goal-entry input');
    var tomorrowGoals = [];
    for (var j = 0; j < goalInputs.length; j++) {
        var goalVal = goalInputs[j].value.trim();
        if (goalVal) tomorrowGoals.push(goalVal);
    }

    var data = {
        date: document.getElementById('log-date').value,
        mood: document.getElementById('log-mood').value,
        productivityScore: parseInt(document.getElementById('log-productivity').value) || 5,
        totalMinutes: totalMinutes,
        subjects: subjects,
        tasksCompleted: tasksCompleted,
        tomorrowGoals: tomorrowGoals
    };

    var result = await apiPost('/api/daily/save', data);

    if (result.success) {
        status.textContent = '✅ تم الحفظ بنجاح!';
        status.style.color = 'var(--success)';
        showToast('✅ ' + result.message);
        
        await loadDashboard();
        
        setTimeout(function() {
            status.textContent = '';
            btn.disabled = false;
            btn.textContent = '💾 حفظ اليوم';
        }, 2000);
    } else {
        status.textContent = '❌ ' + result.error;
        status.style.color = 'var(--danger)';
        btn.disabled = false;
        btn.textContent = '💾 حفظ اليوم';
    }
}

// ============================================================
// 📚 SUBJECTS VIEW
// ============================================================
async function loadSubjects() {
    var result = await apiGet('/api/subjects');
    if (result.success) {
        state.subjects = result.data;
    }
}

async function loadSubjectsView() {
    var grid = document.getElementById('subjects-grid');
    var result = await apiGet('/api/subjects');
    
    if (!result.success) {
        grid.innerHTML = '<p class="empty-state">فشل تحميل المواد</p>';
        return;
    }

    state.subjects = result.data;

    grid.textContent = '';
    
    for (var i = 0; i < result.data.length; i++) {
        var s = result.data[i];
        var card = document.createElement('div');
        card.className = 'subject-card';
        card.addEventListener('click', createSubjectClickHandler(i));
        
        var color = s.progress >= 70 ? 'var(--success)' : s.progress >= 40 ? 'var(--warning)' : 'var(--danger)';
        
        card.innerHTML = '<div class="subject-card-header">' +
            '<span class="subject-card-icon">' + s.icon + '</span>' +
            '<div>' +
            '<div class="subject-card-title">' + s.name + '</div>' +
            '<div style="font-size:12px;color:var(--text-muted)">' + s.nameLatin + '</div>' +
            '</div></div>' +
            '<div class="subject-card-progress">' +
            '<div class="progress-bar">' +
            '<div class="progress-bar-fill" style="width:' + s.progress + '%;background:' + color + '"></div>' +
            '</div>' +
            '<div class="subject-card-stats"><span>' + s.progress + '%</span>' +
            '<span>' + getCompletedCount(s) + '/' + getTotalCount(s) + ' درس</span>' +
            '</div></div>';
        
        grid.appendChild(card);
    }
}

function createSubjectClickHandler(index) {
    return function() {
        showSubjectDetail(index);
    };
}

function getCompletedCount(subject) {
    var count = 0;
    var chapters = subject.chapters || [];
    for (var i = 0; i < chapters.length; i++) {
        count += chapters[i].completedCount || 0;
    }
    return count;
}

function getTotalCount(subject) {
    var count = 0;
    var chapters = subject.chapters || [];
    for (var i = 0; i < chapters.length; i++) {
        count += chapters[i].totalCount || 0;
    }
    return count;
}

function showSubjectDetail(index) {
    var subject = state.subjects[index];
    if (!subject) return;

    var modal = document.getElementById('subject-detail');
    document.getElementById('subject-detail-title').textContent = subject.icon + ' ' + subject.name;

    var body = document.getElementById('subject-detail-body');
    
    if (!subject.chapters || subject.chapters.length === 0) {
        body.innerHTML = '<p class="empty-state">لا توجد دروس متاحة بعد</p>';
    } else {
        var html = '';
        for (var c = 0; c < subject.chapters.length; c++) {
            var chapter = subject.chapters[c];
            html += '<div class="chapter-section">';
            html += '<div class="chapter-title">' + escapeStr(chapter.name) + '</div>';
            for (var l = 0; l < chapter.lessons.length; l++) {
                var lesson = chapter.lessons[l];
                html += '<div class="lesson-item" data-index="' + index + '" data-lesson="' + encodeURIComponent(lesson.name) + '">';
                html += '<span class="lesson-status-btn">' + getStatusSymbol(lesson.status) + '</span>';
                html += '<span class="lesson-name">' + escapeStr(lesson.name) + '</span>';
                html += '<span class="lesson-status-badge badge-' + lesson.status + '">' + getStatusLabel(lesson.status) + '</span>';
                html += '</div>';
            }
            html += '</div>';
        }
        body.innerHTML = html;
        
        var lessonItems = body.querySelectorAll('.lesson-item');
        for (var i = 0; i < lessonItems.length; i++) {
            (function(item) {
                item.addEventListener('click', function() {
                    var idx = parseInt(item.dataset.index);
                    var lessonName = decodeURIComponent(item.dataset.lesson);
                    toggleLessonStatus(idx, lessonName);
                });
            })(lessonItems[i]);
        }
    }

    modal.style.display = 'flex';

    modal.querySelector('.close-modal').onclick = function() { modal.style.display = 'none'; };
    modal.onclick = function(e) { if (e.target === modal) modal.style.display = 'none'; };
}

function escapeStr(str) {
    if (typeof str !== 'string') return '';
    var escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;'
    };
    return str.replace(/[&<>"']/g, function(char) { return escapeMap[char]; });
}

function getStatusSymbol(status) {
    var symbols = {
        'not_started': '❌',
        'in_progress': '⏳',
        'completed': '✔',
        'review_needed': '🔁'
    };
    return symbols[status] || '❌';
}

function getStatusLabel(status) {
    var labels = {
        'not_started': 'لم يبدأ',
        'in_progress': 'قيد الدراسة',
        'completed': 'تم',
        'review_needed': 'مراجعة'
    };
    return labels[status] || status;
}

async function toggleLessonStatus(subjectIndex, lessonName) {
    var subject = state.subjects[subjectIndex];
    if (!subject) return;

    var currentStatus = 'not_started';
    var chapters = subject.chapters || [];
    for (var c = 0; c < chapters.length; c++) {
        var lessons = chapters[c].lessons || [];
        for (var l = 0; l < lessons.length; l++) {
            if (lessons[l].name === lessonName) {
                currentStatus = lessons[l].status;
                break;
            }
        }
        if (currentStatus !== 'not_started') break;
    }

    var statusCycle = ['not_started', 'in_progress', 'completed', 'review_needed', 'not_started'];
    var nextIndex = statusCycle.indexOf(currentStatus) + 1;
    var newStatus = statusCycle[nextIndex] || 'not_started';

    var result = await apiPost('/api/lessons/update', {
        subjectId: subject.id,
        lessonName: lessonName,
        status: newStatus
    });

    if (result.success) {
        showToast('✅ ' + result.message);
        await loadSubjects();
        showSubjectDetail(subjectIndex);
        await loadDashboard();
    } else {
        showToast('❌ ' + result.error, 'error');
    }
}

// ============================================================
// 📈 ANALYTICS - 🔥 تم التعديل هنا لاستخدام Chart.js
// ============================================================
async function loadAnalytics() {
    var result = await apiGet('/api/analytics');
    if (!result.success) return;

    // ✅ الآن نمرر البيانات مباشرة إلى المحسن الذي يستخدم Chart.js
    if (window.AnalyticsEnhancer && typeof window.AnalyticsEnhancer.renderAll === 'function') {
        window.AnalyticsEnhancer.renderAll(result.data);
    } else {
        console.warn('AnalyticsEnhancer not loaded, falling back to manual render.');
        renderAnalyticsStats(result.data);
        // يمكن إضافة fallback هنا إذا أردت
    }
}

// تم الاحتفاظ بهذه الدالة كـ fallback لعرض الإحصائيات النصية فقط
function renderAnalyticsStats(data) {
    var el = document.getElementById('analytics-stats');
    var weeklyHours = Math.round(data.weeklyMinutes / 60);
    var avgHours = Math.round(data.avgDailyMinutes / 60 * 10) / 10;

    el.textContent = '';
    
    var stats = [
        { value: data.progress.overallProgress + '%', label: 'التقدم العام' },
        { value: weeklyHours + 'h', label: 'ساعات هذا الأسبوع' },
        { value: avgHours + 'h', label: 'المعدل اليومي' },
        { value: '' + data.progress.completedLessons, label: 'دروس مكتملة' },
        { value: '' + data.progress.totalLessons, label: 'إجمالي الدروس' },
        { value: '' + data.progress.reviewNeededCount, label: 'دروس للمراجعة' }
    ];
    
    for (var i = 0; i < stats.length; i++) {
        var item = document.createElement('div');
        item.className = 'analytics-stat-item';
        
        var valueDiv = document.createElement('div');
        valueDiv.className = 'value';
        valueDiv.textContent = stats[i].value;
        
        var labelDiv = document.createElement('div');
        labelDiv.className = 'label';
        labelDiv.textContent = stats[i].label;
        
        item.appendChild(valueDiv);
        item.appendChild(labelDiv);
        el.appendChild(item);
    }
}

function renderProgressChart(progress) {
    var canvas = document.getElementById('progress-chart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;
    
    canvas.width = w * 2;
    canvas.height = h * 2;
    ctx.scale(2, 2);

    var padding = 40;
    var chartW = w - padding * 2;
    var chartH = h - padding * 2;

    ctx.clearRect(0, 0, w, h);

    var subjects = progress.subjects || [];
    var names = subjects.map(function(s) { return s.nameLatin.substring(0, 3); });
    var values = subjects.map(function(s) { return s.progress; });

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(padding, padding, chartW, chartH);

    var barWidth = chartW / subjects.length * 0.6;
    var gap = chartW / subjects.length;

    values.forEach(function(val, i) {
        var x = padding + gap * i + (gap - barWidth) / 2;
        var barH = (val / 100) * chartH;
        var y = padding + chartH - barH;

        var gradient = ctx.createLinearGradient(x, y, x, padding + chartH);
        gradient.addColorStop(0, '#00d4aa');
        gradient.addColorStop(1, '#004d3a');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barH);

        ctx.fillStyle = '#a0a0b8';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(names[i], x + barWidth / 2, padding + chartH + 14);

        ctx.fillStyle = '#00d4aa';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(val + '%', x + barWidth / 2, y - 4);
    });
}

function renderHoursChart(dailyLogs) {
    var canvas = document.getElementById('hours-chart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;
    
    canvas.width = w * 2;
    canvas.height = h * 2;
    ctx.scale(2, 2);

    var padding = 40;
    var chartW = w - padding * 2;
    var chartH = h - padding * 2;

    ctx.clearRect(0, 0, w, h);

    var hours = dailyLogs.map(function(l) { return Math.round((l.totalMinutes || 0) / 60 * 10) / 10; }).reverse();
    var dates = dailyLogs.map(function(l) {
        var d = new Date(l.date + 'T12:00:00');
        return d.getDate() + '/' + (d.getMonth() + 1);
    }).reverse();

    if (hours.length === 0) {
        ctx.fillStyle = '#6c6c8a';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('لا توجد بيانات بعد', w / 2, h / 2);
        return;
    }

    var maxVal = Math.max(6, Math.max.apply(null, hours));
    var pointSpacing = chartW / Math.max(1, hours.length - 1);

    ctx.beginPath();
    ctx.strokeStyle = '#4d96ff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    hours.forEach(function(val, i) {
        var x = padding + i * pointSpacing;
        var y = padding + chartH - (val / maxVal) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.lineTo(padding + (hours.length - 1) * pointSpacing, padding + chartH);
    ctx.lineTo(padding, padding + chartH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(77, 150, 255, 0.1)';
    ctx.fill();

    hours.forEach(function(val, i) {
        var x = padding + i * pointSpacing;
        var y = padding + chartH - (val / maxVal) * chartH;

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#4d96ff';
        ctx.fill();

        if (i % 2 === 0 || i === hours.length - 1) {
            ctx.fillStyle = '#6c6c8a';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(dates[i] || '', x, padding + chartH + 14);
        }

        ctx.fillStyle = '#4d96ff';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(val + 'h', x, y - 8);
    });
}

// ============================================================
// ⏱️ POMODORO TIMER
// ============================================================
function setupPomodoro() {
    var isFocusMode = false;
    var settingsOpen = false;

    var today = new Date().toDateString();
    if (state.pomodoro.lastDate !== today) {
        state.pomodoro.todaySessions = 0;
        state.pomodoro.lastDate = today;
        savePomodoroState();
    }

    if (pomodoroTimer) {
        var updateUI = function() {
            document.getElementById('pomodoro-timer').textContent = pomodoroTimer.getFormattedTime();
            document.getElementById('pomodoro-label').textContent = pomodoroTimer.getLabel();
            document.getElementById('pomodoro-today').textContent = pomodoroTimer.getTodaySessionsCount();
            document.getElementById('pomodoro-total').textContent = state.pomodoro.sessions + pomodoroTimer.cycleCount;
            updateModeButtons(pomodoroTimer.state);
        };

        pomodoroTimer.onTick = function() { updateUI(); };
        pomodoroTimer.onComplete = async function() {
            state.pomodoro.sessions++;
            state.pomodoro.todaySessions++;
            savePomodoroState();
            updateUI();
            renderPomodoroChart();
            showToast('🎉 انتهت الجلسة! خذ استراحة');
            document.getElementById('pomodoro-total').textContent = state.pomodoro.sessions + pomodoroTimer.cycleCount;
        };
        pomodoroTimer.onStateChange = function() { updateUI(); };

        updateUI();

        document.getElementById('pomodoro-start').addEventListener('click', function() {
            pomodoroTimer.start();
            if (!isFocusMode) { toggleFocusMode(true); isFocusMode = true; }
        });
        document.getElementById('pomodoro-pause').addEventListener('click', function() { pomodoroTimer.pause(); });
        document.getElementById('pomodoro-reset').addEventListener('click', function() {
            pomodoroTimer.resetTimer();
            toggleFocusMode(false); isFocusMode = false;
        });
    }

    document.querySelectorAll('.pomodoro-mode-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (pomodoroTimer && pomodoroTimer.status !== 'idle') return;
            var mode = btn.dataset.mode;
            if (pomodoroTimer) {
                pomodoroTimer.setMode(mode);
            }
        });
    });

    var settingsBtn = document.getElementById('pomodoro-settings-btn');
    var settingsModal = document.getElementById('pomodoro-settings-modal');
    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', function() {
            settingsOpen = !settingsOpen;
            settingsModal.style.display = settingsOpen ? 'block' : 'none';
            if (settingsOpen) loadSettingsToModal();
        });
        settingsModal.querySelector('.close-modal').addEventListener('click', function() {
            settingsOpen = false;
            settingsModal.style.display = 'none';
        });
        document.getElementById('save-pomodoro-settings').addEventListener('click', saveSettingsFromModal);
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && isFocusMode) {
            toggleFocusMode(false);
            isFocusMode = false;
        }
    });

    function updateModeButtons(modeState) {
        document.querySelectorAll('.pomodoro-mode-btn').forEach(function(b) {
            b.classList.toggle('active', b.dataset.mode === modeState);
        });
    }

    function toggleFocusMode(active) {
        var sidebar = document.getElementById('sidebar');
        var topbar = document.getElementById('topbar');
        var app = document.getElementById('app');
        var pomContainer = document.querySelector('.pomodoro-container');

        if (active) {
            sidebar.style.display = 'none';
            topbar.style.display = 'none';
            document.querySelectorAll('.page').forEach(function(p) { p.style.display = 'none'; });
            var page = document.getElementById('page-pomodoro');
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
            document.querySelectorAll('.page').forEach(function(p) { p.style.display = ''; });
            var page = document.getElementById('page-pomodoro');
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
        var s = settingsManager.get();
        document.getElementById('setting-work').value = s.work;
        document.getElementById('setting-short-break').value = s.shortBreak;
        document.getElementById('setting-long-break').value = s.longBreak;
        document.getElementById('setting-sound-enabled').checked = s.soundEnabled;
        document.getElementById('setting-sound-volume').value = s.soundVolume;
        document.getElementById('setting-notifications-enabled').checked = s.notificationsEnabled;
    }

    function saveSettingsFromModal() {
        if (!settingsManager) return;
        var newSettings = {
            work: parseInt(document.getElementById('setting-work').value) || 25,
            shortBreak: parseInt(document.getElementById('setting-short-break').value) || 5,
            longBreak: parseInt(document.getElementById('setting-long-break').value) || 15,
            soundEnabled: document.getElementById('setting-sound-enabled').checked,
            soundVolume: parseFloat(document.getElementById('setting-sound-volume').value),
            notificationsEnabled: document.getElementById('setting-notifications-enabled').checked
        };
        settingsManager.update(newSettings);

        if (pomodoroTimer) {
            pomodoroTimer._initDefaults();
            pomodoroTimer.resetTimer();
        }

        settingsOpen = false;
        document.getElementById('pomodoro-settings-modal').style.display = 'none';
        showToast('✅ تم حفظ الإعدادات');
        renderPomodoroChart();
    }

    renderPomodoroChart();
}

function renderPomodoroChart() {
    if (!statisticsManager) return;
    var canvas = document.getElementById('pomodoro-chart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var daily = statisticsManager.getDailyStats(14);
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    canvas.width = w * 2;
    canvas.height = h * 2;
    ctx.scale(2, 2);

    var padding = { top: 20, right: 20, bottom: 30, left: 40 };
    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    if (daily.length === 0) {
        ctx.fillStyle = '#6c6c8a';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('لا توجد بيانات بعد', w / 2, h / 2);
        return;
    }

    var maxSessions = Math.max(1, Math.max.apply(null, daily.map(function(d) { return d.sessions; })));
    var barWidth = chartW / daily.length * 0.6;
    var gap = chartW / daily.length;

    daily.forEach(function(d, i) {
        var x = padding.left + gap * i + (gap - barWidth) / 2;
        var barH = (d.sessions / maxSessions) * chartH;
        var y = padding.top + chartH - barH;

        var gradient = ctx.createLinearGradient(x, y, x, padding.top + chartH);
        gradient.addColorStop(0, '#00d4aa');
        gradient.addColorStop(1, '#004d3a');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barH);

        var dateObj = new Date(d.date + 'T12:00:00');
        var label = dateObj.getDate() + '/' + (dateObj.getMonth() + 1);
        ctx.fillStyle = '#a0a0b8';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + barWidth / 2, padding.top + chartH + 14);

        if (d.sessions > 0) {
            ctx.fillStyle = '#00d4aa';
            ctx.font = 'bold 9px sans-serif';
            ctx.fillText(d.sessions, x + barWidth / 2, y - 4);
        }
    });
}

function savePomodoroState() {
    localStorage.setItem('bac_pomodoro', JSON.stringify(state.pomodoro.sessions));
    localStorage.setItem('bac_pomodoro_today', JSON.stringify(state.pomodoro.todaySessions));
    localStorage.setItem('bac_pomodoro_date', state.pomodoro.lastDate);
}

// ============================================================
// ✅ TASKS
// ============================================================
function setupTasks() {
    document.getElementById('add-task-btn-main').addEventListener('click', addNewTask);
    document.getElementById('new-task-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addNewTask();
    });
}

function addNewTask() {
    var input = document.getElementById('new-task-input');
    var type = document.getElementById('new-task-type').value;
    var text = input.value.trim();

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
    var el = document.getElementById('tasks-list');

    if (state.tasks.length === 0) {
        el.innerHTML = '<p class="empty-state">لا توجد مهام بعد</p>';
        return;
    }

    el.textContent = '';
    for (var i = 0; i < state.tasks.length; i++) {
        var task = state.tasks[i];
        (function(taskId, completed, txt, type) {
            var item = document.createElement('div');
            item.className = 'tasks-list-item' + (completed ? ' task-completed' : '');

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'task-checkbox';
            checkbox.checked = completed;
            checkbox.addEventListener('change', function() { toggleTask(taskId); });

            var textSpan = document.createElement('span');
            textSpan.className = 'task-text';
            textSpan.textContent = txt;

            var badge = document.createElement('span');
            badge.className = 'task-type-badge';
            badge.textContent = getTaskTypeLabel(type);

            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'task-delete-btn';
            deleteBtn.textContent = '✕';
            deleteBtn.addEventListener('click', function() { deleteTask(taskId); });

            item.appendChild(checkbox);
            item.appendChild(textSpan);
            item.appendChild(badge);
            item.appendChild(deleteBtn);
            el.appendChild(item);
        })(task.id, task.completed, task.text, task.type);
    }
}

function toggleTask(id) {
    for (var i = 0; i < state.tasks.length; i++) {
        if (state.tasks[i].id === id) {
            state.tasks[i].completed = !state.tasks[i].completed;
            break;
        }
    }
    saveTasks();
    renderTasks();
}

function deleteTask(id) {
    var newTasks = [];
    for (var i = 0; i < state.tasks.length; i++) {
        if (state.tasks[i].id !== id) {
            newTasks.push(state.tasks[i]);
        }
    }
    state.tasks = newTasks;
    saveTasks();
    renderTasks();
}

function getTaskTypeLabel(type) {
    var labels = { daily: 'يومية', weekly: 'أسبوعية', review: 'مراجعة', exam: 'امتحان' };
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
    document.getElementById('search-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') performSearch();
    });
}

// ============================================================
// 🧠 KNOWLEDGE GRAPH
// ============================================================
var knowledgeGraphData = null;
var selectedNode = null;

function setupKnowledgeGraph() {
    var loadBtn = document.getElementById('load-graph-btn');
    if (loadBtn) {
        loadBtn.addEventListener('click', loadKnowledgeGraph);
    }

    var canvas = document.getElementById('knowledge-graph-canvas');
    if (canvas) {
        canvas.addEventListener('click', handleGraphClick);
    }
}

async function loadKnowledgeGraph() {
    var statsEl = document.getElementById('graph-stats');
    var btn = document.getElementById('load-graph-btn');
    btn.disabled = true;
    btn.textContent = '⏳ جاري التحميل...';
    statsEl.textContent = '';

    try {
        var result = await apiGet('/api/vault/graph');
        if (!result.success) {
            showToast('فشل تحميل الرسم البياني', 'error');
            return;
        }

        knowledgeGraphData = result.data;
        var graph = knowledgeGraphData;

        statsEl.textContent = '📊 ' + graph.nodes.length + ' عقدة | ' + graph.edges.length + ' رابط';

        drawKnowledgeGraph(graph);
        showToast('✅ تم تحميل ' + graph.nodes.length + ' عقدة و ' + graph.edges.length + ' رابط');
    } catch (e) {
        showToast('فشل تحميل الرسم البياني', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔄 تحميل الرسم البياني';
    }
}

function drawKnowledgeGraph(graph) {
    var canvas = document.getElementById('knowledge-graph-canvas');
    if (!canvas || !graph) return;

    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim() || '#1e1e32';
    ctx.fillRect(0, 0, w, h);

    if (graph.nodes.length === 0) {
        ctx.fillStyle = '#6c6c8a';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('لا توجد بيانات متاحة', w / 2, h / 2);
        return;
    }

    var centerX = w / 2;
    var centerY = h / 2;
    var radius = Math.min(w, h) * 0.35;
    var nodeMap = new Map();

    graph.nodes.forEach(function(node, i) {
        var angle = (2 * Math.PI * i) / graph.nodes.length;
        var x = centerX + radius * Math.cos(angle);
        var y = centerY + radius * Math.sin(angle);
        nodeMap.set(node.id, { x: x, y: y, node: node });
    });

    ctx.strokeStyle = 'rgba(100,100,140,0.3)';
    ctx.lineWidth = 1;
    for (var e = 0; e < graph.edges.length; e++) {
        var edge = graph.edges[e];
        var source = nodeMap.get(edge.source);
        var target = nodeMap.get(edge.target);
        if (source && target) {
            ctx.beginPath();
            ctx.moveTo(source.x, source.y);
            ctx.lineTo(target.x, target.y);
            ctx.stroke();
        }
    }

    nodeMap.forEach(function(data, id) {
        var node = data.node;
        var x = data.x;
        var y = data.y;
        var color = '#4a90e2';
        var nodeRadius = 6;

        if (node.type === 'tag') {
            color = '#50c878';
            nodeRadius = 8;
        } else if (node.unresolved) {
            color = '#888';
            nodeRadius = 4;
        }

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(x + 2, y + 2, nodeRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, nodeRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ddd';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        var label = node.type === 'tag' ? '#' + node.name : (node.path ? node.path.split('/').pop() : node.id);
        ctx.fillText(label, x, y - nodeRadius - 6);
    });
}

function handleGraphClick(e) {
    var canvas = document.getElementById('knowledge-graph-canvas');
    if (!canvas || !knowledgeGraphData) return;

    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    var w = canvas.width;
    var h = canvas.height;
    var centerX = w / 2;
    var centerY = h / 2;
    var radius = Math.min(w, h) * 0.35;

    var closest = null;
    var minDist = 20;

    knowledgeGraphData.nodes.forEach(function(node, i) {
        var angle = (2 * Math.PI * i) / knowledgeGraphData.nodes.length;
        var nx = centerX + radius * Math.cos(angle);
        var ny = centerY + radius * Math.sin(angle);
        var dist = Math.sqrt((x - nx) * (x - nx) + (y - ny) * (y - ny));
        if (dist < minDist) {
            minDist = dist;
            closest = node;
        }
    });

    var detailsEl = document.getElementById('graph-details');
    var contentEl = document.getElementById('graph-details-content');

    if (closest) {
        selectedNode = closest;
        detailsEl.style.display = 'block';

        var html = '<div style="margin-bottom:8px">';
        html += '<strong>' + (closest.type === 'tag' ? '🏷️ ' : '📄 ') + closest.id + '</strong>';
        html += '<span class="badge-' + closest.type + '">' + closest.type + '</span>';
        html += '</div>';

        if (closest.path) {
            html += '<div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">📁 ' + closest.path + '</div>';
        }
        if (closest.frontmatter && Object.keys(closest.frontmatter).length > 0) {
            html += '<div style="font-size:12px;margin-bottom:4px">📋 Frontmatter: ' + JSON.stringify(closest.frontmatter).substring(0, 100) + '</div>';
        }
        if (closest.tags && closest.tags.length > 0) {
            html += '<div style="font-size:12px;margin-bottom:4px">🏷️ الوسوم: ' + closest.tags.map(function(t) { return '#' + t; }).join(' ') + '</div>';
        }
        if (closest.wordCount) {
            html += '<div style="font-size:12px;margin-bottom:4px">📝 عدد الكلمات: ' + closest.wordCount + '</div>';
        }

        var links = knowledgeGraphData.edges.filter(function(e) { return e.source === closest.id || e.target === closest.id; });
        if (links.length > 0) {
            html += '<div style="font-size:12px;margin-top:8px">🔗 الروابط (' + links.length + '):</div><ul style="font-size:11px;max-height:120px;overflow-y:auto">';
            for (var i = 0; i < Math.min(links.length, 20); i++) {
                var l = links[i];
                var other = l.source === closest.id ? l.target : l.source;
                html += '<li>' + l.relation + ': ' + other + '</li>';
            }
            html += '</ul>';
        }

        contentEl.innerHTML = html;
    } else {
        detailsEl.style.display = 'none';
    }
}

async function performSearch() {
    var query = document.getElementById('search-input').value.trim();
    var resultsEl = document.getElementById('search-results');

    if (!query || query.length < 2) {
        resultsEl.innerHTML = '<p class="empty-state">اكتب كلمتين على الأقل للبحث</p>';
        return;
    }

    resultsEl.innerHTML = '<div class="loading-spinner" style="width:24px;height:24px;margin:20px auto"></div>';

    var result = await apiGet('/api/search?q=' + encodeURIComponent(query));

    if (!result.success || !result.data || result.data.length === 0) {
        resultsEl.innerHTML = '<p class="empty-state">لا توجد نتائج</p>';
        return;
    }

    resultsEl.textContent = '';
    for (var i = 0; i < result.data.length; i++) {
        var item = result.data[i];
        (function(itemData) {
            var container = document.createElement('div');
            container.className = 'search-result-item';

            var pathDiv = document.createElement('div');
            pathDiv.className = 'search-result-path';
            pathDiv.textContent = '📁 ' + itemData.path;

            var nameDiv = document.createElement('div');
            nameDiv.className = 'search-result-name';
            nameDiv.textContent = itemData.name;

            container.appendChild(pathDiv);
            container.appendChild(nameDiv);

            for (var j = 0; j < itemData.matches.length; j++) {
                var m = itemData.matches[j];
                var lineDiv = document.createElement('div');
                lineDiv.className = 'search-result-line';
                lineDiv.textContent = 'سطر ' + m.line + ': ';

                var markNode = document.createElement('mark');
                markNode.textContent = m.text;
                lineDiv.appendChild(markNode);
                container.appendChild(lineDiv);
            }

            resultsEl.appendChild(container);
        })(item);
    }
}

// ============================================================
// 💬 TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type) {
    if (type === undefined) type = 'success';
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type;
    toast.classList.add('show');
    
    setTimeout(function() {
        toast.classList.remove('show');
    }, 3000);
}

// ============================================================
// 📡 OFFLINE MODE & LIVE SYNC (SSE)
// ============================================================
var sseReconnectTimer = null;

function setupOfflineMode() {
    if (!navigator.onLine) {
        showOfflineIndicator();
    }

    window.addEventListener('online', function() {
        hideOfflineIndicator();
        showToast('✅ تم استعادة الاتصال');
        loadDashboard();
    });

    window.addEventListener('offline', function() {
        showOfflineIndicator();
        showToast('⚠️ أنت الآن offline - يمكنك القراءة فقط', 'error');
    });

    connectSSE();
    updateConnectionStatus();
}

function updateConnectionStatus() {
    var statusEl = document.getElementById('connection-status');
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
    if (sseReconnectTimer) {
        clearTimeout(sseReconnectTimer);
        sseReconnectTimer = null;
    }
    
    var eventSource = new EventSource('/api/events');
    
    eventSource.onopen = function() {
        console.log('📡 SSE connected');
        hideOfflineIndicator();
        updateConnectionStatus();
    };

    eventSource.onmessage = function(event) {
        try {
            var data = JSON.parse(event.data);
            handleSSEEvent(data);
        } catch (e) {
            console.error('SSE parse error:', e);
        }
    };

    eventSource.onerror = function(err) {
        console.error('SSE error:', err);
        eventSource.close();
        if (!sseReconnectTimer) {
            sseReconnectTimer = setTimeout(function() {
                sseReconnectTimer = null;
                connectSSE();
            }, 5000);
        }
    };
}

function handleSSEEvent(data) {
    switch (data.type) {
        case 'vault-changed':
            console.log('📁 Vault changed:', data.action, data.path);
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
    var indicator = document.getElementById('offline-indicator');
    if (indicator) {
        indicator.classList.add('show');
    }
}

function hideOfflineIndicator() {
    var indicator = document.getElementById('offline-indicator');
    if (indicator) {
        indicator.classList.remove('show');
    }
}

window.showSubjectDetail = showSubjectDetail;
window.toggleLessonStatus = toggleLessonStatus;
window.toggleTask = toggleTask;
window.deleteTask = deleteTask;
window.navigateTo = navigateTo;
window.showToast = showToast;
