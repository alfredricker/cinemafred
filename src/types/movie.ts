export interface Movie {
  id: number;
  title: string;
  year: number;
  director: string;
  genre: string[];
  rating: number;
  r2_image_path: string;
  r2_video_path: string;   // New field for R2 storage
  r2_subtitles_path: string;
  description: string;
  streamingUrl: string;
  cloudflareVideoId?: string;
}

