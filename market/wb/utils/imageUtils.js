import { PriceMonitoringConfig } from '../config.js';

export class ImageUtils {
    /**
     * Генерация URL изображения товара
     */
    static getProductImageUrl(productId) {
        if (!productId) return '';

        try {
            const nm = parseInt(productId, 10);
            if (isNaN(nm)) return '';

            const vol = Math.floor(nm / 1e5);
            const part = Math.floor(nm / 1e3);

            const hostConfig = PriceMonitoringConfig.IMAGE.HOST_RANGES.find(
                (range) => vol >= range.min && vol <= range.max
            );

            const host = hostConfig?.host || '01';
            const baseUrl = PriceMonitoringConfig.IMAGE.BASE_URL.replace('{host}', host);

            // Пробуем разные форматы изображений
            const formats = [
                '/images/c516x688/1.jpg', // Основной формат
                '/images/big/1.webp', // WebP формат
                '/images/c246x328/1.jpg', // Маленькое изображение
            ];

            // Возвращаем основной формат (jpg)
            return `${baseUrl}/vol${vol}/part${part}/${nm}${formats[0]}`;
        } catch (error) {
            console.error('Ошибка генерации URL изображения:', error);
            return '';
        }
    }

    static getAllImageUrls(productId) {
        if (!productId) return [];

        try {
            const nm = parseInt(productId, 10);
            if (isNaN(nm)) return [];

            const vol = Math.floor(nm / 1e5);
            const part = Math.floor(nm / 1e3);

            const hostConfig = PriceMonitoringConfig.IMAGE.HOST_RANGES.find(
                (range) => vol >= range.min && vol <= range.max
            );

            const host = hostConfig?.host || '01';
            const baseUrl = PriceMonitoringConfig.IMAGE.BASE_URL.replace('{host}', host);

            const formats = [
                '/images/c516x688/1.jpg',
                '/images/big/1.webp',
                '/images/c246x328/1.jpg',
                '/images/c516x688/2.jpg', // Второе изображение
            ];

            return formats.map((format) => `${baseUrl}/vol${vol}/part${part}/${nm}${format}`);
        } catch (error) {
            console.error('Ошибка генерации URL изображений:', error);
            return [];
        }
    }
}
