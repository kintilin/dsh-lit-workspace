import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const servicePath = path.join(here, 'service', 'litd.mjs');
const ROUTE = '/lit-model/summarize';
const SCREEN_ROUTE = '/lit-model/screen';
const DIGEST_ROUTE = '/lit-model/digest';
const SEARCH_PLAN_ROUTE = '/lit-model/search-plan';
const AUTHOR_NORMALIZE_ROUTE = '/lit-model/author-normalize';
const LITD_URL = process.env.LITD_URL || 'http://127.0.0.1:8765';
const MAX_BODY = 5 * 1024 * 1024;
const MAX_PROMPT_CHARS = 90000;
const CRITERIA_ROUTE = '/lit-model/criteria-defaults';
const MAX_CRITERIA_CHARS = 4000;

const DEFAULT_SCORING_CRITERIA = `评分标准：
5 星：提出此前未知的新机制、新元件类型、新原理或新概念，并有明确实验/分析支持，具有普遍意义。
4 星：明确的新发现或新方法，有较强证据，但适用范围或普适性有限。
3 星：有增量新意，或把已有机制扩展到新体系；也可能是有价值的新资源。
2 星：资源型、描述型、数据集、组装、测序、图谱、数据库；即使规模很大，也不因“工作量大”升星。
1 星：新闻、评论、观点、会议报道、重复性工作、宣传稿、与论文无关的内容。

硬性规则：
- 资源型/描述型工作最高 2 星。
- 新闻/评论最高 1 星。
- 没有摘要或只有标题时仍然可以给高分：不要仅因为缺少摘要扣星，但必须降低 confidence，并在 why_not_higher 中说明“信息有限”。
- 不要因为期刊、影响因子或作者名气给高分。
- 必须说明“为什么不是更高一星”。`;

const SCREEN_SYSTEM = `你是一名严谨的文献筛选助手。你要判断每条新增文献/资讯是否值得研究者关注，并按“新颖性”给 1–5 星。
你不是在总结论文，而是在做新颖性初筛。

只输出一个 JSON 对象，不要 Markdown 代码围栏，不要解释：
{
  "items": [
    {
      "id": "输入中的 id",
      "stars": 1,
      "type": "new_mechanism | new_finding | new_method | resource | news | comment | unknown",
      "reason": "一句话说明新颖点",
      "why_not_higher": "一句话说明限制",
      "confidence": 0.0
    }
  ]
}
每条输入必须对应一个输出 item，id 必须逐字一致。`;

const SEARCH_PLAN_SYSTEM = `你是学术检索助手。把用户的中文或自然语言需求转成 2-3 条英文检索式，用于 Europe PMC 和 arXiv。

只输出 JSON：
{ "queries": ["english query 1", "english query 2"], "keywords": ["keyword 1", "keyword 2"] }

要求：
- 检索式短、具体，2-6 个英文词，不要整句翻译。
- 保留核心对象、机制、方法；不要加入用户没说的限定。
- 不要输出 JSON 之外的内容。`;

function buildSearchPlanPrompt(payload) {
  return `用户检索需求：
${String(payload.query || '').trim()}`;
}

const AUTHOR_NORMALIZE_SYSTEM = `你是学术作者检索助手。把中文姓名和单位转换为英文学术检索写法。

只输出 JSON：
{ "name": "Wei Zhang", "institution": "Example University", "aliases": ["Wei Zhang", "Zhang Wei"] }

要求：
- name 用西方名前姓后的写法；aliases 同时给出姓前名后和常见缩写。
- institution 用英文官方名；不确定时保留原文。
- 不要输出 JSON 之外的内容。`;

function buildAuthorNormalizePrompt(payload) {
  return `姓名：${String(payload.name || '').trim()}
单位：${String(payload.institution || '').trim()}`;
}

const DIGEST_SYSTEM = `你是研究检索助手。用户会给出一个检索需求，以及一批候选文献的标题、摘要、期刊和年份。
请从候选里挑选真正相关的条目，把每条压缩成适合阅读的卡片。

只根据输入判断，不补充外部知识，不编造论文、数字或结论。
输出必须是单个 JSON 对象，不要 Markdown 代码围栏，不要解释：

{
  "cards": [
    {
      "id": "输入中的 id",
      "summary": "2-3 句中文概述：研究了什么、用了什么方法、最关键结论",
      "why_relevant": "一句话说明为什么符合用户需求",
      "tags": ["2-4 个短标签"],
      "stars": 1
    }
  ]
}

要求：
- 只返回真正相关的候选；没有相关条目就返回空 cards。
- summary 用中文，具体，不要空话。
- stars 是 1-5 的新颖性评分，按“评分标准”判断。
- 不要输出输入中不存在的论文。
- 不要输出 JSON 之外的任何字符。`;

