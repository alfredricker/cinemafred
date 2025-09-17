#!/usr/bin/env node

import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

console.log('🚀 Starting test service...');
console.log('📊 Environment variables:');
console.log('- PORT:', PORT);
console.log('- NODE_ENV:', process.env.NODE_ENV);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'test-converter',
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Test FFmpeg Converter Service',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`✅ Test service running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdownW
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});
