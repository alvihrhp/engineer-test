'use client';

import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import Pagination from '@mui/material/Pagination';
import { recipeKeys } from '@/lib/recipe-keys';
import type { TRecipeDocument } from '@/lib/schemas/recipe';

const TAG_OPTIONS = [
  'quick',
  'vegan',
  'spicy',
  'comfort',
  'healthy',
  'kid-friendly',
  'one-pot',
  'gluten-free',
  'vegetarian',
  'high-protein',
  'meal-prep',
  'easy',
  'weeknight',
  'summer',
  'winter',
];

const PAGE_LIMIT = 20;

type Difficulty = '' | 'easy' | 'medium' | 'hard';

type RecipeListResponse = {
  items: TRecipeDocument[];
  total: number;
  page: number;
  limit: number;
};

async function fetchRecipes(params: {
  search: string;
  tags: string[];
  difficulty: Difficulty;
  page: number;
}): Promise<RecipeListResponse> {
  const sp = new URLSearchParams();
  if (params.search.trim()) sp.set('search', params.search.trim());
  if (params.tags.length > 0) sp.set('tags', params.tags.join(','));
  if (params.difficulty) sp.set('difficulty', params.difficulty);
  sp.set('page', String(params.page));
  sp.set('limit', String(PAGE_LIMIT));

  const res = await fetch(`/api/recipes?${sp.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch recipes');
  return res.json() as Promise<RecipeListResponse>;
}

export default function RecipesPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('');
  const [page, setPage] = useState(1);

  // Debounce search input by 300ms
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  // Reset page to 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tags, difficulty]);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: recipeKeys.list({
      search: debouncedSearch,
      tags,
      difficulty,
      cursor: String(page),
    }),
    queryFn: () =>
      fetchRecipes({ search: debouncedSearch, tags, difficulty, page }),
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const limit = data?.limit ?? PAGE_LIMIT;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Typography variant="h4">Recipes</Typography>
        <Button
          component={NextLink}
          href="/recipes/new"
          variant="contained"
          data-testid="new-recipe-button"
        >
          New Recipe
        </Button>
      </Box>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <TextField
          label="Search"
          placeholder="Search by title or description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          inputProps={{ 'data-testid': 'search-input' }}
          sx={{ flex: 1, minWidth: 200 }}
        />
        <Autocomplete
          multiple
          size="small"
          options={TAG_OPTIONS}
          value={tags}
          onChange={(_, value) => setTags(value)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Tags"
              inputProps={{
                ...params.inputProps,
                'data-testid': 'tag-filter',
              }}
            />
          )}
          sx={{ flex: 1, minWidth: 220 }}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="difficulty-filter-label">Difficulty</InputLabel>
          <Select
            labelId="difficulty-filter-label"
            label="Difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            inputProps={{ 'data-testid': 'difficulty-filter' }}
          >
            <MenuItem value="">
              <em>All</em>
            </MenuItem>
            <MenuItem value="easy">Easy</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="hard">Hard</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress data-testid="loading-spinner" />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error instanceof Error ? error.message : 'Load failed'}
        </Alert>
      )}

      {data && data.items.length === 0 && (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No recipes match your filters.
        </Typography>
      )}

      {data && data.items.length > 0 && (
        <Stack spacing={2} data-testid="recipe-list" sx={{ opacity: isFetching ? 0.7 : 1 }}>
          {data.items.map((recipe) => (
            <Card key={String(recipe._id)} data-testid="recipe-card">
              <CardActionArea
                component={NextLink}
                href={`/recipes/${String(recipe._id)}`}
              >
                <CardContent>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Typography variant="h6" sx={{ flex: 1 }}>
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
                  </Box>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5 }}
                  >
                    {recipe.prepMin + recipe.cookMin} min ·{' '}
                    {recipe.servings} servings
                  </Typography>
                  {recipe.tags.length > 0 && (
                    <Box
                      sx={{
                        mt: 1,
                        display: 'flex',
                        gap: 0.5,
                        flexWrap: 'wrap',
                      }}
                    >
                      {recipe.tags.map((tag) => (
                        <Chip
                          key={tag}
                          label={tag}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  )}
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}

      {data && total > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Pagination
            count={pageCount}
            page={page}
            onChange={(_, value) => setPage(value)}
            color="primary"
            data-testid="pagination"
          />
        </Box>
      )}
    </Container>
  );
}
