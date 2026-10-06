# Build a browser extension that autofills web forms

You are working in my local Codex workspace. Implement a complete, usable Chrome extension called **My Form Autofill**. Create the project files, build it, and verify the result. Do not stop at a plan or illustrative snippets.

## Goal

I want to save my personal information once, open a web form, and click the extension to fill matching fields. Support common forms in English, Spanish, and Portuguese.

Use sensible implementation defaults and proceed autonomously. If the workspace already contains a project, read its instructions and inspect its structure before making changes. Preserve unrelated work.

## Technology

- Chrome Manifest V3; aim for compatibility with Chromium-based Edge.
- Vue 3 Composition API and TypeScript for the popup and options page.
- Vite for a reproducible build producing a loadable `dist/` extension.
- Plain TypeScript for page-side form detection and filling.
- No backend, paid services, AI API, telemetry, remote scripts, or CDN dependencies.
- Use a small dependency set and the package manager already present; use npm in an empty workspace.
- Keep extension logic independent of Vue so it is easy to test and extend.
- Do not turn this into a hosted website or publish it to an extension store.

## Main user flow

1. Open the extension popup.
2. Create or select a saved profile.
3. Click **Preview fields** to inspect which fields on the current page match.
4. Show each field label, proposed value, and a checkbox to include it. Uncertain matches remain unselected.
5. Click **Fill selected fields**.
6. Report the number filled and skipped, with understandable reasons.
7. Leave the form available for the user to review and submit manually.

## Profiles and settings

Store profiles and preferences in `chrome.storage.local`. Provide an options page to create, edit, rename, and delete multiple profiles.

Profile fields:
- Full name
- First name
- Last name
- Email
- Phone
- Company
- Street address
- Address complement
- City
- State/province
- Postal code
- Country

Keep profile values as strings, including phone numbers and postal codes. Start with blank fields; do not invent or embed my personal details. Persist the selected profile and last-used settings.

Default to filling empty fields only. Provide a clearly labeled **Overwrite existing values** switch, off by default.

Use versioned storage with validation and graceful handling of missing or malformed stored data. Do not render stored values as HTML. Local extension storage is not encrypted; describe that accurately in the README.

## Field detection

Build a deterministic matching system, using this precedence:

1. User-defined mapping for the current website.
2. Standard HTML `autocomplete` tokens.
3. Associated labels, including wrapping labels.
4. `name`, `id`, `aria-label`, referenced `aria-labelledby` text, and placeholder.

Parse autocomplete token lists correctly, including section and shipping/billing prefixes. Match complete field meanings; do not rely on broad substring checks such as matching every field containing "name".

Normalize case, accents, whitespace, separators, and camelCase. Include a small, maintainable dictionary of English, Spanish, and Portuguese field aliases, such as first_name, nombre, nome, apellido, sobrenome, telefone, cidade, provincia, estado, CEP, and código postal.

Distinguish full name from first and last name, street address from address complement, and city from state. Respect explicit semantic hints. Generic labels such as "name" without context are uncertain.

Return typed match records containing:
- A page-side field identifier
- Display label
- Profile key
- Proposed value
- Confidence and short reason
- Current value/empty status
- Eligibility or skip reason

Only offer supported, visible, enabled, editable controls. Skip password fields, payment-card fields, one-time codes, file inputs, buttons, hidden fields, disabled controls, read-only controls, checkbox/radio inputs, and unrelated search fields.

## Filling behavior

- Support native text, email, tel, and appropriate URL inputs, textareas, and native select elements.
- Fill only fields approved in the preview.
- Use native value setters where appropriate and dispatch bubbling `input` and `change` events.
- Add fixture examples demonstrating Vue and React controlled-input behavior. Do not promise compatibility with every custom component.
- For select elements, choose an unambiguous matching option by normalized value or visible label. Do not select an arbitrary option.
- Preserve phone/postal formatting supplied by the profile.
- Recheck eligibility and current values immediately before filling.
- If the page replaces a field between preview and filling, identify it again conservatively or skip it with a clear reason.
- Handle forms added dynamically when preview is requested again; avoid continuous background scanning.
- Support ordinary main-document controls. Open shadow roots may be supported if straightforward.
- Clearly document custom dropdowns, closed shadow roots, and iframe forms as unsupported in the initial release rather than claiming they work.
- Never click submit, accept terms, or bypass validation/CAPTCHAs.

