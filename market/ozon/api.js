// services/ozonExactService.js
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

export class OzonApiService {
    constructor() {
        this.jar = new CookieJar();
        this.axiosInstance = wrapper(
            axios.create({
                jar: this.jar,
                withCredentials: true,
                timeout: 30000,
            })
        );

        this.setExactCookies();
    }

    /**
     * Устанавливаем точные cookies из работающего браузера
     */
    setExactCookies() {
        const baseUrl = 'https://www.ozon.ru';

        const exactCookies = [
            '__Secure-ext_xcid=9a81f97392cfd2fd344274964641fbcd; Domain=.ozon.ru; Path=/; Secure',
            '__Secure-ab-group=86; Domain=.ozon.ru; Path=/; Secure',
            '__Secure-user-id=0; Domain=.ozon.ru; Path=/; Secure',
            'abt_data=7.OC0IgejqtdLrIfjuhb1M9cyHxG2Juon7iqKJacKmI-9_ntDhVqkvjYYmQ8WmfDYANssqOiUmkz6UgDLai3l_btMtxYkhfcCKZVoza9eYgF-cGU6FhZRfSiWcYvRlEf13HakI0RQBaYkeAvmYfsAgmMBRRHgjqqgOiY2YtqPs8HM3oXoj7UcAGJYSUmAVBYQv7PGAqwOxHNqkIXXK9aF_NeqGnznoBQRt5XMi-E6TPwB-A25K9zKv2TEYW8xCiYtrBP9yOPfHk8R71YKAdYBWXcF3qemOJyN1dWeyD-YdUo09LHr8I17pvp0SD4lXbn6qmnTutw1EAeDAcQCk9IIrie0Z1De-EQQX9rj9ccJrsWLX7r8jrGHwKmmQ6OpA0Lc5zvg92E6W6c2lgUGIdSEtpjTdWqKBf2lwQXMl_ejJ1mbPhHNVBv0VoXAN4mSqA2yTEgwciNKy3MeMQJG8ozG_qGQ05f7Jr_YuNG8hLhJ3VEtRssg1wTjq9dC3ePgD_Eyl5ozmE2MRL7FbkI77zxSUMKvzp5uTSb-_yxBevNmSaiFmAeOKmUsvY_JlOzWg4vdaNWky-jxLVuuyrj2fP8Vh9VcstlBC1B1CoDH_smrpgKLxSGljAGSr3gB_0jxUBSNla3Hr-6WQ; Domain=.ozon.ru; Path=/; Secure',
            'ADDRESSBOOKBAR_WEB_CLARIFICATION=1760806155; Domain=.ozon.ru; Path=/; Secure',
            'is_cookies_accepted=1; Domain=.ozon.ru; Path=/; Secure',
            '__Secure-access-token=9.0.Fbu9uUENShaFZFD2ozis4w.86.Aa7w6kiVZ2eXKZrrUer1ydF46WfIwL6PJylmMZxqwhBerfuL0rZEQ3VARPYvt8bzWvtTcgTgf1A9dFaRPvgKmydJXWafRWNAj7vn00LCoUes..20251019170400.geQoYSUEiNktUgE0f6LP9x4b8nf1n5t6hbhPZ8ph39M.177e1417748dfb9d8; Domain=.ozon.ru; Path=/; Secure',
            'xcid=4cca506bc00973fabaa11f330bf52fad; Domain=.ozon.ru; Path=/; Secure',
        ];

        exactCookies.forEach((cookie) => {
            try {
                this.jar.setCookieSync(cookie, baseUrl);
            } catch (error) {
                // Игнорируем ошибки установки cookies
            }
        });
    }

    /**
     * Получаем категории
     */
    async fetchCategories() {
        try {
            const url =
                'https://www.ozon.ru/api/composer-api.bx/_action/v2/categoryChildV3?menuId=185&categoryId=15500';

            console.log('📡 Запрос категорий...');

            const response = await this.axiosInstance.get(url, {
                headers: this.getCommonHeaders(),
            });

            console.log('✅ Категории получены! Статус:', response.status);
            return this.parseCategories(response.data);
        } catch (error) {
            console.error('❌ Ошибка получения категорий:', error.message);
            throw error;
        }
    }

