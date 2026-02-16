# elsummariz00r

Personal web/YouTube summarization tool integrated with qutebrowser and CLI.

## Architecture

On-demand CLI tool — no persistent server. Each invocation runs `bun run src/index.ts`, does the work, and exits.

- **Web extraction**: CDP WebSocket to qutebrowser (port 2262), `document.body.innerText`
- **YouTube extraction**: ANDROID innertube `/player` endpoint (server-side, no browser needed)
- **Summarization**: Claude Agent SDK with Opus (`claude-opus-4-6`), one-shot, no tools
- **Storage**: `~/.elsummariz00r/` for articles, summaries, and HTML pages
- **HTML output**: Self-contained HTML files opened via `file://` URLs

## Entry Points

- `bin/els` — CLI: `els <url>`, `els -d <url>`, `els -d -n <url>`, `els` (active tab)
- `bin/qb-summarize` — qutebrowser userscript (`:summarize`), outputs JSON, opens HTML in new tab
- `bin/qb-resummarize` — qutebrowser userscript (`:resummarize`), force re-summarize
- `bin/qb-discuss` — qutebrowser userscript (`:discuss`), resumes or opens Claude Code in tmux
- `bin/qb-discuss-new` — qutebrowser userscript (`:discuss-new`), forces new discussion session

All entry points call `bun run src/index.ts` directly. Shell scripts set `CLAUDECODE=` to avoid nested session detection.

## Key Files

- `src/index.ts` — CLI entry point (parses args, loads .env, calls run.ts)
- `src/run.ts` — Core orchestration (runSummarize, runDiscuss)
- `src/cdp.ts` — CDP client (list tabs, extract text)
- `src/youtube.ts` — YouTube caption extraction via ANDROID innertube
- `src/summarize.ts` — Claude Agent SDK wrapper
- `src/storage.ts` — File I/O for ~/.elsummariz00r/
- `src/html.ts` — HTML summary page template (Tokyo Night theme, dark/light toggle)
- `src/tmux.ts` — Opens Claude Code discussion sessions in tmux

## Dev

```
bun run summarize    # Run CLI directly
bun run setup        # One-time setup
```

## Dependencies

Only `@anthropic-ai/claude-agent-sdk`. Bun provides WebSocket and file I/O natively.
