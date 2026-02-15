import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateHTML } from "../src/html";

const HOME = join(process.env.HOME || "", ".elsummariz00r");
const files = await readdir(join(HOME, "summaries"));

for (const file of files.filter((f) => f.endsWith(".md"))) {
  const slug = file.replace(".md", "");
  const text = await readFile(join(HOME, "summaries", file), "utf-8");

  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) {
    console.log("skip:", slug);
    continue;
  }

  const titleMatch = fm[1].match(/^title:\s*"(.+)"$/m);
  const urlMatch = fm[1].match(/^url:\s*(.+)$/m);
  const dateMatch = fm[1].match(/^date:\s*(.+)$/m);
  const typeMatch = fm[1].match(/^type:\s*(.+)$/m);
  const wordsMatch = fm[1].match(/^words:\s*(\d+)$/m);

  const body = text.replace(/^---[\s\S]*?---\n*/, "").trim();

  const html = generateHTML({
    title: titleMatch?.[1] || slug,
    url: urlMatch?.[1]?.trim() || "",
    type: (typeMatch?.[1]?.trim() || "web") as "web" | "youtube",
    date: dateMatch?.[1]?.trim().slice(0, 10) || new Date().toISOString().slice(0, 10),
    words: parseInt(wordsMatch?.[1] || "0"),
    summary: body,
  });

  await Bun.write(join(HOME, "html", slug + ".html"), html);
  console.log("regenerated:", slug);
}
