import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

if (!process.env.HOME) throw new Error("HOME environment variable not set");
export const HOME = join(process.env.HOME, ".elsummariz00r");
const ARTICLES_DIR = join(HOME, "articles");
const SUMMARIES_DIR = join(HOME, "summaries");
const HTML_DIR = join(HOME, "html");

/** Normalize a URL for dedup comparison. YouTube → video ID, web → strip trailing slash + fragment. */
function normalizeUrl(url: string): string {
  // YouTube: normalize to just the video ID
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?.*v=|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  if (ytMatch) return `yt:${ytMatch[1]}`;

  // Web: strip fragment and trailing slash
  try {
    const u = new URL(url);
    u.hash = "";
    let normalized = u.toString();
    if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
    return normalized;
  } catch {
    return url;
  }
}

/** Find an existing summary by URL. Returns slug if found. */
export async function findByUrl(url: string): Promise<string | null> {
  const needle = normalizeUrl(url);
  try {
    const files = await readdir(ARTICLES_DIR);
    const mds = files.filter((f) => f.endsWith(".md"));
    for (const file of mds) {
      const text = await readFile(join(ARTICLES_DIR, file), "utf-8");
      // Parse the url from frontmatter
      const urlMatch = text.match(/^url:\s*(.+)$/m);
      if (urlMatch) {
        const storedUrl = urlMatch[1].trim();
        if (normalizeUrl(storedUrl) === needle) {
          return file.replace(".md", "");
        }
      }
    }
  } catch {
    // No articles dir yet
  }
  return null;
}

export async function ensureDirs(): Promise<void> {
  await mkdir(ARTICLES_DIR, { recursive: true });
  await mkdir(SUMMARIES_DIR, { recursive: true });
  await mkdir(HTML_DIR, { recursive: true });
}

export function generateSlug(title: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const sanitized = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/-$/, "");
  return `${date}_${sanitized}`;
}

interface Meta {
  title: string;
  url: string;
  type: "web" | "youtube";
  words: number;
}

function frontmatter(meta: Meta): string {
  return `---
title: "${meta.title.replace(/"/g, '\\"')}"
url: ${meta.url}
date: ${new Date().toISOString()}
type: ${meta.type}
words: ${meta.words}
---`;
}

export async function saveArticle(
  slug: string,
  content: string,
  meta: Meta,
): Promise<string> {
  const path = join(ARTICLES_DIR, `${slug}.md`);
  await Bun.write(path, `${frontmatter(meta)}\n\n${content}`);
  return path;
}

export async function saveSummary(
  slug: string,
  summary: string,
  meta: Meta,
): Promise<string> {
  const path = join(SUMMARIES_DIR, `${slug}.md`);
  await Bun.write(path, `${frontmatter(meta)}\n\n${summary}`);
  return path;
}

export async function saveHTML(slug: string, html: string): Promise<string> {
  const path = join(HTML_DIR, `${slug}.html`);
  await Bun.write(path, html);
  return path;
}

export async function getLatestSlug(): Promise<string | null> {
  try {
    const files = await readdir(SUMMARIES_DIR);
    const mds = files.filter((f) => f.endsWith(".md"));
    if (mds.length === 0) return null;
    // Sort by modification time, most recent first
    const withMtime = await Promise.all(
      mds.map(async (f) => ({
        name: f,
        mtime: (await stat(join(SUMMARIES_DIR, f))).mtimeMs,
      })),
    );
    withMtime.sort((a, b) => b.mtime - a.mtime);
    return withMtime[0].name.replace(".md", "");
  } catch {
    return null;
  }
}

export async function readSummaryFile(slug: string): Promise<string | null> {
  try {
    const path = join(SUMMARIES_DIR, `${slug}.md`);
    return await Bun.file(path).text();
  } catch {
    return null;
  }
}

/** If URL is a file:// pointing to our HTML dir, resolve back to the original source URL. */
export async function resolveSourceUrl(url: string): Promise<string | null> {
  const htmlPrefix = `file://${HTML_DIR}/`;
  if (!url.startsWith(htmlPrefix)) return null;

  const slug = url.slice(htmlPrefix.length).replace(".html", "");
  if (slug.includes("/") || slug.includes("\\")) return null;
  try {
    const text = await readFile(join(ARTICLES_DIR, `${slug}.md`), "utf-8");
    const urlMatch = text.match(/^url:\s*(.+)$/m);
    return urlMatch?.[1]?.trim() || null;
  } catch {
    return null;
  }
}
