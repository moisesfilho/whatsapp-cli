import { describe, expect, it } from "vitest";
import {
  intToDate,
  isGroupJid,
  isValidPhoneNumber,
  normalizePhoneNumber,
  PHONE_SUFFIX,
  GROUP_SUFFIX,
  stripJidSuffix,
  toPhoneJid,
} from "../src/phone.js";

const PHONE_NUMBER = "5585981188645";
const PHONE_JID = `${PHONE_NUMBER}${PHONE_SUFFIX}`;
const GROUP_ID = "120363123456789";
const GROUP_JID = `${GROUP_ID}${GROUP_SUFFIX}`;

describe("normalizePhoneNumber", () => {
  it("keeps a jid-encoded number", () => {
    expect(normalizePhoneNumber(PHONE_JID)).toBe(PHONE_JID);
  });

  it("encodes a brazilian number", () => {
    expect(normalizePhoneNumber(PHONE_NUMBER)).toBe(PHONE_JID);
  });

  it("adds 55 prefix when missing", () => {
    expect(normalizePhoneNumber("85981188645")).toBe(`5585981188645${PHONE_SUFFIX}`);
  });

  it("strips non-digit characters", () => {
    expect(normalizePhoneNumber("+55 (85) 98118-8645")).toBe(PHONE_JID);
  });

  it("returns null for too-short numbers", () => {
    expect(normalizePhoneNumber("123")).toBeNull();
  });

  it("returns null for too-long numbers", () => {
    expect(normalizePhoneNumber("12345678901234567890123")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(normalizePhoneNumber("")).toBeNull();
  });
});

describe("toPhoneJid", () => {
  it("keeps existing jids", () => {
    expect(toPhoneJid(PHONE_JID)).toBe(PHONE_JID);
  });

  it("converts plain numbers", () => {
    expect(toPhoneJid("85981188645")).toBe(PHONE_JID);
  });

  it("returns group jids unchanged", () => {
    expect(toPhoneJid(GROUP_JID)).toBe(GROUP_JID);
  });

  it("returns raw when number invalid", () => {
    expect(toPhoneJid("invalid")).toBe("invalid");
  });
});

describe("isGroupJid", () => {
  it("detects group jids", () => {
    expect(isGroupJid(GROUP_JID)).toBe(true);
  });

  it("rejects non-group jids", () => {
    expect(isGroupJid(PHONE_JID)).toBe(false);
    expect(isGroupJid("foo")).toBe(false);
  });
});

describe("isValidPhoneNumber", () => {
  it("validates", () => {
    expect(isValidPhoneNumber(PHONE_NUMBER)).toBe(true);
    expect(isValidPhoneNumber("12")).toBe(false);
  });
});

describe("intToDate", () => {
  it("converts unix seconds to Date", () => {
    const d = intToDate(1_000_000_000);
    expect(d.toISOString()).toBe("2001-09-09T01:46:40.000Z");
  });
});

describe("stripJidSuffix", () => {
  it("strips the suffix", () => {
    expect(stripJidSuffix(GROUP_JID)).toBe(GROUP_ID);
  });

  it("handles missing @", () => {
    expect(stripJidSuffix("abc")).toBe("abc");
  });
});
