/**
 * Get the EXIF orientation.
 * @param {ArrayBuffer} data The file data.
 * @returns {number} The EXIF orientation.
 */
export function getOrientation(data) {
    const view = new DataView(data);
    const getInt16 = (offset, littleEndian = false) => view.getUint16(offset, littleEndian);
    const getInt32 = (offset, littleEndian = false) => view.getUint32(offset, littleEndian);

    if (getInt16(0) != 0xffd8) {
        return -2;
    }

    let offset = 2;
    while (offset < view.byteLength) {
        if (getInt16(offset + 2) <= 8) {
            return -1;
        }

        const marker = getInt16(offset);
        offset += 2;

        if ((marker & 0xff00) != 0xff00) {
            break;
        }

        if (marker != 0xffe1) {
            offset += getInt16(offset);
            continue;
        }

        offset += 2;
        if (getInt32(offset) != 0x45786966) {
            return -1;
        }

        offset += 6;
        const little = getInt16(offset) == 0x4949;
        offset += getInt32(offset + 4, little);
        const tags = getInt16(offset, little) * 12;
        offset += 2;

        for (let i = 0; i < tags; i += 12) {
            if (getInt16(offset + i, little) == 0x0112) {
                return getInt16(offset + i + 8, little);
            }
        }
    }

    return -1;
};
