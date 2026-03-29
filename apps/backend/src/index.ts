import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { appendDevLog } from "./services/dev-log.js";
import { sendDiscordPresenceUpdate } from "./services/discord-webhook.js";

const port = Number(process.env.VIBEPING_BACKEND_PORT ?? "4040");

type PresenceUpdate = {
  username: string;
  projectName: string;
  folderPath: string;
  status: "Currently vibe coding" | "Offline";
  timestamp: string;
  languageTag?: string;
  webhookUrl?: string;
};

const server = createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/presence/update") {
    await handlePresenceUpdate(request, response);
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, () => {
  const message = `[backend] listening on http://127.0.0.1:${port}`;
  console.log(message);
  void appendDevLog(message);
});

async function handlePresenceUpdate(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  try {
    const rawBody = await readRequestBody(request);
    const parsed = JSON.parse(rawBody) as Partial<PresenceUpdate>;

    if (!isPresenceUpdate(parsed)) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Invalid presence payload" }));
      return;
    }

    const message = `[backend] ${parsed.username} -> ${parsed.status} in ${parsed.projectName}`;
    console.log(message);
    await appendDevLog(message);

    const discordResult = await sendDiscordPresenceUpdate(parsed);
    const discordMessage = discordResult.delivered
      ? `[discord] delivered ${parsed.username} ${parsed.status} ${parsed.projectName}`
      : `[discord] skipped ${parsed.projectName} (${discordResult.reason})`;

    console.log(discordMessage);
    await appendDevLog(discordMessage);

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        discord: discordResult
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown backend error";
    console.error(`[backend] ${message}`);
    await appendDevLog(`[backend] error ${message}`);
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Internal server error" }));
  }
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function isPresenceUpdate(value: Partial<PresenceUpdate>): value is PresenceUpdate {
  return (
    typeof value.username === "string" &&
    typeof value.projectName === "string" &&
    typeof value.folderPath === "string" &&
    (value.status === "Currently vibe coding" || value.status === "Offline") &&
    (typeof value.languageTag === "undefined" || typeof value.languageTag === "string") &&
    (typeof value.webhookUrl === "undefined" || typeof value.webhookUrl === "string") &&
    typeof value.timestamp === "string"
  );
}
