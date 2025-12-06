// db/models/ozonCategoryModel.js
import { getDB } from '../connection.js';
import { OzonApiService } from '../../market/ozon/api.js';

const db = getDB();

export const ozonCategoryModel = {
    /**
     * Синхронизация категорий с Ozon
     */
    async syncWithOzon() {
        try {
            console.log('🔄 Синхронизация категорий с Ozon...');
            const apiService = new OzonExactService();

            // Получаем корневые категории
            const categories = await apiService.fetchCategories();

            const insertStmt = db.prepare(`
                INSERT OR IGNORE INTO categories 
                (id, name, full_name, url, parent_id, catalog_type, has_children, image, is_active)
                VALUES (?, ?, ?, ?, ?, 'ozon', ?, ?, 1)
            `);

            const transaction = db.transaction((categories) => {
                for (const category of categories) {
                    insertStmt.run(
                        category.id,
                        category.name,
                        category.full_name,
                        category.url,
                        category.parent_id,
                        category.has_children ? 1 : 0,
                        category.image || ''
                    );
                }
            });

            transaction(categories);

            console.log(`✅ Синхронизировано ${categories.length} категорий Ozon`);
            return categories.length;
        } catch (error) {
            console.error('❌ Ошибка синхронизации категорий Ozon:', error);
            throw error;
        }
    },

    /**
     * Безопасная синхронизация
     */
    async safeSyncWithOzon() {
        try {
            const hasOzonCategories = await this.hasOzonCategories();

            if (!hasOzonCategories) {
                console.log('📭 Категорий Ozon нет в базе, выполняем синхронизацию...');
                return await this.syncWithOzon();
            } else {
                console.log('📚 Категории Ozon уже есть в базе');
                const count = db
                    .prepare('SELECT COUNT(*) as count FROM categories WHERE catalog_type = "ozon"')
                    .get().count;
                return count;
            }
        } catch (error) {
            console.error('❌ Ошибка безопасной синхронизации Ozon:', error);
            throw error;
        }
    },

    /**
     * Проверка наличия категорий Ozon
     */
    hasOzonCategories() {
        const result = db.prepare('SELECT COUNT(*) as count FROM categories WHERE catalog_type = "ozon"').get();
        return result.count > 0;
    },

    /**
     * Найти категорию по ID
     */
    findById(id) {
        return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    },

    /**
     * Получить категории по parent_id
     */
    findByParentId(parentId) {
        if (parentId === null) {
            return db
                .prepare(
                    `
                SELECT * FROM categories 
                WHERE parent_id IS NULL AND catalog_type = 'ozon' AND is_active = 1 
                ORDER BY name
            `
                )
                .all();
        } else {
            return db
                .prepare(
                    `
                SELECT * FROM categories 
                WHERE parent_id = ? AND catalog_type = 'ozon' AND is_active = 1 
                ORDER BY name
            `
                )
                .all(parentId);
        }
    },

    /**
     * Получить все категории Ozon
     */
    findAll() {
        return db
            .prepare(
                `
            SELECT * FROM categories 
            WHERE catalog_type = 'ozon' AND is_active = 1 
            ORDER BY full_name
        `
            )
            .all();
    },
};
