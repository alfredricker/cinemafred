// src/app/api/movies/metadata/route.ts
import { NextResponse } from 'next/server';
import { MovieMetadataService } from '@/lib/tmdb';
import { validateAdmin } from '@/lib/middleware';

export async function GET(request: Request) {
  try {
    // Validate admin access
    const validation = await validateAdmin(request);
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    if (!process.env.TMDB_API_KEY) {
      console.error('TMDB API key is not configured');
      return NextResponse.json({ error: 'TMDB API key is not configured' }, { status: 500 });
    }

    const url = new URL(request.url);
    const title = url.searchParams.get('title');
    const year = url.searchParams.get('year');
    const filename = url.searchParams.get('filename');

    console.log('Received metadata request for:', { title, year, filename });

    // Support both filename parsing and direct title/year parameters
    let searchQuery: string;
    if (filename) {
      // Use filename for parsing
      searchQuery = filename;
    } else if (title && year) {
      // Use direct title and year parameters
      searchQuery = `${title} ${year}`;
    } else {
      return NextResponse.json({ error: 'Either filename or both title and year parameters are required' }, { status: 400 });
    }

    const tmdb = new MovieMetadataService(process.env.TMDB_API_KEY);
    const { metadata, suggestions } = await tmdb.searchMovie(searchQuery);
    
    if (!metadata && (!suggestions || !suggestions.length)) {
      console.log('No metadata or suggestions found for:', { title, year });
      return NextResponse.json({ error: 'Movie not found' }, { status: 404 });
    }

    return NextResponse.json({ metadata, suggestions });
  } catch (error) {
    console.error('Error in metadata route:', error);
    return NextResponse.json({ error: 'Failed to fetch movie metadata' }, { status: 500 });
  }
}