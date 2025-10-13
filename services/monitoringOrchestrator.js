// services/monitoringOrchestrator.js
import { WBPriceMonitoringService } from '../market/wb/monitoringService.js';
import { OzonPriceMonitoringService } from '../market/ozon/monitoringService.js';

export class MonitoringOrchestrator {
    constructor() {
        this.monitoringServices = new Map();
        this.monitoringInterval = null;

        this.registerDefaultServices();
    }

    registerDefaultServices() {
        // Wildberries (основной сервис)
        this.registerService('wildberries', new WBPriceMonitoringService());

        // Ozon (можно закомментировать, если пока не нужен)
        this.registerService('ozon', new OzonPriceMonitoringService());

        console.log(`✅ Зарегистрировано сервисов: ${this.monitoringServices.size}`);
    }

    /**
     * Регистрация нового сервиса мониторинга
     */
    registerService(serviceKey, serviceInstance) {
        if (this.monitoringServices.has(serviceKey)) {
            console.warn(`⚠️ Сервис '${serviceKey}' уже зарегистрирован`);
            return false;
        }

        this.monitoringServices.set(serviceKey, serviceInstance);
        console.log(`✅ Зарегистрирован сервис: ${serviceKey}`);
        return true;
    }

    /**
     * Запуск периодического мониторинга
     */
    startPeriodicMonitoring() {
        const intervalMs = 10 * 60 * 1000; // 10 минут

        console.log(`⏰ Запуск периодического мониторинга (каждые 10 минут)`);

        // Запускаем сразу при старте
        this.startAllMonitoring();

        // Затем по расписанию
        this.monitoringInterval = setInterval(() => {
            console.log(`\n🔄 Запуск мониторинга по расписанию...`);
            this.startAllMonitoring();
        }, intervalMs);
    }

    async startAllMonitoring() {
        // Проверяем, не запущен ли уже какой-либо мониторинг
        if (this.isAnyMonitoringRunning()) {
            console.log('⏭️ Один из сервисов уже запущен, пропускаем...');
            return;
        }

        console.log(`🚀 Запуск всех сервисов мониторинга (${this.monitoringServices.size})...`);

        // Запускаем все сервисы параллельно
        const monitoringPromises = Array.from(this.monitoringServices.entries()).map(async ([serviceKey, service]) => {
            try {
                console.log(`🔄 Запуск ${serviceKey}...`);
                await service.startMonitoring();
            } catch (error) {
                console.error(`❌ Ошибка в сервисе ${serviceKey}:`, error.message);
            }
        });

        await Promise.allSettled(monitoringPromises);
        console.log('✅ Все сервисы мониторинга завершены');
    }

    stopAllMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        this.monitoringServices.forEach((service, serviceKey) => {
            if (service.isRunning) {
                service.stopMonitoring();
                console.log(`🛑 Остановлен сервис: ${serviceKey}`);
            }
        });

        console.log('🛑 Все сервисы мониторинга остановлены');
    }

    /**
     * Проверка, запущен ли какой-либо мониторинг
     */
    isAnyMonitoringRunning() {
        return Array.from(this.monitoringServices.values()).some((service) => service.isRunning);
    }

    /**
     * Получение статуса всех сервисов
     */
    getStatus() {
        const servicesStatus = {};
        let totalRunning = 0;

        this.monitoringServices.forEach((service, serviceKey) => {
            servicesStatus[serviceKey] = service.getStatus();
            if (service.isRunning) totalRunning++;
        });

        return {
            totalServices: this.monitoringServices.size,
            runningServices: totalRunning,
            isAnyRunning: this.isAnyMonitoringRunning(),
            hasScheduledMonitoring: !!this.monitoringInterval,
            services: servicesStatus,
        };
    }

    /**
     * Получение статуса конкретного сервиса
     */
    getServiceStatus(serviceKey) {
        const service = this.monitoringServices.get(serviceKey);
        return service ? service.getStatus() : null;
    }

    /**
     * Получение списка всех зарегистрированных сервисов
     */
    getRegisteredServices() {
        return Array.from(this.monitoringServices.keys());
    }
}

// Создаем и экспортируем экземпляр сервиса
export const monitoringOrchestrator = new MonitoringOrchestrator();
