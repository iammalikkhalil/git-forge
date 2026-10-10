import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import {
  calendarSchema,
  generateCommitCalendar,
  CalendarCapacityError,
} from "@/lib/commit-calendar";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return reply({ message: "This request must come from GitHubKit." }, 403);
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token)
    return reply({ code: "SIGN_IN", message: "Please sign in again." }, 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ message: "Send valid JSON." }, 400);
  }
  const parsed = calendarSchema.safeParse(body);
  if (!parsed.success)
    return reply(
      {
        message: "Check your settings.",
        errors: parsed.error.flatten().fieldErrors,
      },
      400,
    );
  try {
    return reply({ calendar: generateCommitCalendar(parsed.data) });
  } catch (error) {
    return reply(
      {
        message:
          error instanceof CalendarCapacityError
            ? error.message
            : "No eligible dates for these habits. Adjust the date range or weekday/weekend scores.",
      },
      422,
    );
  }
}
