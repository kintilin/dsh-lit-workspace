# dsh-lit

DeepSeek Harness 的本地文献工作台。

## 功能

- 本地文献库、PDF 导入与全文提取
- 为只有元数据的文献补充 PDF
- AI 总结、AI 新颖性评分
- RSS 追踪、OPML 导入导出
- AI 检索：Europe PMC、bioRxiv、arXiv、OpenAlex、Crossref、Semantic Scholar
- 作者检索：姓名 + 单位 → 作者候选 → 近年论文
- 语义网络图、分组、备份恢复

## 目录

```text
src/
  client/     客户端插件的开发源码
  host/       Host 插件的开发源码
  service/    litd 本地服务
  bundle/     可安装单包 dsh-lit 的源码
tests/        Node/JSDOM 回归测试
docs/         安装与迁移说明
assets/       示例 RSS 订阅
```

`src/bundle/` 是最终安装包使用的单包源码；`src/client/` 与
`src/host/` 是开发、调试和测试时使用的分体源码。

## 安装

打包：

```bash
cd src/bundle
pnpm install
pnpm pack
```

安装：

```text
plugin_manager install_bundle <path-to-tgz>
```

完整说明见 [docs/INSTALL.md](docs/INSTALL.md)。

## 本地服务

```bash
node src/service/litd.mjs
```

默认监听 `127.0.0.1:8765`，支持：

```text
LITD_PORT
LITD_DATA_DIR
DSH_WEB_URL
```

## 数据

用户数据不进入仓库：

```text
<DSH profile>/lit-data/
  library.db
  pdfs/
  backups/
```

JCR 数据受授权限制，不随包分发。

## License

MIT
