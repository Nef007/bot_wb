import { getDB } from '../connection.js';

const db = getDB();

const subscriptionModel = {
    create: (userId, planType, startDate, endDate, status = 'ACTIVE') => {
        // Преобразуем даты в строки
        const startDateStr = typeof startDate === 'string' ? startDate : startDate.toISOString();
        const endDateStr = typeof endDate === 'string' ? endDate : endDate.toISOString();

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO subscriptions 
            (userId, planType, status, startDate, endDate) 
            VALUES (?, ?, ?, ?, ?)
        `);
        return stmt.run(userId, planType, status, startDateStr, endDateStr);
    },

    findByUserId: (userId) => {
        const stmt = db.prepare(`
            SELECT * FROM subscriptions WHERE userId = ?
        `);
        const result = stmt.get(userId);

        // Конвертируем строки обратно в Date объекты если нужно
        if (result) {
            result.startDate = new Date(result.startDate);
            result.endDate = new Date(result.endDate);
        }
        return result;
    },

    updateStatus: (userId, status) => {
        const stmt = db.prepare(`
            UPDATE subscriptions 
            SET status = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE userId = ?
        `);
        return stmt.run(status, userId);
    },

    isSubscriptionActive: (userId) => {
        const subscription = subscriptionModel.findByUserId(userId);
        if (!subscription) return false;

        const now = new Date();
        const endDate = new Date(subscription.endDate);
        return subscription.status === 'ACTIVE' && endDate > now;
    },

    getRemainingDays: (userId) => {
        const subscription = subscriptionModel.findByUserId(userId);
        if (!subscription) return 0;

        const now = new Date();
        const endDate = new Date(subscription.endDate);
        const diffTime = endDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return Math.max(0, diffDays);
    },

    deleteByUserId: (userId) => {
        const stmt = db.prepare('DELETE FROM subscriptions WHERE userId = ?');
        const result = stmt.run(userId);
        return result.changes > 0;
    },
};

export default subscriptionModel;
