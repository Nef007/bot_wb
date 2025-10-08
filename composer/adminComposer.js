import { Composer } from 'grammy';
import { adminController } from '../controllers/adminController.js';
import { adminService } from '../services/adminService.js';

export function createAdminComposer() {
    const composer = new Composer();

    // Проверка прав администратора для всех обработчиков
    composer.use(async (ctx, next) => {
        if (ctx.callbackQuery?.data?.startsWith('admin_') || ctx.message?.text === '/admin') {
            const userId = String(ctx.from.id);
            if (!adminService.isAdmin(userId)) {
                if (ctx.callbackQuery) {
                    await ctx.answerCallbackQuery({ text: '❌ Доступ запрещен' });
                }
                return;
            }
        }
        await next();
    });

    // Команда /admin
    composer.command('admin', async (ctx) => {
        await adminController.showAdminMenu(ctx);
    });

    // Обработчики callback'ов
    composer.callbackQuery('admin_menu', async (ctx) => {
        await adminController.showAdminMenu(ctx);
    });

    composer.callbackQuery('admin_users', async (ctx) => {
        await adminController.showUsersList(ctx, 0);
    });

    composer.callbackQuery(/^admin_users:(\d+)$/, async (ctx) => {
        const [, page] = ctx.match;
        await adminController.showUsersList(ctx, parseInt(page));
    });

    composer.callbackQuery(/^admin_user:(.+)$/, async (ctx) => {
        const [, userId] = ctx.match;
        await adminController.showUserDetail(ctx, userId);
    });

    composer.callbackQuery(/^admin_user_orders:(.+)$/, async (ctx) => {
        const [, userId] = ctx.match;
        await adminController.showUserOrders(ctx, userId);
    });

    composer.callbackQuery(/^admin_order_detail:(.+)$/, async (ctx) => {
        const [, orderNumber] = ctx.match;
        await adminController.showOrderDetail(ctx, orderNumber);
    });

    composer.callbackQuery(/^admin_user_subscription:(.+)$/, async (ctx) => {
        const [, userId] = ctx.match;
        await adminController.showUserSubscription(ctx, userId);
    });

    // Обработчики действий
    composer.callbackQuery(/^admin_toggle_user:(.+)$/, async (ctx) => {
        const [, userId] = ctx.match;
        await adminController.handleAction(ctx, 'toggle_user', userId);
    });

    composer.callbackQuery(/^admin_delete_order:(.+)$/, async (ctx) => {
        const [, orderNumber] = ctx.match;
        await adminController.handleAction(ctx, 'delete_order', orderNumber);
    });

    composer.callbackQuery(/^admin_extend_sub:(.+):(\d+)$/, async (ctx) => {
        const [, userId, days] = ctx.match;
        await adminController.handleAction(ctx, 'extend_sub', userId, days);
    });

    composer.callbackQuery(/^admin_delete_sub:(.+)$/, async (ctx) => {
        const [, userId] = ctx.match;
        await adminController.handleAction(ctx, 'delete_sub', userId);
    });

    return composer;
}
