import { getDB } from '../connection.js';

export const userProductSubscriptionModel = {
    /**
     * Создать подписку на товар
     */
    create(userId, productData, settings = {}) {
        const db = getDB();
        const result = db
            .prepare(
                `
            INSERT INTO user_product_subscriptions 
            (user_id, product_nm_id, product_name, product_brand, product_image_url, product_url, alert_threshold) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `
            )
            .run(
                userId,
                productData.nm_id,
                productData.name,
                productData.brand || '',
                productData.image_url || '',
                productData.url || '',
                settings.alertThreshold || 5
            );

        console.log(`✅ Создана новая подписка на товар ID: ${result.lastInsertRowid}`);
        return result.lastInsertRowid;
    },

    /**
     * Получить подписку пользователя на товар
     */
    findByUserAndProduct(userId, productNmId) {
        const db = getDB();
        return db
            .prepare(
                `
            SELECT ups.*, p.current_price, p.rating, p.feedbacks_count
            FROM user_product_subscriptions ups
            LEFT JOIN products p ON ups.product_nm_id = p.nm_id
            WHERE ups.user_id = ? AND ups.product_nm_id = ?
        `
            )
            .get(userId, productNmId);
    },

    /**
     * Получить все подписки на товары пользователя
     */
    findByUserId(userId) {
        const db = getDB();
        return db
            .prepare(
                `
            SELECT ups.*, p.current_price, p.rating, p.feedbacks_count, 
                   ph.price as last_price, ph.timestamp as price_updated_at
            FROM user_product_subscriptions ups
            LEFT JOIN products p ON ups.product_nm_id = p.nm_id
            LEFT JOIN price_history ph ON (
                ph.product_id = ups.product_nm_id 
                AND ph.id = (
                    SELECT id FROM price_history 
                    WHERE product_id = ups.product_nm_id 
                    ORDER BY timestamp DESC LIMIT 1
                )
            )
            WHERE ups.user_id = ?
            ORDER BY ups.created_at DESC
        `
            )
            .all(userId);
    },

    /**
     * Получить количество подписок на товары пользователя
     */
    getCountByUserId(userId) {
        const db = getDB();
        const result = db
            .prepare(
                `
            SELECT COUNT(*) as count 
            FROM user_product_subscriptions 
            WHERE user_id = ? AND is_active = 1
        `
            )
            .get(userId);
        return result.count;
    },

    /**
     * Обновить порог уведомлений для товара
     */
    updateThreshold(subscriptionId, threshold) {
        const db = getDB();
        db.prepare(
            `
            UPDATE user_product_subscriptions 
            SET alert_threshold = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `
        ).run(threshold, subscriptionId);
    },

    /**
     * Удалить подписку на товар
     */
    deleteByUserAndProduct(userId, productNmId) {
        const db = getDB();
        const result = db
            .prepare('DELETE FROM user_product_subscriptions WHERE user_id = ? AND product_nm_id = ?')
            .run(userId, productNmId);
        console.log(`❌ Удалена подписка пользователя ${userId} на товар ${productNmId}`);
        return result.changes;
    },

    /**
     * Получить все активные подписки на товары (для мониторинга)
     */
    findAllActive() {
        const db = getDB();
        return db
            .prepare(
                `
            SELECT ups.*, u.id as user_id, u.username
            FROM user_product_subscriptions ups
            JOIN users u ON ups.user_id = u.id
            WHERE ups.is_active = 1 AND u.status = 'ACTIVE'
        `
            )
            .all();
    },

    /**
     * Обновить время последнего сканирования
     */
    updateLastScan(subscriptionId) {
        const db = getDB();
        db.prepare(
            `
            UPDATE user_product_subscriptions 
            SET last_scan_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `
        ).run(subscriptionId);
    },

    /**
     * Проверить, подписан ли пользователь на товар
     */
    isSubscribed(userId, productNmId) {
        const db = getDB();
        const result = db
            .prepare(
                `
            SELECT COUNT(*) as count 
            FROM user_product_subscriptions 
            WHERE user_id = ? AND product_nm_id = ? AND is_active = 1
        `
            )
            .get(userId, productNmId);
        return result.count > 0;
    },
};
