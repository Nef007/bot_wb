import axios from 'axios';
import { ImageUtils } from '../market/wb/utils/imageUtils.js';

export class ProductApiService {
    constructor() {
        this.baseUrl = 'https://u-card.wb.ru/cards/v4/detail';
    }

    /**
     * Получить информацию о товаре по артикулу
     */
    async fetchProductByNmId(nmId) {
        try {
            console.log(`📡 Запрашиваем информацию о товаре ${nmId}...`);

            const response = await axios.get(this.baseUrl, {
                params: {
                    appType: 1,
                    curr: 'rub',
                    dest: -1257786,
                    spp: 30,
                    hide_dtype: 11,
                    ab_testing: false,
                    lang: 'ru',
                    nm: nmId,
                },
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Accept: 'application/json',
                },
            });

            if (!response.data?.products?.[0]) {
                throw new Error('Товар не найден');
            }

            const productData = response.data.products[0];
            console.log(`✅ Получена информация о товаре: ${productData.name}`);

            return this.normalizeProductData(productData);
        } catch (error) {
            console.error(`❌ Ошибка получения товара ${nmId}:`, error.message);
            throw new Error('Не удалось получить информацию о товаре');
        }
    }

    getProductImageUrl(nmId) {
        try {
            // Используем ваш существующий метод
            const imageUrl = ImageUtils.getProductImageUrl(nmId);
            console.log(`🖼️ Сгенерирован URL изображения: ${imageUrl}`);
            return imageUrl;
        } catch (error) {
            console.error('❌ Ошибка генерации URL изображения:', error);
            return null;
        }
    }

    /**
     * Нормализация данных товара
     */
    async normalizeProductData(productData) {
        const price = this.extractProductPrice(productData);
        const priceInRubles = Math.round(price / 100);

        // Ищем рабочее изображение
        const validImageUrl = await this.findWorkingImageUrl(productData.id);

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
     * Получить URL изображения товара
     */
    getProductImageUrl(nmId) {
        // Логика получения URL изображения (аналогично существующей в monitoringService)
        const basket = Math.floor(nmId / 1e5);
        const vol = Math.floor(basket / 1e3);

        return `https://basket-0${Math.floor(
            vol / 1000
        )}.wbbasket.ru/vol${vol}/part${basket}/${nmId}/images/c246x328/1.jpg`;
    }

    /**
     * Извлечь nmId из URL товара
     */
    extractNmIdFromUrl(url) {
        try {
            console.log(`🔍 Парсим URL: ${url}`);

            let nmId = null;

            // Вариант 1: /catalog/123456789/detail.aspx
            const catalogMatch = url.match(/catalog\/(\d+)\/detail/);
            if (catalogMatch && catalogMatch[1]) {
                nmId = parseInt(catalogMatch[1]);
            }

            // Вариант 2: Параметр nm= в ссылке
            if (!nmId) {
                const nmMatch = url.match(/[?&]nm=(\d+)/);
                if (nmMatch && nmMatch[1]) {
                    nmId = parseInt(nmMatch[1]);
                }
            }

            // Вариант 3: Короткие ссылки WB
            if (!nmId) {
                const shortMatch = url.match(/\/(\d+)\/?$/);
                if (shortMatch && shortMatch[1]) {
                    nmId = parseInt(shortMatch[1]);
                }
            }

            // Вариант 4: Прямой артикул (если пользователь ввел просто цифры)
            if (!nmId) {
                const digitsOnly = url.match(/^(\d+)$/);
                if (digitsOnly && digitsOnly[1]) {
                    nmId = parseInt(digitsOnly[1]);
                }
            }

            if (!nmId || isNaN(nmId)) {
                throw new Error('Не удалось извлечь артикул товара из ссылки');
            }

            console.log(`✅ Извлечен nmId: ${nmId}`);
            return nmId;
        } catch (error) {
            console.error('❌ Ошибка извлечения nmId:', error);
            throw new Error('Не удалось извлечь артикул из ссылки');
        }
    }

    async validateImageUrl(imageUrl) {
        try {
            if (!imageUrl) return false;

            // Telegram не принимает webp, поэтому пропускаем их
            if (imageUrl.includes('.webp')) {
                console.log(`🖼️ Пропускаем webp изображение: ${imageUrl}`);
                return false;
            }

            const response = await axios.head(imageUrl, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            });

            const isValid = response.status === 200 && response.headers['content-type']?.includes('image');

            console.log(`🖼️ Проверка изображения ${imageUrl}: ${isValid ? 'VALID' : 'INVALID'}`);
            return isValid;
        } catch (error) {
            console.log(`🖼️ Изображение недоступно: ${imageUrl}`);
            return false;
        }
    }

    /**
     * Найти рабочее изображение для товара
     */
    async findWorkingImageUrl(nmId) {
        try {
            const allUrls = ImageUtils.getAllImageUrls(nmId);

            for (const url of allUrls) {
                if (await this.validateImageUrl(url)) {
                    console.log(`✅ Найдено рабочее изображение: ${url}`);
                    return url;
                }
            }

            console.log(`❌ Не найдено рабочих изображений для товара ${nmId}`);
            return null;
        } catch (error) {
            console.error(`❌ Ошибка поиска изображения для ${nmId}:`, error);
            return null;
        }
    }
}

export const productApiService = new ProductApiService();
