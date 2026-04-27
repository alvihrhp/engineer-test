import mongoose, { type Document, type Model } from 'mongoose';
import type { TCreateRecipeInput } from './recipe-zod';

// Re-export the Zod / shape layer so existing server-side imports keep
// working. Client code that needs runtime values (RecipeSchema, constants)
// should import directly from './recipe-zod' to avoid pulling mongoose into
// the client bundle.
export * from './recipe-zod';

// ---------------------------------------------------------------------------
// Mongoose schema (server-only)
// ---------------------------------------------------------------------------

const ingredientMongooseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    qty: { type: Number, required: true },
    unit: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const recipeMongooseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    servings: { type: Number, required: true },
    prepMin: { type: Number, required: true },
    cookMin: { type: Number, required: true },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      required: true,
    },
    tags: [{ type: String }],
    ingredients: [ingredientMongooseSchema],
    steps: [{ type: String }],
  },
  {
    timestamps: true,
  }
);

// Case-insensitive unique index on title. Strength 2 = case- and
// diacritic-insensitive comparison. Combined with normalizeTitle (trim) at
// the API boundary, this enforces "trimmed + case-insensitive uniqueness".
recipeMongooseSchema.index(
  { title: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

// HMR-safe model creation (prevents "Cannot overwrite model" error in Next.js dev)
export const RecipeModel: Model<TCreateRecipeInput & Document> =
  (mongoose.models['Recipe'] as Model<TCreateRecipeInput & Document> | undefined) ??
  mongoose.model<TCreateRecipeInput & Document>('Recipe', recipeMongooseSchema);
