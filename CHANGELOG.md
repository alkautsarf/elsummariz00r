# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [0.2.4] - 2026-04-16

### Fixed

- SDK isolation — added `settingSources: []` to summarize query so `~/.claude/settings.json` hooks no longer leak into summarization sessions (SDK 0.2.111 changed `options.env` from replace to overlay)

## [0.2.3] - 2026-04-16

### Changed

- Upgraded `@anthropic-ai/claude-agent-sdk` from 0.2.84 to 0.2.111 (matches Claude Code v2.1.111)

## [0.2.2] - 2026-04-16

### Changed

- Default summarization model bumped from `claude-opus-4-6` to `claude-opus-4-7`

## [0.2.1] - 2026-04-16

### Fixed

- YouTube caption extraction — forward page cookies to innertube API and caption fetches for restricted videos
- Companion CDP isolation — each conversation gets its own proxy port to prevent concurrent sessions from stomping each other's tab pins

### Changed

- Companion system prompt no longer requires manual `export AGENT_BROWSER_CDP=...` — env vars are pre-set
- Extracted CDP proxy port (`9222`) to `COMPANION_CDP_PROXY` constant
- Port allocation starts early to overlap with interrupt wait time

## [0.2.0] - 2026-03-28

### Added

- Companion mode — AI chat panel inside qutebrowser via InspectorSplitter
- Per-tab conversations with session persistence and resumption
- Streaming responses with markdown rendering
- Browser interaction via agent-browser v0.22.3 (snapshot, click, fill, scroll)
- YouTube transcript extraction endpoint for video summarization
- Persistent summary skill — save articles, summaries, and HTML pages
- Keyboard navigation: `gc` to focus panel, `Tab`/`j`/`k` to scroll, `i` to type
- Interrupt support: `Ctrl+c` to cancel, send new message to redirect
- Tool lockdown: SDK isolation, disallowed WebFetch/WebSearch/Agent, curl blocking
- Auto-start companion server and CDP proxy with qutebrowser
- Cleanup on qb exit via atexit hooks
- `elsr` restart script for companion server
- Shared env module (`src/env.ts`) for model config and env loading

### Changed

- Upgraded Claude Agent SDK from 0.2.38 to 0.2.84
- Summarization now uses adaptive thinking
- Agent-browser skill rewritten for v0.22.3 snapshot-first approach

## [0.1.0] - 2026-03-25

### Added

- Initial release
- Web page summarization via CDP extraction from qutebrowser
- YouTube video summarization via ANDROID innertube API
- Site/docs summarization with map-reduce for large sites
- CLI (`els`) and qutebrowser userscripts
- Discussion mode via Claude Code in tmux
- Session resume for discussions
- Self-contained HTML summary pages with Tokyo Night theme
- Dark/light mode toggle
- Dedup and caching

[0.2.4]: https://github.com/alkautsarf/elsummariz00r/releases/tag/v0.2.4
[0.2.3]: https://github.com/alkautsarf/elsummariz00r/releases/tag/v0.2.3
[0.2.2]: https://github.com/alkautsarf/elsummariz00r/releases/tag/v0.2.2
[0.2.1]: https://github.com/alkautsarf/elsummariz00r/releases/tag/v0.2.1
[0.2.0]: https://github.com/alkautsarf/elsummariz00r/releases/tag/v0.2.0
[0.1.0]: https://github.com/alkautsarf/elsummariz00r/releases/tag/v0.1.0
