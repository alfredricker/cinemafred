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
    poster: '/img/shawshank.jpg',
    description: "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
    streamingUrl: "#"
  },
  {
    id: 2,
    title: "The Godfather",
    year: 1972,
    director: "Francis Ford Coppola",
    genre: ["Crime", "Drama"],
    rating: 9.2,
    poster: '/img/godfather.jpg',
    description: "The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.",
    streamingUrl: "#"
  }
  // Note: This is a sample, in production we would have ~100 movies
];