export class ProductApiService {
    constructor() {}

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
}

export const productApiService = new ProductApiService();
