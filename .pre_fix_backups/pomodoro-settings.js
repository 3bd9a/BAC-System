/**
 * BAC 2027 - Pomodoro Settings Manager
 * manages timer settings with localStorage persistence
 * inspired by YuPomo SettingsContext
 */

class SettingsManager {
    constructor() {
        this.STORAGE_KEY = 'bac_pomodoro_settings';
        this.DEFAULTS = {
            work: 25,           // minutes
            shortBreak: 5,      // minutes
            longBreak: 15,      // minutes
            soundEnabled: true,
            soundVolume: 0.3,   // 0..1
            soundName: 'beep',  // 'beep' for oscillator, or filename
            notificationsEnabled: true,
            autoStartBreak: false,
            sessionsBeforeLongBreak: 4
        };
        this.settings = this._load();
    }

    _load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return { ...this.DEFAULTS, ...this._validate(parsed) };
            }
        } catch (e) {
            console.warn('Failed to load pomodoro settings:', e);
        }
        return { ...this.DEFAULTS };
    }

    _validate(obj) {
        const valid = {};
        if (typeof obj.work === 'number' && obj.work > 0) valid.work = obj.work;
        if (typeof obj.shortBreak === 'number' && obj.shortBreak > 0) valid.shortBreak = obj.shortBreak;
        if (typeof obj.longBreak === 'number' && obj.longBreak > 0) valid.longBreak = obj.longBreak;
        if (typeof obj.soundEnabled === 'boolean') valid.soundEnabled = obj.soundEnabled;
        if (typeof obj.soundVolume === 'number' && obj.soundVolume >= 0 && obj.soundVolume <= 1) valid.soundVolume = obj.soundVolume;
        if (typeof obj.soundName === 'string') valid.soundName = obj.soundName;
        if (typeof obj.notificationsEnabled === 'boolean') valid.notificationsEnabled = obj.notificationsEnabled;
        if (typeof obj.autoStartBreak === 'boolean') valid.autoStartBreak = obj.autoStartBreak;
        if (typeof obj.sessionsBeforeLongBreak === 'number' && obj.sessionsBeforeLongBreak > 0) valid.sessionsBeforeLongBreak = obj.sessionsBeforeLongBreak;
        return valid;
    }

    _save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.settings));
        } catch (e) {
            console.warn('Failed to save pomodoro settings:', e);
        }
    }

    get() {
        return { ...this.settings };
    }

    update(partial) {
        const validated = this._validate(partial);
        this.settings = { ...this.settings, ...validated };
        this._save();
        return this.get();
    }

    reset() {
        this.settings = { ...this.DEFAULTS };
        this._save();
        return this.get();
    }
}

// Singleton instance
const settingsManager = new SettingsManager();