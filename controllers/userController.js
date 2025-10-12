import userModel from '../db/models/user.js';
import { menuController } from './menuController.js';

export const userController = {
    add: async (ctx) => {
        try {
            const userId = String(ctx.from.id);
            const username = ctx.from.username || ctx.from.first_name || 'Unknown';

            // Используем userModel напрямую для создания/поиска пользователя
            (await userModel.findById(userId)) || (await userModel.create(userId, username));

            // Show welcome message
            await ctx.reply(
                `🛍️ Добро пожаловать, ${ctx.from.first_name || 'друг'}!

<b>Wildberries Price Monitor</b> - ваш личный помощник для отслеживания цен на маркетплейсе Wildberries!

📊 <b>Что умеет бот:</b>
• Отслеживание изменения цен в реальном времени
• Уведомления о скидках и акциях
• Мониторинг товаров по категориям
• Анализ ценовой динамики

🎯 <b>Как начать:</b>
1. Выберите интересующие категории товаров
2. Настройте параметры отслеживания
3. Получайте уведомления об изменениях цен

💎 <b>Премиум функции:</b>
• Расширенный мониторинг категорий
• Приоритетные уведомления
• Детальная аналитика цен

Управление подпиской доступно в разделе /subscription

Для начала работы воспользуйтесь меню ниже 👇`,
                { parse_mode: 'HTML' }
            );

            // Show main menu with buttons
            await menuController.getMenu(ctx);
        } catch (e) {
            console.error('Ошибка в userControllers.add:', e);
            await ctx.reply('Произошла ошибка при запуске бота. Пожалуйста, попробуйте еще раз.');
        }
    },
};
