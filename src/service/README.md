# litd：本地文献服务

给 DSH 文献工作台提供真实数据：SQLite、PDF 导入、元数据、全文、页码/bbox、引文定位。

## 启动

```powershell
cd E:\DSH_Workspace\lit\service
node litd.mjs
```

也可以双击 `start-litd.cmd`（使用当前机器的 bundled Node）。

默认监听：`http://127.0.0.1:8765`

可配置：

```text
LITD_PORT=8765
LITD_DATA_DIR=<服务目录>/data
DSH_WEB_URL=http://127.0.0.1:<DSH Web 端口>
```

`start-litd.cmd` 会优先使用 `DSH_NODE`，否则查找 PATH 中的 `node`。

首次启动时，如果数据库为空且本机存在 `D:\Desktop\未读文献\2021_ARB_同义突变综述.pdf`，会自动导入这篇测试论文，并挂载 `../p0/out/summary.revised.json` 的总结与 18 条证据。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 服务和论文数量 |
| GET | `/api/tags` | 全局标签库，带使用次数 |
| POST | `/api/papers/:id/tags` | 给论文添加标签（不存在时自动入标签库） |
| DELETE | `/api/papers/:id/tags/:tag` | 移除标签；最后一篇使用时从标签库删除 |
| GET | `/api/backup` | 直接下载 SQLite + PDF 的 ZIP 备份 |
| GET | `/api/backups` | 备份历史列表 |
| POST | `/api/backups` | 立即创建备份并保留 |
| POST | `/api/restore` | 上传 ZIP 并在线恢复；恢复前自动备份当前数据 |
| GET | `/api/backups/:name` | 下载指定备份 |
| DELETE | `/api/backups/:name` | 删除指定备份 |
| GET | `/api/graph?mode=semantic&threshold=0.14` | TF-IDF 语义相似度 + 凝聚聚类 |
| GET | `/api/graph?mode=groups` | 按论文的用户分组聚类 |
| GET | `/api/graph?mode=tags` | 内部保留的标签聚类 |
| POST | `/api/tags/refresh` | 从 OpenAlex 刷新论文概念标签 |
| GET | `/api/library` | 论文列表 + 分组 |
| GET | `/api/search?q=...` | FTS5 全文搜索（标题/作者/摘要/PDF 正文） |
| POST | `/api/ai-search` | 按需求检索 arXiv/Europe PMC，再由 host `/lit-model/digest` 生成卡片 |
| GET | `/api/discover/arxiv?q=...&limit=20&start=0` | 搜索 arXiv Atom API（分页） |
| GET | `/api/discover/europepmc?q=...&scope=all\|pubmed\|biorxiv&limit=20&cursor=*` | Europe PMC（PubMed / PMC / bioRxiv）检索（分页） |
| GET | `/api/feeds` | RSS / Atom 订阅源和最新条目 |
| POST | `/api/feeds` | 添加订阅源，立即抓取 |
| POST | `/api/feeds/refresh` | 刷新全部订阅 |
| POST | `/api/feeds/ai-score` | AI 给新增 RSS 打 1–5 星；调用 host `/lit-model/screen` |
| PATCH | `/api/feeds/:id` | 修改订阅源名称/URL；URL 变化时重新抓取 |
| DELETE | `/api/feeds/:id` | 删除订阅源及其条目，不影响文献库 |
| POST | `/api/feed-items/:id/read` | 标记已读/未读 |
| POST | `/api/feed-items/:id/kind` | 手动改判论文/新闻/评论 |
| POST | `/api/feed-items/read-all` | 全部已读 / 全部未读 |
| POST | `/api/feed-items/:id/save` | 保存订阅条目到文献库；自动从链接识别 DOI，并用 Crossref 补全期刊、作者、摘要 |
| GET | `/api/jcr/summary?year=2026` | JCR 分区表统计 |
| GET | `/api/impact-factors?year=2024` | 读取本地 IF 表 |
| POST | `/api/impact-factors` | 新增/更新 `{ journal, year, value }` |
| POST | `/api/impact-factors/delete` | 删除 `{ journal, year }` |
| POST | `/api/discover/import` | `{ "pdf_url": "https://...", "title": "..." }` 下载并导入开放 PDF |
| POST | `/api/discover/import-metadata` | 没有开放 PDF 时保存元数据 + 摘要，状态为 `未总结` |
| GET | `/api/papers/:id/pages` | 逐页文本、item、bbox |
| GET | `/api/papers/:id/pdf` | 返回 PDF 字节，供 iframe 预览 |
| POST | `/api/import` | `{ "path": "D:\\...pdf", "auto_summary": true }` 从本机路径导入 PDF |
| POST | `/api/import-upload?filename=...` | 原始 PDF bytes 上传导入（拖拽/文件选择用） |
| POST | `/api/open` | `{ "paper_id": "..." }` 调用系统默认 PDF 阅读器；`dry_run:true` 只验证路径 |
| POST | `/api/locate` | `{ "paper_id": "...", "quote": "..." }` 定位引文 |
| PATCH | `/api/papers/:id` | 保存 metadata / `sections` / `evidence` / `groups` |
| PATCH | `/api/papers/:id/summary` | 兼容旧接口，只保存 `sections` / `evidence` |
| POST | `/api/papers/:id/auto-summary` | 根据 PDF 文本重新生成规则草稿 |
| POST | `/api/papers/:id/model-summary` | 调用 DSH 默认模型生成 `AI 总结`（经 localhost host route） |
| POST | `/api/papers/:id/summary-status` | `{ "reviewed": true\|false }` 在 `AI 总结` 与 `已总结` 之间切换 |
| POST | `/api/papers/delete` | `{ "ids": [...] }` 批量删除论文、索引和 PDF 副本 |
| GET | `/api/groups` | 分组列表 |
| POST | `/api/groups` | 新建分组 |
| PATCH | `/api/groups/:id` | 改名 / 换色 |
| DELETE | `/api/groups/:id` | 删除分组并从论文中移除 |

