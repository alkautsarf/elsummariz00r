#!/bin/bash
# elsummariz00r setup script
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ELS_HOME="$HOME/.elsummariz00r"
# macOS: ~/Library/Application Support/qutebrowser/userscripts
# Linux: ~/.local/share/qutebrowser/userscripts
if [ "$(uname)" = "Darwin" ]; then
  USERSCRIPTS_DIR="$HOME/Library/Application Support/qutebrowser/userscripts"
else
  USERSCRIPTS_DIR="$HOME/.local/share/qutebrowser/userscripts"
fi

echo "elsummariz00r setup"
echo "==================="
echo ""

# 1. Create runtime directories
echo "Creating $ELS_HOME..."
mkdir -p "$ELS_HOME/articles" "$ELS_HOME/summaries" "$ELS_HOME/html"

# 2. Write CLAUDE.md for discussion sessions
cat > "$ELS_HOME/CLAUDE.md" << 'CLAUDE_EOF'
# elsummariz00r

You are helping me discuss articles and videos I've been reading/watching.
All content is stored in this directory.

## Directory Structure

- `articles/` - Full extracted text (markdown with YAML frontmatter)
- `summaries/` - AI-generated summaries (markdown with YAML frontmatter)

## Frontmatter Format

Each file has YAML frontmatter:
- title: Article/video title
- url: Source URL
- date: When it was saved
- type: "web" or "youtube"
- words: Word count of original content

## How to Help

- When I ask about a specific article, read it from `articles/` first
- You can search across all articles using Grep
- When comparing articles, read the relevant ones
- Keep discussion focused and insightful
- Reference specific parts of the article when discussing
CLAUDE_EOF
echo "  Wrote $ELS_HOME/CLAUDE.md"

# 3. Copy OAuth token
ENV_FILE="$ELS_HOME/.env"
if [ ! -f "$ENV_FILE" ]; then
  # Try to copy from elthread00r
  ELTHREAD_ENV="$HOME/Documents/elthread00r/.env.local"
  if [ -f "$ELTHREAD_ENV" ]; then
    TOKEN=$(grep "CLAUDE_CODE_OAUTH_TOKEN" "$ELTHREAD_ENV" | head -1)
    if [ -n "$TOKEN" ]; then
      echo "$TOKEN" > "$ENV_FILE"
      echo "  Copied OAuth token from elthread00r"
    fi
  fi
  if [ ! -f "$ENV_FILE" ]; then
    echo "  Warning: No OAuth token found. Run 'claude setup-token' and add to $ENV_FILE"
    echo "CLAUDE_CODE_OAUTH_TOKEN=" > "$ENV_FILE"
  fi
else
  echo "  $ENV_FILE already exists, skipping"
fi

# 4. Create userscripts directory and symlink
echo ""
echo "Setting up qutebrowser userscripts..."
mkdir -p "$USERSCRIPTS_DIR"

for script in summarize resummarize summarize-site resummarize-site discuss discuss-new; do
  src="$SCRIPT_DIR/bin/qb-$script"
  dest="$USERSCRIPTS_DIR/$script"
  if [ -L "$dest" ] || [ -f "$dest" ]; then
    rm "$dest"
  fi
  ln -s "$src" "$dest"
  chmod +x "$src"
  echo "  Linked $dest -> $src"
done

# 5. Make CLI executable and symlink
chmod +x "$SCRIPT_DIR/bin/els"
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
if [ -L "$BIN_DIR/els" ] || [ -f "$BIN_DIR/els" ]; then
  rm "$BIN_DIR/els"
fi
ln -s "$SCRIPT_DIR/bin/els" "$BIN_DIR/els"
echo "  Linked $BIN_DIR/els -> $SCRIPT_DIR/bin/els"

echo ""
echo "Setup complete!"
echo ""
echo "Add these aliases to your qutebrowser config.py:"
echo ""
echo "  c.aliases['summarize'] = 'spawn --userscript summarize'"
echo "  c.aliases['resummarize'] = 'spawn --userscript resummarize'"
echo "  c.aliases['discuss'] = 'spawn --userscript discuss'"
echo "  c.aliases['summarize-site'] = 'spawn --userscript summarize-site'"
echo "  c.aliases['discuss-new'] = 'spawn --userscript discuss-new'"
echo ""
echo "Usage:"
echo "  CLI:     els <url>  |  els -s <url>  |  els -r <url>  |  els -d <url>  |  els -d -n <url>  |  els (active tab)"
echo "  Browser: :summarize  |  :summarize-site  |  :resummarize  |  :discuss  |  :discuss-new"
