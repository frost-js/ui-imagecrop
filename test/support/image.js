/** @import { JSHandle, Page } from '@playwright/test'; */

/**
 * Creates an image with red and blue halves, optionally carrying JPEG orientation.
 * @param {Page} page The Playwright page.
 * @param {{width?: number, height?: number, orientation?: number|null}} [options] The fixture dimensions and orientation.
 * @returns {Promise<JSHandle<Blob>>} The image file in the browser.
 */
export async function createImage(page, { width = 640, height = 480, orientation = null } = {}) {
    return page.evaluateHandle(async ({ width, height, orientation }) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.fillStyle = '#f00';
        context.fillRect(0, 0, width / 2, height);
        context.fillStyle = '#00f';
        context.fillRect(width / 2, 0, width / 2, height);
        const file = await new Promise((resolve) => canvas.toBlob(resolve, orientation === null ? 'image/png' : 'image/jpeg', 1));
        if (orientation === null) {
            return file;
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const exif = new Uint8Array([
            0xff, 0xe1, 0, 34,
            0x45, 0x78, 0x69, 0x66, 0, 0,
            0x49, 0x49, 42, 0, 8, 0, 0, 0,
            1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0,
            orientation, 0, 0, 0, 0, 0, 0, 0,
        ]);
        return new Blob([bytes.slice(0, 2), exif, bytes.slice(2)], { type: 'image/jpeg' });
    }, { width, height, orientation });
}
