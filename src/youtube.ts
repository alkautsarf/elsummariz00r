const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

export interface CaptionResult {
  title: string;
  transcript: string;
  segments: number;
  words: number;
}

export function isYouTube(url: string): boolean {
  return /youtube\.com\/watch|youtu\.be\//.test(url);
}

export function extractVideoId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return match?.[1] ?? null;
}

interface CaptionTrack {
  languageCode: string;
  kind?: string;
  baseUrl: string;
}

function selectBestTrack(tracks: CaptionTrack[]): CaptionTrack {
  // Prefer: manual EN > manual any > auto EN > auto any
  const sorted = [...tracks].sort((a, b) => {
    const aAuto = a.kind === "asr" ? 1 : 0;
    const bAuto = b.kind === "asr" ? 1 : 0;
    if (aAuto !== bAuto) return aAuto - bAuto;

    const aEn =
      a.languageCode === "en" || a.languageCode.startsWith("en-") ? 0 : 1;
    const bEn =
      b.languageCode === "en" || b.languageCode.startsWith("en-") ? 0 : 1;
    return aEn - bEn;
  });
  return sorted[0];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}

function parseJson3(body: string): string[] {
  const result = JSON.parse(body);
  const events: any[] = result.events || [];
  const lines: string[] = [];
  for (const event of events) {
    const segs: any[] = event.segs || [];
    const text = segs
      .map((s: any) => s.utf8 || "")
      .join("")
      .trim();
    if (text) lines.push(text);
  }
  return lines;
}

function parseXml(body: string): string[] {
  const lines: string[] = [];
  const regex = /<text[^>]*>([\s\S]*?)<\/text>/gi;
  let match;
  while ((match = regex.exec(body)) !== null) {
    const decoded = decodeEntities(match[1])
      .replace(/\s+/g, " ")
      .trim();
    if (decoded) lines.push(decoded);
  }
  return lines;
}

export async function fetchCaptions(
  videoId: string,
): Promise<CaptionResult> {
  // Step 1: Get INNERTUBE_API_KEY from page
  const pageResp = await fetch(
    `https://www.youtube.com/watch?v=${videoId}`,
    { headers: { "User-Agent": UA, Accept: "text/html" } },
  );
  const html = await pageResp.text();

  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title =
    titleMatch?.[1]?.replace(" - YouTube", "").trim() || "Untitled Video";

  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  if (!apiKeyMatch) throw new Error("Could not find YouTube API key");

  // Step 2: ANDROID innertube /player
  const playerResp = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${apiKeyMatch[1]}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        Accept: "application/json",
      },
      body: JSON.stringify({
        context: {
          client: { clientName: "ANDROID", clientVersion: "20.10.38" },
        },
        videoId,
      }),
    },
  );

  const data: any = await playerResp.json();
  if (data?.playabilityStatus?.status !== "OK") {
    throw new Error(
      `Video not playable: ${data?.playabilityStatus?.status || "unknown"}`,
    );
  }

  const captionTracks: CaptionTrack[] =
    data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!captionTracks?.length) {
    throw new Error("No captions available for this video");
  }

  // Step 3: Fetch best caption track
  const track = selectBestTrack(captionTracks);
  const capUrl = new URL(track.baseUrl);
  capUrl.searchParams.set("fmt", "json3");

  const capResp = await fetch(capUrl.toString(), {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  const capBody = await capResp.text();

  let lines: string[] = [];

  if (capBody) {
    try {
      lines = parseJson3(capBody);
    } catch {
      lines = parseXml(capBody);
    }
  }

  // Fallback: plain XML
  if (lines.length === 0) {
    const xmlResp = await fetch(track.baseUrl, {
      headers: { "User-Agent": UA },
    });
    const xmlBody = await xmlResp.text();
    if (xmlBody) lines = parseXml(xmlBody);
  }

  if (lines.length === 0) {
    throw new Error("Caption tracks found but content was empty");
  }

  const transcript = lines.join("\n");
  return {
    title,
    transcript,
    segments: lines.length,
    words: transcript.split(/\s+/).length,
  };
}
