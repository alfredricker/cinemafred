# AWS EC2 Automatic Video Conversion Pipeline

## Overview

This document outlines a cost-effective pipeline for automatic video conversion using AWS EC2 that only runs when needed, replacing the expensive Google Cloud Run jobs. The system will automatically start an EC2 instance when a movie is uploaded, perform HLS conversion, and shut down to minimize costs.

## Architecture Components

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐    ┌──────────────┐
│   Next.js UI   │───▶│  SQS Queue   │───▶│   EC2 Worker    │───▶│ Cloudflare   │
│   (Upload)      │    │ (Job Queue)  │    │  (Conversion)   │    │     R2       │
└─────────────────┘    └──────────────┘    └─────────────────┘    └──────────────┘
                              │                      │
                              ▼                      ▼
                       ┌──────────────┐    ┌─────────────────┐
                       │   Lambda     │    │   PostgreSQL    │
                       │ (EC2 Manager)│    │   Database      │
                       └──────────────┘    └─────────────────┘
```

## Cost Benefits

- **EC2 Spot Instances**: 60-90% cheaper than on-demand
- **Auto Start/Stop**: Only pay when converting
- **No Cold Start**: Unlike serverless, no initialization delays
- **Predictable Costs**: Fixed hourly rate vs. per-request pricing

## Implementation Components

### 1. AWS SQS Queue Setup

**Purpose**: Queue conversion jobs and trigger EC2 startup

```typescript
// src/lib/aws/sqs.ts
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

export interface ConversionJob {
  movieId: string;
  title: string;
  r2VideoPath: string;
  timestamp: string;
  options?: {
    keepOriginal?: boolean;
    include480p?: boolean;
    force?: boolean;
  };
}

export class ConversionQueue {
  private sqs: SQSClient;
  private queueUrl: string;

  constructor() {
    this.sqs = new SQSClient({ 
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
      }
    });
    this.queueUrl = process.env.AWS_SQS_QUEUE_URL!;
  }

  async enqueueConversion(job: ConversionJob): Promise<void> {
    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(job),
      MessageAttributes: {
        movieId: {
          DataType: 'String',
          StringValue: job.movieId
        },
        timestamp: {
          DataType: 'String',
          StringValue: job.timestamp
        }
      }
    });

    await this.sqs.send(command);
    console.log(`✅ Queued conversion job for movie: ${job.title}`);
  }
}
```

### 2. Lambda Function for EC2 Management

**Purpose**: Monitor SQS queue and manage EC2 instance lifecycle

```typescript
// aws-lambda/ec2-manager.ts
import { SQSEvent, Context } from 'aws-lambda';
import { EC2Client, RunInstancesCommand, DescribeInstancesCommand, TerminateInstancesCommand } from '@aws-sdk/client-ec2';

const ec2 = new EC2Client({ region: process.env.AWS_REGION });

export const handler = async (event: SQSEvent, context: Context) => {
  console.log('🚀 EC2 Manager triggered by SQS');
  
  // Check if conversion instance is already running
  const runningInstance = await findRunningConversionInstance();
  
  if (!runningInstance && event.Records.length > 0) {
    // Start new conversion instance
    await startConversionInstance();
    console.log('✅ Started new conversion EC2 instance');
  }
  
  return { statusCode: 200, body: 'EC2 management completed' };
};

async function findRunningConversionInstance() {
  const command = new DescribeInstancesCommand({
    Filters: [
      { Name: 'tag:Purpose', Values: ['video-conversion'] },
      { Name: 'instance-state-name', Values: ['running', 'pending'] }
    ]
  });
  
  const response = await ec2.send(command);
  return response.Reservations?.[0]?.Instances?.[0];
}

