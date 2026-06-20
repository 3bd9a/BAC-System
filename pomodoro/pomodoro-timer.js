/**
 * BAC 2027 - Pomodoro Timer (v3)
 * Refactored timer logic with useReducer pattern from YuPomo
 * Uses Date.now() + endTime for drift-free accuracy
 */

class PomodoroTimer {
    constructor() {
        // Timer states
        this.STATES = { WORK: 'work', SHORT_BREAK: 'shortBreak', LONG_BREAK: 'longBreak' };
        this.STATUSES = { IDLE: 'idle', RUNNING: 'running', PAUSED: 'paused' };

        // State
        this.state = this.STATES.WORK;
        this.status = this.STATUSES.IDLE;
        this.endTime = null;
        this.timeLeft = 0;
        this.cycleCount = 0;

        // Refs
        this.tickRef = null;
        this.hasCompletedOnRestoreRef = false;

        // Callbacks
        this.onTick = null;
        this.onComplete = null;
        this.onStateChange = null;

        // Initialize from settings
        this._initDefaults();

        // Restore persisted state
        this._restore();

        // Bind tick
        this._tick = this._tick.bind(this);
    }

    _initDefaults() {
        let work = 25, shortBreak = 5, longBreak = 15;
        if (typeof settingsManager !== 'undefined' && settingsManager && typeof settingsManager.get === 'function') {
            try {
                const settings = settingsManager.get();
                if (settings) {
                    work = settings.work || 25;
                    shortBreak = settings.shortBreak || 5;
                    longBreak = settings.longBreak || 15;
                }
            } catch (e) {
                console.warn('Pomodoro: Failed to load settings, using defaults:', e);
            }
        }
        this.config = {
            work: work * 60,          // seconds
            shortBreak: shortBreak * 60,
            longBreak: longBreak * 60
        };
        this.timeLeft = this.config.work;
    }

