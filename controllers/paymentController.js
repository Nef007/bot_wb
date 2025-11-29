import orderModel from '../db/models/order.js';
import subscriptionModel from '../db/models/subscription.js';
import { YooMoneyService } from '../services/yoomoneyService.js';
import dayjs from 'dayjs';

const yoomoneyService = new YooMoneyService();

export const paymentController = {
    // Улучшенная проверка статуса заказа
    checkOrderPaymentStatus: async (orderNumber) => {
        try {
            const order = await orderModel.findByOrderNumber(orderNumber);
            if (!order) {
                return {
                    success: false,
                    status: 'error',
                    message: 'Заказ не найден в базе данных',
                };
            }

            // Для пробного периода
            if (order.planType === 'TRIAL') {
                const activated = await paymentController.activateSubscription(order.userId, order.planType);
                if (activated) {
                    await orderModel.updateStatus(orderNumber, 'PAID');
                    return {
                        success: true,
                        status: 'PAID',
                        message: '🎁 Пробный период активирован!',
                        isTrial: true,
                    };
                }
            }

            // Проверяем статус платежа через API
            const paymentStatus = await yoomoneyService.checkPaymentStatusExtended(orderNumber);

            const result = {
                orderNumber,
                planType: order.planType,
                amount: order.amount,
                ...paymentStatus,
            };

            // Обрабатываем разные статусы
            switch (paymentStatus.status) {
                case 'success':
                    if (paymentStatus.payment_status === 'success') {
                        await orderModel.updateStatus(orderNumber, 'PAID');
                        const activated = await paymentController.activateSubscription(order.userId, order.planType);

                        return {
                            ...result,
                            success: true,
                            status: 'PAID',
                            message: '✅ Платеж подтвержден! Подписка активирована.',
                            subscriptionActivated: activated,
                        };
                    }
                    break;

                case 'found':
                    return {
                        ...result,
                        success: false,
                        status: 'PENDING',
                        message: paymentStatus.message || 'Платеж в обработке',
                    };

                case 'not_found':
                    // Проверяем, не истек ли заказ
                    const orderDate = new Date(order.created_at);
                    const now = new Date();
                    const diffHours = (now - orderDate) / (1000 * 60 * 60);

                    if (diffHours > 72) {
                        // 3 дня
                        await orderModel.updateStatus(orderNumber, 'EXPIRED');
                        return {
                            ...result,
                            success: false,
                            status: 'EXPIRED',
                            message: '⏰ Время оплаты истекло. Заказ автоматически отменен.',
                        };
                    }

                    return {
                        ...result,
                        success: false,
                        status: 'PENDING',
                        message: '💳 Платеж еще не поступил. Если вы уже оплатили, проверьте позже.',
                    };

                case 'error':
                    return {
                        ...result,
                        success: false,
                        status: 'ERROR',
                        message: '❌ Ошибка при проверке статуса платежа',
                    };
            }

            return {
                ...result,
                success: false,
                status: 'UNKNOWN',
                message: 'Неизвестный статус платежа',
            };
        } catch (error) {
            console.error('Error in checkOrderPaymentStatus:', error);
            return {
                success: false,
                status: 'ERROR',
                message: 'Системная ошибка при проверке платежа',
            };
        }
    },
    // Активация подписки
    activateSubscription: async (userId, planType) => {
        try {
            const planInfo = {
                TRIAL: { days: 14 },
                MONTHLY: { days: 30 },
                QUARTERLY: { days: 90 },
            };

            const days = planInfo[planType]?.days || 30;
            const startDate = new Date();
            const endDate = dayjs(startDate).add(days, 'day').toDate();

            // Передаем Date объекты - модель сама преобразует их в строки
            await subscriptionModel.create(userId, planType, startDate, endDate, 'ACTIVE');

            console.log(`✅ Subscription activated for user ${userId}, plan: ${planType}`);
            return true;
        } catch (error) {
            console.error('Error activating subscription:', error);
            return false;
        }
    },

    // Пакетная проверка всех платежей
    checkAllPendingPayments: async () => {
        try {
            console.log('🔄 Starting automatic payment check...');
            const results = await yoomoneyService.checkAllPendingPayments();

            const summary = {
                total: results.length,
                paid: results.filter((r) => r.status.status === 'success').length,
                pending: results.filter((r) => r.status.status === 'found' || r.status.status === 'not_found').length,
                errors: results.filter((r) => r.status.status === 'error').length,
                timestamp: new Date().toISOString(),
            };

            console.log('✅ Automatic payment check completed:', summary);
            return { results, summary };
        } catch (error) {
            console.error('❌ Error in automatic payment check:', error);
            return { results: [], summary: { error: error.message } };
        }
    },

    // Проверка платежей конкретного пользователя
    checkUserPendingPayments: async (userId) => {
        try {
            const pendingOrders = await orderModel.findByUserIdAndStatus(userId, 'PENDING');
            const results = [];

            for (const order of pendingOrders) {
                const status = await paymentController.checkOrderPaymentStatus(order.orderNumber);
                results.push({
                    orderNumber: order.orderNumber,
                    status: status,
                });

                // Задержка между проверками
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }

            return results;
        } catch (error) {
            console.error('Error checking user payments:', error);
            return [];
        }
    },
};
