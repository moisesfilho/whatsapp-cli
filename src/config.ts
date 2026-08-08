import { homedir } from "node:os";
import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isLanguage, type Language, I18n } from "./i18n.js";

export type Config = { language: Language; logDays: number };

export const DEFAULTS: Config = { language: "en", logDays: 120 };

function baseConfigDir(): string {
  return process.env.WHATSAPP_CLI_CONFIG_DIR ?? path.join(homedir(), ".config", "whatsapp-cli");
}

export function configDir(): string {
  return baseConfigDir();
}

export function sessionDir(): string {
  return path.join(baseConfigDir(), "session");
}

export function logDir(): string {
  return path.join(baseConfigDir(), "logs");
}

export function configFile(): string {
  return path.join(baseConfigDir(), "config.json");
}

export function historyFile(): string {
  return path.join(baseConfigDir(), "history.jsonl");
}

function envLanguage(): Language | null {
  const value = process.env.WHATSAPP_CLI_LANGUAGE;
  return value !== undefined && isLanguage(value) ? value : null;
}

export function ensureDirs(): void {
  for (const dir of [configDir(), sessionDir(), logDir()]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): Config {
  ensureDirs();
  let file: Partial<Config>;
  try {
    file = JSON.parse(readFileSync(configFile(), "utf8")) as Partial<Config>;
  } catch {
    file = {};
  }
  const envLang = envLanguage();
  const fileLang =
    file.language !== undefined && isLanguage(file.language) ? file.language : undefined;
  return {
    language: envLang ?? fileLang ?? DEFAULTS.language,
    logDays: typeof file.logDays === "number" && file.logDays > 0 ? file.logDays : DEFAULTS.logDays,
  };
}

export function saveConfig(config: Config): void {
  ensureDirs();
  writeFileSync(configFile(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function i18n(config: Pick<Config, "language">): I18n {
  return new I18n(config.language);
}
