'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NextLink from 'next/link';
import { useForm, useFieldArray, Controller, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';

import {
  RecipeSchema,
  MAX_INGREDIENTS,
  MAX_STEPS,
  MAX_TAGS,
  MIN_TAG_LEN,
  MAX_TAG_LEN,
  type TCreateRecipeInput,
  type TRecipeDocument,
} from '@/lib/schemas/recipe-zod';
import { recipeKeys } from '@/lib/recipe-keys';

type RecipeFormProps = {
  mode: 'create' | 'edit';
  initialValues?: TCreateRecipeInput;
  recipeId?: string;
};

const DEFAULT_VALUES: TCreateRecipeInput = {
  title: '',
  description: '',
  servings: 4,
  prepMin: 10,
  cookMin: 20,
  difficulty: 'easy',
  tags: [],
  ingredients: [{ name: '', qty: 1, unit: 'g' }],
  steps: [''],
};

type ServerError = Error & { fieldErrors?: Record<string, string[]> };

export default function RecipeForm({ mode, initialValues, recipeId }: RecipeFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<TCreateRecipeInput>({
    resolver: zodResolver(RecipeSchema),
    defaultValues: initialValues ?? DEFAULT_VALUES,
    mode: 'onSubmit',
  });

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = form;

  const ingredients = useFieldArray({ control, name: 'ingredients' });
  const steps = useFieldArray({
    control,
    // useFieldArray requires array-of-objects; the cast lets us reuse it for
    // a string[] field. defaultValues are not picked up via this hack so we
    // seed one empty step below if the array is empty.
    name: 'steps' as never,
  });

  useEffect(() => {
    if (steps.fields.length === 0) {
      steps.append('' as never);
    }
    // Run only on mount; RHF guarantees a stable `steps` object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mutation = useMutation<TRecipeDocument, ServerError, TCreateRecipeInput>({
    mutationFn: async (data) => {
      const url = mode === 'create' ? '/api/recipes' : `/api/recipes/${recipeId}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          fieldErrors?: Record<string, string[]>;
        };
        const err = new Error(body.error ?? 'Request failed') as ServerError;
        err.fieldErrors = body.fieldErrors;
        throw err;
      }
      return (await res.json()) as TRecipeDocument;
    },
    onSuccess: (recipe) => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.lists() });
      if (mode === 'edit') {
        queryClient.invalidateQueries({ queryKey: recipeKeys.detail(String(recipe._id)) });
      }
      router.push(`/recipes/${recipe._id}`);
    },
    onError: (err) => {
      if (err.fieldErrors) {
        for (const [path, messages] of Object.entries(err.fieldErrors)) {
          if (!messages || messages.length === 0) continue;
          setError(path as FieldPath<TCreateRecipeInput>, {
            type: 'server',
            message: messages[0],
          });
        }
      }
    },
  });

  const onSubmit = handleSubmit((data) => mutation.mutate(data));

  const cancelHref = mode === 'create' ? '/recipes' : `/recipes/${recipeId}`;

  // Show top-level alert only when there's an error message and no fieldErrors
  // (or fieldErrors didn't cover everything — we always surface the message).
  const showTopLevelAlert =
    mutation.isError &&
    (!mutation.error?.fieldErrors || Object.keys(mutation.error.fieldErrors).length === 0);

  return (
    <Box
      component="form"
      onSubmit={onSubmit}
      noValidate
      data-testid="recipe-form"
    >
      {showTopLevelAlert && (
        <Alert severity="error" sx={{ mb: 3 }} data-testid="form-error">
          {mutation.error?.message ?? 'Something went wrong'}
        </Alert>
      )}

      <Stack spacing={3}>
        {/* Title */}
        <TextField
          label="Title"
          fullWidth
          required
          inputProps={{ 'data-testid': 'title-input' }}
          {...register('title')}
          error={!!errors.title}
          helperText={errors.title?.message}
        />

        {/* Description */}
        <TextField
          label="Description"
          fullWidth
          multiline
          rows={3}
          required
          inputProps={{ 'data-testid': 'description-input' }}
          {...register('description')}
          error={!!errors.description}
          helperText={errors.description?.message}
        />

        {/* Servings / Prep / Cook / Difficulty row */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Controller
            name="servings"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Servings"
                type="number"
                value={field.value ?? ''}
                onChange={(e) =>
                  field.onChange(e.target.value === '' ? '' : Number(e.target.value))
                }
                inputProps={{ 'data-testid': 'servings-input', min: 1, step: 1 }}
                sx={{ width: { xs: '100%', sm: 120 } }}
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
              />
            )}
          />
          <Controller
            name="prepMin"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Prep (min)"
                type="number"
                value={field.value ?? ''}
                onChange={(e) =>
                  field.onChange(e.target.value === '' ? '' : Number(e.target.value))
                }
                inputProps={{ 'data-testid': 'prep-input', min: 0, step: 1 }}
                sx={{ width: { xs: '100%', sm: 120 } }}
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
              />
            )}
          />
          <Controller
            name="cookMin"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Cook (min)"
                type="number"
                value={field.value ?? ''}
                onChange={(e) =>
                  field.onChange(e.target.value === '' ? '' : Number(e.target.value))
                }
                inputProps={{ 'data-testid': 'cook-input', min: 0, step: 1 }}
                sx={{ width: { xs: '100%', sm: 120 } }}
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
              />
            )}
          />
          <Controller
            name="difficulty"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                select
                label="Difficulty"
                inputProps={{ 'data-testid': 'difficulty-input' }}
                sx={{ width: { xs: '100%', sm: 160 } }}
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
              >
                <MenuItem value="easy">Easy</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="hard">Hard</MenuItem>
              </TextField>
            )}
          />
        </Stack>

        {/* Tags */}
        <Controller
          name="tags"
          control={control}
          render={({ field, fieldState }) => (
            <Autocomplete
              multiple
              freeSolo
              options={[] as string[]}
              value={field.value ?? []}
              onChange={(_, value) => field.onChange(value)}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => {
                  const { key, ...tagProps } = getTagProps({ index });
                  return (
                    <Chip key={key} variant="outlined" label={option} {...tagProps} />
                  );
                })
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Tags"
                  placeholder="Type a tag and press Enter"
                  inputProps={{
                    ...params.inputProps,
                    'data-testid': 'tags-input',
                  }}
                  error={!!fieldState.error}
                  helperText={
                    fieldState.error?.message ??
                    `Format: ^[a-z0-9-]+$, ${MIN_TAG_LEN}-${MAX_TAG_LEN} chars, max ${MAX_TAGS}`
                  }
                />
              )}
            />
          )}
        />

        <Divider />

        {/* Ingredients */}
        <Box>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Ingredients
          </Typography>
          <Stack spacing={2}>
            {ingredients.fields.map((ingField, idx) => {
              const rowError = errors.ingredients?.[idx];
              return (
                <Stack
                  key={ingField.id}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  alignItems={{ xs: 'stretch', sm: 'flex-start' }}
                  data-testid={`ingredient-row-${idx}`}
                >
                  <TextField
                    label="Name"
                    sx={{ flex: 2 }}
                    inputProps={{ 'data-testid': `ingredient-name-${idx}` }}
                    {...register(`ingredients.${idx}.name` as const)}
                    error={!!rowError?.name}
                    helperText={rowError?.name?.message}
                  />
                  <Controller
                    name={`ingredients.${idx}.qty` as const}
                    control={control}
                    render={({ field, fieldState }) => (
                      <TextField
                        {...field}
                        label="Qty"
                        type="number"
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        inputProps={{
                          'data-testid': `ingredient-qty-${idx}`,
                          step: 'any',
                          min: 0,
                        }}
                        sx={{ width: { xs: '100%', sm: 120 } }}
                        error={!!fieldState.error}
                        helperText={fieldState.error?.message}
                      />
                    )}
                  />
                  <TextField
                    label="Unit"
                    sx={{ width: { xs: '100%', sm: 120 } }}
                    inputProps={{ 'data-testid': `ingredient-unit-${idx}` }}
                    {...register(`ingredients.${idx}.unit` as const)}
                    error={!!rowError?.unit}
                    helperText={rowError?.unit?.message}
                  />
                  <IconButton
                    aria-label="Remove ingredient"
                    color="error"
                    onClick={() => ingredients.remove(idx)}
                    disabled={ingredients.fields.length <= 1}
                    data-testid={`remove-ingredient-${idx}`}
                    sx={{ alignSelf: { xs: 'flex-end', sm: 'center' } }}
                  >
                    {/* Use a simple text X to avoid a new icon import */}
                    <Box component="span" sx={{ fontSize: 20, lineHeight: 1 }}>
                      ×
                    </Box>
                  </IconButton>
                </Stack>
              );
            })}
          </Stack>
          {errors.ingredients?.message && (
            <Typography color="error" variant="caption" sx={{ mt: 1, display: 'block' }}>
              {errors.ingredients.message}
            </Typography>
          )}
          {typeof errors.ingredients?.root?.message === 'string' && (
            <Typography color="error" variant="caption" sx={{ mt: 1, display: 'block' }}>
              {errors.ingredients.root.message}
            </Typography>
          )}
          <Button
            sx={{ mt: 2 }}
            onClick={() => ingredients.append({ name: '', qty: 1, unit: 'g' })}
            disabled={ingredients.fields.length >= MAX_INGREDIENTS}
            data-testid="add-ingredient"
          >
            Add ingredient
          </Button>
        </Box>

        <Divider />

        {/* Steps */}
        <Box>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Steps
          </Typography>
          <Stack spacing={2}>
            {steps.fields.map((stepField, idx) => {
              const stepError = errors.steps?.[idx];
              return (
                <Stack
                  key={stepField.id}
                  direction="row"
                  spacing={2}
                  alignItems="flex-start"
                  data-testid={`step-row-${idx}`}
                >
                  <Typography sx={{ pt: 2, minWidth: 24 }} color="text.secondary">
                    {idx + 1}.
                  </Typography>
                  <TextField
                    label={`Step ${idx + 1}`}
                    fullWidth
                    multiline
                    rows={2}
                    inputProps={{ 'data-testid': `step-input-${idx}` }}
                    {...register(`steps.${idx}` as const)}
                    error={!!stepError}
                    helperText={stepError?.message}
                  />
                  <IconButton
                    aria-label="Remove step"
                    color="error"
                    onClick={() => steps.remove(idx)}
                    disabled={steps.fields.length <= 1}
                    data-testid={`remove-step-${idx}`}
                  >
                    <Box component="span" sx={{ fontSize: 20, lineHeight: 1 }}>
                      ×
                    </Box>
                  </IconButton>
                </Stack>
              );
            })}
          </Stack>
          {errors.steps?.message && (
            <Typography color="error" variant="caption" sx={{ mt: 1, display: 'block' }}>
              {errors.steps.message}
            </Typography>
          )}
          {typeof errors.steps?.root?.message === 'string' && (
            <Typography color="error" variant="caption" sx={{ mt: 1, display: 'block' }}>
              {errors.steps.root.message}
            </Typography>
          )}
          <Button
            sx={{ mt: 2 }}
            onClick={() => steps.append('' as never)}
            disabled={steps.fields.length >= MAX_STEPS}
            data-testid="add-step"
          >
            Add step
          </Button>
        </Box>

        <Divider />

        {/* Action row */}
        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button
            component={NextLink}
            href={cancelHref}
            variant="outlined"
            data-testid="cancel-button"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={mutation.isPending}
            data-testid="submit-button"
          >
            {mutation.isPending
              ? 'Saving…'
              : mode === 'create'
                ? 'Create recipe'
                : 'Save changes'}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
