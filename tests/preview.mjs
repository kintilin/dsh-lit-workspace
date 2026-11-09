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

const source = fs.readFileSync(fileURLToPath(new URL('../src/client/client.js', import.meta.url)), 'utf8');
let pluginFactory = null;
window.__ModuleLoader__ = {
  load(entry) {
    pluginFactory = entry.factory;
  },
};
window.eval(source);

const registrations = new Map();
const ctx = {
  effect(fn) {
    return fn();
  },
  locale: {
    register() {},
    bind() {
      return (key) => key;
    },
  },
  slots: {
    inject(name, callback) {
      callback();
    },
    register(options, component) {
      registrations.set(options.name, component);
      return () => {};
    },
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

function writePreview(name) {
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title><style>html,body{margin:0;width:100%;height:100%;background:#111820}#app{width:100%;height:100vh}</style></head><body><div id="app">${container.innerHTML}</div></body></html>`;
  fs.writeFileSync(new URL(`./${name}.html`, import.meta.url), html);
}

writePreview('preview-library');
const groupFilterRows = Array.from(container.querySelectorAll('.lit-group-filter'));
const interpFilterRow = groupFilterRows.find((row) => row.textContent.includes('可解释性'));
const dynamicsFilterRow = groupFilterRows.find((row) => row.textContent.includes('训练动力学'));
if (interpFilterRow) {
  act(() => {
    interpFilterRow.querySelector('input[type="checkbox"]').click();
  });
}
if (dynamicsFilterRow) {
  act(() => {
    dynamicsFilterRow.querySelector('input[type="checkbox"]').click();
  });
}
writePreview('preview-group-multi');
const clearGroups = Array.from(container.querySelectorAll('.lit-group-filter')).find((row) => row.textContent.includes('全部文献'));
if (clearGroups) click(clearGroups);

const paperChecks = container.querySelectorAll('.lit-paper-row-check input[type="checkbox"]');
if (paperChecks[1]) {
  act(() => {
    paperChecks[1].click();
  });
}
writePreview('preview-bulk');
const firstRow = container.querySelector('.lit-paper-row');
if (firstRow) {
  act(() => {
    firstRow.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 180, clientY: 260 }));
  });
}
writePreview('preview-context');
const contextLayer = container.querySelector('.lit-context-layer');
if (contextLayer) {
  act(() => {
    contextLayer.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
}
const manageButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.trim() === '管理');
if (manageButton) {
  click(manageButton);
  writePreview('preview-groups');
  const managerDone = Array.from(container.querySelectorAll('.lit-modal-actions button')).find((button) => button.textContent.trim() === '完成');
  if (managerDone) click(managerDone);
}
const templateButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('模板 / 预设'));
click(templateButton);
writePreview('preview-template');
const doneButton = Array.from(container.querySelectorAll('.lit-modal-actions button')).find((b) => b.textContent.trim() === '完成');
click(doneButton);
click(container.querySelector('[data-testid="lit-tab-tracking"]'));
writePreview('preview-tracking');
click(container.querySelector('[data-testid="lit-tab-graph"]'));
writePreview('preview-graph');

const graphSvg = container.querySelector('.lit-graph-canvas svg');
graphSvg.getScreenCTM = () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) });
graphSvg.createSVGPoint = () => {
  const point = { x: 0, y: 0, matrixTransform: () => ({ x: point.x, y: point.y }) };
  return point;
};
const canvas = container.querySelector('.lit-graph-canvas');
act(() => {
  canvas.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 120, clientY: 80 }));
});
act(() => {
  canvas.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: 420, clientY: 310 }));
});
act(() => {
  canvas.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: 420, clientY: 310 }));
});
const selectedNode = Array.from(container.querySelectorAll('.lit-graph-node')).find((node) => (node.getAttribute('aria-label') || '').includes('When Abstraction'));
if (selectedNode) {
  act(() => {
    selectedNode.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true, cancelable: true }));
  });
}
writePreview('preview-graph-selected');
console.log('previews written');
