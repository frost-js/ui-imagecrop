import { expect, test } from '#test';
import { expectPixel } from '../support/assertions/pixels.js';
import { createImage, readPixels } from '../support/image.js';

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
            $.setHtml(document.body, '<div id="crop"></div>');
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
                        const crop = UI.ImageCrop.init($.findOne('#crop'), { previewWidth: width, previewHeight: height });

                        await crop.load(file);

                        const result = await crop.result({ type: 'canvas' });

                        $.setProperty(result, 'id', 'result');
                        $.append(document.body, result);
                    }, { file, width, height });

                    await expect(page.locator('#crop canvas')).toHaveAttribute('width', `${width}`);
                    await expect(page.locator('#crop canvas')).toHaveAttribute('height', `${height}`);
                    await expect(page.locator('#result')).toHaveAttribute('width', `${width}`);
                    await expect(page.locator('#result')).toHaveAttribute('height', `${height}`);
                    for (const selector of ['#crop canvas', '#result']) {
                        const points = [[.25, .25], [.75, .25], [.25, .75], [.75, .75]]
                            .map(([x, y]) => [width * x, height * y]);
                        const pixels = await readPixels(page.locator(selector), points);

                        for (const [corner, color] of expected.entries()) {
                            expectPixel(pixels[corner], [...colors[color], 255], 3);
                        }
                    }

                    expect(await file.evaluate(async (file, littleEndian) =>
                        new DataView(await file.arrayBuffer()).getUint16(30, littleEndian), littleEndian,
                    )).toBe(orientation);
                });
            }
        }

        for (const orientation of [5, 6, 7, 8]) {
            for (const zoom of [null, .5]) {
                test(`${zoom === null ? 'fits the oriented image into a rectangular preview' : 'preserves explicit zoom'} for EXIF ${orientation}`, async ({ page }) => {
                    const file = await createImage(page, { orientation });

                    await page.evaluate(async ({ file, zoom }) => {
                        const crop = UI.ImageCrop.init($.findOne('#crop'), {
                            previewWidth: 300,
                            previewHeight: 100,
                            enforceBoundary: false,
                        });

                        await crop.load(file, { zoom });
                    }, { file, zoom });

                    expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBeCloseTo(zoom ?? .15625);

                    const canvas = page.locator('#crop canvas');

                    await expect(canvas).toHaveAttribute('width', '480');
                    await expect(canvas).toHaveAttribute('height', '640');

                    const box = await canvas.boundingBox();

                    expect(box.width).toBeCloseTo(zoom === null ? 75 : 240);
                    expect(box.height).toBeCloseTo(zoom === null ? 100 : 320);
                });
            }
        }

        for (let orientation = 1; orientation <= 8; orientation++) {
            test(`ignores EXIF ${orientation} when orientation handling is disabled`, async ({ page }) => {
                const file = await createImage(page, { width: 80, height: 40, quadrants: true, orientation });

                await page.evaluate(async (file) => {
                    await UI.ImageCrop.init($.findOne('#crop'), { exifOrientation: false }).load(file);
                }, file);

                await expect(page.locator('#crop canvas')).toHaveAttribute('width', '80');
                await expect(page.locator('#crop canvas')).toHaveAttribute('height', '40');

                const pixels = await readPixels(page.locator('#crop canvas'), [[20, 10], [60, 10], [20, 30], [60, 30]]);

                for (const [corner, color] of orientations[0].entries()) {
                    expectPixel(pixels[corner], colors[color], 3);
                }
            });
        }
    });

    test.describe('metadata', () => {
        for (const padding of [1, 4]) {
            test(`loads JPEG markers with ${padding} padding bytes and applies orientation once`, async ({ page }) => {
                const file = await createImage(page, { width: 80, height: 40, quadrants: true, orientation: 6 });

                await page.evaluate(async ({ file, padding }) => {
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    const fill = new Uint8Array(padding).fill(255);
                    const app = new Uint8Array([255, 239, 0, 4, 0, 0]);
                    const modified = new Blob([bytes.slice(0, 2), fill, app, fill, bytes.slice(2)], { type: 'image/jpeg' });

                    await UI.ImageCrop.init($.findOne('#crop')).load(modified);
                }, { file, padding });

                const canvas = page.locator('#crop canvas');

                await expect(canvas).toHaveAttribute('width', '40');
                await expect(canvas).toHaveAttribute('height', '80');
                expect(await canvas.evaluate((canvas) =>
                    canvas.getContext('2d').getImageData(10, 10, 1, 1).data[2],
                )).toBeGreaterThan(250);
            });
        }

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

                await UI.ImageCrop.init($.findOne('#crop')).load(modified);
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
                await UI.ImageCrop.init($.findOne('#crop')).load(new Blob([buffer], { type: 'image/jpeg' }));
            }, file);

            expect(await page.locator('#crop canvas').evaluate((canvas) =>
                canvas.getContext('2d').getImageData(50, 50, 1, 1).data[0],
            )).toBeGreaterThan(250);
        });

        for (const [name, bytes] of [
            ['padding', [255, 216, 255, 255, 255]],
            ['marker', [255, 216, 255, 255, 225]],
            ['segment length', [255, 216, 255, 255, 225, 0]],
        ]) {
            test(`rejects truncated JPEG ${name} after padding and can load a valid image afterward`, async ({ page }) => {
                await expect(page.evaluate(async (bytes) => {
                    await UI.ImageCrop.init($.findOne('#crop')).load(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
                }, bytes)).rejects.toThrow('Truncated JPEG metadata');

                const file = await createImage(page);

                await page.evaluate((file) => $.getData('#crop', 'imagecrop').load(file), file);
                await expect(page.locator('#crop canvas')).toHaveAttribute('width', '640');
            });
        }

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
                    await UI.ImageCrop.init($.findOne('#crop')).load(new Blob([buffer], { type: 'image/jpeg' }));
                }, { file, offset, value, size, little })).rejects.toThrow(/JPEG|EXIF/);
                await page.evaluate((file) => $.getData('#crop', 'imagecrop').load(file), file);
                await expect(page.locator('#crop canvas')).toHaveAttribute('width', '640');
            });
        }
    });
});
