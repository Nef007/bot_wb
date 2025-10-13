// services/wildberriesApiService.js
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { PriceMonitoringConfig } from './config.js';

export class WildberriesApiService {
    constructor() {
        this.jar = new CookieJar();
        this.axiosInstance = wrapper(
            axios.create({
                jar: this.jar,
                withCredentials: true,
                timeout: PriceMonitoringConfig.SCAN.REQUEST_TIMEOUT,
            })
        );

        this.setDefaultHeaders();
        this.setInitialCookies();
    }

    setDefaultHeaders() {
        this.axiosInstance.defaults.headers = {
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
    }

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
     * Получение товаров со страницы категории
     */
    async fetchCategoryProducts(category, page = 1) {
        try {
            const query = this.buildCategoryQuery(category);
            const queryId = this.generateQueryId();
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

            const fullUrl = this.constructFullUrl(url, params);
            console.log('📡 Запрос к Wildberries:', fullUrl);

            const response = await this.axiosInstance.get(url, {
                params,
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

            return this.extractProductsFromResponse(response.data);
        } catch (error) {
            console.error(`Ошибка запроса страницы ${page}:`, error.message);
            throw error;
        }
    }

    buildCategoryQuery(category) {
        if (category.search_query) {
            return category.search_query;
        }
        if (category.query && category.query.includes('menu_redirect_subject_v2')) {
            return category.query;
        }
        return `menu_redirect_subject_v2_${category.id} ${category.name}`;
    }

    generateQueryId() {
        const timestamp = Math.floor(Date.now() / 1000);
        return `qid${timestamp}${Math.random().toString().substring(2, 12)}`;
    }

    constructFullUrl(baseUrl, params) {
        const queryString = Object.keys(params)
            .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join('&');
        return `${baseUrl}?${queryString}`;
    }

    extractProductsFromResponse(data) {
        if (data?.data?.products) return data.data.products;
        if (data?.products) return data.products;
        if (Array.isArray(data)) return data;
        return [];
    }
}
