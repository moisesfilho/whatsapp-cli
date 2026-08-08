import { readFileSync } from "node:fs";
import { normalizePhoneNumber } from "./phone.js";

export type CsvRow = { name?: string; phone?: string };

export interface RecipientInput {
  lineNumber: number;
  name?: string;
  phone: string;
}

function detectHeader(lines: string[]): boolean {
  const first = lines[0];
  if (first === undefined) {
    return false;
  }
  const header = first.toLowerCase();
  return (
    header.includes("name") ||
    header.includes("numero") ||
    header.includes("nomes") ||
    header.includes("números") ||
    header.includes("phone") ||
    header.includes("number") ||
    header.includes("telefone") ||
    header.includes("contato")
  );
}

export function parseCsv(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const hasHeader = detectHeader(lines);

  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    const [nameRaw, phoneRaw] = splitCsvLine(line);
    return {
      name: unquote(nameRaw?.trim()) || undefined,
      phone: unquote(phoneRaw?.trim()) ?? "",
    };
  });
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function unquote(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replaceAll('""', '"');
  }
  return trimmed;
}

export function recipientsFromCsv(text: string): RecipientInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const hasHeader = detectHeader(lines);

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rowOffset = hasHeader ? 2 : 1;
  const result: RecipientInput[] = [];

  for (const [index, line] of dataLines.entries()) {
    const [nameRaw, phoneRaw] = splitCsvLine(line);
    const phone = unquote(phoneRaw?.trim()) ?? "";
    if (phone.length === 0) {
      continue;
    }
    const jid = normalizePhoneNumber(phone);
    if (jid === null) {
      continue;
    }
    result.push({
      lineNumber: index + rowOffset,
      name: unquote(nameRaw?.trim()),
      phone: jid,
    });
  }

  return result;
}

export function readCsvFile(file: string): string {
  return readFileSync(file, "utf8");
}
