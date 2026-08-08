import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseCsv, readCsvFile, recipientsFromCsv } from "../src/csv.js";
import { PHONE_SUFFIX } from "../src/phone.js";

describe("parseCsv", () => {
  it("parses rows with header", () => {
    const rows = parseCsv("name,phone\nAlice,5585981188645\nBob,85999999999\n");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Alice", phone: "5585981188645" });
    expect(rows[1]).toEqual({ name: "Bob", phone: "85999999999" });
  });

  it("parses rows without header", () => {
    const rows = parseCsv("Alice,5585981188645\nBob,85999999999\n");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe("Alice");
  });

  it("handles quoted values", () => {
    const rows = parseCsv('"Doe, John",5585981188645\n');
    expect(rows[0]?.name).toBe("Doe, John");
  });

  it("returns empty for empty input", () => {
    expect(parseCsv("")).toHaveLength(0);
    expect(parseCsv("\n\n")).toHaveLength(0);
  });

  it("detects header from number columns too", () => {
    const rows = parseCsv("nome,numero\nMaria,5585981188645\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Maria");
  });

  it("skips blank lines", () => {
    const rows = parseCsv("name,phone\n\nAlice,5585981188645\n\n");
    expect(rows).toHaveLength(1);
  });

  it("handles a row without comma (only name)", () => {
    const rows = parseCsv("name,phone\nAlice\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Alice");
    expect(rows[0]?.phone).toBe("");
  });
});

describe("recipientsFromCsv", () => {
  it("builds recipients with jids and line numbers", () => {
    const result = recipientsFromCsv("name,phone\nAlice,5585981188645\nBob,12\n");
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Alice");
    expect(result[0]?.phone).toBe(`5585981188645${PHONE_SUFFIX}`);
    expect(result[0]?.lineNumber).toBe(2);
  });

  it("returns empty when no valid rows", () => {
    expect(recipientsFromCsv("x,12\ny,")).toHaveLength(0);
  });

  it("returns empty for empty input", () => {
    expect(recipientsFromCsv("")).toHaveLength(0);
  });

  it("skips rows with empty phone", () => {
    const result = recipientsFromCsv("Alice,\nBob,5585981188645\n");
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Bob");
  });

  it("skips rows without a comma", () => {
    const result = recipientsFromCsv("name,phone\njust-a-name\n");
    expect(result).toHaveLength(0);
  });

  it("records empty name as undefined (parseCsv)", () => {
    const rows = parseCsv("name,phone\n,5585981188645\n");
    expect(rows[0]?.name).toBeUndefined();
  });
});

describe("readCsvFile", () => {
  it("reads a file from disk", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "whatsapp-cli-csv-"));
    const file = path.join(dir, "list.csv");
    writeFileSync(file, "name,phone\nAlice,5585981188645\n", "utf8");
    expect(readCsvFile(file)).toContain("Alice");
    rmSync(dir, { recursive: true, force: true });
  });
});
