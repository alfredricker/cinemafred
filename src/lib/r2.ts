import { S3Client } from "@aws-sdk/client-s3";
import * as dotenv from "dotenv";
dotenv.config();

const isWorkerRuntime = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

const REGION = "auto"; // R2 uses "auto" as the region
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID as string;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID as string;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY as string;
const BUCKET_NAME = process.env.R2_BUCKET_NAME as string;

// Validate required environment variables
if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET_NAME) {
  throw new Error("Missing required environment variables for R2 configuration.");
}

let httpsAgent: any = null;
let agentCreatedAt = Date.now();
const AGENT_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

if (!isWorkerRuntime) {
  // Dynamic import or require to avoid issues in Workers
  const { Agent } = require("https");
  
  // Create HTTP agent with aggressive connection management for Cloudflare R2
  httpsAgent = new Agent({
    keepAlive: true,
    keepAliveMsecs: 30000, // Shorter keep-alive to prevent stale connections
    maxSockets: 50, // Reduced to respect Cloudflare limits
    maxFreeSockets: 5, // Fewer idle connections to prevent buildup
    timeout: 300000, // 5 minute socket timeout for very large files
    family: 4, // Force IPv4 to avoid IPv6 connectivity issues
  });

  // Increase max listeners to handle multiple concurrent conversion scripts
  httpsAgent.setMaxListeners(500);
}

function getRefreshedAgent() {
  if (isWorkerRuntime) return null;
  
  const now = Date.now();
  if (now - agentCreatedAt > AGENT_REFRESH_INTERVAL) {
    console.log('🔄 Refreshing HTTP agent to prevent stale connections');
    if (httpsAgent) httpsAgent.destroy(); // Close all existing connections
    agentCreatedAt = now;
    
    const { Agent } = require("https");
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
    httpsAgent = newAgent;
    return newAgent;
  }
  return httpsAgent;
}

// Create the S3 client with dynamic agent refresh and robust timeout configuration
function creater2Client() {
  const isWorkerRuntime = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
  
  const config: any = {
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: REGION,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
    maxAttempts: 2, // Only 2 attempts to fail faster
    retryMode: "adaptive",
  };

  // Only use custom httpsAgent in Node.js environments
  if (!isWorkerRuntime) {
    config.requestHandler = {
      httpsAgent: getRefreshedAgent(),
      connectionTimeout: 45000,
      requestTimeout: 600000,
    };
  }

  return new S3Client(config);
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
