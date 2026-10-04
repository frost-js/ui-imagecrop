import $ from '@fr0st/query';
import { BaseComponent, getPosition } from '@fr0st/ui';
import { getOrientation, getTouchDistance } from './helpers.js';

/**
 * @typedef {object} ImageCropOptions
 * @property {number} [previewWidth=300] The initial viewport width in pixels.
 * @property {number} [previewHeight=300] The initial viewport height in pixels.
 * @property {number|null} [maxPreviewWidth=null] The maximum viewport width.
 * @property {number|null} [maxPreviewHeight=null] The maximum viewport height.
 * @property {number|null} [maxWidth=null] The maximum exported image width.
 * @property {number|null} [maxHeight=null] The maximum exported image height.
 * @property {number} [minZoom=0.1] The minimum image scale.
 * @property {number} [maxZoom=10] The maximum image scale, unless covering the viewport requires more.
 * @property {number} [zoomAmount=0.1] The wheel zoom increment.
 * @property {boolean} [circle=false] Whether to display and export a circular crop.
 * @property {boolean} [exifOrientation=true] Whether to apply the file's EXIF orientation.
 * @property {boolean} [zoom=true] Whether to allow zooming.
 * @property {boolean} [resize=false] Whether to allow resizing the viewport.
 * @property {boolean} [rotate=true] Whether to allow rotation.
 * @property {boolean} [enforceBoundary=true] Whether the image must cover the viewport.
 */

/**
 * @typedef {object} ImageCropLoadOptions
 * @property {number|null} [x=null] The initial horizontal offset in source pixels.
 * @property {number|null} [y=null] The initial vertical offset in source pixels.
 * @property {number|null} [zoom=null] The initial scale, or automatic sizing when omitted.
 */

/**
 * @typedef {object} ImageCropResultOptions
 * @property {'base64'|'blob'|'canvas'} [type='base64'] The result representation.
 * @property {string} [format='png'] The image MIME subtype, such as 'png' or 'jpeg'.
 * @property {'viewport'|'original'|{width?: number, height?: number}} [size='viewport'] The output dimensions.
 * @property {number} [quality=1] The encoding quality between zero and one.
 * @property {boolean} [circle=false] Whether to clip the output to a circle.
 * @property {string|null} [background=null] The output background color.
 */

/**
 * Controls an image cropping viewport.
 * @augments {BaseComponent<ImageCropOptions>}
 */
export default class ImageCrop extends BaseComponent {
    static classes = {
        circle: 'rounded-circle',
        container: 'position-relative w-100 h-100 overflow-hidden border',
        outerContainer: 'position-relative',
        preview: 'position-absolute top-0',
        resize: 'position-absolute top-100 bg-primary',
    };
    /** @type {ImageCropOptions} */
    static defaults = {
        previewWidth: 300,
        previewHeight: 300,
        maxPreviewWidth: null,
        maxPreviewHeight: null,
        maxWidth: null,
        maxHeight: null,
        minZoom: .1,
        maxZoom: 10,
        zoomAmount: .1,
        circle: false,
        exifOrientation: true,
        zoom: true,
        resize: false,
        rotate: true,
        enforceBoundary: true,
    };

    #cancelLoad;
    #canvas;
    #canvasHeight;
    #canvasWidth;
    #container;
    #context;
    #flipped;
    #img;
    #offsetX;
    #offsetY;
    #outerContainer;
    #previewHeight;
    #previewWidth;
    #resize;
    #rotation;
    #zoom;

