import { InlineKeyboard } from 'grammy';
import { adminService } from '../services/adminService.js';
import { userCategorySubscriptionModel } from '../db/models/userCategorySubscriptionModel.js';
import { userProductSubscriptionModel } from '../db/models/userProductSubscriptionModel.js';

export const menuController = {
    getMenu: async (ctx, messageIdToEdit = null) => {
        try {
            ctx.session = ctx.session || {};
            const userId = String(ctx.from.id);

            const categorySubscriptionCount = await userCategorySubscriptionModel.getCountByUserId(userId);
            const productSubscriptionCount = await userProductSubscriptionModel.getCountByUserId(userId);

            const menuHtml = `
Добро пожаловать в главное меню!\n\n
📊 <b>Ваша статистика:</b>
• Активных подписок на категории: <b>${categorySubscriptionCount}</b>
• Отслеживаемых товаров: <b>${productSubscriptionCount}</b>

Выберите действие:
        `;

            const keyboard = new InlineKeyboard([
                [InlineKeyboard.text('📂 Категории', 'categories_menu')],
                [
                    InlineKeyboard.text(
                        `📋 Мои подписки (${categorySubscriptionCount + productSubscriptionCount})`,
                        'my_subscriptions'
                    ),
                ],
                [InlineKeyboard.text('➕ Добавить товар', 'add_product')],
                [InlineKeyboard.text('💡 Идеи/предложения', 'suggestions')],
                [InlineKeyboard.text('💰 Подписка', 'subscription_status')],
            ]);

            // Добавляем кнопку "Управление" только для администратора
            if (adminService.isAdmin(userId)) {
                keyboard.row().text('⚙️ Управление', 'admin_menu');
            }

            let finalMessage;
            if (messageIdToEdit) {
                try {
                    finalMessage = await ctx.api.editMessageText(ctx.chat.id, messageIdToEdit, menuHtml, {
                        reply_markup: keyboard,
                        parse_mode: 'HTML',
                    });
                } catch (e) {
                    if (e.description && e.description.includes('message is not modified')) {
                        console.log('Message not modified, skipping edit in getMenu.');
                        finalMessage = { message_id: messageIdToEdit };
                    } else {
                        throw e;
                    }
                }
            } else {
                finalMessage = await ctx.reply(menuHtml, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            }

            ctx.session.currentGroup = { id: null, name: 'Главное меню', messageId: finalMessage.message_id };
        } catch (e) {
            console.error('ОШИБКА ПОЛУЧЕНИЯ МЕНЮ', e);
            await ctx.reply(`Ошибка получения меню: ${e.message || e}`);
        }
    },
};
