import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Europe/Moscow');

class NotificationManager {
    constructor() {
        this.notificationService = null;
    }

    /**
     * Инициализация менеджера уведомлений
     */
    initialize(notificationService) {
        this.notificationService = notificationService;
        console.log('✅ NotificationManager инициализирован');
    }

    /**
     * Отправка уведомления об изменении цены
     */
    sendPriceAlert(alertData, categoryName) {
        if (!this.notificationService) {
            console.error('❌ NotificationManager не инициализирован');
            return false;
        }

        const message = this.formatPriceAlertMessage(alertData, categoryName);

        this.notificationService.addToQueue({
            chatId: alertData.user_id,
            text: message,
            image_url: alertData.image_url,
        });

        return true;
    }

    /**
     * Форматирование сообщения об изменении цены
     */
    formatPriceAlertMessage(alert, categoryName) {
        const changeIcon = alert.percent_change > 0 ? '📈' : '📉';
        const changeType = alert.percent_change > 0 ? 'подорожал' : 'подешевел';
        const changeColor = alert.percent_change > 0 ? '🔴' : '🟢';
        const productUrl = `https://www.wildberries.ru/catalog/${alert.product_id}/detail.aspx`;

        const parseDbTime = (timeString) => {
            // SQLite хранит время в UTC формате: "2025-10-12 19:24:00"
            // Сначала парсим как UTC, потом конвертируем в Москву
            return dayjs.utc(timeString, 'YYYY-MM-DD HH:mm:ss').tz('Europe/Moscow');
        };

        const oldTimeFormatted = parseDbTime(alert.old_time).format('DD.MM.YYYY HH:mm');
        const newTimeFormatted = parseDbTime(alert.new_time).format('DD.MM.YYYY HH:mm');
        const currentTimeFormatted = dayjs().tz('Europe/Moscow').format('DD.MM.YYYY HH:mm');

        return `
${changeColor} <b>Изменение цены</b>

📦 <b>${alert.product_name}</b>
🏷️ Бренд: ${alert.brand || 'Не указан'}
📂 Категория: ${categoryName}

💰 <b>Цена:</b> ${alert.old_price} руб. (${oldTimeFormatted}) → ${alert.new_price} руб. (${newTimeFormatted})
${changeIcon} <b>Изменение:</b> ${Math.abs(alert.percent_change).toFixed(2)}% ${changeType}

⚡ <b>Порог уведомления:</b> ${alert.threshold}%

🔗 Ссылка на товар: ${productUrl}

🕒 ${currentTimeFormatted}
    `.trim();
    }

    /**
     * Отправка системного уведомления
     */
    sendSystemNotification(chatId, title, message) {
        if (!this.notificationService) {
            console.error('❌ NotificationManager не инициализирован');
            return false;
        }

        const text = `🔔 <b>${title}</b>\n\n${message}`;

        this.notificationService.addToQueue({
            chatId,
            text,
        });

        return true;
    }
}

// Создаем глобальный экземпляр
export const notificationManager = new NotificationManager();
