import fs from 'node:fs';
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

const source = fs.readFileSync('E:/DSH_Workspace/lit-demo/client.js', 'utf8');
let pluginFactory = null;
window.__ModuleLoader__ = {
  load(entry) {
    pluginFactory = entry.factory;
  },
};
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

await act(async () => {
  root.render(React.createElement(Main, { t: (key) => key }));
});

const realButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.trim() === '刷新');
click(realButton);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1800));
});

const libraryBefore = await (await fetch('http://127.0.0.1:8765/api/library')).json();
const paper = libraryBefore.papers.find((item) => item.title.includes('Synonymous but not Silent'));
if (!paper) throw new Error('real paper not found');
const originalSections = paper.summary.sections;

const synRow = Array.from(container.querySelectorAll('.lit-paper-row')).find((row) =>
  row.textContent.includes('Synonymous but not Silent')
);
if (!synRow) throw new Error('real paper row missing');
click(synRow);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});

const textarea = Array.from(container.querySelectorAll('textarea')).find((item) =>
  item.value.includes('同义密码子通常不改变氨基酸序列')
);
if (!textarea) throw new Error('question textarea not found');
const marker = `AUTOSAVE_TEST_${Date.now()}`;
const propKey = Object.keys(textarea).find((key) => key.startsWith('__reactProps'));
console.log('textarea connected:', textarea.isConnected, 'hasOnChange:', Boolean(textarea[propKey]?.onChange), 'owner:', textarea[propKey]?.value);
act(() => {
  textarea[propKey].onChange({ target: { value: marker } });
});

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1800));
});

console.log('ui save state:', container.querySelector('.lit-save-state')?.textContent);
console.log('dirty header:', container.querySelector('.lit-dirty')?.textContent);
console.log('textarea value:', textarea.value);
const libraryAfter = await (await fetch('http://127.0.0.1:8765/api/library')).json();
const savedPaper = libraryAfter.papers.find((item) => item.id === paper.id);
const question = savedPaper.summary.sections.find((section) => section.key === 'question');
const savedText = question?.entries?.[0]?.text || '';
if (savedText !== marker) throw new Error(`autosave failed: ${savedText.slice(0, 80)}`);

const restore = await fetch(`http://127.0.0.1:8765/api/papers/${encodeURIComponent(paper.id)}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sections: originalSections }),
});
if (!restore.ok) throw new Error('restore failed');

console.log('autosave OK');
console.log('saved:', savedText);
console.log('service save indicator:', container.querySelector('.lit-save-state')?.textContent);
