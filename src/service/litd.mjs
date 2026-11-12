import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { XMLParser } from 'fast-xml-parser';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DSH_WEB_URL = process.env.DSH_WEB_URL || 'http://127.0.0.1:49422';
const AI_SETTINGS_KEY = 'lit-settings';
const dataDir = process.env.LITD_DATA_DIR
  ? path.resolve(process.env.LITD_DATA_DIR)
  : path.join(here, 'data');
const pdfDir = path.join(dataDir, 'pdfs');
const backupDir = path.join(dataDir, 'backups');
fs.mkdirSync(pdfDir, { recursive: true });

const requireFromService = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(requireFromService.resolve('pdfjs-dist/package.json'));
GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(pdfjsRoot, 'legacy/build/pdf.worker.mjs')
).href;

let db = new DatabaseSync(path.join(dataDir, 'library.db'));
const authorDigestTasks = new Map();
const aiSearchTasks = new Map();
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    authors TEXT,
    year INTEGER,
    venue TEXT,
    doi TEXT,
    arxiv TEXT,
    abstract TEXT,
    page_count INTEGER,
    groups_json TEXT NOT NULL DEFAULT '[]',
    summary_json TEXT NOT NULL,
    pages_json TEXT NOT NULL,
    pdf_path TEXT,
    source_url TEXT,
    created_at TEXT NOT NULL
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts USING fts5(
    id UNINDEXED,
    title,
    authors,
    abstract,
    body,
    tokenize = 'unicode61'
  );
  CREATE TABLE IF NOT EXISTS ui_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS impact_factors (
    journal TEXT NOT NULL,
    year INTEGER NOT NULL,
    value REAL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (journal, year)
  );
  CREATE TABLE IF NOT EXISTS feeds (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    last_fetch_at TEXT,
    last_error TEXT
  );
  CREATE TABLE IF NOT EXISTS tags (
    name TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS feed_items (
    id TEXT PRIMARY KEY,
    feed_id TEXT NOT NULL,
    guid TEXT NOT NULL,
    title TEXT NOT NULL,
    authors TEXT,
    link TEXT,
    summary TEXT,
    published_at TEXT,
    pdf_url TEXT,
    kind TEXT NOT NULL DEFAULT 'unknown',
    kind_locked INTEGER NOT NULL DEFAULT 0,
    read INTEGER NOT NULL DEFAULT 0,
    saved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(feed_id, guid)
  );
  CREATE TABLE IF NOT EXISTS jcr_best (
    year INTEGER NOT NULL,
    journal_norm TEXT NOT NULL,
    journal TEXT NOT NULL,
    quartile TEXT,
    impact_factor REAL,
    issn TEXT,
    eissn TEXT,
    PRIMARY KEY (year, journal_norm)
  );
`);

try {
  db.exec('ALTER TABLE papers ADD COLUMN source_url TEXT');
} catch (error) {
  // Existing databases already have the column.
}

try {
  db.exec("ALTER TABLE feed_items ADD COLUMN kind TEXT NOT NULL DEFAULT 'unknown'");
} catch (error) {
  // Existing databases already have the column.
}

try {
  db.exec('ALTER TABLE feed_items ADD COLUMN kind_locked INTEGER NOT NULL DEFAULT 0');
} catch (error) {
  // Existing databases already have the column.
}

try {
  db.exec('ALTER TABLE papers ADD COLUMN tags_json TEXT');
} catch (error) {
  // Existing databases already have the column.
}

for (const column of [
  'ai_stars INTEGER',
  'ai_type TEXT',
  'ai_reason TEXT',
  'ai_why_not_higher TEXT',
  'ai_confidence REAL',
  'ai_model TEXT',
  'ai_scanned_at TEXT',
]) {
  try {
    db.exec(`ALTER TABLE feed_items ADD COLUMN ${column}`);
  } catch (error) {
    // Existing databases already have the column.
  }
}

// User-defined ordering. Null sort_order means "not ordered yet": those rows
// keep falling back to created_at so upgrading never reshuffles a library.
function ensureSortOrderColumns() {
  try {
    db.exec('ALTER TABLE papers ADD COLUMN sort_order INTEGER');
  } catch (error) {
    // Existing databases already have the column.
  }
  try {
    db.exec('ALTER TABLE groups ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  } catch (error) {
    // Existing databases already have the column.
  }
}

ensureSortOrderColumns();

function seedGroups() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM groups').get().n;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO groups (id, name, color, sort_order) VALUES (?, ?, ?, ?)');
  insert.run('codon', 'Codon usage', '#7fe0b0', 20);
}

function removeLegacyRealGroup() {
  db.prepare("DELETE FROM groups WHERE id = 'real'").run();
  const rows = db.prepare('SELECT id, groups_json FROM papers').all();
  for (const row of rows) {
    const groups = JSON.parse(row.groups_json || '[]');
    if (!groups.includes('real')) continue;
    db.prepare('UPDATE papers SET groups_json = ? WHERE id = ?').run(
      JSON.stringify(groups.filter((id) => id !== 'real')),
      row.id
    );
  }
}

function defaultSections() {
  return [
    { key: 'question', title: '研究问题', type: 'text', owner: 'ai', entries: [] },
    { key: 'method', title: '方法与范围', type: 'text', owner: 'ai', entries: [] },
    { key: 'findings', title: '主要发现', type: 'text', owner: 'ai', entries: [] },
    { key: 'limitations', title: '作者承认的局限', type: 'text', owner: 'ai', entries: [] },
    { key: 'my-note', title: '我的评价', type: 'text', owner: 'user', entries: [] },
  ];
}

function normalizeSummary(summary) {
  if (!summary || typeof summary !== 'object') return { sections: defaultSections(), evidence: [] };
  return {
    sections: Array.isArray(summary.summary_sections)
      ? summary.summary_sections
      : Array.isArray(summary.sections)
        ? summary.sections
        : defaultSections(),
    evidence: Array.isArray(summary.evidence) ? summary.evidence : [],
    auto_generated: Boolean(summary.auto_generated),
    ai_generated: Boolean(summary.ai_generated),
    reviewed: Boolean(summary.reviewed),
    model: summary.model || null,
    provider: summary.provider || null,
    generated_at: summary.generated_at || null,
  };
}

function venueFromDoi(doi) {
  const value = String(doi || '');
  const mappings = [
    [/^10\.1146\/annurev-biochem/i, 'Annual Review of Biochemistry'],
    [/^10\.1186\/s13059/i, 'Genome Biology'],
    [/^10\.1038\/s41467/i, 'Nature Communications'],
    [/^10\.1038\/nature/i, 'Nature'],
    [/^10\.1126\/science/i, 'Science'],
    [/^10\.1016\/j\.cell/i, 'Cell'],
    [/^10\.1073\/pnas/i, 'PNAS'],
    [/^10\.3390\/ijms/i, 'International Journal of Molecular Sciences'],
    [/^10\.1101\//i, 'bioRxiv'],
    [/^10\.64898\//i, 'bioRxiv'],
  ];
  for (const [pattern, venue] of mappings) {
    if (pattern.test(value)) return venue;
  }
  return '';
}

function normalizeJournalName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.:;]+$/, '')
    .trim();
}

// Loose key used only for alias / fuzzy candidate matching. It folds
// punctuation, hyphens and "&" so e.g. "A-PHYSICAL SCIENCES" and
// "a physical sciences" compare equal. Exact matching still uses
// normalizeJournalName so existing behavior does not change.
function journalMatchKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['\u2018\u2019\u02bc`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const JCR_AMBIGUOUS = Symbol('jcr-ambiguous');

// Curated aliases for journal names that scraped/Crossref metadata commonly
// truncates. Keep this list conservative: every alias must point at exactly
// one journal. The USA entry deliberately exists because "Proceedings of the
// National Academy of Science(s)" is a valid prefix of both the PNAS USA
// record (Q1) and the PNAS India section (Q3).
const JCR_ALIAS_CANONICALS = new Map(
  [
    ['PNAS', 'Proceedings of the National Academy of Sciences of the United States of America'],
    ['PNAS USA', 'Proceedings of the National Academy of Sciences of the United States of America'],
    ['Proc. Natl. Acad. Sci.', 'Proceedings of the National Academy of Sciences of the United States of America'],
    ['Proc Natl Acad Sci', 'Proceedings of the National Academy of Sciences of the United States of America'],
    ['Proc Natl Acad Sci USA', 'Proceedings of the National Academy of Sciences of the United States of America'],
    ['Proc Natl Acad Sci U S A', 'Proceedings of the National Academy of Sciences of the United States of America'],
    [
      'Proceedings of the National Academy of Science',
      'Proceedings of the National Academy of Sciences of the United States of America',
    ],
    [
      'Proceedings of the National Academy of Sciences',
      'Proceedings of the National Academy of Sciences of the United States of America',
    ],
    [
      'Proceedings of the National Academy of Sciences of the USA',
      'Proceedings of the National Academy of Sciences of the United States of America',
    ],
    [
      'Proceedings of the National Academy of Sciences of the United States',
      'Proceedings of the National Academy of Sciences of the United States of America',
    ],
  ].map(([alias, canonical]) => [journalMatchKey(alias), canonical])
);

function impactFactorMap(year) {
  if (!year) return { byExact: new Map(), byLoose: new Map() };
  const rows = db.prepare('SELECT journal, value FROM impact_factors WHERE year = ?').all(Number(year));
  const byExact = new Map();
  const byLoose = new Map();
  for (const row of rows) {
    const value = row.value === null || row.value === undefined ? null : Number(row.value);
    byExact.set(normalizeJournalName(row.journal), value);
    const loose = journalMatchKey(row.journal);
    if (loose && !byLoose.has(loose)) byLoose.set(loose, value);
  }
  return { byExact, byLoose };
}

function lookupImpactFactor(map, name) {
  const exact = map.byExact.get(normalizeJournalName(name));
  if (exact !== undefined) return exact;
  const loose = journalMatchKey(name);
  return loose ? map.byLoose.get(loose) : undefined;
}

function filterByImpactFactor(results, minIf, year) {
  if (minIf === null || minIf === undefined || minIf === '') return results;
  const min = Number(minIf);
  if (!Number.isFinite(min)) return results;
  const requestedYear = year || new Date().getFullYear() - 1;
  const map = impactFactorMap(requestedYear);
  const useJcrFallback = Number(requestedYear) === 2025 || Number(requestedYear) === 2026;
  return results.filter((item) => {
    const local = lookupImpactFactor(map, item.journal || item.venue);
    const fallback = useJcrFallback ? jcrLookup(item, 2026)?.impact_factor : undefined;
    const value = local !== undefined && local !== null ? local : fallback;
    return value !== undefined && value !== null && Number(value) >= min;
  });
}

function normalizeIssn(value) {
  return String(value || '').toUpperCase().replace(/[^0-9X]/g, '');
}

let jcrCache = {
  year: null,
  rows: [],
  byJournal: new Map(),
  byIssn: new Map(),
  byName: new Map(),
  byMatchKey: new Map(),
  prefixBuckets: new Map(),
};
let jcrNameCache = new Map();

function invalidateJcrCache() {
  jcrCache.year = null;
  jcrNameCache = new Map();
}

const JCR_PREFIX_MIN_TOKENS = 3;
const JCR_PREFIX_MIN_CHARS = 12;
// A truncated query usually only drops trailing words. Anything that adds
// more than this many extra words is treated as a different journal.
const JCR_PREFIX_MAX_EXTRA_TOKENS = 8;

function jcrMaps(year = 2026) {
  if (jcrCache.year === Number(year)) return jcrCache;
  const rows = db
    .prepare('SELECT year, journal_norm, journal, quartile, impact_factor, issn, eissn FROM jcr_best WHERE year = ?')
    .all(Number(year));
  const byJournal = new Map();
  const byIssn = new Map();
  const byName = new Map();
  const byMatchKey = new Map();
  const prefixBuckets = new Map();
  const addUnique = (map, key, row) => {
    if (!key) return;
    const present = map.get(key);
    if (present === undefined) map.set(key, row);
    else if (present !== row) map.set(key, JCR_AMBIGUOUS);
  };
  for (const row of rows) {
    // Raw journal_norm keeps the historical exact-key behavior.
    byJournal.set(row.journal_norm, row);
    addUnique(byName, normalizeJournalName(row.journal), row);
    addUnique(byMatchKey, journalMatchKey(row.journal_norm), row);
    addUnique(byMatchKey, journalMatchKey(row.journal), row);
    for (const value of [row.issn, row.eissn]) {
      const key = normalizeIssn(value);
      if (key) byIssn.set(key, row);
    }
    const tokens = journalMatchKey(row.journal || row.journal_norm).split(' ').filter(Boolean);
    if (tokens.length) {
      const bucketKey = tokens[0].length >= 4 ? tokens[0].slice(0, 4) : tokens[0];
      const bucket = prefixBuckets.get(bucketKey) || [];
      bucket.push({ row, tokens });
      prefixBuckets.set(bucketKey, bucket);
    }
  }
  jcrCache = {
    year: Number(year),
    rows,
    byJournal,
    byIssn,
    byName,
    byMatchKey,
    prefixBuckets,
  };
  jcrNameCache = new Map();
  return jcrCache;
}

function jcrAliasRow(maps, name) {
  const canonical = JCR_ALIAS_CANONICALS.get(journalMatchKey(name));
  if (!canonical) return null;
  const normalized = normalizeJournalName(canonical);
  const row =
    maps.byJournal.get(normalized) ||
    maps.byName.get(normalized) ||
    maps.byMatchKey.get(journalMatchKey(canonical));
  return row && row !== JCR_AMBIGUOUS ? row : null;
}

function tokenMatchesPrefix(candidateToken, queryToken) {
  if (candidateToken === queryToken) return true;
  // Allow clipped/plural endings ("science" vs "sciences") only for
  // meaningful words, so short tokens stay strict.
  return queryToken.length >= 4 && candidateToken.startsWith(queryToken);
}

function jcrPrefixLookup(maps, name) {
  const key = journalMatchKey(name);
  if (!key || key.length < JCR_PREFIX_MIN_CHARS) return null;
  const queryTokens = key.split(' ').filter(Boolean);
  if (queryTokens.length < JCR_PREFIX_MIN_TOKENS) return null;
  const bucketKey = queryTokens[0].length >= 4 ? queryTokens[0].slice(0, 4) : queryTokens[0];
  const bucket = maps.prefixBuckets.get(bucketKey) || [];
  const candidates = [];
  for (const candidate of bucket) {
    if (candidate.tokens.length < queryTokens.length) continue;
    let matched = true;
    for (let i = 0; i < queryTokens.length; i += 1) {
      if (!tokenMatchesPrefix(candidate.tokens[i], queryTokens[i])) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    if (candidate.tokens.length - queryTokens.length > JCR_PREFIX_MAX_EXTRA_TOKENS) continue;
    candidates.push(candidate.row);
  }
  // A truncated name that still matches more than one journal (different
  // section/country variants) is ambiguous: refuse to guess instead of
  // silently picking the first row. Ambiguous cases need an alias above.
  if (candidates.length !== 1) return null;
  return candidates[0];
}

function jcrLookupByName(maps, name) {
  const normalized = normalizeJournalName(name);
  const exact = maps.byJournal.get(normalized);
  if (exact) return exact;
  const alias = jcrAliasRow(maps, name);
  if (alias) return alias;
  const byName = maps.byName.get(normalized);
  if (byName && byName !== JCR_AMBIGUOUS) return byName;
  const matchKey = journalMatchKey(name);
  const byKey = matchKey ? maps.byMatchKey.get(matchKey) : undefined;
  if (byKey && byKey !== JCR_AMBIGUOUS) return byKey;
  return jcrPrefixLookup(maps, name);
}

function jcrLookup(item, year = 2026) {
  if (!item) return null;
  const maps = jcrMaps(year);
  if (maps.byJournal.size === 0) return null;
  const issn = normalizeIssn(item.issn || '');
  if (issn) {
    const byIssn = maps.byIssn.get(issn);
    if (byIssn) return byIssn;
  }
  const name = String(item.journal || item.venue || '').trim();
  if (!name) return null;
  const cacheKey = `${normalizeJournalName(name)}|${journalMatchKey(name)}`;
  if (jcrNameCache.has(cacheKey)) return jcrNameCache.get(cacheKey);
  const row = jcrLookupByName(maps, name);
  if (jcrNameCache.size > 4000) jcrNameCache.clear();
  jcrNameCache.set(cacheKey, row);
  return row;
}

function jcrForResult(item) {
  return jcrLookup(item, 2026);
}

function filterByJcr(results, quartile, year) {
  if (!quartile) return results;
  const maps = jcrMaps(year || 2026);
  if (maps.byJournal.size === 0) return [];
  return results.filter((item) => jcrLookup(item, year || 2026)?.quartile === quartile);
}

function seedJcrFromFile() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM jcr_best').get().n;
  if (count > 0) return;
  const file = path.join(dataDir, 'jcr-2026.json');
  if (!fs.existsSync(file)) return;
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  const year = Number(payload.year) || 2026;
  const insert = db.prepare(
    'INSERT OR REPLACE INTO jcr_best (year, journal_norm, journal, quartile, impact_factor, issn, eissn) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  db.exec('BEGIN');
  try {
    for (const item of payload.journals || []) {
      insert.run(
        year,
        item.journal_norm || normalizeJournalName(item.journal),
        item.journal,
        item.quartile || null,
        Number(item.impact_factor) || null,
        item.issn || null,
        item.eissn || null
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  invalidateJcrCache();
  console.log(`[litd] imported ${payload.journals?.length || 0} JCR journals for ${year}`);
}

function guessDoi(text) {
  const match = text.match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/);
  return match ? match[0].replace(/[.,;]$/, '') : null;
}

function guessYear(metadata) {
  const raw = metadata?.CreationDate || metadata?.ModDate || '';
  const match = String(raw).match(/D:(\d{4})/);
  return match ? Number(match[1]) : null;
}

function extractAbstract(pageText) {
  const text = pageText.replace(/\s+/g, ' ');
  const start = text.search(/\bAbstract\b/i);
  if (start < 0) return '';
  const rest = text.slice(start + 8);
  const end = rest.search(/\b(Keywords|INTRODUCTION|Introduction)\b/);
  return (end > 0 ? rest.slice(0, end) : rest.slice(0, 1800)).trim().slice(0, 2200);
}

function splitSentences(text) {
  return text
    .replace(/([A-Za-z])-\s*\n\s*([a-z])/g, '$1$2')
    .replace(/([A-Za-z])-\s+([a-z])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 30);
}

function buildAutoSummary(extracted) {
  const pages = extracted.pages;
  const abstract = extractAbstract(pages[0]?.text || '');
  const sentences = splitSentences(abstract);
  const body = pages.map((page) => page.text).join('\n');
  const sections = defaultSections();
  const evidence = [];
  let counter = 0;

  const add = (sectionKey, text, quote) => {
    const cleanText = String(text || '').trim();
    const cleanQuote = String(quote || '').trim();
    if (!cleanText) return;
    const section = sections.find((item) => item.key === sectionKey);
    if (!section) return;
    counter += 1;
    const id = `auto-${sectionKey}-${counter}`;
    const located = cleanQuote ? locateQuote(pages, cleanQuote) : { found: false };
    const entry = {
      id,
      text: cleanText.slice(0, 900),
      quote: located.found ? located.matched_text || cleanQuote : cleanQuote,
      page: located.found ? located.page_number : null,
      bbox: located.found ? located.bbox_pdf : null,
      status: located.found ? 'verified' : cleanQuote ? 'missing' : 'draft',
      evidence: located.found ? [id] : [],
    };
    section.entries.push(entry);
    if (located.found) {
      evidence.push({
        id,
        page: located.page_number,
        bbox_pdf: located.bbox_pdf,
        quote: entry.quote,
        matched_text: entry.quote,
        method: 'normalized',
      });
    }
  };

  if (sentences.length > 0) {
    add('question', sentences.slice(0, 2).join(' '), sentences[0]);
    const middle = sentences.slice(1, -1).slice(0, 3);
    if (middle.length > 0) add('findings', middle.join(' '), middle[0]);
    if (sentences.length > 1) add('findings', sentences[sentences.length - 1], sentences[sentences.length - 1]);
  } else {
    const fallback = pages[0]?.text?.replace(/\s+/g, ' ').trim().slice(0, 500);
    if (fallback) add('question', fallback, fallback.slice(0, 240));
  }

  const methodMatch = body.match(/(?:Materials and Methods|Methods)\s+([\s\S]{0,900})/i);
  if (methodMatch) {
    const methodSentences = splitSentences(methodMatch[1]);
    if (methodSentences.length > 0) {
      add('method', methodSentences.slice(0, 2).join(' '), methodSentences[0]);
    }
  }

  const limitationSentence = splitSentences(body).find((sentence) => /\blimitation(s)?\b/i.test(sentence));
  if (limitationSentence) add('limitations', limitationSentence, limitationSentence);

  return { sections, evidence, auto_generated: true };
}

let aiCriteriaCache = { at: 0, value: { summary: '', scoring: '' } };

function invalidateAiCriteriaCache() {
  aiCriteriaCache = { at: 0, value: { summary: '', scoring: '' } };
}

// AI summary/scoring standards are edited by the client and stored in the
// lit-settings ui-state row. Empty values fall back to the built-in defaults
// in the host plugin.
function getAiCriteria() {
  const now = Date.now();
  if (aiCriteriaCache.at && now - aiCriteriaCache.at < 10000) return aiCriteriaCache.value;
  let value = { summary: '', scoring: '' };
  try {
    const row = db.prepare('SELECT value FROM ui_state WHERE key = ?').get(AI_SETTINGS_KEY);
    if (row && row.value) {
      const settings = JSON.parse(row.value);
      const criteria = settings && typeof settings.aiCriteria === 'object' ? settings.aiCriteria : null;
      if (criteria) {
        value = {
          summary: String(criteria.summary || '').trim().slice(0, 4000),
          scoring: String(criteria.scoring || '').trim().slice(0, 4000),
        };
      }
    }
  } catch (error) {
    // Fall back to the built-in defaults if the settings row is unreadable.
  }
  aiCriteriaCache = { at: now, value };
  return value;
}

async function generateModelSummary(row) {
  const pages = JSON.parse(row.pages_json || '[]');
  const selectPages = (limit) => {
    let used = 0;
    const selected = [];
    for (const page of pages) {
      const text = String(page.text || '').trim();
      if (!text) continue;
      const remaining = limit - used;
      if (remaining <= 0) break;
      const chunk = text.slice(0, remaining);
      selected.push({ page: page.page_number, text: chunk });
      used += chunk.length;
    }
    return selected;
  };
  const requestSummary = async (selectedPages) => {
    const response = await fetch(`${DSH_WEB_URL}/lit-model/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: row.title,
        authors: row.authors,
        abstract: row.abstract,
        pages: selectedPages,
        criteria: getAiCriteria(),
      }),
      signal: AbortSignal.timeout(150000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true) {
      throw new Error(body.error || `model route HTTP ${response.status}`);
    }
    return body;
  };
  let body;
  try {
    body = await requestSummary(selectPages(45000));
  } catch (error) {
    if (!/empty response|超时|timeout/i.test(error.message)) throw error;
    body = await requestSummary(selectPages(3000));
  }
  const sections = [];
  const evidence = [];
  let counter = 0;
  for (const section of body.summary?.sections || []) {
    const entries = [];
    for (const entry of section.entries || []) {
      const text = String(entry.text || '').trim();
      if (!text) continue;
      counter += 1;
      const id = `model-${section.key}-${counter}`;
      const quote = String(entry.quote || '').trim();
      const located = quote ? locateQuote(pages, quote) : { found: false };
      const savedQuote = located.found ? located.matched_text || quote : quote;
      entries.push({
        id,
        text: text.slice(0, 1200),
        quote: savedQuote,
        page: located.found ? located.page_number : null,
        bbox: located.found ? located.bbox_pdf : null,
        status: located.found ? 'verified' : quote ? 'missing' : 'draft',
        evidence: located.found ? [id] : [],
      });
      if (located.found) {
        evidence.push({
          id,
          page: located.page_number,
          bbox_pdf: located.bbox_pdf,
          quote: savedQuote,
          matched_text: savedQuote,
          method: 'normalized',
        });
      }
    }
    if (entries.length > 0) {
      sections.push({
        key: section.key,
        title: section.title || section.key,
        type: 'text',
        owner: 'ai',
        entries,
      });
    }
  }
  if (sections.length === 0) throw new Error('model returned no usable sections');
  return {
    sections,
    evidence,
    ai_generated: true,
    model: body.model || null,
    provider: body.provider || null,
    generated_at: new Date().toISOString(),
  };
}

function textOf(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value['#text']) return String(value['#text']);
  return String(value);
}

function listOf(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function searchArxiv(query, limit = 20, start = 0, filters = {}) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return { results: [], total: 0, next_start: null };
  const cappedLimit = Math.min(25, Math.max(1, Number(limit) || 20));
  const safeStart = Math.max(0, Number(start) || 0);
  let searchQuery = `all:${cleanQuery}`;
  if (filters.from || filters.to) {
    const from = filters.from ? `${filters.from}01010000` : '199101010000';
    const to = filters.to ? `${filters.to}12312359` : '209912312359';
    searchQuery += ` AND submittedDate:[${from} TO ${to}]`;
  }
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(searchQuery)}&start=${safeStart}&max_results=${cappedLimit}&sortBy=relevance`;
  const response = await fetch(url, {
    headers: { 'user-agent': 'dsh-litd/0.1 (local literature workspace)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`arXiv HTTP ${response.status}`);
  const xml = await response.text();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const feed = parser.parse(xml)?.feed;
  if (!feed) return { results: [], total: 0, next_start: null };
  const entries = listOf(feed.entry);
  const results = entries.map((entry) => {
    const links = listOf(entry.link);
    const pdfLink = links.find((link) => link?.['@_title'] === 'pdf') || links.find((link) => String(link?.['@_href'] || '').includes('/pdf/'));
    const absLink = links.find((link) => link?.['@_rel'] === 'alternate');
    const id = textOf(entry.id);
    const arxivId = id.split('/abs/')[1] || id.split('/').pop() || '';
    return {
      id: `arxiv-${arxivId.replace(/v\d+$/, '')}`,
      arxiv_id: arxivId.replace(/v\d+$/, ''),
      source: 'arXiv',
      source_label: 'arXiv',
      title: textOf(entry.title).replace(/\s+/g, ' ').trim(),
      abstract: textOf(entry.summary).replace(/\s+/g, ' ').trim(),
      authors: listOf(entry.author).map((author) => textOf(author?.name)).filter(Boolean).join(', '),
      published: textOf(entry.published),
      journal: 'arXiv preprint',
      venue: 'arXiv preprint',
      doi: textOf(entry['arxiv:doi']),
      abs_url: absLink?.['@_href'] || id,
      pdf_url: pdfLink?.['@_href'] || (arxivId ? `https://arxiv.org/pdf/${arxivId}` : ''),
    };
  }).filter((item) => item.title && item.pdf_url);
  const total = Number(textOf(feed['opensearch:totalResults'])) || entries.length;
  const journalNeedle = String(filters.journal || '').trim().toLowerCase();
  const journalFiltered = journalNeedle
    ? results.filter((item) => `${item.journal || ''} ${item.venue || ''}`.toLowerCase().includes(journalNeedle))
    : results;
  return {
    results: filterByJcr(
      filterByImpactFactor(journalFiltered, filters.min_if, filters.if_year),
      filters.jcr_quartile,
      filters.jcr_year
    ),
    total,
    matched: results.length,
    next_start: safeStart + entries.length < total ? safeStart + entries.length : null,
  };
}

function stripHtml(value) {
  return textOf(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function searchEuropePmc(query, limit = 20, scope = 'all', cursor = '*', filters = {}) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return { results: [], total: 0, next_cursor: null };
  const cappedLimit = Math.min(25, Math.max(1, Number(limit) || 20));
  const scopeFilter =
    scope === 'pubmed'
      ? ' AND SRC:MED'
      : scope === 'biorxiv'
        ? ' AND SRC:PPR AND PUBLISHER:"bioRxiv"'
        : '';
  const dateFilter =
    filters.from || filters.to
      ? ` AND FIRST_PDATE:[${filters.from || '1991'}-01-01 TO ${filters.to || '2099'}-12-31]`
      : '';
  const journalFilter = String(filters.journal || '').trim()
    ? ` AND JOURNAL:"${String(filters.journal).trim().replace(/"/g, '')}"`
    : '';
  const searchQuery = `(${cleanQuery})${scopeFilter}${dateFilter}${journalFilter}`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(searchQuery)}&format=json&pageSize=${cappedLimit}&resultType=core&cursorMark=${encodeURIComponent(cursor || '*')}`;
  const response = await fetch(url, {
    headers: { 'user-agent': 'dsh-litd/0.1 (local literature workspace)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Europe PMC HTTP ${response.status}`);
  const data = await response.json();
  const results = listOf(data?.resultList?.result).map((item) => {
    const fullTexts = listOf(item.fullTextUrlList?.fullTextUrl);
    const pdf = fullTexts.find(
      (entry) => /pdf/i.test(String(entry?.documentStyle || '')) || /\.pdf(\?|$)/i.test(String(entry?.url || ''))
    );
    const doi = String(item.doi || '');
    const publisher = stripHtml(item.publisher || item.bookOrReportDetails?.publisher || '');
    const journal = stripHtml(item.journalInfo?.journal?.title || item.journalTitle || '');
    const issn = stripHtml(item.journalInfo?.journal?.issn || item.issn || '');
    const venue = journal || publisher || (item.source === 'PPR' ? 'Preprint' : item.source === 'MED' ? 'PubMed' : item.source || '');
    const sourceLabel =
      item.source === 'MED'
        ? 'PubMed'
        : item.source === 'PMC'
          ? 'PMC'
          : item.source === 'PPR'
            ? publisher || 'Preprint'
            : item.source || 'Europe PMC';
    let pdfUrl = String(pdf?.url || '');
    if (!pdfUrl && /biorxiv/i.test(publisher) && doi) {
      pdfUrl = `https://www.biorxiv.org/content/${doi}v1.full.pdf`;
    }
    if (!pdfUrl && /medrxiv/i.test(publisher) && doi) {
      pdfUrl = `https://www.medrxiv.org/content/${doi}v1.full.pdf`;
    }
    if (!pdfUrl && item.pmcid) {
      pdfUrl = `https://europepmc.org/articles/${item.pmcid}?pdf=render`;
    }
    return {
      id: `europepmc-${item.source || 'unknown'}-${item.id || item.pmid || item.doi || Date.now()}`,
      source: item.source || '',
      source_label: sourceLabel,
      title: stripHtml(item.title),
      abstract: stripHtml(item.abstractText),
      authors: stripHtml(item.authorString),
      published: String(item.firstPublicationDate || ''),
      journal,
      venue,
      issn,
      doi,
      abs_url: `https://europepmc.org/article/${item.source || 'MED'}/${item.id || item.pmid || ''}`,
      pdf_url: pdfUrl,
    };
  }).filter((item) => item.title);
  const enriched = results.map((item) => {
    const metrics = jcrForResult(item);
    return {
      ...item,
      impact_factor: metrics?.impact_factor ?? null,
      jcr_quartile: metrics?.quartile || null,
    };
  });
  return {
    results: filterByJcr(
      filterByImpactFactor(enriched, filters.min_if, filters.if_year),
      filters.jcr_quartile,
      filters.jcr_year
    ),
    total: Number(data.hitCount) || 0,
    matched: results.length,
    next_cursor:
      data.nextCursorMark && data.nextCursorMark !== cursor && data.nextCursorMark !== '*'
        ? String(data.nextCursorMark)
        : null,
  };
}

function feedLink(value) {
  for (const item of listOf(value)) {
    if (typeof item === 'string' && item) return item;
    if (item && typeof item === 'object' && item['@_href']) return String(item['@_href']);
  }
  return '';
}

function feedPdfUrl(item, fallbackLink) {
  for (const enclosure of listOf(item.enclosure)) {
    const url = String(enclosure?.['@_url'] || '');
    const type = String(enclosure?.['@_type'] || '');
    if (url && (/pdf/i.test(type) || /\.pdf(\?|$)/i.test(url))) return url;
  }
  if (/\.pdf(\?|$)/i.test(fallbackLink)) return fallbackLink;
  if (/arxiv\.org\/abs\//i.test(fallbackLink)) return fallbackLink.replace('/abs/', '/pdf/');
  return '';
}

function classifyFeedItem(item, feedTitle) {
  const text = `${item.title || ''} ${item.link || ''} ${item.pdf_url || ''}`;
  if (/nature\.com\/articles\/d41586-/i.test(item.link || '') || /nature\.com\/news\//i.test(item.link || '')) {
    return 'news';
  }
  if (
    item.pdf_url ||
    /arxiv\.org\/(abs|pdf)\//i.test(item.link || '') ||
    /(biorxiv|medrxiv|chemrxiv)\.org\//i.test(item.link || '') ||
    /(nature|science|cell|springer|wiley|tandfonline)\.com\/(articles|doi|article)\//i.test(item.link || '') ||
    /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i.test(item.link || '')
  ) {
    return 'paper';
  }
  if (/\b(news|press release|editorial|opinion|commentary|blog|podcast|interview)\b/i.test(text) || /news/i.test(feedTitle || '')) {
    return 'news';
  }
  if (/\b(comment|perspective|letter|reply)\b/i.test(text)) return 'comment';
  return 'unknown';
}

async function searchOpenAlex(query, limit = 6) {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${Math.min(25, Math.max(1, limit))}`;
  const response = await fetch(url, {
    headers: { 'user-agent': 'dsh-litd/0.2 (local literature workspace)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`OpenAlex HTTP ${response.status}`);
  const data = await response.json();
  return (data.results || []).map((item) => {
    let abstract = '';
    const inverted = item.abstract_inverted_index;
    if (inverted && typeof inverted === 'object') {
      const words = [];
      for (const [word, positions] of Object.entries(inverted)) {
        for (const position of positions || []) words[position] = word;
      }
      abstract = words.filter(Boolean).join(' ');
    }
    const doi = String(item.doi || '').replace(/^https?:\/\/doi\.org\//i, '');
    const journal = item.primary_location?.source?.display_name || item.host_venue?.display_name || '';
    const authors = (item.authorships || [])
      .map((authorship) => authorship.author?.display_name || '')
      .filter(Boolean)
      .join(', ');
    return {
      id: `openalex-${item.id || doi || item.title}`,
      source: 'OpenAlex',
      title: stripHtml(item.title || item.display_name || ''),
      abstract: stripHtml(abstract),
      authors,
      journal,
      year: item.publication_year || null,
      doi,
      url: item.doi || item.primary_location?.landing_page_url || '',
      cited_by: item.cited_by_count || 0,
    };
  }).filter((item) => item.title);
}

async function searchCrossref(query, limit = 6) {
  const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=${Math.min(25, Math.max(1, limit))}`;
  const response = await fetch(url, {
    headers: { 'user-agent': 'dsh-litd/0.2 (mailto:dsh-lit@localhost)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Crossref HTTP ${response.status}`);
  const data = await response.json();
  return (data.message?.items || []).map((item) => {
    const title = (item.title || [])[0] || '';
    const authors = (item.author || [])
      .map((author) => [author.given, author.family].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(', ');
    const year = item.issued?.['date-parts']?.[0]?.[0] || null;
    return {
      id: `crossref-${item.DOI || title}`,
      source: 'Crossref',
      title: stripHtml(title),
      abstract: stripHtml(item.abstract || ''),
      authors,
      journal: stripHtml((item['container-title'] || [])[0] || ''),
      year,
      doi: String(item.DOI || ''),
      url: String(item.URL || ''),
      cited_by: item['is-referenced-by-count'] || 0,
    };
  }).filter((item) => item.title);
}

async function searchSemanticScholar(query, limit = 6) {
  const fields = 'title,abstract,year,venue,authors,externalIds,url,citationCount';
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${Math.min(25, Math.max(1, limit))}&fields=${fields}`;
  const response = await fetch(url, {
    headers: { 'user-agent': 'dsh-litd/0.2 (local literature workspace)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Semantic Scholar HTTP ${response.status}`);
  const data = await response.json();
  return (data.data || []).map((item) => ({
    id: `semanticscholar-${item.paperId || item.title}`,
    source: 'Semantic Scholar',
    title: stripHtml(item.title || ''),
    abstract: stripHtml(item.abstract || ''),
    authors: (item.authors || []).map((author) => author.name).filter(Boolean).join(', '),
    journal: item.venue || '',
    year: item.year || null,
    doi: String(item.externalIds?.DOI || ''),
    url: item.url || (item.externalIds?.DOI ? `https://doi.org/${item.externalIds.DOI}` : ''),
    cited_by: item.citationCount || 0,
  })).filter((item) => item.title);
}

async function fetchFeed(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'dsh-litd/0.1 (local literature workspace)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Feed HTTP ${response.status}`);
  const xml = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
  });
  const parsed = parser.parse(xml);
  const root =
    parsed.rss?.channel ||
    parsed.feed ||
    parsed.RDF ||
    parsed['rdf:RDF'] ||
    parsed.channel ||
    {};
  const feedTitle =
    textOf(root.title) ||
    textOf(parsed.RDF?.channel?.title) ||
    textOf(parsed['rdf:RDF']?.channel?.title) ||
    url;
  const rawItems = listOf(root.item || root.entry || parsed.RDF?.item || parsed['rdf:RDF']?.item);
  const items = rawItems
    .map((item) => {
      const title = textOf(item.title).replace(/\s+/g, ' ').trim();
      const link = feedLink(item.link) || textOf(item.link);
      const guid = textOf(item.guid || item.id) || item['@_about'] || link || title;
      const summary = textOf(item.description || item.summary || item.content).replace(/\s+/g, ' ').trim();
      const authors = listOf(item.creator || item.author)
        .map((author) => textOf(author?.name || author))
        .filter(Boolean)
        .join(', ');
      const published =
        textOf(item.pubDate || item.published || item.updated || item.date || item.publicationDate) || '';
      const pdfUrl = feedPdfUrl(item, link);
      return {
        guid,
        title,
        link,
        summary,
        authors,
        published_at: published,
        pdf_url: pdfUrl,
        kind: classifyFeedItem({ title, link, pdf_url: pdfUrl }, feedTitle),
      };
    })
    .filter((item) => item.title && item.guid);
  return { title: feedTitle, items };
}

function feedItemId(feedId, guid) {
  const digest = createHash('sha1').update(`${feedId}\u0000${guid}`).digest('hex').slice(0, 32);
  return `feeditem-${digest}`;
}

function storeFeed(feedUrl, titleHint = '') {
  const id = `feed-${randomUUID()}`;
  return { id, title: titleHint, url: feedUrl };
}

async function refreshFeedRow(feed) {
  try {
    const fetched = await fetchFeed(feed.url);
    const title = feed.title && feed.title !== feed.url ? feed.title : fetched.title;
    db.prepare('UPDATE feeds SET title = ?, last_fetch_at = ?, last_error = NULL WHERE id = ?').run(
      title,
      new Date().toISOString(),
      feed.id
    );
    const insert = db.prepare(`
      INSERT OR IGNORE INTO feed_items
        (id, feed_id, guid, title, authors, link, summary, published_at, pdf_url, kind, read, saved, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
    `);
    const updateKind = db.prepare('UPDATE feed_items SET kind = ? WHERE feed_id = ? AND guid = ? AND kind_locked = 0');
    for (const item of fetched.items) {
      insert.run(
        feedItemId(feed.id, item.guid),
        feed.id,
        item.guid,
        item.title,
        item.authors,
        item.link,
        item.summary,
        item.published_at,
        item.pdf_url,
        item.kind || 'unknown',
        new Date().toISOString()
      );
      updateKind.run(item.kind || 'unknown', feed.id, item.guid);
    }
    return { feed: db.prepare('SELECT * FROM feeds WHERE id = ?').get(feed.id), count: fetched.items.length };
  } catch (error) {
    db.prepare('UPDATE feeds SET last_error = ?, last_fetch_at = ? WHERE id = ?').run(
      error.message,
      new Date().toISOString(),
      feed.id
    );
    throw error;
  }
}

async function addFeed(url, titleHint = '') {
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('feed URL must be http(s)');
  const existing = db.prepare('SELECT * FROM feeds WHERE url = ?').get(parsedUrl.toString());
  if (existing) {
    await refreshFeedRow(existing);
    return db.prepare('SELECT * FROM feeds WHERE id = ?').get(existing.id);
  }
  const fetched = await fetchFeed(parsedUrl.toString());
  const id = `feed-${randomUUID()}`;
  db.prepare('INSERT INTO feeds (id, title, url, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    titleHint || fetched.title,
    parsedUrl.toString(),
    new Date().toISOString()
  );
  await refreshFeedRow({ id, title: titleHint || fetched.title, url: parsedUrl.toString() });
  return db.prepare('SELECT * FROM feeds WHERE id = ?').get(id);
}

async function refreshAllFeeds(onlyDue = false, hours = 6) {
  const feeds = db.prepare('SELECT * FROM feeds').all();
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const target = onlyDue
    ? feeds.filter((feed) => !feed.last_fetch_at || new Date(feed.last_fetch_at).getTime() < cutoff)
    : feeds;
  let refreshed = 0;
  const errors = [];
  for (const feed of target) {
    try {
      await refreshFeedRow(feed);
      refreshed += 1;
    } catch (error) {
      errors.push({ feed: feed.title, error: error.message });
    }
  }
  return { refreshed, errors, checked: target.length };
}

function listFeeds() {
  const feeds = db
    .prepare(
      `SELECT f.*, COUNT(i.id) AS item_count, SUM(CASE WHEN i.read = 0 THEN 1 ELSE 0 END) AS unread_count
       FROM feeds f LEFT JOIN feed_items i ON i.feed_id = f.id
       GROUP BY f.id ORDER BY f.created_at DESC`
    )
    .all();
  const items = db
    .prepare(
      `SELECT i.*, f.title AS feed_title FROM feed_items i
       JOIN feeds f ON f.id = i.feed_id
       ORDER BY COALESCE(i.published_at, i.created_at) DESC LIMIT 200`
    )
    .all();
  return { feeds, items };
}

const ALLOWED_PDF_HOSTS = new Set([
  'arxiv.org',
  'www.arxiv.org',
  'europepmc.org',
  'www.europepmc.org',
  'www.ebi.ac.uk',
  'ncbi.nlm.nih.gov',
  'www.ncbi.nlm.nih.gov',
  'biorxiv.org',
  'www.biorxiv.org',
  'medrxiv.org',
  'www.medrxiv.org',
]);

function feedDoiFromLink(link) {
  const value = decodeURIComponent(String(link || ''));
  const direct = value.match(/\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  if (direct) return direct[1].replace(/[.,;]+$/, '');
  const nature = value.match(/nature\.com\/articles\/([a-z]\d+(?:-[a-z0-9]+)+)/i);
  if (nature) return `10.1038/${nature[1]}`;
  return '';
}

function cleanCrossrefText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function crossrefMetadata(doi) {
  if (!doi) return {};
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: { 'user-agent': 'dsh-litd/0.1 (mailto:local@example.invalid)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Crossref HTTP ${response.status}`);
  const body = await response.json();
  const message = body.message || {};
  const authors = (message.author || [])
    .map((author) => [author.given, author.family].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(', ');
  const date = message['published-print'] || message['published-online'] || message.published || {};
  const year = date['date-parts']?.[0]?.[0] || null;
  const abstract = String(message.abstract || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    title: cleanCrossrefText(Array.isArray(message.title) ? message.title[0] : message.title),
    authors: cleanCrossrefText(authors),
    year,
    venue: cleanCrossrefText(Array.isArray(message['container-title']) ? message['container-title'][0] : message['container-title']),
    doi,
    abstract,
  };
}

function crossrefMessageMetadata(message, fallbackDoi) {
  const authors = (message.author || [])
    .map((author) => [author.given, author.family].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(', ');
  const date = message['published-print'] || message['published-online'] || message.published || {};
  return {
    title: cleanCrossrefText(Array.isArray(message.title) ? message.title[0] : message.title),
    authors: cleanCrossrefText(authors),
    year: date['date-parts']?.[0]?.[0] || null,
    venue: cleanCrossrefText(Array.isArray(message['container-title']) ? message['container-title'][0] : message['container-title']),
    doi: message.DOI || fallbackDoi,
    abstract: cleanCrossrefText(message.abstract),
  };
}

async function crossrefByTitle(title) {
  const response = await fetch(
    `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(title)}&filter=type:journal-article&rows=5`,
    {
      headers: { 'user-agent': 'dsh-litd/0.1 (mailto:local@example.invalid)' },
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!response.ok) throw new Error(`Crossref HTTP ${response.status}`);
  const body = await response.json();
  const items = (body.message?.items || []).filter(
    (item) =>
      item?.title?.[0] &&
      !/^(faculty opinions|comment on|correction|erratum|retraction)\b/i.test(item.title[0])
  );
  const wanted = new Set(graphTokens(title));
  for (const message of items) {
    const metadata = crossrefMessageMetadata(message, message.DOI);
    const found = new Set(graphTokens(metadata.title || ''));
    const overlap = [...wanted].filter((word) => found.has(word)).length;
    if (!wanted.size || overlap / wanted.size < 0.5) continue;
    return metadata;
  }
  throw new Error('Crossref 标题匹配度不足');
}

async function enrichPaperBibliographic(row) {
  let metadata = null;
  if (row.doi) {
    metadata = await crossrefMetadata(row.doi);
  } else if (row.title) {
    try {
      metadata = await crossrefByTitle(row.title);
    } catch (error) {
      metadata = null;
    }
    if (!metadata && row.pdf_path && fs.existsSync(row.pdf_path)) {
      try {
        const pages = JSON.parse(row.pages_json || '[]');
        const guessed = guessPdfTitle(pages[0]?.text || '');
        if (guessed) metadata = await crossrefByTitle(guessed);
      } catch (error) {
        metadata = null;
      }
    }
  }
  if (!metadata || (!metadata.title && !metadata.venue && !metadata.doi)) {
    throw new Error('没有可补全的元数据');
  }
  const next = {
    title: metadata.title || row.title,
    authors: metadata.authors || row.authors,
    year: metadata.year || row.year,
    venue: metadata.venue || row.venue,
    doi: row.doi || metadata.doi,
    abstract: metadata.abstract || row.abstract,
  };
  db.prepare(
    'UPDATE papers SET title = ?, authors = ?, year = ?, venue = ?, doi = ?, abstract = ? WHERE id = ?'
  ).run(next.title, next.authors, next.year, next.venue, next.doi, next.abstract, row.id);
  const updated = db.prepare('SELECT * FROM papers WHERE id = ?').get(row.id);
  indexPaper({
    id: updated.id,
    title: updated.title,
    authors: updated.authors,
    abstract: updated.abstract,
    pages: JSON.parse(updated.pages_json || '[]'),
  });
  return { before: { title: row.title, venue: row.venue }, after: serializePaper(updated) };
}

async function enrichFeedItemMetadata(item) {
  const doi = feedDoiFromLink(item.link || '');
  let metadata = {};
  if (doi) {
    try {
      metadata = await crossrefMetadata(doi);
    } catch (error) {
      metadata = { doi };
    }
  }
  return {
    title: metadata.title || item.title,
    authors: metadata.authors || item.authors || '',
    year:
      metadata.year ||
      (String(item.published_at || '').match(/\b(19|20)\d{2}\b/)?.[0]
        ? Number(String(item.published_at).match(/\b(19|20)\d{2}\b/)[0])
        : null),
    venue: metadata.venue || item.feed_title || 'Unknown',
    doi: metadata.doi || doi,
    abstract: metadata.abstract || item.summary || '',
  };
}

function updatePaperMetadataFields(paper, metadata) {
  if (!paper?.id) return paper;
  db.prepare(
    'UPDATE papers SET title = ?, authors = ?, year = ?, venue = ?, doi = ?, abstract = ? WHERE id = ?'
  ).run(
    metadata.title || paper.title,
    metadata.authors || paper.authors,
    metadata.year || paper.year,
    metadata.venue || paper.venue,
    metadata.doi || paper.doi,
    metadata.abstract || paper.abstract,
    paper.id
  );
  const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(paper.id);
  indexPaper({
    id: row.id,
    title: row.title,
    authors: row.authors,
    abstract: row.abstract,
    pages: JSON.parse(row.pages_json || '[]'),
  });
  return serializePaper(row);
}

async function importExternalPaper(pdfUrl, title, venue) {
  const parsed = new URL(String(pdfUrl || ''));
  if (parsed.protocol !== 'https:' || !ALLOWED_PDF_HOSTS.has(parsed.hostname)) {
    throw new Error('PDF host is not allowed');
  }
  const response = await fetch(parsed.toString(), {
    headers: { 'user-agent': 'dsh-litd/0.1 (local literature workspace)' },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`PDF download HTTP ${response.status}`);
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > 50 * 1024 * 1024) throw new Error('PDF is larger than 50 MB');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 50 * 1024 * 1024) throw new Error('PDF is larger than 50 MB');
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('downloaded file is not a PDF');
  const tempPath = path.join(pdfDir, `arxiv-${Date.now()}.pdf`);
  fs.writeFileSync(tempPath, bytes);
  try {
    return await importPdfAsync({ pdfPath: tempPath, title: title || undefined, venue: venue || undefined });
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch (error) {
      // The library copy is retained; a temp leftover is harmless.
    }
  }
}

async function extractPdf(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    standardFontDataUrl: path.join(pdfjsRoot, 'standard_fonts/') + path.sep,
  }).promise;
  const metadata = await doc.getMetadata().catch(() => null);
  const pages = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = [];
    const charItems = [];
    let text = '';
    let lastY = null;

    for (const item of content.items) {
      const str = String(item.str || '');
      if (!str) continue;
      const tr = item.transform || [1, 0, 0, 1, 0, 0];
      const x = Number(tr[4]) || 0;
      const y = Number(tr[5]) || 0;
      const h = Number(item.height) || Math.abs(Number(tr[3])) || 10;
      const w = Number(item.width) || 0;

      if (lastY !== null && Math.abs(y - lastY) > Math.max(2, h * 0.45) && !text.endsWith('\n')) {
        text += '\n';
        charItems.push(-1);
      }

      const index = items.length;
      const bboxPdf = [x, y - h, x + w, y];
      const viewRect = viewport.convertToViewportRectangle(bboxPdf);
      items.push({
        index,
        text: str,
        bbox_pdf: bboxPdf.map((v) => Math.round(v * 100) / 100),
        bbox_view: [
          Math.min(viewRect[0], viewRect[2]),
          Math.min(viewRect[1], viewRect[3]),
          Math.max(viewRect[0], viewRect[2]),
          Math.max(viewRect[1], viewRect[3]),
        ].map((v) => Math.round(v * 100) / 100),
        font_size: Math.round(h * 100) / 100,
      });

      for (const ch of str) {
        text += ch;
        charItems.push(index);
      }
      if (item.hasEOL) {
        text += '\n';
        charItems.push(-1);
      }
      lastY = y;
    }

    pages.push({
      page_index: pageNumber - 1,
      page_number: pageNumber,
      width: Math.round(viewport.width * 100) / 100,
      height: Math.round(viewport.height * 100) / 100,
      text,
      items,
      char_items: charItems,
    });
  }

  return {
    metadata: metadata?.info || null,
    pageCount: doc.numPages,
    pages,
  };
}

function normalizeWithMap(text) {
  let out = '';
  const map = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\u00ad') {
      i += 1;
      continue;
    }
    if (ch === '-' && (text[i + 1] === '\n' || text[i + 1] === '\r')) {
      i += 2;
      while (i < text.length && /\s/.test(text[i])) i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      if (out && out[out.length - 1] !== ' ') {
        out += ' ';
        map.push(i);
      }
      i += 1;
      continue;
    }
    const normalized = ch.normalize('NFKC').toLowerCase();
    for (const c of normalized) {
      out += c;
      map.push(i);
    }
    i += 1;
  }
  return { text: out, map };
}

function locateQuote(pages, quote) {
  const normalizedQuote = normalizeWithMap(quote).text.trim();
  for (const page of pages) {
    const normalizedPage = normalizeWithMap(page.text);
    const start = normalizedPage.text.indexOf(normalizedQuote);
    if (start < 0) continue;
    const end = start + normalizedQuote.length;
    const startOrig = normalizedPage.map[start];
    const endOrig = normalizedPage.map[end - 1] + 1;
    const itemIds = new Set();
    for (let i = startOrig; i < endOrig; i += 1) {
      const itemId = page.char_items[i];
      if (itemId >= 0) itemIds.add(itemId);
    }
    const items = [...itemIds].map((id) => page.items[id]).filter(Boolean);
    const bboxPdf = items.length
      ? [
          Math.min(...items.map((item) => item.bbox_pdf[0])),
          Math.min(...items.map((item) => item.bbox_pdf[1])),
          Math.max(...items.map((item) => item.bbox_pdf[2])),
          Math.max(...items.map((item) => item.bbox_pdf[3])),
        ]
      : null;
    return {
      found: true,
      page_number: page.page_number,
      page_index: page.page_index,
      bbox_pdf: bboxPdf,
      matched_text: page.text.slice(startOrig, endOrig),
      method: 'normalized',
    };
  }
  return { found: false, quote };
}

function isBadPdfTitle(value) {
  const title = String(value || '').trim();
  return (
    !title ||
    /^(untitled|microsoft word|document\d*|upload-|paper-|pdf)$/i.test(title) ||
    /\.(pdf|docx?|tex)$/i.test(title)
  );
}

function guessPdfTitle(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 18 && line.length <= 240);
  return (
    lines.find(
      (line) =>
        /[a-z]{3}/i.test(line) &&
        line.split(' ').length >= 4 &&
        !/^(abstract|keywords|introduction|doi|https?:\/\/|www\.|copyright|received|accepted|published)\b/i.test(line) &&
        !/\b(journal|volume|vol\.|issue|issn|isbn)\b/i.test(line)
    ) || ''
  );
}

async function importPdfAsync({
  pdfPath,
  summaryPath,
  groups = null,
  title,
  filenameHint,
  venue = null,
  autoSummary = false,
}) {
  if (!pdfPath || !fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`);
  const extracted = await extractPdf(pdfPath);
  const allText = extracted.pages.map((page) => page.text).join('\n');
  const meta = extracted.metadata || {};
  const doi = guessDoi(allText);
  const metadataTitle = isBadPdfTitle(meta.Title) ? '' : String(meta.Title).trim();
  const fallbackName = filenameHint || path.basename(pdfPath, path.extname(pdfPath));
  const guessedTitle = guessPdfTitle(extracted.pages[0]?.text || '');
  let crossref = null;
  if (doi) {
    try {
      crossref = await crossrefMetadata(doi);
    } catch (error) {
      crossref = null;
    }
  } else if (guessedTitle.length >= 20) {
    try {
      crossref = await crossrefByTitle(guessedTitle);
    } catch (error) {
      crossref = null;
    }
  }
  const finalTitle =
    title ||
    crossref?.title ||
    metadataTitle ||
    guessedTitle ||
    fallbackName;
  const existing = db.prepare('SELECT id, summary_json, groups_json FROM papers WHERE lower(title) = lower(?)').get(finalTitle);
  const id = existing?.id || `paper-${Date.now()}`;
  const storedPdfPath = path.join(pdfDir, `${id}.pdf`);
  if (path.resolve(pdfPath) !== path.resolve(storedPdfPath)) {
    fs.copyFileSync(pdfPath, storedPdfPath);
  }
  let summary = normalizeSummary(null);
  if (summaryPath && fs.existsSync(summaryPath)) {
    summary = normalizeSummary(JSON.parse(fs.readFileSync(summaryPath, 'utf8')));
  } else if (existing?.summary_json && !autoSummary) {
    summary = normalizeSummary(JSON.parse(existing.summary_json));
  } else if (autoSummary) {
    summary = buildAutoSummary(extracted);
  }
  const finalGroups = Array.isArray(groups) && groups.length
    ? groups
    : existing?.groups_json
      ? JSON.parse(existing.groups_json)
      : [];
  const record = {
    id,
    title: finalTitle,
    authors: crossref?.authors || meta.Author || 'Unknown',
    year: crossref?.year || guessYear(meta),
    venue: venue || crossref?.venue || venueFromDoi(doi) || 'Imported PDF',
    doi: doi || crossref?.doi || '',
    arxiv: null,
    abstract: crossref?.abstract || extractAbstract(extracted.pages[0]?.text || ''),
    pageCount: extracted.pageCount,
    groups: finalGroups,
    summary,
    pages: extracted.pages,
    pdfPath: storedPdfPath,
    sourcePdfPath: pdfPath,
  };

  db.prepare(`
    INSERT INTO papers (id, title, authors, year, venue, doi, arxiv, abstract, page_count, groups_json, summary_json, pages_json, pdf_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      authors = excluded.authors,
      year = excluded.year,
      venue = excluded.venue,
      doi = excluded.doi,
      abstract = excluded.abstract,
      page_count = excluded.page_count,
      groups_json = excluded.groups_json,
      summary_json = excluded.summary_json,
      pages_json = excluded.pages_json,
      pdf_path = excluded.pdf_path
  `).run(
    record.id,
    record.title,
    record.authors,
    record.year,
    record.venue,
    record.doi,
    record.arxiv,
    record.abstract,
    record.pageCount,
    JSON.stringify(record.groups),
    JSON.stringify(record.summary),
    JSON.stringify(record.pages),
    record.pdfPath,
    new Date().toISOString()
  );

  indexPaper(record);
  return serializePaper(db.prepare('SELECT * FROM papers WHERE id = ?').get(record.id));
}

function compareTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleSimilarity(a, b) {
  const left = compareTitle(a);
  const right = compareTitle(b);
  if (!left || !right) return 0;
  if (left === right || left.includes(right) || right.includes(left)) return 1;
  const leftWords = new Set(left.split(' ').filter((word) => word.length >= 3));
  const rightWords = new Set(right.split(' ').filter((word) => word.length >= 3));
  if (!leftWords.size || !rightWords.size) return 0;
  let overlap = 0;
  for (const word of leftWords) if (rightWords.has(word)) overlap += 1;
  return overlap / Math.max(leftWords.size, rightWords.size);
}

async function attachPdfToPaper(id, pdfPath, force = false) {
  const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(id);
  if (!row) throw new Error('paper not found');
  const extracted = await extractPdf(pdfPath);
  const allText = extracted.pages.map((page) => page.text).join('\n');
  const pdfTitle = String(extracted.metadata?.Title || '').trim();
  const pdfDoi = guessDoi(allText);
  const existingDoi = String(row.doi || '').replace(/^https?:\/\/doi\.org\//i, '').trim().toLowerCase();
  const detectedDoi = String(pdfDoi || '').replace(/^https?:\/\/doi\.org\//i, '').trim().toLowerCase();
  const reasons = [];
  if (existingDoi && detectedDoi && existingDoi !== detectedDoi) {
    reasons.push(`DOI 不一致（PDF: ${detectedDoi}，文献: ${existingDoi}）`);
  }
  const similarity = pdfTitle.length >= 12 ? titleSimilarity(pdfTitle, row.title) : null;
  if (similarity !== null && similarity < 0.35) {
    reasons.push(`标题相似度较低（${Math.round(similarity * 100)}%）`);
  }
  if (reasons.length && !force) {
    const error = new Error('PDF 与目标文献可能不匹配');
    error.code = 'pdf_mismatch';
    error.reasons = reasons;
    error.detected = { title: pdfTitle, doi: detectedDoi };
    error.existing = { title: row.title, doi: existingDoi };
    throw error;
  }
  const storedPdfPath = path.join(pdfDir, `${id}.pdf`);
  if (path.resolve(pdfPath) !== path.resolve(storedPdfPath)) {
    fs.copyFileSync(pdfPath, storedPdfPath);
  }
  const abstract =
    String(row.abstract || '').trim() ||
    extractAbstract(extracted.pages[0]?.text || '');
  db.prepare(
    `UPDATE papers
     SET pdf_path = ?, page_count = ?, pages_json = ?, abstract = ?
     WHERE id = ?`
  ).run(
    storedPdfPath,
    extracted.pageCount,
    JSON.stringify(extracted.pages),
    abstract,
    id
  );
  indexPaper({
    id,
    title: row.title,
    authors: row.authors,
    abstract,
    pages: extracted.pages,
  });
  return serializePaper(db.prepare('SELECT * FROM papers WHERE id = ?').get(id));
}

function importPaperMetadata(payload) {
  const title = String(payload.title || '').trim();
  if (!title) throw new Error('title required');
  const existing = db.prepare('SELECT id FROM papers WHERE lower(title) = lower(?)').get(title);
  // Batch imports can create several papers within the same millisecond, so
  // the id needs a random suffix to stay unique.
  const id = existing?.id || `paper-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const summary = normalizeSummary(null);
  const abstract = String(payload.abstract || '').trim();
  const sourceUrl = String(payload.source_url || '').trim();
  const venue = String(payload.venue || '').trim() || venueFromDoi(payload.doi) || 'Unknown';
  db.prepare(`
    INSERT INTO papers (id, title, authors, year, venue, doi, arxiv, abstract, page_count, groups_json, summary_json, pages_json, pdf_path, source_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      authors = excluded.authors,
      year = excluded.year,
      venue = excluded.venue,
      doi = excluded.doi,
      abstract = excluded.abstract,
      source_url = excluded.source_url
  `).run(
    id,
    title,
    String(payload.authors || ''),
    payload.year ? Number(payload.year) || null : null,
    venue,
    String(payload.doi || ''),
    null,
    abstract,
    0,
    JSON.stringify([]),
    JSON.stringify(summary),
    JSON.stringify([]),
    null,
    sourceUrl,
    new Date().toISOString()
  );
  indexPaper({ id, title, authors: String(payload.authors || ''), abstract, pages: [] });
  return serializePaper(db.prepare('SELECT * FROM papers WHERE id = ?').get(id));
}

function normalizeDoiValue(value) {
  return String(value || '')
    .replace(/^\s*doi:\s*/i, '')
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .trim()
    .toLowerCase();
}

function bibliographyYear(value) {
  const match = String(value || '').match(/\b(1[5-9]\d{2}|2\d{3})\b/);
  return match ? Number(match[1]) : null;
}

function joinBibliographyAuthors(values) {
  return values
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ');
}

// Both parsers keep the raw tag stream and share one field mapper:
// RIS: TI/T1 title, AU authors, PY year, JO/JF venue, DO doi, AB abstract, UR url
// EndNote: %T title, %A authors, %D year, %J venue, %R doi, %X abstract, %U url
function bibliographyRecordFromFields(type, fields) {
  const values = (tags) =>
    fields
      .filter(([tag]) => tags.includes(tag))
      .map(([, value]) => String(value || '').trim())
      .filter(Boolean);
  return {
    type: String(type || '').trim(),
    title: values(['TI', 'T1', 'T'])[0] || '',
    authors: joinBibliographyAuthors(values(['AU', 'A'])),
    year: bibliographyYear(values(['PY', 'Y1', 'D'])[0]),
    venue: values(['JO', 'JF', 'J'])[0] || '',
    doi: normalizeDoiValue(values(['DO', 'R'])[0]),
    abstract: values(['AB', 'X'])[0] || '',
    source_url: values(['UR', 'U'])[0] || '',
  };
}

function parseRisRecords(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const records = [];
  let current = null;
  let lastField = null;
  const finish = () => {
    if (current && current.fields.length > 0) records.push(current);
    current = null;
    lastField = null;
  };
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    const match = line.match(/^([A-Z][A-Z0-9]) {1,2}- ?(.*)$/);
    if (!match) {
      // Wrapped value lines continue the previous tag.
      if (current && lastField) lastField[1] = `${lastField[1]} ${line.trim()}`.trim();
      continue;
    }
    const tag = match[1];
    const value = match[2].trim();
    if (tag === 'TY') {
      finish();
      current = { type: value, fields: [] };
      lastField = null;
      continue;
    }
    if (!current) continue;
    if (tag === 'ER') {
      finish();
      continue;
    }
    lastField = [tag, value];
    current.fields.push(lastField);
  }
  finish();
  return records.map((record) => bibliographyRecordFromFields(record.type, record.fields));
}

function parseEndNoteRecords(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const records = [];
  let current = null;
  let lastField = null;
  const finish = () => {
    if (current && current.fields.length) records.push(current);
    current = null;
    lastField = null;
  };
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      finish();
      continue;
    }
    const match = line.match(/^%(\S)\s?(.*)$/);
    if (!match) {
      if (current && lastField) lastField[1] = `${lastField[1]} ${line.trim()}`.trim();
      continue;
    }
    const tag = match[1];
    const value = match[2].trim();
    if (tag === '0') {
      finish();
      current = { type: value, fields: [] };
      lastField = null;
      continue;
    }
    if (!current) current = { type: '', fields: [] };
    lastField = [tag, value];
    current.fields.push(lastField);
  }
  finish();
  return records.map((record) => bibliographyRecordFromFields(record.type, record.fields));
}

function parseBibliographyText(text, format) {
  const normalizedFormat = String(format || '').toLowerCase();
  if (normalizedFormat === 'ris') return parseRisRecords(text);
  if (normalizedFormat === 'endnote' || normalizedFormat === 'enw' || normalizedFormat === 'nbib') {
    return parseEndNoteRecords(text);
  }
  throw new Error('unsupported format (expected ris or endnote)');
}

function importBibliography(text, format) {
  const records = parseBibliographyText(text, format);
  if (records.length === 0) throw new Error('no bibliography records found');
  const existingDois = new Set();
  const existingTitles = new Set();
  for (const row of db.prepare('SELECT title, doi FROM papers').all()) {
    const doi = normalizeDoiValue(row.doi);
    if (doi) existingDois.add(doi);
    const titleKey = compareTitle(row.title);
    if (titleKey) existingTitles.add(titleKey);
  }
  const imported = [];
  const skippedRecords = [];
  const errors = [];
  records.forEach((record, index) => {
    const title = String(record.title || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!title) {
      errors.push({ index, error: 'title missing', doi: record.doi || '' });
      return;
    }
    const doi = normalizeDoiValue(record.doi);
    const titleKey = compareTitle(title);
    const duplicateReason =
      doi && existingDois.has(doi)
        ? 'duplicate doi'
        : titleKey && existingTitles.has(titleKey)
          ? 'duplicate title'
          : '';
    if (duplicateReason) {
      skippedRecords.push({ index, title, doi, reason: duplicateReason });
      return;
    }
    try {
      const paper = importPaperMetadata({
        title,
        authors: record.authors,
        year: record.year,
        venue: record.venue,
        doi: doi || record.doi,
        abstract: record.abstract,
        source_url: record.source_url,
      });
      imported.push(paper);
      if (doi) existingDois.add(doi);
      if (titleKey) existingTitles.add(titleKey);
    } catch (error) {
      errors.push({ index, title, doi, error: error.message });
    }
  });
  return {
    format: String(format || '').toLowerCase(),
    parsed: records.length,
    imported: imported.length,
    skipped: skippedRecords.length,
    skipped_records: skippedRecords,
    errors,
    papers: imported,
  };
}

const GRAPH_STOPWORDS = new Set(
  'the and for with that this from are was were has have into their they its not but can may also using used study results show here these such more than between within which while been our we you'.split(/\s+/)
);

function graphTokens(text) {
  return (String(text || '').toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter(
    (word) => !GRAPH_STOPWORDS.has(word)
  );
}

function buildSemanticGraph(threshold = 0.14) {
  const rows = db.prepare('SELECT * FROM papers ORDER BY created_at ASC LIMIT 200').all();
  const docs = rows.map((row) => {
    const summary = JSON.parse(row.summary_json || '{}');
    const summaryText = (summary.sections || [])
      .flatMap((section) => (section.entries || []).map((entry) => entry.text || ''))
      .join(' ');
    const text = [row.title, row.abstract, summaryText].filter(Boolean).join(' ');
    const tf = new Map();
    for (const word of graphTokens(text)) tf.set(word, (tf.get(word) || 0) + 1);
    return { row, text, tf };
  });
  const df = new Map();
  for (const doc of docs) {
    for (const word of doc.tf.keys()) df.set(word, (df.get(word) || 0) + 1);
  }
  const vectors = docs.map((doc) => {
    const vector = new Map();
    let norm = 0;
    for (const [word, count] of doc.tf) {
      const idf = Math.log((docs.length + 1) / (df.get(word) + 1)) + 1;
      const value = (1 + Math.log(count)) * idf;
      vector.set(word, value);
      norm += value * value;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [word, value] of vector) vector.set(word, value / norm);
    return vector;
  });
  const similarity = (a, b) => {
    let total = 0;
    for (const [word, value] of a) if (b.has(word)) total += value * b.get(word);
    return total;
  };
  const sims = [];
  for (let i = 0; i < docs.length; i += 1) {
    for (let j = i + 1; j < docs.length; j += 1) {
      sims.push({ i, j, value: similarity(vectors[i], vectors[j]) });
    }
  }

  let clusters = docs.map((_, index) => [index]);
  while (clusters.length > 1) {
    let best = null;
    for (let a = 0; a < clusters.length; a += 1) {
      for (let b = a + 1; b < clusters.length; b += 1) {
        let total = 0;
        let count = 0;
        for (const i of clusters[a]) {
          for (const j of clusters[b]) {
            const pair = sims.find((item) => (item.i === i && item.j === j) || (item.i === j && item.j === i));
            total += pair?.value || 0;
            count += 1;
          }
        }
        const average = count ? total / count : 0;
        if (!best || average > best.value) best = { a, b, value: average };
      }
    }
    if (!best || best.value < threshold) break;
    clusters[best.a] = clusters[best.a].concat(clusters[best.b]);
    clusters.splice(best.b, 1);
  }

  const width = 720;
  const height = 460;
  const nodes = [];
  const clusterLabels = [];
  clusters.forEach((indices, clusterIndex) => {
    const terms = new Map();
    for (const index of indices) {
      for (const [word, value] of vectors[index]) terms.set(word, (terms.get(word) || 0) + value);
    }
    const label =
      [...terms.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([word]) => word)
        .join(' / ') || '未命名聚类';
    clusterLabels.push(label);
    const centerAngle = clusters.length === 1 ? 0 : (Math.PI * 2 * clusterIndex) / clusters.length - Math.PI / 2;
    const centerRadius = clusters.length === 1 ? 0 : 145;
    const cx = width / 2 + Math.cos(centerAngle) * centerRadius;
    const cy = height / 2 + Math.sin(centerAngle) * centerRadius;
    const orbit = indices.length === 1 ? 0 : Math.min(48, 16 + indices.length * 12);
    indices.forEach((index, offset) => {
      const angle = (Math.PI * 2 * offset) / Math.max(indices.length, 1);
      nodes.push({
        id: `n-${rows[index].id}`,
        paperId: rows[index].id,
        title: rows[index].title,
        group: JSON.parse(rows[index].groups_json || '[]')[0] || 'ungrouped',
        x: Math.round(cx + Math.cos(angle) * orbit),
        y: Math.round(cy + Math.sin(angle) * orbit),
        cluster: clusterIndex,
        clusterLabel: label,
      });
    });
  });
  const edgeThreshold = Math.max(0.05, threshold * 0.65);
  const edges = sims
    .filter((item) => item.value >= edgeThreshold)
    .map((item, index) => ({
      id: `semantic-${index}`,
      source: `n-${rows[item.i].id}`,
      target: `n-${rows[item.j].id}`,
      type: 'semantic',
      weight: Number(item.value.toFixed(3)),
    }));
  return { nodes, edges, clusterLabels, threshold, papers: rows.length };
}

function usedPaperTags() {
  const rows = db.prepare('SELECT summary_json FROM papers').all();
  const used = new Map();
  for (const row of rows) {
    const summary = JSON.parse(row.summary_json || '{}');
    for (const section of summary.sections || []) {
      if (section.type !== 'tags') continue;
      for (const tag of section.selected || []) {
        const clean = String(tag || '').trim();
        if (!clean) continue;
        if (!used.has(clean.toLowerCase())) used.set(clean.toLowerCase(), clean);
      }
    }
  }
  return used;
}

function syncTagLibrary() {
  const used = usedPaperTags();
  const insert = db.prepare('INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)');
  for (const name of used.values()) insert.run(name, new Date().toISOString());
  const known = db.prepare('SELECT name FROM tags').all();
  for (const row of known) {
    if (!used.has(row.name.toLowerCase())) db.prepare('DELETE FROM tags WHERE name = ?').run(row.name);
  }
}

function getTagLibrary() {
  syncTagLibrary();
  const used = usedPaperTags();
  const counts = new Map();
  for (const name of used.values()) counts.set(name.toLowerCase(), (counts.get(name.toLowerCase()) || 0) + 1);
  const rows = db.prepare('SELECT name FROM tags ORDER BY name COLLATE NOCASE').all();
  return rows.map((row) => ({ name: row.name, count: counts.get(row.name.toLowerCase()) || 0 }));
}

function findCanonicalTag(name) {
  const clean = String(name || '').trim();
  if (!clean) return '';
  const existing = db.prepare('SELECT name FROM tags WHERE lower(name) = lower(?)').get(clean);
  return existing?.name || clean;
}

function setPaperTag(paperId, rawTag) {
  const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(paperId);
  if (!row) throw new Error('paper not found');
  const canonical = findCanonicalTag(rawTag);
  if (!canonical) throw new Error('empty tag');
  const summary = JSON.parse(row.summary_json || '{}');
  let section = (summary.sections || []).find((item) => item.type === 'tags');
  if (!section) {
    section = {
      key: 'topics',
      title: '主题标签',
      type: 'tags',
      options: [],
      selected: [],
      owner: 'user',
      hint: '可自由添加标签',
    };
    summary.sections = [...(summary.sections || []), section];
  }
  const options = Array.isArray(section.options) ? section.options : [];
  if (!options.some((item) => item.toLowerCase() === canonical.toLowerCase())) options.push(canonical);
  const selected = new Set(section.selected || []);
  selected.add(canonical);
  section.options = options;
  section.selected = [...selected];
  db.prepare('UPDATE papers SET summary_json = ? WHERE id = ?').run(JSON.stringify(summary), paperId);
  db.prepare('INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)').run(canonical, new Date().toISOString());
  return serializePaper(db.prepare('SELECT * FROM papers WHERE id = ?').get(paperId));
}

function removePaperTag(paperId, rawTag) {
  const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(paperId);
  if (!row) throw new Error('paper not found');
  const tag = String(rawTag || '').trim();
  if (!tag) throw new Error('empty tag');
  const summary = JSON.parse(row.summary_json || '{}');
  for (const section of summary.sections || []) {
    if (section.type !== 'tags') continue;
    section.selected = (section.selected || []).filter((item) => item.toLowerCase() !== tag.toLowerCase());
    section.options = (section.options || []).filter((item) => item.toLowerCase() !== tag.toLowerCase());
  }
  db.prepare('UPDATE papers SET summary_json = ? WHERE id = ?').run(JSON.stringify(summary), paperId);
  syncTagLibrary();
  return serializePaper(db.prepare('SELECT * FROM papers WHERE id = ?').get(paperId));
}

const OPENALEX_GENERIC_TAGS = new Set(
  [
    'Biology',
    'Genetics',
    'Gene',
    'Evolutionary biology',
    'Computational biology',
    'Cell biology',
    'Medicine',
    'Biochemistry',
    'Molecular biology',
    'Chemistry',
  ].map((item) => item.toLowerCase())
);

async function fetchOpenAlexTags(row) {
  let work = null;
  if (row.doi) {
    try {
      const response = await fetch(`https://api.openalex.org/works/https://doi.org/${row.doi}`, {
        signal: AbortSignal.timeout(20000),
        headers: { 'user-agent': 'dsh-litd/0.1 (local literature workspace)' },
      });
      if (response.ok) work = await response.json();
    } catch (error) {
      // Fall through to title search.
    }
  }
  if (!work && row.title) {
    const response = await fetch(
      `https://api.openalex.org/works?search=${encodeURIComponent(row.title)}&per-page=1`,
      { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'dsh-litd/0.1' } }
    );
    if (response.ok) {
      const body = await response.json();
      work = body.results?.[0] || null;
    }
  }
  if (!work) return [];
  const tags = new Set();
  for (const concept of work.concepts || []) {
    const name = String(concept.display_name || '').trim();
    if (!name || OPENALEX_GENERIC_TAGS.has(name.toLowerCase())) continue;
    if (Number(concept.score) < 0.45) continue;
    tags.add(name);
    if (tags.size >= 8) break;
  }
  for (const value of [work.primary_topic?.display_name, work.primary_topic?.subfield?.display_name]) {
    const name = String(value || '').trim();
    if (name && !OPENALEX_GENERIC_TAGS.has(name.toLowerCase())) tags.add(name);
  }
  return [...tags];
}

async function refreshPaperTags() {
  const rows = db.prepare('SELECT * FROM papers').all();
  let updated = 0;
  const errors = [];
  for (const row of rows) {
    try {
      const tags = await fetchOpenAlexTags(row);
      db.prepare('UPDATE papers SET tags_json = ? WHERE id = ?').run(JSON.stringify(tags), row.id);
      updated += 1;
    } catch (error) {
      errors.push({ title: row.title, error: error.message });
    }
  }
  return { updated, total: rows.length, errors };
}

function buildTagGraph() {
  const rows = db.prepare('SELECT * FROM papers ORDER BY created_at ASC LIMIT 200').all();
  const docs = rows.map((row) => {
    const summary = JSON.parse(row.summary_json || '{}');
    const manual = (summary.sections || [])
      .filter((section) => section.type === 'tags')
      .flatMap((section) => section.selected || []);
    const tags = [...new Set([...(JSON.parse(row.tags_json || '[]') || []), ...manual])];
    return { row, tags };
  });
  const tagFrequency = new Map();
  for (const doc of docs) {
    for (const tag of doc.tags) {
      const key = tag.toLowerCase();
      tagFrequency.set(key, (tagFrequency.get(key) || 0) + 1);
    }
  }
  const maxFrequency = Math.max(3, Math.ceil(docs.length * 0.5));
  const usable = (tag) => (tagFrequency.get(tag.toLowerCase()) || 0) < maxFrequency;
  const tagSets = docs.map(
    (doc) => new Set(doc.tags.filter(usable).map((tag) => tag.toLowerCase()))
  );
  const edges = [];
  for (let i = 0; i < docs.length; i += 1) {
    for (let j = i + 1; j < docs.length; j += 1) {
      const shared = docs[i].tags.filter(
        (tag) => usable(tag) && tagSets[j].has(tag.toLowerCase())
      );
      if (shared.length < 2) continue;
      edges.push({
        id: `tag-${i}-${j}`,
        source: `n-${rows[i].id}`,
        target: `n-${rows[j].id}`,
        type: 'tag',
        weight: shared.length,
        sharedTags: shared,
      });
    }
  }
  const adjacency = new Map(docs.map((_, index) => [index, new Set()]));
  for (const edge of edges) {
    const a = docs.findIndex((doc) => doc.row.id === edge.source.slice(2));
    const b = docs.findIndex((doc) => doc.row.id === edge.target.slice(2));
    if (a >= 0 && b >= 0) {
      adjacency.get(a).add(b);
      adjacency.get(b).add(a);
    }
  }
  const seen = new Set();
  const clusters = [];
  for (let i = 0; i < docs.length; i += 1) {
    if (seen.has(i)) continue;
    const queue = [i];
    const component = [];
    seen.add(i);
    while (queue.length) {
      const current = queue.shift();
      component.push(current);
      for (const next of adjacency.get(current)) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    clusters.push(component);
  }
  const width = 720;
  const height = 460;
  const nodes = [];
  const clusterLabels = [];
  clusters.forEach((indices, clusterIndex) => {
    const counts = new Map();
    for (const index of indices) {
      for (const tag of docs[index].tags) {
        if (usable(tag)) counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const label =
      [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag)[0] ||
      docs[indices[0]].tags.find(usable) ||
      '未打标签';
    clusterLabels.push(label);
    const centerAngle = clusters.length === 1 ? 0 : (Math.PI * 2 * clusterIndex) / clusters.length - Math.PI / 2;
    const centerRadius = clusters.length === 1 ? 0 : 145;
    const cx = width / 2 + Math.cos(centerAngle) * centerRadius;
    const cy = height / 2 + Math.sin(centerAngle) * centerRadius;
    const orbit = indices.length === 1 ? 0 : Math.min(48, 16 + indices.length * 12);
    indices.forEach((index, offset) => {
      const angle = (Math.PI * 2 * offset) / Math.max(indices.length, 1);
      nodes.push({
        id: `n-${rows[index].id}`,
        paperId: rows[index].id,
        title: rows[index].title,
        group: JSON.parse(rows[index].groups_json || '[]')[0] || 'ungrouped',
        x: Math.round(cx + Math.cos(angle) * orbit),
        y: Math.round(cy + Math.sin(angle) * orbit),
        cluster: clusterIndex,
        clusterLabel: label,
        tags: docs[index].tags,
      });
    });
  });
  return { nodes, edges, clusterLabels, mode: 'tags', papers: rows.length };
}

function buildGroupGraph() {
  const rows = db.prepare('SELECT * FROM papers ORDER BY created_at ASC LIMIT 200').all();
  const groups = db.prepare('SELECT * FROM groups ORDER BY sort_order ASC').all();
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const docs = rows.map((row) => {
    const ids = JSON.parse(row.groups_json || '[]');
    return {
      row,
      ids,
      names: ids
        .filter((id) => id !== 'real')
        .map((id) => groupById.get(id)?.name || id)
        .filter(Boolean),
    };
  });
  const edges = [];
  for (let i = 0; i < docs.length; i += 1) {
    for (let j = i + 1; j < docs.length; j += 1) {
      const shared = docs[i].names.filter((name) => docs[j].names.includes(name));
      if (!shared.length) continue;
      edges.push({
        id: `group-${i}-${j}`,
        source: `n-${rows[i].id}`,
        target: `n-${rows[j].id}`,
        type: 'group',
        weight: shared.length,
        sharedTags: shared,
      });
    }
  }
  const adjacency = new Map(docs.map((_, index) => [index, new Set()]));
  for (const edge of edges) {
    const a = docs.findIndex((doc) => doc.row.id === edge.source.slice(2));
    const b = docs.findIndex((doc) => doc.row.id === edge.target.slice(2));
    if (a >= 0 && b >= 0) {
      adjacency.get(a).add(b);
      adjacency.get(b).add(a);
    }
  }
  const seen = new Set();
  const clusters = [];
  for (let i = 0; i < docs.length; i += 1) {
    if (seen.has(i)) continue;
    const queue = [i];
    const component = [];
    seen.add(i);
    while (queue.length) {
      const current = queue.shift();
      component.push(current);
      for (const next of adjacency.get(current)) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    clusters.push(component);
  }
  const width = 720;
  const height = 460;
  const nodes = [];
  const clusterLabels = [];
  clusters.forEach((indices, clusterIndex) => {
    const counts = new Map();
    for (const index of indices) {
      for (const name of docs[index].names) counts.set(name, (counts.get(name) || 0) + 1);
    }
    const label = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)[0] || '未分组';
    clusterLabels.push(label);
    const centerAngle = clusters.length === 1 ? 0 : (Math.PI * 2 * clusterIndex) / clusters.length - Math.PI / 2;
    const centerRadius = clusters.length === 1 ? 0 : 145;
    const cx = width / 2 + Math.cos(centerAngle) * centerRadius;
    const cy = height / 2 + Math.sin(centerAngle) * centerRadius;
    const orbit = indices.length === 1 ? 0 : Math.min(48, 16 + indices.length * 12);
    indices.forEach((index, offset) => {
      const angle = (Math.PI * 2 * offset) / Math.max(indices.length, 1);
      const primaryGroup = groupById.get(docs[index].ids.find((id) => id !== 'real'));
      nodes.push({
        id: `n-${rows[index].id}`,
        paperId: rows[index].id,
        title: rows[index].title,
        group: docs[index].ids[0] || 'ungrouped',
        x: Math.round(cx + Math.cos(angle) * orbit),
        y: Math.round(cy + Math.sin(angle) * orbit),
        cluster: clusterIndex,
        clusterLabel: label,
        tags: docs[index].names,
        groupColor: primaryGroup?.color || '#92a0ae',
      });
    });
  });
  return { nodes, edges, clusterLabels, mode: 'groups', papers: rows.length };
}

function revalidatePaperCitations(row) {
  const pages = JSON.parse(row.pages_json || '[]');
  const summary = JSON.parse(row.summary_json || '{}');
  const evidenceById = new Map((summary.evidence || []).map((item) => [item.id, item]));
  const evidence = [];
  let checked = 0;
  let located = 0;
  let missing = 0;

  for (const section of summary.sections || []) {
    for (const entry of section.entries || []) {
      const linked = (entry.evidence || []).map((id) => evidenceById.get(id)).find(Boolean);
      const quote = String(entry.quote || linked?.quote || '').trim();
      if (!quote) continue;
      checked += 1;
      const result = locateQuote(pages, quote);
      const evidenceId = (entry.evidence || [])[0] || entry.id || `revalidate-${checked}`;
      if (result.found) {
        entry.quote = result.matched_text || quote;
        entry.page = result.page_number;
        entry.bbox = result.bbox_pdf;
        entry.status = 'verified';
        entry.evidence = [evidenceId];
        evidence.push({
          id: evidenceId,
          page: result.page_number,
          bbox_pdf: result.bbox_pdf,
          quote: entry.quote,
          matched_text: entry.quote,
          method: 'normalized',
        });
        located += 1;
      } else {
        entry.page = null;
        entry.bbox = null;
        entry.status = 'missing';
        entry.evidence = [];
        missing += 1;
      }
    }
  }

  summary.evidence = evidence;
  summary.revalidated_at = new Date().toISOString();
  db.prepare('UPDATE papers SET summary_json = ? WHERE id = ?').run(JSON.stringify(summary), row.id);
  return {
    checked,
    located,
    missing,
    paper: serializePaper(db.prepare('SELECT * FROM papers WHERE id = ?').get(row.id)),
  };
}

function serializePaper(row) {
  if (!row) return null;
  const summary = JSON.parse(row.summary_json || '{}');
  const metrics = jcrForResult({ journal: row.venue || '' });
  const sections = Array.isArray(summary.sections) ? summary.sections : [];
  const hasContent = sections.some(
    (section) =>
      (Array.isArray(section.entries) &&
        section.entries.some((entry) => String(entry.text || '').trim() || String(entry.quote || '').trim())) ||
      (Array.isArray(section.selected) && section.selected.length > 0) ||
      section.value === true ||
      (typeof section.value === 'number' && section.value > 0)
  );
  return {
    id: row.id,
    title: row.title,
    authors: row.authors || '',
    year: row.year,
    venue: row.venue || '',
    doi: row.doi || '',
    arxiv: row.arxiv || '',
    abstract: row.abstract || '',
    page_count: row.page_count,
    pdf_path: row.pdf_path || '',
    source_url: row.source_url || '',
    sort_order: row.sort_order ?? null,
    impact_factor: metrics?.impact_factor ?? null,
    jcr_quartile: metrics?.quartile || null,
    groups: JSON.parse(row.groups_json || '[]'),
    status: hasContent
      ? summary.reviewed
        ? '已总结'
        : summary.ai_generated
          ? 'AI 总结'
          : summary.auto_generated
            ? 'AI 草稿'
            : '已总结'
      : '未总结',
    summary: {
      sections,
      auto_generated: Boolean(summary.auto_generated),
      ai_generated: Boolean(summary.ai_generated),
      reviewed: Boolean(summary.reviewed),
      model: summary.model || null,
    },
    evidence: Array.isArray(summary.evidence) ? summary.evidence : [],
  };
}

function listLibrary() {
  // Papers with a user-defined sort_order come first in that order. Papers
  // that have never been ordered (including new imports) keep the previous
  // newest-first behavior via created_at, so upgrading never reshuffles.
  const papers = db
    .prepare(
      'SELECT * FROM papers ORDER BY CASE WHEN sort_order IS NULL THEN 0 ELSE 1 END, sort_order ASC, created_at DESC'
    )
    .all()
    .map(serializePaper);
  const groups = db.prepare('SELECT * FROM groups ORDER BY sort_order, name').all();
  return { source: 'litd', papers, groups };
}

function indexPaper(record) {
  const body = Array.isArray(record.pages) ? record.pages.map((page) => page.text).join('\n') : '';
  db.prepare('DELETE FROM papers_fts WHERE id = ?').run(record.id);
  db.prepare('INSERT INTO papers_fts (id, title, authors, abstract, body) VALUES (?, ?, ?, ?, ?)').run(
    record.id,
    record.title || '',
    record.authors || '',
    record.abstract || '',
    body
  );
}

function rebuildSearchIndex() {
  db.exec('DELETE FROM papers_fts');
  const insert = db.prepare('INSERT INTO papers_fts (id, title, authors, abstract, body) VALUES (?, ?, ?, ?, ?)');
  const rows = db.prepare('SELECT id, title, authors, abstract, pages_json FROM papers').all();
  for (const row of rows) {
    let body = '';
    try {
      const pages = JSON.parse(row.pages_json || '[]');
      body = pages.map((page) => page.text || '').join('\n');
    } catch (error) {
      body = '';
    }
    insert.run(row.id, row.title || '', row.authors || '', row.abstract || '', body);
  }
  return rows.length;
}

function runTar(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `tar exited ${code}`));
    });
  });
}

async function createBackupArchive() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tempDir = fs.mkdtempSync(path.join(dataDir, 'backup-'));
  const dbBackup = path.join(tempDir, 'library.db');
  fs.mkdirSync(backupDir, { recursive: true });
  const archive = path.join(backupDir, `lit-backup-${stamp}.zip`);
  try {
    db.exec(`VACUUM INTO '${dbBackup.replace(/'/g, "''")}'`);
    if (fs.existsSync(pdfDir)) {
      fs.cpSync(pdfDir, path.join(tempDir, 'pdfs'), { recursive: true });
    }
    fs.writeFileSync(
      path.join(tempDir, 'manifest.json'),
      JSON.stringify(
        {
          app: 'dsh-lit',
          version: '0.1.0',
          created_at: new Date().toISOString(),
          papers: db.prepare('SELECT COUNT(*) AS n FROM papers').get().n,
          feeds: db.prepare('SELECT COUNT(*) AS n FROM feeds').get().n,
          feed_items: db.prepare('SELECT COUNT(*) AS n FROM feed_items').get().n,
        },
        null,
        2
      ),
      'utf8'
    );
    await runTar(['-a', '-c', '-f', archive, '-C', tempDir, '.']);
    return { archive, stamp };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((name) => /^lit-backup-.*\.zip$/.test(name))
    .map((name) => {
      const stat = fs.statSync(path.join(backupDir, name));
      return { name, bytes: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function pruneBackups(keep = 12) {
  const backups = listBackups();
  for (const backup of backups.slice(keep)) {
    try {
      fs.rmSync(path.join(backupDir, backup.name), { force: true });
    } catch (error) {
      // Best-effort retention.
    }
  }
}

async function restoreFromArchive(buffer) {
  if (!buffer.length || buffer.subarray(0, 2).toString('latin1') !== 'PK') {
    throw new Error('not a zip backup');
  }
  const tempDir = fs.mkdtempSync(path.join(dataDir, 'restore-upload-'));
  const zipPath = path.join(tempDir, 'backup.zip');
  const oldDir = path.join(tempDir, 'old');
  fs.writeFileSync(zipPath, buffer);
  let closed = false;
  try {
    const result = spawn('tar', ['-x', '-f', zipPath, '-C', tempDir], { windowsHide: true });
    const code = await new Promise((resolve, reject) => {
      result.on('error', reject);
      result.on('close', resolve);
    });
    if (code !== 0) throw new Error(`tar exited ${code}`);
    const restoredDb = path.join(tempDir, 'library.db');
    if (!fs.existsSync(restoredDb)) throw new Error('backup has no library.db');
    const check = new DatabaseSync(restoredDb, { readOnly: true });
    try {
      check.prepare('SELECT COUNT(*) AS n FROM papers').get();
      check.prepare('SELECT COUNT(*) AS n FROM groups').get();
    } finally {
      check.close();
    }

    await createBackupArchive();
    fs.mkdirSync(oldDir, { recursive: true });
    if (fs.existsSync(path.join(dataDir, 'library.db'))) {
      fs.copyFileSync(path.join(dataDir, 'library.db'), path.join(oldDir, 'library.db'));
    }
    if (fs.existsSync(pdfDir)) fs.cpSync(pdfDir, path.join(oldDir, 'pdfs'), { recursive: true });

    db.close();
    closed = true;
    for (const suffix of ['', '-wal', '-shm']) {
      const file = path.join(dataDir, `library.db${suffix}`);
      if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    }
    fs.copyFileSync(restoredDb, path.join(dataDir, 'library.db'));
    fs.rmSync(pdfDir, { recursive: true, force: true });
    fs.mkdirSync(pdfDir, { recursive: true });
    const restoredPdfDir = path.join(tempDir, 'pdfs');
    if (fs.existsSync(restoredPdfDir)) fs.cpSync(restoredPdfDir, pdfDir, { recursive: true });

    db = new DatabaseSync(path.join(dataDir, 'library.db'));
    db.exec('PRAGMA journal_mode = WAL');
    invalidateAiCriteriaCache();
    ensureSortOrderColumns();
    invalidateJcrCache();
    syncTagLibrary();
    closed = false;
    return {
      papers: db.prepare('SELECT COUNT(*) AS n FROM papers').get().n,
      groups: db.prepare('SELECT COUNT(*) AS n FROM groups').get().n,
      feeds: db.prepare('SELECT COUNT(*) AS n FROM feeds').get().n,
    };
  } catch (error) {
    if (closed) {
      try {
        for (const suffix of ['', '-wal', '-shm']) {
          const file = path.join(dataDir, `library.db${suffix}`);
          if (fs.existsSync(file)) fs.rmSync(file, { force: true });
        }
        if (fs.existsSync(path.join(oldDir, 'library.db'))) {
          fs.copyFileSync(path.join(oldDir, 'library.db'), path.join(dataDir, 'library.db'));
        }
        fs.rmSync(pdfDir, { recursive: true, force: true });
        fs.mkdirSync(pdfDir, { recursive: true });
        if (fs.existsSync(path.join(oldDir, 'pdfs'))) {
          fs.cpSync(path.join(oldDir, 'pdfs'), pdfDir, { recursive: true });
        }
        db = new DatabaseSync(path.join(dataDir, 'library.db'));
        db.exec('PRAGMA journal_mode = WAL');
      } catch (rollbackError) {
        console.error('[litd] restore rollback failed:', rollbackError.message);
      }
    }
    throw error;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function openAlexAbstract(inverted) {
  if (!inverted || typeof inverted !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const position of positions || []) words[position] = word;
  }
  return words.filter(Boolean).join(' ');
}

async function normalizeAuthorInput(name, institution) {
  const cleanName = String(name || '').trim();
  const cleanInstitution = String(institution || '').trim();
  if (!/[\u3400-\u9fff]/.test(`${cleanName} ${cleanInstitution}`)) {
    return { name: cleanName, institution: cleanInstitution, aliases: [cleanName] };
  }
  try {
    const response = await fetch(`${DSH_WEB_URL}/lit-model/author-normalize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({ name: cleanName, institution: cleanInstitution }),
    });
    const body = await response.json();
    if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
    return {
      name: String(body.name || cleanName),
      institution: String(body.institution || cleanInstitution),
      aliases: [body.name, ...(body.aliases || [])].filter(Boolean),
    };
  } catch (error) {
    return { name: cleanName, institution: cleanInstitution, aliases: [cleanName] };
  }
}

async function resolveInstitution(query) {
  const clean = String(query || '').trim();
  if (!clean) return [];
  const response = await fetch(
    `https://api.openalex.org/institutions?search=${encodeURIComponent(clean)}&per-page=5&select=id,display_name,ror,country_code,works_count`,
    { headers: { 'user-agent': 'dsh-litd/0.4 (local literature workspace)' }, signal: AbortSignal.timeout(20000) }
  );
  if (!response.ok) throw new Error(`OpenAlex institution HTTP ${response.status}`);
  const data = await response.json();
  return (data.results || []).map((item) => ({
    id: String(item.id || '').replace('https://openalex.org/', ''),
    name: item.display_name || '',
    ror: item.ror || '',
    country: item.country_code || '',
    works: item.works_count || 0,
  }));
}

async function findOpenAlexAuthors(name, institutionId, aliases) {
  const queries = [name];
  const candidates = new Map();
  for (const query of queries.slice(0, 3)) {
    const filter = institutionId
      ? `last_known_institutions.id:${institutionId},text.search:${query}`
      : `text.search:${query}`;
    const response = await fetch(
      `https://api.openalex.org/authors?filter=${encodeURIComponent(filter)}&per-page=10&select=id,display_name,orcid,works_count,cited_by_count,last_known_institutions,topics`,
      { headers: { 'user-agent': 'dsh-litd/0.4 (local literature workspace)' }, signal: AbortSignal.timeout(20000) }
    );
    if (!response.ok) throw new Error(`OpenAlex author HTTP ${response.status}`);
    const data = await response.json();
    for (const item of data.results || []) {
      const id = String(item.id || '').replace('https://openalex.org/', '');
      if (!id || candidates.has(id)) continue;
      const works = item.works_count || 0;
      if (works > 1000) continue;
      const topics = (item.topics || []).slice(0, 3).map((topic) => topic.display_name).filter(Boolean);
      candidates.set(id, {
        id,
        name: item.display_name || query,
        orcid: item.orcid || '',
        works: item.works_count || 0,
        cited: item.cited_by_count || 0,
        institutions: (item.last_known_institutions || []).map((inst) => inst.display_name).filter(Boolean),
        topics,
      });
    }
  }
  return [...candidates.values()].sort((a, b) => b.works - a.works).slice(0, 8);
}

async function openAlexAuthorWorks(authorId, fromYear) {
  const from = `${Math.max(1900, Number(fromYear) || new Date().getFullYear() - 6)}-01-01`;
  const response = await fetch(
    `https://api.openalex.org/works?filter=author.id:${encodeURIComponent(authorId)},from_publication_date:${from}&per-page=50&sort=publication_date:desc`,
    { headers: { 'user-agent': 'dsh-litd/0.4 (local literature workspace)' }, signal: AbortSignal.timeout(30000) }
  );
  if (!response.ok) throw new Error(`OpenAlex works HTTP ${response.status}`);
  const data = await response.json();
  return (data.results || []).map((item) => {
    const doi = String(item.doi || '').replace(/^https?:\/\/doi\.org\//i, '');
    const authors = (item.authorships || [])
      .map((authorship) => authorship.author?.display_name || '')
      .filter(Boolean)
      .join(', ');
    return {
      id: `openalex-author-${item.id || doi || item.title}`,
      source: 'OpenAlex',
      title: stripHtml(item.title || item.display_name || ''),
      abstract: stripHtml(openAlexAbstract(item.abstract_inverted_index)),
      authors,
      journal: item.primary_location?.source?.display_name || item.host_venue?.display_name || '',
      year: item.publication_year || null,
      doi,
      url: item.doi || item.primary_location?.landing_page_url || '',
      cited_by: item.cited_by_count || 0,
    };
  }).filter(
    (item) =>
      item.title &&
      !/^(table|supplementary|supporting|figure|source data|dataset)/i.test(item.title)
  );
}

async function authorDigest(authorName, works, onProgress) {
  const allWorks = (Array.isArray(works) ? works : []).slice(0, 25);
  if (allWorks.length === 0) return [];
  const cards = new Map();
  const batchSize = 5;
  for (let offset = 0; offset < allWorks.length; offset += batchSize) {
    const batch = allWorks.slice(offset, offset + batchSize);
    const items = batch.map((work) => ({
      id: work.id,
      title: work.title,
      abstract: work.abstract,
      journal: work.journal,
      year: work.year,
      source: work.source,
    }));
    const response = await fetch(`${DSH_WEB_URL}/lit-model/digest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(180000),
      body: JSON.stringify({ query: `作者 ${authorName || ''} 的论文`, items, mode: 'all', criteria: getAiCriteria() }),
    });
    const body = await response.json();
    if (!response.ok || body.ok !== true) throw new Error(body.error || `host HTTP ${response.status}`);
    for (const card of body.cards || []) {
      if (card?.id) cards.set(card.id, card);
    }
    onProgress?.(Math.min(offset + batch.length, allWorks.length), allWorks.length);
  }
  return allWorks.map((work) => {
    const card = cards.get(work.id);
    if (!card) return work;
    return {
      ...work,
      summary: card.summary || work.summary,
      why_relevant: card.why_relevant || '',
      tags: card.tags || [],
      stars: card.stars || 0,
    };
  });
}

function libraryKeys() {
  const rows = db.prepare('SELECT doi, title FROM papers').all();
  const dois = new Set();
  const titles = new Set();
  for (const row of rows) {
    const doi = String(row.doi || '').trim().toLowerCase().replace(/^https?:\/\/doi\.org\//, '');
    if (doi) dois.add(doi);
    const title = String(row.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (title) titles.add(title);
  }
  return { dois, titles };
}

function alreadyInLibrary(item, keys) {
  const doi = String(item.doi || '').trim().toLowerCase().replace(/^https?:\/\/doi\.org\//, '');
  if (doi && keys.dois.has(doi)) return true;
  const title = String(item.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return Boolean(title && keys.titles.has(title));
}

async function aiSearch(query, requestedSources, page = 1, excludeExisting = false) {
  const clean = String(query || '').trim();
  if (!clean) throw new Error('query required');
  const allowedSources = ['europepmc', 'biorxiv', 'arxiv', 'openalex', 'crossref', 'semanticscholar'];
  const enabledSources = new Set(
    Array.isArray(requestedSources) && requestedSources.length
      ? requestedSources.filter((source) => allowedSources.includes(source))
      : allowedSources
  );
  let queries = [clean];
  let planKeywords = [];
  try {
    const planResponse = await fetch(`${DSH_WEB_URL}/lit-model/search-plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ query: clean }),
    });
    const plan = await planResponse.json();
    if (planResponse.ok && plan.ok === true && Array.isArray(plan.queries) && plan.queries.length) {
      queries = plan.queries.slice(0, 3);
      planKeywords = (Array.isArray(plan.keywords) ? plan.keywords : []).slice(0, 5);
    }
  } catch (error) {
    // Search planning is best-effort; the original query is still usable.
  }
  const keywordWords = [...new Set(
    planKeywords
      .flatMap((keyword) => String(keyword).split(/\s+/))
      .map((word) => word.replace(/[^\p{L}\p{N}-]/gu, ''))
      .filter((word) => word.length >= 3)
  )].slice(0, 4);
  const epmcQuery = keywordWords.length
    ? keywordWords.map((word) => `TITLE_ABS:"${word}"`).join(' AND ')
    : clean;
  const pageNumber = Math.max(1, Number(page) || 1);
  const sourceLimit = Math.min(25, 4 * pageNumber);
  const searchJobs = [];
  if (enabledSources.has('europepmc')) {
    searchJobs.push({
      source: 'europepmc',
      promise: searchEuropePmc(epmcQuery, Math.min(25, 8 * pageNumber), 'all', '*', {}),
    });
  }
  for (const query of queries.slice(0, 2)) {
    if (enabledSources.has('biorxiv')) {
      searchJobs.push({
        source: 'biorxiv',
        promise: searchEuropePmc(query, sourceLimit, 'biorxiv', '*', {}),
      });
    }
    if (enabledSources.has('arxiv')) searchJobs.push({ source: 'arxiv', promise: searchArxiv(query, sourceLimit, 0, {}) });
    if (enabledSources.has('openalex')) searchJobs.push({ source: 'openalex', promise: searchOpenAlex(query, sourceLimit) });
    if (enabledSources.has('crossref')) searchJobs.push({ source: 'crossref', promise: searchCrossref(query, sourceLimit) });
    if (enabledSources.has('semanticscholar')) {
      searchJobs.push({ source: 'semanticscholar', promise: searchSemanticScholar(query, sourceLimit) });
    }
  }
  if (searchJobs.length === 0) throw new Error('至少选择一个检索来源');
  const searches = await Promise.allSettled(searchJobs.map((job) => job.promise));
  const candidates = [];
  const buckets = new Map();
  const seen = new Set();
  const add = (item, source) => {
    const title = String(item.title || '').replace(/\s+/g, ' ').trim();
    if (!title) return;
    const key = title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const isArxiv = source === 'arxiv';
    const arxivId = isArxiv ? String(item.arxiv_id || '') : '';
    const labels = {
      europepmc: 'Europe PMC',
      biorxiv: 'bioRxiv',
      arxiv: 'arXiv',
      openalex: 'OpenAlex',
      crossref: 'Crossref',
      semanticscholar: 'Semantic Scholar',
    };
    const url = isArxiv
      ? `https://arxiv.org/abs/${arxivId}`
      : String(item.url || (item.doi ? `https://doi.org/${item.doi}` : ''));
    const candidate = {
      id: `${source}-${item.doi || arxivId || seen.size}`,
      title,
      authors: String(item.authors || ''),
      journal: String(item.journal || item.source_label || (isArxiv ? 'arXiv' : '')),
      year: item.year || (item.published ? Number(String(item.published).slice(0, 4)) || null : null),
      abstract: String(item.abstract || ''),
      doi: String(item.doi || ''),
      url,
      source: labels[source] || source,
    };
    if (!buckets.has(source)) buckets.set(source, []);
    buckets.get(source).push(candidate);
  };
  searches.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    const source = searchJobs[index].source;
    const list = Array.isArray(result.value) ? result.value : result.value?.results || [];
    for (const item of list) add(item, source);
  });
  const sourceOrder = ['europepmc', 'biorxiv', 'openalex', 'crossref', 'semanticscholar', 'arxiv'];
  for (let row = 0; row < 6; row += 1) {
    for (const source of sourceOrder) {
      const item = buckets.get(source)?.[row];
      if (item) candidates.push(item);
    }
  }
  const keys = excludeExisting ? libraryKeys() : null;
  const filteredOut = keys ? candidates.filter((item) => alreadyInLibrary(item, keys)) : [];
  const pool = keys ? candidates.filter((item) => !alreadyInLibrary(item, keys)) : candidates;
  const selected = pool.slice(0, Math.min(30, 12 * pageNumber));
  if (selected.length === 0) {
    return {
      cards: [],
      candidates: [],
      usage: null,
      page: pageNumber,
      hasMore: false,
      filteredOut: filteredOut.length,
    };
  }
  const response = await fetch(`${DSH_WEB_URL}/lit-model/digest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      query: clean,
      items: selected,
      ...(pageNumber > 1 ? { mode: 'all' } : {}),
      criteria: getAiCriteria(),
    }),
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) throw new Error(body.error || `host HTTP ${response.status}`);
  const byId = new Map(selected.map((item) => [item.id, item]));
  const cards = (body.cards || [])
    .map((card) => {
      const item = byId.get(card.id);
      if (!item) return null;
      return { ...item, ...card };
    })
    .filter(Boolean);
  return {
    cards,
    candidates: selected,
    usage: body.usage || null,
    page: pageNumber,
    hasMore: pool.length >= 12 * pageNumber,
    filteredOut: filteredOut.length,
  };
}

function readBody(req, maxBytes = 2_000_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        req.destroy();
        reject(new Error('body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function readBinary(req, limit = 100 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('PDF too large (limit 100 MB)'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
  });
  res.end(body);
}


removeLegacyRealGroup();
try {
  seedJcrFromFile();
} catch (error) {
  console.error('[litd] JCR import failed:', error.message);
}

try {
  syncTagLibrary();
} catch (error) {
  console.error('[litd] tag library sync failed:', error.message);
}

// Migrate older rows that still point at the original download location:
// keep a library-owned copy under data/pdfs and update the row.
try {
  const rows = db.prepare('SELECT id, pdf_path FROM papers').all();
  for (const row of rows) {
    if (!row.pdf_path || !fs.existsSync(row.pdf_path)) {
      const fallback = path.join(pdfDir, `${row.id}.pdf`);
      if (fs.existsSync(fallback)) {
        db.prepare('UPDATE papers SET pdf_path = ? WHERE id = ?').run(fallback, row.id);
        console.log(`[litd] relinked PDF for moved library: ${row.id}`);
      }
      continue;
    }
    const relative = path.relative(pdfDir, row.pdf_path);
    const alreadyStored = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
    if (alreadyStored) continue;
    const target = path.join(pdfDir, `${row.id}.pdf`);
    fs.copyFileSync(row.pdf_path, target);
    db.prepare('UPDATE papers SET pdf_path = ? WHERE id = ?').run(target, row.id);
    console.log(`[litd] copied PDF into library storage: ${row.id}`);
  }
} catch (error) {
  console.error('[litd] PDF migration failed:', error.message);
}

try {
  const indexed = rebuildSearchIndex();
  console.log(`[litd] search index rebuilt: ${indexed} papers`);
} catch (error) {
  console.error('[litd] search index rebuild failed:', error.message);
}

try {
  const rows = db.prepare('SELECT id, doi, venue FROM papers').all();
  const updateVenue = db.prepare('UPDATE papers SET venue = ? WHERE id = ?');
  for (const row of rows) {
    if (row.venue && row.venue !== 'Imported PDF') continue;
    const inferred = venueFromDoi(row.doi);
    if (inferred) updateVenue.run(inferred, row.id);
  }
} catch (error) {
  console.error('[litd] venue migration failed:', error.message);
}

try {
  const count = db.prepare('SELECT COUNT(*) AS n FROM impact_factors').get().n;
  if (count === 0) {
    const year = new Date().getFullYear() - 1;
    const rows = db
      .prepare(
        `SELECT DISTINCT venue FROM papers
         WHERE venue IS NOT NULL AND venue != '' AND lower(venue) NOT LIKE '%preprint%' AND lower(venue) != 'unknown'`
      )
      .all();
    const insert = db.prepare('INSERT OR IGNORE INTO impact_factors (journal, year, value, updated_at) VALUES (?, ?, NULL, ?)');
    for (const row of rows) insert.run(row.venue, year, new Date().toISOString());
    if (rows.length > 0) console.log(`[litd] seeded ${rows.length} empty IF rows for ${year}`);
  }
} catch (error) {
  console.error('[litd] IF table seed failed:', error.message);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, {});
    return;
  }
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (req.method === 'POST' && url.pathname === '/api/client-error') {
      const body = await readBody(req);
      const line = JSON.stringify({ at: new Date().toISOString(), ...body }) + '\n';
      fs.appendFileSync(path.join(dataDir, 'client-error.log'), line, 'utf8');
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/tags/refresh') {
      return send(res, 200, { ok: true, ...(await refreshPaperTags()) });
    }
    if (req.method === 'GET' && url.pathname === '/api/graph') {
      const requestedMode = url.searchParams.get('mode');
      if (requestedMode === 'groups') return send(res, 200, { ok: true, ...buildGroupGraph() });
      const mode = requestedMode === 'tags' ? 'tags' : 'semantic';
      if (mode === 'tags') return send(res, 200, { ok: true, ...buildTagGraph() });
      const threshold = Math.max(0.05, Math.min(0.5, Number(url.searchParams.get('threshold')) || 0.14));
      return send(res, 200, { ok: true, ...buildSemanticGraph(threshold) });
    }
    if (req.method === 'POST' && url.pathname === '/api/restore') {
      try {
        const buffer = await readBinary(req, 500 * 1024 * 1024);
        const result = await restoreFromArchive(buffer);
        return send(res, 200, { ok: true, ...result });
      } catch (error) {
        return send(res, 400, { ok: false, error: error.message });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/backups') {
      return send(res, 200, { ok: true, backups: listBackups() });
    }
    if (req.method === 'POST' && url.pathname === '/api/backups') {
      const { archive } = await createBackupArchive();
      pruneBackups();
      const stat = fs.statSync(archive);
      return send(res, 200, {
        ok: true,
        backup: { name: path.basename(archive), bytes: stat.size, created_at: stat.mtime.toISOString() },
      });
    }
    if (req.method === 'GET' && /^\/api\/backups\/[^/]+$/.test(url.pathname)) {
      const name = decodeURIComponent(url.pathname.split('/')[3]);
      if (!/^lit-backup-.*\.zip$/.test(name)) return send(res, 400, { ok: false, error: 'invalid backup name' });
      const file = path.join(backupDir, name);
      if (!fs.existsSync(file)) return send(res, 404, { ok: false, error: 'backup not found' });
      const stat = fs.statSync(file);
      res.writeHead(200, {
        'content-type': 'application/zip',
        'content-length': stat.size,
        'content-disposition': `attachment; filename="${name}"`,
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      });
      fs.createReadStream(file).pipe(res);
      return;
    }
    if (req.method === 'DELETE' && /^\/api\/backups\/[^/]+$/.test(url.pathname)) {
      const name = decodeURIComponent(url.pathname.split('/')[3]);
      if (!/^lit-backup-.*\.zip$/.test(name)) return send(res, 400, { ok: false, error: 'invalid backup name' });
      fs.rmSync(path.join(backupDir, name), { force: true });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/backup') {
      const { archive } = await createBackupArchive();
      const stat = fs.statSync(archive);
      res.writeHead(200, {
        'content-type': 'application/zip',
        'content-length': stat.size,
        'content-disposition': `attachment; filename="lit-backup-${Date.now()}.zip"`,
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      });
      const stream = fs.createReadStream(archive);
      stream.pipe(res);
      stream.on('close', () => {
        try {
          fs.rmSync(archive, { force: true });
        } catch (error) {
          // Best-effort cleanup.
        }
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      const count = db.prepare('SELECT COUNT(*) AS n FROM papers').get().n;
      send(res, 200, { ok: true, papers: count, service: 'litd', version: '0.1.0' });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/ui-state') {
      const key = String(url.searchParams.get('key') || '').trim();
      if (!key) return send(res, 400, { ok: false, error: 'key required' });
      const row = db.prepare('SELECT value, updated_at FROM ui_state WHERE key = ?').get(key);
      return send(res, 200, {
        ok: true,
        key,
        value: row ? JSON.parse(row.value) : null,
        updated_at: row?.updated_at || null,
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/ui-state') {
      const body = await readBody(req);
      const key = String(body.key || '').trim();
      if (!key || !body.value || typeof body.value !== 'object') {
        return send(res, 400, { ok: false, error: 'key and object value required' });
      }
      db.prepare(
        `INSERT INTO ui_state (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).run(key, JSON.stringify(body.value), new Date().toISOString());
      if (key === AI_SETTINGS_KEY) invalidateAiCriteriaCache();
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && /^\/api\/papers\/[^/]+\/enrich-metadata$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(id);
      if (!row) return send(res, 404, { ok: false, error: 'paper not found' });
      try {
        const result = await enrichPaperBibliographic(row);
        return send(res, 200, { ok: true, ...result });
      } catch (error) {
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/metadata/enrich') {
      const body = await readBody(req);
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      const rows = ids.length
        ? db.prepare(`SELECT * FROM papers WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
        : db.prepare('SELECT * FROM papers ORDER BY created_at ASC').all();
      let updated = 0;
      const errors = [];
      for (const row of rows) {
        try {
          await enrichPaperBibliographic(row);
          updated += 1;
        } catch (error) {
          errors.push({ id: row.id, title: row.title, error: error.message });
        }
      }
      return send(res, 200, { ok: true, updated, errors, papers: listLibrary().papers });
    }
    if (req.method === 'POST' && url.pathname === '/api/papers/lookup-doi') {
      const body = await readBody(req);
      const doi = normalizeDoiValue(body.doi);
      if (!doi || !/^10\.\d{4,9}\/\S+$/.test(doi)) {
        return send(res, 400, { ok: false, error: 'invalid doi' });
      }
      try {
        const metadata = await crossrefMetadata(doi);
        if (!metadata?.title && !metadata?.venue) {
          return send(res, 404, { ok: false, error: 'doi not found' });
        }
        return send(res, 200, {
          ok: true,
          metadata: {
            title: String(metadata.title || '').trim(),
            authors: String(metadata.authors || '').trim(),
            year: metadata.year || null,
            venue: String(metadata.venue || '').trim(),
            doi: normalizeDoiValue(metadata.doi) || doi,
            abstract: String(metadata.abstract || '').trim(),
          },
        });
      } catch (error) {
        if (/HTTP 404/.test(error.message)) return send(res, 404, { ok: false, error: 'doi not found' });
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/tags') {
      return send(res, 200, { ok: true, tags: getTagLibrary() });
    }
    if (req.method === 'POST' && /^\/api\/papers\/[^/]+\/tags$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      try {
        const paper = setPaperTag(id, body.tag);
        return send(res, 200, { ok: true, paper, tags: getTagLibrary() });
      } catch (error) {
        return send(res, 400, { ok: false, error: error.message });
      }
    }
    if (req.method === 'DELETE' && /^\/api\/papers\/[^/]+\/tags\/[^/]+$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const tag = decodeURIComponent(url.pathname.split('/')[5]);
      try {
        const paper = removePaperTag(id, tag);
        return send(res, 200, { ok: true, paper, tags: getTagLibrary() });
      } catch (error) {
        return send(res, 400, { ok: false, error: error.message });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/library') {
      send(res, 200, listLibrary());
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/search') {
      const query = String(url.searchParams.get('q') || '').trim();
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
      if (!query) return send(res, 200, { ok: true, query: '', count: 0, papers: [] });
      let rows = [];
      try {
        const terms = query
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 8)
          .map((term) => `"${term.replace(/"/g, '""')}"`)
          .join(' ');
        rows = db
          .prepare(
            `SELECT id, snippet(papers_fts, -1, '<mark>', '</mark>', '…', 24) AS snippet,
                    bm25(papers_fts) AS rank
             FROM papers_fts
             WHERE papers_fts MATCH ?
             ORDER BY rank
             LIMIT ?`
          )
          .all(terms, limit);
      } catch (error) {
        rows = [];
      }
      if (rows.length === 0) {
        const like = `%${query.replace(/[%_]/g, '\\$&')}%`;
        rows = db
          .prepare(
            `SELECT id, '' AS snippet, 0 AS rank FROM papers
             WHERE title LIKE ? ESCAPE '\\' OR authors LIKE ? ESCAPE '\\'
                OR abstract LIKE ? ESCAPE '\\' OR pages_json LIKE ? ESCAPE '\\'
             ORDER BY created_at DESC LIMIT ?`
          )
          .all(like, like, like, like, limit);
      }
      const papers = rows
        .map((row) => {
          const paper = db.prepare('SELECT * FROM papers WHERE id = ?').get(row.id);
          return paper ? { ...serializePaper(paper), snippet: row.snippet || '' } : null;
        })
        .filter(Boolean);
      return send(res, 200, { ok: true, query, count: papers.length, papers });
    }
    if (req.method === 'POST' && url.pathname === '/api/ai-search/start') {
      const body = await readBody(req);
      const id = randomUUID();
      const task = {
        id,
        status: 'running',
        startedAt: Date.now(),
        page: Number(body.page) || 1,
        cards: null,
        candidates: [],
        hasMore: false,
        error: null,
      };
      aiSearchTasks.set(id, task);
      aiSearch(body.query, body.sources, body.page, Boolean(body.excludeExisting))
        .then((result) => {
          if (task.status === 'cancelled') return;
          task.status = 'done';
          task.cards = result.cards || [];
          task.candidates = result.candidates || [];
          task.hasMore = Boolean(result.hasMore);
          task.finishedAt = Date.now();
        })
        .catch((error) => {
          if (task.status === 'cancelled') return;
          task.status = 'failed';
          task.error = error.message;
          task.finishedAt = Date.now();
        });
      return send(res, 200, { ok: true, id });
    }
    if (req.method === 'GET' && url.pathname === '/api/ai-search/status') {
      const id = String(url.searchParams.get('id') || '').trim();
      const task = aiSearchTasks.get(id);
      if (!task) return send(res, 404, { ok: false, error: 'task not found' });
      if (task.status === 'running' && Date.now() - task.startedAt > 600000) {
        task.status = 'failed';
        task.error = 'timeout';
      }
      return send(res, 200, {
        ok: true,
        id,
        status: task.status,
        elapsed: Math.floor((Date.now() - task.startedAt) / 1000),
        cards: task.status === 'done' ? task.cards : null,
        candidates: task.status === 'done' ? task.candidates : [],
        hasMore: task.hasMore,
        error: task.error,
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/ai-search/cancel') {
      const body = await readBody(req);
      const task = aiSearchTasks.get(String(body.id || ''));
      if (task) {
        task.status = 'cancelled';
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { ok: false, error: 'task not found' });
    }
    if (req.method === 'POST' && url.pathname === '/api/ai-search') {
      const body = await readBody(req);
      const startedAt = Date.now();
      console.log(`[litd] ai-search start: ${String(body.query || '').slice(0, 120)}`);
      try {
        const result = await aiSearch(body.query, body.sources, body.page, Boolean(body.excludeExisting));
        console.log(`[litd] ai-search done: ${Date.now() - startedAt}ms, ${result.cards.length} cards`);
        return send(res, 200, { ok: true, ...result });
      } catch (error) {
        console.log(`[litd] ai-search failed: ${Date.now() - startedAt}ms, ${error.message}`);
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/author-search') {
      const body = await readBody(req);
      try {
        const normalized = await normalizeAuthorInput(body.name, body.institution);
        const institutions = normalized.institution ? await resolveInstitution(normalized.institution) : [];
        const institution = institutions[0] || null;
        const authors = await findOpenAlexAuthors(normalized.name, institution?.id || '', normalized.aliases);
        return send(res, 200, { ok: true, normalized, institution, institutions, authors });
      } catch (error) {
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/author-works') {
      const body = await readBody(req);
      try {
        if (!body.authorId) throw new Error('authorId required');
        const allWorks = await openAlexAuthorWorks(body.authorId, body.fromYear);
        const keys = body.excludeExisting ? libraryKeys() : null;
        const works = keys ? allWorks.filter((item) => !alreadyInLibrary(item, keys)) : allWorks;
        return send(res, 200, {
          ok: true,
          works,
          filteredOut: keys ? allWorks.length - works.length : 0,
        });
      } catch (error) {
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/author-digest') {
      const body = await readBody(req);
      try {
        const works = await authorDigest(body.authorName, body.works);
        return send(res, 200, { ok: true, works });
      } catch (error) {
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/author-digest/start') {
      const body = await readBody(req);
      try {
        const works = Array.isArray(body.works) ? body.works : [];
        if (!works.length) throw new Error('works required');
        const id = randomUUID();
        const task = {
          id,
          status: 'running',
          startedAt: Date.now(),
          total: Math.min(works.length, 25),
          done: 0,
          works: null,
          error: null,
        };
        authorDigestTasks.set(id, task);
        authorDigest(body.authorName, works, (done, total) => {
          task.done = done;
          task.total = total;
        })
          .then((result) => {
            task.status = 'done';
            task.works = result;
            task.finishedAt = Date.now();
          })
          .catch((error) => {
            task.status = 'failed';
            task.error = error.message;
            task.finishedAt = Date.now();
          });
        return send(res, 200, { ok: true, id, total: works.length });
      } catch (error) {
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/author-digest/status') {
      const id = String(url.searchParams.get('id') || '').trim();
      const task = authorDigestTasks.get(id);
      if (!task) return send(res, 404, { ok: false, error: 'task not found' });
      if (task.status === 'running' && Date.now() - task.startedAt > 3600000) {
        task.status = 'failed';
        task.error = 'timeout';
      }
      return send(res, 200, {
        ok: true,
        id,
        status: task.status,
        done: task.done || 0,
        total: task.total,
        elapsed: Math.floor((Date.now() - task.startedAt) / 1000),
        works: task.status === 'done' ? task.works : null,
        error: task.error,
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/discover/arxiv') {
      const query = String(url.searchParams.get('q') || '').trim();
      if (!query) return send(res, 400, { ok: false, error: 'q required' });
      try {
        const page = await searchArxiv(
          query,
          url.searchParams.get('limit'),
          url.searchParams.get('start') || 0,
          {
            from: url.searchParams.get('from') || '',
            to: url.searchParams.get('to') || '',
            journal: url.searchParams.get('journal') || '',
            min_if: url.searchParams.get('min_if') || '',
            if_year: url.searchParams.get('if_year') || '',
            jcr_quartile: url.searchParams.get('jcr_quartile') || '',
            jcr_year: url.searchParams.get('jcr_year') || '2026',
          }
        );
        return send(res, 200, { ok: true, query, ...page });
      } catch (error) {
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/discover/europepmc') {
      const query = String(url.searchParams.get('q') || '').trim();
      if (!query) return send(res, 400, { ok: false, error: 'q required' });
      try {
        const page = await searchEuropePmc(
          query,
          url.searchParams.get('limit'),
          url.searchParams.get('scope') || 'all',
          url.searchParams.get('cursor') || '*',
          {
            from: url.searchParams.get('from') || '',
            to: url.searchParams.get('to') || '',
            journal: url.searchParams.get('journal') || '',
            min_if: url.searchParams.get('min_if') || '',
            if_year: url.searchParams.get('if_year') || '',
            jcr_quartile: url.searchParams.get('jcr_quartile') || '',
            jcr_year: url.searchParams.get('jcr_year') || '2026',
          }
        );
        return send(res, 200, { ok: true, query, source: 'europepmc', ...page });
      } catch (error) {
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/discover/import-metadata') {
      const body = await readBody(req);
      try {
        const paper = importPaperMetadata({
          title: body.title,
          authors: body.authors,
          abstract: body.abstract,
          doi: body.doi,
          venue: body.journal || body.venue,
          year: body.year || (body.published ? String(body.published).slice(0, 4) : null),
          source_url: body.source_url,
        });
        return send(res, 200, { ok: true, paper });
      } catch (error) {
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/discover/import') {
      const body = await readBody(req);
      try {
        const paper = await importExternalPaper(body.pdf_url, body.title, body.venue);
        return send(res, 200, { ok: true, paper });
      } catch (error) {
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/feeds/ai-score') {
      const body = await readBody(req);
      const limit = Math.max(1, Math.min(30, Number(body.limit) || 20));
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      const rows = ids.length
        ? db.prepare(`SELECT i.*, f.title AS feed_title FROM feed_items i JOIN feeds f ON f.id = i.feed_id WHERE i.id IN (${ids.map(() => '?').join(',')}) LIMIT ?`).all(...ids, limit)
        : db
            .prepare(
              `SELECT i.*, f.title AS feed_title FROM feed_items i JOIN feeds f ON f.id = i.feed_id
               WHERE i.ai_scanned_at IS NULL ORDER BY COALESCE(i.published_at, i.created_at) DESC LIMIT ?`
            )
            .all(limit);
      if (rows.length === 0) return send(res, 200, { ok: true, updated: 0, rows: [], message: '没有需要评分的新条目' });
      try {
        const response = await fetch(`${DSH_WEB_URL}/lit-model/screen`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: AbortSignal.timeout(180000),
          body: JSON.stringify({
            items: rows.map((row) => ({
              id: row.id,
              title: row.title,
              abstract: row.summary || '',
              source: row.feed_title || '',
              kind: row.kind || '',
            })),
            criteria: getAiCriteria(),
          }),
        });
        const bodyJson = await response.json();
        if (!response.ok || bodyJson.ok !== true) throw new Error(bodyJson.error || `host HTTP ${response.status}`);
        const update = db.prepare(
          `UPDATE feed_items SET ai_stars = ?, ai_type = ?, ai_reason = ?, ai_why_not_higher = ?,
             ai_confidence = ?, ai_model = ?, ai_scanned_at = ? WHERE id = ?`
        );
        const scored = Array.isArray(bodyJson.items) ? bodyJson.items : [];
        for (const item of scored) {
          if (!rows.some((row) => row.id === item.id)) continue;
          update.run(
            item.stars,
            item.type,
            item.reason,
            item.why_not_higher,
            item.confidence,
            `${bodyJson.provider || ''}/${bodyJson.model || ''}`,
            new Date().toISOString(),
            item.id
          );
        }
        return send(res, 200, {
          ok: true,
          updated: scored.length,
          usage: bodyJson.usage,
          items: listFeeds().items,
        });
      } catch (error) {
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/feeds') {
      return send(res, 200, { ok: true, ...listFeeds() });
    }
    if (req.method === 'POST' && url.pathname === '/api/feeds') {
      const body = await readBody(req);
      try {
        const feed = await addFeed(String(body.url || ''), String(body.title || ''));
        return send(res, 200, { ok: true, feed });
      } catch (error) {
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'PATCH' && /^\/api\/feeds\/[^/]+$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      const row = db.prepare('SELECT * FROM feeds WHERE id = ?').get(id);
      if (!row) return send(res, 404, { ok: false, error: 'feed not found' });
      const title = body.title !== undefined ? String(body.title || '').trim() : row.title;
      const feedUrl = body.url !== undefined ? String(body.url || '').trim() : row.url;
      try {
        new URL(feedUrl);
      } catch (error) {
        return send(res, 400, { ok: false, error: 'invalid feed URL' });
      }
      const duplicate = db.prepare('SELECT id FROM feeds WHERE url = ? AND id != ?').get(feedUrl, id);
      if (duplicate) return send(res, 409, { ok: false, error: 'feed URL already subscribed' });
      db.prepare('UPDATE feeds SET title = ?, url = ? WHERE id = ?').run(title || feedUrl, feedUrl, id);
      if (feedUrl !== row.url) {
        try {
          await refreshFeedRow({ ...row, title: title || feedUrl, url: feedUrl });
        } catch (error) {
          db.prepare('UPDATE feeds SET last_error = ? WHERE id = ?').run(error.message, id);
        }
      }
      return send(res, 200, { ok: true, feed: db.prepare('SELECT * FROM feeds WHERE id = ?').get(id) });
    }
    if (req.method === 'DELETE' && /^\/api\/feeds\/[^/]+$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const feed = db.prepare('SELECT * FROM feeds WHERE id = ?').get(id);
      if (!feed) return send(res, 404, { ok: false, error: 'feed not found' });
      const count = db.prepare('SELECT COUNT(*) AS n FROM feed_items WHERE feed_id = ?').get(id).n;
      db.prepare('DELETE FROM feed_items WHERE feed_id = ?').run(id);
      db.prepare('DELETE FROM feeds WHERE id = ?').run(id);
      return send(res, 200, { ok: true, removed: count });
    }
    if (req.method === 'POST' && url.pathname === '/api/feeds/refresh') {
      return send(res, 200, { ok: true, ...(await refreshAllFeeds(false)) });
    }
    if (req.method === 'POST' && /^\/api\/feeds\/[^/]+\/refresh$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const feed = db.prepare('SELECT * FROM feeds WHERE id = ?').get(id);
      if (!feed) return send(res, 404, { ok: false, error: 'feed not found' });
      try {
        const result = await refreshFeedRow(feed);
        return send(res, 200, { ok: true, ...result });
      } catch (error) {
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'POST' && /^\/api\/feed-items\/[^/]+\/kind$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      const kind = String(body.kind || '');
      if (!['paper', 'news', 'comment', 'unknown'].includes(kind)) {
        return send(res, 400, { ok: false, error: 'invalid kind' });
      }
      const result = db
        .prepare('UPDATE feed_items SET kind = ?, kind_locked = 1 WHERE id = ?')
        .run(kind, id);
      if (!result.changes) return send(res, 404, { ok: false, error: 'feed item not found' });
      return send(res, 200, { ok: true, kind });
    }
    if (req.method === 'POST' && url.pathname === '/api/feed-items/read-all') {
      const body = await readBody(req);
      const read = body.read === false ? 0 : 1;
      const result = db.prepare('UPDATE feed_items SET read = ?').run(read);
      return send(res, 200, { ok: true, read: read === 1, changed: Number(result.changes) || 0 });
    }
    if (req.method === 'POST' && /^\/api\/feed-items\/[^/]+\/read$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      db.prepare('UPDATE feed_items SET read = ? WHERE id = ?').run(body.read === false ? 0 : 1, id);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && /^\/api\/feed-items\/[^/]+\/save$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const item = db
        .prepare('SELECT i.*, f.title AS feed_title FROM feed_items i JOIN feeds f ON f.id = i.feed_id WHERE i.id = ?')
        .get(id);
      if (!item) return send(res, 404, { ok: false, error: 'feed item not found' });
      if (item.kind === 'news' || item.kind === 'comment') {
        return send(res, 409, { ok: false, error: '订阅条目不是论文，未保存到文献库' });
      }
      try {
        const metadata = await enrichFeedItemMetadata(item);
        const imported = item.pdf_url
          ? await importExternalPaper(item.pdf_url, metadata.title, metadata.venue)
          : importPaperMetadata({
              title: metadata.title,
              authors: metadata.authors,
              abstract: metadata.abstract,
              venue: metadata.venue,
              doi: metadata.doi,
              source_url: item.link,
              published: item.published_at,
            });
        const paper = item.pdf_url ? updatePaperMetadataFields(imported, metadata) : imported;
        db.prepare('UPDATE feed_items SET saved = 1 WHERE id = ?').run(id);
        return send(res, 200, { ok: true, paper });
      } catch (error) {
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/jcr/summary') {
      const year = Number(url.searchParams.get('year') || 2026);
      const rows = db.prepare('SELECT quartile, COUNT(*) AS n FROM jcr_best WHERE year = ? GROUP BY quartile').all(year);
      const total = rows.reduce((sum, row) => sum + row.n, 0);
      return send(res, 200, { ok: true, year, total, quartiles: rows });
    }
    if (req.method === 'GET' && url.pathname === '/api/impact-factors') {
      const year = url.searchParams.get('year');
      const rows = year
        ? db.prepare('SELECT journal, year, value, updated_at FROM impact_factors WHERE year = ? ORDER BY journal').all(Number(year))
        : db.prepare('SELECT journal, year, value, updated_at FROM impact_factors ORDER BY year DESC, journal').all();
      return send(res, 200, { ok: true, rows });
    }
    if (req.method === 'POST' && url.pathname === '/api/impact-factors') {
      const body = await readBody(req);
      const journal = String(body.journal || '').trim();
      const year = Number(body.year);
      const value = Number(body.value);
      if (!journal || !Number.isInteger(year) || !Number.isFinite(value)) {
        return send(res, 400, { ok: false, error: 'journal, year, value required' });
      }
      db.prepare(`
        INSERT INTO impact_factors (journal, year, value, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(journal, year) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(journal, year, value, new Date().toISOString());
      return send(res, 200, { ok: true, row: { journal, year, value } });
    }
    if (req.method === 'POST' && url.pathname === '/api/impact-factors/delete') {
      const body = await readBody(req);
      const journal = String(body.journal || '').trim();
      const year = Number(body.year);
      if (!journal || !Number.isInteger(year)) return send(res, 400, { ok: false, error: 'journal and year required' });
      db.prepare('DELETE FROM impact_factors WHERE journal = ? AND year = ?').run(journal, year);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/groups') {
      const groups = db.prepare('SELECT * FROM groups ORDER BY sort_order, name').all();
      return send(res, 200, { ok: true, groups });
    }
    if (req.method === 'POST' && url.pathname === '/api/groups/reorder') {
      const body = await readBody(req);
      const requested = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
      if (!requested.length) return send(res, 400, { ok: false, error: 'ids required' });
      const requestedIds = [...new Set(requested)];
      const currentIds = db
        .prepare('SELECT id FROM groups ORDER BY sort_order, name')
        .all()
        .map((row) => row.id);
      const known = new Set(currentIds);
      const order = requestedIds.filter((id) => known.has(id));
      const missing = requestedIds.filter((id) => !known.has(id));
      const placed = new Set(order);
      for (const id of currentIds) if (!placed.has(id)) order.push(id);
      const update = db.prepare('UPDATE groups SET sort_order = ? WHERE id = ?');
      db.exec('BEGIN');
      try {
        order.forEach((id, index) => update.run(index, id));
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      const groups = db.prepare('SELECT * FROM groups ORDER BY sort_order, name').all();
      return send(res, 200, { ok: true, updated: order.length, missing, groups });
    }
    if (req.method === 'POST' && url.pathname === '/api/groups') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      if (!name) return send(res, 400, { ok: false, error: 'group name required' });
      const id = `group-${Date.now()}`;
      const color = String(body.color || '#72b7ff');
      const sortOrder = Number(body.sort_order) || 100;
      db.prepare('INSERT INTO groups (id, name, color, sort_order) VALUES (?, ?, ?, ?)').run(id, name, color, sortOrder);
      return send(res, 200, { ok: true, group: { id, name, color, sort_order: sortOrder } });
    }
    if (req.method === 'PATCH' && /^\/api\/groups\/[^/]+$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      const current = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
      if (!current) return send(res, 404, { ok: false, error: 'group not found' });
      const name = body.name !== undefined ? String(body.name).trim() : current.name;
      const color = body.color !== undefined ? String(body.color) : current.color;
      if (!name) return send(res, 400, { ok: false, error: 'group name required' });
      db.prepare('UPDATE groups SET name = ?, color = ? WHERE id = ?').run(name, color, id);
      return send(res, 200, { ok: true, group: { ...current, name, color } });
    }
    if (req.method === 'DELETE' && /^\/api\/groups\/[^/]+$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
      if (!group) return send(res, 404, { ok: false, error: 'group not found' });
      let affected = 0;
      const papers = db.prepare('SELECT id, groups_json FROM papers').all();
      const update = db.prepare('UPDATE papers SET groups_json = ? WHERE id = ?');
      for (const paper of papers) {
        const groups = JSON.parse(paper.groups_json || '[]');
        if (!groups.includes(id)) continue;
        update.run(JSON.stringify(groups.filter((g) => g !== id)), paper.id);
        affected += 1;
      }
      db.prepare('DELETE FROM groups WHERE id = ?').run(id);
      return send(res, 200, { ok: true, deleted: id, affected_papers: affected });
    }
    if (req.method === 'POST' && url.pathname === '/api/papers/reorder') {
      const body = await readBody(req);
      const requested = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
      if (!requested.length) return send(res, 400, { ok: false, error: 'ids required' });
      const requestedIds = [...new Set(requested)];
      const currentIds = db
        .prepare(
          'SELECT id FROM papers ORDER BY CASE WHEN sort_order IS NULL THEN 0 ELSE 1 END, sort_order ASC, created_at DESC'
        )
        .all()
        .map((row) => row.id);
      const known = new Set(currentIds);
      const order = requestedIds.filter((id) => known.has(id));
      const missing = requestedIds.filter((id) => !known.has(id));
      const placed = new Set(order);
      for (const id of currentIds) if (!placed.has(id)) order.push(id);
      const update = db.prepare('UPDATE papers SET sort_order = ? WHERE id = ?');
      db.exec('BEGIN');
      try {
        order.forEach((id, index) => update.run(index, id));
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return send(res, 200, {
        ok: true,
        updated: order.length,
        missing,
        order,
        papers: listLibrary().papers,
      });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/papers/') && url.pathname.endsWith('/pages')) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const row = db.prepare('SELECT pages_json FROM papers WHERE id = ?').get(id);
      if (!row) return send(res, 404, { ok: false, error: 'paper not found' });
      return send(res, 200, { ok: true, pages: JSON.parse(row.pages_json) });
    }
    if (req.method === 'POST' && /^\/api\/papers\/[^/]+\/pdf-upload$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const buffer = await readBinary(req);
      if (!buffer.length || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
        return send(res, 400, { ok: false, error: 'not a PDF file' });
      }
      const tempPath = path.join(pdfDir, `attach-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
      fs.writeFileSync(tempPath, buffer);
      try {
        const paper = await attachPdfToPaper(id, tempPath, url.searchParams.get('force') === '1');
        return send(res, 200, { ok: true, paper });
      } catch (error) {
        if (error.code === 'pdf_mismatch') {
          return send(res, 409, {
            ok: false,
            code: error.code,
            error: error.message,
            reasons: error.reasons,
            detected: error.detected,
            existing: error.existing,
          });
        }
        return send(res, 502, { ok: false, error: error.message });
      } finally {
        try {
          fs.unlinkSync(tempPath);
        } catch (error) {
          // Best-effort temp cleanup.
        }
      }
    }
    if (req.method === 'POST' && /^\/api\/papers\/[^/]+\/pdf$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      try {
        if (!String(body.path || '').trim()) throw new Error('path required');
        const paper = await attachPdfToPaper(id, String(body.path).trim(), Boolean(body.force));
        return send(res, 200, { ok: true, paper });
      } catch (error) {
        if (error.code === 'pdf_mismatch') {
          return send(res, 409, {
            ok: false,
            code: error.code,
            error: error.message,
            reasons: error.reasons,
            detected: error.detected,
            existing: error.existing,
          });
        }
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/papers/') && url.pathname.endsWith('/pdf')) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const row = db.prepare('SELECT pdf_path FROM papers WHERE id = ?').get(id);
      if (!row || !row.pdf_path || !fs.existsSync(row.pdf_path)) {
        return send(res, 404, { ok: false, error: 'pdf not found' });
      }
      const stat = fs.statSync(row.pdf_path);
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': stat.size,
        'content-disposition': 'inline; filename="paper.pdf"',
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      });
      fs.createReadStream(row.pdf_path).pipe(res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/open') {
      const body = await readBody(req);
      const row = db.prepare('SELECT pdf_path FROM papers WHERE id = ?').get(body.paper_id);
      if (!row || !row.pdf_path || !fs.existsSync(row.pdf_path)) {
        return send(res, 404, { ok: false, error: 'pdf not found' });
      }
      if (body.dry_run === true) {
        return send(res, 200, { ok: true, dry_run: true, path: row.pdf_path });
      }
      if (process.platform === 'win32') {
        const child = spawn('cmd.exe', ['/c', 'start', '', row.pdf_path], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        });
        child.unref();
      } else {
        const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
        const child = spawn(opener, [row.pdf_path], { detached: true, stdio: 'ignore' });
        child.unref();
      }
      return send(res, 200, { ok: true, method: 'default-reader', path: row.pdf_path });
    }
    if (req.method === 'POST' && url.pathname === '/api/locate') {
      const body = await readBody(req);
      const row = db.prepare('SELECT pages_json FROM papers WHERE id = ?').get(body.paper_id);
      if (!row) return send(res, 404, { ok: false, error: 'paper not found' });
      return send(res, 200, locateQuote(JSON.parse(row.pages_json), String(body.quote || '')));
    }
    if (req.method === 'POST' && url.pathname === '/api/import') {
      const body = await readBody(req);
      const beforeIds = new Set(db.prepare('SELECT id FROM papers').all().map((row) => row.id));
      const paper = await importPdfAsync({
        pdfPath: body.path,
        summaryPath: body.summary_path,
        groups: Array.isArray(body.groups) && body.groups.length ? body.groups : [],
        title: body.title,
        filenameHint: path.basename(body.path, path.extname(body.path)),
        autoSummary: body.auto_summary === true,
      });
      return send(res, 200, {
        ok: true,
        paper,
        duplicate: beforeIds.has(paper.id),
        needs_metadata_review: !paper.doi && (paper.venue === 'Imported PDF' || paper.authors === 'Unknown'),
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/import-upload') {
      const filename = url.searchParams.get('filename') || 'upload.pdf';
      const summaryPath = url.searchParams.get('summary_path') || null;
      const buffer = await readBinary(req);
      if (!buffer.length || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
        return send(res, 400, { ok: false, error: 'not a PDF file' });
      }
      const tempPath = path.join(pdfDir, `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
      fs.writeFileSync(tempPath, buffer);
      const beforeIds = new Set(db.prepare('SELECT id FROM papers').all().map((row) => row.id));
      try {
        const paper = await importPdfAsync({
          pdfPath: tempPath,
          summaryPath,
          filenameHint: path.basename(filename, path.extname(filename)),
          autoSummary: url.searchParams.get('auto_summary') === '1',
        });
        return send(res, 200, {
        ok: true,
        paper,
        duplicate: beforeIds.has(paper.id),
        needs_metadata_review: !paper.doi && (paper.venue === 'Imported PDF' || paper.authors === 'Unknown'),
      });
      } finally {
        try {
          fs.unlinkSync(tempPath);
        } catch (error) {
          // The library copy is what matters; a leftover temp file is harmless.
        }
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/import/bibliography') {
      // Bibliography exports can be larger than the default JSON body cap.
      const body = await readBody(req, 10 * 1024 * 1024);
      try {
        const result = importBibliography(String(body.text || ''), String(body.format || ''));
        return send(res, 200, { ok: true, ...result });
      } catch (error) {
        return send(res, 400, { ok: false, error: error.message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/papers/delete') {
      const body = await readBody(req);
      const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String))] : [];
      let deleted = 0;
      for (const id of ids) {
        const row = db.prepare('SELECT pdf_path FROM papers WHERE id = ?').get(id);
        if (!row) continue;
        db.prepare('DELETE FROM papers WHERE id = ?').run(id);
        db.prepare('DELETE FROM papers_fts WHERE id = ?').run(id);
        if (row.pdf_path && fs.existsSync(row.pdf_path)) {
          try {
            fs.unlinkSync(row.pdf_path);
          } catch (error) {
            // Keep going: the DB row is gone.
          }
        }
        deleted += 1;
      }
      return send(res, 200, { ok: true, deleted });
    }
    if (req.method === 'DELETE' && /^\/api\/papers\/[^/]+$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const row = db.prepare('SELECT pdf_path FROM papers WHERE id = ?').get(id);
      if (!row) return send(res, 404, { ok: false, error: 'paper not found' });
      db.prepare('DELETE FROM papers WHERE id = ?').run(id);
      db.prepare('DELETE FROM papers_fts WHERE id = ?').run(id);
      if (row.pdf_path && fs.existsSync(row.pdf_path)) {
        try {
          fs.unlinkSync(row.pdf_path);
        } catch (error) {
          // The DB row is gone; a leftover file can be cleaned separately.
        }
      }
      return send(res, 200, { ok: true, deleted: id });
    }
    if (req.method === 'POST' && /^\/api\/papers\/[^/]+\/summary-status$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      const row = db.prepare('SELECT summary_json FROM papers WHERE id = ?').get(id);
      if (!row) return send(res, 404, { ok: false, error: 'paper not found' });
      const summary = JSON.parse(row.summary_json || '{}');
      summary.reviewed = body.reviewed === true;
      db.prepare('UPDATE papers SET summary_json = ? WHERE id = ?').run(JSON.stringify(summary), id);
      return send(res, 200, {
        ok: true,
        paper: serializePaper(db.prepare('SELECT * FROM papers WHERE id = ?').get(id)),
      });
    }
    if (req.method === 'POST' && /^\/api\/papers\/[^/]+\/accept-summary$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const row = db.prepare('SELECT summary_json FROM papers WHERE id = ?').get(id);
      if (!row) return send(res, 404, { ok: false, error: 'paper not found' });
      const summary = JSON.parse(row.summary_json || '{}');
      summary.reviewed = true;
      db.prepare('UPDATE papers SET summary_json = ? WHERE id = ?').run(JSON.stringify(summary), id);
      return send(res, 200, {
        ok: true,
        paper: serializePaper(db.prepare('SELECT * FROM papers WHERE id = ?').get(id)),
      });
    }
    if (req.method === 'POST' && /^\/api\/papers\/[^/]+\/model-summary$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(id);
      if (!row) return send(res, 404, { ok: false, error: 'paper not found' });
      try {
        const summary = await generateModelSummary(row);
        db.prepare('UPDATE papers SET summary_json = ? WHERE id = ?').run(JSON.stringify(summary), id);
        return send(res, 200, {
          ok: true,
          paper: serializePaper(db.prepare('SELECT * FROM papers WHERE id = ?').get(id)),
        });
      } catch (error) {
        return send(res, 502, { ok: false, error: error.message });
      }
    }
    if (req.method === 'POST' && /^\/api\/papers\/[^/]+\/revalidate-citations$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(id);
      if (!row) return send(res, 404, { ok: false, error: 'paper not found' });
      return send(res, 200, { ok: true, ...revalidatePaperCitations(row) });
    }
    if (req.method === 'POST' && /^\/api\/papers\/[^/]+\/auto-summary$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const row = db.prepare('SELECT pages_json, summary_json FROM papers WHERE id = ?').get(id);
      if (!row) return send(res, 404, { ok: false, error: 'paper not found' });
      const pages = JSON.parse(row.pages_json || '[]');
      const summary = buildAutoSummary({ pages });
      db.prepare('UPDATE papers SET summary_json = ? WHERE id = ?').run(JSON.stringify(summary), id);
      return send(res, 200, {
        ok: true,
        paper: serializePaper(db.prepare('SELECT * FROM papers WHERE id = ?').get(id)),
      });
    }
    if (req.method === 'PATCH' && /^\/api\/papers\/[^/]+$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(id);
      if (!row) return send(res, 404, { ok: false, error: 'paper not found' });
      const current = JSON.parse(row.summary_json || '{}');
      const next = {
        ...current,
        sections: Array.isArray(body.sections) ? body.sections : current.sections,
        evidence: Array.isArray(body.evidence) ? body.evidence : current.evidence,
      };
      const title = body.title !== undefined ? String(body.title).trim() : row.title;
      if (!title) return send(res, 400, { ok: false, error: 'title required' });
      const authors = body.authors !== undefined ? String(body.authors) : row.authors;
      const year = body.year !== undefined ? (body.year === '' || body.year === null ? null : Number(body.year) || null) : row.year;
      const venue = body.venue !== undefined ? String(body.venue) : row.venue;
      const doi = body.doi !== undefined ? String(body.doi) : row.doi;
      const arxiv = body.arxiv !== undefined ? String(body.arxiv) : row.arxiv;
      const abstract = body.abstract !== undefined ? String(body.abstract) : row.abstract;
      const groups = Array.isArray(body.groups) ? body.groups : JSON.parse(row.groups_json || '[]');
      db.prepare(`
        UPDATE papers SET title = ?, authors = ?, year = ?, venue = ?, doi = ?, arxiv = ?,
          abstract = ?, summary_json = ?, groups_json = ? WHERE id = ?
      `).run(
        title,
        authors,
        year,
        venue,
        doi,
        arxiv,
        abstract,
        JSON.stringify(next),
        JSON.stringify(groups),
        id
      );
      const metadataChanged =
        title !== row.title ||
        String(authors || '') !== String(row.authors || '') ||
        String(abstract || '') !== String(row.abstract || '');
      if (metadataChanged) {
        indexPaper({
          id,
          title,
          authors,
          abstract,
          pages: JSON.parse(row.pages_json || '[]'),
        });
      }
      return send(res, 200, { ok: true, paper: serializePaper(db.prepare('SELECT * FROM papers WHERE id = ?').get(id)) });
    }
    if (req.method === 'PATCH' && /^\/api\/papers\/[^/]+\/summary$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      const row = db.prepare('SELECT summary_json FROM papers WHERE id = ?').get(id);
      if (!row) return send(res, 404, { ok: false, error: 'paper not found' });
      const current = JSON.parse(row.summary_json || '{}');
      const next = {
        ...current,
        sections: Array.isArray(body.sections) ? body.sections : current.sections,
        evidence: Array.isArray(body.evidence) ? body.evidence : current.evidence,
      };
      db.prepare('UPDATE papers SET summary_json = ? WHERE id = ?').run(JSON.stringify(next), id);
      return send(res, 200, { ok: true });
    }
    send(res, 404, { ok: false, error: 'not found' });
  } catch (error) {
    send(res, 500, { ok: false, error: error.message });
  }
});

const litdPort = Number(process.env.LITD_PORT || 8765);
server.listen(litdPort, '127.0.0.1', () => {
  console.log(`[litd] listening on http://127.0.0.1:${litdPort}`);
});

const feedRefreshHours = Number(process.env.LITD_FEED_REFRESH_HOURS || 6);
if (Number.isFinite(feedRefreshHours) && feedRefreshHours > 0) {
  const runScheduledRefresh = () => {
    refreshAllFeeds(true, feedRefreshHours)
      .then((result) => {
        if (result.checked > 0) {
          console.log(`[litd] scheduled feed refresh: ${result.refreshed}/${result.checked} sources`);
        }
      })
      .catch((error) => console.error('[litd] scheduled feed refresh failed:', error.message));
  };
  setTimeout(runScheduledRefresh, 8000).unref();
  setInterval(runScheduledRefresh, feedRefreshHours * 60 * 60 * 1000).unref();
  console.log(`[litd] feed refresh every ${feedRefreshHours}h`);
}

const backupHours = Number(process.env.LITD_BACKUP_HOURS || 24);
if (Number.isFinite(backupHours) && backupHours > 0) {
  const runScheduledBackup = async () => {
    try {
      const latest = listBackups()[0];
      if (latest && Date.now() - new Date(latest.created_at).getTime() < backupHours * 60 * 60 * 1000) return;
      const { archive } = await createBackupArchive();
      pruneBackups(12);
      console.log(`[litd] scheduled backup: ${path.basename(archive)}`);
    } catch (error) {
      console.error('[litd] scheduled backup failed:', error.message);
    }
  };
  setTimeout(runScheduledBackup, 15000).unref();
  setInterval(runScheduledBackup, Math.min(backupHours, 6) * 60 * 60 * 1000).unref();
  console.log(`[litd] backup every ${backupHours}h (retention 12)`);
}
