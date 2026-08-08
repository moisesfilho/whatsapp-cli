import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { mockMakeWASocket, mockUseMultiFileAuthState, mockSaveCreds } = vi.hoisted(() => {
  return {
    mockMakeWASocket: vi.fn<(args: unknown[]) => unknown>(),
    mockUseMultiFileAuthState: vi.fn<(args: unknown[]) => Promise<unknown>>(),
    mockSaveCreds: vi.fn<() => Promise<void>>(),
  };
});

const TMP_DIR = path.join(tmpdir(), "whatsapp-cli-client-test");

const handlers = new Map<string, Array<(event: unknown) => void>>();

vi.mock("baileys", () => {
  return {
    default: mockMakeWASocket,
    makeWASocket: (...args: unknown[]) => mockMakeWASocket(...args),
    useMultiFileAuthState: (...args: unknown[]) => mockUseMultiFileAuthState(...args),
    DisconnectReason: Object.freeze({
      loggedOut: 401,
      connectionReplaced: 440,
      timedOut: 408,
      connectionClosed: 428,
      connectionLost: 408,
      restartRequired: 515,
      badSession: 500,
      forbidden: 403,
      multideviceMismatch: 411,
      0: "unknown",
    }),
  };
});

import { connect, hasSession, logout, reasonText, waitForConnection } from "../src/client.js";
import { DisconnectReason } from "baileys";

function makeFakeSocket() {
  const socket = {
    ev: {
      on: vi.fn((name: string, cb: (event: unknown) => void) => {
        const list = handlers.get(name) ?? [];
        list.push(cb);
        handlers.set(name, list);
      }),
    },
    end: vi.fn().mockResolvedValue(undefined),
    user: { name: "Tester" },
  };
  return socket;
}

function emit(name: string, event: unknown) {
  const callbacks = handlers.get(name) ?? [];
  for (const cb of callbacks) {
    cb(event);
  }
}

beforeEach(() => {
  handlers.clear();
  process.env.WHATSAPP_CLI_CONFIG_DIR = TMP_DIR;
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
  const socket = makeFakeSocket();
  mockMakeWASocket.mockReturnValue(socket);
  mockUseMultiFileAuthState.mockResolvedValue({
    state: { creds: {}, keys: {} },
    saveCreds: mockSaveCreds,
  });
});

afterEach(() => {
  delete process.env.WHATSAPP_CLI_CONFIG_DIR;
  vi.clearAllMocks();
});

describe("connect", () => {
  it("creates a socket and wires creds + connection handlers", async () => {
    const onQr = vi.fn();
    const onDisconnect = vi.fn();
    const socket = await connect({ sessionDir: TMP_DIR, onQr, onDisconnect });

    expect(mockUseMultiFileAuthState).toHaveBeenCalledWith(TMP_DIR);
    expect(socket.ev.on).toHaveBeenCalledWith("creds.update", expect.any(Function));
    expect(socket.ev.on).toHaveBeenCalledWith("connection.update", expect.any(Function));

    emit("creds.update", {});
    expect(mockSaveCreds).toHaveBeenCalled();

    emit("connection.update", { qr: "QR_CODE" });
    expect(onQr).toHaveBeenCalledWith("QR_CODE");
  });

  it("reports disconnect reasons from lastDisconnect", async () => {
    const onDisconnect = vi.fn();
    await connect({ sessionDir: TMP_DIR, onDisconnect });
    emit("connection.update", {
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.loggedOut } } },
    });
    expect(onDisconnect).toHaveBeenCalledWith("logged-out");
  });

  it("ignores lastDisconnect errors without a status", async () => {
    const onDisconnect = vi.fn();
    await connect({ sessionDir: TMP_DIR, onDisconnect });
    emit("connection.update", {
      lastDisconnect: { error: new Error("no status") },
    });
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it("uses the default session dir when none passed", async () => {
    await connect({});
    expect(mockUseMultiFileAuthState).toHaveBeenCalledWith(path.join(TMP_DIR, "session"));
  });
});

describe("hasSession", () => {
  it("is false when session dir is empty", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    expect(hasSession(TMP_DIR)).toBe(false);
  });

  it("is true when session dir has files", () => {
    writeFileSync(path.join(TMP_DIR, "creds.json"), "{}", "utf8");
    expect(hasSession(TMP_DIR)).toBe(true);
  });

  it("returns false when dir does not exist", () => {
    expect(hasSession(TMP_DIR)).toBe(false);
  });
});

describe("logout", () => {
  it("removes the session directory", () => {
    writeFileSync(path.join(TMP_DIR, "creds.json"), "{}", "utf8");
    logout(TMP_DIR);
    expect(hasSession(TMP_DIR)).toBe(false);
  });

  it("does not throw when dir missing", () => {
    expect(() => {
      logout(path.join(TMP_DIR, "missing"));
    }).not.toThrow();
  });
});

describe("waitForConnection", () => {
  it("resolves open when the connection opens", async () => {
    const socket = makeFakeSocket();
    const promise = waitForConnection(socket);
    emit("connection.update", { connection: "open" });
    await expect(promise).resolves.toBe("open");
  });

  it("resolves restart on restartRequired", async () => {
    const socket = makeFakeSocket();
    const promise = waitForConnection(socket);
    emit("connection.update", {
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.restartRequired } } },
    });
    await expect(promise).resolves.toBe("restart");
  });

  it("resolves logged-out on loggedOut", async () => {
    const socket = makeFakeSocket();
    const promise = waitForConnection(socket);
    emit("connection.update", {
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.loggedOut } } },
    });
    await expect(promise).resolves.toBe("logged-out");
  });

  it("resolves timeout after the timeout", async () => {
    const socket = makeFakeSocket();
    await expect(waitForConnection(socket, 10)).resolves.toBe("timeout");
  });

  it("ignores errors without output and times out", async () => {
    const socket = makeFakeSocket();
    const promise = waitForConnection(socket, 10);
    emit("connection.update", {
      lastDisconnect: { error: new Error("no status") },
    });
    await expect(promise).resolves.toBe("timeout");
  });

  it("ignores unknown disconnect statuses and times out", async () => {
    const socket = makeFakeSocket();
    const promise = waitForConnection(socket, 10);
    emit("connection.update", {
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.timedOut } } },
    });
    await expect(promise).resolves.toBe("timeout");
  });

  it("ignores closes without an error and times out", async () => {
    const socket = makeFakeSocket();
    const promise = waitForConnection(socket, 10);
    emit("connection.update", { connection: "close" });
    await expect(promise).resolves.toBe("timeout");
  });
});

describe("reasonText", () => {
  it("maps known reasons", () => {
    expect(reasonText(DisconnectReason.loggedOut)).toBe("logged-out");
    expect(reasonText(DisconnectReason.timedOut)).toBe("timed-out");
    expect(reasonText(DisconnectReason.restartRequired)).toBe("restart-required");
    expect(reasonText(DisconnectReason.badSession)).toBe("bad-session");
    expect(reasonText(DisconnectReason.connectionClosed)).toBe("connection-closed");
    expect(reasonText(DisconnectReason.connectionReplaced)).toBe("connection-replaced");
    expect(reasonText(DisconnectReason.forbidden)).toBe("forbidden");
    expect(reasonText(DisconnectReason.multideviceMismatch)).toBe("multidevice-mismatch");
    expect(reasonText(408)).toBe("timed-out");
  });

  it("falls back to unknown", () => {
    expect(reasonText(9999)).toBe("unknown");
  });
});
