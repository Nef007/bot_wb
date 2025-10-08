import { InlineKeyboard } from 'grammy';
import subscriptionModel from '../db/models/subscription.js';
import orderModel from '../db/models/order.js';
import { YooMoneyService } from '../services/yoomoneyService.js';
import { paymentController } from './paymentController.js';
import dayjs from 'dayjs';

const yoomoneyService = new YooMoneyService();

export const subscriptionController = {
    showOrderDetail: async (ctx, orderNumber) => {
        try {
            const order = await orderModel.findByOrderNumber(orderNumber);

            if (!order) {
                await ctx.answerCallbackQuery({ text: '❌ Заказ не найден' });
                return;
            }

            // Проверяем актуальный статус заказа
            const paymentStatus = await paymentController.checkOrderPaymentStatus(orderNumber);

            const message = subscriptionController.formatOrderDetail(order, paymentStatus);
            const keyboard = subscriptionController.createOrderDetailKeyboard(order, paymentStatus);

            await ctx.editMessageText(message, {
                reply_markup: keyboard,
                parse_mode: 'HTML',
            });
            await ctx.answerCallbackQuery();
        } catch (error) {
            console.error('Error showing order detail:', error);
            await ctx.answerCallbackQuery({ text: '❌ Ошибка при загрузке заказа' });
        }
    },

    // Новый метод для создания клавиатуры в зависимости от статуса
    createOrderDetailKeyboard: (order, paymentStatus) => {
        const keyboard = new InlineKeyboard();
        const isTrial = order.planType === 'TRIAL';
        const isPaid = paymentStatus.status === 'PAID' || order.status === 'PAID';
        const isPending = paymentStatus.status === 'PENDING' || order.status === 'PENDING';

        // Для пробного периода
        if (isTrial) {
            keyboard.text('⬅️ Назад', 'order_history');
            return keyboard;
        }

        // Для оплаченного заказа - только кнопка назад
        if (isPaid) {
            keyboard.text('⬅️ Назад', 'order_history');
            return keyboard;
        }

        // Для ожидающего оплаты заказа
        if (isPending) {
            // Кнопка оплаты (если есть paymentUrl)
            if (order.paymentUrl) {
                keyboard.url('💳 Оплатить', order.paymentUrl).row();
            }

            // Кнопка проверки статуса
            keyboard.text('🔄 Проверить оплату', `check_payment:${order.orderNumber}`).row();

            // Кнопка удаления заказа
            keyboard.text('🗑️ Удалить заказ', `delete_order:${order.orderNumber}`).row();
        }

        // Кнопка назад
        keyboard.text('⬅️ Назад', 'order_history');

        return keyboard;
    },

    // Обработчик проверки платежа
    checkPaymentStatus: async (ctx, orderNumber) => {
        try {
            // Показываем уведомление о проверке
            await ctx.answerCallbackQuery({ text: '🔄 Проверяем статус платежа...' });

            const paymentStatus = await paymentController.checkOrderPaymentStatus(orderNumber);
            const order = await orderModel.findByOrderNumber(orderNumber);

            let message = '';
            let showAlert = false;

            switch (paymentStatus.status) {
                case 'PAID':
                    message = '✅ Платеж подтвержден! Подписка активирована.';
                    showAlert = true;
                    // Обновляем сообщение с деталями заказа
                    await subscriptionController.showOrderDetail(ctx, orderNumber);
                    break;

                case 'PENDING':
                    message = '⏳ Платеж еще в обработке. Попробуйте проверить позже.';
                    showAlert = true;
                    break;

                case 'EXPIRED':
                    message = '💀 Время оплаты истекло. Заказ отменен.';
                    showAlert = true;
                    await subscriptionController.showOrderDetail(ctx, orderNumber);
                    break;

                case 'ERROR':
                    message = '❌ Ошибка при проверке платежа. Попробуйте позже.';
                    showAlert = true;
                    break;

                default:
                    message = 'ℹ️ Статус платежа неизвестен.';
                    showAlert = true;
            }

            if (showAlert) {
                await ctx.answerCallbackQuery({ text: message, show_alert: true });
            }
        } catch (error) {
            console.error('Error checking payment status:', error);
            await ctx.answerCallbackQuery({ text: '❌ Ошибка при проверке платежа' });
        }
    },

    deleteOrder: async (ctx, orderNumber) => {
        try {
            const order = await orderModel.findByOrderNumber(orderNumber);

            if (!order) {
                await ctx.answerCallbackQuery({ text: '❌ Заказ не найден' });
                return;
            }

            // Запрещаем удаление пробного периода
            if (order.planType === 'TRIAL') {
                await ctx.answerCallbackQuery({ text: '❌ Нельзя удалить пробный период' });
                return;
            }

            await orderModel.deleteByOrderNumber(orderNumber);

            await ctx.answerCallbackQuery({ text: '✅ Заказ удален' });

            // Возвращаемся к истории заказов
            await subscriptionController.showOrderHistory(ctx);
        } catch (error) {
            console.error('Error deleting order:', error);
            await ctx.answerCallbackQuery({ text: '❌ Ошибка при удалении заказа' });
        }
    },

    // Обновленный метод formatOrderDetail с учетом статуса платежа
    formatOrderDetail: (order, paymentStatus = null) => {
        // Используем актуальный статус из проверки платежа или статус из базы
        const currentStatus = paymentStatus?.status || order.status;

        const statusTexts = {
            PENDING: '⏳ Ожидает оплаты',
            PAID: '✅ Оплачен',
            CANCELLED: '❌ Отменен',
            EXPIRED: '💀 Истек',
        };

        const statusText = statusTexts[currentStatus] || '❓ Неизвестен';

        const planNames = {
            TRIAL: 'Бесплатный пробный период',
            MONTHLY: 'Месячная подписка',
            QUARTERLY: 'Квартальная подписка',
        };

        const isTrial = order.planType === 'TRIAL';
        const isPaid = currentStatus === 'PAID';

        let message = `📄 <b>Детали заказа №${order.orderNumber}</b>\n\n`;
        message += `💰 <b>Тариф:</b> ${planNames[order.planType] || order.planType}\n`;
        message += `💳 <b>Сумма:</b> ${order.amount || 0} руб.\n`;
        message += `📊 <b>Статус:</b> ${isTrial ? '✅ Активен' : statusText}\n`;
        message += `🕐 <b>Создан:</b> ${dayjs(order.createdAt).format('DD.MM.YYYY HH:mm:ss')}\n`;
        message += `🔄 <b>Обновлен:</b> ${dayjs(order.updatedAt).format('DD.MM.YYYY HH:mm:ss')}\n`;


          subscription.last_scan_at
        ? dayjs(subscription.last_scan_at).tz('Europe/Moscow').format('DD.MM.YYYY HH:mm')
        : 'Еще не было'
        // Добавляем информацию о последней проверке
        if (paymentStatus && paymentStatus.timestamp) {
            message += `🔍 <b>Последняя проверка:</b> ${dayjs(paymentStatus.timestamp).format(
                'DD.MM.YYYY HH:mm:ss'
            )}\n`;
        }

        if (isTrial) {
            message += `\n🎁 <i>Это ваш пробный период. Наслаждайтесь использованием бота!</i>`;
        } else if (isPaid) {
            message += `\n✅ <i>Заказ оплачен. Подписка активирована!</i>`;
        } else if (currentStatus === 'PENDING') {
            message += `\n💡 <i>После оплаты нажмите "Проверить оплату" для активации подписки</i>`;
        } else if (currentStatus === 'EXPIRED') {
            message += `\n❌ <i>Время оплаты истекло. Заказ автоматически отменен.</i>`;
        }

        return message.trim();
    },

    showSubscriptionStatus: async (ctx) => {
        try {
            const userId = String(ctx.from.id);
            const subscription = subscriptionModel.findByUserId(userId);
            const hasActiveSubscription = subscriptionModel.isSubscriptionActive(userId);
            const remainingDays = subscriptionModel.getRemainingDays(userId);

            let message = '📅 <b>Статус подписки</b>\n\n';

            if (hasActiveSubscription) {
                const endDate = dayjs(subscription.endDate).format('DD.MM.YYYY');
                message += `✅ <b>Подписка активна</b>\n`;
                message += `Осталось дней: ${remainingDays}\n`;
                message += `Истекает: ${endDate}\n`;
                message += `Тариф: ${subscriptionController.getPlanName(subscription.planType)}\n`;
            } else {
                const endDate = subscription ? dayjs(subscription.endDate).format('DD.MM.YYYY') : '';
                message += `❌ <b>Подписка истекла ${endDate}</b> ☹️\n`;
                message += `Для доступа ко всем функциям бота, пожалуйста, продлите ее 😉\n`;
            }

            const keyboard = new InlineKeyboard()
                .text('🔄 Продлить подписку', 'renew_subscription')
                .row()
                .text('📋 История заказов', 'order_history')
                .row()
                .text('⬅️ Назад', 'entities');

            // Правильная проверка на наличие callbackQuery
            if (ctx.callbackQuery) {
                await ctx.editMessageText(message, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
                // Отвечаем на callback query
                await ctx.answerCallbackQuery();
            } else {
                // Это обычное сообщение (не callback)
                await ctx.reply(message, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
                // Не вызываем answerCallbackQuery для обычных сообщений
            }
        } catch (error) {
            console.error('Error showing subscription status:', error);

            // Обрабатываем ошибку в зависимости от типа запроса
            if (ctx.callbackQuery) {
                await ctx.answerCallbackQuery({ text: '❌ Ошибка при загрузке статуса подписки' });
            } else {
                await ctx.reply('❌ Ошибка при загрузке статуса подписки');
            }
        }
    },

    showPlanSelection: async (ctx) => {
        try {
            const userId = String(ctx.from.id);
            const hasPreviousOrders = await subscriptionController.userHasPreviousOrders(userId);

            const message = `💰 <b>Выберите план подписки</b>\n\n`;

            const keyboard = new InlineKeyboard();

            if (!hasPreviousOrders) {
                keyboard.text('🎁 Бесплатно (2 недели)', 'select_plan:TRIAL').row();
            }

            keyboard
                .text('📅 1 месяц (90 руб.)', 'select_plan:MONTHLY')
                .row()
                .text('📊 3 месяца (250 руб.)', 'select_plan:QUARTERLY')
                .row()
                .text('⬅️ Назад', 'subscription_status');

            await ctx.editMessageText(message, {
                reply_markup: keyboard,
                parse_mode: 'HTML',
            });
            await ctx.answerCallbackQuery();
        } catch (error) {
            console.error('Error showing plan selection:', error);
        }
    },

    createOrder: async (ctx, planType) => {
        try {
            const userId = String(ctx.from.id);
            const planInfo = yoomoneyService.getPlanInfo(planType);

            const order = await yoomoneyService.createOrder(userId, planType, planInfo.amount, planInfo.duration);

            const message = subscriptionController.formatOrderMessage(order, planInfo);
            const keyboard = subscriptionController.createOrderDetailKeyboard(order, { status: 'PENDING' });

            await ctx.editMessageText(message, {
                reply_markup: keyboard,
                parse_mode: 'HTML',
            });
            await ctx.answerCallbackQuery();
        } catch (error) {
            console.error('Error creating order:', error);
            await ctx.answerCallbackQuery('❌ Ошибка при создании заказа');
        }
    },

    showOrderHistory: async (ctx) => {
        try {
            const userId = String(ctx.from.id);
            const orders = await orderModel.findByUserId(userId, 10);

            let message = `📋 <b>История заказов</b>\n\n`;
            message += `🕐 Заказы старше 3 дней в статусе "ожидает" автоматически удаляются\n\n`;

            const keyboard = new InlineKeyboard();

            if (orders.length === 0) {
                message += '📭 У вас пока нет заказов';
            } else {
                orders.forEach((order) => {
                    const emoji = subscriptionController.getStatusEmoji(order.status);
                    const date = dayjs(order.createdAt).format('DD.MM.YYYY');
                    const amount = order.amount > 0 ? `${order.amount} руб.` : 'Бесплатно';
                    const shortOrderNumber = order.orderNumber.slice(-6);

                    keyboard
                        .text(`${emoji} ${shortOrderNumber} - ${amount}`, `order_detail:${order.orderNumber}`)
                        .row();
                });
            }

            keyboard.text('⬅️ Назад в меню подписки', 'subscription_status');

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
        } catch (error) {
            console.error('Error showing order history:', error);

            if (ctx.callbackQuery) {
                await ctx.answerCallbackQuery({ text: '❌ Ошибка при загрузке истории' });
            } else {
                await ctx.reply('❌ Ошибка при загрузке истории заказов');
            }
        }
    },

    // Вспомогательные методы
    getPlanName: (planType) => {
        const names = {
            TRIAL: 'Бесплатный пробный период',
            MONTHLY: 'Месячная подписка',
            QUARTERLY: 'Квартальная подписка',
        };
        return names[planType] || planType;
    },

    getStatusEmoji: (status) => {
        const emojis = {
            PENDING: '⏳',
            PAID: '✅',
            CANCELLED: '❌',
            EXPIRED: '💀',
        };
        return emojis[status] || '❓';
    },

    formatOrderMessage: (order, planInfo) => {
        const isTrial = order.planType === 'TRIAL';
        const isPaid = order.status === 'PAID';

        const statusInfo = {
            TRIAL: { emoji: '✅', text: 'Активен', description: 'Пробный период активирован' },
            PENDING: { emoji: '⏳', text: 'Ожидает оплаты', description: 'Ожидает подтверждения оплаты' },
            PAID: { emoji: '✅', text: 'Оплачен', description: 'Оплата подтверждена' },
        };

        const currentStatus = isTrial ? statusInfo.TRIAL : isPaid ? statusInfo.PAID : statusInfo.PENDING;

        const planNames = {
            TRIAL: '🎁 Бесплатный пробный период (14 дней)',
            MONTHLY: '📅 Месячная подписка (30 дней)',
            QUARTERLY: '📊 Квартальная подписка (90 дней)',
        };

        let message = `📦 <b>Информация о заказе</b>\n\n`;
        message += `📄 <b>Номер заказа:</b> ${order.orderNumber}\n`;
        message += `💰 <b>Тарифный план:</b> ${planNames[order.planType] || order.planType}\n`;
        message += `💵 <b>Стоимость:</b> ${order.amount || 0} руб.\n`;
        message += `${currentStatus.emoji} <b>Статус:</b> ${currentStatus.text}\n`;
        message += `📅 <b>Дата создания:</b> ${dayjs().format('DD.MM.YYYY HH:mm:ss')} МСК\n`;

        if (!isTrial) {
            message += `💳 <b>Платежная система:</b> ЮMoney\n`;
        }

        message += `\n`;

        if (isTrial) {
            message += `🎉 <b>Поздравляем!</b>\n`;
            message += `Ваш пробный период успешно активирован! 🚀\n\n`;
            message += `Теперь у вас есть:\n`;
            message += `• Полный доступ ко всем функциям бота\n`;
            message += `• 14 дней бесплатного использования\n`;
            message += `• Возможность тестировать все возможности\n\n`;
            message += `Приятного использования! ✨`;
        } else if (isPaid) {
            message += `✅ <b>Заказ оплачен!</b>\n`;
            message += `Подписка успешно активирована. Наслаждайтесь использованием бота! 🎉`;
        } else {
            message += `📋 <b>Следующие шаги:</b>\n`;
            message += `1. Нажмите кнопку "💳 Оплатить"\n`;
            message += `2. Перейдите на страницу оплаты ЮMoney\n`;
            message += `3. Произведите платеж\n`;
            message += `4. Нажмите "🔄 Проверить оплату" для активации\n\n`;
            message += `⏱️ <i>Заказ будет ожидать оплату в течение 3 дней</i>`;
        }

        return message;
    },

    userHasPreviousOrders: async (userId) => {
        const orders = await orderModel.findByUserId(userId, 1);
        return orders.length > 0;
    },
};
