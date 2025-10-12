// utils/priceUtils.js
export class PriceUtils {
    /**
     * Расчет изменения цены в процентах
     */
    static calculatePriceChange(oldPrice, newPrice) {
        if (!oldPrice || oldPrice === 0) return 0;
        const change = ((newPrice - oldPrice) / oldPrice) * 100;
        return Math.round(change * 100) / 100;
    }

    /**
     * Конвертация цены из формата WB (копейки) в рубли
     */
    static convertPriceToRubles(priceU) {
        return priceU ? Math.round(priceU / 100) : 0;
    }

    /**
     * Проверка значимости изменения цены
     */
    static isPriceChangeSignificant(oldPrice, newPrice, threshold = 0.01) {
        if (!oldPrice || oldPrice === 0) return false;
        const change = Math.abs((newPrice - oldPrice) / oldPrice);
        return change >= threshold;
    }
}

// utils/imageUtils.js
import { PriceMonitoringConfig } from '../config/priceMonitoringConfig.js';

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
