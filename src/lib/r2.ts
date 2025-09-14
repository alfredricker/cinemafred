import { S3Client } from "@aws-sdk/client-s3";
import { Agent } from "https";

const REGION = "auto"; // R2 uses "auto" as the region
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID as string;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID as string;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY as string;
const BUCKET_NAME = process.env.R2_BUCKET_NAME as string;

// Validate required environment variables
if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET_NAME) {
  throw new Error("Missing required environment variables for R2 configuration.");
}

// Create HTTP agent with connection pooling and keep-alive
const httpsAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 30000, // Keep connections alive for 30 seconds
  maxSockets: 50, // Max concurrent connections
  maxFreeSockets: 10, // Max idle connections to keep
  timeout: 30000, // Socket timeout
});

// Create the S3 client with improved timeout and retry configuration
const r2Client = new S3Client({
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: REGION,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
  requestHandler: {
    httpsAgent,
    connectionTimeout: 10000, // 10 seconds to establish connection
    requestTimeout: 30000, // 30 seconds for request timeout
  },
  maxAttempts: 5, // Increased retry attempts
  retryMode: "adaptive", // Use adaptive retry mode
});

export { r2Client, BUCKET_NAME };