async function startConversionInstance() {
  const command = new RunInstancesCommand({
    ImageId: process.env.EC2_AMI_ID, // Custom AMI with your conversion tools
    InstanceType: 'c5.2xlarge', // 8 vCPU, 16GB RAM - good for video processing
    MinCount: 1,
    MaxCount: 1,
    KeyName: process.env.EC2_KEY_PAIR,
    SecurityGroupIds: [process.env.EC2_SECURITY_GROUP],
    SubnetId: process.env.EC2_SUBNET_ID,
    IamInstanceProfile: {
      Name: process.env.EC2_INSTANCE_PROFILE
    },
    TagSpecifications: [{
      ResourceType: 'instance',
      Tags: [
        { Key: 'Name', Value: 'cinemafred-converter' },
        { Key: 'Purpose', Value: 'video-conversion' },
        { Key: 'AutoShutdown', Value: 'true' }
      ]
    }],
    UserData: Buffer.from(`#!/bin/bash
      cd /home/ec2-user/cinemafred
      npm run conversion-worker
    `).toString('base64'),
    InstanceMarketOptions: {
      MarketType: 'spot', // Use spot instances for cost savings
      SpotOptions: {
        MaxPrice: '0.20', // Max price per hour
        SpotInstanceType: 'one-time'
      }
    }
  });
  
  await ec2.send(command);
}
```

### 3. EC2 Conversion Worker Script

**Purpose**: Process conversion jobs from SQS queue on EC2 instance

```typescript
// scripts/conversion-worker.ts
#!/usr/bin/env tsx

import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { EC2Client, TerminateInstancesCommand } from '@aws-sdk/client-ec2';
import { convertMovieToHLS } from './convert-existing-movies';
import { ConversionJob } from '../src/lib/aws/sqs';

class ConversionWorker {
  private sqs: SQSClient;
  private ec2: SQSClient;
  private queueUrl: string;
  private instanceId: string;
  private isShuttingDown = false;

  constructor() {
    this.sqs = new SQSClient({ region: process.env.AWS_REGION });
    this.ec2 = new EC2Client({ region: process.env.AWS_REGION });
    this.queueUrl = process.env.AWS_SQS_QUEUE_URL!;
    this.instanceId = process.env.EC2_INSTANCE_ID!; // Set via user data
  }

  async start() {
    console.log('🎬 Starting CinemaFred conversion worker...');
    
    // Set up graceful shutdown
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
    
    // Start processing loop
    await this.processJobs();
  }

  async processJobs() {
    let lastActivityTime = Date.now();
    const maxIdleMinutes = 5; // Shutdown after 5 minutes of no activity
    
    while (!this.isShuttingDown) {
      try {
        const messages = await this.receiveMessages();
        
        if (messages.length === 0) {
          const idleMinutes = (Date.now() - lastActivityTime) / (1000 * 60);
          console.log(`⏳ No jobs found - idle for ${idleMinutes.toFixed(1)} minutes`);
          
          if (idleMinutes >= maxIdleMinutes) {
            console.log(`💤 No activity for ${maxIdleMinutes} minutes, shutting down instance`);
            await this.shutdownInstance();
            break;
          }
          
          await this.sleep(30000); // Check every 30 seconds when idle
          continue;
        }
        
        // Reset activity timer when jobs are found
        lastActivityTime = Date.now();
        
        for (const message of messages) {
          await this.processJob(message);
          lastActivityTime = Date.now(); // Update after each job completion
        }
        
      } catch (error) {
        console.error('❌ Error in job processing loop:', error);
        lastActivityTime = Date.now(); // Count errors as activity to prevent premature shutdown
        await this.sleep(30000); // Wait 30 seconds before retry
      }
    }
  }

  async receiveMessages() {
    const command = new ReceiveMessageCommand({
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: 1, // Process one at a time
      WaitTimeSeconds: 20, // Long polling
      MessageAttributeNames: ['All']
    });

    const response = await this.sqs.send(command);
    return response.Messages || [];
  }

