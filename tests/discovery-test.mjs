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
const plugin = pluginFactory((id) => {
  if (id === 'react') return React;
  throw new Error(`unexpected require: ${id}`);
});
plugin.apply(ctx);

const Main = registrations.get('main');
const container = document.getElementById('app');
const root = createRoot(container);
const click = (element) => {
  act(() => {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};
const propKey = (element) => Object.keys(element).find((key) => key.startsWith('__reactProps'));

await act(async () => {
  root.render(React.createElement(Main, { t: (key) => key }));
});
const realButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.trim() === '刷新');
click(realButton);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1800));
});

const discoverButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.trim() === '发现');
click(discoverButton);
const sourceSelect = container.querySelector('.lit-discovery-source');
if (!sourceSelect) throw new Error('source select missing');
if (sourceSelect.value !== 'europepmc') throw new Error(`unexpected default source: ${sourceSelect.value}`);

const queryInput = container.querySelector('input[aria-label="arXiv 搜索词"]');
if (!queryInput) throw new Error('query input missing');
act(() => {
  queryInput[propKey(queryInput)].onChange({ target: { value: 'codon usage' } });
});
const searchButton = Array.from(container.querySelectorAll('.lit-discovery-search button')).find((button) => button.textContent.includes('搜索'));
click(searchButton);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 7000));
});

const summary = container.querySelector('.lit-discovery-summary');
if (!summary || !summary.textContent.includes('Europe PMC')) {
  console.log('MODAL TEXT:', container.querySelector('.lit-discovery-modal')?.textContent.slice(0, 1200));
  console.log('TOAST:', container.querySelector('.lit-toast')?.textContent);
  throw new Error('Europe PMC summary missing');
}
if (!summary.textContent.includes('共')) throw new Error('result total missing');
const metaText = Array.from(container.querySelectorAll('.lit-discovery-meta')).map((el) => el.textContent);
if (metaText.length < 6) throw new Error('expected more than 6 results');
if (metaText.every((text) => text.startsWith('arXiv'))) throw new Error('all results are arXiv');
if (!container.querySelector('.lit-discovery-more')) throw new Error('load-more control missing');
if (!container.querySelector('.lit-discovery-journal .lit-journal-badge')) throw new Error('discovery journal badge missing');
if (!container.querySelector('.lit-discovery-journal .lit-if-tag')) throw new Error('discovery IF tag missing');

act(() => {
  sourceSelect[propKey(sourceSelect)].onChange({ target: { value: 'arxiv' } });
});
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
});
click(searchButton);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 5000));
});
const arxivSummary = container.querySelector('.lit-discovery-summary');
if (!arxivSummary || !arxivSummary.textContent.includes('arXiv')) {
  console.log('SOURCE VALUE:', sourceSelect.value);
  console.log('SUMMARY:', arxivSummary?.textContent);
  console.log('TOAST:', container.querySelector('.lit-toast')?.textContent);
  throw new Error('arXiv summary missing after source switch');
}

console.log('discovery source switch OK');
console.log('europepmc count:', metaText.length);
console.log('europepmc first:', metaText[0]);
console.log('arxiv after switch:', arxivSummary.textContent);
