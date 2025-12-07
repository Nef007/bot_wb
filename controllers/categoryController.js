// controllers/categoryController.js
import { InlineKeyboard } from 'grammy';
import { categoryModel } from '../db/models/category.js';
import { formatLocalDateTime } from '../lib/main.js';
import { userCategorySubscriptionModel } from '../db/models/userCategorySubscriptionModel.js';
import { userProductSubscriptionModel } from '../db/models/userProductSubscriptionModel.js';
import { menuController } from './menuController.js';

export const categoryController = {
    /**
     * Запуск conversation для выбора магазина
     */
    startCategoryConversation: async (ctx, parentId = null, messageIdToEdit = null) => {
        try {
            await ctx.conversation.enter('categoryConversation');
        } catch (e) {
            console.error('ОШИБКА ЗАПУСКА CATEGORY CONVERSATION', e);
            await ctx.reply(`❌ Ошибка при запуске категорий: ${e.message || e}`);
        }
    },

    /**
     * Показать категории
     */
    showCategories: async (ctx, parentId = null, messageIdToEdit = null, marketType = null) => {
        try {
            const userId = String(ctx.from.id);
            const selectedMarket = marketType || 'wb';

            let categories;
            let menuHtml;
            let backButton = 'start_categories';

            if (parentId === null) {
                categories = await categoryModel.findByParentId(null, selectedMarket);

                if (categories.length === 0) {
                    const marketName = selectedMarket === 'wb' ? 'Wildberries' : 'Ozon';
                    await ctx.editMessageText(
                        `❌ Не удалось загрузить категории для ${marketName}. Попробуйте позже.`,
                        {
                            message_id: messageIdToEdit,
                            chat_id: ctx.chat.id,
                            reply_markup: new InlineKeyboard()
                                .text('🔄 Попробовать снова', 'start_categories')
                                .text('📋 Главное меню', 'main_menu'),
                        }
                    );
                    return;
                }

                const marketName = selectedMarket === 'wb' ? 'Wildberries' : 'Ozon';
                const marketIcon = selectedMarket === 'wb' ? '📦' : '🚀';
                menuHtml = `${marketIcon} <b>Категории ${marketName}</b>\n\nВыберите категорию:`;
            } else {
                categories = await categoryModel.findByParentId(parentId, selectedMarket);
                const parentCategory = await categoryModel.findById(parentId);

                if (!parentCategory) {
                    await ctx.editMessageText('❌ Родительская категория не найдена', {
                        message_id: messageIdToEdit,
                        chat_id: ctx.chat.id,
                        reply_markup: new InlineKeyboard()
                            .text('⬅️ Назад', 'start_categories')
                            .text('📋 Главное меню', 'main_menu'),
                    });
                    return;
                }

                menuHtml = `📂 <b>${parentCategory.full_name}</b>\n\nВыберите подкатегорию:`;
                backButton = parentCategory.parent_id
                    ? `category_${parentCategory.catalog_type}_${parentCategory.parent_id}`
                    : 'start_categories';
            }

            const keyboard = new InlineKeyboard();

            // Добавляем кнопки категорий с проверкой подписки
            for (const category of categories) {
                const isSubscribed = await userCategorySubscriptionModel.isSubscribed(userId, category.id);

                let buttonText;
                let callbackData;

                if (category.has_children) {
                    buttonText = isSubscribed ? `✅ 📁 ${category.name}` : `📁 ${category.name}`;
                    callbackData = `category_${selectedMarket}_${category.id}`;
                } else {
                    // Для конечных категорий: если подписан - детали подписки, если нет - детали категории
                    buttonText = isSubscribed ? `✅ 📦 ${category.name}` : `📦 ${category.name}`;
                    callbackData = isSubscribed
                        ? `subscription_detail_${category.id}` // если уже подписан
                        : `show_category_detail_${category.id}`; // если еще не подписан
                }

                keyboard.text(buttonText, callbackData).row();
            }

            // Кнопки управления
            if (parentId !== null) {
                keyboard.text('⬅️ Назад', backButton).row();
            }

            keyboard.text('🔄 Сменить магазин', 'start_categories').text('📋 Главное меню', 'main_menu');

            await ctx.editMessageText(menuHtml, {
                message_id: messageIdToEdit,
                chat_id: ctx.chat.id,
                reply_markup: keyboard,
                parse_mode: 'HTML',
            });
        } catch (e) {
            console.error('ОШИБКА ПОКАЗА КАТЕГОРИЙ', e);
            await ctx.reply(`❌ Ошибка при загрузке категорий: ${e.message || e}`);
        }
    },
    /**
     * Показать детали категории (до подписки)
     */
    showCategoryDetail: async (ctx, categoryId, messageIdToEdit = null) => {
        try {
            const userId = String(ctx.from.id);
            const category = await categoryModel.findById(categoryId);

            if (!category) {
                await ctx.reply('❌ Категория не найдена');
                return;
            }

            // Проверяем, подписан ли пользователь
            const isSubscribed = await userCategorySubscriptionModel.isSubscribed(userId, categoryId);

            // Если уже подписан - показываем детали подписки
            if (isSubscribed) {
                await categoryController.showSubscriptionDetail(ctx, categoryId, messageIdToEdit, false);
                return;
            }

            const marketIcon = category.catalog_type === 'wb' ? '📦' : '🚀';

            const menuHtml = `
${marketIcon} <b>${category.full_name}</b>

Вы можете подписаться на отслеживание цен в этой категории.

🔍 <b>Что будет отслеживаться:</b>
• Все товары в категории
• Изменения цен
• Новые поступления

📊 <b>Настройки по умолчанию:</b>
• Порог уведомлений: 10%
• Количество страниц: 10

<b>Нажмите кнопку ниже, чтобы подписаться:</b>
        `;

            const keyboard = new InlineKeyboard()
                .text('✅ Подписаться', `subscribe_category_${categoryId}`)
                .row()
                .text(
                    '⬅️ Назад',
                    category.parent_id ? `category_${category.catalog_type}_${category.parent_id}` : 'start_categories'
                );

            // Встроенная логика редактирования/отправки сообщения
            try {
                if (messageIdToEdit) {
                    await ctx.editMessageText(menuHtml, {
                        message_id: messageIdToEdit,
                        chat_id: ctx.chat.id,
                        reply_markup: keyboard,
                        parse_mode: 'HTML',
                    });
                } else {
                    await ctx.reply(menuHtml, {
                        reply_markup: keyboard,
                        parse_mode: 'HTML',
                    });
                }
            } catch (error) {
                // Если ошибка "message is not modified" или сообщение не найдено
                if (
                    error.description &&
                    (error.description.includes('not modified') || error.description.includes('not found'))
                ) {
                    await ctx.reply(menuHtml, {
                        reply_markup: keyboard,
                        parse_mode: 'HTML',
                    });
                } else {
                    throw error;
                }
            }
        } catch (e) {
            console.error('ОШИБКА ПОЛУЧЕНИЯ ДЕТАЛЕЙ КАТЕГОРИИ', e);
            await ctx.reply(`❌ Ошибка при загрузке категории: ${e.message || e}`);
        }
    },
    /**
     * Показать подтверждение подписки
     */
    showSubscribeConfirmation: async (ctx, categoryId, messageIdToEdit = null) => {
        try {
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
                await categoryController.showSubscriptionDetail(ctx, categoryId, messageIdToEdit, false);
                return;
            }

            const marketIcon = category.catalog_type === 'wb' ? '📦' : '🚀';

            const menuHtml = `
${marketIcon} <b>${category.full_name}</b>

📋 <b>Подтверждение подписки</b>

Вы собираетесь подписаться на отслеживание этой категории.

✅ <b>Что будет отслеживаться:</b>
• Все товары в категории
• Изменения цен
• Новые поступления

⚙️ <b>Настройки по умолчанию:</b>
• Порог уведомлений: 10%
• Количество страниц: 10

<b>Подтвердите подписку:</b>
            `;

            const keyboard = new InlineKeyboard()
                .text('✅ Да, подписаться', `subscribe_category_${categoryId}`)
                .text('❌ Отмена', `show_category_detail_${categoryId}`)
                .row();

            await categoryController._safeEditOrSendMessage(ctx, menuHtml, keyboard, messageIdToEdit);
        } catch (e) {
            console.error('ОШИБКА ПОКАЗА ПОДТВЕРЖДЕНИЯ ПОДПИСКИ', e);
            await ctx.reply(`❌ Ошибка: ${e.message || e}`);
        }
    },

    /**
     * Подписаться на категорию
     */
    subscribeToCategory: async (ctx, categoryId, messageIdToEdit = null) => {
        try {
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
                await categoryController.showSubscriptionDetail(ctx, categoryId, messageIdToEdit, false);
                return;
            }

            // Создаем подписку с настройками по умолчанию
            await userCategorySubscriptionModel.create(userId, categoryId, category.catalog_type, {
                alertThreshold: 10,
                scanPages: 10,
            });

            console.log(`✅ Пользователь ${userId} подписан на категорию ${categoryId}`);
            await ctx.answerCallbackQuery({ text: '✅ Подписка оформлена!' });

            // Показываем детали подписки
            await categoryController.showSubscriptionDetail(ctx, categoryId, messageIdToEdit, false);
        } catch (e) {
            console.error('ОШИБКА ПОДПИСКИ НА КАТЕГОРИЮ', e);
            await ctx.answerCallbackQuery({ text: '❌ Ошибка при оформлении подписки' });
        }
    },

    /**
     * Показать детали подписки (когда пользователь уже подписан)
     */
    showSubscriptionDetail: async (ctx, categoryId, messageIdToEdit = null, fromMySubscriptions = false) => {
        try {
            const userId = String(ctx.from.id);
            const category = await categoryModel.findById(categoryId);
            const subscription = await userCategorySubscriptionModel.findByUserAndCategory(userId, categoryId);

            if (!category || !subscription) {
                await ctx.reply('❌ Подписка не найдена');
                return;
            }

            const currentThreshold = subscription.alert_threshold;
            const marketIcon = subscription.catalog_type === 'wb' ? '📦' : '🚀';

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
                backButton = `category_${category.catalog_type}_${category.parent_id}`;
            } else {
                backButton = 'start_categories';
            }

            keyboard.text('⬅️ Назад', backButton);

            await categoryController._safeEditOrSendMessage(ctx, menuHtml, keyboard, messageIdToEdit);
        } catch (e) {
            console.error('ОШИБКА ПОКАЗА ДЕТАЛЕЙ ПОДПИСКИ', e);
            await ctx.reply(`❌ Ошибка при загрузке подписки: ${e.message || e}`);
        }
    },

    /**
     * Вспомогательный метод для безопасного редактирования/отправки сообщений
     */
    _safeEditOrSendMessage: async (ctx, text, keyboard, messageIdToEdit) => {
        try {
            if (messageIdToEdit) {
                await ctx.editMessageText(text, {
                    message_id: messageIdToEdit,
                    chat_id: ctx.chat.id,
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            } else {
                await ctx.reply(text, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            }
        } catch (error) {
            // Если ошибка "message is not modified" или сообщение не найдено
            if (
                error.description &&
                (error.description.includes('not modified') || error.description.includes('not found'))
            ) {
                await ctx.reply(text, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            } else {
                throw error;
            }
        }
    },

    /**
     * Показать мои подписки (категории + товары)
     */
    showMySubscriptions: async (ctx, messageIdToEdit = null) => {
        try {
            const userId = String(ctx.from.id);
            const categorySubscriptions = await userCategorySubscriptionModel.findByUserId(userId);
            const productSubscriptions = await userProductSubscriptionModel.findByUserId(userId);
            const totalSubscriptions = categorySubscriptions.length + productSubscriptions.length;

            if (totalSubscriptions === 0) {
                const menuHtml = `
📋 <b>Мои подписки</b>

У вас пока нет активных подписок.

Вы можете:
• Подписаться на категории в разделе "📂 Категории"
• Добавить конкретный товар через "➕ Добавить товар"
                `;

                const keyboard = new InlineKeyboard()
                    .text('📂 Категории', 'start_categories')
                    .text('➕ Добавить товар', 'add_product')
                    .text('⬅️ Назад', 'main_menu')
                    .row();

                await categoryController._safeEditOrSendMessage(ctx, menuHtml, keyboard, messageIdToEdit);
                return;
            }

            const menuHtml = `
📋 <b>Мои подписки</b>

Всего активных подписок: <b>${totalSubscriptions}</b>
• 📂 Категорий: ${categorySubscriptions.length}
• 📦 Товаров: ${productSubscriptions.length}

<b>Выберите подписку для управления:</b>
            `;

            const keyboard = new InlineKeyboard();

            // Добавляем категории
            categorySubscriptions.forEach((subscription) => {
                const shortName =
                    subscription.category_name.length > 35
                        ? subscription.category_name.substring(0, 35) + '...'
                        : subscription.category_name;

                keyboard
                    .text(
                        `📂 ${subscription.catalog_type === 'wb' ? '🟣' : '🔵'} ${shortName}`,
                        `subscription_detail_from_my_${subscription.category_id}`
                    )
                    .row();
            });

            // Добавляем товары
            productSubscriptions.forEach((subscription) => {
                const shortName =
                    subscription.product_name.length > 35
                        ? subscription.product_name.substring(0, 35) + '...'
                        : subscription.product_name;

                keyboard
                    .text(
                        `📦 ${subscription.catalog_type === 'wb' ? '🟣' : '🔵'} ${shortName}`,
                        `product_detail_from_my_${subscription.product_id}`
                    )
                    .row();
            });

            // Кнопки действий
            keyboard
                .text('📂 Добавить категории', 'start_categories')
                .text('➕ Добавить товар', 'add_product')
                .row()
                .text('⬅️ Назад', 'main_menu')
                .row();

            await categoryController._safeEditOrSendMessage(ctx, menuHtml, keyboard, messageIdToEdit);
        } catch (e) {
            console.error('ОШИБКА ПОКАЗА МОИХ ПОДПИСОК', e);
            await ctx.reply(`❌ Ошибка при загрузке подписок: ${e.message || e}`);
        }
    },

    setThreshold: async (ctx, categoryId, threshold) => {
        try {
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
            const messageText = ctx.callbackQuery.message.text || '';
            const fromMySubscriptions = messageText.includes('📋 <b>Мои подписки</b>');

            if (fromMySubscriptions) {
                await categoryController.showSubscriptionDetail(
                    ctx,
                    categoryId,
                    ctx.callbackQuery.message.message_id,
                    true
                );
            } else {
                await categoryController.showSubscriptionDetail(
                    ctx,
                    categoryId,
                    ctx.callbackQuery.message.message_id,
                    false
                );
            }
        } catch (e) {
            console.error('ОШИБКА УСТАНОВКИ ПОРОГА', e);
            await ctx.answerCallbackQuery({ text: '❌ Ошибка при изменении порога' });
        }
    },

    /**
     * Отписаться от категории
     */
    unsubscribeFromCategory: async (ctx, categoryId) => {
        try {
            const userId = String(ctx.from.id);
            const subscription = await userCategorySubscriptionModel.findByUserAndCategory(userId, categoryId);

            if (!subscription) {
                await ctx.answerCallbackQuery({ text: '❌ Подписка не найдена' });
                return;
            }

            // Удаляем подписку полностью
            await userCategorySubscriptionModel.deleteByUserAndCategory(userId, categoryId);

            console.log(`❌ Пользователь ${userId} отписался от категории ${categoryId}`);
            await ctx.answerCallbackQuery({ text: '❌ Подписка отменена' });

            // Возвращаемся либо в "Мои подписки", либо в начало категорий
            const messageText = ctx.callbackQuery.message.text || '';
            const fromMySubscriptions = messageText.includes('📋 <b>Мои подписки</b>');

            if (fromMySubscriptions) {
                await categoryController.showMySubscriptions(ctx, ctx.callbackQuery.message.message_id);
            } else {
                await categoryController.startCategoryConversation(ctx);
            }
        } catch (e) {
            console.error('ОШИБКА ОТПИСКИ ОТ КАТЕГОРИИ', e);
            await ctx.answerCallbackQuery({ text: '❌ Ошибка при отписке' });
        }
    },
};
