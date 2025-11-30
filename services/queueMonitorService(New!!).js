// services/queueMonitorService.js

import { telegramNotificationService } from './telegramNotificationService.js';

export class QueueMonitorService {
    constructor() {
        this.statsInterval = null;
    }

    /**
     * Запуск мониторинга очереди
     */
    startMonitoring(intervalMs = 30000) {
        this.statsInterval = setInterval(() => {
            const stats = telegramNotificationService.getStats();

            if (stats.totalInQueue > 0) {
                console.log(
                    `📊 Статистика очереди: ${stats.totalInQueue} сообщений, активна: ${stats.isActive}, недавно добавлено: ${stats.recentAdded}`
                );
            }
        }, intervalMs);

        console.log(`🔍 Мониторинг очереди запущен (интервал: ${intervalMs}мс)`);
    }

    /**
     * Остановка мониторинга
     */
    stopMonitoring() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
            console.log('🔍 Мониторинг очереди остановлен');
        }
    }

    /**
     * Получение детального статуса
     */
    getDetailedStatus() {
        const status = telegramNotificationService.getQueueStatus();

        return {
            ...status,
            timestamp: new Date().toISOString(),
            memoryUsage: process.memoryUsage(),
        };
    }
}

// Создаем и экспортируем экземпляр сервиса
export const queueMonitorService = new QueueMonitorService();
