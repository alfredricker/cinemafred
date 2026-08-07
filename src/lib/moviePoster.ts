import type { Movie } from '@/types/movie';

export const DEFAULT_MOVIE_POSTER = '/default-movie-poster.svg';

export function getMoviePosterUrl(movie: Pick<Movie, 'r2_image_path' | 'updated_at'>): string {
  if (!movie.r2_image_path) return DEFAULT_MOVIE_POSTER;
  const version = movie.updated_at ? `?v=${encodeURIComponent(movie.updated_at)}` : '';
  return `/api/movie/${movie.r2_image_path}${version}`;
}
