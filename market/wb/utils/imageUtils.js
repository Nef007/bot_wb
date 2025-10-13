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

            return `${baseUrl}/vol${vol}/part${part}/${nm}/images/big/1.jpg`;
        } catch (error) {
            console.error('Ошибка генерации URL изображения:', error);
            return '';
        }
    }
}
