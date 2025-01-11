import { S3Client } from "@aws-sdk/client-s3";

const REGION = "auto"; // R2 uses "auto" as the region
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID as string;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID as string;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY as string;
const BUCKET_NAME = process.env.R2_BUCKET_NAME as string;

// Validate required environment variables
if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET_NAME) {
  throw new Error("Missing required environment variables for R2 configuration.");
}

// Create the S3 client
const r2Client = new S3Client({
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: REGION,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

export { r2Client, BUCKET_NAME };
