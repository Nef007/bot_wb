// services/baseMonitoringService.js
export class BaseMonitoringService {
    constructor(serviceName) {
        this.serviceName = serviceName;
        this.isRunning = false;
    }

    /**
     * Запуск мониторинга
     */
    async startMonitoring() {
        throw new Error('Method startMonitoring() must be implemented');
    }

    /**
     * Остановка мониторинга
     */
    async stopMonitoring() {
        this.isRunning = false;
    }

    /**
     * Получение статуса сервиса
     */
    getStatus() {
        return {
            serviceName: this.serviceName,
            isRunning: this.isRunning,
        };
    }
}
