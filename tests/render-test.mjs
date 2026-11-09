import fs from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const source = fs.readFileSync('E:/DSH_Workspace/lit-demo/client.js', 'utf8');
let pluginFactory = null;

const storage = new Map();
const windowObject = {
  __ModuleLoader__: {
    load(entry) {
      pluginFactory = entry.factory;
    },
  },
  localStorage: {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, value);
    },
    removeItem(key) {
      storage.delete(key);
    },
  },
  isSecureContext: true,
  __DSH_LIT_CONFIG__: { apiBase: 'http://127.0.0.1:8765' },
  setTimeout,
  clearTimeout,
  confirm() {
    return true;
  },
};

const context = {
  window: windowObject,
  console,
  URL,
  Blob,
  setTimeout,
  clearTimeout,
  document: {
    createElement() {
      return { style: {}, click() {}, remove() {}, select() {} };
    },
    body: { appendChild() {} },
  },
  navigator: {},
};

vm.createContext(context);
vm.runInContext(source, context, { filename: 'client.js' });

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
const Sidebar = registrations.get('sidebar.panellist');
if (!Main) throw new Error('main component not registered');
if (!Sidebar) throw new Error('sidebar component not registered');

const html = renderToStaticMarkup(React.createElement(Main, { t: (key) => key }));
const checks = [
  ['root', 'data-testid="lit-root"'],
  ['title', '文献工作台'],
  ['paper', 'Geometric Inductive Bias'],
  ['claim', '主要发现'],
  ['connection banner', '未连接 litd'],
  ['tabs', '追踪'],
];
for (const [name, needle] of checks) {
  if (!html.includes(needle)) throw new Error(`missing ${name}: ${needle}`);
}
if (html.length < 10000) throw new Error(`suspiciously small render: ${html.length}`);

console.log(`render OK: ${html.length} chars`);
console.log(`main registrations: ${Array.from(registrations.keys()).join(', ')}`);
