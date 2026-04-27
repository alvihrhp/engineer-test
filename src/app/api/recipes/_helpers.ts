import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import type { ZodIssue } from 'zod';
import { connectDB } from '@/lib/db';

// In tests an in-memory mongoose connection is already established by the
// global setup; calling our app-level `connectDB()` on top of that would try
// to spin up a second connection. Guard so production paths still init the
// pooled connection while tests reuse the shared one.
export async function ensureDB(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  await connectDB();
}

export function fieldErrorsFromIssues(
  issues: readonly ZodIssue[]
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.join('.');
    const arr = out[key] ?? [];
    arr.push(issue.message);
    out[key] = arr;
  }
  return out;
}

export function isMongoDuplicateKeyError(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  return (err as { code?: unknown }).code === 11000;
}

export function notFoundResponse(): NextResponse {
  return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
}

export function serverErrorResponse(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : 'Unknown error';
  return NextResponse.json({ error: message }, { status: 500 });
}

export function titleConflictResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'Validation failed',
      fieldErrors: { title: ['A recipe with this title already exists'] },
    },
    { status: 400 }
  );
}

export function validationErrorResponse(
  fieldErrors: Record<string, string[]>
): NextResponse {
  return NextResponse.json(
    { error: 'Validation failed', fieldErrors },
    { status: 400 }
  );
}
