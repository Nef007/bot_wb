// services/ozonPriceMonitoringService.js
import { BaseMonitoringService } from '../baseMonitoringService.js';
import { OzonApiService } from './api.js';
import { ozonCategoryModel } from '../../db/models/ozonCategoryModel.js';
import { userCategorySubscriptionModel } from '../../db/models/userCategorySubscriptionModel.js';
import { productModel } from '../../db/models/productModel.js';
import { priceHistoryModel } from '../../db/models/priceHistoryModel.js';

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

            // Получаем все активные подписки
            const subscriptions = await userCategorySubscriptionModel.findAllActive();
            const ozonSubscriptions = subscriptions.filter(
                (sub) => sub.catalog_type === 'ozon' || sub.query?.includes('ozon')
            );

            console.log(`📊 Найдено ${ozonSubscriptions.length} активных подписок Ozon`);

            // Обрабатываем каждую подписку
            for (const subscription of ozonSubscriptions) {
                try {
                    await this.processSubscription(subscription);
                    await this.delay(this.scanDelay); // Задержка между категориями
                } catch (error) {
                    console.error(`❌ Ошибка обработки подписки ${subscription.id}:`, error);
                }
            }

            console.log(`✅ Мониторинг ${this.serviceName} завершен`);
        } catch (error) {
            console.error(`❌ Ошибка мониторинга ${this.serviceName}:`, error);
            throw error;
        } finally {
            this.isRunning = false;
        }
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
                console.error(`❌ Ошибка обработки товара ${productData.nm_id}:`, error);
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
            const priceHistory = await priceHistoryModel.getLastTwoPrices(product.nm_id);

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
            await priceHistoryModel.addPrice(product.nm_id, product.current_price);
        } catch (error) {
            console.error(`❌ Ошибка проверки цены товара ${product.nm_id}:`, error);
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
