/**
 * FSRS (Free Spaced Repetition Scheduler) Algorithm
 * Translated from simple-ts-fsrs TypeScript implementation
 * 
 * A scientifically optimized spaced repetition scheduler that uses
 * machine learning to determine optimal review intervals.
 */

// ============================================================
// 📦 TYPES AND CONSTANTS
// ============================================================

const RatingValues = {
    'Forgot': 1,
    'Struggled': 2,
    'Remembered': 3,
    'Mastered': 4
};

const StateValues = ['Learning', 'Review', 'Relearning'];

// Default optimized weights from FSRS research
const DEFAULT_WEIGHTS = [
    0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616,
    0.1544, 1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034,
    0.6567
];

const DEFAULT_REQUEST_RETENTION = 0.9; // 90% desired retention rate
const DEFAULT_MAXIMUM_INTERVAL = 36500; // ~100 years in days

// ============================================================
// 📦 ASSESSMENT CLASS
// ============================================================

/**
 * Represents a card assessment after a review
 * Contains all scheduling information for the next review
 */
class Assessment {
    constructor({
        assessedAt,
        nextScheduledAssessment,
        stability,
        difficulty,
        state
    }) {
        this.assessedAt = assessedAt;
        this.nextScheduledAssessment = nextScheduledAssessment;
        this.stability = stability;
        this.difficulty = difficulty;
        this.state = state;
    }

    /**
     * Calculate retrievability at a specific date
     * Retrievability = probability of remembering the card
     * Formula: R(t) = (1 + (19/81) * (t/S))^(-0.5)
     * where t = days since last review, S = stability
     */
    getRetrievability(date = new Date()) {
        const elapsedDays = (date.getTime() - this.assessedAt.getTime()) / 86400000;
        return Math.pow(1 + (19 / 81) * (elapsedDays / this.stability), -0.5);
    }

    /**
     * Check if card is due for review at a given date
     */
    isDue(date = new Date()) {
        return this.nextScheduledAssessment <= date;
    }

    /**
     * Convert assessment to plain object for serialization
     */
    toJSON() {
        return {
            assessedAt: this.assessedAt.toISOString(),
            nextScheduledAssessment: this.nextScheduledAssessment.toISOString(),
            stability: this.stability,
            difficulty: this.difficulty,
            state: this.state
        };
    }

    /**
     * Create Assessment from serialized data
     */
    static fromJSON(data) {
        return new Assessment({
            assessedAt: new Date(data.assessedAt),
            nextScheduledAssessment: new Date(data.nextScheduledAssessment),
            stability: data.stability,
            difficulty: data.difficulty,
            state: data.state
        });
    }
}

// ============================================================
// 📦 BASE ASSESSMENT STRATEGY
// ============================================================

class BaseAssessmentStrategy {
    constructor({
        requestRetention = DEFAULT_REQUEST_RETENTION,
        maximumInterval = DEFAULT_MAXIMUM_INTERVAL,
        weights = DEFAULT_WEIGHTS
    }) {
        this.requestRetention = requestRetention;
        this.maximumInterval = maximumInterval;
        this.w = weights;
    }

    /**
     * Main assessment function - to be implemented by subclasses
     */
    assess({ rating, date }) {
        throw new Error('assess() must be implemented by subclass');
    }

    /**
     * Calculate initial difficulty based on first rating
     */
    initDifficulty(rating) {
        const ratingValue = RatingValues[rating];
        const difficulty = this.w[4] - Math.exp(this.w[5] * (ratingValue - 1)) + 1;
        return this.clamp(difficulty, 1, 10);
    }

    /**
     * Calculate next interval based on stability
     * I(t) = S * 9 * (1/R - 1)
     */
    nextInterval(stability) {
        const interval = stability * 9 * (1 / this.requestRetention - 1);
        return this.clamp(interval, 1, this.maximumInterval);
    }

    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    addDaysToDate(date, days) {
        return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
    }

