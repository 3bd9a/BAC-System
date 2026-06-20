/**
 * BAC 2027 - Notification Manager
 * handles desktop notifications using the Notification API
 * inspired by YuPomo notifications system
 */

class NotificationManager {
    constructor() {
        this.PERMISSION_KEY = 'bac_notification_permission';
        this.DEFAULT_TITLE = 'BAC 2027 Pomodoro';
    }

    async requestPermission() {
        if (!('Notification' in window)) {
            console.warn('Notifications not supported');
            return 'unsupported';
        }

        if (Notification.permission === 'granted') {
            return 'granted';
        }

        if (Notification.permission === 'denied') {
            return 'denied';
        }

        const permission = await Notification.requestPermission();
        return permission;
    }

    async send(title, options = {}) {
        const permission = await this.requestPermission();
        if (permission !== 'granted') {
            console.warn('Notification permission not granted');
            return false;
        }

        try {
            const notification = new Notification(title, {
                icon: '/icon.png',
                badge: '/icon.png',
                requireInteraction: false,
                silent: false,
                ...options
            });

            notification.onclick = () => {
                window.focus();
                notification.close();
            };

            // auto close after 5 seconds
            setTimeout(() => notification.close(), 5000);

            return true;
        } catch (e) {
            console.warn('Failed to send notification:', e);
            return false;
        }
    }

    async sendPomodoroComplete(type, nextLabel) {
        const messages = {
            work: {
                title: this.DEFAULT_TITLE,
                body: `🎉 انتهت جلسة التركيز! حان وقت الاستراحة (${nextLabel})`
            },
            shortBreak: {
                title: this.DEFAULT_TITLE,
                body: `☕ انتهت الاستراحة! حان وقت التركيز`
            },
            longBreak: {
                title: this.DEFAULT_TITLE,
                body: `☕ انتهت الاستراحة الطويلة! حان وقت بدء دورة جديدة`
            }
        };

        const msg = messages[type] || { title: this.DEFAULT_TITLE, body: 'انتهت الجلسة!' };
        return this.send(msg.title, { body: msg.body });
    }

    getPermissionStatus() {
        if (!('Notification' in window)) return 'unsupported';
        return Notification.permission;
    }
}

// Singleton instance
const notificationManager = new NotificationManager();