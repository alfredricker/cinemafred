import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, BUCKET_NAME } from "@/lib/r2";
// @ts-ignore
import { env as cfEnv } from "cloudflare:workers";

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


export async function GET(req: Request, { params }: { params: { file: string[] } }) {
  // Join the file path segments (e.g., ["images", "beforesunset.jpg"] -> "images/beforesunset.jpg")
  const filePath = params.file.join('/');

  if (!filePath) {
    return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  }

  try {
    let stream: ReadableStream | null = null;
    let contentLength = "";
    
    // Try native R2 binding first
    if (cfEnv && cfEnv.R2) {
      // In Cloudflare Workers, we can't easily return the raw stream from R2.get() 
      // directly in a Response if it's going to be consumed by another part of the worker
      // or if there are cross-request I/O issues.
      // We will read the object into memory as an ArrayBuffer and return that instead.
      const object = await cfEnv.R2.get(filePath);
      if (object) {
        const buffer = await object.arrayBuffer();
        contentLength = object.size.toString();
        
        // Determine content type based on file extension
        let contentType = "application/octet-stream";
        if (filePath.endsWith('.mp4')) {
          contentType = "video/mp4";
        }  else if (filePath.endsWith('.srt')) {
          // For SRT files, convert to WebVTT
          const text = new TextDecoder().decode(buffer);
          const vttContent = convertSRTtoVTT(text);
          return new Response(vttContent, {
            headers: {
              "Content-Type": "text/vtt",
            },
          });
        } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
          contentType = "image/jpeg";
        } else if (filePath.endsWith('.png')) {
          contentType = "image/png";
        } else if (filePath.endsWith('.webp')) {
          contentType = "image/webp";
        }

        return new Response(buffer, {
          headers: {
            "Content-Type": contentType,
            "Content-Length": contentLength,
            "Cache-Control": filePath.match(/\.(jpg|jpeg|png|webp|gif|avif)$/i)
              ? "public, max-age=86400, s-maxage=86400"
              : "public, max-age=300, s-maxage=300",
          },
        });
      }
    }
    
    // Fallback to S3 client
    if (!stream) {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: filePath,
      });

      const data = await r2Client().send(command);
      stream = data.Body as ReadableStream;
      contentLength = data.ContentLength?.toString() || "";
    }
    
    if (!stream) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    // Determine content type based on file extension
    let contentType = "application/octet-stream";
    if (filePath.endsWith('.mp4')) {
      contentType = "video/mp4";
    }  else if (filePath.endsWith('.srt')) {
      // For SRT files, convert to WebVTT
      const response = await new Response(stream).text();
      const vttContent = convertSRTtoVTT(response);
      return new Response(vttContent, {
        headers: {
          "Content-Type": "text/vtt",
        },
      });
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      contentType = "image/jpeg";
    } else if (filePath.endsWith('.png')) {
      contentType = "image/png";
    } else if (filePath.endsWith('.webp')) {
      contentType = "image/webp";
    }

    return new Response(stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": contentLength,
        "Cache-Control": filePath.match(/\.(jpg|jpeg|png|webp|gif|avif)$/i)
          ? "public, max-age=86400, s-maxage=86400"
          : "public, max-age=300, s-maxage=300",
      },
    });
  } catch (error) {
    console.error("R2 Error:", error);
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}

