type PresenceUpdate = {
  username: string;
  projectName: string;
  folderPath: string;
  status: "Currently vibe coding" | "Offline";
  timestamp: string;
  languageTag?: string;
  webhookUrl?: string;
};

export async function sendDiscordPresenceUpdate(payload: PresenceUpdate): Promise<{
  delivered: boolean;
  reason?: string;
}> {
  const webhookUrl = payload.webhookUrl || process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    return {
      delivered: false,
      reason: "DISCORD_WEBHOOK_URL is not configured"
    };
  }

  const content =
    payload.status === "Currently vibe coding"
      ? `${payload.username} is vibe coding ${payload.projectName}${payload.languageTag ? `. ${payload.languageTag}` : ""}`
      : `${payload.username} offline.`;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      content
    })
  });

  if (!response.ok) {
    return {
      delivered: false,
      reason: `Discord webhook returned ${response.status}`
    };
  }

  return { delivered: true };
}
