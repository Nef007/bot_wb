import axios from 'axios';

export class WbCategoryService {
    constructor() {
        this.categoriesUrl = 'https://static-basket-01.wbbasket.ru/vol0/data/main-menu-ru-ru-v3.json';
    }

    /**
     * Получить все категории с Wildberries
     */
    async fetchCategories() {
        try {
            console.log('📥 Загружаем категории с Wildberries...');
            const response = await axios.get(this.categoriesUrl, {
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            });

            console.log('✅ Категории успешно загружены');
            return this.flattenCategories(response.data);
        } catch (error) {
            console.error('❌ Ошибка при загрузке категорий:', error.message);
            throw new Error('Не удалось загрузить категории с Wildberries');
        }
    }

    /**
     * Преобразовать древовидную структуру в плоский список
     */
    flattenCategories(categories, parentName = '', parentId = null, result = []) {
        for (const category of categories) {
            // Пропускаем ненужные категории
            if (!category.id || !category.name || category.name === 'Wibes') {
                continue;
            }

            const fullName = parentName ? `${parentName} › ${category.name}` : category.name;

            const categoryData = {
                id: category.id,
                name: category.name,
                full_name: fullName,
                url: category.url || '',
                query: category.query || '',
                shard: category.shard || '',
                dest: category.dest || [],
                parent_id: parentId,
                has_children: !!(category.childs && category.childs.length > 0),
                catalog_type: this.detectCatalogType(category.id),
                searchQuery: category.searchQuery,
            };

            result.push(categoryData);

            // Рекурсивно обрабатываем дочерние категории
            if (category.childs && category.childs.length > 0) {
                this.flattenCategories(category.childs, fullName, category.id, result);
            }
        }
        return result;
    }

    /**
     * Определить тип каталога по ID категории
     */
    detectCatalogType(categoryId) {
        // Простая логика определения каталога
        if (categoryId >= 8000 && categoryId < 9000) return 'men_clothes';
        if (categoryId >= 6000 && categoryId < 7000) return 'women_clothes';
        if (categoryId >= 12000 && categoryId < 13000) return 'electronics';
        return 'general';
    }

    /**
     * Получить категории первого уровня
     */
    async getMainCategories() {
        const allCategories = await this.fetchCategories();
        return allCategories.filter((cat) => cat.parent_id === null);
    }
}

export const wbCategoryService = new WbCategoryService();
