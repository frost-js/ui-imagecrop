import { expect, test } from '#test';
import { createImage } from '../support/image.js';

test.describe('ImageCrop', () => {
    test.beforeEach(async ({ page }) => {
        await page.evaluate((_) => {
            document.body.innerHTML = '<div id="crop"><span>Existing content</span></div><div id="crop2"></div>';
        });
        const file = await createImage(page);
        await page.evaluate((file) => {
            window.imageFile = file;
        }, file);
    });

    test.describe('#init', () => {
        for (const { name, init } of [
            { name: 'class', init: () => UI.ImageCrop.init(document.querySelector('#crop')) },
            { name: 'QuerySet', init: () => $('#crop').imagecrop() },
        ]) {
            test(`creates and registers an ImageCrop (${name})`, async ({ page }) => {
                const instance = await page.evaluateHandle(init);
                expect(await instance.evaluate((value) => value instanceof UI.ImageCrop)).toBe(true);
                expect(await instance.evaluate((value) => value === $.getData('#crop', 'imagecrop'))).toBe(true);
                await expect(page.locator('#crop canvas')).toHaveCount(1);
                await expect(page.locator('#crop > span')).toHaveText('Existing content');
            });
        }

        test('creates multiple ImageCrops and returns the first (QuerySet)', async ({ page }) => {
            const instance = await page.evaluateHandle(() => $('#crop, #crop2').imagecrop());
            expect(await instance.evaluate((value) => value === $.getData('#crop', 'imagecrop'))).toBe(true);
            expect(await page.evaluate(() => $.getData('#crop2', 'imagecrop') instanceof UI.ImageCrop)).toBe(true);
            await expect(page.locator('canvas')).toHaveCount(2);
        });

        test('reuses an existing instance without changing its options', async ({ page }) => {
            const instance = await page.evaluateHandle(() => UI.ImageCrop.init(document.querySelector('#crop'), { circle: true }));
            expect(await instance.evaluate((value) => UI.ImageCrop.init(value.node, { circle: false }) === value)).toBe(true);
            await expect(page.locator('#crop .overflow-hidden')).toHaveClass(/rounded-circle/);
            await expect(page.locator('#crop canvas')).toHaveCount(1);
        });

        test('exposes frozen options with explicit values taking precedence over data attributes', async ({ page }) => {
            const instance = await page.evaluateHandle((_) => {
                const node = document.querySelector('#crop');
                node.dataset.uiCircle = 'true';
                node.dataset.uiPreviewWidth = '200';
                return UI.ImageCrop.init(node, { previewWidth: 250 });
            });
            expect(await instance.evaluate((value) => Object.isFrozen(value.options))).toBe(true);
            expect(await instance.evaluate((value) => value.options.previewWidth)).toBe(250);
            expect(await instance.evaluate((value) => value.options.previewHeight)).toBe(300);
            await expect(page.locator('#crop .overflow-hidden')).toHaveClass(/rounded-circle/);
        });

        for (const options of [{ previewWidth: 0 }, { previewHeight: -1 }, { maxPreviewWidth: -1 }, { maxWidth: 0 }, { minZoom: 2, maxZoom: 1 }]) {
            test(`cleans up failed initialization (${JSON.stringify(options)})`, async ({ page }) => {
                await expect(page.evaluate((options) => UI.ImageCrop.init(document.querySelector('#crop'), options), options)).rejects.toThrow();
                expect(await page.evaluate(() => $.hasData('#crop', 'imagecrop'))).toBe(false);
                await expect(page.locator('#crop canvas')).toHaveCount(0);
                await page.evaluate(() => UI.ImageCrop.init(document.querySelector('#crop')));
                await expect(page.locator('#crop canvas')).toHaveCount(1);
            });
        }
    });

    test.describe('#dispose', () => {
        for (const { name, dispose } of [
            { name: 'class', dispose: (instance) => instance.dispose() },
            { name: 'QuerySet', dispose: () => $('#crop').imagecrop('dispose') },
        ]) {
            test(`removes the component and preserves existing content (${name})`, async ({ page }) => {
                const instance = await page.evaluateHandle(() => UI.ImageCrop.init(document.querySelector('#crop')));
                await page.evaluate(dispose, instance);
                expect(await instance.evaluate((value) => value.node)).toBeNull();
                expect(await instance.evaluate((value) => value.options)).toBeNull();
                expect(await page.evaluate(() => $.hasData('#crop', 'imagecrop'))).toBe(false);
                await expect(page.locator('#crop canvas')).toHaveCount(0);
                await expect(page.locator('#crop > span')).toHaveText('Existing content');
            });
        }

        test('is repeatable and allows reinitialization', async ({ page }) => {
            await page.evaluate((_) => {
                const crop = UI.ImageCrop.init(document.querySelector('#crop'));
                crop.dispose();
                crop.dispose();
                UI.ImageCrop.init(document.querySelector('#crop'));
            });
            await expect(page.locator('#crop canvas')).toHaveCount(1);
        });

        test('disposes when fQuery removes the host', async ({ page }) => {
            const instance = await page.evaluateHandle(() => UI.ImageCrop.init(document.querySelector('#crop')));
            await page.evaluate(() => $.remove('#crop'));
            expect(await instance.evaluate((value) => value.node)).toBeNull();
            await expect(page.locator('#crop')).toHaveCount(0);
        });

        test('rejects an outstanding file read with AbortError', async ({ page }) => {
            expect(await page.evaluate(async () => {
                const crop = UI.ImageCrop.init(document.querySelector('#crop'));
                const pending = crop.load(window.imageFile).catch((error) => error.name);
                crop.dispose();
                return pending;
            })).toBe('AbortError');
            await expect(page.locator('#crop canvas')).toHaveCount(0);
        });

        test('rejects an outstanding decode and revokes its URL', async ({ page }) => {
            const state = await page.evaluateHandle(async () => {
                const crop = UI.ImageCrop.init(document.querySelector('#crop'));
                const create = URL.createObjectURL;
                const revoke = URL.revokeObjectURL;
                const revoked = [];
                let created;
                URL.createObjectURL = (file) => {
                    created = create(file);
                    queueMicrotask(() => crop.dispose());
                    return created;
                };
                URL.revokeObjectURL = (url) => {
                    revoked.push(url);
                    revoke(url);
                };
                try {
                    const error = await crop.load(window.imageFile).catch((error) => error.name);
                    return { error, created, revoked };
                } finally {
                    URL.createObjectURL = create;
                    URL.revokeObjectURL = revoke;
                }
            });
            expect(await state.evaluate((value) => value.error)).toBe('AbortError');
            expect(await state.evaluate((value) => value.revoked.includes(value.created))).toBe(true);
            await expect(page.locator('#crop canvas')).toHaveCount(0);
        });

        test('ignores queued drag movement after disposal', async ({ page }) => {
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await page.evaluate(async () => {
                const crop = UI.ImageCrop.init(document.querySelector('#crop'));
                await crop.load(window.imageFile);
            });
            await page.locator('#crop canvas').hover({ position: { x: 150, y: 150 } });
            await page.mouse.down();
            await page.evaluate(() => $.getData('#crop', 'imagecrop').dispose());
            await page.mouse.move(250, 250, { steps: 5 });
            await page.mouse.up();
            await expect(page.locator('#crop canvas')).toHaveCount(0);
            expect(errors).toHaveLength(0);
        });
    });

    test.describe('#load', () => {
        for (const { name, load } of [
            { name: 'class', load: () => UI.ImageCrop.init(document.querySelector('#crop')).load(window.imageFile) },
            { name: 'QuerySet', load: () => $('#crop').imagecrop('load', window.imageFile) },
        ]) {
            test(`loads an image and sizes the viewport (${name})`, async ({ page }) => {
                await page.evaluate(load);
                await expect(page.locator('#crop canvas')).toHaveAttribute('width', '640');
                await expect(page.locator('#crop canvas')).toHaveAttribute('height', '480');
                await expect(page.locator('#crop > .position-relative')).toHaveCSS('width', '300px');
                await expect(page.locator('#crop > .position-relative')).toHaveCSS('height', '300px');
            });
        }

        test('aborts a superseded load and commits only the replacement', async ({ page }) => {
            const replacement = await createImage(page, { width: 320, height: 240 });
            expect(await page.evaluate(async (file) => {
                const crop = UI.ImageCrop.init(document.querySelector('#crop'));
                const pending = crop.load(window.imageFile).catch((error) => error.name);
                await crop.load(file);
                return pending;
            }, replacement)).toBe('AbortError');
            await expect(page.locator('#crop canvas')).toHaveAttribute('width', '320');
            await expect(page.locator('#crop canvas')).toHaveAttribute('height', '240');
        });

        for (const { name, bytes } of [
            { name: 'empty files', bytes: [] },
            { name: 'truncated JPEG markers', bytes: [255, 216, 255] },
            { name: 'truncated EXIF headers', bytes: [255, 216, 255, 225, 0, 8, 69, 120, 105, 102, 0, 0] },
            { name: 'undecodable images', bytes: [1, 2, 3, 4] },
        ]) {
            test(`rejects ${name} and preserves the previous image`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init(document.querySelector('#crop')).load(window.imageFile);
                });
                const previous = await page.locator('#crop canvas').evaluate((canvas) => canvas.toDataURL());
                await expect(page.evaluate(async (bytes) => {
                    await $.getData('#crop', 'imagecrop').load(new Blob([new Uint8Array(bytes)]));
                }, bytes)).rejects.toThrow();
                await expect(page.locator('#crop canvas')).toHaveAttribute('width', '640');
                expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.toDataURL())).toBe(previous);
                await page.evaluate(() => $.getData('#crop', 'imagecrop').load(window.imageFile));
            });
        }

        test('rejects images without dimensions and preserves the previous image', async ({ page }) => {
            await page.evaluate(async () => {
                await UI.ImageCrop.init(document.querySelector('#crop')).load(window.imageFile);
            });
            await expect(page.evaluate(() => {
                const file = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"></svg>'], { type: 'image/svg+xml' });
                return $.getData('#crop', 'imagecrop').load(file);
            })).rejects.toThrow();
            await expect(page.locator('#crop canvas')).toHaveAttribute('width', '640');
            expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.getContext('2d').getImageData(50, 50, 1, 1).data[0])).toBe(255);
        });

        test('rejects invalid input and loads after disposal', async ({ page }) => {
            await page.evaluate(() => UI.ImageCrop.init(document.querySelector('#crop')));
            await expect(page.evaluate(() => $.getData('#crop', 'imagecrop').load(null))).rejects.toThrow('Blob');
            await expect(page.evaluate(() => $.getData('#crop', 'imagecrop').load(window.imageFile, { zoom: 0 }))).rejects.toThrow('positive');
            const instance = await page.evaluateHandle(() => $.getData('#crop', 'imagecrop'));
            await instance.evaluate((value) => value.dispose());
            await expect(instance.evaluate((value) => value.load(window.imageFile))).rejects.toThrow('disposed');
        });

        test('resets mirroring when loading a normal image after a mirrored image', async ({ page }) => {
            const mirrored = await createImage(page, { orientation: 2 });
            await page.evaluate(async (file) => {
                await UI.ImageCrop.init(document.querySelector('#crop')).load(file);
            }, mirrored);
            expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.getContext('2d').getImageData(50, 50, 1, 1).data[2])).toBeGreaterThan(240);
            await page.evaluate(() => $.getData('#crop', 'imagecrop').load(window.imageFile));
            expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.getContext('2d').getImageData(50, 50, 1, 1).data[0])).toBe(255);
            expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.getContext('2d').getImageData(50, 50, 1, 1).data[2])).toBe(0);
        });
    });

    test.describe('#getBounds', () => {
        for (const { name, get } of [
            { name: 'class', get: () => $.getData('#crop', 'imagecrop').getBounds() },
            { name: 'QuerySet', get: () => $('#crop').imagecrop('getBounds') },
        ]) {
            test(`returns source coordinates (${name})`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init(document.querySelector('#crop')).load(window.imageFile);
                });
                const bounds = await page.evaluate(get);
                for (const [index, expected] of [80, 0, 560, 480].entries()) {
                    expect(bounds[index]).toBeCloseTo(expected);
                }
            });
        }
    });

    test.describe('#getZoom', () => {
        for (const { name, get } of [
            { name: 'class', get: () => $.getData('#crop', 'imagecrop').getZoom() },
            { name: 'QuerySet', get: () => $('#crop').imagecrop('getZoom') },
        ]) {
            test(`returns the fitted zoom (${name})`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init(document.querySelector('#crop')).load(window.imageFile);
                });
                expect(await page.evaluate(get)).toBeCloseTo(0.625);
            });
        }
    });

    test.describe('#result', () => {
        test('returns a canvas with numeric dimensions and the cropped image', async ({ page }) => {
            const canvas = await page.evaluateHandle(async () => {
                const crop = UI.ImageCrop.init(document.querySelector('#crop'));
                await crop.load(window.imageFile);
                const result = await crop.result({ type: 'canvas' });
                result.id = 'result';
                document.body.append(result);
                return result;
            });
            await expect(page.locator('#result')).toHaveAttribute('width', '300');
            await expect(page.locator('#result')).toHaveAttribute('height', '300');
            expect(await canvas.evaluate((value) => value.getContext('2d').getImageData(25, 25, 1, 1).data[0])).toBe(255);
        });

        test('returns an encoded Blob through QuerySet', async ({ page }) => {
            const blob = await page.evaluateHandle(async () => {
                await $('#crop').imagecrop('load', window.imageFile);
                return $('#crop').imagecrop('result', { type: 'blob' });
            });
            expect(await blob.evaluate((value) => value instanceof Blob)).toBe(true);
            expect(await blob.evaluate((value) => value.type)).toBe('image/png');
            const image = await blob.evaluateHandle((value) => createImageBitmap(value));
            expect(await image.evaluate((value) => value.width)).toBe(300);
            expect(await image.evaluate((value) => value.height)).toBe(300);
            expect(await image.evaluate((value) => {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                context.drawImage(value, 0, 0);
                value.close();
                return context.getImageData(25, 25, 1, 1).data[0];
            })).toBe(255);
        });

        test('fits a circular mask inside rectangular output', async ({ page }) => {
            const canvas = await page.evaluateHandle(async () => {
                const crop = UI.ImageCrop.init(document.querySelector('#crop'));
                await crop.load(window.imageFile);
                return crop.result({ type: 'canvas', circle: true, size: { width: 200, height: 100 } });
            });
            expect(await canvas.evaluate((value) => value.getContext('2d').getImageData(10, 50, 1, 1).data[3])).toBe(0);
            expect(await canvas.evaluate((value) => value.getContext('2d').getImageData(100, 50, 1, 1).data[3])).toBe(255);
        });

        test('rejects failed Blob encoding', async ({ page }) => {
            await expect(page.evaluate(async () => {
                const crop = UI.ImageCrop.init(document.querySelector('#crop'));
                await crop.load(window.imageFile);
                const toBlob = HTMLCanvasElement.prototype.toBlob;
                HTMLCanvasElement.prototype.toBlob = (callback) => callback(null);
                try {
                    await crop.result({ type: 'blob' });
                } finally {
                    HTMLCanvasElement.prototype.toBlob = toBlob;
                }
            })).rejects.toThrow('Could not encode');
        });

        test('rejects unsupported types and invalid dimensions', async ({ page }) => {
            await page.evaluate(async () => {
                await UI.ImageCrop.init(document.querySelector('#crop')).load(window.imageFile);
            });
            for (const options of [{ type: 'invalid' }, { size: { width: 0 } }, { size: { height: -1 } }, { quality: 2 }]) {
                await expect(page.evaluate((options) => $.getData('#crop', 'imagecrop').result(options), options)).rejects.toThrow();
            }
        });
    });

    test.describe('#rotate', () => {
        for (const { name, rotate } of [
            { name: 'class', rotate: () => $.getData('#crop', 'imagecrop').rotate(-90) },
            { name: 'QuerySet', rotate: () => $('#crop').imagecrop('rotate', -90) },
        ]) {
            test(`supports negative quarter turns (${name})`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init(document.querySelector('#crop')).load(window.imageFile);
                });
                await page.evaluate(rotate);
                await expect(page.locator('#crop canvas')).toHaveAttribute('width', '480');
                await expect(page.locator('#crop canvas')).toHaveAttribute('height', '640');
                expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.getContext('2d').getImageData(50, 50, 1, 1).data[2])).toBe(255);
            });
        }

        test('rejects non-quarter turns without changing the image', async ({ page }) => {
            await page.evaluate(async () => {
                await UI.ImageCrop.init(document.querySelector('#crop')).load(window.imageFile);
            });
            for (const angle of [45, NaN, Infinity]) {
                await expect(page.evaluate((angle) => $.getData('#crop', 'imagecrop').rotate(angle), angle)).rejects.toThrow('multiple of 90');
            }
            await expect(page.locator('#crop canvas')).toHaveAttribute('width', '640');
        });

        test('reclamps offsets for a non-square viewport', async ({ page }) => {
            const bounds = await page.evaluate(async () => {
                const crop = UI.ImageCrop.init(document.querySelector('#crop'), { previewWidth: 300, previewHeight: 100 });
                await crop.load(window.imageFile, { zoom: 1 });
                crop.setBounds(0, 0, 300, 100);
                crop.rotate();
                return crop.getBounds();
            });
            expect(bounds[0]).toBeGreaterThanOrEqual(0);
            expect(bounds[1]).toBeGreaterThanOrEqual(0);
            expect(bounds[2]).toBeLessThanOrEqual(480);
            expect(bounds[3]).toBeLessThanOrEqual(640);
        });
    });

    test.describe('#setBounds', () => {
        for (const { name, set } of [
            { name: 'class', set: () => $.getData('#crop', 'imagecrop').setBounds(100, 100, 300, 300) },
            { name: 'QuerySet', set: () => $('#crop').imagecrop('setBounds', 100, 100, 300, 300) },
        ]) {
            test(`sets the crop coordinates (${name})`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init(document.querySelector('#crop')).load(window.imageFile);
                });
                await page.evaluate(set);
                const bounds = await page.evaluate(() => $.getData('#crop', 'imagecrop').getBounds());
                for (const [index, expected] of [100, 100, 300, 300].entries()) {
                    expect(bounds[index]).toBeCloseTo(expected);
                }
            });
        }

        test('rejects empty and reversed bounds without mutating the crop', async ({ page }) => {
            await page.evaluate(async () => {
                await UI.ImageCrop.init(document.querySelector('#crop')).load(window.imageFile);
            });
            for (const bounds of [[0, 0, 0, 10], [10, 0, 0, 10], [0, 10, 10, 0]]) {
                await expect(page.evaluate((bounds) => $.getData('#crop', 'imagecrop').setBounds(...bounds), bounds)).rejects.toThrow('positive');
            }
            expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBeCloseTo(0.625);
        });
    });

    test.describe('#setZoom', () => {
        for (const { name, set } of [
            { name: 'class', set: () => $.getData('#crop', 'imagecrop').setZoom(2) },
            { name: 'QuerySet', set: () => $('#crop').imagecrop('setZoom', 2) },
        ]) {
            test(`sets the zoom (${name})`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init(document.querySelector('#crop')).load(window.imageFile);
                });
                await page.evaluate(set);
                expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBe(2);
                await expect(page.locator('#crop canvas')).toHaveCSS('transform', 'matrix(2, 0, 0, 2, -490, -330)');
            });
        }

        test('rejects invalid zoom values without mutating the crop', async ({ page }) => {
            await page.evaluate(async () => {
                await UI.ImageCrop.init(document.querySelector('#crop')).load(window.imageFile);
            });
            for (const zoom of [0, -1, NaN, Infinity]) {
                await expect(page.evaluate((zoom) => $.getData('#crop', 'imagecrop').setZoom(zoom), zoom)).rejects.toThrow('positive');
            }
            expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBeCloseTo(0.625);
        });
    });

    test.describe('events', () => {
        for (const method of ['rotate', 'setBounds', 'setZoom']) {
            test(`can dispose in an update listener during ${method}`, async ({ page }) => {
                const errors = [];
                page.on('pageerror', (error) => errors.push(error.message));
                await page.evaluate(async (method) => {
                    const crop = UI.ImageCrop.init(document.querySelector('#crop'));
                    await crop.load(window.imageFile);
                    $.addEvent(crop.node, 'update.ui.imagecrop', () => crop.dispose());
                    const args = { rotate: [90], setBounds: [0, 0, 200, 200], setZoom: [2] };
                    crop[method](...args[method]);
                }, method);
                await expect(page.locator('#crop canvas')).toHaveCount(0);
                expect(errors).toHaveLength(0);
            });
        }
    });

    test.describe('user events', () => {
        test('ignores gestures before loading', async ({ page }) => {
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await page.evaluate((_) => {
                const crop = UI.ImageCrop.init(document.querySelector('#crop'), { resize: true });
                const container = document.querySelector('#crop .overflow-hidden');
                container.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, bubbles: true }));
                container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 200 }));
                window.dispatchEvent(new MouseEvent('mouseup'));
                return crop.load(window.imageFile);
            });
            expect(errors).toHaveLength(0);
            expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBeCloseTo(0.625);
            await expect(page.locator('#crop canvas')).toHaveCSS('transform', 'matrix(0.625, 0, 0, 0.625, -50, 0)');
        });

        test('rejects image operations before loading', async ({ page }) => {
            await page.evaluate(() => UI.ImageCrop.init(document.querySelector('#crop')));
            for (const method of ['getBounds', 'getZoom', 'result', 'rotate', 'setBounds', 'setZoom']) {
                await expect(page.evaluate((method) => $.getData('#crop', 'imagecrop')[method](), method)).rejects.toThrow('Load an image');
            }
        });
    });

    test.describe('resize option', () => {
        test('preserves the image position while resizing without boundary enforcement', async ({ page }) => {
            await page.evaluate(async () => {
                const crop = UI.ImageCrop.init(document.querySelector('#crop'), { resize: true, enforceBoundary: false });
                await crop.load(window.imageFile);
            });
            const canvas = page.locator('#crop canvas');
            const before = await canvas.boundingBox();
            const handle = await page.locator('#crop .top-100').boundingBox();
            await page.mouse.move(handle.x + 2, handle.y + 2);
            await page.mouse.down();
            await page.mouse.move(handle.x + 42, handle.y + 32, { steps: 5 });
            await page.mouse.up();
            await expect(page.locator('#crop > .position-relative')).toHaveCSS('width', '340px');
            await expect(page.locator('#crop > .position-relative')).toHaveCSS('height', '330px');
            const after = await canvas.boundingBox();
            expect(after.x).toBeCloseTo(before.x);
            expect(after.y).toBeCloseTo(before.y);
        });

        test('keeps dimensions positive when dragging past the minimum', async ({ page }) => {
            await page.evaluate(async () => {
                const crop = UI.ImageCrop.init(document.querySelector('#crop'), { resize: true, enforceBoundary: false });
                await crop.load(window.imageFile);
            });
            const handle = page.locator('#crop .top-100');
            await handle.hover();
            await page.mouse.down();
            await page.mouse.move(-100, -100, { steps: 5 });
            await page.mouse.up();
            await expect(page.locator('#crop > .position-relative')).toHaveCSS('width', '1px');
            await expect(page.locator('#crop > .position-relative')).toHaveCSS('height', '1px');
        });
    });

    test.describe('exifOrientation option', () => {
        for (const enabled of [true, false]) {
            test(`applies EXIF exactly once when ${enabled ? 'enabled' : 'disabled'}`, async ({ page }) => {
                const file = await createImage(page, { orientation: 6 });
                await page.evaluate(async ({ file, enabled }) => {
                    const crop = UI.ImageCrop.init(document.querySelector('#crop'), { exifOrientation: enabled });
                    await crop.load(file);
                }, { file, enabled });
                await expect(page.locator('#crop canvas')).toHaveAttribute('width', enabled ? '480' : '640');
                await expect(page.locator('#crop canvas')).toHaveAttribute('height', enabled ? '640' : '480');
                expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.getContext('2d').getImageData(50, 50, 1, 1).data[0])).toBeGreaterThan(240);
            });
        }
    });
});