    /**
     * Парсинг категорий
     */
    parseCategories(data) {
        if (!data?.data?.columns) {
            console.warn('⚠️ Неожиданная структура данных:', data);
            return [];
        }

        const categories = [];

        data.data.columns.forEach((column) => {
            column.categories?.forEach((categoryGroup) => {
                const parentId = this.extractCategoryIdFromUrl(categoryGroup.url);

                // Родительская категория
                if (parentId) {
                    categories.push({
                        id: parentId,
                        name: categoryGroup.title,
                        full_name: categoryGroup.title,
                        url: categoryGroup.url,
                        image: categoryGroup.image,
                        parent_id: null,
                        has_children: true,
                        catalog_type: 'ozon',
                    });
                }

                // Дочерние категории
                categoryGroup.categories?.forEach((subCategory) => {
                    const childId = this.extractCategoryIdFromUrl(subCategory.url);
                    if (childId) {
                        categories.push({
                            id: childId,
                            name: subCategory.title,
                            full_name: `${categoryGroup.title} › ${subCategory.title}`,
                            url: subCategory.url,
                            image: subCategory.image,
                            parent_id: parentId,
                            has_children: false,
                            catalog_type: 'ozon',
                        });
                    }
                });
            });
        });

        console.log(`✅ Спарсено ${categories.length} категорий`);
        return categories;
    }

    /**
     * Получение товаров из категории
     */
    async fetchCategoryProducts(categoryUrl, page = 1) {
        try {
            const fullUrl = `https://www.ozon.ru${categoryUrl}`;
            const apiUrl = 'https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2';
            const encodedUrl = encodeURIComponent(`${fullUrl}?page=${page}`);

            console.log('📡 Запрос товаров:', categoryUrl, 'Страница:', page);

            const response = await this.axiosInstance.post(
                `${apiUrl}?url=${encodedUrl}`,
                {},
                {
                    headers: this.getApiHeaders(categoryUrl),
                }
            );

            return this.extractProductsFromPage(response.data);
        } catch (error) {
            console.error(`❌ Ошибка получения товаров:`, error.message);
            return [];
        }
    }

    /**
     * Получение детальной информации о товаре
     */
    async fetchProductDetail(productUrl) {
        try {
            const fullUrl = `https://www.ozon.ru${productUrl}`;
            const apiUrl = 'https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2';
            const encodedUrl = encodeURIComponent(fullUrl);

            console.log('📡 Запрос детальной информации о товаре:', productUrl);

            const response = await this.axiosInstance.get(`${apiUrl}?url=${encodedUrl}`, {
                headers: this.getApiHeaders(productUrl),
            });

            return this.extractProductDetail(response.data);
        } catch (error) {
            console.error(`❌ Ошибка получения детальной информации о товаре:`, error.message);
            return null;
        }
    }

    /**
     * Извлекаем товары из данных страницы
     */
    extractProductsFromPage(pageData) {
        try {
            const products = [];
            const widgetStates = pageData.widgetStates;

            for (const [key, value] of Object.entries(widgetStates)) {
                if (key.includes('tileGridDesktop') || key.includes('searchResultsV2')) {
                    try {
                        const gridData = typeof value === 'string' ? JSON.parse(value) : value;

                        if (gridData.items && Array.isArray(gridData.items)) {
                            gridData.items.forEach((item) => {
                                const product = this.parseProductItem(item);
                                if (product) {
                                    products.push(product);
                                }
                            });
                        }
                    } catch (parseError) {
                        console.warn('❌ Ошибка парсинга товаров:', parseError);
                    }
                }
            }

            console.log(`✅ Извлечено ${products.length} товаров`);
            return products;
        } catch (error) {
            console.error('❌ Ошибка извлечения товаров:', error);
            return [];
        }
    }

