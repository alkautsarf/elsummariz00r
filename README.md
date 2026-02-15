# elsummariz00r

Personal web/YouTube summarization tool. Extracts content from web pages and YouTube videos, summarizes with Claude, and saves as self-contained HTML pages.

Built for [qutebrowser](https://qutebrowser.org/). Web page extraction requires qutebrowser running with the page open. YouTube works standalone (no browser needed).

## How it works

1. **Web pages** — Extracts text via Chrome DevTools Protocol (CDP) from your open qutebrowser tabs
2. **YouTube videos** — Fetches captions server-side via the ANDROID innertube API (no browser needed)
3. **Summarization** — One-shot Claude (Opus by default) via the Agent SDK
4. **Output** — Saves full article, summary, and a styled HTML page to `~/.elsummariz00r/`

No persistent server. Each invocation runs, does the work, and exits.

## Usage

### CLI

```bash
els <url>           # Summarize a URL
els                 # Summarize active qutebrowser tab
els -r <url>        # Force re-summarize (ignore cache)
els -d <url>        # Summarize + open Claude Code discussion in tmux
```

### qutebrowser commands

```
:summarize          # Summarize current page, open HTML summary in new tab
:resummarize        # Force re-summarize current page
:discuss            # Open Claude Code discussion for current page's summary
```

## Setup

### Prerequisites

- [Bun](https://bun.sh/)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with a valid OAuth token
- qutebrowser with CDP enabled (`c.qt.args = ['remote-debugging-port=2262']`)
- tmux (for `:discuss` sessions)

### Install

```bash
git clone https://github.com/elpabl0/elsummariz00r.git
cd elsummariz00r
bun install
bun run setup
```

The setup script:
- Creates `~/.elsummariz00r/` with articles, summaries, and html directories
- Sets up the OAuth token
- Symlinks userscripts to qutebrowser's userscripts directory
- Symlinks `els` to `~/.local/bin/`

Then add these aliases to your qutebrowser `config.py`:

```python
c.aliases['summarize'] = 'spawn --userscript summarize'
c.aliases['resummarize'] = 'spawn --userscript resummarize'
c.aliases['discuss'] = 'spawn --userscript discuss'
```

## Configuration

All config lives in `~/.elsummariz00r/.env`:

```bash
# Required
CLAUDE_CODE_OAUTH_TOKEN=your-token-here

# Optional: change the model (default: claude-opus-4-6)
ELS_MODEL=claude-sonnet-4-5-20250929
```

## Features

- **Dedup** — Won't re-summarize a URL you've already processed. Shows cached result instead. Use `--redo` or `:resummarize` to force.
- **YouTube URL normalization** — `youtube.com/watch?v=X` and `youtu.be/X` are treated as the same video
- **Dark/light mode** — Toggle in the HTML summary pages, persists via localStorage
- **Discussion sessions** — Opens Claude Code in a tmux window with full article context for follow-up questions
- **file:// aware** — Running `:summarize` or `:discuss` from a summary page auto-resolves to the original source

## Storage

```
~/.elsummariz00r/
├── .env              # OAuth token + config
├── CLAUDE.md         # Context for discussion sessions
├── articles/         # Full extracted text (markdown + YAML frontmatter)
├── summaries/        # AI-generated summaries
└── html/             # Self-contained HTML summary pages
```

## Dependencies

Just one: `@anthropic-ai/claude-agent-sdk`. Bun handles everything else natively (WebSocket, file I/O, HTTP fetch).
