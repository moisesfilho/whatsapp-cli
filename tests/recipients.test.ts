import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Contact } from "baileys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GROUP_SUFFIX, PHONE_SUFFIX } from "../src/phone.js";
import {
  collectContacts,
  filterRecipients,
  listRecipients,
  loadContactsCache,
  saveContactsCache,
  startCollectingContacts,
  type Recipient,
} from "../src/recipients.js";

const TMP_DIR = path.join(tmpdir(), "whatsapp-cli-recipients-test");

interface CacheFile {
  account: string;
  contacts: Array<{ jid: string; name: string }>;
}

function readCacheFile(): CacheFile {
  return JSON.parse(readFileSync(path.join(TMP_DIR, "contacts.json"), "utf8")) as CacheFile;
}

function makeFakeSocket(
  groups: Record<string, { subject?: string; participants?: unknown[] }> = {},
  user?: { id?: string },
) {
  const handlers = new Map<string, Array<(data: unknown) => void>>();
  const ev = {
    on: vi.fn((event: string, listener: (data: unknown) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(listener);
      handlers.set(event, list);
    }),
    off: vi.fn(),
  };
  const socket = {
    groupFetchAllParticipating: vi.fn().mockResolvedValue(groups),
    ev,
    user,
  } as never;
  return {
    socket,
    ev,
    emit: (contacts: Contact[]) => {
      const listeners = handlers.get("contacts.upsert") ?? [];
      for (const listener of listeners) {
        listener(contacts);
      }
    },
    emitHistory: (data: { contacts?: Contact[] }) => {
      const listeners = handlers.get("messaging-history.set") ?? [];
      for (const listener of listeners) {
        listener(data);
      }
    },
  };
}

beforeEach(() => {
  process.env.WHATSAPP_CLI_CONFIG_DIR = TMP_DIR;
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  delete process.env.WHATSAPP_CLI_CONFIG_DIR;
});

