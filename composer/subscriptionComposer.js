import { Composer } from 'grammy';
import { subscriptionController } from '../controllers/subscriptionController.js';
import { accessControlService } from '../services/accessControlService.js';

export function createSubscriptionComposer() {
    const composer = new Composer();

    // Команда /subscription
    composer.command('subscription', async (ctx) => {
        await subscriptionController.showSubscriptionStatus(ctx);
    });

    // Обработчики callback'ов
    composer.callbackQuery('subscription_status', async (ctx) => {
        await subscriptionController.showSubscriptionStatus(ctx);
    });

    composer.callbackQuery('renew_subscription', async (ctx) => {
        await subscriptionController.showPlanSelection(ctx);
    });

    composer.callbackQuery('order_history', async (ctx) => {
        await subscriptionController.showOrderHistory(ctx);
    });

    composer.callbackQuery(/^select_plan:(.+)$/, async (ctx) => {
        const [, planType] = ctx.match;
        await subscriptionController.createOrder(ctx, planType);
    });

    composer.callbackQuery(/^order_detail:(.+)$/, async (ctx) => {
        const [, orderNumber] = ctx.match;
        // Реализовать просмотр деталей заказа
        await subscriptionController.showOrderDetail(ctx, orderNumber);
    });

    composer.callbackQuery(/^delete_order:(.+)$/, async (ctx) => {
        const [, orderNumber] = ctx.match;
        // Реализовать удаление заказа
        await subscriptionController.deleteOrder(ctx, orderNumber);
    });

    // Добавьте новый обработчик для проверки платежа
    composer.callbackQuery(/^check_payment:(.+)$/, async (ctx) => {
        const [, orderNumber] = ctx.match;
        await subscriptionController.checkPaymentStatus(ctx, orderNumber);
    });

    // Обработчик для заблокированных кнопок
    composer.callbackQuery('subscription_required', async (ctx) => {
        await ctx.answerCallbackQuery({
            text: accessControlService.getSubscriptionRequiredMessage('этой функции'),
            show_alert: true,
        });
    });

    return composer;
}
