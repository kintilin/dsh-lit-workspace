// Regression test: AI summary / AI scoring standards are user-editable and the
// first use shows a reminder to adjust them.
//
// Static checks cover the host prompt split, the litd criteria plumbing and the
// client settings tab. The runtime part mounts the plugin twice: first with no
// saved criteria (reminder modal + settings tab), then with a saved customized
// standard (no reminder, value restored).
//
// All requests are mocked; this test never touches the live litd database.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const TEST_DIR = fileURLToPath(new URL('.', import.meta.url));
const SOURCE = process.env.LIT_CLIENT_SOURCE || fileURLToPath(new URL('../src/client/client.js', import.meta.url));
const HOST_SOURCE = fs.readFileSync(fileURLToPath(new URL('../src/host/index.js', import.meta.url)), 'utf8');
const LITD_SOURCE = fs.readFileSync(fileURLToPath(new URL('../src/service/litd.mjs', import.meta.url)), 'utf8');
const SETTINGS_KEY = 'dsh-lit-settings-v1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

// --- static checks ---------------------------------------------------------
const hostChecks = [
  ['DEFAULT_SUMMARY_CRITERIA', 'host misses the default summary standard'],
  ['DEFAULT_SCORING_CRITERIA', 'host misses the default scoring standard'],
  ["const CRITERIA_ROUTE = '/lit-model/criteria-defaults'", 'host misses the defaults route'],
  ['customCriteria(payload,', 'host does not read the request criteria'],
  ["customCriteria(payload, 'summary')", 'summary criteria are not passed to the summary system prompt'],
  ["customCriteria(payload, 'scoring')", 'scoring criteria are not passed to the scoring prompts'],
];
for (const [needle, message] of hostChecks) {
  if (!HOST_SOURCE.includes(needle)) fail(message);
}
const litdChecks = [
  ['function getAiCriteria()', 'litd misses the criteria reader'],
  ['invalidateAiCriteriaCache()', 'litd never invalidates the criteria cache'],
  ['criteria: getAiCriteria(),', 'litd does not send the criteria to the model routes'],
];
for (const [needle, message] of litdChecks) {
  if (!LITD_SOURCE.includes(needle)) fail(message);
}
if ((LITD_SOURCE.match(/criteria: getAiCriteria\(\)/g) || []).length < 4) {
  fail('litd must send criteria for summarize, screen and both digest calls');
}

const source = fs.readFileSync(SOURCE, 'utf8');
const clientChecks = [
  ['AI 标准', 'client settings tab label missing'],
  ["'去设置 AI 标准'", 'first-use reminder action missing'],
  ['updateAiCriteria', 'client criteria update handler missing'],
  ['aiCriteria', 'client state does not carry aiCriteria'],
  ['/lit-model/criteria-defaults', 'client does not load the built-in defaults'],
];
for (const [needle, message] of clientChecks) {
  if (!source.includes(needle)) fail(message);
}

// --- runtime mount ---------------------------------------------------------
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
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

const DEFAULTS = {
  summary: 'DEFAULT SUMMARY STANDARD: focus on mechanism and methods.',
  scoring: 'DEFAULT SCORING STANDARD: 5 = new mechanism, 1 = news.',
};
const apiState = { settings: null };
const posted = [];
const jsonResponse = (payload) => ({ ok: true, status: 200, json: async () => payload });
const mockFetch = async (url, options = {}) => {
  const target = String(url);
  if (target.includes('/lit-model/criteria-defaults')) return jsonResponse({ ok: true, ...DEFAULTS });
  if (target.includes('/api/ui-state?key=lit-settings')) {
    return jsonResponse({ ok: true, key: 'lit-settings', value: apiState.settings, updated_at: null });
  }
  if (target.includes('/api/ui-state')) {
    posted.push(JSON.parse(options.body));
    return jsonResponse({ ok: true });
  }
  if (target.includes('/api/library')) return jsonResponse({ ok: true, source: 'litd', papers: [], groups: [] });
  if (target.includes('/api/feeds')) return jsonResponse({ ok: true, feeds: [], items: [] });
  if (target.includes('/api/tags')) return jsonResponse({ ok: true, tags: [] });
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

const click = (element) => {
  act(() => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })));
};
const settle = async (ms = 250) => {
  await act(async () => {
    await sleep(ms);
  });
};

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Main, { t: (key) => key }));
  });
  await settle(500);
  return { container, root };
}