describe("collectContacts", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("collects contacts keyed by jid with priority names", async () => {
    vi.useFakeTimers();
    const { socket, emit } = makeFakeSocket();
    const promise = collectContacts(socket, 2500);
    emit([{ id: "1000000001", name: "Alice" }]);
    emit([{ id: "1000000002", notify: "Bob" }]);
    emit([{ id: "1000000003", verifiedName: "Carol" }]);
    await vi.advanceTimersByTimeAsync(2500);
    const map = await promise;
    expect(map.get("1000000001")).toEqual({ jid: "1000000001", name: "Alice", type: "contact" });
    expect(map.get("1000000002")).toEqual({ jid: "1000000002", name: "Bob", type: "contact" });
    expect(map.get("1000000003")).toEqual({ jid: "1000000003", name: "Carol", type: "contact" });
  });

  it("prefers name over notify over verifiedName", async () => {
    vi.useFakeTimers();
    const { socket, emit } = makeFakeSocket();
    const promise = collectContacts(socket, 2500);
    emit([{ id: "1000000004", name: "Saved", notify: "Self", verifiedName: "Verified" }]);
    await vi.advanceTimersByTimeAsync(2500);
    const map = await promise;
    expect(map.get("1000000004")?.name).toBe("Saved");
  });

  it("prefers jid over id when both are present", async () => {
    vi.useFakeTimers();
    const { socket, emit } = makeFakeSocket();
    const promise = collectContacts(socket, 2500);
    emit([{ id: "1000000005", jid: `5585981188645${PHONE_SUFFIX}`, name: "Alice" }]);
    await vi.advanceTimersByTimeAsync(2500);
    const map = await promise;
    expect(map.has("1000000005")).toBe(false);
    expect(map.get(`5585981188645${PHONE_SUFFIX}`)?.name).toBe("Alice");
  });

  it("falls back to the jid when no name is present", async () => {
    vi.useFakeTimers();
    const { socket, emit } = makeFakeSocket();
    const promise = collectContacts(socket, 2500);
    emit([{ id: "1000000006" }]);
    await vi.advanceTimersByTimeAsync(2500);
    const map = await promise;
    expect(map.get("1000000006")).toEqual({
      jid: "1000000006",
      name: "1000000006",
      type: "contact",
    });
  });

  it("overwrites a previous entry with a newer name", async () => {
    vi.useFakeTimers();
    const { socket, emit } = makeFakeSocket();
    const promise = collectContacts(socket, 2500);
    emit([{ id: "1000000001", name: "Old" }]);
    emit([{ id: "1000000001", name: "New" }]);
    await vi.advanceTimersByTimeAsync(2500);
    const map = await promise;
    expect(map.get("1000000001")?.name).toBe("New");
  });

  it("keeps the existing name when a later upsert has none", async () => {
    vi.useFakeTimers();
    const { socket, emit } = makeFakeSocket();
    const promise = collectContacts(socket, 2500);
    emit([{ id: "1000000001", name: "Known" }]);
    emit([{ id: "1000000001" }]);
    await vi.advanceTimersByTimeAsync(2500);
    const map = await promise;
    expect(map.get("1000000001")?.name).toBe("Known");
  });

  it("skips contacts without a jid or id", async () => {
    vi.useFakeTimers();
    const { socket, emit } = makeFakeSocket();
    const promise = collectContacts(socket, 2500);
    emit([{ name: "Ghost" } as unknown as Contact]);
    emit([{ id: "" }]);
    await vi.advanceTimersByTimeAsync(2500);
    const map = await promise;
    expect(map.size).toBe(0);
  });

  it("removes the contacts.upsert listener after settling", async () => {
    vi.useFakeTimers();
    const { socket, ev, emit } = makeFakeSocket();
    const promise = collectContacts(socket, 2500);
    expect(ev.on).toHaveBeenCalledWith("contacts.upsert", expect.any(Function));
    emit([]);
    await vi.advanceTimersByTimeAsync(2500);
    await promise;
    const registered = ev.on.mock.calls[0]?.[1];
    expect(ev.off).toHaveBeenCalledWith("contacts.upsert", registered);
  });

  it("collects contacts from messaging-history.set", async () => {
    vi.useFakeTimers();
    const { socket, emitHistory } = makeFakeSocket();
    const promise = collectContacts(socket, 2500);
    emitHistory({ contacts: [{ id: "1000000001", name: "Alice" }] });
    await vi.advanceTimersByTimeAsync(2500);
    const map = await promise;
    expect(map.get("1000000001")).toEqual({ jid: "1000000001", name: "Alice", type: "contact" });
  });
});

