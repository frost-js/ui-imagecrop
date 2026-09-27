import { BaseComponent, getPosition, getTouchPositions, initComponent } from "@fr0st/ui";
import $ from "@fr0st/query";

//#region src/image-crop.js
/**
* ImageCrop Class
* @class
*/
var ImageCrop = class extends BaseComponent {
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
		const x = this._canvasWidth - this._offsetX - width / 2;
		const y = this._canvasHeight - this._offsetY - height / 2;
		return [
			x,
			y,
			x + width,
			y + height
		];
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
		if (!this._options.rotate || amount === 0) return;
		this._updateRotation(amount);
		this._clampZoom();
		this._updatePreviewCanvas();
		this._updatePreview();
		$.triggerEvent(this._node, "update.ui.imagecrop");
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
		if (this._options.resize) this._resizePreview(width * this._zoom, height * this._zoom);
		else if (this._options.zoom) this._zoom = Math.max(this._previewWidth / width, this._previewHeight / height);
		this._offsetX = this._canvasWidth - (x1 + width / 2);
		this._offsetY = this._canvasHeight - (y1 + height / 2);
		this._clampZoom();
		this._clampOffset();
		this._updatePreview();
		$.triggerEvent(this._node, "update.ui.imagecrop");
	}
	/**
	* Set the image zoom level.
	* @param {number} zoom The image zoom level.
	*/
	setZoom(zoom) {
		if (!this._options.zoom || zoom === this._zoom) return;
		this._zoom = zoom;
		this._clampZoom();
		this._clampOffset();
		this._updatePreview();
		$.triggerEvent(this._node, "update.ui.imagecrop");
	}
};

//#endregion
//#region src/prototype/events.js
/**
* Attach events for the ImageCrop.
*/
function _events() {
	let lastPos;
	const downEvent = (e) => {
		if (e.button) return false;
		lastPos = getPosition(e);
	};
	const moveEvent = (e) => {
		const newPos = getPosition(e);
		this._offsetX += (newPos.x - lastPos.x) / this._zoom;
		this._offsetY += (newPos.y - lastPos.y) / this._zoom;
		lastPos = newPos;
		this._clampOffset();
		this._updatePreview();
		$.triggerEvent(this._node, "update.ui.imagecrop");
	};
	const dragEvent = $.mouseDragFactory(downEvent, moveEvent);
	$.addEvent(this._container, "mousedown.ui.imagecrop touchstart.ui.imagecrop", dragEvent);
	if (this._options.resize) this._eventsResize();
	if (this._options.zoom) this._eventsZoom();
}
/**
* Attach resize events.
*/
function _eventsResize() {
	let lastPos;
	const downEvent = (e) => {
		e.stopPropagation();
		lastPos = getPosition(e);
	};
	const moveEvent = (e) => {
		const newPos = getPosition(e);
		this._previewWidth += newPos.x - lastPos.x;
		this._previewHeight += newPos.y - lastPos.y;
		lastPos = newPos;
		this._resizePreview(this._previewWidth, this._previewHeight);
		this._updatePreview();
		$.triggerEvent(this._node, "update.ui.imagecrop");
	};
	const dragEvent = $.mouseDragFactory(downEvent, moveEvent);
	$.addEvent(this._resize, "mousedown.ui.imagecrop", dragEvent);
}
/**
* Attach zoom events.
*/
function _eventsZoom() {
	let lastDist;
	const getTouchDistance = (e) => {
		const touches = getTouchPositions(e);
		return $._dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
	};
	const downEvent = (e) => {
		lastDist = getTouchDistance(e);
	};
	const moveEvent = (e) => {
		const newDist = getTouchDistance(e);
		const diff = newDist - lastDist;
		lastDist = newDist;
		this._zoom += diff / $._dist(0, 0, this._previewWidth, this._previewHeight);
		this._clampZoom();
		this._clampOffset();
		this._updatePreview();
		$.triggerEvent(this._node, "update.ui.imagecrop");
	};
	const dragEvent = $.mouseDragFactory(downEvent, moveEvent, null, { touches: 2 });
	$.addEvent(this._container, "touchstart.ui.imagecrop", dragEvent);
	$.addEvent(this._container, "wheel.ui.imagecrop", (e) => {
		e.preventDefault();
		if (e.deltaY > 0) this._zoom -= this._options.zoomAmount;
		else if (e.deltaY < 0) this._zoom += this._options.zoomAmount;
		this._clampZoom();
		this._clampOffset();
		this._updatePreview();
		$.triggerEvent(this._node, "update.ui.imagecrop");
	});
}

