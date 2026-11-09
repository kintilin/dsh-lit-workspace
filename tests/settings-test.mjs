import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

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
window.fetch = (...args) => globalThis.fetch(...args);

const source = fs.readFileSync(fileURLToPath(new URL('../src/client/client.js', import.meta.url)), 'utf8');
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

await act(async () => {
  root.render(React.createElement(Main, { t: (key) => key }));
});

const settingsButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.trim() === '设置');
if (!settingsButton) throw new Error('settings button missing');
click(settingsButton);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});
if (!container.querySelector('.lit-settings-modal')) throw new Error('settings modal missing');
if (!container.textContent.includes('结构化总结预设')) throw new Error('preset tab missing');
if (!container.querySelector('.lit-preset-list')) throw new Error('preset list missing');
const impactTab = Array.from(container.querySelectorAll('.lit-settings-tab')).find((button) => button.textContent.includes('影响因子'));
if (!impactTab) throw new Error('impact tab missing');
click(impactTab);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
});
if (!container.querySelector('.lit-if-form')) throw new Error('IF form missing');
if (!container.textContent.includes('影响因子不是公开数据')) throw new Error('IF disclosure missing');
const close = container.querySelector('.lit-settings-modal .lit-icon-btn');
click(close);

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1800));
});

const realButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.trim() === '刷新');
if (!realButton) throw new Error('real button missing');
click(realButton);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
});

const discoverButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.trim() === '发现');
click(discoverButton);
const filterButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.trim() === '筛选');
if (!filterButton) throw new Error('filter button missing');
click(filterButton);
if (!container.querySelector('.lit-discovery-filters')) throw new Error('filter panel missing');
const labels = Array.from(container.querySelectorAll('.lit-discovery-filter-field label')).map((el) => el.textContent);
if (!labels.includes('最低 IF') || !labels.includes('起始年') || !labels.includes('JCR 分区（2026）')) {
  throw new Error('filter fields missing');
}

console.log('settings and filters OK');
console.log('filter fields:', labels.join(', '));
