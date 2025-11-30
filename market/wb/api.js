import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { ImageUtils } from './utils/imageUtils.js';

/**
 * Конфигурация API сервиса Wildberries
 */
const ApiConfig = {
    BASE_URLS: {
        SEARCH: 'https://u-search.wb.ru',
        CARD: 'https://u-card.wb.ru',
        BASKET: 'https://static-basket-01.wbbasket.ru',
    },
    ENDPOINTS: {
        SEARCH: '/exactmatch/ru/common/v18/search',
        PRODUCT_DETAIL: '/cards/v4/detail',
        CATEGORIES: '/vol0/data/main-menu-ru-ru-v3.json',
    },
    REQUEST_CONFIG: {
        TIMEOUT: 20000,
        RETRY_ATTEMPTS: 3,
        RETRY_DELAY: 1000,
    },
    DEFAULT_PARAMS: {
        appType: 1,
        curr: 'rub',
        dest: 123589785, //  123589785  Заводская   -1257786 - моксва
        spp: 30,
        lang: 'ru',
    },
};

/**
 * Утилиты для работы с API
 */
class ApiUtils {
    static generateQueryId() {
        const timestamp = Math.floor(Date.now() / 1000);
        return `qid${timestamp}${Math.random().toString().substring(2, 12)}`;
    }

    static constructFullUrl(baseUrl, params) {
        const queryString = Object.keys(params)
            .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join('&');
        return `${baseUrl}?${queryString}`;
    }

    static delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    static buildCategoryQuery(category) {
        if (category.search_query) {
            return category.search_query;
        }
        if (category.query && category.query.includes('menu_redirect_subject_v2')) {
            return category.query;
        }
        return `menu_redirect_subject_v2_${category.id} ${category.name}`;
    }

    static extractProductsFromResponse(data) {
        if (data?.data?.products) return data.data.products;
        if (data?.products) return data.products;
        if (Array.isArray(data)) return data;
        return [];
    }
}

/**
 * Основной сервис для работы с Wildberries API
 */
export class WildberriesApiService {
    constructor(config = {}) {
        this.config = { ...ApiConfig, ...config };
        this.jar = new CookieJar();

        this.axiosInstance = wrapper(
            axios.create({
                jar: this.jar,
                withCredentials: true,
                timeout: this.config.REQUEST_CONFIG.TIMEOUT,
            })
        );

        this.setDefaultHeaders();
        this.setInitialCookies();
    }

    /**
     * Установка стандартных заголовков
     */
    setDefaultHeaders() {
        const defaultHeaders = {
            'User-Agent':
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 YaBrowser/25.8.0.0 Safari/537.36',
            Accept: '*/*',
            'Accept-Language': 'ru,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            Origin: 'https://www.wildberries.ru',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            Priority: 'u=1, i',
        };

        this.axiosInstance.defaults.headers.common = defaultHeaders;
    }

