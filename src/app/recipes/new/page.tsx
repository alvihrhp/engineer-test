'use client';

import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import RecipeForm from '../_components/RecipeForm';

export default function NewRecipePage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        New Recipe
      </Typography>
      <RecipeForm mode="create" />
    </Container>
  );
}
