import { wildberriesApiService } from './api.js';
import { categoryModel } from '../../db/models/category.js';

/**
 * Сервис для синхронизации категорий Wildberries с базой данных
 */
export class WbCategorySyncService {
    constructor() {
        this.apiService = wildberriesApiService;
        this.categoryModel = categoryModel;
    }

    /**
     * Полная синхронизация категорий с Wildberries
     */
    async syncWithWB() {
        try {
            console.log('🔄 Синхронизация категорий с Wildberries...');
            const categories = await this.apiService.fetchCategories();

            // Сохраняем текущее состояние подписок перед синхронизацией
            const activeCategoriesBeforeSync = await this.categoryModel.getActiveCategories();
            console.log(`📊 Активных категорий до синхронизации: ${activeCategoriesBeforeSync.length}`);

            // Выполняем синхронизацию
            const syncResult = await this.performSync(categories, activeCategoriesBeforeSync);

            console.log(`✅ Синхронизировано ${categories.length} категорий`);
            console.log(`📊 Сохранено активных категорий: ${activeCategoriesBeforeSync.length}`);

            return {
                totalSynced: categories.length,
                preservedActive: activeCategoriesBeforeSync.length,
                //  inserted: syncResult.inserted,
                //  updated: syncResult.updated,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            console.error('❌ Ошибка синхронизации категорий:', error);
            throw new Error(`Синхронизация не удалась: ${error.message}`);
        }
    }

    /**
     * Выполнение синхронизации
     */
    async performSync(categories, activeCategoriesBeforeSync) {
        let inserted = 0;
        let updated = 0;

        for (const category of categories) {
            const categoryData = this.prepareCategoryData(category);

            // Пытаемся вставить новую категорию
            const insertResult = await this.categoryModel.insertCategory(categoryData);

            if (insertResult.changes === 0) {
                // Если категория уже существует, обновляем ее
                await this.categoryModel.updateCategory(categoryData);
                updated++;
            } else {
                inserted++;
            }
        }

        // Восстанавливаем состояние is_active для категорий, которые были активны до синхронизации
        await this.restoreActiveCategories(activeCategoriesBeforeSync);

        return { inserted, updated };
    }

    /**
     * Подготовка данных категории для вставки в БД
     */
    prepareCategoryData(category) {
        return {
            id: category.id,
            name: category.name,
            full_name: category.full_name,
            url: category.url || '',
            query: category.query || '',
            parent_id: category.parent_id || null,
            catalog_type: 'wb',
            has_children: category.has_children ? 1 : 0,
            search_query: category.search_query || null,
        };
    }

    /**
     * Восстановление активных категорий после синхронизации
     */
    async restoreActiveCategories(activeCategoriesBeforeSync) {
        if (activeCategoriesBeforeSync.length > 0) {
            const activeIds = activeCategoriesBeforeSync.map((cat) => cat.id);
            await this.categoryModel.bulkUpdateCategoryStatus(activeIds, true);
        }
    }

    /**
     * Безопасная синхронизация - только если категорий нет
     */
    async safeSyncWithWB() {
        try {
            const hasCategories = await this.categoryModel.hasCategories();

            if (!hasCategories) {
                console.log('📭 Категорий нет в базе, выполняем синхронизацию...');
                return await this.syncWithWB();
            } else {
                console.log('📚 Категории уже есть в базе, пропускаем синхронизацию');
                const count = await this.categoryModel.getCategoriesCount();
                return {
                    totalSynced: count,
                    preservedActive: await this.categoryModel.getActiveCategoriesCount(),
                    skipped: true,
                    message: 'Категории уже синхронизированы',
                };
            }
        } catch (error) {
            console.error('❌ Ошибка безопасной синхронизации:', error);
            throw error;
        }
    }
}

// Создание и экспорт инстанса по умолчанию
export const wbCategorySyncService = new WbCategorySyncService();

export default WbCategorySyncService;
