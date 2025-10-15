import { getDB } from '../connection.js';

export const productModel = {
    /**
     * Создать или обновить товар
     */
    // Временно замените метод upsert на эту версию в productModel
    upsert(productData) {
        const db = getDB();

        // Если category_id не указан или равен 0, используем системную категорию
        const categoryId = productData.category_id === 0 ? null : productData.category_id;

        // Сначала проверяем существует ли товар
        const existingProduct = db.prepare('SELECT nm_id FROM products WHERE nm_id = ?').get(productData.nm_id);

        // Если товара нет - создаем новый
        if (!existingProduct) {
            return db
                .prepare(
                    `
                INSERT INTO products 
                (nm_id, name, brand, brand_id, category_id, current_price, rating, 
                 feedbacks_count, image_url, supplier, supplier_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
                )
                .run(
                    productData.nm_id,
                    productData.name,
                    productData.brand,
                    productData.brandId,
                    categoryId, // Используем обработанный category_id
                    productData.current_price,
                    productData.rating || 0,
                    productData.feedbacks_count || 0,
                    productData.image_url,
                    productData.supplier,
                    productData.supplier_id
                );
        }

        // Если товар уже существует - обновляем цену и другие данные
        const updateStmt = db.prepare(`
            UPDATE products 
            SET name = ?, brand = ?, brand_id = ?, category_id = ?, 
                current_price = ?, rating = ?, feedbacks_count = ?, 
                image_url = ?, supplier = ?, supplier_id = ?, 
                last_updated_at = CURRENT_TIMESTAMP
            WHERE nm_id = ?
        `);

        return updateStmt.run(
            productData.name,
            productData.brand,
            productData.brandId,
            categoryId,
            productData.current_price,
            productData.rating || 0,
            productData.feedbacks_count || 0,
            productData.image_url,
            productData.supplier,
            productData.supplier_id,
            productData.nm_id
        );
    },

    upsertExplicit(productData) {
        const db = getDB();

        // Сначала пробуем обновить
        const updateStmt = db.prepare(`
        UPDATE products 
        SET name = ?, brand = ?, brand_id = ?, category_id = ?, 
            current_price = ?, rating = ?, feedbacks_count = ?, 
            image_url = ?, supplier = ?, supplier_id = ?, 
            last_updated_at = CURRENT_TIMESTAMP
        WHERE nm_id = ?
    `);

        const updateResult = updateStmt.run(
            productData.name,
            productData.brand,
            productData.brandId,
            productData.category_id,
            productData.current_price,
            productData.rating || 0,
            productData.feedbacks_count || 0,
            productData.image_url,
            productData.supplier,
            productData.supplier_id,
            productData.nm_id
        );

        // Если не обновили ни одной строки, значит товара нет - создаем
        if (updateResult.changes === 0) {
            const insertStmt = db.prepare(`
            INSERT INTO products 
            (nm_id, name, brand, brand_id, category_id, current_price, rating, 
             feedbacks_count, image_url, supplier, supplier_id, first_seen_at, last_updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

            return insertStmt.run(
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
        }

        return updateResult;
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
