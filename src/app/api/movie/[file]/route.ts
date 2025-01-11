// src/app/api/movie/[file]/route.ts
import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, BUCKET_NAME } from "@/lib/r2";

function convertSRTtoVTT(srtContent: string): string {
  // Add WebVTT header
  let vttContent = 'WEBVTT\n\n';
  
  // Split into lines and process
  const lines = srtContent.split('\n');
  let i = 0;
  
  while (i < lines.length) {
    // Skip empty lines
    while (i < lines.length && !lines[i].trim()) i++;
    if (i >= lines.length) break;
    
    // Skip the subtitle number
    i++;
    if (i >= lines.length) break;
    
    // Process timestamp line
    const timestampLine = lines[i];
    if (timestampLine) {
      // Replace ',' with '.' for milliseconds
      const vttTimestamp = timestampLine.replace(/,/g, '.');
      vttContent += vttTimestamp + '\n';
    }
    i++;
    
    // Add subtitle text
    while (i < lines.length && lines[i].trim()) {
      vttContent += lines[i] + '\n';
      i++;
    }
    
    // Add an extra newline between entries
    vttContent += '\n';
  }
  
  return vttContent;
}

export async function GET(req: Request, { params }: { params: { file: string } }) {
  const { file } = params;

  if (!file) {
    return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: file,
    });

    const data = await r2Client.send(command);
    const stream = data.Body as ReadableStream;

    // Determine content type based on file extension
    let contentType = "application/octet-stream";
    if (file.endsWith('.mp4')) {
      contentType = "video/mp4";
    } else if (file.endsWith('.srt')) {
      // For SRT files, convert to WebVTT
      const response = await new Response(stream).text();
      const vttContent = convertSRTtoVTT(response);
      return new Response(vttContent, {
        headers: {
          "Content-Type": "text/vtt",
        },
      });
    } else if (file.endsWith('.jpg') || file.endsWith('.jpeg')) {
      contentType = "image/jpeg";
    } else if (file.endsWith('.png')) {
      contentType = "image/png";
    }

    return new Response(stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": data.ContentLength?.toString() || "",
      },
    });
  } catch (error) {
    console.error("R2 Error:", error);
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}