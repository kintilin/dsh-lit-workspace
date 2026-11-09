# @local/lit-model

Host-side route for the DSH literature workspace.

## What it does

Registers:

```text
POST /lit-model/summarize
POST /lit-model/screen
POST /lit-model/digest   把检索候选整理成 RSS 风格卡片
ALL  /lit/*             同源代理到 litd（默认 http://127.0.0.1:8765）
```

客户端不再使用硬编码的 `8765`，而是请求当前 DSH 页面的 `/lit/api/*`。
代理目标可用 `LITD_URL` 覆盖。

`/lit-model/screen` scores RSS candidates 1–5 for novelty and returns
`stars`, `type`, `reason`, `why_not_higher`, `confidence`.
It uses a general novelty rubric instead of a user profile. Missing abstracts do
not cap the score; they lower confidence and must be mentioned in the rationale.

The summarize route:

1. Takes `{ title, authors, abstract, pages: [{ page, text }] }`.
2. Calls the current DSH default model via `ctx.llm.stream`.
3. Asks for strict JSON with sections:
   `question`, `method`, `findings`, `limitations`, `conclusion`.
4. Each entry contains `text` and an exact English `quote`.
5. Returns `{ ok, provider, model, usage, summary: { sections } }`.

The `litd` service calls this route, then uses its own normalized quote locator to fill `page` and `bbox_pdf`.

## Dependencies

- Host services: `webServer`, `llm`, `agentDefaultModel`
- No API key is stored in this package; it uses the profile's configured model route.

## Install

Already installed in the current profile as `@local/lit-model`.

For another profile:

```text
plugin_manager install_bundle E:\DSH_Workspace\lit-model-plugin
```

## Notes

- This route is local-only and has no authentication; it binds through the existing DSH web server.
- Model calls are billed to the current DSH account.
- Long papers are truncated to roughly 90k characters before the prompt.
- The model is instructed to quote exactly; if a quote cannot be located, the summary entry still exists but has no `page`/`bbox`.
