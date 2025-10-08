import { initializeDatabase, resetDatabase, getDB } from './connection.js';
import { migrationManager } from './migrations.js';

// Инициализируем базу данных при импорте
initializeDatabase();

// Запускаем миграции автоматически
migrationManager.runMigrations().catch(console.error);

export { getDB as db, initializeDatabase, resetDatabase, migrationManager };
