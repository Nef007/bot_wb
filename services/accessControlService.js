import subscriptionModel from '../db/models/subscription.js';

export const accessControlService = {
    // Проверка активной подписки
    hasActiveSubscription: (userId) => {
        return subscriptionModel.isSubscriptionActive(userId);
    },

    // Проверка доступа к функции с сообщением
    checkAccess: (ctx, featureName = 'этой функции') => {
        const userId = String(ctx.from.id);

        if (!accessControlService.hasActiveSubscription(userId)) {
            const message = `🔒 Доступ к ${featureName} закрыт\n\nДля использования этой функции необходимо активная подписка.\n\nНажмите "💰 Подписка" для продления.`;
            ctx.answerCallbackQuery({
                text: message,
                show_alert: true,
            });
            return false;
        }
        return true;
    },

    // Получение сообщения о необходимости подписки
    getSubscriptionRequiredMessage: (featureName = 'этой функции') => {
        return `🔒 Доступ к ${featureName} закрыт\n\nДля использования этой функции необходимо активная подписка.\n\nНажмите "💰 Подписка" для продления.`;
    },
};
