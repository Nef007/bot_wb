import { InlineKeyboard } from 'grammy';

export const suggestionsController = {
    showSuggestionsInfo: async (ctx) => {
        try {
            // Ссылка на вашу Telegram группу (замените на реальную)
            const GROUP_LINK = 'https://t.me/+ffLlMIryf_M0MmU6';
            // const GROUP_USERNAME = '@your_group_username'; // или 't.me/your_group'

            const messageText = `💡 <b>Идеи и предложения</b>

Привет! У тебя есть идеи как улучшить бота? Хочешь предложить новую функциональность или сообщить об ошибке?

Присоединяйся к нашей группе где можно:
• 🚀 Предлагать новые функции
• 🐛 Сообщать об ошибках  
• 💬 Обсуждать улучшения
• 📢 Получать обновления первыми

<b>Ссылка для вступления:</b>
${GROUP_LINK}

После вступления напиши свои идеи в общий чат! Мы всегда рады обратной связи.`;

            const keyboard = new InlineKeyboard()
                .url('📢 Присоединиться к группе', GROUP_LINK)
                .row()
                .text('⬅️ Назад', 'entities');

            // Если сообщение можно редактировать (callback query)
            if (ctx.callbackQuery) {
                await ctx.editMessageText(messageText, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
                await ctx.answerCallbackQuery();
            } else {
                // Если команда вызвана напрямую
                await ctx.reply(messageText, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            }
        } catch (error) {
            console.error('Error showing suggestions info:', error);
            await ctx.reply('Произошла ошибка при загрузке информации. Попробуйте позже.');
        }
    },

    // Альтернативный вариант с кнопкой "Я вступил"
    showSuggestionsWithConfirmation: async (ctx) => {
        try {
            const GROUP_LINK = 'https://t.me/+ffLlMIryf_M0MmU6';

            const messageText = `💡 <b>Идеи и предложения</b>

Присоединяйся к нашей группе для обсуждения улучшений бота:

${GROUP_LINK}

После того как вступишь в группу, нажми кнопку "Я вступил(a)" ниже 👇`;

            const keyboard = new InlineKeyboard()
                .url('📢 Присоединиться к группе', GROUP_LINK)
                .row()
                .text('✅ Я вступил(a)', 'joined_group')
                .row()
                .text('⬅️ Назад', 'entities');

            if (ctx.callbackQuery) {
                await ctx.editMessageText(messageText, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
                await ctx.answerCallbackQuery();
            } else {
                await ctx.reply(messageText, {
                    reply_markup: keyboard,
                    parse_mode: 'HTML',
                });
            }
        } catch (error) {
            console.error('Error showing suggestions with confirmation:', error);
        }
    },

    handleJoinedConfirmation: async (ctx) => {
        try {
            await ctx.answerCallbackQuery({
                text: 'Отлично! Теперь можешь написать свои идеи в группе 🚀',
            });

            const messageText = `🎉 <b>Спасибо за участие!</b>

Теперь ты можешь:
• Написать свои идеи в группе
• Предложить улучшения функционала
• Сообщить об обнаруженных ошибках
• Пообщаться с другими пользователями

Не стесняйся предлагать любые идеи - мы ценим каждое предложение!`;

            const keyboard = new InlineKeyboard()
                .text('💡 Предложить идею', 'suggest_idea')
                .text('📢 Перейти в группу', 'go_to_group')
                .row()
                .text('⬅️ Назад', 'entities');

            await ctx.editMessageText(messageText, {
                reply_markup: keyboard,
                parse_mode: 'HTML',
            });
        } catch (error) {
            console.error('Error handling joined confirmation:', error);
        }
    },
};
