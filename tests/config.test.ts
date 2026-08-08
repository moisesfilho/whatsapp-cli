import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { homedir } from "node:os";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { configDir, i18n, loadConfig, saveConfig } from "../src/config.js";

const TMP_DIR = path.join(tmpdir(), "whatsapp-cli-config-test");

describe("config", () => {
  beforeEach(() => {
    process.env.WHATSAPP_CLI_CONFIG_DIR = TMP_DIR;
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    delete process.env.WHATSAPP_CLI_LANGUAGE;
    delete process.env.WHATSAPP_CLI_CONFIG_DIR;
  });

  it("returns defaults without a config file", () => {
    const config = loadConfig();
    expect(config.language).toBe("en");
    expect(config.logDays).toBe(120);
  });

  it("saves and loads config", () => {
    saveConfig({ language: "pt", logDays: 30 });
    const config = loadConfig();
    expect(config.language).toBe("pt");
    expect(config.logDays).toBe(30);
  });

  it("env language overrides file", () => {
    saveConfig({ language: "en", logDays: 30 });
    process.env.WHATSAPP_CLI_LANGUAGE = "pt";
    expect(loadConfig().language).toBe("pt");
  });

  it("ignores invalid language in file", () => {
    saveConfig({ language: "fr", logDays: 30 });
    expect(loadConfig().language).toBe("en");
  });

  it("ignores invalid logDays in file", () => {
    saveConfig({ language: "en", logDays: -5 });
    expect(loadConfig().logDays).toBe(120);
  });

  it("tolerates a corrupt config file", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(path.join(TMP_DIR, "config.json"), "{ not json", "utf8");
    expect(loadConfig().language).toBe("en");
  });

  it("builds an I18n instance from config language", () => {
    const translator = i18n({ language: "pt" });
    expect(translator.t("login.success")).toBe("Login realizado com sucesso!");
  });

  it("falls back to the home dir when config dir env is unset", () => {
    delete process.env.WHATSAPP_CLI_CONFIG_DIR;
    expect(configDir()).toBe(path.join(homedir(), ".config", "whatsapp-cli"));
  });
});