describe("listRecipients", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("merges contacts and groups sorted by name", async () => {
    vi.useFakeTimers();
    const groups = {
      [`120363000001${GROUP_SUFFIX}`]: { subject: "Zeta", participants: [{}] },
      [`120363000002${GROUP_SUFFIX}`]: { subject: "Alpha", participants: [] },
    };
    const { socket, emit } = makeFakeSocket(groups);
    const promise = listRecipients(socket, 2500);
    emit([{ id: `5585981188645${PHONE_SUFFIX}`, name: "Bob" }]);
    await vi.advanceTimersByTimeAsync(2500);
    const recipients = await promise;
    expect(recipients.map((r) => r.name)).toEqual(["Alpha", "Bob", "Zeta"]);
    expect(recipients[0]?.type).toBe("group");
    expect(recipients[1]?.type).toBe("contact");
    expect(recipients[1]?.jid).toBe(`5585981188645${PHONE_SUFFIX}`);
  });

  it("ignores a contact whose jid is a group id", async () => {
    vi.useFakeTimers();
    const jid = `120363000003${GROUP_SUFFIX}`;
    const groups = { [jid]: { subject: "Team", participants: [] } };
    const { socket, emit } = makeFakeSocket(groups);
    const promise = listRecipients(socket, 2500);
    emit([{ id: jid, name: "Person" }]);
    await vi.advanceTimersByTimeAsync(2500);
    const recipients = await promise;
    expect(recipients).toHaveLength(1);
    expect(recipients[0]).toEqual({ jid, name: "Team", type: "group" });
  });

  it("excludes lid contacts and unnamed contacts from the list", async () => {
    vi.useFakeTimers();
    const { socket, emit } = makeFakeSocket({});
    const promise = listRecipients(socket, 2500);
    emit([
      { id: `100008430940364@lid`, name: `100008430940364@lid` },
      { id: `5585981188649${PHONE_SUFFIX}` },
      { id: `5585981188650${PHONE_SUFFIX}`, name: "Alice" },
    ]);
    await vi.advanceTimersByTimeAsync(2500);
    const recipients = await promise;
    expect(recipients).toHaveLength(1);
    expect(recipients[0]).toEqual({
      jid: `5585981188650${PHONE_SUFFIX}`,
      name: "Alice",
      type: "contact",
    });
  });

  it("sorts contacts before groups on equal names", async () => {
    vi.useFakeTimers();
    const jid = `120363000004${GROUP_SUFFIX}`;
    const groups = { [jid]: { subject: "Same", participants: [] } };
    const { socket, emit } = makeFakeSocket(groups);
    const promise = listRecipients(socket, 2500);
    emit([{ id: `5585981188646${PHONE_SUFFIX}`, name: "Same" }]);
    await vi.advanceTimersByTimeAsync(2500);
    const recipients = await promise;
    expect(recipients).toHaveLength(2);
    expect(recipients[0]?.type).toBe("contact");
    expect(recipients[1]?.type).toBe("group");
  });

  it("keeps both contacts when names and types are equal", async () => {
    vi.useFakeTimers();
    const { socket, emit } = makeFakeSocket({});
    const promise = listRecipients(socket);
    emit([
      { id: `5585981188647${PHONE_SUFFIX}`, name: "Same" },
      { id: `5585981188648${PHONE_SUFFIX}`, name: "Same" },
    ]);
    await vi.advanceTimersByTimeAsync(2500);
    const recipients = await promise;
    expect(recipients).toHaveLength(2);
    expect(recipients.map((r) => r.type)).toEqual(["contact", "contact"]);
  });

  it("returns an empty list when nothing is available", async () => {
    vi.useFakeTimers();
    const { socket } = makeFakeSocket({});
    const promise = listRecipients(socket);
    await vi.advanceTimersByTimeAsync(2500);
    await expect(promise).resolves.toEqual([]);
  });
});

