import $ from '@fr0st/query';

/**
 * Get the rendered image.
 * @param {object} [options] Options for rendering the image.
 * @param {string} [options.type=base64] The type of image to render.
 * @param {string} [options.format=png] The image format to render.
 * @param {string|object} [options.size=viewport] The size to render the image.
 * @param {number} [options.quality=1] The image quality to render.
 * @param {boolean} [options.circle=false] Whether to render the image as a circle.
 * @param {string} [options.background] The background color to render the image with.
 * @returns {Promise} A promise that resolves with the rendered image.
 */
export function result(options = {}) {
    const { type = 'base64', format = 'png', size = 'viewport', quality = 1, circle = false, background = null } = options;

    const canvas = $.create('canvas');
    const context = canvas.getContext('2d');

    let width = this._previewWidth;
    let height = this._previewHeight;
    if (size === 'original') {
        width /= this._zoom;
        height /= this._zoom;
    } else if ($._isObject(size)) {
        if (size.width && size.height) {
            width = size.width;
            height = size.height;
        } else {
            const ratio = width / height;
            if (size.width) {
                width = size.width;
                height = width / ratio;
            } else if (size.height) {
                height = size.height;
                width = height * ratio;
            }
        }
    }

    const ratio = width / height;

    if (this._options.maxWidth) {
        width = Math.min(width, this._options.maxWidth);
        height = width / ratio;
    }

    if (this._options.maxHeight) {
        height = Math.min(height, this._options.maxHeight);
        width = height * ratio;
    }

    $.setAttribute(canvas, {
        width: `${width}px`,
        height: `${height}px`,
    });

    const [x1, y1, x2, y2] = this.getBounds();
    context.drawImage(this._canvas, x1, y1, x2 - x1, y2 - y1, 0, 0, width, height);

    if (circle || this._options.circle) {
        context.globalCompositeOperation = 'destination-in';
        context.beginPath();
        context.arc(width / 2, height / 2, width / 2, 0, Math.PI * 2);
        context.closePath();
        context.fill();
    }

    if (background) {
        context.globalCompositeOperation = 'destination-over';
        context.fillStyle = background;
        context.rect(0, 0, width, height);
        context.fill();
        context.fillStyle = '#000';
    }

    context.globalCompositeOperation = 'source-over';

    return new Promise((resolve) => {
        switch (type) {
            case 'base64': {
                const result = canvas.toDataURL(`image/${format}`, quality);
                resolve(result);
                break;
            }
            case 'blob':
                canvas.toBlob(resolve, `image/${format}`, quality);
                break;
            default:
                resolve(canvas);
                break;
        }
    });
};
