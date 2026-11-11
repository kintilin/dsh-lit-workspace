// Regression test: section-preset / per-group default structure persistence.
//
// Covers three bugs that made 分组默认结构 persist only "sometimes":
//   1. SETTINGS_KEY was undeclared, so the localStorage read/write threw a
//      ReferenceError that the surrounding try/catch swallowed;
//   2. /api/library replaced groupTemplates with a snapshot taken when the
//      request started, reverting whatever /api/ui-state had just applied;
//   3. the debounced backend write was lost when the page was hidden before it
//      fired, and a stale backend value could override a newer local one.
//
// All requests are mocked; this test never touches the live litd database.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const SOURCE =
  process.env.LIT_CLIENT_SOURCE ||
  fileURLToPath(new URL('../src/client/client.js', import.meta.url));
const SETTINGS_KEY = 'dsh-lit-settings-v1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'http://127.0.0.1/',
  pretendToBeVisual: true,
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.HTMLElement = window.HTMLElement;
global.Node = window.Node;
global.Event = window.Event;
global.MouseEvent = window.MouseEvent;
global.KeyboardEvent = window.KeyboardEvent;
global.IS_REACT_ACT_ENVIRONMENT = true;
window.IS_REACT_ACT_ENVIRONMENT = true;
window.isSecureContext = true;
window.__DSH_LIT_CONFIG__ = { apiBase: 'http://127.0.0.1:8765' };

const postedSettings = [];
const calls = [];
let uiStateDelay = 20;
let libraryDelay = 120;

const template = (presetId, title) => ({
  key: presetId,
  presetId,
  title,
  type: 'text',
  owner: 'ai',
  hint: '',
});

// Backend copy of the settings: only 分组 interp has a (single) default section.
const backendValue = {
  sectionPresets: null,
  groupTemplates: {
    interp: [template('limitations', '作者承认的局限')],
    dynamics: [],
    policy: [],
  },
  savedAt: Date.now() - 60 * 60 * 1000,
};

const jsonResponse = (payload) => ({
  ok: true,
  status: 200,
  json: async () => payload,
});

// The plugin source is evaluated through window.eval(), which runs in this
// Node realm (the tests define global.window first), so bare `fetch` calls
// resolve to the Node global: both references must point at the mock to keep
// the test away from the live litd service.
const mockFetch = async (url, options = {}) => {
  const target = String(url);
  calls.push({ target, options });
  if (target.includes('/api/ui-state?key=lit-settings')) {
    await sleep(uiStateDelay);
    return jsonResponse({
      ok: true,
      key: 'lit-settings',
      value: backendValue,
      updated_at: new Date(backendValue.savedAt).toISOString(),
    });
  }
  if (target.includes('/api/ui-state')) {
    postedSettings.push(JSON.parse(options.body));
    return jsonResponse({ ok: true });
  }
  if (target.includes('/api/library')) {
    // Deliberately slow: in the old code the late library response reverted the
    // group templates that /api/ui-state had already applied.
    await sleep(libraryDelay);
    return jsonResponse({
      ok: true,
      source: 'litd',
      papers: [],
      groups: [{ id: 'interp', name: '可解释性', color: '#72b7ff' }],
    });
  }
  if (target.includes('/api/feeds')) return jsonResponse({ ok: true, feeds: [], items: [] });
  if (target.includes('/api/tags')) return jsonResponse({ ok: true, tags: [] });
  if (target.includes('/api/jcr/summary')) return jsonResponse({ ok: true, year: 2026, total: 0, quartiles: [] });
  if (target.includes('/api/impact-factors')) return jsonResponse({ ok: true, rows: [] });
  return jsonResponse({ ok: true });
};
window.fetch = mockFetch;
global.fetch = mockFetch;

const source = fs.readFileSync(SOURCE, 'utf8');
let pluginFactory = null;
window.__ModuleLoader__ = { load(entry) { pluginFactory = entry.factory; } };
window.eval(source);

const registrations = new Map();
const ctx = {
  effect(fn) { return fn(); },
  locale: { register() {}, bind() { return (key) => key; } },
  slots: {
    inject(name, callback) { callback(); },
    register(options, component) { registrations.set(options.name, component); return () => {}; },
  },
};
pluginFactory((id) => {
  if (id === 'react') return React;
  throw new Error(`unexpected require: ${id}`);
}).apply(ctx);

const Main = registrations.get('main');
const container = document.getElementById('app');
const root = createRoot(container);
const click = (element) => {
  act(() => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })));
};
const settle = async (ms) => {
  await act(async () => {
    await sleep(ms);
  });
};

