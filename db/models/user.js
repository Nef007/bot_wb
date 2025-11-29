import { getDB } from '../connection.js';

const db = getDB();

const userModel = {
    create: (id, username, status = 'ACTIVE', role = 'USER') => {
        const stmt = db.prepare('INSERT INTO users (id, username, status, role) VALUES (?, ?, ?, ?)');
        stmt.run(id, username, status, role);
        return { id, username, status, role };
    },

    findById: (id) => {
        const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
        return stmt.get(id);
    },

    findAll: () => {
        const stmt = db.prepare('SELECT * FROM users ORDER BY created_at DESC');
        return stmt.all();
    },

    findByRole: (role) => {
        const stmt = db.prepare('SELECT * FROM users WHERE role = ? ORDER BY created_at DESC');
        return stmt.all(role);
    },

    update: (id, updates) => {
        let setClause = [];
        let params = [];
        for (const key in updates) {
            if (['username', 'status', 'role'].includes(key)) {
                setClause.push(`${key} = ?`);
                params.push(updates[key]);
            }
        }
        if (setClause.length === 0) {
            return null;
        }
        params.push(id);
        const stmt = db.prepare(`UPDATE users SET ${setClause.join(', ')} WHERE id = ?`);
        const info = stmt.run(...params);
        return info.changes > 0 ? userModel.findById(id) : null;
    },

    updateRole: (id, role) => {
        const stmt = db.prepare('UPDATE users SET role = ? WHERE id = ?');
        return stmt.run(role, id);
    },

    isAdmin: (userId) => {
        const user = userModel.findById(userId);
        return user && user.role === 'ADMIN';
    },

    delete: (id) => {
        const stmt = db.prepare('DELETE FROM users WHERE id = ?');
        const info = stmt.run(id);
        return info.changes > 0;
    },
};

export default userModel;
