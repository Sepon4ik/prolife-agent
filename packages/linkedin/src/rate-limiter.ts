/**
 * LinkedIn Hard Rate Limiter.
 *
 * THESE LIMITS ARE NON-NEGOTIABLE. Exceeding them = account ban.
 * The limiter tracks daily usage in DB and REFUSES to execute
 * any action that would exceed the safe daily limit.
 *
 * LinkedIn limits (2026):
 * - Connection requests: 100-200/week → SAFE: 15/day
 * - Messages: 100-150/week → SAFE: 25/day
 * - Profile views: 500-2000/day → SAFE: 80/day
 * - InMails: 50/month (Sales Nav) → SAFE: 2/day
 *
 * We use ~50% of LinkedIn's actual limits to stay safe.
 */

import { prisma } from "@agency/db";

// ── Hard Limits (DO NOT INCREASE) ──

export const LINKEDIN_DAILY_LIMITS = {
  /** Max connection requests per day per account */
  connections: 15,
  /** Max messages per day per account */
  messages: 25,
  /** Max profile views per day per account */
  profileViews: 80,
  /** Max InMails per day per account (Sales Nav) */
  inmails: 2,
  /** Weekly connection request cap */
  connectionsWeekly: 80,
} as const;

// ── Types ──

export type LinkedInActionType =
  | "profile_view"
  | "connection_request"
  | "message"
  | "inmail";

export interface RateLimitResult {
  allowed: boolean;
  usedToday: number;
  limitToday: number;
  remaining: number;
  reason?: string;
}

// ── Rate Limit Check ──

/**
 * Check if a LinkedIn action is allowed right now.
 * Returns { allowed: false } if daily limit would be exceeded.
 * NEVER returns allowed=true if it would exceed the hard limit.
 */
export async function checkLinkedInLimit(
  accountId: string,
  action: LinkedInActionType
): Promise<RateLimitResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const limit = getLimitForAction(action);

  // Count actions performed today for this account
  const usedToday = await prisma.linkedInAction.count({
    where: {
      accountId,
      actionType: action,
      performedAt: { gte: today, lt: tomorrow },
    },
  });

  const remaining = Math.max(0, limit - usedToday);

  if (usedToday >= limit) {
    return {
      allowed: false,
      usedToday,
      limitToday: limit,
      remaining: 0,
      reason: `Daily limit reached: ${usedToday}/${limit} ${action}s today`,
    };
  }

  // Extra check: weekly connection limit
  if (action === "connection_request") {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const usedThisWeek = await prisma.linkedInAction.count({
      where: {
        accountId,
        actionType: "connection_request",
        performedAt: { gte: weekAgo },
      },
    });

    if (usedThisWeek >= LINKEDIN_DAILY_LIMITS.connectionsWeekly) {
      return {
        allowed: false,
        usedToday,
        limitToday: limit,
        remaining: 0,
        reason: `Weekly limit reached: ${usedThisWeek}/${LINKEDIN_DAILY_LIMITS.connectionsWeekly} connections this week`,
      };
    }
  }

  return { allowed: true, usedToday, limitToday: limit, remaining };
}

/**
 * Record a LinkedIn action AFTER it was performed.
 * Must be called after every successful LinkedIn API call.
 */
export async function recordLinkedInAction(
  accountId: string,
  action: LinkedInActionType,
  targetContactId: string,
  metadata?: Record<string, string>
): Promise<void> {
  await prisma.linkedInAction.create({
    data: {
      accountId,
      actionType: action,
      targetContactId,
      metadata: metadata ?? {},
      performedAt: new Date(),
    },
  });
}

/**
 * Get current usage stats for an account.
 */
export async function getLinkedInUsageStats(accountId: string): Promise<{
  today: Record<LinkedInActionType, { used: number; limit: number; remaining: number }>;
  thisWeek: { connections: number; weeklyLimit: number };
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const actions: LinkedInActionType[] = [
    "profile_view",
    "connection_request",
    "message",
    "inmail",
  ];

  const todayStats = {} as Record<
    LinkedInActionType,
    { used: number; limit: number; remaining: number }
  >;

  for (const action of actions) {
    const used = await prisma.linkedInAction.count({
      where: {
        accountId,
        actionType: action,
        performedAt: { gte: today, lt: tomorrow },
      },
    });
    const limit = getLimitForAction(action);
    todayStats[action] = { used, limit, remaining: Math.max(0, limit - used) };
  }

  const weeklyConnections = await prisma.linkedInAction.count({
    where: {
      accountId,
      actionType: "connection_request",
      performedAt: { gte: weekAgo },
    },
  });

  return {
    today: todayStats,
    thisWeek: {
      connections: weeklyConnections,
      weeklyLimit: LINKEDIN_DAILY_LIMITS.connectionsWeekly,
    },
  };
}

// ── Helpers ──

function getLimitForAction(action: LinkedInActionType): number {
  switch (action) {
    case "profile_view":
      return LINKEDIN_DAILY_LIMITS.profileViews;
    case "connection_request":
      return LINKEDIN_DAILY_LIMITS.connections;
    case "message":
      return LINKEDIN_DAILY_LIMITS.messages;
    case "inmail":
      return LINKEDIN_DAILY_LIMITS.inmails;
  }
}
