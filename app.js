import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { FileAdapter } from '@grammyjs/storage-file'; // Проверить использование
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import 'dotenv/config';
import { userController } from './controllers/userController.js';
import mainRouter from './composer/index.js';
import { YooMoneyService } from './services/yoomoneyService.js';
import userModel from './db/models/user.js';
import { wbCategoryModel } from './db/models/wbCategory.js'; // Добавляем импорт модели категорий
import { startPeriodicMonitoring } from './services/priceMonitoringService.js';

const yooMoneyService = new YooMoneyService();

// dayjs.extend(utc);
// dayjs.extend(timezone);
// dayjs.tz.setDefault('Europe/Moscow');

// Настройка хранилища сессий (если используется FileAdapter)
const storage = new FileAdapter({
    dirName: 'sessions',
});

async function start() {
    const bot = new Bot(process.env.tokenTelegram);

    // Set commands
    await bot.api.setMyCommands([
        { command: 'start', description: 'Перезапуск' },
        { command: 'main_menu', description: 'Меню' },
    ]);

    // Middleware
    bot.use(session({ initial: () => ({}), storage }));
    bot.use(conversations());

    mainRouter.forEach((createComposerFunc) => bot.use(createComposerFunc())); // Возвращаем использование mainRouter

    bot.command('start', userController.add);

    bot.catch((error) => {
        console.error('Global error handler:', error);

        // Игнорируем ошибки устаревших callback queries
        if (error.description && error.description.includes('query is too old')) {
            console.log('Ignoring expired callback query error');
            return;
        }

        // Можно отправить сообщение админу о критической ошибке
    });

    // Обработчик unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        // Не выходим из процесса, перезапуск PM2 позаботится о восстановлении
    });

    // Обработчики для graceful shutdown
    process.on('SIGINT', async () => {
        console.log('🛑 Received SIGINT, shutting down gracefully...');

        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('🛑 Received SIGTERM, shutting down gracefully...');

        process.exit(0);
    });

    // Start bot
    bot.start({
        onStart: async ({ username }) => {
            startPeriodicMonitoring(bot);
            await initializeAdmin();
            await syncCategories(); // Добавляем синхронизацию категорий
            await yooMoneyService.initialize();
            console.log(`[GrammyBot] STARTING: https://t.me/${username}`);
        },
    });

    console.log('[GrammyBot] STARTING');
}

start();

async function initializeAdmin() {
    const adminUserId = process.env.ADMIN_USER_ID;
    if (!adminUserId) {
        console.log('⚠️ ADMIN_USER_ID not set in .env');
        return;
    }

    try {
        let user = userModel.findById(adminUserId);
        if (user) {
            // Обновляем роль если пользователь существует
            if (user.role !== 'ADMIN') {
                userModel.updateRole(adminUserId, 'ADMIN');
                console.log(`✅ Updated user ${adminUserId} to ADMIN role`);
            } else {
                console.log(`✅ User ${adminUserId} is already ADMIN`);
            }
        } else {
            console.log(`⚠️ Admin user ${adminUserId} not found in database`);
            console.log(`ℹ️ User will become admin when they start the bot`);
        }
    } catch (error) {
        console.error('Error initializing admin:', error);
    }
}

/**
 * Синхронизация категорий с Wildberries при старте бота
 * (всегда обновляет категории)
 */
async function syncCategories() {
    try {
        console.log('🔄 Загружаем категории с Wildberries...');

        const categoriesCount = await wbCategoryModel.safeSyncWithWB();
        console.log(`✅ Загружено ${categoriesCount} категорий`);
    } catch (error) {
        console.error('❌ Ошибка при синхронизации категорий:', error);
        console.log('⚠️ Бот продолжит работу, но категории могут быть недоступны');

        // Проверяем, есть ли хоть какие-то категории в базе
        const hasCategories = await wbCategoryModel.hasCategories();
        if (hasCategories) {
            console.log('ℹ️ Используем существующие категории из базы');
        } else {
            console.log('❌ Категории полностью отсутствуют в базе');
        }
    }
}
