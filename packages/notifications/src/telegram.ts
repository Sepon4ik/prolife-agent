const TELEGRAM_API = "https://api.telegram.org/bot";

interface TelegramOptions {
  parseMode?: "HTML" | "MarkdownV2";
  disableWebPagePreview?: boolean;
}

/**
 * Send a message via Telegram Bot API.
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars.
 */
export async function sendTelegramMessage(
  text: string,
  options: TelegramOptions = {}
): Promise<{ ok: boolean; messageId?: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set, skipping");
    return { ok: false };
  }

  const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: options.parseMode ?? "HTML",
      disable_web_page_preview: options.disableWebPagePreview ?? true,
    }),
  });

  const result = await response.json();

  if (!result.ok) {
    console.error("[Telegram] Failed to send message:", result.description);
    return { ok: false };
  }

  return { ok: true, messageId: result.result?.message_id };
}

/**
 * Send to a specific chat (override default TELEGRAM_CHAT_ID).
 */
export async function sendTelegramToChat(
  chatId: string,
  text: string,
  options: TelegramOptions = {}
): Promise<{ ok: boolean; messageId?: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN not set, skipping");
    return { ok: false };
  }

  const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: options.parseMode ?? "HTML",
      disable_web_page_preview: options.disableWebPagePreview ?? true,
    }),
  });

  const result = await response.json();

  if (!result.ok) {
    console.error("[Telegram] Failed to send message:", result.description);
    return { ok: false };
  }

  return { ok: true, messageId: result.result?.message_id };
}
