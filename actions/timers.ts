"use server";

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { timer } from "@/lib/db/schema";
import { requireManagementRole } from "@/lib/auth/guards";

/**
 * Latency padding: initial_seconds = display_seconds + LATENCY_PADDING_SECONDS.
 * Server counts down from initial_seconds; client displays max(0, min(remaining, display_seconds)).
 * Change this constant if the polling interval changes.
 */
const LATENCY_PADDING_SECONDS = 3;

function getDb() {
  return drizzle(getSql());
}

/**
 * Create a new timer.
 * Requires admin or moderator session.
 * Returns both view_token and control_token so the caller can distribute links.
 */
export async function createTimerAction(
  name: string,
  displaySeconds: number
): Promise<{ viewToken: string; controlToken: string }> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) {
    throw new Error(auth.error);
  }

  if (!name || name.trim().length === 0 || name.trim().length > 100) {
    throw new Error("Timer name must be 1–100 characters.");
  }

  if (!Number.isInteger(displaySeconds) || displaySeconds <= 0 || displaySeconds > 86400) {
    throw new Error("display_seconds must be a positive integer ≤ 86400.");
  }

  const viewToken = randomBytes(32).toString("hex");
  const controlToken = randomBytes(32).toString("hex");
  const initialSeconds = displaySeconds + LATENCY_PADDING_SECONDS;

  await getDb().insert(timer).values({
    name: name.trim(),
    displaySeconds,
    initialSeconds,
    viewToken,
    controlToken,
    createdBy: auth.session.memberId,
  });

  return { viewToken, controlToken };
}

/**
 * Delete a timer by its control token.
 * Requires admin or moderator session.
 * Silently succeeds if token does not exist (idempotent).
 */
export async function deleteTimerAction(controlToken: string): Promise<void> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) {
    throw new Error(auth.error);
  }

  if (!controlToken) {
    throw new Error("controlToken is required.");
  }

  await getDb().delete(timer).where(eq(timer.controlToken, controlToken));
}

/**
 * Regenerate the view token for a timer identified by its control token.
 * Requires admin or moderator session.
 * The old view token becomes invalid immediately.
 * Returns the new view token so the caller can update their link.
 */
export async function regenerateViewTokenAction(
  controlToken: string
): Promise<{ newViewToken: string }> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) {
    throw new Error(auth.error);
  }

  if (!controlToken) {
    throw new Error("controlToken is required.");
  }

  const newViewToken = randomBytes(32).toString("hex");

  const result = await getDb()
    .update(timer)
    .set({
      viewToken: newViewToken,
      updatedAt: new Date(),
    })
    .where(eq(timer.controlToken, controlToken))
    .returning({ id: timer.id });

  if (result.length === 0) {
    throw new Error("Timer not found for the given control token.");
  }

  return { newViewToken };
}