  async processJob(message: any) {
    try {
      const job: ConversionJob = JSON.parse(message.Body);
      console.log(`🎯 Processing conversion job for: ${job.title}`);
      
      // Update database to show conversion started
      await this.updateConversionStatus(job.movieId, 'processing');
      
      // Perform the actual conversion
      await convertMovieToHLS({
        movieId: job.movieId,
        force: job.options?.force || false,
        keepOriginal: job.options?.keepOriginal || false,
        include480p: job.options?.include480p || false
      });
      
      // Delete message from queue
      await this.deleteMessage(message.ReceiptHandle);
      
      console.log(`✅ Completed conversion for: ${job.title}`);
      
      // Check if queue is empty after job completion
      const remainingMessages = await this.checkQueueDepth();
      if (remainingMessages === 0) {
        console.log(`🏁 No more jobs in queue, shutting down instance`);
        await this.shutdownInstance();
        return;
      }
      
    } catch (error) {
      console.error(`❌ Failed to process job:`, error);
      
      // Update database to show conversion failed
      const job: ConversionJob = JSON.parse(message.Body);
      await this.updateConversionStatus(job.movieId, 'failed');
      
      // Delete message to prevent infinite retries
      await this.deleteMessage(message.ReceiptHandle);
    }
  }

  async deleteMessage(receiptHandle: string) {
    const command = new DeleteMessageCommand({
      QueueUrl: this.queueUrl,
      ReceiptHandle: receiptHandle
    });
    
    await this.sqs.send(command);
  }

  async updateConversionStatus(movieId: string, status: 'processing' | 'completed' | 'failed') {
    // Update your database here
    console.log(`📝 Updated conversion status for ${movieId}: ${status}`);
  }

  async shutdownInstance() {
    console.log('🔌 Shutting down EC2 instance...');
    
    const command = new TerminateInstancesCommand({
      InstanceIds: [this.instanceId]
    });
    
    await this.ec2.send(command);
  }

  async gracefulShutdown() {
    console.log('🛑 Received shutdown signal, finishing current job...');
    this.isShuttingDown = true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async checkQueueDepth(): Promise<number> {
    const { GetQueueAttributesCommand } = await import('@aws-sdk/client-sqs');
    
    const command = new GetQueueAttributesCommand({
      QueueUrl: this.queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages']
    });

    const response = await this.sqs.send(command);
    return parseInt(response.Attributes?.ApproximateNumberOfMessages || '0');
  }
}

// Start the worker
if (require.main === module) {
  const worker = new ConversionWorker();
  worker.start().catch(console.error);
}
```

### 4. Updated Upload API Route

**Purpose**: Queue conversion job instead of direct processing

```typescript
// src/app/api/movies/route.ts (updated)
import { ConversionQueue } from '../../../lib/aws/sqs';

export async function POST(request: Request) {
  try {
    // ... existing upload logic ...
    
    // After successful upload to R2 and database creation
    const conversionQueue = new ConversionQueue();
    
    await conversionQueue.enqueueConversion({
      movieId: movie.id,
      title: movie.title,
      r2VideoPath: movie.r2_video_path,
      timestamp: new Date().toISOString(),
      options: {
        keepOriginal: false, // Delete original by default for UI uploads
        include480p: false,
        force: false
      }
    });
    
    return NextResponse.json({
      success: true,
      message: 'Movie uploaded and queued for conversion',
      movieId: movie.id
    });
    
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
```

### 5. Custom AMI Setup

**Purpose**: Pre-configured EC2 image with all conversion tools

**AMI Contents:**
- Ubuntu 22.04 LTS
- Node.js 18+
- FFmpeg with hardware acceleration
- Your application code
- Required dependencies
- Auto-start script

**Setup Script:**
```bash
#!/bin/bash
# ami-setup.sh - Run this on a base EC2 instance to create your custom AMI

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install FFmpeg with hardware acceleration
sudo apt install -y ffmpeg

# Install AWS CLI
sudo apt install -y awscli

# Create application directory
sudo mkdir -p /home/ec2-user/cinemafred
sudo chown ec2-user:ec2-user /home/ec2-user/cinemafred

# Clone your repository (or copy files)
cd /home/ec2-user/cinemafred
# git clone your-repo-url .

# Install dependencies
npm install

# Create systemd service for auto-start
sudo tee /etc/systemd/system/cinemafred-worker.service > /dev/null <<EOF
[Unit]
Description=CinemaFred Conversion Worker
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/cinemafred
ExecStart=/usr/bin/npm run conversion-worker
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable cinemafred-worker
```

## Environment Variables

Add these to your `.env` file:

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/account/queue-name

# EC2 Configuration
EC2_AMI_ID=ami-xxxxxxxxx  # Your custom AMI
EC2_KEY_PAIR=your-key-pair
EC2_SECURITY_GROUP=sg-xxxxxxxxx
EC2_SUBNET_ID=subnet-xxxxxxxxx
EC2_INSTANCE_PROFILE=cinemafred-conversion-role
EC2_INSTANCE_ID=  # Set automatically via user data
```

## AWS Resources Setup

### 1. IAM Role for EC2
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:*:*:cinemafred-conversions"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:TerminateInstances",
        "ec2:DescribeInstances"
      ],
      "Resource": "*"
    }
  ]
}
```

### 2. IAM Role for Lambda
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:RunInstances",
        "ec2:DescribeInstances",
        "ec2:CreateTags"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:PassRole"
      ],
      "Resource": "arn:aws:iam::*:role/cinemafred-conversion-role"
    }
  ]
}
```

