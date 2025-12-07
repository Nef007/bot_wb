import { getDB } from '../connection.js';

export const categoryModel = {
    /**
     * CRUD операции
     */

    /**
     * Вставить категорию (с IGNORE)
     */
    insertCategory(categoryData, ignoreConflict = true) {
        const db = getDB();
        const operation = ignoreConflict ? 'INSERT OR IGNORE' : 'INSERT';

        const stmt = db.prepare(`
            ${operation} INTO categories 
            (id, name, full_name, url, query, parent_id, catalog_type, has_children, search_query, is_active, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        `);

        return stmt.run(
            categoryData.id,
            categoryData.name,
            categoryData.full_name,
            categoryData.url,
            categoryData.query,
            categoryData.parent_id,
            categoryData.catalog_type,
            categoryData.has_children,
            categoryData.search_query
        );
    },

    /**
     * Обновить категорию
     */
    updateCategory(categoryData) {
        const db = getDB();
        const stmt = db.prepare(`
            UPDATE categories 
            SET name = ?, full_name = ?, url = ?, query = ?, 
                parent_id = ?,  has_children = ?, search_query = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? and catalog_type = ?
        `);

        return stmt.run(
            categoryData.name,
            categoryData.full_name,
            categoryData.url,
            categoryData.query,
            categoryData.parent_id,
            categoryData.has_children,
            categoryData.search_query,
            categoryData.id,
            categoryData.catalog_type
        );
    },

    /**
     * Массовое обновление статуса категорий
     */
    bulkUpdateCategoryStatus(categoryIds, isActive) {
        const db = getDB();
        if (categoryIds.length === 0) return { changes: 0 };

        const placeholders = categoryIds.map(() => '?').join(',');
        const stmt = db.prepare(`
            UPDATE categories 
            SET is_active = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id IN (${placeholders})
        `);

        return stmt.run(isActive ? 1 : 0, ...categoryIds);
    },

    /**
     * Очистить все категории
     */
    clearAllCategories() {
        const db = getDB();
        const stmt = db.prepare('DELETE FROM categories');
        return stmt.run();
    },

    /**
     * QUERY операции
     */

    /**
     * Получить активные категории
     */
    getActiveCategories() {
        const db = getDB();
        return db.prepare('SELECT id, is_active FROM categories WHERE is_active = 1').all();
    },

    /**
     * Проверить, есть ли категории в базе
     */
    hasCategories() {
        const db = getDB();
        const result = db.prepare('SELECT COUNT(*) as count FROM categories').get();
        return result.count > 0;
    },

    /**
     * Получить количество категорий
     */
    getCategoriesCount() {
        const db = getDB();
        const result = db.prepare('SELECT COUNT(*) as count FROM categories').get();
        return result.count;
    },

    /**
     * Получить количество активных категорий
     */
    getActiveCategoriesCount() {
        const db = getDB();
        const result = db.prepare('SELECT COUNT(*) as count FROM categories WHERE is_active = 1').get();
        return result.count;
    },

    /**
     * Получить время последней синхронизации
     */
    getLastSyncTime() {
        const db = getDB();
        const result = db.prepare('SELECT MAX(updated_at) as last_sync FROM categories').get();
        return result.last_sync;
    },

    /**
     * Получить статистику по категориям
     */
    getCategoriesStats() {
        const db = getDB();
        return db
            .prepare(
                `
            SELECT 
                COUNT(*) as total,
                SUM(is_active) as active,
                SUM(has_children) as with_children,
                COUNT(DISTINCT parent_id) as unique_parents,
                SUM(CASE WHEN search_query IS NOT NULL THEN 1 ELSE 0 END) as with_search_query
            FROM categories
        `
            )
            .get();
    },

    /**
     * Получить категории по parent_id
     */
    findByParentId(parentId, catalog_type) {
        console.log('🚀 ~ file: category.js:157 ~ parentId, catalog_type:', parentId, catalog_type);
        const db = getDB();
        if (parentId === null) {
            return db
                .prepare(
                    `
                    SELECT * FROM categories 
                    WHERE parent_id IS NULL AND is_active = 1 AND catalog_type = ?
                    ORDER BY name
                `
                )
                .all(catalog_type);
        } else {
            return db
                .prepare(
                    `
                    SELECT * FROM categories 
                    WHERE parent_id = ? AND is_active = 1 AND catalog_type = ?
                    ORDER BY name
                `
                )
                .all(parentId, catalog_type);
        }
    },

    /**
     * Найти категорию по ID
     */
    findById(id) {
        const db = getDB();
        return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    },

    /**
     * Получить все категории
     */
    findAll() {
        const db = getDB();
        return db
            .prepare(
                `
                SELECT * FROM categories 
                WHERE is_active = 1 
                ORDER BY full_name
            `
            )
            .all();
    },

    /**
     * Поиск категорий по имени
     */
    searchByName(searchTerm) {
        const db = getDB();
        return db
            .prepare(
                `
                SELECT * FROM categories 
                WHERE (name LIKE ? OR full_name LIKE ?) AND is_active = 1 
                ORDER BY full_name
            `
            )
            .all(`%${searchTerm}%`, `%${searchTerm}%`);
    },
};
