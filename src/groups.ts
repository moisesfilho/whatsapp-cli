import type { WaClient } from "./client.js";
import { stripJidSuffix } from "./phone.js";

export interface GroupInfo {
  id: string;
  name: string;
  memberCount: number;
}

export async function listGroups(socket: WaClient): Promise<GroupInfo[]> {
  const groups = await socket.groupFetchAllParticipating();
  return Object.entries(groups)
    .map(([id, metadata]) => ({
      id,
      name: metadata.subject || "Unknown",
      memberCount: metadata.participants.length,
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

export async function findGroup(socket: WaClient, query: string): Promise<string | null> {
  const groups = await listGroups(socket);
  const normalized = query.toLowerCase();
  const match = groups.find((group) => {
    return (
      group.id === query ||
      stripJidSuffix(group.id) === query ||
      group.name.toLowerCase() === normalized
    );
  });
  return match?.id ?? null;
}
