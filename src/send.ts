import type { WaClient } from "./client.js";
import { appendHistory } from "./history.js";
import { toPhoneJid } from "./phone.js";

export interface SendResult {
  id?: string;
  ok: boolean;
  error?: string;
}

export async function sendText(
  socket: WaClient,
  target: string,
  text: string,
): Promise<SendResult> {
  try {
    const sent = await socket.sendMessage(toPhoneJid(target), {
      text,
    });
    const id = sent?.key.id ?? undefined;
    appendHistory({
      jid: toPhoneJid(target),
      status: "sent",
      messageId: id,
    });
    return { id, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendHistory({
      jid: toPhoneJid(target),
      status: "failed",
      error: message,
    });
    return { ok: false, error: message };
  }
}

export async function sendBatch(
  socket: WaClient,
  recipients: Array<{ phone: string; name?: string }>,
  text: string,
  options: { dryRun?: boolean; onProgress?: (sent: number, total: number) => void } = {},
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    if (options.dryRun === true) {
      sent += 1;
      options.onProgress?.(sent, recipients.length);
      continue;
    }
    const result = await sendText(socket, recipient.phone, text);
    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
    }
    options.onProgress?.(sent + failed, recipients.length);
  }

  return { sent, failed };
}