## 备份与恢复

在插件“设置 → 备份 / 恢复”下载 ZIP。

litd 默认每 24 小时自动创建一份备份，保留最近 12 份。用 `LITD_BACKUP_HOURS` 调整间隔，设为 0 关闭。

恢复步骤：

```text
1. 停止 litd
2. node restore-backup.mjs <备份.zip>
3. 重新启动 litd
```

恢复脚本会先把当前 `library.db` 和 `pdfs/` 复制到 `data/pre-restore-<时间>/`，失败时自动回滚。
不要在 litd 运行时执行恢复。

## 数据

- `data/library.db`：SQLite（WAL）
- `data/pdfs/`：**库拥有的 PDF 副本**
- 导入时会把输入 PDF 复制为 `data/pdfs/<paper_id>.pdf`；原文件之后移动或删除不影响阅读
- 旧数据库里指向原下载路径的行，启动时会自动复制进 `data/pdfs/` 并更新 `pdf_path`
- 论文表保存 `pages_json`（全文/bbox）与 `summary_json`（结构化总结）
- `papers_fts`：FTS5 索引，覆盖 title / authors / abstract / PDF 正文；启动时重建
- `source_url`：有元数据但无 PDF 的论文保留来源页
- 期刊缺失时按 DOI 前缀回填常见期刊（Annual Reviews、Genome Biology、Nature Communications、IJMS 等）
- RSS / Atom 解析 `channel/item` 或 `feed/entry`，按 `(feed_id, guid)` 去重；条目 ID 用 `feedId + guid` 的 SHA-1
- 订阅默认每 6 小时后台刷新（`LITD_FEED_REFRESH_HOURS`，设为 0 关闭）；启动后只刷新超过周期的源
- 手动改判类型写入 `kind_locked = 1`，后续自动刷新不会覆盖

## 导入后的状态

新导入的 PDF 默认**不自动总结**：

- 结构化总结为 5 个空白大类
- 状态为 `未总结`
- 不会因为导入自动产生 token 成本

如果需要规则草稿，显式调用 `POST /api/papers/:id/auto-summary` 或导入时传 `auto_summary: true`。

规则草稿会：

- 摘要前两句 → 研究问题
- Methods 段前两句 → 方法
- 摘要中间句 → 主要发现
- 摘要末句 → 结论式发现
- 含 limitation 的句子 → 局限（没有就留空）
- 尽量回填 page + bbox；状态标为 `AI 草稿`

