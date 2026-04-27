import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constants — exported so client form and server validators share the limits
// ---------------------------------------------------------------------------

export const TAG_REGEX = /^[a-z0-9-]+$/;
export const MIN_TAG_LEN = 2;
export const MAX_TAG_LEN = 20;
export const MAX_TAGS = 5;

export const MIN_INGREDIENTS = 1;
export const MAX_INGREDIENTS = 50;

export const MIN_STEP_LEN = 5;
export const MAX_STEP_LEN = 500;
export const MAX_STEPS = 30;

export const MAX_TOTAL_MIN = 1440;

// ---------------------------------------------------------------------------
// Zod schemas — shape + business rules
// Client-safe (no mongoose import). Server enforces title uniqueness via DB.
// ---------------------------------------------------------------------------

export const IngredientSchema = z.object({
  name: z.string().trim().min(1, 'Ingredient name is required').max(100),
  qty: z.number().positive('Quantity must be greater than 0'),
  unit: z.string().trim().min(1, 'Unit is required').max(20),
});

export type TIngredient = z.infer<typeof IngredientSchema>;

const baseRecipeSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().min(1, 'Description is required').max(2000),
  servings: z
    .number({ invalid_type_error: 'Servings must be a number' })
    .int('Servings must be an integer')
    .positive('Servings must be greater than 0'),
  prepMin: z
    .number({ invalid_type_error: 'Prep time must be a number' })
    .int('Prep time must be an integer')
    .nonnegative('Prep time cannot be negative'),
  cookMin: z
    .number({ invalid_type_error: 'Cook time must be a number' })
    .int('Cook time must be an integer')
    .nonnegative('Cook time cannot be negative'),
  difficulty: z.enum(['easy', 'medium', 'hard'], {
    errorMap: () => ({ message: 'Difficulty must be easy, medium, or hard' }),
  }),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(MIN_TAG_LEN, `Tag must be at least ${MIN_TAG_LEN} characters`)
        .max(MAX_TAG_LEN, `Tag must be at most ${MAX_TAG_LEN} characters`)
        .regex(TAG_REGEX, 'Tag must match ^[a-z0-9-]+$')
    )
    .max(MAX_TAGS, `At most ${MAX_TAGS} tags allowed`),
  ingredients: z
    .array(IngredientSchema)
    .min(MIN_INGREDIENTS, 'At least 1 ingredient required')
    .max(MAX_INGREDIENTS, `At most ${MAX_INGREDIENTS} ingredients allowed`),
  steps: z
    .array(
      z
        .string()
        .trim()
        .min(MIN_STEP_LEN, `Each step must be at least ${MIN_STEP_LEN} characters`)
        .max(MAX_STEP_LEN, `Each step must be at most ${MAX_STEP_LEN} characters`)
    )
    .min(1, 'At least 1 step required')
    .max(MAX_STEPS, `At most ${MAX_STEPS} steps allowed`),
});

export const RecipeSchema = baseRecipeSchema.superRefine((data, ctx) => {
  const total = data.prepMin + data.cookMin;
  if (total <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['prepMin'],
      message: 'Total time (prep + cook) must be greater than 0',
    });
  } else if (total > MAX_TOTAL_MIN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cookMin'],
      message: `Total time (prep + cook) must be at most ${MAX_TOTAL_MIN} minutes`,
    });
  }

  const seen = new Map<string, number>();
  data.ingredients.forEach((ing, idx) => {
    const key = ing.name.trim().toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ingredients', idx, 'name'],
        message: `Duplicate ingredient name (case-insensitive): "${ing.name}"`,
      });
    } else {
      seen.set(key, idx);
    }
  });
});

export const RecipeUpdateSchema = baseRecipeSchema.partial();

export type TCreateRecipeInput = z.infer<typeof RecipeSchema>;
export type TUpdateRecipeInput = z.infer<typeof RecipeUpdateSchema>;

export const RecipeDocumentSchema = baseRecipeSchema.extend({
  _id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TRecipeDocument = z.infer<typeof RecipeDocumentSchema>;

// ---------------------------------------------------------------------------
// Normalization helpers — used by API layer before persistence + uniqueness
// checks. Pure and synchronous, safe for both client and server.
// ---------------------------------------------------------------------------

export function normalizeTitle(title: string): string {
  return title.trim();
}
