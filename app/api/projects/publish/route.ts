import { Octokit } from "@octokit/rest";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { calendarSchema } from "@/lib/commit-calendar";
import {
  preparePublish,
  inspectPublish,
  publishFailure,
  publishProject,
} from "@/lib/github-publish";

export const maxDuration = 300;
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), input: calendarSchema }).strict(),
  z
    .object({
      action: z.enum(["publish", "status"]),
      receipt: z.string().min(1).max(16000),
    })
    .strict(),
]);
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return reply({ message: "This request must come from GitHubKit." }, 403);
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret)
    return reply({ message: "Authentication is not configured." }, 503);
  const token = await getToken({ req: request, secret });
  if (!token?.githubAccessToken)
    return reply(
      { code: "SIGN_IN", message: "Please sign in to GitHub again." },
      401,
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ message: "Send valid JSON." }, 400);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success)
    return reply(
      { message: "Check your project settings or upload receipt." },
      400,
    );
  const client = new Octokit({
    auth: token.githubAccessToken,
    request: { timeout: 15000 },
  });
  if (parsed.data.action === "prepare") {
    try {
      return reply(await preparePublish(client, parsed.data.input, secret));
    } catch (error) {
      const failure = publishFailure(error);
      return reply(
        { code: failure.code, message: failure.message },
        failure.status,
      );
    }
  }
  const receipt = parsed.data.receipt;
  const accessToken = token.githubAccessToken;
  if (parsed.data.action === "status") {
    try {
      return reply(await inspectPublish(client, receipt, secret));
    } catch (error) {
      const failure = publishFailure(error);
      return reply(
        { code: failure.code, message: failure.message },
        failure.status,
      );
    }
  }
  let disconnected = false;
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: unknown) => {
        if (disconnected) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          disconnected = true;
        }
      };
      try {
        const result = await publishProject(
          client,
          accessToken,
          receipt,
          secret,
          (step) => send({ type: "progress", step }),
          request.signal,
        );
        send({ type: "success", result });
      } catch (error) {
        const failure = publishFailure(error);
        send({ type: "error", code: failure.code, message: failure.message });
      } finally {
        if (!disconnected) controller.close();
      }
    },
    cancel() {
      disconnected = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
