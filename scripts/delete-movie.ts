// scripts/delete-movie.ts
import prisma from '../src/lib/db';

const deleteMovie = async () => {
  const movieId = process.argv[2];

  if (!movieId) {
    console.error('Usage: npm run delete-movie <movie-id>');
    process.exit(1);
  }

  try {
    // First check if the movie exists
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      select: {
        title: true,
        year: true,
      },
    });

    if (!movie) {
      console.error('Movie not found');
      process.exit(1);
    }

    // Confirm deletion
    console.log(`\nAbout to delete:`);
    console.log(`Title: ${movie.title}`);
    console.log(`Year: ${movie.year}`);
    console.log('\nAre you sure? This action cannot be undone.');
    
    // Wait for user input
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('Type "YES" to confirm: ', async (answer: string) => {
      if (answer === 'YES') {
        // Delete related records first
        await prisma.rating.deleteMany({
          where: { movie_id: movieId },
        });

        await prisma.review.deleteMany({
          where: { movie_id: movieId },
        });

        // Then delete the movie
        await prisma.movie.delete({
          where: { id: movieId },
        });

        console.log('Movie deleted successfully');
      } else {
        console.log('Deletion cancelled');
      }
      
      readline.close();
      await prisma.$disconnect();
    });
  } catch (error) {
    console.error('Error deleting movie:', error);
    process.exit(1);
  }
};

deleteMovie();