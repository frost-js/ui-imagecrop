import $ from '@fr0st/query';
import { BaseComponent } from '@fr0st/ui';

/**
 * ImageCrop Class
 * @class
 */
export default class ImageCrop extends BaseComponent {
    /**
     * New ImageCrop constructor.
     * @param {HTMLElement} node The input node.
     * @param {object} [options] The options to create the ImageCrop with.
     */
    constructor(node, options) {
        super(node, options);

        this._render();
        this._events();

        this._img = new Image();
        this._reader = new FileReader();
    }

    /**
     * Dispose the ImageCrop.
     */
    dispose() {
        $.remove(this._outerContainer);

        this._outerContainer = null;
        this._container = null;
        this._resize = null;
        this._canvas = null;
        this._context = null;
        this._img = null;

        super.dispose();
    }

    /**
     * Get the image bounds.
     * @returns {Array} The image bounds.
     */
    getBounds() {
        const width = this._previewWidth / this._zoom;
        const height = this._previewHeight / this._zoom;
        const x = (this._canvasWidth - this._offsetX) - (width / 2);
        const y = (this._canvasHeight - this._offsetY) - (height / 2);

        return [x, y, x + width, y + height];
    }

    /**
     * Get the image zoom level.
     * @returns {number} The zoom level.
     */
    getZoom() {
        return this._zoom;
    }

    /**
     * Rotate the image (in degrees).
     * @param {number} [amount=90] The rotation amount (in degrees).
     */
    rotate(amount = 90) {
        if (!this._options.rotate || amount === 0) {
            return;
        }

        this._updateRotation(amount);
        this._clampZoom();
        this._updatePreviewCanvas();
        this._updatePreview();

        $.triggerEvent(this._node, 'update.ui.imagecrop');
    }

    /**
     * Set the image bounds.
     * @param {number} x1 The first image x offset.
     * @param {number} y1 The first image y offset.
     * @param {number} x2 The second image x offset.
     * @param {number} y2 The second image y offset.
     */
    setBounds(x1, y1, x2, y2) {
        const width = x2 - x1;
        const height = y2 - y1;

        if (this._options.resize) {
            this._resizePreview(width * this._zoom, height * this._zoom);
        } else if (this._options.zoom) {
            this._zoom = Math.max(this._previewWidth / width, this._previewHeight / height);
        }

        this._offsetX = this._canvasWidth - (x1 + (width / 2));
        this._offsetY = this._canvasHeight - (y1 + (height / 2));

        this._clampZoom();
        this._clampOffset();
        this._updatePreview();

        $.triggerEvent(this._node, 'update.ui.imagecrop');
    }

    /**
     * Set the image zoom level.
     * @param {number} zoom The image zoom level.
     */
    setZoom(zoom) {
        if (!this._options.zoom || zoom === this._zoom) {
            return;
        }

        this._zoom = zoom;

        this._clampZoom();
        this._clampOffset();
        this._updatePreview();

        $.triggerEvent(this._node, 'update.ui.imagecrop');
    }
}