### 3. SQS Queue Configuration
- **Visibility Timeout**: 3600 seconds (1 hour)
- **Message Retention**: 14 days
- **Dead Letter Queue**: For failed messages
- **Lambda Trigger**: Connect to EC2 manager function

## Cost Estimation

**Example Monthly Costs (assuming 50 conversions/month):**

| Component | Cost |
|-----------|------|
| EC2 c5.2xlarge Spot (10 hours) | ~$8 |
| SQS Messages (1000) | ~$0.40 |
| Lambda Executions (100) | ~$0.02 |
| Data Transfer | ~$2 |
| **Total** | **~$10.42/month** |

**vs. Google Cloud Run**: $200-500/month

## Deployment Steps

1. **Create AWS Resources**
   ```bash
   # Create SQS queue
   aws sqs create-queue --queue-name cinemafred-conversions
   
   # Create IAM roles and policies
   # (Use AWS Console or CloudFormation)
   ```

2. **Build Custom AMI**
   ```bash
   # Launch base EC2 instance
   # Run ami-setup.sh
   # Create AMI from instance
   ```

3. **Deploy Lambda Function**
   ```bash
   # Package and deploy ec2-manager Lambda
   # Connect SQS trigger
   ```

4. **Update Application Code**
   ```bash
   # Add SQS integration to upload API
   # Deploy conversion-worker script
   ```

5. **Test Pipeline**
   ```bash
   # Upload test movie through UI
   # Monitor SQS queue
   # Verify EC2 starts and processes job
   # Confirm EC2 shuts down after completion
   ```

## Monitoring and Logging

### CloudWatch Metrics
- SQS queue depth
- EC2 instance state changes
- Lambda execution metrics
- Conversion success/failure rates

### Logging Strategy
- Application logs to CloudWatch Logs
- SQS message tracking
- EC2 startup/shutdown events
- Conversion progress updates

### Alerting
- Failed conversions
- Queue backup (too many pending jobs)
- EC2 instance stuck in running state
- Cost threshold alerts

## Advantages of This Approach

1. **Cost Effective**: Only pay when converting
2. **Scalable**: Can launch multiple instances for heavy loads
3. **Reliable**: SQS ensures jobs aren't lost
4. **Flexible**: Easy to adjust instance types and configurations
5. **Monitoring**: Full visibility into the conversion pipeline
6. **Fault Tolerant**: Dead letter queues and retry mechanisms

## Future Enhancements

1. **Auto Scaling**: Launch multiple instances for queue backup
2. **Priority Queues**: Different queues for different conversion types
3. **Progress Tracking**: Real-time conversion progress updates
4. **Batch Processing**: Process multiple small files together
5. **GPU Instances**: Use GPU-enabled instances for faster conversion

This pipeline will dramatically reduce your conversion costs while maintaining reliability and performance.
