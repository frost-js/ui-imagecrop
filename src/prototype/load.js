import $ from '@fr0st/query';
import { getOrientation } from './../helpers.js';

/**
 * Load a file.
 * @param {Blob} file The file.
 * @param {object} [options] Options for loading the file.
 * @param {number} [options.x] The initial x offset.
 * @param {number} [options.y] The initial y offset.
 * @param {number} [options.zoom] The initial zoom.
 * @returns {Promise} A promise that resolves when the image is loaded.
 */
export function load(file, options = {}) {
    const { x = null, y = null, zoom = null } = options;

    this._rotation = 0;
    this._offsetX = x;
    this._offsetY = y;
    this._zoom = zoom;

    return new Promise((resolve, reject) => {
        this._reader.onerror = reject;
        this._img.onerror = reject;

        this._img.onload = (_) => {
            this._previewWidth = this._options.previewWidth;
            this._previewHeight = this._options.previewHeight;

            $.setStyle(this._outerContainer, {
                width: `${this._previewWidth}px`,
                height: `${this._previewHeight}px`,
            });

            this._canvasWidth = this._img.width;
            this._canvasHeight = this._img.height;

            if (this._offsetX === null) {
                this._offsetX = this._canvasWidth / 2;
            }

            if (this._offsetY === null) {
                this._offsetY = this._canvasHeight / 2;
            }

            if (this._zoom === null) {
                this._zoom = Math.min(this._previewWidth / this._canvasWidth, this._previewHeight / this._canvasHeight);
            }

            let rotation;
            switch (this._orientation) {
                case 2:
                    this._flipped = true;
                    break;
                case 3:
                    rotation = 180;
                    break;
                case 4:
                    this._flipped = true;
                    rotation = 180;
                    break;
                case 5:
                    this._flipped = true;
                    rotation = 270;
                    break;
                case 6:
                    rotation = 270;
                    break;
                case 7:
                    this._flipped = true;
                    rotation = 90;
                    break;
                case 8:
                    rotation = 90;
                    break;
            }

            if (rotation) {
                this._updateRotation(rotation);
            }

            this._clampZoom();
            this._clampOffset();
            this._updatePreviewCanvas();
            this._updatePreview();

            resolve();
        };

        const loadImg = (_) => {
            this._reader.onload = (_) => {
                this._img.src = this._reader.result;
            };

            this._reader.readAsDataURL(file);
        };

        if (this._options.exifOrientation) {
            this._reader.onload = (_) => {
                this._orientation = getOrientation(this._reader.result);

                loadImg();
            };

            this._reader.readAsArrayBuffer(file);
        } else {
            loadImg();
        }
    });
};
