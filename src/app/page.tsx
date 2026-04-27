import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import NextLink from 'next/link';

export default function HomePage() {
  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Typography variant="h1" sx={{ mb: 2, fontSize: { xs: '2rem', md: '3rem' } }}>
        Recipe Manager
      </Typography>
      <Typography variant="h5" color="text.secondary" sx={{ mb: 4 }}>
        Senior Fullstack Engineer Interview Test
      </Typography>

      <Box sx={{ mb: 4 }}>
        <Typography variant="body1">
          Browse, create, and manage recipes. Use the button below to open the recipe list,
          where you can search, filter by tags or difficulty, and paginate through results.
        </Typography>
      </Box>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
        <Button
          component={NextLink}
          href="/recipes"
          variant="contained"
          size="large"
          data-testid="browse-recipes-cta"
        >
          Browse Recipes
        </Button>
        <Link component={NextLink} href="/recipes-example" variant="body2">
          View example reference →
        </Link>
      </Stack>
    </Container>
  );
}
