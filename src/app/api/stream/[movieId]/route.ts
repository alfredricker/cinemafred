// src/app/api/stream/[movieId]/route.ts
import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, BUCKET_NAME } from "@/lib/r2";
import { headers } from "next/headers";
import prisma from '@/lib/db';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Lightweight token validation for streaming
const validateStreamToken = (request: Request) => {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return false;
    }

    const token = authHeader.substring(7);
    
    // For chunk requests, only verify token signature without full decode
    jwt.verify(token, JWT_SECRET, { complete: true });
    return true;
  } catch (error) {
    return false;
  }
};

const CHUNK_SIZE = 8 * 1024 * 1024; // 16MB chunks
const MAX_CHUNK_SIZE = 16 * 1024 * 1024; // 32MB maximum chunk size
const PRELOAD_CHUNK_SIZE = 4 * 1024 * 1024; // 4MB for preload requests

export async function GET(
  request: Request,
  { params }: { params: { movieId: string } }
) {
  try {
    const { movieId } = params;
    const headersList = headers();
    const range = headersList.get("range");
    const isPreload = new URL(request.url).searchParams.has('preload');

    // Find the movie in the database
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      select: { r2_video_path: true }
    });

    if (!movie?.r2_video_path) {
      return NextResponse.json({ error: "Movie not found" }, { status: 404 });
    }

    const videoKey = movie.r2_video_path.replace(/^api\/movie\//, '');

    // Get video size
    const headCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: videoKey,
    });

    const headResponse = await r2Client.send(headCommand);
    const contentLength = Number(headResponse.ContentLength || 0);

    // Handle range requests
    if (range) {
      let [startStr, endStr] = range.replace(/bytes=/, "").split("-");
      let start = parseInt(startStr, 10);
      let end = endStr ? parseInt(endStr, 10) : undefined;

      // If this is a preload request, use smaller chunk size
      if (isPreload) {
        end = start + PRELOAD_CHUNK_SIZE - 1;
      } else if (!end) {
        // Calculate dynamic chunk size for regular requests
        const position = start / contentLength;
        const dynamicChunkSize = Math.min(
          Math.max(CHUNK_SIZE, Math.floor(CHUNK_SIZE * (1 + position))),
          MAX_CHUNK_SIZE
        );
        end = Math.min(start + dynamicChunkSize - 1, contentLength - 1);
      }

      // Ensure we don't exceed file size
      if (end > contentLength - 1) {
        end = contentLength - 1;
      }

      const contentSize = end - start + 1;

      // Fetch the chunk
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: videoKey,
        Range: `bytes=${start}-${end}`
      });

      const data = await r2Client.send(command);
      const stream = data.Body as ReadableStream;

      // Send the chunk
      return new Response(stream, {
        status: 206,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": contentSize.toString(),
          "Content-Range": `bytes ${start}-${end}/${contentLength}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600, must-revalidate",
          "Connection": "keep-alive",
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Link": `<${request.url}>; rel=preload; as=fetch`,
        },
      });
    }

    // Handle initial request
    const initialChunkSize = CHUNK_SIZE;
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: videoKey,
      Range: `bytes=0-${initialChunkSize - 1}`
    });

    const data = await r2Client.send(command);
    const stream = data.Body as ReadableStream;

    return new Response(stream, {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": initialChunkSize.toString(),
        "Content-Range": `bytes 0-${initialChunkSize - 1}/${contentLength}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
        "Connection": "keep-alive",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  } catch (error) {
    console.error("Streaming Error:", error);
    return NextResponse.json(
      { error: "Failed to stream video" },
      { status: 500 }
    );
  }
}