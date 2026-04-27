import { type NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import {
  RecipeModel,
  RecipeSchema,
  RecipeUpdateSchema,
  normalizeTitle,
} from '@/lib/schemas/recipe';
import {
  ensureDB,
  fieldErrorsFromIssues,
  isMongoDuplicateKeyError,
  notFoundResponse,
  serverErrorResponse,
  titleConflictResponse,
  validationErrorResponse,
} from '../_helpers';

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/recipes/[id]
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFoundResponse();

    await ensureDB();
    const recipe = await RecipeModel.findById(id).lean();
    if (!recipe) return notFoundResponse();

    return NextResponse.json(recipe);
  } catch (err) {
    return serverErrorResponse(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/recipes/[id]
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFoundResponse();

    await ensureDB();
    const existing = await RecipeModel.findById(id);
    if (!existing) return notFoundResponse();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return validationErrorResponse({ _root: ['Invalid JSON body'] });
    }

    const parsed = RecipeUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(fieldErrorsFromIssues(parsed.error.issues));
    }

    // Merge existing + patch, then strip mongoose meta fields before re-validating
    // against the full RecipeSchema (which applies superRefine business rules).
    const existingObj = existing.toObject();
    const merged: Record<string, unknown> = { ...existingObj, ...parsed.data };
    delete merged._id;
    delete merged.createdAt;
    delete merged.updatedAt;
    delete merged.__v;

    const fullCheck = RecipeSchema.safeParse(merged);
    if (!fullCheck.success) {
      return validationErrorResponse(fieldErrorsFromIssues(fullCheck.error.issues));
    }

    // If title changed, enforce uniqueness excluding self.
    if (typeof parsed.data.title === 'string') {
      const normalizedTitle = normalizeTitle(parsed.data.title);
      const conflict = await RecipeModel.findOne({
        _id: { $ne: id },
        title: normalizedTitle,
      })
        .collation({ locale: 'en', strength: 2 })
        .lean();
      if (conflict) {
        return titleConflictResponse();
      }
    }

    const updatePayload: Record<string, unknown> = { ...parsed.data };
    if (typeof parsed.data.title === 'string') {
      updatePayload.title = normalizeTitle(parsed.data.title);
    }

    try {
      const updated = await RecipeModel.findByIdAndUpdate(id, updatePayload, {
        new: true,
      }).lean();
      if (!updated) return notFoundResponse();
      return NextResponse.json(updated);
    } catch (err) {
      if (isMongoDuplicateKeyError(err)) {
        return titleConflictResponse();
      }
      throw err;
    }
  } catch (err) {
    return serverErrorResponse(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/recipes/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFoundResponse();

    await ensureDB();
    const removed = await RecipeModel.findByIdAndDelete(id).lean();
    if (!removed) return notFoundResponse();

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return serverErrorResponse(err);
  }
}
