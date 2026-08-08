export type Language = "en" | "pt";

type Catalog = Record<string, string>;

const catalogEn: Catalog = {
  "error.unauthorized": "Session expired. Run `whatsapp login` again.",
  "error.restart.required": "Restart your WhatsApp client and run `whatsapp login` again.",
  "error.connection": "Could not connect to WhatsApp: {error}",
  "error.registration": "Device registration did not complete. Run `whatsapp login` again.",
  "error.not_logged_in": "Not authenticated. Run `whatsapp login` first to pair with QR code.",
  "error.invalid_number": "Invalid phone number: {number}",
  "error.not_on_whatsapp": "{number} is not registered on WhatsApp.",
  "error.file_not_found": "File not found: {file}",
  "error.csv.invalid": "Invalid CSV: {reason}",
  "error.group.not_found": "Group not found: {group}",
  "error.empty_recipients": "No valid recipients to send to.",
  "error.send_failed": "Failed to send message to {target}: {error}",
  "login.pairing": "Scan this QR code with WhatsApp on your phone:",
  "login.qr": "Pairing code: {code}",
  "login.success": "Logged in successfully!",
  "login.already_paired": "Already paired. Run `whatsapp status` to check.",
  "login.waiting": "Waiting for QR scan... (Ctrl+C to cancel)",
  "status.connected": "Connected to WhatsApp as {name}",
  "status.disconnected": "Disconnected: {reason}",
  "status.closed": "Session closed.",
  "send.success": "Message sent to {target} (id: {id})",
  "send.dry_run": "[DRY-RUN] Would send to {target}: {text}",
  "send.summary": "Sent {sent}/{total}. Errors: {errors}",
  "batch.header": "Sending {total} messages...",
  "batch.progress": "Progress: {completed}/{total}",
  "logout.done": "Local session removed. WhatsApp keeps the paired device.",
  "groups.available": "Your groups:",
  "groups.empty": "No groups found.",
  "groups.detail": "{name} ({id}) - {size} members",
  "history.success": "History available at {file}",
  "config.show": "Config: {config}",
  "config.set": "Config key {key} set to {value}",
  "config.invalid": "Invalid config value for {key}",
  "config.invalid_file": "Config file not found: {file}",
};

const catalogPt: Catalog = {
  "error.unauthorized": "Sessão expirada. Execute `whatsapp login` novamente.",
  "error.restart.required": "Reinicie o app e execute `whatsapp login` novamente.",
  "error.connection": "Não foi possível conectar ao WhatsApp: {error}",
  "error.registration":
    "O registro do dispositivo não foi concluído. Execute `whatsapp login` novamente.",
  "error.not_logged_in":
    "Não autenticado. Execute `whatsapp login` primeiro para parear via QR code.",
  "error.invalid_number": "Número de telefone inválido: {number}",
  "error.not_on_whatsapp": "{number} não está registrado no WhatsApp.",
  "error.file_not_found": "Arquivo não encontrado: {file}",
  "error.csv.invalid": "CSV inválido: {reason}",
  "error.group.not_found": "Grupo não encontrado: {group}",
  "error.empty_recipients": "Nenhum destinatário válido para envio.",
  "error.send_failed": "Falha ao enviar mensagem para {target}: {error}",
  "login.pairing": "Escaneie este QR code com o WhatsApp no seu celular:",
  "login.qr": "Código de pareamento: {code}",
  "login.success": "Login realizado com sucesso!",
  "login.already_paired": "Já pareado. Execute `whatsapp status` para verificar.",
  "login.waiting": "Aguardando leitura do QR code... (Ctrl+C para cancelar)",
  "status.connected": "Conectado ao WhatsApp como {name}",
  "status.disconnected": "Desconectado: {reason}",
  "status.closed": "Sessão encerrada.",
  "send.success": "Mensagem enviada para {target} (id: {id})",
  "send.dry_run": "[DRY-RUN] Enviaria para {target}: {text}",
  "send.summary": "Enviadas {sent}/{total}. Erros: {errors}",
  "batch.header": "Enviando {total} mensagens...",
  "batch.progress": "Progresso: {completed}/{total}",
  "logout.done": "Sessão local removida. O WhatsApp mantém o dispositivo pareado.",
  "groups.available": "Seus grupos:",
  "groups.empty": "Nenhum grupo encontrado.",
  "groups.detail": "{name} ({id}) - {size} membros",
  "history.success": "Histórico disponível em {file}",
  "config.show": "Config: {config}",
  "config.set": "Chave {key} definida como {value}",
  "config.invalid": "Valor inválido para config {key}",
  "config.invalid_file": "Arquivo de config não encontrado: {file}",
};

const catalogs: Record<Language, Catalog> = {
  en: catalogEn,
  pt: catalogPt,
};

export class I18n {
  private lang: Language;

  constructor(lang: Language = "en") {
    this.lang = lang;
  }

  setLanguage(lang: Language): void {
    this.lang = lang;
  }

  get language(): Language {
    return this.lang;
  }

  t(key: string, params?: Record<string, string | number>): string {
    const template = catalogs[this.lang][key] ?? key;
    let out = template;
    const entries = Object.entries(params ?? {});
    for (const [k, v] of entries) {
      out = out.replaceAll(`{${k}}`, () => String(v));
    }
    return out;
  }
}

export function isLanguage(value: string): value is Language {
  return value === "en" || value === "pt";
}
