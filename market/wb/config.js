// config/priceMonitoringConfig.js
export const PriceMonitoringConfig = {
    SCAN: {
        DELAY: 3000,
        MAX_PAGES: 2,
        DEFAULT_PAGES: 10,
        REQUEST_TIMEOUT: 20000,
        MONITORING_INTERVAL_MINUTES: 10,
    },
    PRICE: {
        CHANGE_THRESHOLD: 0.01, // Минимальное изменение цены для уведомления (1%)
    },
    IMAGE: {
        BASE_URL: 'https://basket-{host}.wbbasket.ru',
        HOST_RANGES: [
            { min: 0, max: 143, host: '01' },
            { min: 144, max: 287, host: '02' },
            { min: 288, max: 431, host: '03' },
            { min: 432, max: 719, host: '04' },
            { min: 720, max: 1007, host: '05' },
            { min: 1008, max: 1061, host: '06' },
            { min: 1062, max: 1115, host: '07' },
            { min: 1116, max: 1169, host: '08' },
            { min: 1170, max: 1313, host: '09' },
            { min: 1314, max: 1601, host: '10' },
            { min: 1602, max: 1655, host: '11' },
            { min: 1656, max: 1919, host: '12' },
            { min: 1920, max: 2045, host: '13' },
            { min: 2046, max: 2189, host: '14' },
            { min: 2190, max: 2405, host: '15' }, // исправлена опечатка (было 2170)
            { min: 2406, max: 2621, host: '16' },
            { min: 2622, max: 2837, host: '17' },
            { min: 2838, max: 3053, host: '18' },
            { min: 3054, max: 3269, host: '19' },
            { min: 3270, max: 3485, host: '20' },
            { min: 3486, max: 3701, host: '21' },
            { min: 3702, max: 3917, host: '22' },
            { min: 3918, max: 4133, host: '23' },
            { min: 4134, max: 4349, host: '24' },
            { min: 4350, max: Infinity, host: '25' },
        ],
    },
};
