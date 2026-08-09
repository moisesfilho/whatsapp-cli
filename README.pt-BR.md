# whatsapp-cli

<p>
  <img src="https://img.shields.io/badge/version-v0.2.0-blue" alt="Versão">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="Licença">
  <img src="https://img.shields.io/badge/node-%3E%3D20-blue" alt="Node">
  <img src="https://img.shields.io/badge/tests-125%20passing-brightgreen" alt="Testes">
  <img src="https://img.shields.io/badge/coverage-100%25-brightgreen" alt="Cobertura">
</p>

**Languages:** [English](README.md) | [Português](README.pt-BR.md)

Envie mensagens do WhatsApp, para grupos e em lote, direto do terminal usando [Baileys](https://github.com/WhiskeySockets/Baileys) (WebSocket, sem navegador).

> **Aviso:** Esta ferramenta usa uma API não oficial do WhatsApp. Ela pode violar os Termos de Serviço do WhatsApp e seu número pode ser banido. Use apenas com seus próprios contatos e em volume moderado.

## Funcionalidades

- **Login** via QR code com sessão persistente (multi-dispositivo)
- **Envio** de mensagens de texto para contatos ou grupos
- **Envio em lote** a partir de arquivo CSV com validação `--dry-run`
- **Listagem de grupos** dos quais você participa
- **Histórico de envios** com retenção configurável (padrão 120 dias)
- **i18n** — interface em inglês e português (`config set --language`)
- Saída de terminal amigável

## Instalação

```bash
npm install -g .
```

Ou execute diretamente com Node:

```bash
node dist/cli.js --help
```

## Configuração inicial

1. Execute `whatsapp login`
2. Escaneie o QR code com seu celular (WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho)
3. A sessão é salva localmente e reutilizada nas próximas execuções

## Uso

```bash
# Parear com o WhatsApp
whatsapp login

# Verificar status da conexão
whatsapp status

# Enviar mensagem de texto para um contato
whatsapp send "Olá!" --to 5585981188645

# Enviar para contato ou grupo por nome parcial (seletor interativo:
# digite para filtrar, setas para navegar, Enter para confirmar)
whatsapp send "Olá!" --name "fami"

# Enviar mensagem de texto para um grupo (por nome ou id)
whatsapp send "Olá!" --group "Minha Família"

# Listar seus grupos
whatsapp groups

# Envio em lote a partir de CSV (colunas name,phone)
whatsapp send-batch contatos.csv "Feliz aniversário!" --dry-run
whatsapp send-batch contatos.csv "Feliz aniversário!" --interval 2000

# Mostrar histórico de envios
whatsapp history --limit 50

# Configuração
whatsapp config --show
whatsapp config --language pt
whatsapp config --log-days 30

# Remover a sessão local
whatsapp logout
```

### Formato CSV

```csv
name,phone
Alice,5585981188645
Bob,85999999999
```

O cabeçalho é opcional. Os números são normalizados (o código do país `55` é adicionado quando ausente).

## Configuração

Todos os arquivos ficam em `~/.config/whatsapp-cli/`:

| Caminho         | Finalidade                                         |
| --------------- | -------------------------------------------------- |
| `config.json`   | Configurações de idioma e retenção de logs         |
| `session/`      | Sessão multi-dispositivo do WhatsApp (credenciais) |
| `logs/`         | Reservado para logging futuro                      |
| `history.jsonl` | Histórico de envios                                |

Variáveis de ambiente:

| Variável                  | Descrição                                                 |
| ------------------------- | --------------------------------------------------------- |
| `WHATSAPP_CLI_LANGUAGE`   | Sobrescreve o idioma da interface (`en` ou `pt`)          |
| `WHATSAPP_CLI_CONFIG_DIR` | Sobrescreve o diretório de configuração (usado em testes) |

## Estrutura do projeto

```
src/
  cli.ts      # Ponto de entrada da CLI (commander)
  client.ts   # Conexão Baileys, sessão, motivos de desconexão
  config.ts   # Arquivo de config, diretórios, overrides de env
  csv.ts      # Parsing de CSV e extração de destinatários
  groups.ts   # Listagem e busca de grupos
  history.ts  # Histórico de envios (append, read, truncate)
  i18n.ts     # Catálogos inglês/português
  phone.ts    # Normalização de números e helpers de JID
  picker.ts   # Seletor interativo de destinatário com setas (readline)
  recipients.ts # Descoberta e filtro de contatos/grupos
  send.ts     # Envio individual e em lote
tests/        # Suíte Vitest (cobertura 100%)
```

## Qualidade

```bash
npm run lint         # ESLint (typescript-eslint strict + unicorn + sonarjs)
npm run format:check # Prettier
npm run typecheck    # tsc --noEmit
npm test             # Vitest com gate de cobertura 100%
npm audit            # Vulnerabilidades de dependências
```

## Licença

MIT
