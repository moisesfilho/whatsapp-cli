import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendHistory, readHistory, truncateHistory } from "../src/history.js";

const TMP_DIR = path.join(tmpdir(), "whatsapp-cli-history-test");

describe("history", () => {
  beforeEach(() => {
    process.env.WHATSAPP_CLI_CONFIG_DIR = TMP_DIR;
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    delete process.env.WHATSAPP_CLI_CONFIG_DIR;
  });

  it("appends and reads entries", () => {
    appendHistory({ jid: "5511000000001", status: "sent", messageId: "abc" });
    appendHistory({ jid: "5511000000002", status: "failed", error: "boom" });
    const entries = readHistory(10);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.jid).toBe("5511000000001");
    expect(entries[0]?.status).toBe("sent");
    expect(entries[0]?.messageId).toBe("abc");
    expect(entries[0]?.timestamp).toBeTruthy();
    expect(entries[1]?.status).toBe("failed");
    expect(entries[1]?.error).toBe("boom");
  });

  it("returns empty when file does not exist", () => {
    expect(readHistory(10)).toHaveLength(0);
  });

  it("respects the limit", () => {
    for (let i = 0; i < 10; i++) {
      appendHistory({ jid: `551100000000${String(i)}`, status: "sent" });
    }
    const entries = readHistory(3);
    expect(entries).toHaveLength(3);
    expect(entries[0]?.jid).toBe("5511000000007");
  });

  it("truncates entries older than n days", () => {
    const recent = new Date().toISOString();
    const past = new Date(Date.now() - 10 * 86_400_000).toISOString();
    appendHistory({ jid: "old", status: "sent" }, past);
    appendHistory({ jid: "recent", status: "sent" }, recent);
    truncateHistory(5);
    const entries = readHistory(10);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.jid).toBe("recent");
  });

  it("truncates all entries when everything is older", () => {
    const past = new Date(Date.now() - 20 * 86_400_000).toISOString();
    appendHistory({ jid: "old1", status: "sent" }, past);
    appendHistory({ jid: "old2", status: "sent" }, past);
    truncateHistory(5);
    expect(readHistory(10)).toHaveLength(0);
  });

  it("handles missing file in truncate", () => {
    truncateHistory(5);
    expect(readHistory(10)).toHaveLength(0);
  });
});
