import makeWASocket, { DisconnectReason, useMultiFileAuthState, type WASocket } from "baileys";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { sessionDir as configSessionDir } from "./config.js";

export type WaClient = WASocket;

export type QrHandler = (qr: string) => void;

export interface ConnectionOptions {
  sessionDir?: string;
  onQr?: QrHandler;
  onDisconnect?: (reason: string) => void;
}

function resolveSessionDir(sessionDir?: string): string {
  return sessionDir ?? configSessionDir();
}

const REASON_TEXT: Partial<Record<number, string>> = {
  [DisconnectReason.timedOut]: "timed-out",
  [DisconnectReason.loggedOut]: "logged-out",
  [DisconnectReason.badSession]: "bad-session",
  [DisconnectReason.connectionClosed]: "connection-closed",
  [DisconnectReason.connectionReplaced]: "connection-replaced",
  [DisconnectReason.restartRequired]: "restart-required",
  [DisconnectReason.forbidden]: "forbidden",
  [DisconnectReason.multideviceMismatch]: "multidevice-mismatch",
};

export function reasonText(reason: number): string {
  return REASON_TEXT[reason] ?? "unknown";
}

export async function connect(options: ConnectionOptions = {}): Promise<WaClient> {
  const sessionDir = resolveSessionDir(options.sessionDir);
  mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const socket = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  socket.ev.on("creds.update", () => {
    void saveCreds();
  });

  socket.ev.on("connection.update", (update) => {
    if (update.qr != null) {
      options.onQr?.(update.qr);
    }
    if (update.lastDisconnect?.error) {
      const error = update.lastDisconnect.error;
      const status = "output" in error ? error.output.statusCode : undefined;
      if (status !== undefined) {
        options.onDisconnect?.(reasonText(status));
      }
    }
  });

  return socket;
}

export function logout(sessionDir?: string): void {
  const resolved = resolveSessionDir(sessionDir);
  rmSync(resolved, { recursive: true, force: true });
}

export function hasSession(sessionDir?: string): boolean {
  const resolved = resolveSessionDir(sessionDir);
  try {
    return readdirSync(resolved).length > 0;
  } catch {
    return false;
  }
}

export type ConnectionResult = "open" | "restart" | "logged-out" | "timeout";

export function waitForConnection(socket: WaClient, timeoutMs = 30_000): Promise<ConnectionResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve("timeout");
    }, timeoutMs);
    socket.ev.on("connection.update", (update) => {
      if (update.connection === "open") {
        clearTimeout(timer);
        resolve("open");
        return;
      }
      if (update.lastDisconnect?.error) {
        const error = update.lastDisconnect.error;
        const status = "output" in error ? error.output.statusCode : undefined;
        if (status === DisconnectReason.restartRequired) {
          clearTimeout(timer);
          resolve("restart");
        } else if (status === DisconnectReason.loggedOut) {
          clearTimeout(timer);
          resolve("logged-out");
        }
      }
    });
  });
}
