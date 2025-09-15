// src/lib/tmdb.ts

interface TMDBMovieCredit {
    id: number;
    name: string;
    job: string;
    department: string;
  }
  
  interface TMDBMovieCredits {
    cast: Array<any>;
    crew: TMDBMovieCredit[];
  }
  
  interface TMDBGenre {
    id: number;
    name: string;
  }
  
  interface TMDBMovieDetails {
    id: number;
    title: string;
    release_date: string;
    runtime: number | null;
    overview: string;
    poster_path: string | null;
    genres: TMDBGenre[];
    credits?: TMDBMovieCredits;
  }
  
  interface TMDBSearchResult {
    id: number;
    title: string;
    release_date: string;
    overview: string;
    vote_average: number;
  }
  
  interface MovieMetadata {
    title: string;
    year: number;
    director: string;
    genre: string[];
    description: string;
    duration: number | null;
    posterUrl: string | null;
  }
  
  interface MovieSuggestion {
    id: number;
    title: string;
    year: number;
    overview: string;
    score: number;
  }
  
  interface ParsedFilename {
    title: string;
    year: number;
  }
  
  export class MovieMetadataService {
    private apiKey: string;
    private baseUrl = 'https://api.themoviedb.org/3';
  
    constructor(apiKey: string) {
      if (!apiKey) {
        throw new Error('TMDB API key is required');
      }
      this.apiKey = apiKey;
    }
  
    private parseFilename(filename: string): ParsedFilename {
        // Remove file extension if present
        const name = filename.replace(/\.[^/.]+$/, "");
        
        // Common quality indicators, codecs, and other metadata to remove
        const qualityPatterns = [
          // Quality indicators
          /\b(720p|1080p|2160p|4K|HD|UHD|HDR|SDR)\b/gi,
          // Source types
          /\b(BluRay|BDRip|DVDRip|WEBRip|WEB-DL|HDTV|CAM|TS|TC)\b/gi,
          // Codecs and formats
          /\b(x264|x265|H\.264|H\.265|HEVC|AVC|AAC|AC3|DTS|MP3)\b/gi,
          // Release groups (in brackets or after dash)
          /[-\[]([A-Z0-9]+(\.[A-Z0-9]+)*)\]?$/gi,
          // Common tags
          /\b(REPACK|PROPER|INTERNAL|LIMITED|UNRATED|EXTENDED|DC|DIRECTORS\.CUT)\b/gi,
          // File size indicators
          /\b\d+(\.\d+)?(GB|MB)\b/gi
        ];
        
        // Clean the filename by removing quality indicators and metadata
        let cleanName = name;
        qualityPatterns.forEach(pattern => {
          cleanName = cleanName.replace(pattern, '');
        });
        
        // Extract year - look for 4-digit year (1900-current year + 5)
        const currentYear = new Date().getFullYear();
        const yearPattern = /\b(19\d{2}|20\d{2})\b/g;
        const yearMatches = cleanName.match(yearPattern);
        
        if (!yearMatches || yearMatches.length === 0) {
          throw new Error(`No year found in filename: ${filename}`);
        }
        
        // Use the last valid year found (in case there are multiple)
        let year = 0;
        for (const yearStr of yearMatches) {
          const yearNum = parseInt(yearStr, 10);
          if (yearNum >= 1900 && yearNum <= currentYear + 5) {
            year = yearNum;
          }
        }
        
        if (year === 0) {
          throw new Error(`No valid year found in filename: ${filename}`);
        }
        
        // Extract title - everything before the year
        const yearIndex = cleanName.lastIndexOf(year.toString());
        let title = cleanName.slice(0, yearIndex)
          // Replace periods and underscores with spaces
          .replace(/[._]/g, ' ')
          // Add spaces before capital letters (for CamelCase)
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          // Clean up multiple spaces
          .replace(/\s+/g, ' ')
          .trim();
      
        if (!title) {
          throw new Error(`No title found in filename: ${filename}`);
        }
        
        // Capitalize first letter of each word for better matching
        title = title.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
      
        console.log('Parsed filename:', { original: filename, title, year });
        return { title, year };
    }
  
    // Calculate similarity score between two strings (0-1)
    private calculateSimilarity(s1: string, s2: string): number {
      const str1 = s1.toLowerCase();
      const str2 = s2.toLowerCase();
      
      // Remove common words and special characters
      const clean1 = str1.replace(/\b(the|a|an)\b/g, '').replace(/[^\w\s]/g, '');
      const clean2 = str2.replace(/\b(the|a|an)\b/g, '').replace(/[^\w\s]/g, '');
      
      // Split into words
      const words1 = new Set(clean1.split(/\s+/));
      const words2 = new Set(clean2.split(/\s+/));
      
      // Count matching words
      const matchingWords = [...words1].filter(word => words2.has(word)).length;
      const totalUniqueWords = new Set([...words1, ...words2]).size;
      
      return matchingWords / totalUniqueWords;
    }
  
    private async getMovieDetails(movieId: number): Promise<MovieMetadata> {
      const detailsUrl = new URL(`${this.baseUrl}/movie/${movieId}`);
      detailsUrl.searchParams.append('api_key', this.apiKey);
      detailsUrl.searchParams.append('append_to_response', 'credits');
  
      const detailsResponse = await fetch(detailsUrl.toString());
      if (!detailsResponse.ok) {
        throw new Error(`TMDB details failed: ${detailsResponse.status} ${detailsResponse.statusText}`);
      }
  
      const movieDetails: TMDBMovieDetails = await detailsResponse.json();
  
      return {
        title: movieDetails.title,
        year: new Date(movieDetails.release_date).getFullYear(),
        director: movieDetails.credits?.crew?.find(person => person.job === 'Director')?.name || '',
        genre: movieDetails.genres.map(g => g.name),
        description: movieDetails.overview,
        duration: movieDetails.runtime ? movieDetails.runtime * 60 : null,
        posterUrl: movieDetails.poster_path 
          ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}`
          : null
      };
    }
  
    async searchMovie(input: string): Promise<{ metadata: MovieMetadata | null, suggestions?: MovieSuggestion[] }> {
      try {
        let title: string;
        let year: number;

        // Check if input contains a space and a 4-digit number at the end
        if (input.includes(' ') && /\s\d{4}$/.test(input)) {
          // Input is in "title year" format (from API route)
          const parts = input.split(' ');
          year = parseInt(parts.pop()!, 10);
          title = parts.join(' ');
        } else {
          // Input is a filename, use existing parsing logic
          const parsed = this.parseFilename(input);
          title = parsed.title;
          year = parsed.year;
        }

        // First, try searching with the year
        const searchUrl = new URL(`${this.baseUrl}/search/movie`);
        searchUrl.searchParams.append('api_key', this.apiKey);
        searchUrl.searchParams.append('query', title);
        searchUrl.searchParams.append('year', year.toString());
        
        console.log('Searching TMDB with:', { title, year });
        console.log('Search URL:', searchUrl.toString());
        
        const searchResponse = await fetch(searchUrl.toString());
        if (!searchResponse.ok) {
          throw new Error(`TMDB search failed: ${searchResponse.status} ${searchResponse.statusText}`);
        }
  
        const searchData = await searchResponse.json();
        
        // If no results with year, try without year constraint
        if (!searchData.results?.length) {
          searchUrl.searchParams.delete('year');
          const broadSearchResponse = await fetch(searchUrl.toString());
          if (!broadSearchResponse.ok) {
            throw new Error('TMDB broad search failed');
          }
          const broadSearchData = await broadSearchResponse.json();
          searchData.results = broadSearchData.results;
        }
  
        if (!searchData.results?.length) {
          console.log(`No results found for "${title}"`);
          return { metadata: null, suggestions: [] };
        }
  
        // Score and filter results
        const scoredResults = searchData.results
        .map((result: TMDBSearchResult): MovieSuggestion => ({
          id: result.id,
          title: result.title,
          year: new Date(result.release_date).getFullYear(),
          overview: result.overview,
          score: this.calculateSimilarity(title, result.title)
        }))
        .filter((result: MovieSuggestion) => result.score > 0.2) // Filter out very low matches
        .sort((a: MovieSuggestion, b: MovieSuggestion) => {
          // Prioritize year match
          const aYearMatch = a.year === year ? 1 : 0;
          const bYearMatch = b.year === year ? 1 : 0;
          if (aYearMatch !== bYearMatch) return bYearMatch - aYearMatch;
      
          // Then sort by similarity score
          return b.score - a.score;
        });
      
  
        if (!scoredResults.length) {
          return { metadata: null, suggestions: [] };
        }
  
        // Get full details for the best match
        const bestMatch = await this.getMovieDetails(scoredResults[0].id);
  
        // Return metadata and other suggestions
        return {
          metadata: bestMatch,
          suggestions: scoredResults.slice(0, 5) // Return top 5 suggestions
        };
      } catch (error) {
        console.error('Error in MovieMetadataService:', error);
        throw error;
      }
    }
  }