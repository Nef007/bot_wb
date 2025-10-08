import axios from 'axios';

export class WildberriesAbstractAPI {
    constructor(options = {}) {
        this.baseURL = options.baseURL || 'https://catalog.wb.ru';
        this.basketURL = options.basketURL || 'https://basket-{host}.wbbasket.ru';
        this.timeout = options.timeout || 30000;
        this.retryDelay = options.retryDelay || 1000;
        this.maxRetries = options.maxRetries || 3;

        // Создаем экземпляр axios с базовыми настройками
        this.client = axios.create({
            timeout: this.timeout,
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Referer: 'https://www.wildberries.ru/',
            },
        });
    }

    async request(method, url, opts = {}, retryCount = 0) {
        try {
            const config = {
                method: method.toLowerCase(),
                url: url,
                headers: opts.headers || {},
                params: opts.qs || {},
                data: opts.form || opts.body,
            };

            const response = await this.client.request(config);
            return response.data;
        } catch (error) {
            if (error.response?.status === 429 && retryCount < this.maxRetries) {
                // Rate limiting - ждем и повторяем
                await this.sleep(this.retryDelay * (retryCount + 1));
                return this.request(method, url, opts, retryCount + 1);
            }
            this.handleError(error);
        }
    }

    handleError(error) {
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;

            switch (status) {
                case 404:
                    throw new Error('Ресурс не найден');
                case 429:
                    throw new Error('Слишком много запросов. Попробуйте позже.');
                case 500:
                    throw new Error('Внутренняя ошибка сервера Wildberries');
                default:
                    throw new Error(`API Error (${status}): ${data?.message || 'Unknown error'}`);
            }
        } else if (error.request) {
            throw new Error(`Network error: ${error.code || 'No response'}`);
        } else {
            throw new Error(`Request configuration error: ${error.message}`);
        }
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Вспомогательные методы для работы с WB
    makeProductImageUrl(productId) {
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
        else if (vol >= 1920 && vol <= 2045) host = '13';
        else if (vol >= 2046 && vol <= 2189) host = '14';
        else if (vol >= 2170 && vol <= 2405) host = '15';
        else if (vol >= 2406 && vol <= 2621) host = '16';
        else if (vol >= 2622 && vol <= 2837) host = '17';
        else host = '18';

        return `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${nm}`;
    }

    buildCatalogUrl(catalog, page = 1, sort = 'popular') {
        const baseUrls = {
            men_clothes6: 'https://catalog.wb.ru/catalog/men_clothes6/v2/catalog',
            women_clothes: 'https://catalog.wb.ru/catalog/women_clothes/v2/catalog',
            electronics: 'https://catalog.wb.ru/catalog/electronic/v2/catalog',
            // Добавьте другие каталоги по необходимости
        };

        const baseUrl = baseUrls[catalog] || 'https://catalog.wb.ru/catalog/men_clothes6/v2/catalog';

        return `${baseUrl}?ab_testing=false&appType=1&curr=rub&dest=-1255987&page=${page}&sort=${sort}&spp=30`;
    }
}
