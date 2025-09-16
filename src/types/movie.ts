// src/types/movie.ts
export interface Movie {
  id: string;
  title: string;
  year: number;
  duration?: number;
  director: string;
  genre: string[];
  rating: number;
  r2_image_path: string;
  r2_video_path: string;
  r2_subtitles_path?: string | null;
  r2_hls_path?: string | null; // HLS master playlist path
  hls_ready?: boolean; // Whether HLS segments are ready
  description: string;
  streaming_url?: string | null;
  cloudflare_video_id?: string | null;
  created_at: string;
  updated_at: string;
  averageRating?: number;
  _count?: {
    ratings: number;
    reviews: number;
  };
}