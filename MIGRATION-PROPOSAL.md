# ImageCrop 3.0 migration proposal

Propose releasing `@fr0st/ui-imagecrop` **3.0.0**, aligned with the local `../ui`, `../ui-authcodeinput`, and `../ui-sortable` repositories. Steps 1 and 2 are implemented: package/configuration updates, Vite outputs, the reference browser harness, and the UI 4 class/lifecycle migration. Step 3 is complete, with comprehensive image behavior coverage verified across Chromium, Firefox, and WebKit. Step 4 is complete: UI styling alignment, rewritten README, consolidated demos, and reference CI/publishing configuration. Final clean-install/release validation remains in step 5.

The main compatibility change is Frost UI 4's component model. The migrated ImageCrop uses the inherited `node` and `options` getters, static defaults/classes, private fields and methods, and typed JSDoc. The prototype directory has been removed; `src/index.js` now only registers and exports the class.

Step 2 adds 55 regression cases following the reference describe groups and class/QuerySet patterns. They cover initialization, option validation, disposal, superseded loads, failed replacements, public methods, update-listener disposal, resize geometry, malformed metadata, and EXIF orientation being applied once. Assertions use locators for DOM behavior and numeric/pixel checks for image behavior. Step 3 expands the suite to 153 cases, with dedicated EXIF and result suites following the reference pattern for complex behavior.

Step 3 covers all eight EXIF orientations in both TIFF byte orders, disabled orientation handling, malformed metadata and recovery, four-corner preview/export pixels, PNG/JPEG base64 and Blob decoding, output dimensions and quality, circular masking, backgrounds, and output limits. Mouse tests cover LTR/RTL panning, boundaries, wheel zoom, resize constraints, and disabled options. Synthetic touch events follow UI's test convention and exercise single-touch panning, pinch zoom, cancellation, and gestures interrupted by replacement or disposal. Load failures and explicit offsets, rotation round trips, bounds resizing, and update events also have regression coverage.

Step 3 validation: build and lint passed, and rebuilding left tracked bundles unchanged. All 153 cases pass in Chromium, Firefox, and WebKit: 459 checks, with no failures or skips. Chromium source coverage reports 99.67% lines, 99.49% statements, 97.98% branches, and 100% functions. The Codecov-ready LCOV report covers 390 of 392 executable lines (99.49%), exceeding the planned 95% target. Coverage includes `src/helpers.js`, `src/image-crop.js`, and `src/index.js`, with only the existing re-export-only browser entry exclusion.

Step 4 removes the obsolete `left-0` class, uses UI's `bg-primary` resize handle, and keeps the wrapper, canvas, and handle anchored to physical coordinates in RTL. No component CSS or Sass was added. The existing resize regression now checks the bottom-right handle position and image origin in both LTR and RTL, bringing the suite to 154 cases.

The rewritten README documents the complete API, peer dependencies, ESM import map (including core 4), UMD loading, async/error behavior, data attributes, geometry and export contracts, accessibility, and migration changes. `demo/index.html` follows the UI/AuthCodeInput navigation, cards, controls, theme selector, and shared assets. It includes file loading, all existing option/export examples, methods/events, keyboard-operable crop controls, and all eight EXIF samples. Unused legacy demo pages have been removed; `demo/index.html` is the sole demo entry point. Image controls wait for successful loading, errors are displayed, preview URLs are revoked when replaced, and download URLs are revoked after allowing the download to start.