## Custom website mappings

In the options page, let me define mappings from CSS selectors to profile fields for a specific website origin, for example:

```json
{
  "origin": "https://example.com",
  "mappings": [
    { "selector": "#contact-name", "profileKey": "fullName" },
    { "selector": "input[name='contact_phone']", "profileKey": "phone" }
  ]
}
```

Validate the origin, selector syntax, and profile key. Apply mappings only to that exact origin. Show readable errors for invalid selectors and conflicting mappings. Never evaluate custom JavaScript.

## Permissions and extension architecture

Start with only:
- `activeTab`
- `scripting`
- `storage`

Inject packaged page-side code only after an explicit popup action. Use the popup's user gesture and activeTab permission; do not request access to all websites or automatically fill on page load.

Use `chrome.scripting.executeScript` and structured messaging/results. Keep DOM access in the injected script and extension state in extension contexts. Content scripts must not gain access to the entire stored profile collection: provide only the selected values needed for the operation.

Make initialization idempotent if a page-side message listener is used. Do not duplicate listeners after repeated previews. Do not rely on persistent service-worker globals; a service worker is optional unless the architecture needs one.

Handle unsupported browser pages, missing tabs, navigation between preview and fill, permission failures, and unavailable content scripts with clear popup messages. Invalidate stale previews after navigation or profile changes.

Bundle all executable code locally. Follow Manifest V3 CSP; no inline scripts or eval. Do not log personal field values.

## Interface

Build a polished, compact popup, approximately 380–420 px wide, with:
- Profile selector
- Preview and fill buttons
- Scrollable field preview with individual selection
- Overwrite switch
- Loading, empty, success, and error states
- Link to profile and mapping settings

Use accessible labels, visible keyboard focus, readable contrast, and responsive layouts. Keep UI text in English, with field detection supporting the three languages. The options page should remain comfortable on a narrow window.

## Verification

Add meaningful Vitest tests for:
- Autocomplete token parsing and matching priority.
- English, Spanish, and Portuguese field aliases.
- Ambiguous/negative cases and explicit hint conflicts.
- Skipping ineligible fields.
- Preserving existing values by default.
- Native select matching without arbitrary selection.
- Invalid website mappings and corrupted storage.
- Fields removed or replaced between preview and filling.

Add local form fixtures covering standard autocomplete attributes, multilingual labels, textareas, select elements, existing values, disabled/hidden controls, and dynamically added fields. Include a straightforward local fixture server command so the extension can be tested on HTTP localhost without changing file-URL permissions.

Run the build, type checks, and relevant tests. Inspect the generated manifest and every referenced output path. Verify that `dist/` contains a self-contained extension, not a development-server-dependent app.

If a real Chrome extension smoke test is available, use it. Otherwise report which checks were run and include exact manual steps; do not claim browser verification that did not happen.

## Deliverables

Produce:
- Complete source code and extension manifest.
- Working popup and options page.
- Profile persistence, multilingual matching, preview, and filling.
- Website-specific selector mappings.
- Build/typecheck/test scripts.
- Local test fixtures.
- A README with setup, commands, supported behavior, limitations, and instructions:
  1. Install dependencies.
  2. Build the extension.
  3. Open `chrome://extensions`.
  4. Enable Developer mode.
  5. Click Load unpacked and choose `dist/`.
  6. Open the local test form.
  7. Create a profile, preview, and fill.
  8. Reload the extension after rebuilding.

Use clear module boundaries for storage, matching, filling, messaging, and UI. Avoid unnecessary abstractions.

At the end, summarize what was implemented, the commands that passed, any remaining limitations, and how to load the extension. Complete the implementation before responding.

## Official references

Check current official documentation where needed:
- https://developer.chrome.com/docs/extensions/reference/api/scripting
- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/autocomplete

