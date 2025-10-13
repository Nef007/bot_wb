// services/priceMonitoringService.js
import { PriceMonitoringConfig } from './config.js';
import { PriceUtils } from './utils/priceUtils.js';
import { ImageUtils } from './utils/imageUtils.js';
import { WildberriesApiService } from './api.js';
import { userCategorySubscriptionModel } from '../../db/models/userCategorySubscriptionModel.js';
import { wbCategoryModel } from '../../db/models/wbCategory.js';
import { productModel } from '../../db/models/productModel.js';
import { priceHistoryModel } from '../../db/models/priceHistoryModel.js';
import { notificationManager } from '../../services/notificationManager.js';
import { BaseMonitoringService } from '../baseMonitoringService.js';

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

            // ... вся ваша существующая логика мониторинга WB
            const activeSubscriptions = await userCategorySubscriptionModel.findAllActive();

            if (activeSubscriptions.length === 0) {
                console.log(`ℹ️ Нет активных подписок для мониторинга ${this.serviceName}`);
                return;
            }

            console.log(`📊 ${this.serviceName}: найдено активных подписок: ${activeSubscriptions.length}`);

            const categoriesMap = this.groupSubscriptionsByCategory(activeSubscriptions);
            console.log(`🎯 ${this.serviceName}: уникальных категорий для сканирования: ${categoriesMap.size}`);

            await this.processCategories(categoriesMap);

            console.log(`✅ Мониторинг ${this.serviceName} завершен`);
        } catch (error) {
            console.error(`❌ Критическая ошибка мониторинга ${this.serviceName}:`, error);
            throw error;
        } finally {
            this.isRunning = false;
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

            const category = await wbCategoryModel.findById(categoryId);
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

            const lastPriceRecord = await priceHistoryModel.getLastPrice(product.nm_id);
            const lastPrice = lastPriceRecord?.price;

            if (lastPrice === null || product.current_price !== lastPrice) {
                console.log(`💰 Изменение цены: ${product.nm_id} ${lastPrice || 'новый'} → ${product.current_price}`);

                await priceHistoryModel.create(product.nm_id, product.current_price);

                if (lastPrice !== null) {
                    await this.checkAndSendNotifications(product, lastPrice, subscriptions, category);
                }
            }
        } catch (error) {
            console.error(`❌ Ошибка обработки товара ${product.nm_id}:`, error.message);
        }
    }

    /**
     * Валидация товара
     */
    isValidProduct(product) {
        return product.nm_id && product.current_price && product.current_price > 0;
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
                //   console.log('🚀 ~ file: monitoringService.js:182 ~ products:', products);

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
            nm_id: productData.id,
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

        console.log(`📨 Найдено ${subscriptionsToNotify.length} подписок для уведомления о товаре ${product.nm_id}`);

        const lastTwoPrices = await priceHistoryModel.getLastTwoPrices(product.nm_id);
        const [currentRecord, previousRecord] = lastTwoPrices || [];

        // Используем notificationManager вместо прямого доступа к telegramNotificationService
        subscriptionsToNotify.forEach((subscription) => {
            const alert = {
                user_id: subscription.user_id,
                product_id: product.nm_id,
                product_name: product.name,
                brand: product.brand,
                image_url: product.image_url,
                old_price: oldPrice,
                new_price: product.current_price,
                old_time: previousRecord?.timestamp || new Date(),
                new_time: currentRecord?.timestamp || new Date(),
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
}

// Создаем и экспортируем экземпляр сервиса
export const priceMonitoringService = new WBPriceMonitoringService();
