// conversations/showCategory.js
import { InlineKeyboard } from 'grammy';
import { menuController } from '../controllers/menuController.js';
import { categoryModel } from '../db/models/category.js';
import { wbCategorySyncService } from '../market/wb/syncCategoryService.js';
import { ozonCategorySyncService } from '../market/ozon/syncCategoryService.js';

/**
 * Conversation для выбора магазина
 */
async function categoryConversation(conversation, ctx) {
    try {
        // Удаляем сообщение, которое инициировало вызов (если есть)
        if (ctx.callbackQuery?.message) {
            await ctx
                .deleteMessage()
                .catch((e) => console.log("Couldn't delete initial message in categoryConversation", e));
        }

        // Показываем выбор маркетплейса
        const marketMessage = await ctx.reply('🏪 <b>Выбор магазина</b>\n\nВыберите магазин для просмотра категорий:', {
            reply_markup: new InlineKeyboard()
                .text('📦 Wildberries', 'select_wb_categories')
                .text('🚀 Ozon', 'select_ozon_categories')
                .row()
                .text('❌ Отмена', 'cancel_categories'),
            parse_mode: 'HTML',
        });

        // Ждем выбора маркетплейса
        let marketChoiceCtx;
        while (true) {
            marketChoiceCtx = await conversation.wait();
            const data = marketChoiceCtx.callbackQuery?.data;

            if (data === 'select_wb_categories' || data === 'select_ozon_categories' || data === 'cancel_categories') {
                break;
            } else {
                await ctx.reply('❌ Пожалуйста, выберите один из предложенных магазинов или нажмите "Отмена".');
            }
        }

        // Обработка отмены
        if (marketChoiceCtx.callbackQuery.data === 'cancel_categories') {
            await marketChoiceCtx.answerCallbackQuery({ text: '❌ Отменено' });
            await ctx.api
                .deleteMessage(marketMessage.chat.id, marketMessage.message_id)
                .catch((e) => console.log("Couldn't delete market choice message on cancel", e));
            await menuController.getMenu(ctx);
            return;
        }

        // Устанавливаем выбранный маркетплейс
        const marketType = marketChoiceCtx.callbackQuery.data === 'select_wb_categories' ? 'wb' : 'ozon';
        const marketName = marketType === 'wb' ? 'Wildberries' : 'Ozon';

        await marketChoiceCtx.answerCallbackQuery({ text: `✅ Выбран ${marketName}` });

        // Проверяем, есть ли категории в базе для выбранного магазина
        const hasCategories = await categoryModel.hasCategories(marketType);
        if (!hasCategories) {
            await ctx.editMessageText('🔄 Загружаем категории...', {
                message_id: marketMessage.message_id,
                chat_id: ctx.chat.id,
            });

            // Используем правильный сервис для синхронизации
            let syncSuccess = false;
            if (marketType === 'wb') {
                syncSuccess = await wbCategorySyncService.safeSyncWithWB();
            } else if (marketType === 'ozon') {
                syncSuccess = await ozonCategorySyncService.safeSyncWithOzon();
            }

            if (!syncSuccess) {
                await ctx.editMessageText(`❌ Не удалось загрузить категории для ${marketName}. Попробуйте позже.`, {
                    message_id: marketMessage.message_id,
                    chat_id: ctx.chat.id,
                    reply_markup: new InlineKeyboard()
                        .text('🔄 Попробовать снова', 'start_categories')
                        .text('📋 Главное меню', 'main_menu'),
                });
                return;
            }
        }

        // Передаем управление контроллеру категорий с параметром marketType
        await conversation.external(async () => {
            const { categoryController } = await import('../controllers/categoryController.js');
            await categoryController.showCategories(ctx, null, marketMessage.message_id, marketType);
        });
    } catch (error) {
        console.error('❌ Ошибка в categoryConversation:', error);

        try {
            await ctx.reply('❌ Произошла ошибка при выборе магазина. Пожалуйста, попробуйте еще раз.', {
                reply_markup: new InlineKeyboard()
                    .text('🔄 Попробовать снова', 'start_categories')
                    .text('📋 Главное меню', 'main_menu'),
            });
        } catch (sendError) {
            console.error('❌ Не удалось отправить сообщение об ошибке:', sendError);
        }
    }
}

export default categoryConversation;
