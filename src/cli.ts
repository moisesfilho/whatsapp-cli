#!/usr/bin/env node

import { Command } from "commander";
import qrcode from "qrcode-terminal";
import { loadConfig, saveConfig, i18n, sessionDir } from "./config.js";
import {
  connect,
  logout,
  hasSession,
  waitForConnection,
  waitForRegistration,
  type WaClient,
} from "./client.js";
import { sendText, sendBatch } from "./send.js";
import { listGroups, findGroup } from "./groups.js";
import { recipientsFromCsv, readCsvFile } from "./csv.js";
import { readHistory, truncateHistory } from "./history.js";
import { isLanguage } from "./i18n.js";
import { toPhoneJid } from "./phone.js";

async function main(): Promise<void> {
  const program = new Command();
  const config = loadConfig();
  const translator = i18n(config);
  const t = translator.t.bind(translator);

  program
    .name("whatsapp")
    .description("Send WhatsApp messages, groups and batch sends from the terminal")
    .version("0.1.0");

  async function withSocket<TReturn>(
    action: (socket: WaClient) => TReturn | Promise<TReturn>,
  ): Promise<TReturn> {
    const socket = await connect({ sessionDir: sessionDir() });
    try {
      const result = await waitForConnection(socket);
      if (result === "logged-out") {
        throw new Error(t("error.unauthorized"));
      }
      if (result !== "open") {
        throw new Error(t("error.connection", { error: "timeout" }));
      }
      const registered = await waitForRegistration(socket);
      if (!registered) {
        throw new Error(t("error.registration"));
      }
      return await action(socket);
    } finally {
      socket.end(undefined);
    }
  }

  program
    .command("login")
    .description("Pair with WhatsApp via QR code")
    .action(async () => {
      if (hasSession(sessionDir())) {
        console.log(t("login.already_paired"));
        return;
      }
      let socket = await connect({
        sessionDir: sessionDir(),
        onQr: (qr) => {
          console.log(`\n${t("login.pairing")}\n`);
          qrcode.generate(qr, { small: true });
        },
      });
      let result = await waitForConnection(socket, 300_000);
      while (result === "restart") {
        socket.end(undefined);
        socket = await connect({ sessionDir: sessionDir() });
        result = await waitForConnection(socket, 300_000);
      }
      if (result === "logged-out") {
        console.error(t("error.unauthorized"));
        process.exitCode = 1;
      } else if (result === "timeout") {
        console.error(t("error.connection", { error: "timeout" }));
        process.exitCode = 1;
      } else {
        const registered = await waitForRegistration(socket);
        if (registered) {
          console.log(`\n${t("login.success")}`);
        } else {
          console.error(t("error.registration"));
          process.exitCode = 1;
        }
      }
      socket.end(undefined);
    });

  program
    .command("status")
    .description("Show connection status")
    .action(async () => {
      if (!hasSession(sessionDir())) {
        console.log(t("error.not_logged_in"));
        process.exitCode = 1;
        return;
      }
      await withSocket((socket) => {
        const name = socket.user?.name ?? socket.user?.id ?? "";
        console.log(t("status.connected", { name }));
      });
    });

  program
    .command("send")
    .description("Send a text message to a contact or group")
    .argument("<text>", "Message text")
    .option("--to <number>", "Phone number (e.g. 5585981188645)")
    .option("--group <nameOrId>", "Group name or id")
    .action(async (text: string, options: { to?: string; group?: string }) => {
      await withSocket(async (socket) => {
        if (options.group !== undefined) {
          const jid = await findGroup(socket, options.group);
          if (jid === null) {
            console.error(t("error.group.not_found", { group: options.group }));
            process.exitCode = 1;
            return;
          }
          const result = await sendText(socket, jid, text);
          if (result.ok) {
            console.log(t("send.success", { target: options.group, id: result.id ?? "" }));
          } else {
            console.error(
              t("error.send_failed", { target: options.group, error: result.error ?? "" }),
            );
            process.exitCode = 1;
          }
          return;
        }
        const raw = options.to ?? "";
        const jid = toPhoneJid(raw);
        if (!jid.endsWith("@s.whatsapp.net")) {
          console.error(t("error.invalid_number", { number: raw }));
          process.exitCode = 1;
          return;
        }
        const result = await sendText(socket, jid, text);
        if (result.ok) {
          console.log(t("send.success", { target: raw, id: result.id ?? "" }));
        } else {
          console.error(t("error.send_failed", { target: raw, error: result.error ?? "" }));
          process.exitCode = 1;
        }
      });
    });

  program
    .command("send-batch")
    .description("Send a message to a list of recipients from a CSV file")
    .argument("<file>", "CSV file with columns name,phone")
    .argument("<text>", "Message text")
    .option("--dry-run", "Validate recipients without sending")
    .option("--interval <ms>", "Delay between sends in ms", Number, 500)
    .action(
      async (file: string, text: string, options: { dryRun?: boolean; interval?: number }) => {
        let recipients;
        try {
          recipients = recipientsFromCsv(readCsvFile(file));
        } catch {
          console.error(t("error.file_not_found", { file }));
          process.exitCode = 1;
          return;
        }
        if (recipients.length === 0) {
          console.error(t("error.empty_recipients"));
          process.exitCode = 1;
          return;
        }
        const total = recipients.length;
        console.log(t("batch.header", { total }));
        const { sent, failed } = await withSocket(async (socket) => {
          return await sendBatch(socket, recipients, text, {
            dryRun: options.dryRun,
            onProgress: (completed) => {
              console.log(t("batch.progress", { completed, total }));
            },
          });
        });
        console.log(t("send.summary", { sent, total, errors: failed }));
      },
    );

  program
    .command("groups")
    .description("List groups you participate in")
    .action(async () => {
      await withSocket(async (socket) => {
        const groups = await listGroups(socket);
        if (groups.length === 0) {
          console.log(t("groups.empty"));
          return;
        }
        console.log(t("groups.available"));
        for (const group of groups) {
          console.log(
            t("groups.detail", {
              name: group.name,
              id: group.id,
              size: group.memberCount,
            }),
          );
        }
      });
    });

  program
    .command("history")
    .description("Show message delivery history")
    .option("--limit <n>", "Number of entries", Number, 100)
    .action((options: { limit: number }) => {
      const entries = readHistory(options.limit);
      for (const entry of entries) {
        let extra = "";
        if (entry.status === "failed") {
          extra = ` error=${entry.error ?? ""}`;
        } else if (entry.messageId) {
          extra = ` (${entry.messageId})`;
        }
        console.log(`${entry.timestamp} ${entry.jid} ${entry.status}${extra}`);
      }
    });

  program
    .command("config")
    .description("Show or set configuration (language, log-days)")
    .option("--show", "Show current config")
    .option("--language <code>", "Set interface language (en|pt)")
    .option("--log-days <n>", "History retention in days", Number)
    .action((options: { show?: boolean; language?: string; logDays?: number }) => {
      const current = loadConfig();
      if (options.language !== undefined) {
        if (!isLanguage(options.language)) {
          console.error(t("config.invalid", { key: "language" }));
          process.exitCode = 1;
          return;
        }
        saveConfig({ ...current, language: options.language });
        console.log(t("config.set", { key: "language", value: options.language }));
        return;
      }
      if (options.logDays !== undefined) {
        if (!Number.isFinite(options.logDays) || options.logDays <= 0) {
          console.error(t("config.invalid", { key: "logDays" }));
          process.exitCode = 1;
          return;
        }
        saveConfig({ ...current, logDays: options.logDays });
        console.log(t("config.set", { key: "logDays", value: options.logDays }));
        return;
      }
      const shown = loadConfig();
      console.log(t("config.show", { config: JSON.stringify(shown) }));
    });

  program
    .command("logout")
    .description("Remove the local WhatsApp session (unpair)")
    .action(() => {
      logout(sessionDir());
      console.log(t("logout.done"));
    });

  await program.parseAsync(process.argv);
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

truncateHistory(loadConfig().logDays);
