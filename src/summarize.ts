import { query } from "@anthropic-ai/claude-agent-sdk";

const TIMEOUT_MS = 120_000;
const DEFAULT_MODEL = "claude-opus-4-6";

function getModel(): string {
  return process.env.ELS_MODEL || DEFAULT_MODEL;
}

export function getModelLabel(): string {
  const model = getModel();
  // Pretty labels for known models
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model;
}

const WEB_SYSTEM_PROMPT = `You are a concise summarization assistant. Summarize the given web article clearly and thoroughly.

Output format:
- Start with a 1-2 sentence TL;DR
- Then 3-7 key points as bullet points
- End with a "Notable quotes" section if there are striking quotes (max 3)

Guidelines:
- Be concise but don't omit important nuance
- Preserve the author's key arguments and conclusions
- Write like a human. No em-dashes, no AI jargon like "delve", "leverage", "robust"
- Use simple, direct language
- Output plain markdown`;

const YOUTUBE_SYSTEM_PROMPT = `You are a concise summarization assistant. Summarize the given YouTube video transcript clearly and thoroughly.

Output format:
- Start with a 1-2 sentence TL;DR of what this video is about
- Then 3-7 key points as bullet points covering the main topics discussed
- End with a "Notable moments" section for any particularly interesting quotes or exchanges (max 3)

Guidelines:
- Transcripts are messy (auto-generated captions). Parse through the noise to find the real content.
- If it's an interview/conversation, note who said what when relevant
- Be concise but don't omit important nuance
- Write like a human. No em-dashes, no AI jargon
- Use simple, direct language
- Output plain markdown`;

const SITE_SYSTEM_PROMPT = `You are a concise summarization assistant. Summarize the given documentation site (multiple pages) clearly and thoroughly.

Output format:
- Start with a 2-3 sentence TL;DR of what this site covers overall
- Then for each page/section, write:
  ## <Page Title>
  - 2-4 bullet points covering that page's key content
- End with a "## Key Takeaways" section: 3-5 bullets that cut across all pages

Guidelines:
- Output the summary immediately. No preamble, no "I'll do X", no thinking out loud.
- Focus on what a reader needs to know to understand this documentation
- Skip pages with no meaningful content (e.g. landing pages, brand guidelines)
- Write like a human. No em-dashes, no AI jargon like "delve", "leverage", "robust"
- Use simple, direct language
- Output plain markdown`;

const SITE_MERGE_PROMPT = `You are a concise summarization assistant. You are given partial summaries of different sections of a large documentation site. Merge them into a single coherent summary.

Output format:
- Start with a 2-3 sentence TL;DR of what this site covers overall
- Then organize the key sections logically (group related topics, remove redundancy)
  ## <Section Title>
  - 2-4 bullet points covering key content
- End with a "## Key Takeaways" section: 3-5 bullets that cut across all sections

Guidelines:
- Output the summary immediately. No preamble, no "I'll do X", no thinking out loud.
- Merge and deduplicate — don't just concatenate the partial summaries
- Group related sections together under logical headings
- Focus on what a reader needs to know to understand this documentation
- Write like a human. No em-dashes, no AI jargon like "delve", "leverage", "robust"
- Use simple, direct language
- Output plain markdown`;

export async function summarize(
  content: string,
  meta: { title: string; url: string; type: "web" | "youtube" | "site" | "site-merge" },
): Promise<string> {
  let systemPrompt: string;
  let typeLabel: string;
  let contentLabel: string;

  switch (meta.type) {
    case "youtube":
      systemPrompt = YOUTUBE_SYSTEM_PROMPT;
      typeLabel = "Video";
      contentLabel = "Transcript";
      break;
    case "site":
      systemPrompt = SITE_SYSTEM_PROMPT;
      typeLabel = "Site";
      contentLabel = "Pages";
      break;
    case "site-merge":
      systemPrompt = SITE_MERGE_PROMPT;
      typeLabel = "Site";
      contentLabel = "Pages";
      break;
    default:
      systemPrompt = WEB_SYSTEM_PROMPT;
      typeLabel = "Article";
      contentLabel = "Content";
  }

  const prompt = `${typeLabel}: "${meta.title}"
Source: ${meta.url}

${contentLabel}:
${content}`;

  // Build env without CLAUDECODE to avoid nested session detection
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.CLAUDECODE;

  const sdkCall = async (): Promise<string> => {
    for await (const message of query({
      prompt,
      options: {
        systemPrompt,
        allowedTools: [],
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        model: getModel(),
        env,
      },
    })) {
      if (message.type === "result") {
        if (message.subtype === "success") {
          return message.result;
        }
        const errors =
          "errors" in message
            ? (message.errors as string[])
            : ["Unknown SDK error"];
        throw new Error(`Claude SDK error: ${errors.join(", ")}`);
      }
    }
    throw new Error("Claude SDK returned no result");
  };

  let timer: Timer;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Summarization timed out after ${TIMEOUT_MS}ms`)),
      TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([sdkCall(), timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}
