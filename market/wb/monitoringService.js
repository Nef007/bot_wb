// services/priceMonitoringService.js
import { PriceMonitoringConfig } from './config.js';
import { PriceUtils } from './utils/priceUtils.js';
import { ImageUtils } from './utils/imageUtils.js';
import { WildberriesApiService } from './api.js';
import { userCategorySubscriptionModel } from '../../db/models/userCategorySubscriptionModel.js';
import { categoryModel } from '../../db/models/category.js';
import { productModel } from '../../db/models/productModel.js';
import { priceHistoryModel } from '../../db/models/priceHistoryModel.js';
import { notificationManager } from '../../services/notificationManager.js';
import { BaseMonitoringService } from '../baseMonitoringService.js';
import { userProductSubscriptionModel } from '../../db/models/userProductSubscriptionModel.js';

export class WBPriceMonitoringService extends BaseMonitoringService {
    constructor() {
        super('Wildberries');
        this.wbApiService = new WildberriesApiService();
        this.currentlyScanning = new Set();
        this.scanDelay = PriceMonitoringConfig.SCAN.DELAY;
        this.maxPages = PriceMonitoringConfig.SCAN.MAX_PAGES;
    }

    /**
     * Запуск мониторинга всех активных подписок
     */
    async startMonitoring() {
        if (this.isRunning) {
            console.log(`⏭️ ${this.serviceName} мониторинг уже запущен`);
            return;
        }

        try {
            this.isRunning = true;
            console.log(`🔄 Запуск мониторинга ${this.serviceName}...`);

            // Мониторинг категорий
            await this.monitorCategories();

            // Мониторинг отдельных товаров
            await this.monitorProducts();

            console.log(`✅ Мониторинг ${this.serviceName} завершен`);
        } catch (error) {
            console.error(`❌ Критическая ошибка мониторинга ${this.serviceName}:`, error);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    async monitorCategories() {
        try {
            const activeSubscriptions = await userCategorySubscriptionModel.findAllActive('wb');

            if (activeSubscriptions.length === 0) {
                console.log(`ℹ️ Нет активных подписок на категории для мониторинга ${this.serviceName}`);
                return;
            }

            console.log(
                `📊 ${this.serviceName}: найдено активных подписок на категории: ${activeSubscriptions.length}`
            );

            const categoriesMap = this.groupSubscriptionsByCategory(activeSubscriptions);
            console.log(`🎯 ${this.serviceName}: уникальных категорий для сканирования: ${categoriesMap.size}`);

            await this.processCategories(categoriesMap);
        } catch (error) {
            console.error(`❌ Ошибка мониторинга категорий:`, error);
        }
    }

    /**
     * Группировка подписок по категориям
     */
    groupSubscriptionsByCategory(subscriptions) {
        return subscriptions.reduce((map, subscription) => {
            const categoryId = subscription.category_id;
            if (!map.has(categoryId)) {
                map.set(categoryId, []);
            }
            map.get(categoryId).push(subscription);
            return map;
        }, new Map());
    }

    /**
     * Обработка всех категорий
     */
    async processCategories(categoriesMap) {
        const processingPromises = Array.from(categoriesMap.entries()).map(async ([categoryId, subscriptions]) => {
            try {
                await this.scanAndProcessCategory(categoryId, subscriptions);
                await this.delay(this.scanDelay);
            } catch (error) {
                console.error(`❌ Ошибка обработки категории ${categoryId}:`, error.message);
            }
        });

        await Promise.allSettled(processingPromises);
    }

    /**
     * Сканирование и обработка категории
     */
    async scanAndProcessCategory(categoryId, subscriptions) {
        if (this.currentlyScanning.has(categoryId)) {
            console.log(`⏭️ Категория ${categoryId} уже сканируется, пропускаем`);
            return;
        }

        try {
            this.currentlyScanning.add(categoryId);

            const category = await categoryModel.findById(categoryId);
            if (!category) {
                console.log(`❌ Категория ${categoryId} не найдена`);
                return;
            }

            console.log(`\n🔍 Сканируем категорию: ${category.name} (ID: ${categoryId})`);
            console.log(`👥 Подписчиков: ${subscriptions.length}`);

            const scanPages = this.calculateScanPages(subscriptions);
            const products = await this.scanCategoryProducts(category, scanPages);

            console.log(`📦 Найдено товаров: ${products.length}`);

            if (products.length === 0) {
                console.log(`ℹ️ В категории ${category.name} не найдено товаров`);
                return;
            }

            await this.processProductsBatch(products, subscriptions, category);
            await this.updateSubscriptionsLastScan(subscriptions);
        } finally {
            this.currentlyScanning.delete(categoryId);
        }
    }

    /**
     * Расчет количества страниц для сканирования
     */
    calculateScanPages(subscriptions) {
        const maxUserPages = Math.max(
            ...subscriptions.map((s) => s.scan_pages || PriceMonitoringConfig.SCAN.DEFAULT_PAGES)
        );
        return Math.min(maxUserPages, this.maxPages);
    }

    /**
     * Пакетная обработка товаров
     */
    async processProductsBatch(products, subscriptions, category) {
        const processingPromises = products.map((product) => this.processProduct(product, subscriptions, category));

        await Promise.allSettled(processingPromises);
    }

    /**
     * Обработка одного товара
     */
    async processProduct(product, subscriptions, category) {
        try {
            if (!this.isValidProduct(product)) {
                return;
            }

            await productModel.upsert(product);

            const lastPriceRecord = await priceHistoryModel.getLastPrice(product.id);
            const lastPrice = lastPriceRecord?.price;

            if (lastPrice === null || product.current_price !== lastPrice) {
                console.log(`💰 Изменение цены: ${product.id} ${lastPrice || 'новый'} → ${product.current_price}`);

                await priceHistoryModel.create(product.id, product.current_price);

                if (lastPrice !== null) {
                    await this.checkAndSendNotifications(product, lastPrice, subscriptions, category);
                }
            }
        } catch (error) {
            console.error(`❌ Ошибка обработки товара ${product.id}:`, error.message);
        }
    }

    /**
     * Валидация товара
     */
    isValidProduct(product) {
        return product.id && product.current_price && product.current_price > 0;
    }

    /**
     * Сканирование товаров категории
     */
    async scanCategoryProducts(category, pagesToScan) {
        const allProducts = [];
        const actualPages = Math.min(pagesToScan, this.maxPages);

        for (let page = 1; page <= actualPages; page++) {
            try {
                console.log(`📄 Сканируем страницу ${page}/${actualPages}`);

                const products = await this.wbApiService.fetchCategoryProducts(category, page);

                if (products.length === 0) {
                    console.log(`ℹ️ На странице ${page} товаров не найдено, завершаем сканирование`);
                    break;
                }

                console.log(`📊 Страница ${page}: ${products.length} товаров`);

                const normalizedProducts = products.map((product) => this.normalizeProductData(product, category.id));

                allProducts.push(...normalizedProducts);

                if (page < actualPages) {
                    await this.delay(this.scanDelay);
                }
            } catch (error) {
                console.error(`❌ Ошибка сканирования страницы ${page}:`, error.message);
                break;
            }
        }

        return allProducts;
    }

    /**
     * Нормализация данных товара
     */
    normalizeProductData(productData, categoryId) {
        const priceU = this.extractProductPrice(productData);
        const priceInRubles = PriceUtils.convertPriceToRubles(priceU);

        if (priceInRubles === 0) {
            console.log(`❌ Не найдена цена для товара: ${productData.name}`);
        }

        return {
            id: productData.id,
            name: productData.name || 'Неизвестный товар',
            brand: productData.brand || '',
            brandId: productData.brandId || 0,
            category_id: categoryId,
            current_price: priceInRubles,
            rating: productData.rating || productData.reviewRating || 0,
            feedbacks_count: productData.feedbacks || productData.feedbackCount || 0,
            image_url: ImageUtils.getProductImageUrl(productData.id),
            supplier: productData.supplier || '',
            supplier_id: productData.supplierId || 0,
            marketplace: 'wb',
        };
    }

    /**
     * Извлечение цены товара
     */
    extractProductPrice(productData) {
        // Основной способ через sizes
        if (productData.sizes?.[0]?.price?.product) {
            return productData.sizes[0].price.product;
        }
        if (productData.sizes?.[0]?.price?.basic) {
            return productData.sizes[0].price.basic;
        }
        // Резервные способы
        if (productData.salePriceU) {
            return productData.salePriceU;
        }
        return productData.priceU || 0;
    }

    /**
     * Проверка и отправка уведомлений
     */
    async checkAndSendNotifications(product, oldPrice, subscriptions, category) {
        const priceChange = PriceUtils.calculatePriceChange(oldPrice, product.current_price);

        if (!PriceUtils.isPriceChangeSignificant(oldPrice, product.current_price)) {
            return;
        }

        const subscriptionsToNotify = subscriptions.filter(
            (subscription) => priceChange <= -subscription.alert_threshold
        );

        if (subscriptionsToNotify.length === 0) {
            return;
        }

        console.log(`📨 Найдено ${subscriptionsToNotify.length} подписок для уведомления о товаре ${product.id}`);

        const lastTwoPrices = await priceHistoryModel.getLastTwoPrices(product.id);
        const [currentRecord, previousRecord] = lastTwoPrices || [];

        // Используем notificationManager вместо прямого доступа к telegramNotificationService
        subscriptionsToNotify.forEach((subscription) => {
            const alert = {
                user_id: subscription.user_id,
                product_id: product.id,
                product_name: product.name,
                brand: product.brand,
                image_url: product.image_url,
                old_price: oldPrice,
                new_price: product.current_price,
                old_time: previousRecord?.created_at || new Date(),
                new_time: currentRecord?.created_at || new Date(),
                percent_change: priceChange,
                threshold: subscription.alert_threshold,
            };

            this.saveAlertToDatabase(alert);
            notificationManager.sendPriceAlert(alert, category.name);
        });
    }

    /**
     * Сохранение уведомления в базу
     */
    saveAlertToDatabase(alert) {
        // Ваша реализация сохранения в базу
    }

    /**
     * Обновление времени последнего сканирования для подписок
     */
    async updateSubscriptionsLastScan(subscriptions) {
        const updatePromises = subscriptions.map((subscription) =>
            userCategorySubscriptionModel.updateLastScan(subscription.id)
        );

        await Promise.allSettled(updatePromises);
    }

    /**
     * Задержка выполнения
     */
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async monitorProducts() {
        try {
            const activeProductSubscriptions = await userProductSubscriptionModel.findAllActive('wb');

            if (activeProductSubscriptions.length === 0) {
                console.log(`ℹ️ Нет активных подписок на товары для мониторинга`);
                return;
            }

            console.log(`📦 ${this.serviceName}: найдено подписок на товары: ${activeProductSubscriptions.length}`);

            // Группируем по товарам для избежания дублирования запросов
            const productsMap = new Map();
            activeProductSubscriptions.forEach((subscription) => {
                if (!productsMap.has(subscription.product_id)) {
                    productsMap.set(subscription.product_id, []);
                }
                productsMap.get(subscription.product_id).push(subscription);
            });

            console.log(`🎯 ${this.serviceName}: уникальных товаров для сканирования: ${productsMap.size}`);

            // Обрабатываем товары
            const processingPromises = Array.from(productsMap.entries()).map(async ([productNmId, subscriptions]) => {
                try {
                    await this.scanAndProcessProduct(productNmId, subscriptions);
                    await this.delay(1000); // Задержка между запросами
                } catch (error) {
                    console.error(`❌ Ошибка обработки товара ${productNmId}:`, error.message);
                }
            });

            await Promise.allSettled(processingPromises);
        } catch (error) {
            console.error(`❌ Ошибка мониторинга товаров:`, error);
        }
    }

    async scanAndProcessProduct(productNmId, subscriptions) {
        try {
            console.log(`🔍 Сканируем товар: ${productNmId}`);
            console.log(`👥 Подписчиков: ${subscriptions.length}`);

            const productData = await this.wbApiService.fetchProductDetail(productNmId);

            if (!productData) {
                console.log(`❌ Товар ${productNmId} не найден`);
                return;
            }

            // Нормализуем данные товара
            const normalizedProduct = this.normalizeProductData(productData, 0); // category_id = 0 для отдельных товаров

            await this.processProduct(normalizedProduct, subscriptions, { name: 'Отдельный товар' });

            // Обновляем время последнего сканирования для всех подписок на этот товар
            const updatePromises = subscriptions.map((subscription) =>
                userProductSubscriptionModel.updateLastScan(subscription.id)
            );

            await Promise.allSettled(updatePromises);
        } catch (error) {
            console.error(`❌ Ошибка сканирования товара ${productNmId}:`, error.message);
        }
    }
}

// Создаем и экспортируем экземпляр сервиса
export const priceMonitoringService = new WBPriceMonitoringService();
