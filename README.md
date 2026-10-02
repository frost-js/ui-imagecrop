# Frost UI ImageCrop

[![CI](https://github.com/elusivecodes/FrostUI-ImageCrop/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/elusivecodes/FrostUI-ImageCrop/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/elusivecodes/FrostUI-ImageCrop/branch/main/graph/badge.svg)](https://codecov.io/gh/elusivecodes/FrostUI-ImageCrop)
[![npm version](https://img.shields.io/npm/v/%40fr0st%2Fui-imagecrop?style=flat-square)](https://www.npmjs.com/package/@fr0st/ui-imagecrop)
[![npm downloads](https://img.shields.io/npm/dm/%40fr0st%2Fui-imagecrop?style=flat-square)](https://www.npmjs.com/package/@fr0st/ui-imagecrop)
[![JS gzip size](https://img.badgesize.io/elusivecodes/FrostUI-ImageCrop/main/dist/frost-ui-imagecrop.min.js?compression=gzip&label=JS%20gzip%20size&style=flat-square)](https://github.com/elusivecodes/FrostUI-ImageCrop/blob/main/dist/frost-ui-imagecrop.min.js)
[![license](https://img.shields.io/github/license/elusivecodes/FrostUI-ImageCrop?style=flat-square)](./LICENSE)

Image cropping for Frost UI with panning, zoom, quarter-turn rotation, resizing, EXIF orientation, and canvas or encoded image output.

## Highlights

- Mouse and single-touch panning, wheel and pinch zoom
- Optional image boundaries, circular masks, and resizable viewports
- All eight JPEG EXIF orientations, including reflections
- PNG/JPEG output as a data URL, Blob, or canvas
- Original, viewport, and custom output dimensions with size limits
- Async loading with cancellation and recovery from failed replacements
- Frost UI v4 utilities with no component stylesheet or Sass
- Native `ImageCrop` class and `imagecrop` fQuery plugin
- Existing-instance reuse with frozen resolved options
- Prebuilt ESM and UMD bundles with source maps
- No component-specific CSS or Sass
- JSDoc-powered IntelliSense

Explore [the demo](./demo/index.html) for interactive examples.

## Installation

### Browser projects / bundlers

```bash
npm i @fr0st/ui-imagecrop
```

Frost UI ImageCrop's package entry point is ESM-only and requires a browser DOM. Import the default `ImageCrop` export and the stylesheets in browser projects and bundlers.

```js
import '@fr0st/ui/dist/frost-ui.min.css';
import ImageCrop from '@fr0st/ui-imagecrop';
```

`@fr0st/ui` and `@fr0st/query` are peer dependencies so the component shares the application's instances.

### Browser (ESM)

The ESM bundle imports `@fr0st/ui` and `@fr0st/query`. fQuery also imports `@fr0st/core`, so map all three dependencies when loading the bundle directly in a browser:

```html
<link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/@fr0st/ui@latest/dist/frost-ui.min.css">
<script type="importmap">
{
    "imports": {
        "@fr0st/core": "https://cdn.jsdelivr.net/npm/@fr0st/core@latest/dist/frost-core.esm.min.js",
        "@fr0st/query": "https://cdn.jsdelivr.net/npm/@fr0st/query@latest/dist/fquery.esm.min.js",
        "@fr0st/ui": "https://cdn.jsdelivr.net/npm/@fr0st/ui@latest/dist/frost-ui.esm.min.js"
    }
}
</script>
<script type="module">
    import ImageCrop from 'https://cdn.jsdelivr.net/npm/@fr0st/ui-imagecrop@latest/dist/frost-ui-imagecrop.esm.min.js';
</script>
```

### Browser (UMD)

Load the bundles from your own copy or a CDN:

```html
<link
    rel="stylesheet"
    href="/path/to/dist/frost-ui.min.css">
<script src="/path/to/dist/frost-ui-bundle.min.js"></script>
<script src="/path/to/dist/frost-ui-imagecrop.min.js"></script>
<!-- or -->
<link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/@fr0st/ui@latest/dist/frost-ui.min.css">
<script src="https://cdn.jsdelivr.net/npm/@fr0st/ui@latest/dist/frost-ui-bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@fr0st/ui-imagecrop@latest/dist/frost-ui-imagecrop.min.js"></script>
<script>
    const { ImageCrop } = globalThis.UI;
</script>
```

The UMD bundle adds `ImageCrop` to the existing `globalThis.UI` object. Load Frost UI's all-in-one bundle first; it supplies the `UI` and `fQuery` globals.

The package root resolves to the prebuilt ESM bundle. Published files under `dist/` and `src/` are also available through matching package subpaths.

## Usage

```html
<label for="image-file">Choose an image</label>
<input id="image-file" type="file" accept="image/*">
<div id="crop" class="my-4"></div>
<button id="render" type="button" disabled>Render crop</button>
<p id="status" role="status"></p>
<img id="result" alt="Cropped preview" hidden>
```

```js
import ImageCrop from '@fr0st/ui-imagecrop';

const crop = ImageCrop.init(document.querySelector('#crop'));
const input = document.querySelector('#image-file');
const render = document.querySelector('#render');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
let ready = false;

input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;

    input.disabled = true;
    render.disabled = true;
    status.textContent = 'Loading image…';
    try {
        await crop.load(file);
        ready = true;
        status.textContent = 'Drag to pan, or scroll to zoom.';
    } catch (error) {
        status.textContent = error.message;
    } finally {
        input.disabled = false;
        render.disabled = !ready;
    }
});

render.addEventListener('click', async () => {
    try {
        result.src = await crop.result();
        result.hidden = false;
    } catch (error) {
        status.textContent = error.message;
    }
});
```

Always await `load()` before using image methods. Existing host content is preserved.

See [the demo](./demo/index.html) for file selection, option controls, methods/events, and all output formats. Open `demo/index.html` in your browser; the demo loads UI from npm's CDN and ImageCrop from the local `dist/` directory.

## Options

Options are resolved in this order:

1. Component defaults
2. The element's `data-ui-*` attributes
3. Options passed to `ImageCrop.init()`

Resolved `instance.options` are shallow-frozen.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `circle` | `boolean` | `false` | Round the preview and apply a circular export mask. |
| `enforceBoundary` | `boolean` | `true` | Keep the viewport covered by the image. |
| `exifOrientation` | `boolean` | `true` | Apply JPEG EXIF orientation. |
| `maxHeight` | `number \| null` | `null` | Limit exported height while preserving aspect ratio. |
| `maxPreviewHeight` | `number \| null` | `null` | Limit the initial and resized viewport height. |
| `maxPreviewWidth` | `number \| null` | `null` | Limit the initial and resized viewport width. |
| `maxWidth` | `number \| null` | `null` | Limit exported width while preserving aspect ratio. |
| `maxZoom` | `number` | `10` | Maximum scale, unless covering the viewport requires more. |
| `minZoom` | `number` | `0.1` | Minimum scale. Boundary enforcement can require a larger value. |
| `previewHeight` | `number` | `300` | Initial viewport height in CSS pixels. |
| `previewWidth` | `number` | `300` | Initial viewport width in CSS pixels. |
| `resize` | `boolean` | `false` | Show a mouse-operated viewport resize handle. |
| `rotate` | `boolean` | `true` | Enable programmatic rotation. |
| `zoom` | `boolean` | `true` | Enable `setZoom()`, wheel/pinch zoom, and zoom adjustments through `setBounds()`. |
| `zoomAmount` | `number` | `0.1` | Scale increment for wheel zoom. |

Dimensions and zoom settings must be finite and positive; optional limits also accept `null`. `minZoom` must not exceed `maxZoom`. Loading a new image restores the configured initial viewport dimensions.

With `zoom: false`, panning remains available, including when returning to one finger after a two-finger gesture. Loading still sets the initial scale, and boundary enforcement can adjust it when loading or rotating.

## Data attributes

Use kebab-case `data-ui-*` attributes for serializable options. Arrays and objects use JSON. Supply callbacks and DOM nodes through JavaScript.

```html
<div id="avatar-crop" data-ui-circle="true" data-ui-preview-width="240" data-ui-preview-height="240"></div>
```

```js
import ImageCrop from '@fr0st/ui-imagecrop';

const avatar = ImageCrop.init(document.querySelector('#avatar-crop'), {
    maxWidth: 512,
    maxHeight: 512,
});
```

Data attributes configure options; they do not initialize ImageCrop by themselves. Initialize the component through the class or fQuery plugin. Changing an option's data attribute after initialization does not reconfigure the existing instance.

## Methods

| Method | Returns | Description |
| --- | --- | --- |
| `ImageCrop.init(node, options?)` | `ImageCrop` | Return the existing instance for an element or create one. |
| `dispose()` | `void` | Cancel loading, remove generated markup and registered state. Repeatable. |
| `getBounds()` | `[number, number, number, number]` | Left, top, right, and bottom crop coordinates in the oriented/rotated image. |
| `getZoom()` | `number` | Current scale: `1` means one source pixel per preview pixel. |
| `load(file, options?)` | `Promise<void>` | Load a `Blob` or `File` and render the preview. |
| `result(options?)` | `Promise<string \| Blob \| HTMLCanvasElement>` | Render the selected region. |
| `rotate(amount = 90)` | `void` | Rotate clockwise by a finite multiple of 90; negative values rotate counterclockwise. |
| `setBounds(x1, y1, x2, y2)` | `void` | Center the requested region, resizing the viewport or adjusting zoom when enabled. |
| `setZoom(zoom)` | `void` | Set and clamp the scale to the configured limits. |

`load()` accepts `{ x, y, zoom }`. Omitted offsets center the image; omitted zoom fits the oriented image into the viewport and then enforces the configured boundaries and limits. Explicit zoom must be finite and positive; offsets must be finite. These values also accept `null` for automatic sizing or centering. `x` and `y` retain the legacy offset convention: distances from the right and bottom of the unrotated source to the crop center, before EXIF rotation. Prefer `setBounds()` after loading for ordinary left/top crop coordinates.

Bounds must be finite with positive width and height. With `resize: true`, `setBounds()` changes viewport dimensions at the current scale. Otherwise, when zoom is enabled, it scales to cover the viewport. If both are disabled, it only centers the requested region. Boundaries and limits may change the resulting region; call `getBounds()` for the actual crop.

Image-dependent methods throw, or reject their Promise, before successful loading and after disposal.

## Results

| Result option | Default | Description |
| --- | --- | --- |
| `type` | `'base64'` | `'base64'` (a data URL), `'blob'`, or `'canvas'`. |
| `format` | `'png'` | MIME subtype, such as `'png'` or `'jpeg'`; used for encoded output. |
| `size` | `'viewport'` | `'viewport'`, `'original'`, or `{ width, height }`. Supply one dimension to preserve the viewport's aspect ratio. |
| `quality` | `1` | Finite number from 0 to 1, used by lossy encoders such as JPEG. |
| `circle` | `false` | Apply a circular mask, in addition to the component's `circle` option. |
| `background` | `null` | Canvas color to fill behind the cropped image, including masked or out-of-image areas. |

```js
const dataUrl = await crop.result();
const jpeg = await crop.result({ type: 'blob', format: 'jpeg', quality: .85, background: '#fff' });
const canvas = await crop.result({ type: 'canvas', size: 'original' });
const avatar = await crop.result({ type: 'blob', circle: true, size: { width: 256, height: 256 } });
```

`original` uses source-pixel dimensions for the current crop, not the entire original file. Explicit width and height must be finite and positive; supplying both can stretch the result. Output dimensions are floored to whole pixels with a minimum of one pixel, after applying the component's `maxWidth`/`maxHeight` limits. If the canvas cannot preserve those final dimensions, `result()` rejects with a `RangeError`, including for `type: 'canvas'`.

A rectangular circular result uses a centered circle fitting the smaller dimension. PNG and canvas preserve transparency; provide a background for predictable JPEG output. Unsupported MIME subtypes use the browser's PNG fallback. Unsupported result types or invalid options reject; Blob encoding also rejects if the browser returns `null`.

Use `URL.createObjectURL(blob)` for Blob previews or downloads. Revoke preview URLs when replacing/removing the preview; allow a download to begin before revoking its URL. Encoded results contain rendered pixels, not the original file's EXIF metadata.

## Lifecycle

Calling `ImageCrop.init()` again for the same element returns its existing instance. Dispose the current instance before reinitializing with different options.

An instance exposes its original element as `instance.node` and its shallow-frozen resolved configuration as `instance.options`. Both become `null` after disposal.

`dispose()` releases resources owned by the component and removes its registered instance. Repeated disposal is safe and does not affect a new instance initialized on the same element. Use a new instance before calling other methods after disposal.

## Events

| Event | Description |
| --- | --- |
| `update.ui.imagecrop` | A pan, resize, wheel/pinch gesture, or programmatic geometry change updated the preview. |

```js
import $ from '@fr0st/query';

$.addEvent('#crop', 'update.ui.imagecrop', () => {
    console.log(crop.getBounds(), crop.getZoom());
});
```

The event originates on the host. Loading and rendering a result do not emit it. Disabled operations, `rotate(0)`, and `setZoom()` with the current value do not emit it. Clamping a requested change can still emit an update even if the effective geometry stays the same. Disposal from an update listener is supported.

## fQuery API

Importing ImageCrop registers `imagecrop` on `fQuery.QuerySet`:

```js
import $ from '@fr0st/query';
import '@fr0st/ui-imagecrop';

const crop = $('#crop').imagecrop({ resize: true });
await $('#crop').imagecrop('load', file);
$('#crop').imagecrop('rotate', 90);
$('#crop').imagecrop('setZoom', 1);
const bounds = $('#crop').imagecrop('getBounds');
const blob = await $('#crop').imagecrop('result', { type: 'blob' });
$('#crop').imagecrop('dispose');
```

Pass an options object to initialize every matched element, or pass a public method name followed by its arguments. The first component or method result is returned.

## Accessibility

The viewport supports pointer interaction but does not provide built-in keyboard controls or canvas descriptions. Applications should supply labeled file inputs, status messages, and keyboard-operable buttons or numeric inputs using `setBounds()`, `setZoom()`, and `rotate()`. The demo includes these alternatives. Do not treat the resize handle as an accessible form control.

## Loading and orientation

A new load cancels an outstanding load with `AbortError`. Disposal also rejects pending work with `AbortError`, and stale callbacks cannot replace the current image. Failed reads, malformed EXIF, and failed decoding preserve the last successfully loaded image. Gestures are ignored while a replacement is loading.

EXIF metadata is normalized in a newly read buffer before browser decoding, then the component applies the requested orientation once. The supplied Blob is never changed. `exifOrientation: false` displays the raw source orientation even when the browser normally applies EXIF. Loading another image resets reflection and rotation state.

## Themes and RTL

Frost UI follows the user's preferred color scheme by default. Set `data-ui-theme="light"` or `data-ui-theme="dark"` on the document or an ancestor to select a theme explicitly.

ImageCrop uses Frost UI's border, position, color, and rounding utilities. There is no component stylesheet or Sass.

The viewport wrapper and canvas stay anchored to the physical left/top, and the resize handle stays at the physical bottom-right in RTL layouts. Bounds do not reverse with text direction.

## Browser support

Tested with Chromium, Firefox, and WebKit through Playwright. Builds use Vite's `baseline-widely-available` target; the component also relies on the browser APIs required by Frost UI 4, FileReader, Blob/object URLs, and canvas image decoding/encoding.

## Development

Install dependencies with `npm ci`, then install Playwright browsers with `npx playwright install --with-deps`.

```bash
npm test
npm run lint
npm run build
```

`npm test` rebuilds the bundles, then runs the Playwright suite in Chromium, Firefox, and WebKit. `npm run test:browser` runs the suite against the existing bundles, so rebuild after changing source files.

After building, `npm run test:coverage` runs Chromium tests and writes coverage reports to `coverage/`.

`npm run test:headed` and `npm run test:ui` also use the existing bundles and open headed browsers or the Playwright UI.

To view the demo, open `demo/index.html` in your browser after building.

## License

Frost UI ImageCrop is released under the [MIT License](./LICENSE).
