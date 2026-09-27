/** @import { Page } from '@playwright/test'; */

/**
 * Installs a touch-event factory for browser gesture tests.
 * @param {Page} page The Playwright page.
 * @returns {Promise<void>} The promise.
 */
export async function setupTouchEvents(page) {
    await page.evaluate(() => {
        window.createTouchEvent = (type, positions, pageY = 100) => {
            const event = new Event(type, { bubbles: true, cancelable: true });

            Object.defineProperty(event, 'touches', {
                value: positions.map((pageX) => ({ pageX, pageY })),
            });

            return event;
        };
    });
}
