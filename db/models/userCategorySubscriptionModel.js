import { getDB } from '../connection.js';

export const userCategorySubscriptionModel = {
    /**
     * Создать подписку на категорию
     */
    create(userId, categoryId, settings = {}) {
        const db = getDB();
        const result = db
            .prepare(
                `
            INSERT INTO user_category_subscriptions 
            (user_id, category_id, alert_threshold, scan_pages, scan_interval_minutes, max_products) 
            VALUES (?, ?, ?, ?, ?, ?)
        `
            )
            .run(
                userId,
                categoryId,
                settings.alertThreshold || 5,
                settings.scanPages || 10,
                settings.scanInterval || 10,
                settings.maxProducts || 1000
            );

        console.log(`✅ Создана новая подписка ID: ${result.lastInsertRowid}`);
        return result.lastInsertRowid;
    },

    /**
     * Получить подписку пользователя на категорию
     */
    findByUserAndCategory(userId, categoryId) {
        const db = getDB();
        return db
            .prepare(
                `
            SELECT ucs.*, wc.name as category_name, wc.full_name 
            FROM user_category_subscriptions ucs
            JOIN wb_categories wc ON ucs.category_id = wc.id
            WHERE ucs.user_id = ? AND ucs.category_id = ?
        `
            )
            .get(userId, categoryId);
    },

    /**
     * Получить все подписки пользователя
     */
    findByUserId(userId) {
        const db = getDB();
        return db
            .prepare(
                `
            SELECT ucs.*, wc.name as category_name, wc.full_name 
            FROM user_category_subscriptions ucs
            JOIN wb_categories wc ON ucs.category_id = wc.id
            WHERE ucs.user_id = ?
            ORDER BY wc.full_name
        `
            )
            .all(userId);
    },

    /**
     * Получить количество подписок пользователя
     */
    getCountByUserId(userId) {
        const db = getDB();
        const result = db
            .prepare(
                `
            SELECT COUNT(*) as count 
            FROM user_category_subscriptions 
            WHERE user_id = ?
        `
            )
            .get(userId);
        return result.count;
    },

    /**
     * Обновить порог уведомлений
     */
    updateThreshold(subscriptionId, threshold) {
        const db = getDB();
        db.prepare(
            `
            UPDATE user_category_subscriptions 
            SET alert_threshold = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `
        ).run(threshold, subscriptionId);
    },

    /**
     * Обновить настройки сканирования
     */
    updateSettings(subscriptionId, settings) {
        const db = getDB();
        db.prepare(
            `
            UPDATE user_category_subscriptions 
            SET scan_pages = ?, scan_interval_minutes = ?, max_products = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `
        ).run(settings.scanPages, settings.scanInterval, settings.maxProducts, subscriptionId);
    },

    /**
     * Удалить подписку (отписаться)
     */
    delete(subscriptionId) {
        const db = getDB();
        const result = db.prepare('DELETE FROM user_category_subscriptions WHERE id = ?').run(subscriptionId);
        console.log(`❌ Удалена подписка ID: ${subscriptionId}`);
        return result.changes;
    },

    /**
     * Удалить подписку по пользователю и категории
     */
    deleteByUserAndCategory(userId, categoryId) {
        const db = getDB();
        const result = db
            .prepare('DELETE FROM user_category_subscriptions WHERE user_id = ? AND category_id = ?')
            .run(userId, categoryId);
        console.log(`❌ Удалена подписка пользователя ${userId} на категорию ${categoryId}`);
        return result.changes;
    },

    /**
     * Получить все активные подписки (для мониторинга)
     */
    findAllActive() {
        const db = getDB();
        return db
            .prepare(
                `
            SELECT ucs.*, u.id as user_id, u.username, wc.name as category_name, 
                   wc.query, wc.dest, wc.catalog_type
            FROM user_category_subscriptions ucs
            JOIN users u ON ucs.user_id = u.id
            JOIN wb_categories wc ON ucs.category_id = wc.id
            WHERE u.status = 'ACTIVE'
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
            UPDATE user_category_subscriptions 
            SET last_scan_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `
        ).run(subscriptionId);
    },

    /**
     * Проверить, подписан ли пользователь на категорию
     */
    isSubscribed(userId, categoryId) {
        const db = getDB();
        const result = db
            .prepare(
                `
            SELECT COUNT(*) as count 
            FROM user_category_subscriptions 
            WHERE user_id = ? AND category_id = ?
        `
            )
            .get(userId, categoryId);
        return result.count > 0;
    },
};
