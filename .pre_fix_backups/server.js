/**
 * BAC 2027 Intelligent Study Operating System
 * 🏗️ Local HTTP Server - Core Backend (v3.0 - HARDENED & ENHANCED)
 *
 * الميزات:
 * ✅ أمان عالي (Directory Traversal, XSS protection, CSP, CORS)
 * ✅ async/await كامل لعدم حجب Event Loop
 * ✅ SSE + Heartbeat للتحديث الحي مع تنظيف الذاكرة
 * ✅ Rate Limiting (100 req/min/IP)
 * ✅ Timeout وحماية DoS
 * ✅ نظام Logging موحد
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const chokidar = require('chokidar');
const studyDB = require('./database/database');
const XPSystem = require('./gamification/xp-system');
const VaultAnalyzer = require('./vault-parser');

const PORT = process.env.PORT || 3000;
const VAULT_PATH = path.resolve(__dirname, '..');
const BAC_SYSTEM_PATH = __dirname;
const BAC_FOLDER = path.join(VAULT_PATH, '01_Bac');
const DAILY_NOTES = path.join(BAC_FOLDER, '14_Daily_Notes');
const BAC_DATE = '2027-06-06';
const BACKUP_FOLDER = path.join(BAC_SYSTEM_PATH, '.study_backups');
const ERROR_LOG_PATH = path.join(BAC_SYSTEM_PATH, 'system_errors.log');

// إعدادات الأمان والأداء
const CONFIG = Object.freeze({
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_SEARCH_RESULTS: 50,
    SEARCH_TIMEOUT: 5000,
    DAILY_NOTES_LIMIT: 365,
    ALLOWED_FILE_TYPES: ['.md', '.txt', '.json', '.yaml', '.yml'],
    RATE_LIMIT_WINDOW: 60000, // 1 minute
    RATE_LIMIT_MAX_REQUESTS: 100,
    SSE_HEARTBEAT_INTERVAL: 30000, // 30 seconds
    DASHBOARD_CACHE_TTL: 30000, // 30 seconds
    VAULT_ANALYSIS_TTL: 60000, // 60 seconds
    ALLOWED_ORIGINS: ['http://localhost:3000', 'http://127.0.0.1:3000']
});

const SUBJECTS = Object.freeze([
    { id: '01_Mathematics', name: 'الرياضيات', nameLatin: 'Mathematics', icon: '📐', folder: '01_Mathematics' },
    { id: '02_Physics', name: 'الفيزياء', nameLatin: 'Physics', icon: '⚛️', folder: '02_Physics' },
    { id: '03_Mechanical', name: 'الهندسة الميكانيكية', nameLatin: 'Mechanical Engineering', icon: '🔧', folder: '03_Mechanical_Engineering' },
    { id: '04_Arabic', name: 'اللغة العربية', nameLatin: 'Arabic', icon: '📚', folder: '04_Arabic' },
    { id: '05_French', name: 'الفرنسية', nameLatin: 'French', icon: '🇫🇷', folder: '05_French' },
    { id: '06_English', name: 'الإنجليزية', nameLatin: 'English', icon: '🇬🇧', folder: '06_English' },
    { id: '07_Philosophy', name: 'الفلسفة', nameLatin: 'Philosophy', icon: '🧠', folder: '07_Philosophy' },
    { id: '08_Islamic', name: 'العلوم الإسلامية', nameLatin: 'Islamic Studies', icon: '📖', folder: '08_Islamic_Studies' },
    { id: '09_History', name: 'التاريخ والجغرافيا', nameLatin: 'History & Geography', icon: '🌍', folder: '09_History_Geography' },
]);

const STATUS_MAP = Object.freeze({
    'not_started': { symbol: '❌', md: '- [ ]', label: 'لم يبدأ' },
    'in_progress': { symbol: '⏳', md: '- [/]', label: 'قيد الدراسة' },
    'completed': { symbol: '✔', md: '- [x]', label: 'تم' },
    'review_needed': { symbol: '🔁', md: '- [~]', label: 'يحتاج مراجعة' },
});

const MIME_TYPES = Object.freeze({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.md': 'text/markdown; charset=utf-8',
});

// ============================================================
// 🔒 SECURITY UTILITIES (v3.0 - HARDENED)
// ============================================================

/**
 * Check if a file path is safe (prevents Directory Traversal)
 * @param {string} filePath - The path to check
 * @param {string} baseDir - The allowed base directory
 * @returns {boolean} True if safe, false otherwise
 */
function isPathSafe(filePath, baseDir) {
    try {
        // Decode URL encoding first (handles %2e%2e%2f etc.)
        const decodedPath = decodeURIComponent(filePath);

        // Check for dangerous characters
        const dangerousChars = /[\\/:*?"<>|]/;
        if (dangerousChars.test(decodedPath)) {
            return false;
        }

        // Normalize and resolve paths
        const normalizedBase = path.normalize(baseDir);
        const normalizedPath = path.normalize(decodedPath);

        // Reject if path contains .. (parent traversal)
        if (normalizedPath.includes('..')) {
            return false;
        }

        // Resolve to absolute path
        const resolvedBase = path.resolve(normalizedBase);
        let resolvedPath;
        try {
            resolvedPath = path.resolve(resolvedBase, normalizedPath);
        } catch (e) {
            return false;
        }

        // Ensure resolved path is within base directory
        const relative = path.relative(resolvedBase, resolvedPath);

        // Check if path escapes base directory
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            return false;
        }

        return true;
    } catch (e) {
        logError('isPathSafe validation error', e);
        return false;
    }
}

/**
 * Sanitize text for safe HTML rendering
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
/**
 * Remove Markdown formatting and HTML entities from lesson names
 * @param {string} text - Raw text with possible Markdown/HTML
 * @returns {string} Clean text
 */
function cleanLessonName(text) {
    if (typeof text !== 'string') return '';
    let result = text;
    // Remove Markdown bold **text**
    result = result.replace(/\*\*(.+?)\*\*/g, '$1');
    // Remove Markdown italic *text* or _text_
    result = result.replace(/\*(.+?)\*/g, '$1');
    result = result.replace(/_(.+?)_/g, '$1');
    // Remove Markdown strikethrough ~~text~~
    result = result.replace(/~~(.+?)~~/g, '$1');
    // Remove inline code `text`
    result = result.replace(/`(.+?)`/g, '$1');
    // Remove HTML tags
    result = result.replace(/<[^>]*>/g, '');
    // Decode HTML entities
    result = result.replace(/&#x2F;/gi, '/');
    result = result.replace(/&#x27;/gi, "'");
    result = result.replace(/&/gi, '&');
    result = result.replace(/</gi, '<');
    result = result.replace(/>/gi, '>');
    result = result.replace(/"/gi, '"');
    // Trim whitespace
    result = result.trim();
    return result;
}

function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    const escapeMap = {
        '&': '&',
        '<': '<',
        '>': '>',
        '"': '"',
        "'": '&#x27;',
        '/': '&#x2F;'
    };
    return text.replace(/[&<>"'\/]/g, char => escapeMap[char]);
}

/**
 * Validate request Content-Type
 * @param {http.IncomingMessage} req - Request object
 * @param {string} expectedType - Expected content type
 * @returns {boolean} True if valid
 */
function hasValidContentType(req, expectedType = 'application/json') {
    const contentType = req.headers['content-type'] || '';
    return contentType.includes(expectedType);
}

/**
 * Rate limiting by IP
 * @type {Map<string, {count: number, resetTime: number}>}
 */
const rateLimitMap = new Map();

/**
 * Check if request is allowed by rate limit
 * @param {string} ip - Client IP address
 * @returns {boolean} True if allowed
 */
function checkRateLimit(ip) {
    const now = Date.now();
    const windowStart = now - CONFIG.RATE_LIMIT_WINDOW;

    const clientData = rateLimitMap.get(ip);

    if (!clientData) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + CONFIG.RATE_LIMIT_WINDOW });
        return true;
    }

    // Reset counter if window expired
    if (clientData.resetTime < now) {
        clientData.count = 1;
        clientData.resetTime = now + CONFIG.RATE_LIMIT_WINDOW;
        return true;
    }

    // Increment and check
    clientData.count++;

    // Cleanup old entries periodically
    if (rateLimitMap.size > 1000) {
        for (const [key, value] of rateLimitMap.entries()) {
            if (value.resetTime < now) {
                rateLimitMap.delete(key);
            }
        }
    }

    return clientData.count <= CONFIG.RATE_LIMIT_MAX_REQUESTS;
}

/**
 * Get client IP address
 * @param {http.IncomingMessage} req - Request object
 * @returns {string} IP address
 */
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           'unknown';
}

/**
 * Unified logging system
 * @param {string} level - Log level (INFO, WARN, ERROR)
 * @param {string} context - Context of the log
 * @param {Error|string} message - Error or message
 */
