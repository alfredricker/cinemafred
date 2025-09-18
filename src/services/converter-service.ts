#!/usr/bin/env node

import express from 'express';
import { startHealthMonitoring } from './container-lifecycle';
import { setupRoutes } from './api-routes';

const app = express();
const PORT = process.env.PORT || 8080;

// Initialize services
startHealthMonitoring();

// Setup API routes
setupRoutes(app);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 FFmpeg Converter running on port ${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`📤 Upload: http://localhost:${PORT}/convert/upload`);
  console.log(`🔄 Existing: http://localhost:${PORT}/convert/existing`);
  console.log(`🔍 DB Test: http://localhost:${PORT}/test-db`);
  console.log(`🔍 R2 Test: http://localhost:${PORT}/test-r2`);
  console.log(`🔍 DB Diagnostics: http://localhost:${PORT}/db-diagnostics`);
  console.log(`🔍 DB Status: http://localhost:${PORT}/db-status`);
  console.log(`🧹 DB Clean: http://localhost:${PORT}/db-clean (POST)`);
});
