// test/ozonApiService.test.js
import { OzonExactService } from './market/ozon/api.js';

class OzonApiTester {
    constructor() {
        this.apiService = new OzonExactService();
    }

    /**
     * Тестирование получения категорий
     */
    async testFetchCategories() {
        console.log('🧪 Тестирование получения категорий...\n');

        try {
            const categories = await this.apiService.fetchCategories();

            console.log(`✅ Успешно получено категорий: ${categories.length}`);

            // Выводим первые 5 категорий для примера
            console.log('\n📋 Примеры категорий:');
            categories.slice(0, 5).forEach((category, index) => {
                console.log(`${index + 1}. ${category.name} (ID: ${category.id})`);
                if (category.parent_id) {
                    console.log(`   ↳ Родительская категория: ${category.parent_id}`);
                }
            });

            // Группируем по наличию детей
            const withChildren = categories.filter((cat) => cat.has_children);
            const withoutChildren = categories.filter((cat) => !cat.has_children);

            console.log(`\n📊 Статистика:`);
            console.log(`   - Родительских категорий: ${withChildren.length}`);
            console.log(`   - Дочерних категорий: ${withoutChildren.length}`);

            return categories;
        } catch (error) {
            console.error('❌ Ошибка при тестировании категорий:', error.message);
            throw error;
        }
    }

    /**
     * Тестирование получения товаров из конкретной категории
     */
    async testFetchCategoryProducts(categoryUrl = '/category/smartfony-15502/') {
        console.log('\n\n🧪 Тестирование получения товаров из категории...');
        console.log(`📁 Категория: ${categoryUrl}\n`);

        try {
            const products = await this.apiService.fetchAllCategoryProducts(categoryUrl);

            console.log(`✅ Успешно получено товаров: ${products.length}`);

            // Выводим первые 3 товара для примера
            console.log('\n📦 Примеры товаров:');
            products.slice(0, 3).forEach((product, index) => {
                console.log(`${index + 1}. ${product.name}`);
                console.log(`   💰 Цена: ${product.current_price} руб.`);
                console.log(`   🆔 ID: ${product.nm_id}`);
                console.log(`   ⭐ Рейтинг: ${product.rating}`);
                console.log(`   💬 Отзывы: ${product.feedbacks_count}`);
                console.log(`   🏷️ Бренд: ${product.brand || 'Не указан'}`);
                console.log('   ──────────────────────────');
            });

            // Статистика
            const withPrice = products.filter((p) => p.current_price > 0);
            const withRating = products.filter((p) => p.rating > 0);
            const withFeedbacks = products.filter((p) => p.feedbacks_count > 0);

            console.log(`\n📊 Статистика товаров:`);
            console.log(`   - С ценой: ${withPrice.length}`);
            console.log(`   - С рейтингом: ${withRating.length}`);
            console.log(`   - С отзывами: ${withFeedbacks.length}`);

            return products;
        } catch (error) {
            console.error('❌ Ошибка при тестировании товаров:', error.message);
            throw error;
        }
    }

    /**
     * Тестирование получения детальной информации о товаре
     */
    async testFetchProductDetail(
        productUrl = '/product/acer-nitro-v-15-igrovoy-noutbuk-15-6-amd-ryzen-5-6600h-ram-16-gb-ssd-512-gb-nvidia-geforce-rtx-2168649659/'
    ) {
        console.log('\n\n🧪 Тестирование получения детальной информации о товаре...');
        console.log(`📱 Товар: ${productUrl}\n`);

        try {
            const productDetail = await this.apiService.fetchProductDetail(productUrl);

            if (productDetail) {
                console.log('✅ Детальная информация о товаре:');
                console.log(`   Название: ${productDetail.name || 'Не указано'}`);
                console.log(`   Цена: ${productDetail.current_price || 0} руб.`);
                console.log(`   ID: ${productDetail.nm_id || 'Не указан'}`);
                console.log(`   Рейтинг: ${productDetail.rating || 0}`);
                console.log(`   Отзывы: ${productDetail.feedbacks_count || 0}`);
                console.log(`   Бренд: ${productDetail.brand || 'Не указан'}`);
                console.log(`   URL: ${productDetail.url || 'Не указан'}`);
                console.log(`   Изображение: ${productDetail.image_url ? 'Есть' : 'Нет'}`);

                // Дополнительная информация
                if (productDetail.description) {
                    console.log(`   Описание: ${productDetail.description.substring(0, 100)}...`);
                }
            } else {
                console.log('❌ Не удалось получить детальную информацию о товаре');
            }

            return productDetail;
        } catch (error) {
            console.error('❌ Ошибка при тестировании деталей товара:', error.message);
            throw error;
        }
    }

