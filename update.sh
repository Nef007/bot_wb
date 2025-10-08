#!/bin/bash

    echo "Pulling latest changes..."

    # Pull updates
    if git pull; then
        echo "✅ Updates downloaded successfully!"
        
        # Install dependencies
        npm install

        npm run migrate:run
        
        
        # Restart application
        pm2 restart wb_monit
        echo "✅ Application restarted!"
        
    else
        echo "❌ Failed to pull updates. Reverting..."
    fi
    
