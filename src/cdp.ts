const CDP_PORT = 2262;
const EVAL_TIMEOUT = 10_000;

export interface Tab {
  id: string;
  title: string;
  url: string;
}

export async function listTabs(): Promise<Tab[]> {
  const resp = await fetch(`http://localhost:${CDP_PORT}/json/list`);
  const raw: any[] = await resp.json();
  return raw
    .filter((t) => t.type === "page")
    .map((t) => ({ id: t.id, title: t.title, url: t.url }));
}

export async function getActiveTab(): Promise<Tab> {
  const tabs = await listTabs();
  if (tabs.length === 0) throw new Error("No browser tabs found");
  return tabs[0];
}

export function findTabByUrl(tabs: Tab[], url: string): Tab | undefined {
  return tabs.find((t) => t.url === url || t.url.startsWith(url));
}

function cdpEval(tabId: string, expression: string): Promise<string> {
  const ws = new WebSocket(
    `ws://localhost:${CDP_PORT}/devtools/page/${tabId}`,
  );

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("CDP eval timed out"));
    }, EVAL_TIMEOUT);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true },
        }),
      );
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string);
      if (data.id === 1) {
        clearTimeout(timeout);
        ws.close();
        const value = data.result?.result?.value;
        if (value !== undefined) {
          resolve(String(value));
        } else {
          reject(
            new Error(
              `CDP eval failed: ${JSON.stringify(data.result?.result)}`,
            ),
          );
        }
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
  });
}

export async function extractText(tabId: string): Promise<string> {
  return cdpEval(tabId, "document.body.innerText");
}

const QB_BIN = process.env.QUTEBROWSER_BIN || `${process.env.HOME}/Library/Python/3.14/bin/qutebrowser`;

/** Open a URL in qutebrowser and wait for it to load. Returns the tab. */
export async function openUrl(url: string): Promise<Tab> {
  const before = new Set((await listTabs()).map((t) => t.id));

  // Open in existing qutebrowser instance via IPC
  const proc = Bun.spawn([QB_BIN, "--target", "tab-bg-silent", url], {
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.exited;

  // Poll until the new tab appears and loads
  const maxWait = 20_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 1000));
    const current = await listTabs();
    const newTab = current.find(
      (t) => !before.has(t.id) && t.url !== "about:blank" && t.url !== "",
    );
    if (newTab) {
      // Extra wait for content to render
      await new Promise((r) => setTimeout(r, 1500));
      return newTab;
    }
  }

  throw new Error(`Timed out waiting for page to load: ${url}`);
}

