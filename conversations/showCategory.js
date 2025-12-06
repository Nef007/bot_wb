import { InlineKeyboard } from 'grammy';
import { menuController } from '../controllers/menuController.js';
import { categoryModel } from '../db/models/category.js';

import { wbCategorySyncService } from '../market/wb/syncCategoryService.js';
import { userCategorySubscriptionModel } from '../db/models/userCategorySubscriptionModel.js';

/**
 * Conversation для выбора магазина и отображения категорий
 */
async function categoryConversation(conversation, ctx) {
    let marketType = null;
    let currentParentId = null;
    let messageIdToEdit = null;

    try {
        // Шаг 1: Выбор маркетплейса (если еще не выбран)
        if (!marketType) {
            // Удаляем сообщение, которое инициировало вызов (если есть)
            if (ctx.callbackQuery?.message) {
                await ctx
                    .deleteMessage()
                    .catch((e) => console.log("Couldn't delete initial message in categoryConversation", e));
            }

            // Показываем выбор маркетплейса
            const marketMessage = await ctx.reply(
                '🏪 <b>Выбор магазина</b>\n\nВыберите магазин для просмотра категорий:',
                {
                    reply_markup: new InlineKeyboard()
                        .text('📦 Wildberries', 'select_wb_categories')
                        .text('🚀 Ozon', 'select_ozon_categories')
                        .row()
                        .text('❌ Отмена', 'cancel_categories'),
                    parse_mode: 'HTML',
                }
            );

            messageIdToEdit = marketMessage.message_id;

            // Ждем выбора маркетплейса
            let marketChoiceCtx;
            while (true) {
                marketChoiceCtx = await conversation.wait();
                const data = marketChoiceCtx.callbackQuery?.data;

                if (
                    data === 'select_wb_categories' ||
                    data === 'select_ozon_categories' ||
                    data === 'cancel_categories'
                ) {
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
            marketType = marketChoiceCtx.callbackQuery.data === 'select_wb_categories' ? 'wb' : 'ozon';
            const marketName = marketType === 'wb' ? 'Wildberries' : 'Ozon';

            await marketChoiceCtx.answerCallbackQuery({ text: `✅ Выбран ${marketName}` });
        }

        const userId = String(ctx.from.id);

        // Проверяем, есть ли категории в базе для выбранного магазина
        const hasCategories = await categoryModel.hasCategories(marketType);
        if (!hasCategories) {
            await ctx.editMessageText('🔄 Загружаем категории...', {
                message_id: messageIdToEdit,
                chat_id: ctx.chat.id,
            });
            await wbCategorySyncService.safeSyncWithWB(marketType);
        }

        // Основной цикл навигации по категориям
        let shouldContinue = true;
        while (shouldContinue) {
            let categories;
            let menuHtml;
            let backButton = 'market_selection';

            if (currentParentId === null) {
                // Показываем категории первого уровня для выбранного магазина
                categories = await categoryModel.findByParentId(null, marketType);

                if (categories.length === 0) {
                    const marketName = marketType === 'wb' ? 'Wildberries' : 'Ozon';
                    await ctx.editMessageText(
                        `❌ Не удалось загрузить категории для ${marketName}. Попробуйте позже.`,
                        {
                            message_id: messageIdToEdit,
                            chat_id: ctx.chat.id,
                            reply_markup: new InlineKeyboard()
                                .text('🔄 Попробовать снова', 'retry_categories')
                                .text('📋 Главное меню', 'main_menu'),
                        }
                    );

                    // Ждем решения пользователя
                    const retryCtx = await conversation.wait();
                    if (retryCtx.callbackQuery?.data === 'retry_categories') {
                        await retryCtx.answerCallbackQuery({ text: '🔄 Обновляем...' });
                        await wbCategorySyncService.safeSyncWithWB(marketType);
                        continue;
                    } else {
                        await menuController.getMenu(ctx);
                        return;
                    }
                }

                const marketName = marketType === 'wb' ? 'Wildberries' : 'Ozon';
                const marketIcon = marketType === 'wb' ? '📦' : '🚀';
                menuHtml = `${marketIcon} <b>Категории ${marketName}</b>\n\nВыберите категорию:`;
            } else {
                // Показываем дочерние категории
                categories = await categoryModel.findByParentId(currentParentId, marketType);
                const parentCategory = await categoryModel.findById(currentParentId);

                if (!parentCategory) {
                    await ctx.editMessageText('❌ Родительская категория не найдена', {
                        message_id: messageIdToEdit,
                        chat_id: ctx.chat.id,
                        reply_markup: new InlineKeyboard().text('⬅️ Назад', 'market_selection'),
                    });
                    currentParentId = null;
                    continue;
                }

                menuHtml = `📂 <b>${parentCategory.full_name}</b>\n\nВыберите подкатегорию:`;
                backButton = parentCategory.parent_id ? `category_${parentCategory.parent_id}` : 'market_selection';
            }

            const keyboard = new InlineKeyboard();

            // Добавляем кнопки категорий с проверкой подписки
            for (const category of categories) {
                const isSubscribed = await userCategorySubscriptionModel.isSubscribed(userId, category.id);

                let buttonText;
                let callbackData;

                if (category.has_children) {
                    // Для категорий с подкатегориями
                    buttonText = isSubscribed ? `✅ 📁 ${category.name}` : `📁 ${category.name}`;
                    callbackData = `category_${category.id}`;
                } else {
                    // Для конечных категорий
                    buttonText = isSubscribed ? `✅ 📦 ${category.name}` : `📦 ${category.name}`;
                    callbackData = isSubscribed ? `subscription_detail_${category.id}` : `subscribe_${category.id}`;
                }

                keyboard.text(buttonText, callbackData).row();
            }

            // Кнопки управления
            if (currentParentId !== null) {
                keyboard.text('⬅️ Назад', backButton).row();
            }

            keyboard.text('🔄 Сменить магазин', 'market_selection').text('📋 Главное меню', 'main_menu');

            // Обновляем сообщение
            await ctx.editMessageText(menuHtml, {
                message_id: messageIdToEdit,
                chat_id: ctx.chat.id,
                reply_markup: keyboard,
                parse_mode: 'HTML',
            });

            // Ждем действия пользователя
            const actionCtx = await conversation.wait();
            const data = actionCtx.callbackQuery?.data;

            if (!data) {
                await ctx.reply('❌ Пожалуйста, используйте кнопки для навигации.');
                continue;
            }

            await actionCtx.answerCallbackQuery();

            if (data === 'market_selection') {
                // Возврат к выбору магазина
                marketType = null;
                currentParentId = null;
                continue;
            } else if (data === 'main_menu') {
                // Возврат в главное меню
                await menuController.getMenu(ctx);
                return;
            } else if (data.startsWith('category_')) {
                // Переход в подкатегорию
                const categoryId = data.split('_')[1];
                currentParentId = categoryId;
            } else if (data.startsWith('subscribe_')) {
                // Подписка на категорию
                const categoryId = data.split('_')[1];
                await handleSubscribe(actionCtx, conversation, categoryId, marketType, messageIdToEdit);
            } else if (data.startsWith('subscription_detail_')) {
                // Просмотр деталей подписки
                const categoryId = data.split('_')[2];
                await showSubscriptionDetail(actionCtx, conversation, categoryId, marketType, messageIdToEdit, false);
            } else if (data.startsWith('set_threshold_')) {
                // Установка порога уведомлений
                const parts = data.split('_');
                const categoryId = parts[2];
                const threshold = parseInt(parts[3]);
                await handleSetThreshold(actionCtx, conversation, categoryId, threshold, marketType, messageIdToEdit);
            } else if (data.startsWith('unsubscribe_')) {
                // Отписка от категории
                const categoryId = data.split('_')[1];
                await handleUnsubscribe(actionCtx, conversation, categoryId, marketType, messageIdToEdit);
            }
        }
    } catch (error) {
        console.error('❌ Ошибка в categoryConversation:', error);
        await ctx.reply('❌ Произошла ошибка при работе с категориями. Пожалуйста, попробуйте еще раз.', {
            reply_markup: new InlineKeyboard()
                .text('🔄 Попробовать снова', 'categories_menu')
                .text('📋 Главное меню', 'main_menu'),
        });
    }
}

/**
 * Обработка подписки на категорию
 */
async function handleSubscribe(ctx, conversation, categoryId, marketType, messageIdToEdit) {
    const userId = String(ctx.from.id);

    const category = await categoryModel.findById(categoryId);
    if (!category) {
        await ctx.answerCallbackQuery({ text: '❌ Категория не найдена' });
        return;
    }

    // Проверяем, не подписан ли уже пользователь
    const existingSubscription = await userCategorySubscriptionModel.findByUserAndCategory(userId, categoryId);
    if (existingSubscription) {
        await ctx.answerCallbackQuery({ text: '✅ Вы уже подписаны на эту категорию' });
        await showSubscriptionDetail(ctx, conversation, categoryId, marketType, messageIdToEdit, false);
        return;
    }

    // Создаем подписку с настройками по умолчанию
    await userCategorySubscriptionModel.create(userId, categoryId, marketType, {
        alertThreshold: 10,
        scanPages: 10,
    });

    console.log(`✅ Пользователь ${userId} подписан на категорию ${categoryId} (${marketType})`);
    await ctx.answerCallbackQuery({ text: '✅ Подписка оформлена!' });

    // Показываем детали подписки
    await showSubscriptionDetail(ctx, conversation, categoryId, marketType, messageIdToEdit, false);
}

/**
 * Показать детали подписки
 */
async function showSubscriptionDetail(
    ctx,
    conversation,
    categoryId,
    marketType,
    messageIdToEdit,
    fromMySubscriptions = false
) {
    const userId = String(ctx.from.id);

    const category = await categoryModel.findById(categoryId);
    const subscription = await userCategorySubscriptionModel.findByUserAndCategory(userId, categoryId);

    if (!category) {
        await ctx.answerCallbackQuery({ text: '❌ Категория не найдена' });
        return;
    }

    const currentThreshold = subscription.alert_threshold;
    const marketName = marketType === 'wb' ? 'Wildberries' : 'Ozon';
    const marketIcon = marketType === 'wb' ? '📦' : '🚀';

    const menuHtml = `
${marketIcon} <b>${category.full_name}</b>

✅ <b>Вы подписаны на отслеживание</b>

📊 <b>Текущие настройки:</b>
• Порог уведомлений: ${subscription.alert_threshold}%
• Количество страниц: ${subscription.scan_pages}

🕒 <b>Последняя проверка:</b>
${subscription.last_scan_at ? formatLocalDateTime(subscription.last_scan_at) : 'Еще не было'}
    `;

    const keyboard = new InlineKeyboard()
        .text(currentThreshold === 10 ? '✅ 10%' : '10%', `set_threshold_${categoryId}_10`)
        .text(currentThreshold === 20 ? '✅ 20%' : '20%', `set_threshold_${categoryId}_20`)
        .text(currentThreshold === 30 ? '✅ 30%' : '30%', `set_threshold_${categoryId}_30`)
        .text(currentThreshold === 40 ? '✅ 40%' : '40%', `set_threshold_${categoryId}_40`)
        .row()
        .text(currentThreshold === 50 ? '✅ 50%' : '50%', `set_threshold_${categoryId}_50`)
        .text(currentThreshold === 60 ? '✅ 60%' : '60%', `set_threshold_${categoryId}_60`)
        .text(currentThreshold === 70 ? '✅ 70%' : '70%', `set_threshold_${categoryId}_70`)
        .text(currentThreshold === 80 ? '✅ 80%' : '80%', `set_threshold_${categoryId}_80`)
        .row()
        .text('❌ Отписаться', `unsubscribe_${categoryId}`)
        .row();

    // Определяем куда ведет кнопка "Назад"
    let backButton;
    if (fromMySubscriptions) {
        backButton = 'my_subscriptions';
    } else if (category.parent_id) {
        backButton = `category_${category.parent_id}`;
    } else {
        backButton = 'market_selection';
    }

    keyboard.text('⬅️ Назад', backButton);

    await ctx.editMessageText(menuHtml, {
        message_id: messageIdToEdit,
        chat_id: ctx.chat.id,
        reply_markup: keyboard,
        parse_mode: 'HTML',
    });
}

/**
 * Установка порога уведомлений
 */
async function handleSetThreshold(ctx, conversation, categoryId, threshold, marketType, messageIdToEdit) {
    const userId = String(ctx.from.id);

    const subscription = await userCategorySubscriptionModel.findByUserAndCategory(userId, categoryId);
    if (!subscription) {
        await ctx.answerCallbackQuery({ text: '❌ Подписка не найдена' });
        return;
    }

    // Обновляем порог
    await userCategorySubscriptionModel.updateThreshold(subscription.id, threshold);

    console.log(`⚙️ Пользователь ${userId} установил порог ${threshold}% для категории ${categoryId}`);
    await ctx.answerCallbackQuery({ text: `✅ Порог уведомлений установлен: ${threshold}%` });

    // Обновляем сообщение с новым порогом
    await showSubscriptionDetail(ctx, conversation, categoryId, marketType, messageIdToEdit, false);
}

/**
 * Отписка от категории
 */
async function handleUnsubscribe(ctx, conversation, categoryId, marketType, messageIdToEdit) {
    const userId = String(ctx.from.id);

    const subscription = await userCategorySubscriptionModel.findByUserAndCategory(userId, categoryId);
    if (!subscription) {
        await ctx.answerCallbackQuery({ text: '❌ Подписка не найдена' });
        return;
    }

    // Удаляем подписку
    await userCategorySubscriptionModel.deleteByUserAndCategory(userId, categoryId);

    console.log(`❌ Пользователь ${userId} отписался от категории ${categoryId}`);
    await ctx.answerCallbackQuery({ text: '❌ Подписка отменена' });

    // Возвращаемся к списку категорий
    await showCategoriesList(ctx, conversation, null, marketType, messageIdToEdit);
}

/**
 * Показать список категорий
 */
async function showCategoriesList(ctx, conversation, parentId, marketType, messageIdToEdit) {
    const userId = String(ctx.from.id);

    let categories;
    let menuHtml;
    let backButton = 'market_selection';

    if (parentId === null) {
        categories = await categoryModel.findByParentId(null, marketType);
        const marketName = marketType === 'wb' ? 'Wildberries' : 'Ozon';
        const marketIcon = marketType === 'wb' ? '📦' : '🚀';
        menuHtml = `${marketIcon} <b>Категории ${marketName}</b>\n\nВыберите категорию:`;
    } else {
        categories = await categoryModel.findByParentId(parentId, marketType);
        const parentCategory = await categoryModel.findById(parentId);

        if (!parentCategory) {
            await ctx.answerCallbackQuery({ text: '❌ Родительская категория не найдена' });
            return;
        }

        menuHtml = `📂 <b>${parentCategory.full_name}</b>\n\nВыберите подкатегорию:`;
        backButton = parentCategory.parent_id ? `category_${parentCategory.parent_id}` : 'market_selection';
    }

    const keyboard = new InlineKeyboard();

    for (const category of categories) {
        const isSubscribed = await userCategorySubscriptionModel.isSubscribed(userId, category.id);

        let buttonText;
        let callbackData;

        if (category.has_children) {
            buttonText = isSubscribed ? `✅ 📁 ${category.name}` : `📁 ${category.name}`;
            callbackData = `category_${category.id}`;
        } else {
            buttonText = isSubscribed ? `✅ 📦 ${category.name}` : `📦 ${category.name}`;
            callbackData = isSubscribed ? `subscription_detail_${category.id}` : `subscribe_${category.id}`;
        }

        keyboard.text(buttonText, callbackData).row();
    }

    keyboard.text('⬅️ Назад', backButton).text('🔄 Сменить магазин', 'market_selection').row();

    await ctx.editMessageText(menuHtml, {
        message_id: messageIdToEdit,
        chat_id: ctx.chat.id,
        reply_markup: keyboard,
        parse_mode: 'HTML',
    });
}

export default categoryConversation;
