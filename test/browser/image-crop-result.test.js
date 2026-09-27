import { expect, test } from '#test';
import { expectPixel } from '../support/assertions/pixels.js';
import { createImage, readPixels } from '../support/image.js';

test.describe('ImageCrop results', () => {
    test.beforeEach(async ({ page }) => {
        await page.evaluate(() => {
            document.body.innerHTML = '<div id="crop"></div>';
        });

        const file = await createImage(page, { quadrants: true });

        await page.evaluate(async (file) => {
            window.imageFile = file;
            await UI.ImageCrop.init(document.querySelector('#crop'), { previewWidth: 320, previewHeight: 240 }).load(file);
        }, file);
    });

    test.describe('#result', () => {
        for (const { type, format } of [
            { type: 'base64', format: 'png' },
            { type: 'base64', format: 'jpeg' },
            { type: 'blob', format: 'png' },
            { type: 'blob', format: 'jpeg' },
            { type: 'canvas', format: 'png' },
        ]) {
            test(`exports decodable ${format} pixels as ${type}`, async ({ page }) => {
                const mime = await page.evaluate(async ({ type, format }) => {
                    const crop = $.getData('#crop', 'imagecrop');
                    const result = await crop.result({ type, format });
                    let canvas;
                    let mime;

                    if (type === 'canvas') {
                        canvas = result;
                    } else {
                        mime = type === 'blob' ? result.type : result.slice(5, result.indexOf(';'));

                        const url = type === 'blob' ? URL.createObjectURL(result) : result;

                        try {
                            const image = new Image();

                            image.src = url;
                            await image.decode();
                            canvas = document.createElement('canvas');
                            canvas.width = image.naturalWidth;
                            canvas.height = image.naturalHeight;
                            canvas.getContext('2d').drawImage(image, 0, 0);
                        } finally {
                            if (type === 'blob') {
                                URL.revokeObjectURL(url);
                            }
                        }
                    }

                    canvas.id = 'result';
                    document.body.append(canvas);

                    return mime;
                }, { type, format });

                if (type !== 'canvas') {
                    expect(mime).toBe(`image/${format}`);
                }

                const result = page.locator('#result');

                await expect(result).toHaveAttribute('width', '320');
                await expect(result).toHaveAttribute('height', '240');

                const pixels = await readPixels(result, [[80, 60], [240, 60], [80, 180], [240, 180]]);

                for (const [index, color] of [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]].entries()) {
                    expectPixel(pixels[index], [...color, 255], format === 'jpeg' ? 3 : 0);
                }
            });
        }

        test('exports exactly the selected source region', async ({ page }) => {
            const canvas = await page.evaluateHandle(async () => {
                const crop = $.getData('#crop', 'imagecrop');

                crop.setBounds(0, 0, 320, 240);

                return crop.result({ type: 'canvas' });
            });
            const pixels = await readPixels(canvas, [[10, 10], [310, 10], [10, 230], [310, 230]]);

            for (const pixel of pixels) {
                expectPixel(pixel, [255, 0, 0, 255]);
            }
        });

        test('defaults to PNG and falls back to PNG for unsupported encoders', async ({ page }) => {
            const result = await page.evaluate(() => $.getData('#crop', 'imagecrop').result());

            expect(result).toMatch(/^data:image\/png;base64,/);
            expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').result({ format: 'unsupported' }))).toBe(result);
            expect(await page.evaluate(async () => {
                const blob = await $.getData('#crop', 'imagecrop').result({ type: 'blob', format: 'unsupported' });

                return blob.type;
            })).toBe('image/png');
        });

        test('exports the rotated image', async ({ page }) => {
            const canvas = await page.evaluateHandle(async () => {
                const crop = $.getData('#crop', 'imagecrop');

                crop.rotate();

                return crop.result({ type: 'canvas' });
            });
            const [pixel] = await readPixels(canvas, [[40, 30]]);

            expectPixel(pixel, [0, 0, 255, 255]);
        });

        test('rejects failed Blob encoding', async ({ page }) => {
            await expect(page.evaluate(async () => {
                const crop = $.getData('#crop', 'imagecrop');
                const toBlob = HTMLCanvasElement.prototype.toBlob;

                HTMLCanvasElement.prototype.toBlob = (callback) => callback(null);
                try {
                    await crop.result({ type: 'blob' });
                } finally {
                    HTMLCanvasElement.prototype.toBlob = toBlob;
                }
            })).rejects.toThrow('Could not encode');
        });

        test('rejects an unsupported result type', async ({ page }) => {
            await expect(page.evaluate(() => $.getData('#crop', 'imagecrop').result({ type: 'invalid' }))).rejects.toThrow('Result type');
        });
    });

    test.describe('size option', () => {
        for (const { name, size, width, height } of [
            { name: 'viewport', size: 'viewport', width: 320, height: 240 },
            { name: 'original', size: 'original', width: 640, height: 480 },
            { name: 'explicit dimensions', size: { width: 200, height: 100 }, width: 200, height: 100 },
            { name: 'width only', size: { width: 100 }, width: 100, height: 75 },
            { name: 'height only', size: { height: 60 }, width: 80, height: 60 },
            { name: 'fractional dimensions', size: { width: 101.9 }, width: 101, height: 76 },
        ]) {
            test(`renders ${name}`, async ({ page }) => {
                await page.evaluate(async (size) => {
                    const result = await $.getData('#crop', 'imagecrop').result({ type: 'canvas', size });

                    result.id = 'result';
                    document.body.append(result);
                }, size);

                await expect(page.locator('#result')).toHaveAttribute('width', `${width}`);
                await expect(page.locator('#result')).toHaveAttribute('height', `${height}`);
            });
        }

        test('uses source pixels at the current zoom for original sizing', async ({ page }) => {
            await page.evaluate(async () => {
                const crop = $.getData('#crop', 'imagecrop');

                crop.setZoom(2);

                const result = await crop.result({ type: 'canvas', size: 'original' });

                result.id = 'result';
                document.body.append(result);
            });

            await expect(page.locator('#result')).toHaveAttribute('width', '160');
            await expect(page.locator('#result')).toHaveAttribute('height', '120');
        });

        for (const { name, size } of [
            { name: 'zero width', size: { width: 0 } },
            { name: 'negative height', size: { height: -1 } },
            { name: 'unknown size mode', size: 'invalid' },
            { name: 'missing dimensions', size: {} },
            { name: 'null size', size: null },
            { name: 'infinite width', size: { width: Infinity } },
            { name: 'NaN height', size: { height: NaN } },
        ]) {
            test(`rejects ${name}`, async ({ page }) => {
                await expect(page.evaluate((size) => $.getData('#crop', 'imagecrop').result({ size }), size)).rejects.toThrow();
            });
        }

        for (const dimension of ['width', 'height']) {
            test(`rejects an unrepresentable canvas ${dimension}`, async ({ page }) => {
                await expect(page.evaluate((dimension) => $.getData('#crop', 'imagecrop').result({
                    type: 'canvas',
                    size: { width: 1, height: 1, [dimension]: 2 ** 32 },
                }), dimension)).rejects.toThrow('Output dimensions exceed the supported canvas size.');
            });
        }
    });

    test.describe('quality option', () => {
        test('rejects quality above one', async ({ page }) => {
            await expect(page.evaluate(() => $.getData('#crop', 'imagecrop').result({ quality: 2 }))).rejects.toThrow('Quality');
        });

        test('changes JPEG encoding while producing a decodable image', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const crop = $.getData('#crop', 'imagecrop');
                const high = await crop.result({ format: 'jpeg', quality: 1 });
                const low = await crop.result({ format: 'jpeg', quality: .1 });
                const image = new Image();

                image.src = low;
                await image.decode();
                image.id = 'result';
                document.body.append(image);

                return high === low;
            });

            expect(result).toBe(false);
            await expect(page.locator('#result')).toBeVisible();
            await expect(page.locator('#result')).toHaveJSProperty('naturalWidth', 320);
            await expect(page.locator('#result')).toHaveJSProperty('naturalHeight', 240);
        });
    });

    test.describe('background option', () => {
        for (const background of [null, '#00ff00']) {
            test(`fills out-of-image areas with ${background ?? 'transparency'}`, async ({ page }) => {
                const canvas = await page.evaluateHandle(async (background) => {
                    $.getData('#crop', 'imagecrop').dispose();

                    const crop = UI.ImageCrop.init(document.querySelector('#crop'), { previewWidth: 320, previewHeight: 240, enforceBoundary: false });

                    await crop.load(window.imageFile);
                    crop.setBounds(-160, -120, 480, 360);

                    return crop.result({ type: 'canvas', background });
                }, background);
                const [pixel, inside] = await readPixels(canvas, [[10, 10], [100, 80]]);

                expect(pixel[3]).toBe(background ? 255 : 0);
                if (background) {
                    expectPixel(pixel, [0, 255, 0]);
                }

                expect(inside[0]).toBe(255);
            });
        }
    });

    test.describe('circle option', () => {
        test('fits a circular mask inside rectangular output', async ({ page }) => {
            const canvas = await page.evaluateHandle(async () => {
                const crop = $.getData('#crop', 'imagecrop');

                return crop.result({ type: 'canvas', circle: true, size: { width: 200, height: 100 } });
            });
            const [outside, inside] = await readPixels(canvas, [[10, 50], [100, 50]]);

            expect(outside[3]).toBe(0);
            expect(inside[3]).toBe(255);
        });

        for (const source of ['component', 'result']) {
            test(`clips the result when enabled on the ${source}`, async ({ page }) => {
                const canvas = await page.evaluateHandle(async (source) => {
                    $.getData('#crop', 'imagecrop').dispose();

                    const crop = UI.ImageCrop.init(document.querySelector('#crop'), { circle: source === 'component' });

                    await crop.load(window.imageFile);

                    return crop.result({ type: 'canvas', circle: source === 'result' });
                }, source);

                if (source === 'component') {
                    await expect(page.locator('#crop .overflow-hidden')).toHaveClass(/rounded-circle/);
                }

                const [outside, inside] = await readPixels(canvas, [[0, 0], [150, 150]]);

                expect(outside[3]).toBe(0);
                expect(inside[3]).toBe(255);
            });
        }

        test('fills the area outside a circle with the selected background', async ({ page }) => {
            const canvas = await page.evaluateHandle(() =>
                $.getData('#crop', 'imagecrop').result({ type: 'canvas', circle: true, background: '#fff' }),
            );
            const [pixel] = await readPixels(canvas, [[0, 0]]);

            expectPixel(pixel, [255, 255, 255, 255]);
        });
    });

    for (const { name, options, width, height, size = 'original' } of [
        { name: 'maxWidth option', options: { maxWidth: 160 }, width: 160, height: 120 },
        { name: 'maxHeight option', options: { maxHeight: 90 }, width: 120, height: 90 },
        { name: 'combined output limits', options: { maxWidth: 160, maxHeight: 90 }, width: 120, height: 90 },
        { name: 'maxWidth with fractional scaling', options: { maxWidth: 55 }, size: { width: 300, height: 200 }, width: 55, height: 36 },
        { name: 'maxHeight with fractional scaling', options: { maxHeight: 55 }, size: { width: 200, height: 300 }, width: 36, height: 55 },
    ]) {
        test.describe(name, () => {
            test('limits the output without changing its aspect ratio', async ({ page }) => {
                await page.evaluate(async ({ options, size }) => {
                    $.getData('#crop', 'imagecrop').dispose();

                    const crop = UI.ImageCrop.init(document.querySelector('#crop'), { ...options, previewWidth: 320, previewHeight: 240 });

                    await crop.load(window.imageFile);

                    const result = await crop.result({ type: 'canvas', size });

                    result.id = 'result';
                    document.body.append(result);
                }, { options, size });

                await expect(page.locator('#result')).toHaveAttribute('width', `${width}`);
                await expect(page.locator('#result')).toHaveAttribute('height', `${height}`);
            });
        });
    }
});
