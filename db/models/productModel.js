import { getDB } from '../connection.js';

export const productModel = {
    /**
     * Создать или обновить товар
     */
    upsert(productData) {
        const db = getDB();
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO products 
            (nm_id, name, brand, brand_id, category_id, current_price, rating, 
             feedbacks_count, image_url, supplier, supplier_id, last_updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        return stmt.run(
            productData.nm_id,
            productData.name,
            productData.brand,
            productData.brandId,
            productData.category_id,
            productData.current_price,
            productData.rating || 0,
            productData.feedbacks_count || 0,
            productData.image_url,
            productData.supplier,
            productData.supplier_id
        );
    },

    /**
     * Найти товар по артикулу
     */
    findByNmId(nmId) {
        const db = getDB();
        return db.prepare('SELECT * FROM products WHERE nm_id = ?').get(nmId);
    },

    /**
     * Получить товары по категории
     */
    findByCategoryId(categoryId, limit = 100) {
        const db = getDB();
        return db
            .prepare(
                `
            SELECT * FROM products 
            WHERE category_id = ? AND is_active = 1 
            ORDER BY last_updated_at DESC 
            LIMIT ?
        `
            )
            .all(categoryId, limit);
    },

    /**
     * Обновить цену товара
     */
    updatePrice(nmId, newPrice) {
        const db = getDB();
        db.prepare(
            `
            UPDATE products 
            SET current_price = ?, last_updated_at = CURRENT_TIMESTAMP
            WHERE nm_id = ?
        `
        ).run(newPrice, nmId);
    },

    /**
     * Деактивировать товар
     */
    deactivate(nmId) {
        const db = getDB();
        db.prepare('UPDATE products SET is_active = 0 WHERE nm_id = ?').run(nmId);
    },
};
