// scripts/cleanup-blobs.ts
import { 
  S3Client, 
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand
} from "@aws-sdk/client-s3";
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const REGION = "auto";
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.R2_BUCKET_NAME;

// Validate environment variables
if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET_NAME) {
  console.error("Missing required environment variables. Please ensure you have set:");
  console.error("- R2_ACCOUNT_ID");
  console.error("- R2_ACCESS_KEY_ID");
  console.error("- R2_SECRET_ACCESS_KEY");
  console.error("- R2_BUCKET_NAME");
  process.exit(1);
}

// Create R2 client
const r2Client = new S3Client({
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: REGION,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

async function cleanupIncompleteUploads() {
  try {
    console.log('Starting cleanup of incomplete multipart uploads...');
    console.log(`Using bucket: ${BUCKET_NAME}`);

    // List all multipart uploads
    const listCommand = new ListMultipartUploadsCommand({
      Bucket: BUCKET_NAME
    });

    const response = await r2Client.send(listCommand);
    
    if (!response.Uploads || response.Uploads.length === 0) {
      console.log('No incomplete multipart uploads found');
      return;
    }

    // Filter uploads containing 'blob'
    const blobUploads = response.Uploads.filter(upload => 
      upload.Key && (upload.Key.includes('/blob') || upload.Key.includes('blob'))
    );

    console.log(`Found ${blobUploads.length} incomplete blob uploads to abort`);

    // Abort each incomplete upload
    for (const upload of blobUploads) {
      if (!upload.Key || !upload.UploadId) continue;

      console.log(`Aborting upload for ${upload.Key} (UploadId: ${upload.UploadId})...`);
      
      const abortCommand = new AbortMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: upload.Key,
        UploadId: upload.UploadId
      });

      await r2Client.send(abortCommand);
      console.log(`Successfully aborted upload for ${upload.Key}`);
    }

    console.log('Cleanup completed successfully');

  } catch (error) {
    console.error('Error during cleanup:', error);
    console.error('Details:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run the cleanup
cleanupIncompleteUploads();