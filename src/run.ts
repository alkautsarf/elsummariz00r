import {
  listTabs,
  getActiveTab,
  findTabByUrl,
  extractText,
  openUrl,
} from "./cdp";
import { isYouTube, extractVideoId, fetchCaptions } from "./youtube";
import { summarize, getModelLabel } from "./summarize";
import {
  ensureDirs,
  generateSlug,
  saveArticle,
  saveSummary,
  saveHTML,
  getLatestSlug,
  findByUrl,
  readSummaryFile,
  resolveSourceUrl,
  HOME,
} from "./storage";
import { generateHTML } from "./html";
import { openDiscussion } from "./tmux";
import { join } from "node:path";

export interface SummarizeResult {
  slug: string;
  title: string;
  summary: string;
  htmlPath: string;
  cached?: boolean;
}

async function getCachedResult(url: string): Promise<SummarizeResult | null> {
  const slug = await findByUrl(url);
  if (!slug) return null;
  const summaryText = await readSummaryFile(slug);
  if (!summaryText) return null;
  const body = summaryText.replace(/^---[\s\S]*?---\n*/, "").trim();
  const titleMatch = summaryText.match(/^title:\s*"(.+)"$/m);
  console.error(`  Already summarized: ${slug}`);
  return {
    slug,
    title: titleMatch?.[1] || slug,
    summary: body,
    htmlPath: join(HOME, "html", `${slug}.html`),
    cached: true,
  };
}

export async function runSummarize(opts: {
  url?: string;
  title?: string;
  redo?: boolean;
}): Promise<SummarizeResult> {
  await ensureDirs();

  let content: string;
  let title: string;
  let url: string;
  let type: "web" | "youtube";

  // Resolve file:// summary URLs back to original source
  let targetUrl = opts.url;
  if (targetUrl) {
    const sourceUrl = await resolveSourceUrl(targetUrl);
    if (sourceUrl) {
      console.error(`  Resolved to original: ${sourceUrl}`);
      targetUrl = sourceUrl;
    }
  }

  // Dedup: check if we already have this URL summarized
  if (!opts.redo && targetUrl) {
    const cached = await getCachedResult(targetUrl);
    if (cached) return cached;
  }

  if (targetUrl && isYouTube(targetUrl)) {
    type = "youtube";
    const videoId = extractVideoId(targetUrl);
    if (!videoId) throw new Error("Could not parse YouTube video ID");

    console.error(`  Extracting YouTube captions for ${videoId}...`);
    const result = await fetchCaptions(videoId);
    content = result.transcript;
    title = result.title;
    url = targetUrl;
    console.error(`  Got ${result.segments} segments, ~${result.words} words`);
  } else {
    type = "web";

    if (targetUrl) {
      const tabs = await listTabs();
      const found = findTabByUrl(tabs, targetUrl);
      if (found) {
        console.error(`  Extracting from tab: ${found.title}...`);
        content = await extractText(found.id);
        title = opts.title || found.title;
        url = targetUrl;
      } else {
        console.error(`  Opening ${targetUrl} in qutebrowser...`);
        const opened = await openUrl(targetUrl);
        console.error(`  Extracting from tab: ${opened.title}...`);
        content = await extractText(opened.id);
        title = opts.title || opened.title;
        url = targetUrl;
      }
    } else {
      const active = await getActiveTab();
      url = active.url;

      // Dedup for active tab (URL only known after CDP discovery)
      if (!opts.redo) {
        const cached = await getCachedResult(url);
        if (cached) return cached;
      }

      console.error(`  Extracting from active tab: ${active.title}...`);
      content = await extractText(active.id);
      title = opts.title || active.title;
    }

    console.error(`  Got ${content.length} chars`);
  }

  console.error(`  Summarizing with ${getModelLabel()}...`);
  const summary = await summarize(content, { title, url, type });
  console.error(`  Summary: ${summary.length} chars`);

  const slug = generateSlug(title);
  const words = content.split(/\s+/).length;
  const meta = { title, url, type, words };

  await saveArticle(slug, content, meta);
  await saveSummary(slug, summary, meta);

  const html = generateHTML({
    title,
    url,
    type,
    date: new Date().toISOString().slice(0, 10),
    words,
    summary,
  });
  const htmlPath = await saveHTML(slug, html);

  console.error(`  Saved as: ${slug}`);
  return { slug, title, summary, htmlPath };
}

export async function runDiscuss(slug?: string, url?: string): Promise<void> {
  let target = slug;
  if (!target && url) {
    target = await findByUrl(url) || undefined;
    if (!target) throw new Error("This page hasn't been summarized yet");
  }
  if (!target) {
    target = await getLatestSlug() || undefined;
  }
  if (!target) throw new Error("No summaries yet");
  await openDiscussion(target);
}
