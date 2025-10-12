// services/priceMonitoringService.js
import axios from 'axios';
import { getDB } from '../../db/connection.js';
import { userCategorySubscriptionModel } from '../../db/models/userCategorySubscriptionModel.js';
import { wbCategoryModel } from '../../db/models/wbCategory.js';
import { productModel } from '../../db/models/productModel.js';
import { priceHistoryModel } from '../../db/models/priceHistoryModel.js';
import dayjs from 'dayjs';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { telegramNotificationService } from '../../services/telegramNotificationService.js';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Europe/Moscow');

export class PriceMonitoringService {
    constructor() {
        this.scanDelay = 3000;
        this.maxPages = 2;
        this.currentlyScanning = new Set();
        this.initAxiosWithCookies();
    }

    /**
     * Инициализация axios с поддержкой кук
     */
    initAxiosWithCookies() {
        try {
            const jar = new CookieJar();
            this.axiosWithCookies = wrapper(
                axios.create({
                    jar,
                    withCredentials: true,
                })
            );
            this.setInitialCookies();
            console.log('✅ Axios с поддержкой кук инициализирован');
        } catch (error) {
            console.error('❌ Ошибка инициализации axios с куками:', error.message);
            this.axiosWithCookies = axios;
        }
    }

    /**
     * Установка начальных кук как в браузере
     */
    setInitialCookies() {
        const baseUrl = 'https://www.wildberries.ru';
        const initialCookies = [
            `wb__lang=ru; Domain=.wildberries.ru; Path=/`,
            `wbx__navigatorInfoSended=true; Domain=.wildberries.ru; Path=/`,
            `splitInfoV2=${encodeURIComponent(
                JSON.stringify({
                    splitInfo: {
                        common: [{ key: 'ab_kt_duplicates_items', value: 'new_widget' }],
                        search: [{ key: 'ab_testid', value: 'popular_sort' }],
                        rec: [{ key: 'ab_sim_vecdot', value: 'test_50' }],
                    },
                    t: Date.now(),
                    authed: false,
                })
            )}; Domain=.wildberries.ru; Path=/`,
        ];

        initialCookies.forEach((cookie) => {
            try {
                this.axiosWithCookies.defaults.jar.setCookieSync(cookie, baseUrl);
            } catch (error) {
                console.log('⚠️ Не удалось установить cookie:', cookie.substring(0, 50));
            }
        });
    }

    /**
     * Запуск мониторинга всех активных подписок
     */
    async startMonitoring(bot) {
        try {
            console.log('🔄 Запуск мониторинга цен...');

            const activeSubscriptions = await userCategorySubscriptionModel.findAllActive();
            console.log(`📊 Найдено активных подписок: ${activeSubscriptions.length}`);

            if (activeSubscriptions.length === 0) {
                console.log('ℹ️ Нет активных подписок для мониторинга');
                return;
            }

            // Группируем подписки по категориям
            const categoriesMap = this.groupSubscriptionsByCategory(activeSubscriptions);
            console.log(`🎯 Уникальных категорий для сканирования: ${categoriesMap.size}`);

            // Сканируем каждую категорию
            for (const [categoryId, subscriptions] of categoriesMap) {
                try {
                    await this.scanAndProcessCategory(categoryId, subscriptions, bot);
                    await this.delay(1000);
                } catch (error) {
                    console.error(`❌ Ошибка обработки категории ${categoryId}:`, error.message);
                }
            }

            console.log('✅ Мониторинг завершен');
        } catch (error) {
            console.error('❌ Критическая ошибка мониторинга:', error);
        }
    }

    /**
     * Группировка подписок по категориям
     */
    groupSubscriptionsByCategory(subscriptions) {
        const categories = new Map();
        for (const subscription of subscriptions) {
            const categoryId = subscription.category_id;
            if (!categories.has(categoryId)) {
                categories.set(categoryId, []);
            }
            categories.get(categoryId).push(subscription);
        }
        return categories;
    }

