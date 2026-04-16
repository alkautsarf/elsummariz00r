# elsummariz00r

Personal browser companion and summarization tool for [qutebrowser](https://qutebrowser.org/). Summarize web pages, YouTube videos, and entire documentation sites. Chat with an AI companion that can read, navigate, and interact with any page in your browser.

## Features

### Companion Mode

A side panel inside qutebrowser powered by Claude (Opus). Opens via `:companion` or `Ctrl+/`.

- **Chat about any page** — ask questions, get explanations, extract data
- **Navigate sites** — Claude reads pages, follows links, scrolls, and explores
- **Interact with elements** — fill forms, click buttons, search via snapshot refs
- **Summarize on demand** — quick summaries in chat, or save persistent summaries to file
- **Per-tab conversations** — each tab has its own independent chat with session persistence
- **YouTube transcripts** — fetches captions server-side for video summarization
- **Keyboard-driven** — `gc` to focus, `Tab` to scroll mode, `j/k` to scroll, `i` to type, `Escape` to exit

### Summarization

- **Web pages** — extracts text via CDP from qutebrowser tabs
- **YouTube videos** — fetches captions via ANDROID innertube API (no browser needed)
- **Documentation sites** — crawls sitemaps and links, summarizes with map-reduce for large sites
- **Output** — saves article, summary, and styled HTML page to `~/.elsummariz00r/`
- **Dedup** — won't re-summarize a URL you've already processed (use `--redo` to force)

### Discussion Mode

Opens Claude Code in a tmux window with the full article and summary for in-depth follow-up questions. Sessions can be resumed.

## Usage

### Companion

```
:companion          # Toggle companion panel (or Ctrl+/)
gc                  # Focus the panel input
Tab                 # Switch to scroll mode (j/k to scroll, i to type)
Escape              # Return focus to the page
```

In the companion chat:
- "summarize this page" → quick summary in chat
- "save summary" → saves article + summary + HTML, opens in new tab
- "what is this page about?" → reads and explains
- "navigate to the docs section" → clicks links, follows navigation
- "fill in this form" → interacts with form elements

### CLI

```bash
els <url>           # Summarize a URL
els                 # Summarize active qutebrowser tab
els -s <url>        # Summarize entire site/docs
els -r <url>        # Force re-summarize (ignore cache)
els -d <url>        # Summarize + open discussion in tmux
els -d -n <url>     # Force new discussion session
```

### qutebrowser Commands

```
:summarize          # Summarize current page, open HTML in new tab
:summarize-site     # Summarize entire site/docs
:resummarize        # Force re-summarize
:resummarize-site   # Force re-summarize site
:discuss            # Open Claude Code discussion for current page
:discuss-new        # Force new discussion session
:companion          # Toggle companion panel
```

## Architecture

```
elsummariz00r/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── run.ts            # Core orchestration (summarize, summarize-site, discuss)
│   ├── cdp.ts            # CDP client (qutebrowser on port 2262)
│   ├── youtube.ts        # YouTube caption extraction via innertube
│   ├── summarize.ts      # Claude Agent SDK wrapper (one-shot, Opus)
│   ├── storage.ts        # File I/O for ~/.elsummariz00r/
│   ├── site.ts           # Site crawling (sitemap + link fallback)
│   ├── html.ts           # HTML template (Tokyo Night theme)
│   ├── tmux.ts           # Discussion session management
│   ├── env.ts            # Shared env loading + model config
│   └── companion/
│       ├── index.ts      # Companion server entry point
│       ├── server.ts     # Bun HTTP/WebSocket server (port 7700)
│       ├── conversation.ts # Per-tab conversation manager (session persistence)
│       ├── tools.ts      # System prompt + summarization skill
│       └── chat.html     # Chat UI (Tokyo Night, vim navigation)
├── bin/
│   ├── els               # CLI wrapper
│   ├── qb-summarize      # qutebrowser userscript
│   ├── qb-summarize-site # qutebrowser userscript
│   ├── qb-resummarize    # qutebrowser userscript
│   ├── qb-discuss        # qutebrowser userscript
│   ├── qb-discuss-new    # qutebrowser userscript
│   ├── qb-companion      # Companion panel toggle
│   └── qb-companion-focus # Companion panel focus
└── scripts/
    └── setup.sh          # First-time setup
```

### qutebrowser Integration

The companion requires:

- **qutebrowser** with CDP enabled (`remote-debugging-port=2262`)
- **CDP Proxy** — bridges agent-browser to qutebrowser's CDP (spoofs Chrome identity, handles tab targeting)
- **agent-browser v0.22.3** — Rust CLI for structured page snapshots with element refs, click/fill/scroll interaction
- **config.py additions** — panel injection via InspectorSplitter, auto-start for proxy + companion server

The companion panel is injected as a `QWebEngineView` into each tab's InspectorSplitter (same mechanism as qb devtools). It persists across page navigation and each tab has its own independent conversation.

## Setup

### Prerequisites

- [Bun](https://bun.sh/)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with a valid OAuth token
- qutebrowser (pip-installed: `pip3 install --user PyQt6 PyQt6-WebEngine qutebrowser aiohttp`)
- [agent-browser](https://www.npmjs.com/package/agent-browser) v0.22.3+ (`npm install -g agent-browser`)
- tmux (for discussion sessions)

### Install

```bash
git clone https://github.com/alkautsarf/elsummariz00r.git
cd elsummariz00r
bun install
bun run setup
```

### qutebrowser config.py

Add to your `~/.qutebrowser/config.py`:

```python
# CDP for agent-browser
c.qt.args = ['remote-debugging-port=2262']

# elsummariz00r commands
c.aliases['summarize'] = 'spawn --userscript summarize'
c.aliases['resummarize'] = 'spawn --userscript resummarize'
c.aliases['summarize-site'] = 'spawn --userscript summarize-site'
c.aliases['resummarize-site'] = 'spawn --userscript resummarize-site'
c.aliases['discuss'] = 'spawn --userscript discuss'
c.aliases['discuss-new'] = 'spawn --userscript discuss-new'
c.aliases['companion'] = 'spawn --userscript companion'

# Keybinds
config.bind('<Ctrl-/>', 'companion')
config.bind('gc', 'devtools-focus')
```

The companion panel injection and auto-start code goes at the end of config.py — see the full config in the project's setup documentation.

## Configuration

All config lives in `~/.elsummariz00r/.env`:

```bash
# Required
CLAUDE_CODE_OAUTH_TOKEN=your-token-here

# Optional: change the model (default: claude-opus-4-7)
ELS_MODEL=claude-opus-4-7
```

## Storage

```
~/.elsummariz00r/
├── .env              # OAuth token + config
├── CLAUDE.md         # Context for discussion sessions
├── articles/         # Full extracted text (markdown + YAML frontmatter)
├── summaries/        # AI-generated summaries
└── html/             # Self-contained HTML summary pages (Tokyo Night theme)
```

## Dependencies

Just one: `@anthropic-ai/claude-agent-sdk`. Bun handles everything else natively (WebSocket, file I/O, HTTP fetch).
