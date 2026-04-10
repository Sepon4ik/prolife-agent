/**
 * Alert Engine — sends notifications when news matches alert rules.
 *
 * Supports: email, Telegram, Slack, webhook.
 */

import { prisma } from "@agency/db";
import type { ProcessedNewsItem } from "./summarizer";

export interface AlertMatch {
  alertId: string;
  alertName: string;
  channel: string;
  target: string;
  newsItem: ProcessedNewsItem & { companyId: string | null };
}

/**
 * Check all active alerts for a tenant against new news items.
 * Returns list of alert+item pairs that should fire.
 */
export async function checkAlerts(
  tenantId: string,
  items: Array<ProcessedNewsItem & { companyId: string | null }>
): Promise<AlertMatch[]> {
  const alerts = await prisma.alert.findMany({
    where: { tenantId, isActive: true },
  });

  const matches: AlertMatch[] = [];

  for (const alert of alerts) {
    for (const item of items) {
      if (shouldTrigger(alert, item)) {
        matches.push({
          alertId: alert.id,
          alertName: alert.name,
          channel: alert.channel,
          target: alert.target,
          newsItem: item,
        });
      }
    }
  }

  return matches;
}

function shouldTrigger(
  alert: {
    minRelevance: number;
    categories: string[];
    countries: string[];
  },
  item: ProcessedNewsItem
): boolean {
  // Check relevance threshold
  if (item.relevanceScore < alert.minRelevance) return false;

  // Check category filter (empty = match all)
  if (
    alert.categories.length > 0 &&
    !alert.categories.includes(item.category)
  ) {
    return false;
  }

  // Check country filter (empty = match all)
  if (alert.countries.length > 0) {
    const hasMatchingCountry = item.countries.some((c) =>
      alert.countries.some(
        (ac) => ac.toLowerCase() === c.toLowerCase()
      )
    );
    if (!hasMatchingCountry) return false;
  }

  return true;
}

/**
 * Send alert notifications.
 * Supports Telegram, email (via existing Resend), Slack webhook.
 */
export async function sendAlertNotifications(
  matches: AlertMatch[]
): Promise<void> {
  for (const match of matches) {
    try {
      const message = formatAlertMessage(match);

      switch (match.channel) {
        case "telegram":
          await sendTelegramAlert(match.target, message);
          break;
        case "slack":
          await sendSlackAlert(match.target, message);
          break;
        case "webhook":
          await sendWebhookAlert(match.target, match);
          break;
        // email alerts will be handled separately via Resend
      }

      // Update alert tracking
      await prisma.alert.update({
        where: { id: match.alertId },
        data: {
          lastTriggeredAt: new Date(),
          triggerCount: { increment: 1 },
        },
      });
    } catch (err) {
      console.error(`Alert ${match.alertId} delivery failed:`, err);
    }
  }
}

function formatAlertMessage(match: AlertMatch): string {
  const item = match.newsItem;
  const companyTag = item.companyId ? " [PIPELINE COMPANY]" : "";
  return [
    `<b>${match.alertName}</b>${companyTag}`,
    "",
    `<b>${item.title}</b>`,
    `${item.summary}`,
    "",
    `Category: ${item.category} | Relevance: ${item.relevanceScore}/100`,
    item.entities.length > 0 ? `Companies: ${item.entities.join(", ")}` : "",
    item.countries.length > 0 ? `Countries: ${item.countries.join(", ")}` : "",
    "",
    `<a href="${item.url}">Read full article</a> (${item.source})`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendTelegramAlert(
  chatId: string,
  message: string
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
}

async function sendSlackAlert(
  webhookUrl: string,
  message: string
): Promise<void> {
  // Strip HTML for Slack
  const plain = message.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: plain }),
  });
}

async function sendWebhookAlert(
  url: string,
  match: AlertMatch
): Promise<void> {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      alert: match.alertName,
      news: {
        title: match.newsItem.title,
        url: match.newsItem.url,
        summary: match.newsItem.summary,
        category: match.newsItem.category,
        entities: match.newsItem.entities,
        countries: match.newsItem.countries,
        relevanceScore: match.newsItem.relevanceScore,
        companyId: match.newsItem.companyId,
      },
    }),
  });
}