const ALL_DIGEST_SYSTEM = `你是文献卡片编辑。用户会给出一个作者和该作者的一批论文。
请为每一条输入论文生成一张卡片摘要，不要筛选、不要遗漏任何 id。

只输出 JSON：
{
  "cards": [
    {
      "id": "输入中的 id",
      "summary": "2-3 句中文：研究了什么、方法、关键结论",
      "why_relevant": "一句话说明这篇论文的主要贡献",
      "tags": ["2-4 个短标签"],
      "stars": 1
    }
  ]
}

要求：
- 必须为每个输入 id 返回一张卡。
- 摘要必须基于输入的标题和摘要，不补充外部知识，不编造。
- stars 是 1-5 的新颖性评分，按“评分标准”判断。
- summary 控制在 80 字以内。
- 不要输出 JSON 之外的任何字符。`;

function buildDigestPrompt(payload) {
  const items = (Array.isArray(payload.items) ? payload.items : []).map((item) => ({
    id: String(item.id || ''),
    title: String(item.title || ''),
    abstract: String(item.abstract || '').slice(0, 1400),
    journal: String(item.journal || ''),
    year: String(item.year || ''),
    source: String(item.source || ''),
  }));
  return `用户检索需求：
${String(payload.query || '').trim()}

候选文献：
${JSON.stringify(items, null, 2)}`;
}

function buildScreenPrompt(payload) {
  const items = (Array.isArray(payload.items) ? payload.items : []).map((item) => ({
    id: String(item.id || ''),
    title: String(item.title || ''),
    abstract: String(item.abstract || '').slice(0, 1200),
    source: String(item.source || ''),
    kind: String(item.kind || ''),
  }));
  return `请对以下条目做新颖性评分。每条只根据给出的标题、摘要或元数据判断，不要补充外部知识。

${JSON.stringify(items, null, 2)}`;
}

const DEFAULT_SUMMARY_CRITERIA = `- 只根据论文文本总结：不补充外部知识，不编造数字、结论或引文。
- 面向科研阅读，写清研究问题/假设、方法与范围（设计、材料、数据或综述范围）、相互独立的主要发现、作者明确承认的局限（没有就写“作者未明确讨论局限”）和核心结论/主张。
- text 用中文，尽量具体，不要空话；每条不超过 120 字。`;

const SYSTEM = `你是一名严谨的文献总结助手。你只根据用户给出的论文文本总结，不补充外部知识，不编造数字、结论或引文。
输出必须是单个 JSON 对象，不要 Markdown 代码围栏，不要解释。

JSON 结构：
{
  "sections": [
    {
      "key": "question",
      "title": "研究问题",
      "type": "text",
      "entries": [
        { "text": "中文总结", "quote": "原文中逐字连续的一句英文，必须能在文本中找到" }
      ]
    }
  ]
}

必须包含以下 5 个 section，按顺序：
1. key="question", title="研究问题"：1 条，说明研究问题/假设。
2. key="method", title="方法与范围"：1 条，说明研究设计、材料、数据或综述范围。
3. key="findings", title="主要发现"：2-3 条，每条一个独立发现。
4. key="limitations", title="局限"：1-2 条；若文本没有明确局限，写"作者未明确讨论局限"且 quote 留空。
5. key="conclusion", title="结论"：1 条，说明作者的核心结论/主张。

硬性要求：
- quote 必须是输入文本中逐字连续的英文片段；宁可留空，也不要改写或拼接；每条不超过 180 字符。
- 不要输出 page 字段；页码由系统定位。
- 不要输出 JSON 之外的任何字符。`;

function customCriteria(payload, key) {
  const criteria = payload && typeof payload.criteria === 'object' ? payload.criteria : null;
  const value = criteria && typeof criteria[key] === 'string' ? criteria[key] : '';
  return value.replace(/\r\n?/g, '\n').trim().slice(0, MAX_CRITERIA_CHARS);
}

