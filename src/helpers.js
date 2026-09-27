/**
 * Reads JPEG EXIF orientation, optionally resetting its tag before decoding.
 * @param {ArrayBuffer} data The image data. Resetting changes this buffer only.
 * @param {boolean} [reset=false] Whether to replace the orientation tag with 1.
 * @returns {number} The orientation, or 1 when the image has no orientation tag.
 */
export function getOrientation(data, reset = false) {
    const view = new DataView(data);
    if (view.byteLength < 2) {
        throw new Error('Invalid image data.');
    }
    if (view.getUint16(0) !== 0xffd8) {
        return 1;
    }

    let offset = 2;
    while (offset < view.byteLength) {
        if (offset + 4 > view.byteLength) {
            throw new Error('Truncated JPEG metadata.');
        }
        const marker = view.getUint16(offset);
        if (marker === 0xffda || marker === 0xffd9) {
            break;
        }
        const length = view.getUint16(offset + 2);
        const end = offset + 2 + length;
        if ((marker & 0xff00) !== 0xff00 || length < 2 || end > view.byteLength) {
            throw new Error('Invalid JPEG metadata.');
        }

        const start = offset + 4;
        offset = end;
        if (marker !== 0xffe1 || length < 8 ||
            view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) {
            continue;
        }

        const tiff = start + 6;
        if (tiff + 8 > end) {
            throw new Error('Truncated EXIF metadata.');
        }
        const order = view.getUint16(tiff);
        const little = order === 0x4949;
        if ((order !== 0x4949 && order !== 0x4d4d) || view.getUint16(tiff + 2, little) !== 42) {
            throw new Error('Invalid EXIF byte order or header.');
        }
        const directoryOffset = view.getUint32(tiff + 4, little);
        const directory = tiff + directoryOffset;
        if (directoryOffset < 8 || directory + 2 > end) {
            throw new Error('Invalid EXIF directory offset.');
        }
        const count = view.getUint16(directory, little);
        if (directory + 2 + count * 12 > end) {
            throw new Error('Truncated EXIF directory.');
        }
        for (let tag = directory + 2; tag < directory + 2 + count * 12; tag += 12) {
            if (view.getUint16(tag, little) !== 0x0112) {
                continue;
            }
            if (view.getUint16(tag + 2, little) !== 3 || view.getUint32(tag + 4, little) !== 1) {
                throw new Error('Invalid EXIF orientation tag.');
            }
            const orientation = view.getUint16(tag + 8, little);
            if (orientation < 1 || orientation > 8) {
                throw new Error('Invalid EXIF orientation.');
            }
            if (reset) {
                view.setUint16(tag + 8, 1, little);
            }
            return orientation;
        }
    }

    return 1;
};