    /**
     * Creates an ImageCrop.
     * @param {HTMLElement} node The input node.
     * @param {ImageCropOptions} [options] The ImageCrop options.
     */
    constructor(node, options) {
        super(node, options);

        try {
            for (const key of ['previewWidth', 'previewHeight', 'minZoom', 'maxZoom', 'zoomAmount']) {
                if (!Number.isFinite(this.options[key]) || this.options[key] <= 0) {
                    throw new RangeError(`${key} must be a positive finite number.`);
                }
            }

            for (const key of ['maxPreviewWidth', 'maxPreviewHeight', 'maxWidth', 'maxHeight']) {
                if (
                    this.options[key] !== null &&
                    (!Number.isFinite(this.options[key]) || this.options[key] <= 0)
                ) {
                    throw new RangeError(`${key} must be null or a positive finite number.`);
                }
            }

            if (this.options.minZoom > this.options.maxZoom) {
                throw new RangeError('minZoom must not exceed maxZoom.');
            }

            this.#render();
            this.#events();
        } catch (error) {
            this.dispose();
            throw error;
        }
    }

    /** @inheritdoc */
    dispose() {
        if (!this.node) {
            return;
        }

        this.#cancelLoad?.();
        $.remove(this.#outerContainer);

        this.#outerContainer = null;
        this.#container = null;
        this.#resize = null;
        this.#canvas = null;
        this.#context = null;
        this.#img = null;

        super.dispose();
    }

    /**
     * Gets the image bounds.
     * @returns {[number, number, number, number]} The left, top, right, and bottom crop coordinates.
     */
    getBounds() {
        this.#requireImage();

        const width = this.#previewWidth / this.#zoom;
        const height = this.#previewHeight / this.#zoom;
        const x = (this.#canvasWidth - this.#offsetX) - (width / 2);
        const y = (this.#canvasHeight - this.#offsetY) - (height / 2);

        return [x, y, x + width, y + height];
    }

    /**
     * Gets the image zoom level.
     * @returns {number} The zoom level.
     */
    getZoom() {
        this.#requireImage();

        return this.#zoom;
    }

    /**
     * Loads an image, aborting any previous pending load.
     * @param {Blob} file The image file.
     * @param {ImageCropLoadOptions} [options] The initial image position and scale.
     * @returns {Promise<void>} Resolves after rendering, or rejects on failure or cancellation.
     */
    async load(file, { x = null, y = null, zoom = null } = {}) {
        if (!this.node) {
            throw new Error('ImageCrop has been disposed.');
        }

        if (!(file instanceof Blob)) {
            throw new TypeError('The image must be a Blob.');
        }

        if (
            [x, y].some((value) => value !== null && !Number.isFinite(value)) ||
            zoom !== null && (!Number.isFinite(zoom) || zoom <= 0)
        ) {
            throw new RangeError('Image offsets must be finite and zoom must be positive.');
        }

        this.#cancelLoad?.();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            const image = new Image();

            let url;
            let orientation;

            const cleanup = () => {
                reader.onload = null;
                reader.onerror = null;
                reader.onabort = null;
                image.onload = null;
                image.onerror = null;

                if (url) {
                    URL.revokeObjectURL(url);
                }

                this.#cancelLoad = null;
            };

            const fail = (error) => {
                cleanup();

                if (reader.readyState === FileReader.LOADING) {
                    reader.abort();
                }

                $.removeAttribute(image, 'src');
                reject(error);
            };

            this.#cancelLoad = () => fail(new DOMException('Image loading was aborted.', 'AbortError'));

            reader.onerror = () => fail(reader.error || new Error('Could not read the image.'));
            reader.onabort = this.#cancelLoad;
            image.onerror = () => fail(new Error('Could not decode the image.'));

            image.onload = () => {
                const width = $.getProperty(image, 'naturalWidth');
                const height = $.getProperty(image, 'naturalHeight');

                if (!width || !height) {
                    fail(new Error('Image dimensions must be positive.'));
                    return;
                }

                // Commit only after decoding so failed replacements leave the old image intact.
                this.#img = image;
                this.#rotation = 0;
                this.#flipped = [2, 4, 5, 7].includes(orientation);

                this.#previewWidth = Math.min(
                    this.options.previewWidth,
                    this.options.maxPreviewWidth ?? Infinity,
                );
                this.#previewHeight = Math.min(
                    this.options.previewHeight,
                    this.options.maxPreviewHeight ?? Infinity,
                );

                this.#canvasWidth = width;
                this.#canvasHeight = height;
                this.#offsetX = x ?? this.#canvasWidth / 2;
                this.#offsetY = y ?? this.#canvasHeight / 2;

                const rotations = { 3: 180, 4: 180, 5: 270, 6: 90, 7: 90, 8: 270 };
                this.#updateRotation(rotations[orientation] ?? 0);

                this.#zoom = zoom ?? Math.min(
                    this.#previewWidth / this.#canvasWidth,
                    this.#previewHeight / this.#canvasHeight,
                );

                this.#clampZoom();
                this.#clampOffset();

                $.setStyle(this.#outerContainer, {
                    width: `${this.#previewWidth}px`,
                    height: `${this.#previewHeight}px`,
                });

                this.#updatePreviewCanvas();
                this.#updatePreview();

                // Keep the decoded image available for subsequent rotations.
                cleanup();
                resolve();
            };

