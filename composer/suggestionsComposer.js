import { Composer } from 'grammy';
import { suggestionsController } from '../controllers/suggestionsController.js';

export function createSuggestionsComposer() {
    const composer = new Composer();

    // Основная кнопка "Идеи/предложения"
    composer.callbackQuery('suggestions', async (ctx) => {
        await suggestionsController.showSuggestionsInfo(ctx);
    });

    // Подтверждение вступления в группу
    composer.callbackQuery('joined_group', async (ctx) => {
        await suggestionsController.handleJoinedConfirmation(ctx);
    });

    // Дополнительные кнопки
    composer.callbackQuery('suggest_idea', async (ctx) => {
        await ctx.answerCallbackQuery({
            text: 'Переходи в группу и пиши свои идеи! 💡',
        });
    });

    composer.callbackQuery('go_to_group', async (ctx) => {
        await ctx.answerCallbackQuery({
            text: 'Открываю ссылку на группу...',
        });
        // Можно добавить открытие ссылки через веб-приложение
    });

    // Команда для быстрого доступа /suggestions
    composer.command('suggestions', async (ctx) => {
        await suggestionsController.showSuggestionsInfo(ctx);
    });

    return composer;
}
