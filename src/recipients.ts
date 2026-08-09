import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Contact } from "baileys";
import type { WaClient } from "./client.js";
import { configDir } from "./config.js";
import { listGroups } from "./groups.js";
import { PHONE_SUFFIX, stripJidSuffix } from "./phone.js";

export interface Recipient {
  jid: string;
  name: string;
  type: "contact" | "group";
}

interface ContactsCache {
  account: string;
  contacts: Array<{ jid: string; name: string }>;
}

function contactsCacheFile(): string {
  return path.join(configDir(), "contacts.json");
}

export function loadContactsCache(account?: string): Map<string, Recipient> {
  let file: ContactsCache;
  try {
    file = JSON.parse(readFileSync(contactsCacheFile(), "utf8")) as ContactsCache;
  } catch {
    return new Map();
  }
  if (account !== undefined && file.account !== account) {
    return new Map();
  }
  const contacts = new Map<string, Recipient>();
  for (const item of file.contacts) {
    contacts.set(item.jid, { jid: item.jid, name: item.name, type: "contact" });
  }
  return contacts;
}

export function saveContactsCache(account: string, contacts: Map<string, Recipient>): void {
  mkdirSync(configDir(), { recursive: true });
  const file = contactsCacheFile();
  const payload: ContactsCache = {
    account,
    contacts: [...contacts]
      .map(([, recipient]) => ({ jid: recipient.jid, name: recipient.name }))
      .toSorted((a, b) => a.jid.localeCompare(b.jid)),
  };
  writeFileSync(`${file}.tmp`, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  renameSync(`${file}.tmp`, file);
}

function sortRecipients(a: Recipient, b: Recipient): number {
  const byName = a.name.localeCompare(b.name);
  if (byName !== 0) {
    return byName;
  }
  if (a.type === b.type) {
    return 0;
  }
  return a.type === "contact" ? -1 : 1;
}

export function isSelectableContact(recipient: Recipient): boolean {
  return recipient.jid.endsWith(PHONE_SUFFIX) && recipient.name !== recipient.jid;
}

export interface ContactCollector {
  contacts: Map<string, Recipient>;
  finish: () => void;
}

export function startCollectingContacts(socket: WaClient): ContactCollector {
  const contacts = new Map<string, Recipient>();
  const merge = (items: Contact[]): void => {
    for (const contact of items) {
      const jid = contact.jid ?? contact.id;
      if (!jid) {
        continue;
      }
      const previous = contacts.get(jid);
      const resolvedName = contact.name ?? contact.notify ?? contact.verifiedName;
      contacts.set(jid, {
        jid,
        name: resolvedName ?? previous?.name ?? jid,
        type: "contact",
      });
    }
  };
  const upsertHandler = (items: Contact[]): void => {
    merge(items);
  };
  const historyHandler = (data: { contacts?: Contact[] }): void => {
    if (data.contacts !== undefined) {
      merge(data.contacts);
    }
  };
  socket.ev.on("contacts.upsert", upsertHandler);
  socket.ev.on("messaging-history.set", historyHandler);
  const finish = (): void => {
    socket.ev.off("contacts.upsert", upsertHandler);
    socket.ev.off("messaging-history.set", historyHandler);
    const account = socket.user?.id;
    if (account !== undefined) {
      const merged = new Map(loadContactsCache(account));
      for (const [jid, recipient] of contacts) {
        merged.set(jid, recipient);
      }
      saveContactsCache(account, merged);
    }
  };
  return { contacts, finish };
}

export async function collectContacts(
  socket: WaClient,
  settleMs = 2500,
): Promise<Map<string, Recipient>> {
  const account = socket.user?.id;
  const contacts = loadContactsCache(account);
  const collector = startCollectingContacts(socket);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, settleMs);
  });
  collector.finish();
  for (const [jid, recipient] of collector.contacts) {
    contacts.set(jid, recipient);
  }
  return contacts;
}

export async function listRecipients(socket: WaClient, settleMs?: number): Promise<Recipient[]> {
  const [contacts, groups] = await Promise.all([
    collectContacts(socket, settleMs),
    listGroups(socket),
  ]);
  const byJid = new Map([...contacts].filter(([, recipient]) => isSelectableContact(recipient)));
  for (const group of groups) {
    byJid.set(group.id, { jid: group.id, name: group.name, type: "group" });
  }
  return [...byJid].map(([, recipient]) => recipient).toSorted(sortRecipients);
}

export function filterRecipients(recipients: Recipient[], query: string): Recipient[] {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") {
    return [...recipients].toSorted(sortRecipients);
  }
  return recipients
    .filter((recipient) => {
      return (
        recipient.name.toLowerCase().includes(normalized) ||
        stripJidSuffix(recipient.jid).toLowerCase().includes(normalized)
      );
    })
    .toSorted(sortRecipients);
}
