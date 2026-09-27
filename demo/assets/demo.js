const $ = globalThis.$;
const { ImageCrop } = globalThis.UI;

const setTheme = (theme) => {
    if (theme === 'system') {
        $(document.documentElement).removeAttribute('data-ui-theme');
    } else {
        $(document.documentElement).setAttribute('data-ui-theme', theme);
    }

    $('[data-demo-theme]').setValue(theme);
};

const storedTheme = localStorage.getItem('frostui-imagecrop-demo-theme');
setTheme(['light', 'dark'].includes(storedTheme) ? storedTheme : 'system');

$.ready(() => {
    $('[data-demo-theme]').addEvent('change', (event) => {
        const theme = $.getValue(event.currentTarget);

        if (theme === 'system') {
            localStorage.removeItem('frostui-imagecrop-demo-theme');
        } else {
            localStorage.setItem('frostui-imagecrop-demo-theme', theme);
        }

        setTheme(theme);
    });

    const node = $.findOne('#crop');
    const input = $.findOne('#image-file');
    const log = $.findOne('#event-log');

    let crop;
    let file;
    let ready = false;
    let loading = false;
    let exporting = false;
    let resultUrl;

    const updateControls = () => {
        $.setProperty('[data-image-controls]', 'disabled', !ready || loading);
        $.setProperty('#result-options', 'disabled', !ready || loading || exporting);
        $.setProperty('#image-file, #sample-load', 'disabled', loading);
        $.setProperty('#crop-init', 'disabled', loading || !!crop || !file);
        $.setProperty('#crop-dispose', 'disabled', loading || !crop);
        $.setProperty('[data-rotate]', 'disabled', !crop?.options.rotate);
        $.setProperty('[data-zoom], #set-zoom, #zoom-value', 'disabled', !crop?.options.zoom);

        const custom = $.getValue('#result-size') === 'custom';

        $.setProperty('#result-width', { disabled: !custom, required: custom });
        $.setProperty('#result-height', 'disabled', !custom);

        const canvas = $.getValue('#result-type') === 'canvas';
        const jpeg = $.getValue('#result-format') === 'jpeg';

        $.setProperty('#result-format', 'disabled', canvas);
        $.setProperty('#result-quality', 'disabled', canvas || !jpeg);
        $.setProperty('#result-background', 'disabled', !$.getProperty('#result-fill', 'checked'));
    };

    const describeGeometry = () => {
        const bounds = crop.getBounds().map((value) => Number(value.toFixed(2)));
        const description = `Bounds: ${bounds.join(', ')} · Zoom: ${crop.getZoom().toFixed(3)}`;

        $.setText('#geometry', description);

        return description;
    };

    const loadFile = async (nextFile, recreate = false) => {
        loading = true;
        $.setText('#load-status', 'Loading image…');
        updateControls();

        try {
            nextFile = await nextFile;

            if (recreate || !crop) {
                crop?.dispose();
                crop = null;
                ready = false;

                const options = {
                    previewWidth: 240,
                    previewHeight: 240,
                    maxPreviewWidth: 480,
                    maxPreviewHeight: 400,
                };

                $('[data-option]').each((control) => {
                    options[$.getDataset(control, 'option')] = control.checked;
                });

                crop = ImageCrop.init(node, options);
            }

            await crop.load(nextFile);
            file = nextFile;
            ready = true;

            $.setText('#load-status', 'Image ready. Drag to pan, or use the controls.');
            $.setText('#method-output', describeGeometry());
        } catch (error) {
            $.setText('#load-status', error.message);
        } finally {
            loading = false;
            updateControls();
        }
    };

    const loadSample = () => loadFile(fetch(globalThis.testImage).then((response) => response.blob()));

    const run = (callback, output = '#method-output') => {
        if (!ready || loading) {
            return;
        }

        try {
            const result = callback();

            $.setText(output, result ?? describeGeometry());
        } catch (error) {
            $.setText(output, error.message);
        }
    };

    $.addEvent(input, 'change', () => {
        if (input.files[0]) {
            loadFile(input.files[0]);
        }

        $.setValue(input, '');
    });

    $.addEvent('#sample-load', 'click', loadSample);
    $.addEvent('#crop-options', 'change', () => loadFile(file, true));
    $.addEvent('#crop-init', 'click', () => loadFile(file));
    $.addEvent('#crop-dispose', 'click', () => {
        crop.dispose();
        crop = null;
        ready = false;

        $.setText('#load-status', 'Disposed. Initialize to reload the current image.');
        $.setText('#geometry', 'No image loaded.');
        $.setText('#method-output', 'Disposed.');
        updateControls();
    });

    $.addEvent(node, 'update.ui.imagecrop', () => {
        const entry = $.create('div', {
            class: 'small font-monospace py-2 border-bottom',
        });

        $.setText(entry, `update.ui.imagecrop — ${describeGeometry()}`);
        $.prepend(log, entry);

        if (log.children.length > 20) {
            $.remove(log.lastElementChild);
        }
    });

    $.addEvent('#clear-events', 'click', () => {
        $.empty(log);
    });

    $('[data-rotate]').addEvent('click', (event) => {
        const amount = $.getDataset(event.currentTarget, 'rotate');

        run(() => crop.rotate(amount));
    });

    $('[data-zoom]').addEvent('click', (event) => {
        const amount = $.getDataset(event.currentTarget, 'zoom');

        run(() => {
            const zoom = Math.max(.01, crop.getZoom() + amount);

            crop.setZoom(zoom);
        });
    });

    $('[data-pan]').addEvent('click', (event) => {
        const direction = $.getDataset(event.currentTarget, 'pan');

        run(() => {
            const [x1, y1, x2, y2] = crop.getBounds();
            const step = 20 / crop.getZoom();
            const offsets = {
                left: [step, 0],
                right: [-step, 0],
                up: [0, step],
                down: [0, -step],
            };
            const [dx, dy] = offsets[direction];

            crop.setBounds(x1 + dx, y1 + dy, x2 + dx, y2 + dy);
        });
    });

    $.addEvent('#bounds-form', 'submit', (event) => {
        event.preventDefault();

        run(() => {
            const bounds = ['x1', 'y1', 'x2', 'y2'].map((key) => $.getProperty(`#bounds-${key}`, 'valueAsNumber'));

            crop.setBounds(...bounds);
        });
    });

    $.addEvent('#get-bounds', 'click', () => {
        run(() => `Bounds: ${crop.getBounds().join(', ')}`, '#bounds-output');
    });

    $.addEvent('#zoom-form', 'submit', (event) => {
        event.preventDefault();

        run(() => crop.setZoom($.getProperty('#zoom-value', 'valueAsNumber')));
    });

    $.addEvent('#get-zoom', 'click', () => {
        run(() => `Zoom: ${crop.getZoom()}`, '#zoom-output');
    });

    $.addEvent('#result-options', 'change', updateControls);
    $.addEvent('#result-form', 'submit', async (event) => {
        event.preventDefault();

        if (!ready || loading || exporting) {
            return;
        }

        exporting = true;
        updateControls();
        $.setText('#result-status', 'Rendering…');

        try {
            const type = $.getValue('#result-type');
            const options = {
                type,
                format: $.getValue('#result-format'),
                size: $.getValue('#result-size'),
                circle: $.getProperty('#result-circle', 'checked'),
                background: $.getProperty('#result-fill', 'checked') ? $.getValue('#result-background') : null,
            };

            if (options.size === 'custom') {
                options.size = { width: $.getProperty('#result-width', 'valueAsNumber') };

                if ($.getValue('#result-height')) {
                    options.size.height = $.getProperty('#result-height', 'valueAsNumber');
                }
            }

            if (type !== 'canvas' && options.format === 'jpeg') {
                options.quality = $.getProperty('#result-quality', 'valueAsNumber');
            }

            const result = await crop.result(options);
            let blob = result;

            if (type === 'base64') {
                const response = await fetch(result);

                blob = await response.blob();
            } else if (type === 'canvas') {
                blob = await new Promise((resolve) => result.toBlob(resolve));
            }

            if (!blob) {
                throw new Error('Could not encode the download.');
            }

            let preview = result;
            const nextUrl = URL.createObjectURL(blob);

            if (type !== 'canvas') {
                preview = $.create('img', {
                    attributes: {
                        alt: 'Cropped image result',
                        src: nextUrl,
                    },
                });

                try {
                    await preview.decode();
                } catch (error) {
                    URL.revokeObjectURL(nextUrl);
                    throw error;
                }
            } else {
                $.setAttribute(preview, {
                    'role': 'img',
                    'aria-label': 'Cropped canvas result',
                });
            }

            $('#result-preview').empty().append(preview);

            if (resultUrl) {
                URL.revokeObjectURL(resultUrl);
            }

            resultUrl = nextUrl;
            $.setProperty('#result-download', {
                href: resultUrl,
                download: `crop.${blob.type === 'image/jpeg' ? 'jpg' : 'png'}`,
                hidden: false,
            });

            const width = preview.naturalWidth || preview.width;
            const height = preview.naturalHeight || preview.height;
            const size = `${blob.size.toLocaleString()} bytes${type === 'canvas' ? ' (PNG download)' : ''}`;

            $.setText('#result-status', `${type} · ${width} × ${height} pixels · ${blob.type} · ${size}`);
        } catch (error) {
            $.setText('#result-status', error.message);
        } finally {
            exporting = false;
            updateControls();
        }
    });

    $.addEvent(window, 'pagehide', () => {
        if (resultUrl) {
            URL.revokeObjectURL(resultUrl);
        }
    });

    setTheme(document.documentElement.dataset.uiTheme || 'system');
    loadSample();
});
