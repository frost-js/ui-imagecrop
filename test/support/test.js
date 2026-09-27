import process from 'node:process';
import { test as base, expect } from '@playwright/test';
import { addCoverageReport } from 'monocart-reporter';

const collectCoverage = process.env.FROST_UI_IMAGECROP_COVERAGE === 'true';

const test = base.extend({
    uiPage: [
        async ({ page }, use, testInfo) => {
            if (collectCoverage) {
                await page.coverage.startJSCoverage({
                    resetOnNavigation: false,
                });
            }

            await page.goto('/', {
                waitUntil: 'domcontentloaded',
            });

            await page.evaluate((_) => {
                if (!window.fQuery || !window.UI?.ImageCrop ||
                    typeof window.fQuery.QuerySet.prototype.imagecrop !== 'function') {
                    throw new Error('Failed to initialize ImageCrop on the test page.');
                }

                document.body.replaceChildren();
            });

            await page.waitForFunction((_) => {
                const node = document.createElement('div');
                node.className = 'text-center';
                document.body.append(node);
                const ready = getComputedStyle(node).textAlign === 'center';
                node.remove();
                return ready;
            });

            await use();

            if (collectCoverage) {
                const coverage = await page.coverage.stopJSCoverage();
                await addCoverageReport(coverage, testInfo);
            }
        },
        { auto: true },
    ],
});

export { expect, test };
