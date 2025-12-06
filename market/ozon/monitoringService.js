import { BaseMonitoringService } from '../baseMonitoringService.js';
import { PriceUtils } from '../wb/utils/priceUtils.js';
import { OzonApiService } from './api.js';
import { ozonCategoryModel } from '../../db/models/ozonCategoryModel.js';
import { userCategorySubscriptionModel } from '../../db/models/userCategorySubscriptionModel.js';
import { productModel } from '../../db/models/productModel.js';
import { priceHistoryModel } from '../../db/models/priceHistoryModel.js';
import { userProductSubscriptionModel } from '../../db/models/userProductSubscriptionModel.js';

export class OzonPriceMonitoringService extends BaseMonitoringService {
    constructor() {
        super('Ozon');
        this.apiService = new OzonApiService();
        this.isRunning = false;
        this.scanDelay = 5000; // Задержка между запросами
    }

    /**
     * Запуск мониторинга Ozon
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
            //  await this.monitorCategories();

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

    async monitorProducts() {
        try {
            const activeProductSubscriptions = await userProductSubscriptionModel.findAllActive('ozon');

            if (activeProductSubscriptions.length === 0) {
                console.log(`ℹ️ Нет активных подписок на товары для мониторинга`);
                return;
            }

            console.log(`📦 ${this.serviceName}: найдено подписок на товары: ${activeProductSubscriptions.length}`);

            // Группируем по товарам для избежания дублирования запросов
            const productsMap = new Map();
            activeProductSubscriptions.forEach((subscription) => {
                if (!productsMap.has(subscription.product_url)) {
                    productsMap.set(subscription.product_url, []);
                }
                productsMap.get(subscription.product_url).push(subscription);
            });

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

            const productData = await this.apiService.fetchProductDetail(productNmId);

            if (!productData) {
                console.log(`❌ Товар ${productNmId} не найден`);
                return;
            }

            // Нормализуем данные товара

            await this.processProduct(productData, subscriptions, { name: 'Отдельный товар' });

            // Обновляем время последнего сканирования для всех подписок на этот товар
            const updatePromises = subscriptions.map((subscription) =>
                userProductSubscriptionModel.updateLastScan(subscription.id)
            );

            await Promise.allSettled(updatePromises);
        } catch (error) {
            console.error(`❌ Ошибка сканирования товара ${productNmId}:`, error.message);
        }
    }

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

    isValidProduct(product) {
        return product.id && product.current_price && product.current_price > 0;
    }

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
     * Обработка одной подписки
     */
    async processSubscription(subscription) {
        console.log(`🔍 Сканирование категории Ozon: ${subscription.category_name}`);

        const category = await ozonCategoryModel.findById(subscription.category_id);
        if (!category) {
            console.error(`❌ Категория не найдена: ${subscription.category_id}`);
            return;
        }

        let totalProducts = 0;

        // Сканируем указанное количество страниц
        for (let page = 1; page <= subscription.scan_pages; page++) {
            try {
                console.log(`📄 Сканирование страницы ${page} категории "${category.name}"`);

                const products = await this.apiService.fetchCategoryProducts(category.url, page);

                if (products.length === 0) {
                    console.log(`⏹️ На странице ${page} товаров не найдено, завершаем сканирование`);
                    break;
                }

                totalProducts += await this.processProductsBatch(products, subscription);

                // Обновляем время последнего сканирования
                await userCategorySubscriptionModel.updateLastScan(subscription.id);

                console.log(`✅ Страница ${page} обработана, найдено ${products.length} товаров`);

                // Задержка между страницами
                if (page < subscription.scan_pages) {
                    await this.delay(2000);
                }
            } catch (error) {
                console.error(`❌ Ошибка сканирования страницы ${page}:`, error.message);
                break;
            }
        }

        console.log(`✅ Категория "${category.name}" обработана, всего товаров: ${totalProducts}`);
    }

    /**
     * Обработка батча товаров
     */
    async processProductsBatch(products, subscription) {
        let processedCount = 0;

        for (const productData of products) {
            try {
                // Добавляем category_id к данным товара
                const productWithCategory = {
                    ...productData,
                    category_id: subscription.category_id,
                };

                // Сохраняем/обновляем товар
                await productModel.upsert(productWithCategory);

                // Проверяем изменение цены и отправляем уведомления
                await this.checkPriceChange(productWithCategory, subscription);

                processedCount++;
            } catch (error) {
                console.error(`❌ Ошибка обработки товара ${productData.id}:`, error);
            }
        }

        return processedCount;
    }

    /**
     * Проверка изменения цены и отправка уведомлений
     */
    async checkPriceChange(product, subscription) {
        try {
            // Получаем историю цен
            const priceHistory = await priceHistoryModel.getLastTwoPrices(product.id);

            if (priceHistory.length >= 2) {
                const lastPrice = priceHistory[0].price;
                const previousPrice = priceHistory[1].price;

                const priceDiff = lastPrice - previousPrice;
                const percentChange = (Math.abs(priceDiff) / previousPrice) * 100;

                // Проверяем превышение порога
                if (percentChange >= subscription.alert_threshold) {
                    await this.sendPriceAlert(product, subscription, priceDiff, percentChange);
                }
            }

            // Сохраняем текущую цену в историю
            await priceHistoryModel.addPrice(product.id, product.current_price);
        } catch (error) {
            console.error(`❌ Ошибка проверки цены товара ${product.id}:`, error);
        }
    }

    /**
     * Отправка уведомления об изменении цены
     */
    async sendPriceAlert(product, subscription, priceDiff, percentChange) {
        try {
            const direction = priceDiff > 0 ? '📈' : '📉';
            const changeType = priceDiff > 0 ? 'выросла' : 'упала';
            const changeText = priceDiff > 0 ? `+${priceDiff}` : priceDiff;

            const message = `
${direction} <b>Изменение цены в категории "${subscription.category_name}"</b>

📦 <b>${product.name}</b>
${product.brand ? `🏷️ Бренд: ${product.brand}\n` : ''}
💰 <b>Цена ${changeType}:</b> ${changeText} руб. (${percentChange.toFixed(2)}%)

💵 <b>Текущая цена:</b> ${product.current_price} руб.

🔗 <a href="https://www.ozon.ru${product.url}">Смотреть товар</a>
            `;

            // Здесь будет логика отправки уведомления пользователю
            console.log(`🔔 Уведомление для пользователя ${subscription.user_id}:`, message);

            // TODO: Интегрировать с системой уведомлений бота
            // await bot.api.sendMessage(subscription.user_id, message, { parse_mode: 'HTML' });
        } catch (error) {
            console.error(`❌ Ошибка отправки уведомления:`, error);
        }
    }

    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
