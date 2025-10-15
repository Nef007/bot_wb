import { getDB } from '../connection.js';
import { wbCategoryService } from '../../services/wbCategoryService.js';

const db = getDB();

export const wbCategoryModel = {
    /**
     * Синхронизация категорий с Wildberries
     */
    async syncWithWB() {
        try {
            console.log('🔄 Синхронизация категорий с Wildberries...');
            const categories = await wbCategoryService.fetchCategories();

            // Сохраняем текущее состояние подписок перед синхронизацией
            const activeCategoriesBeforeSync = db
                .prepare('SELECT id, is_active FROM wb_categories WHERE is_active = 1')
                .all();
            console.log(`📊 Активных категорий до синхронизации: ${activeCategoriesBeforeSync.length}`);

            // Используем INSERT OR IGNORE для новых категорий и UPDATE для существующих
            const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO wb_categories 
            (id, name, full_name, url, query, shard, dest, parent_id, catalog_type, has_children, search_query, is_active, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        `);

            const updateStmt = db.prepare(`
            UPDATE wb_categories 
            SET name = ?, full_name = ?, url = ?, query = ?, shard = ?, dest = ?, 
                parent_id = ?, catalog_type = ?, has_children = ?, search_query = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

            const transaction = db.transaction((categories) => {
                for (const category of categories) {
                    // Пытаемся вставить новую категорию
                    const insertResult = insertStmt.run(
                        category.id,
                        category.name,
                        category.full_name,
                        category.url,
                        category.query,
                        category.shard,
                        JSON.stringify(category.dest),
                        category.parent_id,
                        category.catalog_type,
                        category.has_children ? 1 : 0,
                        category.searchQuery || null // Добавляем search_query
                    );

                    // Если категория уже существует (не вставилась), обновляем ее
                    if (insertResult.changes === 0) {
                        updateStmt.run(
                            category.name,
                            category.full_name,
                            category.url,
                            category.query,
                            category.shard,
                            JSON.stringify(category.dest),
                            category.parent_id,
                            category.catalog_type,
                            category.has_children ? 1 : 0,
                            category.searchQuery || null, // Обновляем search_query
                            category.id
                        );
                    }
                }
            });

            transaction(categories);

            // Восстанавливаем состояние is_active для категорий, которые были активны до синхронизации
            const restoreStmt = db.prepare(`
            UPDATE wb_categories 
            SET is_active = 1 
            WHERE id IN (${activeCategoriesBeforeSync.map((cat) => '?').join(',')})
        `);

            if (activeCategoriesBeforeSync.length > 0) {
                restoreStmt.run(activeCategoriesBeforeSync.map((cat) => cat.id));
            }

            console.log(`✅ Синхронизировано ${categories.length} категорий`);
            console.log(`📊 Сохранено активных категорий: ${activeCategoriesBeforeSync.length}`);

            // Логируем категории с search_query для отладки
            const categoriesWithSearchQuery = db
                .prepare('SELECT id, name, search_query FROM wb_categories WHERE search_query IS NOT NULL LIMIT 10')
                .all();
            console.log(`🔍 Категории с search_query (первые 10):`);
            categoriesWithSearchQuery.forEach((cat) => {
                console.log(`   ${cat.id}: ${cat.name} -> ${cat.search_query}`);
            });

            return categories.length;
        } catch (error) {
            console.error('❌ Ошибка синхронизации категорий:', error);
            throw error;
        }
    },

    /**
     * Безопасная синхронизация - только если категорий нет
     */
    async safeSyncWithWB() {
        try {
            const hasCategories = await this.hasCategories();

            if (!hasCategories) {
                console.log('📭 Категорий нет в базе, выполняем синхронизацию...');
                return await this.syncWithWB();
            } else {
                console.log('📚 Категории уже есть в базе, пропускаем синхронизацию');
                const count = db.prepare('SELECT COUNT(*) as count FROM wb_categories').get().count;
                return count;
            }
        } catch (error) {
            console.error('❌ Ошибка безопасной синхронизации:', error);
            throw error;
        }
    },

    /**
     * Получить категории по parent_id
     */
    findByParentId(parentId) {
        const db = getDB();
        if (parentId === null) {
            return db
                .prepare(
                    `
                SELECT * FROM wb_categories 
                WHERE parent_id IS NULL AND is_active = 1 
                ORDER BY name
            `
                )
                .all();
        } else {
            return db
                .prepare(
                    `
                SELECT * FROM wb_categories 
                WHERE parent_id = ? AND is_active = 1 
                ORDER BY name
            `
                )
                .all(parentId);
        }
    },

    /**
     * Найти категорию по ID
     */
    findById(id) {
        const db = getDB();
        return db.prepare('SELECT * FROM wb_categories WHERE id = ?').get(id);
    },

    /**
     * Получить все категории
     */
    findAll() {
        const db = getDB();
        return db
            .prepare(
                `
            SELECT * FROM wb_categories 
            WHERE is_active = 1 
            ORDER BY full_name
        `
            )
            .all();
    },

    /**
     * Проверить, есть ли категории в базе
     */
    hasCategories() {
        const db = getDB();
        const result = db.prepare('SELECT COUNT(*) as count FROM wb_categories').get();
        return result.count > 0;
    },

    /**
     * Получить количество активных категорий
     */
    getActiveCategoriesCount() {
        const db = getDB();
        const result = db.prepare('SELECT COUNT(*) as count FROM wb_categories WHERE is_active = 1').get();
        return result.count;
    },

    createSystemCategory() {
        const db = getDB();
        try {
            const result = db
                .prepare(
                    `
                INSERT OR IGNORE INTO wb_categories 
                (id, name, full_name, catalog_type, is_active, has_children)
                VALUES (0, 'Отдельные товары', 'Отдельные товары', 'system', 1, 0)
            `
                )
                .run();

            if (result.changes > 0) {
                console.log('✅ Создана системная категория для отдельных товаров');
            }
        } catch (error) {
            console.error('❌ Ошибка создания системной категории:', error);
        }
    },
};
