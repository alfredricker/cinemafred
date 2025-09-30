#!/usr/bin/env tsx

/**
 * Enhanced Movie Query Script
 * 
 * Search for movies by any field (title, director, genre, year, etc.) and display 
 * detailed information including HLS conversion status, reviews, ratings, and metadata.
 * 
 * Usage:
 *   npm run query-movie "movie name"
 *   npm run query-movie:interactive
 *   tsx scripts/query.ts --title "The Matrix" --exact --include-reviews
 *   tsx scripts/query.ts --director "Christopher Nolan" --year 2020
 *   tsx scripts/query.ts --genre "Action" --rating-min 4.0
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

interface QueryOptions {
  // Search fields
  id?: string;
  title?: string;
  director?: string;
  genre?: string;
  year?: number;
  yearMin?: number;
  yearMax?: number;
  ratingMin?: number;
  ratingMax?: number;
  hlsReady?: boolean;
  durationMin?: number; // in seconds
  durationMax?: number; // in seconds
  
  // Search behavior
  exact?: boolean;
  limit?: number;
  includeReviews?: boolean;
  includeRatings?: boolean;
  
  // Display options
  sortBy?: 'title' | 'year' | 'rating' | 'created' | 'updated';
  sortOrder?: 'asc' | 'desc';
  showAll?: boolean; // Show all fields instead of summary
}

/**
 * Build where clause from query options
 */
function buildWhereClause(options: QueryOptions): Prisma.MovieWhereInput {
  const whereClause: Prisma.MovieWhereInput = {};

  // ID search (exact match only)
  if (options.id) {
    whereClause.id = options.id;
  }

  // Title search
  if (options.title) {
    whereClause.title = options.exact 
      ? { equals: options.title, mode: 'insensitive' }
      : { contains: options.title, mode: 'insensitive' };
  }

  // Director search
  if (options.director) {
    whereClause.director = options.exact 
      ? { equals: options.director, mode: 'insensitive' }
      : { contains: options.director, mode: 'insensitive' };
  }

  // Genre search
  if (options.genre) {
    whereClause.genre = { has: options.genre };
  }

  // Year search
  if (options.year) {
    whereClause.year = options.year;
  } else if (options.yearMin || options.yearMax) {
    whereClause.year = {};
    if (options.yearMin) whereClause.year.gte = options.yearMin;
    if (options.yearMax) whereClause.year.lte = options.yearMax;
  }

  // Rating search
  if (options.ratingMin || options.ratingMax) {
    whereClause.averageRating = {};
    if (options.ratingMin) whereClause.averageRating.gte = options.ratingMin;
    if (options.ratingMax) whereClause.averageRating.lte = options.ratingMax;
  }

  // HLS ready filter
  if (options.hlsReady !== undefined) {
    whereClause.hls_ready = options.hlsReady;
  }

  // Duration search
  if (options.durationMin || options.durationMax) {
    whereClause.duration = {};
    if (options.durationMin) whereClause.duration.gte = options.durationMin;
    if (options.durationMax) whereClause.duration.lte = options.durationMax;
  }

  return whereClause;
}

/**
 * Build order by clause from options
 */
function buildOrderBy(options: QueryOptions): Prisma.MovieOrderByWithRelationInput[] {
  const sortBy = options.sortBy || 'title';
  const sortOrder = options.sortOrder || 'asc';

  switch (sortBy) {
    case 'title':
      return [{ title: sortOrder }];
    case 'year':
      return [{ year: sortOrder }];
    case 'rating':
      return [{ averageRating: sortOrder }];
    case 'created':
      return [{ created_at: sortOrder }];
    case 'updated':
      return [{ updated_at: sortOrder }];
    default:
      return [{ title: 'asc' }];
  }
}

/**
 * Enhanced query function for movies
 */
