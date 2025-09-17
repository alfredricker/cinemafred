import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    console.log('🔔 Conversion webhook received:', data);

    const { movieId, status, hlsPath, error, processingTime, type } = data;

    if (!movieId || !status) {
      return NextResponse.json({ error: 'Invalid webhook data' }, { status: 400 });
    }

    if (status === 'completed') {
      // Update movie as HLS ready
      await prisma.movie.update({
        where: { id: movieId },
        data: {
          r2_hls_path: hlsPath,
          hls_ready: true,
          updated_at: new Date()
        }
      });

      console.log(`✅ Movie ${movieId} conversion completed (${processingTime}ms)`);
      
      // You could add notifications here (email, websocket, etc.)
      
    } else if (status === 'failed') {
      // Mark conversion as failed
      await prisma.movie.update({
        where: { id: movieId },
        data: {
          hls_ready: false,
          updated_at: new Date()
        }
      });

      console.error(`❌ Movie ${movieId} conversion failed: ${error}`);
      
      // You could add error notifications here
    }

    return NextResponse.json({ 
      message: 'Webhook processed successfully',
      movieId,
      status 
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}
