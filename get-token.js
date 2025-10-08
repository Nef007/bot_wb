// get-token.js - исправленный скрипт для получения токена
import axios from 'axios';
import readline from 'readline';
import 'dotenv/config';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

async function getToken() {
    console.log('🔐 Получение токена доступа ЮMoney\n');

    const clientId = process.env.YOOMONEY_CLIENT_ID;
    const clientSecret = process.env.YOOMONEY_CLIENT_SECRET;

    // Redirect URI должен точно совпадать с указанным в настройках приложения ЮMoney
    const redirectUri = process.env.YOOMONEY_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'; // Используем out-of-band

    if (!clientId) {
        console.error('❌ YOOMONEY_CLIENT_ID not found in .env file');
        process.exit(1);
    }

    if (!clientSecret) {
        console.error('❌ YOOMONEY_CLIENT_SECRET not found in .env file');
        process.exit(1);
    }

    // Правильный scope через пробел
    const scope = 'account-info operation-history operation-details';

    // Шаг 1: Получаем authorization code через GET запрос (браузер)
    const authUrl = `https://yoomoney.ru/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
        redirectUri
    )}&scope=${encodeURIComponent(scope)}`;

    console.log('📋 Инструкция по получению токена:');
    console.log('1. Перейдите по ссылке в браузере:');
    console.log('\n' + authUrl + '\n');
    console.log('2. Авторизуйтесь в ЮMoney (если не авторизованы)');
    console.log('3. Подтвердите разрешения для приложения');
    console.log('4. После подтверждения вас перенаправит на страницу с кодом');
    console.log('5. Скопируйте код из адресной строки или со страницы');

    rl.question('\nВведите полученный authorization code: ', async (code) => {
        if (!code) {
            console.log('❌ Код не может быть пустым');
            rl.close();
            return;
        }

        try {
            console.log('\n🔄 Обмениваем код на access token...');

            // Шаг 2: Обмениваем code на access token
            const response = await axios.post(
                'https://yoomoney.ru/oauth/token',
                new URLSearchParams({
                    code: code.trim(),
                    client_id: clientId,
                    grant_type: 'authorization_code',
                    redirect_uri: redirectUri,
                    client_secret: clientSecret,
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    timeout: 30000,
                }
            );

            console.log('✅ Ответ от сервера получен');

            if (response.data.access_token) {
                console.log('\n🎉 Токен успешно получен!');
                console.log('\n📋 Добавьте в ваш .env файл:');
                console.log(`YOOMONEY_ACCESS_TOKEN=${response.data.access_token}`);
                console.log('\n🔐 Информация о токене:');
                console.log(`- Access Token: ${response.data.access_token.substring(0, 20)}...`);
                console.log(`- Тип: ${response.data.token_type || 'Bearer'}`);
                console.log(`- Срок действия: 3 года`);

                // Сохраняем в файл для удобства
                const fs = await import('fs');
                fs.writeFileSync(
                    'yoomoney_token.txt',
                    `YOOMONEY_ACCESS_TOKEN=${response.data.access_token}\n# Получен: ${new Date().toISOString()}`
                );
                console.log('\n💾 Токен также сохранен в файл yoomoney_token.txt');
            } else {
                console.log('❌ Неожиданный ответ от сервера:', response.data);
            }
        } catch (error) {
            console.error('\n❌ Ошибка при получении токена:');

            if (error.response) {
                // Ошибка от сервера ЮMoney
                console.log('Статус:', error.response.status);
                console.log('Данные:', error.response.data);

                if (error.response.data.error === 'invalid_grant') {
                    console.log('\n💡 Возможные причины:');
                    console.log('- Код устарел (действует меньше 1 минуты)');
                    console.log('- Код уже был использован');
                    console.log('- Неправильный код');
                } else if (error.response.data.error === 'invalid_client') {
                    console.log('\n💡 Проверьте client_id и client_secret в .env файле');
                }
            } else if (error.request) {
                console.log('Не удалось подключиться к серверу ЮMoney');
                console.log('Проверьте интернет-соединение');
            } else {
                console.log('Ошибка:', error.message);
            }
        } finally {
            rl.close();
        }
    });
}

// Альтернативный метод для отладки
async function debugAuth() {
    console.log('\n🔧 Отладочная информация:');
    console.log('Client ID:', process.env.YOOMONEY_CLIENT_ID ? '✓ Установлен' : '✗ Отсутствует');
    console.log('Client Secret:', process.env.YOOMONEY_CLIENT_SECRET ? '✓ Установлен' : '✗ Отсутствует');
    console.log('Redirect URI:', process.env.YOOMONEY_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob (по умолчанию)');
}

// Проверяем наличие необходимых переменных
if (!process.env.YOOMONEY_CLIENT_ID || !process.env.YOOMONEY_CLIENT_SECRET) {
    console.error('❌ Необходимые переменные окружения не найдены');
    console.error('Добавьте в .env файл:');
    console.error('YOOMONEY_CLIENT_ID=ваш_client_id');
    console.error('YOOMONEY_CLIENT_SECRET=ваш_client_secret');
    console.error('YOOMONEY_REDIRECT_URI=ваш_redirect_uri (опционально)');
    process.exit(1);
}

debugAuth().then(() => {
    setTimeout(getToken, 1000);
});