function log(level, context, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${context}: ${typeof message === 'object' ? JSON.stringify(message) : message}`;

    // Console output with emoji
    const emoji = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : 'ℹ️';
    console.log(`${emoji} ${logMessage}`);

    // File logging for errors only
    if (level === 'ERROR') {
        try {
            fs.appendFileSync(ERROR_LOG_PATH, logMessage + '\n');
        } catch (e) {
            console.error('Failed to write to error log:', e);
        }
    }
}

// Convenience methods
function logError(context, error) {
    log('ERROR', context, error);
}

function logWarn(context, message) {
    log('WARN', context, message);
}

function logInfo(context, message) {
    log('INFO', context, message);
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getDaysUntilBAC() {
    const now = new Date();
    const bacDate = new Date(BAC_DATE + 'T00:00:00');
    const diff = bacDate - now;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ============================================================
// 📖 VAULT PARSER ENGINE (v3.0 - HARDENED)
// ============================================================
class VaultParser {
    /**
     * Smartly parse yearly plan content (supports tables, bullet lists, and plain text)
     * @param {string} content - File content
     * @param {string} subjectId - Subject identifier
     * @returns {Array} Parsed chapters with lessons
     */
    static parseYearlyPlan(content, subjectId) {
        try {
            if (!content || typeof content !== 'string') return [];
            const lines = content.split('\n');
            const chapters = [];
            let currentChapter = null;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();

                // ==================== SECTION HEADERS ====================
                // Support: ## Title, ### Title, and any bold text as section marker
                if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
                    if (currentChapter && currentChapter.lessons.length > 0) {
                        chapters.push(currentChapter);
                    }
                    currentChapter = {
                        name: cleanLessonName(trimmed.replace(/^#{1,4}\s+/, '').trim()),
                        lessons: [],
                        completedCount: 0,
                        totalCount: 0
                    };
                    continue;
                }

                // Skip non-content lines
                if (!currentChapter) continue;
                
                // Skip table separators (|---|), empty lines, page breaks, notes
                if (trimmed.startsWith('|') && trimmed.includes('---')) continue;
                if (trimmed === '' || trimmed.startsWith('>') || trimmed.startsWith('![')) continue;
                if (trimmed.match(/^(\*\*|__).*\1$/) && !trimmed.includes('-')) continue; // pure bold lines

                // ==================== TABLE ROWS ====================
                // Format: | week | date | topic | lesson_name | hours |
                if (trimmed.startsWith('|') && trimmed.endsWith('|') && (trimmed.match(/\|/g) || []).length >= 3) {
                    const cells = trimmed.split('|').map(c => c.trim()).filter(c => c.length > 0);
                    
                    // Skip header rows (contain common table headers)
                    if (cells.some(c => /^(الأسبوع|التاريخ|المحور|الموضوع|الحجم|week|date|topic|lesson|hours|session|time|content|chapter)$/i.test(c))) {
                        continue;
                    }

                    // Determine which columns contain meaningful data based on table structure
                    // Typical columns: [week, date, topic/major_topic, lesson_name, hours]
                    // We extract from columns 2 (topic) and 3 (lesson_name) if they exist
                    let lessonName = '';
                    let chapterName = '';

                    if (cells.length >= 4) {
                        // 5+ columns: [week, date, topic, lesson, hours]
                        chapterName = cells[2]; // topic column (index 2)
                        lessonName = cells[3];  // lesson column (index 3)
                    } else if (cells.length === 3) {
                        // 3 columns: [week, topic+lesson, hours] or [week, date, topic+lesson]
                        lessonName = cells[1];
                    } else if (cells.length === 2) {
                        // 2 columns: [topic, lesson] or similar
                        lessonName = cells[1];
                    }

                    // Clean and validate
                    lessonName = cleanLessonName(lessonName);
                    chapterName = cleanLessonName(chapterName);

                    // Only add meaningful lesson names (not dates, notes, "عطلة", empty, etc.)
                    if (lessonName && lessonName.length > 3 && 
                        !lessonName.match(/^(عطلة|معالجة|اختبار|قسم|ملاحظ|ملخص|تمارين|مراجعة|تقييم|اختباري|بيداغوجية|امتحان)$/i) &&
                        !lessonName.match(/^\d+\s*س$/) && // "6س" pattern
                        !lessonName.match(/^[\d\-\/\\s]+$/) && // pure date or numbers
                        !lessonName.match(/^[\u0627-\u064a]{1,2}$/)) { // single Arabic letter
                        
                        currentChapter.lessons.push({
                            name: cleanLessonName(lessonName),
                            status: 'not_started'
                        });
                        currentChapter.totalCount++;
                    }
                    continue;
                }

                // ==================== BULLET LISTS ====================
                // Support: - , * , + , 1. , 1) etc.
                const listMatch = trimmed.match(/^([\-\*\+]|\d+[\.\)])\s+(.+)/);
                if (!listMatch) continue;

                const contentPart = listMatch[2].trim();

                // Skip very short or very long items (likely not lesson names)
                if (contentPart.length < 3 || contentPart.length > 200) continue;
                
                // Skip pure numbers, dates, URLs
                if (contentPart.match(/^[\d\s\-/]+$/) || contentPart.startsWith('http')) continue;

                let lessonName = null;
                let status = 'not_started';

                // Pattern 1: Checkbox [ ], [x], [/], [~]
                const match1 = contentPart.match(/^\[([ x~/])\]\s+(.+)/);
                if (match1) {
                    const checkboxMap = { ' ': 'not_started', 'x': 'completed', '/': 'in_progress', '~': 'review_needed' };
                    status = checkboxMap[match1[1]] || 'not_started';
                    lessonName = match1[2].trim();
                }

                // Pattern 2: Status symbol at start ❌, ⏳, ✔, 🔁
                if (!lessonName) {
                    const match2 = contentPart.match(/^([❌⏳✔🔁])\s+(.+)/);
                    if (match2) {
                        const symbolMap = { '❌': 'not_started', '⏳': 'in_progress', '✔': 'completed', '🔁': 'review_needed' };
                        status = symbolMap[match2[1]] || 'not_started';
                        lessonName = match2[2].trim();
                    }
                }

                // Pattern 3: Status symbol at end
                if (!lessonName) {
                    const match3 = contentPart.match(/^(.+?)\s*([❌⏳✔🔁])$/);
                    if (match3) {
                        const symbolMap = { '❌': 'not_started', '⏳': 'in_progress', '✔': 'completed', '🔁': 'review_needed' };
                        status = symbolMap[match3[2]] || 'not_started';
                        lessonName = match3[1].trim();
                    }
                }

                // Pattern 4: Plain text (no status marker)
                if (!lessonName && contentPart.length > 3 && contentPart.length < 200) {
                    lessonName = contentPart;
                }

                if (lessonName && lessonName.length > 2) {
                    const cleanName = cleanLessonName(lessonName);
                    if (cleanName && cleanName.length > 2) {
                        currentChapter.lessons.push({
                            name: cleanName,
                            status: status
                        });
                        currentChapter.totalCount++;
                        if (status === 'completed') currentChapter.completedCount++;
                    }
                }
            }

            // Add last chapter
            if (currentChapter && currentChapter.lessons.length > 0) {
                chapters.push(currentChapter);
            }

            // Remove duplicate lessons within the same chapter
            for (const chapter of chapters) {
                const seen = new Set();
                chapter.lessons = chapter.lessons.filter(lesson => {
                    const key = lesson.name.toLowerCase().trim();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
                chapter.totalCount = chapter.lessons.length;
                chapter.completedCount = chapter.lessons.filter(l => l.status === 'completed').length;
            }

            return chapters;
        } catch (e) {
            logError('VaultParser.parseYearlyPlan', e);
            return [];
        }
    }

    static parseDailyNote(content) {
        try {
            if (!content || typeof content !== 'string') {
                return {
                    subjects: [], totalMinutes: 0, productivityScore: 5,
                    tasksCompleted: [], tomorrowGoals: [], streak: 0
                };
            }
            const result = {
                subjects: [], totalMinutes: 0, productivityScore: 5,
                tasksCompleted: [], tomorrowGoals: [], streak: 0
            };
            const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (!yamlMatch) return result;
            const yaml = yamlMatch[1];
            try {
                const prodMatch = yaml.match(/productivity_score:\s*([\d.]+)/);
                if (prodMatch) result.productivityScore = Math.min(10, parseFloat(prodMatch[1]));
            } catch (e) { /* ignore */ }
            try {
                const minMatch = yaml.match(/total_study_minutes:\s*(\d+)/);
                if (minMatch) result.totalMinutes = parseInt(minMatch[1]) || 0;
            } catch (e) { /* ignore */ }
            try {
                const streakMatch = yaml.match(/streak:\s*(\d+)/);
                if (streakMatch) result.streak = parseInt(streakMatch[1]) || 0;
            } catch (e) { /* ignore */ }
            try {
                const subjectsSection = yaml.match(/subjects_studied:\n((?:\s+- .*\n?)*)/);
                if (subjectsSection) {
                    const subjectLines = subjectsSection[1].split('\n');
                    for (const sl of subjectLines) {
                        const nameMatch = sl.match(/name:\s*(.+)/);
                        if (nameMatch) {
                            result.subjects.push({
                                name: nameMatch[1].trim(),
                                minutes: 0,
                                lessons: []
                            });
                        }
                    }
                }
            } catch (e) { /* ignore */ }
            try {
                const tasksSection = yaml.match(/tasks_completed:\n((?:\s+- .*\n?)*)/);
                if (tasksSection) {
                    const taskLines = tasksSection[1].split('\n');
                    for (const tl of taskLines) {
                        const taskMatch = tl.match(/-\s*"(.+)"\s*$/);
                        if (taskMatch) {
                            result.tasksCompleted.push(taskMatch[1].trim());
                        }
                    }
                }
            } catch (e) { /* ignore */ }
            return result;
        } catch (e) {
            logError('VaultParser.parseDailyNote', e);
            return {
                subjects: [], totalMinutes: 0, productivityScore: 5,
                tasksCompleted: [], tomorrowGoals: [], streak: 0
            };
        }
    }

    static updateLessonStatus(content, lessonName, newStatus) {
        try {
            if (!content || typeof content !== 'string') return content;
            const statusInfo = STATUS_MAP[newStatus];
            if (!statusInfo) return content;
            const lines = content.split('\n');
            const newLines = lines.map(line => {
                const trimmed = line.trim();
                const checkboxPattern = /^(- \[.\])\s+(.+)/;
                const checkboxMatch = trimmed.match(checkboxPattern);
                if (checkboxMatch && checkboxMatch[2].trim() === lessonName) {
                    const indent = line.match(/^\s*/)[0];
                    return `${indent}${statusInfo.md} ${lessonName}`;
                }
                const symbolStartPattern = /^(- [❌⏳✔🔁])\s+(.+)/;
                const symbolStartMatch = trimmed.match(symbolStartPattern);
                if (symbolStartMatch && symbolStartMatch[2].trim() === lessonName) {
                    const indent = line.match(/^\s*/)[0];
                    return `${indent}${statusInfo.symbol} ${lessonName}`;
                }
                const symbolEndPattern = /^(- .+?)\s*[❌⏳✔🔁]$/;
                const symbolEndMatch = trimmed.match(symbolEndPattern);
                if (symbolEndMatch && symbolEndMatch[1].substring(2).trim() === lessonName) {
                    const indent = line.match(/^\s*/)[0];
                    return `${indent}${lessonName} ${statusInfo.symbol}`;
                }
                const plainPattern = /^(- )(.+)/;
                const plainMatch = trimmed.match(plainPattern);
                if (plainMatch && plainMatch[2].trim() === lessonName) {
                    const indent = line.match(/^\s*/)[0];
                    return `${indent}${statusInfo.md} ${lessonName}`;
                }
                return line;
            });
            return newLines.join('\n');
        } catch (e) {
            logError('VaultParser.updateLessonStatus', e);
            return content;
        }
    }
}

// ============================================================
// 📊 ANALYTICS ENGINE
// ============================================================
class AnalyticsEngine {
    static calculateProgress(subjectsData) {
        let totalLessons = 0;
        let completedLessons = 0;
        let reviewNeededCount = 0;
        let inProgressCount = 0;
        const subjectProgress = subjectsData.map(subject => {
            let subTotal = 0;
            let subCompleted = 0;
            for (const chapter of subject.chapters || []) {
                for (const lesson of chapter.lessons || []) {
                    subTotal++;
                    totalLessons++;
                    if (lesson.status === 'completed') {
                        subCompleted++;
                        completedLessons++;
                    }
                    if (lesson.status === 'review_needed') reviewNeededCount++;
                    if (lesson.status === 'in_progress') inProgressCount++;
                }
            }
            return {
                id: subject.id,
                name: subject.name,
                nameLatin: subject.nameLatin,
                icon: subject.icon,
                progress: subTotal > 0 ? Math.round((subCompleted / subTotal) * 100) : 0,
                completedCount: subCompleted,
                totalCount: subTotal,
                lastStudied: subject.lastStudied || null
            };
        });
        const overallProgress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
        return {
            overallProgress,
            totalLessons,
            completedLessons,
            reviewNeededCount,
            inProgressCount,
            subjects: subjectProgress
        };
    }

    static calculateBACReadiness(progressData, dailyData) {
        if (!progressData.totalLessons || progressData.totalLessons === 0) {
            return {
                score: 0,
                breakdown: { coverage: 0, review: 0, consistency: 0, hours: 0, tasks: 0 },
                weakPoints: ['📭 لم يتم العثور على دروس في البرنامج. تأكد من وجود ملفات yearly-plan.md'],
                recommendations: ['📥 أضف الدروس إلى مجلدات المواد ثم أعد التحميل']
            };
        }
        const coverageScore = (progressData.completedLessons / progressData.totalLessons) * 40;
        const reviewScore = progressData.completedLessons > 0
            ? Math.max(0, 1 - (progressData.reviewNeededCount / progressData.totalLessons)) * 25
            : 0;
        const streakScore = Math.min(10, (dailyData.longestStreak || 0) / 3) * 10;
        const avgDailyHours = dailyData.totalMinutes > 0 ? Math.min(6, (dailyData.totalMinutes / 30) / 60) : 0;
        const hoursScore = (avgDailyHours / 4) * 15;
        const completionRate = dailyData.totalTasks > 0
            ? (dailyData.completedTasks / dailyData.totalTasks) * 10 : 0;
        const totalScore = Math.min(100, Math.round(coverageScore + reviewScore + streakScore + hoursScore + completionRate));
        return {
            score: totalScore,
            breakdown: {
                coverage: Math.round(coverageScore),
                review: Math.round(reviewScore),
                consistency: Math.round(streakScore),
                hours: Math.round(hoursScore),
                tasks: Math.round(completionRate)
            },
            weakPoints: this.identifyWeakPoints(totalScore, coverageScore, reviewScore, progressData),
            recommendations: this.generateRecommendations(totalScore, progressData),
            daysUntilBAC: getDaysUntilBAC(),
            bacDate: BAC_DATE
        };
    }

    static identifyWeakPoints(totalScore, coverageScore, reviewScore, progressData) {
        const weakPoints = [];
        if (coverageScore < 20) weakPoints.push('تغطية البرنامج ضعيفة - تحتاج لزيادة الدروس المنجزة');
        if (reviewScore < 15) weakPoints.push('المراجعات متأخرة - ركز على مراجعة الدروس المنجزة');
        const weakestSubject = progressData.subjects?.reduce((min, s) =>
            s.progress < (min?.progress || 100) ? s : min, null);
        if (weakestSubject && weakestSubject.progress < 30) {
            weakPoints.push(`المادة الأضعف: ${weakestSubject.name} (${weakestSubject.progress}%)`);
        }
        return weakPoints;
    }

    static generateRecommendations(totalScore, progressData) {
        const recs = [];
        if (totalScore < 50) {
            recs.push('🚨 خطة طوارئ: ركز على المواد ذات الأولوية');
            recs.push('📅 خصص 4+ ساعات يومياً للدراسة');
        } else if (totalScore < 75) {
            recs.push('📈 أنت في الطريق الصحيح، زد من وتيرة المراجعة');
            recs.push('🎯 ركز على المواد الأقل تقدماً');
        } else {
            recs.push('🌟 أداء ممتاز! استمر في الحفاظ على الوتيرة');
            recs.push('🏆 أنت جاهز للانتقال إلى التمارين المتقدمة ومواضيع البكالوريا');
        }
        return recs;
    }

    static calculateStreak(dailyFiles, sessionEndTime = null) {
        let streak = 0;
        const now = new Date();
        const referenceDate = sessionEndTime ? new Date(sessionEndTime) : now;
        for (let i = 0; i < 365; i++) {
            const date = new Date(referenceDate);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const fileName = `${dateStr}.md`;
            if (dailyFiles.includes(fileName)) {
                streak++;
            } else if (i > 0) {
                break;
            }
        }
        return streak;
    }

    static calculateComparative(dailyLogs) {
        const now = new Date();
        function getWeekId(dateStr) {
            const d = new Date(dateStr + 'T12:00:00');
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(d.setDate(diff));
            return monday.toISOString().split('T')[0];
        }
        const weekGroups = {};
        for (const log of dailyLogs) {
            const weekId = getWeekId(log.date);
            if (!weekGroups[weekId]) weekGroups[weekId] = [];
            weekGroups[weekId].push(log);
        }
        const weekIds = Object.keys(weekGroups).sort().reverse();
        const thisWeek = weekIds[0];
        const lastWeek = weekIds[1];
        function getWeekStats(weekId) {
            const logs = weekGroups[weekId] || [];
            const totalMinutes = logs.reduce((s, l) => s + (l.totalMinutes || 0), 0);
            const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
            const subMins = {};
            for (const log of logs) {
                for (const sub of log.subjects || []) {
                    subMins[sub.name] = (subMins[sub.name] || 0) + (sub.minutes || 0);
                }
            }
            const entries = Object.entries(subMins).sort((a, b) => b[1] - a[1]);
            const mostStudied = entries[0]?.[0] || '—';
            const leastStudied = entries[entries.length - 1]?.[0] || '—';
            return { totalHours, totalMinutes, mostStudied, leastStudied, logCount: logs.length };
        }
        const thisWeekStats = getWeekStats(thisWeek);
        const lastWeekStats = getWeekStats(lastWeek);
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            last7Days.push(d.toISOString().split('T')[0]);
        }
        const studyDays = last7Days.filter(d => dailyLogs.some(l => l.date === d)).length;
        const commitmentRate = Math.round((studyDays / 7) * 100);
        const allSubMins = {};
        for (const log of dailyLogs) {
            for (const sub of log.subjects || []) {
                allSubMins[sub.name] = (allSubMins[sub.name] || 0) + (sub.minutes || 0);
            }
        }
        const allEntries = Object.entries(allSubMins).sort((a, b) => b[1] - a[1]);
        const allTimeMost = allEntries[0]?.[0] || '—';
        const allTimeLeast = allEntries[allEntries.length - 1]?.[0] || '—';
        return {
            thisWeek: thisWeekStats,
            lastWeek: lastWeekStats,
            hoursChange: Math.round((thisWeekStats.totalHours - lastWeekStats.totalHours) * 10) / 10,
            commitmentRate,
            mostStudiedSubject: allTimeMost,
            leastStudiedSubject: allTimeLeast,
            studyDaysLast7: studyDays
        };
    }
}

// ============================================================
// 🧠 ADAPTIVE DIFFICULTY ENGINE
// ============================================================
class AdaptiveDifficultyEngine {
    static analyzeDifficulty(subjectsData, dailyLogs) {
        const difficultLessons = [];
        for (const subject of subjectsData) {
            for (const chapter of subject.chapters || []) {
                for (const lesson of chapter.lessons || []) {
                    if (lesson.status === 'not_started') continue;
                    let totalMinutes = 0;
                    let studyCount = 0;
                    for (const log of dailyLogs) {
                        for (const sub of log.subjects || []) {
                            if (sub.name === subject.name && sub.lessons?.includes(lesson.name)) {
                                totalMinutes += sub.minutes || 0;
                                studyCount++;
                            }
                        }
                    }
                    if (studyCount === 0) continue;
                    const chapterLessonMinutes = [];
                    for (const otherLesson of chapter.lessons) {
                        if (otherLesson.name === lesson.name) continue;
                        let otherTotal = 0;
                        let otherCount = 0;
                        for (const log of dailyLogs) {
                            for (const sub of log.subjects || []) {
                                if (sub.name === subject.name && sub.lessons?.includes(otherLesson.name)) {
                                    otherTotal += sub.minutes || 0;
                                    otherCount++;
                                }
                            }
                        }
                        if (otherCount > 0) chapterLessonMinutes.push(otherTotal / otherCount);
                    }
                    const expectedMinutes = chapterLessonMinutes.length > 0
                        ? chapterLessonMinutes.reduce((a, b) => a + b, 0) / chapterLessonMinutes.length
                        : 45;
                    if (totalMinutes > expectedMinutes * 1.5 && totalMinutes > 30) {
                        difficultLessons.push({
                            subject: subject.name,
                            subjectIcon: subject.icon,
                            chapter: chapter.name,
                            lesson: lesson.name,
                            totalMinutes: Math.round(totalMinutes),
                            expectedMinutes: Math.round(expectedMinutes),
                            studyCount,
                            isDifficult: true,
                            recommendedInterval: 3
                        });
                    }
                }
            }
        }
        return difficultLessons;
    }
}

// ============================================================
// 🧠 SMART SUGGESTIONS ENGINE
// ============================================================
class SuggestionsEngine {
    static suggestNextStudy(subjectsData, dailyHistory) {
        const weakest = subjectsData.reduce((min, s) => {
            const progress = s.progress || 0;
            return progress < (min.progress || 100) ? s : min;
        }, subjectsData[0]);
        if (!weakest) return null;
        const nextLesson = (weakest.chapters || []).flatMap(c =>
            (c.lessons || []).filter(l => l.status === 'not_started' || l.status === 'in_progress')
        )[0];
        const reviewLessons = subjectsData.flatMap(s =>
            (s.chapters || []).flatMap(c =>
                (c.lessons || []).filter(l => l.status === 'review_needed')
            )
        );
        return {
            suggestedSubject: weakest,
            suggestedLesson: nextLesson || null,
            reviewQueue: reviewLessons.slice(0, 5),
            message: nextLesson
                ? `اقتراح: ادرس ${nextLesson.name} في ${weakest.name}`
                : reviewLessons.length > 0
                    ? `لديك ${reviewLessons.length} دروس تحتاج مراجعة`
                    : 'أحسنت! كل الدروس منجزة - ركز على التمارين'
        };
    }
}

// ============================================================
// 📝 DAILY LOG GENERATOR
// ============================================================
class DailyLogGenerator {
    static generateDailyLog(data) {
        const date = data.date || new Date().toISOString().split('T')[0];
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const day = dayNames[new Date(date).getDay()];
        let subjectsYaml = data.subjects.map(s =>
            `  - name: ${s.name}\n    lessons:\n      - "${s.lesson}"\n    minutes: ${s.minutes}\n    notes: "${s.notes || ''}"`
        ).join('\n');
        const yaml = `---
date: ${date}
day: ${day}
productivity_score: ${data.productivityScore || 5}
total_study_minutes: ${data.totalMinutes || 0}
mood: ${data.mood || 'neutral'}
subjects_studied:
${subjectsYaml}
tasks_completed:
${(data.tasksCompleted || []).map(t => `  - "${t}"`).join('\n')}
tomorrow_goals:
${(data.tomorrowGoals || []).map(g => `  - "${g}"`).join('\n')}
streak: ${data.streak || 0}
---

# 📅 ${date} — ${day === 'Friday' ? 'الجمعة' : day === 'Saturday' ? 'السبت' : day}

## 📚 ما تم دراسته اليوم

${data.subjects.map(s => `### ${s.name}
- الدرس: ${s.lesson}
- المدة: ${s.minutes} دقيقة
- ملاحظات: ${s.notes || '—'}
`).join('\n')}

## ✅ المهام المنجزة
${(data.tasksCompleted || []).map(t => `- [x] ${t}`).join('\n') || '- لا توجد'}

## 🎯 أهداف الغد
${(data.tomorrowGoals || []).map(g => `- [ ] ${g}`).join('\n') || '- لا توجد'}

## ⏱️ إحصائيات اليوم
- **مجموع ساعات الدراسة:** ${Math.floor(data.totalMinutes / 60)}h ${data.totalMinutes % 60}m
- **تقييم الإنتاجية:** ${'⭐'.repeat(Math.round(data.productivityScore/2))} (${data.productivityScore}/10)
- **سلسلة الاستمرار:** ${data.streak} يوم 🔥
`;
        return yaml;
    }
}

// ============================================================
// 🔄 SPACED REPETITION ENGINE
// ============================================================
class SpacedRepetitionEngine {
    static getNextReviewDate(lastStudied, studyCount, isDifficult = false) {
        const intervals = isDifficult ? [1, 3, 14, 60, 120] : [1, 7, 30, 90, 180];
        const interval = intervals[Math.min(studyCount, intervals.length - 1)];
        const lastDate = new Date(lastStudied);
        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + interval);
        return nextDate.toISOString().split('T')[0];
    }

    static getReviewsForToday(subjectsData) {
        const today = new Date().toISOString().split('T')[0];
        const reviews = [];
        for (const subject of subjectsData) {
            for (const chapter of subject.chapters || []) {
                for (const lesson of chapter.lessons || []) {
                    if (lesson.nextReview && lesson.nextReview <= today) {
                        reviews.push({
                            subject: subject.name,
                            subjectIcon: subject.icon,
                            chapter: chapter.name,
                            lesson: lesson.name,
                            status: lesson.status,
                            lastStudied: lesson.lastStudied,
                            nextReview: lesson.nextReview,
                            studyCount: lesson.studyCount || 0
                        });
                    }
                }
            }
        }
        return reviews.sort((a, b) => a.nextReview.localeCompare(b.nextReview));
    }
}

// ============================================================
// 📡 SSE & FILE WATCHER (v3.0 - WITH HEARTBEAT)
// ============================================================

// Use Set instead of Array for better performance (O(1) add/delete)
const sseClients = new Set();

function addSSEClient(res) {
    sseClients.add(res);
}

function removeSSEClient(res) {
    sseClients.delete(res);
}

function notifySSEClients(data) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    const deadClients = [];
    for (const client of sseClients) {
        try {
            if (!client.destroyed) {
                client.write(message);
            } else {
                deadClients.push(client);
            }
        } catch (e) {
            deadClients.push(client);
        }
    }
    // Clean up dead connections after iteration
    for (const dead of deadClients) {
        sseClients.delete(dead);
    }
}

// Heartbeat to detect dead connections
function startSSEHeartbeat() {
    setInterval(() => {
        const timestamp = `data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`;
        const deadClients = [];
        for (const client of sseClients) {
            try {
                if (!client.destroyed) {
                    client.write(timestamp);
                } else {
                    deadClients.push(client);
                }
            } catch (e) {
                deadClients.push(client);
            }
        }
        // Clean up dead connections after iteration
        for (const dead of deadClients) {
            sseClients.delete(dead);
        }
        // Log active connections count
        if (sseClients.size > 0) {
            logInfo('SSE', `Active connections: ${sseClients.size}`);
        }
    }, CONFIG.SSE_HEARTBEAT_INTERVAL);
}

const watcher = chokidar.watch(BAC_FOLDER, {
    persistent: true,
    ignoreInitial: true,
    ignored: /(^|[\/\\])\.|node_modules/,
    awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
    }
});

watcher.on('add', (filePath) => {
    if (filePath.endsWith('.md')) {
        logInfo('File added', filePath);
        const relativePath = path.relative(BAC_FOLDER, filePath);
        notifySSEClients({ type: 'vault-changed', action: 'add', path: relativePath });
    }
});

watcher.on('change', (filePath) => {
    if (filePath.endsWith('.md')) {
        logInfo('File changed', filePath);
        const relativePath = path.relative(BAC_FOLDER, filePath);
        notifySSEClients({ type: 'vault-changed', action: 'change', path: relativePath });
        // Invalidate dashboard cache when files change
        dashboardCache = null;
    }
});

watcher.on('unlink', (filePath) => {
    if (filePath.endsWith('.md')) {
        logInfo('File removed', filePath);
        const relativePath = path.relative(BAC_FOLDER, filePath);
        notifySSEClients({ type: 'vault-changed', action: 'delete', path: relativePath });
    }
});

watcher.on('error', (error) => {
    logError('Chokidar watcher', error);
});

// ============================================================
// 🚀 DASHBOARD CACHE (with TTL)
// ============================================================

let dashboardCache = null;
let dashboardCacheTimestamp = 0;
let vaultAnalysisCache = null;
let vaultAnalysisTimestamp = 0;

// ============================================================
// 💾 BACKUP & ERROR LOGGING
// ============================================================
if (!fs.existsSync(BACKUP_FOLDER)) {
    fs.mkdirSync(BACKUP_FOLDER, { recursive: true });
}

function createBackup(filePath) {
    try {
        if (!fs.existsSync(filePath)) return;
        const fileName = path.basename(filePath);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
        const backupName = `${timestamp}_${fileName}`;
        const backupPath = path.join(BACKUP_FOLDER, backupName);
        fs.copyFileSync(filePath, backupPath);
        const backups = fs.readdirSync(BACKUP_FOLDER)
            .filter(f => f.endsWith(fileName))
            .sort()
            .reverse();
        for (let i = 10; i < backups.length; i++) {
            fs.unlinkSync(path.join(BACKUP_FOLDER, backups[i]));
        }
    } catch (e) {
        logError('createBackup', e);
    }
}

// ============================================================
// 📚 DATA LOADING (async/await كامل)
// ============================================================

async function loadSubject(subject) {
    try {
        const subjectPath = path.join(BAC_FOLDER, subject.folder);
        if (!fs.existsSync(subjectPath)) {
            return { ...subject, chapters: [], error: 'Folder not found' };
        }
        const allFiles = await fs.promises.readdir(subjectPath);
        let possibleFiles = allFiles.filter(f => f.endsWith('.md') && f.includes('برنامج'));
        if (possibleFiles.length === 0) {
            possibleFiles = allFiles.filter(f =>
                f.endsWith('.md') &&
                (f.match(/program/i) || f.match(/annual/i) || f.match(/english/i) || f.match(/french/i) || f.match(/français/i))
            );
        }
        if (possibleFiles.length === 0) {
            possibleFiles = allFiles.filter(f => f.endsWith('.md'));
        }
        if (possibleFiles.length === 0) {
            return { ...subject, chapters: [], error: 'No program file found' };
        }
        const filePath = path.join(subjectPath, possibleFiles[0]);
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const chapters = VaultParser.parseYearlyPlan(content, subject.id);
        const lastStudied = await getLastStudied(subject.name);
        return {
            ...subject,
            chapters,
            lastStudied,
            progress: chapters.length > 0
                ? Math.round(chapters.reduce((s, c) => s + c.completedCount, 0) /
                             Math.max(1, chapters.reduce((s, c) => s + c.totalCount, 0)) * 100)
                : 0,
            lastUpdated: new Date().toISOString()
        };
    } catch (e) {
        logError(`loadSubject(${subject.id})`, e);
        return { ...subject, chapters: [], error: e.message };
    }
}

async function loadAllSubjects() {
    try {
        const results = await Promise.all(
            SUBJECTS.map(subject => loadSubject(subject))
        );
        return results;
    } catch (e) {
        logError('loadAllSubjects', e);
        return [];
    }
}

async function getDailyFiles() {
    try {
        if (!fs.existsSync(DAILY_NOTES)) {
            return [];
        }
        const files = await fs.promises.readdir(DAILY_NOTES);
        return files
            .filter(f => f.endsWith('.md'))
            .slice(0, CONFIG.DAILY_NOTES_LIMIT)
            .map(f => ({ name: f, path: path.join(DAILY_NOTES, f) }))
            .sort((a, b) => b.name.localeCompare(a.name));
    } catch (e) {
        logError('getDailyFiles', e);
        return [];
    }
}

async function getTodayLog() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const filePath = path.join(DAILY_NOTES, `${today}.md`);
        if (!fs.existsSync(filePath)) return null;
        const content = await fs.promises.readFile(filePath, 'utf-8');
        return {
            date: today,
            ...VaultParser.parseDailyNote(content)
        };
    } catch (e) {
        logError('getTodayLog', e);
        return null;
    }
}

async function getAllDailyLogs() {
    try {
        const files = await getDailyFiles();
        if (files.length === 0) return [];
        const results = await Promise.allSettled(
            files.map(async (file) => {
                const content = await fs.promises.readFile(file.path, 'utf-8');
                return {
                    date: file.name.replace('.md', ''),
                    ...VaultParser.parseDailyNote(content)
                };
            })
        );
        return results.filter(r => r.status === 'fulfilled').map(r => r.value);
    } catch (e) {
        logError('getAllDailyLogs', e);
        return [];
    }
}

async function getLastStudied(subjectName) {
    try {
        if (!fs.existsSync(DAILY_NOTES)) return null;
        const files = await fs.promises.readdir(DAILY_NOTES)
            .then(f => f.filter(f => f.endsWith('.md')).sort().reverse());
        for (const file of files) {
            try {
                const content = await fs.promises.readFile(path.join(DAILY_NOTES, file), 'utf-8');
                if (content.includes(subjectName)) {
                    return file.replace('.md', '');
                }
            } catch (e) {
                // تجاهل
            }
        }
    } catch (e) {
        logError('getLastStudied failed', e);
    }
    return null;
}

// ============================================================
// 🔍 SEARCH ENGINE (v3.0 - with AbortController)
// ============================================================

async function searchVault(query, signal) {
    const results = [];
    const searchLower = query.toLowerCase();
    let searchCompleted = false;

    // Check if aborted
    function checkAborted() {
        if (signal && signal.aborted) {
            throw new Error('Search aborted');
        }
    }

    async function searchDir(dirPath, baseRel = '', depth = 0) {
        if (depth > 10 || searchCompleted) return;
        checkAborted();
        try {
            const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
            for (const item of items) {
                checkAborted();
                if (searchCompleted) return;
                const fullPath = path.join(dirPath, item.name);
                const relPath = path.join(baseRel, item.name);
                if (item.isDirectory()) {
                    if (!item.name.startsWith('.') &&
                        item.name !== 'node_modules' &&
                        item.name !== '.git') {
                        await searchDir(fullPath, relPath, depth + 1);
                    }
                } else if (item.isFile() && item.name.endsWith('.md')) {
                    try {
                        checkAborted();
                        const content = await fs.promises.readFile(fullPath, 'utf-8');
                        if (content.toLowerCase().includes(searchLower)) {
                            const lines = content.split('\n');
                            const matches = lines
                                .map((line, idx) => ({ line: line.trim(), index: idx }))
                                .filter(l => l.line.toLowerCase().includes(searchLower))
                                .slice(0, 3);
                            results.push({
                                path: relPath,
                                name: item.name,
                                matches: matches.map(m => ({
                                    line: m.index + 1,
                                    text: sanitizeText(m.line.substring(0, 150))
                                }))
                            });
                        }
                        if (results.length >= CONFIG.MAX_SEARCH_RESULTS) {
                            searchCompleted = true;
                            return;
                        }
                    } catch (e) {
                        // تجاهل أخطاء القراءة
                    }
                }
            }
        } catch (e) {
            // تجاهل أخطاء الوصول
        }
    }

    try {
        await Promise.race([
            searchDir(VAULT_PATH),
            new Promise((_, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Error('Search timeout'));
                }, CONFIG.SEARCH_TIMEOUT);
                if (signal) {
                    signal.addEventListener('abort', () => {
                        clearTimeout(timeoutId);
                        reject(new Error('Search aborted'));
                    });
                }
            })
        ]);
    } catch (e) {
        if (e.message !== 'Search timeout' && e.message !== 'Search aborted') {
            logError('searchVault', e);
        }
    }
    return results.slice(0, CONFIG.MAX_SEARCH_RESULTS);
}

// ============================================================
// 🚀 UTILITY FUNCTIONS
// ============================================================

function getCSPHeader() {
    return "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.tailwindcss.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' http://localhost:3000; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
}

function getSecurityHeaders() {
    return {
        'Content-Security-Policy': getCSPHeader(),
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    };
}

function isAllowedOrigin(origin) {
    return CONFIG.ALLOWED_ORIGINS.includes(origin);
}

function sendJson(res, data, statusCode = 200, origin = null) {
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
    };
    
    // Only add CORS headers if origin is allowed
    if (origin && isAllowedOrigin(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    } else if (!origin) {
        // For server-side requests, use first allowed origin
        headers['Access-Control-Allow-Origin'] = CONFIG.ALLOWED_ORIGINS[0];
    }
    
    // Add security headers
    Object.assign(headers, getSecurityHeaders());
    
    res.writeHead(statusCode, headers);
    res.end(JSON.stringify(data));
}

/**
 * Get request body with size limit enforcement
 * @param {http.IncomingMessage} req - Request object
 * @returns {Promise<string>} Request body
 */
async function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;

        req.on('data', chunk => {
            size += chunk.length;
            chunks.push(chunk);

            // Close connection immediately if size exceeds limit
            if (size > CONFIG.MAX_FILE_SIZE) {
                req.destroy();
                reject(new Error('Request body too large'));
                return;
            }
        });

        req.on('end', () => {
            resolve(Buffer.concat(chunks).toString());
        });

        req.on('error', reject);
    });
}

async function updateLessonStatus(subjectName, lessonName, status) {
    try {
        const subject = SUBJECTS.find(s => s.name === subjectName);
        if (!subject) return false;
        const subjectPath = path.join(BAC_FOLDER, subject.folder);
        if (!fs.existsSync(subjectPath)) return false;
        const files = await fs.promises.readdir(subjectPath);
        let possibleFiles = files.filter(f => f.endsWith('.md') && f.includes('برنامج'));
        if (possibleFiles.length === 0) {
            possibleFiles = files.filter(f =>
                f.endsWith('.md') &&
                (f.match(/program/i) || f.match(/annual/i) || f.match(/english/i) || f.match(/french/i) || f.match(/français/i))
            );
        }
        if (possibleFiles.length === 0) {
            possibleFiles = files.filter(f => f.endsWith('.md'));
        }
        if (possibleFiles.length === 0) {
            logError('updateLessonStatus: No program file found', new Error(`No .md file in ${subjectPath}`));
            return false;
        }
        const filePath = path.join(subjectPath, possibleFiles[0]);
        createBackup(filePath);
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const newContent = VaultParser.updateLessonStatus(content, lessonName, status);
        if (newContent !== content) {
            await fs.promises.writeFile(filePath, newContent, 'utf-8');
            return true;
        }
        return false;
    } catch (e) {
        logError('updateLessonStatus', e);
        return false;
    }
}

// ============================================================
// 🚀 HTTP SERVER & API ROUTES (v3.0 - SECURE)
// ============================================================

const server = http.createServer(async (req, res) => {
    let pathname;
    try {
        const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        pathname = reqUrl.pathname;
    } catch (e) {
        logError('URL parsing error', e);
        sendJson(res, { success: false, error: 'Invalid URL' }, 400);
        return;
    }
    const method = req.method;
    const origin = req.headers.origin;
    const clientIP = getClientIP(req);

    logInfo('Request', `${method} ${pathname} from ${clientIP}`);

    // CORS Preflight
    if (method === 'OPTIONS') {
        if (origin && isAllowedOrigin(origin)) {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400',
                ...getSecurityHeaders()
            });
        } else {
            res.writeHead(403, getSecurityHeaders());
        }
        res.end();
        return;
    }

    // Rate limiting (skip for static files)
    if (pathname.startsWith('/api/')) {
        if (!checkRateLimit(clientIP)) {
            logWarn('Rate limit exceeded', clientIP);
            sendJson(res, { success: false, error: 'Too many requests' }, 429, origin);
            return;
        }
    }

    // Health check endpoint
    if (method === 'GET' && pathname === '/health') {
        sendJson(res, {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            sseClients: sseClients.size
        }, 200, origin);
        return;
    }

    try {
        // Method validation for API
        if (pathname.startsWith('/api/') && !['GET', 'POST'].includes(method)) {
            sendJson(res, { success: false, error: 'Method not allowed' }, 405, origin);
            return;
        }

        // SSE endpoint
        if (pathname === '/api/events' && method === 'GET') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': CONFIG.ALLOWED_ORIGINS[0],
                ...getSecurityHeaders()
            });
            res.write('data: {"type":"connected"}\n\n');
            addSSEClient(res);

            req.on('close', () => {
                removeSSEClient(res);
                logInfo('SSE', 'Client disconnected');
            });
            return;
        }

        // ============================================================
        // 📊 DASHBOARD API
        // ============================================================
        if (pathname === '/api/dashboard' && method === 'GET') {
            const now = Date.now();
            if (dashboardCache && (now - dashboardCacheTimestamp < CONFIG.DASHBOARD_CACHE_TTL)) {
                sendJson(res, dashboardCache, 200, origin);
                return;
            }

            const subjectsData = await loadAllSubjects();
            const dailyFiles = await getDailyFiles();
            const progress = AnalyticsEngine.calculateProgress(subjectsData);
            const streak = AnalyticsEngine.calculateStreak(dailyFiles.map(f => f.name), Date.now());
            const todayLog = await getTodayLog();
            const reviewsToday = SpacedRepetitionEngine.getReviewsForToday(subjectsData);
            const allLogs = await getAllDailyLogs();
            const difficultLessons = AdaptiveDifficultyEngine.analyzeDifficulty(subjectsData, allLogs);
            const actualTotalTasks = allLogs.reduce((sum, log) => sum + (log.tasksCompleted?.length || 0), 0);
            const bacReadiness = AnalyticsEngine.calculateBACReadiness(progress, {
                totalMinutes: todayLog?.totalMinutes || 0,
                longestStreak: streak,
                totalTasks: actualTotalTasks || 0,
                completedTasks: actualTotalTasks || 0
            });
            const suggestion = SuggestionsEngine.suggestNextStudy(subjectsData, dailyFiles);
            const responsePayload = {
                success: true,
                data: {
                    today: todayLog,
                    progress,
                    streak,
                    bacReadiness,
                    reviewsToday,
                    suggestion,
                    difficultLessons,
                    daysUntilBAC: getDaysUntilBAC(),
                    bacDate: BAC_DATE
                }
            };

            dashboardCache = responsePayload;
            dashboardCacheTimestamp = now;

            sendJson(res, responsePayload, 200, origin);
            return;
        }

        // ============================================================
        // 📚 SUBJECTS API
        // ============================================================
        if (pathname === '/api/subjects' && method === 'GET') {
            const subjectsData = await loadAllSubjects();
            sendJson(res, { success: true, data: subjectsData }, 200, origin);
            return;
        }

        if (pathname.match(/^\/api\/subjects\/(\d+)$/) && method === 'GET') {
            const match = pathname.match(/^\/api\/subjects\/(\d+)$/);
            const subjectIndex = parseInt(match[1]);
            const subject = SUBJECTS[subjectIndex];
            if (!subject) {
                sendJson(res, { success: false, error: 'Subject not found' }, 404, origin);
                return;
            }
            const data = await loadSubject(subject);
            sendJson(res, { success: true, data }, 200, origin);
            return;
        }

        // ============================================================
        // 📝 DAILY LOG API
        // ============================================================
        if (pathname === '/api/daily/save' && method === 'POST') {
            // Validate Content-Type
            if (!hasValidContentType(req)) {
                sendJson(res, { success: false, error: 'Content-Type must be application/json' }, 400, origin);
                return;
            }

            try {
                const body = await getRequestBody(req);
                let logData;
                try {
                    logData = JSON.parse(body);
                } catch (e) {
                    sendJson(res, { success: false, error: 'Invalid JSON data' }, 400, origin);
                    return;
                }
                if (!logData || typeof logData !== 'object') {
                    sendJson(res, { success: false, error: 'Invalid request data' }, 400, origin);
                    return;
                }
                if (!logData.date || typeof logData.date !== 'string') {
                    sendJson(res, { success: false, error: 'Missing or invalid date' }, 400, origin);
                    return;
                }
                if (!Array.isArray(logData.subjects)) {
                    sendJson(res, { success: false, error: 'Missing or invalid subjects array' }, 400, origin);
                    return;
                }
                if (!fs.existsSync(DAILY_NOTES)) {
                    await fs.promises.mkdir(DAILY_NOTES, { recursive: true });
                }
                const dailyFiles = await getDailyFiles();
                const sessionEndTime = logData.sessionEndTime || Date.now();
                const streak = AnalyticsEngine.calculateStreak(dailyFiles.map(f => f.name), sessionEndTime);
                logData.streak = streak;
                const content = DailyLogGenerator.generateDailyLog(logData);
                const dateStr = logData.date || new Date().toISOString().split('T')[0];
                const filePath = path.join(DAILY_NOTES, `${dateStr}.md`);
                createBackup(filePath);
                await fs.promises.writeFile(filePath, content, 'utf-8');
                for (const sub of logData.subjects) {
                    await updateLessonStatus(sub.name, sub.lesson, 'in_progress');
                }
                notifySSEClients({ type: 'daily_log_saved', date: dateStr });
                sendJson(res, {
                    success: true,
                    message: 'تم حفظ اليوم الدراسي بنجاح ✅',
                    file: `${dateStr}.md`
                }, 200, origin);
            } catch (e) {
                logError('POST /api/daily/save', e);
                sendJson(res, { success: false, error: 'Failed to save daily log' }, 400, origin);
            }
            return;
        }

        // ============================================================
        // 📝 LESSONS UPDATE API
        // ============================================================
        if (pathname === '/api/lessons/update' && method === 'POST') {
            if (!hasValidContentType(req)) {
                sendJson(res, { success: false, error: 'Content-Type must be application/json' }, 400, origin);
                return;
            }

            const body = await getRequestBody(req);
            let parsedBody;
            try {
                parsedBody = JSON.parse(body);
            } catch (e) {
                sendJson(res, { success: false, error: 'Invalid JSON data' }, 400, origin);
                return;
            }
            const { subjectId, lessonName, status } = parsedBody;
            if (!subjectId) {
                sendJson(res, { success: false, error: 'Missing subject ID' }, 400, origin);
                return;
            }
            if (!lessonName || typeof lessonName !== 'string' || lessonName.trim().length === 0) {
                sendJson(res, { success: false, error: 'Missing or invalid lesson name' }, 400, origin);
                return;
            }
            if (!status || !STATUS_MAP[status]) {
                sendJson(res, { success: false, error: 'Missing or invalid status' }, 400, origin);
                return;
            }
            const subject = SUBJECTS.find(s => s.id === subjectId);
            if (!subject) {
                sendJson(res, { success: false, error: 'Subject not found' }, 404, origin);
                return;
            }
            const updated = await updateLessonStatus(subject.name, lessonName.trim(), status);
            if (updated) {
                notifySSEClients({ type: 'lesson_updated', subject: subject.name, lesson: lessonName, status });
                sendJson(res, { success: true, message: `تم تحديث حالة الدرس: ${lessonName}` }, 200, origin);
            } else {
                sendJson(res, { success: false, error: 'Failed to update lesson status' }, 500, origin);
            }
            return;
        }

        // ============================================================
        // 📊 ANALYTICS & HISTORY API
        // ============================================================
        if (pathname === '/api/daily/history' && method === 'GET') {
            const logs = await getAllDailyLogs();
            sendJson(res, { success: true, data: logs }, 200, origin);
            return;
        }

        // ============================================================
        // 🔍 SEARCH API (with AbortController)
        // ============================================================
        if (pathname === '/api/search' && method === 'GET') {
            const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const query = reqUrl.searchParams.get('q') || '';
            if (!query || query.length < 2) {
                sendJson(res, { success: true, data: [] }, 200, origin);
                return;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.SEARCH_TIMEOUT);

            try {
                const results = await searchVault(query, controller.signal);
                clearTimeout(timeoutId);
                sendJson(res, { success: true, data: results }, 200, origin);
            } catch (e) {
                clearTimeout(timeoutId);
                if (e.message !== 'Search aborted') {
                    logError('Search API', e);
                }
                sendJson(res, { success: true, data: [] }, 200, origin);
            }
            return;
        }

        // ============================================================
        // 🎓 BAC READINESS API
        // ============================================================
        if (pathname === '/api/bac-readiness' && method === 'GET') {
            const subjectsData = await loadAllSubjects();
            const dailyFiles = await getDailyFiles();
            const progress = AnalyticsEngine.calculateProgress(subjectsData);
            const streak = AnalyticsEngine.calculateStreak(dailyFiles.map(f => f.name), Date.now());
            const todayLog = await getTodayLog();
            const allLogs = await getAllDailyLogs();
            const actualTotalTasks = allLogs.reduce((sum, log) => sum + (log.tasksCompleted?.length || 0), 0);
            const bacReadiness = AnalyticsEngine.calculateBACReadiness(progress, {
                totalMinutes: todayLog?.totalMinutes || 0,
                longestStreak: streak,
                totalTasks: actualTotalTasks || 0,
                completedTasks: actualTotalTasks || 0
            });
            sendJson(res, { success: true, data: bacReadiness }, 200, origin);
            return;
        }

        // ============================================================
        // 📈 ANALYTICS API
        // ============================================================
        if (pathname === '/api/analytics' && method === 'GET') {
            const subjectsData = await loadAllSubjects();
            const dailyFiles = await getDailyFiles();
            const progress = AnalyticsEngine.calculateProgress(subjectsData);
            const allLogs = await getAllDailyLogs();
            const logs = allLogs.slice(0, 30);
            const weeklyMinutes = logs.reduce((sum, l) => sum + (l.totalMinutes || 0), 0);
            const avgDailyMinutes = logs.length > 0 ? Math.round(weeklyMinutes / logs.length) : 0;
            const comparative = AnalyticsEngine.calculateComparative(allLogs);
            const difficultLessons = AdaptiveDifficultyEngine.analyzeDifficulty(subjectsData, allLogs);
            sendJson(res, { success: true, data: {
                progress,
                weeklyMinutes,
                avgDailyMinutes,
                dailyLogs: logs.slice(0, 14),
                comparative,
                difficultLessons
            }}, 200, origin);
            return;
        }

        // ============================================================
        // 🎮 GAMIFICATION API
        // ============================================================
        if (pathname === '/api/gamification/stats' && method === 'GET') {
            try {
                const stats = await XPSystem.getPlayerStats();
                if (!stats) {
                    sendJson(res, { success: false, error: 'Failed to load gamification stats' }, 500, origin);
                    return;
                }
                sendJson(res, { success: true, data: stats }, 200, origin);
            } catch (e) {
                logError('GET /api/gamification/stats', e);
                sendJson(res, { success: false, error: 'Failed to load gamification stats' }, 500, origin);
            }
            return;
        }

        if (pathname === '/api/gamification/achievements' && method === 'GET') {
            try {
                const achievements = await studyDB.getAchievements();
                sendJson(res, { success: true, data: achievements }, 200, origin);
            } catch (e) {
                logError('GET /api/gamification/achievements', e);
                sendJson(res, { success: false, error: 'Failed to load achievements' }, 500, origin);
            }
            return;
        }

        if (pathname === '/api/gamification/award-xp' && method === 'POST') {
            if (!hasValidContentType(req)) {
                sendJson(res, { success: false, error: 'Content-Type must be application/json' }, 400, origin);
                return;
            }

            try {
                const body = await getRequestBody(req);
                let data;
                try {
                    data = JSON.parse(body);
                } catch (e) {
                    sendJson(res, { success: false, error: 'Invalid JSON' }, 400, origin);
                    return;
                }
                const { eventType } = data;
                if (!eventType || !XPSystem.REWARDS[eventType]) {
                    sendJson(res, { success: false, error: 'Invalid event type' }, 400, origin);
                    return;
                }
                const result = await XPSystem.awardXP(eventType);
                if (result) {
                    sendJson(res, { success: true, data: result }, 200, origin);
                } else {
                    sendJson(res, { success: false, error: 'Failed to award XP' }, 500, origin);
                }
            } catch (e) {
                logError('POST /api/gamification/award-xp', e);
                sendJson(res, { success: false, error: 'Failed to award XP' }, 500, origin);
            }
            return;
        }

        // ============================================================
        // 📤 EXPORT API
        // ============================================================
        if (pathname === '/api/export/csv' && method === 'GET') {
            try {
                const csv = await studyDB.exportToCSV();
                res.writeHead(200, {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': 'attachment; filename="study_sessions.csv"',
                    'Access-Control-Allow-Origin': CONFIG.ALLOWED_ORIGINS[0],
                    ...getSecurityHeaders()
                });
                res.end(csv);
            } catch (e) {
                logError('GET /api/export/csv', e);
                sendJson(res, { success: false, error: 'Failed to export CSV' }, 500, origin);
            }
            return;
        }

        if (pathname === '/api/export/json' && method === 'GET') {
            try {
                const json = await studyDB.exportToJSON();
                res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Disposition': 'attachment; filename="study_sessions.json"',
                    'Access-Control-Allow-Origin': CONFIG.ALLOWED_ORIGINS[0],
                    ...getSecurityHeaders()
                });
                res.end(json);
            } catch (e) {
                logError('GET /api/export/json', e);
                sendJson(res, { success: false, error: 'Failed to export JSON' }, 500, origin);
            }
            return;
        }

        // ============================================================
        // 🎯 REFACTOR PLAN API
        // ============================================================
        if (pathname === '/api/refactor-plan' && method === 'GET') {
            const subjectsData = await loadAllSubjects();
            const allLogs = await getAllDailyLogs();
            const reviews = SpacedRepetitionEngine.getReviewsForToday(subjectsData);
            const today = new Date().toISOString().split('T')[0];
            const overdueReviews = reviews.filter(r => r.nextReview && r.nextReview < today);
            const difficultLessons = AdaptiveDifficultyEngine.analyzeDifficulty(subjectsData, allLogs);
            const last7Days = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                last7Days.push(d.toISOString().split('T')[0]);
            }
            const studiedSubjects = new Set();
            for (const log of allLogs) {
                if (last7Days.includes(log.date)) {
                    for (const sub of log.subjects || []) {
                        studiedSubjects.add(sub.name);
                    }
                }
            }
            const neglectedSubjects = SUBJECTS
                .filter(s => !studiedSubjects.has(s.name))
                .map(s => s.name);
            let recoveryPlan = null;
            if (overdueReviews.length > 5 || difficultLessons.length > 3 || neglectedSubjects.length > 0) {
                const recoveryTasks = [];
                for (const review of overdueReviews.slice(0, 3)) {
                    recoveryTasks.push({
                        text: `🔴 مراجعة عاجلة: ${review.lesson} (${review.subject})`,
                        priority: 'urgent',
                        type: 'review'
                    });
                }
                for (const dl of difficultLessons.slice(0, 3)) {
                    recoveryTasks.push({
                        text: `🟡 إعادة دراسة (صعبة): ${dl.lesson} (${dl.subject})`,
                        priority: 'important',
                        type: 'restudy'
                    });
                }
                for (const ns of neglectedSubjects.slice(0, 3)) {
                    recoveryTasks.push({
                        text: `🟢 دراسة مادة مهملة: ${ns}`,
                        priority: 'normal',
                        type: 'study'
                    });
                }
                recoveryPlan = {
                    hasIssues: true,
                    hasOverdueReviews: overdueReviews.length > 5,
                    hasDifficultLessons: difficultLessons.length > 3,
                    hasNeglectedSubjects: neglectedSubjects.length > 0,
                    overdueCount: overdueReviews.length,
                    difficultCount: difficultLessons.length,
                    neglectedCount: neglectedSubjects.length,
                    message: `🚨 خطة إنقاذ: ${overdueReviews.length > 5 ? `لديك ${overdueReviews.length} مراجعات متأخرة. ` : ''}${difficultLessons.length > 3 ? `${difficultLessons.length} دروس صعبة. ` : ''}${neglectedSubjects.length > 0 ? `${neglectedSubjects.length} مواد مهملة.` : ''}`,
                    recoveryTasks,
                    strategy: overdueReviews.length > 5
                        ? '📋 ركز على المراجعات المتأخرة أولاً قبل بدء دروس جديدة'
                        : difficultLessons.length > 3
                            ? '📋 أعد دراسة الدروس الصعبة بوقت إضافي'
                            : '📋 ابدأ بتغطية المواد المهملة'
                };
            } else {
                recoveryPlan = {
                    hasIssues: false,
                    message: '✅ لا توجد مشاكل ملحوظة. استمر في خطتك الحالية.',
                    overdueCount: 0,
                    difficultCount: 0,
                    neglectedCount: 0,
                    recoveryTasks: [],
                    strategy: 'استمر في الوتيرة الحالية'
                };
            }
            sendJson(res, { success: true, data: recoveryPlan }, 200, origin);
            return;
        }

        if (pathname === '/api/adaptive-difficulty' && method === 'GET') {
            const subjectsData = await loadAllSubjects();
            const allLogs = await getAllDailyLogs();
            const difficultLessons = AdaptiveDifficultyEngine.analyzeDifficulty(subjectsData, allLogs);
            sendJson(res, { success: true, data: difficultLessons }, 200, origin);
            return;
        }

        // ============================================================
        // 🧠 KNOWLEDGE GRAPH & VAULT API
        // ============================================================

        if (pathname === '/api/vault/graph' && method === 'GET') {
            try {
                const now = Date.now();
                if (vaultAnalysisCache && (now - vaultAnalysisTimestamp < CONFIG.VAULT_ANALYSIS_TTL)) {
                    sendJson(res, { success: true, data: vaultAnalysisCache }, 200, origin);
                    return;
                }
                const results = VaultAnalyzer.parseVault();
                const graph = VaultAnalyzer.buildKnowledgeGraph(results);
                vaultAnalysisCache = graph;
                vaultAnalysisTimestamp = now;
                sendJson(res, { success: true, data: graph }, 200, origin);
            } catch (e) {
                logError('GET /api/vault/graph', e);
                sendJson(res, { success: false, error: 'Failed to build knowledge graph' }, 500, origin);
            }
            return;
        }

        if (pathname === '/api/vault/tags' && method === 'GET') {
            try {
                const now = Date.now();
                if (vaultAnalysisCache && (now - vaultAnalysisTimestamp < CONFIG.VAULT_ANALYSIS_TTL)) {
                    const tagNodes = (vaultAnalysisCache.nodes || [])
                        .filter(n => n.type === 'tag')
                        .map(n => ({ id: n.id, name: n.name }));
                    sendJson(res, { success: true, data: tagNodes }, 200, origin);
                    return;
                }
                const results = VaultAnalyzer.parseVault();
                const graph = VaultAnalyzer.buildKnowledgeGraph(results);
                vaultAnalysisCache = graph;
                vaultAnalysisTimestamp = now;
                const tagNodes = graph.nodes.filter(n => n.type === 'tag').map(n => ({ id: n.id, name: n.name }));
                sendJson(res, { success: true, data: tagNodes }, 200, origin);
            } catch (e) {
                logError('GET /api/vault/tags', e);
                sendJson(res, { success: false, error: 'Failed to load tags' }, 500, origin);
            }
            return;
        }

        if (pathname.match(/^\/api\/vault\/backlinks\/(.+)$/) && method === 'GET') {
            const match = pathname.match(/^\/api\/vault\/backlinks\/(.+)$/);
            const fileId = decodeURIComponent(match[1]).replace(/\.(md|canvas|base)$/, '');
            try {
                const results = VaultAnalyzer.parseVault();
                const backlinks = VaultAnalyzer.getBacklinks(fileId, results);
                sendJson(res, { success: true, data: backlinks }, 200, origin);
            } catch (e) {
                logError('GET /api/vault/backlinks', e);
                sendJson(res, { success: false, error: 'Failed to get backlinks' }, 500, origin);
            }
            return;
        }

        if (pathname.match(/^\/api\/vault\/outlinks\/(.+)$/) && method === 'GET') {
            const match = pathname.match(/^\/api\/vault\/outlinks\/(.+)$/);
            const fileId = decodeURIComponent(match[1]).replace(/\.(md|canvas|base)$/, '');
            try {
                const results = VaultAnalyzer.parseVault();
                const outlinks = VaultAnalyzer.getOutgoingLinks(fileId, results);
                sendJson(res, { success: true, data: outlinks }, 200, origin);
            } catch (e) {
                logError('GET /api/vault/outlinks', e);
                sendJson(res, { success: false, error: 'Failed to get outgoing links' }, 500, origin);
            }
            return;
        }

        if (pathname === '/api/vault/analyze' && method === 'GET') {
            try {
                const results = VaultAnalyzer.parseVault();
                const graph = VaultAnalyzer.buildKnowledgeGraph(results);
                const stats = {
                    totalFiles: results.length,
                    totalTags: graph.nodes.filter(n => n.type === 'tag').length,
                    totalLinks: graph.edges.filter(e => e.relation === 'wikilink').length,
                    totalEmbeds: results.reduce((s, r) => s + r.embedTargets.length, 0),
                    avgWordCount: results.length > 0
                        ? Math.round(results.reduce((s, r) => s + r.wordCount, 0) / results.length)
                        : 0,
                    files: results.slice(0, 100).map(f => ({
                        id: f.fileId,
                        path: f.path,
                        wordCount: f.wordCount,
                        tags: f.tags,
                        wikilinks: f.wikilinkTargets,
                        frontmatter: f.frontmatter
                    }))
                };
                sendJson(res, { success: true, data: stats }, 200, origin);
            } catch (e) {
                logError('GET /api/vault/analyze', e);
                sendJson(res, { success: false, error: 'Failed to analyze vault' }, 500, origin);
            }
            return;
        }

        // ============================================================
        // 📁 STATIC FILE SERVING (SECURE)
        // ============================================================
        serveStaticFile(pathname, res, origin);

    } catch (error) {
        logError('Server error', error);
        sendJson(res, { success: false, error: 'Internal server error' }, 500, origin);
    }
});

// ============================================================
// 🔒 SECURE STATIC FILE SERVING (v3.1 - WINDOWS & ONEDRIVE OPTIMIZED)
// ============================================================

function serveStaticFile(pathname, res, origin) {
    try {
        // 1. فك ترميز الرابط بشكل آمن للتعامل مع الحروف العربية والمسافات (مثل: المستندات، BAC 2027)
        const decodedPath = decodeURIComponent(pathname || '');
        
        // 2. تنظيف المسار وإزالة الشرطة المائلة الأمامية للوصول للمسار النسبي
        let cleanPath = decodedPath.startsWith('/') ? decodedPath.substring(1) : decodedPath;
        
        // إذا كان المسار فارغاً، نتوجه تلقائياً لصفحة البداية
        if (!cleanPath || cleanPath === '') {
            cleanPath = 'index.html';
        }

        // 3. بناء المسار المطلق الكامل للملف على جهازك
        const filePath = path.resolve(BAC_SYSTEM_PATH, cleanPath);

        // 4. نظام حماية مدمج ومطور (بديل لـ isPathSafe المتعارض مع الويندوز)
        // نقوم بتحويل المسارات بالكامل إلى أحرف صغيرة (lowercase) لحل مشكلة C:\ و c:\ في الويندوز
        const baseFolderResolved = path.resolve(BAC_SYSTEM_PATH).toLowerCase();
        
        function verifyPathSafety(absolutePath) {
            // 1. تحقق من عدم وجود .. (parent directory traversal)
            const normalized = path.normalize(absolutePath);
            if (normalized.includes('..')) {
                return false;
            }
            // 2. تحقق من أن المسار يبدأ بالمسار الأساسي (مع تجاهل حالة الأحرف للويندوز)
            return normalized.toLowerCase().startsWith(baseFolderResolved);
        }

        // فحص الأمان للمسار الأساسي
        if (!verifyPathSafety(filePath)) {
            logWarn('⚠️ [SECURITY] محاولة تخطي مسار حقيقية ومرفوضة:', { pathname: decodedPath, origin });
            res.writeHead(403, getSecurityHeaders());
            res.end(JSON.stringify({ success: false, error: 'Access denied' }));
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

        // 5. محاولة قراءة الملف وإرساله للمتصفح
        fs.readFile(filePath, (err, content) => {
            if (err) {
                // إذا لم يجد الملف في المسار المباشر، وكان الملف ليس داخل ui، نجرب البحث عنه داخل مجلد ui كدعم إضافي (Fallback)
                if (err.code === 'ENOENT' && !cleanPath.startsWith('ui/')) {
                    const uiFilePath = path.resolve(BAC_SYSTEM_PATH, 'ui', cleanPath);
                    
                    // التحقق من أمان مسار الـ UI الفرعي المدمج
                    if (!verifyPathSafety(uiFilePath)) {
                        res.writeHead(403, getSecurityHeaders());
                        res.end(JSON.stringify({ success: false, error: 'Access denied' }));
                        return;
                    }

                    fs.readFile(uiFilePath, (err2, content2) => {
                        if (err2) {
                            res.writeHead(404, { 'Content-Type': 'application/json', ...getSecurityHeaders() });
                            res.end(JSON.stringify({ success: false, error: 'File not found' }));
                        } else {
                            res.writeHead(200, { 'Content-Type': mimeType, ...getSecurityHeaders() });
                            res.end(content2);
                        }
                    });
                } else {
                    // الملف غير موجود نهائياً في أي مكان
                    res.writeHead(404, { 'Content-Type': 'application/json', ...getSecurityHeaders() });
                    res.end(JSON.stringify({ success: false, error: 'File not found' }));
                }
            } else {
                // النجاح: إرسال الملف فوراً للمتصفح بكامل صلاحياته وتنسيقاته
                res.writeHead(200, { 'Content-Type': mimeType, ...getSecurityHeaders() });
                res.end(content);
            }
        });
    } catch (e) {
        console.error('❌ [CRITICAL ERROR] في دالة serveStaticFile:', e);
        res.writeHead(500, { 'Content-Type': 'application/json', ...getSecurityHeaders() });
        res.end(JSON.stringify({ success: false, error: 'Server error' }));
    }
}


// ============================================================
// 🚀 START SERVER (v3.0)
// ============================================================

server.listen(PORT, () => {
    logInfo('Server started', `🎓 BAC 2027 v3.0 HARDENED & SECURE on http://localhost:${PORT}`);
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║     🎓 BAC 2027 Intelligent Study Operating System v3.0     ║
║     --------------------------------------------------     ║
║     ✅ Server running on: http://localhost:${PORT}            ║
║     ✅ Vault path: ${VAULT_PATH}                              ║
║     ✅ HARDENED & SECURE v3.0                                ║
║                                                              ║
║     🔒 Security: CSP, Rate Limiting, Path Validation        ║
║     📡 SSE: Heartbeat every 30s                              ║
║     🛡️  CORS: Localhost only                                 ║
║                                                              ║
║     📊 Dashboard:   http://localhost:${PORT}                  ║
║     📡 Live Sync:   http://localhost:${PORT}/api/events      ║
║     🔍 Search:      http://localhost:${PORT}/api/search      ║
║     📈 Analytics:   http://localhost:${PORT}/api/analytics   ║
║     🧠 Vault Graph: http://localhost:${PORT}/api/vault/graph  ║
║     🏷️ Vault Tags:  http://localhost:${PORT}/api/vault/tags  ║
║     🎓 BAC Date:    ${BAC_DATE} (${getDaysUntilBAC()} days)    ║
╚══════════════════════════════════════════════════════════════╝
    `);

    // Start SSE heartbeat
    startSSEHeartbeat();
});

process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    watcher.close();
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('uncaughtException', (error) => {
    logError('Uncaught exception', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logError('Unhandled rejection', { reason, promise });
});

module.exports = { server };