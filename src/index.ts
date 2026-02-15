import { HOME } from "./storage";
import { runSummarize, runDiscuss } from "./run";

// Load .env from ~/.elsummariz00r/.env
const envPath = `${HOME}/.env`;
try {
  const envFile = Bun.file(envPath);
  if (await envFile.exists()) {
    const text = await envFile.text();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq);
        const value = trimmed.slice(eq + 1);
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
} catch {
  // .env not found, rely on shell environment
}

// Parse CLI args: els [--discuss] [--json] [--redo] [url]
const args = process.argv.slice(2);
let discuss = false;
let json = false;
let redo = false;
let url: string | undefined;
let title: string | undefined;

for (const arg of args) {
  if (arg === "--discuss" || arg === "-d") discuss = true;
  else if (arg === "--json") json = true;
  else if (arg === "--redo" || arg === "-r") redo = true;
  else if (arg === "--discuss-latest") {
    await runDiscuss();
    process.exit(0);
  } else if (arg.startsWith("--discuss-url=")) {
    await runDiscuss(undefined, arg.slice(14));
    process.exit(0);
  } else if (arg.startsWith("--title=")) title = arg.slice(8);
  else if (!arg.startsWith("-")) url = arg;
}

// ANSI colors for terminal output
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

const PAD = "    ";
const MARGIN = 4; // left padding chars
const RIGHT_MARGIN = 4;

/** Strip ANSI escape codes to get visible character count */
function visibleLength(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/** Word-wrap a line to fit within maxWidth visible characters */
function wrapLine(line: string, maxWidth: number): string[] {
  // Don't wrap short lines or empty lines
  if (visibleLength(line) <= maxWidth || line.trim() === "") return [line];

  const words = line.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (visibleLength(test) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Convert markdown formatting to ANSI escape codes for terminal display */
function mdToAnsi(text: string): string {
  const cols = process.stdout.columns || 80;
  const maxWidth = cols - MARGIN - RIGHT_MARGIN;

  return text
    // Headings: ## Heading → bold cyan
    .replace(/^#{1,3}\s+(.+)$/gm, (_, h) => `\x1b[1;36m${h}\x1b[0m`)
    // Bold+italic: ***text*** or ___text___
    .replace(/\*{3}(.+?)\*{3}/g, (_, t) => `\x1b[1;3m${t}\x1b[0m`)
    // Bold: **text**
    .replace(/\*{2}(.+?)\*{2}/g, (_, t) => `\x1b[1m${t}\x1b[0m`)
    // Italic: *text*
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (_, t) => `\x1b[3m${t}\x1b[0m`)
    // Inline code: `code`
    .replace(/`([^`]+)`/g, (_, t) => `\x1b[33m${t}\x1b[0m`)
    // Blockquotes: > text → dim italic
    .replace(/^>\s*(.+)$/gm, (_, t) => `\x1b[2;3m  ${t}\x1b[0m`)
    // Word-wrap and add padding
    .split("\n")
    .flatMap((line) => wrapLine(line, maxWidth))
    .map((line) => PAD + line)
    .join("\n");
}

try {
  const result = await runSummarize({ url, title, redo });

  if (json) {
    // Machine-readable output for userscripts
    console.log(JSON.stringify({
      slug: result.slug,
      title: result.title,
      summary: result.summary,
      htmlPath: result.htmlPath,
      cached: result.cached || false,
    }));
  } else {
    // Human-readable output for CLI
    const cols = process.stdout.columns || 80;
    const ruleWidth = cols - MARGIN - RIGHT_MARGIN;
    const rule = PAD + dim("─".repeat(ruleWidth));
    if (result.cached) {
      console.log(rule);
      console.log(PAD + yellow("(cached) ") + bold(result.title));
      console.log(rule);
    } else {
      console.log(rule);
      console.log(PAD + bold(result.title));
      console.log(rule);
    }
    console.log("");
    console.log(mdToAnsi(result.summary));
    console.log("");
    console.log(rule);
    console.log(`${PAD}${dim("slug")}  ${cyan(result.slug)}`);
    console.log(`${PAD}${dim("file")}  ${green(result.htmlPath)}`);
    if (result.cached) {
      console.log(`${PAD}      ${dim("use --redo to re-summarize")}`);
    }
    console.log(rule);
  }

  if (discuss) {
    console.error("  Opening discussion session...");
    await runDiscuss(result.slug);
  }

  process.exit(0);
} catch (err: any) {
  if (json) {
    console.log(JSON.stringify({ error: err.message }));
  } else {
    console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
  }
  process.exit(1);
}
