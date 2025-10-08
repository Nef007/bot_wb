import { getDB } from './connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MigrationManager {
    constructor() {
        this.migrationsTable = 'schema_migrations';
        this.migrationsPath = path.join(__dirname, 'migrations');
        this.init();
    }

    init() {
        const db = getDB();
        // Создаем таблицу для отслеживания миграций
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version INTEGER NOT NULL UNIQUE,
                name TEXT NOT NULL,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    getAppliedMigrations() {
        const db = getDB();
        const stmt = db.prepare(`SELECT version FROM ${this.migrationsTable} ORDER BY version`);
        return stmt.all().map((row) => row.version);
    }

    async runMigrations() {
        const db = getDB();

        try {
            // Получаем список примененных миграций
            const appliedMigrations = this.getAppliedMigrations();

            // Создаем папку migrations если ее нет
            if (!fs.existsSync(this.migrationsPath)) {
                fs.mkdirSync(this.migrationsPath, { recursive: true });
                console.log('Created migrations directory');
                return;
            }

            // Получаем список всех миграций из папки
            const migrationFiles = fs
                .readdirSync(this.migrationsPath)
                .filter((file) => file.endsWith('.sql'))
                .sort(); // Сортируем по имени (версии)

            let migrationsApplied = 0;

            for (const file of migrationFiles) {
                const version = parseInt(file.split('_')[0]);

                // Если миграция еще не применена
                if (!appliedMigrations.includes(version)) {
                    console.log(`Applying migration: ${file}`);

                    const migrationSQL = fs.readFileSync(path.join(this.migrationsPath, file), 'utf8');

                    // Выполняем миграцию в транзакции
                    db.exec('BEGIN TRANSACTION');
                    try {
                        db.exec(migrationSQL);

                        // Отмечаем миграцию как примененную
                        const stmt = db.prepare(`
                            INSERT INTO ${this.migrationsTable} (version, name) 
                            VALUES (?, ?)
                        `);
                        stmt.run(version, file);

                        db.exec('COMMIT');
                        migrationsApplied++;
                        console.log(`✓ Migration ${file} applied successfully`);
                    } catch (error) {
                        db.exec('ROLLBACK');
                        console.error(`✗ Error applying migration ${file}:`, error);
                        throw error;
                    }
                }
            }

            if (migrationsApplied === 0) {
                console.log('✓ Database is up to date - no new migrations to apply');
            } else {
                console.log(`✓ Applied ${migrationsApplied} migration(s)`);
            }
        } catch (error) {
            console.error('Migration error:', error);
        }
    }

    createMigration(name) {
        const timestamp = Date.now();
        const version = Math.floor(timestamp / 1000);
        const fileName = `${version}_${name}.sql`;
        const filePath = path.join(this.migrationsPath, fileName);

        // Создаем папку migrations если ее нет
        if (!fs.existsSync(this.migrationsPath)) {
            fs.mkdirSync(this.migrationsPath, { recursive: true });
        }

        // Создаем пустой файл миграции
        fs.writeFileSync(filePath, '-- Write your migration SQL here\n');
        console.log(`Created migration: ${fileName}`);
        return fileName;
    }
}

export const migrationManager = new MigrationManager();
