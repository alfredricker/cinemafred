// src/app/api/stream/[movieId]/route.ts
import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, BUCKET_NAME } from "@/lib/r2";
import { headers } from "next/headers";
import prisma from '@/lib/db';

// Mark as dynamic route
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { movieId: string } }
) {
  try {
    const { movieId } = params;
    const headersList = headers();
    const range = headersList.get("range");

    // Find the movie in the database
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      select: {
        r2_video_path: true,
      }
    });

    if (!movie?.r2_video_path) {
      console.error('Movie not found or no video path:', movieId);
      return NextResponse.json({ error: "Movie not found" }, { status: 404 });
    }

    // Remove leading 'api/movie/' if present
    const videoKey = movie.r2_video_path.replace(/^api\/movie\//, '');
    console.log('Attempting to stream:', videoKey);

    if (!range) {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: videoKey,
      });

      const data = await r2Client.send(command);
      const stream = data.Body as ReadableStream;

      return new Response(stream, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": data.ContentLength?.toString() || "",
          "Accept-Ranges": "bytes",
        },
      });
    }

    const [start, end] = range.replace(/bytes=/, "").split("-");
    const rangeStart = parseInt(start, 10);
    const rangeEnd = end ? parseInt(end, 10) : undefined;

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: videoKey,
      Range: `bytes=${rangeStart}-${rangeEnd || ""}`,
    });

    const data = await r2Client.send(command);
    const stream = data.Body as ReadableStream;

    return new Response(stream, {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": data.ContentRange || "",
        "Content-Length": data.ContentLength?.toString() || "",
        "Accept-Ranges": "bytes",
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