/**
 * BAC 2027 - XP & Gamification System
 * 🎮 Points, Levels, and Achievements inspired by StudyDash
 */

const studyDB = require('../database/database');

class XPSystem {
    // XP rewards configuration (from reference: StudyDash Gamification)
    static REWARDS = {
        POMODORO_COMPLETE: { amount: 10, description: 'إكمال جلسة بومودورو' },
        LESSON_COMPLETE: { amount: 25, description: 'إكمال درس' },
        DAILY_LOG_SAVE: { amount: 15, description: 'تسجيل يوم دراسي' },
        STREAK_DAY: { amount: 5, description: 'يوم في السلسلة' },
        TASK_COMPLETE: { amount: 10, description: 'إتمام مهمة' },
        REVIEW_COMPLETE: { amount: 20, description: 'إتمام مراجعة' },
        EXAM_PRACTICE: { amount: 30, description: 'تدريب امتحان' }
    };

    // Level thresholds (exponential growth)
    static LEVELS = [
        { level: 1, title: 'مبتدئ', icon: '🌱', xpRequired: 0 },
        { level: 2, title: 'طالب مجتهد', icon: '📚', xpRequired: 100 },
        { level: 3, title: 'متعلم نشيط', icon: '💡', xpRequired: 300 },
        { level: 4, title: 'خبير', icon: '⭐', xpRequired: 600 },
        { level: 5, title: 'محترف', icon: '🌟', xpRequired: 1000 },
        { level: 6, title: 'عبقري', icon: '🧠', xpRequired: 1500 },
        { level: 7, title: 'أسطورة', icon: '🏆', xpRequired: 2100 },
        { level: 8, title: 'ملك', icon: '👑', xpRequired: 2800 },
        { level: 9, title: ' BAC Master', icon: '🎓', xpRequired: 3600 },
        { level: 10, title: 'شامل التفوق', icon: '💎', xpRequired: 4500 }
    ];

    /**
     * Award XP for an event
     */
    static async awardXP(eventType, description = '') {
        try {
            const reward = this.REWARDS[eventType];
            if (!reward) {
                console.warn('Unknown XP event type:', eventType);
                return null;
            }

            const result = await studyDB.addXP(eventType, reward.amount, reward.description);
            
            // Check for new achievements
            const dailyStats = await studyDB.getDailyStats();
            const latestStats = dailyStats[0];
            await studyDB.checkAndUnlockAchievements(latestStats);

            return {
                xp: reward.amount,
                description: reward.description,
                totalXP: await studyDB.getTotalXP(),
                level: await studyDB.getLevel()
            };
        } catch (error) {
            console.error('Error awarding XP:', error);
            return null;
        }
    }

    /**
     * Get current player stats
     */
    static async getPlayerStats() {
        try {
            const totalXP = await studyDB.getTotalXP();
            const level = await studyDB.getLevel();
            const xpProgress = await studyDB.getXPForCurrentLevel();
            const achievements = await studyDB.getAchievements();
            const unlockedCount = await studyDB.getUnlockedCount();

            // Find current level info
            const currentLevelInfo = this.LEVELS.find(l => l.level === level) || this.LEVELS[0];
            const nextLevelInfo = this.LEVELS.find(l => l.level === level + 1);

            return {
                totalXP,
                level,
                levelTitle: currentLevelInfo.title,
                levelIcon: currentLevelInfo.icon,
                xpCurrent: xpProgress.current,
                xpNeeded: xpProgress.needed,
                xpTotal: xpProgress.total,
                nextLevel: nextLevelInfo ? nextLevelInfo.level : null,
                nextLevelTitle: nextLevelInfo ? nextLevelInfo.title : null,
                achievements: {
                    total: this.LEVELS.length + 3, // Base + extra
                    unlocked: unlockedCount,
                    list: achievements
                }
            };
        } catch (error) {
            console.error('Error getting player stats:', error);
            return null;
        }
    }

