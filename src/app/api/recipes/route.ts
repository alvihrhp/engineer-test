import { type NextRequest, NextResponse } from 'next/server';
import { RecipeModel, RecipeSchema, normalizeTitle } from '@/lib/schemas/recipe';
import {
  ensureDB,
  fieldErrorsFromIssues,
  isMongoDuplicateKeyError,
  serverErrorResponse,
  titleConflictResponse,
  validationErrorResponse,
} from './_helpers';

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// GET /api/recipes — list with search + filters + pagination
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureDB();

    const { searchParams } = new URL(request.url);

    const search = searchParams.get('search')?.trim() ?? '';
    const tagsParam = searchParams.get('tags')?.trim() ?? '';
    const difficultyParam = searchParams.get('difficulty')?.trim() ?? '';

    const pageRaw = Number(searchParams.get('page') ?? '1');
    const limitRaw = Number(searchParams.get('limit') ?? '20');
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    const limit = Math.min(
      Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.floor(limitRaw) : 20,
      100
    );

    const filter: Record<string, unknown> = {};

    if (search.length > 0) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { title: rx },
        { description: rx },
        { tags: rx },
        { 'ingredients.name': rx },
        { steps: rx },
      ];
    }

    if (tagsParam.length > 0) {
      const tagList = tagsParam
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      if (tagList.length > 0) {
        filter.tags = { $all: tagList };
      }
    }

    if (
      difficultyParam === 'easy' ||
      difficultyParam === 'medium' ||
      difficultyParam === 'hard'
    ) {
      filter.difficulty = difficultyParam;
    }

    const [items, total] = await Promise.all([
      RecipeModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      RecipeModel.countDocuments(filter),
    ]);

    return NextResponse.json({ items, total, page, limit });
  } catch (err) {
    return serverErrorResponse(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/recipes — create
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureDB();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return validationErrorResponse({ _root: ['Invalid JSON body'] });
    }

    const parsed = RecipeSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(fieldErrorsFromIssues(parsed.error.issues));
    }

    const normalizedTitle = normalizeTitle(parsed.data.title);

    const conflict = await RecipeModel.findOne({ title: normalizedTitle })
      .collation({ locale: 'en', strength: 2 })
      .lean();
    if (conflict) {
      return titleConflictResponse();
    }

    try {
      const created = await RecipeModel.create({
        ...parsed.data,
        title: normalizedTitle,
      });
      return NextResponse.json(created.toObject(), { status: 201 });
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
