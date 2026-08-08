import { describe, expect, it } from "vitest";
import { I18n, isLanguage } from "../src/i18n.js";

describe("I18n", () => {
  it("defaults to english", () => {
    const i = new I18n();
    expect(i.language).toBe("en");
  });

  it("translates to portuguese", () => {
    const i = new I18n("pt");
    expect(i.t("login.success")).toBe("Login realizado com sucesso!");
  });

  it("interpolates params", () => {
    const i = new I18n();
    expect(i.t("send.success", { target: "A", id: "B" })).toBe("Message sent to A (id: B)");
  });

  it("falls back to key when missing", () => {
    const i = new I18n();
    expect(i.t("unknown.key")).toBe("unknown.key");
  });

  it("falls back to english when pt key missing", () => {
    const i = new I18n("pt");
    expect(i.t("not.in.pt")).toBe("not.in.pt");
  });

  it("supports switching language", () => {
    const i = new I18n();
    i.setLanguage("pt");
    expect(i.language).toBe("pt");
    expect(i.t("error.not_logged_in")).toMatch(/Não autenticado/);
  });
});

describe("isLanguage", () => {
  it("accepts en and pt", () => {
    expect(isLanguage("en")).toBe(true);
    expect(isLanguage("pt")).toBe(true);
  });

  it("rejects others", () => {
    expect(isLanguage("fr")).toBe(false);
    expect(isLanguage("")).toBe(false);
  });
});