    addMinutesToDate(date, minutes) {
        return new Date(date.getTime() + minutes * 60 * 1000);
    }
}

// ============================================================
// 📦 INITIAL ASSESSMENT STRATEGY (First review ever)
// ============================================================

class InitialAssessmentStrategy extends BaseAssessmentStrategy {
    assess({ rating, date }) {
        const stability = this.calculateStability(rating);
        const nextScheduledAssessment = this.scheduleNextAssessment({
            rating,
            date,
            stability
        });

        return new Assessment({
            assessedAt: date,
            nextScheduledAssessment,
            stability,
            difficulty: this.initDifficulty(rating),
            state: this.calculateState(rating)
        });
    }

    scheduleNextAssessment({ rating, date, stability }) {
        // Mastered cards get full interval, others get short learning steps
        if (rating === 'Mastered') {
            const masteredInterval = this.nextInterval(stability);
            return this.addDaysToDate(date, masteredInterval);
        } else {
            // Learning phase intervals (in minutes)
            const minutesByRating = {
                'Forgot': 1,
                'Struggled': 5,
                'Remembered': 10
            };
            return this.addMinutesToDate(date, minutesByRating[rating]);
        }
    }

    calculateStability(rating) {
        const ratingValue = RatingValues[rating];
        return this.w[ratingValue - 1];
    }

    calculateState(rating) {
        const stateMap = {
            'Forgot': 'Learning',
            'Struggled': 'Learning',
            'Remembered': 'Learning',
            'Mastered': 'Review'
        };
        return stateMap[rating];
    }
}

// ============================================================
// 📦 LEARNING ASSESSMENT STRATEGY (In learning/relearning phase)
// ============================================================

class LearningAssessmentStrategy extends BaseAssessmentStrategy {
    constructor({ previousAssessment, ...args }) {
        super(args);
        this.previousAssessment = previousAssessment;
    }

    assess({ rating, date }) {
        const stability = this.calculateStability({
            stability: this.previousAssessment.stability,
            rating
        });

        return new Assessment({
            assessedAt: date,
            nextScheduledAssessment: this.scheduleNextAssessment({
                rating,
                stability,
                date
            }),
            stability,
            difficulty: this.calculateDifficulty({
                difficulty: this.previousAssessment.difficulty,
                rating
            }),
            state: this.calculateNextState({
                rating,
                state: this.previousAssessment.state
            })
        });
    }

    calculateStability({ stability, rating }) {
        // Growth during learning phase
        return stability * Math.exp(this.w[17] * (RatingValues[rating] - 3 + this.w[18]));
    }

    scheduleNextAssessment({ rating, stability, date }) {
        if (rating === 'Forgot') {
            return this.addMinutesToDate(date, 5);
        } else if (rating === 'Struggled') {
            return this.addMinutesToDate(date, 10);
        } else {
            // Graduate to Review state with proper interval
            const interval = this.nextInterval(stability);
            return this.addDaysToDate(date, interval);
        }
    }

    calculateDifficulty({ difficulty, rating }) {
        const nextDifficulty = difficulty - this.w[6] * (RatingValues[rating] - 3);
        return this.clamp(
            this.w[7] * this.initDifficulty('Mastered') + (1 - this.w[7]) * nextDifficulty,
            1,
            10
        );
    }

    calculateNextState({ rating, state }) {
        // Forgot/Struggled keep current state, others graduate to Review
        if (['Forgot', 'Struggled'].includes(rating)) {
            return state;
        } else {
            return 'Review';
        }
    }
}

// ============================================================
// 📦 REVIEW ASSESSMENT STRATEGY (In review phase)
// ============================================================

class ReviewAssessmentStrategy extends BaseAssessmentStrategy {
    constructor({ previousAssessment, ...args }) {
        super(args);
        this.previousAssessment = previousAssessment;
        // Interval modifier based on desired retention
        this.intervalModifier = (Math.pow(this.requestRetention, 1 / -0.5) - 1) / (19 / 81);
    }

