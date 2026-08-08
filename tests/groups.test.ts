import { describe, expect, it, vi } from "vitest";
import { findGroup, listGroups } from "../src/groups.js";
import { GROUP_SUFFIX } from "../src/phone.js";

function makeSocketFromGroups(
  groups: Record<string, { subject: string; participants?: unknown[] }>,
) {
  return {
    groupFetchAllParticipating: vi.fn().mockResolvedValue(groups),
  } as never;
}

describe("listGroups", () => {
  it("maps metadata and sorts by name", async () => {
    const socket = makeSocketFromGroups({
      "group2@g.us": { subject: "Zeta", participants: [{}, {}, {}] },
      "group1@g.us": { subject: "Alpha", participants: [{}] },
    });
    const groups = await listGroups(socket);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.name).toBe("Alpha");
    expect(groups[0]?.memberCount).toBe(1);
    expect(groups[1]?.name).toBe("Zeta");
    expect(groups[1]?.memberCount).toBe(3);
  });

  it("handles empty groups", async () => {
    const socket = makeSocketFromGroups({});
    const groups = await listGroups(socket);
    expect(groups).toHaveLength(0);
  });

  it("handles missing subject", async () => {
    const id = `120363000000${GROUP_SUFFIX}`;
    const socket = makeSocketFromGroups({ [id]: { participants: [] } });
    const groups = await listGroups(socket);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe("Unknown");
    expect(groups[0]?.memberCount).toBe(0);
  });
});

describe("findGroup", () => {
  it("finds by full id", async () => {
    const id = `120363000001${GROUP_SUFFIX}`;
    const socket = makeSocketFromGroups({ [id]: { subject: "Team", participants: [] } });
    const found = await findGroup(socket, id);
    expect(found).toBe(id);
  });

  it("finds by id without suffix", async () => {
    const id = `120363000002${GROUP_SUFFIX}`;
    const socket = makeSocketFromGroups({ [id]: { subject: "Team", participants: [] } });
    const found = await findGroup(socket, "120363000002");
    expect(found).toBe(id);
  });

  it("finds by name (case insensitive)", async () => {
    const id = `120363000003${GROUP_SUFFIX}`;
    const socket = makeSocketFromGroups({ [id]: { subject: "The Family", participants: [] } });
    const found = await findGroup(socket, "the family");
    expect(found).toBe(id);
  });

  it("returns null when not found", async () => {
    const id = `120363000004${GROUP_SUFFIX}`;
    const socket = makeSocketFromGroups({ [id]: { subject: "Team", participants: [] } });
    const found = await findGroup(socket, "nope");
    expect(found).toBeNull();
  });
});
