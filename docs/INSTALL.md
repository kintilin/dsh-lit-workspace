# dsh-lit 0.9.0 试用包

这是 DSH 文献工作台的完整安装包，包含：

- 文献库、PDF 导入/关联
- AI 总结、AI 新颖性评分
- RSS 追踪、OPML 导入导出
- AI 检索：Europe PMC / bioRxiv / arXiv / OpenAlex / Crossref / Semantic Scholar
- 作者检索：姓名 + 单位 → 作者候选 → 近年论文
- 语义网络图、分组、备份恢复

## 需要

- 另一台电脑安装了 DeepSeek Harness
- DSH 能正常使用当前默认模型
- 不需要单独安装 Node.js

## 安装

1. 把本目录整个复制到新电脑。
2. 在 DSH 里让 Agent 执行：

```text
plugin_manager install_bundle <本目录绝对路径>\dsh-lit-0.9.0.tgz
```

例如：

```text
plugin_manager install_bundle C:\Users\you\Downloads\dsh-lit-release\dsh-lit-0.9.0.tgz
```

如果使用 DSH 插件管理界面，选择本地安装并指向
`dsh-lit-0.9.0.tgz`。

3. 安装完成后完整退出并重新打开 DSH。
4. 打开“文献工作台”。

## 第一次打开

新电脑上是空库，这是正常的。可以：

- 导入 PDF
- 给只有元数据的文献补 PDF
- 用“发现”搜索 arXiv / Europe PMC
- 用“AI 检索”搜索多个学术来源
- 用“作者检索”定位作者
- 添加 RSS 订阅
- 在设置里配置模型和影响因子表

## 数据在哪里

```text
<DSH profile>/lit-data/
  library.db
  pdfs/
  backups/
```

安装包不包含你的文献库、PDF、JCR 数据或检索记录。
这些只保存在本机 profile 数据目录。

## JCR 数据

JCR 表有授权限制，不包含在安装包里。

如果你有授权数据，把：

```text
jcr-2026.json
```

放到：

```text
<DSH profile>/lit-data/jcr-2026.json
```

然后重启 DSH。没有它时，期刊徽标、JCR 分区和 IF 筛选会为空。

## 已知限制

- AI 总结 / AI 评分 / AI 检索需要 DSH 默认模型可用
- 第一次安装依赖可能比较慢
- 语义 Scholar 有公共速率限制，可能被跳过
- bioRxiv 通过 Europe PMC 的预印本索引检索
- 安装包使用 `dsh-lit` 这个 npm 包名，尚未发布到 npm
- JCR 数据需要单独携带

## 卸载

```text
plugin_manager remove_bundle dsh-lit
```

默认保留 `lit-data`；如果需要彻底清除，手动删除该目录。