    /**
     * Сканирование и обработка категории
     */
    async scanAndProcessCategory(categoryId, subscriptions, bot) {
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

            // Определяем количество страниц для сканирования
            const scanPages = Math.max(...subscriptions.map((s) => s.scan_pages || 10));

            // Сканируем товары
            const products = await this.scanCategoryProducts(category, scanPages);
            console.log(`📦 Найдено товаров: ${products.length}`);

            if (products.length === 0) {
                console.log(`ℹ️ В категории ${category.name} не найдено товаров`);
                return;
            }

            // Обрабатываем каждый товар - сохраняем и проверяем изменения цен
            for (const product of products) {
                await this.processProduct(product, subscriptions, category, bot);
            }

            // Обновляем время последнего сканирования для всех подписок
            for (const subscription of subscriptions) {
                await userCategorySubscriptionModel.updateLastScan(subscription.id);
            }
        } finally {
            this.currentlyScanning.delete(categoryId);
        }
    }

    /**
     * Обработка одного товара
     */
    async processProduct(product, subscriptions, category, bot) {
        try {
            if (!product.nm_id || !product.current_price || product.current_price === 0) {
                return;
            }

            // Сохраняем/обновляем товар в базе
            await productModel.upsert(product);

            // Получаем предыдущую цену
            const lastPriceRecord = priceHistoryModel.getLastPrice(product.nm_id);
            const lastPrice = lastPriceRecord ? lastPriceRecord.price : null;

            // Если цена изменилась - сохраняем новую цену и проверяем уведомления
            if (lastPrice === null || product.current_price !== lastPrice) {
                console.log(`💰 Изменение цены: ${product.nm_id} ${lastPrice || 'новый'} → ${product.current_price}`);

                // Сохраняем новую цену в историю
                await priceHistoryModel.create(product.nm_id, product.current_price);

                // Если это не первый раз когда видим товар (была предыдущая цена)
                if (lastPrice !== null) {
                    console.log('🚀 ~ file: priceMonitoringService.js:202 ~ lastPrice:', lastPrice);
                    // Проверяем для каждого пользователя нужно ли отправлять уведомление
                    await this.checkAndSendNotifications(product, lastPrice, subscriptions, category, bot);
                }
            }
        } catch (error) {
            console.error(`❌ Ошибка обработки товара ${product.nm_id}:`, error.message);
        }
    }

    /**
     * Проверка и отправка уведомлений
     */
    async checkAndSendNotifications(product, oldPrice, subscriptions, category, bot) {
        const priceChange = this.calculatePriceChange(oldPrice, product.current_price);
        console.log('🚀 ~ file: priceMonitoringService.js:217 ~ priceChange:', priceChange);

        // Получаем временные метки для старой и новой цены
        const lastTwoPrices = priceHistoryModel.getLastTwoPrices(product.nm_id);
        const [currentRecord, previousRecord] = lastTwoPrices || [];

        const oldTime = previousRecord ? previousRecord.timestamp : new Date();
        console.log('🚀 ~ file: priceMonitoringService.js:216 ~ oldTime:', oldTime);
        const newTime = currentRecord ? currentRecord.timestamp : new Date();
        console.log('🚀 ~ file: priceMonitoringService.js:218 ~ newTime:', newTime);

        // Фильтруем подписки где изменение цены превышает порог
        const subscriptionsToNotify = subscriptions.filter(
            (subscription) => priceChange <= subscription.alert_threshold
        );
        console.log('🚀 ~ file: priceMonitoringService.js:222 ~ subscriptionsToNotify:', subscriptionsToNotify);

        if (subscriptionsToNotify.length === 0) {
            return;
        }

        console.log(`📨 Найдено ${subscriptionsToNotify.length} подписок для уведомления о товаре ${product.nm_id}`);

        // Создаем уведомления для каждой подписки
        const messages = subscriptionsToNotify.map((subscription) => {
            const alert = {
                user_id: subscription.user_id,
                product_id: product.nm_id,
                product_name: product.name,
                brand: product.brand,
                image_url: product.image_url, // Добавляем URL изображения
                old_price: oldPrice,
                new_price: product.current_price,
                old_time: oldTime,
                new_time: newTime,
                percent_change: priceChange,
                threshold: subscription.alert_threshold,
            };

            // Сохраняем уведомление в базу
            this.saveAlertToDatabase(alert);

            const message = this.formatAlertMessage(alert, category.name);

            return {
                bot: bot,
                chatId: subscription.user_id,
                text: message,
                image_url: product.image_url, // Передаем URL изображения
                alertData: alert,
            };
        });

        // Добавляем сообщения в очередь отправки
        telegramNotificationService.addMultipleToQueue(messages);
    }

    /**
     * Сканирование товаров категории
     */
    async scanCategoryProducts(category, pagesToScan = 10) {
        const allProducts = [];
        const actualPages = Math.min(pagesToScan, this.maxPages);

        for (let page = 1; page <= actualPages; page++) {
            try {
                console.log(`📄 Сканируем страницу ${page}/${actualPages}`);

                const products = await this.fetchCategoryPage(category, page);

                if (!products || products.length === 0) {
                    console.log(`ℹ️ На странице ${page} товаров не найдено, завершаем сканирование`);
                    break;
                }

                console.log(`📊 Страница ${page}: ${products.length} товаров`);
                allProducts.push(...products);

                // Задержка между страницами
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
     * Получение товаров со страницы категории
     */
    async fetchCategoryPage(category, page = 1) {
        try {
            const query = this.buildCategoryQuery(category);
            console.log(`🎯 Сформирован query: ${query}`);

            const url = 'https://u-search.wb.ru/exactmatch/ru/common/v18/search';
            const params = {
                ab_testid: 'popular_sort',
                ab_testing: 'false',
                appType: 1,
                curr: 'rub',
                dest: -1257786,
                inheritFilters: 'false',
                lang: 'ru',
                page: page,
                query: query,
                resultset: 'catalog',
                sort: 'popular',
                spp: 30,
                suppressSpellcheck: 'false',
            };

            const timestamp = Math.floor(Date.now() / 1000);
            const queryId = `qid${timestamp}${Math.random().toString().substring(2, 12)}`;

            const response = await this.axiosWithCookies.get(url, {
                params: params,
                timeout: 20000,
                withCredentials: true,
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 YaBrowser/25.8.0.0 Safari/537.36',
                    Accept: '*/*',
                    'Accept-Language': 'ru,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    Referer: `https://www.wildberries.ru/catalog/elektronika/smart-chasy?sort=popular&page=${page}`,
                    Origin: 'https://www.wildberries.ru',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'cross-site',
                    Priority: 'u=1, i',
                    'x-queryid': queryId,
                    'x-userid': '0',
                },
            });

            let products = [];
            if (response.data?.data?.products) {
                products = response.data.data.products;
            } else if (response.data?.products) {
                products = response.data.products;
            } else if (Array.isArray(response.data)) {
                products = response.data;
            }

            console.log(`✅ Найдено товаров: ${products.length}`);
            return products.map((product) => this.normalizeProductData(product, category.id));
        } catch (error) {
            console.error(`❌ Ошибка запроса страницы ${page}:`, error.message);
            return [];
        }
    }

    /**
     * Формирование query параметра для категории
     */
    buildCategoryQuery(category) {
        if (category.search_query) {
            console.log(`🎯 Используем search_query из базы: ${category.search_query}`);
            return category.search_query;
        }

        if (category.query && category.query.includes('menu_redirect_subject_v2')) {
            console.log(`🎯 Используем query из базы: ${category.query}`);
            return category.query;
        }

        console.log(`🎯 Формируем query автоматически: menu_redirect_subject_v2_${category.id} ${category.name}`);
        return `menu_redirect_subject_v2_${category.id} ${category.name}`;
    }

    /**
     * Нормализация данных товара
     */
    normalizeProductData(productData, categoryId) {
        let priceU = 0;

        // Основной способ через sizes[0].price.product
        if (productData.sizes && productData.sizes.length > 0) {
            const firstSize = productData.sizes[0];
            if (firstSize.price?.product && firstSize.price.product > 0) {
                priceU = firstSize.price.product;
            } else if (firstSize.price?.basic && firstSize.price.basic > 0) {
                priceU = firstSize.price.basic;
            }
        }
        // Резервные способы
        else if (productData.salePriceU && productData.salePriceU > 0) {
            priceU = productData.salePriceU;
        } else if (productData.priceU && productData.priceU > 0) {
            priceU = productData.priceU;
        }

        const priceInRubles = priceU ? Math.round(priceU / 100) : 0;

        if (priceInRubles === 0) {
            console.log(`❌ НЕ НАЙДЕНА ЦЕНА для товара: ${productData.name}`);
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
            image_url: this.getProductImageUrl(productData.id),
            supplier: productData.supplier || '',
            supplier_id: productData.supplierId || 0,
        };
    }

    /**
     * Генерация URL изображения товара
     */
    getProductImageUrl(productId) {
        if (!productId) return '';

        try {
            const nm = parseInt(productId, 10);
            const vol = ~~(nm / 1e5);
            const part = ~~(nm / 1e3);

            let host = '01';
            if (vol >= 0 && vol <= 143) host = '01';
            else if (vol >= 144 && vol <= 287) host = '02';
            else if (vol >= 288 && vol <= 431) host = '03';
            else if (vol >= 432 && vol <= 719) host = '04';
            else if (vol >= 720 && vol <= 1007) host = '05';
            else if (vol >= 1008 && vol <= 1061) host = '06';
            else if (vol >= 1062 && vol <= 1115) host = '07';
            else if (vol >= 1116 && vol <= 1169) host = '08';
            else if (vol >= 1170 && vol <= 1313) host = '09';
            else if (vol >= 1314 && vol <= 1601) host = '10';
            else if (vol >= 1602 && vol <= 1655) host = '11';
            else if (vol >= 1656 && vol <= 1919) host = '12';
            else if (vol >= 1920 && vol <= 2045) host = '13';
            else if (vol >= 2046 && vol <= 2189) host = '14';
            else if (vol >= 2170 && vol <= 2405) host = '15';
            else if (vol >= 2406 && vol <= 2621) host = '16';
            else if (vol >= 2622 && vol <= 2837) host = '17';
            else host = '18';

            // Возвращаем URL большого изображения (big/1.jpg)
            return `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${nm}/images/big/1.jpg`;
        } catch (error) {
            console.log('🚀 ~ file: priceMonitoringService.js:465 ~ error:', error);
            return '';
        }
    }

    /**
     * Расчет изменения цены в процентах
     */
    calculatePriceChange(oldPrice, newPrice) {
        if (!oldPrice || oldPrice === 0) return 0;
        const change = ((newPrice - oldPrice) / oldPrice) * 100;
        return Math.round(change * 100) / 100;
    }

    /**
     * Форматирование сообщения уведомления
     */
    formatAlertMessage(alert, categoryName) {
        const changeIcon = alert.percent_change > 0 ? '📈' : '📉';
        const changeType = alert.percent_change > 0 ? 'подорожал' : 'подешевел';
        const changeColor = alert.percent_change > 0 ? '🔴' : '🟢';
        const productUrl = `https://www.wildberries.ru/catalog/${alert.product_id}/detail.aspx`;

        // Функция для правильного парсинга времени из SQLite
        const parseDbTime = (timeString) => {
            // SQLite хранит время в UTC формате: "2025-10-12 19:24:00"
            // Сначала парсим как UTC, потом конвертируем в Москву
            return dayjs.utc(timeString, 'YYYY-MM-DD HH:mm:ss').tz('Europe/Moscow');
        };

        const oldTimeFormatted = parseDbTime(alert.old_time).format('DD.MM.YYYY HH:mm');
        const newTimeFormatted = parseDbTime(alert.new_time).format('DD.MM.YYYY HH:mm');
        const currentTimeFormatted = dayjs().tz('Europe/Moscow').format('DD.MM.YYYY HH:mm');

        return `
${changeColor} <b>Изменение цены</b>


📦 <b>${alert.product_name}</b>
🏷️ Бренд: ${alert.brand || 'Не указан'}
📂 Категория: ${categoryName}

💰 <b>Цена:</b> ${alert.old_price} руб. (${oldTimeFormatted}) → ${alert.new_price} руб. (${newTimeFormatted})
${changeIcon} <b>Изменение:</b> ${Math.abs(alert.percent_change)}% ${changeType}

⚡ <b>Порог уведомления:</b> ${alert.threshold}%

🔗 Ссылка на товар: ${productUrl}

🕒 ${currentTimeFormatted}
    `.trim();
    }

    /**
     * Сохранение уведомления в базу
     */
    saveAlertToDatabase(alert) {
        const db = getDB();
        try {
            db.prepare(
                `
                INSERT INTO price_alerts 
                (user_id, product_id, old_price, new_price, percent_change, threshold, created_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `
            ).run(
                alert.user_id,
                alert.product_id,
                alert.old_price,
                alert.new_price,
                alert.percent_change,
                alert.threshold
            );
        } catch (error) {
            console.error('❌ Ошибка сохранения уведомления:', error.message);
        }
    }

    /**
     * Задержка выполнения
     */
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

// Создаем и экспортируем экземпляр сервиса
export const priceMonitoringService = new PriceMonitoringService();

/**
 * Запуск периодического мониторинга
 */
export function startPeriodicMonitoring(bot) {
    const INTERVAL_MINUTES = 10;
    const intervalMs = INTERVAL_MINUTES * 60 * 1000;

    console.log(`⏰ Запуск периодического мониторинга (каждые ${INTERVAL_MINUTES} минут)`);

    // Запускаем сразу при старте
    priceMonitoringService.startMonitoring(bot).catch(console.error);

    // Затем по расписанию
    setInterval(() => {
        console.log(`\n🔄 Запуск мониторинга по расписанию...`);
        priceMonitoringService.startMonitoring(bot).catch(console.error);
    }, intervalMs);
}
