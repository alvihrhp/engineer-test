import { describe, test, expect } from 'vitest';
import {
  RecipeSchema,
  RecipeModel,
  MAX_TAGS,
  MAX_INGREDIENTS,
  MAX_STEPS,
  MAX_TOTAL_MIN,
} from './recipe';

const validRecipe = {
  title: 'Classic Spaghetti',
  description: 'A simple pasta dish with tomato sauce.',
  servings: 4,
  prepMin: 10,
  cookMin: 20,
  difficulty: 'easy' as const,
  tags: ['quick', 'comfort'],
  ingredients: [
    { name: 'Spaghetti', qty: 400, unit: 'g' },
    { name: 'Tomato sauce', qty: 500, unit: 'ml' },
  ],
  steps: [
    'Boil salted water in a large pot.',
    'Cook pasta for 10 minutes until al dente.',
    'Heat the sauce and combine with pasta.',
  ],
};

function getError(result: ReturnType<typeof RecipeSchema.safeParse>, path: string) {
  if (result.success) return undefined;
  return result.error.issues.find((i) => i.path.join('.') === path);
}

describe('RecipeSchema — shape', () => {
  test('accepts a valid recipe', () => {
    expect(RecipeSchema.safeParse(validRecipe).success).toBe(true);
  });

  test('rejects missing title', () => {
    const { title: _t, ...rest } = validRecipe;
    expect(RecipeSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects invalid difficulty', () => {
    const result = RecipeSchema.safeParse({ ...validRecipe, difficulty: 'extreme' });
    expect(result.success).toBe(false);
  });
});

describe('Business rule: total time (prep + cook)', () => {
  test('rejects total time of 0', () => {
    const result = RecipeSchema.safeParse({ ...validRecipe, prepMin: 0, cookMin: 0 });
    expect(result.success).toBe(false);
    expect(getError(result, 'prepMin')?.message).toMatch(/greater than 0/i);
  });

  test('accepts total time of exactly 1', () => {
    const result = RecipeSchema.safeParse({ ...validRecipe, prepMin: 1, cookMin: 0 });
    expect(result.success).toBe(true);
  });

  test(`accepts total time of exactly ${MAX_TOTAL_MIN}`, () => {
    const result = RecipeSchema.safeParse({
      ...validRecipe,
      prepMin: MAX_TOTAL_MIN / 2,
      cookMin: MAX_TOTAL_MIN / 2,
    });
    expect(result.success).toBe(true);
  });

  test(`rejects total time greater than ${MAX_TOTAL_MIN}`, () => {
    const result = RecipeSchema.safeParse({
      ...validRecipe,
      prepMin: MAX_TOTAL_MIN,
      cookMin: 1,
    });
    expect(result.success).toBe(false);
    expect(getError(result, 'cookMin')?.message).toMatch(/at most/i);
  });
});

describe('Business rule: ingredients', () => {
  test('rejects 0 ingredients', () => {
    const result = RecipeSchema.safeParse({ ...validRecipe, ingredients: [] });
    expect(result.success).toBe(false);
  });

  test(`rejects more than ${MAX_INGREDIENTS} ingredients`, () => {
    const many = Array.from({ length: MAX_INGREDIENTS + 1 }, (_, i) => ({
      name: `ing-${i}`,
      qty: 1,
      unit: 'g',
    }));
    const result = RecipeSchema.safeParse({ ...validRecipe, ingredients: many });
    expect(result.success).toBe(false);
  });

  test('rejects duplicate ingredient names (case-insensitive)', () => {
    const result = RecipeSchema.safeParse({
      ...validRecipe,
      ingredients: [
        { name: 'Salt', qty: 5, unit: 'g' },
        { name: 'salt', qty: 3, unit: 'g' },
      ],
    });
    expect(result.success).toBe(false);
    expect(getError(result, 'ingredients.1.name')?.message).toMatch(/duplicate/i);
  });

  test('rejects duplicate ingredient names with whitespace differences', () => {
    const result = RecipeSchema.safeParse({
      ...validRecipe,
      ingredients: [
        { name: 'salt', qty: 5, unit: 'g' },
        { name: '  salt  ', qty: 3, unit: 'g' },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('Business rule: tags', () => {
  test(`rejects more than ${MAX_TAGS} tags`, () => {
    const result = RecipeSchema.safeParse({
      ...validRecipe,
      tags: ['a-1', 'b-2', 'c-3', 'd-4', 'e-5', 'f-6'],
    });
    expect(result.success).toBe(false);
  });

  test('rejects a tag shorter than 2 characters', () => {
    const result = RecipeSchema.safeParse({ ...validRecipe, tags: ['a'] });
    expect(result.success).toBe(false);
  });

  test('rejects a tag longer than 20 characters', () => {
    const result = RecipeSchema.safeParse({ ...validRecipe, tags: ['a'.repeat(21)] });
    expect(result.success).toBe(false);
  });

  test('rejects a tag with uppercase letters', () => {
    const result = RecipeSchema.safeParse({ ...validRecipe, tags: ['Quick'] });
    expect(result.success).toBe(false);
  });

  test('rejects a tag with spaces', () => {
    const result = RecipeSchema.safeParse({ ...validRecipe, tags: ['kid friendly'] });
    expect(result.success).toBe(false);
  });

  test('accepts hyphenated lowercase tags', () => {
    const result = RecipeSchema.safeParse({
      ...validRecipe,
      tags: ['kid-friendly', 'one-pot', 'gluten-free'],
    });
    expect(result.success).toBe(true);
  });
});

describe('Business rule: steps', () => {
  test('rejects a step shorter than 5 characters', () => {
    const result = RecipeSchema.safeParse({ ...validRecipe, steps: ['Hi.'] });
    expect(result.success).toBe(false);
  });

  test('rejects a step longer than 500 characters', () => {
    const result = RecipeSchema.safeParse({
      ...validRecipe,
      steps: ['x'.repeat(501)],
    });
    expect(result.success).toBe(false);
  });

  test(`rejects more than ${MAX_STEPS} steps`, () => {
    const many = Array.from({ length: MAX_STEPS + 1 }, () => 'Mix everything.');
    const result = RecipeSchema.safeParse({ ...validRecipe, steps: many });
    expect(result.success).toBe(false);
  });
});

describe('RecipeModel', () => {
  test('can create and retrieve a recipe document', async () => {
    const created = await RecipeModel.create(validRecipe);
    expect(created._id).toBeDefined();
    expect(created.title).toBe('Classic Spaghetti');

    const found = await RecipeModel.findById(created._id).lean();
    expect(found).not.toBeNull();
    expect(found?.title).toBe('Classic Spaghetti');
  });
});
