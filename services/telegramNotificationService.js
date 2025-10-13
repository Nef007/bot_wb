// services/telegramNotificationService.js
export class TelegramNotificationService {
    constructor(bot) {
        this.messageQueue = [];
        this.isProcessing = false;
        this.sendInterval = 300; // ms
        this.maxRetries = 3;
        this.bot = bot;
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
            const message = this.messageQueue[0];

            try {
                // Отправляем сообщение с фото или без
                if (message.image_url) {
                    await this.sendPhotoMessage(message);
                } else {
                    await this.sendTextMessage(message);
                }

                // Успешно отправлено - удаляем из очереди
                this.messageQueue.shift();

                // Задержка перед следующим сообщением
                if (this.messageQueue.length > 0) {
                    await this.delay(this.sendInterval);
                }
            } catch (error) {
                console.error(`❌ Ошибка отправки сообщения:`, error.message);

                message.retryCount++;

                if (message.retryCount >= this.maxRetries) {
                    console.error(`❌ Превышено количество попыток для сообщения:`, message);
                    this.messageQueue.shift();
                } else {
                    this.messageQueue.push(this.messageQueue.shift());
                    await this.delay(this.sendInterval * 2);
                }
            }
        }

        this.isProcessing = false;
    }

    /**
     * Отправка сообщения с фото
     */
    async sendPhotoMessage(messageData) {
        const { chatId, text, image_url, options = {} } = messageData;

        if (!chatId || !text || !image_url) {
            throw new Error('Отсутствуют обязательные параметры: chatId, text или image_url');
        }

        try {
            await this.bot.api.sendPhoto(chatId, image_url, {
                caption: text,
                parse_mode: 'HTML',
                ...options,
            });

            console.log(`✅ Сообщение с фото отправлено пользователю ${chatId}`);
        } catch (error) {
            // Если не удалось отправить с фото, пробуем отправить текстовое сообщение
            if (
                error.description &&
                (error.description.includes('failed to get HTTP URL content') ||
                    error.description.includes('wrong file identifier') ||
                    error.description.includes('unsupported URL protocol'))
            ) {
                console.log('⚠️ Не удалось загрузить фото, пробуем конвертировать ссылку');

                // Пробуем конвертировать .webp в .jpg
                const convertedUrl = this.convertToWbFormat(image_url);

                if (convertedUrl !== image_url) {
                    try {
                        await this.bot.api.sendPhoto(chatId, convertedUrl, {
                            caption: text,
                            parse_mode: 'HTML',
                            ...options,
                        });
                        console.log(`✅ Сообщение с конвертированным фото отправлено пользователю ${chatId}`);
                        return;
                    } catch (secondError) {
                        console.log('⚠️ Не удалось отправить с конвертированным фото, отправляем текстовое сообщение');
                    }
                }

                await this.sendTextMessage(messageData);
                return;
            }

            if (error.description && error.description.includes('Too Many Requests')) {
                console.log('⚠️ Превышен лимит запросов, увеличиваем задержку');
                await this.delay(1000);
                throw error;
            }

            if (error.description && error.description.includes('bot was blocked')) {
                console.log(`❌ Бот заблокирован пользователем ${chatId}`);
                throw new Error('BOT_BLOCKED');
            }

            throw error;
        }
    }

    convertToWbFormat(url) {
        if (!url) return url;

        // Заменяем images/big/ на images/hq/ и .jpg на .webp
        const convertedUrl = url.replace(/images\/big\//i, 'images/hq/').replace(/\.jpg($|\?)/i, '.webp$1');

        // Если URL изменился, логируем это
        if (convertedUrl !== url) {
            console.log(`🔄 Конвертирован URL: ${url} -> ${convertedUrl}`);
        }

        return convertedUrl;
    }

    /**
     * Отправка текстового сообщения
     */
    async sendTextMessage(messageData) {
        const { chatId, text, options = {} } = messageData;

        if (!chatId || !text) {
            throw new Error('Отсутствуют обязательные параметры: chatId или text');
        }

        try {
            await this.bot.api.sendMessage(chatId, text, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...options,
            });

            console.log(`✅ Текстовое сообщение отправлено пользователю ${chatId}`);
        } catch (error) {
            if (error.description && error.description.includes('Too Many Requests')) {
                console.log('⚠️ Превышен лимит запросов, увеличиваем задержку');
                await this.delay(1000);
                throw error;
            }

            if (error.description && error.description.includes('bot was blocked')) {
                console.log(`❌ Бот заблокирован пользователем ${chatId}`);
                throw new Error('BOT_BLOCKED');
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
        const recentMessages = this.messageQueue.filter((msg) => now - msg.addedAt < 60000);

        return {
            totalInQueue: this.messageQueue.length,
            recentAdded: recentMessages.length,
            isActive: this.isProcessing,
            sendInterval: this.sendInterval,
        };
    }

    /**
     * Задержка выполнения
     */
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
