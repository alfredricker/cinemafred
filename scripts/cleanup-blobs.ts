// scripts/cleanup-blobs.ts
import { 
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand
} from "@aws-sdk/client-s3";
import { r2Client, BUCKET_NAME } from '../src/lib/r2';

async function cleanupIncompleteUploads() {
  try {
    console.log('Starting cleanup of incomplete multipart uploads...');
    console.log(`Using bucket: ${BUCKET_NAME}`);

    // List all multipart uploads
    const listCommand = new ListMultipartUploadsCommand({
      Bucket: BUCKET_NAME
    });

    const response = await r2Client().send(listCommand);
    
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

      await r2Client().send(abortCommand);
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