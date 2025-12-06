import { InlineKeyboard } from 'grammy';
import { categoryModel } from '../db/models/category.js';
import { formatLocalDateTime } from '../lib/main.js';
import { userCategorySubscriptionModel } from '../db/models/userCategorySubscriptionModel.js';
import { userProductSubscriptionModel } from '../db/models/userProductSubscriptionModel.js';

export const categoryController = {
    /**
     * Запуск conversation для работы с категориями
     */
    startCategoryConversation: async (ctx) => {
        try {
            await ctx.conversation.enter('categoryConversation');
        } catch (e) {
            console.error('ОШИБКА ЗАПУСКА CATEGORY CONVERSATION', e);
            await ctx.reply(`❌ Ошибка при запуске категорий: ${e.message || e}`);
        }
    },

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

            let menuHtml;
            let currentThreshold = 5; // По умолчанию

            if (isSubscribed) {
                const subscription = await userCategorySubscriptionModel.findByUserAndCategory(userId, categoryId);
                currentThreshold = subscription.alert_threshold;
                menuHtml = `
📦 <b>${category.full_name}</b>

✅ <b>Вы подписаны на отслеживание</b>

📊 <b>Текущие настройки:</b>
• Порог уведомлений: ${subscription.alert_threshold}%


🕒 <b>Последняя проверка:</b>
${subscription.last_scan_at ? formatLocalDateTime(subscription.last_scan_at) : 'Еще не было'}
                `;
            } else {
                menuHtml = `
📦 <b>${category.full_name}</b>

Вы можете подписаться на отслеживание цен в этой категории.

🔍 <b>Что будет отслеживаться:</b>
• Все товары в категории
• Изменения цен
• Новые поступления

📊 <b>Настройки по умолчанию:</b>
• Порог уведомлений: 10%

                `;
            }

            const keyboard = new InlineKeyboard();

            if (isSubscribed) {
                // Если подписан - показываем кнопки выбора порога и отписку
                keyboard
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
            } else {
                // Если не подписан - показываем подписку
                keyboard.text('✅ Подписаться', `subscribe_category_${categoryId}`).row();
            }

            keyboard.text('⬅️ Назад', category.parent_id ? `category_${category.parent_id}` : 'categories_menu');

            let finalMessage;
            if (messageIdToEdit) {
                finalMessage = await ctx.editMessageText(menuHtml, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            } else {
                finalMessage = await ctx.reply(menuHtml, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            }

            ctx.session.currentMenu = {
                type: 'category_detail',
                categoryId: categoryId,
                messageId: finalMessage.message_id,
            };
        } catch (e) {
            console.error('ОШИБКА ПОЛУЧЕНИЯ ДЕТАЛЕЙ КАТЕГОРИИ', e);
            await ctx.reply(`❌ Ошибка при загрузке категории: ${e.message || e}`);
        }
    },

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
                // Показываем детали подписки
                await categoryController.showCategoryDetail(ctx, categoryId, messageIdToEdit);
                return;
            }

            // Создаем подписку с настройками по умолчанию
            const subscriptionId = await userCategorySubscriptionModel.create(
                userId,
                categoryId,
                category.catalog_type,
                {
                    alertThreshold: 10,
                    scanPages: 10,
                }
            );

            console.log(`✅ Пользователь ${userId} подписан на категорию ${categoryId}`);

            await ctx.answerCallbackQuery({ text: '✅ Подписка оформлена!' });

            // Показываем детали подписки (теперь это будет показывать информацию о подписке)
            await categoryController.showCategoryDetail(ctx, categoryId, messageIdToEdit);
        } catch (e) {
            console.error('ОШИБКА ПОДПИСКИ НА КАТЕГОРИЮ', e);
            await ctx.answerCallbackQuery({ text: '❌ Ошибка при оформлении подписки' });
        }
    },

    /**
     * Показать мои подписки (категории + товары) - без изменений
     */
    showMySubscriptions: async (ctx, messageIdToEdit = null) => {
        // Оригинальный код остается без изменений
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

                let finalMessage;
                if (messageIdToEdit) {
                    finalMessage = await ctx.editMessageText(menuHtml, {
                        reply_markup: keyboard,
                        parse_mode: 'HTML',
                    });
                } else {
                    finalMessage = await ctx.reply(menuHtml, {
                        reply_markup: keyboard,
                        parse_mode: 'HTML',
                    });
                }

                ctx.session.currentMenu = {
                    type: 'my_subscriptions',
                    messageId: finalMessage.message_id,
                };
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

            let finalMessage;
            if (messageIdToEdit) {
                finalMessage = await ctx.editMessageText(menuHtml, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            } else {
                finalMessage = await ctx.reply(menuHtml, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            }

            ctx.session.currentMenu = {
                type: 'my_subscriptions',
                messageId: finalMessage.message_id,
            };
        } catch (e) {
            console.error('ОШИБКА ПОКАЗА МОИХ ПОДПИСОК', e);
            await ctx.reply(`❌ Ошибка при загрузке подписок: ${e.message || e}`);
        }
    },

    /**
     * Показать детали подписки из "Мои подписки"
     */
    showSubscriptionDetail: async (ctx, categoryId, messageIdToEdit = null, fromMySubscriptions = false) => {
        try {
            const userId = String(ctx.from.id);
            const category = await categoryModel.findById(categoryId);
            const subscription = await userCategorySubscriptionModel.findByUserAndCategory(userId, categoryId);

            if (!category) {
                await ctx.reply('❌ Категория не найдена');
                return;
            }

            const currentThreshold = subscription.alert_threshold;
            const marketName = subscription.catalog_type === 'wb' ? 'Wildberries' : 'Ozon';
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
                backButton = `category_${category.parent_id}`;
            } else {
                backButton = 'start_categories';
            }

            keyboard.text('⬅️ Назад', backButton);

            let finalMessage;
            if (messageIdToEdit) {
                finalMessage = await ctx.editMessageText(menuHtml, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            } else {
                finalMessage = await ctx.reply(menuHtml, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            }

            ctx.session.currentMenu = {
                type: 'subscription_detail',
                categoryId: categoryId,
                messageId: finalMessage.message_id,
                fromMySubscriptions: fromMySubscriptions,
            };
        } catch (e) {
            console.error('ОШИБКА ПОКАЗА ДЕТАЛЕЙ ПОДПИСКИ', e);
            await ctx.reply(`❌ Ошибка при загрузке подписки: ${e.message || e}`);
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
            const fromMySubscriptions = ctx.session.currentMenu?.fromMySubscriptions || false;

            if (fromMySubscriptions) {
                await categoryController.showSubscriptionDetail(
                    ctx,
                    categoryId,
                    ctx.callbackQuery.message.message_id,
                    true
                );
            } else {
                await categoryController.showCategoryDetail(ctx, categoryId, ctx.callbackQuery.message.message_id);
            }
        } catch (e) {
            console.error('ОШИБКА УСТАНОВКИ ПОРОГА', e);
            await ctx.answerCallbackQuery({ text: '❌ Ошибка при изменении порога' });
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
                    .text('📂 Категории', 'categories_menu')
                    .text('➕ Добавить товар', 'add_product')
                    .text('⬅️ Назад', 'main_menu')
                    .row();

                let finalMessage;
                if (messageIdToEdit) {
                    finalMessage = await ctx.editMessageText(menuHtml, {
                        reply_markup: keyboard,
                        parse_mode: 'HTML',
                    });
                } else {
                    finalMessage = await ctx.reply(menuHtml, {
                        reply_markup: keyboard,
                        parse_mode: 'HTML',
                    });
                }

                ctx.session.currentMenu = {
                    type: 'my_subscriptions',
                    messageId: finalMessage.message_id,
                };
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
                        `📂   ${subscription.catalog_type === 'wb' ? '🟣' : '🔵'}  ${shortName}`,
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
                        `📦  ${subscription.catalog_type === 'wb' ? '🟣' : '🔵'}  ${shortName}`,
                        `product_detail_from_my_${subscription.product_id}`
                    )
                    .row();
            });

            // Кнопки действий
            keyboard
                .text('📂 Добавить категории', 'categories_menu')
                .text('➕ Добавить товар', 'add_product')
                .row()
                .text('⬅️ Назад', 'main_menu')
                .row();

            let finalMessage;
            if (messageIdToEdit) {
                finalMessage = await ctx.editMessageText(menuHtml, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            } else {
                finalMessage = await ctx.reply(menuHtml, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            }

            ctx.session.currentMenu = {
                type: 'my_subscriptions',
                messageId: finalMessage.message_id,
            };
        } catch (e) {
            console.error('ОШИБКА ПОКАЗА МОИХ ПОДПИСОК', e);
            await ctx.reply(`❌ Ошибка при загрузке подписок: ${e.message || e}`);
        }
    },

    showMySubscriptionsPage: async (ctx, page = 1, messageIdToEdit = null) => {
        try {
            const userId = String(ctx.from.id);
            const subscriptions = await userCategorySubscriptionModel.findByUserId(userId);

            if (subscriptions.length === 0) {
                await categoryController.showMySubscriptions(ctx, messageIdToEdit);
                return;
            }

            const pageSize = 5; // Количество подписок на странице
            const totalPages = Math.ceil(subscriptions.length / pageSize);
            const startIndex = (page - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const pageSubscriptions = subscriptions.slice(startIndex, endIndex);

            const menuHtml = `
📋 <b>Мои подписки</b>

Страница ${page} из ${totalPages}
Всего активных подписок: <b>${subscriptions.length}</b>

<b>Список категорий:</b>
${pageSubscriptions
    .map(
        (sub, index) =>
            `${startIndex + index + 1}. ${sub.full_name}\n   ⚙️ Порог: ${sub.alert_threshold}% | 📄 Страниц: ${
                sub.scan_pages
            }\n`
    )
    .join('\n')}
        `;

            const keyboard = new InlineKeyboard();

            // Добавляем кнопки для подписок текущей страницы
            pageSubscriptions.forEach((subscription) => {
                keyboard
                    .text(`📦 ${subscription.category_name}`, `subscription_detail_from_my_${subscription.category_id}`)
                    .row();
            });

            // Добавляем пагинацию
            if (page > 1) {
                keyboard.text('⬅️ Предыдущие', `subscriptions_page_${page - 1}`).row();
            }

            if (page < totalPages) {
                if (page > 1) {
                    keyboard.text('➡️ Следующие', `subscriptions_page_${page + 1}`).row();
                } else {
                    keyboard.text('➡️ Следующие', `subscriptions_page_${page + 1}`).row();
                }
            }

            keyboard.text('📂 Добавить категории', 'categories_menu').text('⬅️ Назад', 'main_menu').row();

            let finalMessage;
            if (messageIdToEdit) {
                finalMessage = await ctx.editMessageText(menuHtml, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            } else {
                finalMessage = await ctx.reply(menuHtml, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            }

            ctx.session.currentMenu = {
                type: 'my_subscriptions',
                messageId: finalMessage.message_id,
                page: page,
            };
        } catch (e) {
            console.error('ОШИБКА ПОКАЗА СТРАНИЦЫ ПОДПИСОК', e);
            await ctx.reply(`❌ Ошибка при загрузке подписок: ${e.message || e}`);
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

            // Возвращаемся к списку подписок
            await categoryController.showMySubscriptions(ctx, ctx.callbackQuery.message.message_id);
        } catch (e) {
            console.error('ОШИБКА ОТПИСКИ ОТ КАТЕГОРИИ', e);
            await ctx.answerCallbackQuery({ text: '❌ Ошибка при отписке' });
        }
    },
};
