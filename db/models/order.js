import { getDB } from '../connection.js';

const db = getDB();

const orderModel = {
    create: (userId, orderNumber, planType, amount, yoomoneyLabel, paymentUrl) => {
        const stmt = db.prepare(`
            INSERT INTO orders 
            (userId, orderNumber, planType, amount, status, yoomoneyLabel, paymentUrl) 
            VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
        `);
        return stmt.run(userId, orderNumber, planType, amount, yoomoneyLabel, paymentUrl);
    },

    findByUserId: (userId, limit = 10) => {
        const stmt = db.prepare(`
            SELECT * FROM orders 
            WHERE userId = ? 
            ORDER BY createdAt DESC 
            LIMIT ?
        `);
        return stmt.all(userId, limit);
    },

    findByOrderNumber: (orderNumber) => {
        const stmt = db.prepare(`
            SELECT * FROM orders WHERE orderNumber = ?
        `);
        return stmt.get(orderNumber);
    },

    updateStatus: (orderNumber, status) => {
        const stmt = db.prepare(`
            UPDATE orders 
            SET status = ?, updatedAt = CURRENT_TIMESTAMP 
            WHERE orderNumber = ?
        `);
        return stmt.run(status, orderNumber);
    },

    deleteExpiredPending: () => {
        const stmt = db.prepare(`
            DELETE FROM orders 
            WHERE status = 'PENDING' 
            AND createdAt < datetime('now', '-3 days')
        `);
        return stmt.run();
    },

    deleteByOrderNumber: (orderNumber) => {
        const stmt = db.prepare(`
            DELETE FROM orders WHERE orderNumber = ?
        `);
        return stmt.run(orderNumber);
    },
};

export default orderModel;
