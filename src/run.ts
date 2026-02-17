import {
  listTabs,
  getActiveTab,
  findTabByUrl,
  extractText,
  openUrl,
} from "./cdp";
import { isYouTube, extractVideoId, fetchCaptions } from "./youtube";
import { fetchSite, getRootUrl } from "./site";
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
import type { SitePage } from "./site";

// ~60K words ≈ 78K tokens, safe for 200K context window
const MAX_SITE_WORDS = 60_000;

export interface SummarizeResult {
  slug: string;
  title: string;
  summary: string;
  htmlPath: string;
  cached?: boolean;
}

async function getCachedResult(url: string, type?: "web" | "youtube" | "site"): Promise<SummarizeResult | null> {
  const slug = await findByUrl(url, type);
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

  // Resolve file:// summary URLs back to original source
  let targetUrl = opts.url;
  if (targetUrl) {
    const sourceUrl = await resolveSourceUrl(targetUrl);
    if (sourceUrl) {
      console.error(`  Resolved to original: ${sourceUrl}`);
      targetUrl = sourceUrl;
    }
  }

  // If no URL provided, resolve from active tab so YouTube detection works
  if (!targetUrl) {
    const active = await getActiveTab();
    targetUrl = active.url;
  }

  // Dedup: check if we already have this URL summarized
  if (!opts.redo) {
    const cached = await getCachedResult(targetUrl);
    if (cached) return cached;
  }

  let content: string;
  let title: string;
  let type: "web" | "youtube";
  const url = targetUrl;

  if (isYouTube(url)) {
    type = "youtube";
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Could not parse YouTube video ID");

    console.error(`  Extracting YouTube captions for ${videoId}...`);
    const result = await fetchCaptions(videoId);
    content = result.transcript;
    title = result.title;
    console.error(`  Got ${result.segments} segments, ~${result.words} words`);
  } else {
    type = "web";

    const tabs = await listTabs();
    const found = findTabByUrl(tabs, url);
    if (found) {
      console.error(`  Extracting from tab: ${found.title}...`);
      content = await extractText(found.id);
      title = opts.title || found.title;
    } else {
      console.error(`  Opening ${url} in qutebrowser...`);
      const opened = await openUrl(url);
      console.error(`  Extracting from tab: ${opened.title}...`);
      content = await extractText(opened.id);
      title = opts.title || opened.title;
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

export async function runSummarizeSite(opts: {
  url?: string;
  redo?: boolean;
}): Promise<SummarizeResult> {
  await ensureDirs();

  // Get URL from opts or active tab
  let targetUrl = opts.url;
  if (!targetUrl) {
    const active = await getActiveTab();
    targetUrl = active.url;
  }

  // Resolve file:// URLs back to original source
  const sourceUrl = await resolveSourceUrl(targetUrl);
  if (sourceUrl) {
    console.error(`  Resolved to original: ${sourceUrl}`);
    targetUrl = sourceUrl;
  }

  const rootUrl = getRootUrl(targetUrl);

  // Dedup check — only match "site" type, not "web" summaries of the same URL
  if (!opts.redo) {
    const cached = await getCachedResult(rootUrl, "site");
    if (cached) return cached;
  }

  // Fetch all pages
  const site = await fetchSite(targetUrl);

  // Format content for storage: each page as a section
  const content = site.pages
    .map((p) => `--- ${p.title} (${p.url}) ---\n${p.content}`)
    .join("\n\n");

  let summary: string;

  if (site.totalWords <= MAX_SITE_WORDS) {
    // Single pass — fits in context
    console.error(`  Summarizing with ${getModelLabel()}...`);
    summary = await summarize(content, {
      title: site.title,
      url: rootUrl,
      type: "site",
    });
  } else {
    // Map-reduce — split into chunks, summarize each, merge
    const chunks = chunkPages(site.pages, MAX_SITE_WORDS);
    console.error(`  Site too large for single pass (${site.totalWords} words)`);
    console.error(`  Splitting into ${chunks.length} chunks, summarizing in parallel...`);

    const chunkSummaries = await Promise.all(
      chunks.map(async (chunk, i) => {
        const chunkContent = chunk
          .map((p) => `--- ${p.title} (${p.url}) ---\n${p.content}`)
          .join("\n\n");
        const chunkWords = chunk.reduce((sum, p) => sum + p.words, 0);
        console.error(`  Chunk ${i + 1}/${chunks.length}: ${chunk.length} pages, ~${chunkWords} words`);
        const result = await summarize(chunkContent, {
          title: site.title,
          url: rootUrl,
          type: "site",
        });
        console.error(`  Chunk ${i + 1} done (${result.length} chars)`);
        return result;
      }),
    );

    // Merge partial summaries
    console.error(`  Merging ${chunks.length} partial summaries...`);
    const mergeContent = chunkSummaries
      .map((s, i) => `--- Part ${i + 1} of ${chunks.length} ---\n${s}`)
      .join("\n\n");
    summary = await summarize(mergeContent, {
      title: site.title,
      url: rootUrl,
      type: "site-merge",
    });
  }

  console.error(`  Summary: ${summary.length} chars`);

  const slug = generateSlug(site.title);
  const meta = { title: site.title, url: rootUrl, type: "site" as const, words: site.totalWords };

  await saveArticle(slug, content, meta);
  await saveSummary(slug, summary, meta);

  const html = generateHTML({
    title: site.title,
    url: rootUrl,
    type: "site",
    date: new Date().toISOString().slice(0, 10),
    words: site.totalWords,
    pages: site.pages.length,
    summary,
  });
  const htmlPath = await saveHTML(slug, html);

  console.error(`  Saved as: ${slug}`);
  return { slug, title: site.title, summary, htmlPath };
}

/** Split pages into chunks where each chunk's total words < maxWords. */
function chunkPages(pages: SitePage[], maxWords: number): SitePage[][] {
  const chunks: SitePage[][] = [];
  let current: SitePage[] = [];
  let currentWords = 0;

  for (const page of pages) {
    if (currentWords + page.words > maxWords && current.length > 0) {
      chunks.push(current);
      current = [];
      currentWords = 0;
    }
    current.push(page);
    currentWords += page.words;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export async function runDiscuss(slug?: string, url?: string, forceNew?: boolean): Promise<void> {
  let target = slug;
  if (!target && url) {
    // Resolve file:// summary URLs back to original source
    const sourceUrl = await resolveSourceUrl(url);
    target = await findByUrl(sourceUrl || url) || undefined;
    if (!target) throw new Error("This page hasn't been summarized yet");
  }
  if (!target) {
    target = await getLatestSlug() || undefined;
  }
  if (!target) throw new Error("No summaries yet");
  await openDiscussion(target, forceNew);
}
