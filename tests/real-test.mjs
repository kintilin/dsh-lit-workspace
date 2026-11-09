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
if (!realButton) { console.log('BUTTONS', Array.from(container.querySelectorAll('button')).map(b=>b.textContent.trim()).filter(Boolean).slice(0,20)); console.log('TEXT', container.textContent.slice(0,500)); throw new Error('real library refresh button missing'); }
click(realButton);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1800));
});
const feedSnapshot = await (await fetch('http://127.0.0.1:8765/api/feeds')).json();

if (!container.querySelector('.lit-paper-row')) throw new Error('real paper rows missing');
if (container.textContent.includes('真实库') || container.textContent.includes('演示库')) throw new Error('legacy data-source wording still visible');
if (!container.textContent.includes('Codon usage')) throw new Error('real group missing');
if (!container.querySelector('.lit-journal-badge')) throw new Error('journal badge missing from paper cards');
if (!container.querySelector('.lit-if-tag')) throw new Error('IF tag missing from paper cards');
const searchInput = container.querySelector('input[aria-label="搜索文献"]');
if (!searchInput) throw new Error('search input missing');
const searchPropsKey = Object.keys(searchInput).find((key) => key.startsWith('__reactProps'));
const typeQuery = async (value) => {
  act(() => {
    searchInput[searchPropsKey].onChange({ target: { value } });
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 700));
  });
};
await typeQuery('optimal codons increase the speed');
if (container.querySelectorAll('.lit-paper-row').length !== 1) throw new Error('FTS search did not narrow to one paper');
if (!container.textContent.includes('Synonymous but not Silent')) throw new Error('FTS search lost expected paper');
const snippet = container.querySelector('.lit-paper-row-snippet');
if (!snippet || !/optimal|codons/i.test(snippet.textContent)) throw new Error('FTS snippet missing');
await typeQuery('HebQTLs');
if (!container.textContent.includes('HebQTLs')) throw new Error('FTS search missed imported paper');
await typeQuery('');

const autoRow = Array.from(container.querySelectorAll('.lit-paper-row')).find((row) =>
  row.textContent.includes('HebQTLs')
);
if (!autoRow) throw new Error('auto-summary paper row missing');
click(autoRow);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});
if (!container.textContent.includes('AI 总结')) throw new Error('AI summary status missing');
if (container.querySelectorAll('.lit-section-card').length < 5) throw new Error('AI summary sections missing');
if (container.textContent.includes('标记为已总结')) {
  const acceptButton = Array.from(container.querySelectorAll('.lit-summary-actions button')).find((button) => button.textContent.includes('标记为已总结'));
  if (!acceptButton) throw new Error('accept button missing');
  click(acceptButton);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 700));
  });
  const acceptedLibrary = await (await fetch('http://127.0.0.1:8765/api/library')).json();
  const acceptedPaper = acceptedLibrary.papers.find((item) => item.title.includes('HebQTLs'));
  if (acceptedPaper?.status !== '已总结') throw new Error('accept summary did not persist');
  const withdrawButton = Array.from(container.querySelectorAll('.lit-summary-actions button')).find((button) => button.textContent.includes('撤回已总结'));
  if (!withdrawButton) throw new Error('withdraw button missing');
  click(withdrawButton);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 700));
  });
} else if (!container.textContent.includes('撤回已总结')) {
  throw new Error('summary review state controls missing');
}

const synRow = Array.from(container.querySelectorAll('.lit-paper-row')).find((row) =>
  row.textContent.includes('Synonymous but not Silent')
);
if (!synRow) throw new Error('real paper row missing');
click(synRow);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});
if (!container.textContent.includes('Synonymous but not Silent')) throw new Error('real paper title missing');
if (container.querySelectorAll('.lit-section-card').length < 5) throw new Error('real summary sections missing');

const aiButton = Array.from(container.querySelectorAll('.lit-summary-actions button')).find((button) => button.textContent.includes('AI 总结'));
if (!aiButton) throw new Error('AI summary action missing for non-AI paper');

const editButton = Array.from(container.querySelectorAll('.lit-paper-actions button')).find((button) => button.textContent.includes('编辑信息'));
if (!editButton) throw new Error('edit metadata button missing');
click(editButton);
if (!container.querySelector('.lit-edit-modal')) throw new Error('edit metadata modal missing');
const cancelEdit = Array.from(container.querySelectorAll('.lit-edit-modal .lit-btn')).find((button) => button.textContent.trim() === '取消');
if (!cancelEdit) throw new Error('edit cancel missing');
click(cancelEdit);

const selectAll = container.querySelector('.lit-select-all input');
if (!selectAll) throw new Error('select-all checkbox missing');
click(selectAll);
const bulkDelete = container.querySelector('.lit-bulk-danger');
if (!bulkDelete) throw new Error('bulk delete button missing');
click(bulkDelete);
if (!container.querySelector('.lit-confirm-modal')) throw new Error('delete confirm modal missing');
const cancelDelete = Array.from(container.querySelectorAll('.lit-confirm-modal .lit-btn')).find((button) => button.textContent.trim() === '取消');
if (!cancelDelete) throw new Error('delete cancel missing');
click(cancelDelete);
click(synRow);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});

const discoverButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.trim() === '发现');
if (!discoverButton) throw new Error('discover button missing');
click(discoverButton);
if (!container.querySelector('.lit-discovery-modal')) throw new Error('discovery modal missing');
const sourceSelect = container.querySelector('.lit-discovery-source');
if (!sourceSelect || sourceSelect.options.length < 3) throw new Error('discovery source selector missing');
const closeDiscovery = container.querySelector('.lit-discovery-modal .lit-icon-btn');
if (!closeDiscovery) throw new Error('discovery close missing');
click(closeDiscovery);

const importButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.trim() === '导入');
if (!importButton) throw new Error('import button missing');
click(importButton);
if (!container.querySelector('.lit-import-modal')) throw new Error('import modal missing');
if (!container.querySelector('.lit-dropzone')) throw new Error('import dropzone missing');
if (!container.querySelector('.lit-dropzone input[type="file"]')) throw new Error('import file input missing');
const cancelImport = Array.from(container.querySelectorAll('.lit-import-modal .lit-btn')).find((button) => button.textContent.trim() === '取消');
if (!cancelImport) throw new Error('import cancel missing');
click(cancelImport);

const evidenceChip = Array.from(container.querySelectorAll('.lit-evidence-chip')).find((button) => button.textContent.includes('p.1'));
if (!evidenceChip) throw new Error('real evidence chip missing');
click(evidenceChip);
if (!container.querySelector('.lit-evidence')) throw new Error('evidence panel missing');
if (!container.textContent.includes('bbox [108')) throw new Error('real bbox missing in evidence panel');

const pdfButton = Array.from(container.querySelectorAll('.lit-paper-actions button')).find((button) => button.textContent.includes('内嵌预览'));
if (!pdfButton) throw new Error('in-app PDF button missing');
click(pdfButton);
const pdfModal = container.querySelector('.lit-pdf-modal');
if (!pdfModal) throw new Error('in-app PDF modal missing');
const frame = pdfModal.querySelector('iframe');
if (!frame || !frame.src.includes('/api/papers/') || !frame.src.includes('#page=1')) throw new Error('PDF iframe src wrong');
click(pdfModal.querySelector('.lit-icon-btn'));

const lineageRow = Array.from(container.querySelectorAll('.lit-paper-row')).find((row) => row.textContent.includes('Lineage-Associated'));
if (!lineageRow) throw new Error('metadata-only paper missing');
click(lineageRow);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});
const metadataAiButton = Array.from(container.querySelectorAll('.lit-summary-actions button')).find((button) => button.textContent.includes('AI 总结'));
if (!metadataAiButton) throw new Error('metadata AI button missing');
click(metadataAiButton);
if (!container.querySelector('.lit-metadata-modal')) throw new Error('metadata-only modal missing');
if (!container.textContent.includes('这篇文献目前只有元数据')) throw new Error('metadata-only copy missing');
if (!container.querySelector('.lit-metadata-source a')) throw new Error('metadata source link missing');
const closeMetadata = container.querySelector('.lit-metadata-modal .lit-icon-btn');
click(closeMetadata);

const trackingTab = Array.from(container.querySelectorAll('.lit-tabs button')).find((button) => button.textContent.includes('追踪'));
if (!trackingTab) throw new Error('tracking tab missing');
click(trackingTab);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1200));
});
if (!container.querySelector('.lit-tracking')) throw new Error('tracking pane missing');
if (!container.querySelector('.lit-feed-button')) throw new Error('tracking feed source missing');
if (!container.querySelector('.lit-feed-card')) throw new Error('tracking feed card missing');
const detailButton = container.querySelector('.lit-feed-detail-btn');
if (!detailButton) throw new Error('tracking detail button missing');
click(detailButton);
if (!container.querySelector('.lit-feed-detail-modal')) throw new Error('tracking detail modal missing');
click(container.querySelector('.lit-feed-detail-modal .lit-icon-btn'));

const readAll = Array.from(container.querySelectorAll('.lit-tracking-bulk button')).find((button) => button.textContent.trim() === '全部已读');
if (!readAll) throw new Error('read-all button missing');
click(readAll);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 900));
});
if (!container.querySelector('.lit-feed-card-read')) throw new Error('read-all did not gray cards');
const undoReadAll = Array.from(container.querySelectorAll('.lit-tracking-bulk button')).find((button) => button.textContent.trim() === '全部未读');
if (!undoReadAll) throw new Error('all-unread button missing');
click(undoReadAll);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 900));
});
const currentFeeds = await (await fetch('http://127.0.0.1:8765/api/feeds')).json();
const currentRead = new Map((currentFeeds.items || []).map((item) => [item.id, item.read]));
for (const item of feedSnapshot.items || []) {
  if (currentRead.get(item.id) !== item.read) {
    await fetch(`http://127.0.0.1:8765/api/feed-items/${encodeURIComponent(item.id)}/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ read: Boolean(item.read) }),
    });
  }
}

const graphTab = Array.from(container.querySelectorAll('.lit-tabs button')).find((button) => button.textContent.includes('网络图'));
if (!graphTab) throw new Error('graph tab missing');
click(graphTab);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1400));
});
if (!container.querySelector('.lit-graph')) throw new Error('graph pane missing');
if (!container.querySelector('.lit-graph-canvas svg')) throw new Error('graph svg missing');
if (!container.textContent.includes('codon / usage')) throw new Error('real graph cluster label missing');
const graphModeSelect = container.querySelector('.lit-graph-controls select');
if (!graphModeSelect) throw new Error('graph mode select missing');
const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
selectSetter.call(graphModeSelect, 'groups');
graphModeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1200));
});
if (!container.textContent.includes('Codon usage')) throw new Error('group cluster label missing');

console.log('real library OK');
console.log('pdf frame:', frame.src);
console.log('title:', container.querySelector('.lit-paper-title')?.textContent);
console.log('sections:', container.querySelectorAll('.lit-section-card').length);
console.log('groups:', Array.from(container.querySelectorAll('.lit-group-filter-name')).map((el) => el.textContent).join(', '));
