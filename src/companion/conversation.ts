import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { SYSTEM_PROMPT } from "./tools";
import { HOME } from "../storage";
import { getModel, cleanEnv } from "../env";

// No maxTurns limit — let the agent run as long as needed
// No timeout — let the agent run as long as needed

function log(tag: string, ...args: any[]) {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[${ts}] [companion:${tag}]`, ...args);
}

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

export interface TabConversation {
  tabId: string;
  url: string;
  messages: ChatMessage[];
  active: boolean;
  sessionId: string | null; // Claude Agent SDK session ID for resumption
}

const conversations = new Map<string, TabConversation>();

export function getConversation(tabId: string): TabConversation | undefined {
  return conversations.get(tabId);
}

export function clearConversation(tabId: string): void {
  conversations.delete(tabId);
}

/** Pin the target tab in the CDP proxy before running agent-browser commands. */
async function pinTab(tabId: string, tabUrl: string): Promise<void> {
  try {
    if (tabUrl && tabUrl !== "undefined") {
      const u = new URL(tabUrl);
      const match = u.hostname + u.pathname;
      await fetch(`http://localhost:9222/target?url=${encodeURIComponent(match)}`);
    } else if (tabId) {
      await fetch(`http://localhost:9222/target?id=${tabId}`);
    }
  } catch {}
}

async function clearPin(): Promise<void> {
  try {
    await fetch("http://localhost:9222/target?clear");
  } catch {}
}

export type StreamCallback = (event: {
  type: "text" | "tool_use" | "tool_result" | "done" | "error";
  content: string;
  toolName?: string;
}) => void;

/**
 * Send a user message in a tab conversation and stream Claude's response.
 * Uses session resumption so Claude has full context from previous messages.
 */
export async function chat(
  tabId: string,
  tabUrl: string,
  userMessage: string,
  onStream: StreamCallback,
): Promise<void> {
  let conv = conversations.get(tabId);
  if (!conv) {
    conv = { tabId, url: tabUrl, messages: [], active: false, sessionId: null };
    conversations.set(tabId, conv);
  }

  if (conv.active) {
    onStream({ type: "error", content: "Already processing a message" });
    return;
  }

  conv.active = true;
  conv.url = tabUrl;
  conv.messages.push({ role: "user", content: userMessage });

  log("chat", `tab=${tabId.slice(0, 12)} url=${tabUrl.slice(0, 50)} msg="${userMessage.slice(0, 60)}" session=${conv.sessionId?.slice(0, 8) || "new"}`);

  await pinTab(tabId, tabUrl);

  const abortController = new AbortController();

  // Build options — resume if we have a session, otherwise start fresh
  const isResume = !!conv.sessionId;
  const options: any = {
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    model: getModel(),
    env: cleanEnv(),
    cwd: HOME,
    abortController,
    includePartialMessages: true,
    thinking: { type: "adaptive" },
  };

  if (isResume) {
    // Resume the existing session — Claude has full conversation history
    options.resume = conv.sessionId;
    log("chat", `resuming session ${conv.sessionId!.slice(0, 8)}`);
  } else {
    // New session — set system prompt and tools
    options.systemPrompt = SYSTEM_PROMPT;
    options.tools = ["Bash", "Read", "Write", "Grep", "Glob"];
    options.allowedTools = ["Bash", "Read", "Write", "Grep", "Glob"];
    options.persistSession = true;
  }

  try {
    let assistantText = "";
    const streaming = { text: "" };

    for await (const message of query({ prompt: userMessage, options })) {
      // Capture session ID from init message
      if (message.type === "system" && (message as any).subtype === "init") {
        const sid = (message as any).session_id;
        if (sid) {
          conv.sessionId = sid;
          log("chat", `session ID: ${sid.slice(0, 8)}`);
        }
      }

      handleMessage(message, onStream, streaming, (text) => {
        assistantText = text;
      });
    }

    log("chat", `done — ${assistantText.length} chars response`);
    conv.messages.push({ role: "assistant", content: assistantText });
    onStream({ type: "done", content: "" });
  } catch (err: any) {
    const msg = err.name === "AbortError" ? "Timed out" : err.message;
    log("chat", `error: ${msg}`);
    onStream({ type: "error", content: msg });
  } finally {
    conv.active = false;
    await clearPin();
    log("chat", "cleared pin, turn complete");
  }
}

function handleMessage(
  message: SDKMessage,
  onStream: StreamCallback,
  streaming: { text: string },
  setAssistantText: (text: string) => void,
): void {
  switch (message.type) {
    case "stream_event": {
      const event = (message as any).event;
      if (!event) break;

      if (event.type === "content_block_start") {
        if (event.content_block?.type === "text") {
          streaming.text = event.content_block.text || "";
          if (streaming.text) {
            onStream({ type: "text", content: streaming.text });
          }
        }
      }

      if (event.type === "content_block_delta") {
        if (event.delta?.type === "text_delta" && event.delta.text) {
          streaming.text += event.delta.text;
          onStream({ type: "text", content: streaming.text });
        }
      }
      break;
    }

    case "assistant": {
      const textBlocks = message.message.content.filter(
        (b: any) => b.type === "text",
      );
      const fullText = textBlocks.map((b: any) => b.text).join("\n");
      if (fullText) {
        setAssistantText(fullText);
        onStream({ type: "text", content: fullText });
        streaming.text = "";
      }

      const toolBlocks = message.message.content.filter(
        (b: any) => b.type === "tool_use",
      );
      for (const tool of toolBlocks) {
        const input =
          typeof tool.input === "string"
            ? tool.input
            : JSON.stringify(tool.input);
        log("sdk", `tool_use: ${tool.name} — ${input.slice(0, 150)}`);
        onStream({
          type: "tool_use",
          content: input.substring(0, 200),
          toolName: tool.name,
        });
      }
      break;
    }

    case "result": {
      log("sdk", `result: ${message.subtype}`);
      streaming.text = "";
      if (message.subtype === "error_during_execution") {
        const errors =
          "errors" in message
            ? (message.errors as string[])
            : ["Unknown error"];
        onStream({ type: "error", content: errors.join(", ") });
      } else if (message.subtype === "error_max_turns") {
        onStream({ type: "error", content: "Reached max turns" });
      }
      break;
    }
  }
}