describe("filterRecipients", () => {
  const recipients: Recipient[] = [
    { jid: `5585981188645${PHONE_SUFFIX}`, name: "Alice", type: "contact" },
    { jid: `5585981188646${PHONE_SUFFIX}`, name: "Bob", type: "contact" },
    { jid: `120363000005${GROUP_SUFFIX}`, name: "Work", type: "group" },
  ];

  it("returns all recipients for a blank query", () => {
    const result = filterRecipients(recipients, "  ");
    expect(result).toHaveLength(3);
    expect(result[0]?.name).toBe("Alice");
  });

  it("matches by name substring ignoring case", () => {
    expect(filterRecipients(recipients, "li").map((r) => r.name)).toEqual(["Alice"]);
  });

  it("matches by jid without the suffix", () => {
    expect(filterRecipients(recipients, "8646").map((r) => r.name)).toEqual(["Bob"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterRecipients(recipients, "zzz")).toEqual([]);
  });

  it("keeps results sorted by name", () => {
    expect(filterRecipients(recipients, "").map((r) => r.name)).toEqual(["Alice", "Bob", "Work"]);
  });

  it("orders equal names with contacts before groups", () => {
    const result = filterRecipients(
      [
        { jid: `120363000006${GROUP_SUFFIX}`, name: "Same", type: "group" },
        { jid: `5585981188647${PHONE_SUFFIX}`, name: "Same", type: "contact" },
      ],
      "",
    );
    expect(result.map((r) => r.type)).toEqual(["contact", "group"]);
  });
});

describe("loadContactsCache", () => {
  it("returns an empty map when the file is missing", () => {
    expect(loadContactsCache("account-a")).toEqual(new Map());
  });

  it("returns an empty map when the JSON is corrupted", () => {
    writeFileSync(path.join(TMP_DIR, "contacts.json"), "{not json", "utf8");
    expect(loadContactsCache("account-a")).toEqual(new Map());
  });

  it("loads contacts when the account matches", () => {
    writeFileSync(
      path.join(TMP_DIR, "contacts.json"),
      JSON.stringify({
        account: "account-a",
        contacts: [{ jid: "1000000001", name: "Alice" }],
      }),
      "utf8",
    );
    const map = loadContactsCache("account-a");
    expect(map.get("1000000001")).toEqual({ jid: "1000000001", name: "Alice", type: "contact" });
  });

  it("returns an empty map when the account differs", () => {
    writeFileSync(
      path.join(TMP_DIR, "contacts.json"),
      JSON.stringify({
        account: "account-b",
        contacts: [{ jid: "1000000001", name: "Alice" }],
      }),
      "utf8",
    );
    expect(loadContactsCache("account-a")).toEqual(new Map());
  });

  it("loads contacts when no account is given", () => {
    writeFileSync(
      path.join(TMP_DIR, "contacts.json"),
      JSON.stringify({
        account: "account-a",
        contacts: [{ jid: "1000000001", name: "Alice" }],
      }),
      "utf8",
    );
    const map = loadContactsCache();
    expect(map.get("1000000001")?.name).toBe("Alice");
  });
});

describe("saveContactsCache", () => {
  it("writes the cache file with sorted contacts", () => {
    const contacts = new Map<string, Recipient>([
      ["1000000002", { jid: "1000000002", name: "Bob", type: "contact" }],
      ["1000000001", { jid: "1000000001", name: "Alice", type: "contact" }],
    ]);
    saveContactsCache("account-a", contacts);
    const file = readCacheFile();
    expect(file).toEqual({
      account: "account-a",
      contacts: [
        { jid: "1000000001", name: "Alice" },
        { jid: "1000000002", name: "Bob" },
      ],
    });
  });

  it("overwrites an existing file", () => {
    writeFileSync(
      path.join(TMP_DIR, "contacts.json"),
      JSON.stringify({ account: "old", contacts: [] }),
      "utf8",
    );
    const contacts = new Map<string, Recipient>([
      ["1000000001", { jid: "1000000001", name: "Alice", type: "contact" }],
    ]);
    saveContactsCache("account-a", contacts);
    const file = readCacheFile();
    expect(file.account).toBe("account-a");
    expect(file.contacts).toEqual([{ jid: "1000000001", name: "Alice" }]);
  });

  it("creates the directory when missing", () => {
    rmSync(TMP_DIR, { recursive: true, force: true });
    saveContactsCache("account-a", new Map());
    expect(readFileSync(path.join(TMP_DIR, "contacts.json"), "utf8")).toContain("account-a");
  });
});

describe("collectContacts with cache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("seeds the result from the cache", async () => {
    vi.useFakeTimers();
    writeFileSync(
      path.join(TMP_DIR, "contacts.json"),
      JSON.stringify({
        account: "account-a",
        contacts: [{ jid: "1000000001", name: "Cached" }],
      }),
      "utf8",
    );
    const { socket } = makeFakeSocket({}, { id: "account-a" });
    const promise = collectContacts(socket, 2500);
    await vi.advanceTimersByTimeAsync(2500);
    const map = await promise;
    expect(map.get("1000000001")).toEqual({ jid: "1000000001", name: "Cached", type: "contact" });
  });

  it("merges new upserts with the cache and persists", async () => {
    vi.useFakeTimers();
    writeFileSync(
      path.join(TMP_DIR, "contacts.json"),
      JSON.stringify({
        account: "account-a",
        contacts: [{ jid: "1000000001", name: "Cached" }],
      }),
      "utf8",
    );
    const { socket, emit } = makeFakeSocket({}, { id: "account-a" });
    const promise = collectContacts(socket, 2500);
    emit([{ id: "1000000002", name: "New" }]);
    await vi.advanceTimersByTimeAsync(2500);
    const map = await promise;
    expect(map.get("1000000001")?.name).toBe("Cached");
    expect(map.get("1000000002")?.name).toBe("New");
    const file = readCacheFile();
    expect(file.account).toBe("account-a");
    expect(file.contacts).toEqual([
      { jid: "1000000001", name: "Cached" },
      { jid: "1000000002", name: "New" },
    ]);
  });

  it("does not persist when the socket user has no id", async () => {
    vi.useFakeTimers();
    const { socket, emit } = makeFakeSocket({}, {});
    const promise = collectContacts(socket, 2500);
    emit([{ id: "1000000001", name: "Alice" }]);
    await vi.advanceTimersByTimeAsync(2500);
    const map = await promise;
    expect(map.get("1000000001")?.name).toBe("Alice");
    expect(() => readFileSync(path.join(TMP_DIR, "contacts.json"), "utf8")).toThrow();
  });

  it("ignores the cache when the account differs", async () => {
    vi.useFakeTimers();
    writeFileSync(
      path.join(TMP_DIR, "contacts.json"),
      JSON.stringify({
        account: "account-b",
        contacts: [{ jid: "1000000001", name: "Cached" }],
      }),
      "utf8",
    );
    const { socket } = makeFakeSocket({}, { id: "account-a" });
    const promise = collectContacts(socket, 2500);
    await vi.advanceTimersByTimeAsync(2500);
    const map = await promise;
    expect(map.size).toBe(0);
  });
});

