import { expect } from '@playwright/test';

/**
 * Expects RGB or RGBA channels, allowing for lossy RGB encoding.
 * @param {number[]} actual The observed RGBA channels.
 * @param {number[]} expected The expected RGB or RGBA channels.
 * @param {number} [tolerance=0] The maximum difference for each RGB channel.
 */
export function expectPixel(actual, expected, tolerance = 0) {
    for (const [channel, value] of expected.entries()) {
        const name = ['red', 'green', 'blue', 'alpha'][channel];

        expect(
            Math.abs(actual[channel] - value),
            `${name}: expected ${value}, received ${actual[channel]}`,
        ).toBeLessThanOrEqual(channel === 3 ? 0 : tolerance);
    }
}
