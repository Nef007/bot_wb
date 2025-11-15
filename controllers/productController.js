import { InlineKeyboard } from 'grammy';
import { productApiService } from '../services/productApiService.js';
import { userProductSubscriptionModel } from '../db/models/userProductSubscriptionModel.js';
import { productModel } from '../db/models/productModel.js';
import { priceHistoryModel } from '../db/models/priceHistoryModel.js';

export const productController = {
    /**
     * Начать процесс добавления товара
     */
    startAddProduct: async (ctx) => {
        try {
            const menuHtml = `
➕ <b>Добавление товара</b>

Отправьте мне ссылку на товар с Wildberries.

Пример:
<code>https://www.wildberries.ru/catalog/123456789/detail.aspx</code>

Я начну отслеживать изменения цены этого товара.
            `;

            const keyboard = new InlineKeyboard().text('❌ Отмена', 'main_menu');

            await ctx.editMessageText(menuHtml, {
                reply_markup: keyboard,
                parse_mode: 'HTML',
            });

            ctx.session.waitingForProductUrl = true;
        } catch (e) {
            console.error('ОШИБКА СТАРТА ДОБАВЛЕНИЯ ТОВАРА', e);
            await ctx.reply(`❌ Ошибка: ${e.message || e}`);
        }
    },

    /**
     * Обработка полученной ссылки на товар
     */
    handleProductUrl: async (ctx) => {
        try {
            const userId = String(ctx.from.id);
            const url = ctx.message.text.trim();

            // Более гибкая проверка ссылки WB
            const isWbUrl =
                (url.includes('wildberries.') &&
                    (url.includes('/catalog/') || url.includes('nm=') || url.includes('/detail'))) ||
                /^\d+$/.test(url); // или просто цифры (артикул)

            if (!isWbUrl) {
                await ctx.reply(
                    '❌ Это не похоже на ссылку товара Wildberries. Попробуйте еще раз.\n\nПример: https://www.wildberries.ru/catalog/123456789/detail.aspx\nИли просто артикул: 123456789'
                );
                return;
            }

            // Показываем сообщение о загрузке
            const loadingMessage = await ctx.reply('🔄 Загружаем информацию о товаре...');

            try {
                // Извлекаем nmId и получаем информацию о товаре
                const nmId = productApiService.extractNmIdFromUrl(url);
                console.log(`🔍 Извлечен nmId: ${nmId} из URL: ${url}`);

                const productData = await productApiService.fetchProductByNmId(nmId);

                if (!productData) {
                    await ctx.api.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                    await ctx.reply('❌ Не удалось получить информацию о товаре. Проверьте ссылку и попробуйте снова.');
                    return;
                }

                // Проверяем, не добавлен ли уже товар
                const existingSubscription = await userProductSubscriptionModel.findByUserAndProduct(userId, nmId);
                if (existingSubscription) {
                    await ctx.api.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                    await ctx.reply('❌ Вы уже отслеживаете этот товар.');
                    return;
                }

                // Сохраняем товар в базу продуктов (с category_id = NULL)
                await productModel.upsert({
                    ...productData,
                    category_id: null, // Используем NULL вместо 0
                });

                // Создаем подписку
                const subscriptionId = await userProductSubscriptionModel.create(userId, productData);

                // Удаляем сообщение о загрузке
                await ctx.api.deleteMessage(ctx.chat.id, loadingMessage.message_id);

                // Показываем карточку товара
                await productController.showProductDetail(ctx, nmId, null, false);
            } catch (error) {
                await ctx.api.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                console.error('❌ Ошибка при добавлении товара:', error);
                await ctx.reply(`❌ Ошибка: ${error.message}`);
            }

            // Сбрасываем флаг ожидания
            ctx.session.waitingForProductUrl = false;
        } catch (e) {
            console.error('ОШИБКА ОБРАБОТКИ ССЫЛКИ ТОВАРА', e);
            await ctx.reply(`❌ Ошибка при обработке ссылки: ${e.message || e}`);
        }
    },

    /**
     * Показать детали товара
     */
    showProductDetail: async (ctx, productNmId, messageIdToEdit = null, fromMySubscriptions = false) => {
        try {
            const userId = String(ctx.from.id);
            const subscription = await userProductSubscriptionModel.findByUserAndProduct(userId, productNmId);

            if (!subscription) {
                await ctx.reply('❌ Подписка на товар не найдена');
                return;
            }

            // Получаем текущую цену из таблицы продуктов
            const product = await productModel.findByNmId(productNmId);
            const currentPrice = product?.current_price || subscription.current_price;

            // Получаем историю цен для отображения изменения
            const priceHistory = await priceHistoryModel.getLastTwoPrices(productNmId);
            const lastPrice = priceHistory && priceHistory.length >= 2 ? priceHistory[1].price : currentPrice;

            const priceChange = currentPrice - lastPrice;
            const percentChange = lastPrice > 0 ? ((priceChange / lastPrice) * 100).toFixed(2) : 0;

            const menuHtml = `
📦 <b>${subscription.product_name}</b>
${subscription.product_brand ? `🏷️ <b>Бренд:</b> ${subscription.product_brand}\n` : ''}
💰 <b>Текущая цена:</b> ${currentPrice} руб.
${
    priceChange !== 0
        ? `📈 <b>Изменение:</b> ${priceChange > 0 ? '+' : ''}${priceChange} руб. (${percentChange}%)\n`
        : ''
}
⭐ <b>Рейтинг:</b> ${product?.rating || subscription.rating || 0}
💬 <b>Отзывы:</b> ${product?.feedbacks_count || subscription.feedbacks_count || 0}

⚡ <b>Порог уведомлений:</b> ${subscription.alert_threshold}%

🕒 <b>Последняя проверка:</b>
${subscription.last_scan_at ? new Date(subscription.last_scan_at).toLocaleString('ru-RU') : 'Еще не было'}

🔗 <a href="${subscription.product_url}">Ссылка на товар</a>
        `;

            const keyboard = new InlineKeyboard()
                .text(subscription.alert_threshold === 5 ? '✅ 5%' : '5%', `set_product_threshold_${productNmId}_5`)
                .text(subscription.alert_threshold === 10 ? '✅ 10%' : '10%', `set_product_threshold_${productNmId}_10`)
                .text(subscription.alert_threshold === 15 ? '✅ 15%' : '15%', `set_product_threshold_${productNmId}_15`)
                .row()
                .text(subscription.alert_threshold === 20 ? '✅ 20%' : '20%', `set_product_threshold_${productNmId}_20`)
                .text(subscription.alert_threshold === 25 ? '✅ 25%' : '25%', `set_product_threshold_${productNmId}_25`)
                .text(subscription.alert_threshold === 30 ? '✅ 30%' : '30%', `set_product_threshold_${productNmId}_30`)
                .row()
                .text('📊 Показать график', `show_product_chart_${productNmId}`)
                .row()
                .text('❌ Отписаться', `unsubscribe_product_${productNmId}`)
                .row();

            // Кнопка назад
            if (fromMySubscriptions) {
                keyboard.text('⬅️ Назад', 'my_subscriptions');
            } else {
                keyboard.text('⬅️ Назад', 'main_menu');
            }

            let finalMessage;

            // Всегда используем текстовое сообщение
            if (messageIdToEdit) {
                try {
                    finalMessage = await ctx.editMessageText(menuHtml, {
                        reply_markup: keyboard,
                        parse_mode: 'HTML',
                        disable_web_page_preview: false,
                    });
                } catch (editError) {
                    console.error('❌ Ошибка редактирования сообщения:', editError);
                    finalMessage = await ctx.reply(menuHtml, {
                        reply_markup: keyboard,
                        parse_mode: 'HTML',
                        disable_web_page_preview: false,
                    });
                }
            } else {
                finalMessage = await ctx.reply(menuHtml, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                    disable_web_page_preview: false,
                });
            }

            ctx.session.currentMenu = {
                type: 'product_detail',
                productNmId: productNmId,
                messageId: finalMessage.message_id,
                fromMySubscriptions: fromMySubscriptions,
            };
        } catch (e) {
            console.error('ОШИБКА ПОКАЗА ДЕТАЛЕЙ ТОВАРА', e);
            await ctx.reply(`❌ Ошибка при загрузке информации о товаре: ${e.message || e}`);
        }
    },

    /**
     * Установка порога для товара
     */
    setProductThreshold: async (ctx, productNmId, threshold) => {
        try {
            const userId = String(ctx.from.id);
            const subscription = await userProductSubscriptionModel.findByUserAndProduct(userId, productNmId);

            if (!subscription) {
                await ctx.answerCallbackQuery({ text: '❌ Подписка не найдена' });
                return;
            }

            // Обновляем порог
            await userProductSubscriptionModel.updateThreshold(subscription.id, threshold);

            console.log(`⚙️ Пользователь ${userId} установил порог ${threshold}% для товара ${productNmId}`);

            await ctx.answerCallbackQuery({ text: `✅ Порог уведомлений установлен: ${threshold}%` });

            // Обновляем сообщение
            const fromMySubscriptions = ctx.session.currentMenu?.fromMySubscriptions || false;
            await productController.showProductDetail(
                ctx,
                productNmId,
                ctx.callbackQuery.message.message_id,
                fromMySubscriptions
            );
        } catch (e) {
            console.error('ОШИБКА УСТАНОВКИ ПОРОГА ТОВАРА', e);
            await ctx.answerCallbackQuery({ text: '❌ Ошибка при изменении порога' });
        }
    },

    /**
     * Отписка от товара
     */
    unsubscribeFromProduct: async (ctx, productNmId) => {
        try {
            const userId = String(ctx.from.id);

            await userProductSubscriptionModel.deleteByUserAndProduct(userId, productNmId);

            console.log(`❌ Пользователь ${userId} отписался от товара ${productNmId}`);

            await ctx.answerCallbackQuery({ text: '❌ Подписка на товар отменена' });

            // Возвращаемся к списку подписок
            await categoryController.showMySubscriptions(ctx, ctx.callbackQuery.message.message_id);
        } catch (e) {
            console.error('ОШИБКА ОТПИСКИ ОТ ТОВАРА', e);
            await ctx.answerCallbackQuery({ text: '❌ Ошибка при отписке' });
        }
    },

    /**
     * Показать график цены (заглушка)
     */
    showProductChart: async (ctx, productNmId) => {
        try {
            // Получаем историю цен из базы данных
            const priceHistory = await productModel.getPriceHistory(productNmId);

            if (!priceHistory || priceHistory.length === 0) {
                await ctx.answerCallbackQuery({
                    text: '❌ Нет данных по истории цен для этого товара',
                });
                return;
            }

            // Генерируем текстовый график
            const priceList = generatePriceList(priceHistory);

            // Создаем клавиатуру для возврата
            const keyboard = new InlineKeyboard().text('⬅️ Назад к товару', `product_detail_from_my_${productNmId}`);

            // Заменяем текущее сообщение
            await ctx.editMessageText(priceList, {
                reply_markup: keyboard,
                parse_mode: 'HTML',
            });
        } catch (e) {
            console.error('ОШИБКА ПОКАЗА ГРАФИКА', e);
            await ctx.answerCallbackQuery({ text: '❌ Ошибка при загрузке графика' });
        }
    },
};

