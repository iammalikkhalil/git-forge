import type { NextRequest } from "next/server";
import { handleProjectRequest } from "@/lib/project-request";

export async function POST(request: NextRequest) {
  return handleProjectRequest(request, true);
}