    /**
     * Парсим товар
     */
    parseProductItem(item) {
        try {
            const nmId = item.skuId || this.extractProductId(item);
            if (!nmId) {
                console.warn('⚠️ Товар без ID пропущен');
                return null;
            }

            const name = this.extractProductName(item);
            const product = {
                id: nmId,
                name: this.cleanProductName(name),
                current_price: this.extractProductPrice(item),
                rating: this.extractProductRating(item),
                feedbacks_count: this.extractProductFeedbacks(item),
                image_url: this.extractProductImage(item) || '',
                url: item.action?.link ? `https://www.ozon.ru${item.action.link}` : '',
                supplier: 'Ozon',
                created_at: new Date().toISOString(),
            };

            console.log(`✅ Товар спарсен: ${product.name} (${product.current_price} руб.)`);
            return product;
        } catch (error) {
            console.error('❌ Ошибка парсинга товара:', error);
            return null;
        }
    }

    /**
     * Извлечение детальной информации о товаре из данных страницы
     */
    extractProductDetail(pageData) {
        try {
            console.log('🔍 Анализ структуры страницы товара...');

            const widgetStates = pageData.widgetStates;
            const productDetail = {
                name: '',
                current_price: 0,
                id: '',
                rating: 0,
                feedbacks_count: 0,
                image_url: '',
                url: '',
                description: '',
            };

            // Базовая информация из SEO и pageInfo
            productDetail.id = pageData.pageInfo?.analyticsInfo?.sku?.toString() || '';
            if (pageData.seo?.title) {
                productDetail.name = pageData.seo.title.split(' купить')[0].trim();
            }

            // Извлечение данных из виджетов
            this.extractFromWidgets(widgetStates, productDetail);

            // Установка URL
            if (pageData.pageInfo?.url) {
                const cleanUrl = pageData.pageInfo.url.split('?')[0];
                productDetail.url = `https://www.ozon.ru${cleanUrl}`;
            }

            console.log('✅ Детальная информация о товаре извлечена');
            return productDetail;
        } catch (error) {
            console.error('❌ Ошибка извлечения детальной информации:', error);
            return null;
        }
    }

