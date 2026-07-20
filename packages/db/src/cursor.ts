import { z } from "zod";
import { ValidationError, err, ok, type Result } from "@petal/core";

/**
 * Keyset cursor for the mentions feed: (occurred_at desc, id desc). Keyset
 * stays stable while new rows arrive, which offset pagination does not.
 */

const cursorSchema = z.object({
  occurredAt: z.iso.datetime(),
  id: z.string().min(1),
});
export type MentionCursor = z.infer<typeof cursorSchema>;

export function encodeCursor(cursor: MentionCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): Result<MentionCursor, ValidationError> {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    if (!parsed.success) {
      return err(new ValidationError("invalid cursor", parsed.error.issues.map((i) => i.message)));
    }
    return ok(parsed.data);
  } catch {
    return err(new ValidationError("cursor is not base64url JSON"));
  }
}
