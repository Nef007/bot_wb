// services/telegramNotificationService.js

export class TelegramNotificationService {
    constructor() {
        this.messageQueue = [];
        this.isProcessing = false;
        this.sendInterval = 300; // ms
        this.maxRetries = 3;
    }

    /**
     * Добавление сообщения в очередь
     */
    addToQueue(messageData) {
        this.messageQueue.push({
            ...messageData,
            retryCount: 0,
            addedAt: Date.now(),
        });

        // Запускаем обработку если еще не запущена
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    /**
     * Добавление нескольких сообщений в очередь
     */
    addMultipleToQueue(messages) {
        messages.forEach((message) => {
            this.messageQueue.push({
                ...message,
                retryCount: 0,
                addedAt: Date.now(),
            });
        });

        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    /**
     * Обработка очереди сообщений
     */
    async processQueue() {
        if (this.isProcessing || this.messageQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.messageQueue.length > 0) {
            const message = this.messageQueue[0]; // Берем первое сообщение без удаления

            try {
                await this.sendMessage(message);

                // Успешно отправлено - удаляем из очереди
                this.messageQueue.shift();

                // Задержка перед следующим сообщением
                if (this.messageQueue.length > 0) {
                    await this.delay(this.sendInterval);
                }
            } catch (error) {
                console.error(`❌ Ошибка отправки сообщения:`, error.message);

                // Увеличиваем счетчик попыток
                message.retryCount++;

                if (message.retryCount >= this.maxRetries) {
                    console.error(`❌ Превышено количество попыток для сообщения:`, message);
                    this.messageQueue.shift(); // Удаляем сообщение после исчерпания попыток
                } else {
                    // Перемещаем сообщение в конец очереди для повторной попытки
                    this.messageQueue.push(this.messageQueue.shift());

                    // Увеличиваем задержку перед повторной попыткой
                    await this.delay(this.sendInterval * 2);
                }
            }
        }

        this.isProcessing = false;
    }

    /**
     * Отправка сообщения через Telegram Bot API
     */
    async sendMessage(messageData) {
        const { bot, chatId, text, options = {} } = messageData;

        if (!bot || !chatId || !text) {
            throw new Error('Отсутствуют обязательные параметры: bot, chatId или text');
        }

        try {
            await bot.api.sendMessage(chatId, text, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...options,
            });

            console.log(`✅ Сообщение отправлено пользователю ${chatId}`);
        } catch (error) {
            // Обрабатываем специфичные ошибки Telegram API
            if (error.description && error.description.includes('Too Many Requests')) {
                console.log('⚠️ Превышен лимит запросов, увеличиваем задержку');
                await this.delay(1000); // Увеличиваем задержку при лимите
                throw error; // Пробрасываем для повторной попытки
            }

            if (error.description && error.description.includes('bot was blocked')) {
                console.log(`❌ Бот заблокирован пользователем ${chatId}`);
                throw new Error('BOT_BLOCKED'); // Специальная ошибка для блокировки
            }

            throw error;
        }
    }

    /**
     * Статус очереди
     */
    getQueueStatus() {
        return {
            queueLength: this.messageQueue.length,
            isProcessing: this.isProcessing,
            nextMessage: this.messageQueue[0] || null,
        };
    }

    /**
     * Очистка очереди
     */
    clearQueue() {
        this.messageQueue = [];
        console.log('🧹 Очередь сообщений очищена');
    }

    /**
     * Получение статистики
     */
    getStats() {
        const now = Date.now();
        const recentMessages = this.messageQueue.filter((msg) => now - msg.addedAt < 60000); // Сообщения добавленные за последнюю минуту

        return {
            totalInQueue: this.messageQueue.length,
            recentAdded: recentMessages.length,
            isActive: this.isProcessing,
            sendInterval: this.sendInterval,
        };
    }

    /**
     * Изменение интервала отправки
     */
    setSendInterval(intervalMs) {
        this.sendInterval = intervalMs;
        console.log(`⏱️ Интервал отправки изменен на ${intervalMs}мс`);
    }

    /**
     * Задержка выполнения
     */
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

// Создаем и экспортируем экземпляр сервиса
export const telegramNotificationService = new TelegramNotificationService();
