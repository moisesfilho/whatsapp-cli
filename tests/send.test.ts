import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sendBatch, sendText } from "../src/send.js";
import { readHistory } from "../src/history.js";

const TMP_DIR = path.join(tmpdir(), "whatsapp-cli-send-test");

function makeFakeSocket(
  overrides: { fail?: boolean; throwString?: boolean; noKey?: boolean } = {},
) {
  return {
    sendMessage: vi.fn().mockImplementation(() => {
      if (overrides.fail === true) {
        throw new Error("network error");
      }
      if (overrides.throwString === true) {
        throw "string failure";
      }
      if (overrides.noKey === true) {
        return;
      }
      return { key: { id: "msg-1" } };
    }),
  } as never;
}

describe("sendText", () => {
  beforeEach(() => {
    process.env.WHATSAPP_CLI_CONFIG_DIR = TMP_DIR;
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    delete process.env.WHATSAPP_CLI_CONFIG_DIR;
  });

  it("sends a message and records history", async () => {
    const socket = makeFakeSocket();
    const result = await sendText(socket, "5585981188645", "hello");
    expect(result.ok).toBe(true);
    expect(result.id).toBe("msg-1");
    const entries = readHistory(5);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe("sent");
    expect(entries[0]?.messageId).toBe("msg-1");
  });

  it("returns error and records failure when send fails", async () => {
    const socket = makeFakeSocket({ fail: true });
    const result = await sendText(socket, "5585981188645", "hello");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network error");
    expect(result.id).toBeUndefined();
    const entries = readHistory(5);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe("failed");
    expect(entries[0]?.error).toBe("network error");
  });

  it("stringifies non-Error throws", async () => {
    const socket = makeFakeSocket({ throwString: true });
    const result = await sendText(socket, "5585981188645", "hello");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("string failure");
  });

  it("handles a response without a key id", async () => {
    const socket = makeFakeSocket({ noKey: true });
    const result = await sendText(socket, "5585981188645", "hello");
    expect(result.ok).toBe(true);
    expect(result.id).toBeUndefined();
  });
});

describe("sendBatch", () => {
  beforeEach(() => {
    process.env.WHATSAPP_CLI_CONFIG_DIR = TMP_DIR;
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    delete process.env.WHATSAPP_CLI_CONFIG_DIR;
  });

  it("sends to all recipients", async () => {
    const socket = makeFakeSocket();
    const progress = vi.fn();
    const { sent, failed } = await sendBatch(
      socket,
      [{ phone: "5585981188645" }, { phone: "5585981188646" }],
      "hi",
      { onProgress: progress },
    );
    expect(sent).toBe(2);
    expect(failed).toBe(0);
    expect(progress).toHaveBeenCalledTimes(2);
  });

  it("counts failures", async () => {
    const socket = makeFakeSocket({ fail: true });
    const { sent, failed } = await sendBatch(
      socket,
      [{ phone: "5585981188645" }, { phone: "5585981188646" }],
      "hi",
    );
    expect(sent).toBe(0);
    expect(failed).toBe(2);
  });

  it("supports dry-run without contacting the socket", async () => {
    const socket = makeFakeSocket();
    await sendBatch(socket, [{ phone: "5585981188645" }], "hi", { dryRun: true });
    expect(socket.sendMessage).not.toHaveBeenCalled();
  });

  it("calls progress during dry run", async () => {
    const socket = makeFakeSocket();
    const progress = vi.fn();
    const result = await sendBatch(
      socket,
      [{ phone: "5585981188645" }, { phone: "5585981188646" }],
      "hi",
      { dryRun: true, onProgress: progress },
    );
    expect(result.sent).toBe(2);
    expect(progress).toHaveBeenCalledTimes(2);
  });
});