function systemWithCriteria(base, heading, custom, fallback) {
  const text = custom || String(fallback || '').trim();
  if (!text) return base;
  return `${base}\n\n${heading}\n${text}`;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(new Error(`invalid JSON: ${error.message}`));
      }
    });
    req.on('error', reject);
  });
}

function buildPrompt(payload, maxChars = MAX_PROMPT_CHARS) {
  const title = String(payload.title || 'Untitled');
  const authors = String(payload.authors || 'Unknown');
  const abstract = String(payload.abstract || '').trim();
  let used = 0;
  const parts = [];
  for (const page of Array.isArray(payload.pages) ? payload.pages : []) {
    const text = String(page.text || '').trim();
    if (!text) continue;
    const block = `\n\n[PAGE ${page.page}]\n${text}`;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  return `论文标题：${title}\n作者：${authors}\n\n摘要：\n${abstract || '(未提取到摘要)'}\n\n正文（按 PDF 页）：${parts.join('')}`;
}

function extractJson(text) {
  const cleaned = String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('model did not return a JSON object');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeSections(rawSections) {
  const allowed = new Set(['question', 'method', 'findings', 'limitations', 'conclusion']);
  const sections = [];
  for (const raw of Array.isArray(rawSections) ? rawSections : []) {
    if (!raw || !allowed.has(raw.key)) continue;
    const entries = (Array.isArray(raw.entries) ? raw.entries : [])
      .map((entry) => ({
        text: String(entry?.text || '').trim(),
        quote: String(entry?.quote || '').trim(),
      }))
      .filter((entry) => entry.text);
    if (entries.length === 0) continue;
    sections.push({
      key: raw.key,
      title: String(raw.title || raw.key),
      type: 'text',
      owner: 'ai',
      entries,
    });
  }
  if (sections.length === 0) throw new Error('model returned no usable sections');
  return sections;
}

export const inject = ['webServer', 'llm', 'agentDefaultModel', 'clientModules'];

async function waitForHealth(baseUrl, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return true;
    } catch (error) {
      // Service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

export function apply(ctx, config = {}) {
  let litdChild = null;
  const startService = (async () => {
    if (process.env.LITD_URL) return;
    if (!fs.existsSync(servicePath)) return;
    if (await waitForHealth('http://127.0.0.1:8765', 1500)) return;
    const profileDir =
      process.env.DSH_PROFILE_DIR ||
      path.join(os.homedir(), '.dsh', 'profiles', process.env.DSH_PROFILE || 'desktop');
    const dataDir = process.env.DSH_LIT_DATA_DIR || path.join(profileDir, 'lit-data');
    fs.mkdirSync(dataDir, { recursive: true });
    litdChild = spawn(process.execPath, [servicePath], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        LITD_PORT: '8765',
        LITD_DATA_DIR: dataDir,
        DSH_WEB_URL: ctx.webServer.getOrigin(),
      },
      stdio: 'ignore',
      windowsHide: true,
    });
    litdChild.on('exit', () => {
      litdChild = null;
    });
    const ready = await waitForHealth('http://127.0.0.1:8765');
    if (!ready) console.error('[dsh-lit] litd did not become ready');
  })().catch((error) => {
    console.error('[dsh-lit] failed to start litd:', error.message);
  });
  ctx.effect(() => () => {
    if (litdChild) {
      try {
        litdChild.kill();
      } catch (error) {
        // Best-effort cleanup.
      }
      litdChild = null;
    }
  });

  const proxyRoute = ctx.webServer.register({
    kind: 'prefix',
    path: '/lit-data',
    handler: async (req, res) => {
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        const target = `${LITD_URL}${String(req.url || '').replace(/^\/lit-data/, '') || '/api/health'}`;
        const headers = { ...req.headers };
        delete headers.host;
        delete headers.connection;
        delete headers['content-length'];
        delete headers['transfer-encoding'];
        const upstream = await fetch(target, {
          method: req.method,
          headers,
          ...(body.length && req.method !== 'GET' && req.method !== 'HEAD' ? { body } : {}),
        });
        const buffer = Buffer.from(await upstream.arrayBuffer());
        const responseHeaders = {};
        for (const name of ['content-type', 'content-disposition', 'cache-control']) {
          const value = upstream.headers.get(name);
          if (value) responseHeaders[name] = value;
        }
        responseHeaders['content-length'] = buffer.length;
        res.writeHead(upstream.status, responseHeaders);
        res.end(buffer);
      } catch (error) {
        sendJson(res, 502, { ok: false, error: `litd proxy failed: ${error.message}` });
      }
    },
  });
  ctx.effect(() => proxyRoute);

  const translateRoute = ctx.webServer.register({
    kind: 'exact',
    path: '/lit-model/translate',
    handler: async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST,OPTIONS',
          'access-control-allow-headers': 'content-type',
        });
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST required' });
        return;
      }
      try {
        const payload = await readJson(req);
        const translator = ctx.get?.('translator') || ctx.translator;
        if (!translator) throw new Error('内置翻译服务不可用，请启用 DSH 翻译插件');
        const providers = await translator.availableProviders();
        const preferred =
          providers.find((provider) => provider.id === payload.provider) ||
          providers.find((provider) => provider.id === 'bing') ||
          providers[0];
        if (!preferred) throw new Error('没有可用的翻译服务');
        const maxChars = Number(translator.maxTextChars) || 4000;
        const targetLanguage = String(payload.targetLanguage || 'zh');
        const translateOne = async (value) => {
          const text = String(value || '').trim();
          if (!text) return '';
          let translated = '';
          for (let offset = 0; offset < text.length; offset += maxChars) {
            const spec = translator.resolve({
              text: text.slice(offset, offset + maxChars),
              targetLanguage,
              provider: preferred.id,
            });
            translated += await translator.translate(spec);
          }
          return translated;
        };
        if (Array.isArray(payload.texts)) {
          const texts = payload.texts.slice(0, 80).map((value) => String(value || ''));
          const output = [];
          for (const value of texts) output.push(await translateOne(value));
          sendJson(res, 200, { ok: true, texts: output, provider: preferred.id });
          return;
        }
        const text = String(payload.text || '').trim();
        if (!text) throw new Error('text is empty');
        sendJson(res, 200, { ok: true, text: await translateOne(text), provider: preferred.id });
      } catch (error) {
        sendJson(res, 502, { ok: false, error: error.message });
      }
    },
  });
  ctx.effect(() => translateRoute);

  const route = ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST,OPTIONS',
          'access-control-allow-headers': 'content-type',
        });
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST required' });
        return;
      }
      let timer;
      try {
        const payload = await readJson(req);
        const selection = ctx.agentDefaultModel.currentSelection();
        if (!selection?.provider || !selection?.model) {
          throw new Error('no default model selection is configured');
        }
        const summarySystem = systemWithCriteria(
          SYSTEM,
          '用户自定义的总结标准（在满足上面的输出格式与引文要求的前提下优先遵循）：',
          customCriteria(payload, 'summary'),
          DEFAULT_SUMMARY_CRITERIA
        );
        const callModel = async (prompt) => {
          const controller = new AbortController();
          timer = setTimeout(() => controller.abort(), 120000);
          let text = '';
          let usage = null;
          const stream = ctx.llm.stream({
            provider: selection.provider,
            model: selection.model,
            ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}),
            temperature: 0.2,
            maxTokens: 8000,
            system: summarySystem,
            messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
            signal: controller.signal,
          });
          for await (const chunk of stream) {
            if (chunk.type === 'text-delta') text += chunk.text;
            if (chunk.type === 'usage') usage = chunk.usage;
            if (chunk.type === 'finish') {
              if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
                throw new Error(chunk.reason.failure?.message || `model call ${chunk.reason.kind}`);
              }
            }
          }
          return { text, usage };
        };
        let result = await callModel(buildPrompt(payload));
        if (!result.text.trim()) {
          result = await callModel(buildPrompt(payload, 30000));
        }
        const { text, usage } = result;
        if (!text.trim()) throw new Error('model returned an empty response');
        const parsed = extractJson(text);
        const sections = normalizeSections(parsed.sections);
        sendJson(res, 200, {
          ok: true,
          provider: selection.provider,
          model: selection.model,
          usage,
          summary: { sections },
        });
      } catch (error) {
        sendJson(res, 502, { ok: false, error: error.message });
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  });

  ctx.effect(() => route);

  const screenRoute = ctx.webServer.register({
    kind: 'exact',
    path: SCREEN_ROUTE,
    handler: async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST,OPTIONS',
          'access-control-allow-headers': 'content-type',
        });
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST required' });
        return;
      }
      let timer;
      try {
        const payload = await readJson(req);
        const items = Array.isArray(payload.items) ? payload.items.slice(0, 40) : [];
        if (items.length === 0) throw new Error('items required');
        const prompt = buildScreenPrompt({ ...payload, items });

        const scoringSystem = systemWithCriteria(
          SCREEN_SYSTEM,
          '评分标准（用户自定义；仍然只输出上面的 JSON，stars 必须是 1-5 的整数）：',
          customCriteria(payload, 'scoring'),
          DEFAULT_SCORING_CRITERIA
        );
        const selection = ctx.agentDefaultModel.currentSelection();
        if (!selection?.provider || !selection?.model) {
          throw new Error('no default model selection is configured');
        }
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(), 180000);
        let text = '';
        let usage = null;
        const stream = ctx.llm.stream({
          provider: selection.provider,
          model: selection.model,
          ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}),
          temperature: 0.1,
          maxTokens: 5000,
          system: scoringSystem,
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
          signal: controller.signal,
        });
        for await (const chunk of stream) {
          if (chunk.type === 'text-delta') text += chunk.text;
          if (chunk.type === 'usage') usage = chunk.usage;
          if (chunk.type === 'finish') {
            if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
              throw new Error(chunk.reason.failure?.message || `model call ${chunk.reason.kind}`);
            }
          }
        }
        if (!text.trim()) throw new Error('model returned an empty response');
        const parsed = extractJson(text);
        const results = (Array.isArray(parsed.items) ? parsed.items : [])
          .map((item) => ({
            id: String(item.id || ''),
            stars: Math.max(1, Math.min(5, Number(item.stars) || 1)),
            type: String(item.type || 'unknown'),
            reason: String(item.reason || '').slice(0, 500),
            why_not_higher: String(item.why_not_higher || '').slice(0, 500),
            confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
          }))
          .filter((item) => item.id);
        if (results.length === 0) throw new Error('model returned no scored items');
        sendJson(res, 200, {
          ok: true,
          provider: selection.provider,
          model: selection.model,
          usage,
          items: results,
        });
      } catch (error) {
        sendJson(res, 502, { ok: false, error: error.message });
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  });
  ctx.effect(() => screenRoute);

  const digestRoute = ctx.webServer.register({
    kind: 'exact',
    path: DIGEST_ROUTE,
    handler: async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST,OPTIONS',
          'access-control-allow-headers': 'content-type',
        });
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST required' });
        return;
      }
      let timer;
      try {
        const payload = await readJson(req);
        const items = Array.isArray(payload.items)
          ? payload.items.slice(0, payload.mode === 'all' ? 30 : 12)
          : [];
        if (!String(payload.query || '').trim()) throw new Error('query required');
        if (items.length === 0) throw new Error('items required');
        const prompt = buildDigestPrompt({ ...payload, items });
        const selection = ctx.agentDefaultModel.currentSelection();
        if (!selection?.provider || !selection?.model) {
          throw new Error('no default model selection is configured');
        }
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(), 180000);
        let text = '';
        let usage = null;
        const stream = ctx.llm.stream({
          provider: selection.provider,
          model: selection.model,
          ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}),
          temperature: 0.2,
          maxTokens: payload.mode === 'all' ? 8000 : 4500,
          system: systemWithCriteria(
            payload.mode === 'all' ? ALL_DIGEST_SYSTEM : DIGEST_SYSTEM,
            '评分标准（用户自定义；仍然只输出上面的 JSON）：',
            customCriteria(payload, 'scoring'),
            DEFAULT_SCORING_CRITERIA
          ),
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
          signal: controller.signal,
        });
        for await (const chunk of stream) {
          if (chunk.type === 'text-delta') text += chunk.text;
          if (chunk.type === 'usage') usage = chunk.usage;
          if (chunk.type === 'finish') {
            if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
              throw new Error(chunk.reason.failure?.message || `model call ${chunk.reason.kind}`);
            }
          }
        }
        if (!text.trim()) throw new Error('model returned an empty response');
        const parsed = extractJson(text);
        const cards = (Array.isArray(parsed.cards) ? parsed.cards : [])
          .map((card) => ({
            id: String(card.id || ''),
            summary: String(card.summary || '').slice(0, 1200),
            why_relevant: String(card.why_relevant || '').slice(0, 500),
            tags: (Array.isArray(card.tags) ? card.tags : []).map((tag) => String(tag).slice(0, 40)).slice(0, 5),
            stars: Math.max(1, Math.min(5, Number(card.stars) || 1)),
          }))
          .filter((card) => card.id && card.summary);
        sendJson(res, 200, {
          ok: true,
          provider: selection.provider,
          model: selection.model,
          usage,
          cards,
        });
      } catch (error) {
        sendJson(res, 502, { ok: false, error: error.message });
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  });
  ctx.effect(() => digestRoute);

  const planRoute = ctx.webServer.register({
    kind: 'exact',
    path: SEARCH_PLAN_ROUTE,
    handler: async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST,OPTIONS',
          'access-control-allow-headers': 'content-type',
        });
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST required' });
        return;
      }
      let timer;
      try {
        const payload = await readJson(req);
        if (!String(payload.query || '').trim()) throw new Error('query required');
        const selection = ctx.agentDefaultModel.currentSelection();
        if (!selection?.provider || !selection?.model) {
          throw new Error('no default model selection is configured');
        }
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(), 60000);
        let text = '';
        const stream = ctx.llm.stream({
          provider: selection.provider,
          model: selection.model,
          ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}),
          temperature: 0.1,
          maxTokens: 800,
          system: SEARCH_PLAN_SYSTEM,
          messages: [{ role: 'user', content: [{ type: 'text', text: buildSearchPlanPrompt(payload) }] }],
          signal: controller.signal,
        });
        for await (const chunk of stream) {
          if (chunk.type === 'text-delta') text += chunk.text;
          if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
            throw new Error(chunk.reason.failure?.message || `model call ${chunk.reason.kind}`);
          }
        }
        const parsed = extractJson(text);
        const queries = (Array.isArray(parsed.queries) ? parsed.queries : [])
          .map((query) => String(query || '').trim())
          .filter(Boolean)
          .slice(0, 3);
        const keywords = (Array.isArray(parsed.keywords) ? parsed.keywords : [])
          .map((keyword) => String(keyword || '').trim())
          .filter(Boolean)
          .slice(0, 5);
        if (!queries.length) throw new Error('model returned no search queries');
        sendJson(res, 200, { ok: true, queries, keywords });
      } catch (error) {
        sendJson(res, 502, { ok: false, error: error.message });
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  });
  ctx.effect(() => planRoute);

  const normalizeRoute = ctx.webServer.register({
    kind: 'exact',
    path: AUTHOR_NORMALIZE_ROUTE,
    handler: async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST,OPTIONS',
          'access-control-allow-headers': 'content-type',
        });
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST required' });
        return;
      }
      let timer;
      try {
        const payload = await readJson(req);
        if (!String(payload.name || '').trim()) throw new Error('name required');
        const selection = ctx.agentDefaultModel.currentSelection();
        if (!selection?.provider || !selection?.model) throw new Error('no default model selection is configured');
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(), 60000);
        let text = '';
        const stream = ctx.llm.stream({
          provider: selection.provider,
          model: selection.model,
          ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}),
          temperature: 0.1,
          maxTokens: 500,
          system: AUTHOR_NORMALIZE_SYSTEM,
          messages: [{ role: 'user', content: [{ type: 'text', text: buildAuthorNormalizePrompt(payload) }] }],
          signal: controller.signal,
        });
        for await (const chunk of stream) {
          if (chunk.type === 'text-delta') text += chunk.text;
          if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
            throw new Error(chunk.reason.failure?.message || `model call ${chunk.reason.kind}`);
          }
        }
        const parsed = extractJson(text);
        const name = String(parsed.name || '').trim();
        if (!name) throw new Error('model returned no name');
        sendJson(res, 200, {
          ok: true,
          name,
          institution: String(parsed.institution || '').trim(),
          aliases: (Array.isArray(parsed.aliases) ? parsed.aliases : [])
            .map((alias) => String(alias || '').trim())
            .filter(Boolean)
            .slice(0, 4),
        });
      } catch (error) {
        sendJson(res, 502, { ok: false, error: error.message });
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  });
  ctx.effect(() => normalizeRoute);

  const criteriaRoute = ctx.webServer.register({
    kind: 'exact',
    path: CRITERIA_ROUTE,
    handler: async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,OPTIONS',
          'access-control-allow-headers': 'content-type',
        });
        res.end();
        return;
      }
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'GET required' });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        summary: DEFAULT_SUMMARY_CRITERIA,
        scoring: DEFAULT_SCORING_CRITERIA,
      });
    },
  });
  ctx.effect(() => criteriaRoute);
}