    /**
     * Тестирование парсинга категорий
     */
    async testParseCategories() {
        console.log('\n\n🧪 Тестирование парсинга категорий...\n');

        // Мок данные для тестирования парсера
        const mockData = {
            data: {
                columns: [
                    {
                        categories: [
                            {
                                title: 'Электроника',
                                url: '/category/elektronika-15500/',
                                image: 'https://example.com/electronics.jpg',
                                categories: [
                                    {
                                        title: 'Смартфоны',
                                        url: '/category/smartfony-15502/',
                                    },
                                    {
                                        title: 'Ноутбуки',
                                        url: '/category/noutbuki-15501/',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        };

        try {
            const parsedCategories = this.apiService.parseCategories(mockData);

            console.log(`✅ Парсинг категорий выполнен: ${parsedCategories.length} категорий`);

            parsedCategories.forEach((category, index) => {
                console.log(`${index + 1}. ${category.full_name}`);
                console.log(`   ID: ${category.id}, Родитель: ${category.parent_id}`);
                console.log(`   Дети: ${category.has_children}, URL: ${category.url}`);
            });

            return parsedCategories;
        } catch (error) {
            console.error('❌ Ошибка при тестировании парсинга категорий:', error);
            throw error;
        }
    }

    /**
     * Полный тест всех методов
     */
    async runAllTests() {
        console.log('🚀 Запуск полного тестирования Ozon API Service\n');
        console.log('='.repeat(50));

        try {
            //  1. Тест парсинга категорий
            await this.testParseCategories();

            //  2. Тест получения категорий
            const categories = await this.testFetchCategories();

            // 3. Тест получения товаров (если есть категории)
            if (categories && categories.length > 0) {
                // Берем первую категорию с товарами
                const testCategory = categories.find((cat) => cat.url && !cat.has_children) || categories[0];
                await this.testFetchCategoryProducts(testCategory.url);
            } else {
                // Используем категорию по умолчанию
                await this.testFetchCategoryProducts();
            }

            // 4. Тест получения деталей товара
            //  await this.testFetchProductDetail();

            console.log('\n🎉 Все тесты успешно завершены!');
        } catch (error) {
            console.error('\n💥 Тестирование завершено с ошибками:', error.message);
            throw error;
        }
    }

    /**
     * Тестирование с конкретными параметрами
     */
    async testWithCustomParameters() {
        console.log('\n\n🎯 Тестирование с пользовательскими параметрами...\n');

        // Пример тестирования разных категорий
        const testCases = [
            {
                name: 'Смартфоны',
                url: '/category/smartfony-15502/',
            },
            {
                name: 'Ноутбуки',
                url: '/category/noutbuki-15501/',
            },
            {
                name: 'Телевизоры',
                url: '/category/televizory-15506/',
            },
        ];

        for (const testCase of testCases) {
            console.log(`\n📁 Тестирование категории: ${testCase.name}`);
            try {
                const products = await this.apiService.fetchCategoryProducts(testCase.url, 1);
                console.log(`   ✅ Получено товаров: ${products.length}`);

                if (products.length > 0) {
                    console.log(
                        `   💰 Средняя цена: ${Math.round(
                            products.reduce((sum, p) => sum + p.current_price, 0) / products.length
                        )} руб.`
                    );
                }
            } catch (error) {
                console.log(`   ❌ Ошибка: ${error.message}`);
            }

            // Задержка между запросами
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}

// Запуск тестов
async function main() {
    const tester = new OzonApiTester();

    try {
        // Запуск полного теста
        await tester.runAllTests();

        // Дополнительное тестирование с разными категориями
        // await tester.testWithCustomParameters();
    } catch (error) {
        console.error('💥 Критическая ошибка при тестировании:', error);
        process.exit(1);
    }
}

// Если файл запущен напрямую

main();
