/**
 * BAC 2027 - Audio Manager
 * manages sound playback using Web Audio API
 * inspired by YuPomo notification sounds system
 */

class AudioManager {
    constructor() {
        this.audioContext = null;
        this.volume = 0.3;
    }

    _initContext() {
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.warn('Web Audio API not supported:', e);
                return false;
            }
        }
        return true;
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol || 0.3));
    }

    /**
     * play a synthesized beep sound using OscillatorNode
     */
    playBeep(frequency = 800, duration = 200, type = 'sine') {
        if (!this._initContext()) return;

        try {
            const ctx = this.audioContext;
            const now = ctx.currentTime;

            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, now);

            gainNode.gain.setValueAtTime(this.volume, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration / 1000);

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.start(now);
            oscillator.stop(now + duration / 1000);
        } catch (e) {
            console.warn('Failed to play beep:', e);
        }
    }

    /**
     * play a notification sound pattern
     * patterns: 'start', 'pause', 'complete', 'break', 'newCycle', 'cancel'
     */
    playPattern(pattern) {
        switch (pattern) {
            case 'start':
                this.playBeep(600, 150, 'sine');
                setTimeout(() => this.playBeep(800, 150, 'sine'), 150);
                break;
            case 'pause':
                this.playBeep(500, 200, 'triangle');
                break;
            case 'complete':
                // ascending three-tone success chime
                this.playBeep(523, 150, 'sine');     // C5
                setTimeout(() => this.playBeep(659, 150, 'sine'), 150); // E5
                setTimeout(() => this.playBeep(784, 200, 'sine'), 300); // G5
                break;
            case 'break':
                this.playBeep(400, 200, 'sine');
                setTimeout(() => this.playBeep(600, 200, 'sine'), 200);
                break;
            case 'newCycle':
                this.playBeep(784, 150, 'sine');     // G5
                setTimeout(() => this.playBeep(880, 150, 'sine'), 150); // A5
                setTimeout(() => this.playBeep(988, 200, 'sine'), 300); // B5
                break;
            case 'cancel':
                this.playBeep(200, 250, 'sawtooth');
                break;
            default:
                this.playBeep(800, 200, 'sine');
        }
    }

    /**
     * play a custom audio file
     */
    async playFile(url) {
        if (!this._initContext()) return;

        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;

            const gainNode = this.audioContext.createGain();
            gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime);

            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            source.start();
        } catch (e) {
            console.warn('Failed to play audio file:', e);
            // fallback to beep
            this.playBeep();
        }
    }

    /**
     * resume audio context (required after user gesture on some browsers)
     */
    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    destroy() {
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}

// Singleton instance
const audioManager = new AudioManager();