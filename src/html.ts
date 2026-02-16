// Simple markdown → HTML (handles: headings, bold, italic, lists, code, links, paragraphs)
function md(text: string): string {
  return text
    .split("\n\n")
    .map((block) => {
      block = block.trim();
      if (!block) return "";

      // Headings
      if (block.startsWith("### "))
        return `<h3>${inline(block.slice(4))}</h3>`;
      if (block.startsWith("## "))
        return `<h2>${inline(block.slice(3))}</h2>`;
      if (block.startsWith("# ")) return `<h1>${inline(block.slice(2))}</h1>`;

      // Bullet lists
      if (/^[-*] /.test(block)) {
        const items = block.split(/\n(?=[-*] )/).map((line) => {
          return `<li>${inline(line.replace(/^[-*] /, ""))}</li>`;
        });
        return `<ul>${items.join("")}</ul>`;
      }

      // Code blocks
      if (block.startsWith("```")) {
        const code = block.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
        return `<pre><code>${esc(code)}</code></pre>`;
      }

      // Blockquotes
      if (block.startsWith("> ")) {
        const content = block
          .split("\n")
          .map((l) => l.replace(/^>\s?/, ""))
          .join("\n");
        return `<blockquote>${inline(content)}</blockquote>`;
      }

      return `<p>${inline(block)}</p>`;
    })
    .filter(Boolean)
    .join("\n");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(s: string): string {
  // Escape HTML first to prevent XSS, then apply markdown transformations
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_, text, url) => {
        // Only allow http(s) links
        if (/^https?:\/\//i.test(url)) {
          return `<a href="${url}" target="_blank">${text}</a>`;
        }
        return `${text} (${url})`;
      },
    )
    .replace(/\n/g, "<br>");
}

export function generateHTML(meta: {
  title: string;
  url: string;
  type: "web" | "youtube";
  date: string;
  words: number;
  summary: string;
}): string {
  const summaryHTML = md(meta.summary);
  const typeLabel = meta.type === "youtube" ? "Video" : "Article";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)} - elsummariz00r</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --bg: #1a1b26;
    --text: #c0c8d8;
    --heading: #e0e4ee;
    --h2: #9ece6a;
    --h3: #7aa2f7;
    --link: #7aa2f7;
    --meta: #565f89;
    --em: #bb9af7;
    --code-bg: #24283b;
    --quote: #73daca;
    --border: #292e42;
    --badge-yt-bg: #f7768e22;
    --badge-yt: #f7768e;
    --badge-web-bg: #7aa2f722;
    --badge-web: #7aa2f7;
    --toggle-bg: #24283b;
  }

  :root.light {
    --bg: #fafafa;
    --text: #333;
    --heading: #111;
    --h2: #2e7d32;
    --h3: #1565c0;
    --link: #1565c0;
    --meta: #777;
    --em: #7b1fa2;
    --code-bg: #e8e8e8;
    --quote: #00695c;
    --border: #ddd;
    --badge-yt-bg: #ef535018;
    --badge-yt: #c62828;
    --badge-web-bg: #1565c018;
    --badge-web: #1565c0;
    --toggle-bg: #e0e0e0;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: "Ioskeley Mono", "JetBrains Mono", "Fira Code", monospace;
    font-size: 17px;
    line-height: 1.7;
    padding: 3rem 2rem;
    max-width: 52rem;
    margin: 0 auto;
    transition: background 0.3s, color 0.3s;
  }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  h1 { color: var(--heading); font-size: 1.5rem; margin-bottom: 0.5rem; line-height: 1.3; }
  h2 { color: var(--h2); font-size: 1.15rem; margin: 1.5rem 0 0.5rem; }
  h3 { color: var(--h3); font-size: 1rem; margin: 1.2rem 0 0.4rem; }
  .meta { color: var(--meta); font-size: 0.85rem; margin-bottom: 2rem; }
  .meta span { margin-right: 1.5rem; }
  .type-badge {
    background: var(--badge-${meta.type === "youtube" ? "yt" : "web"}-bg);
    color: var(--badge-${meta.type === "youtube" ? "yt" : "web"});
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .summary { margin-top: 1rem; }
  .summary p { margin-bottom: 1rem; }
  .summary ul { margin: 0.5rem 0 1rem 1.5rem; }
  .summary li { margin-bottom: 0.4rem; }
  .summary strong { color: var(--heading); }
  .summary em { color: var(--em); }
  .summary code {
    background: var(--code-bg);
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    font-size: 0.9em;
  }
  .summary pre {
    background: var(--code-bg);
    padding: 1rem;
    border-radius: 5px;
    overflow-x: auto;
    margin: 1rem 0;
  }
  .summary blockquote {
    border-left: 3px solid var(--meta);
    padding-left: 1rem;
    color: var(--quote);
    margin: 1rem 0;
  }
  hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; }
  .footer { color: var(--meta); font-size: 0.8rem; margin-top: 3rem; }
  .toggle {
    background: var(--toggle-bg);
    border: none;
    color: var(--text);
    font-family: inherit;
    font-size: 0.85rem;
    padding: 0.3rem 0.7rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.3s, color 0.3s;
  }
  .toggle:hover { opacity: 0.8; }
</style>
</head>
<body>
  <div class="header">
    <h1>${esc(meta.title)}</h1>
    <button class="toggle" onclick="toggleTheme()" id="themeBtn">light</button>
  </div>
  <div class="meta">
    <span class="type-badge">${typeLabel}</span>
    <span>${meta.date}</span>
    <span>~${meta.words.toLocaleString()} words</span>
    <span><a href="${esc(meta.url)}">source</a></span>
  </div>
  <hr>
  <div class="summary">
    ${summaryHTML}
  </div>
  <hr>
  <div class="footer">elsummariz00r</div>
  <script>
    function toggleTheme() {
      const root = document.documentElement;
      const isLight = root.classList.toggle('light');
      localStorage.setItem('els-theme', isLight ? 'light' : 'dark');
      document.getElementById('themeBtn').textContent = isLight ? 'dark' : 'light';
    }
    // Restore saved preference
    if (localStorage.getItem('els-theme') === 'light') {
      document.documentElement.classList.add('light');
      document.getElementById('themeBtn').textContent = 'dark';
    }
  </script>
</body>
</html>`;
}
