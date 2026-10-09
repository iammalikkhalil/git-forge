import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { calendarSchema } from "@/lib/commit-calendar";
import { createProjectArchive, ProjectLimitError } from "@/lib/local-project";

export const maxDuration = 300;
const reply = (message: string, status: number) =>
  Response.json(
    { message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return reply("This request must come from Git Forge.", 403);
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token) return reply("Please sign in again.", 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply("Send valid JSON.", 400);
  }
  const parsed = calendarSchema.safeParse(body);
  if (!parsed.success)
    return reply("Check your project settings and calendar.", 400);
  try {
    const result = await createProjectArchive(parsed.data, request.signal);
    return new Response(new Uint8Array(result.archive), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${parsed.data.repositoryName}.tar.gz"`,
        "Cache-Control": "no-store",
        "X-Commit-Count": String(result.count),
        "X-Generation-Ms": String(result.generationMs),
      },
    });
  } catch (error) {
    if (error instanceof ProjectLimitError) return reply(error.message, 422);
    return reply(
      "Project generation failed. Please retry or reduce the date range.",
      500,
    );
  }
}
