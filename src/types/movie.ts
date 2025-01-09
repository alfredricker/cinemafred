export interface Movie {
  id: number;
  title: string;
  year: number;
  director: string;
  genre: string[];
  rating: number;
  poster: string;
  description: string;
  streamingUrl: string;
  cloudflareVideoId?: string; // For Cloudflare Stream integration
}