## 生物医学检索策略

不建议把 PubMed、bioRxiv、PMC 当成三套独立爬虫；推荐分层：

1. **Europe PMC 作为统一检索入口**
   - 覆盖 PubMed（`SRC:MED`）、PMC、bioRxiv/medRxiv（`SRC:PPR`）
   - 一次返回标题、摘要、作者、DOI、来源和开放全文链接
   - 当前实现：`/api/discover/europepmc`，`scope=pubmed|biorxiv|all`

2. **PubMed 用 E-utilities 做权威元数据/PMID 校验**
   - 需要 MeSH、PubMed 查询语法或 PMID 对齐时使用
   - 普通检索先用 Europe PMC，避免自己维护三套解析

3. **bioRxiv 用 DOI/版本 API 补元数据，不把 PDF 抓取当主路径**
   - bioRxiv/medRxiv 的 PDF 经常被 Cloudflare 拦截（实测 403）
   - 因此支持“仅元数据”导入：保存标题、摘要、DOI、来源页，状态保持 `未总结`
   - 有可用开放 PDF 时再导入全文

4. **arXiv 保留直接 PDF 通道**
   - 计算机/物理预印本 PDF 下载稳定，继续一键导入

## 总结状态

- 导入：`未总结`
- AI 模型生成：`AI 总结`
- 用户采纳/标记：`已总结`
- 撤回采纳：回到 `AI 总结`
- 规则草稿：`AI 草稿`

## 模型总结

`POST /api/papers/:id/model-summary` 调用已安装的 `@local/lit-model` Host 插件；该插件通过当前 DSH profile 的默认模型（当前为 `deepseek-account/deepseek-flash`）生成结构化总结。

- 结果状态为 `AI 总结`
- 每条总结尽量携带 quote + page + bbox
- 失败时返回 502，不改动原总结
- 前端只在没有 `AI 总结` 的文献上显示“AI 总结”按钮

Host 插件源码：`E:\DSH_Workspace\lit-model-plugin`。服务通过 `DSH_WEB_URL`（默认 `http://127.0.0.1:49422`）访问 host route。

## DSH 插件

在文献工作台左上角点“真实库”连接；连接后：

- 左侧显示 litd 的分组
- 中间显示真实论文卡片
- 右侧显示真实结构化总结
- “导入”按钮支持输入本地 PDF 绝对路径
- 点击 `p.1` 等证据 chip 会显示真实 bbox

RSS 与网络图仍是演示数据；真实库模式会在顶部横幅提示。

## 限制

- 目前按本地单用户设计，无鉴权；只绑定 `127.0.0.1`。
- 支持文件字节上传，单文件上限 100 MB。
- 只接受以 `%PDF-` 开头的文件；扫描版 PDF 仍需 OCR。
- PDF 解析只验证了文本层 PDF；扫描版需要 OCR。
- 没有后台定时任务；RSS 订阅尚未接入。
- bioRxiv/部分 PMC 的 PDF 可能被 Cloudflare 拦截，此时使用“仅元数据”导入。
- 真实库的总结 sections、论文 groups、分组的改名/换色/新建/删除都会写回 SQLite。
- 搜索支持 `from` / `to`（年份）、`journal`、`min_if` / `if_year`、`jcr_quartile` / `jcr_year` 参数。
- JCR 分区来自用户导入的 2026 JCR 表：20,337 本期刊，按期刊名/ISSN 匹配，取最高分区。
- 检索结果和论文记录会附带 `impact_factor` / `jcr_quartile`，前端用期刊徽标和 `IF` 标签展示。
- RSS / Atom 解析 `channel/item` 或 `feed/entry`，按 `(feed_id, guid)` 去重；条目 ID 用 `feedId + guid` 的 SHA-1，避免多个条目落到同一个 ID。
- IF 优先使用本地 `impact_factors` 表；2025/2026 年缺失时，回退到 2026 JCR 表中的 2025 影响因子。
- IF 表默认会按当前库期刊生成“待填”行；在“设置 → 影响因子表”里填写或覆盖。
- 分组改名/换色使用 500 ms debounce；关闭管理弹窗时会 flush。
- 目前还没有编辑冲突检测/版本历史；同一字段被两个客户端同时修改时以后写入者为准。
