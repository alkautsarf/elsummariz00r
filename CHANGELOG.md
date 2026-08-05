# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [0.4.0] - 2026-08-05

### Added

- Companion states its own model from configuration instead of guessing. Asked "what model are you", it previously answered from training data, which is always stale for a model's own generation, and would confidently assert that a newer generation did not exist. The system prompt now carries the configured model id and scopes the "do not introspect" instruction to identity questions only.

### Fixed

- Companion system prompt is now built per session rather than at module load. `getModel()` used to run during import, which ES module evaluation order guarantees happens before `await loadEnv()` in the companion entrypoint, so a model set in `~/.elsummariz00r/.env` was never visible to the prompt while `conversation.ts` sent the correct value to the SDK. The prompt and the model actually in use could disagree.
- `loadEnv()` strips surrounding quotes and whitespace from `.env` values. Quoting is the standard `.env` convention, and without this `ELS_MODEL="claude-opus-5"` yielded a value with the quote characters still attached, which was then handed to the Agent SDK as an invalid model id.
- Companion logs when the SDK resolves a different model than the one requested, so an alias mapping is visible rather than silent.

### Security

- The model id is sanitized against a character whitelist before being interpolated into the companion system prompt. The companion runs with `permissionMode: "bypassPermissions"` plus Bash and Write, and the value originates in a file on disk, so a backtick or newline in `ELS_MODEL` could previously close the code span and inject arbitrary instructions above the guideline section that forbids curl and writing to Claude memory directories.

## [0.3.1] - 2026-05-29

### Fixed

- Companion resume self-heals — when resuming a persisted session fails before anything streams (e.g. a stale in-memory session left over from an Agent SDK upgrade), the conversation now retries once as a fresh session instead of dying with "Claude Code process exited with code 1" (fixes v0.3.0 stale-session regression)

## [0.3.0] - 2026-05-29

### Changed

- Upgraded `@anthropic-ai/claude-agent-sdk` from 0.2.111 to 0.3.156
- Default summarization model bumped from `claude-opus-4-7` to `claude-opus-4-8`

### Added

- Dynamic model resolver — `S0NDER_MODEL` env now acts as a fallback when `ELS_MODEL` is unset (precedence: `ELS_MODEL` then `S0NDER_MODEL` then `claude-opus-4-8`)

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

[0.4.0]: https://github.com/alkautsarf/elsummariz00r/releases/tag/v0.4.0
[0.3.1]: https://github.com/alkautsarf/elsummariz00r/releases/tag/v0.3.1
[0.3.0]: https://github.com/alkautsarf/elsummariz00r/releases/tag/v0.3.0
[0.2.4]: https://github.com/alkautsarf/elsummariz00r/releases/tag/v0.2.4
[0.2.3]: https://github.com/alkautsarf/elsummariz00r/releases/tag/v0.2.3
[0.2.2]: https://github.com/alkautsarf/elsummariz00r/releases/tag/v0.2.2
[0.2.1]: https://github.com/alkautsarf/elsummariz00r/releases/tag/v0.2.1
[0.2.0]: https://github.com/alkautsarf/elsummariz00r/releases/tag/v0.2.0
[0.1.0]: https://github.com/alkautsarf/elsummariz00r/releases/tag/v0.1.0