async function queryMovies(options: QueryOptions) {
  const { 
    limit = 10, 
    includeReviews = false, 
    includeRatings = false,
    showAll = false
  } = options;

  try {
    // Build search criteria display
    const searchCriteria = [];
    if (options.id) searchCriteria.push(`ID: "${options.id}"`);
    if (options.title) searchCriteria.push(`title: "${options.title}"`);
    if (options.director) searchCriteria.push(`director: "${options.director}"`);
    if (options.genre) searchCriteria.push(`genre: "${options.genre}"`);
    if (options.year) searchCriteria.push(`year: ${options.year}`);
    if (options.yearMin || options.yearMax) {
      const yearRange = [];
      if (options.yearMin) yearRange.push(`${options.yearMin}+`);
      if (options.yearMax) yearRange.push(`-${options.yearMax}`);
      searchCriteria.push(`year: ${yearRange.join('')}`);
    }
    if (options.ratingMin || options.ratingMax) {
      const ratingRange = [];
      if (options.ratingMin) ratingRange.push(`${options.ratingMin}+`);
      if (options.ratingMax) ratingRange.push(`-${options.ratingMax}`);
      searchCriteria.push(`rating: ${ratingRange.join('')}`);
    }
    if (options.hlsReady !== undefined) searchCriteria.push(`HLS: ${options.hlsReady ? 'ready' : 'not ready'}`);

    console.log(`🔍 Searching for movies:`);
    if (searchCriteria.length > 0) {
      console.log(`   Criteria: ${searchCriteria.join(', ')}`);
    } else {
      console.log(`   Criteria: All movies`);
    }
    console.log(`   Search type: ${options.exact ? 'Exact match' : 'Partial match'}`);
    console.log(`   Limit: ${limit} results\n`);

    // Build where clause
    const whereClause = buildWhereClause(options);

    // Build the include clause for related data
    const includeClause = {
      reviews: includeReviews ? {
        include: {
          user: {
            select: {
              username: true,
              email: true
            }
          }
        }
      } : undefined,
      ratings: includeRatings ? {
        include: {
          user: {
            select: {
              username: true
            }
          }
        }
      } : undefined
    };

    // Build order by clause
    const orderBy = buildOrderBy(options);

    const movies = await prisma.movie.findMany({
      where: whereClause,
      include: includeClause,
      orderBy,
      take: limit
    });

    if (movies.length === 0) {
      console.log('❌ No movies found matching your search criteria');
      return [];
    }

    console.log(`✅ Found ${movies.length} movie(s):\n`);

    // Display results
    movies.forEach((movie, index) => {
      console.log(`${index + 1}. 📽️  ${movie.title} (${movie.year})`);
      console.log(`   ID: ${movie.id}`);
      
      console.log(`   Director: ${movie.director}`);
      console.log(`   Genre: ${movie.genre.join(', ')}`);
      console.log(`   Rating: ${movie.averageRating?.toFixed(1) || 'No rating'}/5.0`);
      
      if (movie.duration) {
        const hours = Math.floor(movie.duration / 3600);
        const minutes = Math.floor((movie.duration % 3600) / 60);
        console.log(`   Duration: ${hours}h ${minutes}m`);
      }

      if (showAll) {
        console.log(`   Video: ${movie.r2_video_path}`);
        console.log(`   Poster: ${movie.r2_image_path}`);
        
        if (movie.r2_hls_path) {
          console.log(`   HLS: ${movie.r2_hls_path} ${movie.hls_ready ? '✅' : '⏳'}`);
        } else {
          console.log(`   HLS: Not converted`);
        }

        if (movie.r2_subtitles_path) {
          console.log(`   Subtitles: ${movie.r2_subtitles_path}`);
        }

        console.log(`   Created: ${movie.created_at.toLocaleDateString()}`);
        console.log(`   Updated: ${movie.updated_at.toLocaleDateString()}`);
      } else {
        // Summary view
        if (movie.r2_hls_path) {
          console.log(`   HLS: ${movie.hls_ready ? '✅ Ready' : '⏳ Processing'}`);
        } else {
          console.log(`   HLS: Not converted`);
        }
      }

      // Show reviews if included
      if (includeReviews && movie.reviews && movie.reviews.length > 0) {
        console.log(`   Reviews (${movie.reviews.length}):`);
        movie.reviews.forEach((review, i) => {
          const username = (review as any).user?.username || 'Unknown User';
          console.log(`     ${i + 1}. ${username}: ${review.rating}/5 - "${review.review_text || 'No comment'}"`);
        });
      }

      // Show ratings if included
      if (includeRatings && movie.ratings && movie.ratings.length > 0) {
        console.log(`   Ratings (${movie.ratings.length}):`);
        const avgRating = movie.ratings.reduce((sum, r) => sum + r.value, 0) / movie.ratings.length;
        console.log(`     Average: ${avgRating.toFixed(1)}/5.0`);
        movie.ratings.slice(0, 3).forEach((rating, i) => {
          const username = (rating as any).user?.username || 'Unknown User';
          console.log(`     ${i + 1}. ${username}: ${rating.value}/5`);
        });
        if (movie.ratings.length > 3) {
          console.log(`     ... and ${movie.ratings.length - 3} more`);
        }
      }

      if (showAll) {
        console.log(`   Description: ${movie.description.substring(0, 100)}${movie.description.length > 100 ? '...' : ''}`);
      }
      console.log(''); // Empty line between movies
    });

    return movies;

  } catch (error) {
    console.error('❌ Error querying movies:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Interactive search function
 */
async function interactiveSearch() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  try {
    console.log('🎬 Interactive Movie Search\n');
    
    const options: QueryOptions = {};

    // ID search
    const id = await question('Enter movie ID (or press Enter to skip): ');
    if (id.trim()) {
      options.id = id.trim();
    }

    // Title search
    const title = await question('Enter movie title (or press Enter to skip): ');
    if (title.trim()) {
      options.title = title.trim();
    }

    // Director search
    const director = await question('Enter director name (or press Enter to skip): ');
    if (director.trim()) {
      options.director = director.trim();
    }

    // Genre search
    const genre = await question('Enter genre (or press Enter to skip): ');
    if (genre.trim()) {
      options.genre = genre.trim();
    }

    // Year search
    const yearStr = await question('Enter year (or press Enter to skip): ');
    if (yearStr.trim()) {
      const year = parseInt(yearStr);
      if (!isNaN(year)) {
        options.year = year;
      }
    }

    // Rating search
    const ratingMinStr = await question('Minimum rating (0-5, or press Enter to skip): ');
    if (ratingMinStr.trim()) {
      const ratingMin = parseFloat(ratingMinStr);
      if (!isNaN(ratingMin)) {
        options.ratingMin = ratingMin;
      }
    }

    // HLS status
    const hlsStatus = await question('HLS status (ready/not-ready/all, default: all): ');
    if (hlsStatus.trim() === 'ready') {
      options.hlsReady = true;
    } else if (hlsStatus.trim() === 'not-ready') {
      options.hlsReady = false;
    }

    // Search options
    const exactMatch = await question('Exact match? (y/N): ');
    const includeReviews = await question('Include reviews? (y/N): ');
    const includeRatings = await question('Include ratings? (y/N): ');
    const showAll = await question('Show all fields? (y/N): ');
    const limitStr = await question('Limit results (default 10): ');

    options.exact = exactMatch.toLowerCase() === 'y';
    options.includeReviews = includeReviews.toLowerCase() === 'y';
    options.includeRatings = includeRatings.toLowerCase() === 'y';
    options.showAll = showAll.toLowerCase() === 'y';
    options.limit = limitStr.trim() ? parseInt(limitStr) : 10;

    await queryMovies(options);

  } finally {
    rl.close();
  }
}

/**
 * Show usage information
 */
function showUsage() {
  console.log(`
🎬 Enhanced Movie Query Script Usage:

Search by any field:
  tsx scripts/query.ts --id "movie-uuid-here"
  tsx scripts/query.ts --title "The Matrix"
  tsx scripts/query.ts --director "Christopher Nolan"
  tsx scripts/query.ts --genre "Action"
  tsx scripts/query.ts --year 2020
  tsx scripts/query.ts --rating-min 4.0
  tsx scripts/query.ts --hls-ready true

Search Options:
  --id "uuid"          Search by exact movie ID
  --title "text"       Search by movie title
  --director "text"    Search by director name
  --genre "text"       Search by genre
  --year N             Search by exact year
  --year-min N         Search by minimum year
  --year-max N         Search by maximum year
  --rating-min N       Search by minimum rating (0-5)
  --rating-max N       Search by maximum rating (0-5)
  --hls-ready true     Search by HLS conversion status
  --duration-min N     Search by minimum duration (seconds)
  --duration-max N     Search by maximum duration (seconds)

Display Options:
  --exact              Exact match (case insensitive)
  --limit N            Limit results to N movies (default: 10)
  --include-reviews    Include user reviews in output
  --include-ratings    Include user ratings in output
  --show-all           Show all fields instead of summary
  --sort-by field      Sort by: title, year, rating, created, updated
  --sort-order order   Sort order: asc, desc
  --interactive        Interactive search mode

Examples:
  tsx scripts/query.ts --id "123e4567-e89b-12d3-a456-426614174000"
  tsx scripts/query.ts --title "Matrix" --exact
  tsx scripts/query.ts --director "Nolan" --year-min 2010
  tsx scripts/query.ts --genre "Action" --rating-min 4.0 --limit 5
  tsx scripts/query.ts --hls-ready true --sort-by rating --sort-order desc
  tsx scripts/query.ts --interactive

NPM Scripts:
  npm run query-movie "movie name"          # Legacy title search
  npm run query-movie "uuid-here"           # Auto-detect UUID for ID search
  npm run query-movie:interactive          # Interactive mode

Direct Script Usage (recommended for flags):
  tsx scripts/query.ts --id "uuid-here"     # Use tsx directly for flags
  tsx scripts/query.ts --title "Movie"     # Use tsx directly for flags
`);
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): QueryOptions {
  const options: QueryOptions = {};

  // Search fields
  const getArgValue = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index !== -1 && args[index + 1] ? args[index + 1] : undefined;
  };

  const getArgNumber = (flag: string): number | undefined => {
    const value = getArgValue(flag);
    return value ? parseFloat(value) : undefined;
  };

  const getArgBoolean = (flag: string): boolean | undefined => {
    const value = getArgValue(flag);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  };

  // Parse search fields
  options.id = getArgValue('--id');
  options.title = getArgValue('--title');
  options.director = getArgValue('--director');
  options.genre = getArgValue('--genre');
  options.year = getArgNumber('--year');
  options.yearMin = getArgNumber('--year-min');
  options.yearMax = getArgNumber('--year-max');
  options.ratingMin = getArgNumber('--rating-min');
  options.ratingMax = getArgNumber('--rating-max');
  options.hlsReady = getArgBoolean('--hls-ready');
  options.durationMin = getArgNumber('--duration-min');
  options.durationMax = getArgNumber('--duration-max');

  // Parse display options
  options.exact = args.includes('--exact');
  options.includeReviews = args.includes('--include-reviews');
  options.includeRatings = args.includes('--include-ratings');
  options.showAll = args.includes('--show-all');

  // Parse limit
  const limit = getArgNumber('--limit');
  options.limit = limit || 10;

  // Parse sorting
  const sortBy = getArgValue('--sort-by');
  if (sortBy && ['title', 'year', 'rating', 'created', 'updated'].includes(sortBy)) {
    options.sortBy = sortBy as any;
  }

  const sortOrder = getArgValue('--sort-order');
  if (sortOrder && ['asc', 'desc'].includes(sortOrder)) {
    options.sortOrder = sortOrder as any;
  }

  return options;
}

// CLI usage
if (require.main === module) {
  let args = process.argv.slice(2);
  
  // Remove npm's '--' separator if present
  if (args[0] === '--') {
    args = args.slice(1);
  }

  async function main() {
    try {
      // Show help
      if (args.includes('--help') || args.includes('-h')) {
        showUsage();
        return;
      }

      // Interactive mode
      if (args.includes('--interactive')) {
        await interactiveSearch();
        return;
      }

      // Check if this looks like a UUID (for ID search) - check this FIRST
      const firstArg = args[0];
      if (firstArg && firstArg.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        // Treat UUID as ID search
        const options: QueryOptions = {
          id: firstArg,
          exact: args.includes('--exact'),
          includeReviews: args.includes('--include-reviews'),
          includeRatings: args.includes('--include-ratings'),
          limit: 10
        };
        
        const limitIndex = args.indexOf('--limit');
        if (limitIndex !== -1 && args[limitIndex + 1]) {
          options.limit = parseInt(args[limitIndex + 1]) || 10;
        }

        await queryMovies(options);
        return;
      }

      // Legacy support: if first argument is not a flag, treat it as title search
      if (firstArg && !firstArg.startsWith('--')) {
        // Legacy mode: treat first argument as title
        const options: QueryOptions = {
          title: firstArg,
          exact: args.includes('--exact'),
          includeReviews: args.includes('--include-reviews'),
          includeRatings: args.includes('--include-ratings'),
          limit: 10
        };
        
        const limitIndex = args.indexOf('--limit');
        if (limitIndex !== -1 && args[limitIndex + 1]) {
          options.limit = parseInt(args[limitIndex + 1]) || 10;
        }

        await queryMovies(options);
        return;
      }

      // Parse new format
      const options = parseArgs(args);

      // Check if any search criteria provided
      const hasSearchCriteria = options.id || options.title || options.director || options.genre || 
                               options.year !== undefined || options.yearMin !== undefined || 
                               options.yearMax !== undefined || options.ratingMin !== undefined || 
                               options.ratingMax !== undefined || options.hlsReady !== undefined ||
                               options.durationMin !== undefined || options.durationMax !== undefined;

      if (!hasSearchCriteria) {
        console.error('❌ Please provide at least one search criteria');
        showUsage();
        process.exit(1);
      }

      await queryMovies(options);

    } catch (error) {
      console.error('💥 Query failed:', error);
      process.exit(1);
    }
  }

  main();
}

export { queryMovies, interactiveSearch };
