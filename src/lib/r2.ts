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

// Create HTTP agent with aggressive connection management for Cloudflare R2
const httpsAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 30000, // Shorter keep-alive to prevent stale connections
  maxSockets: 50, // Reduced to respect Cloudflare limits
  maxFreeSockets: 5, // Fewer idle connections to prevent buildup
  timeout: 300000, // 5 minute socket timeout for very large files
  family: 4, // Force IPv4 to avoid IPv6 connectivity issues
});

// Increase max listeners to handle multiple concurrent conversion scripts
httpsAgent.setMaxListeners(500);

// Connection refresh mechanism - recreate agent periodically
let agentCreatedAt = Date.now();
const AGENT_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

function getRefreshedAgent() {
  const now = Date.now();
  if (now - agentCreatedAt > AGENT_REFRESH_INTERVAL) {
    console.log('🔄 Refreshing HTTP agent to prevent stale connections');
    httpsAgent.destroy(); // Close all existing connections
    agentCreatedAt = now;
    
    // Create new agent with same settings
    const newAgent = new Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 50,
      maxFreeSockets: 5,
      timeout: 300000,
      family: 4,
    });
    newAgent.setMaxListeners(500);
    return newAgent;
  }
  return httpsAgent;
}

// Create the S3 client with dynamic agent refresh and robust timeout configuration
function creater2Client() {
  return new S3Client({
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: REGION,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
    requestHandler: {
      httpsAgent: getRefreshedAgent(),
      connectionTimeout: 45000, // 45 seconds to establish connection
      requestTimeout: 600000, // 10 minutes for uploads (reduced from 15min)
    },
    maxAttempts: 2, // Only 2 attempts to fail faster
    retryMode: "adaptive",
  });
}

// Create initial client
let r2Client = creater2Client();

// Function to get a fresh client (recreates if needed)
function getr2Client() {
  // Recreate client every 10 minutes to refresh connections
  const now = Date.now();
  if (now - agentCreatedAt > AGENT_REFRESH_INTERVAL) {
    r2Client = creater2Client();
  }
  return r2Client;
}

export { getr2Client as r2Client, BUCKET_NAME };
