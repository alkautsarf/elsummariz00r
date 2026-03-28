import { chat, getConversation, clearConversation, type StreamCallback } from "./conversation";
import { COMPANION_PORT } from "./tools";
import { listTabs } from "../cdp";
import { isYouTube, extractVideoId, fetchCaptions } from "../youtube";

// Inline the chat HTML at build time
const CHAT_HTML = await Bun.file(
  new URL("chat.html", import.meta.url).pathname,
).text();

interface WSData {
  tabId: string;
  tabUrl: string;
}

export function startServer() {
  // Kill any existing server on this port
  try {
    const old = Bun.spawnSync(["lsof", "-ti", `tcp:${COMPANION_PORT}`]);
    const pids = old.stdout.toString().trim();
    if (pids) {
      for (const pid of pids.split("\n")) {
        const p = parseInt(pid);
        if (p && p !== process.pid) {
          try { process.kill(p, "SIGTERM"); } catch {}
        }
      }
      // Brief wait for port to free
      Bun.sleepSync(500);
    }
  } catch {}

  const server = Bun.serve<WSData>({
    port: COMPANION_PORT,
    hostname: "127.0.0.1",

    async fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket upgrade
      if (url.pathname === "/ws") {
        const tabId = url.searchParams.get("tabId") || "";
        const tabUrl = url.searchParams.get("url") || "";
        const ok = server.upgrade(req, { data: { tabId, tabUrl } });
        return ok ? undefined : new Response("WS upgrade failed", { status: 400 });
      }

      // Health check
      if (url.pathname === "/health") {
        return Response.json({ status: "ok", port: COMPANION_PORT });
      }

      // Chat UI
      if (url.pathname === "/" || url.pathname === "/chat") {
        return new Response(CHAT_HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // Tab list (for the chat UI to resolve current page URL)
      if (url.pathname === "/tabs") {
        try {
          const tabs = await listTabs();
          // Filter out companion panel views
          const real = tabs.filter(t =>
            !t.url.includes(`localhost:${COMPANION_PORT}`) &&
            !t.url.includes(`127.0.0.1:${COMPANION_PORT}`)
          );
          return Response.json(real);
        } catch {
          return Response.json([], { status: 502 });
        }
      }

      // YouTube transcript extraction
      if (url.pathname === "/youtube-transcript") {
        const videoUrl = url.searchParams.get("url") || "";
        if (!isYouTube(videoUrl)) {
          return Response.json({ error: "Not a YouTube URL" }, { status: 400 });
        }
        const videoId = extractVideoId(videoUrl);
        if (!videoId) {
          return Response.json({ error: "Could not parse video ID" }, { status: 400 });
        }
        try {
          const result = await fetchCaptions(videoId);
          return Response.json({
            title: result.title,
            transcript: result.transcript,
            segments: result.segments,
            words: result.words,
          });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      }

      // Conversation history for a tab
      if (url.pathname === "/history") {
        const tabId = url.searchParams.get("tabId") || "";
        const tabUrl = url.searchParams.get("url") || "";
        const conv = getConversation(tabId);
        return Response.json(conv?.messages || []);
      }

      return new Response("Not found", { status: 404 });
    },

    websocket: {
      open(ws) {
        const { tabId } = ws.data;
        console.error(`[companion] WS open: tab=${tabId}`);
      },

      async message(ws, raw) {
        const { tabId, tabUrl } = ws.data;
        let msg: { type: string; content?: string };

        try {
          msg = JSON.parse(String(raw));
        } catch {
          ws.send(JSON.stringify({ type: "error", content: "Invalid JSON" }));
          return;
        }

        if (msg.type === "chat" && msg.content) {
          // Use fresh URL from message if provided, fallback to WS connect URL
          const currentUrl = (msg as any).url || tabUrl;
          const onStream: StreamCallback = (event) => {
            try {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify(event));
              }
            } catch {}
          };

          await chat(tabId, currentUrl, msg.content, onStream);
        }

        if (msg.type === "clear") {
          clearConversation(tabId);
          ws.send(JSON.stringify({ type: "cleared" }));
        }
      },

      close(ws) {
        console.error(`[companion] WS close: tab=${ws.data.tabId}`);
      },
    },
  });

  console.error(`[companion] Server running on http://127.0.0.1:${COMPANION_PORT}`);
  return server;
}
