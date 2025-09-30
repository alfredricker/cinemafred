// scripts/add-movie.ts
import prisma from '../src/lib/db';

interface MovieInput {
  title: string;
  year: number;
  director: string;
  genre: string[];
  description: string;
  r2_video_path: string;
  r2_image_path: string;
  r2_subtitles_path?: string;
  id?: string;
}

const addMovie = async () => {
  // Get command line arguments
  const [
    title,
    year,
    director,
    genreString,
    description,
    videoPath,
    imagePath,
    subtitlesPath,
    id
  ] = process.argv.slice(2);

  if (!title || !year || !director || !genreString || !description || !videoPath || !imagePath) {
    console.error(`
Usage: npm run add-movie "Movie Title" year "Director Name" "genre1,genre2" "Description" "video_path" "image_path" ["subtitles_path"]
Example: npm run add-movie "The Matrix" 1999 "Wachowski Sisters" "Action,Sci-Fi" "A computer programmer discovers a mysterious world..." "matrix.mp4" "matrix-poster.jpg" "matrix-subs.srt"
    `);
    process.exit(1);
  }

  const movieData: MovieInput = {
    title,
    year: parseInt(year),
    director,
    genre: genreString.split(',').map(g => g.trim()),
    description,
    r2_video_path: videoPath,
    r2_image_path: imagePath,
    r2_subtitles_path: subtitlesPath,
    id
  };

  try {
    // Check if movie already exists
    const existingMovie = await prisma.movie.findFirst({
      where: {
        title: movieData.title,
        year: movieData.year
      }
    });

    if (existingMovie) {
      console.error('A movie with this title and year already exists');
      process.exit(1);
    }

    // Create the movie
    const movie = await prisma.movie.create({
      data: {
        ...movieData,
        rating: 0 // Initial rating
      }
    });

    console.log('Movie added successfully:', movie.title);
    process.exit(0);
  } catch (error) {
    console.error('Failed to add movie:', error);
    process.exit(1);
  }
};

addMovie();