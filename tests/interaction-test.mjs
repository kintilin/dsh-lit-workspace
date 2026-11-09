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
window.confirm = () => true;

const source = fs.readFileSync(fileURLToPath(new URL('../src/client/client.js', import.meta.url)), 'utf8');
let pluginFactory = null;
window.__ModuleLoader__ = {
  load(entry) {
    pluginFactory = entry.factory;
  },
};
window.eval(source);
if (!pluginFactory) throw new Error('plugin factory was not registered');

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

if (!container.querySelector('[data-testid="lit-root"]')) throw new Error('root not rendered');
if (!container.textContent.includes('Geometric Inductive Bias')) throw new Error('library not rendered');
if (!container.textContent.includes('方法质量') || !container.textContent.includes('复现风险')) {
  throw new Error('multi-group template union missing');
}

// Switch to the tracking view.
click(container.querySelector('[data-testid="lit-tab-tracking"]'));
if (!container.textContent.includes('追踪流')) throw new Error('tracking view not rendered');
if (!container.textContent.includes('Sparse Autoencoders')) throw new Error('feed item not rendered');

// Switch to the graph view.
click(container.querySelector('[data-testid="lit-tab-graph"]'));
if (!container.textContent.includes('领域结构')) throw new Error('graph view not rendered');
if (!container.querySelector('svg')) throw new Error('graph svg not rendered');

// Back to library, open evidence, edit a claim.
click(container.querySelector('[data-testid="lit-tab-library"]'));
const evidenceButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('p.7'));
if (!evidenceButton) throw new Error('evidence chip not found');
click(evidenceButton);
if (!container.textContent.includes('原文证据')) throw new Error('evidence panel not rendered');

const claimTextarea = Array.from(container.querySelectorAll('textarea')).find((t) =>
  t.value.includes('Grokking 可以被理解为')
);
if (!claimTextarea) throw new Error('claim textarea not found');
act(() => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(claimTextarea, 'Grokking 是表示几何的重新对齐，而不是训练延迟。');
  claimTextarea.dispatchEvent(new window.Event('input', { bubbles: true }));
});
if (!container.textContent.includes('文字已修改')) throw new Error('dirty state not shown');

// Trigger the simulated citation update.
const updateButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('更新引用'));
if (!updateButton) throw new Error('update button not found');
click(updateButton);
if (!container.textContent.includes('已重新映射')) throw new Error('update toast not shown');

// Add a preset section from the template modal.
const templateButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('模板 / 预设'));
if (!templateButton) throw new Error('template button not found');
click(templateButton);
if (!container.textContent.includes('配置这篇论文的大类')) throw new Error('template modal not rendered');
const readPresetRow = Array.from(container.querySelectorAll('.lit-preset-row')).find((row) => row.textContent.includes('阅读状态'));
if (!readPresetRow) throw new Error('read preset row not found');
click(readPresetRow.querySelector('button'));
const doneButton = Array.from(container.querySelectorAll('.lit-modal-actions button')).find((b) => b.textContent.trim() === '完成');
if (!doneButton) throw new Error('template done button not found');
click(doneButton);
if (!container.textContent.includes('阅读状态')) throw new Error('new section not added');

// Rate the method-quality section.
const qualityCard = Array.from(container.querySelectorAll('.lit-section-card')).find((card) => card.textContent.includes('方法质量'));
if (!qualityCard) throw new Error('rating section not found');
const stars = qualityCard.querySelectorAll('.lit-star');
if (stars.length !== 5) throw new Error('rating stars missing');
click(stars[4]);
if (!qualityCard.textContent.includes('5 / 5')) throw new Error('rating did not update');

// Toggle a tag.
const tagCard = Array.from(container.querySelectorAll('.lit-section-card')).find((card) => card.textContent.includes('主题标签'));
if (!tagCard) throw new Error('tag section not found');
const firstTag = Array.from(tagCard.querySelectorAll('.lit-tag-option')).find((button) => button.textContent.includes('机制'));
if (!firstTag) throw new Error('tag option not found');
click(firstTag);
if (!firstTag.className.includes('lit-tag-option-on')) throw new Error('tag did not toggle');

// Read/unread filter.
click(container.querySelector('[data-testid="lit-tab-tracking"]'));
const readFilter = Array.from(container.querySelectorAll('.lit-filter')).find((button) => button.textContent.trim() === '已读');
if (!readFilter) throw new Error('read filter not found');
click(readFilter);
const readItems = container.querySelectorAll('.lit-feed-item-read');
if (readItems.length === 0) throw new Error('read feed items are not marked');

// Multi-select graph nodes with Shift+click.
click(container.querySelector('[data-testid="lit-tab-graph"]'));
const graphNodes = Array.from(container.querySelectorAll('.lit-graph-node'));
const geometricNode = graphNodes.find((node) => (node.getAttribute('aria-label') || '').includes('Geometric'));
const abstractionNode = graphNodes.find((node) => (node.getAttribute('aria-label') || '').includes('When Abstraction'));
if (!geometricNode || !abstractionNode) throw new Error('graph nodes not found');
click(geometricNode);
act(() => {
  abstractionNode.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
});
if (!container.textContent.includes('已框选 2 个节点')) throw new Error('multi-select did not work');

// Hover tooltip.
act(() => {
  abstractionNode.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true, cancelable: true }));
});
if (!container.querySelector('.lit-graph-tooltip')) throw new Error('hover tooltip not rendered');

