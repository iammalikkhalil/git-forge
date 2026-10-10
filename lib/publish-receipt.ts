import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { calendarSchema, type CalendarInput } from "@/lib/commit-calendar";

const receiptSchema = z
  .object({
    version: z.literal(1),
    userId: z.number().int().positive(),
    owner: z.string().regex(/^[a-zA-Z0-9-]+$/),
    operation: z.uuid(),
    issuedAt: z.number().int(),
    input: calendarSchema,
  })
  .strict();

export type PublishReceipt = z.infer<typeof receiptSchema>;
export class PublishError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

function signature(payload: string, secret: string) {
  if (!secret) throw new Error("Missing signing secret.");
  return createHmac("sha256", secret)
    .update(`git-forge-publish-v1:${payload}`)
    .digest();
}

export function signPublishReceipt(
  input: CalendarInput,
  user: { id: number; login: string },
  secret: string,
) {
  const data: PublishReceipt = {
    version: 1,
    userId: user.id,
    owner: user.login,
    operation: randomUUID(),
    issuedAt: Date.now(),
    input,
  };
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function readPublishReceipt(
  receipt: string,
  secret: string,
): PublishReceipt {
  try {
    if (receipt.length > 16000) throw new Error();
    const parts = receipt.split(".");
    if (parts.length !== 2) throw new Error();
    const expected = signature(parts[0], secret);
    const actual = Buffer.from(parts[1], "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new Error();
    const data = receiptSchema.parse(
      JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")),
    );
    if (
      data.issuedAt > Date.now() + 1000 ||
      Date.now() - data.issuedAt > 24 * 60 * 60 * 1000
    )
      throw new PublishError(
        "EXPIRED",
        "This upload receipt has expired. Check GitHub before starting a new upload.",
      );
    return data;
  } catch (error) {
    if (error instanceof PublishError) throw error;
    throw new PublishError(
      "INVALID_RECEIPT",
      "The upload receipt is invalid. Start a new upload.",
      400,
    );
  }
}
