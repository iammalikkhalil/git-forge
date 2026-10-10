import { Octokit } from "@octokit/rest";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import {
  loadGitHubProfile,
  saveGitHubProfile,
  profileFailure,
} from "@/lib/github-profile";

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
    if (!write) return reply({ profile: await loadGitHubProfile(client) });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return reply({ message: "Send valid JSON." }, 400);
    }
    return reply(await saveGitHubProfile(client, body));
  } catch (error) {
    const failure = profileFailure(error);
    return reply(
      { code: failure.code, message: failure.message },
      failure.status,
    );
  }
}
export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);
