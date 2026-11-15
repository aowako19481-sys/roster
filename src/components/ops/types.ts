import type { Result } from "@/lib/result";

/** What the "new onboarding link" action returns. The link is shown once and never stored. */
export type LinkResult = Result & { link?: string };

/** What the invite form's action returns. */
export type InviteResult = Result & {
  sent?: { name: string; email: string; office: string; split: number; link: string }[];
  failed?: { name: string; email: string; reason: string }[];
  problems?: string[];
};
