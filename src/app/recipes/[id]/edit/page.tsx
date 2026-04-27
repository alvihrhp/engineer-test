'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';

import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';

import RecipeForm from '../../_components/RecipeForm';
import { recipeKeys } from '@/lib/recipe-keys';
import type { TCreateRecipeInput, TRecipeDocument } from '@/lib/schemas/recipe';

function stripMeta(recipe: TRecipeDocument): TCreateRecipeInput {
  // Drop _id / createdAt / updatedAt — the form only handles input fields.
  // Defensive: ensure required arrays are arrays (in case API returns null).
  return {
    title: recipe.title,
    description: recipe.description,
    servings: recipe.servings,
    prepMin: recipe.prepMin,
    cookMin: recipe.cookMin,
    difficulty: recipe.difficulty,
    tags: recipe.tags ?? [],
    ingredients: recipe.ingredients ?? [],
    steps: recipe.steps ?? [],
  };
}

export default function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const {
    data: recipe,
    isLoading,
    error,
  } = useQuery({
    queryKey: recipeKeys.detail(id),
    queryFn: async () => {
      const res = await fetch(`/api/recipes/${id}`);
      if (!res.ok) {
        throw new Error(res.status === 404 ? 'Recipe not found' : 'Failed to load recipe');
      }
      return (await res.json()) as TRecipeDocument;
    },
  });

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Edit Recipe
      </Typography>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress data-testid="edit-loading" />
        </Box>
      )}

      {error && (
        <Alert severity="error" data-testid="edit-error">
          {error instanceof Error ? error.message : 'Failed to load recipe'}
        </Alert>
      )}

      {recipe && (
        <RecipeForm
          mode="edit"
          recipeId={id}
          initialValues={stripMeta(recipe)}
        />
      )}
    </Container>
  );
}
