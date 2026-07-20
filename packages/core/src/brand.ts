declare const brand: unique symbol;

/** Nominal typing for ids that are all strings at runtime; prevents cross-wiring. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type IgUserId = Brand<string, "IgUserId">;
export type IgMediaId = Brand<string, "IgMediaId">;
export type IgCommentId = Brand<string, "IgCommentId">;
export type IgHashtagId = Brand<string, "IgHashtagId">;
export type AccountId = Brand<string, "AccountId">;
export type MentionEventId = Brand<string, "MentionEventId">;

export const igUserId = (v: string): IgUserId => v as IgUserId;
export const igMediaId = (v: string): IgMediaId => v as IgMediaId;
export const igCommentId = (v: string): IgCommentId => v as IgCommentId;
export const igHashtagId = (v: string): IgHashtagId => v as IgHashtagId;
export const accountId = (v: string): AccountId => v as AccountId;
export const mentionEventId = (v: string): MentionEventId => v as MentionEventId;
