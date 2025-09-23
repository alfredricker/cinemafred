#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MovieInfo {
  id: string;
  title: string;
  r2_video_path: string;
  r2_hls_path: string | null;
  hls_ready: boolean;
  created_at: Date;
  duration?: number | null;
}

class MovieListManager {
  /**
   * List movies that don't have HLS conversions
   */
  async listMoviesWithoutHLS(options: {
    limit?: number;
    showAll?: boolean;
    sortBy?: 'newest' | 'oldest' | 'title';
    format?: 'table' | 'json' | 'csv';
  } = {}): Promise<void> {
    const { 
      limit = 10, 
      showAll = false, 
      sortBy = 'newest',
      format = 'table'
    } = options;

    try {
      console.log('🔍 Searching for movies without HLS conversions...\n');

      // Query movies that need HLS conversion
      const whereClause = {
        // Have a valid video path
        r2_video_path: { not: '' },
        // AND either no HLS path OR HLS not ready (failed conversion)
        OR: [
          { r2_hls_path: null },
          { r2_hls_path: '' },
          { hls_ready: false }
        ]
      };

      // Determine sort order
      let orderBy: any = { created_at: 'desc' }; // Default: newest first
      switch (sortBy) {
        case 'oldest':
          orderBy = { created_at: 'asc' };
          break;
        case 'title':
          orderBy = { title: 'asc' };
          break;
        case 'newest':
        default:
          orderBy = { created_at: 'desc' };
          break;
      }

      const movies = await prisma.movie.findMany({
        where: whereClause,
        select: {
          id: true,
          title: true,
          r2_video_path: true,
          r2_hls_path: true,
          hls_ready: true,
          created_at: true,
          duration: true
        },
        orderBy,
        take: showAll ? undefined : limit
      });

      if (movies.length === 0) {
        console.log('✅ All movies with video files have been converted to HLS!');
        return;
      }

      // Get total count for context
      const totalCount = await prisma.movie.count({ where: whereClause });
      
      if (format === 'json') {
        console.log(JSON.stringify(movies, null, 2));
        return;
      }

      if (format === 'csv') {
        this.outputCSV(movies);
        return;
      }

      // Default table format
      console.log(`📋 Found ${totalCount} movies without HLS conversions`);
      if (!showAll && totalCount > limit) {
        console.log(`   Showing first ${limit} movies (use --all to see all)\n`);
      } else {
        console.log('');
      }

      this.outputTable(movies);

      // Show summary
      console.log(`\n📊 Summary:`);
      console.log(`   Movies without HLS: ${totalCount}`);
      console.log(`   Showing: ${movies.length}`);
      
      if (!showAll && totalCount > limit) {
        console.log(`\n💡 Use --all to see all ${totalCount} movies`);
        console.log(`💡 Use --limit N to show N movies`);
      }

    } catch (error) {
      console.error('💥 Error listing movies:', error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Output movies in table format
   */
  private outputTable(movies: MovieInfo[]): void {
    // Calculate column widths
    const maxTitleWidth = Math.max(20, Math.min(50, Math.max(...movies.map(m => m.title.length))));
    const maxIdWidth = 36; // UUID length
    
    // Header
    console.log('┌─' + '─'.repeat(maxIdWidth) + '─┬─' + '─'.repeat(maxTitleWidth) + '─┬─' + '─'.repeat(12) + '─┬─' + '─'.repeat(10) + '─┐');
    console.log('│ ' + 'ID'.padEnd(maxIdWidth) + ' │ ' + 'Title'.padEnd(maxTitleWidth) + ' │ ' + 'Created'.padEnd(12) + ' │ ' + 'Duration'.padEnd(10) + ' │');
    console.log('├─' + '─'.repeat(maxIdWidth) + '─┼─' + '─'.repeat(maxTitleWidth) + '─┼─' + '─'.repeat(12) + '─┼─' + '─'.repeat(10) + '─┤');

    // Rows
    movies.forEach((movie, index) => {
      const title = movie.title.length > maxTitleWidth 
        ? movie.title.substring(0, maxTitleWidth - 3) + '...'
        : movie.title;
      
      const createdDate = movie.created_at.toISOString().split('T')[0]; // YYYY-MM-DD
      const duration = movie.duration 
        ? `${Math.floor(movie.duration / 60)}:${String(movie.duration % 60).padStart(2, '0')}`
        : 'Unknown';

      console.log('│ ' + movie.id.padEnd(maxIdWidth) + ' │ ' + title.padEnd(maxTitleWidth) + ' │ ' + createdDate.padEnd(12) + ' │ ' + duration.padEnd(10) + ' │');
    });

    console.log('└─' + '─'.repeat(maxIdWidth) + '─┴─' + '─'.repeat(maxTitleWidth) + '─┴─' + '─'.repeat(12) + '─┴─' + '─'.repeat(10) + '─┘');
  }

  /**
   * Output movies in CSV format
   */
  private outputCSV(movies: MovieInfo[]): void {
    console.log('ID,Title,Created,Duration,VideoPath,HLSPath,HLSReady');
    movies.forEach(movie => {
      const duration = movie.duration || 0;
      const durationStr = `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`;
      console.log(`"${movie.id}","${movie.title.replace(/"/g, '""')}","${movie.created_at.toISOString()}","${durationStr}","${movie.r2_video_path}","${movie.r2_hls_path || ''}","${movie.hls_ready}"`);
    });
  }

  /**
   * Get conversion statistics
   */
  async getStats(): Promise<void> {
    try {
      const [total, converted, needsConversion] = await Promise.all([
        prisma.movie.count({
          where: { r2_video_path: { not: '' } }
        }),
        prisma.movie.count({
          where: { 
            r2_video_path: { not: '' },
            hls_ready: true
          }
        }),
        prisma.movie.count({
          where: {
            r2_video_path: { not: '' },
            OR: [
              { r2_hls_path: null },
              { r2_hls_path: '' },
              { hls_ready: false }
            ]
          }
        })
      ]);

      console.log('📊 HLS Conversion Statistics:');
      console.log(`   Total movies with video: ${total}`);
      console.log(`   Already converted: ${converted}`);
      console.log(`   Need conversion: ${needsConversion}`);
      
      if (total > 0) {
        const percentage = ((converted / total) * 100).toFixed(1);
        console.log(`   Conversion progress: ${percentage}%`);
      }

    } catch (error) {
      console.error('💥 Error getting statistics:', error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Show detailed info for a specific movie
   */
  async showMovieDetails(movieId: string): Promise<void> {
    try {
      const movie = await prisma.movie.findUnique({
        where: { id: movieId },
        include: {
          ratings: {
            select: {
              value: true,
              created_at: true
            }
          }
        }
      });

      if (!movie) {
        console.log(`❌ Movie not found: ${movieId}`);
        return;
      }

      console.log(`🎬 Movie Details: ${movie.title}`);
      console.log(`   ID: ${movie.id}`);
      console.log(`   Created: ${movie.created_at.toISOString()}`);
      console.log(`   Duration: ${movie.duration ? `${Math.floor(movie.duration / 60)}:${String(movie.duration % 60).padStart(2, '0')}` : 'Unknown'}`);
      console.log(`   Video Path: ${movie.r2_video_path}`);
      console.log(`   HLS Path: ${movie.r2_hls_path || 'None'}`);
      console.log(`   HLS Ready: ${movie.hls_ready ? '✅ Yes' : '❌ No'}`);
      console.log(`   Average Rating: ${movie.averageRating ? movie.averageRating.toFixed(1) : 'No ratings'}`);
      console.log(`   Total Ratings: ${movie.ratings.length}`);

      if (movie.r2_image_path) {
        console.log(`   Poster: ${movie.r2_image_path}`);
      }

    } catch (error) {
      console.error('💥 Error getting movie details:', error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);
  const manager = new MovieListManager();
  
  try {
    if (args.includes('--help') || args.includes('-h')) {
      console.log(`
🎬 Movie HLS Conversion List Tool

Usage:
  tsx list-movies-without-hls.ts [options]

Options:
  --all                Show all movies (default: limit to 10)
  --limit N           Show N movies (default: 10)
  --sort newest       Sort by newest first (default)
  --sort oldest       Sort by oldest first
  --sort title        Sort by title alphabetically
  --format table      Output as table (default)
  --format json       Output as JSON
  --format csv        Output as CSV
  --stats             Show conversion statistics only
  --movie-id ID       Show details for specific movie
  --help, -h          Show this help

Examples:
  tsx list-movies-without-hls.ts
  tsx list-movies-without-hls.ts --all --sort title
  tsx list-movies-without-hls.ts --limit 20 --format csv
  tsx list-movies-without-hls.ts --stats
  tsx list-movies-without-hls.ts --movie-id "12345678-1234-1234-1234-123456789012"
      `);
      return;
    }

    if (args.includes('--stats')) {
      await manager.getStats();
      return;
    }

    if (args.includes('--movie-id')) {
      const movieIdIndex = args.indexOf('--movie-id') + 1;
      const movieId = args[movieIdIndex];
      
      if (!movieId) {
        console.error('❌ Movie ID is required when using --movie-id');
        process.exit(1);
      }

      await manager.showMovieDetails(movieId);
      return;
    }

    // Parse options
    const showAll = args.includes('--all');
    
    let limit = 10;
    if (args.includes('--limit')) {
      const limitIndex = args.indexOf('--limit') + 1;
      const limitValue = parseInt(args[limitIndex]);
      if (limitValue && limitValue > 0) {
        limit = limitValue;
      }
    }

    let sortBy: 'newest' | 'oldest' | 'title' = 'newest';
    if (args.includes('--sort')) {
      const sortIndex = args.indexOf('--sort') + 1;
      const sortValue = args[sortIndex];
      if (['newest', 'oldest', 'title'].includes(sortValue)) {
        sortBy = sortValue as 'newest' | 'oldest' | 'title';
      }
    }

    let format: 'table' | 'json' | 'csv' = 'table';
    if (args.includes('--format')) {
      const formatIndex = args.indexOf('--format') + 1;
      const formatValue = args[formatIndex];
      if (['table', 'json', 'csv'].includes(formatValue)) {
        format = formatValue as 'table' | 'json' | 'csv';
      }
    }

    await manager.listMoviesWithoutHLS({
      limit,
      showAll,
      sortBy,
      format
    });

  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { MovieListManager };