await act(async () => {
  root.render(React.createElement(Main, { t: (key) => key }));
});

// Both mocked loads must finish before assertions.
await settle(uiStateDelay + libraryDelay + 300);

function fail(message) {
  console.error(`FAIL: ${message}`);
  console.error('calls:', calls.map((call) => `${call.options.method || 'GET'} ${call.target}`).join('\n'));
  process.exit(1);
}

// 0. The client must resolve the settings endpoint against the configured API
//    base (a lost `${...}` interpolation turns this into a broken relative URL
//    that still contains "/api/ui-state" and would otherwise slip through).
const uiStateGet = calls.find(
  (call) => (call.options.method || 'GET') === 'GET' && call.target.includes('/api/ui-state')
);
if (!uiStateGet) fail('client never requested /api/ui-state');
if (uiStateGet.target !== 'http://127.0.0.1:8765/api/ui-state?key=lit-settings') {
  fail(`unexpected settings GET URL: ${uiStateGet.target}`);
}

// 1. Local storage must hold the settings (the undeclared constant used to make
//    this silently impossible).
const localRaw = window.localStorage.getItem(SETTINGS_KEY);
if (!localRaw) fail(`localStorage[${SETTINGS_KEY}] is missing; settings were never persisted locally`);
let localSettings;
try {
  localSettings = JSON.parse(localRaw);
} catch (error) {
  fail(`localStorage[${SETTINGS_KEY}] is not valid JSON: ${error.message}`);
}
if (!localSettings.groupTemplates || !Array.isArray(localSettings.groupTemplates.interp)) {
  fail('localStorage settings do not contain groupTemplates.interp');
}
if (!Number(localSettings.savedAt)) fail('localStorage settings have no savedAt timestamp');

// 2. The backend copy won (it is newer than the empty local one) and the late
//    /api/library response must not revert it.
const interpTemplates = localSettings.groupTemplates.interp;
if (interpTemplates.length !== 1 || interpTemplates[0].presetId !== 'limitations') {
  fail(`groupTemplates.interp was not the backend value: ${JSON.stringify(interpTemplates)}`);
}

// 3. The settings UI must show exactly the persisted 分组默认结构.
const settingsButton = Array.from(container.querySelectorAll('button')).find(
  (button) => button.textContent.trim() === '设置'
);
if (!settingsButton) fail('settings button missing');
click(settingsButton);
await settle(150);
const row = container.querySelector('.lit-group-default-row');
if (!row) fail('分组默认结构 row missing');
const checked = Array.from(row.querySelectorAll('input[type=checkbox]')).filter((input) => input.checked);
if (checked.length !== 1) {
  fail(`expected exactly 1 checked default section for group interp, got ${checked.length}`);
}

// 4. Toggle another preset for the group and hide the page immediately: the
//    edit must already be in localStorage and must flush to the backend on
//    pagehide (the old code only wrote after a 500ms debounce that a reload or
//    navigation could cancel).
const unchecked = Array.from(row.querySelectorAll('input[type=checkbox]')).find((input) => !input.checked);
if (!unchecked) fail('no unchecked preset to toggle');
click(unchecked);
const afterToggle = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}');
const toggledTemplates = afterToggle.groupTemplates?.interp || [];
if (toggledTemplates.length !== 2) {
  fail(`edit was not written to localStorage immediately (interp templates: ${toggledTemplates.length})`);
}
if (!Number(afterToggle.savedAt)) fail('edited settings have no savedAt timestamp');
const postedBefore = postedSettings.length;
window.dispatchEvent(new window.Event('pagehide'));
await settle(120);
const flushed = postedSettings.slice(postedBefore);
if (!flushed.length) {
  fail('pagehide did not flush the pending settings write to /api/ui-state');
}
const flushedValue = flushed[flushed.length - 1].value;
if (!flushedValue || (flushedValue.groupTemplates?.interp || []).length !== 2) {
  fail('flushed settings do not contain the toggle');
}
if (!Number(flushedValue.savedAt)) fail('flushed settings have no savedAt timestamp');
const flushCall = calls.filter((call) => call.target.includes('/api/ui-state') && call.options.method === 'POST').pop();
if (!flushCall || flushCall.options.keepalive !== true) {
  fail('the flushed request must use keepalive so the browser lets it finish while unloading');
}
if (flushCall.target !== 'http://127.0.0.1:8765/api/ui-state') {
  fail(`unexpected settings POST URL: ${flushCall.target}`);
}

console.log('settings persistence OK');
console.log('localSettings.savedAt =', localSettings.savedAt);
console.log('posted settings:', postedSettings.length, 'flushed value section count:', flushedValue.groupTemplates.interp.length);
