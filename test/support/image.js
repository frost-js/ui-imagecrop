/** @import { JSHandle, Locator, Page } from '@playwright/test'; */

/**
 * Creates an image with colored halves or quadrants, optionally carrying JPEG orientation.
 * @param {Page} page The Playwright page.
 * @param {{width?: number, height?: number, orientation?: number|null, littleEndian?: boolean, quadrants?: boolean}} [options] The fixture dimensions and orientation.
 * @returns {Promise<JSHandle<Blob>>} The image file in the browser.
 */
export async function createImage(page, { width = 640, height = 480, orientation = null, littleEndian = true, quadrants = false } = {}) {
    return page.evaluateHandle(async ({ width, height, orientation, littleEndian, quadrants }) => {
        const canvas = document.createElement('canvas');

        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');

        context.fillStyle = '#f00';
        context.fillRect(0, 0, width / 2, height);
        context.fillStyle = '#00f';
        context.fillRect(width / 2, 0, width / 2, height);
        if (quadrants) {
            for (const [index, color] of ['#f00', '#0f0', '#00f', '#ff0'].entries()) {
                context.fillStyle = color;
                context.fillRect(index % 2 * width / 2, Math.floor(index / 2) * height / 2, width / 2, height / 2);
            }
        }

        const file = await new Promise((resolve) => canvas.toBlob(resolve, orientation === null ? 'image/png' : 'image/jpeg', 1));

        if (orientation === null) {
            return file;
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const exif = new Uint8Array(36);

        exif.set([0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0]);

        const view = new DataView(exif.buffer);

        view.setUint16(10, littleEndian ? 0x4949 : 0x4d4d);
        view.setUint16(12, 42, littleEndian);
        view.setUint32(14, 8, littleEndian);
        view.setUint16(18, 1, littleEndian);
        view.setUint16(20, 0x0112, littleEndian);
        view.setUint16(22, 3, littleEndian);
        view.setUint32(24, 1, littleEndian);
        view.setUint16(28, orientation, littleEndian);

        return new Blob([bytes.slice(0, 2), exif, bytes.slice(2)], { type: 'image/jpeg' });
    }, { width, height, orientation, littleEndian, quadrants });
}

/**
 * Reads RGBA pixels at canvas coordinates.
 * @param {Locator|JSHandle<HTMLCanvasElement>} canvas The canvas locator or handle.
 * @param {number[][]} points The pixel coordinates as x/y pairs.
 * @returns {Promise<number[][]>} The RGBA channels for each point.
 */
export async function readPixels(canvas, points) {
    return canvas.evaluate((canvas, points) => {
        const context = canvas.getContext('2d');

        return points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
    }, points);
}
