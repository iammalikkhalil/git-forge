import "server-only";
import { Octokit } from "@octokit/rest";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { projectSchema, repositoryNameSchema } from "@/lib/project-schema";
import {
  checkRepositoryName,
  RepositoryCheckError,
} from "@/lib/repository-check";

const nameSchema = z.object({ repositoryName: repositoryNameSchema }).strict();
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function handleProjectRequest(
  request: NextRequest,
  checkOnly = false,
) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return reply({ message: "This request must come from GitHubKit." }, 403);
  }
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token?.githubAccessToken)
    return reply(
      { code: "SIGN_IN", message: "Please sign in to GitHub again." },
      401,
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ message: "Send a valid JSON request." }, 400);
  }
  const parsed = (checkOnly ? nameSchema : projectSchema).safeParse(body);
  if (!parsed.success)
    return reply(
      {
        message: "Check the highlighted fields.",
        errors: parsed.error.flatten().fieldErrors,
      },
      400,
    );
  const client = new Octokit({
    auth: token.githubAccessToken,
    request: { timeout: 10000 },
  });
  try {
    const availability = await checkRepositoryName(
      client,
      parsed.data.repositoryName,
    );
    if (checkOnly) return reply(availability);
    if (!availability.available)
      return reply(
        {
          message: "This repository already exists. Choose another name.",
          errors: {
            repositoryName: [
              "This name is already used in your GitHub account.",
            ],
          },
        },
        409,
      );
    return reply({
      message: "Details accepted. No repository has been created.",
      project: { ...parsed.data, owner: availability.owner },
    });
  } catch (error) {
    if (error instanceof RepositoryCheckError)
      return reply({ code: error.code, message: error.message }, error.status);
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? error.status
        : undefined;
    if (status === 401)
      return reply(
        {
          code: "SIGN_IN",
          message:
            "Your GitHub authorization has expired or been revoked. Sign in again.",
        },
        401,
      );
    if (status === 403 || status === 429)
      return reply(
        {
          message:
            "GitHub limited or denied this request. Please retry later or review your GitHub permissions.",
        },
        503,
      );
    return reply(
      { message: "Unable to check GitHub right now. Please retry." },
      502,
    );
  }
}
