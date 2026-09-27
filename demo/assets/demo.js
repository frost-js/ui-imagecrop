const $ = globalThis.$;
const UI = globalThis.UI;

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

    const node = document.querySelector('#crop');
    const input = document.querySelector('#image-file');
    const status = document.querySelector('#load-status');
    const output = document.querySelector('#method-output');
    const log = document.querySelector('#event-log');
    const resultPreview = document.querySelector('#result-preview');
    const resultStatus = document.querySelector('#result-status');
    const download = document.querySelector('#result-download');
    let crop;
    let file;
    let ready = false;
    let loading = false;
    let exporting = false;
    let resultUrl;
    let resultBlob;

    const updateControls = () => {
        document.querySelectorAll('[data-image-controls]').forEach((fieldset) => {
            fieldset.disabled = !ready || loading;
        });
        document.querySelector('#result-options').disabled = !ready || loading || exporting;
        input.disabled = loading;
        document.querySelector('#sample-load').disabled = loading;
        document.querySelector('#crop-init').disabled = loading || !!crop || !file;
        document.querySelector('#crop-dispose').disabled = loading || !crop;
        document.querySelectorAll('[data-rotate]').forEach((button) => {
            button.disabled = !crop?.options.rotate;
        });
        document.querySelectorAll('[data-zoom], #set-zoom, #zoom-value').forEach((control) => {
            control.disabled = !crop?.options.zoom;
        });
        const custom = document.querySelector('#result-size').value === 'custom';
        document.querySelector('#result-width').disabled = !custom;
        document.querySelector('#result-width').required = custom;
        document.querySelector('#result-height').disabled = !custom;
        const canvas = document.querySelector('#result-type').value === 'canvas';
        document.querySelector('#result-format').disabled = canvas;
        document.querySelector('#result-quality').disabled = canvas || document.querySelector('#result-format').value !== 'jpeg';
        document.querySelector('#result-background').disabled = !document.querySelector('#result-fill').checked;
    };

    const describeGeometry = () => {
        const bounds = crop.getBounds().map((value) => Number(value.toFixed(2)));
        const description = `Bounds: ${bounds.join(', ')} · Zoom: ${crop.getZoom().toFixed(3)}`;
        document.querySelector('#geometry').textContent = description;
        return description;
    };

    const loadFile = async (nextFile, recreate = false) => {
        loading = true;
        status.textContent = 'Loading image…';
        updateControls();
        try {
            if (recreate || !crop) {
                crop?.dispose();
                crop = null;
                ready = false;
                const options = { previewWidth: 240, previewHeight: 240, maxPreviewWidth: 480, maxPreviewHeight: 400 };
                document.querySelectorAll('[data-option]').forEach((control) => {
                    options[control.dataset.option] = control.checked;
                });
                crop = UI.ImageCrop.init(node, options);
            }
            await crop.load(nextFile);
            file = nextFile;
            ready = true;
            status.textContent = 'Image ready. Drag to pan, or use the controls.';
            output.textContent = describeGeometry();
        } catch (error) {
            status.textContent = error.message;
        } finally {
            loading = false;
            updateControls();
        }
    };

    const loadSample = async () => {
        loading = true;
        updateControls();
        try {
            const response = await fetch(globalThis.testImage);
            await loadFile(await response.blob());
        } catch (error) {
            status.textContent = error.message;
        } finally {
            loading = false;
            updateControls();
        }
    };

    const run = (callback) => {
        if (!ready || loading) {
            return;
        }
        try {
            callback();
            output.textContent = describeGeometry();
        } catch (error) {
            output.textContent = error.message;
        }
    };

    input.addEventListener('change', () => {
        if (input.files[0]) {
            loadFile(input.files[0]);
        }
        input.value = '';
    });
    document.querySelector('#sample-load').addEventListener('click', loadSample);
    document.querySelector('#crop-options').addEventListener('change', () => loadFile(file, true));
    document.querySelector('#crop-init').addEventListener('click', () => loadFile(file));
    document.querySelector('#crop-dispose').addEventListener('click', () => {
        crop.dispose();
        crop = null;
        ready = false;
        status.textContent = 'Disposed. Initialize to reload the current image.';
        document.querySelector('#geometry').textContent = 'No image loaded.';
        output.textContent = 'Disposed.';
        updateControls();
    });

    $.addEvent(node, 'update.ui.imagecrop', () => {
        const entry = document.createElement('div');
        entry.className = 'small font-monospace py-2 border-bottom';
        entry.textContent = `update.ui.imagecrop — ${describeGeometry()}`;
        log.prepend(entry);
        if (log.children.length > 20) {
            log.lastElementChild.remove();
        }
    });
    document.querySelector('#clear-events').addEventListener('click', () => log.replaceChildren());
    document.querySelectorAll('[data-rotate]').forEach((button) => {
        button.addEventListener('click', () => run(() => crop.rotate(Number(button.dataset.rotate))));
    });
    document.querySelectorAll('[data-zoom]').forEach((button) => {
        button.addEventListener('click', () => run(() => crop.setZoom(Math.max(.01, crop.getZoom() + Number(button.dataset.zoom)))));
    });
    document.querySelectorAll('[data-pan]').forEach((button) => {
        button.addEventListener('click', () => run(() => {
            const [x1, y1, x2, y2] = crop.getBounds();
            const step = 20 / crop.getZoom();
            const [dx, dy] = { left: [step, 0], right: [-step, 0], up: [0, step], down: [0, -step] }[button.dataset.pan];
            crop.setBounds(x1 + dx, y1 + dy, x2 + dx, y2 + dy);
        }));
    });
    document.querySelector('#bounds-form').addEventListener('submit', (event) => {
        event.preventDefault();
        run(() => crop.setBounds(...['x1', 'y1', 'x2', 'y2'].map((key) => document.querySelector(`#bounds-${key}`).valueAsNumber)));
    });
    document.querySelector('#get-bounds').addEventListener('click', () => run(() => {
        crop.getBounds().forEach((value, index) => {
            document.querySelector(`#bounds-${['x1', 'y1', 'x2', 'y2'][index]}`).value = Number(value.toFixed(2));
        });
    }));
    document.querySelector('#zoom-form').addEventListener('submit', (event) => {
        event.preventDefault();
        run(() => crop.setZoom(document.querySelector('#zoom-value').valueAsNumber));
    });
    document.querySelector('#get-zoom').addEventListener('click', () => run(() => {
        document.querySelector('#zoom-value').value = crop.getZoom();
    }));

    document.querySelector('#result-options').addEventListener('change', updateControls);
    document.querySelector('#result-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!ready || loading || exporting) {
            return;
        }
        exporting = true;
        updateControls();
        resultStatus.textContent = 'Rendering…';
        try {
            const type = document.querySelector('#result-type').value;
            const size = document.querySelector('#result-size').value;
            const options = {
                type,
                format: document.querySelector('#result-format').value,
                size: size === 'custom' ? {
                    width: document.querySelector('#result-width').valueAsNumber,
                    ...(document.querySelector('#result-height').value ? { height: document.querySelector('#result-height').valueAsNumber } : {}),
                } : size,
                circle: document.querySelector('#result-circle').checked,
                background: document.querySelector('#result-fill').checked ? document.querySelector('#result-background').value : null,
            };
            if (type !== 'canvas' && options.format === 'jpeg') {
                options.quality = document.querySelector('#result-quality').valueAsNumber;
            }
            const result = await crop.result(options);
            let blob = result;
            if (type === 'base64') {
                blob = await (await fetch(result)).blob();
            } else if (type === 'canvas') {
                blob = await new Promise((resolve) => result.toBlob(resolve));
            }
            if (!blob) {
                throw new Error('Could not encode the download.');
            }
            let preview = result;
            let nextUrl;
            if (type !== 'canvas') {
                preview = new Image();
                preview.alt = 'Cropped image result';
                nextUrl = URL.createObjectURL(blob);
                preview.src = nextUrl;
                try {
                    await preview.decode();
                } catch (error) {
                    URL.revokeObjectURL(nextUrl);
                    throw error;
                }
            } else {
                preview.setAttribute('role', 'img');
                preview.setAttribute('aria-label', 'Cropped canvas result');
            }
            resultPreview.replaceChildren(preview);
            if (resultUrl) {
                URL.revokeObjectURL(resultUrl);
            }
            resultUrl = nextUrl;
            resultBlob = blob;
            download.href = '#results';
            download.download = `crop.${blob.type === 'image/jpeg' ? 'jpg' : 'png'}`;
            download.hidden = false;
            resultStatus.textContent = `${type} · ${preview.naturalWidth || preview.width} × ${preview.naturalHeight || preview.height} pixels · ${blob.type} · ${blob.size.toLocaleString()} bytes${type === 'canvas' ? ' (PNG download)' : ''}`;
        } catch (error) {
            resultStatus.textContent = error.message;
        } finally {
            exporting = false;
            updateControls();
        }
    });
    download.addEventListener('click', () => {
        const url = URL.createObjectURL(resultBlob);
        download.href = url;
        // Give the browser time to start the download before releasing its URL.
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
    window.addEventListener('pagehide', () => {
        if (resultUrl) {
            URL.revokeObjectURL(resultUrl);
        }
    });

    loadSample();
    for (let orientation = 1; orientation <= 8; orientation++) {
        const exifStatus = document.querySelector(`#exif-status-${orientation}`);
        const example = UI.ImageCrop.init(document.querySelector(`#exif-${orientation}`), {
            previewWidth: 180,
            previewHeight: 180,
            enforceBoundary: false,
            minZoom: .01,
            zoom: false,
        });
        fetch(globalThis[`exif${orientation}`])
            .then((response) => response.blob())
            .then((file) => example.load(file))
            .then(() => {
                exifStatus.textContent = 'Orientation applied.';
            })
            .catch((error) => {
                exifStatus.textContent = error.message;
            });
    }
});