    /**
     * Get recent XP events
     */
    static async getRecentXPEvents(limit = 10) {
        try {
            const db = studyDB.db;
            const stmt = db.prepare(`
                SELECT * FROM xp_events 
                ORDER BY created_at DESC 
                LIMIT ?
            `);
            return stmt.all(limit);
        } catch (error) {
            console.error('Error getting recent XP events:', error);
            return [];
        }
    }

    /**
     * Calculate XP for daily log based on content
     */
    static calculateLogXP(logData) {
        let totalXP = 0;
        const breakdown = [];

        // Base XP for saving log
        totalXP += this.REWARDS.DAILY_LOG_SAVE.amount;
        breakdown.push({ ...this.REWARDS.DAILY_LOG_SAVE });

        // XP for each subject studied
        if (logData.subjects && logData.subjects.length > 0) {
            const subjectXP = logData.subjects.length * 5;
            totalXP += subjectXP;
            breakdown.push({
                eventType: 'subjects_studied',
                amount: subjectXP,
                description: `${logData.subjects.length} مواد دراسية`
            });
        }

        // XP for tasks completed
        if (logData.tasksCompleted && logData.tasksCompleted.length > 0) {
            const taskXP = logData.tasksCompleted.length * this.REWARDS.TASK_COMPLETE.amount;
            totalXP += taskXP;
            breakdown.push({
                eventType: 'tasks_completed',
                amount: taskXP,
                description: `${logData.tasksCompleted.length} مهام منجزة`
            });
        }

        // Bonus XP for high productivity
        if (logData.productivityScore >= 8) {
            const bonusXP = 5;
            totalXP += bonusXP;
            breakdown.push({
                eventType: 'high_productivity',
                amount: bonusXP,
                description: 'إنتاجية عالية (+5 XP)'
            });
        }

        // Bonus XP for long study session (4+ hours)
        if (logData.totalMinutes >= 240) {
            const bonusXP = 10;
            totalXP += bonusXP;
            breakdown.push({
                eventType: 'marathon_session',
                amount: bonusXP,
                description: 'جلسة مكثفة (+10 XP)'
            });
        }

        return { totalXP, breakdown };
    }

    /**
     * Award XP for completing a pomodoro session
     */
    static async awardPomodoroXP() {
        return await this.awardXP('POMODORO_COMPLETE');
    }

    /**
     * Award XP for completing a lesson
     */
    static async awardLessonXP(lessonName) {
        return await this.awardXP('LESSON_COMPLETE', lessonName);
    }

    /**
     * Award XP for streak day
     */
    static async awardStreakXP(days) {
        return await this.awardXP('STREAK_DAY', `${days} يوم متتالي`);
    }

    /**
     * Format XP number with commas
     */
    static formatXP(amount) {
        return amount.toLocaleString('ar-SA');
    }

    /**
     * Get motivational message based on actual player level
     * @param {number} [playerLevel] - The player's current level (optional, will fetch if not provided)
     */
    static async getMotivationalMessage(playerLevel) {
        const messages = {
            1: '🌱 كل رحلة تبدأ بخطوة! أنت بدأت للتو.',
            2: '📚 استمر! أنت تتقدم بشكل رائع.',
            3: '💡 أنت الآن من المتعلمين النشطين!',
            4: '⭐ wow! أنت خبير حقيقي!',
            5: '🌟 أداء احترافي! استمر في التألق.',
            6: '🧠 عبقري! عقلك يقوى كل يوم.',
            7: '🏆 أسطورة! نادر من يصل لهذا المستوى.',
            8: '👑 ملك! أنت فوق التحديات.',
            9: '🎓 سيد البكالوريا! لا شيء يوقفك.',
            10: '💎 الكمال! أنت قدوة للجميع.'
        };

        // Get actual player level if not provided
        let level = playerLevel;
        if (level === undefined) {
            try {
                level = await studyDB.getLevel();
            } catch (e) {
                level = 1;
            }
        }
        
        // Clamp level to valid range
        level = Math.max(1, Math.min(10, level || 1));
        return messages[level] || messages[1];
    }
}

module.exports = XPSystem;