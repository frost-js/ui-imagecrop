import { expect, test } from '#test';
import { setupTouchEvents } from '../setup/browser.js';
import { createImage } from '../support/image.js';

test.describe('ImageCrop', () => {
    test.beforeEach(async ({ page }) => {
        await page.evaluate(() => {
            $.setHtml(document.body, '<div id="crop"><span>Existing content</span></div><div id="crop2"></div>');
        });

        const file = await createImage(page);

        await page.evaluate((file) => {
            window.imageFile = file;
        }, file);
    });

    test.describe('#init', () => {
        for (const { name, init } of [
            { name: 'class', init: () => UI.ImageCrop.init($.findOne('#crop')) },
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
            const instance = await page.evaluateHandle(() => UI.ImageCrop.init($.findOne('#crop'), { circle: true }));

            expect(await instance.evaluate((value) => UI.ImageCrop.init(value.node, { circle: false }) === value)).toBe(true);
            await expect(page.locator('#crop .overflow-hidden')).toHaveClass(/rounded-circle/);
            await expect(page.locator('#crop canvas')).toHaveCount(1);
        });

        test('exposes frozen options with explicit values taking precedence over data attributes', async ({ page }) => {
            const instance = await page.evaluateHandle(() => {
                const node = $.findOne('#crop');

                $.setDataset(node, 'uiCircle', true);
                $.setDataset(node, 'uiPreviewWidth', 200);

                return UI.ImageCrop.init(node, { previewWidth: 250 });
            });

            expect(await instance.evaluate((value) => Object.isFrozen(value.options))).toBe(true);
            expect(await instance.evaluate((value) => value.options.previewWidth)).toBe(250);
            expect(await instance.evaluate((value) => value.options.previewHeight)).toBe(300);
            await expect(page.locator('#crop .overflow-hidden')).toHaveClass(/rounded-circle/);
        });

        for (const { name, options } of [
            { name: 'zero preview width', options: { previewWidth: 0 } },
            { name: 'negative preview height', options: { previewHeight: -1 } },
            { name: 'negative maximum preview width', options: { maxPreviewWidth: -1 } },
            { name: 'zero maximum output width', options: { maxWidth: 0 } },
            { name: 'reversed zoom limits', options: { minZoom: 2, maxZoom: 1 } },
        ]) {
            test(`cleans up failed initialization with ${name}`, async ({ page }) => {
                await expect(page.evaluate((options) => UI.ImageCrop.init($.findOne('#crop'), options), options)).rejects.toThrow();
                expect(await page.evaluate(() => $.hasData('#crop', 'imagecrop'))).toBe(false);
                await expect(page.locator('#crop canvas')).toHaveCount(0);
                await page.evaluate(() => UI.ImageCrop.init($.findOne('#crop')));
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
                const instance = await page.evaluateHandle(() => UI.ImageCrop.init($.findOne('#crop')));

                await page.evaluate(dispose, instance);
                expect(await instance.evaluate((value) => value.node)).toBeNull();
                expect(await instance.evaluate((value) => value.options)).toBeNull();
                expect(await page.evaluate(() => $.hasData('#crop', 'imagecrop'))).toBe(false);
                await expect(page.locator('#crop canvas')).toHaveCount(0);
                await expect(page.locator('#crop > span')).toHaveText('Existing content');
            });
        }

        test('is repeatable and allows reinitialization', async ({ page }) => {
            await page.evaluate(() => {
                const crop = UI.ImageCrop.init($.findOne('#crop'));

                crop.dispose();
                crop.dispose();
                UI.ImageCrop.init($.findOne('#crop'));
            });

            await expect(page.locator('#crop canvas')).toHaveCount(1);
        });

        test('disposes when fQuery removes the host', async ({ page }) => {
            const instance = await page.evaluateHandle(() => UI.ImageCrop.init($.findOne('#crop')));

            await page.evaluate(() => $.remove('#crop'));
            expect(await instance.evaluate((value) => value.node)).toBeNull();
            await expect(page.locator('#crop')).toHaveCount(0);
        });

        test('rejects an outstanding file read with AbortError', async ({ page }) => {
            expect(await page.evaluate(async () => {
                const crop = UI.ImageCrop.init($.findOne('#crop'));
                const pending = crop.load(window.imageFile).catch((error) => error.name);

                crop.dispose();

                return pending;
            })).toBe('AbortError');
            await expect(page.locator('#crop canvas')).toHaveCount(0);
        });

        test('rejects an outstanding decode and revokes its URL', async ({ page }) => {
            const state = await page.evaluate(async () => {
                const crop = UI.ImageCrop.init($.findOne('#crop'));
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

            expect(state.error).toBe('AbortError');
            expect(state.revoked).toContain(state.created);
            await expect(page.locator('#crop canvas')).toHaveCount(0);
        });

        test('ignores queued drag movement after disposal', async ({ page }) => {
            const errors = [];

            page.on('pageerror', (error) => errors.push(error.message));
            await page.evaluate(async () => {
                const crop = UI.ImageCrop.init($.findOne('#crop'));

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

    test.describe('#getBounds', () => {
        for (const { name, get } of [
            { name: 'class', get: () => $.getData('#crop', 'imagecrop').getBounds() },
            { name: 'QuerySet', get: () => $('#crop').imagecrop('getBounds') },
        ]) {
            test(`returns source coordinates (${name})`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init($.findOne('#crop')).load(window.imageFile);
                });

                const bounds = await page.evaluate(get);

                for (const [index, expected] of [80, 0, 560, 480].entries()) {
                    expect(bounds[index]).toBeCloseTo(expected);
                }
            });
        }

        test('rejects calls before loading an image', async ({ page }) => {
            await page.evaluate(() => UI.ImageCrop.init($.findOne('#crop')));
            await expect(page.evaluate(() => $.getData('#crop', 'imagecrop').getBounds())).rejects.toThrow('Load an image');
        });
    });

    test.describe('#getZoom', () => {
        for (const { name, get } of [
            { name: 'class', get: () => $.getData('#crop', 'imagecrop').getZoom() },
            { name: 'QuerySet', get: () => $('#crop').imagecrop('getZoom') },
        ]) {
            test(`returns the fitted zoom (${name})`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init($.findOne('#crop')).load(window.imageFile);
                });

                expect(await page.evaluate(get)).toBeCloseTo(0.625);
            });
        }

        test('rejects calls before loading an image', async ({ page }) => {
            await page.evaluate(() => UI.ImageCrop.init($.findOne('#crop')));
            await expect(page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).rejects.toThrow('Load an image');
        });
    });

    test.describe('#load', () => {
        for (const { name, load } of [
            { name: 'class', load: () => UI.ImageCrop.init($.findOne('#crop')).load(window.imageFile) },
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

        test('uses explicit source offsets and zoom', async ({ page }) => {
            const bounds = await page.evaluate(async () => {
                const crop = UI.ImageCrop.init($.findOne('#crop'));

                await crop.load(window.imageFile, { x: 400, y: 250, zoom: 1 });

                return crop.getBounds();
            });

            for (const [index, expected] of [90, 80, 390, 380].entries()) {
                expect(bounds[index]).toBeCloseTo(expected);
            }
        });

        test('resets mirroring when loading a normal image after a mirrored image', async ({ page }) => {
            const mirrored = await createImage(page, { orientation: 2 });

            await page.evaluate(async (file) => {
                await UI.ImageCrop.init($.findOne('#crop')).load(file);
            }, mirrored);

            expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.getContext('2d').getImageData(50, 50, 1, 1).data[2])).toBeGreaterThan(240);
            await page.evaluate(() => $.getData('#crop', 'imagecrop').load(window.imageFile));
            expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.getContext('2d').getImageData(50, 50, 1, 1).data[0])).toBe(255);
            expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.getContext('2d').getImageData(50, 50, 1, 1).data[2])).toBe(0);
        });

        test('aborts a superseded load and commits only the replacement', async ({ page }) => {
            const replacement = await createImage(page, { width: 320, height: 240 });

            expect(await page.evaluate(async (file) => {
                const crop = UI.ImageCrop.init($.findOne('#crop'));
                const pending = crop.load(window.imageFile).catch((error) => error.name);

                await crop.load(file);

                return pending;
            }, replacement)).toBe('AbortError');

            await expect(page.locator('#crop canvas')).toHaveAttribute('width', '320');
            await expect(page.locator('#crop canvas')).toHaveAttribute('height', '240');
        });

        test('rejects input that is not a Blob', async ({ page }) => {
            await page.evaluate(() => UI.ImageCrop.init($.findOne('#crop')));
            await expect(page.evaluate(() => $.getData('#crop', 'imagecrop').load(null))).rejects.toThrow('Blob');
        });

        test('rejects zero initial zoom', async ({ page }) => {
            await page.evaluate(() => UI.ImageCrop.init($.findOne('#crop')));
            await expect(page.evaluate(() => $.getData('#crop', 'imagecrop').load(window.imageFile, { zoom: 0 }))).rejects.toThrow('positive');
        });

        for (const { name, bytes } of [
            { name: 'empty files', bytes: [] },
            { name: 'truncated JPEG markers', bytes: [255, 216, 255] },
            { name: 'truncated EXIF headers', bytes: [255, 216, 255, 225, 0, 8, 69, 120, 105, 102, 0, 0] },
            { name: 'undecodable images', bytes: [1, 2, 3, 4] },
        ]) {
            test(`rejects ${name} and preserves the previous image`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init($.findOne('#crop')).load(window.imageFile);
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
                await UI.ImageCrop.init($.findOne('#crop')).load(window.imageFile);
            });

            await expect(page.evaluate(() => {
                const file = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"></svg>'], { type: 'image/svg+xml' });

                return $.getData('#crop', 'imagecrop').load(file);
            })).rejects.toThrow();
            await expect(page.locator('#crop canvas')).toHaveAttribute('width', '640');
            expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.getContext('2d').getImageData(50, 50, 1, 1).data[0])).toBe(255);
        });

        for (const failure of ['error', 'abort', 'throw']) {
            test(`recovers from a file reader ${failure}`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init($.findOne('#crop')).load(window.imageFile);
                });

                await expect(page.evaluate(async (failure) => {
                    const Reader = window.FileReader;

                    window.FileReader = class extends Reader {
                        readAsArrayBuffer() {
                            if (failure === 'throw') {
                                throw new Error('Could not read the image.');
                            }

                            this.dispatchEvent(new Event(failure));
                        }
                    };
                    try {
                        await $.getData('#crop', 'imagecrop').load(window.imageFile);
                    } finally {
                        window.FileReader = Reader;
                    }
                }, failure)).rejects.toThrow(failure === 'abort' ? 'aborted' : 'Could not read');

                await expect(page.locator('#crop canvas')).toHaveAttribute('width', '640');
                expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.getContext('2d').getImageData(50, 50, 1, 1).data[0])).toBe(255);
                await page.evaluate(() => $.getData('#crop', 'imagecrop').load(window.imageFile));
            });
        }

        test('rejects loading after disposal', async ({ page }) => {
            const instance = await page.evaluateHandle(() => UI.ImageCrop.init($.findOne('#crop')));

            await instance.evaluate((value) => value.dispose());
            await expect(instance.evaluate((value) => value.load(window.imageFile))).rejects.toThrow('disposed');
        });
    });

    test.describe('#result', () => {
        test('returns a canvas with numeric dimensions and the cropped image', async ({ page }) => {
            const canvas = await page.evaluateHandle(async () => {
                const crop = UI.ImageCrop.init($.findOne('#crop'));

                await crop.load(window.imageFile);

                const result = await crop.result({ type: 'canvas' });

                $.setProperty(result, 'id', 'result');
                $.append(document.body, result);

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
                const canvas = $.create('canvas');
                const context = canvas.getContext('2d');

                context.drawImage(value, 0, 0);
                value.close();

                return context.getImageData(25, 25, 1, 1).data[0];
            })).toBe(255);
        });

        test('rejects calls before loading an image', async ({ page }) => {
            await page.evaluate(() => UI.ImageCrop.init($.findOne('#crop')));
            await expect(page.evaluate(() => $.getData('#crop', 'imagecrop').result())).rejects.toThrow('Load an image');
        });
    });

    test.describe('#rotate', () => {
        for (const { name, rotate } of [
            { name: 'class', rotate: () => $.getData('#crop', 'imagecrop').rotate(-90) },
            { name: 'QuerySet', rotate: () => $('#crop').imagecrop('rotate', -90) },
        ]) {
            test(`supports negative quarter turns (${name})`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init($.findOne('#crop')).load(window.imageFile);
                });
                await page.evaluate(rotate);
                await expect(page.locator('#crop canvas')).toHaveAttribute('width', '480');
                await expect(page.locator('#crop canvas')).toHaveAttribute('height', '640');
                expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.getContext('2d').getImageData(50, 50, 1, 1).data[2])).toBe(255);
            });
        }

        test('restores pixels and bounds after a complete turn', async ({ page }) => {
            await page.evaluate(async () => {
                const crop = UI.ImageCrop.init($.findOne('#crop'));

                await crop.load(window.imageFile, { zoom: 1 });
                crop.setBounds(100, 50, 400, 350);
            });

            const before = await page.locator('#crop canvas').evaluate((canvas) => canvas.toDataURL());

            await page.evaluate(() => {
                const crop = $.getData('#crop', 'imagecrop');

                for (let turn = 0; turn < 4; turn++) {
                    crop.rotate();
                }
            });

            expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.toDataURL())).toBe(before);

            const bounds = await page.evaluate(() => $.getData('#crop', 'imagecrop').getBounds());

            for (const [index, expected] of [100, 50, 400, 350].entries()) {
                expect(bounds[index]).toBeCloseTo(expected);
            }
        });

        test('reclamps offsets for a non-square viewport', async ({ page }) => {
            const bounds = await page.evaluate(async () => {
                const crop = UI.ImageCrop.init($.findOne('#crop'), { previewWidth: 300, previewHeight: 100 });

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

        for (const { name, angle } of [
            { name: 'a non-quarter turn', angle: 45 },
            { name: 'NaN', angle: NaN },
            { name: 'infinity', angle: Infinity },
        ]) {
            test(`rejects ${name} without changing the image`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init($.findOne('#crop')).load(window.imageFile);
                });

                await expect(page.evaluate((angle) => $.getData('#crop', 'imagecrop').rotate(angle), angle)).rejects.toThrow('multiple of 90');

                await expect(page.locator('#crop canvas')).toHaveAttribute('width', '640');
            });
        }

        test('rejects calls before loading an image', async ({ page }) => {
            await page.evaluate(() => UI.ImageCrop.init($.findOne('#crop')));
            await expect(page.evaluate(() => $.getData('#crop', 'imagecrop').rotate())).rejects.toThrow('Load an image');
        });
    });

    test.describe('#setBounds', () => {
        for (const { name, set } of [
            { name: 'class', set: () => $.getData('#crop', 'imagecrop').setBounds(100, 100, 300, 300) },
            { name: 'QuerySet', set: () => $('#crop').imagecrop('setBounds', 100, 100, 300, 300) },
        ]) {
            test(`sets the crop coordinates (${name})`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init($.findOne('#crop')).load(window.imageFile);
                });
                await page.evaluate(set);

                const bounds = await page.evaluate(() => $.getData('#crop', 'imagecrop').getBounds());

                for (const [index, expected] of [100, 100, 300, 300].entries()) {
                    expect(bounds[index]).toBeCloseTo(expected);
                }
            });
        }

        test('resizes the viewport at the current zoom', async ({ page }) => {
            const bounds = await page.evaluate(async () => {
                const crop = UI.ImageCrop.init($.findOne('#crop'), { resize: true });

                await crop.load(window.imageFile, { zoom: 1 });
                crop.setBounds(100, 100, 300, 250);

                return crop.getBounds();
            });

            await expect(page.locator('#crop > .position-relative')).toHaveCSS('width', '200px');
            await expect(page.locator('#crop > .position-relative')).toHaveCSS('height', '150px');
            expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBe(1);
            for (const [index, expected] of [100, 100, 300, 250].entries()) {
                expect(bounds[index]).toBeCloseTo(expected);
            }
        });

        test('centers the requested bounds when zoom and resize are disabled', async ({ page }) => {
            const bounds = await page.evaluate(async () => {
                const crop = UI.ImageCrop.init($.findOne('#crop'), { zoom: false });

                await crop.load(window.imageFile, { zoom: 1 });
                crop.setBounds(100, 100, 300, 300);

                return crop.getBounds();
            });

            for (const [index, expected] of [50, 50, 350, 350].entries()) {
                expect(bounds[index]).toBeCloseTo(expected);
            }
        });

        for (const { name, bounds } of [
            { name: 'zero width', bounds: [0, 0, 0, 10] },
            { name: 'reversed horizontal bounds', bounds: [10, 0, 0, 10] },
            { name: 'reversed vertical bounds', bounds: [0, 10, 10, 0] },
        ]) {
            test(`rejects ${name} without mutating the crop`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init($.findOne('#crop')).load(window.imageFile);
                });

                await expect(page.evaluate((bounds) => $.getData('#crop', 'imagecrop').setBounds(...bounds), bounds)).rejects.toThrow('positive');

                expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBeCloseTo(0.625);
            });
        }

        test('rejects calls before loading an image', async ({ page }) => {
            await page.evaluate(() => UI.ImageCrop.init($.findOne('#crop')));
            await expect(page.evaluate(() => $.getData('#crop', 'imagecrop').setBounds())).rejects.toThrow('Load an image');
        });
    });

    test.describe('#setZoom', () => {
        for (const { name, set } of [
            { name: 'class', set: () => $.getData('#crop', 'imagecrop').setZoom(2) },
            { name: 'QuerySet', set: () => $('#crop').imagecrop('setZoom', 2) },
        ]) {
            test(`sets the zoom (${name})`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init($.findOne('#crop')).load(window.imageFile);
                });
                await page.evaluate(set);
                expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBe(2);
                await expect(page.locator('#crop canvas')).toHaveCSS('transform', 'matrix(2, 0, 0, 2, -490, -330)');
            });
        }

        for (const { name, zoom } of [
            { name: 'zero', zoom: 0 },
            { name: 'a negative value', zoom: -1 },
            { name: 'NaN', zoom: NaN },
            { name: 'infinity', zoom: Infinity },
        ]) {
            test(`rejects ${name} without mutating the crop`, async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init($.findOne('#crop')).load(window.imageFile);
                });

                await expect(page.evaluate((zoom) => $.getData('#crop', 'imagecrop').setZoom(zoom), zoom)).rejects.toThrow('positive');

                expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBeCloseTo(0.625);
            });
        }

        test('rejects calls before loading an image', async ({ page }) => {
            await page.evaluate(() => UI.ImageCrop.init($.findOne('#crop')));
            await expect(page.evaluate(() => $.getData('#crop', 'imagecrop').setZoom())).rejects.toThrow('Load an image');
        });
    });

    test.describe('events', () => {
        test('does not emit an update when loading an image', async ({ page }) => {
            expect(await page.evaluate(async () => {
                const crop = UI.ImageCrop.init($.findOne('#crop'));
                let updates = 0;

                $.addEvent(crop.node, 'update.ui.imagecrop', () => updates++);
                await crop.load(window.imageFile);

                return updates;
            })).toBe(0);
        });

        for (const { name, update, count } of [
            { name: 'emits one update when zoom changes', update: (crop) => crop.setZoom(1), count: 1 },
            { name: 'emits one update when bounds change', update: (crop) => crop.setBounds(100, 100, 400, 400), count: 1 },
            { name: 'emits one update when rotated', update: (crop) => crop.rotate(), count: 1 },
            { name: 'does not emit an update for unchanged zoom', update: (crop) => crop.setZoom(crop.getZoom()), count: 0 },
            { name: 'does not emit an update for zero rotation', update: (crop) => crop.rotate(0), count: 0 },
        ]) {
            test(name, async ({ page }) => {
                const instance = await page.evaluateHandle(async () => {
                    const crop = UI.ImageCrop.init($.findOne('#crop'));

                    await crop.load(window.imageFile);
                    window.updates = 0;
                    $.addEvent(crop.node, 'update.ui.imagecrop', () => window.updates++);

                    return crop;
                });

                await page.evaluate(update, instance);

                expect(await page.evaluate(() => window.updates)).toBe(count);
            });
        }

        for (const method of ['rotate', 'setBounds', 'setZoom']) {
            test(`can dispose in an update listener during ${method}`, async ({ page }) => {
                const errors = [];

                page.on('pageerror', (error) => errors.push(error.message));
                await page.evaluate(async (method) => {
                    const crop = UI.ImageCrop.init($.findOne('#crop'));

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
        test.beforeEach(async ({ page }) => {
            await setupTouchEvents(page);
        });

        test.describe('mouse', () => {
            for (const direction of ['ltr', 'rtl']) {
                test(`pans with the mouse in ${direction}`, async ({ page }) => {
                    await page.evaluate(async (direction) => {
                        $.setProperty(document.documentElement, 'dir', direction);

                        const crop = UI.ImageCrop.init($.findOne('#crop'));

                        await crop.load(window.imageFile, { zoom: 1 });
                        window.updates = 0;
                        $.addEvent(crop.node, 'update.ui.imagecrop', () => window.updates++);
                    }, direction);

                    const box = await page.locator('#crop .overflow-hidden').boundingBox();

                    await page.mouse.move(box.x + 100, box.y + 100);
                    await page.mouse.down();
                    await page.mouse.move(box.x + 140, box.y + 120, { steps: 4 });
                    await page.mouse.up();

                    const bounds = await page.evaluate(() => $.getData('#crop', 'imagecrop').getBounds());

                    for (const [index, expected] of [130, 70, 430, 370].entries()) {
                        expect(bounds[index]).toBeCloseTo(expected);
                    }

                    expect(await page.evaluate(() => window.updates)).toBeGreaterThan(0);
                    await page.mouse.move(box.x + 200, box.y + 200);
                    expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getBounds()[0])).toBeCloseTo(130);
                });
            }

            test('clamps dragging to the image boundary', async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init($.findOne('#crop')).load(window.imageFile, { zoom: 1 });
                });
                await page.locator('#crop .overflow-hidden').hover();
                await page.mouse.down();
                await page.mouse.move(750, 550, { steps: 4 });
                await page.mouse.up();

                const bounds = await page.evaluate(() => $.getData('#crop', 'imagecrop').getBounds());

                for (const [index, expected] of [0, 0, 300, 300].entries()) {
                    expect(bounds[index]).toBeCloseTo(expected);
                }
            });

            test('ignores secondary-button dragging and resizing', async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init($.findOne('#crop'), { resize: true }).load(window.imageFile, { zoom: 1 });
                });
                for (const selector of ['#crop .overflow-hidden', '#crop .top-100']) {
                    await page.locator(selector).hover();
                    await page.mouse.down({ button: 'right' });
                    await page.mouse.move(500, 400, { steps: 4 });
                    await page.mouse.up({ button: 'right' });
                }

                await expect(page.locator('#crop > .position-relative')).toHaveCSS('width', '300px');
                await expect(page.locator('#crop > .position-relative')).toHaveCSS('height', '300px');
                expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getBounds()[0])).toBeCloseTo(170);
            });
        });

        test.describe('wheel', () => {
            test('zooms in and out with the wheel', async ({ page }) => {
                await page.evaluate(async () => {
                    await UI.ImageCrop.init($.findOne('#crop')).load(window.imageFile, { zoom: 1 });
                });
                await page.locator('#crop .overflow-hidden').hover();
                await page.mouse.wheel(0, -100);
                await expect.poll(() => page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBeCloseTo(1.1);
                await page.mouse.wheel(0, 100);
                await expect.poll(() => page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBeCloseTo(1);
            });
        });

        test.describe('touch', () => {
            for (const { name, start, end, zoom, left } of [
                { name: 'pans with one touch', start: [100], end: [140], zoom: 1, left: 130 },
                { name: 'zooms in with a pinch', start: [100, 200], end: [50, 250], zoom: 1 + 100 / Math.hypot(300, 300) },
                { name: 'zooms out with a pinch', start: [50, 250], end: [100, 200], zoom: 1 - 100 / Math.hypot(300, 300) },
                { name: 'ignores three touches', start: [100, 150, 200], end: [50, 150, 250], zoom: 1, left: 170 },
            ]) {
                test(name, async ({ page }) => {
                    await page.evaluate(async ({ start, end }) => {
                        const crop = UI.ImageCrop.init($.findOne('#crop'));

                        await crop.load(window.imageFile, { zoom: 1 });

                        const container = $.findOne('#crop .overflow-hidden');

                        for (const [type, positions] of [['touchstart', start], ['touchmove', end], ['touchend', []]]) {
                            const event = window.createTouchEvent(type, positions);

                            (type === 'touchstart' ? container : window).dispatchEvent(event);
                            await Promise.resolve();
                        }
                    }, { start, end });

                    expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBeCloseTo(zoom);
                    if (left !== undefined) {
                        expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getBounds()[0])).toBeCloseTo(left);
                    }
                });
            }

            for (const { remaining, zoom } of [
                { remaining: 50, zoom: true },
                { remaining: 250, zoom: true },
                { remaining: 50, zoom: false },
                { remaining: 250, zoom: false },
            ]) {
                test(`resumes panning from the remaining touch at ${remaining} with zoom ${zoom}`, async ({ page }) => {
                    const movement = await page.evaluate(async ({ remaining, zoom }) => {
                        const crop = UI.ImageCrop.init($.findOne('#crop'), { zoom });

                        await crop.load(window.imageFile, { zoom: 1 });

                        const container = $.findOne('#crop .overflow-hidden');
                        const canvas = $.findOne('#crop canvas');

                        for (const [type, positions] of [
                            ['touchstart', [100]],
                            ['touchstart', [100, 200]],
                            ['touchmove', [50, 250]],
                            ['touchend', [remaining]],
                        ]) {
                            const event = window.createTouchEvent(type, positions);

                            container.dispatchEvent(event);
                            await Promise.resolve();
                        }

                        const before = $.rect(canvas);
                        const move = window.createTouchEvent('touchmove', [remaining + 1], 102);

                        window.dispatchEvent(move);
                        await Promise.resolve();

                        const after = $.rect(canvas);
                        const end = window.createTouchEvent('touchend', []);

                        window.dispatchEvent(end);
                        await Promise.resolve();

                        return { x: after.x - before.x, y: after.y - before.y };
                    }, { remaining, zoom });

                    expect(movement.x).toBeCloseTo(1);
                    expect(movement.y).toBeCloseTo(2);
                    expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBeCloseTo(zoom ? 1 + 100 / Math.hypot(300, 300) : 1);
                });
            }

            test('stops pinch zoom after touch cancellation', async ({ page }) => {
                const zoom = await page.evaluate(async () => {
                    const crop = UI.ImageCrop.init($.findOne('#crop'));

                    await crop.load(window.imageFile, { zoom: 1 });

                    for (const [type, positions] of [
                        ['touchstart', [100, 200]],
                        ['touchcancel', []],
                        ['touchmove', [50, 250]],
                    ]) {
                        const event = window.createTouchEvent(type, positions);

                        (type === 'touchstart' ? $.findOne('#crop .overflow-hidden') : window).dispatchEvent(event);
                        await Promise.resolve();
                    }

                    return crop.getZoom();
                });

                expect(zoom).toBe(1);
            });
        });

        test.describe('interruption', () => {
            for (const gesture of ['pan', 'resize', 'pinch']) {
                for (const action of ['dispose', 'load']) {
                    test(`ignores stale ${gesture} movement after ${action}`, async ({ page }) => {
                        const errors = [];

                        page.on('pageerror', (error) => errors.push(error.message));
                        await page.evaluate(async ({ gesture, action }) => {
                            const crop = UI.ImageCrop.init($.findOne('#crop'), { resize: true });

                            await crop.load(window.imageFile, { zoom: 1 });

                            const target = $.findOne(gesture === 'resize' ? '#crop .top-100' : '#crop .overflow-hidden');

                            target.dispatchEvent(gesture === 'pinch' ?
                                window.createTouchEvent('touchstart', [100, 200]) :
                                new MouseEvent('mousedown', { clientX: 100, clientY: 100 }));
                            if (action === 'dispose') {
                                crop.dispose();
                            } else {
                                await crop.load(window.imageFile, { zoom: 1 });
                            }

                            window.dispatchEvent(gesture === 'pinch' ?
                                window.createTouchEvent('touchmove', [50, 250]) :
                                new MouseEvent('mousemove', { clientX: 200, clientY: 200 }));
                            await Promise.resolve();
                            window.dispatchEvent(gesture === 'pinch' ?
                                window.createTouchEvent('touchend', []) :
                                new MouseEvent('mouseup'));
                        }, { gesture, action });

                        expect(errors).toHaveLength(0);
                        if (action === 'dispose') {
                            await expect(page.locator('#crop canvas')).toHaveCount(0);
                        } else {
                            await expect(page.locator('#crop > .position-relative')).toHaveCSS('width', '300px');
                            expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBe(1);
                            expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getBounds()[0])).toBeCloseTo(170);
                        }
                    });
                }
            }
        });

        test('ignores gestures before loading', async ({ page }) => {
            const errors = [];

            page.on('pageerror', (error) => errors.push(error.message));
            await page.evaluate(() => {
                const crop = UI.ImageCrop.init($.findOne('#crop'), { resize: true });
                const container = $.findOne('#crop .overflow-hidden');

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
    });

    test.describe('zoom option', () => {
        test.beforeEach(async ({ page }) => {
            await setupTouchEvents(page);
        });

        test('disables programmatic, wheel, and pinch zoom', async ({ page }) => {
            await page.evaluate(async () => {
                const crop = UI.ImageCrop.init($.findOne('#crop'), { zoom: false });

                await crop.load(window.imageFile, { zoom: 1 });
                crop.setZoom(2);

                const container = $.findOne('#crop .overflow-hidden');

                container.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
                for (const [type, positions] of [['touchstart', [100, 200]], ['touchmove', [50, 250]], ['touchend', []]]) {
                    const event = window.createTouchEvent(type, positions);

                    (type === 'touchstart' ? container : window).dispatchEvent(event);
                    await Promise.resolve();
                }
            });

            expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBe(1);
        });
    });

    for (const { name, options, requested, expected } of [
        { name: 'minZoom', options: { minZoom: .8 }, requested: .1, expected: .8 },
        { name: 'maxZoom', options: { maxZoom: 2 }, requested: 10, expected: 2 },
    ]) {
        test.describe(`${name} option`, () => {
            test('clamps programmatic zoom to the configured limit', async ({ page }) => {
                await page.evaluate(async ({ options, requested }) => {
                    const crop = UI.ImageCrop.init($.findOne('#crop'), options);

                    await crop.load(window.imageFile);
                    crop.setZoom(requested);
                }, { options, requested });

                expect(await page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBeCloseTo(expected);
            });
        });
    }

    test.describe('zoomAmount option', () => {
        test('uses the configured wheel increment', async ({ page }) => {
            await page.evaluate(async () => {
                const crop = UI.ImageCrop.init($.findOne('#crop'), { zoomAmount: .25 });

                await crop.load(window.imageFile, { zoom: 1 });
            });
            await page.locator('#crop .overflow-hidden').hover();
            await page.mouse.wheel(0, -100);
            await expect.poll(() => page.evaluate(() => $.getData('#crop', 'imagecrop').getZoom())).toBeCloseTo(1.25);
        });
    });

    test.describe('rotate option', () => {
        test('disables rotation', async ({ page }) => {
            await page.evaluate(async () => {
                const crop = UI.ImageCrop.init($.findOne('#crop'), { rotate: false });

                await crop.load(window.imageFile);
                crop.rotate();
            });

            await expect(page.locator('#crop canvas')).toHaveAttribute('width', '640');
            await expect(page.locator('#crop canvas')).toHaveAttribute('height', '480');
            expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.getContext('2d').getImageData(50, 50, 1, 1).data[0])).toBe(255);
        });
    });

    test.describe('enforceBoundary option', () => {
        test('allows zoom and bounds outside the image when disabled', async ({ page }) => {
            const bounds = await page.evaluate(async () => {
                const crop = UI.ImageCrop.init($.findOne('#crop'), { enforceBoundary: false });

                await crop.load(window.imageFile);
                crop.setBounds(-100, -100, 900, 900);

                return crop.getBounds();
            });

            for (const [index, expected] of [-100, -100, 900, 900].entries()) {
                expect(bounds[index]).toBeCloseTo(expected);
            }
        });
    });

    test.describe('resize option', () => {
        test('has no resize handle when disabled', async ({ page }) => {
            await page.evaluate(() => UI.ImageCrop.init($.findOne('#crop')));
            await expect(page.locator('#crop .top-100')).toHaveCount(0);
        });

        test('limits resizing to the scaled image dimensions', async ({ page }) => {
            await page.evaluate(async () => {
                await UI.ImageCrop.init($.findOne('#crop'), { resize: true }).load(window.imageFile, { zoom: .625 });
            });
            await page.locator('#crop .top-100').hover();
            await page.mouse.down();
            await page.mouse.move(750, 550, { steps: 4 });
            await page.mouse.up();
            await expect(page.locator('#crop > .position-relative')).toHaveCSS('width', '400px');
            await expect(page.locator('#crop > .position-relative')).toHaveCSS('height', '300px');
        });

        for (const direction of ['ltr', 'rtl']) {
            test(`preserves the image position while resizing without boundary enforcement (${direction})`, async ({ page }) => {
                await page.evaluate(async (direction) => {
                    $.setProperty(document.documentElement, 'dir', direction);

                    const crop = UI.ImageCrop.init($.findOne('#crop'), { resize: true, enforceBoundary: false });

                    await crop.load(window.imageFile);
                }, direction);

                const canvas = page.locator('#crop canvas');
                const before = await canvas.boundingBox();
                const handle = await page.locator('#crop .top-100').boundingBox();
                const viewport = await page.locator('#crop > .position-relative').boundingBox();

                expect(handle.x).toBeCloseTo(viewport.x + viewport.width);
                expect(handle.y).toBeCloseTo(viewport.y + viewport.height);
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
        }

        test('keeps dimensions positive when dragging past the minimum', async ({ page }) => {
            await page.evaluate(async () => {
                const crop = UI.ImageCrop.init($.findOne('#crop'), { resize: true, enforceBoundary: false });

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

    for (const { option, dimension } of [
        { option: 'maxPreviewWidth', dimension: 'width' },
        { option: 'maxPreviewHeight', dimension: 'height' },
    ]) {
        test.describe(`${option} option`, () => {
            test(`limits initial and resized viewport ${dimension}`, async ({ page }) => {
                await page.evaluate(async (option) => {
                    const crop = UI.ImageCrop.init($.findOne('#crop'), { resize: true, [option]: 200 });

                    await crop.load(window.imageFile, { zoom: 1 });
                }, option);

                const viewport = page.locator('#crop > .position-relative');

                await expect(viewport).toHaveCSS(dimension, '200px');

                await page.locator('#crop .top-100').hover();
                await page.mouse.down();
                await page.mouse.move(500, 400, { steps: 4 });
                await page.mouse.up();

                await expect(viewport).toHaveCSS(dimension, '200px');
            });
        });
    }

    test.describe('exifOrientation option', () => {
        for (const enabled of [true, false]) {
            test(`applies EXIF exactly once when ${enabled ? 'enabled' : 'disabled'}`, async ({ page }) => {
                const file = await createImage(page, { orientation: 6 });

                await page.evaluate(async ({ file, enabled }) => {
                    const crop = UI.ImageCrop.init($.findOne('#crop'), { exifOrientation: enabled });

                    await crop.load(file);
                }, { file, enabled });

                await expect(page.locator('#crop canvas')).toHaveAttribute('width', enabled ? '480' : '640');
                await expect(page.locator('#crop canvas')).toHaveAttribute('height', enabled ? '640' : '480');
                expect(await page.locator('#crop canvas').evaluate((canvas) => canvas.getContext('2d').getImageData(50, 50, 1, 1).data[0])).toBeGreaterThan(240);
            });
        }
    });
});
