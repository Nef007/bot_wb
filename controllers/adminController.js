import { InlineKeyboard } from 'grammy';
import { adminService } from '../services/adminService.js';
import userModel from '../db/models/user.js';
import subscriptionModel from '../db/models/subscription.js';
import orderModel from '../db/models/order.js';
import dayjs from 'dayjs';

export const adminController = {
    // Главное меню администрирования
    showAdminMenu: async (ctx) => {
        if (!adminService.isAdmin(String(ctx.from.id))) {
            await ctx.answerCallbackQuery({ text: '❌ Доступ запрещен' });
            return;
        }

        const message = `⚙️ <b>Панель администратора</b>\n\nВыберите раздел для управления:`;

        const keyboard = new InlineKeyboard()
            .text('👥 Управление пользователями', 'admin_users')
            .row()
            .text('📊 Статистика системы', 'admin_stats')
            .row()
            .text('⬅️ Назад', 'entities');

        if (ctx.callbackQuery) {
            await ctx.editMessageText(message, {
                reply_markup: keyboard,
                parse_mode: 'HTML',
            });
            await ctx.answerCallbackQuery();
        } else {
            await ctx.reply(message, {
                reply_markup: keyboard,
                parse_mode: 'HTML',
            });
        }
    },

    // Список пользователей
    showUsersList: async (ctx, page = 0) => {
        if (!adminService.isAdmin(String(ctx.from.id))) {
            await ctx.answerCallbackQuery({ text: '❌ Доступ запрещен' });
            return;
        }

        const users = await adminService.getAllUsers();
        const pageSize = 10;
        const startIndex = page * pageSize;
        const paginatedUsers = users.slice(startIndex, startIndex + pageSize);

        let message = `👥 <b>Управление пользователями</b>\n\n`;
        message += `Всего пользователей: ${users.length}\n\n`;

        const keyboard = new InlineKeyboard();

        paginatedUsers.forEach((user) => {
            const statusEmoji = user.status === 'ACTIVE' ? '✅' : '❌';
            const roleEmoji = user.role === 'ADMIN' ? '👑' : '👤';
            const subStatus = user.subscription
                ? subscriptionModel.isSubscriptionActive(user.id)
                    ? '✅'
                    : '💀'
                : '❌';

            keyboard
                .text(`${statusEmoji}${roleEmoji}${subStatus} ${user.username || 'Без имени'}`, `admin_user:${user.id}`)
                .row();
        });

        // Пагинация
        if (page > 0) {
            keyboard.text('⬅️ Предыдущие', `admin_users:${page - 1}`);
        }
        if (startIndex + pageSize < users.length) {
            keyboard.text('Следующие ➡️', `admin_users:${page + 1}`);
        }

        keyboard.row().text('⬅️ Назад', 'admin_menu');

        await ctx.editMessageText(message, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
        });
        await ctx.answerCallbackQuery();
    },

    // Детальная информация о пользователе
    showUserDetail: async (ctx, userId) => {
        if (!adminService.isAdmin(String(ctx.from.id))) {
            await ctx.answerCallbackQuery({ text: '❌ Доступ запрещен' });
            return;
        }

        const userDetails = await adminService.getUserDetails(userId);
        if (!userDetails) {
            await ctx.answerCallbackQuery({ text: '❌ Пользователь не найден' });
            return;
        }

        const { user, subscription, hasActiveSubscription, orders, totalOrders, paidOrders, totalSpent } = userDetails;

        let message = `👤 <b>Информация о пользователе</b>\n\n`;
        message += `🆔 ID: <code>${user.id}</code>\n`;
        message += `👤 Имя: ${user.username || 'Не указано'}\n`;
        message += `📊 Статус: ${user.status === 'ACTIVE' ? '✅ Активен' : '❌ Заблокирован'}\n`;
        message += `👑 Роль: ${user.role}\n`;
        message += `📅 Регистрация: ${dayjs(user.createdAt).format('DD.MM.YYYY HH:mm')}\n\n`;

        message += `💳 <b>Подписка:</b> `;
        if (subscription) {
            const endDate = dayjs(subscription.endDate).format('DD.MM.YYYY');
            message += `${hasActiveSubscription ? '✅ Активна' : '💀 Истекла'}\n`;
            message += `📦 Тариф: ${subscription.planType}\n`;
            message += `⏰ Истекает: ${endDate}\n`;
        } else {
            message += `❌ Нет подписки\n`;
        }

        message += `\n📦 <b>Заказы:</b> ${totalOrders} (Оплачено: ${paidOrders})\n`;
        message += `💰 Всего потрачено: ${totalSpent} руб.\n`;

        const keyboard = new InlineKeyboard()
            .text('📦 Заказы', `admin_user_orders:${userId}`)
            .text('💳 Подписка', `admin_user_subscription:${userId}`)
            .row();

        if (user.status === 'ACTIVE') {
            keyboard.text('❌ Заблокировать', `admin_toggle_user:${userId}`);
        } else {
            keyboard.text('✅ Разблокировать', `admin_toggle_user:${userId}`);
        }

        keyboard.row().text('⬅️ Назад', 'admin_users:0');

        await ctx.editMessageText(message, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
        });
        await ctx.answerCallbackQuery();
    },

    // Список заказов пользователя
    showUserOrders: async (ctx, userId) => {
        if (!adminService.isAdmin(String(ctx.from.id))) {
            await ctx.answerCallbackQuery({ text: '❌ Доступ запрещен' });
            return;
        }

        const user = userModel.findById(userId);
        if (!user) {
            await ctx.answerCallbackQuery({ text: '❌ Пользователь не найден' });
            await adminController.showUsersList(ctx, 0); // Возвращаем к списку пользователей
            return;
        }

        const orders = orderModel.findByUserId(userId, 100);

        let message = `📦 <b>Заказы пользователя</b>\n\n`;
        message += `👤 ${user.username || 'Без имени'} (ID: ${userId})\n\n`;

        const keyboard = new InlineKeyboard();

        if (orders.length === 0) {
            message += '📭 Нет заказов';
        } else {
            orders.forEach((order) => {
                const emoji = order.status === 'PAID' ? '✅' : order.status === 'PENDING' ? '⏳' : '❌';
                const date = dayjs(order.createdAt).format('DD.MM.YYYY');

                keyboard
                    .text(
                        `${emoji} ${order.orderNumber} - ${order.amount} руб.`,
                        `admin_order_detail:${order.orderNumber}`
                    )
                    .row();
            });
        }

        keyboard.text('⬅️ Назад', `admin_user:${userId}`);

        await ctx.editMessageText(message, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
        });
        await ctx.answerCallbackQuery();
    },

    // Детали заказа
    showOrderDetail: async (ctx, orderNumber) => {
        if (!adminService.isAdmin(String(ctx.from.id))) {
            await ctx.answerCallbackQuery({ text: '❌ Доступ запрещен' });
            return;
        }

        const order = orderModel.findByOrderNumber(orderNumber);
        if (!order) {
            await ctx.answerCallbackQuery({ text: '❌ Заказ не найден' });
            return;
        }

        const user = userModel.findById(order.userId);

        let message = `📄 <b>Детали заказа</b>\n\n`;
        message += `🆔 Номер: ${order.orderNumber}\n`;
        message += `👤 Пользователь: ${user.username || 'Без имени'} (${order.userId})\n`;
        message += `📦 Тариф: ${order.planType}\n`;
        message += `💰 Сумма: ${order.amount} руб.\n`;
        message += `📊 Статус: ${order.status}\n`;
        message += `📅 Создан: ${dayjs(order.createdAt).format('DD.MM.YYYY HH:mm')}\n`;

        const keyboard = new InlineKeyboard();

        if (order.status === 'PENDING') {
            keyboard.text('🗑️ Удалить заказ', `admin_delete_order:${order.orderNumber}`).row();
        }

        keyboard.text('⬅️ Назад', `admin_user_orders:${order.userId}`);

        await ctx.editMessageText(message, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
        });
        await ctx.answerCallbackQuery();
    },

    // Управление подпиской пользователя
    showUserSubscription: async (ctx, userId) => {
        if (!adminService.isAdmin(String(ctx.from.id))) {
            await ctx.answerCallbackQuery({ text: '❌ Доступ запрещен' });
            return;
        }

        const user = userModel.findById(userId);
        const subscription = subscriptionModel.findByUserId(userId);
        const hasActiveSubscription = subscriptionModel.isSubscriptionActive(userId);

        let message = `💳 <b>Управление подпиской</b>\n\n`;
        message += `👤 Пользователь: ${user.username || 'Без имени'}\n\n`;

        if (subscription) {
            const endDate = dayjs(subscription.endDate).format('DD.MM.YYYY');
            message += `📦 Текущий тариф: ${subscription.planType}\n`;
            message += `📊 Статус: ${hasActiveSubscription ? '✅ Активна' : '💀 Истекла'}\n`;
            message += `⏰ Истекает: ${endDate}\n\n`;
        } else {
            message += `❌ Нет активной подписки\n\n`;
        }

        message += `Выберите действие:`;

        const keyboard = new InlineKeyboard()
            .text('📅 Продлить на 30 дней', `admin_extend_sub:${userId}:30`)
            .text('📅 Продлить на 90 дней', `admin_extend_sub:${userId}:90`)
            .row();

        if (subscription) {
            keyboard.text('🗑️ Удалить подписку', `admin_delete_sub:${userId}`).row();
        }

        keyboard.text('⬅️ Назад', `admin_user:${userId}`);

        await ctx.editMessageText(message, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
        });
        await ctx.answerCallbackQuery();
    },

    handleAction: async (ctx, action, ...params) => {
        if (!adminService.isAdmin(String(ctx.from.id))) {
            await ctx.answerCallbackQuery({ text: '❌ Доступ запрещен' });
            return;
        }

        try {
            let result;
            let message = '';
            let userId = null;

            switch (action) {
                case 'toggle_user':
                    userId = params[0];
                    result = await adminService.toggleUserStatus(userId);
                    message = result.message;
                    break;

                case 'delete_order':
                    const orderNumber = params[0];
                    result = await adminService.deleteOrder(orderNumber);
                    message = result.message;

                    // Получаем userId из удаленного заказа
                    const deletedOrder = orderModel.findByOrderNumber(orderNumber);
                    userId = deletedOrder ? deletedOrder.userId : null;
                    break;

                case 'extend_sub':
                    userId = params[0];
                    const days = parseInt(params[1]);
                    result = await adminService.updateUserSubscription(userId, `EXTEND_${days}`, days);
                    message = result.message;
                    break;

                case 'delete_sub':
                    userId = params[0];
                    result = await adminService.deleteUserSubscription(userId);
                    message = result.message;
                    break;
            }

            await ctx.answerCallbackQuery({ text: message, show_alert: true });

            // Возвращаемся к предыдущему экрану с проверкой userId
            if (userId) {
                switch (action) {
                    case 'toggle_user':
                        await adminController.showUserDetail(ctx, userId);
                        break;
                    case 'delete_order':
                        // Проверяем что userId существует перед переходом
                        if (userId) {
                            await adminController.showUserOrders(ctx, userId);
                        } else {
                            // Если userId не найден, возвращаемся к списку пользователей
                            await adminController.showUsersList(ctx, 0);
                        }
                        break;
                    case 'extend_sub':
                    case 'delete_sub':
                        await adminController.showUserSubscription(ctx, userId);
                        break;
                }
            } else {
                // Если userId не определен, возвращаемся к главному меню админки
                await adminController.showAdminMenu(ctx);
            }
        } catch (error) {
            console.error('Admin action error:', error);
            await ctx.answerCallbackQuery({ text: '❌ Ошибка при выполнении действия' });

            // При ошибке всегда возвращаем в главное меню админки
            await adminController.showAdminMenu(ctx);
        }
    },
};