    /**
     * Извлечение данных из виджетов
     */
    extractFromWidgets(widgetStates, productDetail) {
        console.log('🔍 Начало извлечения данных из виджетов...');

        // Универсальный поиск названия
        const productName = this.extractProductNameUniversal(widgetStates);
        if (productName && !productDetail.name) {
            productDetail.name = productName;
            console.log('📝 Название найдено:', productName);
        }

        // Поиск цены
        productDetail.current_price = this.extractPriceUniversal(widgetStates);
        if (productDetail.current_price > 0) {
            console.log('💰 Цена найдена:', productDetail.current_price);
        }

        // Рейтинг и отзывы
        const ratingData = this.extractRatingUniversal(widgetStates);
        productDetail.rating = ratingData.rating;
        productDetail.feedbacks_count = ratingData.feedbacks_count;
        console.log('⭐ Рейтинг:', ratingData.rating, 'Отзывы:', ratingData.feedbacks_count);

        // Изображение
        productDetail.image_url = this.extractImageUniversal(widgetStates);
        if (productDetail.image_url) {
            console.log('🖼️ Изображение найдено');
        }

        console.log('✅ Завершено извлечение данных из виджетов');
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========

    /**
     * Извлечение данных о рейтинге и отзывах
     */
    extractRatingData(ratingWidget) {
        try {
            const widgetData = typeof ratingWidget === 'string' ? JSON.parse(ratingWidget) : ratingWidget;
            const result = { rating: 0, feedbacks_count: 0 };

            // Основные поля рейтинга
            if (widgetData.score !== undefined) result.rating = parseFloat(widgetData.score) || 0;
            if (widgetData.rating !== undefined) result.rating = parseFloat(widgetData.rating) || result.rating;
            if (widgetData.totalScore !== undefined) result.rating = parseFloat(widgetData.totalScore) || result.rating;

            // Количество отзывов
            if (widgetData.reviewsCount !== undefined) result.feedbacks_count = parseInt(widgetData.reviewsCount) || 0;
            if (widgetData.feedbackCount !== undefined)
                result.feedbacks_count = parseInt(widgetData.feedbackCount) || result.feedbacks_count;

            return result;
        } catch (error) {
            console.warn('❌ Ошибка извлечения рейтинга:', error);
            return { rating: 0, feedbacks_count: 0 };
        }
    }

    /**
     * Извлечение данных о цене
     */
    extractPriceData(priceWidget) {
        try {
            const widgetData = typeof priceWidget === 'string' ? JSON.parse(priceWidget) : priceWidget;

            if (widgetData.price) {
                return parseInt(widgetData.price.replace(/[^\d]/g, '')) || 0;
            }
            if (widgetData.currentPrice) {
                return parseInt(widgetData.currentPrice.replace(/[^\d]/g, '')) || 0;
            }
            if (widgetData.priceValue) {
                return parseInt(widgetData.priceValue) || 0;
            }

            return 0;
        } catch (error) {
            console.warn('❌ Ошибка извлечения цены:', error);
            return 0;
        }
    }

    /**
     * Извлечение изображения товара
     */
    extractImageData(galleryWidget) {
        try {
            const widgetData = typeof galleryWidget === 'string' ? JSON.parse(galleryWidget) : galleryWidget;

            if (widgetData.mainImage) return widgetData.mainImage;
            if (widgetData.images?.[0]) return widgetData.images[0];
            if (widgetData.items?.[0]?.image) return widgetData.items[0].image;

            return '';
        } catch (error) {
            console.warn('❌ Ошибка извлечения изображения:', error);
            return '';
        }
    }

    // ========== МЕТОДЫ ДЛЯ ПАРСИНГА ТОВАРОВ ИЗ СПИСКА ==========

    extractProductName(item) {
        try {
            if (item.mainState) {
                for (const state of item.mainState) {
                    if (state.type === 'textAtom' && state.textAtom?.text) {
                        return state.textAtom.text;
                    }
                }
            }
            return item.name || 'Неизвестный товар';
        } catch (error) {
            return 'Неизвестный товар';
        }
    }

    extractProductPrice(item) {
        try {
            if (item.mainState) {
                for (const state of item.mainState) {
                    if (state.type === 'priceV2' && state.priceV2?.price) {
                        const priceData = state.priceV2.price.find((p) => p.textStyle === 'PRICE');
                        if (priceData?.text) {
                            return parseInt(priceData.text.replace(/[^\d]/g, ''));
                        }
                    }
                }
            }
            return 0;
        } catch (error) {
            return 0;
        }
    }

    extractProductId(item) {
        return item.sku || item.nmId || null;
    }

    extractProductImage(item) {
        try {
            if (item.tileImage?.items?.[0]?.image?.link) {
                return item.tileImage.items[0].image.link;
            }
            return '';
        } catch (error) {
            return '';
        }
    }

    extractProductRating(item) {
        try {
            if (item.mainState) {
                for (const state of item.mainState) {
                    if (state.type === 'labelList' && state.labelList?.items) {
                        for (const label of state.labelList.items) {
                            if (label.icon?.image === 'ic_s_star_filled_compact' && label.title) {
                                const ratingMatch = label.title.match(/(\d+\.\d+)/);
                                if (ratingMatch) return parseFloat(ratingMatch[1]);

                                const simpleRatingMatch = label.title.match(/(\d+)/);
                                if (simpleRatingMatch) return parseFloat(simpleRatingMatch[1]);
                            }
                        }
                    }
                }
            }
            return 0;
        } catch (error) {
            return 0;
        }
    }

    extractProductFeedbacks(item) {
        try {
            if (item.mainState) {
                for (const state of item.mainState) {
                    if (state.type === 'labelList' && state.labelList?.items) {
                        for (const label of state.labelList.items) {
                            if (label.icon?.image === 'ic_s_dialog_filled_compact' && label.title) {
                                const feedbacksText = label.title
                                    .replace(/[^\d\s]/g, '')
                                    .replace(/\s/g, '')
                                    .replace(/ /g, '');

                                if (feedbacksText) {
                                    return parseInt(feedbacksText) || 0;
                                }
                            }
                        }
                    }
                }
            }
            return 0;
        } catch (error) {
            return 0;
        }
    }

    // ========== УТИЛИТЫ ==========

    /**
     * Извлечение ID категории из URL
     */
    extractCategoryIdFromUrl(url) {
        if (!url) return null;

        const patterns = [/\/(\d+)\/?$/, /-(\d+)\/?$/, /\?categoryId=(\d+)/];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return parseInt(match[1]);
        }

        return null;
    }

