/**
 * SRS Manager - Data Persistence Layer for BAC 2027
 */

const STORAGE_KEYS = {
    CARDS: 'bac_srs_cards',
    STATS: 'bac_srs_stats',
    SETTINGS: 'bac_srs_settings'
};

const DEFAULT_SETTINGS = {
    dailyLimit: 20,
    showAgain: true,
    showHard: true,
    showGood: true,
    showEasy: true
};

class SRSManager {
    constructor() {
        this.cards = [];
        this.stats = this.loadStats();
        this.settings = this.loadSettings();
        this.fsrs = new FSRS();
        this.cacheDueCards = null;
        this.cacheTimestamp = 0;
        this.CACHE_DURATION = 60000;
    }

    async init() {
        try {
            this.cards = this.loadCards();
            console.log(`✅ SRS Manager initialized with ${this.cards.length} cards`);
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize SRS Manager:', error);
            return false;
        }
    }

    // ============================================================
    // 📦 PERSISTENCE LAYER
    // ============================================================

    /**
     * Load cards from localStorage
     */
    loadCards() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.CARDS);
            if (!data) return [];
            
            const cardsData = JSON.parse(data);
            return cardsData.map(cardData => Card.fromJSON(cardData));
        } catch (error) {
            console.error('Failed to load cards:', error);
            return [];
        }
    }

    /**
     * Save cards to localStorage
     */
    saveCards() {
        try {
            const data = this.cards.map(card => card.toJSON());
            localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(data));
            this.invalidateCache();
            return true;
        } catch (error) {
            console.error('Failed to save cards:', error);
            return false;
        }
    }

    /**
     * Load statistics from localStorage
     */
    loadStats() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.STATS);
            if (!data) {
                return this.createDefaultStats();
            }
            return JSON.parse(data);
        } catch (error) {
            console.error('Failed to load stats:', error);
            return this.createDefaultStats();
        }
    }

    /**
     * Create default statistics structure
     */
    createDefaultStats() {
        const today = new Date().toISOString().split('T')[0];
        return {
            totalReviews: 0,
            retentionRate: 0,
            streak: 0,
            lastReviewDate: null,
            dailyLog: { [today]: 0 },
            ratingsLog: {
                'Forgot': 0,
                'Struggled': 0,
                'Remembered': 0,
                'Mastered': 0
            }
        };
    }

    /**
     * Save statistics to localStorage
     */
    saveStats() {
        try {
            localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(this.stats));
            return true;
        } catch (error) {
            console.error('Failed to save stats:', error);
            return false;
        }
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
            if (!data) {
                return { ...DEFAULT_SETTINGS };
            }
            return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
        } catch (error) {
            console.error('Failed to load settings:', error);
            return { ...DEFAULT_SETTINGS };
        }
    }

    /**
     * Save settings to localStorage
     */
    saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings));
            return true;
        } catch (error) {
            console.error('Failed to save settings:', error);
            return false;
        }
    }

    // ============================================================
    // 📦 CARD MANAGEMENT
    // ============================================================

    /**
     * Create a new flashcard
     * @param {Object} cardData - Card data {question, answer, deck, tags}
     * @returns {Card|null} Created card or null on failure
     */
    createCard(cardData) {
        try {
            const card = new Card({
                question: cardData.question.trim(),
                answer: cardData.answer.trim(),
                deck: cardData.deck || 'default',
                tags: Array.isArray(cardData.tags) ? cardData.tags : [],
                // ✅ إضافة حقل metadata لتخزين معلومات المادة والدرس
                metadata: {
                    subjectId: cardData.subjectId || null,
                    lessonName: cardData.lessonName || null
                }
            });

            this.cards.push(card);
            this.saveCards();
            return card;
        } catch (error) {
            console.error('Failed to create card:', error);
            return null;
        }
    }

    /**
     * Update existing card
     * @param {string} cardId - Card ID
     * @param {Object} updates - Fields to update
     * @returns {Card|null} Updated card or null on failure
     */
    updateCard(cardId, updates) {
        const card = this.getCardById(cardId);
        if (!card) {
            console.error(`Card not found: ${cardId}`);
            return null;
        }

        try {
            if (updates.question !== undefined) card.question = updates.question.trim();
            if (updates.answer !== undefined) card.answer = updates.answer.trim();
            if (updates.deck !== undefined) card.deck = updates.deck;
            if (updates.tags !== undefined) card.tags = updates.tags;

            this.saveCards();
            console.log(`✅ Updated card: ${cardId}`);
            return card;
        } catch (error) {
            console.error('Failed to update card:', error);
            return null;
        }
    }

    /**
     * Delete card
     * @param {string} cardId - Card ID
     * @returns {boolean} Success status
     */
    deleteCard(cardId) {
        const index = this.cards.findIndex(c => c.id === cardId);
        if (index === -1) {
            console.error(`Card not found: ${cardId}`);
            return false;
        }

        try {
            this.cards.splice(index, 1);
            this.saveCards();
            console.log(`✅ Deleted card: ${cardId}`);
            return true;
        } catch (error) {
            console.error('Failed to delete card:', error);
            return false;
        }
    }

    /**
     * Get card by ID
     * @param {string} cardId - Card ID
     * @returns {Card|undefined}
     */
    getCardById(cardId) {
        return this.cards.find(c => c.id === cardId);
    }

    /**
     * Get all cards
     * @returns {Card[]}
     */
    getAllCards() {
        return [...this.cards];
    }

    /**
     * Get cards by deck
     * @param {string} deck - Deck name
     * @returns {Card[]}
     */
    getCardsByDeck(deck) {
        return this.cards.filter(c => c.deck === deck);
    }

    /**
     * Search cards by query
     * @param {string} query - Search query
     * @returns {Card[]}
     */
    searchCards(query) {
        const q = query.toLowerCase();
        return this.cards.filter(card => 
            card.question.toLowerCase().includes(q) ||
            card.answer.toLowerCase().includes(q) ||
            card.tags.some(tag => tag.toLowerCase().includes(q))
        );
    }

    // ============================================================
    // 📦 REVIEW MANAGEMENT
    // ============================================================

    /**
     * Get cards due for review
     * @param {number} [limit] - Maximum number of cards to return
     * @returns {Card[]} Due cards sorted by priority
     */
    getDueCards(limit = null) {
        const now = new Date();
        
        // Use cache if available and fresh
        if (this.cacheDueCards && (Date.now() - this.cacheTimestamp < this.CACHE_DURATION)) {
            const cached = this.cacheDueCards;
            return limit ? cached.slice(0, limit) : cached;
        }

        // Filter due cards
        let dueCards = this.cards.filter(card => card.isDue(now));
        
        // Sort by: 1) Days overdue (most overdue first), 2) Retrievability (lowest first)
        dueCards.sort((a, b) => {
            const daysA = a.getDaysUntilDue(now);
            const daysB = b.getDaysUntilDue(now);
            
            if (daysA !== daysB) {
                return daysA - daysB; // Most overdue first
            }
            
            // If same days, sort by retrievability (lower = more urgent)
            const retA = a.getRetrievability(now);
            const retB = b.getRetrievability(now);
            return retA - retB;
        });

        // Cache results
        this.cacheDueCards = dueCards;
        this.cacheTimestamp = Date.now();

        // Apply limit if specified
        return limit ? dueCards.slice(0, limit) : dueCards;
    }

    /**
     * Get daily review count
     * @returns {number} Number of cards due today
     */
    getDailyDueCount() {
        return this.getDueCards(this.settings.dailyLimit).length;
    }

    /**
     * Get total cards count
     * @returns {number}
     */
    getTotalCount() {
        return this.cards.length;
    }

    /**
     * Invalidate due cards cache
     */
    invalidateCache() {
        this.cacheDueCards = null;
        this.cacheTimestamp = 0;
    }

    // ============================================================
    // 📦 REVIEW PROCESSING
    // ============================================================

    /**
     * Process a card review
     * @param {string} cardId - Card ID
     * @param {string} rating - 'Forgot' | 'Struggled' | 'Remembered' | 'Mastered'
     * @returns {Object|null} Review result with updated card
     */
    processReview(cardId, rating) {
        const card = this.getCardById(cardId);
        if (!card) {
            console.error(`Card not found: ${cardId}`);
            return null;
        }

        try {
            if (!RatingValues[rating]) {
                throw new Error(`Invalid rating: ${rating}`);
            }

            const previousAssessment = card.assessment;
            const newAssessment = this.fsrs.assessRecall({
                rating,
                date: new Date(),
                previousAssessment
            });

            card.assessment = newAssessment;
            card.reviewsCount = (card.reviewsCount || 0) + 1;
            this.updateStats(rating);
            this.saveCards();
            this.saveStats();

            // ============================================================
            // 🔗 ربط البطاقة بالمواد الدراسية (الجزء الأهم)
            // ============================================================
            // إذا كان التقييم جيداً (تذكر أو أتقن) وكانت البطاقة مرتبطة بمادة ودرس
            if ((rating === 'Mastered' || rating === 'Remembered') && 
                card.metadata && card.metadata.subjectId && card.metadata.lessonName) {
                
                // نحدد الحالة الجديدة: إذا أتقنها -> مكتملة، إذا تذكرها -> تحتاج مراجعة
                const newStatus = (rating === 'Mastered') ? 'completed' : 'review_needed';
                
                // نرسل طلب إلى الخادم لتحديث ملف الـ Markdown
                fetch('/api/lessons/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subjectId: card.metadata.subjectId,
                        lessonName: card.metadata.lessonName,
                        status: newStatus
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        console.log(`✅ SRS synced with server: ${card.metadata.lessonName} -> ${newStatus}`);
                    } else {
                        console.warn('⚠️ Failed to sync SRS with server:', data.error);
                    }
                })
                .catch(err => console.error('❌ SRS sync error:', err));
            }

            return {
                success: true,
                card: card,
                assessment: newAssessment,
                nextReview: newAssessment.nextScheduledAssessment,
                daysUntilNext: card.getDaysUntilDue()
            };
        } catch (error) {
            console.error('Failed to process review:', error);
            return null;
        }
    }

    /**
     * Update review statistics
     * @param {string} rating - Review rating
     */
    updateStats(rating) {
        const today = new Date().toISOString().split('T')[0];
        
        // Increment total reviews
        this.stats.totalReviews++;

        // Update daily log
        if (!this.stats.dailyLog[today]) {
            this.stats.dailyLog[today] = 0;
        }
        this.stats.dailyLog[today]++;

        // Update ratings distribution
        this.stats.ratingsLog[rating]++;

        // Recalculate retention rate
        const totalRated = Object.values(this.stats.ratingsLog).reduce((a, b) => a + b, 0);
        const remembered = this.stats.ratingsLog['Remembered'] + this.stats.ratingsLog['Mastered'];
        this.stats.retentionRate = totalRated > 0 ? remembered / totalRated : 0;

        // Update streak
        this.updateStreak(today);

        // Update last review date
        this.stats.lastReviewDate = today;
    }

    /**
     * Update streak counter
     * @param {string} today - Today's date string (YYYY-MM-DD)
     */
    updateStreak(today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (!this.stats.lastReviewDate || this.stats.lastReviewDate === '') {
            // First ever review: start streak at 1
            this.stats.streak = 1;
        } else if (this.stats.lastReviewDate === yesterdayStr) {
            // Continued streak
            this.stats.streak = (this.stats.streak || 0) + 1;
        } else if (this.stats.lastReviewDate !== today) {
            // Streak broken or first review of a new day
            this.stats.streak = 1;
        }
        // If lastReviewDate === today, streak stays the same
    }

    // ============================================================
    // 📦 STATISTICS & REPORTING
    // ============================================================

    /**
     * Get review statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        const dueToday = this.getDailyDueCount();
        
        return {
            totalCards: this.cards.length,
            dueToday: dueToday,
            totalReviews: this.stats.totalReviews,
            retentionRate: this.stats.retentionRate,
            streak: this.stats.streak,
            newCards: this.cards.filter(c => !c.assessment).length,
            learningCards: this.cards.filter(c => 
                c.assessment && ['Learning', 'Relearning'].includes(c.assessment.state)
            ).length,
            reviewCards: this.cards.filter(c => 
                c.assessment && c.assessment.state === 'Review'
            ).length,
            dailyLog: this.stats.dailyLog,
            ratingsDistribution: this.stats.ratingsLog
        };
    }

    /**
     * Get deck statistics
     * @returns {Object} Stats by deck
     */
    getDeckStats() {
        const decks = {};
        
        this.cards.forEach(card => {
            if (!decks[card.deck]) {
                decks[card.deck] = {
                    total: 0,
                    due: 0,
                    new: 0,
                    learning: 0,
                    review: 0
                };
            }
            
            decks[card.deck].total++;
            
            if (!card.assessment) {
                decks[card.deck].new++;
            } else if (['Learning', 'Relearning'].includes(card.assessment.state)) {
                decks[card.deck].learning++;
            } else if (card.assessment.state === 'Review') {
                decks[card.deck].review++;
            }
        });

        // Calculate due cards per deck
        Object.keys(decks).forEach(deckName => {
            const deckCards = this.getCardsByDeck(deckName);
            decks[deckName].due = deckCards.filter(c => c.isDue()).length;
        });

        return decks;
    }

    /**
     * Get all unique deck names
     * @returns {string[]}
     */
    getDecks() {
        const decks = new Set(this.cards.map(c => c.deck));
        return Array.from(decks).sort();
    }

    /**
     * Clear all data (for testing/reset)
     */
    clearAllData() {
        this.cards = [];
        this.stats = this.createDefaultStats();
        this.invalidateCache();
        
        localStorage.removeItem(STORAGE_KEYS.CARDS);
        localStorage.removeItem(STORAGE_KEYS.STATS);
        localStorage.removeItem(STORAGE_KEYS.SETTINGS);
        
        console.log('✅ All SRS data cleared');
    }

    // ============================================================
    // 📦 UTILITY FUNCTIONS
    // ============================================================

    /**
     * Export cards to JSON file
     * @returns {string} JSON string
     */
    exportCards() {
        const data = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            cards: this.cards.map(c => c.toJSON()),
            stats: this.stats
        };
        return JSON.stringify(data, null, 2);
    }

    /**
     * Import cards from JSON
     * @param {string} jsonString - JSON string
     * @returns {Object} Import result
     */
    importCards(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            
            if (!data.cards || !Array.isArray(data.cards)) {
                throw new Error('Invalid import format');
            }

            let imported = 0;
            let skipped = 0;

            data.cards.forEach(cardData => {
                // Skip if card already exists (by ID)
                if (this.getCardById(cardData.id)) {
                    skipped++;
                    return;
                }

                try {
                    const card = Card.fromJSON(cardData);
                    this.cards.push(card);
                    imported++;
                } catch (e) {
                    console.error('Failed to import card:', cardData, e);
                    skipped++;
                }
            });

            this.saveCards();
            
            return {
                success: true,
                imported,
                skipped
            };
        } catch (error) {
            console.error('Import failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get heatmap data for the last N days
     * @param {number} [days=90] - Number of days to look back
     * @returns {Array} Array of {date, count} objects
     */
    getHeatmapData(days = 90) {
        const data = [];
        const today = new Date();
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            data.push({
                date: dateStr,
                count: this.stats.dailyLog[dateStr] || 0,
                day: date.getDay(),
                month: date.getMonth()
            });
        }
        
        return data;
    }
}

// ============================================================
// 📦 EXPORTS
// ============================================================

// Global instance
let srsManager = null;

/**
 * Initialize SRS Manager singleton
 */
async function initSRSManager() {
    if (!srsManager) {
        srsManager = new SRSManager();
        await srsManager.init();
    }
    return srsManager;
}

/**
 * Get SRS Manager instance
 */
function getSRSManager() {
    if (!srsManager) {
        throw new Error('SRS Manager not initialized. Call initSRSManager() first.');
    }
    return srsManager;
}

// Export for browser
if (typeof window !== 'undefined') {
    window.SRSManager = SRSManager;
    window.initSRSManager = initSRSManager;
    window.getSRSManager = getSRSManager;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SRSManager,
        initSRSManager,
        getSRSManager,
        STORAGE_KEYS,
        DEFAULT_SETTINGS
    };
}