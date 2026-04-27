import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';
import { RecipeModel } from '@/lib/schemas/recipe';

type FieldErrorBody = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Test Recipe',
    description: 'desc',
    servings: 4,
    prepMin: 10,
    cookMin: 10,
    difficulty: 'easy',
    tags: ['quick'],
    ingredients: [{ name: 'salt', qty: 1, unit: 'tsp' }],
    steps: ['Mix all ingredients well together.'],
    ...overrides,
  };
}

function buildPostReq(payload: unknown): NextRequest {
  return new NextRequest('http://localhost/api/recipes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('POST /api/recipes', () => {
  it('creates a recipe with a valid payload', async () => {
    const res = await POST(buildPostReq(validPayload()));
    expect(res.status).toBe(201);

    const json = (await res.json()) as { _id?: string; title?: string };
    expect(json.title).toBe('Test Recipe');
    expect(json._id).toBeDefined();

    const stored = await RecipeModel.findOne({ title: 'Test Recipe' }).lean();
    expect(stored).not.toBeNull();
  });

  it('rejects a duplicate title (different case + whitespace) with fieldErrors.title', async () => {
    const first = await POST(buildPostReq(validPayload({ title: 'Pasta Carbonara' })));
    expect(first.status).toBe(201);

    const second = await POST(
      buildPostReq(validPayload({ title: '  pasta CARBONARA  ' }))
    );
    expect(second.status).toBe(400);

    const body = (await second.json()) as FieldErrorBody;
    expect(body.error).toBe('Validation failed');
    expect(body.fieldErrors?.title).toBeDefined();
    expect(body.fieldErrors?.title?.length ?? 0).toBeGreaterThan(0);
  });

  it('rejects prepMin=0 + cookMin=0 (total time business rule)', async () => {
    const res = await POST(buildPostReq(validPayload({ prepMin: 0, cookMin: 0 })));
    expect(res.status).toBe(400);

    const body = (await res.json()) as FieldErrorBody;
    expect(body.error).toBe('Validation failed');
    // Schema attaches the issue to prepMin
    expect(body.fieldErrors?.prepMin).toBeDefined();
  });

  it('rejects two ingredients named "Salt" and "salt " (case-insensitive duplicate)', async () => {
    const res = await POST(
      buildPostReq(
        validPayload({
          ingredients: [
            { name: 'Salt', qty: 1, unit: 'tsp' },
            { name: 'salt ', qty: 2, unit: 'tsp' },
          ],
        })
      )
    );
    expect(res.status).toBe(400);

    const body = (await res.json()) as FieldErrorBody;
    expect(body.error).toBe('Validation failed');
    // Issue path is ingredients.<idx>.name → joined with '.'
    const dupKey = Object.keys(body.fieldErrors ?? {}).find((k) =>
      k.startsWith('ingredients.') && k.endsWith('.name')
    );
    expect(dupKey).toBeDefined();
  });
});

describe('GET /api/recipes', () => {
  it('returns the standardized list envelope', async () => {
    await POST(buildPostReq(validPayload({ title: 'List Recipe A' })));
    await POST(buildPostReq(validPayload({ title: 'List Recipe B' })));

    const req = new NextRequest('http://localhost/api/recipes?page=1&limit=20');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      items: unknown[];
      total: number;
      page: number;
      limit: number;
    };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });
});
