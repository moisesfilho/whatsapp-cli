import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { GROUP_SUFFIX, PHONE_SUFFIX } from "../src/phone.js";
import { pickRecipient } from "../src/picker.js";
import type { Recipient } from "../src/recipients.js";

type FakeInput = PassThrough & {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => void;
  resume?: () => void;
};

function makeStreams() {
  const input = new PassThrough() as FakeInput;
  input.isTTY = true;
  input.setRawMode = vi.fn();
  const output = new PassThrough();
  return { input, output };
}

function collectOutput(output: PassThrough): string[] {
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });
  return chunks;
}

const alice: Recipient = { jid: `5585981188645${PHONE_SUFFIX}`, name: "Alice", type: "contact" };

const candidates: Recipient[] = [
  alice,
  { jid: `5585981188646${PHONE_SUFFIX}`, name: "Bob", type: "contact" },
  { jid: `120363000001${GROUP_SUFFIX}`, name: "Work", type: "group" },
];

describe("pickRecipient", () => {
  it("selects the first candidate on Enter", async () => {
    const { input, output } = makeStreams();
    const promise = pickRecipient(candidates, { input, output });
    input.write("\r");
    await expect(promise).resolves.toEqual(alice);
  });

  it("moves down with the down arrow", async () => {
    const { input, output } = makeStreams();
    const promise = pickRecipient(candidates, { input, output });
    input.write("\u{1B}[B");
    input.write("\r");
    await expect(promise).resolves.toEqual(candidates[1]);
  });

  it("wraps up from the first entry to the last", async () => {
    const { input, output } = makeStreams();
    const promise = pickRecipient(candidates, { input, output });
    input.write("\u{1B}[A");
    input.write("\r");
    await expect(promise).resolves.toEqual(candidates[2]);
  });

  it("cancels on Ctrl+C", async () => {
    const { input, output } = makeStreams();
    const promise = pickRecipient(candidates, { input, output });
    input.write("\u{3}");
    await expect(promise).resolves.toBeNull();
  });

  it("cancels on Escape", async () => {
    const { input, output } = makeStreams();
    const promise = pickRecipient(candidates, { input, output });
    input.write("\u{1B}\u{1B}\u{1B}");
    await expect(promise).resolves.toBeNull();
  });

  it("accepts enter via newline", async () => {
    const { input, output } = makeStreams();
    const promise = pickRecipient(candidates, { input, output });
    input.write("\n");
    await expect(promise).resolves.toEqual(alice);
  });

  it("accepts the numpad enter key", async () => {
    const { input, output } = makeStreams();
    const promise = pickRecipient(candidates, { input, output });
    input.emit("keypress", undefined, { name: "kpad-enter" });
    await expect(promise).resolves.toEqual(alice);
  });

  it("selects the first filtered match after typing", async () => {
    const { input, output } = makeStreams();
    const names: Recipient[] = [
      { jid: "1000000001", name: "Anna", type: "contact" },
      { jid: "1000000002", name: "Bob", type: "contact" },
      { jid: "1000000003", name: "Alice", type: "contact" },
    ];
    const promise = pickRecipient(names, { input, output });
    input.write("a");
    input.write("\r");
    await expect(promise).resolves.toEqual(names[2]);
  });

  it("resets the selection index when the query changes", async () => {
    const { input, output } = makeStreams();
    const names: Recipient[] = [
      { jid: "1000000001", name: "Anna", type: "contact" },
      { jid: "1000000002", name: "Bob", type: "contact" },
      { jid: "1000000003", name: "Alice", type: "contact" },
    ];
    const promise = pickRecipient(names, { input, output });
    input.write("\u{1B}[B");
    input.write("a");
    input.write("\r");
    await expect(promise).resolves.toEqual(names[2]);
  });

  it("ignores Enter without matches and restores with backspace", async () => {
    const { input, output } = makeStreams();
    let resolved = false;
    const promise = pickRecipient(candidates, { input, output });
    void promise.then(() => {
      resolved = true;
    });
    input.write("zzz");
    input.write("\u{1B}[A");
    input.write("\u{1B}[B");
    input.write("\r");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(resolved).toBe(false);
    input.write("\u{7F}");
    input.write("\u{7F}");
    input.write("\u{7F}");
    input.write("\r");
    await expect(promise).resolves.toEqual(alice);
  });

  it("appends spaces to the query", async () => {
    const { input, output } = makeStreams();
    const family: Recipient[] = [
      { jid: `120363000002${GROUP_SUFFIX}`, name: "The Family", type: "group" },
    ];
    const promise = pickRecipient(family, { input, output });
    input.write(" ");
    input.write("f");
    input.write("\r");
    await expect(promise).resolves.toEqual(family[0]);
  });

  it("ignores control and function keys", async () => {
    const { input, output } = makeStreams();
    const promise = pickRecipient(candidates, { input, output });
    input.write("\t");
    input.write("\u{1B}OP");
    input.write("\u{1F600}");
    input.write("\r");
    await expect(promise).resolves.toEqual(alice);
  });

  it("restores raw mode and removes the keypress listener", async () => {
    const { input, output } = makeStreams();
    const promise = pickRecipient(candidates, { input, output });
    expect(input.setRawMode).toHaveBeenCalledWith(true);
    input.write("\r");
    await promise;
    expect(input.setRawMode).toHaveBeenCalledWith(false);
    expect(input.listenerCount("keypress")).toBe(0);
  });

  it("renders labels with prompt and hint", async () => {
    const { input, output } = makeStreams();
    const chunks = collectOutput(output);
    const promise = pickRecipient(candidates, {
      input,
      output,
      prompt: "Pick one:",
      hint: "Press Enter",
    });
    input.write("\r");
    await promise;
    const text = chunks.join("");
    expect(text).toContain("Pick one:");
    expect(text).toContain("Press Enter");
    expect(text).toContain("[C]");
    expect(text).toContain("[G]");
    expect(text).toContain("(5585981188645)");
  });

  it("supports custom labels and an empty message", async () => {
    const { input, output } = makeStreams();
    const chunks = collectOutput(output);
    const promise = pickRecipient(candidates, {
      input,
      output,
      contactLabel: "CT",
      groupLabel: "GR",
      emptyMessage: "nothing here",
    });
    input.write("zzz");
    const text = chunks.join("");
    expect(text).toContain("nothing here");
    expect(text).toContain("[CT]");
    expect(text).toContain("[GR]");
    input.write("\r");
    input.write("\u{7F}");
    input.write("\u{7F}");
    input.write("\u{7F}");
    input.write("\r");
    await expect(promise).resolves.toEqual(alice);
  });

  it("does not enable raw mode when the input is not a TTY", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const promise = pickRecipient([alice], { input, output });
    input.write("\r");
    await expect(promise).resolves.toEqual(alice);
  });

  it("skips raw mode when setRawMode is unavailable", async () => {
    const input = new PassThrough() as FakeInput;
    input.isTTY = true;
    const output = new PassThrough();
    const promise = pickRecipient([alice], { input, output });
    input.write("\r");
    await expect(promise).resolves.toEqual(alice);
  });

  it("works when the input has no resume method", async () => {
    const input = new PassThrough() as FakeInput;
    input.isTTY = true;
    input.setRawMode = vi.fn();
    input.resume = undefined;
    const output = new PassThrough();
    const promise = pickRecipient([alice], { input, output });
    input.emit("keypress", undefined, { name: "return" });
    await expect(promise).resolves.toEqual(alice);
  });

  it("falls back to process stdin and stdout when options are omitted", async () => {
    const { input, output } = makeStreams();
    const stdinDescriptor = Object.getOwnPropertyDescriptor(process, "stdin");
    const stdoutDescriptor = Object.getOwnPropertyDescriptor(process, "stdout");
    Object.defineProperties(process, {
      stdin: { value: input, configurable: true },
      stdout: { value: output, configurable: true },
    });
    try {
      const promise = pickRecipient([alice]);
      input.write("\r");
      await expect(promise).resolves.toEqual(alice);
    } finally {
      if (stdinDescriptor !== undefined && stdoutDescriptor !== undefined) {
        Object.defineProperties(process, {
          stdin: stdinDescriptor,
          stdout: stdoutDescriptor,
        });
      }
    }
  });

  it("ignores keypresses after the picker resolved", async () => {
    const { input, output } = makeStreams();
    input.removeListener = vi.fn();
    const promise = pickRecipient([alice], { input, output });
    input.write("\r");
    await expect(promise).resolves.toEqual(alice);
    input.emit("keypress", undefined, { name: "c", ctrl: true });
  });

  it("paginates a long list and scrolls to the last candidate", async () => {
    const { input, output } = makeStreams();
    const chunks = collectOutput(output);
    const many: Recipient[] = Array.from({ length: 25 }, (_, i) => ({
      jid: `1000000${String(i).padStart(2, "0")}`,
      name: `Contact ${String(i).padStart(2, "0")}`,
      type: "contact",
    }));
    const promise = pickRecipient(many, { input, output });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const initial = chunks.join("");
    expect(initial).toContain("Contact 00");
    expect(initial).not.toContain("Contact 24");
    for (let i = 0; i < 24; i++) {
      input.write("\u{1B}[B");
    }
    input.write("\r");
    await expect(promise).resolves.toEqual(many[24]);
  });

  it("truncates rows longer than the terminal width", async () => {
    const { input, output } = makeStreams();
    const chunks = collectOutput(output);
    const longName = "x".repeat(200);
    const long: Recipient[] = [
      { jid: `1000000001${PHONE_SUFFIX}`, name: longName, type: "contact" },
    ];
    const promise = pickRecipient(long, { input, output });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const text = chunks.join("");
    expect(text).toContain("…");
    expect(text).not.toContain(longName);
    input.write("\r");
    await expect(promise).resolves.toEqual(long[0]);
  });
});
