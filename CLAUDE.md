# elsummariz00r

Personal web/YouTube summarization tool integrated with qutebrowser and CLI.

## Architecture

Two modes. The **CLI** is on-demand: each invocation runs `bun run src/index.ts`, does the work, and exits. The **companion** is a persistent server (`src/companion/`, port 7700), autostarted by `~/.qutebrowser/config.py` and long-lived, so it freezes its environment at spawn and must be restarted to pick up env changes.

- **Web extraction**: CDP WebSocket to qutebrowser (port 2262), `document.body.innerText`
- **YouTube extraction**: ANDROID innertube `/player` endpoint (server-side, no browser needed)
- **Summarization**: Claude Agent SDK, one-shot, no tools. Model comes from `getModel()` in `src/env.ts` (`ELS_MODEL`, else `S0NDER_MODEL`, else a hardcoded default), never a literal pinned here.
- **Storage**: `~/.elsummariz00r/` for articles, summaries, and HTML pages
- **HTML output**: Self-contained HTML files opened via `file://` URLs

## Entry Points

- `bin/els` — CLI: `els <url>`, `els -s <url>`, `els -d <url>`, `els -d -n <url>`, `els` (active tab)
- `bin/qb-summarize` — qutebrowser userscript (`:summarize`), outputs JSON, opens HTML in new tab
- `bin/qb-summarize-site` — qutebrowser userscript (`:summarize-site`), summarize entire docs site
- `bin/qb-resummarize` — qutebrowser userscript (`:resummarize`), force re-summarize
- `bin/qb-discuss` — qutebrowser userscript (`:discuss`), resumes or opens Claude Code in tmux
- `bin/qb-discuss-new` — qutebrowser userscript (`:discuss-new`), forces new discussion session

All entry points call `bun run src/index.ts` directly. Shell scripts set `CLAUDECODE=` to avoid nested session detection.

## Key Files

- `src/index.ts` — CLI entry point (parses args, loads .env, calls run.ts)
- `src/run.ts` — Core orchestration (runSummarize, runSummarizeSite, runDiscuss)
- `src/site.ts` — Site/docs content extraction via HTTP fetch (sitemap + link crawl)
- `src/cdp.ts` — CDP client (list tabs, extract text)
- `src/youtube.ts` — YouTube caption extraction via ANDROID innertube
- `src/summarize.ts` — Claude Agent SDK wrapper
- `src/storage.ts` — File I/O for ~/.elsummariz00r/
- `src/html.ts` — HTML summary page template (Tokyo Night theme, dark/light toggle)
- `src/tmux.ts` — Opens Claude Code discussion sessions in tmux
- `src/env.ts`, loads `~/.elsummariz00r/.env` and resolves the model via `getModel()`. `loadEnv()` is awaited in entrypoints AFTER imports are evaluated, so never read env at module top level in a file this can reach.
- `src/companion/`, the persistent browser companion: `index.ts` (entrypoint), `server.ts` (port 7700), `conversation.ts` (SDK session, resume, per-request options), `tools.ts` (`buildSystemPrompt()`, built per session so it sees post-`loadEnv` values).

## Dev

```
bun run summarize    # Run CLI directly
bun run setup        # One-time setup
```

## Dependencies

Only `@anthropic-ai/claude-agent-sdk`. Bun provides WebSocket and file I/O natively.
