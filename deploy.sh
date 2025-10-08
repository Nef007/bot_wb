#!/bin/bash

# Deployment script for getcandle bot
echo "🚀 Starting deployment..."

pwd

# Create logs directory if it doesn't exist
mkdir -p logs

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Stop existing PM2 process if running
echo "🛑 Stopping existing process..."
pm2 stop wb_monit || true
pm2 delete wb_monit || true

 npm run migrate:run

# Start application with PM2
echo "🚀 Starting application..."
pm2 start ./pm2.config.json 

# Save PM2 configuration
pm2 save

# Display status
echo "📊 Application status:"
pm2 status wb_monit

echo "✅ Deployment completed!"