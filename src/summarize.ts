import { query } from "@anthropic-ai/claude-agent-sdk";

const TIMEOUT_MS = 120_000;
const DEFAULT_MODEL = "claude-opus-4-6";

export function getModel(): string {
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

export async function summarize(
  content: string,
  meta: { title: string; url: string; type: "web" | "youtube" },
): Promise<string> {
  const systemPrompt =
    meta.type === "youtube" ? YOUTUBE_SYSTEM_PROMPT : WEB_SYSTEM_PROMPT;

  const prompt = `${meta.type === "youtube" ? "Video" : "Article"}: "${meta.title}"
Source: ${meta.url}

${meta.type === "youtube" ? "Transcript" : "Content"}:
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

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`Summarization timed out after ${TIMEOUT_MS}ms`)),
      TIMEOUT_MS,
    );
  });

  return Promise.race([sdkCall(), timeoutPromise]);
}
