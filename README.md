# My Form Autofill

A local-only Chrome Manifest V3 extension for previewing and filling common form fields from saved profiles. The popup is built with Vue 3 and TypeScript; page detection and filling are framework-independent TypeScript.

## Install and try it

1. Install dependencies: `npm install`
2. Build the extension: `npm run build`
3. Open `chrome://extensions` (or `edge://extensions`).
4. Enable **Developer mode**.
5. Click **Load unpacked** and choose the generated `dist/` directory.
6. Start the fixture server with `npm run fixtures`, then open `http://127.0.0.1:4173`.
7. Open the extension, create a profile, enter details in settings, save, return to the test form, click **Preview fields**, select the desired matches, and click **Fill selected fields**.
8. After rebuilding, click **Reload** for the extension on the extensions page.

The extension requests only `activeTab`, `scripting`, and `storage`. It injects its packaged page helper only after **Preview fields** is clicked. It does not scan in the background, submit forms, click consent controls, bypass validation/CAPTCHAs, send telemetry, or contact a backend.

## Commands

- `npm run build` — type-check and create the loadable `dist/` extension.
- `npm run typecheck` — run Vue and TypeScript checks.
- `npm test` — run the Vitest suite.
- `npm run test:watch` — run tests in watch mode.
- `npm run fixtures` — serve manual fixtures at `http://127.0.0.1:4173`.
- `npm run verify:dist` — validate the production manifest and every referenced output file.
- `npm run smoke` — launch an isolated headless Chrome/Edge profile and render the built popup, options page, and fixture (requires permission to launch the installed browser).

## Behavior

Detection uses this priority: exact-origin user mapping, standard `autocomplete` semantics, associated/wrapping labels, then exact aliases in identifying attributes. Aliases cover common English, Spanish, and Portuguese terms. Generic labels such as “Name” are shown as uncertain and remain unchecked. Profile values, including phone numbers and postal codes, are retained as strings and filled without reformatting.

By default, non-empty controls are preserved. Enable **Overwrite existing values** explicitly to replace them. Native text-like inputs, textareas, and native selects are supported. Selects are filled only when exactly one normalized option value or visible label matches. A fresh eligibility check occurs immediately before filling. If a framework replaces a field after preview, the extension uses a conservative exact fingerprint and skips ambiguous replacements.

Website mappings accept only an exact `http` or `https` origin, a CSS selector, and a known profile field. Selector syntax and conflicting selectors are validated. Custom JavaScript is never evaluated.

## Privacy and security

Profiles and settings use `chrome.storage.local`. This storage is local to the browser profile but **is not encrypted**; someone with access to the browser profile or extension data may be able to read it. No personal field values are logged or sent over the network. Page-side code receives only the selected profile’s values and mappings for the active origin, not the complete profile collection.

## Limitations

- Ordinary controls in the main document are supported. Iframe forms, closed shadow roots, and custom dropdown components are not supported in this initial release.
- Open shadow roots are not traversed.
- Standard Vue and React controlled inputs generally work through native setters plus bubbling `input` and `change` events, demonstrated by `fixtures/controlled.html`; compatibility with every custom component is not promised.
- Browser-internal pages, extension galleries, and other protected pages cannot be injected into.
- Dynamic fields are detected the next time **Preview fields** is clicked; there is no continuous observer.
- The user must review and submit the form manually.

## Project layout

- `src/content/` — deterministic matching, DOM eligibility, preview, and filling.
- `src/shared/` — validated versioned storage and message/data contracts.
- `src/popup/` — active-tab preview and fill workflow.
- `src/options/` — profile and exact-origin mapping management.
- `fixtures/` — local standard and controlled-input pages.
- `tests/` — matching, storage, eligibility, select, and stale-field tests.

No remote scripts or CDN dependencies are used. The production build bundles all executable code into `dist/`.
