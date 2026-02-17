const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

export interface SitePage {
  url: string;
  title: string;
  content: string;
  words: number;
}

export interface SiteResult {
  rootUrl: string;
  title: string;
  pages: SitePage[];
  totalWords: number;
}

/** Extract root URL from any page on the site. */
export function getRootUrl(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

/** Strip HTML tags and clean whitespace from raw HTML. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract page title from HTML. */
function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();
  return "Untitled";
}

/** Try to fetch sitemap.xml and parse page URLs. */
async function fetchSitemap(rootUrl: string): Promise<string[] | null> {
  try {
    const resp = await fetch(`${rootUrl}/sitemap.xml`, {
      headers: { "User-Agent": UA },
    });
    if (!resp.ok) return null;
    const xml = await resp.text();
    if (!xml.includes("<urlset")) return null;

    const urls: string[] = [];
    const regex = /<loc>([^<]+)<\/loc>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      urls.push(match[1].trim());
    }
    return urls.length > 0 ? urls : null;
  } catch {
    return null;
  }
}

/** Crawl internal links from the root page as sitemap fallback. */
async function crawlLinks(rootUrl: string): Promise<string[]> {
  const resp = await fetch(rootUrl, {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  const html = await resp.text();

  const urls = new Set<string>();
  urls.add(rootUrl);

  const regex = /href=["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    // Resolve relative URLs
    try {
      const resolved = new URL(match[1], rootUrl).toString();
      // Only same-origin links
      if (resolved.startsWith(rootUrl) && !resolved.includes("#")) {
        // Strip trailing slash for consistency
        const clean = resolved.endsWith("/")
          ? resolved.slice(0, -1)
          : resolved;
        urls.add(clean || rootUrl);
      }
    } catch {
      // Skip invalid URLs
    }
  }
  return [...urls];
}

/** Fetch a single page and extract its text content. */
async function fetchPage(url: string): Promise<SitePage> {
  const resp = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  const html = await resp.text();
  const title = extractTitle(html);
  const content = htmlToText(html);
  return {
    url,
    title,
    content,
    words: content.split(/\s+/).length,
  };
}

/** Find text that appears in most pages (nav/sidebar) and remove it. */
function stripCommonText(pages: SitePage[]): SitePage[] {
  if (pages.length < 3) return pages;

  // Split each page into lines/phrases for comparison
  // Use 8-word sliding window to find repeated chunks
  const WINDOW = 8;
  const chunkCounts = new Map<string, number>();

  for (const page of pages) {
    const words = page.content.split(/\s+/);
    const seen = new Set<string>();
    for (let i = 0; i <= words.length - WINDOW; i++) {
      const chunk = words.slice(i, i + WINDOW).join(" ");
      if (!seen.has(chunk)) {
        seen.add(chunk);
        chunkCounts.set(chunk, (chunkCounts.get(chunk) || 0) + 1);
      }
    }
  }

  // Chunks that appear in 80%+ of pages are likely nav/sidebar
  const threshold = Math.floor(pages.length * 0.8);
  const commonChunks = new Set<string>();
  for (const [chunk, count] of chunkCounts) {
    if (count >= threshold) commonChunks.add(chunk);
  }

  if (commonChunks.size === 0) return pages;

  // Remove all occurrences of common chunks from each page
  return pages.map((page) => {
    let content = page.content;
    for (const chunk of commonChunks) {
      content = content.replaceAll(chunk, "");
    }
    content = content.replace(/\s+/g, " ").trim();
    return {
      ...page,
      content,
      words: content.split(/\s+/).length,
    };
  });
}

/** Fetch all pages from a site and return structured content. */
export async function fetchSite(url: string): Promise<SiteResult> {
  const rootUrl = getRootUrl(url);

  console.error(`  Discovering pages...`);

  // Try sitemap first, fallback to link crawling
  let pageUrls = await fetchSitemap(rootUrl);
  if (pageUrls) {
    console.error(`  Found ${pageUrls.length} pages via sitemap.xml`);
  } else {
    console.error(`  No sitemap found, crawling links...`);
    pageUrls = await crawlLinks(rootUrl);
    console.error(`  Found ${pageUrls.length} pages via link crawl`);
  }

  if (pageUrls.length === 0) {
    throw new Error("No pages found on site");
  }

  // Fetch all pages in parallel
  console.error(`  Fetching ${pageUrls.length} pages...`);
  const pages = await Promise.all(pageUrls.map(fetchPage));

  // Strip duplicated nav/sidebar text
  const cleaned = stripCommonText(pages);

  // Filter out pages with very little unique content
  const meaningful = cleaned.filter((p) => p.words > 20);

  // Get site title from root page
  const rootPage = pages.find((p) => p.url === rootUrl || p.url === rootUrl + "/");
  const title = rootPage?.title || new URL(rootUrl).hostname;

  const totalWords = meaningful.reduce((sum, p) => sum + p.words, 0);
  console.error(`  Got ${meaningful.length} pages, ~${totalWords} words`);

  return {
    rootUrl,
    title,
    pages: meaningful,
    totalWords,
  };
}
