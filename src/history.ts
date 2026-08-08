import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { historyFile } from "./config.js";

export type MessageStatus = "sent" | "delivered" | "read" | "failed";

export interface HistoryEntry {
  timestamp: string;
  jid: string;
  status: MessageStatus;
  messageId?: string;
  error?: string;
}

function ensureFile(): void {
  mkdirSync(path.dirname(historyFile()), { recursive: true });
}

export function appendHistory(entry: Omit<HistoryEntry, "timestamp">, timestamp?: string): void {
  ensureFile();
  const fullEntry: HistoryEntry = {
    timestamp: timestamp ?? new Date().toISOString(),
    ...entry,
  };
  appendFileSync(historyFile(), `${JSON.stringify(fullEntry)}\n`, "utf8");
}

export function readHistory(limit = 100): HistoryEntry[] {
  if (!existsSync(historyFile())) {
    return [];
  }
  const content = readFileSync(historyFile(), "utf8");
  const entries = content
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as HistoryEntry);
  return entries.slice(-limit);
}

export function truncateHistory(days: number): void {
  if (!existsSync(historyFile())) {
    return;
  }
  const cutoff = Date.now() - days * 86_400_000;
  const kept = readHistory(Number.MAX_SAFE_INTEGER).filter((entry) => {
    return new Date(entry.timestamp).getTime() >= cutoff;
  });
  ensureFile();
  const content = kept.map((entry) => JSON.stringify(entry)).join("\n");
  writeFileSync(historyFile(), content.length > 0 ? `${content}\n` : "", "utf8");
}
