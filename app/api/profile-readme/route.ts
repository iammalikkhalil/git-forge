import { Octokit } from "@octokit/rest";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import {
  loadProfileReadme,
  listProfileProjects,
  listReadmeHistory,
  loadReadmeRevision,
  publishProfileReadme,
  readmeFailure,
} from "@/lib/profile-readme";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function handle(request: NextRequest, write: boolean) {
  if (write && request.headers.get("origin") !== request.nextUrl.origin)
    return reply({ message: "This request must come from GitHubKit." }, 403);
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token?.githubAccessToken)
    return reply(
      { code: "SIGN_IN", message: "Please sign in to GitHub again." },
      401,
    );
  const client = new Octokit({
    auth: token.githubAccessToken,
    request: { timeout: 15000 },
  });
  try {
    if (write) {
      let body;
      try {
        body = await request.json();
      } catch {
        return reply({ message: "Send valid JSON." }, 400);
      }
      return reply(await publishProfileReadme(client, body));
    }
    const resource = request.nextUrl.searchParams.get("resource") ?? "profile";
    const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
    if (!Number.isInteger(page) || page < 1 || page > 100)
      return reply({ message: "Invalid page." }, 400);
    if (resource === "profile")
      return reply({ profile: await loadProfileReadme(client) });
    if (resource === "projects")
      return reply(await listProfileProjects(client, page));
    if (resource === "history")
      return reply(await listReadmeHistory(client, page));
    if (resource === "revision") {
      const sha = request.nextUrl.searchParams.get("sha") ?? "";
      if (!/^[0-9a-f]{40}$/.test(sha))
        return reply({ message: "Invalid revision." }, 400);
      return reply(await loadReadmeRevision(client, sha));
    }
    return reply({ message: "Unknown resource." }, 400);
  } catch (error) {
    const failure = readmeFailure(error);
    return reply(
      { code: failure.code, message: failure.message },
      failure.status,
    );
  }
}
export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);
