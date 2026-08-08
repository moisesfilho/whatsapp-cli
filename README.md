# whatsapp-cli

<p>
  <img src="https://img.shields.io/badge/version-v0.1.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D20-blue" alt="Node">
  <img src="https://img.shields.io/badge/tests-79%20passing-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/coverage-100%25-brightgreen" alt="Coverage">
</p>

**Languages:** [English](README.md) | [Português](README.pt-BR.md)

Send WhatsApp messages, groups and batch sends from the terminal using [Baileys](https://github.com/WhiskeySockets/Baileys) (WebSocket, no browser).

> **Disclaimer:** This tool uses an unofficial WhatsApp API. It may violate WhatsApp's Terms of Service and your number can be banned. Use it only with your own contacts and at moderate volume.

## Features

- **Login** via QR code with persistent session (multi-device)
- **Send** text messages to contacts or groups
- **Batch send** from a CSV file with `--dry-run` validation
- **List groups** you participate in
- **Delivery history** with configurable retention (default 120 days)
- **i18n** — English and Portuguese interface (`config set --language`)
- **Dark-mode friendly** terminal output

## Installation

```bash
npm install -g .
```

Or run directly with Node:

```bash
node dist/cli.js --help
```

## Setup

1. Run `whatsapp login`
2. Scan the QR code with your phone (WhatsApp → Settings → Linked devices → Link a device)
3. The session is stored locally and reused on next runs

## Usage

```bash
# Pair with WhatsApp
whatsapp login

# Check connection status
whatsapp status

# Send a text message to a contact
whatsapp send "Hello!" --to 5585981188645

# Send a text message to a group (by name or id)
whatsapp send "Hello!" --group "My Family"

# List your groups
whatsapp groups

# Batch send from a CSV file (name,phone columns)
whatsapp send-batch contacts.csv "Happy birthday!" --dry-run
whatsapp send-batch contacts.csv "Happy birthday!" --interval 2000

# Show delivery history
whatsapp history --limit 50

# Configuration
whatsapp config --show
whatsapp config --language pt
whatsapp config --log-days 30

# Remove the local session
whatsapp logout
```

### CSV format

```csv
name,phone
Alice,5585981188645
Bob,85999999999
```

The header is optional. Phone numbers are normalized (country code `55` is added when missing).

## Configuration

All files are stored in `~/.config/whatsapp-cli/`:

| Path            | Purpose                                     |
| --------------- | ------------------------------------------- |
| `config.json`   | Language and log retention settings         |
| `session/`      | WhatsApp multi-device session (credentials) |
| `logs/`         | Reserved for future logging                 |
| `history.jsonl` | Message delivery history                    |

Environment variables:

| Variable                  | Description                                   |
| ------------------------- | --------------------------------------------- |
| `WHATSAPP_CLI_LANGUAGE`   | Override interface language (`en` or `pt`)    |
| `WHATSAPP_CLI_CONFIG_DIR` | Override the config directory (used in tests) |

## Project structure

```
src/
  cli.ts      # CLI entry point (commander)
  client.ts   # Baileys connection, session, disconnect reasons
  config.ts   # Config file, directories, env overrides
  csv.ts      # CSV parsing and recipient extraction
  groups.ts   # Group listing and lookup
  history.ts  # Delivery history (append, read, truncate)
  i18n.ts     # English/Portuguese catalogs
  phone.ts    # Phone number normalization and JID helpers
  send.ts     # Single and batch message sending
tests/        # Vitest suite (100% coverage)
```

## Quality

```bash
npm run lint        # ESLint (typescript-eslint strict + unicorn + sonarjs)
npm run format:check # Prettier
npm run typecheck   # tsc --noEmit
npm test            # Vitest with 100% coverage gate
npm audit           # Dependency vulnerabilities
```

## License

MIT