    assess({ rating, date }) {
        const stability = this.calculateStability({
            previousStability: this.previousAssessment.stability,
            rating,
            previouslyAssessedAt: this.previousAssessment.assessedAt,
            previousDifficulty: this.previousAssessment.difficulty,
            date
        });

        return new Assessment({
            assessedAt: date,
            nextScheduledAssessment: this.scheduleNextAssessment({
                rating,
                stability,
                date
            }),
            stability,
            difficulty: this.calculateDifficulty({
                difficulty: this.previousAssessment.difficulty,
                rating
            }),
            state: this.calculateNextState(rating)
        });
    }

    scheduleNextAssessment({ rating, stability, date }) {
        if (rating === 'Forgot') {
            // Back to learning phase
            return this.addMinutesToDate(date, 5);
        } else {
            // Normal review interval
            const interval = Math.round(stability * this.intervalModifier);
            return this.addDaysToDate(date, this.clamp(interval, 1, this.maximumInterval));
        }
    }

    calculateStability({
        previousStability,
        previouslyAssessedAt,
        previousDifficulty,
        date,
        rating
    }) {
        const elapsedDays = (date.getTime() - previouslyAssessedAt.getTime()) / 86400000;
        const retrievability = Math.pow(
            1 + (19 / 81) * (elapsedDays / previousStability),
            -0.5
        );

        if (rating === 'Forgot') {
            return this.calculateForgetStability({
                difficulty: previousDifficulty,
                retrievability,
                stability: previousStability
            });
        } else {
            return this.calculateRecallStability({
                difficulty: previousDifficulty,
                retrievability,
                stability: previousStability,
                rating
            });
        }
    }

    calculateForgetStability({ difficulty, stability, retrievability }) {
        const newStability = this.w[11] *
            Math.pow(difficulty, -this.w[12]) *
            (Math.pow(stability + 1, this.w[13]) - 1) *
            Math.exp(this.w[14] * (1 - retrievability));
        
        return Math.min(newStability, stability);
    }

    calculateRecallStability({ difficulty, stability, retrievability, rating }) {
        const difficultyMultiplier = rating === 'Struggled' ? this.w[15] :
            rating === 'Mastered' ? this.w[16] : 1;

        return stability * (
            1 +
            Math.exp(this.w[8]) *
            (11 - difficulty) *
            Math.pow(stability, -this.w[9]) *
            (Math.exp((1 - retrievability) * this.w[10]) - 1) *
            difficultyMultiplier
        );
    }

    calculateDifficulty({ difficulty, rating }) {
        const nextDifficulty = difficulty - this.w[6] * (RatingValues[rating] - 3);
        return this.clamp(
            this.w[7] * this.initDifficulty('Mastered') + (1 - this.w[7]) * nextDifficulty,
            1,
            10
        );
    }

    calculateNextState(rating) {
        if (rating === 'Forgot') {
            return 'Relearning';
        } else {
            return 'Review';
        }
    }
}

// ============================================================
// 📦 MAIN FSRS CLASS
// ============================================================

class FSRS {
    constructor(options = {}) {
        const {
            requestRetention = DEFAULT_REQUEST_RETENTION,
            maximumInterval = DEFAULT_MAXIMUM_INTERVAL,
            weights = DEFAULT_WEIGHTS
        } = options;

        this.assessmentStrategyFactory = new AssessmentStrategyFactory({
            requestRetention,
            maximumInterval,
            weights
        });
    }

    /**
     * Assess a card after a review
     * @param {Object} params
     * @param {string} params.rating - 'Forgot' | 'Struggled' | 'Remembered' | 'Mastered'
     * @param {Date} [params.date=new Date()] - Assessment date
     * @param {Assessment} [params.previousAssessment] - Previous assessment (null for first review)
     * @returns {Assessment} New assessment with updated scheduling
     */
    assessRecall({ rating, date = new Date(), previousAssessment } = {}) {
        const strategy = this.assessmentStrategyFactory.getStrategy(previousAssessment);
        return strategy.assess({ rating, date });
    }

