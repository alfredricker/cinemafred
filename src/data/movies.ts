//src/data/movies.ts
import { Movie } from '@/types/movie';

export const movies: Movie[] = [
  {
    id: 1,
    title: "The Shawshank Redemption",
    year: 1994,
    director: "Frank Darabont",
    genre: ["Drama"],
    rating: 9.3,
    r2_image_path: "https://pub-f58c527a326541cc87548f3216502f10.r2.dev/cinemafred/shawshank.jpg",  // Path for the poster in R2
    r2_video_path: "https://pub-f58c527a326541cc87548f3216502f10.r2.dev/cinemafred/shawshank.mp4",    // Path for the movie file in R2
    description: "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
    streamingUrl: "/api/movies/shawshank/movie.mp4"  // This will be handled by our new route
  },
  {
    id: 2,
    title: "The Godfather",
    year: 1972,
    director: "Francis Ford Coppola",
    genre: ["Crime", "Drama"],
    rating: 9.2,
    r2_image_path: "https://pub-f58c527a326541cc87548f3216502f10.r2.dev/cinemafred/godfather_1.jpg",
    r2_video_path: "godfather/movie.mp4",
    description: "The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.",
    streamingUrl: "/api/movies/godfather/movie.mp4"
  }
];