            reader.onload = () => {
                try {
                    // Normalize metadata before browser decoding to avoid applying EXIF twice.
                    orientation = getOrientation(reader.result, true);

                    if (!this.options.exifOrientation) {
                        orientation = 1;
                    }

                    url = URL.createObjectURL(new Blob([reader.result], { type: file.type }));
                    $.setProperty(image, 'src', url);
                } catch (error) {
                    fail(error);
                }
            };

            try {
                reader.readAsArrayBuffer(file);
            } catch (error) {
                fail(error);
            }
        });
    }

    /**
     * Renders the current crop.
     * @param {ImageCropResultOptions} [options] The output options.
     * @returns {Promise<string|Blob|HTMLCanvasElement>} The encoded image or output canvas.
     */
    async result(options = {}) {
        this.#requireImage();

        const {
            type = 'base64',
            format = 'png',
            size = 'viewport',
            quality = 1,
            circle = false,
            background = null,
        } = options;

        if (!['base64', 'blob', 'canvas'].includes(type)) {
            throw new TypeError('Result type must be base64, blob, or canvas.');
        }

        if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
            throw new RangeError('Quality must be between zero and one.');
        }

        if (size !== 'viewport' && size !== 'original') {
            if (
                !$._isObject(size) ||
                size.width === undefined && size.height === undefined
            ) {
                throw new TypeError('Size must be viewport, original, or image dimensions.');
            }

            for (const value of [size.width, size.height]) {
                if (
                    value !== undefined &&
                    (!Number.isFinite(value) || value <= 0)
                ) {
                    throw new RangeError('Output dimensions must be positive finite numbers.');
                }
            }
        }

        const canvas = $.create('canvas');
        const context = canvas.getContext('2d');

        let width = this.#previewWidth;
        let height = this.#previewHeight;

        if (size === 'original') {
            width /= this.#zoom;
            height /= this.#zoom;
        } else if ($._isObject(size)) {
            const ratio = width / height;

            width = size.width ?? size.height * ratio;
            height = size.height ?? size.width / ratio;
        }

        const ratio = width / height;
        const maxWidth = this.options.maxWidth ?? Infinity;
        const maxHeight = this.options.maxHeight ?? Infinity;

        width = Math.min(width, maxWidth, maxHeight * ratio);
        height = Math.min(height, maxHeight, maxWidth / ratio);

        width = Math.max(1, Math.floor(width));
        height = Math.max(1, Math.floor(height));

        $.setAttribute(canvas, { width, height });

        if ($.getProperty(canvas, 'width') !== width || $.getProperty(canvas, 'height') !== height) {
            throw new RangeError('Output dimensions exceed the supported canvas size.');
        }

        const [x1, y1, x2, y2] = this.getBounds();

        context.drawImage(this.#canvas, x1, y1, x2 - x1, y2 - y1, 0, 0, width, height);

        if (circle || this.options.circle) {
            context.globalCompositeOperation = 'destination-in';
            context.beginPath();
            context.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
            context.closePath();
            context.fill();
        }

        if (background) {
            context.globalCompositeOperation = 'destination-over';
            context.fillStyle = background;
            context.fillRect(0, 0, width, height);
            context.fillStyle = '#000';
        }

        context.globalCompositeOperation = 'source-over';

        if (type === 'canvas') {
            return canvas;
        }

        if (type === 'base64') {
            return canvas.toDataURL(`image/${format}`, quality);
        }

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Could not encode the image.'));
                }
            }, `image/${format}`, quality);
        });
    }

    /**
     * Rotates the image (in degrees).
     * @param {number} [amount=90] The clockwise rotation in multiples of 90 degrees.
     */
    rotate(amount = 90) {
        this.#requireImage();

        if (!Number.isFinite(amount) || amount % 90 !== 0) {
            throw new RangeError('Rotation must be a finite multiple of 90 degrees.');
        }

        if (!this.options.rotate || amount === 0) {
            return;
        }

        this.#updateRotation(amount);
        this.#clampZoom();
        this.#clampOffset();
        this.#updatePreviewCanvas();
        this.#updatePreview();

        $.triggerEvent(this.node, 'update.ui.imagecrop');
    }

    /**
     * Sets the image bounds.
     * @param {number} x1 The first image x offset.
     * @param {number} y1 The first image y offset.
     * @param {number} x2 The second image x offset.
     * @param {number} y2 The second image y offset.
     */
    setBounds(x1, y1, x2, y2) {
        this.#requireImage();

        const width = x2 - x1;
        const height = y2 - y1;

        if (
            ![x1, y1, x2, y2, width, height].every(Number.isFinite) ||
            width <= 0 ||
            height <= 0
        ) {
            throw new RangeError('Bounds must be finite and have a positive width and height.');
        }

        if (this.options.resize) {
            this.#resizePreview(width * this.#zoom, height * this.#zoom);
        } else if (this.options.zoom) {
            this.#zoom = Math.max(
                this.#previewWidth / width,
                this.#previewHeight / height,
            );
        }

        this.#offsetX = this.#canvasWidth - (x1 + (width / 2));
        this.#offsetY = this.#canvasHeight - (y1 + (height / 2));

        this.#clampZoom();
        this.#clampOffset();
        this.#updatePreview();

        $.triggerEvent(this.node, 'update.ui.imagecrop');
    }

    /**
     * Sets the image zoom level.
     * @param {number} zoom The image zoom level.
     */
    setZoom(zoom) {
        this.#requireImage();

        if (!Number.isFinite(zoom) || zoom <= 0) {
            throw new RangeError('Zoom must be a positive finite number.');
        }

        if (!this.options.zoom || zoom === this.#zoom) {
            return;
        }

        this.#zoom = zoom;

        this.#clampZoom();
        this.#clampOffset();
        this.#updatePreview();

        $.triggerEvent(this.node, 'update.ui.imagecrop');
    }

    /**
     * Clamps the image offset.
     */
    #clampOffset() {
        if (!this.options.enforceBoundary) {
            return;
        }

        const minX = this.#previewWidth / this.#zoom / 2;
        const minY = this.#previewHeight / this.#zoom / 2;

        this.#offsetX = $._clamp(this.#offsetX, minX, this.#canvasWidth - minX);
        this.#offsetY = $._clamp(this.#offsetY, minY, this.#canvasHeight - minY);
    }

    /**
     * Clamps the image zoom level.
     */
    #clampZoom() {
        this.#zoom = $._clamp(this.#zoom, this.options.minZoom, this.options.maxZoom);

        if (!this.options.enforceBoundary) {
            return;
        }

        const minZoom = Math.max(
            this.#previewWidth / this.#canvasWidth,
            this.#previewHeight / this.#canvasHeight,
        );

        this.#zoom = Math.max(minZoom, this.#zoom);
    }

    /**
     * Attaches events for the ImageCrop.
     */
    #events() {
        let lastPos;
        let image;

        const downEvent = (event) => {
            if (event.button || !this.node || !this.#img || this.#cancelLoad) {
                return false;
            }

            image = this.#img;
            lastPos = getPosition(event);
        };

        const moveEvent = (event) => {
            if (!this.node || this.#img !== image || this.#cancelLoad) {
                return;
            }

            const newPos = getPosition(event);

            this.#offsetX += (newPos.x - lastPos.x) / this.#zoom;
            this.#offsetY += (newPos.y - lastPos.y) / this.#zoom;
            lastPos = newPos;

            this.#clampOffset();
            this.#updatePreview();

            $.triggerEvent(this.node, 'update.ui.imagecrop');
        };

        const dragEvent = $.mouseDragFactory(downEvent, moveEvent);

        $.addEvent(this.#container, 'mousedown.ui.imagecrop touchstart.ui.imagecrop', dragEvent);

        $.addEvent(this.#container, 'touchend.ui.imagecrop', (event) => {
            if (event.touches.length === 1) {
                // Resume panning from the remaining finger's position.
                lastPos = getPosition(event);
            }
        });

        if (this.options.resize) {
            let lastPos;
            let image;

            const downEvent = (event) => {
                if (event.button || !this.node || !this.#img || this.#cancelLoad) {
                    return false;
                }

                event.stopPropagation();

                image = this.#img;
                lastPos = getPosition(event);
            };

            const moveEvent = (event) => {
                if (!this.node || this.#img !== image || this.#cancelLoad) {
                    return;
                }

                const newPos = getPosition(event);
                const width = this.#previewWidth + newPos.x - lastPos.x;
                const height = this.#previewHeight + newPos.y - lastPos.y;

                lastPos = newPos;

                this.#resizePreview(width, height);
                this.#updatePreview();

                $.triggerEvent(this.node, 'update.ui.imagecrop');
            };

            const dragEvent = $.mouseDragFactory(downEvent, moveEvent);

            $.addEvent(this.#resize, 'mousedown.ui.imagecrop', dragEvent);
        }

        if (this.options.zoom) {
            let lastDist;
            let image;

            const downEvent = (event) => {
                if (!this.node || !this.#img || this.#cancelLoad) {
                    return false;
                }

                image = this.#img;
                lastDist = getTouchDistance(event);
            };

            const moveEvent = (event) => {
                if (!this.node || this.#img !== image || this.#cancelLoad) {
                    return;
                }

                const newDist = getTouchDistance(event);
                const diff = newDist - lastDist;

                lastDist = newDist;

                this.#zoom += diff / $._dist(0, 0, this.#previewWidth, this.#previewHeight);

                this.#clampZoom();
                this.#clampOffset();
                this.#updatePreview();

                $.triggerEvent(this.node, 'update.ui.imagecrop');
            };

            const dragEvent = $.mouseDragFactory(downEvent, moveEvent, null, { touches: 2 });

            $.addEvent(this.#container, 'touchstart.ui.imagecrop', dragEvent);

            $.addEvent(this.#container, 'wheel.ui.imagecrop', (event) => {
                if (!this.node || !this.#img || this.#cancelLoad) {
                    return;
                }

                event.preventDefault();

                if (event.deltaY > 0) {
                    this.#zoom -= this.options.zoomAmount;
                } else if (event.deltaY < 0) {
                    this.#zoom += this.options.zoomAmount;
                }

                this.#clampZoom();
                this.#clampOffset();
                this.#updatePreview();

                $.triggerEvent(this.node, 'update.ui.imagecrop');
            });
        }
    }

    /**
     * Renders the ImageCrop.
     */
    #render() {
        this.#outerContainer = $.create('div', {
            class: this.constructor.classes.outerContainer,
            style: {
                // Keep the physical origin fixed when resizing in RTL layouts.
                marginRight: 'auto',
            },
        });

        this.#container = $.create('div', {
            class: this.constructor.classes.container,
            style: {
                boxSizing: 'content-box',
            },
        });

        if (this.options.circle) {
            $.addClass(this.#container, this.constructor.classes.circle);
        }

        if (this.options.resize) {
            this.#resize = $.create('div', {
                class: this.constructor.classes.resize,
                style: {
                    width: '5px',
                    height: '5px',
                    left: '100%',
                    cursor: 'nwse-resize',
                    zIndex: 1,
                },
            });

            $.append(this.#outerContainer, this.#resize);
        }

        this.#canvas = $.create('canvas', {
            class: this.constructor.classes.preview,
            style: {
                transformOrigin: '0 0',
                left: 0,
            },
        });

        this.#context = this.#canvas.getContext('2d');

        $.append(this.#container, this.#canvas);
        $.append(this.#outerContainer, this.#container);
        $.append(this.node, this.#outerContainer);
    }

    /**
     * Requires a successfully loaded image for public image operations.
     */
    #requireImage() {
        if (!this.node) {
            throw new Error('ImageCrop has been disposed.');
        }

        if (!this.#img) {
            throw new Error('Load an image before using ImageCrop.');
        }
    }

    /**
     * Resizes the image preview.
     * @param {number} width The preview width.
     * @param {number} height The preview height.
     */
    #resizePreview(width, height) {
        width = Math.max(1, width);
        height = Math.max(1, height);

        if (this.options.maxPreviewWidth) {
            width = Math.min(width, this.options.maxPreviewWidth);
        }

        if (this.options.maxPreviewHeight) {
            height = Math.min(height, this.options.maxPreviewHeight);
        }

        if (this.options.enforceBoundary) {
            this.#previewWidth = Math.min(width, this.#canvasWidth * this.#zoom);
            this.#previewHeight = Math.min(height, this.#canvasHeight * this.#zoom);

            this.#clampOffset();
        } else {
            this.#offsetX -= (width - this.#previewWidth) / this.#zoom / 2;
            this.#offsetY -= (height - this.#previewHeight) / this.#zoom / 2;

            this.#previewWidth = width;
            this.#previewHeight = height;
        }

        $.setStyle(this.#outerContainer, {
            width: `${this.#previewWidth}px`,
            height: `${this.#previewHeight}px`,
        });
    }

    /**
     * Updates the preview.
     */
    #updatePreview() {
        const x = ((-this.#canvasWidth + this.#offsetX) * this.#zoom) + (this.#previewWidth / 2);
        const y = ((-this.#canvasHeight + this.#offsetY) * this.#zoom) + (this.#previewHeight / 2);

        $.setStyle(this.#canvas, {
            transform: `translate3d(${x}px, ${y}px, 0) scale(${this.#zoom})`,
        });
    }

    /**
     * Updates the preview canvas.
     */
    #updatePreviewCanvas() {
        $.setAttribute(this.#canvas, {
            width: this.#canvasWidth,
            height: this.#canvasHeight,
        });

        this.#context.clearRect(0, 0, this.#canvasWidth, this.#canvasHeight);

        this.#context.save();
        this.#context.translate(this.#canvasWidth / 2, this.#canvasHeight / 2);
        this.#context.rotate(this.#rotation * Math.PI / 180);

        if (this.#flipped) {
            this.#context.scale(-1, 1);
        }

        const width = $.getProperty(this.#img, 'width');
        const height = $.getProperty(this.#img, 'height');

        this.#context.drawImage(
            this.#img,
            -width / 2,
            -height / 2,
            width,
            height,
        );
        this.#context.restore();
    }

    /**
     * Adjusts the rotation by an amount.
     * @param {number} amount The amount.
     */
    #updateRotation(amount) {
        const turns = ((amount % 360) + 360) % 360 / 90;

        for (let turn = 0; turn < turns; turn++) {
            const offsetX = this.#offsetX;

            this.#offsetX = this.#canvasHeight - this.#offsetY;
            this.#offsetY = offsetX;
            [this.#canvasWidth, this.#canvasHeight] = [this.#canvasHeight, this.#canvasWidth];
        }

        this.#rotation = ((this.#rotation + amount) % 360 + 360) % 360;
    }
}
