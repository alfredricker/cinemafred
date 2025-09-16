#!/usr/bin/env tsx

/**
 * Movie Query Script
 * 
 * Search for movies by name (exact or partial match) and display detailed information
 * including HLS conversion status, reviews, ratings, and metadata.
 * 
 * Usage:
 *   npm run query-movie "movie name"
 *   npm run query-movie:interactive
 *   tsx scripts/query-by-name.ts "The Matrix" --exact --include-reviews
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface QueryOptions {
  searchTerm: string;
  exact?: boolean;
  limit?: number;
  includeReviews?: boolean;
  includeRatings?: boolean;
}

/**
 * Query movies by name or partial name
 */
async function queryMoviesByName(options: QueryOptions) {
  const { 
    searchTerm, 
    exact = false, 
    limit = 10, 
    includeReviews = false, 
    includeRatings = false 
  } = options;

  try {
    console.log(`🔍 Searching for movies: "${searchTerm}"`);
    console.log(`   Search type: ${exact ? 'Exact match' : 'Partial match'}`);
    console.log(`   Limit: ${limit} results\n`);

    // Build the where clause based on search type
    const whereClause = exact 
      ? {
          title: {
            equals: searchTerm,
            mode: 'insensitive' as const
          }
        }
      : {
          title: {
            contains: searchTerm,
            mode: 'insensitive' as const
          }
        };

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

    const movies = await prisma.movie.findMany({
      where: whereClause,
      include: includeClause,
      orderBy: [
        { title: 'asc' },
        { year: 'desc' }
      ],
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

      console.log(`   Description: ${movie.description.substring(0, 100)}${movie.description.length > 100 ? '...' : ''}`);
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
    
    const searchTerm = await question('Enter movie name (or partial name): ');
    if (!searchTerm.trim()) {
      console.log('❌ Search term cannot be empty');
      return;
    }

    const exactMatch = await question('Exact match? (y/N): ');
    const includeReviews = await question('Include reviews? (y/N): ');
    const includeRatings = await question('Include ratings? (y/N): ');
    const limitStr = await question('Limit results (default 10): ');

    const limit = limitStr.trim() ? parseInt(limitStr) : 10;

    await queryMoviesByName({
      searchTerm: searchTerm.trim(),
      exact: exactMatch.toLowerCase() === 'y',
      includeReviews: includeReviews.toLowerCase() === 'y',
      includeRatings: includeRatings.toLowerCase() === 'y',
      limit: isNaN(limit) ? 10 : limit
    });

  } finally {
    rl.close();
  }
}

/**
 * Show usage information
 */
function showUsage() {
  console.log(`
🎬 Movie Query Script Usage:

Basic search:
  tsx scripts/query-by-name.ts "movie name"
  tsx scripts/query-by-name.ts "partial"

Options:
  --exact              Exact title match (case insensitive)
  --limit N            Limit results to N movies (default: 10)
  --include-reviews    Include user reviews in output
  --include-ratings    Include user ratings in output
  --interactive        Interactive search mode

Examples:
  tsx scripts/query-by-name.ts "The Matrix"
  tsx scripts/query-by-name.ts "matrix" --limit 5
  tsx scripts/query-by-name.ts "The Matrix" --exact --include-reviews
  tsx scripts/query-by-name.ts --interactive

NPM Scripts:
  npm run query-movie "movie name"
  npm run query-movie:interactive
`);
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

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

      // Get search term (first non-flag argument)
      const searchTerm = args.find(arg => !arg.startsWith('--'));
      
      if (!searchTerm) {
        console.error('❌ Please provide a movie name to search for');
        showUsage();
        process.exit(1);
      }

      // Parse options
      const exact = args.includes('--exact');
      const includeReviews = args.includes('--include-reviews');
      const includeRatings = args.includes('--include-ratings');
      
      const limitIndex = args.indexOf('--limit');
      const limit = limitIndex !== -1 && args[limitIndex + 1] 
        ? parseInt(args[limitIndex + 1]) || 10 
        : 10;

      await queryMoviesByName({
        searchTerm,
        exact,
        includeReviews,
        includeRatings,
        limit
      });

    } catch (error) {
      console.error('💥 Query failed:', error);
      process.exit(1);
    }
  }

  main();
}

export { queryMoviesByName, interactiveSearch };
