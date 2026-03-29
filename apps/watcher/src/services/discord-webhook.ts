import type { PresenceState } from "../types/activity.js";

type PresenceUpdate = {
  username: string;
  projectName: string;
  folderPath: string;
  status: PresenceState;
  timestamp: string;
  languageTag?: string;
  webhookUrl?: string;
};

export type DiscordDeliveryResult = {
  delivered: boolean;
  reason?: string;
};

export async function sendDiscordPresenceUpdate(payload: PresenceUpdate): Promise<{
  delivered: boolean;
  reason?: string;
}> {
  return sendDiscordWebhookMessage({
    webhookUrl: payload.webhookUrl,
    content:
      payload.status === "Currently vibe coding"
        ? `${payload.username} is vibe coding ${payload.projectName}${payload.languageTag ? `. ${payload.languageTag}` : ""}`
        : `${payload.username} offline.`
  });
}

export async function sendDiscordWebhookMessage(payload: {
  webhookUrl?: string;
  content: string;
}): Promise<DiscordDeliveryResult> {
  const webhookUrl = payload.webhookUrl?.trim() || process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    return {
      delivered: false,
      reason: "Discord webhook is not configured"
    };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ content: payload.content })
  });

  if (!response.ok) {
    return {
      delivered: false,
      reason: `Discord webhook returned ${response.status}`
    };
  }

  return { delivered: true };
}
