// src/app/api/stream/[movieId]/route.ts
import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, BUCKET_NAME } from "@/lib/r2";
import { headers } from "next/headers";
import prisma from '@/lib/db';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Simple circuit breaker to prevent overwhelming R2 during outages
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private readonly threshold = 5; // Open circuit after 5 failures
  private readonly timeout = 60000; // 1 minute timeout

  isOpen(): boolean {
    if (this.failures >= this.threshold) {
      if (Date.now() - this.lastFailureTime < this.timeout) {
        return true; // Circuit is open
      } else {
        this.reset(); // Reset after timeout
      }
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
  }

  private reset(): void {
    this.failures = 0;
    this.lastFailureTime = 0;
  }
}

const r2CircuitBreaker = new CircuitBreaker();

// Lightweight token validation for streaming
const validateStreamToken = (request: Request) => {
  try {
    // Try Authorization header first
    const authHeader = request.headers.get('Authorization');
    let token = null;
    
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      // Try query parameter as fallback for video element requests
      const url = new URL(request.url);
      token = url.searchParams.get('token');
    }
    
    if (!token) {
      return false;
    }
    
    // For streaming requests, only verify token signature without full decode
    jwt.verify(token, JWT_SECRET, { complete: true });
    return true;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
};

// Simplified chunk sizes for native browser buffering
const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB default - good balance for most connections

// Helper function to retry operations with better error handling
const retryOperation = async <T>(
  operation: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = RETRY_DELAY
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    const errorCode = (error as any).code;
    const shouldRetry = retries > 0 && (
      errorCode === 'EAI_AGAIN' ||
      errorCode === 'ETIMEDOUT' ||
      errorCode === 'ECONNRESET' ||
      errorCode === 'ENOTFOUND' ||
      errorCode === 'ENETUNREACH' ||
      (error as any).name === 'TimeoutError' ||
      (error as any).$metadata?.httpStatusCode >= 500
    );

    if (shouldRetry) {
      console.log(`Retrying operation due to ${errorCode || 'unknown error'}, ${retries} attempts remaining...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryOperation(operation, retries - 1, Math.min(delay * 1.5, 10000));
    }
    
    console.error('Operation failed after all retries:', error);
    throw error;
  }
};

export async function GET(
  request: Request,
  { params }: { params: { movieId: string } }
) {
  try {
    // Check circuit breaker first
    if (r2CircuitBreaker.isOpen()) {
      console.log('R2 circuit breaker is open, rejecting request');
      return NextResponse.json({ 
        error: "Service temporarily unavailable" 
      }, { status: 503 });
    }

    // Validate authentication for all requests
    if (!validateStreamToken(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { movieId } = params;
    const headersList = headers();
    const range = headersList.get("range");

    // Find the movie in the database
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      select: { r2_video_path: true }
    });

    if (!movie?.r2_video_path) {
      return NextResponse.json({ error: "Movie not found" }, { status: 404 });
    }

    // Use the path directly from database (e.g., movies/filename.mp4)
    const videoKey = movie.r2_video_path;

    // Get video size with retry
    const headCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: videoKey,
    });

    const headResponse = await retryOperation(() => r2Client().send(headCommand), MAX_RETRIES, RETRY_DELAY);
    const contentLength = Number(headResponse.ContentLength || 0);
    const contentType = headResponse.ContentType || 'video/mp4';
    const etag = headResponse.ETag;

    // Handle range requests - simplified for native browser buffering
    if (range) {
      let [startStr, endStr] = range.replace(/bytes=/, "").split("-");
      let start = parseInt(startStr, 10);
      let end = endStr ? parseInt(endStr, 10) : undefined;

      // If no end specified, use default chunk size
      if (!end) {
        end = Math.min(start + DEFAULT_CHUNK_SIZE - 1, contentLength - 1);
      }

      // Ensure we don't exceed file size
      if (end > contentLength - 1) {
        end = contentLength - 1;
      }

      const contentSize = end - start + 1;

      // Fetch the chunk with retry
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: videoKey,
        Range: `bytes=${start}-${end}`
      });

      const data = await retryOperation(() => r2Client().send(command), MAX_RETRIES, RETRY_DELAY);
      const stream = data.Body as ReadableStream;

      // Record successful operation
      r2CircuitBreaker.recordSuccess();

      // Send the chunk
      return new Response(stream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": contentSize.toString(),
          "Content-Range": `bytes ${start}-${end}/${contentLength}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
          "Connection": "keep-alive",
          "Cross-Origin-Resource-Policy": "cross-origin",
          ...(etag && { "ETag": etag }),
        },
      });
    }

    // Handle initial request
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: videoKey,
      Range: `bytes=0-${DEFAULT_CHUNK_SIZE - 1}`
    });

    const data = await retryOperation(() => r2Client().send(command), MAX_RETRIES, RETRY_DELAY);
    const stream = data.Body as ReadableStream;

    // Record successful operation
    r2CircuitBreaker.recordSuccess();

    return new Response(stream, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": DEFAULT_CHUNK_SIZE.toString(),
        "Content-Range": `bytes 0-${DEFAULT_CHUNK_SIZE - 1}/${contentLength}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
        "Connection": "keep-alive",
        "Cross-Origin-Resource-Policy": "cross-origin",
        ...(etag && { "ETag": etag }),
      },
    });
  } catch (error) {
    console.error("Streaming Error:", error);
    
    // Record failure for circuit breaker
    const errorCode = (error as any).code;
    if (errorCode === 'ETIMEDOUT' || errorCode === 'ENETUNREACH' || 
        errorCode === 'ECONNRESET' || (error as any).name === 'TimeoutError') {
      r2CircuitBreaker.recordFailure();
    }
    
    return NextResponse.json(
      { error: "Failed to stream video" },
      { status: 500 }
    );
  }
}