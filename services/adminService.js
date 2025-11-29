import userModel from '../db/models/user.js';
import subscriptionModel from '../db/models/subscription.js';
import orderModel from '../db/models/order.js';
import dayjs from 'dayjs';

export const adminService = {
    // Проверка прав администратора
    isAdmin: (userId) => {
        return userModel.isAdmin(userId);
    },

    // Получение списка всех пользователей
    getAllUsers: async () => {
        const users = userModel.findAll();

        return users.map((user) => ({
            id: user.id,
            username: user.username,
            status: user.status,
            role: user.role,
            created_at: user.created_at,
            // Дополнительная статистика
            subscription: subscriptionModel.findByUserId(user.id),
            orders: orderModel.findByUserId(user.id),
            accountsCount: 0, // Нужно добавить подсчет аккаунтов
            groupsCount: 0, // Нужно добавить подсчет групп
        }));
    },

    // Получение детальной информации о пользователе
    getUserDetails: async (userId) => {
        const user = userModel.findById(userId);
        if (!user) return null;

        const subscription = subscriptionModel.findByUserId(userId);
        const orders = orderModel.findByUserId(userId, 100); // Все заказы
        const hasActiveSubscription = subscriptionModel.isSubscriptionActive(userId);

        return {
            user,
            subscription,
            hasActiveSubscription,
            orders: orders || [],
            totalOrders: orders ? orders.length : 0,
            paidOrders: orders ? orders.filter((o) => o.status === 'PAID').length : 0,
            totalSpent: orders ? orders.filter((o) => o.status === 'PAID').reduce((sum, o) => sum + o.amount, 0) : 0,
        };
    },

    updateUserSubscription: async (userId, actionType, daysToAdd = null) => {
        try {
            const user = userModel.findById(userId);
            if (!user) {
                return { success: false, message: 'Пользователь не найден' };
            }

            const currentSubscription = subscriptionModel.findByUserId(userId);
            const now = new Date();
            let startDate = now;
            let endDate = now;

            // Определяем дни и тип плана на основе actionType
            let days;
            let planType;

            switch (actionType) {
                case 'EXTEND_30':
                    days = 30;
                    planType = currentSubscription ? currentSubscription.planType : 'MONTHLY';
                    break;
                case 'EXTEND_90':
                    days = 90;
                    planType = currentSubscription ? currentSubscription.planType : 'QUARTERLY';
                    break;
                case 'MONTHLY':
                    days = 30;
                    planType = 'MONTHLY';
                    break;
                case 'QUARTERLY':
                    days = 90;
                    planType = 'QUARTERLY';
                    break;
                default:
                    days = 30;
                    planType = 'MONTHLY';
            }

            // Убедимся что planType допустимый
            const allowedPlanTypes = ['TRIAL', 'MONTHLY', 'QUARTERLY'];
            if (!allowedPlanTypes.includes(planType)) {
                planType = 'MONTHLY';
            }

            if (currentSubscription && currentSubscription.status === 'ACTIVE') {
                startDate = new Date(currentSubscription.startDate);
                endDate = dayjs(currentSubscription.endDate).add(days, 'day').toDate();
            } else {
                endDate = dayjs(now).add(days, 'day').toDate();
            }

            await subscriptionModel.create(userId, planType, startDate, endDate, 'ACTIVE');

            return {
                success: true,
                message: `Подписка обновлена. Действует до: ${dayjs(endDate).format('DD.MM.YYYY')}`,
                endDate,
            };
        } catch (error) {
            console.error('Error updating subscription:', error);
            return { success: false, message: 'Ошибка при обновлении подписки' };
        }
    },

    // Удаление подписки
    deleteUserSubscription: async (userId) => {
        try {
            const result = await subscriptionModel.deleteByUserId(userId);
            return {
                success: result,
                message: result ? 'Подписка удалена' : 'Подписка не найдена',
            };
        } catch (error) {
            console.error('Error deleting subscription:', error);
            return { success: false, message: 'Ошибка при удалении подписки' };
        }
    },

    // Удаление заказа
    deleteOrder: async (orderNumber) => {
        try {
            // Сначала получаем информацию о заказе
            const order = orderModel.findByOrderNumber(orderNumber);
            if (!order) {
                return {
                    success: false,
                    message: 'Заказ не найден',
                    userId: null,
                };
            }

            const userId = order.userId;
            const result = await orderModel.deleteByOrderNumber(orderNumber);

            return {
                success: true,
                message: 'Заказ удален',
                userId: userId, // Возвращаем userId для ви
            };
        } catch (error) {
            console.error('Error deleting order:', error);
            return {
                success: false,
                message: 'Ошибка при удалении заказа',
                userId: null,
            };
        }
    },

    // Блокировка/разблокировка пользователя
    toggleUserStatus: async (userId) => {
        try {
            const user = userModel.findById(userId);
            if (!user) {
                return { success: false, message: 'Пользователь не найден' };
            }

            const newStatus = user.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
            await userModel.update(userId, { status: newStatus });

            return {
                success: true,
                message: `Пользователь ${newStatus === 'ACTIVE' ? 'разблокирован' : 'заблокирован'}`,
                newStatus,
            };
        } catch (error) {
            console.error('Error toggling user status:', error);
            return { success: false, message: 'Ошибка при изменении статуса' };
        }
    },
};