function generatePriceList(priceHistory) {
    if (priceHistory.length === 0) {
        return '📊 Недостаточно данных по ценам';
    }

    // Переворачиваем порядок, чтобы старые цены были вверху, новые - внизу
    const reversedHistory = [...priceHistory].reverse();

    // Находим минимальную и максимальную цены
    const prices = reversedHistory.map((item) => item.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    let message = '📊 <b>История цен:</b>\n\n';

    reversedHistory.forEach((item, index) => {
        const price = Math.round(item.price);
        const date = new Date(item.timestamp).toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });

        const formattedPrice = formatPrice(price);

        // Определяем смайлы для мин/макс цен
        let emoji = '';
        if (item.price === minPrice) {
            emoji = '🟢'; // зеленая точка для минимальной цены
        } else if (item.price === maxPrice) {
            emoji = '🔴'; // красная точка для максимальной цены
        } else if (index === reversedHistory.length - 1) {
            // последний элемент (самый новый)
            emoji = '⚫'; // черная точка для текущей цены
        } else {
            emoji = '🔹'; // синий ромб для остальных
        }

        message += `${emoji} <b>${formattedPrice}</b> - ${date}\n`;
    });

    // Добавляем статистику
    message += `\n📈 <b>Статистика:</b>\n`;
    message += `⚫ Текущая: <b>${formatPrice(Math.round(reversedHistory[reversedHistory.length - 1].price))}</b>\n`;
    message += `🟢 Минимальная: <b>${formatPrice(Math.round(minPrice))}</b>\n`;
    message += `🔴 Максимальная: <b>${formatPrice(Math.round(maxPrice))}</b>\n`;
    message += `📊 Разница: <b>${formatPrice(Math.round(maxPrice - minPrice))}</b>`;

    return message;
}

/**
 * Форматировать цену в читаемом виде
 */
function formatPrice(price) {
    return (
        new Intl.NumberFormat('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(price) + '₽'
    );
}
