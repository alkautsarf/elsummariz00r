import { HOME } from "./storage";

/** Load .env from ~/.elsummariz00r/.env into process.env (won't override existing vars). */
export async function loadEnv(): Promise<void> {
  const envPath = `${HOME}/.env`;
  try {
    const envFile = Bun.file(envPath);
    if (await envFile.exists()) {
      const text = await envFile.text();
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq > 0) {
          const key = trimmed.slice(0, eq);
          const value = trimmed.slice(eq + 1);
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  } catch {
    // .env not found, rely on shell environment
  }
}

/** Return process.env without CLAUDECODE (avoids nested session detection). */
export function cleanEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.CLAUDECODE;
  return env;
}

/** Get the configured model (ELS_MODEL env or default). */
export function getModel(): string {
  return process.env.ELS_MODEL || "claude-opus-4-6";
}
