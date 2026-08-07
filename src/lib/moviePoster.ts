import type { Movie } from '@/types/movie';

export const DEFAULT_MOVIE_POSTER = '/default-movie-poster.svg';

export function getMoviePosterUrl(movie: Pick<Movie, 'r2_image_path'>): string {
  if (!movie.r2_image_path) return DEFAULT_MOVIE_POSTER;
  return `/api/movie/${movie.r2_image_path}`;
}