    /**
     * Установка начальных cookies
     */
    setInitialCookies() {
        const baseUrl = 'https://www.wildberries.ru';
        const initialCookies = [
            'wb__lang=ru; Domain=.wildberries.ru; Path=/',
            'wbx__navigatorInfoSended=true; Domain=.wildberries.ru; Path=/',
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
                this.axiosInstance.defaults.jar.setCookieSync(cookie, baseUrl);
            } catch (error) {
                console.warn('Не удалось установить cookie:', cookie.substring(0, 50));
            }
        });
    }

    /**
     * Выполнение запроса с повторными попытками
     */
    async makeRequest(url, options = {}, retryCount = 0) {
        try {
            const response = await this.axiosInstance({
                url,
                ...options,
                timeout: options.timeout || this.config.REQUEST_CONFIG.TIMEOUT,
            });

            return response.data;
        } catch (error) {
            if (retryCount < this.config.REQUEST_CONFIG.RETRY_ATTEMPTS) {
                console.warn(`Повтор запроса (${retryCount + 1}/${this.config.REQUEST_CONFIG.RETRY_ATTEMPTS})`);
                await ApiUtils.delay(this.config.REQUEST_CONFIG.RETRY_DELAY * (retryCount + 1));
                return this.makeRequest(url, options, retryCount + 1);
            }
            throw error;
        }
    }

    /**
     * CATEGORIES API
     */

    /**
     * Получить все категории с Wildberries
     */
    async fetchCategories() {
        try {
            console.log('📥 Загружаем категории с Wildberries...');

            const categories = await this.makeRequest(
                `${this.config.BASE_URLS.BASKET}${this.config.ENDPOINTS.CATEGORIES}`,
                {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                }
            );

            console.log('✅ Категории успешно загружены');
            return this.flattenCategories(categories);
        } catch (error) {
            console.error('❌ Ошибка при загрузке категорий:', error.message);
            throw new Error('Не удалось загрузить категории с Wildberries');
        }
    }

    /**
     * Получить категорию по ID
     */
    async getCategoryById(categoryId) {
        const categories = await this.fetchCategories();
        return categories.find((cat) => cat.id === categoryId);
    }

    /**
     * Получить дочерние категории
     */
    async getChildCategories(parentId) {
        const categories = await this.fetchCategories();
        return categories.filter((cat) => cat.parent_id === parentId);
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
                parent_id: parentId,
                has_children: !!(category.childs && category.childs.length > 0),
                search_query: category.searchQuery || ApiUtils.buildCategoryQuery(category),
                child_count: category.childs ? category.childs.length : 0,
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
     * PRODUCTS API
     */

    /**
     * Получение товаров со страницы категории
     */
    async fetchCategoryProducts(category, page = 1, sort = 'popular') {
        try {
            const query = ApiUtils.buildCategoryQuery(category);
            const queryId = ApiUtils.generateQueryId();
            const url = `${this.config.BASE_URLS.SEARCH}${this.config.ENDPOINTS.SEARCH}`;

            const params = {
                ...this.config.DEFAULT_PARAMS,
                ab_testid: 'popular_sort',
                ab_testing: 'false',
                inheritFilters: 'false',
                page: page,
                query: query,
                resultset: 'catalog',
                sort: sort,
                suppressSpellcheck: 'false',
            };

            const fullUrl = ApiUtils.constructFullUrl(url, params);
            console.log('📡 Запрос к Wildberries:', fullUrl);

            const data = await this.makeRequest(url, {
                method: 'GET',
                params,
                headers: {
                    Referer: `https://www.wildberries.ru/catalog/elektronika/smart-chasy?sort=${sort}&page=${page}`,
                    'x-queryid': queryId,
                    'x-userid': '0',
                },
            });

            const products = ApiUtils.extractProductsFromResponse(data);
            console.log(`✅ Получено ${products.length} товаров со страницы ${page}`);

            return products;
        } catch (error) {
            console.error(`❌ Ошибка запроса страницы ${page}:`, error.message);
            throw error;
        }
    }

    /**
     * Поиск товаров по запросу
     */
    async searchProducts(searchQuery, page = 1, sort = 'popular') {
        const mockCategory = {
            id: 'search',
            name: searchQuery,
            search_query: searchQuery,
        };

        return this.fetchCategoryProducts(mockCategory, page, sort);
    }

    /**
     * Получение детальной информации о товаре
     */
    async fetchProductDetail(nmId) {
        try {
            const url = `${this.config.BASE_URLS.CARD}${this.config.ENDPOINTS.PRODUCT_DETAIL}`;

            const params = {
                ...this.config.DEFAULT_PARAMS,
                hide_dtype: 11,
                ab_testing: false,
                nm: nmId,
            };

            console.log(`📡 Запрос информации о товаре ${nmId}...`);

            const data = await this.makeRequest(url, {
                method: 'GET',
                params,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Accept: 'application/json',
                    Referer: `https://www.wildberries.ru/catalog/${nmId}/detail.aspx`,
                },
            });

            if (!data?.products?.[0]) {
                console.log(`❌ Товар ${nmId} не найден в ответе API`);
                return null;
            }

            console.log(`✅ Получена информация о товаре ${nmId}`);
            return this.normalizeProductData(data.products[0]);
        } catch (error) {
            console.error(`❌ Ошибка получения товара ${nmId}:`, error.message);
            return null;
        }
    }

    /**
     * Получение информации о нескольких товарах
     */
    async fetchMultipleProducts(nmIds) {
        const requests = nmIds.map((nmId) => this.fetchProductDetail(nmId));
        const results = await Promise.allSettled(requests);

        return results
            .filter((result) => result.status === 'fulfilled' && result.value !== null)
            .map((result) => result.value);
    }

    /**
     * Нормализация данных товара
     */
    async normalizeProductData(productData) {
        const price = this.extractProductPrice(productData);
        const priceInRubles = Math.round(price / 100);

        // Ищем рабочее изображение
        const validImageUrl = ImageUtils.getProductImageUrl(productData.id);

        return {
            id: productData.id,
            name: productData.name || 'Неизвестный товар',
            brand: productData.brand || '',
            brandId: productData.brandId || 0,
            current_price: priceInRubles,
            rating: productData.rating || productData.reviewRating || 0,
            feedbacks_count: productData.feedbacks || productData.feedbackCount || 0,
            image_url: validImageUrl, // Только рабочее изображение
            supplier: productData.supplier || '',
            supplier_id: productData.supplierId || 0,
            url: `https://www.wildberries.ru/catalog/${productData.id}/detail.aspx`,
            colors: productData.colors || [],
            sizes: productData.sizes || [],
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
     * UTILITY METHODS
     */

    /**
     * Получить статистику по категории
     */
    async getCategoryStats(categoryId, maxPages = 3) {
        const category = await this.getCategoryById(categoryId);
        if (!category) {
            throw new Error(`Категория с ID ${categoryId} не найдена`);
        }

        let allProducts = [];
        let totalProducts = 0;
        let minPrice = Infinity;
        let maxPrice = 0;

        for (let page = 1; page <= maxPages; page++) {
            const products = await this.fetchCategoryProducts(category, page);

            if (products.length === 0) break;

            allProducts = [...allProducts, ...products];

            products.forEach((product) => {
                const price = product.salePriceU ? product.salePriceU / 100 : 0;
                if (price > 0) {
                    minPrice = Math.min(minPrice, price);
                    maxPrice = Math.max(maxPrice, price);
                }
            });
        }

        return {
            category: category.name,
            total_products: allProducts.length,
            price_range: minPrice === Infinity ? null : { min: minPrice, max: maxPrice },
            average_rating: allProducts.reduce((sum, p) => sum + (p.rating || 0), 0) / allProducts.length,
            brands_count: new Set(allProducts.map((p) => p.brand)).size,
        };
    }
}

// Создание и экспорт инстанса по умолчанию
export const wildberriesApiService = new WildberriesApiService();

export default WildberriesApiService;
