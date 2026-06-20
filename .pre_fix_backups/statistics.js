/**
 * BAC 2027 - Pomodoro Statistics Manager
 * tracks sessions and computes daily/weekly stats
 * inspired by YuPomo StatisticsContext
 */

class StatisticsManager {
    constructor() {
        this.STORAGE_KEY = 'bac_pomodoro_stats';
        this.state = this._load();
    }

    _load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.sessions)) return parsed;
            }
        } catch (e) {
            console.warn('Failed to load pomodoro stats:', e);
        }
        return { sessions: [] };
    }

    _save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
        } catch (e) {
            console.warn('Failed to save pomodoro stats:', e);
        }
    }

    /**
     * Add a completed session
     * @param {'work'|'shortBreak'|'longBreak'} type
     * @param {number} durationMinutes
     */
    addSession(type, durationMinutes) {
        const today = new Date().toISOString().split('T')[0];
        const session = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            date: today,
            type,
            durationMinutes
        };

        this.state.sessions.push(session);
        this._save();
        return session;
    }

    /**
     * Get sessions for a specific date range
     */
    getSessions(startDate, endDate) {
        return this.state.sessions.filter(s => {
            if (startDate && s.date < startDate) return false;
            if (endDate && s.date > endDate) return false;
            return true;
        });
    }

    /**
     * Get today's sessions
     */
    getTodaySessions() {
        const today = new Date().toISOString().split('T')[0];
        return this.state.sessions.filter(s => s.date === today);
    }

    /**
     * Get daily aggregated stats for a date range
     * @returns {Array<{date: string, sessions: number, focusMinutes: number}>}
     */
    getDailyStats(daysBack = 14) {
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        const start = startDate.toISOString().split('T')[0];

        const sessions = this.getSessions(start, endDate);
        const map = new Map();

        // Initialize all days in range
        for (let d = new Date(start); d <= new Date(endDate); d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            map.set(dateStr, { date: dateStr, sessions: 0, focusMinutes: 0 });
        }

        // Aggregate sessions
        for (const s of sessions) {
            if (!map.has(s.date)) map.set(s.date, { date: s.date, sessions: 0, focusMinutes: 0 });
            const day = map.get(s.date);
            day.sessions += 1;
            if (s.type === 'work') day.focusMinutes += s.durationMinutes || 0;
        }

        return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    }

    /**
     * Get total focus minutes for today
     */
    getTodayFocusMinutes() {
        const todaySessions = this.getTodaySessions();
        return todaySessions
            .filter(s => s.type === 'work')
            .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
    }

    /**
     * Clear all statistics
     */
    clear() {
        this.state = { sessions: [] };
        this._save();
    }
}

// Singleton instance
const statisticsManager = new StatisticsManager();