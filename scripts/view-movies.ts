// scripts/view-movies.ts
import prisma from '../src/lib/db';

const viewMovies = async () => {
  try {
    const movies = await prisma.movie.findMany({
      select: {
        id: true,
        title: true,
        year: true,
        director: true,
        genre: true,
        rating: true,
      },
    });

    console.log('\nMovies in database:');
    console.log('==================');
    movies.forEach(movie => {
      console.log(`\nID: ${movie.id}`);
      console.log(`Title: ${movie.title}`);
      console.log(`Year: ${movie.year}`);
      console.log(`Director: ${movie.director}`);
      console.log(`Genres: ${movie.genre.join(', ')}`);
      console.log(`Rating: ${movie.rating}`);
      console.log('------------------');
    });

    console.log(`\nTotal movies: ${movies.length}`);
  } catch (error) {
    console.error('Error viewing movies:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

viewMovies();