describe("startCollectingContacts", () => {
  it("merges contacts from messaging-history.set", () => {
    const { socket, emitHistory } = makeFakeSocket({}, { id: "account-a" });
    const collector = startCollectingContacts(socket);
    emitHistory({ contacts: [{ id: "1000000001", name: "Alice" }] });
    expect(collector.contacts.get("1000000001")).toEqual({
      jid: "1000000001",
      name: "Alice",
      type: "contact",
    });
  });

  it("ignores messaging-history.set without contacts", () => {
    const { socket, emitHistory } = makeFakeSocket();
    const collector = startCollectingContacts(socket);
    emitHistory({});
    expect(collector.contacts.size).toBe(0);
  });

  it("finish removes both listeners and persists the merged cache", () => {
    const { socket, ev, emitHistory } = makeFakeSocket({}, { id: "account-a" });
    const collector = startCollectingContacts(socket);
    emitHistory({ contacts: [{ id: "1000000001", name: "Alice" }] });
    collector.finish();
    expect(ev.off).toHaveBeenCalledWith("contacts.upsert", expect.any(Function));
    expect(ev.off).toHaveBeenCalledWith("messaging-history.set", expect.any(Function));
    const file = readCacheFile();
    expect(file.account).toBe("account-a");
    expect(file.contacts).toEqual([{ jid: "1000000001", name: "Alice" }]);
  });

  it("finish merges cached contacts with collected ones", () => {
    writeFileSync(
      path.join(TMP_DIR, "contacts.json"),
      JSON.stringify({
        account: "account-a",
        contacts: [{ jid: "1000000001", name: "Cached" }],
      }),
      "utf8",
    );
    const { socket, emitHistory } = makeFakeSocket({}, { id: "account-a" });
    const collector = startCollectingContacts(socket);
    emitHistory({ contacts: [{ id: "1000000002", name: "New" }] });
    collector.finish();
    const file = readCacheFile();
    expect(file.contacts).toEqual([
      { jid: "1000000001", name: "Cached" },
      { jid: "1000000002", name: "New" },
    ]);
  });

  it("finish does not persist when the socket user has no id", () => {
    const { socket, emitHistory } = makeFakeSocket({}, {});
    const collector = startCollectingContacts(socket);
    emitHistory({ contacts: [{ id: "1000000001", name: "Alice" }] });
    collector.finish();
    expect(() => readFileSync(path.join(TMP_DIR, "contacts.json"), "utf8")).toThrow();
  });
});