// 1. first use: no saved criteria -> reminder modal + settings tab with defaults
{
  window.localStorage.clear();
  apiState.settings = null;
  const { container, root } = await mount();
  const tip = container.querySelector('.lit-confirm-modal');
  if (!tip || !container.textContent.includes('先按你的研究方向定一下 AI 标准')) {
    fail('first-use AI criteria reminder did not appear');
  }
  const settingsButton = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent.trim() === '去设置 AI 标准'
  );
  if (!settingsButton) fail('reminder is missing the settings shortcut');
  click(settingsButton);
  await settle(300);
  const modal = container.querySelector('.lit-settings-modal');
  if (!modal) fail('settings modal did not open from the reminder');
  const aiTab = Array.from(container.querySelectorAll('.lit-settings-tab')).find(
    (button) => button.textContent.trim() === 'AI 标准'
  );
  if (!aiTab) fail('AI 标准 tab missing from settings');
  if (!String(aiTab.className).includes('active')) fail('AI 标准 tab should be selected from the reminder');
  await settle(200);
  const textareas = Array.from(container.querySelectorAll('.lit-ai-criteria-input'));
  if (textareas.length !== 2) fail(`expected 2 criteria inputs, got ${textareas.length}`);
  if (textareas[0].value !== DEFAULTS.summary) fail('summary textarea did not show the built-in default');
  if (textareas[1].value !== DEFAULTS.scoring) fail('scoring textarea did not show the built-in default');

  // edit the summary standard -> persisted locally and flushed to the backend
  const propsKey = Object.keys(textareas[0]).find((key) => key.startsWith('__reactProps'));
  act(() => {
    textareas[0][propsKey].onChange({ target: { value: 'MY CUSTOM SUMMARY STANDARD' } });
  });
  await settle(150);
  const local = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}');
  if (local.aiCriteria?.summary !== 'MY CUSTOM SUMMARY STANDARD') {
    fail('edited summary standard was not written to localStorage');
  }
  if (local.aiCriteria?.customized !== true) fail('edited standard was not marked as customized');
  const postedBefore = posted.length;
  window.dispatchEvent(new window.Event('pagehide'));
  await settle(150);
  const flushed = posted.slice(postedBefore).map((entry) => entry.value).filter(Boolean).pop();
  if (!flushed || flushed.aiCriteria?.summary !== 'MY CUSTOM SUMMARY STANDARD') {
    fail('edited standard was not flushed to the backend settings');
  }
  await act(async () => root.unmount());
}

// 2. later use: saved customized standard -> no reminder, value restored
{
  window.localStorage.clear();
  apiState.settings = {
    sectionPresets: null,
    groupTemplates: null,
    aiCriteria: {
      summary: 'SAVED CUSTOM SUMMARY STANDARD',
      scoring: 'SAVED CUSTOM SCORING STANDARD',
      customized: true,
    },
    savedAt: Date.now(),
  };
  const { container, root } = await mount();
  if (container.textContent.includes('先按你的研究方向定一下 AI 标准')) {
    fail('first-use reminder should not appear once a custom standard is saved');
  }
  const settingsButton = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent.trim() === '设置'
  );
  if (!settingsButton) fail('settings button missing');
  click(settingsButton);
  await settle(300);
  const aiTab = Array.from(container.querySelectorAll('.lit-settings-tab')).find(
    (button) => button.textContent.trim() === 'AI 标准'
  );
  if (!aiTab) fail('AI 标准 tab missing from settings');
  click(aiTab);
  await settle(250);
  const textareas = Array.from(container.querySelectorAll('.lit-ai-criteria-input'));
  if (textareas.length !== 2) fail(`expected 2 criteria inputs, got ${textareas.length}`);
  if (textareas[0].value !== 'SAVED CUSTOM SUMMARY STANDARD') {
    fail(`saved summary standard was not restored: ${textareas[0].value.slice(0, 60)}`);
  }
  if (textareas[1].value !== 'SAVED CUSTOM SCORING STANDARD') {
    fail('saved scoring standard was not restored');
  }
  await act(async () => root.unmount());
}

console.log('ai criteria OK');
console.log('host defaults route, litd criteria plumbing and client reminder/tab verified');
