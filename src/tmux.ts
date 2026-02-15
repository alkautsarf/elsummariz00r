import { HOME } from "./storage";

export async function openDiscussion(slug: string): Promise<void> {
  const prompt = `Read articles/${slug}.md and summaries/${slug}.md. Let me know what you think and let's discuss.`;

  // Use 'command claude' to bypass the shell function wrapper
  const escaped = prompt.replace(/'/g, "'\\''");
  const cmd = `cd ${HOME} && command claude --dangerously-skip-permissions '${escaped}'`;

  const proc = Bun.spawn(["tmux", "new-window", "-t", "main", "-n", "els", cmd], {
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.exited;
}
