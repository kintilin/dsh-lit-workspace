// Regression test: author-search text must follow the DSH light/dark theme.
//
// The author cards used the dark palette (#e1e8f0 name, #a7b4c2 institution,
// #a9c3f8 result heading, white-alpha borders) with no light-theme overrides,
// so in light mode the author information stayed near-white and unreadable.
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

const jsonResponse = (payload) => ({ ok: true, status: 200, json: async () => payload });
const mockFetch = async (url) => {
  const target = String(url);
  if (target.includes('/api/library')) return jsonResponse({ ok: true, source: 'litd', papers: [], groups: [] });
  if (target.includes('/api/feeds')) return jsonResponse({ ok: true, feeds: [], items: [] });
  if (target.includes('/api/tags')) return jsonResponse({ ok: true, tags: [] });
  if (target.includes('/api/ui-state')) return jsonResponse({ ok: true, key: 'lit-settings', value: null });
  if (target.includes('/api/jcr/summary')) return jsonResponse({ ok: true, year: 2026, total: 0, quartiles: [] });
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
const themeStore = { get: () => 'light', subscribe: () => () => {} };

await act(async () => {
  root.render(React.createElement(Main, { t: (key) => key, themeStore }));
  await sleep(300);
});

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const rootElement = container.querySelector('.lit-root');
if (!rootElement) fail('.lit-root missing');
const rootClassName = String(rootElement.className || '');
if (!rootClassName.includes('lit-theme-light')) {
  fail(`light theme class was not applied (className: ${rootClassName})`);
}

const styleElement = container.querySelector('style');
if (!styleElement || !styleElement.textContent) fail('<style> block with the plugin CSS missing');
const css = styleElement.textContent;

const required = [
  ['.lit-author-name { color: var(--dsw-alias-label-primary, #e1e8f0)', 'author-name uses the primary label alias'],
  ['.lit-author-inst { color: var(--dsw-alias-label-secondary, #a7b4c2)', 'author-inst uses the secondary label alias'],
  ['.lit-author-result-head { margin-top: 14px; color: var(--dsw-alias-brand-primary, #a9c3f8)', 'result heading uses the brand alias'],
  ['.lit-author-summary-hint { color: var(--dsw-alias-label-secondary, #6f7c89)', 'summary hint uses the secondary label alias'],
  ['.lit-author-authors { color: var(--dsw-alias-label-secondary, #73808d)', 'authors use the secondary label alias'],
  ['.lit-author-candidate { padding: 10px 11px; border: 1px solid var(--dsw-alias-border-l1', 'candidate border uses the theme border alias'],
  ['.lit-theme-light .lit-author-affiliation { color: #2f6b4f; }', 'light override for the affiliation line'],
  ['.lit-theme-light .lit-author-candidate {', 'light override for candidate cards'],
  ['.lit-theme-light .lit-author-abstract-label { color: #1e4f9c;', 'light override for the abstract label'],
];
for (const [snippet, description] of required) {
  if (!css.includes(snippet)) fail(`${description} missing (expected snippet: ${snippet})`);
}

const leftovers = [
  '.lit-author-name { color: #e1e8f0;',
  '.lit-author-inst { color: #a7b4c2;',
  '.lit-author-result-head { margin-top: 14px; color: #a9c3f8;',
  '.lit-author-authors { color: #73808d;',
  '.lit-author-candidate { padding: 10px 11px; border: 1px solid rgba(255,255,255,.08);',
];
for (const snippet of leftovers) {
  if (css.includes(snippet)) fail(`hard-coded dark-only author colour still present: ${snippet}`);
}

console.log('author search theme OK');
console.log('light theme class:', rootClassName);
console.log('checked rules:', required.length, 'stale rules absent:', leftovers.length);
