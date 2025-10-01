import { 
  ListObjectsV2Command, 
  DeleteObjectCommand, 
  CopyObjectCommand,
  _Object
} from "@aws-sdk/client-s3";
import { r2Client, BUCKET_NAME } from "../src/lib/r2";

interface FileStats {
  subtitlesMoved: number;
  errors: string[];
}

async function listAllObjects(): Promise<_Object[]> {
  const allObjects: _Object[] = [];
  let continuationToken: string | undefined;

  console.log('📋 Listing all objects in R2 bucket...');

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      ContinuationToken: continuationToken,
    });

    const response = await r2Client().send(command);
    
    if (response.Contents) {
      allObjects.push(...response.Contents);
      console.log(`   Found ${allObjects.length} objects so far...`);
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  console.log(`✅ Total objects found: ${allObjects.length}\n`);
  return allObjects;
}

async function moveSubtitlesToFolder(objects: _Object[]): Promise<number> {
  // Find .srt files in images/ folder
  const subtitleFiles = objects.filter(obj => {
    const key = obj.Key || '';
    return key.startsWith('images/') && key.toLowerCase().endsWith('.srt');
  });

  if (subtitleFiles.length === 0) {
    console.log('ℹ️  No subtitle files found in images/ folder.\n');
    return 0;
  }

  console.log(`📁 Moving ${subtitleFiles.length} subtitle files from images/ to subtitles/...`);

  let movedCount = 0;

  for (const obj of subtitleFiles) {
    const oldKey = obj.Key!;
    // Extract filename from images/[filename].srt
    const filename = oldKey.replace('images/', '');
    const newKey = `subtitles/${filename}`;

    try {
      // Copy to new location
      await r2Client().send(new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: `${BUCKET_NAME}/${oldKey}`,
        Key: newKey,
      }));

      // Delete original
      await r2Client().send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: oldKey,
      }));

      movedCount++;
      console.log(`   Moved: ${oldKey} → ${newKey}`);
    } catch (error) {
      console.error(`   ❌ Failed to move ${oldKey}:`, error);
    }
  }

  console.log(`✅ Moved ${movedCount} subtitle files\n`);
  return movedCount;
}

async function main() {
  console.log('🚀 Moving subtitle files from images/ to subtitles/...\n');
  console.log(`Bucket: ${BUCKET_NAME}\n`);

  const stats: FileStats = {
    subtitlesMoved: 0,
    errors: [],
  };

  try {
    // List all objects
    const objects = await listAllObjects();

    // Move subtitle files from images/ to subtitles/
    stats.subtitlesMoved = await moveSubtitlesToFolder(objects);

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Subtitle files moved:    ${stats.subtitlesMoved}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ Operation completed successfully!');
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main();