//#endregion
//#region src/prototype/helpers.js
/**
* Clamp the image offset.
*/
function _clampOffset() {
	if (!this._options.enforceBoundary) return;
	const minX = this._previewWidth / (this._canvasWidth * this._zoom) * this._canvasWidth / 2;
	const minY = this._previewHeight / (this._canvasHeight * this._zoom) * this._canvasHeight / 2;
	this._offsetX = $._clamp(this._offsetX, minX, this._canvasWidth - minX);
	this._offsetY = $._clamp(this._offsetY, minY, this._canvasHeight - minY);
}
/**
* Clamp the image zoom level.
*/
function _clampZoom() {
	this._zoom = $._clamp(this._zoom, this._options.minZoom, this._options.maxZoom);
	if (!this._options.enforceBoundary) return;
	const minZoom = Math.max(this._previewWidth / this._canvasWidth, this._previewHeight / this._canvasHeight);
	this._zoom = Math.max(minZoom, this._zoom);
}
/**
* Resize the image preview.
* @param {number} width The preview width.
* @param {number} height The preview height.
*/
function _resizePreview(width, height) {
	if (this._options.maxPreviewWidth) width = Math.min(width, this._options.maxPreviewWidth);
	if (this._options.maxPreviewHeight) height = Math.min(height, this._options.maxPreviewHeight);
	if (this._options.enforceBoundary) {
		this._previewWidth = Math.min(width, this._canvasWidth * this._zoom);
		this._previewHeight = Math.min(height, this._canvasHeight * this._zoom);
		this._clampOffset();
	} else {
		this._offsetX += (width - this._previewWidth) / this._zoom / 2;
		this._offsetY -= (height - this._previewHeight) / this._zoom / 2;
		this._previewWidth = width;
		this._previewHeight = height;
	}
	$.setStyle(this._outerContainer, {
		width: `${this._previewWidth}px`,
		height: `${this._previewHeight}px`
	});
}
/**
* Update the preview.
*/
function _updatePreview() {
	const x = (-this._canvasWidth + this._offsetX) * this._zoom + this._previewWidth / 2;
	const y = (-this._canvasHeight + this._offsetY) * this._zoom + this._previewHeight / 2;
	$.setStyle(this._canvas, { transform: `translate3d(${x}px, ${y}px, 0) scale(${this._zoom})` });
}
/**
* Update the preview canvas.
*/
function _updatePreviewCanvas() {
	$.setAttribute(this._canvas, {
		width: this._canvasWidth,
		height: this._canvasHeight
	});
	this._context.clearRect(0, 0, this._canvasWidth, this._canvasHeight);
	this._context.save();
	this._context.translate(this._canvasWidth / 2, this._canvasHeight / 2);
	this._context.rotate(this._rotation * Math.PI / 180);
	if (this._flipped) this._context.scale(-1, 1);
	this._context.drawImage(this._img, -this._img.width / 2, -this._img.height / 2, this._img.width, this._img.height);
	this._context.restore();
}
/**
* Adjust the rotation by an amount.
* @param {number} amount The amount.
*/
function _updateRotation(amount) {
	const rotation = (this._rotation + amount) % 360;
	if (rotation % 180 === 0) {
		this._canvasWidth = this._img.width;
		this._canvasHeight = this._img.height;
	} else {
		this._canvasWidth = this._img.height;
		this._canvasHeight = this._img.width;
	}
	const newRotation = rotation >= this._rotation ? rotation : rotation + 360;
	while (this._rotation < newRotation) {
		const offsetX = this._offsetX;
		const offsetY = this._offsetY;
		if (this._rotation % 180 === 0) this._offsetX = this._img.height - offsetY;
		else this._offsetX = this._img.width - offsetY;
		this._offsetY = offsetX;
		this._rotation += 90;
	}
	this._rotation %= 360;
}

//#endregion
//#region src/helpers.js
/**
* Get the EXIF orientation.
* @param {ArrayBuffer} data The file data.
* @returns {number} The EXIF orientation.
*/
function getOrientation(data) {
	const view = new DataView(data);
	const getInt16 = (offset, littleEndian = false) => view.getUint16(offset, littleEndian);
	const getInt32 = (offset, littleEndian = false) => view.getUint32(offset, littleEndian);
	if (getInt16(0) != 65496) return -2;
	let offset = 2;
	while (offset < view.byteLength) {
		if (getInt16(offset + 2) <= 8) return -1;
		const marker = getInt16(offset);
		offset += 2;
		if ((marker & 65280) != 65280) break;
		if (marker != 65505) {
			offset += getInt16(offset);
			continue;
		}
		offset += 2;
		if (getInt32(offset) != 1165519206) return -1;
		offset += 6;
		const little = getInt16(offset) == 18761;
		offset += getInt32(offset + 4, little);
		const tags = getInt16(offset, little) * 12;
		offset += 2;
		for (let i = 0; i < tags; i += 12) if (getInt16(offset + i, little) == 274) return getInt16(offset + i + 8, little);
	}
	return -1;
}

