/** @import { Page } from '@playwright/test'; */

/**
 * Installs synthetic touch events on the test page.
 * @param {Page} page The test page.
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
