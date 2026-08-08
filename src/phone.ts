export const PHONE_SUFFIX = "@s.whatsapp.net";
export const GROUP_SUFFIX = "@g.us";

export function normalizePhoneNumber(input: string): string | null {
  const digits = input.replaceAll(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return null;
  }
  let number = digits;
  if (number.length >= 10 && !number.startsWith("55")) {
    number = `55${number}`;
  }
  return `${number}${PHONE_SUFFIX}`;
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith(GROUP_SUFFIX);
}

export function toPhoneJid(jid: string): string {
  return jid.endsWith(PHONE_SUFFIX) || jid.endsWith(GROUP_SUFFIX)
    ? jid
    : (normalizePhoneNumber(jid) ?? jid);
}

export function isValidPhoneNumber(input: string): boolean {
  return normalizePhoneNumber(input) !== null;
}

export function intToDate(value: number): Date {
  return new Date(value * 1000);
}

export function stripJidSuffix(jid: string): string {
  const at = jid.indexOf("@");
  return at === -1 ? jid : jid.slice(0, at);
}
