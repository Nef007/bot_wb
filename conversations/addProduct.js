import { InlineKeyboard } from 'grammy';
import { wildberriesApiService } from '../market/wb/api.js';
import { ozonApiService } from '../market/ozon/api.js';
import { userProductSubscriptionModel } from '../db/models/userProductSubscriptionModel.js';
import { productModel } from '../db/models/productModel.js';
import { menuController } from '../controllers/menuController.js';

/**
 * Начать процесс добавления товара через conversation
 */
async function addProductConversation(conversation, ctx) {
    let marketType = null;
    let productUrl = null;
    let productData = null;

    try {
        // Удаляем сообщение, которое инициировало вызов
        if (ctx.callbackQuery?.message) {
            await ctx
                .deleteMessage()
                .catch((e) => console.log("Couldn't delete initial message in addProductConversation", e));
        }

        // Шаг 1: Выбор маркетплейса
        await ctx.reply('🛍️ <b>Добавление товара</b>\n\nВыберите магазин:', {
            reply_markup: new InlineKeyboard()
                .text('📦 Wildberries', 'select_wb')
                .text('🚀 Ozon', 'select_ozon')
                .row()
                .text('❌ Отмена', 'cancel_add_product'),
            parse_mode: 'HTML',
        });

        // Ждем выбора маркетплейса
        let marketChoiceCtx;
        while (true) {
            marketChoiceCtx = await conversation.wait();
            const data = marketChoiceCtx.callbackQuery?.data;

            if (data === 'select_wb' || data === 'select_ozon' || data === 'cancel_add_product') {
                break;
            } else {
                await ctx.reply('❌ Пожалуйста, выберите один из предложенных магазинов или нажмите "Отмена".');
            }
        }

        // Обработка отмены
        if (marketChoiceCtx.callbackQuery.data === 'cancel_add_product') {
            await marketChoiceCtx.answerCallbackQuery({ text: '❌ Добавление товара отменено' });
            await marketChoiceCtx
                .deleteMessage()
                .catch((e) => console.log("Couldn't delete market choice message on cancel", e));
            await menuController.getMenu(ctx);
            return;
        }

        // Устанавливаем выбранный маркетплейс
        marketType = marketChoiceCtx.callbackQuery.data === 'select_wb' ? 'wb' : 'ozon';
        const marketName = marketType === 'wb' ? 'Wildberries' : 'Ozon';

        await marketChoiceCtx.answerCallbackQuery();
        await marketChoiceCtx.deleteMessage().catch((e) => console.log("Couldn't delete market choice message", e));

        // Шаг 2: Ввод ссылки на товар
        const urlExamples = {
            wb: 'https://www.wildberries.ru/catalog/123456789/detail.aspx\nИли просто артикул: 123456789',
            ozon: 'https://www.ozon.ru/product/fonar-nalobnyy-akkumulyatornyy-svetodiodnyy-led-s-zaryadkoy-1661157231/\n',
        };

        const urlMessage = await ctx.reply(
            `🛍️ <b>Добавление товара из ${marketName}</b>\n\nОтправьте мне ссылку на товар:\n\n<code>${urlExamples[marketType]}</code>\n\nИли нажмите "❌ Отмена" для возврата в главное меню.`,
            {
                parse_mode: 'HTML',
                reply_markup: new InlineKeyboard().text('❌ Отмена', 'cancel_add_product'),
            }
        );

        // Ждем ввода ссылки
        let urlCtx;
        while (true) {
            urlCtx = await conversation.wait();

            // Проверяем отмену
            if (urlCtx.callbackQuery?.data === 'cancel_add_product') {
                await urlCtx.answerCallbackQuery({ text: '❌ Добавление товара отменено' });
                await ctx.api
                    .deleteMessage(urlMessage.chat.id, urlMessage.message_id)
                    .catch((e) => console.log("Couldn't delete url prompt message", e));
                await menuController.getMenu(ctx);
                return;
            }

            // Проверяем текстовое сообщение
            if (urlCtx.message?.text) {
                productUrl = urlCtx.message.text.trim();
                break;
            } else {
                await ctx.reply('❌ Пожалуйста, отправьте ссылку на товар или нажмите "Отмена".');
            }
        }

        // Удаляем сообщение с ссылкой для конфиденциальности
        await ctx.api
            .deleteMessage(urlCtx.message.chat.id, urlCtx.message.message_id)
            .catch((e) => console.log("Couldn't delete url response message", e));
        await ctx.api
            .deleteMessage(urlMessage.chat.id, urlMessage.message_id)
            .catch((e) => console.log("Couldn't delete url prompt message", e));

        // Шаг 3: Валидация и обработка ссылки
        const loadingMessage = await ctx.reply('🔄 Проверяем ссылку и загружаем информацию о товаре...');

        let isValidUrl = false;
        let productId = null;

        // Валидация в зависимости от маркетплейса
        switch (marketType) {
            case 'wb':
                productId = wildberriesApiService.extractIdFromUrl(productUrl);

                break;

            case 'ozon':
                productId = productUrl;

                break;
        }

        if (!productId) {
            await ctx.api.deleteMessage(loadingMessage.chat.id, loadingMessage.message_id);
            await ctx.reply(`❌ Это не похоже на ссылку товара ${marketName}. Пожалуйста, попробуйте еще раз.`, {
                reply_markup: new InlineKeyboard()
                    .text('🔄 Попробовать снова', 'add_product')
                    .text('📋 Главное меню', 'main_menu'),
            });
            return;
        }

        // Шаг 4: Получение данных о товаре
        await ctx.api.editMessageText(
            loadingMessage.chat.id,
            loadingMessage.message_id,
            '🔄 Получаем информацию о товаре...'
        );

        try {
            switch (marketType) {
                case 'wb':
                    productData = await wildberriesApiService.fetchProductDetail(productId);
                    break;

                case 'ozon':
                    productData = await ozonApiService.fetchProductDetail(productId);
                    break;
            }

            if (!productData) {
                await ctx.api.deleteMessage(loadingMessage.chat.id, loadingMessage.message_id);
                await ctx.reply(`❌ Не удалось получить информацию о товаре. Проверьте ссылку и попробуйте снова.`, {
                    reply_markup: new InlineKeyboard()
                        .text('🔄 Попробовать снова', 'add_product')
                        .text('📋 Главное меню', 'main_menu'),
                });
                return;
            }

            // Добавляем информацию о маркетплейсе
            productData.marketplace = marketType;
        } catch (error) {
            await ctx.api.deleteMessage(loadingMessage.chat.id, loadingMessage.message_id);
            console.error('❌ Ошибка при получении данных товара:', error);
            await ctx.reply(`❌ Ошибка при загрузке информации о товаре: ${error.message}`, {
                reply_markup: new InlineKeyboard()
                    .text('🔄 Попробовать снова', 'add_product')
                    .text('📋 Главное меню', 'main_menu'),
            });
            return;
        }

        // Шаг 5: Проверка существующей подписки
        const userId = String(ctx.from.id);
        const existingSubscription = await userProductSubscriptionModel.findByUserAndProduct(
            userId,
            productId,
            marketType
        );

        if (existingSubscription) {
            await ctx.api.deleteMessage(loadingMessage.chat.id, loadingMessage.message_id);
            await ctx.reply('❌ Вы уже отслеживаете этот товар.', {
                reply_markup: new InlineKeyboard()
                    .text('📊 Перейти к товару', `product_detail_${productId}`)
                    .text('📋 Главное меню', 'main_menu'),
            });
            return;
        }
        console.log('🚀 ~ file: addProduct.js:248 ~ productData:', productData);

        // Шаг 6: Подтверждение добавления
        await ctx.api.editMessageText(
            loadingMessage.chat.id,
            loadingMessage.message_id,
            `✅ <b>Товар найден!</b>\n\n` +
                `📦 <b>${productData.name}</b>\n` +
                `${productData.brand ? `🏷️ <b>Бренд:</b> ${productData.brand}\n` : ''}` +
                `💰 <b>Цена:</b> ${productData.current_price} руб.\n` +
                `${productData.rating ? `⭐ <b>Рейтинг:</b> ${productData.rating}\n` : ''}` +
                `${productData.feedbacks_count ? `💬 <b>Отзывы:</b> ${productData.feedbacks_count}\n` : ''}` +
                `\nДобавить этот товар для отслеживания?`,
            {
                parse_mode: 'HTML',
                reply_markup: new InlineKeyboard()
                    .text('✅ Добавить', 'confirm_add_product')
                    .text('❌ Отмена', 'cancel_add_product'),
            }
        );

        // Ждем подтверждения
        let confirmCtx;
        while (true) {
            confirmCtx = await conversation.wait();
            const data = confirmCtx.callbackQuery?.data;

            if (data === 'confirm_add_product' || data === 'cancel_add_product') {
                break;
            } else {
                await ctx.reply('❌ Пожалуйста, подтвердите добавление товара или отмените операцию.');
            }
        }

        if (confirmCtx.callbackQuery.data === 'cancel_add_product') {
            await confirmCtx.answerCallbackQuery({ text: '❌ Добавление товара отменено' });
            await ctx.api.deleteMessage(loadingMessage.chat.id, loadingMessage.message_id);
            await menuController.getMenu(ctx);
            return;
        }

        await confirmCtx.answerCallbackQuery();

        // Шаг 7: Сохранение товара в базу
        await ctx.api.editMessageText(loadingMessage.chat.id, loadingMessage.message_id, '💾 Сохраняем товар...');

        try {
            // Сохраняем товар в базу продуктов
            await productModel.upsert({
                ...productData,
                marketplace: marketType,
                category_id: null,
            });

            // Создаем подписку
            await userProductSubscriptionModel.create(userId, productData);

            // Финальное сообщение об успехе
            await ctx.api.editMessageText(
                loadingMessage.chat.id,
                loadingMessage.message_id,
                `✅ <b>Товар успешно добавлен!</b>\n\n` +
                    `📦 <b>${productData.name}</b>\n` +
                    `🏪 <b>Магазин:</b> ${marketName}\n` +
                    `💰 <b>Цена:</b> ${productData.current_price} руб.\n\n` +
                    `Теперь я буду отслеживать изменения цены этого товара.`,
                {
                    parse_mode: 'HTML',
                    reply_markup: new InlineKeyboard()
                        .text('📊 Перейти к товару', `product_detail_from_my_${productData.id}`)
                        .text('📋 Главное меню', 'main_menu'),
                }
            );
        } catch (error) {
            await ctx.api.deleteMessage(loadingMessage.chat.id, loadingMessage.message_id);
            console.error('❌ Ошибка при сохранении товара:', error);
            await ctx.reply(`❌ Ошибка при сохранении товара: ${error.message}`, {
                reply_markup: new InlineKeyboard()
                    .text('🔄 Попробовать снова', 'add_product')
                    .text('📋 Главное меню', 'main_menu'),
            });
        }
    } catch (error) {
        console.error('❌ Ошибка в addProductConversation:', error);
        await ctx.reply('❌ Произошла ошибка при добавлении товара. Пожалуйста, попробуйте еще раз.', {
            reply_markup: new InlineKeyboard()
                .text('🔄 Попробовать снова', 'add_product')
                .text('📋 Главное меню', 'main_menu'),
        });
    }
}

export default addProductConversation;
