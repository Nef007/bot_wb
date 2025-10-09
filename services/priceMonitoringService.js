// services/priceMonitoringService.js
import axios from 'axios';
import { getDB } from '../db/connection.js';
import { userCategorySubscriptionModel } from '../db/models/userCategorySubscriptionModel.js';
import { wbCategoryModel } from '../db/models/wbCategory.js';
import { productModel } from '../db/models/productModel.js';
import { priceHistoryModel } from '../db/models/priceHistoryModel.js';
import dayjs from 'dayjs';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

export class PriceMonitoringService {
    constructor() {
        this.scanDelay = 3000;
        this.maxPages = 5;
        this.currentlyScanning = new Set(); //
        // Инициализируем axios с поддержкой кук
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

            // Устанавливаем базовые куки как в браузере
            this.setInitialCookies();
            console.log('✅ Axios с поддержкой кук инициализирован');
        } catch (error) {
            console.error('❌ Ошибка инициализации axios с куками:', error.message);
            // Fallback - используем обычный axios
            this.axiosWithCookies = axios;
        }
    }

    /**
     * Установка начальных кук как в браузере
     */
    setInitialCookies() {
        const baseUrl = 'https://www.wildberries.ru';

        // Базовые куки которые есть в браузере
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

            // Группируем подписки по категориям чтобы избежать дублирования
            const uniqueCategories = this.groupSubscriptionsByCategory(activeSubscriptions);
            console.log(`🎯 Уникальных категорий для сканирования: ${uniqueCategories.size}`);

            for (const [categoryId, subscriptions] of uniqueCategories) {
                try {
                    await this.processCategory(categoryId, subscriptions, bot);
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

    async processCategory(categoryId, subscriptions, bot) {
        // Проверяем не сканируется ли уже эта категория
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

            // Берем настройки сканирования из первой подписки (можно выбрать самые агрессивные настройки)
            // const mainSubscription = subscriptions[0];
            const scanPages = Math.max(...subscriptions.map((s) => s.scan_pages || 10));

            // Сканируем товары категории один раз
            const products = await this.scanCategoryProducts(category, scanPages);
            console.log(`📦 Найдено товаров: ${products.length} в категории ${category.name}`);

            if (products.length === 0) {
                console.log(`ℹ️ В категории ${category.name} не найдено товаров`);
                return;
            }

            // Для каждого пользователя анализируем изменения по его порогу
            for (const subscription of subscriptions) {
                try {
                    await this.analyzeAndNotifyUser(subscription, products, category, bot);
                } catch (error) {
                    console.error(`❌ Ошибка анализа для пользователя ${subscription.user_id}:`, error.message);
                }
            }

            // Обновляем время последнего сканирования для всех подписок
            for (const subscription of subscriptions) {
                await userCategorySubscriptionModel.updateLastScan(subscription.id);
            }
        } finally {
            // Всегда снимаем блокировку
            this.currentlyScanning.delete(categoryId);
        }
    }

    /**
     * Анализ и уведомление для конкретного пользователя
     */
    async analyzeAndNotifyUser(subscription, products, category, bot) {
        const alerts = await this.analyzePriceChanges(products, subscription.alert_threshold, subscription.user_id);

        // Отправляем уведомления если есть изменения
        if (alerts.length > 0) {
            await this.sendPriceAlerts(alerts, subscription, bot);
        }

        console.log(`✅ Пользователь ${subscription.user_id}: ${alerts.length} уведомлений`);
    }

    /**
     * Получение товаров со страницы категории - ИСПРАВЛЕННАЯ ВЕРСИЯ
     */
    async fetchCategoryPage(category, page = 1) {
        try {
            // Формируем правильный query параметр
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

            console.log(`🔗 Запрос с куками: ${url}?${new URLSearchParams(params)}`);

            // Генерируем уникальные ID как в браузере
            const timestamp = Math.floor(Date.now() / 1000);
            const queryId = `qid${timestamp}${Math.random().toString().substring(2, 12)}`;

            // Используем axios с поддержкой кук
            const response = await this.axiosWithCookies.get(url, {
                params: params,
                timeout: 20000,
                withCredentials: true, // Включаем отправку кук
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
                    // КРИТИЧЕСКИ ВАЖНЫЕ ЗАГОЛОВКИ:
                    'x-queryid': queryId,
                    'x-userid': '0',
                },
            });

            // Проверяем структуру ответа
            // console.log('📊 Структура ответа:', {
            //     hasMetadata: !!response.data?.metadata,
            //     catalogType: response.data?.metadata?.catalog_type,
            //     normquery: response.data?.metadata?.normquery,
            //     name: response.data?.metadata?.name,
            //     catalog_value: response.data?.metadata?.catalog_value?.substring(0, 50) + '...',
            //     productCount: response.data?.products?.length || 0,
            // });

            // Логируем первые 3 товара для отладки
            if (response.data?.products && response.data.products.length > 0) {
                console.log('🔍 Первые 3 товара:');
                response.data.products.slice(0, 3).forEach((product, index) => {
                    console.log(`   ${index + 1}. ${product.name} (ID: ${product.id})`);
                });
            }

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
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Headers:`, error.response.headers);
            }
            return [];
        }
    }

    /**
     * Формирование правильного query параметра для категории
     */
    buildCategoryQuery(category) {
        // Если есть search_query - используем его (самый правильный способ)
        if (category.search_query) {
            console.log(`🎯 Используем search_query из базы: ${category.search_query}`);
            return category.search_query;
        }

        // Если в базе уже есть правильный query - используем его
        if (category.query && category.query.includes('menu_redirect_subject_v2')) {
            console.log(`🎯 Используем query из базы: ${category.query}`);
            return category.query;
        }

        // Иначе формируем query по шаблону: menu_redirect_subject_v2_{id} {name}
        console.log(`🎯 Формируем query автоматически: menu_redirect_subject_v2_${category.id} ${category.name}`);
        return `menu_redirect_subject_v2_${category.id} ${category.name}`;
    }

    /**
     * Нормализация данных товара
     */
    normalizeProductData(productData, categoryId) {
        //  console.log(`🔍 Товар: ${productData.name}`);

        // Определяем цену - ОСНОВНОЙ СПОСОБ ЧЕРЕЗ sizes[0].price.product
        let priceU = 0;

        // Вариант 1: Используем product цену из sizes (основной способ)
        if (productData.sizes && productData.sizes.length > 0) {
            const firstSize = productData.sizes[0];

            // Используем product цену (цена со скидкой)
            if (firstSize.price?.product && firstSize.price.product > 0) {
                priceU = firstSize.price.product;
                //    console.log(`💰 Используем sizes[0].price.product: ${priceU}`);
            }
            // Резервный вариант: basic цена
            else if (firstSize.price?.basic && firstSize.price.basic > 0) {
                priceU = firstSize.price.basic;
                //    console.log(`💰 Используем sizes[0].price.basic: ${priceU}`);
            } else {
                console.log('❌ Все цены в sizes равны 0 или отсутствуют:', {
                    product: firstSize.price?.product,
                    basic: firstSize.price?.basic,
                    rank: firstSize.rank,
                });
            }
        }
        // Вариант 2: Прямые поля (резервный способ)
        else if (productData.salePriceU && productData.salePriceU > 0) {
            priceU = productData.salePriceU;
            //  console.log(`💰 Используем salePriceU: ${priceU}`);
        } else if (productData.priceU && productData.priceU > 0) {
            priceU = productData.priceU;
            //  console.log(`💰 Используем priceU: ${priceU}`);
        }

        // Конвертируем в рубли (цена приходит в копейках)
        const priceInRubles = priceU ? Math.round(priceU / 100) : 0;

        if (priceInRubles === 0) {
            console.log(`❌ НЕ НАЙДЕНА ЦЕНА для товара: ${productData.name}`);
            console.log(`🔍 Доступные поля:`, {
                hasSizes: !!productData.sizes,
                sizeCount: productData.sizes ? productData.sizes.length : 0,
                sizeProductPrice: productData.sizes?.[0]?.price?.product,
                sizeBasicPrice: productData.sizes?.[0]?.price?.basic,
                sizeRank: productData.sizes?.[0]?.rank,
                salePriceU: productData.salePriceU,
                priceU: productData.priceU,
            });
        } else {
            // console.log(`💰 Итоговая цена: ${priceInRubles} руб.`);
        }

        const normalizedProduct = {
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

        return normalizedProduct;
    }
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

                // Для первых 3 товаров покажем детальную информацию о структуре
                if (page === 1 && products.length > 0) {
                    console.log('🔍 ДЕТАЛЬНАЯ ОТЛАДКА ПЕРВЫХ ТОВАРОВ:');
                    for (let i = 0; i < Math.min(3, products.length); i++) {
                        const product = products[i];
                        console.log(`📦 Товар ${i + 1}: ${product.name}`);
                        console.log(
                            `🎯 Структура sizes:`,
                            product.sizes?.[0]
                                ? {
                                      rank: product.sizes[0].rank,
                                      price: product.sizes[0].price,
                                  }
                                : 'Нет sizes'
                        );
                    }
                }

                allProducts.push(...products);

                // Сохраняем товары в базу
                await this.saveProductsToDatabase(products, category.id);

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
     * Генерация URL изображения товара
     */
    getProductImageUrl(productId) {
        if (!productId) return '';

        try {
            const nm = parseInt(productId, 10);
            const vol = Math.floor(nm / 1e5);
            const part = Math.floor(nm / 1e3);

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
            else host = '01';

            return `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${nm}/images/big/1.jpg`;
        } catch (error) {
            return '';
        }
    }

    /**
     * Сохранение товаров в базу данных
     */
    async saveProductsToDatabase(products) {
        let savedCount = 0;
        let errorCount = 0;

        //  console.log(`💾 Начинаем сохранение ${products.length} товаров...`);

        for (const product of products) {
            try {
                // Проверяем обязательные поля
                if (!product.nm_id) {
                    console.log(`❌ Пропускаем товар без ID: ${product.name}`);
                    errorCount++;
                    continue;
                }

                if (!product.name) {
                    console.log(`❌ Пропускаем товар без названия: ID ${product.nm_id}`);
                    errorCount++;
                    continue;
                }

                if (!product.current_price || product.current_price === 0) {
                    console.log(`⚠️ Товар с нулевой ценой: ${product.name} (${product.nm_id})`);
                    continue;
                }

                //  console.log(`📝 Сохраняем товар: ${product.name}, цена: ${product.current_price} руб.`);

                // Сохраняем товар
                try {
                    const result = productModel.upsert(product);

                    const lastPriceRecord = priceHistoryModel.getLastPrice(product.nm_id);
                    const lastPrice = lastPriceRecord ? lastPriceRecord.price : null;

                    if (product.current_price > 0 && product.current_price !== lastPrice) {
                        priceHistoryModel.create(product.nm_id, product.current_price);
                        console.log(
                            `✅ Товар сохранен в products цена изменилась: ${product.nm_id}  ${product.current_price} =>  ${lastPrice} `
                        );
                    }
                    // console.log(`✅ Товар сохранен в products: ${product.nm_id}`);
                } catch (upsertError) {
                    console.error(`❌ Ошибка upsert товара ${product.nm_id}:`, upsertError.message);
                    errorCount++;
                    continue;
                }

                // Сохраняем историю цен
                // if (product.current_price > 0) {
                //     try {
                //         priceHistoryModel.create(product.nm_id, product.current_price);
                //         //   console.log(`✅ История цен сохранена: ${product.nm_id} - ${product.current_price} руб.`);
                //     } catch (historyError) {
                //         console.error(`❌ Ошибка сохранения истории цен ${product.nm_id}:`, historyError.message);
                //     }
                // }

                savedCount++;
            } catch (error) {
                console.error(`❌ Критическая ошибка сохранения товара ${product.nm_id}:`, error);
                errorCount++;
            }
        }

        //  console.log(`💾 Итог сохранения: ${savedCount} успешно, ${errorCount} ошибок из ${products.length} товаров`);
    }

    /**
     * Анализ изменений цен
     */
    async analyzePriceChanges(products, threshold, userId) {
        const alerts = [];

        for (const product of products) {
            try {
                if (!product.nm_id || product.current_price === 0) {
                    continue;
                }

                // Получаем предыдущую цену
                const lastTwoPrices = priceHistoryModel.getLastTwoPrices(product.nm_id);

                if (!lastTwoPrices || lastTwoPrices.length < 2) {
                    continue;
                }

                // Деструктурируем массив
                const [currentRecord, previousRecord] = lastTwoPrices;
                const previousPrice = previousRecord.price; // Предыдущая цена
                const currentPrice = currentRecord.price; // Текущая цена

                // Пропускаем если цены одинаковые
                if (previousPrice === currentPrice) {
                    continue;
                }

                console.log(`🎯 ЦЕНЫ РАЗНЫЕ: ${product.nm_id}  ${previousPrice} → ${currentPrice}`);

                // Рассчитываем изменение цены в процентах
                const priceChange = this.calculatePriceChange(previousPrice, currentPrice);

                // Проверяем превышение порога threshold
                if (priceChange <= -threshold) {
                    alerts.push({
                        user_id: userId,
                        product_id: product.nm_id,
                        product_name: product.name,
                        brand: product.brand,
                        image_url: product.image_url,
                        old_price: previousPrice,
                        new_price: currentPrice,
                        percent_change: priceChange,
                        threshold: threshold,
                    });

                    // обновить цену в базе
                }
            } catch (error) {
                console.error(`❌ Ошибка анализа товара ${product.nm_id}:`, error.message);
            }
        }

        return alerts;
    }
    /**
     * Расчет изменения цены в процентах
     */
    calculatePriceChange(oldPrice, newPrice) {
        if (!oldPrice || oldPrice === 0) return 0;

        const change = ((newPrice - oldPrice) / oldPrice) * 100;
        return Math.round(change * 100) / 100;
    }

    formatAlertMessage(alert, categoryName) {
        const changeIcon = alert.percent_change > 0 ? '📈' : '📉';
        const changeType = alert.percent_change > 0 ? 'подорожал' : 'подешевел';
        const changeColor = alert.percent_change > 0 ? '🔴' : '🟢';

        // Ссылка на товар на Wildberries
        const productUrl = `https://www.wildberries.ru/catalog/${alert.product_id}/detail.aspx`;

        return `
${changeColor} <b>Изменение цены</b>


<b>${alert.product_id}</b>
📦 <b>${alert.product_name}</b>
🏷️ Бренд: ${alert.brand || 'Не указан'}
📂 Категория: ${categoryName}

💰 <b>Цена:</b> ${alert.old_price} руб. () → ${alert.new_price} руб. ()
${changeIcon} <b>Изменение:</b> ${Math.abs(alert.percent_change)}% ${changeType}

⚡ <b>Порог уведомления:</b> ${alert.threshold}%

🔗 Ссылка на товар: ${productUrl}

🕒 ${dayjs().tz('Europe/Moscow').format('DD.MM.YYYY HH:mm')}
    `.trim();
    }

    /**
     * Отправка уведомлений о изменении цен
     */
    async sendPriceAlerts(alerts, subscription, bot) {
        for (const alert of alerts) {
            try {
                // Сохраняем уведомление в базу
                this.saveAlertToDatabase(alert);

                // Формируем сообщение для пользователя
                const message = this.formatAlertMessage(alert, subscription.category_name);

                console.log(
                    `📨 Уведомление для ${subscription.user_id}: ${alert.product_name} - ${alert.percent_change}%`
                );

                // Отправляем сообщение через бота
                await bot.api.sendMessage(subscription.user_id, message, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true, // Отключаем превью чтобы ссылка была кликабельной
                });
            } catch (error) {
                console.error(`❌ Ошибка отправки уведомления:`, error.message);
            }
        }
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
     * Форматирование сообщения уведомления
     */

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
