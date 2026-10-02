import process from 'node:process';
import { test as base, expect } from '@playwright/test';
import { addCoverageReport } from 'monocart-reporter';

const collectCoverage = process.env.FROST_UI_IMAGECROP_COVERAGE === 'true';

const test = base.extend({
    expectedBrowserErrors: [[], { option: true }],
    uiPage: [
        async ({ page, expectedBrowserErrors }, use, testInfo) => {
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));

            if (collectCoverage) {
                await page.coverage.startJSCoverage({
                    resetOnNavigation: false,
                });
            }

            await page.goto('/', {
                waitUntil: 'domcontentloaded',
            });

            await page.evaluate((_) => {
                if (
                    !window.fQuery ||
                    !window.UI?.ImageCrop ||
                    typeof window.fQuery.QuerySet.prototype.imagecrop !== 'function'
                ) {
                    throw new Error('Failed to initialize ImageCrop on the test page.');
                }

                // Keep the stylesheet in the head for component layout and transitions.
                document.body.replaceChildren();
            });

            await page.waitForFunction((_) => {
                const node = document.createElement('div');
                node.className = 'text-center';
                document.body.append(node);

                const style = getComputedStyle(node);
                const ready = style.textAlign === 'center';

                node.remove();
                return ready;
            });

            await use();

            if (collectCoverage) {
                const coverage = await page.coverage.stopJSCoverage();
                await addCoverageReport(coverage, testInfo);
            }

            expect(errors, 'Uncaught browser errors').toEqual(expectedBrowserErrors);
        },
        { auto: true },
    ],
});

export { expect, test };
