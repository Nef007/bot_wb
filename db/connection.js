import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, 'database.sqlite');
let dbInstance = null;

export function getDB() {
    if (!dbInstance) {
        dbInstance = new Database(DB_PATH);
        dbInstance.pragma('journal_mode = WAL');
        dbInstance.pragma('foreign_keys = ON');
    }
    return dbInstance;
}

export async function initializeDatabase() {
    const db = getDB();

    // Создаем базовые таблицы если их нет
    createBaseTables(db);

    return db;
}

function createBaseTables(db) {
    db.exec(`
       
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'BLOCKED', 'PENDING')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            role TEXT DEFAULT 'USER' CHECK(role IN ('USER', 'ADMIN'))
        );

    
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL UNIQUE,
            planType TEXT NOT NULL CHECK(planType IN ('TRIAL', 'MONTHLY', 'QUARTERLY')),
            status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')),
            startDate DATETIME NOT NULL,
            endDate DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            orderNumber TEXT NOT NULL UNIQUE,
            planType TEXT NOT NULL CHECK(planType IN ('TRIAL', 'MONTHLY', 'QUARTERLY')),
            amount REAL NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED')),
            yoomoneyLabel TEXT,
            paymentUrl TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        );

       

 CREATE TABLE IF NOT EXISTS categories (
    id INTEGER NOT NULL,
    catalog_type TEXT NOT NULL,
    name TEXT NOT NULL,
    full_name TEXT NOT NULL,
    url TEXT,
    query TEXT,
    parent_id INTEGER,
    has_children BOOLEAN DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    search_query TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Составной первичный ключ
    PRIMARY KEY (id, catalog_type),
    
    -- Внешний ключ тоже должен учитывать составной ключ
    FOREIGN KEY (parent_id, catalog_type) 
        REFERENCES categories(id, catalog_type) 
        ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS user_category_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            category_id INTEGER NOT NULL,
            catalog_type TEXT NOT NULL, 
            alert_threshold INTEGER DEFAULT 5,
            is_active BOOLEAN DEFAULT 1,
            last_scan_at DATETIME,
            scan_pages INTEGER DEFAULT 10,
            scan_interval_minutes INTEGER DEFAULT 10,
            max_products INTEGER DEFAULT 1000,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        
             -- Внешний ключ на составной ключ categories
            FOREIGN KEY (category_id, catalog_type) 
            REFERENCES categories(id, catalog_type) 
            ON DELETE CASCADE,
    
            -- Уникальность по user_id + составному ключу категории
             UNIQUE(user_id, category_id, catalog_type)

           
        );

  

        -- Таблица товаров
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT,
    brand_id INTEGER,
    category_id INTEGER, 
    catalog_type TEXT NOT NULL, 
    current_price INTEGER NOT NULL,
    rating REAL DEFAULT 0,
    feedbacks_count INTEGER DEFAULT 0,
    image_url TEXT,
    supplier TEXT,
    marketplace TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
            FOREIGN KEY (category_id, catalog_type) 
            REFERENCES categories(id, catalog_type) 
            ON DELETE SET NULL
);
        -- Таблица истории цен
        CREATE TABLE IF NOT EXISTS price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            price INTEGER NOT NULL, -- цена в копейках
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );

      


              -- Таблица для отслеживания конкретных товаров
CREATE TABLE IF NOT EXISTS user_product_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    product_brand TEXT,
    product_image_url TEXT,
    product_url TEXT NOT NULL,
    alert_threshold INTEGER DEFAULT 5,
    is_active BOOLEAN DEFAULT 1,
    last_scan_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, product_id)
);


    

        -- ИНДЕКСЫ ДЛЯ ОПТИМИЗАЦИИ --

CREATE INDEX IF NOT EXISTS idx_user_product_subs_user_id ON user_product_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_product_subs_product_id ON user_product_subscriptions(product_id);
CREATE INDEX IF NOT EXISTS idx_user_product_subs_active ON user_product_subscriptions(is_active);

        -- Индексы из старого бота
        CREATE INDEX IF NOT EXISTS idx_subscriptions_userId ON subscriptions(userId);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_endDate ON subscriptions(endDate);
        CREATE INDEX IF NOT EXISTS idx_orders_userId ON orders(userId);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

        -- Новые индексы для мониторинга
     
        CREATE INDEX IF NOT EXISTS idx_user_category_subs_user_id ON user_category_subscriptions(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_category_subs_category_composite ON user_category_subscriptions(category_id, catalog_type);
        CREATE INDEX IF NOT EXISTS idx_user_category_subs_active ON user_category_subscriptions(is_active);

        CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
        CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
        
        CREATE INDEX IF NOT EXISTS idx_price_history_product_id ON price_history(product_id);
        CREATE INDEX IF NOT EXISTS idx_price_history_created_at ON price_history(created_at);
        
        
        
        CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
        CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);
    `);
}

export function resetDatabase() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
    try {
        fs.unlinkSync(DB_PATH);
        console.log('Database file deleted.');
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error('Error deleting database file:', e);
        }
    }
    initializeDatabase();
    console.log('Database reset and re-initialized.');
}
