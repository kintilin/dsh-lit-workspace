// Regression test for two library UI issues:
//   1. the right-click menu listed every group and could grow taller than the
//      screen -- it must cap its height and put the group list in a scroll area;
//   2. the import dialog leaked the developer's real Desktop path as a grey
//      placeholder -- no private/user path may appear in the UI at all.
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

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

// --- static checks on the shipped source -----------------------------------
const source = fs.readFileSync(SOURCE, 'utf8');
const privatePatterns = [/未读文献/, /D:\\\\Desktop/, /E:\\\\DSH_Workspace/, /lit-model-plugin/, /2021_ARB/];
for (const pattern of privatePatterns) {
  if (pattern.test(source)) fail(`private path still present in client source: ${pattern}`);
}
if (/placeholder:\s*'[A-Za-z]:/.test(source)) fail('a placeholder still exposes a drive-letter path');
if (!source.includes("placeholder: '本机 PDF 的完整路径'")) fail('neutral PDF path placeholder missing');
if (!source.includes("placeholder: '可选：总结 JSON 的完整路径'")) fail('neutral summary path placeholder missing');
if (!source.includes('.lit-context-groups')) fail('context menu group scroll container missing from CSS/JSX');
if (!source.includes('maxHeight: contextMenu.maxHeight')) fail('context menu inline height cap missing');
if (!/const maxHeight = Math\.max\(220, Math\.min\(520, Math\.round\(rect\.height \* 0\.72\)\)\)/.test(source)) {
  fail('context menu height clamp missing from openContextMenu');
}

// --- runtime checks: render a library and open the context menu -------------
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

const groups = Array.from({ length: 25 }, (_, index) => ({
  id: `group-${index + 1}`,
  name: `分组 ${index + 1}`,
  color: '#72b7ff',
}));
const paper = {
  id: 'paper-1',
  title: 'Context menu test paper',
  authors: 'Test Author',
  year: 2024,
  venue: 'Test Journal',
  doi: '10.1000/test',
  arxiv: '',
  abstract: 'Abstract text.',
  page_count: 1,
  groups: [],
  pdf_path: '',
  source_url: '',
  status: '未总结',
  summary: { sections: [], auto_generated: false, ai_generated: false, reviewed: false, model: null },
  evidence: [],
};

const jsonResponse = (payload) => ({ ok: true, status: 200, json: async () => payload });
const mockFetch = async (url) => {
  const target = String(url);
  if (target.includes('/api/library')) {
    return jsonResponse({ ok: true, source: 'litd', papers: [paper], groups });
  }
  if (target.includes('/api/feeds')) return jsonResponse({ ok: true, feeds: [], items: [] });
  if (target.includes('/api/tags')) return jsonResponse({ ok: true, tags: [] });
  if (target.includes('/api/ui-state')) return jsonResponse({ ok: true, key: 'lit-settings', value: null });
  if (target.includes('/api/jcr/summary')) return jsonResponse({ ok: true, year: 2026, total: 0, quartiles: [] });
  return jsonResponse({ ok: true });
};
window.fetch = mockFetch;
global.fetch = mockFetch;

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
await act(async () => {
  root.render(React.createElement(Main, { t: (key) => key }));
  await sleep(500);
});

const styleElement = container.querySelector('style');
if (!styleElement || !styleElement.textContent) fail('<style> block with the plugin CSS missing');
const css = styleElement.textContent;
if (!/\.lit-context-menu \{[^}]*max-height:[^;]*;/.test(css)) fail('context menu CSS height cap missing');
if (!/\.lit-context-menu \{[^}]*overflow-y: auto/.test(css)) fail('context menu CSS scroll missing');
if (!/\.lit-context-groups \{[^}]*max-height:[^;]*;/.test(css)) fail('group list CSS height cap missing');

const row = container.querySelector('.lit-paper-row');
if (!row) fail('paper row missing; cannot open the context menu');
act(() => {
  row.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 160 }));
});
await act(async () => {
  await sleep(120);
});

const menu = container.querySelector('.lit-context-menu');
if (!menu) fail('context menu did not render');
const inlineMaxHeight = menu.style.maxHeight;
if (!inlineMaxHeight) fail('context menu has no inline max-height clamp');
if (!/^\d+px$/.test(inlineMaxHeight)) fail(`unexpected context menu max-height: ${inlineMaxHeight}`);
const groupBox = menu.querySelector('.lit-context-groups');
if (!groupBox) fail('group list is not wrapped in its scroll container');
const groupButtons = groupBox.querySelectorAll('.lit-context-item');
if (groupButtons.length !== groups.length) {
  fail(`expected ${groups.length} group entries inside the scroll container, got ${groupButtons.length}`);
}
const deleteButton = Array.from(menu.querySelectorAll('.lit-context-item')).find((button) =>
  button.textContent.includes('从文献库删除')
);
if (!deleteButton) fail('delete action missing from the context menu');

console.log('ui polish OK');
console.log('context menu max-height:', inlineMaxHeight, '| group entries:', groupButtons.length);
console.log('import placeholders: generic');
