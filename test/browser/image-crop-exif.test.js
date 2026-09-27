import { expect, test } from '#test';
import { createImage } from '../support/image.js';

const colors = {
    red: [255, 0, 0],
    green: [0, 255, 0],
    blue: [0, 0, 255],
    yellow: [255, 255, 0],
};
const orientations = [
    ['red', 'green', 'blue', 'yellow'],
    ['green', 'red', 'yellow', 'blue'],
    ['yellow', 'blue', 'green', 'red'],
    ['blue', 'yellow', 'red', 'green'],
    ['red', 'blue', 'green', 'yellow'],
    ['blue', 'red', 'yellow', 'green'],
    ['yellow', 'green', 'blue', 'red'],
    ['green', 'yellow', 'red', 'blue'],
];

test.describe('ImageCrop EXIF orientation', () => {
    test.beforeEach(async ({ page }) => {
        await page.evaluate(() => {
            document.body.innerHTML = '<div id="crop"></div>';
        });
    });

    test.describe('orientations', () => {
        for (const littleEndian of [true, false]) {
            for (const [index, expected] of orientations.entries()) {
                const orientation = index + 1;
                test(`orients all four corners for EXIF ${orientation} (${littleEndian ? 'little' : 'big'} endian)`, async ({ page }) => {
                    const file = await createImage(page, { width: 80, height: 40, quadrants: true, orientation, littleEndian });
                    const width = orientation >= 5 ? 40 : 80;
                    const height = orientation >= 5 ? 80 : 40;
                    await page.evaluate(async ({ file, width, height }) => {
                        const crop = UI.ImageCrop.init(document.querySelector('#crop'), { previewWidth: width, previewHeight: height });
                        await crop.load(file);
                        const result = await crop.result({ type: 'canvas' });
                        result.id = 'result';
                        document.body.append(result);
                    }, { file, width, height });
                    await expect(page.locator('#crop canvas')).toHaveAttribute('width', `${width}`);
                    await expect(page.locator('#crop canvas')).toHaveAttribute('height', `${height}`);
                    await expect(page.locator('#result')).toHaveAttribute('width', `${width}`);
                    await expect(page.locator('#result')).toHaveAttribute('height', `${height}`);
                    for (const selector of ['#crop canvas', '#result']) {
                        const pixels = await page.locator(selector).evaluate((canvas) => {
                            const context = canvas.getContext('2d');
                            return [[.25, .25], [.75, .25], [.25, .75], [.75, .75]].map(([x, y]) =>
                                Array.from(context.getImageData(canvas.width * x, canvas.height * y, 1, 1).data));
                        });
                        for (const [corner, color] of expected.entries()) {
                            for (const [channel, value] of colors[color].entries()) {
                                expect(Math.abs(pixels[corner][channel] - value)).toBeLessThanOrEqual(3);
                            }
                            expect(pixels[corner][3]).toBe(255);
                        }
                    }
                    expect(await file.evaluate(async (file, littleEndian) =>
                        new DataView(await file.arrayBuffer()).getUint16(30, littleEndian), littleEndian,
                    )).toBe(orientation);
                });
            }
        }

        for (let orientation = 1; orientation <= 8; orientation++) {
            test(`ignores EXIF ${orientation} when orientation handling is disabled`, async ({ page }) => {
                const file = await createImage(page, { width: 80, height: 40, quadrants: true, orientation });
                await page.evaluate(async (file) => {
                    await UI.ImageCrop.init(document.querySelector('#crop'), { exifOrientation: false }).load(file);
                }, file);
                await expect(page.locator('#crop canvas')).toHaveAttribute('width', '80');
                await expect(page.locator('#crop canvas')).toHaveAttribute('height', '40');
                const pixels = await page.locator('#crop canvas').evaluate((canvas) => {
                    const context = canvas.getContext('2d');
                    return [[20, 10], [60, 10], [20, 30], [60, 30]].map(([x, y]) =>
                        Array.from(context.getImageData(x, y, 1, 1).data));
                });
                for (const [corner, color] of orientations[0].entries()) {
                    for (const [channel, value] of colors[color].entries()) {
                        expect(Math.abs(pixels[corner][channel] - value)).toBeLessThanOrEqual(3);
                    }
                }
            });
        }
    });

    test.describe('metadata', () => {
        test('skips an unrelated APP1 segment and an unrelated TIFF tag', async ({ page }) => {
            const file = await createImage(page, { width: 80, height: 40, orientation: 2 });
            await page.evaluate(async (file) => {
                const bytes = new Uint8Array(await file.arrayBuffer());
                const data = new Uint8Array(bytes.length + 12);
                data.set(bytes.slice(0, 22));
                data.set(bytes.slice(22), 34);
                const view = new DataView(data.buffer);
                view.setUint16(4, 46);
                view.setUint16(20, 2, true);
                view.setUint16(22, 0x0100, true);
                view.setUint16(24, 3, true);
                view.setUint32(26, 1, true);
                view.setUint16(30, 80, true);
                const xmp = new Uint8Array([255, 225, 0, 8, 88, 77, 80, 0, 0, 0]);
                const modified = new Blob([data.slice(0, 2), xmp, data.slice(2)], { type: 'image/jpeg' });
                await UI.ImageCrop.init(document.querySelector('#crop')).load(modified);
            }, file);
            expect(await page.locator('#crop canvas').evaluate((canvas) =>
                canvas.getContext('2d').getImageData(10, 10, 1, 1).data[2],
            )).toBeGreaterThan(250);
        });

        test('loads JPEGs with no EXIF orientation tag', async ({ page }) => {
            const file = await createImage(page, { orientation: 2 });
            await page.evaluate(async (file) => {
                const buffer = await file.arrayBuffer();
                new DataView(buffer).setUint16(22, 0x0100, true);
                await UI.ImageCrop.init(document.querySelector('#crop')).load(new Blob([buffer], { type: 'image/jpeg' }));
            }, file);
            expect(await page.locator('#crop canvas').evaluate((canvas) =>
                canvas.getContext('2d').getImageData(50, 50, 1, 1).data[0],
            )).toBeGreaterThan(250);
        });

        for (const { name, offset, value, size, little = true } of [
            { name: 'segment length', offset: 4, value: 65535, size: 16, little: false },
            { name: 'byte order', offset: 12, value: 0, size: 16 },
            { name: 'TIFF header', offset: 14, value: 0, size: 16 },
            { name: 'directory offset', offset: 16, value: 0xffffffff, size: 32 },
            { name: 'directory entries', offset: 20, value: 65535, size: 16 },
            { name: 'tag type', offset: 24, value: 4, size: 16 },
            { name: 'tag count', offset: 26, value: 2, size: 32 },
            { name: 'orientation below range', offset: 30, value: 0, size: 16 },
            { name: 'orientation above range', offset: 30, value: 9, size: 16 },
        ]) {
            test(`rejects malformed ${name} and can load a valid image afterward`, async ({ page }) => {
                const file = await createImage(page, { orientation: 1 });
                await expect(page.evaluate(async ({ file, offset, value, size, little }) => {
                    const buffer = await file.arrayBuffer();
                    new DataView(buffer)[`setUint${size}`](offset, value, little);
                    await UI.ImageCrop.init(document.querySelector('#crop')).load(new Blob([buffer], { type: 'image/jpeg' }));
                }, { file, offset, value, size, little })).rejects.toThrow(/JPEG|EXIF/);
                await page.evaluate((file) => $.getData('#crop', 'imagecrop').load(file), file);
                await expect(page.locator('#crop canvas')).toHaveAttribute('width', '640');
            });
        }
    });
});
