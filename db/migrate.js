#!/usr/bin/env node
import { migrationManager } from './migrations.js';
import { initializeDatabase } from './connection.js';

// Инициализируем базу перед выполнением команд
initializeDatabase();

const command = process.argv[2];
const name = process.argv[3];

async function runCommand() {
    switch (command) {
        case 'create':
            if (!name) {
                console.error('Usage: npm run migrate:create <migration_name>');
                process.exit(1);
            }
            migrationManager.createMigration(name);
            break;

        case 'run':
            await migrationManager.runMigrations();
            break;

        case 'status':
            const applied = migrationManager.getAppliedMigrations();
            console.log('Applied migrations:', applied);
            break;

        default:
            console.log(`
Database Migration Tool

Usage:
  npm run migrate:create <name>  Create a new migration
  npm run migrate:run           Run all pending migrations
  npm run migrate:status        Show migration status
            `);
            break;
    }
}

runCommand().catch(console.error);
