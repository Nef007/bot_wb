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