    /**
     * Очистка названия товара от HTML entities
     */
    cleanProductName(name) {
        if (!name) return '';

        return name
            .replace(/&#x2F;/g, '/')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();
    }

    generatePageViewId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c == 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    getCommonHeaders() {
        return {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'ru,en;q=0.9',
            'User-Agent':
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 YaBrowser/25.8.0.0 Safari/537.36',
            'Cache-Control': 'max-age=0',
        };
    }

    getApiHeaders(referer) {
        return {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'User-Agent':
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 YaBrowser/25.8.0.0 Safari/537.36',
            Referer: `https://www.ozon.ru${referer}`,
            'x-o3-app-name': 'dweb_client',
            'x-o3-app-version': 'release_17-9-2025_b59001d9',
            'x-page-view-id': this.generatePageViewId(),
        };
    }

    /**
     * Получение всех товаров из категории (с пагинацией)
     */
    async fetchAllCategoryProducts(categoryUrl, maxPages = 1) {
        const allProducts = [];

        for (let page = 1; page <= maxPages; page++) {
            console.log(`📄 Загрузка страницы ${page}...`);

            const products = await this.fetchCategoryProducts(categoryUrl, page);

            if (!products || products.length === 0) {
                console.log('🏁 Больше товаров нет');
                break;
            }

            allProducts.push(...products);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        console.log(`🎯 Всего загружено товаров: ${allProducts.length}`);

        const productsWithoutPrice = allProducts.filter((product) => product.current_price === 0);

        console.log('🚨 Товары без цены:');
        productsWithoutPrice.forEach((product) => {
            console.log(`📱 ${product.name}`);
            console.log(`🆔 ID: ${product.id}`);
            console.log(`🔗 URL: ${product.url || `https://www.ozon.ru/product/${product.id}/`}`);
            console.log('─'.repeat(50));
        });
        return allProducts;
    }

    // ========== УНИВЕРСАЛЬНЫЕ МЕТОДЫ ПОИСКА ==========

    extractProductNameUniversal(widgetStates) {
        console.log('🔍 Универсальный поиск названия товара...');

        const possibleNameWidgets = [
            'webProductHeading',
            'webProductMainWidget',
            'webPrice',
            'webGallery',
            'webBrand',
            'webShortCharacteristics',
        ];

        for (const [widgetKey, widgetValue] of Object.entries(widgetStates)) {
            try {
                const widgetData = typeof widgetValue === 'string' ? JSON.parse(widgetValue) : widgetValue;
                const name = this.findNameInWidget(widgetData, widgetKey);

                if (name && this.isValidProductName(name)) {
                    console.log(`🎯 Название найдено в ${widgetKey}:`, name);
                    return name;
                }
            } catch (error) {
                // Игнорируем ошибки парсинга
            }
        }

        // Если не нашли в виджетах, используем SEO title
        return this.extractNameFromSeo(widgetStates);
    }

    findNameInWidget(widgetData, widgetKey) {
        // Прямые поля с названием
        const directFields = ['title', 'productName', 'name', 'heading', 'text'];

        for (const field of directFields) {
            if (widgetData[field] && typeof widgetData[field] === 'string') {
                return widgetData[field];
            }
        }

        // Поиск в текстовых массивах
        if (widgetData.text && Array.isArray(widgetData.text)) {
            for (const textItem of widgetData.text) {
                if (textItem.content && typeof textItem.content === 'string') {
                    return textItem.content;
                }
            }
        }

        // Поиск в state виджета
        if (widgetData.state && Array.isArray(widgetData.state)) {
            for (const state of widgetData.state) {
                if (state.type === 'text' && state.text?.content) {
                    return state.text.content;
                }
                if (state.textAtom?.text) {
                    return state.textAtom.text;
                }
            }
        }

        // Для виджета цены
        if (widgetKey.includes('webPrice') && widgetData.productName) {
            return widgetData.productName;
        }

        // Для виджета галереи
        if (widgetKey.includes('webGallery') && widgetData.items?.[0]?.alt) {
            return widgetData.items[0].alt.split(' #')[0];
        }

        return null;
    }

    /**
     * Извлечение названия из SEO данных
     */
    extractNameFromSeo(widgetStates) {
        for (const [widgetKey, widgetValue] of Object.entries(widgetStates)) {
            if (widgetKey.includes('seo') || widgetKey.includes('Seo') || widgetKey.includes('SEO')) {
                try {
                    const widgetData = typeof widgetValue === 'string' ? JSON.parse(widgetValue) : widgetValue;
                    if (widgetData.title) {
                        const cleanTitle = widgetData.title
                            .split(' купить')[0]
                            .split(' цена')[0]
                            .split(' отзывы')[0]
                            .trim();
                        console.log('🎯 Название из SEO:', cleanTitle);
                        return cleanTitle;
                    }
                } catch (error) {
                    // Игнорируем ошибки
                }
            }
        }
        return null;
    }

    /**
     * Проверка валидности названия товара
     */
    isValidProductName(name) {
        if (!name || typeof name !== 'string') return false;

        const cleanName = name.trim();
        if (cleanName.length < 5 || cleanName.length > 200) return false;

        const invalidPatterns = [
            'о товаре',
            'характеристики',
            'отзывы',
            'цена',
            'undefined',
            'null',
            'перейти',
            'описанию',
            'купить',
            'заказать',
        ];

        const lowerName = cleanName.toLowerCase();
        if (invalidPatterns.some((pattern) => lowerName.includes(pattern))) {
            return false;
        }

        return true;
    }

    extractPriceUniversal(widgetStates) {
        for (const [widgetKey, widgetValue] of Object.entries(widgetStates)) {
            if (widgetKey.includes('Price') || widgetKey.includes('price')) {
                try {
                    const widgetData = typeof widgetValue === 'string' ? JSON.parse(widgetValue) : widgetValue;
                    return this.extractPriceData(widgetData);
                } catch (error) {
                    // Игнорируем ошибки
                }
            }
        }
        return 0;
    }

    /**
     * Универсальный поиск рейтинга
     */
    extractRatingUniversal(widgetStates) {
        for (const [widgetKey, widgetValue] of Object.entries(widgetStates)) {
            if (
                widgetKey.includes('Review') ||
                widgetKey.includes('review') ||
                widgetKey.includes('Rating') ||
                widgetKey.includes('rating')
            ) {
                try {
                    const widgetData = typeof widgetValue === 'string' ? JSON.parse(widgetValue) : widgetValue;
                    return this.extractRatingData(widgetData);
                } catch (error) {
                    // Игнорируем ошибки
                }
            }
        }
        return { rating: 0, feedbacks_count: 0 };
    }

    /**
     * Универсальный поиск изображения
     */
    extractImageUniversal(widgetStates) {
        for (const [widgetKey, widgetValue] of Object.entries(widgetStates)) {
            if (
                widgetKey.includes('Gallery') ||
                widgetKey.includes('gallery') ||
                widgetKey.includes('Image') ||
                widgetKey.includes('image')
            ) {
                try {
                    const widgetData = typeof widgetValue === 'string' ? JSON.parse(widgetValue) : widgetValue;
                    const image = this.extractImageData(widgetData);
                    if (image) return image;
                } catch (error) {
                    // Игнорируем ошибки
                }
            }
        }
        return '';
    }
}
