import { Composer } from 'grammy';
import { categoryController } from '../controllers/categoryController.js';

export function createCategoryComposer() {
    const composer = new Composer();

    // Меню категорий
    composer.callbackQuery('categories_menu', async (ctx) => {
        await categoryController.showCategories(ctx, null, ctx.callbackQuery.message.message_id);
        await ctx.answerCallbackQuery();
    });

    // Навигация по категориям
    composer.callbackQuery(/^category_(\d+)$/, async (ctx) => {
        const [, categoryId] = ctx.match;
        await categoryController.showCategories(ctx, parseInt(categoryId), ctx.callbackQuery.message.message_id);
        await ctx.answerCallbackQuery();
    });

    // Подписка на категорию
    composer.callbackQuery(/^subscribe_(\d+)$/, async (ctx) => {
        const [, categoryId] = ctx.match;
        await categoryController.showCategoryDetail(ctx, parseInt(categoryId), ctx.callbackQuery.message.message_id);
        await ctx.answerCallbackQuery();
    });

    // Настройка подписки
    composer.callbackQuery(/^configure_subscribe_(\d+)$/, async (ctx) => {
        const [, categoryId] = ctx.match;
        // Здесь будет логика настройки подписки
        await ctx.answerCallbackQuery({ text: '⚙️ Настройка подписки' });
    });

    // Подписка на категорию (из детального просмотра)
    composer.callbackQuery(/^subscribe_category_(\d+)$/, async (ctx) => {
        const [, categoryId] = ctx.match;
        await categoryController.subscribeToCategory(ctx, parseInt(categoryId), ctx.callbackQuery.message.message_id);
    });

    // Детали подписки
    composer.callbackQuery(/^subscription_detail_(\d+)$/, async (ctx) => {
        const [, categoryId] = ctx.match;
        await categoryController.showSubscriptionDetail(
            ctx,
            parseInt(categoryId),
            ctx.callbackQuery.message.message_id,
            false // Обычный переход (не из "Мои подписки")
        );
        await ctx.answerCallbackQuery();
    });

    // Отписка от категории
    composer.callbackQuery(/^unsubscribe_(\d+)$/, async (ctx) => {
        const [, categoryId] = ctx.match;
        await categoryController.unsubscribeFromCategory(ctx, parseInt(categoryId));
    });

    // Мои подписки
    composer.callbackQuery('my_subscriptions', async (ctx) => {
        await categoryController.showMySubscriptions(ctx, ctx.callbackQuery.message.message_id);
        await ctx.answerCallbackQuery();
    });

    // Пагинация подписок
    composer.callbackQuery(/^subscriptions_page_(\d+)$/, async (ctx) => {
        const [, page] = ctx.match;
        await categoryController.showMySubscriptionsPage(ctx, parseInt(page), ctx.callbackQuery.message.message_id);
        await ctx.answerCallbackQuery();
    });

    // Детали подписки из "Мои подписки"
    composer.callbackQuery(/^subscription_detail_from_my_(\d+)$/, async (ctx) => {
        const [, categoryId] = ctx.match;
        await categoryController.showSubscriptionDetail(
            ctx,
            parseInt(categoryId),
            ctx.callbackQuery.message.message_id,
            true // Указываем что пришли из "Мои подписки"
        );
        await ctx.answerCallbackQuery();
    });

    // Установка порога уведомлений
    composer.callbackQuery(/^set_threshold_(\d+)_(\d+)$/, async (ctx) => {
        const [, categoryId, threshold] = ctx.match;
        await categoryController.setThreshold(ctx, parseInt(categoryId), parseInt(threshold));
    });

    return composer;
}