//#endregion
//#region src/prototype/load.js
/**
* Load a file.
* @param {Blob} file The file.
* @param {object} [options] Options for loading the file.
* @param {number} [options.x] The initial x offset.
* @param {number} [options.y] The initial y offset.
* @param {number} [options.zoom] The initial zoom.
* @returns {Promise} A promise that resolves when the image is loaded.
*/
function load(file, options = {}) {
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
				height: `${this._previewHeight}px`
			});
			this._canvasWidth = this._img.width;
			this._canvasHeight = this._img.height;
			if (this._offsetX === null) this._offsetX = this._canvasWidth / 2;
			if (this._offsetY === null) this._offsetY = this._canvasHeight / 2;
			if (this._zoom === null) this._zoom = Math.min(this._previewWidth / this._canvasWidth, this._previewHeight / this._canvasHeight);
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
				case 8: rotation = 90;
			}
			if (rotation) this._updateRotation(rotation);
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
		} else loadImg();
	});
}

//#endregion
//#region src/prototype/render.js
/**
* Render the ImageCrop.
*/
function _render() {
	this._outerContainer = $.create("div", { class: this.constructor.classes.outerContainer });
	this._container = $.create("div", {
		class: this.constructor.classes.container,
		style: { boxSizing: "content-box" }
	});
	if (this._options.circle) $.addClass(this._container, this.constructor.classes.circle);
	if (this._options.resize) {
		this._resize = $.create("div", {
			class: this.constructor.classes.resize,
			style: {
				width: "5px",
				height: "5px",
				backgroundColor: "black",
				cursor: "nwse-resize",
				zIndex: 1
			}
		});
		$.append(this._outerContainer, this._resize);
	}
	this._canvas = $.create("canvas", {
		class: this.constructor.classes.preview,
		style: { transformOrigin: "0 0" }
	});
	this._context = this._canvas.getContext("2d");
	$.append(this._container, this._canvas);
	$.append(this._outerContainer, this._container);
	$.append(this._node, this._outerContainer);
}

//#endregion
//#region src/prototype/result.js
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
function result(options = {}) {
	const { type = "base64", format = "png", size = "viewport", quality = 1, circle = false, background = null } = options;
	const canvas = $.create("canvas");
	const context = canvas.getContext("2d");
	let width = this._previewWidth;
	let height = this._previewHeight;
	if (size === "original") {
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
		height: `${height}px`
	});
	const [x1, y1, x2, y2] = this.getBounds();
	context.drawImage(this._canvas, x1, y1, x2 - x1, y2 - y1, 0, 0, width, height);
	if (circle || this._options.circle) {
		context.globalCompositeOperation = "destination-in";
		context.beginPath();
		context.arc(width / 2, height / 2, width / 2, 0, Math.PI * 2);
		context.closePath();
		context.fill();
	}
	if (background) {
		context.globalCompositeOperation = "destination-over";
		context.fillStyle = background;
		context.rect(0, 0, width, height);
		context.fill();
		context.fillStyle = "#000";
	}
	context.globalCompositeOperation = "source-over";
	return new Promise((resolve) => {
		switch (type) {
			case "base64":
				resolve(canvas.toDataURL(`image/${format}`, quality));
				break;
			case "blob":
				canvas.toBlob(resolve, `image/${format}`, quality);
				break;
			default: resolve(canvas);
		}
	});
}

//#endregion
//#region src/index.js
ImageCrop.defaults = {
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
	enforceBoundary: true
};
ImageCrop.classes = {
	circle: "rounded-circle",
	container: "position-relative w-100 h-100 overflow-hidden border",
	outerContainer: "position-relative",
	preview: "position-absolute top-0 left-0",
	resize: "position-absolute top-100 start-100"
};
var proto = ImageCrop.prototype;
proto.load = load;
proto.result = result;
proto._clampOffset = _clampOffset;
proto._clampZoom = _clampZoom;
proto._events = _events;
proto._eventsResize = _eventsResize;
proto._eventsZoom = _eventsZoom;
proto._render = _render;
proto._resizePreview = _resizePreview;
proto._updatePreview = _updatePreview;
proto._updatePreviewCanvas = _updatePreviewCanvas;
proto._updateRotation = _updateRotation;
initComponent("imagecrop", ImageCrop);
var src_default = ImageCrop;

//#endregion
export { src_default as default };
//# sourceMappingURL=frost-ui-imagecrop.esm.js.map