import * as chrono from 'chrono-node';
import cronParser from 'cron-parser';
/**
 * Detect trigger type from prompt
 * @param {string} prompt - User input
 * @returns {Object} Trigger configuration
 */
export function parseTrigger(prompt) {
    const result = {
        trigger_type: 'IMMEDIATE',
        trigger_config: {}
    };

    // Detect countdown triggers (e.g., "in 5 minutes")
    const countdownMatch = prompt.match(/in (\d+) (seconds?|minutes?|hours?)/i);
    if (countdownMatch) {
        const value = parseInt(countdownMatch[1]);
        const unit = countdownMatch[2].toLowerCase();

        result.trigger_type = 'COUNTDOWN';
        result.trigger_config = {
            delay_seconds: convertToSeconds(value, unit)
        };
        return result;
    }

    // Detect scheduled datetime (e.g., "at 3pm tomorrow")
    const date = chrono.parseDate(prompt);
    if (date) {
        result.trigger_type = 'SCHEDULED';
        result.trigger_config = {
            datetime: date.toISOString()
        };
        return result;
    }

    // Detect recurring patterns (e.g., "every Monday")
    const cronPattern = detectCronPattern(prompt);
    if (cronPattern) {
        result.trigger_type = 'RECURRING';
        result.trigger_config = {
            cron: cronPattern
        };
    }

    return result;
}

/**
 * Convert time units to seconds
 * @param {number} value - Time value
 * @param {string} unit - Time unit
 * @returns {number} Seconds
 */
function convertToSeconds(value, unit) {
    switch (unit.charAt(0)) {
        case 'h': return value * 3600;
        case 'm': return value * 60;
        default: return value;
    }
}

/**
 * Detect cron patterns in natural language
 * @param {string} text - Input text
 * @returns {string|null} Cron expression
 */
function detectCronPattern(text) {
    const patterns = {
        'every minute': '* * * * *',
        'hourly': '0 * * * *',
        'daily': '0 0 * * *',
        'weekly': '0 0 * * 1',
        'monthly': '0 0 1 * *',
        'yearly': '0 0 1 1 *'
    };

    // Check for known patterns
    for (const [phrase, cron] of Object.entries(patterns)) {
        if (text.toLowerCase().includes(phrase)) {
            return cron;
        }
    }

    // Parse custom intervals (e.g., "every 5 minutes")
    const intervalMatch = text.match(/every (\d+) (minutes?|hours?|days?)/i);
    if (intervalMatch) {
        const value = parseInt(intervalMatch[1]);
        const unit = intervalMatch[2].toLowerCase();

        switch (unit.charAt(0)) {
            case 'm': return `*/${value} * * * *`;
            case 'h': return `0 */${value} * * *`;
            case 'd': return `0 0 */${value} * *`;
        }
    }

    return null;
}