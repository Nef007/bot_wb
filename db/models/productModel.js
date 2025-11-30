import { getDB } from '../connection.js';

export const productModel = {
    /**
     * Создать или обновить товар
     */
    // Временно замените метод upsert на эту версию в productModel
    upsert(productData) {
        console.log('🚀 ~ file: productModel.js:9 ~ productData:', productData);
        const db = getDB();

        // Если category_id не указан или равен 0, используем системную категорию
        const categoryId = productData.category_id === 0 ? null : productData.category_id;

        // Сначала проверяем существует ли товар
        const existingProduct = db.prepare('SELECT id FROM products WHERE id = ?').get(productData.id);

        // Если товара нет - создаем новый
        if (!existingProduct) {
            return db
                .prepare(
                    `
                INSERT INTO products 
                (id, name, brand, brand_id, category_id, current_price, rating, 
                 feedbacks_count, image_url, supplier)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
                )
                .run(
                    productData.id,
                    productData.name,
                    productData.brand,
                    productData.brandId,
                    categoryId, // Используем обработанный category_id
                    productData.current_price,
                    productData.rating || 0,
                    productData.feedbacks_count || 0,
                    productData.image_url,
                    productData.supplier
                );
        }

        // Если товар уже существует - обновляем цену и другие данные
        const updateStmt = db.prepare(`
            UPDATE products 
            SET name = ?, brand = ?, brand_id = ?, category_id = ?, 
                current_price = ?, rating = ?, feedbacks_count = ?, 
                image_url = ?, supplier = ?,  
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
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
            productData.id
        );
    },

    /**
     * Найти товар по артикулу
     */
    findByNmId(nmId) {
        const db = getDB();
        return db.prepare('SELECT * FROM products WHERE id = ?').get(nmId);
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
            ORDER BY updated_at DESC 
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
            SET current_price = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `
        ).run(newPrice, nmId);
    },

    getPriceHistory: (productId, limit = 20) => {
        const db = getDB();

        return db
            .prepare(
                `
        SELECT ph.price, ph.created_at
        FROM price_history ph
        WHERE ph.product_id = ?
        ORDER BY ph.created_at ASC
        LIMIT ?
    `
            )
            .all(productId, limit);
    },
};
