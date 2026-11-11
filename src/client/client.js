const LIT_DEMO_API_BASE =
  (typeof window !== 'undefined' && window.__DSH_LIT_CONFIG__?.apiBase) ||
  'http://127.0.0.1:8765';

(function reportClientError() {
  const send = (payload) => {
    try {
      fetch(`${LIT_DEMO_API_BASE}/api/client-error`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch (error) {
      // Reporting must never break the plugin.
    }
  };
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('error', (event) => {
      send({
        type: 'error',
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error && event.error.stack,
      });
    });
    window.addEventListener('unhandledrejection', (event) => {
      send({
        type: 'unhandledrejection',
        message: String(event.reason && (event.reason.message || event.reason)),
        stack: event.reason && event.reason.stack,
      });
    });
  }
})();

window.__ModuleLoader__.load({
  id: '@local/lit-demo',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useMemo, useRef, useState } = React;

    const NS = 'lit-demo';
    const STORAGE_KEY = 'dsh-lit-demo-v1';
    // Settings (section presets + per-group default structure) live under their
    // own key. Without this declaration every localStorage access raised a
    // ReferenceError that the try/catch blocks below silently swallowed.
    const SETTINGS_KEY = 'dsh-lit-settings-v1';
    const LAYOUT_KEY = 'dsh-lit-layout-v1';
    const AI_SEARCH_STORAGE_KEY = 'dsh-lit-ai-search-v1';
    const AUTHOR_SEARCH_STORAGE_KEY = 'dsh-lit-author-search-v1';

    function readStoredJson(key, fallback) {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
        return parsed && typeof parsed === 'object' ? parsed : fallback;
      } catch (error) {
        return fallback;
      }
    }

    function writeStoredJson(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        // Storage is best-effort.
      }
    }
    const DEFAULT_LAYOUT = { groups: 240, list: 360 };
    const VERSION = 1;

    function loadLayoutWidths() {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(LAYOUT_KEY) || 'null');
        if (parsed && Number(parsed.groups) >= 180 && Number(parsed.list) >= 280) {
          return { groups: Number(parsed.groups), list: Number(parsed.list) };
        }
      } catch (error) {
        // Invalid layout falls back to defaults.
      }
      return DEFAULT_LAYOUT;
    }

    const GROUPS = [
      { id: 'interp', name: '可解释性', color: '#72b7ff' },
      { id: 'dynamics', name: '训练动力学', color: '#f5c451' },
      { id: 'policy', name: '政策研究', color: '#7fe0b0' },
    ];
    const GROUP_MAP = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
    const CLUSTER_COLORS = ['#8ab4ff', '#ffd166', '#7ee0b8', '#ff9f9f'];
    const CLUSTER_LABELS = ['机制与电路', '训练动力学', '应用与治理', '其他'];

    const I18N = {
      zh: {
        nav: '文献工作台',
        library: '文献库',
        tracking: '追踪',
        graph: '网络图',
      },
      en: {
        nav: 'Literature',
        library: 'Library',
        tracking: 'Tracking',
        graph: 'Network',
      },
    };

    function Icon({ name, size = 16, strokeWidth = 1.8, filled = false }) {
      const common = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: filled ? 'currentColor' : 'none',
        stroke: 'currentColor',
        strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        style: { display: 'block', flexShrink: 0 },
      };
      const paths = {
        book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5zM4 5.5V21.5M8 7h8M8 10.5h6',
        file: 'M6 3h8l4 4v14H6zM14 3v5h5M9 12h6M9 16h6',
        search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
        rss: 'M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8M5 18.5h.01',
        network: 'M6 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7.5 5.5l8.5 2M8 15.5l7-4.5',
        sparkles: 'M12 3l1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1L6.5 8.5l4.1-1.4zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z',
        link: 'M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1',
        external: 'M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
        download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
        copy: 'M8 8h11v11H8zM5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1',
        check: 'M4 12l5 5L20 6',
        plus: 'M12 5v14M5 12h14',
        x: 'M6 6l12 12M18 6L6 18',
        chevron: 'M9 18l6-6-6-6',
        refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
        trash: 'M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6',
        tag: 'M20 13l-7 7-9-9V4h7zM8.5 8.5h.01',
        edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
        clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
        info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 10v6M12 7h.01',
        filter: 'M4 5h16l-6 7v6l-4 2v-8z',
        play: 'M8 5l11 7-11 7z',
        pause: 'M9 5v14M15 5v14',
        star: 'M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.4l6.1-.9z',
        settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-2 .3 1.7 1.7 0 0 0-.7 1.4V22h-5v-.2a1.7 1.7 0 0 0-.7-1.4 1.7 1.7 0 0 0-2-.3l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.4-.7H3v-4h.2a1.7 1.7 0 0 0 1.4-.7 1.7 1.7 0 0 0 .3-1.9l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 2-.3A1.7 1.7 0 0 0 9.7 3V3h5v.2a1.7 1.7 0 0 0 .7 1.4 1.7 1.7 0 0 0 2 .3l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.4.7h.2v4h-.2a1.7 1.7 0 0 0-1.4.7z',
      };
      if (name === 'search') {
        return h('svg', common, h('circle', { cx: 11, cy: 11, r: 7 }), h('path', { d: 'M20 20l-4-4' }));
      }
      if (name === 'rss') {
        return h('svg', common, h('path', { d: 'M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8' }), h('circle', { cx: 5, cy: 19, r: 1, fill: 'currentColor', stroke: 'none' }));
      }
      if (name === 'network') {
        return h(
          'svg',
          common,
          h('circle', { cx: 6, cy: 6, r: 2.2 }),
          h('circle', { cx: 18, cy: 8, r: 2.2 }),
          h('circle', { cx: 9, cy: 18, r: 2.2 }),
          h('path', { d: 'M8 6.5l7.8 1M7.2 8l1.4 7.8M10.5 16.8l5.5-6.6' })
        );
      }
      if (name === 'copy') {
        return h('svg', common, h('rect', { x: 8, y: 8, width: 11, height: 11, rx: 1.5 }), h('path', { d: 'M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1' }));
      }
      if (name === 'tag') {
        return h('svg', common, h('path', { d: 'M20 13l-7 7-9-9V4h7z' }), h('circle', { cx: 8.5, cy: 8.5, r: 1, fill: 'currentColor', stroke: 'none' }));
      }
      return h('svg', common, h('path', { d: paths[name] || paths.file }));
    }

    function alpha(hex, a) {
      const s = String(hex || '#888888').replace('#', '');
      if (s.length !== 6) return `rgba(136,136,136,${a})`;
      const n = parseInt(s, 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function F(id, text, quote, page, section, status) {
      return { id, text, quote, page, section, status: status || 'verified' };
    }

    function S(question, findings, limitations, myNote) {
      return { question, findings, limitations, myNote };
    }

    const SECTION_TYPE_LABELS = { text: '文本', rating: '星级', tags: '多选', read: '已读' };

    const SECTION_PRESETS = [
      { id: 'question', title: '研究问题', type: 'text', owner: 'ai', hint: '这篇论文想回答什么？' },
      { id: 'findings', title: '主要发现', type: 'text', owner: 'ai', hint: '每条结论都可以挂原文证据' },
      { id: 'core-claim', title: '核心主张', type: 'text', owner: 'ai', hint: '这篇论文最重要的政策/论点主张' },
      { id: 'limitations', title: '作者承认的局限', type: 'text', owner: 'ai', hint: '来自原文，不混入你的评价' },
      { id: 'my-note', title: '我的评价', type: 'text', owner: 'user', hint: '用户所有，AI 不覆盖' },
      { id: 'method-quality', title: '方法质量', type: 'rating', max: 5, owner: 'user', hint: '1–5 星' },
      { id: 'repro-risk', title: '复现风险', type: 'rating', max: 5, owner: 'user', hint: '星级越高风险越高' },
      { id: 'policy-relevance', title: '政策相关性', type: 'rating', max: 5, owner: 'user', hint: '与政策议题的相关程度' },
      {
        id: 'topics',
        title: '主题标签',
        type: 'tags',
        options: ['机制', '电路', '训练动力学', '泛化', '评测', '复现'],
        owner: 'user',
        hint: '可多选',
      },
      {
        id: 'stakeholders',
        title: '利益相关方',
        type: 'tags',
        options: ['研究者', '开发者', '监管者', '用户', '平台'],
        owner: 'user',
        hint: '可多选',
      },
      { id: 'read', title: '阅读状态', type: 'read', owner: 'user', hint: '手动标记是否已读' },
    ];
    const SECTION_PRESET_MAP = Object.fromEntries(SECTION_PRESETS.map((preset) => [preset.id, preset]));

    const GROUP_TEMPLATE_IDS = {
      interp: ['question', 'findings', 'method-quality', 'topics', 'limitations', 'my-note'],
      dynamics: ['question', 'findings', 'repro-risk', 'topics', 'limitations'],
      policy: ['question', 'core-claim', 'policy-relevance', 'stakeholders', 'read'],
    };

    function templateFromPreset(preset) {
      return {
        key: preset.id,
        presetId: preset.id,
        title: preset.title,
        type: preset.type,
        owner: preset.owner || 'ai',
        hint: preset.hint || '',
        ...(preset.type === 'rating' ? { max: preset.max || 5 } : {}),
        ...(preset.type === 'tags' ? { options: clone(preset.options || []) } : {}),
      };
    }

    const GROUP_TEMPLATES = Object.fromEntries(
      Object.entries(GROUP_TEMPLATE_IDS).map(([groupId, ids]) => [
        groupId,
        ids.map((id) => templateFromPreset(SECTION_PRESET_MAP[id])).filter(Boolean),
      ])
    );

    function initSection(definition) {
      const section = clone(definition);
      section.key = definition.key || definition.id || definition.presetId || `section-${Date.now()}`;
      section.presetId = definition.presetId || definition.id || null;
      section.title = definition.title || '未命名大类';
      section.type = definition.type || 'text';
      section.owner = definition.owner || 'ai';
      if (section.type === 'text') section.entries = Array.isArray(definition.entries) ? clone(definition.entries) : [];
      if (section.type === 'rating') section.value = Number(definition.value || 0);
      if (section.type === 'tags') section.selected = Array.isArray(definition.selected) ? clone(definition.selected) : [];
      if (section.type === 'read') section.value = definition.value === true;
      return section;
    }

    function sectionsFromTemplates(templates, groupIds) {
      const sections = [];
      const seen = new Set();
      (groupIds || []).forEach((groupId) => {
        (templates[groupId] || []).forEach((definition) => {
          const key = definition.key || definition.id || definition.presetId;
          if (!key || seen.has(key)) return;
          seen.add(key);
          sections.push(initSection(definition));
        });
      });
      return sections;
    }

    function textEntry(id, text) {
      return {
        id: id || `entry-${Date.now()}`,
        text: text || '',
        quote: '',
        page: null,
        section: '',
        status: 'draft',
      };
    }

    function buildPaperSections(oldSummary, groupIds) {
      const sections = sectionsFromTemplates(GROUP_TEMPLATES, groupIds);
      sections.forEach((section) => {
        if (section.key === 'question') {
          section.entries = [textEntry(`${section.key}-1`, oldSummary.question || '')];
        } else if (section.key === 'findings' || section.key === 'core-claim') {
          section.entries = clone(oldSummary.findings || []);
        } else if (section.key === 'limitations' && oldSummary.limitations) {
          section.entries = [textEntry(`${section.key}-1`, oldSummary.limitations)];
        } else if (section.key === 'my-note' && oldSummary.myNote) {
          section.entries = [textEntry(`${section.key}-1`, oldSummary.myNote)];
        }
      });
      return sections;
    }

    function textEntriesOf(paper) {
      const entries = [];
      (paper.summary.sections || []).forEach((section) => {
        if (section.type !== 'text') return;
        (section.entries || []).forEach((entry) => {
          entries.push({ ...entry, sectionKey: section.key, sectionTitle: section.title });
        });
      });
      return entries;
    }

    function tagsOfPaper(paper) {
      const tags = new Set();
      ((paper && paper.summary && paper.summary.sections) || []).forEach((section) => {
        if (section.type !== 'tags') return;
        (section.selected || []).forEach((tag) => {
          const value = String(tag || '').trim();
          if (value) tags.add(value);
        });
      });
      return [...tags];
    }

    function firstTextSection(paper, preferredKeys) {
      const sections = paper.summary.sections || [];
      for (const key of preferredKeys || []) {
        const section = sections.find((item) => item.key === key);
        if (section && section.type === 'text' && section.entries && section.entries.length) return section;
      }
      return sections.find((section) => section.type === 'text' && section.entries && section.entries.length) || null;
    }

    function P(id, title, authors, year, venue, doi, arxiv, groups, status, abstract, summary) {
      return {
        id,
        title,
        authors,
        year,
        venue,
        doi,
        arxiv,
        groups,
        status,
        abstract,
        summary: { sections: buildPaperSections(summary, groups) },
        edited: false,
      };
    }

    function makeSeed() {
      const papers = [
        P(
          'p1',
          'Geometric Inductive Bias and the Limits of Grokking',
          'L. Chen, M. Ito, R. Patel',
          2026,
          'arXiv:2603.05228 · demo',
          '10.0000/litdemo.p1',
          '2603.05228',
          ['interp', 'dynamics'],
          '已总结',
          'We study how architectural topology changes the representation geometry that precedes generalization. The demo summary below is fictional and exists only to exercise the editing and evidence-linking workflow.',
          S(
            '为什么 grokking 只在特定架构下出现？架构拓扑是否会替代相变？',
            [
              F(
                'p1f1',
                'Grokking 可以被理解为表示几何的重新对齐，而不只是训练时间的延迟。',
                'We show that grokking coincides with a geometric re-alignment of the learned representation, rather than a simple delay in optimization.',
                7,
                '4.2 Mechanism',
                'verified'
              ),
              F(
                'p1f2',
                '残差连接和归一化位置会改变电路形成的路径。',
                'The placement of normalization and residual connections changes the pathway through which Fourier circuits emerge.',
                9,
                '5.1 Architecture',
                'verified'
              ),
              F(
                'p1f3',
                '在部分设置下，架构拓扑可以让模型绕过明显的相变。',
                'Under specific topological conditions, the model bypasses the sharp phase transition reported in prior work.',
                11,
                '6 Discussion',
                'needs_recheck'
              ),
            ],
            '作者只测试了模块加法任务，尚未验证自然语言任务。',
            '如果这个结论成立，解释性研究里的“相变”可能部分是架构伪影。需要看附录的消融。'
          )
        ),
        P(
          'p2',
          'When Abstraction Precedes Generalization',
          'S. Raman, J. Wu',
          2025,
          'Demo Conference on Learning',
          '10.0000/litdemo.p2',
          '',
          ['interp'],
          '已总结',
          'A demo paper about abstract features becoming decodable before behavioural generalization.',
          S(
            '抽象表征是否先于行为泛化出现？',
            [
              F(
                'p2f1',
                '在 grokking 之前，模型内部已经出现可线性解码的抽象特征。',
                'Abstract features become linearly decodable before the abrupt improvement in test accuracy.',
                6,
                '3.4 Emergence',
                'verified'
              ),
              F(
                'p2f2',
                '行为相变更像是读出层对齐，而不是表征从无到有。',
                'The behavioural transition is better explained by readout alignment than by the sudden formation of representations.',
                8,
                '5 Discussion',
                'verified'
              ),
            ],
            '主要基于玩具任务，抽象的定义依赖线性探针。',
            '和 p1 的几何解释可以互相印证，但需要统一“抽象”的度量。'
          )
        ),
        P(
          'p3',
          'Scaling Laws of Feature Emergence',
          'A. Novak, T. Silva',
          2026,
          'Demo Journal of Learning Dynamics',
          '10.0000/litdemo.p3',
          '',
          ['dynamics'],
          '已总结',
          'A demo paper about emergence time and task difficulty.',
          S(
            '能否从学习动力学推出特征涌现的 scaling law？',
            [
              F(
                'p3f1',
                '特征涌现时间与任务难度呈幂律关系。',
                'The emergence time follows a power law in task difficulty across the settings we study.',
                5,
                '4 Scaling',
                'verified'
              ),
            ],
            '理论假设较强，实验规模有限。',
            ''
          )
        ),
        P(
          'p4',
          'Distributed Circuits Without a Module Switch',
          'H. Park, E. Rossi',
          2026,
          'Demo Workshop on Interpretability',
          '10.0000/litdemo.p4',
          '',
          ['interp'],
          '已总结',
          'A demo paper about distributed utility and Fourier recoding.',
          S(
            'Grokking 发生在哪个模块？是否存在单一开关？',
            [
              F(
                'p4f1',
                '不存在单一模块开关，效用分布在多个子网络。',
                'We find no single module switch; utility is distributed across overlapping subnetworks.',
                4,
                '3 Results',
                'verified'
              ),
            ],
            '只做了因果消融，没有给出训练动力学解释。',
            ''
          )
        ),
        P(
          'p5',
          'Logit-Scale Mediation under Weight Decay',
          'N. Okafor, Y. Kim',
          2025,
          'Demo Journal of Optimization',
          '10.0000/litdemo.p5',
          '',
          ['dynamics'],
          '已总结',
          'A demo paper about weight norm and logit scale.',
          S(
            '权重范数通过什么机制影响泛化？',
            [
              F(
                'p5f1',
                '权重范数主要通过 logit scale 调节泛化时间。',
                'Weight norm affects generalization primarily by mediating the logit scale under cross-entropy.',
                7,
                '5 Mechanism',
                'needs_recheck'
              ),
            ],
            '只覆盖交叉熵损失，没有验证其他目标函数。',
            ''
          )
        ),
        P(
          'p6',
          'Fourier Circuits in Modular Addition',
          'R. Iyer, K. Sato',
          2024,
          'Demo Conference on Mechanistic Interpretability',
          '10.0000/litdemo.p6',
          '',
          ['interp'],
          '已总结',
          'A demo paper about reproducible Fourier circuits.',
          S(
            '模块加法任务中的电路能否推广到自然语言？',
            [
              F(
                'p6f1',
                '模块加法中的傅里叶电路在小型 transformer 中可复现。',
                'The Fourier circuit is reproducible across seeds and small transformer variants.',
                9,
                '4.2',
                'verified'
              ),
            ],
            '自然语言实验只做了初步尝试。',
            ''
          )
        ),
        P(
          'p7',
          'Verifiable Governance for Frontier Models',
          'M. Alvarez, D. Brown',
          2026,
          'Demo Policy Review',
          '10.0000/litdemo.p7',
          '',
          ['policy'],
          '已总结',
          'A demo paper about voluntary commitments and third-party verification.',
          S(
            '前沿模型治理如何从自愿承诺走向可执行监管？',
            [
              F(
                'p7f1',
                '自愿承诺缺少第三方验证，难以形成有效约束。',
                'Voluntary commitments lack independent verification and therefore cannot function as binding governance.',
                12,
                '4 Enforcement',
                'verified'
              ),
            ],
            '没有讨论开源模型的特殊性。',
            ''
          )
        ),
        P(
          'p8',
          'Retrieval-Augmented Literature Review: A Reality Check',
          'J. Lee, P. Müller',
          2026,
          'Demo Journal of Scientific Workflows',
          '10.0000/litdemo.p8',
          '',
          ['policy'],
          '已总结',
          'A demo paper about retrieval-augmented scientific writing.',
          S(
            'RAG 能否提高科学文献综述的事实一致性？',
            [
              F(
                'p8f1',
                '检索增强能减少引用错误，但不能消除证据误读。',
                'Retrieval augmentation reduces citation errors but does not eliminate misinterpretation of evidence.',
                6,
                '5 Results',
                'needs_recheck'
              ),
            ],
            '评测集规模较小，任务类型有限。',
            ''
          )
        ),
      ];

      const feeds = [
        { id: 'feed-arxiv', name: 'arXiv cs.LG', url: 'https://rss.arxiv.org/rss/cs.LG' },
        { id: 'feed-nmi', name: 'Nature Machine Intelligence', url: 'https://www.nature.com/natmachintell.rss' },
        { id: 'feed-biorxiv', name: 'bioRxiv Neuroscience', url: 'https://connect.biorxiv.org/biorxiv_xml.php?subject=neuroscience' },
        { id: 'feed-policy', name: 'AI Policy Brief', url: 'https://example.org/ai-policy/feed.xml' },
      ];

      const feedItems = [
        {
          id: 'f1',
          feedId: 'feed-arxiv',
          title: 'Sparse Autoencoders Reveal Reusable Features in Small Transformers',
          source: 'arXiv cs.LG',
          time: '2 小时前',
          label: 'recommend',
          reason: '与“可解释性”分组的种子论文高度相关：涉及特征分解、电路复用和机制解释。',
          abstract:
            'We train sparse autoencoders on small transformer residual streams and find a compact set of features that transfer across tasks. The demo item exists to show how AI screening, human reading, and library saving can share one candidate pool.',
          groupIds: ['interp'],
          read: false,
          saved: false,
          hidden: false,
          url: 'https://arxiv.org/abs/2603.09999',
        },
        {
          id: 'f2',
          feedId: 'feed-arxiv',
          title: 'Weight Decay Delays Generalization by Reshaping Logit Scale',
          source: 'arXiv cs.LG',
          time: '5 小时前',
          label: 'maybe',
          reason: '与“训练动力学”相关，但摘要只提到视觉分类任务；需要读全文确认是否讨论 grokking。',
          abstract:
            'A demo abstract about weight decay, logit scale, and delayed generalization. The screening label is deliberately borderline so the reader can see the “maybe” state.',
          groupIds: ['dynamics'],
          read: false,
          saved: false,
          hidden: false,
          url: 'https://arxiv.org/abs/2603.08888',
        },
        {
          id: 'f3',
          feedId: 'feed-policy',
          title: 'A Verification Regime for Open-Weight Frontier Models',
          source: 'AI Policy Brief',
          time: '1 天前',
          label: 'recommend',
          reason: '直接对应“政策研究”分组的核心问题：第三方验证、开放权重和可执行监管。',
          abstract:
            'This demo policy brief proposes a third-party evaluation regime for open-weight models and discusses verification costs, audit access, and disclosure requirements.',
          groupIds: ['policy'],
          read: false,
          saved: false,
          hidden: false,
          url: 'https://example.org/ai-policy/open-weight-verification',
        },
        {
          id: 'f4',
          feedId: 'feed-nmi',
          title: 'Mechanistic Interpretability Beyond Circuits: A Survey',
          source: 'Nature Machine Intelligence',
          time: '1 天前',
          label: 'maybe',
          reason: '主题相关，但更像综述；如果你正在找方法论文，可以降权。',
          abstract:
            'A demo survey covering circuits, sparse features, causal interventions, and open problems in mechanistic interpretability.',
          groupIds: ['interp'],
          read: true,
          saved: false,
          hidden: false,
          url: 'https://example.org/nmi/interpretability-survey',
        },
        {
          id: 'f5',
          feedId: 'feed-biorxiv',
          title: 'Benchmarking Retrieval-Augmented Scientific Writing',
          source: 'bioRxiv Neuroscience',
          time: '2 天前',
          label: 'ignore',
          reason: '主题落在科学写作评测，与当前三个分组的关注点都不强相关。',
          abstract:
            'A demo benchmark for retrieval-augmented scientific writing, with citation accuracy and evidence-grounding metrics.',
          groupIds: ['policy'],
          read: true,
          saved: false,
          hidden: false,
          url: 'https://example.org/biorxiv/rag-writing',
        },
        {
          id: 'f6',
          feedId: 'feed-arxiv',
          title: 'Call for Papers: Workshop on Interpretability and Dynamics',
          source: 'arXiv cs.LG',
          time: '3 天前',
          label: 'ignore',
          reason: 'CFP，不是研究论文；规则层可以直接过滤。',
          abstract:
            'A demo call for papers. This item shows why a cheap rule layer should run before any LLM screening.',
          groupIds: ['interp'],
          read: true,
          saved: false,
          hidden: false,
          url: 'https://example.org/cfp',
        },
      ];

      const graph = {
        nodes: [
          { id: 'n1', paperId: 'p1', label: 'Geometric', x: 145, y: 145, r: 15, group: 'interp' },
          { id: 'n2', paperId: 'p2', label: 'Abstraction', x: 275, y: 95, r: 12, group: 'interp' },
          { id: 'n3', paperId: 'p3', label: 'Scaling', x: 470, y: 100, r: 11, group: 'dynamics' },
          { id: 'n4', paperId: 'p4', label: 'Distributed', x: 180, y: 270, r: 11, group: 'interp' },
          { id: 'n5', paperId: 'p5', label: 'Logit scale', x: 565, y: 205, r: 11, group: 'dynamics' },
          { id: 'n6', paperId: 'p6', label: 'Fourier', x: 335, y: 195, r: 13, group: 'interp' },
          { id: 'n7', paperId: 'p7', label: 'Governance', x: 610, y: 345, r: 11, group: 'policy' },
          { id: 'n8', paperId: 'p8', label: 'RAG review', x: 425, y: 350, r: 11, group: 'policy' },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', type: 'citation' },
          { id: 'e2', source: 'n1', target: 'n4', type: 'semantic' },
          { id: 'e3', source: 'n1', target: 'n3', type: 'semantic' },
          { id: 'e4', source: 'n2', target: 'n6', type: 'semantic' },
          { id: 'e5', source: 'n3', target: 'n5', type: 'citation' },
          { id: 'e6', source: 'n4', target: 'n6', type: 'citation' },
          { id: 'e7', source: 'n5', target: 'n1', type: 'semantic' },
          { id: 'e8', source: 'n6', target: 'n8', type: 'semantic' },
          { id: 'e9', source: 'n7', target: 'n8', type: 'citation' },
          { id: 'e10', source: 'n7', target: 'n6', type: 'semantic' },
          { id: 'e11', source: 'n8', target: 'n4', type: 'semantic' },
        ],
      };

      const schedule = [
        { id: 'rss', label: 'RSS 轮询', interval: '30 分钟', cost: '无 LLM', tone: 'ok' },
        { id: 'api', label: 'API 检索', interval: '6 小时', cost: '无 LLM', tone: 'ok' },
        { id: 'screen', label: 'LLM 初筛', interval: '每天', cost: '低', tone: 'warn' },
        { id: 'expand', label: 'AI 查询扩展', interval: '每周', cost: '中', tone: 'warn' },
        { id: 'summary', label: '深度总结', interval: '手动', cost: '高', tone: 'hot' },
      ];

      return {
        version: VERSION,
        papers,
        groups: clone(GROUPS),
        feeds,
        feedItems,
        graph,
        schedule,
        sectionPresets: clone(SECTION_PRESETS),
        groupTemplates: clone(GROUP_TEMPLATES),
        budgetUsed: 78000,
        budgetLimit: 200000,
        aiPaused: false,
        lastRun: '今天 08:00',
        clusterSeed: 0,
        clusterMode: 'semantic',
        graphMode: 'semantic',
        graphColorMode: 'cluster',
        graphThreshold: 0.14,
        resolution: 1.0,
        groupFilterLogic: 'and',
      };
    }

    function loadState() {
      try {
        const raw =
          window.localStorage.getItem(STORAGE_KEY) ||
          window.localStorage.getItem('dsh-lit-demo-v2');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.version === VERSION && Array.isArray(parsed.papers)) {
            return mergeSettings(parsed);
          }
          if (parsed && parsed.version === 2 && Array.isArray(parsed.papers)) {
            parsed.version = VERSION;
            parsed.groups = clone(GROUPS);
            parsed.groupTemplates = parsed.groupTemplates || clone(GROUP_TEMPLATES);
            return mergeSettings(parsed);
          }
        }
      } catch (error) {
        // A corrupt demo cache should not block the workspace.
      }
      return mergeSettings(makeSeed());
    }

    function readLocalSettings() {
      const parsed = readStoredJson(SETTINGS_KEY, null);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        sectionPresets: Array.isArray(parsed.sectionPresets) ? parsed.sectionPresets : null,
        groupTemplates:
          parsed.groupTemplates && typeof parsed.groupTemplates === 'object' ? parsed.groupTemplates : null,
        savedAt: Number(parsed.savedAt) || 0,
      };
    }

    function writeLocalSettings(settings) {
      writeStoredJson(SETTINGS_KEY, settings);
    }

    function mergeSettings(base) {
      const local = readLocalSettings();
      if (local && Array.isArray(local.sectionPresets) && local.sectionPresets.length > 0) {
        base.sectionPresets = local.sectionPresets;
      }
      if (local && local.groupTemplates) base.groupTemplates = local.groupTemplates;
      return base;
    }

    function buildRis(paper) {
      const authors = String(paper.authors || '')
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      const lines = ['TY  - JOUR'];
      authors.forEach((a) => lines.push(`AU  - ${a}`));
      lines.push(`TI  - ${paper.title || ''}`);
      lines.push(`PY  - ${paper.year || ''}`);
      lines.push(`JO  - ${paper.venue || ''}`);
      if (paper.doi) lines.push(`DO  - ${paper.doi}`);
      if (paper.abstract) lines.push(`AB  - ${paper.abstract.replace(/\s+/g, ' ')}`);
      if (paper.doi) lines.push(`UR  - https://doi.org/${paper.doi}`);
      lines.push('ER  - ', '');
      return lines.join('\n');
    }

    function downloadText(filename, text, mime) {
      const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    }

    async function copyText(text) {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (error) {
        // Fall through to the legacy path.
      }
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
        return true;
      } catch (error) {
        return false;
      }
    }

    function GroupChip({ group, small }) {
      const g = typeof group === 'string' ? GROUP_MAP[group] : group;
      if (!g) return null;
      return h(
        'span',
        {
          className: small ? 'lit-chip lit-chip-small' : 'lit-chip',
          style: {
            background: alpha(g.color, 0.14),
            borderColor: alpha(g.color, 0.38),
          },
        },
        h('span', { className: 'lit-dot', style: { background: g.color } }),
        g.name
      );
    }

    function AiBadge({ label }) {
      const map = {
        recommend: { text: 'AI 推荐', color: '#7fe0b0' },
        maybe: { text: '可能相关', color: '#f5c451' },
        ignore: { text: '已忽略', color: 'var(--dsw-alias-label-secondary, #9aa7b4)' },
      };
      const item = map[label] || map.maybe;
      return h(
        'span',
        {
          className: 'lit-ai-badge',
          style: {
            color: item.color,
            background: alpha(item.color, 0.12),
            borderColor: alpha(item.color, 0.32),
          },
        },
        h(Icon, { name: label === 'ignore' ? 'x' : 'sparkles', size: 12 }),
        item.text
      );
    }

    const TRANSLATION_TITLE_SELECTOR =
      '.lit-paper-title,.lit-paper-row-title,.lit-feed-card-title,.lit-feed-card-heading,.lit-author-paper-title,.lit-inspector-title,.lit-discovery-title';
    const EMPTY_TRANSLATION = { open: false, busy: false, error: '', mode: 'translated', count: 0 };

    function collectTranslationBlocks(root) {
      if (!root) return [];
      const priority = [...root.querySelectorAll(TRANSLATION_TITLE_SELECTOR)];
      const generic = [...root.querySelectorAll('h1,h2,h3,h4,h5,p,div,span,li,td,th,strong,em,small,label,blockquote')];
      const nodes = [...priority, ...generic.filter((element) => !priority.includes(element))];
      const seen = new Set();
      const blocks = [];
      for (const element of nodes) {
        if (element.closest('.lit-translation-bar')) continue;
        const isTitle = element.matches(TRANSLATION_TITLE_SELECTOR);
        if (!isTitle && element.closest('button,a,input,textarea,select,code,pre,svg,canvas')) continue;
        if (!isTitle && element.children.length > 0) continue;
        const original = String(element.textContent || '');
        const text = original.replace(/\s+/g, ' ').trim();
        if (text.length < 8 || text.length > 1600) continue;
        if (!/[\p{L}]/u.test(text)) continue;
        if (/^(https?:\/\/|doi\s*:|10\.\d{4,}\/)/i.test(text)) continue;
        if (seen.has(text)) continue;
        seen.add(text);
        blocks.push({ element, text, original });
      }
      return blocks;
    }

    function restoreTranslationBlocks(root) {
      if (!root) return;
      for (const element of root.querySelectorAll('[data-lit-original]')) {
        element.textContent = element.dataset.litOriginal || '';
        delete element.dataset.litOriginal;
        delete element.dataset.litI18n;
      }
    }

    function applyTranslationBlocks(root, mode, translations) {
      if (!root) return;
      restoreTranslationBlocks(root);
      if (mode === 'original' || !translations?.size) return;
      const blocks = collectTranslationBlocks(root);
      for (const { element, text, original } of blocks) {
        const translated = translations.get(text);
        if (!translated) continue;
        element.dataset.litOriginal = original;
        element.dataset.litI18n = '1';
        element.textContent = mode === 'bilingual' ? `${text}\n〔译〕${translated}` : translated;
      }
    }

    function StatusPill({ status }) {
      const map = {
        verified: { text: '已定位', cls: 'ok' },
        needs_recheck: { text: '待定位', cls: 'warn' },
        missing: { text: '未找到引文', cls: 'warn' },
        draft: { text: '未定位', cls: 'muted' },
      };
      const item = map[status] || map.draft;
      return h('span', { className: `lit-status lit-status-${item.cls}` }, item.text);
    }

    function formatImpactFactor(value) {
      if (value === null || value === undefined || value === '') return '—';
      const number = Number(value);
      if (!Number.isFinite(number)) return '—';
      return Number.isInteger(number) ? String(number) : number.toFixed(1);
    }

    function JournalBadge({ name, quartile, impactFactor, compact = false }) {
      const journal = name || 'Unknown journal';
      const q = String(quartile || '').toUpperCase();
      return h(
        'span',
        {
          className: `lit-journal-badge${q ? ` lit-journal-${q.toLowerCase()}` : ' lit-journal-neutral'}${compact ? ' lit-journal-compact' : ''}`,
          title: `${journal}${q ? ` · ${q}` : ''}`,
        },
        h('span', { className: 'lit-journal-name' }, journal),
        q ? h('span', { className: 'lit-journal-quartile' }, q) : null,
        h(
          'span',
          { className: impactFactor === null || impactFactor === undefined ? 'lit-if-tag lit-if-missing' : 'lit-if-tag' },
          `IF: ${formatImpactFactor(impactFactor)}`
        )
      );
    }

    function Field({ label, hint, badge, children }) {
      return h(
        'div',
        { className: 'lit-field' },
        h(
          'div',
          { className: 'lit-field-head' },
          h('div', { className: 'lit-field-label' }, label),
          badge ? h('span', { className: 'lit-soft-badge' }, badge) : null,
          hint ? h('div', { className: 'lit-field-hint' }, hint) : null
        ),
        children
      );
    }

    function PaperRow({ paper, active, selected, groups, snippet, onSelect, onContextMenu, onCheck }) {
      const classes = ['lit-paper-row'];
      if (active) classes.push('lit-paper-row-active');
      if (selected) classes.push('lit-paper-row-selected');
      return h(
        'div',
        {
          className: classes.join(' '),
          role: 'button',
          tabIndex: 0,
          onClick: onSelect,
          onContextMenu,
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(event);
            }
          },
        },
        h(
          'div',
          { className: 'lit-paper-row-check' },
          h('input', {
            type: 'checkbox',
            checked: selected,
            'aria-label': `选择 ${paper.title}`,
            onClick: (event) => event.stopPropagation(),
            onChange: (event) => onCheck(event.target.checked),
          })
        ),
        h(
          'div',
          { className: 'lit-paper-row-main' },
          h('div', { className: 'lit-paper-row-title' }, paper.title),
          h(
            'div',
            { className: 'lit-paper-row-meta' },
            `${paper.authors} · ${paper.year || '—'}`
          ),
          paper.venue
            ? h(
                'div',
                { className: 'lit-paper-row-journal' },
                h(JournalBadge, {
                  name: paper.venue,
                  quartile: paper.jcrQuartile,
                  impactFactor: paper.impactFactor,
                  compact: true,
                })
              )
            : null,
          snippet ? h('div', { className: 'lit-paper-row-snippet' }, snippet.replace(/<\/?mark>/g, '')) : null,
          h(
            'div',
            { className: 'lit-paper-row-bottom' },
            h(
              'div',
              { className: 'lit-chip-row' },
              (paper.groups || []).map((groupId) =>
                groups[groupId] ? h(GroupChip, { key: groupId, group: groups[groupId], small: true }) : null
              )
            ),
            !paper.pdfPath || paper.pageCount === 0
              ? h('span', { className: 'lit-soft-badge lit-meta-only' }, '仅元数据')
              : null,
            h(
              'span',
              {
                className:
                  paper.status === '已总结'
                    ? 'lit-mini-status ok'
                    : paper.status === 'AI 总结'
                      ? 'lit-mini-status ai-summary'
                      : paper.status === 'AI 草稿'
                        ? 'lit-mini-status ai'
                        : 'lit-mini-status muted',
              },
              paper.status
            )
          )
        )
      );
    }

    function EvidencePanel({ paper, finding, onClose, onOpen, onCopy, real }) {
      if (!paper || !finding) return null;
      const quote = finding.quote || '（这条结论还没有关联原文。）';
      const widths = [86, 72, 92, 64, 88, 76];
      return h(
        'aside',
        { className: 'lit-evidence' },
        h(
          'div',
          { className: 'lit-evidence-head' },
          h(
            'div',
            null,
            h('div', { className: 'lit-eyebrow' }, '原文证据'),
            h('div', { className: 'lit-evidence-page' }, finding.page ? `p.${finding.page}` : '未定位')
          ),
          h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭证据面板', onClick: onClose }, h(Icon, { name: 'x', size: 15 }))
        ),
        h(
          'div',
          { className: 'lit-evidence-meta' },
          h('span', { className: 'lit-soft-badge' }, '本地 PDF'),
          h('span', null, finding.section || '未标注章节'),
          h('span', null, finding.bbox ? `bbox [${finding.bbox.join(', ')}]` : 'bbox 未记录')
        ),
        h(
          'div',
          { className: 'lit-pdf-sim' },
          h('div', { className: 'lit-pdf-sim-top' }, `PDF · page ${finding.page || '?'}`),
          h(
            'div',
            { className: 'lit-pdf-sim-body' },
            widths.map((w, i) => h('div', { key: i, className: 'lit-pdf-line', style: { width: `${w}%` } })),
            h('div', { className: 'lit-pdf-highlight' }, quote),
            widths.map((w, i) => h('div', { key: `b${i}`, className: 'lit-pdf-line', style: { width: `${Math.max(48, w - 10)}%` } }))
          )
        ),
        h('div', { className: 'lit-quote-full' }, `“${quote}”`),
        h(
          'div',
          { className: 'lit-evidence-actions' },
          h('button', { className: 'lit-btn lit-btn-ghost', type: 'button', onClick: onOpen }, h(Icon, { name: 'external', size: 14 }), '打开 PDF'),
          h('button', { className: 'lit-btn lit-btn-ghost', type: 'button', onClick: onCopy }, h(Icon, { name: 'copy', size: 14 }), '复制引用')
        ),
        h(
          'div',
          { className: 'lit-evidence-note' },
          '页码和 bbox 来自 PDF 文本层；预览为简化页面，不是 PDF 渲染。'
        )
      );
    }

    function ManualEvidenceModal({ target, onClose, onSave }) {
      const [quote, setQuote] = useState(target?.quote || '');
      const [page, setPage] = useState(target?.page ? String(target.page) : '');
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-confirm-modal', role: 'dialog', 'aria-modal': 'true' },
          h(
            'div',
            { className: 'lit-modal-head' },
            h(
              'div',
              null,
              h('div', { className: 'lit-eyebrow' }, '引用证据'),
              h('h2', { className: 'lit-modal-title' }, '手动添加证据'),
              h('div', { className: 'lit-modal-sub', style: { margin: '6px 0 0' } }, '粘贴原文片段并填写页码；系统不会自动改写这段引文。')
            ),
            h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭', onClick: onClose }, h(Icon, { name: 'x', size: 16 }))
          ),
          h('label', { className: 'lit-field-label' }, '原文片段'),
          h('textarea', {
            className: 'lit-textarea',
            rows: 5,
            value: quote,
            placeholder: '粘贴原文中逐字连续的英文片段',
            onChange: (event) => setQuote(event.target.value),
          }),
          h('label', { className: 'lit-field-label', style: { marginTop: '10px' } }, '页码'),
          h('input', {
            className: 'lit-input',
            type: 'number',
            min: '1',
            value: page,
            placeholder: '可选',
            onChange: (event) => setPage(event.target.value),
          }),
          h(
            'div',
            { className: 'lit-modal-actions' },
            h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onClose }, '取消'),
            h(
              'button',
              {
                type: 'button',
                className: 'lit-btn lit-btn-primary',
                disabled: !quote.trim(),
                onClick: () => onSave({ quote: quote.trim(), page: page ? Number(page) : null }),
              },
              '保存证据'
            )
          )
        )
      );
    }

    function TranslationBar({ busy, error, mode, count, onMode, onClose, onRetry }) {
      const modeButton = (id, label) =>
        h(
          'button',
          {
            type: 'button',
            className: mode === id ? 'lit-btn lit-btn-primary' : 'lit-btn lit-btn-ghost',
            onClick: () => onMode(id),
            disabled: busy,
          },
          label
        );
      return h(
        'div',
        { className: 'lit-translation-bar', role: 'region', 'aria-label': '页面翻译' },
        h(
          'div',
          { className: 'lit-translation-bar-title' },
          h(Icon, { name: 'sparkles', size: 14 }),
          h('span', null, busy ? '正在原位翻译…' : `页面已翻译 ${count} 段`)
        ),
        error ? h('span', { className: 'lit-translation-bar-error' }, `翻译失败：${error}`) : null,
        h(
          'div',
          { className: 'lit-translation-modes' },
          modeButton('original', '原文'),
          modeButton('translated', '译文'),
          modeButton('bilingual', '双语')
        ),
        h(
          'div',
          { className: 'lit-translation-actions' },
          h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onRetry, disabled: busy }, '重新翻译'),
          h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onClose, disabled: busy }, '关闭')
        )
      );
    }

    function SynthesisModal({ papers, onClose, onCopy, onExport }) {
      const primaryEntry = (paper) => {
        const section = firstTextSection(paper, ['findings', 'core-claim']);
        return section && section.entries.length ? section.entries[0] : null;
      };
      const ratingSummary = (paper) => {
        const ratings = (paper.summary.sections || []).filter((section) => section.type === 'rating' && Number(section.value) > 0);
        return ratings.length ? ratings.map((section) => `${section.title} ${section.value}/${section.max || 5}`).join(' · ') : '未评分';
      };
      const rows = [
        {
          label: '核心机制',
          value: (paper) => {
            const entry = primaryEntry(paper);
            return entry ? entry.text : '未总结';
          },
        },
        {
          label: '关键证据',
          value: (paper) => {
            const entry = primaryEntry(paper);
            if (!entry) return '—';
            return `${entry.page ? `p.${entry.page} · ` : ''}${entry.quote ? `“${entry.quote}”` : '未关联原文'}`;
          },
        },
        {
          label: '评分',
          value: (paper) => ratingSummary(paper),
        },
        {
          label: '主要局限',
          value: (paper) => {
            const section = (paper.summary.sections || []).find((item) => item.key === 'limitations');
            const entry = section && section.entries && section.entries[0];
            return entry && entry.text ? entry.text : '未报告';
          },
        },
      ];
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'lit-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '范围汇总' },
          h(
            'div',
            { className: 'lit-modal-head' },
            h(
              'div',
              null,
              h('div', { className: 'lit-eyebrow' }, '范围汇总'),
              h('h2', { className: 'lit-modal-title' }, `${papers.length} 篇论文的证据矩阵`)
            ),
            h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭', onClick: onClose }, h(Icon, { name: 'x', size: 16 }))
          ),
          h('p', { className: 'lit-modal-sub' }, '这是交互原型：汇总表格由本地演示数据拼出。接入服务后，这一步由 DSH Agent 在 scope 内生成，并逐条回填 locator。'),
          papers.length === 0
            ? h('div', { className: 'lit-empty' }, '还没有选中论文。')
            : h(
                'div',
                { className: 'lit-matrix-wrap' },
                h(
                  'table',
                  { className: 'lit-matrix' },
                  h(
                    'thead',
                    null,
                    h(
                      'tr',
                      null,
                      h('th', null, '主题'),
                      papers.map((paper) => h('th', { key: paper.id, title: paper.title }, paper.title.length > 30 ? `${paper.title.slice(0, 30)}…` : paper.title))
                    )
                  ),
                  h(
                    'tbody',
                    null,
                    rows.map((row) =>
                      h(
                        'tr',
                        { key: row.label },
                        h('th', null, row.label),
                        papers.map((paper) => h('td', { key: paper.id }, row.value(paper)))
                      )
                    )
                  )
                )
              ),
          h(
            'div',
            { className: 'lit-modal-actions' },
            h('button', { className: 'lit-btn lit-btn-ghost', type: 'button', onClick: onExport, disabled: papers.length === 0 }, h(Icon, { name: 'download', size: 14 }), '导出 RIS'),
            h('button', { className: 'lit-btn lit-btn-primary', type: 'button', onClick: onCopy, disabled: papers.length === 0 }, h(Icon, { name: 'copy', size: 14 }), '复制分析指令'),
            h('button', { className: 'lit-btn lit-btn-ghost', type: 'button', onClick: onClose }, '关闭')
          )
        )
      );
    }

    function GroupManagerModal({ groups, counts, templates, onClose, onCreate, onRename, onRecolor, onDelete, onMove }) {
      const [newName, setNewName] = useState('');
      const randomColor = () => {
        const palettes = ['#7fe0b0', '#8fb8ff', '#f5c451', '#c8b6ff', '#ff9f9f', '#72d4d4', '#f0a6ca', '#b6d772'];
        return palettes[Math.floor(Math.random() * palettes.length)];
      };
      const [newColor, setNewColor] = useState(() => randomColor());
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-group-manager', role: 'dialog', 'aria-modal': 'true', 'aria-label': '管理分组' },
          h(
            'div',
            { className: 'lit-modal-head' },
            h(
              'div',
              null,
              h('div', { className: 'lit-eyebrow' }, '分组管理'),
              h('h2', { className: 'lit-modal-title' }, '管理分组标签'),
              h('div', { className: 'lit-modal-sub', style: { margin: '6px 0 0' } }, '改名、换颜色、删除，或新建一个分组。删除分组不会删除论文。')
            ),
            h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭', onClick: onClose }, h(Icon, { name: 'x', size: 16 }))
          ),
          h(
            'div',
            { className: 'lit-group-manager-list' },
            groups.map((group) =>
              h(
                'div',
                { key: group.id, className: 'lit-group-manager-row' },
                h(
                  'div',
                  { className: 'lit-group-move' },
                  h('button', { type: 'button', className: 'lit-icon-btn', title: '上移', onClick: () => onMove(group.id, -1) }, '↑'),
                  h('button', { type: 'button', className: 'lit-icon-btn', title: '下移', onClick: () => onMove(group.id, 1) }, '↓')
                ),
                h('input', {
                  type: 'color',
                  className: 'lit-color-input',
                  value: group.color,
                  title: '分组颜色',
                  onChange: (event) => onRecolor(group.id, event.target.value),
                }),
                h('input', {
                  className: 'lit-input',
                  value: group.name,
                  'aria-label': '分组名称',
                  onChange: (event) => onRename(group.id, event.target.value),
                }),
                h('span', { className: 'lit-group-manager-meta' }, `${counts[group.id] || 0} 篇 · ${(templates[group.id] || []).length} 个大类`),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lit-icon-btn',
                    title: '删除分组',
                    onClick: () => onDelete(group.id),
                  },
                  h(Icon, { name: 'trash', size: 14 })
                )
              )
            )
          ),
          h(
            'div',
            { className: 'lit-group-manager-new' },
            h('div', { className: 'lit-control-label' }, '新建分组'),
            h(
              'div',
              { className: 'lit-inline-form' },
              h('input', {
                type: 'color',
                className: 'lit-color-input',
                value: newColor,
                title: '新分组颜色',
                onChange: (event) => setNewColor(event.target.value),
              }),
              h('input', {
                className: 'lit-input',
                value: newName,
                placeholder: '分组名称',
                'aria-label': '新分组名称',
                onChange: (event) => setNewName(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' && newName.trim()) {
                    onCreate(newName.trim(), newColor);
                    setNewName('');
                    setNewColor(randomColor());
                  }
                },
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'lit-btn lit-btn-primary',
                  disabled: !newName.trim(),
                  onClick: () => {
                    onCreate(newName.trim(), newColor);
                    setNewName('');
                    setNewColor(randomColor());
                  },
                },
                h(Icon, { name: 'plus', size: 13 }),
                '创建'
              )
            )
          ),
          h(
            'div',
            { className: 'lit-modal-actions' },
            h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onClose }, '完成')
          )
        )
      );
    }

    function FeedModal({ feeds, items, loading, url, onUrlChange, onAdd, onRefresh, onToggleRead, onSave, onClose }) {
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-feed-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '订阅' },
          h(
            'div',
            { className: 'lit-modal-head' },
            h(
              'div',
              null,
              h('div', { className: 'lit-eyebrow' }, 'FEEDS · RSS / ATOM'),
              h('h2', { className: 'lit-modal-title' }, '订阅'),
              h('div', { className: 'lit-modal-sub', style: { margin: '6px 0 0' } }, '订阅 RSS / Atom；更新后点“存入库”，有 PDF 就导入 PDF，否则保存元数据。')
            ),
            h(
              'div',
              { className: 'lit-pdf-modal-actions' },
              h(
                'button',
                { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onRefresh, disabled: loading },
                h(Icon, { name: 'refresh', size: 12 }),
                loading ? '刷新中…' : '全部刷新'
              ),
              h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭', onClick: onClose }, h(Icon, { name: 'x', size: 16 }))
            )
          ),
          h(
            'div',
            { className: 'lit-feed-add' },
            h('input', {
              className: 'lit-input',
              value: url,
              onChange: (event) => onUrlChange(event.target.value),
              placeholder: 'https://rss.arxiv.org/rss/cs.CL 或 bioRxiv RSS',
              'aria-label': 'RSS 地址',
              onKeyDown: (event) => {
                if (event.key === 'Enter') onAdd();
              },
            }),
            h(
              'button',
              { type: 'button', className: 'lit-btn lit-btn-primary', onClick: onAdd, disabled: loading },
              h(Icon, { name: 'plus', size: 12 }),
              '订阅'
            )
          ),
          h(
            'div',
            { className: 'lit-feed-list' },
            feeds.map((feed) =>
              h(
                'div',
                { key: feed.id, className: 'lit-feed-source-row' },
                h('span', { className: 'lit-feed-source-name' }, feed.title),
                h('span', { className: 'lit-feed-source-meta' }, `${feed.unread_count || 0} 未读 / ${feed.item_count || 0}`),
                feed.last_error ? h('span', { className: 'lit-feed-source-error' }, feed.last_error) : null
              )
            )
          ),
          h(
            'div',
            { className: 'lit-feed-items' },
            items.length === 0
              ? h('div', { className: 'lit-discovery-empty' }, '还没有订阅内容。添加 RSS / Atom 后点“全部刷新”。')
              : items.map((item) =>
                  h(
                    'article',
                    { key: item.id, className: item.read ? 'lit-feed-item lit-feed-item-read' : 'lit-feed-item' },
                    h('div', { className: 'lit-feed-item-title' }, item.title),
                    h(
                      'div',
                      { className: 'lit-feed-item-meta' },
                      `${item.feed_title || 'Feed'}${item.authors ? ` · ${item.authors}` : ''}${item.published_at ? ` · ${String(item.published_at).slice(0, 10)}` : ''}`
                    ),
                    item.summary ? h('div', { className: 'lit-feed-item-summary' }, item.summary) : null,
                    h(
                      'div',
                      { className: 'lit-feed-item-actions' },
                      item.link
                        ? h(
                            'a',
                            { href: item.link, target: '_blank', rel: 'noreferrer', className: 'lit-link-btn' },
                            '打开来源'
                          )
                        : null,
                      h(
                        'button',
                        { type: 'button', className: 'lit-link-btn', onClick: () => onToggleRead(item) },
                        item.read ? '标为未读' : '标为已读'
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'lit-btn lit-btn-ghost',
                          onClick: () => onSave(item),
                          disabled: loading || item.saved,
                        },
                        h(Icon, { name: item.saved ? 'check' : 'download', size: 12 }),
                        item.saved ? '已入库' : '存入库'
                      )
                    )
                  )
                )
          )
        )
      );
    }

    function AiScoreModal({ limit, busy, onLimit, onRun, onClose }) {
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && !busy) onClose();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-ai-score-modal', role: 'dialog', 'aria-modal': 'true' },
          h(
            'div',
            { className: 'lit-modal-head' },
            h(
              'div',
              null,
              h('div', { className: 'lit-eyebrow' }, 'AI TRACKING · NOVELTY'),
              h('h2', { className: 'lit-modal-title' }, 'AI 评分'),
              h('div', { className: 'lit-modal-sub', style: { margin: '6px 0 0' } }, '只评分尚未评分的 RSS 条目；每批最多 20 条。')
            ),
            h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭', onClick: onClose, disabled: busy }, h(Icon, { name: 'x', size: 16 }))
          ),
          h(
            'div',
            { className: 'lit-settings-note' },
            '按通用新颖性标准评分，不使用个人研究画像。没有摘要的条目仍可给高分，但会降低置信度并在理由里注明信息有限。'
          ),
          h(
            'div',
            { className: 'lit-ai-score-options' },
            h('label', { className: 'lit-field-label' }, '每批条数'),
            h('input', {
              className: 'lit-input',
              type: 'number',
              min: '1',
              max: '30',
              value: limit,
              onChange: (event) => onLimit(Number(event.target.value) || 20),
            })
          ),
          h(
            'div',
            { className: 'lit-settings-note' },
            '评分会调用当前 DSH 默认模型，消耗 token。5 星 = 新机制/新元件；资源型最高 2 星；新闻/评论最高 1 星。'
          ),
          h(
            'div',
            { className: 'lit-modal-actions' },
            h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onClose, disabled: busy }, '取消'),
            h(
              'button',
              { type: 'button', className: 'lit-btn lit-btn-primary', onClick: onRun, disabled: busy },
              h(Icon, { name: 'sparkles', size: 13 }),
              busy ? '评分中…' : '开始评分'
            )
          )
        )
      );
    }

    function AiSearchModal({ onClose, inline = false }) {
      const [saved] = useState(() => readStoredJson(AI_SEARCH_STORAGE_KEY, {}));
      const [query, setQuery] = useState(typeof saved.query === 'string' ? saved.query : '');
      const [results, setResults] = useState(Array.isArray(saved.results) ? saved.results : []);
      const [searchPage, setSearchPage] = useState(Number(saved.page) || 1);
      const [hasMore, setHasMore] = useState(Boolean(saved.hasMore));
      const [loadingMore, setLoadingMore] = useState(false);
      const [searchTask, setSearchTask] = useState(saved.searchTaskId || '');
      const [loading, setLoading] = useState(Boolean(saved.searchTaskId));
      const [error, setError] = useState('');
      const [message, setMessage] = useState('');
      const [savedIds, setSavedIds] = useState(Array.isArray(saved.savedIds) ? saved.savedIds : []);
      const [excludeExisting, setExcludeExisting] = useState(Boolean(saved.excludeExisting));
      const [sources, setSources] = useState(
        Array.isArray(saved.sources) && saved.sources.length
          ? saved.sources
          : ['europepmc', 'biorxiv', 'arxiv', 'openalex', 'crossref', 'semanticscholar']
      );
      const [elapsed, setElapsed] = useState(0);
      const [mode, setMode] = useState('topic');
      const [authorName, setAuthorName] = useState('');
      const [authorInstitution, setAuthorInstitution] = useState('');
      const [authorFromYear, setAuthorFromYear] = useState(String(new Date().getFullYear() - 6));
      const [authorLoading, setAuthorLoading] = useState(false);
      const [authorCandidates, setAuthorCandidates] = useState([]);
      const [authorAffiliation, setAuthorAffiliation] = useState(null);
      const [selectedAuthor, setSelectedAuthor] = useState(null);
      const [authorWorks, setAuthorWorks] = useState([]);
      const abortRef = useRef(null);
      const stages = ['拆解需求、生成检索式', '检索多个学术来源', '去重并筛选候选', 'AI 生成摘要卡片'];
      useEffect(() => {
        if (!loading) return undefined;
        const started = Date.now();
        const timer = window.setInterval(() => {
          setElapsed(Math.floor((Date.now() - started) / 1000));
        }, 1000);
        return () => window.clearInterval(timer);
      }, [loading]);
      const stageIndex = Math.min(stages.length - 1, Math.floor(elapsed / 8));
      useEffect(() => {
        writeStoredJson(AI_SEARCH_STORAGE_KEY, {
          query,
          results,
          sources,
          page: searchPage,
          hasMore,
          searchTaskId: searchTask,
          savedIds,
          excludeExisting,
        });
      }, [query, results, sources, searchPage, hasMore, searchTask, savedIds, excludeExisting]);
      useEffect(() => {
        if (!searchTask) return undefined;
        let cancelled = false;
        const poll = async () => {
          try {
            const response = await fetch(
              `${LIT_DEMO_API_BASE}/api/ai-search/status?id=${encodeURIComponent(searchTask)}`
            );
            const body = await response.json();
            if (cancelled) return;
            if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
            setElapsed(body.elapsed || 0);
            if (body.status === 'done') {
              const cards = body.cards || [];
              setResults(cards);
              setSearchPage(1);
              setHasMore(Boolean(body.hasMore));
              setSearchTask('');
              setLoading(false);
              writeStoredJson(AI_SEARCH_STORAGE_KEY, {
                query,
                results: cards,
                sources,
                page: 1,
                hasMore: Boolean(body.hasMore),
                searchTaskId: '',
              });
              if (!cards.length) setMessage('没有找到相关候选，可以换一个更具体的需求。');
            } else if (body.status === 'failed' || body.status === 'cancelled') {
              setSearchTask('');
              setLoading(false);
              if (body.status === 'failed') setError(body.error || '检索失败');
              else setMessage('已取消本次检索。');
            }
          } catch (error) {
            if (cancelled) return;
            setSearchTask('');
            setLoading(false);
            setError(error.message);
          }
        };
        poll();
        const timer = window.setInterval(poll, 1000);
        return () => {
          cancelled = true;
          window.clearInterval(timer);
        };
      }, [searchTask]);
      const sourceOptions = [
        ['europepmc', 'Europe PMC'],
        ['biorxiv', 'bioRxiv'],
        ['arxiv', 'arXiv'],
        ['openalex', 'OpenAlex'],
        ['crossref', 'Crossref'],
        ['semanticscholar', 'Semantic Scholar'],
      ];
      const toggleSource = (id) => {
        setSources((current) =>
          current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
        );
      };
      const run = async () => {
        const clean = query.trim();
        if (!clean) return;
        setElapsed(0);
        setResults([]);
        setSearchPage(1);
        setHasMore(false);
        setLoading(true);
        setElapsed(0);
        setResults([]);
        setSearchPage(1);
        setHasMore(false);
        setError('');
        setMessage('');
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/ai-search/start`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: clean, sources, page: 1, excludeExisting }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setSearchTask(body.id || '');
          writeStoredJson(AI_SEARCH_STORAGE_KEY, {
            query: clean,
            results: [],
            sources,
            page: 1,
            hasMore: false,
            searchTaskId: body.id || '',
          });
        } catch (error) {
          setError(error.message);
          setLoading(false);
        }
      };
      const loadMore = async () => {
        if (loadingMore || loading || !hasMore || !query.trim()) return;
        setLoadingMore(true);
        setError('');
        try {
          const nextPage = searchPage + 1;
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/ai-search`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: query.trim(), sources, page: nextPage, excludeExisting }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          const existing = new Set(results.map((item) => item.id));
          const appended = (body.cards || []).filter((item) => !existing.has(item.id));
          const nextResults = [...results, ...appended];
          setResults(nextResults);
          setSearchPage(nextPage);
          setHasMore(Boolean(body.hasMore) && appended.length > 0);
          writeStoredJson(AI_SEARCH_STORAGE_KEY, {
            query: query.trim(),
            results: nextResults,
            sources,
            page: nextPage,
            hasMore: Boolean(body.hasMore) && appended.length > 0,
          });
          if (!appended.length) setMessage('没有更多新的结果了。');
        } catch (error) {
          setError(error.message);
        } finally {
          setLoadingMore(false);
        }
      };
      const cancel = () => {
        const taskId = searchTask;
        setSearchTask('');
        setLoading(false);
        setMessage('已取消本次检索。');
        writeStoredJson(AI_SEARCH_STORAGE_KEY, {
          query,
          results,
          sources,
          page: searchPage,
          hasMore,
          searchTaskId: '',
        });
        if (taskId) {
          fetch(`${LIT_DEMO_API_BASE}/api/ai-search/cancel`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: taskId }),
          }).catch(() => {});
        }
      };
      const searchAuthor = async () => {
        const name = authorName.trim();
        if (!name) return;
        setAuthorLoading(true);
        setError('');
        setMessage('');
        setAuthorCandidates([]);
        setAuthorAffiliation(null);
        setSelectedAuthor(null);
        setAuthorWorks([]);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/author-search`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              name,
              institution: authorInstitution.trim(),
              fromYear: Number(authorFromYear),
            }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setAuthorCandidates(body.authors || []);
          setAuthorAffiliation(body.institution || null);
          if (!(body.authors || []).length) setMessage('没有匹配到作者，可以改用英文姓名或更完整的单位名。');
        } catch (error) {
          setError(error.message);
        } finally {
          setAuthorLoading(false);
        }
      };
      const openAuthor = async (author) => {
        setSelectedAuthor(author);
        setAuthorWorks([]);
        setAuthorLoading(true);
        setError('');
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/author-works`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ authorId: author.id, fromYear: Number(authorFromYear) }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setAuthorWorks(body.works || []);
          if (!(body.works || []).length) setMessage('该作者在指定年份范围内没有可检索的论文。');
        } catch (error) {
          setError(error.message);
        } finally {
          setAuthorLoading(false);
        }
      };
      const save = async (card) => {
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/discover/import-metadata`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              title: card.title,
              authors: card.authors,
              abstract: card.abstract,
              venue: card.journal,
              doi: card.doi,
              year: card.year,
              source_url: card.url,
            }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setSavedIds((current) => (current.includes(card.id) ? current : [...current, card.id]));
          setMessage(`已存入库：${card.title.slice(0, 50)}`);
        } catch (error) {
          setError(`存入库失败：${error.message}`);
        }
      };
      const panel = h(
          'div',
          { className: inline ? 'lit-ai-search-page' : 'lit-modal lit-ai-search-modal', role: 'dialog', 'aria-modal': 'true' },
          h(
            'div',
            { className: 'lit-modal-head' },
            h(
              'div',
              null,
              h('div', { className: 'lit-eyebrow' }, 'AI SEARCH · DIGEST'),
              h('h2', { className: 'lit-modal-title' }, 'AI 检索'),
              h('div', { className: 'lit-modal-sub', style: { margin: '6px 0 0' } }, '按研究需求检索 arXiv / Europe PMC，再由 AI 整理成可阅读卡片。')
            ),
            inline ? null : h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭', onClick: onClose }, h(Icon, { name: 'x', size: 16 }))
          ),
          h(
            'div',
            { className: 'lit-ai-sources' },
            h('span', { className: 'lit-field-label' }, '检索来源'),
            sourceOptions.map(([id, label]) =>
              h(
                'label',
                { key: id, className: sources.includes(id) ? 'lit-ai-source lit-ai-source-on' : 'lit-ai-source' },
                h('input', {
                  type: 'checkbox',
                  checked: sources.includes(id),
                  onChange: () => toggleSource(id),
                }),
                label
              )
            ),
            h(
              'label',
              { className: excludeExisting ? 'lit-ai-source lit-ai-source-on' : 'lit-ai-source' },
              h('input', {
                type: 'checkbox',
                checked: excludeExisting,
                onChange: (event) => setExcludeExisting(event.target.checked),
              }),
              '过滤库中已有'
            )
          ),
          h(
            'div',
            { className: 'lit-ai-search-form' },
            h('textarea', {
              className: 'lit-textarea',
              value: query,
              onChange: (event) => setQuery(event.target.value),
              placeholder: '输入研究问题、关键词或需要追踪的方向…',
              rows: 3,
              onKeyDown: (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') run();
              },
            }),
            h(
              'button',
              { type: 'button', className: 'lit-btn lit-btn-primary', onClick: run, disabled: loading || !query.trim() || sources.length === 0 },
              h(Icon, { name: 'sparkles', size: 13 }),
              loading ? `检索中 ${elapsed}s` : '检索并总结'
            )
          ),
          h('div', { className: 'lit-settings-note' }, '会调用两次模型（检索整理 + 卡片总结），结果不会自动入库。'),
          error ? h('div', { className: 'lit-settings-error' }, error) : null,
          message ? h('div', { className: 'lit-settings-note' }, message) : null,
          loading
            ? h(
                'div',
                { className: 'lit-ai-progress' },
                h('div', { className: 'lit-ai-progress-head' },
                  h('span', { className: 'lit-spinner' }),
                  h('strong', null, `正在检索 · ${elapsed} 秒`),
                  h('span', { className: 'lit-ai-progress-hint' }, `${sources.length} 个来源，通常需要 10–40 秒`),
                  h('button', { type: 'button', className: 'lit-link-btn', onClick: cancel }, '取消')
                ),
                h('div', { className: 'lit-ai-stage-row' },
                  stages.map((stage, index) =>
                    h(
                      'div',
                      {
                        key: stage,
                        className:
                          index < stageIndex
                            ? 'lit-ai-stage lit-ai-stage-done'
                            : index === stageIndex
                              ? 'lit-ai-stage lit-ai-stage-active'
                              : 'lit-ai-stage',
                      },
                      h('span', { className: 'lit-ai-stage-dot' }),
                      stage
                    )
                  )
                )
              )
            : null,
          !loading && results.length
            ? h('div', { className: 'lit-ai-result-count' }, `已生成 ${results.length} 张卡片 · 用时 ${elapsed} 秒`)
            : null,
          h(
            'div',
            { className: 'lit-ai-search-results' },
            loading
              ? [0, 1, 2].map((index) =>
                  h('div', { key: index, className: 'lit-ai-skeleton' },
                    h('div', { className: 'lit-ai-skeleton-line lit-ai-skeleton-title' }),
                    h('div', { className: 'lit-ai-skeleton-line' }),
                    h('div', { className: 'lit-ai-skeleton-line' }),
                    h('div', { className: 'lit-ai-skeleton-line lit-ai-skeleton-short' })
                  )
                )
              : results.map((card) =>
              h(
                'article',
                {
                  key: card.id,
                  className: savedIds.includes(card.id) ? 'lit-feed-card lit-feed-card-saved' : 'lit-feed-card',
                },
                h(
                  'div',
                  { className: 'lit-feed-card-top' },
                  h('span', { className: 'lit-feed-kind lit-feed-kind-paper' }, card.source || 'AI'),
                  h('span', { className: 'lit-ai-stars' }, '★'.repeat(card.stars || 1) + '☆'.repeat(5 - (card.stars || 1)))
                ),
                h('div', { className: 'lit-feed-card-title' }, card.title),
                h(
                  'div',
                  { className: 'lit-feed-card-source' },
                  `${card.journal || ''}${card.year ? ` · ${card.year}` : ''}${card.authors ? ` · ${card.authors.slice(0, 80)}` : ''}`
                ),
                h('div', { className: 'lit-feed-card-summary' }, card.summary),
                card.why_relevant ? h('div', { className: 'lit-ai-score-reason' }, `相关性：${card.why_relevant}`) : null,
                card.tags?.length
                  ? h(
                      'div',
                      { className: 'lit-chip-row' },
                      card.tags.map((tag) => h('span', { key: tag, className: 'lit-soft-badge' }, tag))
                    )
                  : null,
                h(
                  'div',
                  { className: 'lit-feed-card-foot' },
                  card.url
                    ? h('a', { className: 'lit-link-btn', href: card.url, target: '_blank', rel: 'noreferrer' }, '打开来源')
                    : null,
                  savedIds.includes(card.id)
                    ? h('span', { className: 'lit-saved-badge' }, '已入库')
                    : h('button', { type: 'button', className: 'lit-feed-detail-btn', onClick: () => save(card) }, '存入库')
                )
              )
            )
          ),
          !loading && results.length
            ? h(
                'div',
                { className: 'lit-ai-loadmore' },
                hasMore
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'lit-btn lit-btn-ghost',
                        onClick: loadMore,
                        disabled: loadingMore,
                      },
                      loadingMore ? '加载中…' : '加载更多'
                    )
                  : h('span', { className: 'lit-ai-loadmore-end' }, '没有更多结果')
              )
            : null
      );
      if (inline) return panel;
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && !loading) onClose();
          },
        },
        panel
      );
    }

    function AuthorSearchPage() {
      const [saved] = useState(() => readStoredJson(AUTHOR_SEARCH_STORAGE_KEY, {}));
      const [name, setName] = useState(typeof saved.name === 'string' ? saved.name : '');
      const [institution, setInstitution] = useState(typeof saved.institution === 'string' ? saved.institution : '');
      const [fromYear, setFromYear] = useState(
        typeof saved.fromYear === 'string' ? saved.fromYear : String(new Date().getFullYear() - 6)
      );
      const [loading, setLoading] = useState(false);
      const [summaryTask, setSummaryTask] = useState(saved.summaryTaskId || '');
      const [summaryLoading, setSummaryLoading] = useState(Boolean(saved.summaryTaskId));
      const [summaryProgress, setSummaryProgress] = useState(0);
      const [summaryDone, setSummaryDone] = useState(0);
      const [summaryTotal, setSummaryTotal] = useState(0);
      const [candidates, setCandidates] = useState(Array.isArray(saved.candidates) ? saved.candidates : []);
      const [affiliation, setAffiliation] = useState(saved.affiliation || null);
      const [selected, setSelected] = useState(saved.selected || null);
      const [works, setWorks] = useState(Array.isArray(saved.works) ? saved.works : []);
      const [savedIds, setSavedIds] = useState(Array.isArray(saved.savedIds) ? saved.savedIds : []);
      const [excludeExisting, setExcludeExisting] = useState(Boolean(saved.excludeExisting));
      const [error, setError] = useState('');
      const [message, setMessage] = useState('');

      useEffect(() => {
        writeStoredJson(AUTHOR_SEARCH_STORAGE_KEY, {
          name,
          institution,
          fromYear,
          candidates,
          affiliation,
          selected,
          works,
          savedIds,
          excludeExisting,
          summaryTaskId: summaryTask,
        });
      }, [name, institution, fromYear, candidates, affiliation, selected, works, savedIds, excludeExisting, summaryTask]);

      useEffect(() => {
        if (!summaryTask) return undefined;
        let cancelled = false;
        const poll = async () => {
          try {
            const response = await fetch(
              `${LIT_DEMO_API_BASE}/api/author-digest/status?id=${encodeURIComponent(summaryTask)}`
            );
            const body = await response.json();
            if (cancelled) return;
            if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
            setSummaryProgress(body.elapsed || 0);
            setSummaryDone(body.done || 0);
            setSummaryTotal(body.total || 0);
            if (body.status === 'done') {
              const nextWorks = body.works || works;
              setWorks(nextWorks);
              setMessage(`AI 已总结 ${nextWorks.length} 篇论文。`);
              setSummaryTask('');
              setSummaryLoading(false);
              writeStoredJson(AUTHOR_SEARCH_STORAGE_KEY, {
                name,
                institution,
                fromYear,
                candidates,
                affiliation,
                selected,
                works: nextWorks,
                summaryTaskId: '',
              });
            } else if (body.status === 'failed') {
              setError(`AI 总结失败：${body.error || 'unknown'}`);
              setSummaryTask('');
              setSummaryLoading(false);
            }
          } catch (error) {
            if (cancelled) return;
            setError(`AI 总结状态获取失败：${error.message}`);
            setSummaryTask('');
            setSummaryLoading(false);
          }
        };
        poll();
        const timer = window.setInterval(poll, 1000);
        return () => {
          cancelled = true;
          window.clearInterval(timer);
        };
      }, [summaryTask]);

      const search = async () => {
        if (!name.trim()) return;
        setLoading(true);
        setError('');
        setMessage('');
        setCandidates([]);
        setAffiliation(null);
        setSelected(null);
        setWorks([]);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/author-search`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), institution: institution.trim(), fromYear: Number(fromYear) }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setCandidates(body.authors || []);
          setAffiliation(body.institution || null);
          if (!(body.authors || []).length) setMessage('没有匹配到作者，可以改用英文姓名，或填写更完整的单位名。');
        } catch (error) {
          setError(error.message);
        } finally {
          setLoading(false);
        }
      };

      const openAuthor = async (author) => {
        setSelected(author);
        setWorks([]);
        setLoading(true);
        setError('');
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/author-works`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ authorId: author.id, fromYear: Number(fromYear), excludeExisting }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          const nextWorks = body.works || [];
          setWorks(nextWorks);
          writeStoredJson(AUTHOR_SEARCH_STORAGE_KEY, {
            name,
            institution,
            fromYear,
            candidates,
            affiliation,
            selected: author,
            works: nextWorks,
            summaryTaskId: '',
          });
          if (!nextWorks.length) setMessage('该作者在指定年份范围内没有可检索的论文。');
        } catch (error) {
          setError(error.message);
        } finally {
          setLoading(false);
        }
      };

      const save = async (card) => {
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/discover/import-metadata`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              title: card.title,
              authors: card.authors,
              abstract: card.abstract,
              venue: card.journal,
              doi: card.doi,
              year: card.year,
              source_url: card.url,
            }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setSavedIds((current) => (current.includes(card.id) ? current : [...current, card.id]));
          setMessage(`已存入库：${card.title.slice(0, 50)}`);
        } catch (error) {
          setError(`存入库失败：${error.message}`);
        }
      };

      const summarizeAll = async () => {
        if (!works.length || summaryLoading) return;
        setSummaryLoading(true);
        setSummaryProgress(0);
        setSummaryDone(0);
        setSummaryTotal(Math.min(works.length, 25));
        setError('');
        setMessage('');
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/author-digest/start`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ authorName: selected?.name || name, works }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          const taskId = body.id || '';
          setSummaryTask(taskId);
          writeStoredJson(AUTHOR_SEARCH_STORAGE_KEY, {
            name,
            institution,
            fromYear,
            candidates,
            affiliation,
            selected,
            works,
            summaryTaskId: taskId,
          });
        } catch (error) {
          setError(`AI 总结失败：${error.message}`);
          setSummaryLoading(false);
        }
      };

      return h(
        'div',
        { className: 'lit-ai-search-page lit-author-page' },
        h(
          'div',
          { className: 'lit-ai-search-head' },
          h('div', { className: 'lit-eyebrow' }, 'AUTHOR SEARCH · OPENALEX'),
          h('h2', { className: 'lit-modal-title' }, '作者检索'),
          h(
            'div',
            { className: 'lit-modal-sub' },
            '先按姓名和单位定位作者，再拉取该作者近年的论文。重名很常见，请确认作者后再查看。'
          )
        ),
        h(
          'div',
          { className: 'lit-author-filter' },
          h(
            'label',
            { className: excludeExisting ? 'lit-ai-source lit-ai-source-on' : 'lit-ai-source' },
            h('input', {
              type: 'checkbox',
              checked: excludeExisting,
              onChange: (event) => setExcludeExisting(event.target.checked),
            }),
            '过滤库中已有文献'
          )
        ),
        h(
          'div',
          { className: 'lit-author-form' },
          h('input', {
            className: 'lit-input',
            value: name,
            onChange: (event) => setName(event.target.value),
            placeholder: '输入作者姓名（中文或英文）',
            onKeyDown: (event) => {
              if (event.key === 'Enter') search();
            },
          }),
          h('input', {
            className: 'lit-input',
            value: institution,
            onChange: (event) => setInstitution(event.target.value),
            placeholder: '输入单位（可选）',
            onKeyDown: (event) => {
              if (event.key === 'Enter') search();
            },
          }),
          h('input', {
            className: 'lit-input lit-author-year',
            type: 'number',
            min: '1990',
            max: String(new Date().getFullYear()),
            value: fromYear,
            onChange: (event) => setFromYear(event.target.value),
            title: '起始年份',
          }),
          h(
            'button',
            { type: 'button', className: 'lit-btn lit-btn-primary', onClick: search, disabled: loading || !name.trim() },
            h(Icon, { name: 'search', size: 13 }),
            loading ? '查找中…' : '查找作者'
          )
        ),
        error ? h('div', { className: 'lit-settings-error' }, error) : null,
        message ? h('div', { className: 'lit-settings-note' }, message) : null,
        affiliation
          ? h('div', { className: 'lit-author-affiliation' }, `机构匹配：${affiliation.name}${affiliation.ror ? ` · ${affiliation.ror}` : ''}`)
          : null,
        candidates.length
          ? h(
              'div',
              { className: 'lit-author-candidates' },
              candidates.map((author) =>
                h(
                  'div',
                  { key: author.id, className: selected?.id === author.id ? 'lit-author-candidate lit-author-candidate-on' : 'lit-author-candidate' },
                  h('div', { className: 'lit-author-name' }, author.name),
                  h('div', { className: 'lit-author-meta' }, `${author.works} 篇 · ${author.cited} 次引用${author.orcid ? ` · ${author.orcid}` : ''}`),
                  author.institutions?.length ? h('div', { className: 'lit-author-inst' }, author.institutions.join(' / ')) : null,
                  author.topics?.length
                    ? h('div', { className: 'lit-chip-row' }, author.topics.map((topic) => h('span', { key: topic, className: 'lit-soft-badge' }, topic)))
                    : null,
                  h(
                    'button',
                    { type: 'button', className: 'lit-feed-detail-btn', onClick: () => openAuthor(author), disabled: loading },
                    selected?.id === author.id ? '已选择' : '查看论文'
                  )
                )
              )
            )
          : null,
        selected
          ? h(
              'div',
              { className: 'lit-author-result-head' },
              `当前作者：${selected.name} · ${selected.institutions?.join(' / ') || ''} · ${fromYear} 年起`
            )
          : null,
        selected && works.length
          ? h(
              'div',
              { className: 'lit-author-result-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'lit-btn lit-btn-primary',
                  onClick: summarizeAll,
                  disabled: summaryLoading,
                },
                h(Icon, { name: 'sparkles', size: 13 }),
                summaryLoading
                  ? `AI 总结中 ${summaryDone}/${summaryTotal || works.length} · ${summaryProgress}s`
                  : 'AI 总结全部'
              ),
              h(
                'span',
                { className: 'lit-author-summary-hint' },
                summaryLoading
                  ? `已完成 ${summaryDone}/${summaryTotal || works.length}，离开页面也会继续`
                  : '会调用模型，消耗 token'
              )
            )
          : null,
        h(
          'div',
          { className: 'lit-ai-search-results' },
          works.map((card) =>
            h(
              'article',
              {
                key: card.id,
                className: savedIds.includes(card.id)
                  ? 'lit-feed-card lit-author-work-card lit-feed-card-saved'
                  : 'lit-feed-card lit-author-work-card',
              },
              h(
                'div',
                { className: 'lit-feed-card-top' },
                h('span', { className: 'lit-feed-kind lit-feed-kind-paper' }, card.source || 'OpenAlex'),
                card.stars
                  ? h('span', { className: 'lit-ai-stars' }, '★'.repeat(card.stars) + '☆'.repeat(5 - card.stars))
                  : h(
                      'span',
                      { className: 'lit-author-cite' },
                      [card.year, card.cited_by ? `${card.cited_by} 引用` : ''].filter(Boolean).join(' · ')
                    )
              ),
              h('div', { className: 'lit-feed-card-title' }, card.title),
              h('div', { className: 'lit-feed-card-source' }, card.journal || '未提供期刊'),
              card.authors
                ? h('div', { className: 'lit-author-authors' }, card.authors.slice(0, 160))
                : null,
              h(
                'div',
                { className: 'lit-author-abstract' },
                h(
                  'span',
                  { className: 'lit-author-abstract-label' },
                  card.summary ? 'AI 摘要' : '摘要'
                ),
                h('span', null, (card.summary || card.abstract || '该来源没有提供摘要。').slice(0, 520))
              ),
              card.why_relevant
                ? h('div', { className: 'lit-ai-score-reason' }, `贡献：${card.why_relevant}`)
                : null,
              h(
                'div',
                { className: 'lit-chip-row' },
                ...(card.tags || []).map((tag) => h('span', { key: tag, className: 'lit-soft-badge' }, tag)),
                card.year ? h('span', { className: 'lit-soft-badge' }, String(card.year)) : null,
                card.cited_by ? h('span', { className: 'lit-soft-badge' }, `${card.cited_by} 引用`) : null,
                card.doi ? h('span', { className: 'lit-soft-badge' }, card.doi.slice(0, 42)) : null
              ),
              h(
                'div',
                { className: 'lit-feed-card-foot' },
                card.url
                  ? h('a', { className: 'lit-link-btn', href: card.url, target: '_blank', rel: 'noreferrer' }, '打开来源')
                  : null,
                savedIds.includes(card.id)
                  ? h('span', { className: 'lit-saved-badge' }, '已入库')
                  : h('button', { type: 'button', className: 'lit-feed-detail-btn', onClick: () => save(card) }, '存入库')
              )
            )
          )
        )
      );
    }

    function OpmlPreviewModal({ urls, busy, onCancel, onConfirm }) {
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && !busy) onCancel();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-confirm-modal', role: 'dialog', 'aria-modal': 'true' },
          h('div', { className: 'lit-eyebrow' }, 'OPML IMPORT'),
          h('h2', { className: 'lit-modal-title' }, `导入 ${urls.length} 个新订阅源？`),
          h('div', { className: 'lit-modal-sub' }, '导入后会逐个抓取；已订阅的地址不会重复导入。'),
          h(
            'div',
            { className: 'lit-opml-preview-list' },
            urls.slice(0, 12).map((url) => h('div', { key: url, className: 'lit-opml-preview-url' }, url)),
            urls.length > 12 ? h('div', { className: 'lit-settings-note' }, `还有 ${urls.length - 12} 个…`) : null
          ),
          h(
            'div',
            { className: 'lit-modal-actions' },
            h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onCancel, disabled: busy }, '取消'),
            h(
              'button',
              { type: 'button', className: 'lit-btn lit-btn-primary', onClick: onConfirm, disabled: busy },
              busy ? '导入中…' : '开始导入'
            )
          )
        )
      );
    }

    function FeedEditModal({ feed, onClose, onSave }) {
      const [title, setTitle] = useState(feed.title || '');
      const [url, setUrl] = useState(feed.url || '');
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-feed-edit-modal', role: 'dialog', 'aria-modal': 'true' },
          h(
            'div',
            { className: 'lit-modal-head' },
            h('div', null, h('div', { className: 'lit-eyebrow' }, 'FEED SETTINGS'), h('h2', { className: 'lit-modal-title' }, '编辑订阅源')),
            h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭', onClick: onClose }, h(Icon, { name: 'x', size: 16 }))
          ),
          h('label', { className: 'lit-field-label' }, '名称'),
          h('input', { className: 'lit-input', value: title, onChange: (event) => setTitle(event.target.value) }),
          h('label', { className: 'lit-field-label', style: { marginTop: '10px' } }, 'RSS / Atom 地址'),
          h('input', { className: 'lit-input', value: url, onChange: (event) => setUrl(event.target.value) }),
          h(
            'div',
            { className: 'lit-modal-actions' },
            h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onClose }, '取消'),
            h('button', { type: 'button', className: 'lit-btn lit-btn-primary', onClick: () => onSave({ title: title.trim(), url: url.trim() }) }, '保存')
          )
        )
      );
    }

    function FeedItemModal({ item, onClose, onToggleRead, onSave, onSetKind }) {
      const isPaper = item.kind === 'paper' || item.kind === 'unknown';
      const labels = { paper: '论文', news: '新闻', comment: '评论', unknown: '未分类' };
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-feed-detail-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '订阅详情' },
          h(
            'div',
            { className: 'lit-modal-head' },
            h(
              'div',
              null,
              h('div', { className: 'lit-eyebrow' }, item.feed_title || 'RSS'),
              h('h2', { className: 'lit-modal-title' }, item.title)
            ),
            h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭', onClick: onClose }, h(Icon, { name: 'x', size: 16 }))
          ),
          h(
            'div',
            { className: 'lit-feed-detail-meta' },
            h('span', { className: `lit-feed-kind lit-feed-kind-${item.kind || 'unknown'}` }, labels[item.kind] || '未分类'),
            h(
              'select',
              {
                className: 'lit-kind-select',
                value: item.kind || 'unknown',
                onClick: (event) => event.stopPropagation(),
                onChange: (event) => onSetKind && onSetKind(event.target.value),
                title: '手动改判类型',
              },
              h('option', { value: 'paper' }, '论文'),
              h('option', { value: 'news' }, '新闻'),
              h('option', { value: 'comment' }, '评论'),
              h('option', { value: 'unknown' }, '未分类')
            ),
            item.authors ? h('span', null, item.authors) : null,
            item.published_at ? h('span', null, String(item.published_at).slice(0, 10)) : null,
            item.saved ? h('span', { className: 'lit-status lit-status-ok' }, '已入库') : null
          ),
          item.ai_stars
            ? h(
                'div',
                { className: 'lit-ai-score-card' },
                h('div', { className: 'lit-ai-score-head' },
                  h('span', { className: 'lit-ai-stars' }, '★'.repeat(item.ai_stars) + '☆'.repeat(5 - item.ai_stars)),
                  h('span', { className: 'lit-ai-score-type' }, item.ai_type || 'AI 推荐')
                ),
                item.ai_reason ? h('div', { className: 'lit-ai-score-reason' }, item.ai_reason) : null,
                item.ai_why_not_higher
                  ? h('div', { className: 'lit-ai-score-why' }, `为什么不是更高星：${item.ai_why_not_higher}`)
                  : null
              )
            : null,
          h('div', { className: 'lit-feed-detail-summary' }, item.summary || '这条订阅没有提供摘要。'),
          item.link
            ? h('div', { className: 'lit-metadata-source' }, h('a', { href: item.link, target: '_blank', rel: 'noreferrer' }, item.link))
            : null,
          !isPaper
            ? h('div', { className: 'lit-feed-nonpaper-note' }, '这条内容被识别为新闻/评论，不作为论文入库，只保留阅读状态。')
            : null,
          h(
            'div',
            { className: 'lit-modal-actions' },
            h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onClose }, '关闭'),
            h(
              'button',
              { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onToggleRead },
              item.read ? '标为未读' : '标为已读'
            ),
            item.link
              ? h(
                  'a',
                  { className: 'lit-btn lit-btn-ghost', href: item.link, target: '_blank', rel: 'noreferrer' },
                  h(Icon, { name: 'external', size: 13 }),
                  '打开来源'
                )
              : null,
            isPaper
              ? h(
                  'button',
                  { type: 'button', className: 'lit-btn lit-btn-primary', onClick: onSave, disabled: item.saved },
                  h(Icon, { name: 'plus', size: 13 }),
                  item.saved ? '已在文献库' : '存入库'
                )
              : null
          )
        )
      );
    }

    function MetadataOnlyModal({ paper, onClose, onImport }) {
      const sourceUrl = paper.sourceUrl || (paper.doi ? `https://doi.org/${paper.doi}` : '');
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-metadata-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '仅元数据' },
          h(
            'div',
            { className: 'lit-modal-head' },
            h(
              'div',
              null,
              h('div', { className: 'lit-eyebrow' }, '仅元数据'),
              h('h2', { className: 'lit-modal-title' }, '这篇文献目前只有元数据'),
              h('div', { className: 'lit-modal-sub', style: { margin: '6px 0 0' } }, paper.title)
            ),
            h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭', onClick: onClose }, h(Icon, { name: 'x', size: 16 }))
          ),
          h(
            'div',
            { className: 'lit-metadata-body' },
            paper.venue
              ? h(JournalBadge, {
                  name: paper.venue,
                  quartile: paper.jcrQuartile,
                  impactFactor: paper.impactFactor,
                })
              : null,
            h(
              'p',
              { className: 'lit-metadata-copy' },
              '当前记录没有 PDF 全文，只有标题、摘要、期刊和来源页，所以不能生成基于全文的 AI 总结。'
            ),
            h(
              'p',
              { className: 'lit-metadata-copy' },
              '请从来源页下载 PDF，然后打开“导入”并选择该 PDF。同标题会合并到这篇文献，保留已有元数据。'
            ),
            sourceUrl
              ? h(
                  'div',
                  { className: 'lit-metadata-source' },
                  h('span', null, '来源：'),
                  h('a', { href: sourceUrl, target: '_blank', rel: 'noreferrer' }, sourceUrl)
                )
              : h('div', { className: 'lit-metadata-source lit-metadata-missing' }, '来源页未记录。')
          ),
          h(
            'div',
            { className: 'lit-modal-actions' },
            h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onClose }, '关闭'),
            sourceUrl
              ? h(
                  'a',
                  {
                    className: 'lit-btn lit-btn-ghost',
                    href: sourceUrl,
                    target: '_blank',
                    rel: 'noreferrer',
                  },
                  h(Icon, { name: 'external', size: 13 }),
                  '打开来源页'
                )
              : null,
            h(
              'button',
              { type: 'button', className: 'lit-btn lit-btn-primary', onClick: onImport },
              h(Icon, { name: 'plus', size: 13 }),
              '为这篇添加 PDF'
            )
          )
        )
      );
    }

    function SettingsModal({
      tab,
      presets,
      groups,
      groupTemplates,
      onTabChange,
      onClose,
      onAddPreset,
      onUpdatePreset,
      onDeletePreset,
      onToggleGroupPreset,
    }) {
      const [newPreset, setNewPreset] = useState({ title: '', type: 'text', hint: '', options: '' });
      const [editId, setEditId] = useState(null);
      const [editForm, setEditForm] = useState({ title: '', type: 'text', hint: '', options: '' });
      const [ifYear, setIfYear] = useState(String(new Date().getFullYear() - 1));
      const [ifRows, setIfRows] = useState([]);
      const [ifLoading, setIfLoading] = useState(false);
      const [ifForm, setIfForm] = useState({ journal: '', value: '' });
      const [ifError, setIfError] = useState('');
      const [jcrSummary, setJcrSummary] = useState(null);
      const [backups, setBackups] = useState([]);
      const [backupBusy, setBackupBusy] = useState(false);
      const [backupError, setBackupError] = useState('');
      const [restoreFile, setRestoreFile] = useState(null);
      const [restoreBusy, setRestoreBusy] = useState(false);

      const loadBackups = async () => {
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/backups`, { cache: 'no-store' });
          const body = await response.json();
          if (response.ok && body.ok === true) setBackups(body.backups || []);
        } catch (error) {
          setBackupError(error.message);
        }
      };

      const createBackup = async () => {
        setBackupBusy(true);
        setBackupError('');
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/backups`, { method: 'POST' });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          await loadBackups();
        } catch (error) {
          setBackupError(error.message);
        } finally {
          setBackupBusy(false);
        }
      };

      const restoreBackupFile = async () => {
        if (!restoreFile) return;
        if (
          !window.confirm(
            '从上传的 ZIP 恢复会替换当前文献库、分组、订阅源和 PDF。\n服务会先自动创建一份当前备份，但仍建议确认当前数据已备份。是否继续？'
          )
        ) {
          return;
        }
        setRestoreBusy(true);
        setBackupError('');
        try {
          const buffer = await restoreFile.arrayBuffer();
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/restore`, {
            method: 'POST',
            headers: { 'content-type': 'application/zip' },
            body: buffer,
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          window.setTimeout(() => window.location.reload(), 400);
        } catch (error) {
          setBackupError(`恢复失败：${error.message}`);
          setRestoreBusy(false);
        }
      };

      const deleteBackup = async (name) => {
        if (!window.confirm(`删除备份「${name}」？`)) return;
        try {
          await fetch(`${LIT_DEMO_API_BASE}/api/backups/${encodeURIComponent(name)}`, { method: 'DELETE' });
          await loadBackups();
        } catch (error) {
          setBackupError(error.message);
        }
      };

      const loadJcrSummary = async () => {
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/jcr/summary?year=2026`);
          const body = await response.json();
          if (response.ok && body.ok === true) setJcrSummary(body);
        } catch (error) {
          setJcrSummary(null);
        }
      };

      const loadImpactFactors = async (year) => {
        setIfLoading(true);
        setIfError('');
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/impact-factors?year=${encodeURIComponent(year)}`);
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setIfRows(body.rows || []);
        } catch (error) {
          setIfError(error.message);
        } finally {
          setIfLoading(false);
        }
      };

      useEffect(() => {
        if (tab !== 'impact') return;
        loadImpactFactors(ifYear);
        loadJcrSummary();
      }, [tab, ifYear]);

      useEffect(() => {
        if (tab === 'backup') loadBackups();
      }, [tab]);

      const startEdit = (preset) => {
        setEditId(preset.id);
        setEditForm({
          title: preset.title || '',
          type: preset.type || 'text',
          hint: preset.hint || '',
          options: (preset.options || []).join(', '),
        });
      };

      const submitEdit = () => {
        const title = editForm.title.trim();
        if (!title) return;
        onUpdatePreset(editId, {
          title,
          type: editForm.type,
          hint: editForm.hint.trim(),
          ...(editForm.type === 'tags'
            ? { options: editForm.options.split(/[,，]/).map((item) => item.trim()).filter(Boolean) }
            : {}),
          ...(editForm.type === 'rating' ? { max: 5 } : {}),
        });
        setEditId(null);
      };

      const submitNew = () => {
        const title = newPreset.title.trim();
        if (!title) return;
        onAddPreset({
          id: `custom-${Date.now()}`,
          title,
          type: newPreset.type,
          owner: 'user',
          hint: newPreset.hint.trim() || '自定义大类',
          ...(newPreset.type === 'tags'
            ? { options: newPreset.options.split(/[,，]/).map((item) => item.trim()).filter(Boolean) }
            : {}),
          ...(newPreset.type === 'rating' ? { max: 5 } : {}),
        });
        setNewPreset({ title: '', type: 'text', hint: '', options: '' });
      };

      const saveImpactFactor = async () => {
        const journal = ifForm.journal.trim();
        const value = Number(ifForm.value);
        if (!journal || !Number.isFinite(value)) return;
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/impact-factors`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ journal, year: Number(ifYear), value }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setIfForm({ journal: '', value: '' });
          await loadImpactFactors(ifYear);
        } catch (error) {
          setIfError(error.message);
        }
      };

      const deleteImpactFactor = async (row) => {
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/impact-factors/delete`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ journal: row.journal, year: row.year }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          await loadImpactFactors(ifYear);
        } catch (error) {
          setIfError(error.message);
        }
      };

      const ifValue = (preset, type) => (type === 'preset' ? preset.title : preset.type);

      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-settings-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '设置' },
          h(
            'div',
            { className: 'lit-modal-head' },
            h(
              'div',
              null,
              h('div', { className: 'lit-eyebrow' }, 'WORKSPACE · SETTINGS'),
              h('h2', { className: 'lit-modal-title' }, '设置'),
              h('div', { className: 'lit-modal-sub', style: { margin: '6px 0 0' } }, '预设大类、分组默认结构和本地影响因子表。设置保存在当前 DSH profile。')
            ),
            h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭', onClick: onClose }, h(Icon, { name: 'x', size: 16 }))
          ),
          h(
            'div',
            { className: 'lit-settings-tabs' },
            h(
              'button',
              { type: 'button', className: tab === 'presets' ? 'lit-settings-tab active' : 'lit-settings-tab', onClick: () => onTabChange('presets') },
              '结构化总结预设'
            ),
            h(
              'button',
              { type: 'button', className: tab === 'impact' ? 'lit-settings-tab active' : 'lit-settings-tab', onClick: () => onTabChange('impact') },
              '影响因子表'
            ),
            h(
              'button',
              { type: 'button', className: tab === 'backup' ? 'lit-settings-tab active' : 'lit-settings-tab', onClick: () => onTabChange('backup') },
              '备份 / 恢复'
            )
          ),
          tab === 'presets'
            ? h(
                'div',
                { className: 'lit-settings-body' },
                h('div', { className: 'lit-settings-section-title' }, '预设大类'),
                h(
                  'div',
                  { className: 'lit-preset-list' },
                  presets.map((preset) =>
                    h(
                      'div',
                      { key: preset.id, className: 'lit-preset-row' },
                      editId === preset.id
                        ? h(
                            'div',
                            { className: 'lit-settings-edit' },
                            h('input', {
                              className: 'lit-input',
                              value: editForm.title,
                              onChange: (event) => setEditForm((previous) => ({ ...previous, title: event.target.value })),
                              'aria-label': '编辑预设名称',
                            }),
                            h(
                              'select',
                              {
                                className: 'lit-select',
                                value: editForm.type,
                                onChange: (event) => setEditForm((previous) => ({ ...previous, type: event.target.value })),
                              },
                              h('option', { value: 'text' }, '文本'),
                              h('option', { value: 'rating' }, '星级'),
                              h('option', { value: 'tags' }, '标签多选'),
                              h('option', { value: 'read' }, '已读')
                            ),
                            h('input', {
                              className: 'lit-input',
                              value: editForm.hint,
                              onChange: (event) => setEditForm((previous) => ({ ...previous, hint: event.target.value })),
                              placeholder: '提示语',
                            }),
                            editForm.type === 'tags'
                              ? h('input', {
                                  className: 'lit-input',
                                  value: editForm.options,
                                  onChange: (event) => setEditForm((previous) => ({ ...previous, options: event.target.value })),
                                  placeholder: '选项，逗号分隔',
                                })
                              : null,
                            h(
                              'div',
                              { className: 'lit-settings-edit-actions' },
                              h('button', { type: 'button', className: 'lit-btn lit-btn-primary', onClick: submitEdit }, '保存'),
                              h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: () => setEditId(null) }, '取消')
                            )
                          )
                        : h(
                            'div',
                            { className: 'lit-preset-main' },
                            h(
                              'div',
                              null,
                              h('div', { className: 'lit-preset-title' }, preset.title),
                              h(
                                'div',
                                { className: 'lit-preset-meta' },
                                `${SECTION_TYPE_LABELS[preset.type] || '文本'}${preset.hint ? ` · ${preset.hint}` : ''}`
                              )
                            ),
                            h(
                              'div',
                              { className: 'lit-preset-actions' },
                              h('button', { type: 'button', className: 'lit-link-btn', onClick: () => startEdit(preset) }, '编辑'),
                              h('button', { type: 'button', className: 'lit-link-btn lit-danger-link', onClick: () => onDeletePreset(preset.id) }, '删除')
                            )
                          )
                    )
                  )
                ),
                h('div', { className: 'lit-settings-section-title', style: { marginTop: '18px' } }, '新建大类'),
                h(
                  'div',
                  { className: 'lit-settings-new' },
                  h('input', {
                    className: 'lit-input',
                    value: newPreset.title,
                    onChange: (event) => setNewPreset((previous) => ({ ...previous, title: event.target.value })),
                    placeholder: '名称',
                  }),
                  h(
                    'select',
                    {
                      className: 'lit-select',
                      value: newPreset.type,
                      onChange: (event) => setNewPreset((previous) => ({ ...previous, type: event.target.value })),
                    },
                    h('option', { value: 'text' }, '文本'),
                    h('option', { value: 'rating' }, '星级'),
                    h('option', { value: 'tags' }, '标签多选'),
                    h('option', { value: 'read' }, '已读')
                  ),
                  h('input', {
                    className: 'lit-input',
                    value: newPreset.hint,
                    onChange: (event) => setNewPreset((previous) => ({ ...previous, hint: event.target.value })),
                    placeholder: '提示语（可选）',
                  }),
                  newPreset.type === 'tags'
                    ? h('input', {
                        className: 'lit-input',
                        value: newPreset.options,
                        onChange: (event) => setNewPreset((previous) => ({ ...previous, options: event.target.value })),
                        placeholder: '标签选项，逗号分隔',
                      })
                    : null,
                  h('button', { type: 'button', className: 'lit-btn lit-btn-primary', onClick: submitNew, disabled: !newPreset.title.trim() }, '新建')
                ),
                h('div', { className: 'lit-settings-section-title', style: { marginTop: '18px' } }, '分组默认结构'),
                h(
                  'div',
                  { className: 'lit-group-defaults' },
                  groups.map((group) =>
                    h(
                      'div',
                      { key: group.id, className: 'lit-group-default-row' },
                      h(GroupChip, { group, small: true }),
                      h(
                        'div',
                        { className: 'lit-group-default-options' },
                        presets.map((preset) =>
                          h(
                            'label',
                            { key: preset.id, className: 'lit-checkbox-option' },
                            h('input', {
                              type: 'checkbox',
                              checked: (groupTemplates[group.id] || []).some((template) => template.presetId === preset.id),
                              onChange: (event) => onToggleGroupPreset(group.id, preset.id, event.target.checked),
                            }),
                            preset.title
                          )
                        )
                      )
                    )
                  )
                )
              )
            : tab === 'impact'
              ? h(
                'div',
                { className: 'lit-settings-body' },
                h('div', { className: 'lit-settings-section-title' }, '本地影响因子表'),
                h(
                  'div',
                  { className: 'lit-settings-note' },
                  '影响因子不是公开数据；这里维护的是你本地的参考表，不声称是官方 JCR。筛选时按期刊名精确匹配（忽略大小写）。'
                ),
                h(
                  'div',
                  { className: 'lit-settings-note' },
                  jcrSummary
                    ? `2026 JCR 分区表已载入：${jcrSummary.total} 本期刊；Q1 ${jcrSummary.quartiles.find((row) => row.quartile === 'Q1')?.n || 0}，Q2 ${jcrSummary.quartiles.find((row) => row.quartile === 'Q2')?.n || 0}，Q3 ${jcrSummary.quartiles.find((row) => row.quartile === 'Q3')?.n || 0}，Q4 ${jcrSummary.quartiles.find((row) => row.quartile === 'Q4')?.n || 0}。`
                    : '2026 JCR 分区表未载入。'
                ),
                h(
                  'div',
                  { className: 'lit-if-toolbar' },
                  h('label', { className: 'lit-field-label' }, '年份'),
                  h('input', {
                    className: 'lit-input lit-if-year',
                    value: ifYear,
                    onChange: (event) => setIfYear(event.target.value.replace(/[^0-9]/g, '')),
                    inputMode: 'numeric',
                  }),
                  h(
                    'button',
                    { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: () => loadImpactFactors(ifYear) },
                    h(Icon, { name: 'refresh', size: 12 }),
                    '刷新'
                  )
                ),
                h(
                  'div',
                  { className: 'lit-if-form' },
                  h('input', {
                    className: 'lit-input',
                    value: ifForm.journal,
                    onChange: (event) => setIfForm((previous) => ({ ...previous, journal: event.target.value })),
                    placeholder: '期刊名，例如 Nature Communications',
                  }),
                  h('input', {
                    className: 'lit-input',
                    value: ifForm.value,
                    onChange: (event) => setIfForm((previous) => ({ ...previous, value: event.target.value })),
                    placeholder: 'IF 值',
                    inputMode: 'decimal',
                  }),
                  h('button', { type: 'button', className: 'lit-btn lit-btn-primary', onClick: saveImpactFactor }, '保存')
                ),
                ifError ? h('div', { className: 'lit-settings-error' }, ifError) : null,
                ifLoading
                  ? h('div', { className: 'lit-settings-note' }, '加载中…')
                  : ifRows.length === 0
                    ? h('div', { className: 'lit-settings-note' }, `${ifYear} 年还没有 IF 记录。`)
                    : h(
                        'div',
                        { className: 'lit-if-list' },
                        ifRows.map((row) =>
                          h(
                            'div',
                            { key: `${row.journal}-${row.year}`, className: 'lit-if-row' },
                            h('span', { className: 'lit-if-journal' }, row.journal),
                            h(
                              'span',
                              { className: 'lit-if-value' },
                              row.value === null || row.value === undefined ? '待填' : Number(row.value).toFixed(2)
                            ),
                            h(
                              'button',
                              {
                                type: 'button',
                                className: 'lit-link-btn',
                                onClick: () => setIfForm({ journal: row.journal, value: row.value == null ? '' : String(row.value) }),
                              },
                              '填入'
                            ),
                            h('button', { type: 'button', className: 'lit-link-btn lit-danger-link', onClick: () => deleteImpactFactor(row) }, '删除')
                          )
                        )
                      )
              )
            : tab === 'backup'
              ? h(
                'div',
                { className: 'lit-settings-body' },
                h('div', { className: 'lit-settings-section-title' }, '备份'),
                h(
                  'div',
                  { className: 'lit-settings-note' },
                  '备份包含 SQLite 数据库和 PDF 副本：论文、分组、总结、证据、订阅源、已读状态、JCR 和 IF 表。'
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: '7px', marginTop: '10px', flexWrap: 'wrap' } },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lit-btn lit-btn-primary',
                      onClick: createBackup,
                      disabled: backupBusy,
                    },
                    h(Icon, { name: 'download', size: 13 }),
                    backupBusy ? '备份中…' : '立即备份'
                  ),
                  h(
                    'a',
                    {
                      className: 'lit-btn lit-btn-ghost',
                      href: `${LIT_DEMO_API_BASE}/api/backup`,
                      download: 'lit-backup.zip',
                      style: { textDecoration: 'none' },
                    },
                    '直接下载'
                  )
                ),
                backupError ? h('div', { className: 'lit-settings-error' }, backupError) : null,
                h('div', { className: 'lit-settings-section-title', style: { marginTop: '18px' } }, '备份历史'),
                backups.length === 0
                  ? h('div', { className: 'lit-settings-note' }, '还没有保存的备份。')
                  : h(
                      'div',
                      { className: 'lit-backup-list' },
                      backups.map((backup) =>
                        h(
                          'div',
                          { key: backup.name, className: 'lit-backup-row' },
                          h('span', { className: 'lit-backup-name' }, backup.name),
                          h(
                            'span',
                            { className: 'lit-backup-meta' },
                            `${new Date(backup.created_at).toLocaleString()} · ${(backup.bytes / 1024 / 1024).toFixed(1)} MB`
                          ),
                          h(
                            'a',
                            {
                              className: 'lit-link-btn',
                              href: `${LIT_DEMO_API_BASE}/api/backups/${encodeURIComponent(backup.name)}`,
                              download: backup.name,
                            },
                            '下载'
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'lit-link-btn lit-danger-link',
                              onClick: () => deleteBackup(backup.name),
                            },
                            '删除'
                          )
                        )
                      )
                    ),
                h('div', { className: 'lit-settings-section-title', style: { marginTop: '22px' } }, '恢复'),
                h(
                  'div',
                  { className: 'lit-settings-note' },
                  '上传备份 ZIP 会替换当前文献库、分组、订阅源和 PDF；服务会先自动创建一份当前备份。恢复期间页面会自动重载。'
                ),
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: '7px', marginTop: '8px', flexWrap: 'wrap' } },
                  h('input', {
                    type: 'file',
                    accept: '.zip,application/zip',
                    className: 'lit-file-input',
                    onChange: (event) => setRestoreFile(event.target.files?.[0] || null),
                  }),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lit-btn lit-btn-danger',
                      onClick: restoreBackupFile,
                      disabled: !restoreFile || restoreBusy,
                    },
                    h(Icon, { name: 'download', size: 13 }),
                    restoreBusy ? '恢复中…' : '上传并恢复'
                  )
                ),
                h('div', { className: 'lit-settings-note' }, '恢复前建议再下载一次当前备份。')
              )
            : null
        )
      );
    }

    function TemplateModal({ paper, presets, groupTemplates, groups, onClose, onAdd, onSaveDefault }) {
      const groupById = Object.fromEntries((groups || []).map((group) => [group.id, group]));
      const [title, setTitle] = useState('');
      const [type, setType] = useState('text');
      const [options, setOptions] = useState('机制, 电路, 泛化');
      const [savePreset, setSavePreset] = useState(false);
      const [groupId, setGroupId] = useState(paper.groups[0] || 'interp');
      const existingKeys = new Set((paper.summary.sections || []).map((section) => section.key));

      const addCustom = () => {
        const cleanTitle = title.trim();
        if (!cleanTitle) return;
        const key = `custom-${Date.now()}`;
        const definition = {
          key,
          title: cleanTitle,
          type,
          owner: 'user',
          hint: '自定义大类',
          ...(type === 'rating' ? { max: 5 } : {}),
          ...(type === 'tags'
            ? {
                options: options
                  .split(/[,，]/)
                  .map((item) => item.trim())
                  .filter(Boolean),
              }
            : {}),
        };
        onAdd(definition, savePreset);
        setTitle('');
      };

      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-template-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '模板与预设' },
          h(
            'div',
            { className: 'lit-modal-head' },
            h(
              'div',
              null,
              h('div', { className: 'lit-eyebrow' }, '模板 / 预设'),
              h('h2', { className: 'lit-modal-title' }, '配置这篇论文的大类'),
              h('div', { className: 'lit-modal-sub', style: { margin: '6px 0 0' } }, '每个大类可以是文本、星级、多选标签或已读标记；同一篇论文可以叠加多个分组模板。')
            ),
            h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭', onClick: onClose }, h(Icon, { name: 'x', size: 16 }))
          ),
          h(
            'div',
            { className: 'lit-template-columns' },
            h(
              'section',
              { className: 'lit-template-panel' },
              h('div', { className: 'lit-control-label' }, '当前分组的默认结构'),
              (paper.groups || []).map((groupIdItem) =>
                h(
                  'div',
                  { key: groupIdItem, className: 'lit-template-group' },
                  h(
                    'div',
                    { className: 'lit-template-group-head' },
                    groupById[groupIdItem] ? h(GroupChip, { group: groupById[groupIdItem], small: true }) : groupIdItem
                  ),
                  h(
                    'div',
                    { className: 'lit-template-list' },
                    (groupTemplates[groupIdItem] || []).map((section) =>
                      h(
                        'span',
                        { key: section.key || section.id, className: 'lit-template-chip' },
                        section.title,
                        h('span', { className: 'lit-template-chip-type' }, SECTION_TYPE_LABELS[section.type] || '文本')
                      )
                    )
                  )
                )
              ),
              h(
                'div',
                { className: 'lit-template-actions' },
                h(
                  'div',
                  { className: 'lit-inline-form' },
                  h(
                    'select',
                    { className: 'lit-select', value: groupId, onChange: (event) => setGroupId(event.target.value) },
                    (paper.groups || []).map((groupIdItem) =>
                      h('option', { key: groupIdItem, value: groupIdItem }, groupById[groupIdItem] ? groupById[groupIdItem].name : groupIdItem)
                    )
                  ),
                  h(
                    'button',
                    { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: () => onSaveDefault(groupId) },
                    h(Icon, { name: 'check', size: 13 }),
                    '保存为组默认'
                  )
                )
              )
            ),
            h(
              'section',
              { className: 'lit-template-panel' },
              h('div', { className: 'lit-control-label' }, '从预设添加'),
              h(
                'div',
                { className: 'lit-preset-list' },
                presets.map((preset) =>
                  h(
                    'div',
                    { key: preset.id, className: 'lit-preset-row' },
                    h(
                      'div',
                      null,
                      h('div', { className: 'lit-preset-title' }, preset.title),
                      h('div', { className: 'lit-preset-meta' }, `${SECTION_TYPE_LABELS[preset.type] || '文本'}${preset.type === 'tags' ? ` · ${(preset.options || []).join(' / ')}` : ''}`)
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lit-btn lit-btn-ghost',
                        disabled: existingKeys.has(preset.id),
                        onClick: () => onAdd(templateFromPreset(preset), false),
                      },
                      existingKeys.has(preset.id) ? '已存在' : '添加'
                    )
                  )
                )
              ),
              h('div', { className: 'lit-control-label', style: { marginTop: '18px' } }, '新建自定义大类'),
              h(
                'div',
                { className: 'lit-custom-form' },
                h('input', {
                  className: 'lit-input',
                  value: title,
                  onChange: (event) => setTitle(event.target.value),
                  placeholder: '大类名称',
                  'aria-label': '新大类名称',
                }),
                h(
                  'select',
                  { className: 'lit-select', value: type, onChange: (event) => setType(event.target.value) },
                  h('option', { value: 'text' }, '文本（可加条目）'),
                  h('option', { value: 'rating' }, '星级评分'),
                  h('option', { value: 'tags' }, '标签多选'),
                  h('option', { value: 'read' }, '已读标记')
                ),
                type === 'tags'
                  ? h('input', {
                      className: 'lit-input',
                      value: options,
                      onChange: (event) => setOptions(event.target.value),
                      placeholder: '选项，用逗号分隔',
                      'aria-label': '标签选项',
                    })
                  : null,
                h(
                  'label',
                  { className: 'lit-toggle' },
                  h('input', { type: 'checkbox', checked: savePreset, onChange: (event) => setSavePreset(event.target.checked) }),
                  '同时保存为我的预设'
                ),
                h(
                  'button',
                  { type: 'button', className: 'lit-btn lit-btn-primary', onClick: addCustom, disabled: !title.trim() },
                  h(Icon, { name: 'plus', size: 13 }),
                  '添加大类'
                )
              )
            )
          ),
          h(
            'div',
            { className: 'lit-modal-actions' },
            h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onClose }, '完成')
          )
        )
      );
    }

    function DiscoveryModal({ source, query, results, total, hasMore, loading, loadingMore, importingId, filters, filtersOpen, onFiltersChange, onToggleFilters, onSourceChange, onQueryChange, onSearch, onLoadMore, onImport, onImportMetadata, onClose }) {
      const sourceName =
        source === 'pubmed' ? 'PubMed' : source === 'biorxiv' ? 'bioRxiv' : source === 'arxiv' ? 'arXiv' : 'Europe PMC';
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-discovery-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '发现 arXiv 论文' },
          h(
            'div',
            { className: 'lit-modal-head' },
            h(
              'div',
              null,
              h('div', { className: 'lit-eyebrow' }, `DISCOVER · ${sourceName.toUpperCase()}`),
              h('h2', { className: 'lit-modal-title' }, '发现论文'),
              h(
                'div',
                { className: 'lit-modal-sub', style: { margin: '6px 0 0' } },
                source === 'arxiv'
                  ? 'arXiv：预印本，PDF 直接下载；导入后总结保持空白。'
                  : source === 'pubmed'
                    ? 'PubMed：经 Europe PMC 的 MEDLINE 记录检索；以摘要和元数据为主。'
                    : source === 'biorxiv'
                      ? 'bioRxiv：经 Europe PMC 的 preprint 索引检索；bioRxiv 常有 Cloudflare 保护，PDF 下载可能失败，可先保存元数据。'
                      : 'Europe PMC：覆盖 PubMed、PMC、bioRxiv/medRxiv；有开放 PDF 时导入全文，否则保存元数据。'
              )
            ),
            h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭', onClick: onClose }, h(Icon, { name: 'x', size: 16 }))
          ),
          h(
            'div',
            { className: 'lit-discovery-search' },
            h(
              'select',
              {
                className: 'lit-input lit-discovery-source',
                value: source,
                onChange: (event) => onSourceChange(event.target.value),
                'aria-label': '发现来源',
              },
              h('option', { value: 'europepmc' }, 'Europe PMC（全部）'),
              h('option', { value: 'pubmed' }, 'PubMed'),
              h('option', { value: 'biorxiv' }, 'bioRxiv'),
              h('option', { value: 'arxiv' }, 'arXiv')
            ),
            h('input', {
              className: 'lit-input',
              value: query,
              onChange: (event) => onQueryChange(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') onSearch();
              },
              placeholder: '输入关键词…',
              'aria-label': 'arXiv 搜索词',
            }),
            h(
              'button',
              { type: 'button', className: 'lit-btn lit-btn-primary', onClick: onSearch, disabled: loading },
              h(Icon, { name: 'search', size: 13 }),
              loading ? '搜索中…' : '搜索'
            ),
            h(
              'button',
              { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onToggleFilters },
              h(Icon, { name: 'filter', size: 13 }),
              '筛选'
            )
          ),
          filtersOpen
            ? h(
                'div',
                { className: 'lit-discovery-filters' },
                h(
                  'div',
                  { className: 'lit-discovery-filter-field' },
                  h('label', null, '起始年'),
                  h('input', {
                    className: 'lit-input',
                    value: filters.from,
                    onChange: (event) => onFiltersChange({ ...filters, from: event.target.value.replace(/[^0-9]/g, '') }),
                    placeholder: '2018',
                    inputMode: 'numeric',
                  })
                ),
                h(
                  'div',
                  { className: 'lit-discovery-filter-field' },
                  h('label', null, '结束年'),
                  h('input', {
                    className: 'lit-input',
                    value: filters.to,
                    onChange: (event) => onFiltersChange({ ...filters, to: event.target.value.replace(/[^0-9]/g, '') }),
                    placeholder: '2026',
                    inputMode: 'numeric',
                  })
                ),
                h(
                  'div',
                  { className: 'lit-discovery-filter-field lit-discovery-filter-wide' },
                  h('label', null, '期刊包含'),
                  h('input', {
                    className: 'lit-input',
                    value: filters.journal,
                    onChange: (event) => onFiltersChange({ ...filters, journal: event.target.value }),
                    placeholder: 'Nature / bioRxiv / …',
                  })
                ),
                h(
                  'div',
                  { className: 'lit-discovery-filter-field' },
                  h('label', null, '最低 IF'),
                  h('input', {
                    className: 'lit-input',
                    value: filters.minIf,
                    onChange: (event) => onFiltersChange({ ...filters, minIf: event.target.value }),
                    placeholder: '10',
                    inputMode: 'decimal',
                  })
                ),
                h(
                  'div',
                  { className: 'lit-discovery-filter-field' },
                  h('label', null, 'IF 年份'),
                  h('input', {
                    className: 'lit-input',
                    value: filters.ifYear,
                    onChange: (event) => onFiltersChange({ ...filters, ifYear: event.target.value.replace(/[^0-9]/g, '') }),
                    inputMode: 'numeric',
                  })
                ),
                h(
                  'div',
                  { className: 'lit-discovery-filter-field' },
                  h('label', null, 'JCR 分区（2026）'),
                  h(
                    'select',
                    {
                      className: 'lit-input',
                      value: filters.jcrQuartile,
                      onChange: (event) => onFiltersChange({ ...filters, jcrQuartile: event.target.value }),
                    },
                    h('option', { value: '' }, '不限'),
                    h('option', { value: 'Q1' }, 'Q1'),
                    h('option', { value: 'Q2' }, 'Q2'),
                    h('option', { value: 'Q3' }, 'Q3'),
                    h('option', { value: 'Q4' }, 'Q4')
                  )
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lit-link-btn lit-discovery-filter-clear',
                    onClick: () => onFiltersChange({ from: '', to: '', journal: '', minIf: '', ifYear: String(new Date().getFullYear() - 1), jcrQuartile: '' }),
                  },
                  '清空筛选'
                ),
                h(
                  'div',
                  { className: 'lit-discovery-filter-note' },
                  'IF 来自设置中的本地表；JCR 分区来自本地导入的 2026 JCR 表（按最优先分区匹配）。'
                )
              )
            : null,
          results.length > 0
            ? h(
                'div',
                { className: 'lit-discovery-summary' },
                `${sourceName} · 共 ${total} 条命中 · 已显示 ${results.length} 条`
              )
            : null,
          h(
            'div',
            { className: 'lit-discovery-results' },
            results.length === 0
              ? h(
                  'div',
                  { className: 'lit-discovery-empty' },
                  loading ? `正在查询 ${sourceName}…` : '输入关键词开始搜索；结果不会自动保存。'
                )
              : results.map((item) =>
                  h(
                    'article',
                    { key: item.id || item.arxiv_id || item.pdf_url, className: 'lit-discovery-item' },
                    h('div', { className: 'lit-discovery-title' }, item.title),
                    h(
                      'div',
                      { className: 'lit-discovery-meta' },
                      `${item.source_label || item.source || ''} · ${item.authors || 'Unknown'}${
                        item.published ? ` · ${String(item.published).slice(0, 10)}` : ''
                      }`
                    ),
                    (item.journal || item.venue)
                      ? h(
                          'div',
                          { className: 'lit-discovery-journal' },
                          h(JournalBadge, {
                            name: item.journal || item.venue,
                            quartile: item.jcr_quartile,
                            impactFactor: item.impact_factor,
                            compact: true,
                          })
                        )
                      : null,
                    h('div', { className: 'lit-discovery-abstract' }, item.abstract),
                    h(
                      'div',
                      { className: 'lit-discovery-actions' },
                      h(
                        'a',
                        { href: item.abs_url, target: '_blank', rel: 'noreferrer', className: 'lit-link-btn' },
                        item.arxiv_id ? `arXiv:${item.arxiv_id}` : item.source_label || 'Europe PMC'
                      ),
                      h(
                        'div',
                        { className: 'lit-discovery-actions-right' },
                        item.pdf_url
                          ? h(
                              'button',
                              {
                                type: 'button',
                                className: 'lit-btn lit-btn-ghost',
                                onClick: () => onImport(item),
                                disabled: Boolean(importingId),
                                title: '下载 PDF 并导入',
                              },
                              h(Icon, { name: importingId === (item.id || item.arxiv_id) ? 'refresh' : 'download', size: 12 }),
                              importingId === (item.id || item.arxiv_id) ? '导入中…' : '导入 PDF'
                            )
                          : null,
                        item.pdf_url
                          ? h(
                              'button',
                              {
                                type: 'button',
                                className: 'lit-link-btn',
                                onClick: () => onImportMetadata(item),
                                disabled: Boolean(importingId),
                              },
                              '仅元数据'
                            )
                          : h(
                              'button',
                              {
                                type: 'button',
                                className: 'lit-btn lit-btn-ghost',
                                onClick: () => onImportMetadata(item),
                                disabled: Boolean(importingId),
                                title: '没有开放 PDF，保存摘要和元数据',
                              },
                              h(Icon, { name: importingId === (item.id || item.arxiv_id) ? 'refresh' : 'file', size: 12 }),
                              importingId === (item.id || item.arxiv_id) ? '保存中…' : '保存元数据'
                            )
                      )
                    )
                  )
                )
          ),
          hasMore
            ? h(
                'div',
                { className: 'lit-discovery-more' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lit-btn lit-btn-ghost',
                    onClick: onLoadMore,
                    disabled: loadingMore,
                  },
                  loadingMore ? '加载中…' : `加载更多（共 ${total} 条）`
                )
              )
            : null
        )
      );
    }

    function EditPaperModal({ paper, busy, onClose, onSave }) {
      const [form, setForm] = React.useState({
        title: paper.title || '',
        authors: paper.authors || '',
        year: paper.year ? String(paper.year) : '',
        venue: paper.venue || '',
        doi: paper.doi || '',
      });
      const update = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }));
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && !busy) onClose();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-edit-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '编辑文献信息' },
          h(
            'div',
            { className: 'lit-modal-head' },
            h(
              'div',
              null,
              h('div', { className: 'lit-eyebrow' }, 'REAL LIBRARY · METADATA'),
              h('h2', { className: 'lit-modal-title' }, '编辑文献信息'),
              h('div', { className: 'lit-modal-sub', style: { margin: '6px 0 0' } }, '会写回 SQLite，并同步全文索引。')
            ),
            h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭', onClick: onClose, disabled: busy }, h(Icon, { name: 'x', size: 16 }))
          ),
          h(
            'div',
            { className: 'lit-edit-form' },
            h('label', { className: 'lit-field-label' }, '标题'),
            h('input', { className: 'lit-input', value: form.title, onChange: update('title'), disabled: busy }),
            h('label', { className: 'lit-field-label' }, '作者'),
            h('input', { className: 'lit-input', value: form.authors, onChange: update('authors'), disabled: busy }),
            h(
              'div',
              { className: 'lit-edit-row' },
              h(
                'div',
                null,
                h('label', { className: 'lit-field-label' }, '年份'),
                h('input', { className: 'lit-input', value: form.year, onChange: update('year'), inputMode: 'numeric', disabled: busy })
              ),
              h(
                'div',
                null,
                h('label', { className: 'lit-field-label' }, '期刊 / 来源'),
                h('input', { className: 'lit-input', value: form.venue, onChange: update('venue'), disabled: busy })
              )
            ),
            h('label', { className: 'lit-field-label' }, 'DOI'),
            h('input', { className: 'lit-input', value: form.doi, onChange: update('doi'), disabled: busy })
          ),
          h(
            'div',
            { className: 'lit-modal-actions' },
            h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onClose, disabled: busy }, '取消'),
            h(
              'button',
              {
                type: 'button',
                className: 'lit-btn lit-btn-primary',
                onClick: () => onSave({ ...form, year: form.year.trim() === '' ? null : Number(form.year) || null }),
                disabled: busy || !form.title.trim(),
              },
              h(Icon, { name: busy ? 'refresh' : 'check', size: 13 }),
              busy ? '保存中…' : '保存'
            )
          )
        )
      );
    }

    function ConfirmDeleteModal({ count, busy, real, onCancel, onConfirm }) {
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && !busy) onCancel();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-confirm-modal', role: 'alertdialog', 'aria-modal': 'true' },
          h('div', { className: 'lit-eyebrow' }, 'DESTRUCTIVE'),
          h('h2', { className: 'lit-modal-title' }, `删除 ${count} 篇论文？`),
          h(
            'div',
            { className: 'lit-modal-sub' },
            real
              ? '会删除 SQLite 记录、全文索引和 data/pdfs/ 下的 PDF 副本。原始下载文件不受影响。'
              : '会从文献库移除这些论文；不会影响本地文件。'
          ),
          h(
            'div',
            { className: 'lit-modal-actions' },
            h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onCancel, disabled: busy }, '取消'),
            h(
              'button',
              { type: 'button', className: 'lit-btn lit-btn-danger', onClick: onConfirm, disabled: busy },
              h(Icon, { name: 'trash', size: 13 }),
              busy ? '删除中…' : '删除'
            )
          )
        )
      );
    }

    function BatchSummaryModal({ eligible, skipped, busy, progress, onCancel, onConfirm }) {
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && !busy) onCancel();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-confirm-modal', role: 'dialog', 'aria-modal': 'true' },
          h('div', { className: 'lit-eyebrow' }, 'AI SUMMARY · TOKEN COST'),
          h('h2', { className: 'lit-modal-title' }, `批量生成 ${eligible} 篇 AI 总结？`),
          h(
            'div',
            { className: 'lit-modal-sub' },
            '会逐篇调用当前 DSH 默认模型，产生多次 token 消耗。已有 PDF 且尚未生成 AI 总结的论文才会执行。'
          ),
          skipped > 0
            ? h('div', { className: 'lit-settings-note' }, `${skipped} 篇没有 PDF 或已有 AI 总结，会被跳过。`)
            : null,
          busy
            ? h('div', { className: 'lit-settings-note' }, progress || '正在生成…')
            : null,
          h(
            'div',
            { className: 'lit-modal-actions' },
            h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onCancel, disabled: busy }, '取消'),
            h(
              'button',
              { type: 'button', className: 'lit-btn lit-btn-primary', onClick: onConfirm, disabled: busy || eligible === 0 },
              h(Icon, { name: 'sparkles', size: 13 }),
              busy ? '生成中…' : '开始生成'
            )
          )
        )
      );
    }

    function ImportModal({ file, path, summaryPath, busy, targetTitle, onFileChange, onPathChange, onSummaryChange, onClose, onSubmit }) {
      const chooseFile = (candidate) => {
        if (!candidate || busy) return;
        const isPdf = candidate.type === 'application/pdf' || /\.pdf$/i.test(candidate.name);
        if (!isPdf) {
          onFileChange(null);
          return;
        }
        onFileChange(candidate);
      };
      const onDrop = (event) => {
        event.preventDefault();
        event.stopPropagation();
        chooseFile(event.dataTransfer?.files?.[0]);
      };
      const sizeText = file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '';
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && !busy) onClose();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-import-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '导入 PDF' },
          h(
            'div',
            { className: 'lit-modal-head' },
            h(
              'div',
              null,
              h('div', { className: 'lit-eyebrow' }, targetTitle ? '添加 PDF' : '导入 PDF'),
              h('h2', { className: 'lit-modal-title' }, targetTitle ? '为这篇添加 PDF' : '导入 PDF'),
              h(
                'div',
                { className: 'lit-modal-sub', style: { margin: '6px 0 0' } },
                targetTitle || '文件会复制进 litd 的 library storage，之后移动或删除原文件都不影响。'
              )
            ),
            h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭', onClick: onClose, disabled: busy }, h(Icon, { name: 'x', size: 16 }))
          ),
          h(
            'div',
            { className: 'lit-import-form' },
            h(
              'label',
              {
                className: file ? 'lit-dropzone lit-dropzone-file' : 'lit-dropzone',
                onDragOver: (event) => event.preventDefault(),
                onDrop,
              },
              h('input', {
                type: 'file',
                accept: 'application/pdf,.pdf',
                style: { display: 'none' },
                onChange: (event) => {
                  chooseFile(event.target.files?.[0]);
                  event.target.value = '';
                },
                disabled: busy,
              }),
              h(Icon, { name: file ? 'file' : 'plus', size: 20 }),
              h('div', { className: 'lit-dropzone-title' }, file ? file.name : '拖入 PDF，或点击选择文件'),
              h(
                'div',
                { className: 'lit-dropzone-sub' },
                file ? `${sizeText} · 点击可重新选择` : '支持单个 PDF；文件会复制到 data/pdfs/'
              )
            ),
            file
              ? h(
                  'div',
                  { className: 'lit-import-file-actions' },
                  h('span', null, '已选择文件，将优先使用它'),
                  h(
                    'button',
                    { type: 'button', className: 'lit-link-btn', onClick: () => onFileChange(null), disabled: busy },
                    '清除，改用路径'
                  )
                )
              : null,
            h('div', { className: 'lit-import-divider' }, '或使用本机路径（高级）'),
            h('label', { className: 'lit-field-label' }, 'PDF 绝对路径'),
            h('input', {
              className: 'lit-input',
              value: path,
              onChange: (event) => onPathChange(event.target.value),
              placeholder: 'D:\\Desktop\\未读文献\\paper.pdf',
              disabled: busy || Boolean(file),
            }),
            h('div', { className: 'lit-import-note' }, '路径导入同样会复制到 library storage，而不是只记录原位置。'),
            h('label', { className: 'lit-field-label', style: { marginTop: '12px' } }, '总结 JSON（可选）'),
            h('input', {
              className: 'lit-input',
              value: summaryPath,
              onChange: (event) => onSummaryChange(event.target.value),
              placeholder: 'E:\\...\\summary.revised.json',
              disabled: busy,
            }),
            h('div', { className: 'lit-import-note' }, '只导入 PDF 时可以留空；之后再由 Agent 或你补总结。')
          ),
          h(
            'div',
            { className: 'lit-modal-actions' },
            h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onClose, disabled: busy }, '取消'),
            h(
              'button',
              { type: 'button', className: 'lit-btn lit-btn-primary', onClick: onSubmit, disabled: busy || (!file && !path.trim()) },
              h(Icon, { name: busy ? 'refresh' : 'plus', size: 13 }),
              busy ? '导入中…' : '导入'
            )
          )
        )
      );
    }

    function ImportCenterModal({ onClose, onImported }) {
      const [tab, setTab] = useState('pdf');
      const [files, setFiles] = useState([]);
      const [manual, setManual] = useState({ title: '', authors: '', year: '', venue: '', doi: '', abstract: '' });
      const [bibFormat, setBibFormat] = useState('ris');
      const [bibText, setBibText] = useState('');
      const [busy, setBusy] = useState(false);
      const [message, setMessage] = useState('');
      const [result, setResult] = useState(null);
      const api = `${LIT_DEMO_API_BASE}`;
      const setManualField = (key, value) => setManual((previous) => ({ ...previous, [key]: value }));

      const importPdfs = async () => {
        if (!files.length || busy) return;
        setBusy(true);
        setResult(null);
        const imported = [];
        const failures = [];
        const warnings = [];
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          setMessage(`正在解析 ${index + 1}/${files.length}：${file.name}`);
          try {
            const params = new URLSearchParams({ filename: file.name });
            const response = await fetch(`${api}/api/import-upload?${params.toString()}`, {
              method: 'POST',
              headers: { 'content-type': 'application/pdf' },
              body: await file.arrayBuffer(),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
            imported.push(body.paper);
            if (body.needs_metadata_review) {
              warnings.push(`${file.name} 的标题/期刊/作者可能未正确识别（${body.paper?.title || '未命名'}）`);
            }
          } catch (error) {
            failures.push(`${file.name}：${error.message}`);
          }
        }
        setBusy(false);
        setMessage('');
        setResult({ kind: 'pdf', imported, failures, warnings });
        if (imported.length) onImported(imported[0]);
        if (!failures.length) setFiles([]);
      };

      const importManual = async () => {
        if (!manual.title.trim() || busy) return;
        setBusy(true);
        setMessage('正在写入文献库…');
        try {
          const response = await fetch(`${api}/api/discover/import-metadata`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              title: manual.title,
              authors: manual.authors,
              year: manual.year,
              journal: manual.venue,
              venue: manual.venue,
              doi: manual.doi,
              abstract: manual.abstract,
            }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setResult({ kind: 'manual', imported: [body.paper], failures: [] });
          onImported(body.paper);
        } catch (error) {
          setResult({ kind: 'manual', imported: [], failures: [error.message] });
        } finally {
          setBusy(false);
          setMessage('');
        }
      };

      const lookupDoi = async () => {
        const doi = manual.doi.trim();
        if (!doi || busy) return;
        setBusy(true);
        setMessage('正在通过 DOI 查询 Crossref…');
        try {
          const response = await fetch(`${api}/api/papers/lookup-doi`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ doi }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          const metadata = body.metadata || {};
          setManual((previous) => ({
            ...previous,
            title: metadata.title || previous.title,
            authors: metadata.authors || previous.authors,
            year: metadata.year ? String(metadata.year) : previous.year,
            venue: metadata.venue || previous.venue,
            doi: metadata.doi || previous.doi,
            abstract: metadata.abstract || previous.abstract,
          }));
          setMessage('DOI 查询完成，可检查后导入。');
        } catch (error) {
          setMessage(`DOI 查询失败：${error.message}`);
        } finally {
          setBusy(false);
        }
      };

      const importBibliography = async () => {
        if (!bibText.trim() || busy) return;
        setBusy(true);
        setResult(null);
        setMessage('正在解析文献记录…');
        try {
          const response = await fetch(`${api}/api/import/bibliography`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ format: bibFormat, text: bibText }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setResult({
            kind: 'bibliography',
            imported: body.papers || [],
            failures: [],
            parsed: body.parsed,
            skipped: body.skipped_records || [],
            errors: body.errors || [],
          });
          if (body.papers?.length) onImported(body.papers[0]);
          setBibText('');
        } catch (error) {
          setResult({ kind: 'bibliography', imported: [], failures: [error.message], parsed: 0, skipped: [], errors: [] });
        } finally {
          setBusy(false);
          setMessage('');
        }
      };

      const tabButton = (id, label) =>
        h(
          'button',
          {
            type: 'button',
            className: tab === id ? 'lit-btn lit-btn-primary' : 'lit-btn lit-btn-ghost',
            onClick: () => {
              setTab(id);
              setResult(null);
              setMessage('');
            },
            disabled: busy,
          },
          label
        );

      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && !busy) onClose();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-import-center', role: 'dialog', 'aria-modal': 'true' },
          h(
            'div',
            { className: 'lit-modal-head' },
            h(
              'div',
              null,
              h('div', { className: 'lit-eyebrow' }, '导入'),
              h('h2', { className: 'lit-modal-title' }, '批量导入与文献记录'),
              h('div', { className: 'lit-modal-sub', style: { margin: '6px 0 0' } }, 'PDF 解析失败时可改用手动元数据、DOI、RIS 或 EndNote。')
            ),
            h('button', { className: 'lit-icon-btn', type: 'button', title: '关闭', onClick: onClose, disabled: busy }, h(Icon, { name: 'x', size: 16 }))
          ),
          h(
            'div',
            { className: 'lit-import-tabs' },
            tabButton('pdf', 'PDF（可多选）'),
            tabButton('manual', '手动 / DOI'),
            tabButton('bibliography', 'RIS / EndNote')
          ),
          busy ? h('div', { className: 'lit-import-progress' }, message || '处理中…') : null,
          tab === 'pdf'
            ? h(
                'div',
                { className: 'lit-import-form' },
                h(
                  'label',
                  { className: 'lit-dropzone' },
                  h('input', {
                    type: 'file',
                    accept: 'application/pdf,.pdf',
                    multiple: true,
                    style: { display: 'none' },
                    onChange: (event) => setFiles(Array.from(event.target.files || [])),
                    disabled: busy,
                  }),
                  h(Icon, { name: 'plus', size: 20 }),
                  h('div', { className: 'lit-dropzone-title' }, files.length ? `已选择 ${files.length} 个 PDF` : '拖入或选择多个 PDF'),
                  h('div', { className: 'lit-dropzone-sub' }, files.length ? files.map((file) => file.name).join('、') : '逐个解析，解析失败的文件会在结果中列出')
                ),
                h(
                  'div',
                  { className: 'lit-import-file-actions' },
                  h('button', { type: 'button', className: 'lit-btn lit-btn-primary', disabled: !files.length || busy, onClick: importPdfs }, '开始导入')
                )
              )
            : tab === 'manual'
              ? h(
                  'div',
                  { className: 'lit-import-form' },
                  h('label', { className: 'lit-field-label' }, '标题'),
                  h('input', { className: 'lit-input', value: manual.title, onChange: (event) => setManualField('title', event.target.value) }),
                  h('label', { className: 'lit-field-label' }, '作者'),
                  h('input', { className: 'lit-input', value: manual.authors, onChange: (event) => setManualField('authors', event.target.value) }),
                  h(
                    'div',
                    { className: 'lit-import-inline' },
                    h('input', { className: 'lit-input', placeholder: '年份', value: manual.year, onChange: (event) => setManualField('year', event.target.value) }),
                    h('input', { className: 'lit-input', placeholder: '期刊', value: manual.venue, onChange: (event) => setManualField('venue', event.target.value) })
                  ),
                  h(
                    'div',
                    { className: 'lit-import-inline' },
                    h('input', { className: 'lit-input', placeholder: 'DOI', value: manual.doi, onChange: (event) => setManualField('doi', event.target.value) }),
                    h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', disabled: busy || !manual.doi.trim(), onClick: lookupDoi }, '按 DOI 查询')
                  ),
                  h('label', { className: 'lit-field-label' }, '摘要'),
                  h('textarea', { className: 'lit-textarea', rows: 4, value: manual.abstract, onChange: (event) => setManualField('abstract', event.target.value) }),
                  h('button', { type: 'button', className: 'lit-btn lit-btn-primary', disabled: busy || !manual.title.trim(), onClick: importManual }, '写入文献库')
                )
              : h(
                  'div',
                  { className: 'lit-import-form' },
                  h(
                    'div',
                    { className: 'lit-import-inline' },
                    h(
                      'select',
                      { className: 'lit-select', value: bibFormat, onChange: (event) => setBibFormat(event.target.value) },
                      h('option', { value: 'ris' }, 'RIS'),
                      h('option', { value: 'endnote' }, 'EndNote')
                    ),
                    h(
                      'label',
                      { className: 'lit-btn lit-btn-ghost' },
                      '选择文件',
                      h('input', {
                        type: 'file',
                        accept: '.ris,.enw,.nbib,.txt',
                        style: { display: 'none' },
                        onChange: async (event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            setBibText(await file.text());
                            setBibFormat(/\.(enw|nbib)$/i.test(file.name) ? 'endnote' : 'ris');
                          }
                          event.target.value = '';
                        },
                      })
                    )
                  ),
                  h('textarea', {
                    className: 'lit-textarea',
                    rows: 10,
                    value: bibText,
                    placeholder: '粘贴 RIS 或 EndNote 导出内容',
                    onChange: (event) => setBibText(event.target.value),
                  }),
                  h('button', { type: 'button', className: 'lit-btn lit-btn-primary', disabled: busy || !bibText.trim(), onClick: importBibliography }, '导入文献')
                ),
          result
            ? h(
                'div',
                { className: 'lit-import-result' },
                h('div', { className: 'lit-import-result-title' }, `成功 ${result.imported?.length || 0} 条`),
                result.kind === 'bibliography'
                  ? h('div', { className: 'lit-import-result-sub' }, `解析 ${result.parsed || 0} 条，重复跳过 ${result.skipped?.length || 0} 条`)
                  : null,
                result.imported?.slice(0, 8).map((paper) => h('div', { key: paper.id, className: 'lit-import-result-row' }, paper.title)),
                result.warnings?.length || result.failures?.length
                  ? h(
                      'div',
                      null,
                      ...(result.warnings || []).map((warning, index) =>
                        h('div', { key: `w${index}`, className: 'lit-import-result-sub' }, `需检查：${warning}`)
                      ),
                      ...(result.failures || []).map((failure, index) =>
                        h('div', { key: `f${index}`, className: 'lit-import-result-error' }, failure)
                      ),
                      h(
                        'button',
                        { type: 'button', className: 'lit-btn lit-btn-ghost', style: { marginTop: '8px' }, onClick: () => { setTab('manual'); setResult(null); } },
                        '改用手动元数据 / DOI'
                      )
                    )
                  : null,
                result.errors?.length
                  ? result.errors.map((error, index) => h('div', { key: `e${index}`, className: 'lit-import-result-error' }, `${error.title || '未命名'}：${error.error}`))
                  : null
              )
            : null,
          h(
            'div',
            { className: 'lit-modal-actions' },
            h('button', { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onClose, disabled: busy }, '关闭')
          )
        )
      );
    }

    function PdfViewerModal({ paper, page, onClose, onOpenExternal }) {
      const src = `${LIT_DEMO_API_BASE}/api/papers/${encodeURIComponent(paper.id)}/pdf#page=${page || 1}`;
      return h(
        'div',
        {
          className: 'lit-modal-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'lit-modal lit-pdf-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'PDF 预览' },
          h(
            'div',
            { className: 'lit-pdf-modal-head' },
            h(
              'div',
              { className: 'lit-pdf-modal-title' },
              h('div', { className: 'lit-eyebrow' }, `PDF · page ${page || 1}`),
              h('div', { className: 'lit-pdf-modal-name' }, paper.title)
            ),
            h(
              'div',
              { className: 'lit-pdf-modal-actions' },
              h(
                'button',
                { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: onOpenExternal },
                h(Icon, { name: 'external', size: 13 }),
                '默认阅读器'
              ),
              h('button', { type: 'button', className: 'lit-icon-btn', title: '关闭', onClick: onClose }, h(Icon, { name: 'x', size: 16 }))
            )
          ),
          h('iframe', {
            className: 'lit-pdf-frame',
            src,
            title: paper.title,
            allow: 'fullscreen',
          }),
          h('div', { className: 'lit-pdf-modal-note' }, '如果内嵌预览空白，说明 PDF 查看器不允许被嵌入；点“默认阅读器”用系统阅读器打开。')
        )
      );
    }

    const CSS = `
      .lit-root {
        height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        position: relative;
        overflow: hidden;
        background-color: var(--dsw-alias-bg-base, #111820);
        background-image: linear-gradient(var(--dsw-alias-bg-base, #111820), var(--dsw-alias-bg-base, #111820));
        color: var(--dsw-alias-label-primary, #e8eef5);
        font-family: inherit;
        font-size: 13px;
      }
      .lit-root * { box-sizing: border-box; }
      .lit-root button, .lit-root input, .lit-root textarea, .lit-root select { font: inherit; }
      .lit-root button { cursor: pointer; }
      .lit-root button:disabled { cursor: not-allowed; opacity: .45; }
      .lit-header {
        flex: 0 0 auto;
        min-height: 62px;
        padding: 12px 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
        background-color: var(--dsw-alias-bg-layer-1, #17222d);
        background-image: linear-gradient(var(--dsw-alias-bg-layer-1, #17222d), var(--dsw-alias-bg-layer-1, #17222d));
      }
      .lit-brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
      .lit-brand-mark {
        width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center;
        color: var(--dsw-alias-brand-primary, #9fd0ff); background: rgba(114,183,255,.12); border: 1px solid rgba(114,183,255,.28);
      }
      .lit-brand-text { min-width: 0; }
      .lit-title { font-size: 16px; font-weight: 650; letter-spacing: .01em; display: flex; align-items: center; gap: 8px; }
      .lit-subtitle { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 11.5px; margin-top: 3px; }
      .lit-badge-demo {
        font-size: 10px; font-weight: 700; letter-spacing: .08em; padding: 2px 6px; border-radius: 5px;
        color: #ffd166; background: rgba(255,209,102,.12); border: 1px solid rgba(255,209,102,.32);
      }
      .lit-header-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
      .lit-dirty {
        color: var(--dsw-alias-state-warn-primary, #f5c451); font-size: 11.5px; white-space: nowrap;
        padding: 4px 8px; border-radius: 6px; background: rgba(245,196,81,.08);
      }
      .lit-citation-action { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
      .lit-save-state {
        color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10px; white-space: nowrap;
        padding: 3px 7px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12));
      }
      .lit-save-state-saved { color: #7fe0b0; border-color: rgba(127,224,176,.28); }
      .lit-save-state-saving { color: #f5c451; border-color: rgba(245,196,81,.28); }
      .lit-save-state-error { color: #ff9f9f; border-color: rgba(255,159,159,.28); }
      .lit-tabs {
        flex: 0 0 auto; display: flex; align-items: center; gap: 2px;
        padding: 0 14px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
        background-color: var(--dsw-alias-bg-base, #111820);
        background-image: linear-gradient(var(--dsw-alias-bg-base, #111820), var(--dsw-alias-bg-base, #111820));
      }
      .lit-tab {
        display: inline-flex; align-items: center; gap: 7px; border: 0; background: transparent;
        color: var(--dsw-alias-label-secondary, #92a0ae); padding: 11px 12px 10px; border-bottom: 2px solid transparent;
      }
      .lit-tab:hover { color: var(--dsw-alias-label-primary, #e8eef5); }
      .lit-tab-active { color: var(--dsw-alias-label-primary, #e8eef5); border-bottom-color: var(--dsw-alias-brand-primary, #72b7ff); }
      .lit-tab-count {
        min-width: 18px; padding: 1px 5px; border-radius: 9px; font-size: 10px; text-align: center;
        color: var(--dsw-alias-label-secondary, #92a0ae);
        background-color: var(--dsw-alias-bg-layer-2, #22303d);
        background-image: linear-gradient(var(--dsw-alias-bg-layer-2, #22303d), var(--dsw-alias-bg-layer-2, #22303d));
      }
      .lit-demo-banner {
        flex: 0 0 auto; display: flex; align-items: center; gap: 7px;
        padding: 7px 18px; color: #d8b56a; background: rgba(245,196,81,.055);
        border-bottom: 1px solid rgba(245,196,81,.13); font-size: 11.5px;
      }
      .lit-real-banner { color: #7fe0b0; background: rgba(127,224,176,.06); border-bottom-color: rgba(127,224,176,.16); }
      .lit-content { flex: 1 1 auto; min-height: 0; position: relative; }
      .lit-library {
        height: 100%; display: grid; min-height: 0;
        grid-template-columns:
          var(--lit-groups-width, 240px)
          var(--lit-list-width, 360px)
          minmax(0, 1fr);
      }
      .lit-groups-pane {
        min-height: 0; display: flex; flex-direction: column;
        border-right: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
        background-color: var(--dsw-alias-bg-layer-1, #17222d);
        background-image: linear-gradient(var(--dsw-alias-bg-layer-1, #17222d), var(--dsw-alias-bg-layer-1, #17222d));
      }
      .lit-groups-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 7px; padding: 14px 12px 7px; }
      .lit-groups-title { font-size: 13px; font-weight: 650; margin-top: 3px; }
      .lit-groups-hint { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 9.5px; line-height: 1.45; padding: 0 12px 9px; }
      .lit-groups-list { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 3px 8px 8px; }
      .lit-groups-footer { padding: 9px 12px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08)); }
      .lit-groups-footer .lit-btn { width: 100%; }
      .lit-group-filter {
        display: flex; align-items: center; gap: 7px; width: 100%; border: 1px solid transparent;
        background: transparent; color: var(--dsw-alias-label-secondary, #92a0ae);
        padding: 7px 7px; border-radius: 7px; text-align: left; cursor: pointer; font-size: 11px;
      }
      .lit-group-filter:hover { background: var(--dsw-alias-bg-layer-2, #22303d); }
      .lit-group-filter-active { background: rgba(114,183,255,.11); border-color: rgba(114,183,255,.22); color: var(--dsw-alias-label-primary, #e8eef5); }
      .lit-group-filter input { accent-color: var(--dsw-alias-brand-primary, #72b7ff); margin: 0; cursor: pointer; }
      .lit-mode-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 0 6px 5px; }
      .lit-mode-pill {
        font-size: 9px; color: var(--dsw-alias-label-secondary, #92a0ae); border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12));
        border-radius: 999px; padding: 1px 6px;
      }
      .lit-mode-pill-on { color: var(--dsw-alias-brand-primary, #9fd0ff); background: rgba(114,183,255,.12); border-color: rgba(114,183,255,.32); }
      .lit-mode-hint { color: var(--dsw-alias-label-secondary, #6f7f8e); font-size: 8.5px; }
      .lit-cancel-multi { border: 0; background: transparent; color: #ff9f9f; font-size: 9px; padding: 1px 3px; border-radius: 4px; }
      .lit-cancel-multi:hover { background: rgba(255,159,159,.1); }
      .lit-logic-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 3px 6px 8px; }
      .lit-logic-label { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 9.5px; }
      .lit-logic-toggle { display: flex; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.14)); border-radius: 6px; overflow: hidden; }
      .lit-logic-button { border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 9px; padding: 3px 7px; }
      .lit-logic-button:hover { color: var(--dsw-alias-label-primary, #e8eef5); }
      .lit-logic-button-on { color: var(--dsw-alias-brand-primary, #9fd0ff); background: rgba(114,183,255,.14); }
      .lit-group-filter-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lit-manage-btn { padding: 4px 6px; font-size: 10px; }
      .lit-articles-pane {
        min-height: 0; display: flex; flex-direction: column;
        border-right: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
        background-color: var(--dsw-alias-bg-base, #111820);
        background-image: linear-gradient(var(--dsw-alias-bg-base, #111820), var(--dsw-alias-bg-base, #111820));
      }
      .lit-articles-head { padding: 12px 12px 9px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08)); }
      .lit-articles-toolbar { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
      .lit-select-all { display: inline-flex; align-items: center; gap: 5px; color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10.5px; cursor: pointer; }
      .lit-select-all input { accent-color: var(--dsw-alias-brand-primary, #72b7ff); margin: 0; }
      .lit-articles-count { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10px; margin-left: auto; }
      .lit-list-hint { padding: 6px 12px; color: var(--dsw-alias-label-secondary, #6f7f8e); font-size: 9.5px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.06)); }
      .lit-bulk-bar {
        display: flex; align-items: center; gap: 3px; flex-wrap: wrap;
        padding: 6px 9px; border-bottom: 1px solid rgba(114,183,255,.2); background: rgba(114,183,255,.08);
      }
      .lit-bulk-label { color: var(--dsw-alias-brand-primary, #9fd0ff); font-size: 10.5px; font-weight: 600; margin-right: auto; }
      .lit-bulk-btn {
        display: inline-flex; align-items: center; gap: 3px; border: 0; background: transparent;
        color: var(--dsw-alias-label-secondary, #a4b2c0); font-size: 10px; padding: 3px 5px; border-radius: 5px;
      }
      .lit-bulk-btn:hover { color: var(--dsw-alias-label-primary, #e8eef5); background: rgba(255,255,255,.06); }
      .lit-bulk-danger { color: var(--dsw-alias-state-error-primary, #ff9f9f); }
      .lit-bulk-group { position: relative; display: inline-flex; }
      .lit-bulk-group-menu {
        position: absolute; left: 0; top: calc(100% + 4px); z-index: 30; min-width: 220px;
        padding: 6px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.16));
        background: var(--dsw-alias-bg-layer-2, #1c2834); box-shadow: 0 12px 28px rgba(0,0,0,.35);
      }
      .lit-bulk-new-group { display: flex; gap: 4px; margin-top: 5px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,.08); }
      .lit-bulk-new-group .lit-input { height: 25px; padding: 3px 6px; font-size: 10px; }
      .lit-paper-row { display: flex; gap: 7px; align-items: flex-start; }
      .lit-paper-row-check { padding-top: 2px; }
      .lit-paper-row-check input { accent-color: var(--dsw-alias-brand-primary, #72b7ff); margin: 0; }
      .lit-paper-row-main { flex: 1 1 auto; min-width: 0; }
      .lit-paper-row-selected { border-color: rgba(114,183,255,.48) !important; background-color: rgba(114,183,255,.1); }
      .lit-group-pane {
        position: relative;
        min-height: 0; overflow: auto; padding: 13px;
        border-right: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
        background-color: var(--dsw-alias-bg-layer-1, #17222d);
        background-image: linear-gradient(var(--dsw-alias-bg-layer-1, #17222d), var(--dsw-alias-bg-layer-1, #17222d));
      }
      .lit-column-resizer {
        position: absolute; z-index: 12; top: 0; right: -4px; width: 8px; height: 100%;
        cursor: col-resize; touch-action: none; background: transparent;
      }
      .lit-column-resizer:hover, .lit-column-resizer:active {
        background: linear-gradient(to right, transparent 2px, rgba(114,183,255,.55) 2px, rgba(114,183,255,.55) 6px, transparent 6px);
      }
      .lit-listpane {
        position: relative;
        min-height: 0; display: flex; flex-direction: column;
        border-right: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
        background-color: var(--dsw-alias-bg-layer-1, #17222d);
        background-image: linear-gradient(var(--dsw-alias-bg-layer-1, #17222d), var(--dsw-alias-bg-layer-1, #17222d));
      }
      .lit-listpane-head { padding: 13px 13px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08)); }
      .lit-search { position: relative; }
      .lit-search-icon { position: absolute; left: 10px; top: 9px; color: var(--dsw-alias-label-secondary, #92a0ae); }
      .lit-search-state { position: absolute; right: 9px; top: 9px; color: var(--dsw-alias-brand-primary, #72b7ff); font-size: 9px; pointer-events: none; }
      .lit-input {
        width: 100%; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12));
        background-color: var(--dsw-alias-bg-base, #111820);
        background-image: linear-gradient(var(--dsw-alias-bg-base, #111820), var(--dsw-alias-bg-base, #111820));
        border-radius: 8px; padding: 8px 10px 8px 32px;
        outline: none; color: var(--dsw-alias-label-primary, #e8eef5);
      }
      .lit-input:focus, .lit-textarea:focus, .lit-select:focus { border-color: var(--dsw-alias-brand-primary, #72b7ff); }
      .lit-section-label { margin: 13px 2px 7px; color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10.5px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
      .lit-group-list { display: flex; flex-direction: column; gap: 2px; }
      .lit-group-item {
        display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent;
        color: var(--dsw-alias-label-secondary, #92a0ae); padding: 7px 8px; border-radius: 7px; text-align: left;
      }
      .lit-group-item:hover { background: var(--dsw-alias-bg-layer-2, #22303d); color: var(--dsw-alias-label-primary, #e8eef5); }
      .lit-group-item-active { background: var(--dsw-alias-bg-layer-2, #22303d); color: var(--dsw-alias-label-primary, #e8eef5); }
      .lit-group-count { margin-left: auto; font-size: 10.5px; color: var(--dsw-alias-label-secondary, #92a0ae); }
      .lit-list-actions { margin-top: 11px; display: flex; gap: 7px; }
      .lit-list { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 8px; }
      .lit-paper-row {
        padding: 10px 10px 9px; margin-bottom: 4px; border-radius: 9px; border: 1px solid transparent;
        cursor: pointer; outline: none;
      }
      .lit-paper-row:hover { background: var(--dsw-alias-bg-layer-2, #22303d); }
      .lit-paper-row:focus-visible { border-color: var(--dsw-alias-brand-primary, #72b7ff); }
      .lit-paper-row-active {
        background-color: var(--dsw-alias-bg-layer-2, #22303d);
        background-image: linear-gradient(var(--dsw-alias-bg-layer-2, #22303d), var(--dsw-alias-bg-layer-2, #22303d));
        border-color: var(--dsw-alias-border-l1, rgba(255,255,255,.12));
      }
      .lit-paper-row-title { font-size: 12.5px; line-height: 1.45; font-weight: 600; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .lit-paper-row-meta { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10.5px; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .lit-paper-row-journal { margin-top: 5px; }
      .lit-detail-journal { margin-top: 9px; }
      .lit-discovery-journal { margin-top: 5px; }
      .lit-journal-badge {
        display: inline-flex; align-items: center; gap: 5px; max-width: 100%;
        padding: 2px 6px; border-radius: 5px; border: 1px solid rgba(114,183,255,.24);
        background: rgba(114,183,255,.09); color: #b9d9ff; font-size: 9.5px; line-height: 1.35;
        vertical-align: middle;
      }
      .lit-journal-badge.lit-journal-q1 { color: #f5d58a; border-color: rgba(245,196,81,.35); background: rgba(245,196,81,.1); }
      .lit-journal-badge.lit-journal-q2 { color: var(--dsw-alias-brand-primary, #9fd0ff); border-color: rgba(114,183,255,.35); background: rgba(114,183,255,.1); }
      .lit-journal-badge.lit-journal-q3 { color: #9fe0c8; border-color: rgba(127,224,176,.3); background: rgba(127,224,176,.08); }
      .lit-journal-badge.lit-journal-q4 { color: #b3bdca; border-color: rgba(179,189,202,.24); background: rgba(179,189,202,.07); }
      .lit-journal-name { min-width: 0; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lit-journal-compact .lit-journal-name { max-width: 190px; }
      .lit-journal-quartile { font-size: 8.5px; font-weight: 700; letter-spacing: .04em; opacity: .9; }
      .lit-if-tag {
        flex: 0 0 auto; padding: 1px 4px; border-radius: 4px;
        color: #b7f0d2; background: rgba(127,224,176,.11); border: 1px solid rgba(127,224,176,.2);
        font-size: 8.5px; font-variant-numeric: tabular-nums; white-space: nowrap;
      }
      .lit-if-tag.lit-if-missing { color: #8d99a6; background: rgba(255,255,255,.035); border-color: rgba(255,255,255,.08); }
      .lit-meta-only { color: #e0c48a !important; border-color: rgba(224,196,138,.28) !important; }
      .lit-paper-row-snippet {
        color: var(--dsw-alias-label-secondary, #7f8c99); font-size: 9.5px; line-height: 1.45; margin-top: 5px;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
      .lit-paper-row-bottom { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 7px; }
      .lit-chip-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; min-width: 0; }
      .lit-chip {
        display: inline-flex; align-items: center; gap: 5px; border: 1px solid transparent; border-radius: 999px;
        padding: 2px 7px; font-size: 10.5px; white-space: nowrap;
      }
      .lit-chip-small { padding: 1px 5px; font-size: 9.5px; }
      .lit-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
      .lit-mini-status { font-size: 9.5px; color: #7fe0b0; white-space: nowrap; }
      .lit-mini-status.muted { color: var(--dsw-alias-label-secondary, #92a0ae); }
      .lit-mini-status.ai { color: #f5c451; }
      .lit-mini-status.ai-summary { color: var(--dsw-alias-brand-primary, #9fd0ff); }
      .lit-ai-badge { color: var(--dsw-alias-brand-primary, #9fd0ff) !important; border-color: rgba(114,183,255,.34) !important; }
      .lit-detailpane {
        min-width: 0; min-height: 0; overflow: hidden;
        background-color: var(--dsw-alias-bg-base, #111820);
        background-image: linear-gradient(var(--dsw-alias-bg-base, #111820), var(--dsw-alias-bg-base, #111820));
      }
      .lit-detail-grid { height: 100%; min-height: 0; display: grid; }
      .lit-detail-main { min-height: 0; overflow: auto; padding: 24px 28px 40px; }
      .lit-detail-main > * { width: 100%; max-width: none; }
      .lit-paper-head { position: relative; }
      .lit-eyebrow { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10.5px; letter-spacing: .07em; text-transform: uppercase; font-weight: 650; }
      .lit-paper-kicker { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 11.5px; margin-bottom: 7px; }
      .lit-paper-title { margin: 0; font-size: 22px; line-height: 1.3; letter-spacing: -.01em; font-weight: 680; max-width: none; }
      .lit-paper-meta { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 11.5px; margin-top: 7px; }
      .lit-paper-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 14px; }
      .lit-group-menu-wrap { position: relative; display: inline-flex; }
      .lit-group-menu {
        position: absolute; top: calc(100% + 6px); left: 0; z-index: 30; min-width: 190px;
        background-color: var(--dsw-alias-bg-layer-2, #1c2834);
        background-image: linear-gradient(var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2, #1c2834)), var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2, #1c2834)));
        border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.16));
        border-radius: 9px; box-shadow: 0 12px 30px rgba(0,0,0,.35); padding: 8px;
      }
      .lit-group-menu-detail { max-height: none; overflow: visible; min-width: 220px; }
      .lit-group-options-scroll { max-height: 190px; overflow-y: auto; overscroll-behavior: contain; }
      .lit-group-option { display: flex; align-items: center; gap: 8px; padding: 6px; border-radius: 6px; cursor: pointer; }
      .lit-group-option:hover { background: var(--dsw-alias-bg-layer-2, #22303d); }
      .lit-group-option input { accent-color: var(--dsw-alias-brand-primary, #72b7ff); }
      .lit-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        border-radius: 7px; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12));
        background-color: var(--dsw-alias-bg-layer-2, #22303d);
        background-image: linear-gradient(var(--dsw-alias-bg-layer-2, #22303d), var(--dsw-alias-bg-layer-2, #22303d));
        color: var(--dsw-alias-label-primary, #e8eef5);
        padding: 6px 9px; font-size: 11.5px; white-space: nowrap;
      }
      .lit-btn:hover { filter: brightness(1.08); }
      .lit-btn-primary {
        background-color: #2563eb;
        background-image: none;
        border-color: #2563eb;
        color: #ffffff;
        font-weight: 650;
      }
      .lit-btn-ghost { background: transparent; }
      .lit-btn-ghost:hover { background-color: var(--dsw-alias-bg-layer-2, #22303d); background-image: none; filter: none; }
      .lit-btn-danger { color: var(--dsw-alias-state-error-primary, #ff8c8c); }
      .lit-icon-btn {
        width: 26px; height: 26px; display: inline-grid; place-items: center; padding: 0;
        border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary, #92a0ae);
      }
      .lit-icon-btn:hover { background: var(--dsw-alias-bg-layer-2, #22303d); color: var(--dsw-alias-label-primary, #e8eef5); }
      .lit-abstract { margin-top: 17px; color: var(--dsw-alias-label-secondary, #a4b2c0); line-height: 1.65; font-size: 12px; max-width: none; }
      .lit-summary { margin-top: 23px; max-width: none; }
      .lit-summary-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-bottom: 9px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09)); }
      .lit-summary-title { font-size: 14px; font-weight: 650; }
      .lit-profile { display: flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10.5px; flex-wrap: wrap; }
      .lit-soft-badge { font-size: 9.5px; color: var(--dsw-alias-label-secondary, #92a0ae); border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12)); border-radius: 5px; padding: 1px 5px; white-space: nowrap; }
      .lit-field { margin-top: 15px; }
      .lit-field-head { display: flex; align-items: baseline; gap: 7px; margin-bottom: 6px; }
      .lit-field-label { font-size: 12px; font-weight: 650; }
      .lit-field-hint { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10.5px; margin-left: auto; }
      .lit-textarea {
        width: 100%; min-height: 56px; resize: vertical; border-radius: 8px; padding: 9px 10px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12));
        background-color: var(--dsw-alias-bg-layer-1, #17222d);
        background-image: linear-gradient(var(--dsw-alias-bg-layer-1, #17222d), var(--dsw-alias-bg-layer-1, #17222d));
        color: var(--dsw-alias-label-primary, #e8eef5);
        line-height: 1.55; outline: none;
      }
      .lit-textarea::placeholder { color: var(--dsw-alias-label-secondary, #6f7f8e); }
      .lit-claim {
        border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.1)); border-radius: 9px;
        background-color: var(--dsw-alias-bg-layer-1, #17222d);
        background-image: linear-gradient(var(--dsw-alias-bg-layer-1, #17222d), var(--dsw-alias-bg-layer-1, #17222d));
        padding: 10px; margin-top: 8px;
      }
      .lit-claim-head { display: flex; align-items: center; gap: 7px; margin-bottom: 7px; }
      .lit-claim-index { font-size: 10.5px; color: var(--dsw-alias-label-secondary, #92a0ae); }
      .lit-status { font-size: 9.5px; border-radius: 999px; padding: 1px 6px; border: 1px solid transparent; white-space: nowrap; }
      .lit-status-ok { color: #7fe0b0; background: rgba(127,224,176,.1); border-color: rgba(127,224,176,.25); }
      .lit-status-warn { color: #f5c451; background: rgba(245,196,81,.1); border-color: rgba(245,196,81,.28); }
      .lit-status-muted { color: var(--dsw-alias-label-secondary, #92a0ae); background: rgba(146,160,174,.1); border-color: rgba(146,160,174,.22); }
      .lit-claim-head .lit-icon-btn { margin-left: auto; }
      .lit-claim .lit-textarea {
        min-height: 44px;
        background-color: var(--dsw-alias-bg-base, #111820);
        background-image: linear-gradient(var(--dsw-alias-bg-base, #111820), var(--dsw-alias-bg-base, #111820));
      }
      .lit-quote-row { display: flex; align-items: flex-start; gap: 8px; margin-top: 7px; }
      .lit-quote { flex: 1 1 auto; color: var(--dsw-alias-label-secondary, #a4b2c0); font-size: 11px; line-height: 1.55; border-left: 2px solid var(--dsw-alias-border-l2, rgba(255,255,255,.16)); padding-left: 8px; min-height: 18px; }
      .lit-evidence-chip {
        display: inline-flex; align-items: center; gap: 4px; border: 1px solid rgba(114,183,255,.3);
        color: var(--dsw-alias-brand-primary, #9fd0ff); background: rgba(114,183,255,.1); border-radius: 999px; padding: 2px 7px; font-size: 10px; white-space: nowrap;
      }
      .lit-warn-line { color: #d8b56a; font-size: 10.5px; margin-top: 6px; }
      .lit-empty { display: grid; place-items: center; min-height: 260px; color: var(--dsw-alias-label-secondary, #92a0ae); text-align: center; padding: 30px; }
      .lit-save-line { display: flex; align-items: center; gap: 7px; margin-top: 22px; color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10.5px; }
      .lit-save-dot { width: 6px; height: 6px; border-radius: 50%; background: #7fe0b0; }
      .lit-evidence {
        min-height: 0; overflow: auto; padding: 18px 16px 24px;
        border-left: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.1));
        background-color: var(--dsw-alias-bg-layer-1, #17222d);
        background-image: linear-gradient(var(--dsw-alias-bg-layer-1, #17222d), var(--dsw-alias-bg-layer-1, #17222d));
      }
      .lit-evidence-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .lit-evidence-page { font-size: 24px; font-weight: 700; margin-top: 2px; }
      .lit-evidence-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10px; margin-top: 10px; }
      .lit-pdf-sim { margin-top: 13px; border-radius: 7px; overflow: hidden; border: 1px solid rgba(255,255,255,.14); background: #f4f1e8; color: #30343a; box-shadow: 0 10px 24px rgba(0,0,0,.2); }
      .lit-pdf-sim-top { font-size: 8.5px; letter-spacing: .08em; color: #7b756a; padding: 6px 9px; border-bottom: 1px solid #ddd6c7; background: #ebe6da; }
      .lit-pdf-sim-body { padding: 13px 12px 15px; }
      .lit-pdf-line { height: 4px; border-radius: 2px; background: #d7d1c4; margin-bottom: 6px; }
      .lit-pdf-highlight { border-left: 3px solid #e5a93d; background: #fff0bd; padding: 7px 8px; margin: 10px 0; font-size: 10px; line-height: 1.55; border-radius: 0 3px 3px 0; }
      .lit-quote-full { margin-top: 13px; font-size: 11.5px; line-height: 1.65; color: var(--dsw-alias-label-primary, #e8eef5); }
      .lit-evidence-actions { display: flex; gap: 7px; margin-top: 13px; flex-wrap: wrap; }
      .lit-evidence-note { margin-top: 14px; color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10px; line-height: 1.5; }
      .lit-tracking { height: 100%; display: grid; grid-template-columns: 224px 380px minmax(0, 1fr); min-height: 0; }
      .lit-feedpane {
        position: relative; overflow: hidden;
        min-height: 0; display: flex; flex-direction: column; border-right: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
        background-color: var(--dsw-alias-bg-layer-1, #17222d);
        background-image: linear-gradient(var(--dsw-alias-bg-layer-1, #17222d), var(--dsw-alias-bg-layer-1, #17222d));
      }
      .lit-feedpane-head { padding: 14px 13px 9px; }
      .lit-feed-list { padding: 2px 8px 8px; overflow: auto; }
      .lit-feed-button { display: flex; align-items: center; gap: 7px; width: 100%; text-align: left; border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #92a0ae); padding: 7px 7px; border-radius: 7px; font-size: 11px; }
      .lit-feed-button:hover { background: var(--dsw-alias-bg-layer-2, #22303d); color: var(--dsw-alias-label-primary, #e8eef5); }
      .lit-feed-button-active { background: var(--dsw-alias-bg-layer-2, #22303d); color: var(--dsw-alias-label-primary, #e8eef5); }
      .lit-feed-source-item { display: flex; align-items: center; gap: 2px; }
      .lit-feed-source-item .lit-feed-button { flex: 1 1 auto; min-width: 0; }
      .lit-feed-delete { display: inline-grid; place-items: center; width: 22px; height: 22px; flex: 0 0 auto; border: 0; border-radius: 5px; background: transparent; color: var(--dsw-alias-label-secondary, #7f8c99); }
      .lit-feed-delete:hover { color: #ff9f9f; background: rgba(255,159,159,.08); }
      .lit-unread { margin-left: auto; min-width: 18px; text-align: center; font-size: 9.5px; color: var(--dsw-alias-brand-primary, #9fd0ff); background: rgba(114,183,255,.1); border-radius: 9px; padding: 1px 5px; }
      .lit-add-feed { padding: 9px 12px 12px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08)); }
      .lit-add-feed-row { display: flex; gap: 5px; margin-top: 6px; }
      .lit-add-feed-row .lit-input { padding-left: 8px; font-size: 10.5px; }
      .lit-tracking-shell { height: 100%; min-height: 0; }
      .lit-tracking-main { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-base, #111820); }
      .lit-tracking-toolbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 13px 16px; border-bottom: 1px solid rgba(255,255,255,.08); }
      .lit-tracking-toolbar .lit-filters { margin-top: 0; }
      .lit-feed-search-input { width: 210px; height: 27px; padding: 3px 8px; font-size: 10.5px; }
      .lit-opml-actions { display: flex; gap: 5px; margin-top: 6px; }
      .lit-opml-preview-list { margin-top: 12px; max-height: 260px; overflow: auto; border-top: 1px solid rgba(255,255,255,.08); }
      .lit-opml-preview-url { padding: 5px 2px; border-bottom: 1px solid rgba(255,255,255,.055); color: #9fb2c4; font-size: 10px; overflow-wrap: anywhere; }
      .lit-opml-actions .lit-btn { flex: 1 1 0; font-size: 9.5px; padding: 4px 5px; }
      .lit-tracking-bulk { display: flex; align-items: center; gap: 5px; }
      .lit-feed-cards {
        flex: 1 1 auto; min-height: 0; overflow: auto;
        display: grid; grid-template-columns: repeat(auto-fill, 280px);
        justify-content: start; gap: 10px; padding: 14px 16px 30px; align-content: start;
      }
      .lit-feed-card {
        min-width: 0; display: flex; flex-direction: column; gap: 6px; min-height: 180px;
        padding: 11px 12px; border-radius: 9px; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.1));
        background: var(--dsw-alias-bg-layer-1, #17222d); cursor: pointer; outline: none; transition: border-color .15s, opacity .15s, background .15s;
      }
      .lit-feed-card:hover { border-color: rgba(114,183,255,.35); background: #192634; }
      .lit-feed-card-read { opacity: .58; filter: grayscale(.85); background: var(--dsw-alias-bg-base, #141d26); border-color: rgba(255,255,255,.07); }
      .lit-feed-card-saved { opacity: .5; filter: grayscale(.65); background: var(--dsw-alias-bg-base, #141d26); border-color: rgba(255,255,255,.06); }
      .lit-feed-card-saved:hover { opacity: .62; }
      .lit-feed-card-read:hover { opacity: .7; }
      .lit-feed-card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .lit-feed-kind { font-size: 9px; border-radius: 4px; padding: 1px 5px; border: 1px solid rgba(255,255,255,.12); color: var(--dsw-alias-label-secondary, #a4b2c0); white-space: nowrap; }
      .lit-ai-stars { color: #f5c451; font-size: 11px; letter-spacing: 1px; white-space: nowrap; }
      .lit-ai-score-card { margin-top: 12px; padding: 10px 11px; border: 1px solid rgba(245,196,81,.22); background: rgba(245,196,81,.055); border-radius: 7px; }
      .lit-ai-score-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .lit-ai-score-type { color: #d8c08a; font-size: 9.5px; }
      .lit-ai-score-reason { margin-top: 6px; color: #d5c39a; font-size: 11px; line-height: 1.55; }
      .lit-ai-score-why { margin-top: 4px; color: #9d9482; font-size: 10px; line-height: 1.5; }
      .lit-ai-score-modal { width: min(620px, 100%); }
      .lit-ai-search-modal { width: min(980px, 100%); max-height: 90vh; overflow: auto; }
      .lit-ai-search-page { padding: 22px 24px 40px; overflow: auto; height: 100%; box-sizing: border-box; }
      .lit-ai-search-page .lit-ai-search-results { grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
      .lit-author-page { display: flex; flex-direction: column; }
      .lit-ai-search-head { margin-bottom: 10px; }
      .lit-author-filter { margin-top: 10px; }
      .lit-author-form { display: grid; grid-template-columns: 1.1fr 1.4fr 110px auto; gap: 8px; margin-top: 8px; }
      .lit-author-year { text-align: center; }
      .lit-author-affiliation { margin-top: 10px; color: #8fbf9f; font-size: 11px; }
      .lit-author-candidates { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; margin-top: 12px; }
      .lit-author-candidate { padding: 10px 11px; border: 1px solid rgba(255,255,255,.08); border-radius: 7px; background: rgba(255,255,255,.02); }
      .lit-author-candidate-on { border-color: rgba(122,162,247,.45); background: rgba(122,162,247,.08); }
      .lit-author-name { color: #e1e8f0; font-size: 13px; font-weight: 600; }
      .lit-author-meta { color: var(--dsw-alias-label-secondary, #7f8b99); font-size: 10px; margin-top: 3px; }
      .lit-author-inst { color: #a7b4c2; font-size: 10.5px; margin-top: 3px; }
      .lit-author-candidate .lit-feed-detail-btn { margin-top: 8px; }
      .lit-author-result-head { margin-top: 14px; color: #a9c3f8; font-size: 11px; }
      .lit-author-result-actions { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
      .lit-author-summary-hint { color: #6f7c89; font-size: 9.5px; }
      .lit-author-work-card { min-height: 230px; }
      .lit-author-cite { color: var(--dsw-alias-label-secondary, #8e9aa7); font-size: 10px; white-space: nowrap; }
      .lit-saved-badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 5px; color: var(--dsw-alias-label-secondary, #7f8b99); background: rgba(255,255,255,.04); font-size: 10px; }
      .lit-author-authors { color: #73808d; font-size: 9.5px; line-height: 1.5; }
      .lit-author-abstract { color: var(--dsw-alias-label-secondary, #81909f); font-size: 10.5px; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
      .lit-author-abstract-label { display: inline-block; margin-right: 5px; padding: 0 5px; border-radius: 4px; color: #9fb5cc; background: rgba(255,255,255,.05); font-size: 9px; }
      .lit-ai-sources { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 12px; }
      .lit-ai-source { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border: 1px solid rgba(255,255,255,.09); border-radius: 999px; color: var(--dsw-alias-label-secondary, #8e9aa7); font-size: 10px; cursor: pointer; }
      .lit-ai-source input { accent-color: #7aa2f7; margin: 0; }
      .lit-ai-source-on { color: #c9d7e8; border-color: rgba(122,162,247,.38); background: rgba(122,162,247,.08); }
      .lit-ai-search-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: end; margin-top: 10px; }
      .lit-ai-search-form .lit-textarea { min-height: 72px; }
      .lit-ai-search-form .lit-btn { height: 34px; white-space: nowrap; }
      .lit-ai-search-results { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px; margin-top: 12px; }
      .lit-ai-progress { margin-top: 12px; padding: 12px; border: 1px solid rgba(122,162,247,.2); border-radius: 8px; background: rgba(122,162,247,.05); }
      .lit-ai-progress-head { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #c8d6e8; }
      .lit-ai-progress-hint { color: var(--dsw-alias-label-secondary, #7f8b99); font-size: 10px; margin-left: auto; }
      .lit-spinner { width: 12px; height: 12px; border: 2px solid rgba(122,162,247,.25); border-top-color: #7aa2f7; border-radius: 50%; display: inline-block; animation: lit-spin .8s linear infinite; }
      @keyframes lit-spin { to { transform: rotate(360deg); } }
      .lit-ai-stage-row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; }
      .lit-ai-stage { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; color: #6d7986; }
      .lit-ai-stage-dot { width: 5px; height: 5px; border-radius: 50%; background: #4a5562; }
      .lit-ai-stage-active { color: #a9c3f8; }
      .lit-ai-stage-active .lit-ai-stage-dot { background: #7aa2f7; box-shadow: 0 0 0 3px rgba(122,162,247,.15); }
      .lit-ai-stage-done { color: #8fbf9f; }
      .lit-ai-stage-done .lit-ai-stage-dot { background: #65b380; }
      .lit-ai-result-count { margin-top: 10px; color: var(--dsw-alias-label-secondary, #8e9aa7); font-size: 10px; }
      .lit-ai-loadmore { display: flex; justify-content: center; margin-top: 16px; padding-bottom: 8px; }
      .lit-ai-loadmore-end { color: #6f7c89; font-size: 10px; }
      .lit-ai-skeleton { height: 150px; border: 1px solid rgba(255,255,255,.06); border-radius: 7px; padding: 12px; background: rgba(255,255,255,.02); }
      .lit-ai-skeleton-line { height: 8px; margin-top: 8px; border-radius: 4px; background: linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.09), rgba(255,255,255,.04)); background-size: 200% 100%; animation: lit-shimmer 1.4s ease-in-out infinite; }
      .lit-ai-skeleton-title { width: 72%; height: 11px; margin-top: 0; }
      .lit-ai-skeleton-short { width: 45%; }
      @keyframes lit-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      .lit-ai-score-options { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
      .lit-ai-score-options .lit-input { width: 80px; }
      .lit-feed-kind-paper { color: var(--dsw-alias-brand-primary, #9fd0ff); border-color: rgba(114,183,255,.3); background: rgba(114,183,255,.08); }
      .lit-feed-kind-news { color: #f5d58a; border-color: rgba(245,196,81,.28); background: rgba(245,196,81,.07); }
      .lit-feed-kind-comment { color: #c8b6ff; border-color: rgba(177,156,255,.28); background: rgba(177,156,255,.07); }
      .lit-feed-card-title { font-size: 12.5px; line-height: 1.45; font-weight: 650; color: var(--dsw-alias-label-primary, #e8eef5); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .lit-feed-card-source { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 9.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lit-feed-card-summary { color: var(--dsw-alias-label-secondary, #81909f); font-size: 10.5px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .lit-feed-card-foot { margin-top: auto; display: flex; align-items: center; gap: 7px; }
      .lit-feed-detail-btn { margin-left: auto; border: 1px solid rgba(114,183,255,.25); background: rgba(114,183,255,.08); color: var(--dsw-alias-brand-primary, #9fd0ff); border-radius: 5px; padding: 3px 8px; font-size: 9.5px; }
      .lit-feed-empty-hint { padding: 6px 7px; color: var(--dsw-alias-label-secondary, #81909f); font-size: 10px; line-height: 1.5; }
      .lit-feed-nonpaper-note { margin-top: 12px; padding: 8px 9px; border-radius: 6px; border: 1px solid rgba(245,196,81,.2); background: rgba(245,196,81,.06); color: #d8c08a; font-size: 10.5px; line-height: 1.5; }
      .lit-feed-detail-modal { width: min(720px, 100%); max-height: 86vh; overflow: auto; }
      .lit-feed-edit-modal { width: min(520px, 100%); }
      .lit-feed-detail-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 9px 0 0; color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10px; }
      .lit-kind-select { height: 21px; border-radius: 4px; border: 1px solid rgba(255,255,255,.15); background: var(--dsw-alias-bg-layer-1, #17222d); color: #c9d6e3; font-size: 9.5px; padding: 0 4px; }
      .lit-feed-detail-summary { margin-top: 13px; color: var(--dsw-alias-label-secondary, #a4b2c0); font-size: 12px; line-height: 1.7; white-space: pre-wrap; }
      .lit-schedule { border-top: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08)); padding: 11px 12px 13px; }
      .lit-schedule-title { display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; color: var(--dsw-alias-label-secondary, #92a0ae); }
      .lit-schedule-row { display: flex; align-items: center; gap: 6px; margin-top: 7px; font-size: 10px; }
      .lit-schedule-name { flex: 1 1 auto; color: var(--dsw-alias-label-secondary, #a4b2c0); }
      .lit-schedule-interval { color: var(--dsw-alias-label-secondary, #92a0ae); }
      .lit-cost-dot { width: 5px; height: 5px; border-radius: 50%; }
      .lit-budget { margin-top: 10px; }
      .lit-budget-line { height: 4px; border-radius: 4px; background: var(--dsw-alias-bg-base, #111820); overflow: hidden; }
      .lit-budget-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--dsw-alias-brand-primary, #72b7ff), #f5c451); }
      .lit-budget-label { display: flex; justify-content: space-between; color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 9.5px; margin-top: 5px; }
      .lit-toggle { display: flex; align-items: center; gap: 6px; margin-top: 9px; color: var(--dsw-alias-label-secondary, #a4b2c0); font-size: 10px; }
      .lit-toggle input { accent-color: var(--dsw-alias-brand-primary, #72b7ff); }
      .lit-feedlistpane {
        min-height: 0; display: flex; flex-direction: column; border-right: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
        background-color: var(--dsw-alias-bg-base, #111820);
        background-image: linear-gradient(var(--dsw-alias-bg-base, #111820), var(--dsw-alias-bg-base, #111820));
      }
      .lit-feedlist-head { padding: 13px 13px 9px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08)); }
      .lit-filters { display: flex; gap: 4px; margin-top: 9px; }
      .lit-filter { border: 1px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary, #92a0ae); border-radius: 6px; padding: 3px 7px; font-size: 10px; }
      .lit-filter:hover { color: var(--dsw-alias-label-primary, #e8eef5); }
      .lit-filter-active { color: var(--dsw-alias-brand-primary, #9fd0ff); background: rgba(114,183,255,.1); border-color: rgba(114,183,255,.25); }
      .lit-feed-items { flex: 1 1 auto; min-height: 0; overflow: auto; }
      .lit-feed-item { padding: 11px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.07)); cursor: pointer; outline: none; }
      .lit-feed-item:hover { background: var(--dsw-alias-bg-layer-1, #17222d); }
      .lit-feed-item-active { background: var(--dsw-alias-bg-layer-1, #17222d); box-shadow: inset 2px 0 0 var(--dsw-alias-brand-primary, #72b7ff); }
      .lit-feed-item-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .lit-ai-badge { display: inline-flex; align-items: center; gap: 4px; border: 1px solid transparent; border-radius: 999px; padding: 1px 6px; font-size: 9px; white-space: nowrap; }
      .lit-feed-time { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 9.5px; }
      .lit-feed-title { margin-top: 6px; font-size: 12px; line-height: 1.4; font-weight: 600; }
      .lit-feed-source { margin-top: 4px; color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 9.5px; }
      .lit-feed-snippet { margin-top: 5px; color: var(--dsw-alias-label-secondary, #81909f); font-size: 10px; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .lit-unread-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--dsw-alias-brand-primary, #72b7ff); display: inline-block; }
      .lit-feed-item-read:not(.lit-feed-item-active) { opacity: .5; }
      .lit-feed-item-read .lit-feed-title { font-weight: 500; }
      .lit-feed-item-read .lit-feed-snippet { display: none; }
      .lit-read-label { display: inline-flex; align-items: center; gap: 4px; margin-left: 7px; color: var(--dsw-alias-label-secondary, #7f8c99); font-size: 9.5px; }
      .lit-unread-label { display: inline-flex; align-items: center; gap: 4px; margin-left: 7px; color: var(--dsw-alias-brand-primary, #9fd0ff); font-size: 9.5px; }
      .lit-feeddetail {
        min-width: 0; min-height: 0; overflow: auto; padding: 24px 28px 40px;
        background-color: var(--dsw-alias-bg-base, #111820);
        background-image: linear-gradient(var(--dsw-alias-bg-base, #111820), var(--dsw-alias-bg-base, #111820));
      }
      .lit-feeddetail-title { font-size: 21px; line-height: 1.35; font-weight: 680; margin: 7px 0; }
      .lit-feeddetail-meta { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 11px; }
      .lit-ai-card { margin-top: 18px; padding: 11px 12px; border-radius: 9px; background: rgba(114,183,255,.06); border: 1px solid rgba(114,183,255,.18); }
      .lit-ai-card-head { display: flex; align-items: center; gap: 7px; color: var(--dsw-alias-brand-primary, #9fd0ff); font-size: 11px; font-weight: 650; }
      .lit-ai-card-head .lit-ai-badge { margin-left: auto; }
      .lit-ai-reason { margin-top: 7px; color: var(--dsw-alias-label-secondary, #a4b2c0); line-height: 1.6; font-size: 11px; }
      .lit-ai-meta { margin-top: 5px; color: var(--dsw-alias-label-secondary, #6f7f8e); font-size: 9.5px; }
      .lit-feed-abstract { margin-top: 17px; color: var(--dsw-alias-label-secondary, #a4b2c0); line-height: 1.7; font-size: 12px; max-width: 780px; }
      .lit-feed-actions { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 18px; }
      .lit-graph { height: 100%; display: grid; grid-template-columns: 230px minmax(0, 1fr) 290px; min-height: 0; }
      .lit-graph-controls, .lit-graph-inspector { position: relative; }
      .lit-graph-resizer { position: absolute; z-index: 20; top: 0; width: 8px; height: 100%; cursor: col-resize; touch-action: none; }
      .lit-graph-resizer-right { right: -4px; }
      .lit-graph-resizer-left { left: -4px; }
      .lit-graph-resizer:hover {
        background: linear-gradient(to right, transparent 2px, rgba(114,183,255,.55) 2px, rgba(114,183,255,.55) 6px, transparent 6px);
      }
      .lit-graph-controls {
        min-height: 0; overflow: auto; padding: 17px 14px; border-right: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
        background-color: var(--dsw-alias-bg-layer-1, #17222d);
        background-image: linear-gradient(var(--dsw-alias-bg-layer-1, #17222d), var(--dsw-alias-bg-layer-1, #17222d));
      }
      .lit-graph-canvas {
        min-height: 0; position: relative; overflow: hidden;
        background-color: var(--dsw-alias-bg-base, #111820);
        background-image: radial-gradient(circle at 50% 45%, rgba(114,183,255,.045), transparent 55%),
          linear-gradient(var(--dsw-alias-bg-base, #111820), var(--dsw-alias-bg-base, #111820));
      }
      .lit-graph-canvas svg { width: 100%; height: 100%; display: block; }
      .lit-graph-inspector {
        min-height: 0; overflow: auto; padding: 19px 17px; border-left: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
        background-color: var(--dsw-alias-bg-layer-1, #17222d);
        background-image: linear-gradient(var(--dsw-alias-bg-layer-1, #17222d), var(--dsw-alias-bg-layer-1, #17222d));
      }
      .lit-graph-node { cursor: pointer; }
      .lit-graph-node circle { transition: opacity .15s, stroke-width .15s; }
      .lit-graph-node:hover circle { opacity: .86; }
      .lit-graph-label { fill: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10px; pointer-events: none; }
      .lit-graph-label-active { fill: var(--dsw-alias-label-primary, #e8eef5); font-weight: 650; }
      .lit-control-group { margin-bottom: 16px; }
      .lit-control-label { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 7px; }
      .lit-segment { display: flex; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12)); border-radius: 7px; overflow: hidden; }
      .lit-segment button { flex: 1 1 0; border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #92a0ae); padding: 5px 4px; font-size: 10px; }
      .lit-segment button:hover { color: var(--dsw-alias-label-primary, #e8eef5); }
      .lit-segment button.active { background: rgba(114,183,255,.14); color: var(--dsw-alias-brand-primary, #9fd0ff); }
      .lit-select {
        width: 100%; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12)); border-radius: 7px;
        background-color: var(--dsw-alias-bg-base, #111820);
        background-image: linear-gradient(var(--dsw-alias-bg-base, #111820), var(--dsw-alias-bg-base, #111820));
        color: var(--dsw-alias-label-primary, #e8eef5);
        padding: 6px 7px; font-size: 11px; outline: none;
      }
      .lit-range-row { display: flex; align-items: center; gap: 7px; }
      .lit-range-row input { flex: 1 1 auto; accent-color: var(--dsw-alias-brand-primary, #72b7ff); }
      .lit-range-value { color: var(--dsw-alias-brand-primary, #9fd0ff); font-size: 10px; min-width: 26px; text-align: right; }
      .lit-legend { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
      .lit-legend-row { display: flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary, #a4b2c0); font-size: 10px; }
      .lit-legend-dot { width: 7px; height: 7px; border-radius: 50%; }
      .lit-scope-card { margin-top: 18px; padding: 10px; border-radius: 8px; border: 1px solid rgba(127,224,176,.22); background: rgba(127,224,176,.055); }
      .lit-scope-title { display: flex; align-items: center; gap: 6px; color: #7fe0b0; font-size: 10.5px; font-weight: 650; }
      .lit-scope-text { color: var(--dsw-alias-label-secondary, #a4b2c0); font-size: 10px; line-height: 1.5; margin-top: 5px; }
      .lit-inspector-title { font-size: 16px; line-height: 1.4; font-weight: 650; margin-top: 4px; }
      .lit-inspector-meta { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10.5px; margin-top: 5px; }
      .lit-kv { display: flex; justify-content: space-between; gap: 9px; padding: 7px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.07)); font-size: 10.5px; }
      .lit-kv-label { color: var(--dsw-alias-label-secondary, #92a0ae); }
      .lit-kv-value { text-align: right; }
      .lit-inspector-actions { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; }
      .lit-modal-backdrop { position: absolute; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(4,8,12,.58); backdrop-filter: blur(2px); }
      .lit-modal {
        width: min(900px, 100%); max-height: min(80%, 720px); overflow: auto; border-radius: 13px;
        border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.16));
        background-color: var(--dsw-alias-bg-layer-2, #1c2834);
        background-image: linear-gradient(var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2, #1c2834)), var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2, #1c2834)));
        box-shadow: 0 24px 70px rgba(0,0,0,.5); padding: 19px 20px;
      }
      .lit-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; }
      .lit-modal-title { font-size: 18px; line-height: 1.35; margin: 4px 0 0; }
      .lit-modal-sub { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 11px; line-height: 1.6; margin: 9px 0 14px; }
      .lit-matrix-wrap { overflow: auto; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.1)); border-radius: 8px; }
      .lit-matrix { width: 100%; border-collapse: collapse; font-size: 10.5px; }
      .lit-matrix th, .lit-matrix td { padding: 8px 9px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.07)); border-right: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.06)); min-width: 130px; }
      .lit-matrix thead th { color: var(--dsw-alias-brand-primary, #9fd0ff); background: rgba(114,183,255,.06); font-weight: 600; }
      .lit-matrix tbody th { color: var(--dsw-alias-label-secondary, #a4b2c0); font-weight: 600; white-space: nowrap; background: rgba(255,255,255,.02); }
      .lit-matrix td { color: var(--dsw-alias-label-secondary, #a4b2c0); line-height: 1.45; }
      .lit-summary-actions { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
      .lit-section-card {
        margin-top: 10px; padding: 11px 12px 12px; border-radius: 9px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.1));
        background-color: var(--dsw-alias-bg-layer-1, #17222d);
        background-image: linear-gradient(var(--dsw-alias-bg-layer-1, #17222d), var(--dsw-alias-bg-layer-1, #17222d));
      }
      .lit-section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .lit-section-title-wrap { display: flex; align-items: center; gap: 7px; min-width: 0; flex-wrap: wrap; }
      .lit-section-type-icon { color: var(--dsw-alias-brand-primary, #9fd0ff); display: inline-flex; }
      .lit-section-title { font-size: 12.5px; font-weight: 650; }
      .lit-type-badge { font-size: 9px; color: var(--dsw-alias-label-secondary, #92a0ae); border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12)); border-radius: 5px; padding: 1px 5px; }
      .lit-section-actions { display: flex; align-items: center; gap: 5px; }
      .lit-section-count { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 9.5px; white-space: nowrap; }
      .lit-section-body { margin-top: 8px; }
      .lit-section-empty { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10.5px; padding: 6px 0; }
      .lit-section-hint { color: var(--dsw-alias-label-secondary, #7f8c99); font-size: 9.5px; margin-left: 5px; }
      .lit-add-entry { margin-top: 7px; font-size: 10.5px; padding: 4px 7px; }
      .lit-add-section {
        width: 100%; margin-top: 10px; padding: 9px; border-radius: 8px;
        border: 1px dashed var(--dsw-alias-border-l2, rgba(255,255,255,.2));
        background: transparent; color: var(--dsw-alias-label-secondary, #92a0ae);
        display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 11px;
      }
      .lit-add-section:hover { color: var(--dsw-alias-brand-primary, #9fd0ff); border-color: rgba(114,183,255,.45); background: rgba(114,183,255,.05); }
      .lit-rating-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; margin-top: 7px; }
      .lit-stars { display: flex; align-items: center; gap: 1px; }
      .lit-star { border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #6f7f8e); padding: 2px; border-radius: 4px; line-height: 0; }
      .lit-star:hover { color: #ffd166; background: rgba(255,209,102,.08); }
      .lit-star-on { color: #f5c451; }
      .lit-rating-label { color: #f5c451; font-size: 11px; font-weight: 600; min-width: 40px; }
      .lit-detail-tags { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-top: 8px; }
      .lit-detail-tag { font-size: 9.5px; color: #c8b6ff; background: rgba(177,156,255,.1); border: 1px solid rgba(177,156,255,.25); border-radius: 999px; padding: 2px 7px; }
      .lit-tag-selected { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px; }
      .lit-tag-selected-item { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; color: #c8b6ff; background: rgba(177,156,255,.1); border: 1px solid rgba(177,156,255,.28); border-radius: 999px; padding: 2px 4px 2px 8px; }
      .lit-tag-remove { display: inline-grid; place-items: center; width: 14px; height: 14px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: #c8b6ff; }
      .lit-tag-remove:hover { background: rgba(177,156,255,.2); }
      .lit-tag-editor { display: flex; gap: 5px; margin-top: 8px; }
      .lit-tag-editor .lit-input { height: 28px; font-size: 10.5px; }
      .lit-tag-editor .lit-btn { height: 28px; }
      .lit-tag-picker { display: flex; gap: 5px; flex-wrap: wrap; }
      .lit-tag-option {
        display: inline-flex; align-items: center; gap: 3px; border-radius: 999px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.14));
        background: transparent; color: var(--dsw-alias-label-secondary, #a4b2c0);
        padding: 3px 8px; font-size: 10px;
      }
      .lit-tag-option:hover { border-color: rgba(114,183,255,.45); color: var(--dsw-alias-brand-primary, #9fd0ff); }
      .lit-tag-option-on { color: var(--dsw-alias-brand-primary, #9fd0ff); background: rgba(114,183,255,.13); border-color: rgba(114,183,255,.4); }
      .lit-read-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; margin-top: 7px; }
      .lit-read-button {
        display: inline-flex; align-items: center; gap: 5px; border-radius: 7px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.14));
        background: transparent; color: var(--dsw-alias-label-secondary, #a4b2c0); padding: 5px 9px; font-size: 11px;
      }
      .lit-read-button-on { color: #7fe0b0; background: rgba(127,224,176,.1); border-color: rgba(127,224,176,.3); }
      .lit-group-manager { width: min(760px, 100%); }
      .lit-group-manager-list { margin-top: 13px; max-height: 300px; overflow: auto; }
      .lit-group-move { display: inline-flex; flex-direction: column; gap: 1px; }
      .lit-group-move .lit-icon-btn { width: 20px; height: 16px; font-size: 10px; }
      .lit-group-manager-row {
        display: grid; grid-template-columns: 26px 26px minmax(0, 1fr) auto 26px;
        gap: 6px; align-items: center; padding: 6px 0;
        border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08));
      }
      .lit-group-manager-row .lit-input { height: 28px; padding-left: 8px; }
      .lit-group-manager-list { max-height: 220px; }
      .lit-color-input {
        width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px;
        background: transparent; cursor: pointer;
      }
      .lit-group-manager-meta { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 9.5px; text-align: right; }
      .lit-group-manager-new { margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08)); }
      .lit-context-layer { position: absolute; inset: 0; z-index: 70; }
      .lit-context-menu {
        position: absolute; z-index: 71; width: 238px; padding: 5px;
        border-radius: 9px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.18));
        background-color: var(--dsw-alias-bg-layer-2, #1c2834);
        background-image: linear-gradient(var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2, #1c2834)), var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2, #1c2834)));
        box-shadow: 0 14px 38px rgba(0,0,0,.45);
      }
      .lit-context-head {
        padding: 6px 8px 7px; color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .lit-context-label { padding: 6px 8px 2px; color: var(--dsw-alias-label-secondary, #6f7f8e); font-size: 8.5px; letter-spacing: .07em; text-transform: uppercase; }
      .lit-context-item {
        display: flex; align-items: center; gap: 7px; width: 100%; border: 0; background: transparent;
        color: var(--dsw-alias-label-primary, #e8eef5); padding: 6px 8px; border-radius: 5px;
        font-size: 11px; text-align: left;
      }
      .lit-context-item:hover { background: var(--dsw-alias-bg-layer-2, #22303d); }
      .lit-context-move-row { display: flex; gap: 4px; }
      .lit-context-move-row .lit-context-item { flex: 1 1 0; justify-content: center; }
      .lit-context-item .lit-dot { flex: 0 0 auto; }
      .lit-context-item .lit-icon { margin-left: auto; }
      .lit-context-item-on { color: var(--dsw-alias-brand-primary, #9fd0ff); }
      .lit-context-item-on svg { margin-left: auto; }
      .lit-context-danger { color: var(--dsw-alias-state-error-primary, #ff9f9f); }
      .lit-context-sep { height: 1px; margin: 4px 6px; background: var(--dsw-alias-border-l1, rgba(255,255,255,.1)); }
      .lit-discovery-modal { width: min(820px, 100%); max-height: min(88%, 900px); display: flex; flex-direction: column; }
      .lit-discovery-search { display: flex; gap: 8px; margin-top: 14px; }
      .lit-discovery-search .lit-input { flex: 1; padding-left: 10px; }
      .lit-discovery-source { flex: 0 0 230px; padding-left: 9px; }
      .lit-discovery-filters { display: grid; grid-template-columns: 82px 82px 1.2fr 72px 72px 86px auto; gap: 6px; align-items: end; margin-top: 10px; padding: 9px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09)); background: rgba(255,255,255,.02); }
      .lit-discovery-filter-field { display: flex; flex-direction: column; gap: 4px; }
      .lit-discovery-filter-field label { color: var(--dsw-alias-label-secondary, #81909f); font-size: 9px; }
      .lit-discovery-filter-field .lit-input { margin-top: 0; padding: 5px 7px; font-size: 10px; }
      .lit-discovery-filter-wide { min-width: 0; }
      .lit-discovery-filter-clear { align-self: center; white-space: nowrap; }
      .lit-discovery-filter-note { grid-column: 1 / -1; color: var(--dsw-alias-label-secondary, #6f7f8e); font-size: 9px; line-height: 1.45; }
      .lit-discovery-results { display: flex; flex-direction: column; gap: 9px; overflow: auto; margin-top: 13px; padding-right: 3px; }
      .lit-discovery-empty { color: var(--dsw-alias-label-secondary, #81909f); font-size: 11px; padding: 22px 8px; text-align: center; }
      .lit-discovery-summary { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10px; margin-top: 11px; }
      .lit-discovery-more { display: flex; justify-content: center; padding-top: 9px; flex: 0 0 auto; }
      .lit-discovery-item { border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.1)); border-radius: 9px; padding: 11px 12px; background: rgba(255,255,255,.018); }
      .lit-discovery-title { font-size: 12px; font-weight: 650; line-height: 1.45; }
      .lit-discovery-meta { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10px; margin-top: 4px; }
      .lit-discovery-abstract { color: var(--dsw-alias-label-secondary, #81909f); font-size: 10px; line-height: 1.5; margin-top: 6px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .lit-discovery-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
      .lit-discovery-actions-right { display: flex; align-items: center; gap: 8px; }
      .lit-feed-modal { width: min(860px, 100%); max-height: 88vh; display: flex; flex-direction: column; }
      .lit-pdf-modal-actions { display: flex; align-items: center; gap: 6px; }
      .lit-feed-add { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; margin: 12px 0; }
      .lit-feed-list { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
      .lit-feed-source-row { display: inline-flex; align-items: center; gap: 5px; padding: 3px 6px; border-radius: 5px; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.1)); background: rgba(255,255,255,.025); max-width: 100%; }
      .lit-feed-source-name { font-size: 10px; color: var(--dsw-alias-label-primary, #dce8f4); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lit-feed-source-meta { font-size: 9px; color: var(--dsw-alias-label-secondary, #81909f); }
      .lit-feed-source-error { font-size: 9px; color: #ff9d9d; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lit-feed-items { min-height: 0; overflow: auto; border-top: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09)); }
      .lit-feed-item { padding: 10px 2px; border-bottom: 1px solid rgba(255,255,255,.055); }
      .lit-feed-item-read { opacity: .62; }
      .lit-feed-item-title { font-size: 12px; line-height: 1.45; color: var(--dsw-alias-label-primary, #e8eef5); }
      .lit-feed-item-meta { margin-top: 4px; font-size: 9.5px; color: var(--dsw-alias-label-secondary, #92a0ae); }
      .lit-feed-item-summary { margin-top: 5px; font-size: 10px; line-height: 1.5; color: var(--dsw-alias-label-secondary, #81909f); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .lit-feed-item-actions { display: flex; align-items: center; gap: 8px; margin-top: 7px; }
      .lit-backup-list { margin-top: 8px; border-top: 1px solid rgba(255,255,255,.08); }
      .lit-backup-row { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto auto; gap: 8px; align-items: center; padding: 8px 2px; border-bottom: 1px solid rgba(255,255,255,.06); }
      .lit-backup-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; color: var(--dsw-alias-label-primary, #c7d4e1); }
      .lit-backup-meta { color: var(--dsw-alias-label-secondary, #81909f); font-size: 9.5px; }
      .lit-file-input { max-width: 240px; color: var(--dsw-alias-label-secondary, #a4b2c0); font-size: 10px; }
      .lit-metadata-modal { width: min(620px, 100%); }
      .lit-metadata-body { padding: 4px 2px 6px; }
      .lit-metadata-copy { color: var(--dsw-alias-label-secondary, #a4b2c0); font-size: 11.5px; line-height: 1.65; margin: 10px 0 0; }
      .lit-metadata-source { margin-top: 12px; padding: 8px 9px; border-radius: 6px; background: rgba(255,255,255,.03); border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09)); color: var(--dsw-alias-label-secondary, #81909f); font-size: 10px; overflow-wrap: anywhere; }
      .lit-metadata-source a { color: var(--dsw-alias-brand-primary, #9fd0ff); }
      .lit-metadata-missing { color: #b8a98a; }
      .lit-edit-modal { width: min(660px, 100%); }
      .lit-edit-form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; margin-top: 14px; }
      .lit-edit-form > .lit-field-label, .lit-edit-form > .lit-input { grid-column: span 2; }
      .lit-edit-form .lit-field-label { margin-top: 0; }
      .lit-edit-form .lit-input { margin-top: -5px; padding-left: 10px; }
      .lit-edit-row { display: grid; grid-template-columns: 100px 1fr; gap: 12px; grid-column: span 2; }
      .lit-edit-row .lit-field-label { margin-top: 0; }
      .lit-edit-row .lit-input { margin-top: -5px; }
      .lit-confirm-modal { width: min(480px, 100%); }
      .lit-btn-danger { border: 1px solid rgba(255,120,120,.35); background: rgba(180,40,40,.18); color: #ffb3b3; }
      .lit-btn-danger:hover { background: rgba(200,50,50,.3); }
      .lit-import-modal { width: min(720px, 100%); }
      .lit-import-form { display: flex; flex-direction: column; margin-top: 14px; }
      .lit-import-form .lit-input { margin-top: 5px; padding-left: 10px; }
      .lit-import-note { color: var(--dsw-alias-label-secondary, #7f8c99); font-size: 10px; line-height: 1.5; margin-top: 5px; }
      .lit-dropzone {
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
        min-height: 132px; padding: 18px; border-radius: 10px; cursor: pointer;
        border: 1px dashed rgba(114,183,255,.45); background: rgba(114,183,255,.045);
        color: var(--dsw-alias-brand-primary, #9fd0ff); text-align: center; transition: background .15s ease, border-color .15s ease;
      }
      .lit-dropzone:hover { background: rgba(114,183,255,.09); border-color: rgba(114,183,255,.7); }
      .lit-dropzone-file { border-style: solid; border-color: rgba(127,224,176,.45); background: rgba(127,224,176,.055); color: #7fe0b0; }
      .lit-dropzone-title { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary, #dce7f2); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lit-dropzone-sub { font-size: 10px; color: var(--dsw-alias-label-secondary, #7f8c99); }
      .lit-import-file-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 7px; color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10px; }
      .lit-import-center { width: min(780px, 100%); max-height: 88vh; overflow: auto; }
      .lit-import-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 14px 0 2px; }
      .lit-import-inline { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
      .lit-import-inline .lit-input, .lit-import-inline .lit-select { min-width: 0; flex: 1 1 0; }
      .lit-import-progress { margin-top: 12px; padding: 9px 11px; border-radius: 7px; background: color-mix(in srgb, var(--dsw-alias-brand-primary, #72b7ff) 10%, transparent); color: var(--dsw-alias-label-primary, #e8eef5); font-size: 11.5px; }
      .lit-import-result { margin-top: 14px; padding: 11px; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.1)); border-radius: 8px; }
      .lit-import-result-title { font-weight: 650; font-size: 12px; }
      .lit-import-result-sub { margin-top: 3px; color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 10.5px; }
      .lit-import-result-row { margin-top: 5px; font-size: 11px; color: var(--dsw-alias-label-secondary, #92a0ae); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lit-import-result-error { margin-top: 6px; color: var(--dsw-alias-state-error-primary, #ff9f9f); font-size: 10.5px; }
      .lit-translation-bar {
        display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
        margin: 0 12px 8px; padding: 7px 10px; border-radius: 8px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12));
        background: var(--dsw-alias-bg-layer-1, #17222d);
        color: var(--dsw-alias-label-primary, #e8eef5);
      }
      .lit-translation-bar-title { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 650; }
      .lit-translation-bar-error { color: var(--dsw-alias-state-error-primary, #ff9f9f); font-size: 10.5px; }
      .lit-translation-modes { display: flex; align-items: center; gap: 4px; margin-left: auto; }
      .lit-translation-actions { display: flex; align-items: center; gap: 4px; }
      [data-lit-i18n="1"] { white-space: pre-line; }
      [data-lit-i18n="1"]::before { content: ''; }
      .lit-link-btn { border: 0; background: none; color: var(--dsw-alias-brand-primary, #9fd0ff); cursor: pointer; font-size: 10px; padding: 0; text-decoration: underline; }
      .lit-import-divider { display: flex; align-items: center; gap: 8px; margin: 14px 0 8px; color: var(--dsw-alias-label-secondary, #6f7f8e); font-size: 9.5px; }
      .lit-import-divider::before, .lit-import-divider::after { content: ''; height: 1px; flex: 1; background: var(--dsw-alias-border-l1, rgba(255,255,255,.1)); }
      .lit-pdf-modal {
        width: min(1180px, 100%); height: min(88%, 900px);
        display: flex; flex-direction: column; overflow: hidden; padding: 13px;
      }
      .lit-pdf-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 2px 2px 9px; }
      .lit-pdf-modal-title { min-width: 0; }
      .lit-pdf-modal-name { font-size: 12px; color: var(--dsw-alias-label-secondary, #a4b2c0); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 800px; }
      .lit-pdf-modal-actions { display: flex; align-items: center; gap: 5px; flex: 0 0 auto; }
      .lit-pdf-frame { flex: 1 1 auto; width: 100%; min-height: 0; border: 0; border-radius: 6px; background: #fff; }
      .lit-pdf-modal-note { color: var(--dsw-alias-label-secondary, #7f8c99); font-size: 9.5px; line-height: 1.45; padding-top: 7px; }
      .lit-settings-modal { width: min(940px, 100%); max-height: min(90%, 980px); display: flex; flex-direction: column; }
      .lit-settings-tabs { display: flex; gap: 4px; margin-top: 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.1)); }
      .lit-settings-tab { border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #92a0ae); padding: 8px 11px; border-bottom: 2px solid transparent; font-size: 11px; }
      .lit-settings-tab.active { color: var(--dsw-alias-brand-primary, #9fd0ff); border-bottom-color: var(--dsw-alias-brand-primary, #72b7ff); }
      .lit-settings-body { overflow: auto; padding: 12px 2px 2px; }
      .lit-settings-section-title { font-size: 11px; font-weight: 650; color: var(--dsw-alias-label-primary, #e8eef5); margin-bottom: 6px; }
      .lit-settings-edit { display: flex; flex-direction: column; gap: 6px; width: 100%; }
      .lit-settings-edit .lit-input, .lit-settings-edit .lit-select { margin-top: 0; padding-left: 9px; }
      .lit-settings-edit-actions { display: flex; gap: 6px; }
      .lit-preset-main { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; }
      .lit-preset-actions { display: flex; gap: 9px; flex: 0 0 auto; }
      .lit-danger-link { color: #ff9f9f; }
      .lit-settings-new { display: grid; grid-template-columns: 1.2fr 110px 1fr 1fr auto; gap: 6px; align-items: center; }
      .lit-settings-new .lit-input, .lit-settings-new .lit-select { margin-top: 0; padding-left: 9px; }
      .lit-group-defaults { display: flex; flex-direction: column; gap: 8px; }
      .lit-group-default-row { display: flex; align-items: flex-start; gap: 9px; padding: 7px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.07)); }
      .lit-group-default-options { display: flex; flex-wrap: wrap; gap: 5px 10px; }
      .lit-checkbox-option { display: inline-flex; align-items: center; gap: 4px; color: var(--dsw-alias-label-secondary, #a4b2c0); font-size: 10px; }
      .lit-settings-note { color: var(--dsw-alias-label-secondary, #81909f); font-size: 10px; line-height: 1.55; margin: 6px 0 10px; }
      .lit-settings-error { color: #ff9f9f; font-size: 10px; margin: 6px 0; }
      .lit-if-toolbar { display: flex; align-items: center; gap: 7px; }
      .lit-if-year { width: 80px; margin-top: 0; padding-left: 9px; }
      .lit-if-form { display: grid; grid-template-columns: 1fr 100px auto; gap: 6px; margin-top: 9px; }
      .lit-if-form .lit-input { margin-top: 0; padding-left: 9px; }
      .lit-if-list { display: flex; flex-direction: column; gap: 3px; margin-top: 10px; }
      .lit-if-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.07)); font-size: 10.5px; }
      .lit-if-journal { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lit-if-value { color: var(--dsw-alias-brand-primary, #9fd0ff); font-variant-numeric: tabular-nums; }
      .lit-template-modal { width: min(980px, 100%); }
      .lit-template-columns { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 12px; margin-top: 15px; }
      .lit-template-panel {
        border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.1)); border-radius: 9px;
        background-color: var(--dsw-alias-bg-layer-1, #17222d);
        background-image: linear-gradient(var(--dsw-alias-bg-layer-1, #17222d), var(--dsw-alias-bg-layer-1, #17222d));
        padding: 12px; min-width: 0;
      }
      .lit-template-group { margin-top: 9px; }
      .lit-template-group-head { margin-bottom: 5px; }
      .lit-template-list { display: flex; flex-wrap: wrap; gap: 4px; }
      .lit-template-chip {
        display: inline-flex; align-items: center; gap: 4px; border-radius: 5px; padding: 2px 6px;
        background: var(--dsw-alias-bg-layer-2, #22303d); color: var(--dsw-alias-label-secondary, #a4b2c0);
        font-size: 9.5px;
      }
      .lit-template-chip-type { color: var(--dsw-alias-label-secondary, #7f8c99); font-size: 8.5px; }
      .lit-template-actions { display: flex; flex-direction: column; gap: 7px; margin-top: 13px; }
      .lit-inline-form { display: flex; gap: 5px; align-items: center; }
      .lit-inline-form .lit-select { min-width: 0; }
      .lit-preset-list { max-height: 260px; overflow: auto; margin-top: 7px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08)); }
      .lit-preset-row { display: flex; align-items: center; justify-content: space-between; gap: 9px; padding: 7px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.07)); }
      .lit-preset-title { font-size: 11px; }
      .lit-preset-meta { color: var(--dsw-alias-label-secondary, #7f8c99); font-size: 9px; margin-top: 2px; }
      .lit-custom-form { display: flex; flex-direction: column; gap: 7px; margin-top: 7px; }
      .lit-custom-form .lit-btn { align-self: flex-start; }
      .lit-graph-canvas { user-select: none; cursor: crosshair; }
      .lit-graph-canvas svg { touch-action: none; }
      .lit-graph-node { cursor: pointer; }
      .lit-graph-tooltip {
        position: absolute; z-index: 15; max-width: 290px; pointer-events: none;
        padding: 9px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.18));
        background-color: var(--dsw-alias-bg-layer-2, #1c2834);
        background-image: linear-gradient(var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2, #1c2834)), var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2, #1c2834)));
        box-shadow: 0 10px 26px rgba(0,0,0,.38);
      }
      .lit-graph-tooltip-title { font-size: 11.5px; font-weight: 650; line-height: 1.4; }
      .lit-graph-tooltip-meta { color: var(--dsw-alias-label-secondary, #92a0ae); font-size: 9.5px; margin-top: 3px; }
      .lit-graph-tooltip-line { color: var(--dsw-alias-label-secondary, #a4b2c0); font-size: 10px; line-height: 1.5; margin-top: 5px; }
      .lit-selection-hint { color: var(--dsw-alias-label-secondary, #7f8c99); font-size: 9.5px; line-height: 1.5; margin-top: 7px; }
      .lit-modal-actions { display: flex; justify-content: flex-end; gap: 7px; flex-wrap: wrap; margin-top: 15px; }
      .lit-toast {
        position: absolute; z-index: 100; left: 50%; bottom: 24px; transform: translateX(-50%);
        max-width: min(620px, calc(100% - 40px)); display: flex; align-items: center; gap: 7px;
        padding: 9px 13px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.16));
        background-color: var(--dsw-alias-bg-layer-2, #1c2834);
        background-image: linear-gradient(var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2, #1c2834)), var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2, #1c2834)));
        color: var(--dsw-alias-label-primary, #e8eef5); box-shadow: 0 10px 28px rgba(0,0,0,.35);
        font-size: 11px; line-height: 1.4;
      }
      @media (max-width: 1100px) {
        .lit-library { grid-template-columns: var(--lit-groups-width, 230px) var(--lit-list-width, 390px) minmax(0, 1fr); }
        .lit-tracking { grid-template-columns: 200px 330px minmax(0, 1fr); }
        .lit-graph { grid-template-columns: 205px minmax(0, 1fr) 255px; }
        .lit-paper-title { font-size: 19px; }
        .lit-template-columns { grid-template-columns: minmax(0, 1fr); }
        .lit-summary-head { align-items: flex-start; flex-direction: column; gap: 8px; }
      }
      @media (max-width: 860px) {
        .lit-tracking { grid-template-columns: 190px minmax(0, 1fr); }
        .lit-feeddetail { display: none; }
        .lit-graph { grid-template-columns: 190px minmax(0, 1fr); }
        .lit-graph-inspector { display: none; }
      }
      .lit-theme-light { color: var(--dsw-alias-label-primary, #1f2937); }
      .lit-theme-light :is(.lit-soft-badge, .lit-feed-kind, .lit-status, .lit-ai-badge, .lit-journal-badge, .lit-section-label, .lit-kv-label) {
        color: var(--dsw-alias-label-primary, #1f2937);
        border-color: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2937) 16%, transparent);
        background: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2937) 5%, transparent);
      }
      .lit-theme-light :is(.lit-feed-card, .lit-paper-row, .lit-group-pane, .lit-listpane, .lit-detail-main, .lit-context-menu, .lit-group-menu, .lit-bulk-group-menu, .lit-modal) {
        background-color: var(--dsw-alias-bg-layer-1, #f7f8fa);
        color: var(--dsw-alias-label-primary, #1f2937);
      }
      .lit-theme-light :is(.lit-feed-card-summary, .lit-feed-card-source, .lit-author-authors, .lit-author-abstract, .lit-paper-meta, .lit-subtitle, .lit-context-label, .lit-section-body, .lit-kv-value) {
        color: var(--dsw-alias-label-secondary, #5f6b7a);
      }
      .lit-theme-light :is(.lit-feed-card, .lit-paper-row):hover { background-color: var(--dsw-alias-bg-layer-2, #eef1f5); }
      .lit-theme-light .lit-ai-stars { color: #8a6500; }
      .lit-theme-light .lit-ai-score-reason { color: #68520a; }
      .lit-theme-light .lit-ai-score-why { color: #5f594d; }
      .lit-theme-light .lit-if-tag {
        color: #05603a;
        background: #e6f7ee;
        border-color: #9bd6b8;
        font-weight: 700;
      }
      .lit-theme-light .lit-if-tag.lit-if-missing {
        color: #4b5563;
        background: #eef1f4;
        border-color: #cbd2da;
        font-weight: 600;
      }
      .lit-theme-light .lit-journal-badge {
        color: #1e4f9c;
        background: #eaf2ff;
        border-color: #b9cff2;
      }
      .lit-theme-light .lit-journal-badge.lit-journal-q1 {
        color: #7a5200;
        background: #fff5db;
        border-color: #e7c66a;
      }
      .lit-theme-light .lit-journal-badge.lit-journal-q2 {
        color: #1e4f9c;
        background: #eaf2ff;
        border-color: #b9cff2;
      }
      .lit-theme-light .lit-journal-badge.lit-journal-q3 {
        color: #086343;
        background: #e8f7f0;
        border-color: #a9d8c0;
      }
      .lit-theme-light .lit-journal-badge.lit-journal-q4 {
        color: #4b5563;
        background: #eef1f4;
        border-color: #cbd2da;
      }
      .lit-theme-light .lit-journal-quartile { opacity: 1; }
      .lit-theme-light .lit-if-value { color: #1e4f9c; font-weight: 650; }
      .lit-theme-light .lit-warn-line { color: #72540b; background: rgba(245,196,81,.10); }
      .lit-theme-light :is(.lit-input, .lit-textarea, .lit-select, .lit-search-input) {
        background: var(--dsw-alias-bg-base, #fff);
        color: var(--dsw-alias-label-primary, #1f2937);
        border-color: var(--dsw-alias-border-l2, rgba(0,0,0,.18));
      }
      .lit-group-menu, .lit-context-menu, .lit-bulk-group-menu {
        max-height: min(70vh, 520px);
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .lit-group-menu.lit-group-menu-detail { max-height: none; overflow: visible; }
      .lit-root button { color: var(--dsw-alias-label-primary, #e8eef5); }
      .lit-root button:disabled { opacity: .62; }
      .lit-theme-light .lit-btn,
      .lit-theme-light .lit-read-button,
      .lit-theme-light .lit-context-item,
      .lit-theme-light .lit-logic-button,
      .lit-theme-light .lit-segment button {
        background-color: #f3f5f7;
        color: #1f2937;
        border-color: #d6dce3;
        background-image: none;
      }
      .lit-theme-light .lit-btn-ghost {
        background-color: transparent;
        color: #1f2937;
        border-color: transparent;
      }
      .lit-theme-light .lit-btn-ghost:hover {
        background-color: #e9edf2;
      }
      .lit-theme-light .lit-btn-primary {
        background-color: #2563eb;
        background-image: none;
        color: #ffffff;
        border-color: #2563eb;
      }
      .lit-theme-light .lit-btn-danger {
        background-color: #fff1f0;
        color: #b42318;
        border-color: #f3b7b2;
      }
      .lit-theme-light .lit-icon-btn {
        color: #4b5563;
        background: transparent;
      }
      .lit-theme-light .lit-icon-btn:hover {
        color: #111827;
        background: #e9edf2;
      }
      .lit-theme-light .lit-tab {
        color: #5f6b7a;
      }
      .lit-theme-light .lit-tab-active {
        color: #111827;
      }
      .lit-theme-light .lit-select,
      .lit-theme-light .lit-input,
      .lit-theme-light .lit-textarea,
      .lit-theme-light .lit-search-input {
        background-color: #ffffff;
        color: #1f2937;
        border-color: #cbd5e1;
      }
      .lit-theme-light button:disabled {
        color: #6b7280;
        opacity: .7;
      }
      .lit-theme-light .lit-btn:disabled {
        background-color: #e9edf2;
        color: #6b7280;
        border-color: #d6dce3;
      }
      .lit-theme-light .lit-btn-primary:disabled {
        background-color: #93b4f5;
        color: #ffffff;
        border-color: #93b4f5;
      }
    `;

    function LitWorkspace({ t, translatePage, translateTexts, themeStore }) {
      const L = (key, fallback) => {
        try {
          const value = t ? t(key) : '';
          return value && value !== key ? value : fallback;
        } catch (error) {
          return fallback;
        }
      };

      const [state, setState] = useState(loadState);
      const [layoutWidths, setLayoutWidths] = useState(loadLayoutWidths);
      const [columnDrag, setColumnDrag] = useState(null);
      const [dataSource, setDataSource] = useState('demo');
      const [realLoading, setRealLoading] = useState(false);
      const [realSaveState, setRealSaveState] = useState('idle');
      const [revalidating, setRevalidating] = useState(false);
      const [tagsRefreshing, setTagsRefreshing] = useState(false);
      const [tagDrafts, setTagDrafts] = useState({});
      const [tagLibrary, setTagLibrary] = useState([]);
      const [importOpen, setImportOpen] = useState(false);
      const [importCenterOpen, setImportCenterOpen] = useState(false);
      const [paperSort, setPaperSort] = useState(() => {
        try {
          return window.localStorage.getItem('dsh-lit-paper-sort') || 'manual';
        } catch (error) {
          return 'manual';
        }
      });
      const [attachTarget, setAttachTarget] = useState(null);
      const [importFile, setImportFile] = useState(null);
      const [importPath, setImportPath] = useState('');
      const [importSummaryPath, setImportSummaryPath] = useState('');
      const [importBusy, setImportBusy] = useState(false);
      const [discoverOpen, setDiscoverOpen] = useState(false);
      const [discoverSource, setDiscoverSource] = useState('europepmc');
      const [discoverQuery, setDiscoverQuery] = useState('');
      const [discoverFiltersOpen, setDiscoverFiltersOpen] = useState(false);
      const [discoverFilters, setDiscoverFilters] = useState({
        from: '',
        to: '',
        journal: '',
        minIf: '',
        ifYear: String(new Date().getFullYear() - 1),
        jcrQuartile: '',
      });
      const [discoverLoading, setDiscoverLoading] = useState(false);
      const [discoverLoadingMore, setDiscoverLoadingMore] = useState(false);
      const [discoverResults, setDiscoverResults] = useState([]);
      const [discoverTotal, setDiscoverTotal] = useState(0);
      const [discoverNext, setDiscoverNext] = useState(null);
      const [importingArxiv, setImportingArxiv] = useState('');
      const [tab, setTab] = useState('library');
      const [selectedGroups, setSelectedGroups] = useState([]);
      const [groupMultiSelect, setGroupMultiSelect] = useState(false);
      const [query, setQuery] = useState('');
      const [searchIds, setSearchIds] = useState(null);
      const [searchSnippets, setSearchSnippets] = useState({});
      const [searchLoading, setSearchLoading] = useState(false);
      const [selectedPaper, setSelectedPaper] = useState('p1');
      const [selectedPaperIds, setSelectedPaperIds] = useState(['p1']);
      const [lastSelectedPaper, setLastSelectedPaper] = useState('p1');
      const [contextMenu, setContextMenu] = useState(null);
      const [groupManagerOpen, setGroupManagerOpen] = useState(false);
      const [groupMenuOpen, setGroupMenuOpen] = useState(false);
      const groupMenuRef = useRef(null);
      const [bulkGroupOpen, setBulkGroupOpen] = useState(false);
      const [bulkGroupName, setBulkGroupName] = useState('');
      const [evidence, setEvidence] = useState(null);
      const [toast, setToast] = useState('');
      const [selectedFeed, setSelectedFeed] = useState('all');
      const [feedFilter, setFeedFilter] = useState('all');
      const [feedKindFilter, setFeedKindFilter] = useState('all');
      const [feedStarFilter, setFeedStarFilter] = useState('all');
      const [feedDetailItem, setFeedDetailItem] = useState(null);
      const [selectedFeedItem, setSelectedFeedItem] = useState('f1');
      const [feedInput, setFeedInput] = useState('');
      const [feedQuery, setFeedQuery] = useState('');
      const [feedEdit, setFeedEdit] = useState(null);
      const [opmlBusy, setOpmlBusy] = useState(false);
      const [opmlPreview, setOpmlPreview] = useState(null);
      const opmlInputRef = useRef(null);
      const [aiScoreOpen, setAiScoreOpen] = useState(false);
      const [aiScoreBusy, setAiScoreBusy] = useState(false);
      const [aiScoreLimit, setAiScoreLimit] = useState(20);
      const [trackingWidth, setTrackingWidth] = useState(() => {
        try {
          const value = Number(JSON.parse(window.localStorage.getItem('dsh-lit-tracking-layout-v1') || 'null')?.feeds);
          return Number.isFinite(value) ? Math.max(200, Math.min(420, value)) : 260;
        } catch (error) {
          return 260;
        }
      });
      const [trackingDrag, setTrackingDrag] = useState(null);
      const [selectedNode, setSelectedNode] = useState('n1');
      const [selectedNodeIds, setSelectedNodeIds] = useState(['n1']);
      const [graphWidths, setGraphWidths] = useState(() => {
        try {
          const parsed = JSON.parse(window.localStorage.getItem('dsh-lit-graph-layout-v1') || 'null');
          return {
            left: Math.max(180, Math.min(360, Number(parsed?.left) || 230)),
            right: Math.max(220, Math.min(420, Number(parsed?.right) || 290)),
          };
        } catch (error) {
          return { left: 230, right: 290 };
        }
      });
      const [graphDrag, setGraphDrag] = useState(null);
      const [selectionBox, setSelectionBox] = useState(null);
      const [hoverNode, setHoverNode] = useState(null);
      const [scopeIds, setScopeIds] = useState([]);
      const [showSynthesis, setShowSynthesis] = useState(false);
      const [templateOpen, setTemplateOpen] = useState(false);
      const [settingsOpen, setSettingsOpen] = useState(false);
      const [settingsTab, setSettingsTab] = useState('presets');
      const [feedsOpen, setFeedsOpen] = useState(false);
      const [feedsData, setFeedsData] = useState({ feeds: [], items: [] });
      const [feedsLoading, setFeedsLoading] = useState(false);
      const [feedUrl, setFeedUrl] = useState('');
      const [pdfViewer, setPdfViewer] = useState(null);
      const [editPaperOpen, setEditPaperOpen] = useState(false);
      const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
      const [deleteBusy, setDeleteBusy] = useState(false);
      const [editBusy, setEditBusy] = useState(false);
      const [regenLoading, setRegenLoading] = useState(false);
      const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
      const [batchSummaryOpen, setBatchSummaryOpen] = useState(false);
      const [batchSummaryBusy, setBatchSummaryBusy] = useState(false);
      const [batchSummaryProgress, setBatchSummaryProgress] = useState('');
      const [batchRevalidateBusy, setBatchRevalidateBusy] = useState(false);
      const [batchRevalidateProgress, setBatchRevalidateProgress] = useState('');
      const [metadataEnriching, setMetadataEnriching] = useState(false);
      const [metadataOnlyPaper, setMetadataOnlyPaper] = useState(null);
      const [manualEvidence, setManualEvidence] = useState(null);
      const [acceptingSummary, setAcceptingSummary] = useState(false);
      const canvasRef = useRef(null);
      const rootRef = useRef(null);
      const [lightTheme, setLightTheme] = useState(() => {
        try {
          return themeStore?.get?.() === 'light';
        } catch (error) {
          return false;
        }
      });
      const [translationPages, setTranslationPages] = useState({});
      const translationMapsRef = useRef({});
      const translation = translationPages[tab] || EMPTY_TRANSLATION;
      const updateTranslation = (patch) =>
        setTranslationPages((previous) => ({
          ...previous,
          [tab]: { ...(previous[tab] || EMPTY_TRANSLATION), ...patch },
        }));
      const paperHashesRef = useRef({});
      const uiSettingsLoadedRef = useRef(false);
      const groupSaveTimersRef = useRef({});
      const groupDraftsRef = useRef({});
      const hashPaper = (paper) =>
        JSON.stringify({ sections: paper.summary?.sections || [], groups: paper.groups || [] });

      const runPageTranslation = async () => {
        const pageKey = tab;
        const content = rootRef.current?.querySelector('.lit-content');
        setTranslationPages((previous) => ({
          ...previous,
          [pageKey]: { ...(previous[pageKey] || EMPTY_TRANSLATION), open: true, busy: true, error: '' },
        }));
        try {
          if (!content) throw new Error('当前页面没有可翻译的区域');
          restoreTranslationBlocks(content);
          const blocks = collectTranslationBlocks(content);
          if (!blocks.length) throw new Error('当前页面没有可翻译的文字');
          const texts = [...new Set(blocks.map((block) => block.text))].slice(0, 80);
          const translator = typeof translateTexts === 'function' ? translateTexts : null;
          if (!translator) throw new Error('内置翻译服务不可用');
          const translated = await translator(texts);
          const map = new Map();
          texts.forEach((text, index) => {
            if (translated[index]) map.set(text, translated[index]);
          });
          translationMapsRef.current[pageKey] = map;
          setTranslationPages((previous) => ({
            ...previous,
            [pageKey]: {
              ...(previous[pageKey] || EMPTY_TRANSLATION),
              busy: false,
              count: map.size,
              error: '',
              mode: 'translated',
            },
          }));
        } catch (error) {
          setTranslationPages((previous) => ({
            ...previous,
            [pageKey]: { ...(previous[pageKey] || EMPTY_TRANSLATION), busy: false, error: error.message },
          }));
        }
      };

      const closeTranslation = () => {
        restoreTranslationBlocks(rootRef.current?.querySelector('.lit-content'));
        delete translationMapsRef.current[tab];
        setTranslationPages((previous) => {
          const next = { ...previous };
          delete next[tab];
          return next;
        });
      };

      useEffect(() => {
        const content = rootRef.current?.querySelector('.lit-content');
        if (!content) return;
        const pageTranslation = translationPages[tab];
        if (pageTranslation?.open && !pageTranslation.busy) {
          applyTranslationBlocks(content, pageTranslation.mode, translationMapsRef.current[tab]);
        } else {
          restoreTranslationBlocks(content);
        }
      });

      useEffect(() => {
        if (!groupMenuOpen) return undefined;
        const onPointerDown = (event) => {
          if (groupMenuRef.current && !groupMenuRef.current.contains(event.target)) {
            setGroupMenuOpen(false);
          }
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setGroupMenuOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('mousedown', onPointerDown);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [groupMenuOpen]);

      useEffect(() => {
        let unsubscribeTheme = () => {};
        try {
          if (themeStore?.subscribe) {
            unsubscribeTheme = themeStore.subscribe((scheme) => setLightTheme(scheme === 'light'));
          }
        } catch (error) {
          // DOM fallback below still works.
        }
        const detectTheme = () => {
          if (typeof getComputedStyle !== 'function') return;
          try {
            const scheme = themeStore?.get?.();
            if (scheme === 'light' || scheme === 'dark') {
              setLightTheme(scheme === 'light');
              return;
            }
          } catch (error) {
            // Fall back to DOM signals.
          }
          if (document.body?.hasAttribute('data-ds-dark-theme')) {
            setLightTheme(false);
            return;
          }
          const source = document.documentElement?.getAttribute('data-ds-theme-source');
          if (source === 'light') {
            setLightTheme(true);
            return;
          }
          if (source === 'dark') {
            setLightTheme(false);
            return;
          }
          const candidates = [rootRef.current, document.body, document.documentElement].filter(Boolean);
          for (const element of candidates) {
            const value = getComputedStyle(element).backgroundColor || '';
            const parts = value.match(/[\d.]+/g)?.map(Number) || [];
            if (parts.length < 3) continue;
            if (parts.length > 3 && parts[3] === 0) continue;
            const [r, g, b] = parts;
            const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            setLightTheme(luminance > 0.55);
            return;
          }
        };
        detectTheme();
        if (typeof MutationObserver !== 'function') return undefined;
        const observer = new MutationObserver(detectTheme);
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme', 'data-ds-theme-source'],
        });
        observer.observe(document.body, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme', 'data-ds-dark-theme'],
        });
        return () => {
          unsubscribeTheme();
          observer.disconnect();
        };
      }, [themeStore]);

      useEffect(() => {
        if (dataSource !== 'real') return undefined;
        const timer = window.setTimeout(async () => {
          const changed = state.papers.filter(
            (paper) =>
              paperHashesRef.current[paper.id] !== undefined &&
              paperHashesRef.current[paper.id] !== hashPaper(paper)
          );
          if (changed.length === 0) return;
          setRealSaveState('saving');
          for (const paper of changed) {
            const nextHash = hashPaper(paper);
            try {
              const response = await fetch(`${LIT_DEMO_API_BASE}/api/papers/${encodeURIComponent(paper.id)}`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ sections: paper.summary.sections, groups: paper.groups }),
              });
              if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${response.status}`);
              }
              paperHashesRef.current[paper.id] = nextHash;
            } catch (error) {
              setRealSaveState('error');
              setToast(`保存到 litd 失败：${error.message}`);
              return;
            }
          }
          setRealSaveState('saved');
        }, 800);
        return () => window.clearTimeout(timer);
      }, [state.papers, dataSource]);

      useEffect(() => {
        if (dataSource === 'real') return;
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
          // A full or blocked localStorage should not break the workspace.
        }
      }, [state, dataSource]);

      const settingsSaveRef = useRef({ timer: null, pending: null });
      const lastSettingsRef = useRef(null);

      const flushSettingsSave = () => {
        const slot = settingsSaveRef.current;
        if (slot.timer) {
          window.clearTimeout(slot.timer);
          slot.timer = null;
        }
        const pending = slot.pending;
        if (!pending) return;
        slot.pending = null;
        const retry = () => {
          if (!slot.pending) slot.pending = pending;
        };
        try {
          fetch(`${LIT_DEMO_API_BASE}/api/ui-state`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ key: 'lit-settings', value: pending }),
            keepalive: true,
          })
            .then((response) => {
              if (!response.ok) retry();
            })
            .catch(retry);
        } catch (error) {
          retry();
        }
      };

      const scheduleSettingsSave = (settings, delay = 600) => {
        const slot = settingsSaveRef.current;
        slot.pending = settings;
        if (slot.timer) window.clearTimeout(slot.timer);
        slot.timer = window.setTimeout(() => {
          slot.timer = null;
          flushSettingsSave();
        }, delay);
      };

      useEffect(() => {
        let cancelled = false;
        (async () => {
          let backend = null;
          let backendAt = 0;
          try {
            const response = await fetch(`${LIT_DEMO_API_BASE}/api/ui-state?key=lit-settings`, { cache: 'no-store' });
            const body = await response.json().catch(() => ({}));
            if (response.ok && body.value && typeof body.value === 'object') {
              backend = body.value;
              backendAt = Number(body.value.savedAt) || Date.parse(body.updated_at || '') || 0;
            }
          } catch (error) {
            // litd may not be running yet; local defaults are still usable.
          }
          if (cancelled) return;
          // Read the local copy after the request settles: edits made while it
          // was in flight are already written there synchronously.
          const local = readLocalSettings();
          const localAt = local ? local.savedAt || 0 : 0;
          const backendHasSettings = Boolean(
            backend && (Array.isArray(backend.sectionPresets) || backend.groupTemplates)
          );
          uiSettingsLoadedRef.current = true;
          if (backendHasSettings && backendAt >= localAt) {
            const nextPresets =
              Array.isArray(backend.sectionPresets) && backend.sectionPresets.length
                ? backend.sectionPresets
                : (local && local.sectionPresets) || state.sectionPresets;
            const nextTemplates =
              backend.groupTemplates && typeof backend.groupTemplates === 'object'
                ? backend.groupTemplates
                : (local && local.groupTemplates) || state.groupTemplates;
            writeLocalSettings({
              sectionPresets: nextPresets,
              groupTemplates: nextTemplates,
              savedAt: backendAt || Date.now(),
            });
            setState((previous) => ({
              ...previous,
              sectionPresets: nextPresets,
              groupTemplates: nextTemplates,
            }));
            return;
          }
          if (local) {
            // The local copy is the freshest one; push it so a stale backend
            // value cannot win a later reload.
            scheduleSettingsSave(
              {
                sectionPresets:
                  local.sectionPresets && local.sectionPresets.length
                    ? local.sectionPresets
                    : state.sectionPresets,
                groupTemplates: local.groupTemplates || state.groupTemplates,
                savedAt: localAt || Date.now(),
              },
              0
            );
          }
        })();
        return () => {
          cancelled = true;
        };
      }, []);

      useEffect(() => {
        const previous = lastSettingsRef.current;
        lastSettingsRef.current = {
          sectionPresets: state.sectionPresets,
          groupTemplates: state.groupTemplates,
        };
        if (!previous) return;
        if (
          previous.sectionPresets === state.sectionPresets &&
          previous.groupTemplates === state.groupTemplates
        ) {
          return;
        }
        const settings = {
          sectionPresets: state.sectionPresets,
          groupTemplates: state.groupTemplates,
          savedAt: Date.now(),
        };
        // Synchronous write: the edit survives an immediate reload even while
        // the backend request is still debounced.
        writeLocalSettings(settings);
        if (!uiSettingsLoadedRef.current) return;
        scheduleSettingsSave(settings);
      }, [state.sectionPresets, state.groupTemplates]);

      useEffect(() => {
        if (dataSource !== 'real') return;
        const slot = settingsSaveRef.current;
        if (slot.pending) scheduleSettingsSave(slot.pending, 0);
      }, [dataSource]);

      useEffect(() => {
        const flush = () => flushSettingsSave();
        window.addEventListener('pagehide', flush);
        window.addEventListener('beforeunload', flush);
        const onVisibility = () => {
          if (document.visibilityState === 'hidden') flushSettingsSave();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
          window.removeEventListener('pagehide', flush);
          window.removeEventListener('beforeunload', flush);
          document.removeEventListener('visibilitychange', onVisibility);
          flushSettingsSave();
        };
      }, []);

      useEffect(() => {
        try {
          window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layoutWidths));
        } catch (error) {
          // Layout persistence is best-effort.
        }
      }, [layoutWidths]);

      useEffect(() => {
        if (!columnDrag) return undefined;
        const onMove = (event) => {
          const dx = event.clientX - columnDrag.startX;
          if (columnDrag.kind === 'groups') {
            setLayoutWidths({
              ...columnDrag.start,
              groups: Math.max(200, Math.min(420, columnDrag.start.groups + dx)),
            });
          } else {
            setLayoutWidths({
              ...columnDrag.start,
              list: Math.max(300, Math.min(700, columnDrag.start.list + dx)),
            });
          }
        };
        const onUp = () => setColumnDrag(null);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        return () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
      }, [columnDrag]);

      useEffect(() => {
        try {
          window.localStorage.setItem('dsh-lit-tracking-layout-v1', JSON.stringify({ feeds: trackingWidth }));
        } catch (error) {
          // Layout persistence is best-effort.
        }
      }, [trackingWidth]);

      useEffect(() => {
        if (!trackingDrag) return undefined;
        const onMove = (event) => {
          const next = trackingDrag.start + (event.clientX - trackingDrag.startX);
          setTrackingWidth(Math.max(200, Math.min(420, next)));
        };
        const onUp = () => setTrackingDrag(null);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        return () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
      }, [trackingDrag]);

      useEffect(() => {
        try {
          window.localStorage.setItem('dsh-lit-graph-layout-v1', JSON.stringify(graphWidths));
        } catch (error) {
          // Layout persistence is best-effort.
        }
      }, [graphWidths]);

      useEffect(() => {
        if (!graphDrag) return undefined;
        const onMove = (event) => {
          const dx = event.clientX - graphDrag.startX;
          if (graphDrag.side === 'left') {
            setGraphWidths((previous) => ({
              ...previous,
              left: Math.max(180, Math.min(360, graphDrag.startWidth + dx)),
            }));
          } else {
            setGraphWidths((previous) => ({
              ...previous,
              right: Math.max(220, Math.min(420, graphDrag.startWidth - dx)),
            }));
          }
        };
        const onUp = () => setGraphDrag(null);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        return () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
      }, [graphDrag]);

      useEffect(() => {
        if (!toast) return undefined;
        const timer = window.setTimeout(() => setToast(''), 2800);
        return () => window.clearTimeout(timer);
      }, [toast]);

      const beginTrackingResize = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setTrackingDrag({ start: trackingWidth, startX: event.clientX });
      };

      const beginColumnResize = (kind, event) => {
        event.preventDefault();
        event.stopPropagation();
        setColumnDrag({
          kind,
          startX: event.clientX,
          start: { ...layoutWidths },
        });
      };

      const mutate = (fn) => {
        setState((prev) => {
          const next = clone(prev);
          fn(next);
          return next;
        });
      };

      const mapRealPaper = (paper) => {
        const evidenceById = Object.fromEntries((paper.evidence || []).map((item) => [item.id, item]));
        const sections = (paper.summary?.sections || []).map((section) => ({
          ...section,
          entries: (section.entries || []).map((entry, index) => {
            const linked = (entry.evidence || []).map((id) => evidenceById[id]).find(Boolean);
            const quote = entry.quote || linked?.quote || '';
            const page = entry.page ?? linked?.page ?? null;
            const bbox = entry.bbox || linked?.bbox_pdf || null;
            return {
              ...entry,
              id: entry.id || `${section.key}-${index}`,
              quote,
              page,
              bbox,
              section: entry.section || '',
              // Editing the claim text does not change the quote or its PDF
              // location. Only a quote/page change should require re-location.
              status:
                entry.status === 'needs_recheck' && quote && page && bbox
                  ? 'verified'
                  : entry.status === 'draft' && quote
                    ? page
                      ? 'verified'
                      : 'missing'
                    : entry.status,
            };
          }),
        }));
        return {
          id: paper.id,
          title: paper.title || 'Untitled PDF',
          authors: paper.authors || 'Unknown',
          year: paper.year || null,
          venue: paper.venue || 'Imported PDF',
          doi: paper.doi || '',
          arxiv: paper.arxiv || '',
          groups: paper.groups || [],
          status: paper.status || '已总结',
          abstract: paper.abstract || '',
          pdfPath: paper.pdf_path || '',
          pageCount: Number(paper.page_count) || 0,
          sourceUrl: paper.source_url || '',
          impactFactor: paper.impact_factor ?? null,
          jcrQuartile: paper.jcr_quartile || '',
          summary: {
            sections,
            hiddenSections: [],
            auto_generated: Boolean(paper.summary?.auto_generated),
            ai_generated: Boolean(paper.summary?.ai_generated),
            reviewed: Boolean(paper.summary?.reviewed),
            model: paper.summary?.model || null,
          },
          edited: false,
        };
      };

      const loadRealLibrary = async (silent = false) => {
        setRealLoading(true);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/library`, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          const papers = (data.papers || []).map(mapRealPaper);
          const groups = (data.groups || []).map((group) => ({
            id: group.id,
            name: group.name,
            color: group.color,
          }));
          paperHashesRef.current = Object.fromEntries(papers.map((paper) => [paper.id, hashPaper(paper)]));
          setRealSaveState('saved');
          setState((previous) => {
            // Merge against the latest settings: a snapshot taken when this
            // request started must not overwrite edits made while it ran (the
            // group-default structure used to revert when /api/library resolved
            // after /api/ui-state).
            const nextTemplates = clone(previous.groupTemplates || GROUP_TEMPLATES);
            groups.forEach((group) => {
              if (!nextTemplates[group.id]) {
                nextTemplates[group.id] = ['question', 'findings', 'limitations', 'my-note']
                  .map((id) => SECTION_PRESET_MAP[id])
                  .filter(Boolean)
                  .map((preset) => templateFromPreset(preset));
              }
            });
            return {
              ...previous,
              papers,
              groups: Array.isArray(data.groups) ? groups : previous.groups,
              groupTemplates: nextTemplates,
            };
          });
          const firstId = papers[0]?.id || '';
          setDataSource('real');
          setTab('library');
          setSelectedGroups([]);
          setSelectedPaper(firstId);
          setSelectedPaperIds(firstId ? [firstId] : []);
          setLastSelectedPaper(firstId);
          setEvidence(null);
          if (!silent) setToast(`已连接 litd · ${papers.length} 篇真实文献`);
        } catch (error) {
          if (!silent) setToast(`未连接 litd：${error.message}；当前保留已加载内容`);
        } finally {
          setRealLoading(false);
        }
      };

      const applyRealPaper = (paper) => {
        if (!paper) return '';
        const mapped = mapRealPaper(paper);
        setState((previous) => ({
          ...previous,
          papers: [mapped, ...(previous.papers || []).filter((item) => item.id !== mapped.id)],
        }));
        setDataSource('real');
        setTab('library');
        setSelectedGroups([]);
        setQuery('');
        setSelectedPaper(mapped.id);
        setSelectedPaperIds([mapped.id]);
        setLastSelectedPaper(mapped.id);
        setEvidence(null);
        return mapped.id;
      };

      useEffect(() => {
        loadRealLibrary();
        loadFeeds();
        loadTagLibrary();
      }, []);

      useEffect(() => {
        if (tab === 'tracking') loadFeeds();
        if (tab === 'graph' && dataSource === 'real') {
          loadRealGraph(Number(state.graphThreshold) || 0.14, state.graphMode || 'semantic');
        }
      }, [tab, dataSource]);

      useEffect(() => {
        if (dataSource === 'real') return undefined;
        const timer = window.setInterval(() => loadRealLibrary(true), 20000);
        return () => window.clearInterval(timer);
      }, [dataSource]);

      const loadFeeds = async () => {
        setFeedsLoading(true);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/feeds`, { cache: 'no-store' });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setFeedsData({ feeds: body.feeds || [], items: body.items || [] });
        } catch (error) {
          setToast(`加载订阅失败：${error.message}`);
        } finally {
          setFeedsLoading(false);
        }
      };

      const loadRealGraph = async (threshold = 0.14, mode = 'semantic') => {
        try {
          const response = await fetch(
            `${LIT_DEMO_API_BASE}/api/graph?mode=${encodeURIComponent(mode)}&threshold=${encodeURIComponent(threshold)}`,
            { cache: 'no-store' }
          );
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          const firstNode = body.nodes?.[0]?.id || '';
          setState((previous) => ({
            ...previous,
            graph: {
              nodes: body.nodes || [],
              edges: body.edges || [],
              clusterLabels: body.clusterLabels || [],
            },
            graphThreshold: threshold,
            graphMode: mode,
            clusterMode: mode,
            graphColorMode: 'cluster',
          }));
          setSelectedNode(firstNode);
          setSelectedNodeIds(firstNode ? [firstNode] : []);
          setScopeIds([]);
          setToast(`${mode === 'groups' ? '分组' : mode === 'tags' ? '标签' : '语义'}聚类：${body.nodes?.length || 0} 篇，${body.clusterLabels?.length || 0} 个簇`);
        } catch (error) {
          setToast(`聚类失败：${error.message}`);
        }
      };

      const refreshPaperTags = async () => {
        setTagsRefreshing(true);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/tags/refresh`, { method: 'POST' });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          await loadRealGraph(Number(state.graphThreshold) || 0.14, 'tags');
          setToast(`标签已更新：${body.updated}/${body.total} 篇`);
        } catch (error) {
          setToast(`标签更新失败：${error.message}`);
        } finally {
          setTagsRefreshing(false);
        }
      };

      const loadTagLibrary = async () => {
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/tags`, { cache: 'no-store' });
          const body = await response.json();
          if (response.ok && body.ok === true) setTagLibrary(body.tags || []);
        } catch (error) {
          // Tag library is optional; keep the local section options working.
        }
      };

      const addSubscriptionFeed = async () => {
        const url = (feedInput || feedUrl).trim();
        if (!url) {
          setToast('请输入 RSS / Atom 地址');
          return;
        }
        setFeedsLoading(true);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/feeds`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setFeedInput('');
          setFeedUrl('');
          await loadFeeds();
          setToast(`已订阅：${body.feed?.title || url}`);
        } catch (error) {
          setToast(`订阅失败：${error.message}`);
        } finally {
          setFeedsLoading(false);
        }
      };

      const refreshFeeds = async () => {
        setFeedsLoading(true);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/feeds/refresh`, { method: 'POST' });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          await loadFeeds();
          setToast(`已刷新 ${body.refreshed} 个订阅源`);
        } catch (error) {
          setToast(`刷新订阅失败：${error.message}`);
        } finally {
          setFeedsLoading(false);
        }
      };

      const removeFeed = async (feed) => {
        const count = Number(feed.item_count) || (feedsData.items || []).filter((item) => item.feed_id === feed.id).length;
        if (
          !window.confirm(
            `删除订阅源「${feed.title || feed.url}」？\n会删除 ${count} 条订阅条目和已读状态；不会删除已存入文献库的论文。`
          )
        ) {
          return;
        }
        setFeedsLoading(true);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/feeds/${encodeURIComponent(feed.id)}`, {
            method: 'DELETE',
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          if (selectedFeed === feed.id) setSelectedFeed('all');
          await loadFeeds();
          setToast(`已删除订阅源，移除 ${body.removed || 0} 条条目`);
        } catch (error) {
          setToast(`删除订阅源失败：${error.message}`);
        } finally {
          setFeedsLoading(false);
        }
      };

      const refreshSingleFeed = async (feed) => {
        setFeedsLoading(true);
        try {
          const response = await fetch(
            `${LIT_DEMO_API_BASE}/api/feeds/${encodeURIComponent(feed.id)}/refresh`,
            { method: 'POST' }
          );
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          await loadFeeds();
          setToast(`已刷新「${feed.title || feed.url}」：${body.count || 0} 条`);
        } catch (error) {
          setToast(`刷新订阅源失败：${error.message}`);
        } finally {
          setFeedsLoading(false);
        }
      };

      const exportOpml = () => {
        const escape = (value) =>
          String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        const outlines = (feedsData.feeds || [])
          .map(
            (feed) =>
              `    <outline type="rss" text="${escape(feed.title || feed.url)}" title="${escape(feed.title || feed.url)}" xmlUrl="${escape(feed.url)}"/>`
          )
          .join('\n');
        downloadText(
          'lit-feeds.opml',
          `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>DSH Literature Feeds</title></head>\n  <body>\n${outlines}\n  </body>\n</opml>\n`,
          'text/x-opml;charset=utf-8'
        );
        setToast(`已导出 ${(feedsData.feeds || []).length} 个订阅源`);
      };

      const importOpmlFile = async (file) => {
        if (!file) return;
        try {
          const text = await file.text();
          const doc = new DOMParser().parseFromString(text, 'application/xml');
          const urls = [...doc.querySelectorAll('outline[xmlUrl]')]
            .map((node) => node.getAttribute('xmlUrl') || '')
            .filter(Boolean);
          const existing = new Set((feedsData.feeds || []).map((feed) => feed.url));
          const unique = [...new Set(urls)].filter((url) => !existing.has(url));
          if (unique.length === 0) {
            setToast('OPML 中没有新的订阅源');
            return;
          }
          setOpmlPreview(unique);
        } catch (error) {
          setToast(`OPML 解析失败：${error.message}`);
        } finally {
          if (opmlInputRef.current) opmlInputRef.current.value = '';
        }
      };

      const startOpmlImport = async (urls) => {
        setOpmlBusy(true);
        let ok = 0;
        let failed = 0;
        try {
          for (const url of urls) {
            try {
              const response = await fetch(`${LIT_DEMO_API_BASE}/api/feeds`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ url }),
              });
              const body = await response.json();
              if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
              ok += 1;
            } catch (error) {
              failed += 1;
            }
          }
          await loadFeeds();
          setOpmlPreview(null);
          setToast(`OPML 导入完成：${ok} 成功${failed ? `，${failed} 失败` : ''}`);
        } catch (error) {
          setToast(`OPML 导入失败：${error.message}`);
        } finally {
          setOpmlBusy(false);
        }
      };

      const runAiScore = async () => {
        setAiScoreBusy(true);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/feeds/ai-score`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ limit: aiScoreLimit }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          if (body.items) {
            setFeedsData((previous) => ({ ...previous, items: body.items }));
          }
          setAiScoreOpen(false);
          const used = body.usage?.totalTokens ? `，${body.usage.totalTokens} tokens` : '';
          setToast(body.updated ? `AI 已评分 ${body.updated} 条${used}` : body.message || '没有需要评分的新条目');
        } catch (error) {
          setToast(`AI 评分失败：${error.message}`);
        } finally {
          setAiScoreBusy(false);
        }
      };

      const saveFeedEdit = async (feed) => {
        setFeedsLoading(true);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/feeds/${encodeURIComponent(feed.id)}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: feed.title, url: feed.url }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setFeedEdit(null);
          await loadFeeds();
          setToast('订阅源已更新');
        } catch (error) {
          setToast(`更新订阅源失败：${error.message}`);
        } finally {
          setFeedsLoading(false);
        }
      };

      const toggleFeedRead = async (item) => {
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/feed-items/${encodeURIComponent(item.id)}/read`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ read: !item.read }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setFeedsData((previous) => ({
            ...previous,
            items: previous.items.map((entry) =>
              entry.id === item.id ? { ...entry, read: item.read ? 0 : 1 } : entry
            ),
          }));
        } catch (error) {
          setToast(`标记失败：${error.message}`);
        }
      };

      const markAllFeedItemsRead = async (read) => {
        setFeedsLoading(true);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/feed-items/read-all`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ read }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          await loadFeeds();
          setToast(read ? `已全部标为已读（${body.changed} 条）` : `已全部标为未读（${body.changed} 条）`);
        } catch (error) {
          setToast(`批量标记失败：${error.message}`);
        } finally {
          setFeedsLoading(false);
        }
      };

      const setFeedItemKind = async (item, kind) => {
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/feed-items/${encodeURIComponent(item.id)}/kind`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kind }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setFeedsData((previous) => ({
            ...previous,
            items: previous.items.map((entry) => (entry.id === item.id ? { ...entry, kind } : entry)),
          }));
          setFeedDetailItem((previous) => (previous && previous.id === item.id ? { ...previous, kind } : previous));
          setToast(`已改判为${kind === 'paper' ? '论文' : kind === 'news' ? '新闻' : kind === 'comment' ? '评论' : '未分类'}`);
        } catch (error) {
          setToast(`改判失败：${error.message}`);
        }
      };

      const saveSubscriptionItem = async (item) => {
        setFeedsLoading(true);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/feed-items/${encodeURIComponent(item.id)}/save`, {
            method: 'POST',
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          await loadFeeds();
          await loadRealLibrary();
          setToast(item.pdf_url ? '已导入订阅 PDF' : '已保存订阅元数据');
        } catch (error) {
          setToast(`保存失败：${error.message}`);
        } finally {
          setFeedsLoading(false);
        }
      };

      const submitImport = async () => {
        const pdfPath = importPath.trim();
        if (!importFile && !pdfPath) {
          setToast('请选择 PDF 文件或填写绝对路径');
          return;
        }
        setImportBusy(true);
        try {
          const fileBuffer = importFile ? await importFile.arrayBuffer() : null;
          const attachRequest = async (force) => {
            if (importFile) {
              return fetch(
                `${LIT_DEMO_API_BASE}/api/papers/${encodeURIComponent(attachTarget.id)}/pdf-upload?force=${force ? '1' : '0'}`,
                {
                  method: 'POST',
                  headers: { 'content-type': 'application/pdf' },
                  body: fileBuffer,
                }
              );
            }
            return fetch(
              `${LIT_DEMO_API_BASE}/api/papers/${encodeURIComponent(attachTarget.id)}/pdf`,
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ path: pdfPath, force }),
              }
            );
          };
          let response;
          if (attachTarget) {
            response = await attachRequest(false);
            if (response.status === 409) {
              const mismatch = await response.json();
              const message = [
                'PDF 与当前文献可能不匹配：',
                ...(mismatch.reasons || []),
                mismatch.detected?.title ? `PDF 标题：${mismatch.detected.title}` : '',
                mismatch.existing?.title ? `当前文献：${mismatch.existing.title}` : '',
                '',
                '仍然要绑定吗？',
              ].filter(Boolean).join('\n');
              if (!window.confirm(message)) {
                setToast('已取消绑定');
                setImportBusy(false);
                return;
              }
              response = await attachRequest(true);
            }
          } else if (importFile) {
            const params = new URLSearchParams({ filename: importFile.name });
            if (importSummaryPath.trim()) params.set('summary_path', importSummaryPath.trim());
            response = await fetch(`${LIT_DEMO_API_BASE}/api/import-upload?${params.toString()}`, {
              method: 'POST',
              headers: { 'content-type': 'application/pdf' },
              body: await importFile.arrayBuffer(),
            });
          } else {
            response = await fetch(`${LIT_DEMO_API_BASE}/api/import`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                path: pdfPath,
                ...(importSummaryPath.trim() ? { summary_path: importSummaryPath.trim() } : {}),
              }),
            });
          }
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          const attachedId = attachTarget?.id || body.paper?.id || '';
          if (body.paper) applyRealPaper(body.paper);
          await loadRealLibrary();
          if (attachedId) {
            setSelectedPaper(attachedId);
            setSelectedPaperIds([attachedId]);
            setLastSelectedPaper(attachedId);
            setEvidence(null);
          }
          setImportOpen(false);
          setImportFile(null);
          setImportPath('');
          setImportSummaryPath('');
          setAttachTarget(null);
          setToast(
            attachedId
              ? `PDF 已关联到：${body.paper?.title?.slice(0, 60) || ''}`
              : body.duplicate
                ? `这篇 PDF 已在库中：${body.paper?.title?.slice(0, 50) || ''}`
                : 'PDF 已导入文献库，并保存到本地存储'
          );
        } catch (error) {
          setToast(`导入失败：${error.message}`);
        } finally {
          setImportBusy(false);
        }
      };

      const searchDiscovery = async (append = false) => {
        const q = discoverQuery.trim();
        if (!q) {
          setToast('请输入搜索词');
          return;
        }
        if (append) setDiscoverLoadingMore(true);
        else setDiscoverLoading(true);
        try {
          const endpoint = discoverSource === 'arxiv' ? 'arxiv' : 'europepmc';
          const scope =
            discoverSource === 'pubmed' ? 'pubmed' : discoverSource === 'biorxiv' ? 'biorxiv' : 'all';
          const pageParam =
            endpoint === 'arxiv'
              ? `&start=${append && discoverNext?.start ? discoverNext.start : 0}`
              : `&cursor=${encodeURIComponent(append && discoverNext?.cursor ? discoverNext.cursor : '*')}`;
          const filterParams = new URLSearchParams();
          if (discoverFilters.from) filterParams.set('from', discoverFilters.from);
          if (discoverFilters.to) filterParams.set('to', discoverFilters.to);
          if (discoverFilters.journal.trim()) filterParams.set('journal', discoverFilters.journal.trim());
          if (discoverFilters.minIf.trim()) filterParams.set('min_if', discoverFilters.minIf.trim());
          if (discoverFilters.minIf.trim() && discoverFilters.ifYear.trim()) {
            filterParams.set('if_year', discoverFilters.ifYear.trim());
          }
          if (discoverFilters.jcrQuartile) {
            filterParams.set('jcr_quartile', discoverFilters.jcrQuartile);
            filterParams.set('jcr_year', '2026');
          }
          const response = await fetch(
            `${LIT_DEMO_API_BASE}/api/discover/${endpoint}?q=${encodeURIComponent(q)}&limit=20${
              endpoint === 'europepmc' ? `&scope=${scope}` : ''
            }${pageParam}&${filterParams.toString()}`
          );
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          const incoming = body.results || [];
          setDiscoverResults((previous) => {
            if (!append) return incoming;
            const seen = new Set(previous.map((item) => item.id || item.arxiv_id || item.pdf_url));
            return [...previous, ...incoming.filter((item) => !seen.has(item.id || item.arxiv_id || item.pdf_url))];
          });
          setDiscoverTotal(Number(body.total) || incoming.length);
          setDiscoverNext(
            body.next_start !== null && body.next_start !== undefined
              ? { start: body.next_start }
              : body.next_cursor
                ? { cursor: body.next_cursor }
                : null
          );
          if (incoming.length === 0 && !append) setToast('没有找到结果');
        } catch (error) {
          setToast(`搜索失败：${error.message}`);
        } finally {
          setDiscoverLoading(false);
          setDiscoverLoadingMore(false);
        }
      };

      const importDiscoveryCandidate = async (candidate) => {
        const candidateId = candidate.id || candidate.arxiv_id;
        if (!candidate.pdf_url) {
          setToast('这条记录没有开放 PDF，只能打开来源页');
          return;
        }
        setImportingArxiv(candidateId);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/discover/import`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              pdf_url: candidate.pdf_url,
              title: candidate.title,
              venue: candidate.venue || candidate.journal,
            }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          await loadRealLibrary();
          setDiscoverOpen(false);
          setToast(`已导入：${candidate.title.slice(0, 60)}`);
        } catch (error) {
          setToast(`导入失败：${error.message}`);
        } finally {
          setImportingArxiv('');
        }
      };

      const importMetadataCandidate = async (candidate) => {
        const candidateId = candidate.id || candidate.arxiv_id;
        if (!candidateId) return;
        setImportingArxiv(candidateId);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/discover/import-metadata`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              title: candidate.title,
              authors: candidate.authors,
              abstract: candidate.abstract,
              doi: candidate.doi,
              journal: candidate.journal,
              venue: candidate.venue || candidate.journal,
              published: candidate.published,
              source_url: candidate.abs_url,
            }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          await loadRealLibrary();
          setDiscoverOpen(false);
          setToast('已保存元数据；总结保持未总结');
        } catch (error) {
          setToast(`保存元数据失败：${error.message}`);
        } finally {
          setImportingArxiv('');
        }
      };

      const openPdfViewer = (paper, page = 1) => {
        if (dataSource !== 'real' || !paper?.id) {
          setToast('Demo 未附带真实 PDF；连接真实库后可打开');
          return;
        }
        if (!paper.pdfPath) {
          setToast('这篇只有元数据，没有 PDF；可打开来源页');
          return;
        }
        setPdfViewer({ paperId: paper.id, page: Number(page) || 1 });
      };

      const openDefaultPdf = async (paper) => {
        if (dataSource !== 'real' || !paper?.id) {
          setToast('Demo 未附带真实 PDF；连接真实库后可打开');
          return;
        }
        if (!paper.pdfPath) {
          setToast('这篇只有元数据，没有 PDF；可打开来源页');
          return;
        }
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/open`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ paper_id: paper.id }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          setToast('已调用系统默认 PDF 阅读器');
        } catch (error) {
          setToast(`打开失败：${error.message}`);
        }
      };

      const groupById = useMemo(
        () => Object.fromEntries((state.groups || GROUPS).map((group) => [group.id, group])),
        [state.groups]
      );
      const feedById = useMemo(() => Object.fromEntries(state.feeds.map((f) => [f.id, f])), [state.feeds]);
      const paperById = useMemo(() => Object.fromEntries(state.papers.map((p) => [p.id, p])), [state.papers]);
      const selectedPaperData = paperById[selectedPaper] || null;
      const selectedFeedItemData = state.feedItems.find((item) => item.id === selectedFeedItem) || null;
      const selectedFinding = evidence ? (() => {
        const paper = paperById[evidence.paperId];
        if (!paper) return null;
        for (const section of paper.summary.sections || []) {
          const entry = (section.entries || []).find((item) => item.id === evidence.findingId);
          if (entry) return entry;
        }
        return null;
      })() : null;

      const dirtyCount = state.papers.reduce(
        (count, paper) =>
          count + textEntriesOf(paper).filter((finding) => finding.status === 'needs_recheck').length,
        0
      );

      const citationCount = selectedPaperData
        ? textEntriesOf(selectedPaperData).filter((entry) => String(entry.quote || '').trim()).length
        : 0;

      const batchSummaryPapers = selectedPaperIds
        .map((id) => paperById[id])
        .filter((paper) => paper && paper.pdfPath && paper.pageCount > 0 && !paper.summary?.ai_generated);
      const batchSummarySkipped = Math.max(0, selectedPaperIds.length - batchSummaryPapers.length);
      const batchRevalidatePapers = selectedPaperIds
        .map((id) => paperById[id])
        .filter(
          (paper) =>
            paper &&
            paper.pdfPath &&
            paper.pageCount > 0 &&
            textEntriesOf(paper).some((entry) => String(entry.quote || '').trim())
        );

      const groupCounts = useMemo(() => {
        const counts = { all: state.papers.length };
        (state.groups || GROUPS).forEach((group) => {
          counts[group.id] = state.papers.filter((paper) => paper.groups.includes(group.id)).length;
        });
        return counts;
      }, [state.papers, state.groups]);

      const groupFilterLogic = state.groupFilterLogic || 'and';

      useEffect(() => {
        const needle = query.trim();
        if (dataSource !== 'real' || !needle) {
          setSearchIds(null);
          setSearchSnippets({});
          setSearchLoading(false);
          return undefined;
        }
        const timer = window.setTimeout(async () => {
          setSearchLoading(true);
          try {
            const response = await fetch(
              `${LIT_DEMO_API_BASE}/api/search?q=${encodeURIComponent(needle)}&limit=100`,
              { cache: 'no-store' }
            );
            const body = await response.json();
            if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
            setSearchIds((body.papers || []).map((paper) => paper.id));
            setSearchSnippets(
              Object.fromEntries((body.papers || []).map((paper) => [paper.id, paper.snippet || '']))
            );
          } catch (error) {
            setSearchIds(null);
            setSearchSnippets({});
            setToast(`全文搜索失败：${error.message}`);
          } finally {
            setSearchLoading(false);
          }
        }, 260);
        return () => window.clearTimeout(timer);
      }, [query, dataSource]);

      const filteredPapers = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const serverSearchActive = dataSource === 'real' && Boolean(needle) && searchIds !== null;
        const rows = state.papers.filter((paper) => {
          const groupOk =
            selectedGroups.length === 0 ||
            (groupFilterLogic === 'or'
              ? selectedGroups.some((groupId) => paper.groups.includes(groupId))
              : selectedGroups.every((groupId) => paper.groups.includes(groupId)));
          const clientSearchOk =
            !needle || `${paper.title} ${paper.authors} ${paper.abstract}`.toLowerCase().includes(needle);
          const searchOk = serverSearchActive ? searchIds.includes(paper.id) : clientSearchOk;
          return groupOk && searchOk;
        });
        if (paperSort === 'title') rows.sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-CN'));
        if (paperSort === 'year-desc') rows.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
        if (paperSort === 'year-asc') rows.sort((a, b) => Number(a.year || 0) - Number(b.year || 0));
        if (paperSort === 'venue') rows.sort((a, b) => String(a.venue || '').localeCompare(String(b.venue || ''), 'zh-CN'));
        return rows;
      }, [state.papers, selectedGroups, groupFilterLogic, query, dataSource, searchIds, paperSort]);

      useEffect(() => {
        if (filteredPapers.length > 0 && !filteredPapers.some((paper) => paper.id === selectedPaper)) {
          setSelectedPaper(filteredPapers[0].id);
          setSelectedPaperIds([filteredPapers[0].id]);
          setLastSelectedPaper(filteredPapers[0].id);
          setEvidence(null);
        }
      }, [filteredPapers, selectedPaper]);

      const allFilteredSelected =
        filteredPapers.length > 0 && filteredPapers.every((paper) => selectedPaperIds.includes(paper.id));
      const selectedPapersData = state.papers.filter((paper) => selectedPaperIds.includes(paper.id));

      const toggleGroupFilter = (groupId) => {
        setSelectedGroups((previous) =>
          previous.includes(groupId) ? previous.filter((id) => id !== groupId) : [...previous, groupId]
        );
      };

      const handleGroupBodyClick = (groupId) => {
        if (groupMultiSelect) {
          toggleGroupFilter(groupId);
        } else {
          setSelectedGroups([groupId]);
        }
      };

      const handleGroupCheckbox = (groupId) => {
        setGroupMultiSelect(true);
        toggleGroupFilter(groupId);
      };

      const clearGroupFilter = () => {
        setSelectedGroups([]);
        setGroupMultiSelect(false);
      };

      const cancelGroupMultiSelect = () => {
        setGroupMultiSelect(false);
        setSelectedGroups((previous) => (previous.length ? [previous[previous.length - 1]] : []));
      };

      const unreadByFeed = useMemo(() => {
        const counts = {};
        state.feedItems.forEach((item) => {
          if (!item.read && !item.hidden) counts[item.feedId] = (counts[item.feedId] || 0) + 1;
        });
        return counts;
      }, [state.feedItems]);

      const unreadTotal = useMemo(
        () => (feedsData.items || []).filter((item) => !item.read).length,
        [feedsData.items]
      );

      const filteredFeedItems = useMemo(() => {
        return state.feedItems.filter((item) => {
          if (item.hidden) return false;
          if (selectedFeed !== 'all' && item.feedId !== selectedFeed) return false;
          if (feedFilter === 'recommend') return item.label === 'recommend';
          if (feedFilter === 'unread') return !item.read;
          if (feedFilter === 'read') return item.read;
          return true;
        });
      }, [state.feedItems, selectedFeed, feedFilter]);

      useEffect(() => {
        if (filteredFeedItems.length > 0 && !filteredFeedItems.some((item) => item.id === selectedFeedItem)) {
          setSelectedFeedItem(filteredFeedItems[0].id);
        }
      }, [filteredFeedItems, selectedFeedItem]);

      const scopePapers = useMemo(
        () => state.papers.filter((paper) => scopeIds.includes(paper.id)),
        [state.papers, scopeIds]
      );

      const clusterOf = (node) => {
        if (Number.isInteger(node.cluster)) return node.cluster;
        const index = state.graph.nodes.findIndex((item) => item.id === node.id);
        if (state.clusterMode === 'topic') {
          if (node.group === 'interp') return 0;
          if (node.group === 'dynamics') return 1;
          return 2;
        }
        if (state.clusterMode === 'citation') return (index + state.clusterSeed) % 3;
        return (index + state.clusterSeed) % 3;
      };

      const nodeColor = (node) => {
        if (state.graphColorMode === 'cluster') return CLUSTER_COLORS[clusterOf(node) % CLUSTER_COLORS.length];
        return groupById[node.group] ? groupById[node.group].color : 'var(--dsw-alias-label-secondary, #92a0ae)';
      };

      const selectPaper = (paperId) => {
        setSelectedPaper(paperId);
        setSelectedPaperIds([paperId]);
        setLastSelectedPaper(paperId);
        setEvidence(null);
        setGroupMenuOpen(false);
      };

      const mergeGroupSections = (next, paper, groupId) => {
        const hidden = new Set(paper.summary.hiddenSections || []);
        const existing = new Set(paper.summary.sections.map((item) => item.key));
        (next.groupTemplates[groupId] || []).forEach((definition) => {
          const key = definition.key || definition.id;
          if (!key || hidden.has(key) || existing.has(key)) return;
          paper.summary.sections.push(initSection(definition));
          existing.add(key);
        });
      };

      const selectPaperRow = (paper, event) => {
        if (event.shiftKey && lastSelectedPaper) {
          const anchor = filteredPapers.findIndex((item) => item.id === lastSelectedPaper);
          const current = filteredPapers.findIndex((item) => item.id === paper.id);
          if (anchor >= 0 && current >= 0) {
            const start = Math.min(anchor, current);
            const end = Math.max(anchor, current);
            setSelectedPaperIds(filteredPapers.slice(start, end + 1).map((item) => item.id));
            setSelectedPaper(paper.id);
            setEvidence(null);
            return;
          }
        }
        if (event.metaKey || event.ctrlKey) {
          setSelectedPaperIds((previous) =>
            previous.includes(paper.id) ? previous.filter((id) => id !== paper.id) : [...previous, paper.id]
          );
          setSelectedPaper(paper.id);
          setLastSelectedPaper(paper.id);
          setEvidence(null);
          return;
        }
        setSelectedPaper(paper.id);
        setSelectedPaperIds([paper.id]);
        setLastSelectedPaper(paper.id);
        setEvidence(null);
        setGroupMenuOpen(false);
      };

      const togglePaperCheck = (paperId, checked) => {
        setSelectedPaperIds((previous) => {
          if (checked) return previous.includes(paperId) ? previous : [...previous, paperId];
          return previous.filter((id) => id !== paperId);
        });
        setSelectedPaper(paperId);
        setLastSelectedPaper(paperId);
      };

      const selectAllFiltered = () => {
        const allSelected =
          filteredPapers.length > 0 && filteredPapers.every((paper) => selectedPaperIds.includes(paper.id));
        setSelectedPaperIds(allSelected ? [] : filteredPapers.map((paper) => paper.id));
        if (!allSelected && filteredPapers.length > 0) {
          setSelectedPaper(filteredPapers[0].id);
          setLastSelectedPaper(filteredPapers[0].id);
        }
      };

      const openContextMenu = (event, paper) => {
        event.preventDefault();
        if (!selectedPaperIds.includes(paper.id)) {
          setSelectedPaperIds([paper.id]);
          setSelectedPaper(paper.id);
          setLastSelectedPaper(paper.id);
        }
        const root = rootRef.current;
        if (!root) return;
        const rect = root.getBoundingClientRect();
        setContextMenu({
          x: Math.max(8, Math.min(event.clientX - rect.left, rect.width - 250)),
          y: Math.max(8, Math.min(event.clientY - rect.top, rect.height - 300)),
          paperId: paper.id,
        });
      };

      const bulkToggleGroup = (groupId) => {
        if (selectedPaperIds.length === 0) return;
        const ids = new Set(selectedPaperIds);
        const selectedPapers = state.papers.filter((paper) => ids.has(paper.id));
        const allHave = selectedPapers.length > 0 && selectedPapers.every((paper) => paper.groups.includes(groupId));
        mutate((next) => {
          next.papers.forEach((paper) => {
            if (!ids.has(paper.id)) return;
            if (allHave) {
              paper.groups = paper.groups.filter((id) => id !== groupId);
            } else if (!paper.groups.includes(groupId)) {
              paper.groups.push(groupId);
              mergeGroupSections(next, paper, groupId);
            }
            paper.edited = true;
          });
        });
        setToast(allHave ? `已从 ${selectedPapers.length} 篇论文移出分组` : `已为 ${selectedPapers.length} 篇论文添加分组`);
      };

      const bulkCreateGroup = async () => {
        const name = bulkGroupName.trim();
        if (!name) return;
        const id = await createGroup(name, '#d970ff');
        if (!id) return;
        bulkToggleGroup(id);
        setBulkGroupName('');
      };

      const exportSelectedRis = () => {
        const selectedPapers = state.papers.filter((paper) => selectedPaperIds.includes(paper.id));
        if (selectedPapers.length === 0) return;
        downloadText(
          'lit-demo-selected.ris',
          selectedPapers.map((paper) => buildRis(paper)).join('\n'),
          'application/x-research-info-systems;charset=utf-8'
        );
        setToast(`已导出 ${selectedPapers.length} 条 RIS`);
      };

      const requestDeleteSelected = () => {
        if (selectedPaperIds.length === 0) return;
        setContextMenu(null);
        setDeleteConfirmOpen(true);
      };

      const deleteSelectedPapers = async () => {
        const ids = [...selectedPaperIds];
        if (ids.length === 0) return;
        setDeleteBusy(true);
        try {
          if (dataSource === 'real') {
            const response = await fetch(`${LIT_DEMO_API_BASE}/api/papers/delete`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ ids }),
            });
            const body = await response.json();
            if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          }
          const idSet = new Set(ids);
          mutate((next) => {
            next.papers = next.papers.filter((paper) => !idSet.has(paper.id));
            next.feedItems.forEach((item) => {
              if (idSet.has(item.paperId)) {
                item.paperId = null;
                item.saved = false;
              }
            });
          });
          setSelectedPaperIds([]);
          setSelectedPaper('');
          setContextMenu(null);
          setDeleteConfirmOpen(false);
          setToast(`已从文献库删除 ${ids.length} 篇论文`);
        } catch (error) {
          setToast(`删除失败：${error.message}`);
        } finally {
          setDeleteBusy(false);
        }
      };

      const savePaperMetadata = async (fields) => {
        if (!selectedPaperData) return;
        if (dataSource !== 'real') {
          patchPaper(selectedPaperData.id, fields);
          setEditPaperOpen(false);
          setToast('已更新演示论文信息');
          return;
        }
        setEditBusy(true);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/papers/${encodeURIComponent(selectedPaperData.id)}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(fields),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          const updated = mapRealPaper(body.paper);
          setState((previous) => ({
            ...previous,
            papers: previous.papers.map((paper) => (paper.id === updated.id ? updated : paper)),
          }));
          setEditPaperOpen(false);
          setToast('文献信息已写回 SQLite');
        } catch (error) {
          setToast(`保存文献信息失败：${error.message}`);
        } finally {
          setEditBusy(false);
        }
      };

      const regenerateAutoSummary = async (paper) => {
        if (!paper || dataSource !== 'real') return;
        setRegenLoading(true);
        try {
          const response = await fetch(
            `${LIT_DEMO_API_BASE}/api/papers/${encodeURIComponent(paper.id)}/auto-summary`,
            { method: 'POST' }
          );
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          const updated = mapRealPaper(body.paper);
          setState((previous) => ({
            ...previous,
            papers: previous.papers.map((item) => (item.id === updated.id ? updated : item)),
          }));
          setToast('已重新生成规则草稿');
        } catch (error) {
          setToast(`生成草稿失败：${error.message}`);
        } finally {
          setRegenLoading(false);
        }
      };

      const generateAiSummary = async (paper) => {
        if (!paper || dataSource !== 'real') return;
        if (!paper.pdfPath || paper.pageCount === 0) {
          setMetadataOnlyPaper(paper);
          return;
        }
        setAiSummaryLoading(true);
        try {
          const response = await fetch(
            `${LIT_DEMO_API_BASE}/api/papers/${encodeURIComponent(paper.id)}/model-summary`,
            { method: 'POST' }
          );
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          const updated = mapRealPaper(body.paper);
          setState((previous) => ({
            ...previous,
            papers: previous.papers.map((item) => (item.id === updated.id ? updated : item)),
          }));
          setToast(`AI 总结完成${updated.summary.model ? ` · ${updated.summary.model}` : ''}`);
        } catch (error) {
          setToast(`AI 总结失败：${error.message}`);
        } finally {
          setAiSummaryLoading(false);
        }
      };

      const setSummaryReviewed = async (paper, reviewed) => {
        if (!paper || dataSource !== 'real') return;
        setAcceptingSummary(true);
        try {
          const response = await fetch(
            `${LIT_DEMO_API_BASE}/api/papers/${encodeURIComponent(paper.id)}/summary-status`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ reviewed }),
            }
          );
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          const updated = mapRealPaper(body.paper);
          setState((previous) => ({
            ...previous,
            papers: previous.papers.map((item) => (item.id === updated.id ? updated : item)),
          }));
          setToast(reviewed ? '已标记为已总结' : '已撤回为 AI 总结');
        } catch (error) {
          setToast(`状态更新失败：${error.message}`);
        } finally {
          setAcceptingSummary(false);
        }
      };

      const addSectionPreset = (preset) => {
        mutate((next) => {
          const id = preset.id || `custom-${Date.now()}`;
          if (next.sectionPresets.some((item) => item.id === id)) return;
          next.sectionPresets.push({ ...preset, id });
        });
        setToast('已新增预设大类');
      };

      const updateSectionPreset = (presetId, patch) => {
        mutate((next) => {
          const preset = next.sectionPresets.find((item) => item.id === presetId);
          if (!preset) return;
          Object.assign(preset, patch);
          Object.values(next.groupTemplates || {}).forEach((templates) => {
            templates.forEach((template) => {
              if (template.presetId !== presetId) return;
              if (patch.title !== undefined) template.title = patch.title;
              if (patch.type !== undefined) template.type = patch.type;
              if (patch.hint !== undefined) template.hint = patch.hint;
              if (patch.options !== undefined) template.options = clone(patch.options);
              if (patch.max !== undefined) template.max = patch.max;
            });
          });
        });
      };

      const deleteSectionPreset = (presetId) => {
        const preset = state.sectionPresets.find((item) => item.id === presetId);
        if (!preset) return;
        const applied = state.papers.filter((paper) =>
          (paper.summary.sections || []).some(
            (section) => section.key === presetId || section.presetId === presetId
          )
        );
        if (
          !window.confirm(
            `目前有 ${applied.length} 篇文献应用了「${preset.title}」大类。\n删除后会从这些文献中移除该大类及其条目，是否删除？`
          )
        ) {
          return;
        }
        mutate((next) => {
          next.sectionPresets = next.sectionPresets.filter((item) => item.id !== presetId);
          Object.keys(next.groupTemplates || {}).forEach((groupId) => {
            next.groupTemplates[groupId] = (next.groupTemplates[groupId] || []).filter(
              (template) => template.presetId !== presetId
            );
          });
          next.papers.forEach((paper) => {
            const sections = paper.summary.sections || [];
            if (!sections.some((section) => section.key === presetId || section.presetId === presetId)) return;
            paper.summary.sections = sections.filter(
              (section) => section.key !== presetId && section.presetId !== presetId
            );
            const hidden = new Set(paper.summary.hiddenSections || []);
            hidden.add(presetId);
            paper.summary.hiddenSections = Array.from(hidden);
            paper.edited = true;
          });
        });
        setToast(`已删除大类，影响 ${applied.length} 篇文献`);
      };

      const toggleGroupDefaultPreset = (groupId, presetId, checked) => {
        mutate((next) => {
          const preset = next.sectionPresets.find((item) => item.id === presetId);
          if (!preset) return;
          const templates = next.groupTemplates[groupId] || [];
          if (checked) {
            if (!templates.some((template) => template.presetId === presetId)) {
              templates.push(templateFromPreset(preset));
            }
          } else {
            next.groupTemplates[groupId] = templates.filter((template) => template.presetId !== presetId);
            return;
          }
          next.groupTemplates[groupId] = templates;
        });
      };

      const defaultGroupTemplate = () =>
        ['question', 'findings', 'limitations']
          .map((presetId) => SECTION_PRESET_MAP[presetId])
          .filter(Boolean)
          .map((preset) => templateFromPreset(preset));

      const saveGroupDraft = async (groupId) => {
        const draft = groupDraftsRef.current[groupId];
        if (!draft) return;
        delete groupDraftsRef.current[groupId];
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/groups/${encodeURIComponent(groupId)}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: draft.name, color: draft.color }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
        } catch (error) {
          setToast(`分组保存失败：${error.message}`);
        }
      };

      const scheduleGroupSave = (groupId, patch) => {
        const current = groupDraftsRef.current[groupId] || groupById[groupId] || {};
        const draft = {
          name: patch.name !== undefined ? patch.name : current.name,
          color: patch.color !== undefined ? patch.color : current.color,
        };
        groupDraftsRef.current[groupId] = draft;
        if (dataSource !== 'real') return;
        if (groupSaveTimersRef.current[groupId]) {
          window.clearTimeout(groupSaveTimersRef.current[groupId]);
        }
        groupSaveTimersRef.current[groupId] = window.setTimeout(() => {
          delete groupSaveTimersRef.current[groupId];
          saveGroupDraft(groupId);
        }, 500);
      };

      const flushGroupSaves = () => {
        Object.keys(groupSaveTimersRef.current).forEach((groupId) => {
          window.clearTimeout(groupSaveTimersRef.current[groupId]);
          delete groupSaveTimersRef.current[groupId];
          saveGroupDraft(groupId);
        });
      };

      const createGroup = async (name, color) => {
        let id = `group-${Date.now()}`;
        let nextGroup = { id, name, color };
        if (dataSource === 'real') {
          try {
            const response = await fetch(`${LIT_DEMO_API_BASE}/api/groups`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name, color }),
            });
            const body = await response.json();
            if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
            nextGroup = body.group;
            id = body.group.id;
          } catch (error) {
            setToast(`创建分组失败：${error.message}`);
            return '';
          }
        }
        mutate((next) => {
          next.groups.push(nextGroup);
          next.groupTemplates[id] = defaultGroupTemplate();
        });
        setToast(`已创建分组「${name}」`);
        return id;
      };

      const renameGroup = (groupId, name) => {
        mutate((next) => {
          const group = next.groups.find((item) => item.id === groupId);
          if (group) group.name = name;
        });
        scheduleGroupSave(groupId, { name });
      };

      const recolorGroup = (groupId, color) => {
        mutate((next) => {
          const group = next.groups.find((item) => item.id === groupId);
          if (group) group.color = color;
        });
        scheduleGroupSave(groupId, { color });
      };

      const moveGroup = async (groupId, direction) => {
        const ordered = [...state.groups];
        const index = ordered.findIndex((group) => group.id === groupId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= ordered.length) return;
        const [moved] = ordered.splice(index, 1);
        ordered.splice(target, 0, moved);
        mutate((next) => {
          next.groups = ordered;
        });
        if (dataSource !== 'real') return;
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/groups/reorder`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids: ordered.map((group) => group.id) }),
          });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `HTTP ${response.status}`);
          }
        } catch (error) {
          setToast(`分组顺序保存失败：${error.message}`);
        }
      };

      const movePaper = async (paperId, direction) => {
        const ordered = [...state.papers];
        const index = ordered.findIndex((paper) => paper.id === paperId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= ordered.length) return;
        const [moved] = ordered.splice(index, 1);
        ordered.splice(target, 0, moved);
        setState((previous) => ({ ...previous, papers: ordered }));
        if (dataSource !== 'real') return;
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/papers/reorder`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids: ordered.map((paper) => paper.id) }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
        } catch (error) {
          setToast(`文献顺序保存失败：${error.message}`);
        }
      };

      const deleteGroup = async (groupId) => {
        const group = groupById[groupId];
        if (!group) return;
        const applied = state.papers.filter((paper) => (paper.groups || []).includes(groupId)).length;
        if (
          !window.confirm(
            `目前有 ${applied} 篇文献使用分组「${group.name}」。\n删除后会从这些文献中移除该分组，论文本身不会删除。是否删除？`
          )
        ) {
          return;
        }
        if (dataSource === 'real') {
          try {
            const response = await fetch(`${LIT_DEMO_API_BASE}/api/groups/${encodeURIComponent(groupId)}`, {
              method: 'DELETE',
            });
            const body = await response.json();
            if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          } catch (error) {
            setToast(`删除分组失败：${error.message}`);
            return;
          }
        }
        mutate((next) => {
          next.groups = next.groups.filter((item) => item.id !== groupId);
          delete next.groupTemplates[groupId];
          next.papers.forEach((paper) => {
            paper.groups = paper.groups.filter((id) => id !== groupId);
          });
        });
        setSelectedGroups((previous) => previous.filter((id) => id !== groupId));
        setToast(`已删除分组「${group.name}」`);
      };

      const patchPaper = (paperId, patch) => {
        mutate((next) => {
          const paper = next.papers.find((item) => item.id === paperId);
          if (paper) Object.assign(paper, patch);
        });
      };

      const patchSection = (paperId, sectionKey, patch) => {
        mutate((next) => {
          const paper = next.papers.find((item) => item.id === paperId);
          if (!paper) return;
          const section = paper.summary.sections.find((item) => item.key === sectionKey);
          if (!section) return;
          Object.assign(section, patch);
          paper.edited = true;
        });
      };

      const patchEntry = (paperId, sectionKey, entryId, patch, markForReview) => {
        mutate((next) => {
          const paper = next.papers.find((item) => item.id === paperId);
          if (!paper) return;
          const section = paper.summary.sections.find((item) => item.key === sectionKey);
          if (!section) return;
          const entry = (section.entries || []).find((item) => item.id === entryId);
          if (!entry) return;
          Object.assign(entry, patch);
          if (markForReview && section.owner !== 'user') entry.status = 'needs_recheck';
          paper.edited = true;
        });
      };

      const addEntry = (paperId, sectionKey) => {
        mutate((next) => {
          const paper = next.papers.find((item) => item.id === paperId);
          if (!paper) return;
          const section = paper.summary.sections.find((item) => item.key === sectionKey);
          if (!section || section.type !== 'text') return;
          section.entries.push(textEntry(`entry-${Date.now()}`, ''));
          paper.edited = true;
        });
      };

      const deleteEntry = (paperId, sectionKey, entryId) => {
        mutate((next) => {
          const paper = next.papers.find((item) => item.id === paperId);
          if (!paper) return;
          const section = paper.summary.sections.find((item) => item.key === sectionKey);
          if (!section) return;
          section.entries = (section.entries || []).filter((item) => item.id !== entryId);
          paper.edited = true;
        });
        if (evidence && evidence.findingId === entryId) setEvidence(null);
      };

      const removeSection = (paperId, sectionKey) => {
        mutate((next) => {
          const paper = next.papers.find((item) => item.id === paperId);
          if (!paper) return;
          const section = paper.summary.sections.find((item) => item.key === sectionKey);
          paper.summary.sections = paper.summary.sections.filter((item) => item.key !== sectionKey);
          const hidden = new Set(paper.summary.hiddenSections || []);
          hidden.add(sectionKey);
          paper.summary.hiddenSections = Array.from(hidden);
          paper.edited = true;
        });
        if (evidence && evidence.sectionKey === sectionKey) setEvidence(null);
      };

      const addSectionToPaper = (paperId, definition, saveAsPreset) => {
        const key = definition.key || definition.id || `custom-${Date.now()}`;
        const currentPaper = state.papers.find((item) => item.id === paperId);
        if (currentPaper && currentPaper.summary.sections.some((item) => item.key === key)) {
          setToast('这个大类已经在当前论文里了');
          return;
        }
        mutate((next) => {
          const paper = next.papers.find((item) => item.id === paperId);
          if (!paper) return;
          if (paper.summary.sections.some((item) => item.key === key)) return;
          paper.summary.sections.push(initSection({ ...definition, key }));
          paper.summary.hiddenSections = (paper.summary.hiddenSections || []).filter((item) => item !== key);
          if (saveAsPreset && !next.sectionPresets.some((item) => item.id === key)) {
            next.sectionPresets.push({
              id: key,
              title: definition.title,
              type: definition.type,
              owner: definition.owner || 'user',
              hint: definition.hint || '',
              ...(definition.type === 'rating' ? { max: definition.max || 5 } : {}),
              ...(definition.type === 'tags' ? { options: clone(definition.options || []) } : {}),
            });
          }
          paper.edited = true;
        });
      };

      const saveGroupDefault = (paperId, groupId) => {
        mutate((next) => {
          const paper = next.papers.find((item) => item.id === paperId);
          if (!paper || !groupId) return;
          next.groupTemplates[groupId] = paper.summary.sections.map((section) =>
            clone({
              key: section.key,
              presetId: section.presetId || null,
              title: section.title,
              type: section.type,
              owner: section.owner || 'user',
              hint: section.hint || '',
              ...(section.type === 'rating' ? { max: section.max || 5 } : {}),
              ...(section.type === 'tags' ? { options: section.options || [] } : {}),
            })
          );
        });
        setToast('已保存为当前分组的默认结构');
      };

      const sectionHasContent = (section) =>
        Boolean(
          (Array.isArray(section.entries) &&
            section.entries.some((entry) => String(entry.text || '').trim() || String(entry.quote || '').trim())) ||
            (Array.isArray(section.selected) && section.selected.length > 0) ||
            section.value === true ||
            (typeof section.value === 'number' && section.value > 0)
        );

      const templateKeysForGroups = (templates, groupIds) => {
        const keys = new Set();
        for (const groupId of groupIds) {
          for (const definition of templates[groupId] || []) {
            const key = definition.key || definition.id;
            if (key) keys.add(key);
          }
        }
        return keys;
      };

      const togglePaperGroup = (paperId, groupId) => {
        mutate((next) => {
          const paper = next.papers.find((item) => item.id === paperId);
          if (!paper) return;
          if (paper.groups.includes(groupId)) {
            const remainingGroups = paper.groups.filter((id) => id !== groupId);
            const removableKeys = templateKeysForGroups(next.groupTemplates, [groupId]);
            const retainedKeys = templateKeysForGroups(next.groupTemplates, remainingGroups);
            paper.groups = remainingGroups;
            paper.summary.sections = paper.summary.sections.filter((section) => {
              const key = section.key || section.presetId;
              if (!key || !removableKeys.has(key) || retainedKeys.has(key)) return true;
              if (section.owner === 'user') return true;
              return sectionHasContent(section);
            });
          } else {
            paper.groups.push(groupId);
            const hidden = new Set(paper.summary.hiddenSections || []);
            const existing = new Set(paper.summary.sections.map((item) => item.key));
            (next.groupTemplates[groupId] || []).forEach((definition) => {
              const key = definition.key || definition.id;
              if (!key || hidden.has(key) || existing.has(key)) return;
              paper.summary.sections.push(initSection(definition));
              existing.add(key);
            });
          }
          paper.edited = true;
        });
      };

      const setRating = (paperId, sectionKey, value) => {
        patchSection(paperId, sectionKey, { value });
      };

      const toggleTag = (paperId, sectionKey, tag) => {
        mutate((next) => {
          const paper = next.papers.find((item) => item.id === paperId);
          if (!paper) return;
          const section = paper.summary.sections.find((item) => item.key === sectionKey);
          if (!section) return;
          const selected = new Set(section.selected || []);
          if (selected.has(tag)) selected.delete(tag);
          else selected.add(tag);
          section.selected = Array.from(selected);
          paper.edited = true;
        });
      };

      const addCustomTag = async (paperId, sectionKey, explicitTag) => {
        const value = String(explicitTag || tagDrafts[sectionKey] || '').trim();
        if (!value) return;
        if (dataSource === 'real') {
          try {
            const response = await fetch(`${LIT_DEMO_API_BASE}/api/papers/${encodeURIComponent(paperId)}/tags`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ tag: value }),
            });
            const body = await response.json();
            if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
            const updated = mapRealPaper(body.paper);
            setState((previous) => ({
              ...previous,
              papers: previous.papers.map((item) => (item.id === updated.id ? updated : item)),
            }));
            setTagLibrary(body.tags || []);
            setTagDrafts((previous) => ({ ...previous, [sectionKey]: '' }));
          } catch (error) {
            setToast(`添加标签失败：${error.message}`);
          }
          return;
        }
        mutate((next) => {
          const paper = next.papers.find((item) => item.id === paperId);
          if (!paper) return;
          const section = paper.summary.sections.find((item) => item.key === sectionKey);
          if (!section) return;
          const options = Array.isArray(section.options) ? section.options : [];
          const existing = options.find((option) => String(option).toLowerCase() === value.toLowerCase());
          const tag = existing || value;
          if (!existing) section.options = [...options, tag];
          const selected = new Set(section.selected || []);
          selected.add(tag);
          section.selected = [...selected];
          paper.edited = true;
        });
        setTagDrafts((previous) => ({ ...previous, [sectionKey]: '' }));
      };

      const removeCustomTag = async (paperId, sectionKey, tag) => {
        if (dataSource === 'real') {
          try {
            const response = await fetch(
              `${LIT_DEMO_API_BASE}/api/papers/${encodeURIComponent(paperId)}/tags/${encodeURIComponent(tag)}`,
              { method: 'DELETE' }
            );
            const body = await response.json();
            if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
            const updated = mapRealPaper(body.paper);
            setState((previous) => ({
              ...previous,
              papers: previous.papers.map((item) => (item.id === updated.id ? updated : item)),
            }));
            setTagLibrary(body.tags || []);
          } catch (error) {
            setToast(`移除标签失败：${error.message}`);
          }
          return;
        }
        mutate((next) => {
          const paper = next.papers.find((item) => item.id === paperId);
          if (!paper) return;
          const section = paper.summary.sections.find((item) => item.key === sectionKey);
          if (!section) return;
          section.selected = (section.selected || []).filter((item) => item !== tag);
          paper.edited = true;
        });
      };

      const addTagSection = (paperId) => {
        mutate((next) => {
          const paper = next.papers.find((item) => item.id === paperId);
          if (!paper) return;
          if (paper.summary.sections.some((item) => item.key === 'topics')) return;
          paper.summary.sections.push({
            key: 'topics',
            title: '主题标签',
            type: 'tags',
            options: [],
            selected: [],
            owner: 'user',
            hint: '可自由添加标签',
          });
          paper.edited = true;
        });
        setToast('已添加主题标签');
      };

      const toggleRead = (paperId, sectionKey) => {
        mutate((next) => {
          const paper = next.papers.find((item) => item.id === paperId);
          if (!paper) return;
          const section = paper.summary.sections.find((item) => item.key === sectionKey);
          if (!section) return;
          section.value = !section.value;
          paper.edited = true;
        });
      };

      const startBatchSummary = async () => {
        if (batchSummaryBusy || batchSummaryPapers.length === 0) return;
        setBatchSummaryBusy(true);
        let success = 0;
        let failed = 0;
        try {
          for (let index = 0; index < batchSummaryPapers.length; index += 1) {
            const paper = batchSummaryPapers[index];
            setBatchSummaryProgress(`正在生成 ${index + 1} / ${batchSummaryPapers.length}：${paper.title.slice(0, 48)}`);
            try {
              const response = await fetch(
                `${LIT_DEMO_API_BASE}/api/papers/${encodeURIComponent(paper.id)}/model-summary`,
                { method: 'POST' }
              );
              const body = await response.json();
              if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
              const updated = mapRealPaper(body.paper);
              setState((previous) => ({
                ...previous,
                papers: previous.papers.map((item) => (item.id === updated.id ? updated : item)),
              }));
              success += 1;
            } catch (error) {
              failed += 1;
            }
          }
          setToast(`批量总结完成：${success} 成功${failed ? `，${failed} 失败` : ''}`);
        } finally {
          setBatchSummaryBusy(false);
          setBatchSummaryProgress('');
          setBatchSummaryOpen(false);
        }
      };

      const startMetadataEnrich = async () => {
        if (metadataEnriching || selectedPaperIds.length === 0) return;
        setMetadataEnriching(true);
        try {
          const response = await fetch(`${LIT_DEMO_API_BASE}/api/metadata/enrich`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids: selectedPaperIds }),
          });
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          const papers = (body.papers || []).map(mapRealPaper);
          setState((previous) => ({ ...previous, papers }));
          setToast(
            `元数据补全：${body.updated} 篇更新${body.errors?.length ? `，${body.errors.length} 篇失败` : ''}`
          );
        } catch (error) {
          setToast(`元数据补全失败：${error.message}`);
        } finally {
          setMetadataEnriching(false);
        }
      };

      const startBatchRevalidate = async () => {
        if (batchRevalidateBusy || batchRevalidatePapers.length === 0) return;
        setBatchRevalidateBusy(true);
        let checked = 0;
        let located = 0;
        let missing = 0;
        let failed = 0;
        try {
          for (let index = 0; index < batchRevalidatePapers.length; index += 1) {
            const paper = batchRevalidatePapers[index];
            setBatchRevalidateProgress(`定位 ${index + 1} / ${batchRevalidatePapers.length}`);
            try {
              const response = await fetch(
                `${LIT_DEMO_API_BASE}/api/papers/${encodeURIComponent(paper.id)}/revalidate-citations`,
                { method: 'POST' }
              );
              const body = await response.json();
              if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
              const updated = mapRealPaper(body.paper);
              setState((previous) => ({
                ...previous,
                papers: previous.papers.map((item) => (item.id === updated.id ? updated : item)),
              }));
              checked += Number(body.checked) || 0;
              located += Number(body.located) || 0;
              missing += Number(body.missing) || 0;
            } catch (error) {
              failed += 1;
            }
          }
          setToast(
            `批量定位完成：${checked} 条，${located} 已定位，${missing} 未找到${failed ? `，${failed} 篇失败` : ''}`
          );
        } finally {
          setBatchRevalidateBusy(false);
          setBatchRevalidateProgress('');
        }
      };

      const revalidateCitations = async () => {
        if (!selectedPaperData || dataSource !== 'real') {
          setToast('只有带 PDF 的文献支持引文定位');
          return;
        }
        if (citationCount === 0) {
          setToast('当前论文没有可定位的引文');
          return;
        }
        setRevalidating(true);
        try {
          const response = await fetch(
            `${LIT_DEMO_API_BASE}/api/papers/${encodeURIComponent(selectedPaperData.id)}/revalidate-citations`,
            { method: 'POST' }
          );
          const body = await response.json();
          if (!response.ok || body.ok !== true) throw new Error(body.error || `HTTP ${response.status}`);
          const updated = mapRealPaper(body.paper);
          setState((previous) => ({
            ...previous,
            papers: previous.papers.map((item) => (item.id === updated.id ? updated : item)),
          }));
          setToast(`定位 ${body.checked} 条：${body.located} 已定位，${body.missing} 未找到`);
        } catch (error) {
          setToast(`引文定位失败：${error.message}`);
        } finally {
          setRevalidating(false);
        }
      };

      const saveRis = (paper) => {
        downloadText(`lit-demo-${paper.id}.ris`, buildRis(paper), 'application/x-research-info-systems;charset=utf-8');
        setToast('RIS 已导出，可在 EndNote 中导入');
      };

      const saveScopeRis = () => {
        const text = scopePapers.map((paper) => buildRis(paper)).join('\n');
        downloadText('lit-demo-scope.ris', text, 'application/x-research-info-systems;charset=utf-8');
        setToast('范围 RIS 已导出');
      };

      const askAssistant = async (paper) => {
        const prompt = `请精读《${paper.title}》（${paper.venue}，${paper.year}），检查每条结论的原文证据，指出需要复核的位置，并给出可引用的页码。`;
        const ok = await copyText(prompt);
        setToast(ok ? '分析指令已复制，可粘贴到当前会话' : '复制失败，请手动选择文本');
      };

      const askScope = async () => {
        const ids = scopePapers.map((paper) => paper.id);
        const prompt = `请分析 scope DEMO-${ids.length} 中的 ${ids.length} 篇论文（${ids.join(', ')}），按机制、动力学和治理三个维度做证据矩阵，并标出需要复核的引用。`;
        const ok = await copyText(prompt);
        setToast(ok ? '范围分析指令已复制，可粘贴到当前会话' : '复制失败');
      };

      const openSynthesis = (ids) => {
        if (!ids.length) {
          setToast('还没有可汇总的论文');
          return;
        }
        setScopeIds(ids);
        setShowSynthesis(true);
      };

      const markFeedItem = (itemId, patch) => {
        mutate((next) => {
          const item = next.feedItems.find((entry) => entry.id === itemId);
          if (item) Object.assign(item, patch);
        });
      };

      const saveFeedItem = (item) => {
        if (item.saved) {
          setToast('这条已经在文献库里了');
          return;
        }
        const newId = `p${Date.now()}`;
        const newPaper = {
          id: newId,
          title: item.title,
          authors: 'RSS 导入',
          year: 2026,
          venue: item.source,
          doi: '10.0000/litdemo.rss',
          arxiv: '',
          groups: item.groupIds.slice(),
          status: '待总结',
          abstract: item.abstract,
          summary: {
            sections: sectionsFromTemplates(state.groupTemplates, item.groupIds),
            hiddenSections: [],
          },
          edited: false,
        };
        mutate((next) => {
          next.papers.unshift(newPaper);
          const stored = next.feedItems.find((entry) => entry.id === item.id);
          if (stored) {
            stored.saved = true;
            stored.read = true;
            stored.paperId = newId;
          }
        });
        setSelectedPaper(newId);
        setToast('已保存到文献库 · 等待总结');
      };

      const addFeed = () => {
        const url = feedInput.trim();
        if (!url) return;
        let name = '自定义 RSS';
        try {
          name = new URL(url).hostname.replace(/^www\./, '');
        } catch (error) {
          // Keep the fallback name for non-URL demo input.
        }
        mutate((next) => {
          next.feeds.push({ id: `feed${Date.now()}`, name, url });
        });
        setFeedInput('');
        setToast('已添加订阅（demo 未联网抓取）');
      };

      const runOnce = () => {
        const now = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        mutate((next) => {
          next.lastRun = `今天 ${now}`;
        });
        setToast('已触发一次采集（demo 模拟）');
      };

      const recluster = () => {
        if (dataSource === 'real') {
          loadRealGraph(Number(state.graphThreshold) || 0.14, state.graphMode || 'semantic');
          return;
        }
        mutate((next) => {
          next.clusterSeed = (next.clusterSeed || 0) + 1;
          next.graphColorMode = 'cluster';
        });
        setToast('已重新聚类');
      };

      const selectCluster = () => {
        const node = state.graph.nodes.find((item) => item.id === selectedNode);
        if (!node) return;
        const cluster = clusterOf(node);
        const selected = state.graph.nodes.filter((item) => clusterOf(item) === cluster);
        const ids = selected.map((item) => item.paperId).filter((paperId) => paperById[paperId]);
        setSelectedNodeIds(selected.map((item) => item.id));
        setScopeIds(ids);
        setToast(`已提取子网络 · ${ids.length} 篇`);
      };

      const getSvgPoint = (event) => {
        const svg = canvasRef.current && canvasRef.current.querySelector('svg');
        if (!svg || !svg.getScreenCTM()) return null;
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const transformed = point.matrixTransform(svg.getScreenCTM().inverse());
        return { x: transformed.x, y: transformed.y };
      };

      const startSelection = (event) => {
        if (event.button !== 0) return;
        const point = getSvgPoint(event);
        if (!point) return;
        event.preventDefault();
        setHoverNode(null);
        setSelectionBox({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
      };

      const updateSelection = (event) => {
        if (!selectionBox) return;
        const point = getSvgPoint(event);
        if (!point) return;
        setSelectionBox({ ...selectionBox, x2: point.x, y2: point.y });
      };

      const finishSelection = () => {
        if (!selectionBox) return;
        const minX = Math.min(selectionBox.x1, selectionBox.x2);
        const maxX = Math.max(selectionBox.x1, selectionBox.x2);
        const minY = Math.min(selectionBox.y1, selectionBox.y2);
        const maxY = Math.max(selectionBox.y1, selectionBox.y2);
        const width = maxX - minX;
        const height = maxY - minY;
        if (width < 6 && height < 6) {
          setSelectedNodeIds([]);
          setSelectionBox(null);
          return;
        }
        const selected = state.graph.nodes.filter(
          (node) => node.x >= minX - 8 && node.x <= maxX + 8 && node.y >= minY - 8 && node.y <= maxY + 8
        );
        setSelectedNodeIds(selected.map((node) => node.id));
        if (selected.length > 0) {
          setSelectedNode(selected[0].id);
          setSelectedPaper(selected[0].paperId);
          setScopeIds(selected.map((node) => node.paperId));
        }
        setSelectionBox(null);
      };

      const toggleNodeSelection = (event, node) => {
        event.stopPropagation();
        setSelectedNode(node.id);
        setSelectedPaper(node.paperId);
        setSelectedNodeIds((previous) => {
          const additive = event.shiftKey || event.metaKey || event.ctrlKey;
          if (!additive) return [node.id];
          return previous.includes(node.id) ? previous.filter((id) => id !== node.id) : [...previous, node.id];
        });
      };

      const hoverGraphNode = (event, node) => {
        const rect = canvasRef.current && canvasRef.current.getBoundingClientRect();
        if (!rect) return;
        setHoverNode({
          nodeId: node.id,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      };

      const selectedGraphNode = state.graph.nodes.find((node) => node.id === selectedNode) || state.graph.nodes[0];
      const selectedGraphPaper = selectedGraphNode ? paperById[selectedGraphNode.paperId] : null;
      const selectedGraphCluster = selectedGraphNode ? clusterOf(selectedGraphNode) : 0;
      const selectedGraphPaperIds = selectedNodeIds
        .map((nodeId) => {
          const node = state.graph.nodes.find((item) => item.id === nodeId);
          return node ? node.paperId : null;
        })
        .filter((paperId) => paperId && paperById[paperId]);
      const hoveredGraphNode = hoverNode ? state.graph.nodes.find((node) => node.id === hoverNode.nodeId) : null;
      const hoveredGraphPaper = hoveredGraphNode ? paperById[hoveredGraphNode.paperId] : null;
      const budgetPercent = Math.min(100, Math.round((state.budgetUsed / state.budgetLimit) * 100));

      const tabButton = (id, label, count, icon) =>
        h(
          'button',
          {
            type: 'button',
            className: tab === id ? 'lit-tab lit-tab-active' : 'lit-tab',
            onClick: () => setTab(id),
            'data-testid': `lit-tab-${id}`,
          },
          h(Icon, { name: icon, size: 14 }),
          label,
          typeof count === 'number' ? h('span', { className: 'lit-tab-count' }, count) : null
        );

      const renderSummarySection = (section, index) => {
        if (section.type === 'tags') return null;
        const typeIcon = section.type === 'rating' ? 'star' : section.type === 'read' ? 'check' : 'file';
        const entries = section.entries || [];
        let body = null;

        if (section.type === 'text') {
          body = h(
            'div',
            { className: 'lit-section-body' },
            entries.length === 0
              ? h('div', { className: 'lit-section-empty' }, '还没有条目')
              : entries.map((entry, entryIndex) =>
                  h(
                    'div',
                    { key: entry.id, className: 'lit-claim' },
                    h(
                      'div',
                      { className: 'lit-claim-head' },
                      h('span', { className: 'lit-claim-index' }, `条目 ${entryIndex + 1}`),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'lit-icon-btn',
                          title: '删除这个条目',
                          onClick: () => deleteEntry(selectedPaperData.id, section.key, entry.id),
                        },
                        h(Icon, { name: 'trash', size: 14 })
                      )
                    ),
                    h('textarea', {
                      className: 'lit-textarea',
                      value: entry.text,
                      rows: 2,
                      placeholder: section.hint || '写一条内容…',
                      onChange: (event) =>
                        patchEntry(selectedPaperData.id, section.key, entry.id, { text: event.target.value }, false),
                    }),
                    h(
                      'div',
                      { className: 'lit-quote-row' },
                      h(
                        'div',
                        { className: 'lit-quote' },
                        entry.quote ? `“${entry.quote}”` : '尚未关联原文',
                        entry.section ? h('span', null, ` · ${entry.section}`) : null
                      ),
                      entry.quote ? h(StatusPill, { status: entry.status }) : null,
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'lit-evidence-chip',
                          onClick: () =>
                            setEvidence({
                              paperId: selectedPaperData.id,
                              findingId: entry.id,
                              sectionKey: section.key,
                            }),
                        },
                        h(Icon, { name: 'link', size: 12 }),
                        entry.page ? `p.${entry.page}` : '找证据'
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'lit-link-btn',
                          onClick: () =>
                            setManualEvidence({
                              paperId: selectedPaperData.id,
                              sectionKey: section.key,
                              entryId: entry.id,
                              quote: entry.quote || '',
                              page: entry.page || null,
                            }),
                        },
                        '手动证据'
                      )
                    ),
                    entry.status === 'needs_recheck'
                      ? h('div', { className: 'lit-warn-line' }, '此条文字已修改，原引文位置可能失效。点右上角“重新定位引文”更新页码。')
                      : null
                  )
                ),
            h(
              'button',
              {
                type: 'button',
                className: 'lit-btn lit-btn-ghost lit-add-entry',
                onClick: () => addEntry(selectedPaperData.id, section.key),
              },
              h(Icon, { name: 'plus', size: 13 }),
              '添加条目'
            )
          );
        } else if (section.type === 'rating') {
          const max = section.max || 5;
          const value = Number(section.value || 0);
          body = h(
            'div',
            { className: 'lit-rating-row' },
            h(
              'div',
              { className: 'lit-stars', role: 'group', 'aria-label': section.title },
              Array.from({ length: max }).map((_, starIndex) =>
                h(
                  'button',
                  {
                    key: starIndex,
                    type: 'button',
                    className: starIndex < value ? 'lit-star lit-star-on' : 'lit-star',
                    title: `${starIndex + 1} 星`,
                    onClick: () => setRating(selectedPaperData.id, section.key, value === starIndex + 1 ? 0 : starIndex + 1),
                  },
                  h(Icon, { name: 'star', size: 19, filled: starIndex < value })
                )
              )
            ),
            h('span', { className: 'lit-rating-label' }, value > 0 ? `${value} / ${max}` : '未评分'),
            h('span', { className: 'lit-section-hint' }, section.hint || '点击星星评分')
          );
        } else if (section.type === 'tags') {
          const selected = section.selected || [];
          const options = section.options || [];
          const draft = tagDrafts[section.key] || '';
          const libraryNames = tagLibrary.map((entry) => entry.name);
          const available = [...new Set([...options, ...libraryNames])].filter(
            (tag) =>
              !selected.some((item) => item.toLowerCase() === tag.toLowerCase()) &&
              (!draft || tag.toLowerCase().includes(draft.toLowerCase()))
          );
          body = h(
            'div',
            { className: 'lit-section-body' },
            selected.length > 0
              ? h(
                  'div',
                  { className: 'lit-tag-selected' },
                  selected.map((tag) =>
                    h(
                      'span',
                      { key: tag, className: 'lit-tag-selected-item' },
                      tag,
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'lit-tag-remove',
                          title: '移除标签',
                          onClick: () => removeCustomTag(selectedPaperData.id, section.key, tag),
                        },
                        h(Icon, { name: 'x', size: 10 })
                      )
                    )
                  )
                )
              : null,
            h(
              'div',
              { className: 'lit-tag-picker' },
              available.map((option) =>
                h(
                  'button',
                  {
                    key: option,
                    type: 'button',
                    className: 'lit-tag-option',
                    onClick: () => addCustomTag(selectedPaperData.id, section.key, option),
                  },
                  option
                )
              )
            ),
            h(
              'div',
              { className: 'lit-tag-editor' },
              h('input', {
                className: 'lit-input',
                value: tagDrafts[section.key] || '',
                placeholder: '搜索标签库，或输入新标签',
                'aria-label': '添加自定义标签',
                onChange: (event) =>
                  setTagDrafts((previous) => ({ ...previous, [section.key]: event.target.value })),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addCustomTag(selectedPaperData.id, section.key);
                  }
                },
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'lit-btn lit-btn-ghost',
                  onClick: () => addCustomTag(selectedPaperData.id, section.key),
                },
                h(Icon, { name: 'plus', size: 12 }),
                '添加'
              )
            ),
            h(
              'div',
              { className: 'lit-section-hint' },
              selected.length > 0
                ? `已选 ${selected.length} 项；点 × 移除；上方可从标签库选择`
                : '从标签库选择，或输入新标签后添加'
            )
          );
        } else if (section.type === 'read') {
          body = h(
            'div',
            { className: 'lit-read-row' },
            h(
              'button',
              {
                type: 'button',
                className: section.value ? 'lit-read-button lit-read-button-on' : 'lit-read-button',
                onClick: () => toggleRead(selectedPaperData.id, section.key),
              },
              h(Icon, { name: section.value ? 'check' : 'x', size: 14 }),
              section.value ? '已读' : '未读'
            ),
            h('span', { className: 'lit-section-hint' }, section.hint || '手动标记')
          );
        }

        return h(
          'div',
          { key: section.key, className: 'lit-section-card' },
          h(
            'div',
            { className: 'lit-section-head' },
            h(
              'div',
              { className: 'lit-section-title-wrap' },
              h('span', { className: 'lit-section-type-icon' }, h(Icon, { name: typeIcon, size: 14, filled: section.type === 'rating' && Number(section.value) > 0 })),
              h('div', { className: 'lit-section-title' }, section.title),
              h('span', { className: 'lit-type-badge' }, SECTION_TYPE_LABELS[section.type] || '文本'),
              section.owner === 'user' ? h('span', { className: 'lit-soft-badge' }, '用户所有') : null
            ),
            h(
              'div',
              { className: 'lit-section-actions' },
              section.type === 'text' ? h('span', { className: 'lit-section-count' }, `${entries.length} 条`) : null,
              h(
                'button',
                {
                  type: 'button',
                  className: 'lit-icon-btn',
                  title: '移除这个大类和它的所有条目',
                  onClick: () => removeSection(selectedPaperData.id, section.key),
                },
                h(Icon, { name: 'trash', size: 14 })
              )
            )
          ),
          body
        );
      };

      const renderLibrary = () =>
        h(
          'div',
          {
            className: 'lit-library',
            style: {
              '--lit-groups-width': `${layoutWidths.groups}px`,
              '--lit-list-width': `${layoutWidths.list}px`,
            },
          },
          h(
            'aside',
            { className: 'lit-group-pane' },
              h('div', {
                className: 'lit-column-resizer',
                title: '拖动调整列宽；双击重置',
                onPointerDown: (event) => beginColumnResize('groups', event),
                onDoubleClick: () => setLayoutWidths(DEFAULT_LAYOUT),
              }),
              h(
                'div',
                { className: 'lit-groups-head' },
                h('div', { className: 'lit-section-label' }, '分组镜头'),
                h(
                  'button',
                  { type: 'button', className: 'lit-link-btn', onClick: () => setGroupManagerOpen(true) },
                  '管理'
                )
              ),
              h(
                'div',
                { className: 'lit-groups-hint' },
                groupMultiSelect
                  ? '多选模式：点分组名或复选框切换；上方选择 AND / OR'
                  : '点分组名 = 单选；勾选复选框 = 进入多选'
              ),
              groupMultiSelect
                ? h(
                    'div',
                    { className: 'lit-mode-row' },
                    h('span', null, '多选逻辑'),
                    h(
                      'div',
                      { className: 'lit-segment', style: { width: '96px' } },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: groupFilterLogic === 'and' ? 'active' : '',
                          onClick: () => mutate((next) => { next.groupFilterLogic = 'and'; }),
                        },
                        'AND'
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: groupFilterLogic === 'or' ? 'active' : '',
                          onClick: () => mutate((next) => { next.groupFilterLogic = 'or'; }),
                        },
                        'OR'
                      )
                    ),
                    h(
                      'button',
                      { type: 'button', className: 'lit-link-btn', onClick: cancelGroupMultiSelect },
                      '取消多选'
                    )
                  )
                : null,
              h(
                'div',
                { className: 'lit-groups-list' },
                h(
                  'div',
                  {
                    className:
                      selectedGroups.length === 0
                        ? 'lit-group-filter lit-group-filter-active'
                        : 'lit-group-filter',
                    role: 'button',
                    tabIndex: 0,
                    onClick: clearGroupFilter,
                    onKeyDown: (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        clearGroupFilter();
                      }
                    },
                  },
                  h('span', { className: 'lit-dot', style: { background: 'var(--dsw-alias-brand-primary, #9fd0ff)' } }),
                  h('span', { className: 'lit-group-filter-name' }, '全部文献'),
                  h('span', { className: 'lit-group-count' }, groupCounts.all)
                ),
                (state.groups || GROUPS).map((group) =>
                  h(
                    'div',
                    {
                      key: group.id,
                      className: selectedGroups.includes(group.id)
                        ? 'lit-group-filter lit-group-filter-active'
                        : 'lit-group-filter',
                      role: 'button',
                      tabIndex: 0,
                      onClick: () => handleGroupBodyClick(group.id),
                      onKeyDown: (event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleGroupBodyClick(group.id);
                        }
                      },
                    },
                    h('input', {
                      type: 'checkbox',
                      checked: selectedGroups.includes(group.id),
                      'aria-label': `筛选分组 ${group.name}`,
                      onClick: (event) => event.stopPropagation(),
                      onChange: () => {
                        if (!groupMultiSelect) setGroupMultiSelect(true);
                        toggleGroupFilter(group.id);
                      },
                    }),
                    h('span', { className: 'lit-group-filter-name' }, group.name),
                    h('span', { className: 'lit-group-count' }, groupCounts[group.id] || 0)
                  )
                )
              ),
              h(
                'div',
                { className: 'lit-list-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lit-btn lit-btn-ghost',
                    onClick: () => openSynthesis(filteredPapers.map((paper) => paper.id)),
                    disabled: filteredPapers.length === 0,
                  },
                  h(Icon, { name: 'network', size: 13 }),
                  '汇总筛选'
                )
              )
          ),

          h(
            'aside',
            { className: 'lit-listpane' },
            h('div', {
              className: 'lit-column-resizer',
              title: '拖动调整列宽；双击重置',
              onPointerDown: (event) => beginColumnResize('list', event),
              onDoubleClick: () => setLayoutWidths(DEFAULT_LAYOUT),
            }),
            h(
              'div',
              { className: 'lit-listpane-head' },
              h(
                'div',
                { className: 'lit-search' },
                h('span', { className: 'lit-search-icon' }, h(Icon, { name: 'search', size: 14 })),
                h('input', {
                  className: 'lit-input',
                  value: query,
                  onChange: (event) => setQuery(event.target.value),
                  placeholder: dataSource === 'real' ? '搜索标题、作者、摘要、全文…' : '搜索标题、作者、摘要…',
                  'aria-label': '搜索文献',
                }),
                searchLoading ? h('span', { className: 'lit-search-state' }, '检索中…') : null
              ),
              h(
                'div',
                { className: 'lit-articles-toolbar', style: { marginTop: '8px' } },
                h(
                  'button',
                  { type: 'button', className: 'lit-btn lit-btn-primary', onClick: () => setDiscoverOpen(true) },
                  h(Icon, { name: 'search', size: 12 }),
                  '发现'
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lit-btn lit-btn-ghost',
                    onClick: () => setImportCenterOpen(true),
                    title: '导入 PDF、手动元数据、DOI、RIS 或 EndNote',
                  },
                  h(Icon, { name: 'plus', size: 12 }),
                  '导入'
                ),
                h(
                  'select',
                  {
                    className: 'lit-select',
                    value: paperSort,
                    title: '文献列表顺序',
                    onChange: (event) => {
                      const value = event.target.value;
                      setPaperSort(value);
                      try {
                        window.localStorage.setItem('dsh-lit-paper-sort', value);
                      } catch (error) {
                        // Persisting the list preference is optional.
                      }
                    },
                  },
                  h('option', { value: 'manual' }, '手动顺序'),
                  h('option', { value: 'title' }, '标题 A–Z'),
                  h('option', { value: 'year-desc' }, '年份新→旧'),
                  h('option', { value: 'year-asc' }, '年份旧→新'),
                  h('option', { value: 'venue' }, '期刊 A–Z')
                ),
                h(
                  'label',
                  { className: 'lit-select-all' },
                  h('input', { type: 'checkbox', checked: allFilteredSelected, onChange: selectAllFiltered }),
                  '全选'
                ),
                h('span', { className: 'lit-articles-count' }, `${filteredPapers.length} 篇`)
              ),
              selectedPaperIds.length > 1
                ? h(
                    'div',
                    { className: 'lit-bulk-bar' },
                    h('span', { className: 'lit-bulk-label' }, `已选 ${selectedPaperIds.length} 篇`),
                    h(
                      'button',
                      { type: 'button', className: 'lit-bulk-btn', onClick: () => openSynthesis(selectedPaperIds) },
                      h(Icon, { name: 'sparkles', size: 12 }),
                      '汇总'
                    ),
                    h(
                      'button',
                      { type: 'button', className: 'lit-bulk-btn', onClick: exportSelectedRis },
                      h(Icon, { name: 'download', size: 12 }),
                      '导出 RIS'
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lit-bulk-btn',
                        onClick: startMetadataEnrich,
                        disabled: metadataEnriching,
                        title: '用 DOI / 标题补全期刊、作者、年份',
                      },
                      h(Icon, { name: 'refresh', size: 12 }),
                      metadataEnriching ? '补全中…' : '补全元数据'
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lit-bulk-btn',
                        onClick: () => setBatchSummaryOpen(true),
                        disabled: batchSummaryPapers.length === 0,
                      },
                      h(Icon, { name: 'sparkles', size: 12 }),
                      'AI 总结'
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lit-bulk-btn',
                        onClick: startBatchRevalidate,
                        disabled: batchRevalidateBusy || batchRevalidatePapers.length === 0,
                        title: '按 quote 批量重新定位所选论文的引用',
                      },
                      h(Icon, { name: 'check', size: 12 }),
                      batchRevalidateBusy ? batchRevalidateProgress || '定位中…' : '重新定位引文'
                    ),
                    h(
                      'div',
                      { className: 'lit-bulk-group' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'lit-bulk-btn',
                          onClick: () => setBulkGroupOpen((open) => !open),
                        },
                        h(Icon, { name: 'tag', size: 12 }),
                        '分组'
                      ),
                      bulkGroupOpen
                        ? h(
                            'div',
                            { className: 'lit-bulk-group-menu' },
                            (state.groups || []).filter((group) => group.id !== 'real').map((group) => {
                              const allHave = selectedPaperIds.every((paperId) => {
                                const paper = paperById[paperId];
                                return paper && (paper.groups || []).includes(group.id);
                              });
                              return h(
                                'button',
                                {
                                  key: group.id,
                                  type: 'button',
                                  className: 'lit-group-option',
                                  onClick: () => bulkToggleGroup(group.id),
                                },
                                h('span', { className: 'lit-dot', style: { background: group.color } }),
                                group.name,
                                allHave ? h(Icon, { name: 'check', size: 13 }) : null
                              );
                            }),
                            h(
                              'div',
                              { className: 'lit-bulk-new-group' },
                              h('input', {
                                className: 'lit-input',
                                value: bulkGroupName,
                                onChange: (event) => setBulkGroupName(event.target.value),
                                placeholder: '新建分组…',
                                'aria-label': '新建分组',
                                onKeyDown: (event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    bulkCreateGroup();
                                  }
                                },
                              }),
                              h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'lit-btn lit-btn-primary',
                                  onClick: bulkCreateGroup,
                                  disabled: !bulkGroupName.trim(),
                                },
                                '创建并加入'
                              )
                            )
                          )
                        : null
                    ),
                    h(
                      'button',
                      { type: 'button', className: 'lit-bulk-btn lit-bulk-danger', onClick: requestDeleteSelected },
                      h(Icon, { name: 'trash', size: 12 }),
                      '删除'
                    )
                  )
                : null,
            ),
            h(
              'div',
              { className: 'lit-list' },
              filteredPapers.length === 0
                ? h('div', { className: 'lit-empty' }, '没有匹配的文献')
                : filteredPapers.map((paper) =>
                    h(PaperRow, {
                      key: paper.id,
                      paper,
                      groups: groupById,
                      snippet: searchSnippets[paper.id],
                      active: paper.id === selectedPaper,
                      selected: selectedPaperIds.includes(paper.id),
                      onSelect: (event) => selectPaperRow(paper, event),
                      onContextMenu: (event) => openContextMenu(event, paper),
                      onCheck: (checked) => togglePaperCheck(paper.id, checked),
                    })
                  )
            )
          ),
          h(
            'section',
            { className: 'lit-detailpane' },
            selectedPaperData
              ? h(
                  'div',
                  {
                    className: 'lit-detail-grid',
                    style: { gridTemplateColumns: evidence ? 'minmax(0,1fr) 342px' : 'minmax(0,1fr)' },
                  },
                  h(
                    'div',
                    { className: 'lit-detail-main' },
                    h(
                      'div',
                      { className: 'lit-paper-head' },
                      h(
                        'div',
                        { className: 'lit-paper-kicker' },
                        h(
                          'span',
                          { className: selectedPaperData.pdfPath ? 'lit-soft-badge' : 'lit-soft-badge lit-meta-only' },
                          dataSource === 'real' ? (selectedPaperData.pdfPath ? '本地 PDF' : '仅元数据') : '文献'
                        ),
                        h('span', null, selectedPaperData.venue),
                        h('span', null, selectedPaperData.year),
                        selectedPaperData.edited ? h('span', { className: 'lit-status lit-status-warn' }, '已编辑') : null
                      ),
                      h('h1', { className: 'lit-paper-title' }, selectedPaperData.title),
                      h(
                        'div',
                        { className: 'lit-paper-meta' },
                        `${selectedPaperData.authors}${selectedPaperData.year ? ` · ${selectedPaperData.year}` : ''} · ${selectedPaperData.doi || 'no DOI'}`
                      ),
                      selectedPaperData.venue
                        ? h(
                            'div',
                            { className: 'lit-detail-journal' },
                            h(JournalBadge, {
                              name: selectedPaperData.venue,
                              quartile: selectedPaperData.jcrQuartile,
                              impactFactor: selectedPaperData.impactFactor,
                            })
                          )
                        : null,
                      h(
                        'div',
                        { className: 'lit-paper-actions' },
                        (selectedPaperData.groups || []).map((groupId) =>
                          groupById[groupId] ? h(GroupChip, { key: groupId, group: groupById[groupId] }) : null
                        ),
                        !selectedPaperData.pdfPath && dataSource === 'real'
                          ? h(
                              'button',
                              {
                                type: 'button',
                                className: 'lit-btn lit-btn-primary',
                                onClick: () => {
                                  setAttachTarget(selectedPaperData);
                                  setImportOpen(true);
                                },
                              },
                              h(Icon, { name: 'plus', size: 13 }),
                              '添加 PDF'
                            )
                          : null,
                        h(
                          'div',
                          { className: 'lit-group-menu-wrap', ref: groupMenuRef },
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'lit-btn lit-btn-ghost',
                              onClick: () => setGroupMenuOpen((value) => !value),
                            },
                            h(Icon, { name: 'tag', size: 13 }),
                            '编辑分组'
                          ),
                          groupMenuOpen
                            ? h(
                                'div',
                                { className: 'lit-group-menu lit-group-menu-detail' },
                                h(
                                  'div',
                                  { className: 'lit-group-options-scroll' },
                                  (state.groups || GROUPS).map((group) =>
                                    h(
                                      'label',
                                      { key: group.id, className: 'lit-group-option' },
                                      h('input', {
                                        type: 'checkbox',
                                        checked: selectedPaperData.groups.includes(group.id),
                                        onChange: () => togglePaperGroup(selectedPaperData.id, group.id),
                                      }),
                                      h(GroupChip, { group, small: true })
                                    )
                                  )
                                ),
                                h(
                                  'button',
                                  {
                                    type: 'button',
                                    className: 'lit-btn lit-btn-ghost',
                                    style: { width: '100%', marginTop: '7px' },
                                    onClick: () => setGroupMenuOpen(false),
                                  },
                                  '完成'
                                )
                              )
                            : null
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'lit-btn lit-btn-ghost',
                            onClick: () => setEditPaperOpen(true),
                          },
                          h(Icon, { name: 'edit', size: 13 }),
                          '编辑信息'
                        ),
                        selectedPaperData.sourceUrl
                          ? h(
                              'a',
                              {
                                className: 'lit-btn lit-btn-ghost',
                                href: selectedPaperData.sourceUrl,
                                target: '_blank',
                                rel: 'noreferrer',
                                title: '打开来源页',
                              },
                              h(Icon, { name: 'external', size: 13 }),
                              '来源页'
                            )
                          : null,
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'lit-btn lit-btn-ghost',
                            onClick: () => openDefaultPdf(selectedPaperData),
                          },
                          h(Icon, { name: 'file', size: 13 }),
                          '打开 PDF'
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'lit-btn lit-btn-ghost',
                            onClick: () => openPdfViewer(selectedPaperData, 1),
                          },
                          h(Icon, { name: 'book', size: 13 }),
                          '内嵌预览'
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'lit-btn lit-btn-ghost',
                            onClick: () => saveRis(selectedPaperData),
                          },
                          h(Icon, { name: 'download', size: 13 }),
                          '导出 RIS'
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'lit-btn lit-btn-primary',
                            onClick: () => askAssistant(selectedPaperData),
                          },
                          h(Icon, { name: 'sparkles', size: 13 }),
                          '发给助手'
                        )
                      )
                    ),
                    h('div', { className: 'lit-abstract' }, selectedPaperData.abstract),
                    h(
                      'div',
                      { className: 'lit-summary' },
                      h(
                        'div',
                        { className: 'lit-summary-head' },
                        h(
                          'div',
                          null,
                          h('div', { className: 'lit-summary-title' }, '结构化总结'),
                          h(
                            'div',
                            { className: 'lit-profile' },
                            h('span', null, `${(selectedPaperData.summary.sections || []).length} 个大类 · 论文卡片 v4`),
                            h(
                              'span',
                              null,
                              selectedPaperData.summary.ai_generated ? 'AI 总结 / 用户可编辑' : 'AI 起草 / 用户可编辑'
                            ),
                            h('span', { className: 'lit-soft-badge' }, '自动保存')
                          )
                        ),
                        h(
                          'div',
                          { className: 'lit-summary-actions' },
                          dataSource === 'real' && !selectedPaperData.summary.ai_generated
                            ? h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'lit-btn lit-btn-primary',
                                  onClick: () => generateAiSummary(selectedPaperData),
                                  disabled: aiSummaryLoading,
                                  title: '调用当前 DSH 默认模型生成结构化总结',
                                },
                                h(Icon, { name: 'sparkles', size: 13 }),
                                aiSummaryLoading ? 'AI 总结中…' : 'AI 总结'
                              )
                            : null,
                          selectedPaperData.summary.ai_generated
                            ? h(
                                'span',
                                { className: 'lit-soft-badge lit-ai-badge' },
                                `AI 总结${selectedPaperData.summary.model ? ` · ${selectedPaperData.summary.model}` : ''}${selectedPaperData.summary.reviewed ? ' · 已采纳' : ''}`
                              )
                            : null,
                          (selectedPaperData.summary.ai_generated || selectedPaperData.summary.auto_generated) &&
                          !selectedPaperData.summary.reviewed
                            ? h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'lit-btn lit-btn-ghost',
                                  onClick: () => setSummaryReviewed(selectedPaperData, true),
                                  disabled: acceptingSummary,
                                  title: '把这份 AI 总结标记为已总结',
                                },
                                h(Icon, { name: 'check', size: 13 }),
                                acceptingSummary ? '保存中…' : '标记为已总结'
                              )
                            : null,
                          selectedPaperData.summary.reviewed &&
                          (selectedPaperData.summary.ai_generated || selectedPaperData.summary.auto_generated)
                            ? h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'lit-link-btn',
                                  onClick: () => setSummaryReviewed(selectedPaperData, false),
                                  disabled: acceptingSummary,
                                  title: '撤回已总结标记',
                                },
                                '撤回已总结'
                              )
                            : null,
                          selectedPaperData.summary.auto_generated
                            ? h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'lit-btn lit-btn-ghost',
                                  onClick: () => regenerateAutoSummary(selectedPaperData),
                                  disabled: regenLoading,
                                  title: '根据 PDF 文本重新生成规则草稿',
                                },
                                h(Icon, { name: 'refresh', size: 13 }),
                                regenLoading ? '生成中…' : '重新生成草稿'
                              )
                            : null,
                          h(
                            'button',
                            { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: () => setTemplateOpen(true) },
                            h(Icon, { name: 'tag', size: 13 }),
                            '模板 / 预设'
                          ),
                        )
                      ),
                      (selectedPaperData.summary.sections || []).map((section, index) => renderSummarySection(section, index)),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'lit-add-section',
                          onClick: () => setTemplateOpen(true),
                        },
                        h(Icon, { name: 'plus', size: 14 }),
                        '新增大类 / 从预设添加'
                      ),
                      h(
                        'div',
                        { className: 'lit-save-line' },
                        h('span', { className: 'lit-save-dot' }),
                        h(
                          'span',
                          null,
                          dataSource === 'real'
                            ? realSaveState === 'saving'
                              ? '保存中…'
                              : realSaveState === 'error'
                                ? '保存失败，请检查 litd'
                                : dirtyCount > 0
                                  ? `${dirtyCount} 条引文需重新定位 · 编辑已自动保存`
                                  : '全部已更新 · 编辑已自动保存到 SQLite'
                            : dirtyCount > 0
                              ? `${dirtyCount} 条引文需重新定位 · 编辑已自动保存`
                              : '全部已更新 · 编辑已自动保存到本地'
                        )
                      )
                    )
                  ),
                  evidence && selectedFinding
                    ? h(EvidencePanel, {
                        paper: selectedPaperData,
                        finding: selectedFinding,
                        real: dataSource === 'real',
                        onClose: () => setEvidence(null),
                        onOpen: () => openDefaultPdf(selectedPaperData),
                        onCopy: async () => {
                          const ok = await copyText(
                            `${selectedPaperData.authors} (${selectedPaperData.year}). ${selectedPaperData.title}. ${selectedPaperData.venue}, p.${selectedFinding.page}.`
                          );
                          setToast(ok ? '引用已复制' : '复制失败');
                        },
                      })
                    : null
                )
              : h('div', { className: 'lit-empty' }, '选择左侧一篇文献查看结构化总结')
          )
        );

      const renderTracking = () => {
        const feeds = feedsData.feeds || [];
        const allItems = feedsData.items || [];
        const unreadByFeed = {};
        allItems.forEach((item) => {
          if (!item.read) unreadByFeed[item.feed_id] = (unreadByFeed[item.feed_id] || 0) + 1;
        });
        const unreadTotal = allItems.filter((item) => !item.read).length;
        const feedNeedle = feedQuery.trim().toLowerCase();
        const visibleItems = allItems.filter((item) => {
          if (selectedFeed !== 'all' && item.feed_id !== selectedFeed) return false;
          if (feedFilter === 'unread' && item.read) return false;
          if (feedFilter === 'read' && !item.read) return false;
          if (feedKindFilter !== 'all' && (item.kind || 'unknown') !== feedKindFilter) return false;
          if (feedStarFilter === 'high' && Number(item.ai_stars || 0) < 4) return false;
          if (feedStarFilter === 'scored' && !item.ai_stars) return false;
          if (
            feedNeedle &&
            !`${item.title || ''} ${item.summary || ''} ${item.feed_title || ''} ${item.authors || ''}`
              .toLowerCase()
              .includes(feedNeedle)
          ) {
            return false;
          }
          return true;
        });
        const selectedSource = feeds.find((feed) => feed.id === selectedFeed);
        const openItem = (item) => {
          setFeedDetailItem(item);
          if (!item.read) toggleFeedRead(item);
        };
        return h(
          'div',
          { className: 'lit-tracking-shell' },
          h(
            'div',
            {
              className: 'lit-tracking',
              style: { gridTemplateColumns: trackingWidth + 'px minmax(0, 1fr)' },
            },
            h(
              'aside',
              { className: 'lit-feedpane' },
              h('div', {
                className: 'lit-column-resizer',
                title: '拖动调整订阅栏宽度；双击重置',
                onPointerDown: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setTrackingDrag({ start: trackingWidth, startX: event.clientX });
                },
                onDoubleClick: () => setTrackingWidth(260),
              }),
              h(
                'div',
                { className: 'lit-feedpane-head' },
                h('div', { className: 'lit-eyebrow' }, '订阅源'),
                h('div', { className: 'lit-title', style: { fontSize: '14px', marginTop: '3px' } }, 'RSS 订阅'),
                h('div', { className: 'lit-subtitle' }, '人工追踪 · 阅读后变灰'),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lit-btn lit-btn-ghost',
                    style: { width: '100%', marginTop: '9px' },
                    onClick: refreshFeeds,
                    disabled: feedsLoading,
                  },
                  h(Icon, { name: 'refresh', size: 12 }),
                  feedsLoading ? '刷新中…' : '全部刷新'
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lit-btn lit-btn-primary',
                    style: { width: '100%', marginTop: '6px' },
                    onClick: () => setAiScoreOpen(true),
                    disabled: aiScoreBusy || feedsData.items.length === 0,
                  },
                  h(Icon, { name: 'sparkles', size: 12 }),
                  aiScoreBusy ? '评分中…' : 'AI 评分'
                ),
                h(
                  'div',
                  { className: 'lit-opml-actions' },
                  h('input', {
                    ref: opmlInputRef,
                    type: 'file',
                    accept: '.opml,.xml,text/xml,application/xml',
                    style: { display: 'none' },
                    onChange: (event) => importOpmlFile(event.target.files?.[0]),
                  }),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lit-btn lit-btn-ghost',
                      onClick: () => opmlInputRef.current?.click(),
                      disabled: opmlBusy,
                    },
                    opmlBusy ? '导入中…' : 'OPML 导入'
                  ),
                  h(
                    'button',
                    { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: exportOpml, disabled: feeds.length === 0 },
                    'OPML 导出'
                  )
                )
              ),
              h(
                'div',
                { className: 'lit-feed-list' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: selectedFeed === 'all' ? 'lit-feed-button lit-feed-button-active' : 'lit-feed-button',
                    onClick: () => setSelectedFeed('all'),
                  },
                  h(Icon, { name: 'rss', size: 13 }),
                  '全部订阅',
                  h('span', { className: 'lit-unread' }, unreadTotal)
                ),
                feeds.map((feed) =>
                  h(
                    'div',
                    { key: feed.id, className: 'lit-feed-source-item' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: selectedFeed === feed.id ? 'lit-feed-button lit-feed-button-active' : 'lit-feed-button',
                        onClick: () => setSelectedFeed(feed.id),
                        title: feed.url,
                      },
                      h('span', { className: 'lit-dot', style: { background: feed.last_error ? '#ff9f9f' : 'var(--dsw-alias-brand-primary, #72b7ff)' } }),
                      h(
                        'span',
                        { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                        feed.title || feed.url
                      ),
                      unreadByFeed[feed.id] ? h('span', { className: 'lit-unread' }, unreadByFeed[feed.id]) : null
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lit-feed-delete',
                        title: '编辑订阅源',
                        onClick: () => setFeedEdit(feed),
                      },
                      h(Icon, { name: 'edit', size: 12 })
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lit-feed-delete',
                        title: '刷新这个订阅源',
                        onClick: () => refreshSingleFeed(feed),
                        disabled: feedsLoading,
                      },
                      h(Icon, { name: 'refresh', size: 12 })
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lit-feed-delete',
                        title: '删除订阅源',
                        onClick: () => removeFeed(feed),
                      },
                      h(Icon, { name: 'trash', size: 12 })
                    )
                  )
                ),
                feeds.length === 0
                  ? h('div', { className: 'lit-feed-empty-hint' }, '还没有订阅源。在下面添加 RSS / Atom 地址。')
                  : null
              ),
              h(
                'div',
                { className: 'lit-add-feed' },
                h('div', { className: 'lit-control-label', style: { marginBottom: '0' } }, '添加订阅'),
                h(
                  'div',
                  { className: 'lit-add-feed-row' },
                  h('input', {
                    className: 'lit-input',
                    value: feedInput,
                    onChange: (event) => setFeedInput(event.target.value),
                    placeholder: 'https://…/feed.xml',
                    'aria-label': 'RSS 地址',
                    onKeyDown: (event) => {
                      if (event.key === 'Enter') addSubscriptionFeed();
                    },
                  }),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lit-btn lit-btn-ghost',
                      onClick: addSubscriptionFeed,
                      disabled: feedsLoading,
                      title: '添加订阅',
                    },
                    h(Icon, { name: 'plus', size: 14 })
                  )
                ),
                feeds.find((feed) => feed.last_error)
                  ? h('div', { className: 'lit-feed-source-error' }, feeds.find((feed) => feed.last_error).last_error)
                  : null
              )
            ),
            h(
              'section',
              { className: 'lit-tracking-main' },
              h(
                'div',
                { className: 'lit-tracking-toolbar' },
                h(
                  'div',
                  null,
                  h('div', { className: 'lit-title', style: { fontSize: '14px' } }, selectedSource ? selectedSource.title : '全部订阅'),
                  h('div', { className: 'lit-subtitle' }, `${visibleItems.length} 条 · 点击卡片标记已查看`)
                ),
                h('input', {
                  className: 'lit-input lit-feed-search-input',
                  value: feedQuery,
                  onChange: (event) => setFeedQuery(event.target.value),
                  placeholder: '搜索标题、摘要、来源…',
                  'aria-label': '搜索订阅内容',
                }),
                h(
                  'div',
                  { className: 'lit-filters' },
                  [
                    ['all', '全部'],
                    ['unread', '未读'],
                    ['read', '已读'],
                  ].map(([id, label]) =>
                    h(
                      'button',
                      {
                        key: id,
                        type: 'button',
                        className: feedFilter === id ? 'lit-filter lit-filter-active' : 'lit-filter',
                        onClick: () => setFeedFilter(id),
                      },
                      label
                    )
                  )
                ),
                h(
                  'div',
                  { className: 'lit-filters' },
                  [
                    ['all', '不限类型'],
                    ['paper', '论文'],
                    ['news', '新闻'],
                    ['comment', '评论'],
                  ].map(([id, label]) =>
                    h(
                      'button',
                      {
                        key: id,
                        type: 'button',
                        className: feedKindFilter === id ? 'lit-filter lit-filter-active' : 'lit-filter',
                        onClick: () => setFeedKindFilter(id),
                      },
                      label
                    )
                  )
                ),
                h(
                  'div',
                  { className: 'lit-filters' },
                  [
                    ['all', '全部星级'],
                    ['high', '4★+'],
                    ['scored', '已评分'],
                  ].map(([id, label]) =>
                    h(
                      'button',
                      {
                        key: id,
                        type: 'button',
                        className: feedStarFilter === id ? 'lit-filter lit-filter-active' : 'lit-filter',
                        onClick: () => setFeedStarFilter(id),
                      },
                      label
                    )
                  )
                ),
                h(
                  'div',
                  { className: 'lit-tracking-bulk' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lit-btn lit-btn-ghost',
                      onClick: () => markAllFeedItemsRead(true),
                      disabled: feedsLoading || allItems.every((item) => item.read),
                    },
                    h(Icon, { name: 'check', size: 12 }),
                    '全部已读'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lit-btn lit-btn-ghost',
                      onClick: () => markAllFeedItemsRead(false),
                      disabled: feedsLoading || allItems.length === 0,
                    },
                    h(Icon, { name: 'refresh', size: 12 }),
                    '全部未读'
                  )
                )
              ),
              h(
                'div',
                { className: 'lit-feed-cards' },
                visibleItems.length === 0
                  ? h(
                      'div',
                      { className: 'lit-empty', style: { minHeight: '180px' } },
                      feeds.length === 0 ? '先添加一个 RSS / Atom 订阅源。' : '当前筛选下没有订阅内容。'
                    )
                  : visibleItems.map((item) =>
                      h(
                        'article',
                        {
                          key: item.id,
                          className: item.read ? 'lit-feed-card lit-feed-card-read' : 'lit-feed-card',
                          role: 'button',
                          tabIndex: 0,
                          onClick: () => {
                            if (!item.read) toggleFeedRead(item);
                          },
                          onKeyDown: (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              if (!item.read) toggleFeedRead(item);
                            }
                          },
                        },
                        h(
                          'div',
                          { className: 'lit-feed-card-top' },
                          h(
                            'span',
                            { className: 'lit-feed-kind lit-feed-kind-' + (item.kind || 'unknown') },
                            item.kind === 'paper'
                              ? '论文'
                              : item.kind === 'news'
                                ? '新闻'
                                : item.kind === 'comment'
                                  ? '评论'
                                  : '未分类'
                          ),
                          item.ai_stars
                            ? h(
                                'span',
                                {
                                  className: 'lit-ai-stars',
                                  title: [item.ai_reason, item.ai_why_not_higher].filter(Boolean).join('\n'),
                                },
                                '★'.repeat(item.ai_stars) + '☆'.repeat(5 - item.ai_stars)
                              )
                            : null,
                          h('span', { className: 'lit-feed-time' }, item.published_at ? String(item.published_at).slice(0, 10) : '')
                        ),
                        h('div', { className: 'lit-feed-card-title' }, item.title),
                        h('div', { className: 'lit-feed-card-source' }, item.feed_title || ''),
                        h('div', { className: 'lit-feed-card-summary' }, item.summary || '暂无摘要'),
                        h(
                          'div',
                          { className: 'lit-feed-card-foot' },
                          h(
                            'span',
                            { className: item.read ? 'lit-read-label' : 'lit-unread-label' },
                            item.read ? '已查看' : '未查看'
                          ),
                          item.saved ? h('span', { className: 'lit-status lit-status-ok' }, '已入库') : null,
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'lit-feed-detail-btn',
                              onClick: (event) => {
                                event.stopPropagation();
                                openItem(item);
                              },
                            },
                            '详情'
                          )
                        )
                      )
                    )
              )
            )
          ),
          feedDetailItem
            ? h(FeedItemModal, {
                item: feedDetailItem,
                onClose: () => setFeedDetailItem(null),
                onToggleRead: () => {
                  toggleFeedRead(feedDetailItem);
                  setFeedDetailItem({ ...feedDetailItem, read: feedDetailItem.read ? 0 : 1 });
                },
                onSetKind: (kind) => setFeedItemKind(feedDetailItem, kind),
                onSave: async () => {
                  await saveSubscriptionItem(feedDetailItem);
                  setFeedDetailItem(null);
                },
              })
            : null
        );
      };

      const renderGraph = () =>
        h(
          'div',
          {
            className: 'lit-graph',
            style: { gridTemplateColumns: graphWidths.left + 'px minmax(0, 1fr) ' + graphWidths.right + 'px' },
          },
          h(
            'aside',
            { className: 'lit-graph-controls' },
            h('div', {
              className: 'lit-graph-resizer lit-graph-resizer-right',
              title: '拖动调整左侧栏宽度；双击重置',
              onPointerDown: (event) => {
                event.preventDefault();
                event.stopPropagation();
                setGraphDrag({ side: 'left', startX: event.clientX, startWidth: graphWidths.left });
              },
              onDoubleClick: () => setGraphWidths((previous) => ({ ...previous, left: 230 })),
            }),
            h('div', { className: 'lit-eyebrow' }, '网络图'),
            h('div', { className: 'lit-title', style: { fontSize: '14px', marginTop: '3px' } }, '领域结构'),
            h('div', { className: 'lit-subtitle' }, '节点：论文 · 边：TF-IDF 语义相似度'),
            h('div', { className: 'lit-selection-hint' }, '拖拽空白处框选多个节点；Shift / Ctrl + 点击可追加。'),
            h(
              'div',
              { className: 'lit-control-group', style: { marginTop: '18px' } },
              h('div', { className: 'lit-control-label' }, '着色'),
              h(
                'div',
                { className: 'lit-segment' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: state.graphColorMode === 'group' ? 'active' : '',
                    onClick: () =>
                      mutate((next) => {
                        next.graphColorMode = 'group';
                      }),
                  },
                  '分组'
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: state.graphColorMode === 'cluster' ? 'active' : '',
                    onClick: () =>
                      mutate((next) => {
                        next.graphColorMode = 'cluster';
                      }),
                  },
                  '聚类'
                )
              )
            ),
            h(
              'div',
              { className: 'lit-control-group' },
              h('div', { className: 'lit-control-label' }, '聚类算法'),
              h(
                'select',
                {
                  className: 'lit-select',
                  value: state.graphMode || 'semantic',
                  onChange: (event) =>
                    loadRealGraph(Number(state.graphThreshold) || 0.14, event.target.value),
                },
                h('option', { value: 'semantic' }, '语义：TF-IDF + 凝聚聚类'),
                h('option', { value: 'groups' }, '分组：按论文分组聚类')
              )
            ),
            h(
              'div',
              { className: 'lit-control-group' },
              h('div', { className: 'lit-control-label' }, state.graphMode === 'groups' ? '分组聚类' : '相似度阈值'),
              h(
                'div',
                { className: 'lit-range-row' },
                h('input', {
                  type: 'range',
                  min: '0.05',
                  max: '0.35',
                  step: '0.01',
                  value: Number(state.graphThreshold) || 0.14,
                  onChange: (event) =>
                    mutate((next) => {
                      next.graphThreshold = Number(event.target.value);
                    }),
                }),
                h('span', { className: 'lit-range-value' }, Number(Number(state.graphThreshold) || 0.14).toFixed(2))
              ),

              h(
                'button',
                {
                  type: 'button',
                  className: 'lit-btn lit-btn-primary',
                  style: { width: '100%', marginTop: '8px' },
                  onClick: recluster,
                },
                h(Icon, { name: 'refresh', size: 13 }),
                '重新聚类'
              )
            ),
            h(
              'div',
              { className: 'lit-control-group' },
              h('div', { className: 'lit-control-label' }, state.graphColorMode === 'group' ? '分组图例' : '聚类图例'),
              h(
                'div',
                { className: 'lit-legend' },
                state.graphColorMode === 'group'
                  ? (state.groups || GROUPS).map((group) =>
                      h(
                        'div',
                        { key: group.id, className: 'lit-legend-row' },
                        h('span', { className: 'lit-legend-dot', style: { background: group.color } }),
                        group.name
                      )
                    )
                  : (state.graph.clusterLabels && state.graph.clusterLabels.length
                      ? state.graph.clusterLabels
                      : CLUSTER_LABELS
                    ).map((label, index) =>
                      h(
                        'div',
                        { key: `${label}-${index}`, className: 'lit-legend-row' },
                        h('span', {
                          className: 'lit-legend-dot',
                          style: { background: CLUSTER_COLORS[index % CLUSTER_COLORS.length] },
                        }),
                        label
                      )
                    )
              )
            ),
            h(
              'div',
              { className: 'lit-scope-card' },
              h('div', { className: 'lit-scope-title' }, h(Icon, { name: 'network', size: 13 }), `已选节点 · ${selectedNodeIds.length}`),
              h(
                'div',
                { className: 'lit-scope-text' },
                selectedNodeIds.length ? `对应 ${selectedGraphPaperIds.length} 篇论文；汇总只在选中范围内进行。` : '拖拽框选，或 Shift + 点击节点。'
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'lit-btn lit-btn-primary',
                  style: { width: '100%', marginTop: '8px' },
                  disabled: selectedGraphPaperIds.length === 0,
                  onClick: () => openSynthesis(selectedGraphPaperIds),
                },
                h(Icon, { name: 'sparkles', size: 13 }),
                '汇总选中'
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'lit-btn lit-btn-ghost',
                  style: { width: '100%', marginTop: '5px' },
                  disabled: selectedNodeIds.length === 0,
                  onClick: () => {
                    setSelectedNodeIds([]);
                    setScopeIds([]);
                  },
                },
                '清空选择'
              )
            )
          ),
          h(
            'section',
            {
              className: 'lit-graph-canvas',
              ref: canvasRef,
              onMouseDown: startSelection,
              onMouseMove: updateSelection,
              onMouseUp: finishSelection,
              onMouseLeave: finishSelection,
            },
            h(
              'svg',
              {
                viewBox: '0 0 720 460',
                preserveAspectRatio: 'xMidYMid meet',
                role: 'img',
                'aria-label': '文献网络图，拖拽空白处框选多个节点',
              },
              h(
                'defs',
                null,
                h(
                  'filter',
                  { id: 'lit-node-shadow', x: '-50%', y: '-50%', width: '200%', height: '200%' },
                  h('feDropShadow', { dx: '0', dy: '2', stdDeviation: '3', floodOpacity: '0.35' })
                )
              ),
              state.graph.edges.map((edge) => {
                const source = state.graph.nodes.find((node) => node.id === edge.source);
                const target = state.graph.nodes.find((node) => node.id === edge.target);
                if (!source || !target) return null;
                const active = scopeIds.includes(source.paperId) && scopeIds.includes(target.paperId);
                return h('line', {
                  key: edge.id,
                  x1: source.x,
                  y1: source.y,
                  x2: target.x,
                  y2: target.y,
                  stroke: active ? 'rgba(127,224,176,.75)' : 'rgba(146,160,174,.32)',
                  strokeWidth: edge.type === 'citation' ? 1.5 : 1,
                  strokeDasharray: edge.type === 'semantic' ? '4 4' : undefined,
                });
              }),
              state.graph.nodes.map((node) => {
                const selected = selectedNodeIds.includes(node.id);
                const primary = selectedNode === node.id;
                const inScope = scopeIds.includes(node.paperId);
                const nodePaper = paperById[node.paperId];
                return h(
                  'g',
                  {
                    key: node.id,
                    className: 'lit-graph-node',
                    onMouseDown: (event) => event.stopPropagation(),
                    onClick: (event) => toggleNodeSelection(event, node),
                    onMouseEnter: (event) => hoverGraphNode(event, node),
                    onMouseMove: (event) => hoverGraphNode(event, node),
                    onMouseLeave: () => setHoverNode(null),
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': nodePaper ? `${nodePaper.title}，${nodePaper.year}` : node.label || node.title,
                  },
                  h('title', null, nodePaper ? `${nodePaper.title} (${nodePaper.year})` : node.label || node.title),
                  h('circle', {
                    cx: node.x,
                    cy: node.y,
                    r: (Number(node.r) || 16) + (selected ? 3 : 0),
                    fill: nodeColor(node),
                    fillOpacity: inScope ? 1 : 0.9,
                    stroke: primary ? 'var(--dsw-alias-label-primary, #fff)' : selected ? '#7fe0b0' : inScope ? '#7fe0b0' : 'rgba(255,255,255,.18)',
                    strokeWidth: selected ? 2.2 : inScope ? 1.6 : 1,
                    filter: 'url(#lit-node-shadow)',
                  }),
                  h(
                    'text',
                    {
                      x: node.x,
                      y: node.y + (Number(node.r) || 16) + 15,
                      textAnchor: 'middle',
                      className: selected ? 'lit-graph-label lit-graph-label-active' : 'lit-graph-label',
                    },
                    node.label || (nodePaper ? nodePaper.title.slice(0, 42) : node.title?.slice(0, 42)) || ''
                  )
                );
              }),
              selectionBox &&
              (Math.abs(selectionBox.x2 - selectionBox.x1) > 2 || Math.abs(selectionBox.y2 - selectionBox.y1) > 2)
                ? h('rect', {
                    x: Math.min(selectionBox.x1, selectionBox.x2),
                    y: Math.min(selectionBox.y1, selectionBox.y2),
                    width: Math.abs(selectionBox.x2 - selectionBox.x1),
                    height: Math.abs(selectionBox.y2 - selectionBox.y1),
                    fill: 'rgba(114,183,255,.1)',
                    stroke: 'var(--dsw-alias-brand-primary, #72b7ff)',
                    strokeWidth: 1.2,
                    strokeDasharray: '5 4',
                    pointerEvents: 'none',
                  })
                : null,
              h(
                'text',
                { x: 16, y: 28, fill: 'var(--dsw-alias-label-secondary, #92a0ae)', fontSize: 10, letterSpacing: '.08em' },
                `SEMANTIC CLUSTERS · ${state.graph.nodes.length} PAPERS`
              )
            ),
            hoverNode && hoveredGraphPaper
              ? (() => {
                  const flip = hoverNode.x > (canvasRef.current ? canvasRef.current.clientWidth : 600) * 0.6;
                  return h(
                    'div',
                    {
                      className: 'lit-graph-tooltip',
                      style: {
                        left: flip ? hoverNode.x - 14 : hoverNode.x + 14,
                        top: hoverNode.y + 14,
                        transform: flip ? 'translateX(-100%)' : 'none',
                      },
                    },
                    h('div', { className: 'lit-graph-tooltip-title' }, hoveredGraphPaper.title),
                    h('div', { className: 'lit-graph-tooltip-meta' }, `${hoveredGraphPaper.authors} · ${hoveredGraphPaper.year} · ${hoveredGraphPaper.venue}`),
                    h(
                      'div',
                      { className: 'lit-chip-row', style: { marginTop: '6px' } },
                      (hoveredGraphPaper.groups || []).map((groupId) =>
                        groupById[groupId] ? h(GroupChip, { key: groupId, group: groupById[groupId], small: true }) : null
                      )
                    ),
                    h(
                      'div',
                      { className: 'lit-graph-tooltip-line' },
                      `${hoveredGraphPaper.summary.sections.length} 个大类 · ${textEntriesOf(hoveredGraphPaper).length} 条内容 · 点击查看详情`
                    )
                  );
                })()
              : null
          ),
          h(
            'aside',
            { className: 'lit-graph-inspector' },
            h('div', {
              className: 'lit-graph-resizer lit-graph-resizer-left',
              title: '拖动调整右侧栏宽度；双击重置',
              onPointerDown: (event) => {
                event.preventDefault();
                event.stopPropagation();
                setGraphDrag({ side: 'right', startX: event.clientX, startWidth: graphWidths.right });
              },
              onDoubleClick: () => setGraphWidths((previous) => ({ ...previous, right: 290 })),
            }),
            selectedNodeIds.length > 1
              ? h(
                  'div',
                  { className: 'lit-scope-card', style: { marginTop: '0', marginBottom: '14px' } },
                  h('div', { className: 'lit-scope-title' }, h(Icon, { name: 'network', size: 13 }), `已框选 ${selectedNodeIds.length} 个节点`),
                  h(
                    'div',
                    { className: 'lit-scope-text' },
                    selectedGraphPaperIds
                      .slice(0, 4)
                      .map((paperId) => paperById[paperId].title)
                      .join(' · '),
                    selectedGraphPaperIds.length > 4 ? ` 等 ${selectedGraphPaperIds.length} 篇` : ''
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lit-btn lit-btn-primary',
                      style: { width: '100%', marginTop: '8px' },
                      onClick: () => openSynthesis(selectedGraphPaperIds),
                    },
                    h(Icon, { name: 'sparkles', size: 13 }),
                    `汇总这 ${selectedGraphPaperIds.length} 篇`
                  )
                )
              : null,
            selectedGraphPaper
              ? h(
                  'div',
                  null,
                  h('div', { className: 'lit-eyebrow' }, '选中论文'),
                  h('div', { className: 'lit-inspector-title' }, selectedGraphPaper.title),
                  h('div', { className: 'lit-inspector-meta' }, `${selectedGraphPaper.authors} · ${selectedGraphPaper.year}`),
                  h(
                    'div',
                    { className: 'lit-chip-row', style: { marginTop: '8px' } },
                    (selectedGraphPaper.groups || []).map((groupId) =>
                      groupById[groupId] ? h(GroupChip, { key: groupId, group: groupById[groupId], small: true }) : null
                    )
                  ),
                  selectedGraphNode?.tags?.length
                    ? h(
                        'div',
                        { className: 'lit-chip-row', style: { marginTop: '7px' } },
                        selectedGraphNode.tags.slice(0, 8).map((tag) =>
                          h('span', { key: tag, className: 'lit-soft-badge' }, tag)
                        )
                      )
                    : null,
                  h(
                    'div',
                    { className: 'lit-kv' },
                    h('span', { className: 'lit-kv-label' }, '当前簇'),
                    h(
                      'span',
                      { className: 'lit-kv-value' },
                      state.graph.clusterLabels?.[selectedGraphCluster] ||
                        CLUSTER_LABELS[selectedGraphCluster % CLUSTER_LABELS.length]
                    )
                  ),
                  h(
                    'div',
                    { className: 'lit-kv' },
                    h('span', { className: 'lit-kv-label' }, '条目数'),
                    h('span', { className: 'lit-kv-value' }, textEntriesOf(selectedGraphPaper).length)
                  ),
                  h(
                    'div',
                    { className: 'lit-kv' },
                    h('span', { className: 'lit-kv-label' }, '待定位'),
                    h(
                      'span',
                      { className: 'lit-kv-value' },
                      textEntriesOf(selectedGraphPaper).filter((finding) => finding.status === 'needs_recheck').length
                    )
                  ),
                  h(
                    'div',
                    { className: 'lit-kv' },
                    h('span', { className: 'lit-kv-label' }, '已选节点'),
                    h('span', { className: 'lit-kv-value' }, selectedNodeIds.length)
                  ),
                  h(
                    'div',
                    { className: 'lit-inspector-actions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lit-btn lit-btn-ghost',
                        onClick: () => {
                          selectPaper(selectedGraphPaper.id);
                          setTab('library');
                        },
                      },
                      h(Icon, { name: 'book', size: 13 }),
                      '打开详情'
                    ),
                    h(
                      'button',
                      { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: selectCluster },
                      h(Icon, { name: 'network', size: 13 }),
                      '提取同簇'
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lit-btn lit-btn-primary',
                        onClick: () => openSynthesis(selectedGraphPaperIds.length ? selectedGraphPaperIds : [selectedGraphPaper.id]),
                      },
                      h(Icon, { name: 'sparkles', size: 13 }),
                      '汇总选中'
                    )
                  ),
                  h(
                    'div',
                    { className: 'lit-scope-text', style: { marginTop: '12px' } },
                    '网络图只是视图；真正的汇总以 scope 快照为准。当前演示中的节点和边都是固定数据。'
                  )
                )
              : h('div', { className: 'lit-empty' }, '选择一个节点')
          )
        );

      return h(
        'div',
        { className: lightTheme ? 'lit-root lit-theme-light' : 'lit-root', 'data-testid': 'lit-root', ref: rootRef },
        h('style', null, CSS),
        h(
          'header',
          { className: 'lit-header' },
          h(
            'div',
            { className: 'lit-brand' },
            h('div', { className: 'lit-brand-mark' }, h(Icon, { name: 'book', size: 19 })),
            h(
              'div',
              { className: 'lit-brand-text' },
              h('div', { className: 'lit-title' }, L('nav', '文献工作台'))
            )
          ),
          h(
            'div',
            { className: 'lit-header-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'lit-btn lit-btn-ghost',
                onClick: loadRealLibrary,
                disabled: realLoading,
                title: '连接本地 litd 文献服务',
              },
              h(Icon, { name: 'refresh', size: 13 }),
              '刷新'
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'lit-btn lit-btn-ghost',
                onClick: () => setImportCenterOpen(true),
                title: '导入 PDF、手动元数据、DOI、RIS 或 EndNote',
              },
              h(Icon, { name: 'plus', size: 13 }),
              '导入'
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'lit-btn lit-btn-primary',
                onClick: runPageTranslation,
                disabled: translation.busy,
                title: '使用 DSH 内置翻译翻译当前页面正文',
              },
              h(Icon, { name: 'sparkles', size: 13 }),
              translation.busy ? '翻译中…' : translation.open ? '重新翻译' : '翻译本页'
            ),
            dataSource === 'real'
              ? h(
                  'span',
                  { className: `lit-save-state lit-save-state-${realSaveState}` },
                  realSaveState === 'saving' ? '保存中…' : realSaveState === 'error' ? '保存失败' : '已自动保存'
                )
              : null,
            h(
              'div',
              { className: 'lit-citation-action' },
              h(
                'span',
                { className: 'lit-dirty' },
                dirtyCount > 0 ? `${dirtyCount} 条引文需重新定位` : '引文位置已同步'
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'lit-btn lit-btn-ghost',
                  onClick: revalidateCitations,
                  disabled: revalidating || dataSource !== 'real' || citationCount === 0,
                  title: '在 PDF 文本中重新查找每条引文的原文位置，并更新页码和 bbox',
                },
                h(Icon, { name: 'check', size: 14 }),
                revalidating ? '重新定位中…' : '重新定位引文'
              )
            ),
            h(
              'button',
              { type: 'button', className: 'lit-btn lit-btn-ghost', onClick: () => setSettingsOpen(true), title: '设置预设与影响因子表' },
              h(Icon, { name: 'settings', size: 14 }),
              '设置'
            )
          )
        ),
        h(
          'nav',
          { className: 'lit-tabs' },
          tabButton('library', L('library', '文献库'), state.papers.length, 'book'),
          tabButton('tracking', L('tracking', '追踪'), unreadTotal, 'rss'),
          tabButton('ai', 'AI 检索', 0, 'search'),
          tabButton('author', '作者检索', 0, 'book'),
          tabButton('graph', L('graph', '网络图'), state.graph.nodes.length, 'network')
        ),
        dataSource !== 'real'
          ? h(
              'div',
              { className: 'lit-demo-banner' },
              h(Icon, { name: 'info', size: 13 }),
              h('span', null, '本地服务未连接。点击右上角“刷新”重试；已加载内容会保留。')
            )
          : null,
        translation.open
          ? h(TranslationBar, {
              busy: translation.busy,
              error: translation.error,
              mode: translation.mode,
              count: translation.count,
              onMode: (mode) => updateTranslation({ mode }),
              onClose: closeTranslation,
              onRetry: runPageTranslation,
            })
          : null,
        h(
          'main',
          { className: 'lit-content' },
          tab === 'library'
            ? renderLibrary()
            : tab === 'tracking'
              ? renderTracking()
              : tab === 'ai'
                ? h(AiSearchModal, { inline: true })
                : tab === 'author'
                  ? h(AuthorSearchPage)
                  : renderGraph()
        ),
        discoverOpen
          ? h(DiscoveryModal, {
              source: discoverSource,
              query: discoverQuery,
              results: discoverResults,
              total: discoverTotal,
              hasMore: Boolean(discoverNext),
              loading: discoverLoading,
              loadingMore: discoverLoadingMore,
              importingId: importingArxiv,
              filters: discoverFilters,
              filtersOpen: discoverFiltersOpen,
              onFiltersChange: setDiscoverFilters,
              onToggleFilters: () => setDiscoverFiltersOpen((value) => !value),
              onSourceChange: (value) => {
                setDiscoverSource(value);
                setDiscoverResults([]);
                setDiscoverTotal(0);
                setDiscoverNext(null);
              },
              onQueryChange: setDiscoverQuery,
              onSearch: () => searchDiscovery(false),
              onLoadMore: () => searchDiscovery(true),
              onImport: importDiscoveryCandidate,
              onImportMetadata: importMetadataCandidate,
              onClose: () => {
                if (!importingArxiv) setDiscoverOpen(false);
              },
            })
          : null,
        editPaperOpen && selectedPaperData
          ? h(EditPaperModal, {
              key: selectedPaperData.id,
              paper: selectedPaperData,
              busy: editBusy,
              onClose: () => {
                if (!editBusy) setEditPaperOpen(false);
              },
              onSave: savePaperMetadata,
            })
          : null,
        aiScoreOpen
          ? h(AiScoreModal, {
              limit: aiScoreLimit,
              busy: aiScoreBusy,
              onLimit: setAiScoreLimit,
              onRun: runAiScore,
              onClose: () => {
                if (!aiScoreBusy) setAiScoreOpen(false);
              },
            })
          : null,
        opmlPreview
          ? h(OpmlPreviewModal, {
              urls: opmlPreview,
              busy: opmlBusy,
              onCancel: () => {
                if (!opmlBusy) setOpmlPreview(null);
              },
              onConfirm: () => startOpmlImport(opmlPreview),
            })
          : null,
        feedEdit
          ? h(FeedEditModal, {
              feed: feedEdit,
              onClose: () => setFeedEdit(null),
              onSave: (patch) => saveFeedEdit({ ...feedEdit, ...patch }),
            })
          : null,
        batchSummaryOpen
          ? h(BatchSummaryModal, {
              eligible: batchSummaryPapers.length,
              skipped: batchSummarySkipped,
              busy: batchSummaryBusy,
              progress: batchSummaryProgress,
              onCancel: () => {
                if (!batchSummaryBusy) setBatchSummaryOpen(false);
              },
              onConfirm: startBatchSummary,
            })
          : null,
        deleteConfirmOpen
          ? h(ConfirmDeleteModal, {
              count: selectedPaperIds.length,
              busy: deleteBusy,
              real: dataSource === 'real',
              onCancel: () => {
                if (!deleteBusy) setDeleteConfirmOpen(false);
              },
              onConfirm: deleteSelectedPapers,
            })
          : null,
        importOpen
          ? h(ImportModal, {
              file: importFile,
              path: importPath,
              summaryPath: importSummaryPath,
              busy: importBusy,
              targetTitle: attachTarget?.title || '',
              onFileChange: setImportFile,
              onPathChange: setImportPath,
              onSummaryChange: setImportSummaryPath,
              onClose: () => {
                if (!importBusy) {
                  setImportOpen(false);
                  setAttachTarget(null);
                }
              },
              onSubmit: submitImport,
            })
          : null,
        pdfViewer && paperById[pdfViewer.paperId]
          ? h(PdfViewerModal, {
              paper: paperById[pdfViewer.paperId],
              page: pdfViewer.page,
              onClose: () => setPdfViewer(null),
              onOpenExternal: () => openDefaultPdf(paperById[pdfViewer.paperId]),
            })
          : null,
        groupManagerOpen
          ? h(GroupManagerModal, {
              groups: state.groups,
              counts: groupCounts,
              templates: state.groupTemplates,
              onClose: () => {
                flushGroupSaves();
                setGroupManagerOpen(false);
              },
              onCreate: createGroup,
              onRename: renameGroup,
              onRecolor: recolorGroup,
              onDelete: deleteGroup,
              onMove: moveGroup,
            })
          : null,
        templateOpen && selectedPaperData
          ? h(TemplateModal, {
              paper: selectedPaperData,
              presets: state.sectionPresets,
              groups: state.groups,
              groupTemplates: state.groupTemplates,
              onClose: () => setTemplateOpen(false),
              onAdd: (definition, saveAsPreset) => {
                addSectionToPaper(selectedPaperData.id, definition, saveAsPreset);
                setToast(saveAsPreset ? '已添加并保存为预设' : '已添加自定义大类');
              },
              onSaveDefault: (groupId) => saveGroupDefault(selectedPaperData.id, groupId),
            })
          : null,
        metadataOnlyPaper
          ? h(MetadataOnlyModal, {
              paper: metadataOnlyPaper,
              onClose: () => setMetadataOnlyPaper(null),
              onImport: () => {
                setAttachTarget(metadataOnlyPaper);
                setMetadataOnlyPaper(null);
                setImportOpen(true);
              },
            })
          : null,
        importCenterOpen
          ? h(ImportCenterModal, {
              onClose: () => setImportCenterOpen(false),
              onImported: (paper) => {
                if (paper) applyRealPaper(paper);
                loadRealLibrary(true);
              },
            })
          : null,
        manualEvidence
          ? h(ManualEvidenceModal, {
              target: manualEvidence,
              onClose: () => setManualEvidence(null),
              onSave: ({ quote, page }) => {
                patchEntry(
                  manualEvidence.paperId,
                  manualEvidence.sectionKey,
                  manualEvidence.entryId,
                  { quote, page, status: 'needs_recheck' },
                  false
                );
                setManualEvidence(null);
                setToast('已添加手动证据；可用“重新定位引文”校验位置');
              },
            })
          : null,
        settingsOpen
          ? h(SettingsModal, {
              tab: settingsTab,
              presets: state.sectionPresets,
              groups: state.groups,
              groupTemplates: state.groupTemplates,
              onTabChange: setSettingsTab,
              onClose: () => setSettingsOpen(false),
              onAddPreset: addSectionPreset,
              onUpdatePreset: updateSectionPreset,
              onDeletePreset: deleteSectionPreset,
              onToggleGroupPreset: toggleGroupDefaultPreset,
            })
          : null,
        showSynthesis
          ? h(SynthesisModal, {
              papers: scopePapers.length ? scopePapers : filteredPapers,
              onClose: () => setShowSynthesis(false),
              onCopy: askScope,
              onExport: saveScopeRis,
            })
          : null,
        contextMenu
          ? h(
              'div',
              {
                className: 'lit-context-layer',
                role: 'presentation',
                onMouseDown: () => setContextMenu(null),
              },
              h(
                'div',
                {
                  className: 'lit-context-menu',
                  style: { left: contextMenu.x, top: contextMenu.y },
                  onMouseDown: (event) => event.stopPropagation(),
                },
                h(
                  'div',
                  { className: 'lit-context-head' },
                  selectedPaperIds.length > 1
                    ? `已选 ${selectedPaperIds.length} 篇`
                    : (paperById[contextMenu.paperId] || {}).title || '论文操作'
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lit-context-item',
                    onClick: () => {
                      selectPaper(contextMenu.paperId);
                      setContextMenu(null);
                    },
                  },
                  h(Icon, { name: 'file', size: 13 }),
                  '打开详情'
                ),
                selectedPaperIds.length <= 1
                  ? h(
                      'div',
                      { className: 'lit-context-move-row' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'lit-context-item',
                          onClick: () => {
                            movePaper(contextMenu.paperId, -1);
                            setContextMenu(null);
                          },
                        },
                        '↑ 上移一位'
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'lit-context-item',
                          onClick: () => {
                            movePaper(contextMenu.paperId, 1);
                            setContextMenu(null);
                          },
                        },
                        '↓ 下移一位'
                      )
                    )
                  : null,
                h('div', { className: 'lit-context-label' }, '统一设置分组'),
                (state.groups || GROUPS).map((group) => {
                  const allHave =
                    selectedPapersData.length > 0 &&
                    selectedPapersData.every((paper) => paper.groups.includes(group.id));
                  return h(
                    'button',
                    {
                      key: group.id,
                      type: 'button',
                      className: allHave ? 'lit-context-item lit-context-item-on' : 'lit-context-item',
                      onClick: () => bulkToggleGroup(group.id),
                    },
                    h('span', { className: 'lit-dot', style: { background: group.color } }),
                    group.name,
                    allHave ? h(Icon, { name: 'check', size: 13 }) : null
                  );
                }),
                h('div', { className: 'lit-context-sep' }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lit-context-item',
                    onClick: () => {
                      openSynthesis(selectedPaperIds);
                      setContextMenu(null);
                    },
                  },
                  h(Icon, { name: 'sparkles', size: 13 }),
                  `汇总选中的 ${selectedPaperIds.length} 篇`
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lit-context-item',
                    onClick: () => {
                      exportSelectedRis();
                      setContextMenu(null);
                    },
                  },
                  h(Icon, { name: 'download', size: 13 }),
                  '导出 RIS'
                ),
                h('div', { className: 'lit-context-sep' }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lit-context-item lit-context-danger',
                    onClick: requestDeleteSelected,
                  },
                  h(Icon, { name: 'trash', size: 13 }),
                  '从文献库删除'
                )
              )
            )
          : null,
        toast
          ? h(
              'div',
              { className: 'lit-toast', role: 'status' },
              h(Icon, { name: 'check', size: 13 }),
              h('span', null, toast)
            )
          : null
      );
    }

    function LitIcon({ size }) {
      return h(
        'span',
        {
          style: {
            width: size || 18,
            height: size || 18,
            display: 'grid',
            placeItems: 'center',
            color: 'currentColor',
          },
          'aria-hidden': 'true',
        },
        h(Icon, { name: 'book', size: size || 18 })
      );
    }

    class PluginErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }

      static getDerivedStateFromError(error) {
        return { error };
      }

      componentDidCatch(error, info) {
        try {
          fetch(`${LIT_DEMO_API_BASE}/api/client-error`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              type: 'react-boundary',
              message: error.message,
              stack: error.stack,
              componentStack: info.componentStack,
            }),
          }).catch(() => {});
        } catch (fetchError) {
          // Reporting must not mask the original error.
        }
      }

      render() {
        if (this.state.error) {
          return h(
            'div',
            {
              style: {
                margin: '18px',
                padding: '16px',
                color: '#ffb3b3',
                background: '#2a1114',
                border: '1px solid rgba(255,120,120,.4)',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '11px',
                whiteSpace: 'pre-wrap',
                overflow: 'auto',
              },
            },
            `文献工作台渲染失败\n\n${this.state.error.stack || this.state.error.message}`
          );
        }
        return this.props.children;
      }
    }

    function LitWorkspaceBoundary(props) {
      return h(PluginErrorBoundary, null, h(LitWorkspace, props));
    }

    return {
      inject: ['slots', 'locale', 'theme'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, I18N), 'lit-demo: locale');
        const t = ctx.locale.bind(NS);
        let themeScheme = 'dark';
        try {
          themeScheme = ctx.theme?.getTheme?.().active?.colorScheme || 'dark';
        } catch (error) {
          themeScheme = 'dark';
        }
        const themeListeners = new Set();
        ctx.effect(() => {
          if (typeof ctx.on !== 'function') return () => {};
          return ctx.on('theme/change', (snapshot) => {
            themeScheme = snapshot?.active?.colorScheme || themeScheme;
            for (const listener of themeListeners) listener(themeScheme);
          });
        }, 'lit-demo: theme');
        const themeStore = {
          get: () => themeScheme,
          subscribe: (listener) => {
            themeListeners.add(listener);
            listener(themeScheme);
            return () => themeListeners.delete(listener);
          },
        };
        const translatePage = async (text) => {
          const targetLanguage = document.documentElement.lang || 'zh-CN';
          let hostError = null;
          try {
            const endpoint = new URL('/lit-model/translate', window.location.href).toString();
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ text, targetLanguage }),
            });
            const body = await response.json().catch(() => ({}));
            if (response.ok && body.ok === true) return body.text;
            hostError = new Error(body.error || `翻译服务 HTTP ${response.status}`);
          } catch (error) {
            hostError = error;
          }
          const remote = ctx.get?.('remote')?.cotTranslation || ctx.remote?.cotTranslation;
          if (!remote) throw hostError || new Error('未找到 DSH 内置翻译服务');
          const controller = new AbortController();
          const limits = await remote.limits(controller.signal);
          if (!limits?.ok) throw hostError || limits?.error || new Error('翻译服务不可用');
          const { maxTextChars = 4000, preferences = {} } = limits.value || {};
          const remoteTarget = preferences.targetLanguage && preferences.targetLanguage !== 'auto'
            ? preferences.targetLanguage
            : targetLanguage;
          const output = [];
          for (let index = 0; index < text.length; index += maxTextChars) {
            const result = await remote.translate(
              {
                text: text.slice(index, index + maxTextChars),
                targetLanguage: remoteTarget,
                ...(preferences.provider ? { provider: preferences.provider } : {}),
              },
              controller.signal
            );
            if (!result?.ok) throw result?.error || new Error('翻译失败');
            output.push(result.value);
          }
          return output.join('\n');
        };
        const translateTexts = async (texts) => {
          try {
            const endpoint = new URL('/lit-model/translate', window.location.href).toString();
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ texts, targetLanguage: document.documentElement.lang || 'zh-CN' }),
            });
            const body = await response.json().catch(() => ({}));
            if (response.ok && body.ok === true && Array.isArray(body.texts)) return body.texts;
          } catch (error) {
            // Fall back to the remote translator below.
          }
          const output = [];
          for (const text of texts) output.push(await translatePage(text));
          return output;
        };

        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: 'lit-demo',
              locale: NS,
              inject: () => ({ t, translatePage, translateTexts, themeStore }),
            },
            LitWorkspaceBoundary
          )
        );

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'lit-demo',
              order: 15,
              label: () => t('nav'),
              locale: NS,
            },
            LitIcon
          )
        );
      },
    };
  },
});
;
//# sourceMappingURL=??@local/lit-demo/client.js.map&rev=e99783de2fa2