    /**
     * Create initial card state (no previous assessment)
     */
    createInitialCard(rating = 'Remembered') {
        return this.assessRecall({ rating, previousAssessment: null });
    }
}

// ============================================================
// 📦 STRATEGY FACTORY
// ============================================================

class AssessmentStrategyFactory {
    constructor({ requestRetention, maximumInterval, weights }) {
        this.requestRetention = requestRetention;
        this.maximumInterval = maximumInterval;
        this.weights = weights;
    }

    getStrategy(previousAssessment) {
        if (!previousAssessment) {
            return new InitialAssessmentStrategy({
                requestRetention: this.requestRetention,
                maximumInterval: this.maximumInterval,
                weights: this.weights
            });
        } else if (['Learning', 'Relearning'].includes(previousAssessment.state)) {
            return new LearningAssessmentStrategy({
                requestRetention: this.requestRetention,
                maximumInterval: this.maximumInterval,
                weights: this.weights,
                previousAssessment
            });
        } else {
            return new ReviewAssessmentStrategy({
                requestRetention: this.requestRetention,
                maximumInterval: this.maximumInterval,
                weights: this.weights,
                previousAssessment
            });
        }
    }
}

// ============================================================
// 📦 CARD CLASS
// ============================================================

class Card {
    constructor({
        id = null,
        question = '',
        answer = '',
        deck = 'default',
        assessment = null,
        createdAt = new Date(),
        tags = []
    }) {
        this.id = id || this.generateId();
        this.question = question;
        this.answer = answer;
        this.deck = deck;
        this.createdAt = new Date(createdAt);
        this.tags = tags;
        
        // Initialize assessment if not provided
        if (!assessment) {
            this.assessment = null;
        } else if (assessment instanceof Assessment) {
            this.assessment = assessment;
        } else {
            this.assessment = Assessment.fromJSON(assessment);
        }
    }

    generateId() {
        return 'card_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Check if card is due for review
     */
    isDue(date = new Date()) {
        if (!this.assessment) return true; // New cards are always due
        return this.assessment.isDue(date);
    }

    /**
     * Get retrievability (memory strength)
     */
    getRetrievability(date = new Date()) {
        if (!this.assessment) return 0;
        return this.assessment.getRetrievability(date);
    }

    /**
     * Get days until next review
     */
    getDaysUntilDue(date = new Date()) {
        if (!this.assessment) return 0;
        const diff = this.assessment.nextScheduledAssessment - date;
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    /**
     * Get total number of reviews for this card
     */
    getReviewsCount() {
        // This would be tracked separately in SRS stats
        return this.reviewsCount || 0;
    }

    toJSON() {
        return {
            id: this.id,
            question: this.question,
            answer: this.answer,
            deck: this.deck,
            assessment: this.assessment ? this.assessment.toJSON() : null,
            createdAt: this.createdAt.toISOString(),
            tags: this.tags,
            reviewsCount: this.reviewsCount || 0
        };
    }

    static fromJSON(data) {
        const card = new Card({
            id: data.id,
            question: data.question,
            answer: data.answer,
            deck: data.deck,
            assessment: data.assessment,
            createdAt: data.createdAt,
            tags: data.tags || []
        });
        card.reviewsCount = data.reviewsCount || 0;
        return card;
    }
}

// ============================================================
// 📦 EXPORTS
// ============================================================

// For browser/Node.js compatibility
if (typeof window !== 'undefined') {
    window.FSRS = FSRS;
    window.Assessment = Assessment;
    window.Card = Card;
    window.RatingValues = RatingValues;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        FSRS,
        Assessment,
        Card,
        RatingValues,
        StateValues,
        DEFAULT_WEIGHTS
    };
}