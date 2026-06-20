/**
 * BAC 2027 - SQLite Database Module
 * 📊 Persistent storage for study sessions and analytics
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'study_sessions.db');

class StudyDatabase {
    constructor() {
        this.db = null;
        this.init();
    }

    init() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(DB_PATH);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // Initialize database
            this.db = new Database(DB_PATH);
            this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better performance
            this.db.pragma('foreign_keys = ON');

            // Create tables
            this.createTables();
            
            console.log('✅ Database initialized:', DB_PATH);
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
            throw error;
        }
    }

    createTables() {
        // Study sessions table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS study_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                subject_id TEXT,
                subject_name TEXT,
                lesson_name TEXT,
                duration_minutes INTEGER DEFAULT 0,
                mood TEXT DEFAULT 'neutral',
                distraction_level INTEGER DEFAULT 0,
                productivity_score INTEGER DEFAULT 5,
                session_type TEXT DEFAULT 'study',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // XP and Gamification table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS xp_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                event_type TEXT NOT NULL,
                xp_amount INTEGER NOT NULL,
                description TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Achievements table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS achievements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                achievement_key TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                icon TEXT,
                unlocked_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Daily stats table (pre-computed for performance)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS daily_stats (
                date TEXT PRIMARY KEY,
                total_sessions INTEGER DEFAULT 0,
                total_minutes INTEGER DEFAULT 0,
                total_xp INTEGER DEFAULT 0,
                productivity_avg REAL DEFAULT 0,
                subjects_studied TEXT,
                streak_days INTEGER DEFAULT 0,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for common queries
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_sessions_date ON study_sessions(date);
            CREATE INDEX IF NOT EXISTS idx_sessions_subject ON study_sessions(subject_id);
            CREATE INDEX IF NOT EXISTS idx_xp_date ON xp_events(date);
        `);
    }

    // ============================================================
    // 📝 SESSION MANAGEMENT
    // ============================================================

    async addSession(sessionData) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO study_sessions (
                    date, subject_id, subject_name, lesson_name,
                    duration_minutes, mood, distraction_level, productivity_score, session_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const result = stmt.run(
                sessionData.date,
                sessionData.subjectId || null,
                sessionData.subjectName || null,
                sessionData.lessonName || null,
                sessionData.durationMinutes || 0,
                sessionData.mood || 'neutral',
                sessionData.distractionLevel || 0,
                sessionData.productivityScore || 5,
                sessionData.sessionType || 'study'
            );

            // Update daily stats
            await this.updateDailyStats(sessionData.date);

            return result.lastInsertRowid;
        } catch (error) {
            console.error('Error adding session:', error);
            throw error;
        }
    }

    async getSessions(dateRange = null) {
        try {
            let query = `
                SELECT * FROM study_sessions 
                WHERE 1=1
            `;
            const params = [];

            if (dateRange) {
                query += ` AND date BETWEEN ? AND ?`;
                params.push(dateRange.start, dateRange.end);
            }

            query += ` ORDER BY date DESC, created_at DESC`;

            const stmt = this.db.prepare(query);
            return stmt.all(...params);
        } catch (error) {
            console.error('Error getting sessions:', error);
            return [];
        }
    }

    // ============================================================
    // ⭐ XP & GAMIFICATION
    // ============================================================

    async addXP(eventType, amount, description = '') {
        try {
            const today = new Date().toISOString().split('T')[0];
            const stmt = this.db.prepare(`
                INSERT INTO xp_events (date, event_type, xp_amount, description)
                VALUES (?, ?, ?, ?)
            `);

            const result = stmt.run(today, eventType, amount, description);

            // Update daily stats
            await this.updateDailyXP(today, amount);

            return result.lastInsertRowid;
        } catch (error) {
            console.error('Error adding XP:', error);
            throw error;
        }
    }

    async getTotalXP() {
        try {
            const stmt = this.db.prepare(`
                SELECT COALESCE(SUM(xp_amount), 0) as total_xp FROM xp_events
            `);
            const result = stmt.get();
            return result.total_xp;
        } catch (error) {
            console.error('Error getting total XP:', error);
            return 0;
        }
    }

    async getLevel() {
        const totalXP = await this.getTotalXP();
        // Level formula: Level = floor(sqrt(XP / 100)) + 1
        const level = Math.floor(Math.sqrt(totalXP / 100)) + 1;
        return level;
    }

    async getXPForCurrentLevel() {
        const totalXP = await this.getTotalXP();
        const level = Math.floor(Math.sqrt(totalXP / 100)) + 1;
        const currentLevelXP = Math.pow(level - 1, 2) * 100;
        const nextLevelXP = Math.pow(level, 2) * 100;
        return {
            current: totalXP - currentLevelXP,
            needed: nextLevelXP - currentLevelXP,
            total: totalXP
        };
    }

    // ============================================================
    // 🏆 ACHIEVEMENTS
    // ============================================================

    async unlockAchievement(achievementKey) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR IGNORE INTO achievements (achievement_key, title, description, icon)
                VALUES (?, ?, ?, ?)
            `);

            const achievements = {
                'first_study': {
                    title: 'البداية',
                    description: 'أكمل أول جلسة دراسة',
                    icon: '🌱'
                },
                'week_streak': {
                    title: 'أسبوع كامل',
                    description: 'حافظ على سلسلة 7 أيام',
                    icon: '🔥'
                },
                'ten_sessions': {
                    title: 'منتج',
                    description: 'أكمل 10 جلسات دراسة',
                    icon: '💪'
                },
                'hundred_xp': {
                    title: 'مبتدئ',
                    description: 'اجمع 100 XP',
                    icon: '⭐'
                },
                'five_hundred_xp': {
                    title: 'متقدم',
                    description: 'اجمع 500 XP',
                    icon: '🌟'
                },
                'first_thousand_xp': {
                    title: 'خبير',
                    description: 'اجمع 1000 XP',
                    icon: '🏆'
                },
                'daily_warrior': {
                    title: 'محارب يومي',
                    description: 'أكمل 5 جلسات في يوم واحد',
                    icon: '⚔️'
                },
                'marathon': {
                    title: 'ماراثون',
                    description: 'ادرس لأكثر من 8 ساعات في يوم',
                    icon: '🏃'
                }
            };

            const achievement = achievements[achievementKey];
            if (!achievement) return false;

            const result = stmt.run(achievementKey, achievement.title, achievement.description, achievement.icon);
            return result.changes > 0;
        } catch (error) {
            console.error('Error unlocking achievement:', error);
            return false;
        }
    }

    async getAchievements() {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM achievements ORDER BY unlocked_at DESC
            `);
            return stmt.all();
        } catch (error) {
            console.error('Error getting achievements:', error);
            return [];
        }
    }

    async getUnlockedCount() {
        try {
            const stmt = this.db.prepare(`
                SELECT COUNT(*) as count FROM achievements
            `);
            const result = stmt.get();
            return result.count;
        } catch (error) {
            console.error('Error getting unlocked count:', error);
            return 0;
        }
    }

    async checkAndUnlockAchievements(dailyStats) {
        const newAchievements = [];

        // First study session
        const totalSessions = await this.getTotalSessionsCount();
        if (totalSessions === 1) {
            const unlocked = await this.unlockAchievement('first_study');
            if (unlocked) newAchievements.push('first_study');
        }

        // 10 sessions
        if (totalSessions === 10) {
            const unlocked = await this.unlockAchievement('ten_sessions');
            if (unlocked) newAchievements.push('ten_sessions');
        }

        // Streak achievements
        if (dailyStats?.streak_days >= 7) {
            const unlocked = await this.unlockAchievement('week_streak');
            if (unlocked) newAchievements.push('week_streak');
        }

        // XP achievements
        const totalXP = await this.getTotalXP();
        if (totalXP >= 100 && totalXP < 500) {
            const unlocked = await this.unlockAchievement('hundred_xp');
            if (unlocked) newAchievements.push('hundred_xp');
        }
        if (totalXP >= 500 && totalXP < 1000) {
            const unlocked = await this.unlockAchievement('five_hundred_xp');
            if (unlocked) newAchievements.push('five_hundred_xp');
        }
        if (totalXP >= 1000) {
            const unlocked = await this.unlockAchievement('first_thousand_xp');
            if (unlocked) newAchievements.push('first_thousand_xp');
        }

        // Daily warrior (5+ sessions in one day)
        if (dailyStats?.total_sessions >= 5) {
            const unlocked = await this.unlockAchievement('daily_warrior');
            if (unlocked) newAchievements.push('daily_warrior');
        }

        // Marathon (8+ hours in one day)
        if (dailyStats?.total_minutes >= 480) {
            const unlocked = await this.unlockAchievement('marathon');
            if (unlocked) newAchievements.push('marathon');
        }

        return newAchievements;
    }

    async getTotalSessionsCount() {
        try {
            const stmt = this.db.prepare(`
                SELECT COUNT(*) as count FROM study_sessions
            `);
            const result = stmt.get();
            return result.count;
        } catch (error) {
            console.error('Error getting total sessions:', error);
            return 0;
        }
    }

    // ============================================================
    // 📊 DAILY STATS
    // ============================================================

    async updateDailyStats(date) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO daily_stats (
                    date, 
                    total_sessions, 
                    total_minutes,
                    updated_at
                ) VALUES (
                    ?,
                    (SELECT COUNT(*) FROM study_sessions WHERE date = ?),
                    (SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions WHERE date = ?),
                    CURRENT_TIMESTAMP
                )
            `);
            stmt.run(date, date, date);
        } catch (error) {
            console.error('Error updating daily stats:', error);
        }
    }

    async updateDailyXP(date, xpAmount) {
        try {
            // Check if row exists first
            const checkStmt = this.db.prepare(`
                SELECT total_xp FROM daily_stats WHERE date = ?
            `);
            const existing = checkStmt.get(date);
            
            if (existing) {
                // Update existing row
                const stmt = this.db.prepare(`
                    UPDATE daily_stats SET
                        total_xp = total_xp + ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE date = ?
                `);
                stmt.run(xpAmount, date);
            } else {
                // Insert new row
                const stmt = this.db.prepare(`
                    INSERT INTO daily_stats (date, total_xp, updated_at)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                `);
                stmt.run(date, xpAmount);
            }
        } catch (error) {
            console.error('Error updating daily XP:', error);
        }
    }

    async getDailyStats(dateRange = null) {
        try {
            let query = `
                SELECT * FROM daily_stats
            `;
            const params = [];

            if (dateRange) {
                query += ` WHERE date BETWEEN ? AND ?`;
                params.push(dateRange.start, dateRange.end);
            }

            query += ` ORDER BY date DESC`;

            const stmt = this.db.prepare(query);
            return stmt.all(...params);
        } catch (error) {
            console.error('Error getting daily stats:', error);
            return [];
        }
    }

    // ============================================================
    // 📈 ANALYTICS
    // ============================================================

    async getAnalytics(days = 30) {
        try {
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            const startDateStr = startDate.toISOString().split('T')[0];

            // Daily hours for chart
            const dailyStmt = this.db.prepare(`
                SELECT 
                    date,
                    total_sessions,
                    total_minutes,
                    total_xp,
                    COALESCE(productivity_avg, 0) as productivity_avg
                FROM daily_stats
                WHERE date BETWEEN ? AND ?
                ORDER BY date ASC
            `);
            const dailyData = dailyStmt.all(startDateStr, endDate);

            // Subject distribution
            const subjectStmt = this.db.prepare(`
                SELECT 
                    subject_name,
                    COUNT(*) as session_count,
                    SUM(duration_minutes) as total_minutes
                FROM study_sessions
                WHERE date BETWEEN ? AND ?
                GROUP BY subject_name
                ORDER BY total_minutes DESC
            `);
            const subjectData = subjectStmt.all(startDateStr, endDate);

            // Total stats
            const totalStmt = this.db.prepare(`
                SELECT 
                    COUNT(*) as total_sessions,
                    COALESCE(SUM(duration_minutes), 0) as total_minutes,
                    COALESCE(AVG(productivity_score), 0) as avg_productivity,
                    COALESCE(SUM(duration_minutes) / 60.0, 0) as total_hours
                FROM study_sessions
                WHERE date BETWEEN ? AND ?
            `);
            const totals = totalStmt.get(startDateStr, endDate);

            return {
                daily: dailyData,
                subjects: subjectData,
                totals: totals
            };
        } catch (error) {
            console.error('Error getting analytics:', error);
            return null;
        }
    }

    // ============================================================
    // 📤 EXPORT
    // ============================================================

    async exportToCSV(dateRange = null) {
        try {
            const sessions = await this.getSessions(dateRange);
            
            const headers = [
                'date', 'subject_name', 'lesson_name', 'duration_minutes',
                'mood', 'distraction_level', 'productivity_score', 'session_type'
            ].join(',');

            const rows = sessions.map(s => [
                s.date,
                `"${(s.subject_name || '').replace(/"/g, '""')}"`,
                `"${(s.lesson_name || '').replace(/"/g, '""')}"`,
                s.duration_minutes,
                s.mood,
                s.distraction_level,
                s.productivity_score,
                s.session_type
            ].join(','));

            return [headers, ...rows].join('\n');
        } catch (error) {
            console.error('Error exporting to CSV:', error);
            throw error;
        }
    }

    async exportToJSON(dateRange = null) {
        try {
            const sessions = await this.getSessions(dateRange);
            return JSON.stringify(sessions, null, 2);
        } catch (error) {
            console.error('Error exporting to JSON:', error);
            throw error;
        }
    }

    // ============================================================
    // 🗑️ CLEANUP
    // ============================================================

    async clearOldData(daysToKeep = 365) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            const cutoffStr = cutoffDate.toISOString().split('T')[0];

            const stmt = this.db.prepare(`
                DELETE FROM study_sessions WHERE date < ?
            `);
            const result = stmt.run(cutoffStr);

            // Also clean up daily_stats
            const statsStmt = this.db.prepare(`
                DELETE FROM daily_stats WHERE date < ?
            `);
            statsStmt.run(cutoffStr);

            // And xp_events
            const xpStmt = this.db.prepare(`
                DELETE FROM xp_events WHERE date < ?
            `);
            xpStmt.run(cutoffStr);

            return result.changes;
        } catch (error) {
            console.error('Error clearing old data:', error);
            return 0;
        }
    }

    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

// Singleton instance
const studyDB = new StudyDatabase();

module.exports = studyDB;