// Box select with a mocked SVG coordinate transform.
const svg = container.querySelector('.lit-graph-canvas svg');
svg.getScreenCTM = () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) });
svg.createSVGPoint = () => {
  const point = {
    x: 0,
    y: 0,
    matrixTransform: () => ({ x: point.x, y: point.y }),
  };
  return point;
};
const canvas = container.querySelector('.lit-graph-canvas');
act(() => {
  canvas.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: 80 }));
});
act(() => {
  canvas.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: 400, clientY: 300 }));
});
act(() => {
  canvas.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: 400, clientY: 300 }));
});
if (!/已框选 \d+ 个节点/.test(container.textContent)) throw new Error('box selection did not work');

// Group filter: body click is single-select until a checkbox enters multi-select.
click(container.querySelector('[data-testid="lit-tab-library"]'));
const getGroupFilter = (text) => Array.from(container.querySelectorAll('.lit-group-filter')).find((item) => item.textContent.includes(text));
const getLogicButton = (text) => Array.from(container.querySelectorAll('.lit-logic-button')).find((item) => item.textContent.trim() === text);

let interpFilter = getGroupFilter('可解释性');
if (!interpFilter) throw new Error('group filter not found');
act(() => {
  interpFilter.querySelector('.lit-group-filter-name').click();
});
if (container.querySelectorAll('.lit-paper-row').length !== 4) throw new Error('body click did not show group papers');
if (!interpFilter.querySelector('input[type="checkbox"]').checked) throw new Error('body click did not check the box');
if (container.querySelector('.lit-cancel-multi')) throw new Error('single select should not show cancel multi');
if (!container.textContent.includes('单选模式')) throw new Error('single mode label missing');

const dynamicsBeforeCheckbox = getGroupFilter('训练动力学');
act(() => {
  dynamicsBeforeCheckbox.querySelector('.lit-group-filter-name').click();
});
if (container.querySelectorAll('.lit-paper-row').length !== 3) throw new Error('single-select body click did not replace selection');
if (getGroupFilter('可解释性').querySelector('input[type="checkbox"]').checked) throw new Error('single-select did not clear interp');

interpFilter = getGroupFilter('可解释性');
act(() => {
  interpFilter.querySelector('input[type="checkbox"]').click();
});
if (!container.querySelector('.lit-cancel-multi')) throw new Error('cancel multi option missing');
if (!container.textContent.includes('多选模式')) throw new Error('multi mode label missing');
const dynamicsFilter = getGroupFilter('训练动力学');
if (!dynamicsFilter.querySelector('input[type="checkbox"]').checked) throw new Error('dynamics should stay selected');
if (container.querySelectorAll('.lit-paper-row').length !== 1) throw new Error('AND group filter did not intersect');

click(getLogicButton('OR'));
if (container.querySelectorAll('.lit-paper-row').length !== 6) throw new Error('OR group filter did not union');
click(getLogicButton('AND'));
if (container.querySelectorAll('.lit-paper-row').length !== 1) throw new Error('AND group filter did not restore intersection');

const dynamicsAgain = getGroupFilter('训练动力学');
act(() => {
  dynamicsAgain.querySelector('.lit-group-filter-name').click();
});
if (container.querySelectorAll('.lit-paper-row').length !== 4) throw new Error('multi body click did not remove one selected group');

const cancelMulti = container.querySelector('.lit-cancel-multi');
if (!cancelMulti) throw new Error('cancel multi missing before click');
click(cancelMulti);
if (container.querySelector('.lit-cancel-multi')) throw new Error('cancel multi did not exit mode');
if (container.querySelectorAll('.lit-paper-row').length !== 4) throw new Error('cancel multi should keep the last group');

const policyFilter = getGroupFilter('政策研究');
act(() => {
  policyFilter.querySelector('.lit-group-filter-name').click();
});
if (container.querySelectorAll('.lit-paper-row').length !== 2) throw new Error('single-select policy failed');
if (getGroupFilter('可解释性').querySelector('input[type="checkbox"]').checked) throw new Error('single-select policy did not clear interp');

const allFilter = getGroupFilter('全部文献');
click(allFilter);
if (container.querySelectorAll('.lit-paper-row').length !== 8) throw new Error('clearing group filter failed');

// Multi-select checkboxes and bulk bar.
const paperChecks = container.querySelectorAll('.lit-paper-row-check input[type="checkbox"]');
if (paperChecks.length < 2) throw new Error('paper checkboxes missing');
act(() => {
  paperChecks[1].click();
});
if (!container.textContent.includes('已选 2 篇')) throw new Error('multi-select bulk bar missing');

// Right-click context menu and bulk group assignment.
const firstRow = container.querySelector('.lit-paper-row-selected') || container.querySelector('.lit-paper-row');
act(() => {
  firstRow.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 240 }));
});
if (!container.querySelector('.lit-context-menu')) throw new Error('context menu not rendered');
const policyItem = Array.from(container.querySelectorAll('.lit-context-item')).find((item) => item.textContent.includes('政策研究'));
if (!policyItem) throw new Error('context menu group item missing');
click(policyItem);
if (!container.textContent.includes('已为 2 篇论文添加分组')) throw new Error('bulk group assignment failed');
const contextLayer = container.querySelector('.lit-context-layer');
if (contextLayer) {
  act(() => {
    contextLayer.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
}

// Group manager: create a new group.
const manageButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.trim() === '管理');
if (!manageButton) throw new Error('manage groups button missing');
click(manageButton);
if (!container.textContent.includes('管理分组标签')) throw new Error('group manager not rendered');
const managerDone = Array.from(container.querySelectorAll('.lit-modal-actions button')).find((button) => button.textContent.trim() === '完成');
if (!managerDone) throw new Error('group manager done button missing');
click(managerDone);

console.log('interaction OK');
console.log('toast:', container.querySelector('.lit-toast')?.textContent || '(none)');
console.log('storage keys:', Object.keys(window.localStorage));
