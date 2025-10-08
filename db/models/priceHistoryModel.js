import { getDB } from '../connection.js';

export const priceHistoryModel = {
    /**
     * Добавить запись в историю цен
     */
    create(productId, price) {
        const db = getDB();
        db.prepare(
            `
            INSERT INTO price_history (product_id, price) 
            VALUES (?, ?)
        `
        ).run(productId, price);
    },

    /**
     * Получить историю цен товара
     */
    findByProductId(productId, limit = 50) {
        const db = getDB();
        return db
            .prepare(
                `
            SELECT * FROM price_history 
            WHERE product_id = ? 
            ORDER BY timestamp DESC 
            LIMIT ?
        `
            )
            .all(productId, limit);
    },

    /**
     * Получить последнюю цену товара
     */
    getLastPrice(productId) {
        const db = getDB();
        try {
            const result = db
                .prepare(
                    `
            SELECT * FROM price_history 
            WHERE product_id = ? 
            ORDER BY id DESC 
            LIMIT 1
        `
                )
                .get(productId);

            // console.log(`📋 getLastPrice для ${productId}:`, result);
            return result;
        } catch (error) {
            console.error('❌ Ошибка получения последней цены:', error.message);
            return null;
        }
    },

    getLastTwoPrices(productId) {
        const db = getDB();
        try {
            const results = db
                .prepare(
                    `
            SELECT * FROM price_history 
            WHERE product_id = ? 
            ORDER BY id DESC 
            LIMIT 2
        `
                )
                .all(productId);

            // console.log(`📋 getLastTwoPrices для ${productId}:`, results);
            return results;
        } catch (error) {
            console.error('❌ Ошибка получения двух последних цен:', error.message);
            return null;
        }
    },

    /**
     * Получить изменения цен за период
     */
    getPriceChangesSince(date) {
        const db = getDB();
        return db
            .prepare(
                `
            SELECT ph.*, p.name as product_name, p.brand 
            FROM price_history ph
            JOIN products p ON ph.product_id = p.nm_id
            WHERE ph.timestamp > ?
            ORDER BY ph.timestamp DESC
        `
            )
            .all(date);
    },
};
