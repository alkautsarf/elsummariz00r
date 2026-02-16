import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { HOME } from "./storage";

/** Claude Code sessions dir for ~/.elsummariz00r project.
 *  Claude Code encodes project paths by replacing non-alphanumeric chars with "-". */
const SESSIONS_DIR = join(
  process.env.HOME!,
  ".claude",
  "projects",
  HOME.replace(/[^a-zA-Z0-9-]/g, "-"),
);

/** Check if a tmux window with the given name exists in session "main". */
async function tmuxWindowExists(name: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(
      ["tmux", "list-windows", "-t", "main", "-F", "#{window_name}"],
      { stdout: "pipe", stderr: "ignore" },
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output.split("\n").some((w) => w.trim() === name);
  } catch {
    return false;
  }
}

/** Find the most recent Claude Code session that discussed this slug. */
async function findSessionForSlug(slug: string): Promise<string | null> {
  try {
    const files = await readdir(SESSIONS_DIR);
    const jsonls = files.filter((f) => f.endsWith(".jsonl"));

    const matches: { id: string; mtime: number }[] = [];

    for (const file of jsonls) {
      const path = join(SESSIONS_DIR, file);
      // Read just the first few KB to find the initial user message
      const fd = Bun.file(path);
      const text = await fd.text();
      // Check if this session's prompt references our slug
      if (text.includes(`articles/${slug}.md`)) {
        const mtime = (await stat(path)).mtimeMs;
        matches.push({ id: file.replace(".jsonl", ""), mtime });
      }
    }

    if (matches.length === 0) return null;
    // Return the most recently modified session
    matches.sort((a, b) => b.mtime - a.mtime);
    return matches[0].id;
  } catch {
    return null;
  }
}

export async function openDiscussion(slug: string, forceNew?: boolean): Promise<void> {
  const windowName = `els:${slug.slice(0, 30)}`;

  // If tmux window for this slug is already open, tell the user
  if (await tmuxWindowExists(windowName)) {
    throw new Error(
      `Discussion already open in tmux — switch to window '${windowName}'`,
    );
  }

  // Find a previous session to resume (unless forcing new)
  const sessionId = forceNew ? null : await findSessionForSlug(slug);

  let cmd: string;
  if (sessionId) {
    // Validate session ID is a safe UUID format
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      throw new Error(`Invalid session ID: ${sessionId}`);
    }
    console.error(`  Resuming discussion: ${slug}`);
    cmd = `cd ${HOME} && command claude --dangerously-skip-permissions --resume '${sessionId}'`;
  } else {
    const prompt = `Read articles/${slug}.md and summaries/${slug}.md. Let me know what you think and let's discuss.`;
    const escaped = prompt.replace(/'/g, "'\\''");
    cmd = `cd ${HOME} && command claude --dangerously-skip-permissions '${escaped}'`;
  }

  const proc = Bun.spawn(
    ["tmux", "new-window", "-t", "main", "-n", windowName, cmd],
    { stdout: "ignore", stderr: "ignore" },
  );
  await proc.exited;
}
