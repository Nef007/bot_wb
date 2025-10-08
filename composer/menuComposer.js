import { Composer } from 'grammy';
import { menuController } from '../controllers/menuController.js';

export function createMenuComposer() {
    const composer = new Composer();

    // Главное меню
    composer.command('main_menu', async (ctx) => {
        await menuController.getMenu(ctx);
    });

    // Главное меню
    composer.callbackQuery('main_menu', async (ctx) => {
        await menuController.getMenu(ctx, ctx.callbackQuery.message.message_id);
        await ctx.answerCallbackQuery();
    });

    return composer;
}
