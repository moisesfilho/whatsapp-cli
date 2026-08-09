import { emitKeypressEvents, type Key } from "node:readline";
import { filterRecipients, type Recipient } from "./recipients.js";
import { stripJidSuffix } from "./phone.js";

export interface PickOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  prompt?: string;
  hint?: string;
  emptyMessage?: string;
  contactLabel?: string;
  groupLabel?: string;
}

type TtyInput = NodeJS.ReadableStream & {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => void;
  resume?: () => void;
};

function isPrintableQueryChar(value: string | undefined): value is string {
  return value !== undefined && value.length === 1 && Number(value.codePointAt(0)) >= 32;
}

function truncateRow(row: string, termCols: number): string {
  const chars = Array.from(row); // eslint-disable-line unicorn/prefer-spread
  return chars.length > termCols ? `${chars.slice(0, termCols - 1).join("")}…` : row;
}

function formatRecipientRow(
  recipient: Recipient,
  i: number,
  index: number,
  contactLabel: string,
  groupLabel: string,
): string {
  const marker = i === index ? ">" : " ";
  const label = recipient.type === "group" ? `[${groupLabel}]` : `[${contactLabel}]`;
  const suffix = recipient.type === "group" ? "" : ` (${stripJidSuffix(recipient.jid)})`;
  return `${marker} ${label} ${recipient.name}${suffix}`;
}

function buildRows(
  filtered: Recipient[],
  index: number,
  prompt: string | undefined,
  hint: string | undefined,
  emptyMessage: string,
  contactLabel: string,
  groupLabel: string,
  output: NodeJS.WritableStream,
): string[] {
  const termRows = (output as { rows?: number }).rows ?? 12;
  const maxVisible = Math.max(3, Math.min(10, termRows - 2));
  const termCols =
    (output as { columns?: number }).columns ??
    (process.stdout as { columns?: number }).columns ??
    80;
  const rows: string[] = [];
  if (prompt !== undefined) {
    rows.push(truncateRow(prompt, termCols));
  }
  if (filtered.length === 0) {
    rows.push(truncateRow(emptyMessage, termCols));
  } else {
    const start = Math.max(
      0,
      Math.min(index - Math.floor(maxVisible / 2), filtered.length - maxVisible),
    );
    const visible =
      filtered.length > maxVisible ? filtered.slice(start, start + maxVisible) : filtered;
    for (const [offset, recipient] of visible.entries()) {
      rows.push(
        truncateRow(
          formatRecipientRow(recipient, start + offset, index, contactLabel, groupLabel),
          termCols,
        ),
      );
    }
    if (filtered.length > maxVisible) {
      rows.push(truncateRow(`… ${String(filtered.length - maxVisible)} more`, termCols));
    }
  }
  if (hint !== undefined) {
    rows.push(truncateRow(hint, termCols));
  }
  return rows;
}

export function pickRecipient(
  candidates: Recipient[],
  options?: PickOptions,
): Promise<Recipient | null> {
  const input = options?.input ?? process.stdin;
  const output = options?.output ?? process.stdout;
  const prompt = options?.prompt;
  const hint = options?.hint;
  const emptyMessage = options?.emptyMessage ?? "(no matches)";
  const contactLabel = options?.contactLabel ?? "C";
  const groupLabel = options?.groupLabel ?? "G";
  const ttyInput = input as TtyInput;

  emitKeypressEvents(input);
  if (ttyInput.isTTY === true && typeof ttyInput.setRawMode === "function") {
    ttyInput.setRawMode(true);
  }
  ttyInput.pause();
  if (typeof ttyInput.resume === "function") {
    ttyInput.resume();
  }

  return new Promise<Recipient | null>((resolve) => {
    let query = "";
    let index = 0;
    let lines = 0;
    let done = false;

    const cleanup = (): void => {
      ttyInput.removeListener("keypress", handler);
      if (ttyInput.isTTY === true && typeof ttyInput.setRawMode === "function") {
        ttyInput.setRawMode(false);
      }
      ttyInput.pause();
    };

    const finish = (value: Recipient | null): void => {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      resolve(value);
    };

    const render = (): void => {
      if (lines > 0) {
        output.write(`\u{1B}[${String(lines)}F\u{1B}[J`);
      }
      const filtered = filterRecipients(candidates, query);
      const rows = buildRows(
        filtered,
        index,
        prompt,
        hint,
        emptyMessage,
        contactLabel,
        groupLabel,
        output,
      );
      output.write(`${rows.join("\n")}\n`);
      lines = rows.length;
    };

    const handler = (str: string | undefined, key: Key): void => {
      if (key.ctrl === true && key.name === "c") {
        finish(null);
        return;
      }
      const filtered = filterRecipients(candidates, query);
      const n = filtered.length;
      const move = (offset: number): void => {
        if (n > 0) {
          index = (index + offset + n) % n;
        }
      };
      const select = (): void => {
        const picked = filtered[index];
        if (picked !== undefined) {
          finish(picked);
        }
      };
      switch (key.name) {
        case "up":
          move(-1);
          render();
          break;
        case "down":
          move(1);
          render();
          break;
        case "return":
        case "enter":
        case "kpad-enter":
          select();
          break;
        case "escape":
          finish(null);
          break;
        case "backspace":
          query = query.slice(0, -1);
          index = 0;
          render();
          break;
        case "space":
          query += " ";
          index = 0;
          render();
          break;
        default:
          if (isPrintableQueryChar(str)) {
            query += str;
            index = 0;
            render();
          }
      }
    };

    ttyInput.on("keypress", handler);
    render();
  });
}