    _persist() {
        try {
            const data = {
                state: this.state,
                status: this.status,
                endTime: this.endTime,
                timeLeft: this.timeLeft,
                cycleCount: this.cycleCount
            };
            localStorage.setItem('bac_pomodoro_active', JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to persist timer state:', e);
        }
    }

    _restore() {
        try {
            const raw = localStorage.getItem('bac_pomodoro_active');
            if (!raw) return;

            const saved = JSON.parse(raw);

            // Validate
            const validState = ['work', 'shortBreak', 'longBreak'].includes(saved.state) ? saved.state : 'work';
            const validStatus = ['idle', 'running', 'paused'].includes(saved.status) ? saved.status : 'idle';

            this.state = validState;
            this.status = validStatus;
            this.cycleCount = typeof saved.cycleCount === 'number' ? saved.cycleCount : 0;

            // If was running, compute remaining
            if (validStatus === 'running' && typeof saved.endTime === 'number') {
                const remaining = Math.max(0, Math.floor((saved.endTime - Date.now()) / 1000));

                if (remaining === 0) {
                    // Check if overly stale
                    const overdue = Math.floor((Date.now() - saved.endTime) / 1000);
                    if (overdue > 30) {
                        // Reset cleanly
                        this._resetClean();
                        return;
                    }
                    // Mark for completion after restore
                    this.hasCompletedOnRestoreRef = true;
                }

                this.endTime = saved.endTime;
                this.timeLeft = remaining;
            } else {
                this.endTime = null;
                if (validStatus === 'idle') {
                    this.timeLeft = this.config[validState] || this.config.work;
                } else {
                    this.timeLeft = typeof saved.timeLeft === 'number' ? saved.timeLeft : this.config.work;
                }
            }
        } catch (e) {
            console.warn('Failed to restore timer state:', e);
            this._resetClean();
        }
    }

    _resetClean() {
        this.state = this.STATES.WORK;
        this.status = this.STATUSES.IDLE;
        this.endTime = null;
        this.cycleCount = 0;
        this._initDefaults();
        this._persist();
    }

    _tick() {
        if (this.status !== this.STATUSES.RUNNING || !this.endTime) return;

        const remaining = Math.max(0, Math.floor((this.endTime - Date.now()) / 1000));

        if (remaining === 0) {
            clearInterval(this.tickRef);
            this.tickRef = null;
            this._handleComplete();
        } else {
            this.timeLeft = remaining;
            if (this.onTick) this.onTick(this.timeLeft, this.state, this.status);
            this._persist();
        }
    }

    _getNextState(current, nextCycleCount) {
        if (current === this.STATES.WORK) {
            let sessionsBeforeLongBreak = 4;
            try {
                if (typeof settingsManager !== 'undefined' && settingsManager && typeof settingsManager.get === 'function') {
                    const s = settingsManager.get();
                    sessionsBeforeLongBreak = (s && s.sessionsBeforeLongBreak) || 4;
                }
            } catch (e) { /* ignore */ }
            return nextCycleCount % sessionsBeforeLongBreak === 0
                ? this.STATES.LONG_BREAK
                : this.STATES.SHORT_BREAK;
        }
        return this.STATES.WORK;
    }

    async _handleComplete() {
        let work = 25, shortBreak = 5, longBreak = 15;
        let notificationsEnabled = false, soundEnabled = false, soundVolume = 0.3;
        try {
            if (typeof settingsManager !== 'undefined' && settingsManager && typeof settingsManager.get === 'function') {
                const s = settingsManager.get();
                if (s) {
                    work = s.work || 25;
                    shortBreak = s.shortBreak || 5;
                    longBreak = s.longBreak || 15;
                    notificationsEnabled = s.notificationsEnabled || false;
                    soundEnabled = s.soundEnabled || false;
                    soundVolume = s.soundVolume || 0.3;
                }
            }
        } catch (e) { /* ignore */ }

        const durationMap = { work, shortBreak, longBreak };
        const duration = durationMap[this.state] || 25;

        // Record session
        if (typeof statisticsManager !== 'undefined' && statisticsManager && typeof statisticsManager.addSession === 'function') {
            try {
                statisticsManager.addSession(this.state, duration);
            } catch (e) { /* ignore */ }
        }

        // Notify
        if (notificationsEnabled && typeof notificationManager !== 'undefined' && notificationManager) {
            try {
                const nextLabel = this.state === 'work' ? 'استراحة قصيرة' : 'تركيز';
                await notificationManager.sendPomodoroComplete(this.state, nextLabel);
            } catch (e) { /* ignore */ }
        }

        // Play sound
        if (soundEnabled && typeof audioManager !== 'undefined' && audioManager) {
            try {
                audioManager.setVolume(soundVolume);
                if (this.state === 'work') {
                    audioManager.playPattern('complete');
                } else {
                    audioManager.playPattern('break');
                }
            } catch (e) { /* ignore */ }
        }

        // Determine next state
        let nextCycle = this.cycleCount;
        if (this.state === this.STATES.WORK) {
            nextCycle += 1;
        }

        const nextState = this._getNextState(this.state, nextCycle);

        // Update state
        this.state = nextState;
        if (this.state === this.STATES.WORK) {
            this.cycleCount = nextCycle;
        }
        this.status = this.STATUSES.IDLE;
        this.endTime = null;
        this.timeLeft = this.config[nextState] || this.config.work;

        this._persist();

        if (this.onComplete) this.onComplete(this.state, this.cycleCount);
        if (this.onStateChange) this.onStateChange(this.state, this.status);
    }

    // Public API

    start() {
        if (this.status === this.STATUSES.RUNNING) return;

        // Resume audio context
        if (typeof audioManager !== 'undefined' && audioManager && typeof audioManager.resume === 'function') {
            try { audioManager.resume(); } catch (e) { /* ignore */ }
        }

        this.endTime = Date.now() + this.timeLeft * 1000;
        this.status = this.STATUSES.RUNNING;

        // Start tick
        if (this.tickRef) clearInterval(this.tickRef);
        this.tickRef = setInterval(this._tick, 250);

        // Play start sound
        try {
            if (typeof settingsManager !== 'undefined' && settingsManager && typeof settingsManager.get === 'function') {
                const settings = settingsManager.get();
                if (settings && settings.soundEnabled && typeof audioManager !== 'undefined' && audioManager) {
                    audioManager.setVolume(settings.soundVolume || 0.3);
                    audioManager.playPattern('start');
                }
            }
        } catch (e) { /* ignore */ }

        this._persist();
        if (this.onStateChange) this.onStateChange(this.state, this.status);
    }

    pause() {
        if (this.status !== this.STATUSES.RUNNING) return;

        clearInterval(this.tickRef);
        this.tickRef = null;

        // Save remaining
        this.timeLeft = Math.max(0, Math.floor((this.endTime - Date.now()) / 1000));
        this.status = this.STATUSES.PAUSED;
        this.endTime = null;

        // Play pause sound
        try {
            if (typeof settingsManager !== 'undefined' && settingsManager && typeof settingsManager.get === 'function') {
                const settings = settingsManager.get();
                if (settings && settings.soundEnabled && typeof audioManager !== 'undefined' && audioManager) {
                    audioManager.setVolume(settings.soundVolume || 0.3);
                    audioManager.playPattern('pause');
                }
            }
        } catch (e) { /* ignore */ }

        this._persist();
        if (this.onStateChange) this.onStateChange(this.state, this.status);
    }

    resetTimer() {
        clearInterval(this.tickRef);
        this.tickRef = null;

        this.status = this.STATUSES.IDLE;
        this.endTime = null;
        this.timeLeft = this.config[this.state] || this.config.work;

        // Play cancel sound
        try {
            if (typeof settingsManager !== 'undefined' && settingsManager && typeof settingsManager.get === 'function') {
                const settings = settingsManager.get();
                if (settings && settings.soundEnabled && typeof audioManager !== 'undefined' && audioManager) {
                    audioManager.setVolume(settings.soundVolume || 0.3);
                    audioManager.playPattern('cancel');
                }
            }
        } catch (e) { /* ignore */ }

        this._persist();
        if (this.onTick) this.onTick(this.timeLeft, this.state, this.status);
        if (this.onStateChange) this.onStateChange(this.state, this.status);
    }

    resetCycle() {
        clearInterval(this.tickRef);
        this.tickRef = null;

        this.state = this.STATES.WORK;
        this.status = this.STATUSES.IDLE;
        this.endTime = null;
        this.cycleCount = 0;
        this.timeLeft = this.config.work;

        // Play cancel sound
        try {
            if (typeof settingsManager !== 'undefined' && settingsManager && typeof settingsManager.get === 'function') {
                const settings = settingsManager.get();
                if (settings && settings.soundEnabled && typeof audioManager !== 'undefined' && audioManager) {
                    audioManager.setVolume(settings.soundVolume || 0.3);
                    audioManager.playPattern('cancel');
                }
            }
        } catch (e) { /* ignore */ }

        this._persist();
        if (this.onTick) this.onTick(this.timeLeft, this.state, this.status);
        if (this.onStateChange) this.onStateChange(this.state, this.status);
    }

    setMode(mode) {
        if (this.status !== this.STATUSES.IDLE) return;

        if (mode === 'work' || mode === 'focus') {
            this.state = this.STATES.WORK;
        } else if (mode === 'shortBreak') {
            this.state = this.STATES.SHORT_BREAK;
        } else if (mode === 'longBreak') {
            this.state = this.STATES.LONG_BREAK;
        }

        this.timeLeft = this.config[this.state] || this.config.work;
        this._persist();
        if (this.onTick) this.onTick(this.timeLeft, this.state, this.status);
    }

    getFormattedTime() {
        const mins = Math.floor(this.timeLeft / 60);
        const secs = this.timeLeft % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    getLabel() {
        const labels = {
            work: 'وقت التركيز',
            shortBreak: 'استراحة قصيرة',
            longBreak: 'استراحة طويلة'
        };
        return labels[this.state] || 'مؤقت';
    }

    getTodaySessionsCount() {
        try {
            if (typeof statisticsManager !== 'undefined' && statisticsManager && typeof statisticsManager.getTodaySessions === 'function') {
                return statisticsManager.getTodaySessions().filter(s => s.type === 'work').length;
            }
        } catch (e) { /* ignore */ }
        return 0;
    }

    destroy() {
        clearInterval(this.tickRef);
        this.tickRef = null;
    }
}

// Singleton instance
const pomodoroTimer = new PomodoroTimer();