'use client';

import { use, useState } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import { recipeKeys } from '@/lib/recipe-keys';
import type { TRecipeDocument } from '@/lib/schemas/recipe';

class NotFoundError extends Error {
  constructor(message = 'Recipe not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

async function fetchRecipe(id: string): Promise<TRecipeDocument> {
  const res = await fetch(`/api/recipes/${id}`);
  if (res.status === 404) throw new NotFoundError();
  if (!res.ok) throw new Error('Failed to fetch recipe');
  return res.json() as Promise<TRecipeDocument>;
}

async function deleteRecipe(id: string): Promise<void> {
  const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
  if (res.status === 404) throw new NotFoundError();
  if (!res.ok && res.status !== 204) throw new Error('Failed to delete recipe');
}

export default function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const {
    data: recipe,
    isLoading,
    error,
  } = useQuery({
    queryKey: recipeKeys.detail(id),
    queryFn: () => fetchRecipe(id),
    retry: (failureCount, err) => {
      if (err instanceof NotFoundError) return false;
      return failureCount < 2;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteRecipe(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: recipeKeys.lists() });
      queryClient.removeQueries({ queryKey: recipeKeys.detail(id) });
      router.push('/recipes');
    },
  });

  if (isLoading) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress data-testid="loading-spinner" />
        </Box>
      </Container>
    );
  }

  if (error instanceof NotFoundError) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Recipe not found.
        </Alert>
        <Button component={NextLink} href="/recipes" variant="outlined">
          Back to list
        </Button>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error instanceof Error ? error.message : 'Load failed'}
        </Alert>
        <Button component={NextLink} href="/recipes" variant="outlined">
          Back to list
        </Button>
      </Container>
    );
  }

  if (!recipe) return null;

  const total = recipe.prepMin + recipe.cookMin;

  return (
    <Container maxWidth="md" sx={{ py: 4 }} data-testid="recipe-detail">
      <Box sx={{ mb: 2 }}>
        <Button component={NextLink} href="/recipes" variant="text" size="small">
          ← Back to list
        </Button>
      </Box>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 2,
          flexWrap: 'wrap',
          mb: 2,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h3" sx={{ fontSize: { xs: '2rem', md: '2.5rem' } }}>
              {recipe.title}
            </Typography>
            <Chip
              label={recipe.difficulty}
              size="small"
              color={
                recipe.difficulty === 'easy'
                  ? 'success'
                  : recipe.difficulty === 'medium'
                    ? 'warning'
                    : 'error'
              }
            />
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            component={NextLink}
            href={`/recipes/${id}/edit`}
            variant="outlined"
            data-testid="edit-button"
          >
            Edit
          </Button>
          <Button
            variant="outlined"
            color="error"
            onClick={() => setConfirmOpen(true)}
            data-testid="delete-button"
          >
            Delete
          </Button>
        </Stack>
      </Box>

      <Typography variant="body1" sx={{ mb: 2 }}>
        {recipe.description}
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Servings: {recipe.servings} · Prep: {recipe.prepMin} min · Cook:{' '}
        {recipe.cookMin} min · Total: {total} min
      </Typography>

      {recipe.tags.length > 0 && (
        <Box sx={{ mb: 3, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {recipe.tags.map((tag) => (
            <Chip key={tag} label={tag} size="small" variant="outlined" />
          ))}
        </Box>
      )}

      <Divider sx={{ my: 3 }} />

      <Typography variant="h5" sx={{ mb: 1 }}>
        Ingredients
      </Typography>
      <List dense data-testid="ingredients-list">
        {recipe.ingredients.map((ing, idx) => (
          <ListItem key={`${ing.name}-${idx}`} disableGutters>
            <ListItemText primary={`${ing.qty} ${ing.unit} ${ing.name}`} />
          </ListItem>
        ))}
      </List>

      <Divider sx={{ my: 3 }} />

      <Typography variant="h5" sx={{ mb: 1 }}>
        Steps
      </Typography>
      <Box
        component="ol"
        data-testid="steps-list"
        sx={{ pl: 3, m: 0, '& li': { mb: 1 } }}
      >
        {recipe.steps.map((step, idx) => (
          <li key={idx}>
            <Typography variant="body1">{step}</Typography>
          </li>
        ))}
      </Box>

      {deleteMutation.isError && (
        <Alert severity="error" sx={{ mt: 3 }}>
          {deleteMutation.error instanceof Error
            ? deleteMutation.error.message
            : 'Delete failed'}
        </Alert>
      )}

      <Dialog
        open={confirmOpen}
        onClose={() => {
          if (!deleteMutation.isPending) setConfirmOpen(false);
        }}
        data-testid="delete-dialog"
      >
        <DialogTitle>Delete recipe?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete this recipe? This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmOpen(false)}
            disabled={deleteMutation.isPending}
            data-testid="delete-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={() => deleteMutation.mutate()}
            color="error"
            variant="contained"
            disabled={deleteMutation.isPending}
            data-testid="delete-confirm"
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
