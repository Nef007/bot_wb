import { getDB } from '../connection.js';

const db = getDB();

export const priceHistoryModel = {
    /**
     * Добавить запись в историю цен
     */
    create(productId, price) {
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
        return db
            .prepare(
                `
            SELECT * FROM price_history 
            WHERE product_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `
            )
            .all(productId, limit);
    },

    /**
     * Получить последнюю цену товара
     */
    getLastPrice(productId) {
        try {
            // Основной запрос
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

            //  console.log(`📋 getLastTwoPrices для ${productId}: ${results.length} записей`);

            // Отладка: покажем что возвращается
            // if (results.length > 0) {
            //     results.forEach((record, index) => {
            //         console.log(`   ${index + 1}. ID: ${record.id}, Цена: ${record.price}, Время: ${record.created_at}`);
            //     });
            // }

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
            JOIN products p ON ph.product_id = p.id
            WHERE ph.created_at > ?
            ORDER BY ph.created_at DESC
        `
            )
            .all(date);
    },
};