CI, publishing, and Codecov configuration are copied directly from `../ui-authcodeinput`: Node/browser matrix, OIDC coverage upload, 95% project target, generated-bundle/package checks, and release-triggered provenance publishing. Action majors deliberately match the reference projects (`actions/checkout@v6`, `actions/setup-node@v6`, `codecov/codecov-action@v7`). Upstream release lists were checked ([checkout](https://github.com/actions/checkout/releases), [setup-node](https://github.com/actions/setup-node/releases), [Codecov](https://github.com/codecov/codecov-action/releases)); newer checkout/setup-node v7 releases exist and would be a separate coordinated update across the reference projects.

Step 4 validation: lint and build pass. Demo smoke checks pass in Chromium, Firefox, and WebKit using installed UI assets in place of CDN requests, covering initial loading, EXIF, options, methods, all output types, download completion and URL cleanup, failed file replacement, disposal/reinitialization, and mobile overflow. Desktop/mobile screenshots were inspected. Package validation passes (`npm pack --dry-run`, 15 intended files). All 154 component cases pass in Chromium, Firefox, and WebKit (462 checks, no failures or skips), including the RTL wrapper/handle correction. Hosted CI, CDN delivery, Codecov activation, and npm trusted-publisher configuration have not been exercised from this workspace. Repository links retain the current `elusivecodes/FrostUI-ImageCrop` identity; no remote, release, or publishing settings were changed.

Loading now rejects superseded/disposed requests with `AbortError`, rejects malformed or undecodable files without replacing the previous image, and releases temporary object URLs. Image operations before loading or after disposal throw/reject a descriptive error. Rotation requires finite quarter turns; bounds, zoom, and output dimensions are validated. EXIF normalization changes a newly read buffer, not the caller's Blob. Rectangular circular exports use a centered circle whose diameter fits the smaller output dimension.

## Dependency and package baseline

These versions come from the reference repositories inspected on 2026-09-27. Treat them as the alignment baseline and check npm's current stable releases before implementation, respecting the reference projects' three-day minimum release age. Registry verification was incomplete: local npm lookup failed with `EAI_AGAIN`, and most registry URLs were unavailable through the web tool. [Playwright's registry metadata](https://registry.npmjs.org/@playwright/test/latest) did confirm 1.63.0.

| Package | Reference range | Proposed role |
| --- | --- | --- |
| `@fr0st/ui` | `^4.0.0` | Peer and development dependency |
| `@fr0st/query` | `^5.0.0` | Peer and development dependency |
| `@fr0st/eslint-config` | `^5.0.3` | Development dependency |
| `eslint` | `^10.10.0` | Development dependency |
| `vite` | `^8.3.0` | Development dependency |
| `@playwright/test` | `^1.63.0` | Development dependency |
| `monocart-reporter` | `^2.13.1` | Development dependency |

- Add the add-on projects' `.npmrc`: `min-release-age=3`, excluding `@fr0st/eslint-config`, `@fr0st/core`, `@fr0st/query`, and `@fr0st/ui` from the age restriction.
- Match `.gitignore`: dependencies, `.tmp/`, `coverage/`, `playwright-report/`, and `test-results/`. Keep generated `dist/` files tracked.
- Bump from 2.0.6 to 3.0.0; update description, keywords, author, and package metadata to the reference style. Verify the intended `frost-js/ui-imagecrop` repository URL before replacing legacy links; the current remote still points to `elusivecodes/FrostUI-ImageCrop`.
- Add package-root ESM `exports`, `main`, and `module`, plus `./dist/*` and `./src/*` exports. Point `unpkg` and `jsdelivr` to the minified UMD build.
- Match `browserslist: ["baseline newly available"]`, Node engines `^20.19.0 || ^22.13.0 || >=24`, and public publishing configuration.
- Remove direct Rollup, node-resolve, and Terser development dependencies. Regenerate the lockfile and run **`npx sort-package-json`** after package changes.
- Do not add component, state, datetime, or color dependencies: the current functionality does not need them.

## Build and source structure

Use `../ui-sortable/vite.config.js` as the add-on build template, with UI's build conventions as the authority. Build ESM from `src/index.js` and UMD from renamed `src/browser.js`, using Vite's `rolldownOptions`, source maps, and `baseline-widely-available` target.

Generate these four bundles and their maps:

```text
dist/frost-ui-imagecrop.esm.js
dist/frost-ui-imagecrop.esm.min.js
dist/frost-ui-imagecrop.js
dist/frost-ui-imagecrop.min.js
```

Keep UI and fQuery external. UMD must extend the existing `UI` global and expose `UI.ImageCrop` without replacing other UI components. ESM keeps the default `ImageCrop` export. Preserve component registration as an import side effect; do not declare the package entirely side-effect-free.

Move all prototype-composed methods into `src/image-crop.js`, then remove `src/prototype/`. Put `static classes` and `static defaults` on the class. Convert component-owned state and internal methods to `#private` fields/methods, while using inherited `node` and `options` getters. Keep independent image/EXIF helpers in `src/helpers.js` where useful. Keep `src/index.js` limited to registration and export, following AuthCodeInput.

Add JSDoc option, loading, bounds, and result types; precise Promise return types; and descriptions for public methods and private helpers. Match the reference ESLint configuration, including browser/node overrides and exclusions for generated output.

Preserve the public methods `load`, `result`, `getBounds`, `getZoom`, `setBounds`, `setZoom`, `rotate`, and `dispose`, the fQuery `imagecrop` plugin, and `update.ui.imagecrop`. Document the major-version changes to package resolution, peers, private internals, and invalid-input handling.

Proposed behavioral decisions:

- Support finite multiples of 90 degrees, including negative rotation; reject other angles instead of silently rounding them. General arbitrary-angle cropping would require a separate geometry change.
- Validate dimensions, bounds, and zoom before mutating state. Keep preview/output dimensions positive and finite.
- Give `load()` an explicit lifecycle: a new load supersedes an outstanding load, the superseded Promise rejects with an abort error, and stale callbacks cannot change the current image. Disposal also settles pending work and is repeatable.
- Ignore user gestures until an image is ready. Reject image-dependent programmatic operations with a documented error when there is no loaded image, rather than allowing NaN geometry.
- Preserve the last successful image if a replacement fails, committing new image state only after successful decoding.
- Preserve all eight EXIF orientations and `exifOrientation: false`, using one deliberate orientation strategy across browsers. Verify browser decoding before deciding whether metadata must be normalized to avoid double orientation.
- Explicitly support base64, Blob, and canvas results. Preserve output sizing, quality, clipping, background, and maximum-size behavior; document MIME fallback and encoding failure behavior.

## Styling

ImageCrop currently has no CSS or Sass source. Keep it dependent on Frost UI's utilities unless implementation reveals a real need for component-specific styles.

Audit rendered classes against UI 4. Replace the obsolete `left-0` utility appropriately, but preserve the physical origin used by canvas coordinates; blindly switching to a logical start position can break RTL geometry. Replace the hard-coded black resize handle with a UI color utility/token. Match UI 4 controls, spacing, surfaces, and focus styles in the demos.

No light/dark test matrix is needed for inherited UI styling. Add such tests only if ImageCrop gains its own theme-dependent rules. Check crop positioning in RTL where it affects image geometry.

## Playwright and coverage

Follow the reference layout: `playwright.config.js`, `playwright.coverage.config.js`, `test/package.json` with the `#test` alias, and `test/support/{test.js,app/index.html,server/static-server.js}`. Serve built assets and installed dependencies locally, with no CDN requests in tests. Use Chromium, Firefox, and WebKit; use Chromium for V8 coverage collected by Monocart and mapped back to `src/`.

Use the reference grouping and order, rather than organizing tests around internal helper functions:

```text
ImageCrop
  #init
  #dispose
  #load
  #getBounds
  #getZoom
  #result
  #rotate
  #setBounds
  #setZoom
  events
  user events
  <individual option> option
```

Within applicable method groups, parameterize class and QuerySet calls as in AuthCodeInput/Sortable. Follow UI's separate QuerySet grouping only where it improves coverage without duplicating those cases. Give complex EXIF and result scenarios dedicated files with focused top-level describes, analogous to the reference form/connected-container suites.

- Use `toHaveCount`, `toHaveClass`, `toHaveAttribute`, `toHaveCSS`, `toBeVisible`, and other locator assertions for DOM behavior. Do not turn DOM properties into object snapshots for `.toEqual()`.
- Use scalar assertions and `toBeCloseTo` for returned crop coordinates, zoom, dimensions, and pixels. Use `expect.poll` for asynchronous non-DOM state where appropriate.
- Test initialization, default/data/explicit options, instance reuse, disposal/reinitialization, and QuerySet integration.
- Exercise actual dragging, wheel zoom, resizing, and touch/pinch behavior, including interruption and disabled options.
- Test successful and failed loading, repeated and overlapping loads, disposal during loading/dragging, and reentrant disposal from update listeners.
- Use deterministic local image fixtures with distinct colored regions. Verify actual exported pixels, dimensions, alpha, MIME type, and Blob decoding, not merely nonempty output or data-URL prefixes. Use tolerances for lossy JPEG pixels.
- Cover all EXIF orientations, mirrored-to-normal reloads, malformed/truncated metadata, rotation and bounds interactions, circle clipping, background fill, and original/custom output sizing.

Match `.github/codecov.yml`: project target 95%, threshold 5%, and informational patch coverage. Track all relevant source files, with the same explained exclusion for the re-export-only browser entry. Coverage should come from useful behavior tests, not assertions against private fields.

## CI and publishing configuration

Adapt the reference CI workflow: Chromium on Node 20/22/24, Firefox and WebKit on Node 24. Each job installs with `npm ci`, installs its browser, lints, builds, and runs tests. The Node 24 Chromium job runs coverage and uploads `coverage/lcov.info` using Codecov OIDC. Check tracked bundles with `git diff --exit-code -- dist` and package contents with `npm pack --dry-run`.

Use the reference script names: `build`, `lint`, `test`, `test:browser`, `test:coverage`, `test:headed`, and `test:ui`. Match current compatible action versions when implementing.

For full repository alignment, also add the reference release-triggered publish workflow with validation and `npm publish --provenance`. This proposal does not publish a package or create a release. Codecov repository setup and npm trusted publishing must match the eventual repository identity.

## README and demos

Rewrite README around the reference structure: badges, highlights, installation for bundlers/browser ESM/browser UMD, usage, options, methods, fQuery integration, events, styling/accessibility, behavior notes, browser support, development, and license. Include the full import map needed by UI/fQuery/core, avoid duplicate fQuery loading with the UI bundle, and explain async loading and export contracts.

Replace the collection of isolated examples with a cohesive `demo/index.html` and shared demo assets following UI/AuthCodeInput's navigation, cards, controls, and example sections. Preserve coverage of all existing examples: default/file input, boundary controls, circle, resize, rotation, methods/events, EXIF 1–8, and every result type/size/background. Remove the unused legacy entry points after consolidating their examples.

Use current npm CDN paths for the demo and local ImageCrop bundles. Await loading, expose failures, disable image-dependent controls until ready, explicitly query DOM nodes, and release generated object URLs. Use the correct UI 4 label rather than copying the stale UI v3 badge in Sortable's demo.

## Bugs and other issues encountered

These findings originated in the initial source review and isolated reproductions. Step 2 regression tests now cover the component/lifecycle defects; the evidence below retains the original file paths for context.

Fixed in step 2: UI 4 field access, truncated EXIF failures and unresolved loads, stale mirroring, arbitrary-angle rotation, negative resize dimensions, loading/disposal races, pre-load operations, post-rotation offset clamping, EXIF double orientation, and numeric output dimensions. Additional review found that resizing without boundary enforcement shifted the image horizontally; the resize regression now checks that the canvas position stays fixed. Circular output is bounded by both dimensions, and failed Blob encoding rejects instead of resolving with `null`.

No new production defects were found in step 3. Step 4 found and fixed the RTL resize-handle placement: logical `start-100` moved the handle to the left even though resize geometry still used the physical right edge. The RTL wrapper also aligned to the right, putting a physical right-hand handle off-screen and shifting the image origin as its width changed. A physical auto right margin now anchors the wrapper to the left. The expanded regression checks both handle position and image origin. The rewritten demos also resolve the previously identified method-selector/global-variable and Blob URL cleanup defects, and correct the old EXIF 6/8 rotation labels. No bundle tests or custom server/port conventions were introduced. External Codecov/npm configuration and the final clean-install checks remain outstanding.

| Finding | Evidence | Proposed treatment |
| --- | --- | --- |
| UI 4 construction incompatibility | `src/prototype/render.js` accesses `_options.circle`; UI 4 BaseComponent only exposes `options`/`node`. | Migrate all inherited field access. |
| EXIF parsing throws on short input | Directly reproduced `RangeError` for empty, one-byte, and truncated JPEG buffers in `src/helpers.js`. | Bounds-check JPEG/TIFF offsets and reject malformed input cleanly. |
| Parser errors can leave loading unresolved | `src/prototype/load.js` calls the parser inside a FileReader event callback without catching exceptions and rejecting the outer Promise. | Settle every success/error/abort path; add a browser regression test. |
| Mirroring persists between images | `load.js` sets `_flipped = true` for mirrored orientations but never resets it on subsequent loads. | Reset orientation state for every successfully loaded image. |
| Arbitrary rotation is silently changed | Isolated helper execution reproduced `rotate(45)` becoming 90 degrees with swapped dimensions. | Validate quarter-turn inputs and document the contract. |
| Invalid resize geometry is accepted | Isolated helper execution retained preview dimensions of -10 by -20; drag resizing has no positive lower bound. | Validate/clamp dimensions and test crossing the minimum size. |
| Unsafe asynchronous lifecycle | One shared FileReader/Image has handlers replaced by every load; `dispose()` neither aborts the reader nor detaches image callbacks. | Fixed with per-load resources and cancellation; covered by step 2 load/disposal regressions. |
| Gestures and methods can run before loading | Events are attached in the constructor before image dimensions, offsets, and zoom exist. | Gate interactions and define not-ready method behavior. |
| Rotation does not reclamp offsets | `rotate()` clamps zoom but omits the offset clamp used by other geometry changes. | Test non-square previews near image edges, then clamp if needed. |
| Possible double/wrong EXIF orientation | The original loader manually rotates an ordinary browser-decoded image. | Step 2 normalizes the metadata before decoding and tests orientations 2 and 6, including disabled orientation handling. Step 3 verifies all eight orientations, both TIFF byte orders, and disabled orientation handling with four-color pixel assertions. |
| RTL resize handle uses the wrong edge | `start-100` positions the handle on the physical left in RTL, while resize movement uses physical x/y coordinates. | Fixed in step 4 with physical `left: 100%`, an auto right margin anchoring the wrapper to the left, and LTR/RTL geometry assertions. |
| Methods demo references the wrong control | `demo/methods.html:42` declares `cropSetZooms` from `#cropDispose`, then uses undeclared `cropSetZoom`; `output` also relies on named window properties. | Fixed in step 4: shared demo code uses explicit selectors and correctly wired method controls. |
| Download URL is never released | `demo/result-blob.html` calls `URL.createObjectURL` without `URL.revokeObjectURL`. | Fixed in step 4: separate download URLs are revoked after a delay; preview URLs are revoked on replacement/page exit. |
| Export edge cases need an explicit contract | Canvas width/height attributes include `px`; circle radius uses width alone for rectangular output; unknown result types silently produce a canvas. | Use numeric canvas dimensions, specify rectangular circle behavior, and validate/document result options with pixel tests. |
| Styling and metadata have drifted | `left-0`, a black resize handle, legacy GitHub CDN paths, missing peer dependencies, and a source-only package entry. | Resolved in steps 1, 2, and 4; repository identity remains tied to the actual Git remote. |

## Implementation order and acceptance

1. Update package/configuration and Vite outputs; establish the local browser harness.
2. Migrate the class and lifecycle to UI 4, adding regression coverage for the identified defects.
3. **Complete:** image geometry, EXIF, interaction, and export coverage across browsers (153 cases; 459 passing browser checks).
4. **Complete:** UI styling, README, demos, CI, and publishing configuration; tracked bundles regenerated. Lint, build, 462 browser checks, demo smoke checks in all three browsers, and package-content validation pass.
5. Run `npx sort-package-json`, clean-install validation, lint, build, all three browser suites, Chromium coverage, and package-content validation. Verify a second build leaves `dist/` unchanged.

Completion means a reproducibly built 3.0.0 package, documented behavior changes, working demos for every existing feature, tests meeting the assertion/grouping requirements, source-mapped Codecov output, and no unresolved UI 4/fQuery 5 compatibility failures. Remaining browser or service-configuration limitations should be recorded explicitly rather than represented as passing checks.
