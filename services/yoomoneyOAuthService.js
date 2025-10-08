import axios from 'axios';

export class YooMoneyOAuthService {
    constructor() {
        this.clientId = process.env.YOOMONEY_CLIENT_ID;
        this.clientSecret = process.env.YOOMONEY_CLIENT_SECRET;
        //   this.redirectUri = process.env.YOOMONEY_REDIRECT_URI || 'https://example.com/oauth/callback'; // Замените на ваш URI
        this.accessToken = null;
        this.tokenExpires = null;
    }

    // Метод для получения access token при старте приложения
    async initialize() {
        try {
            console.log('🔄 Initializing YooMoney OAuth service...');

            // Если у нас уже есть действующий токен, используем его
            if (this.isTokenValid()) {
                console.log('✅ Using existing valid access token');
                return this.accessToken;
            }

            // Получаем новый токен
            await this.getNewAccessToken();
            console.log('✅ YooMoney OAuth service initialized successfully');
            return this.accessToken;
        } catch (error) {
            console.error('❌ Failed to initialize YooMoney OAuth service:', error);
            throw error;
        }
    }

    // Проверка валидности токена
    isTokenValid() {
        if (!this.accessToken || !this.tokenExpires) {
            return false;
        }
        return Date.now() < this.tokenExpires;
    }

    // Получение нового access token (упрощенная версия - вам нужно адаптировать под ваш flow)
    async getNewAccessToken() {
        try {
            // ВАЖНО: Это упрощенный пример. В реальности вам нужно:
            // 1. Иметь механизм получения authorization code от пользователя
            // 2. Обменивать code на access token

            // Для серверного приложения можно использовать Client Credentials flow если доступен
            const response = await axios.post(
                'https://yoomoney.ru/oauth/token',
                new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    scope: 'account-info operation-history operation-details', // Запросите нужные scope
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            );

            if (response.data.access_token) {
                this.accessToken = response.data.access_token;
                // Токен действует 3 года - устанавливаем expiration на 2.5 года для перестраховки
                this.tokenExpires = Date.now() + 2.5 * 365 * 24 * 60 * 60 * 1000;
                return this.accessToken;
            } else {
                throw new Error('No access token in response');
            }
        } catch (error) {
            console.error('Error getting access token:', error.response?.data || error.message);

            // Fallback: если OAuth не работает, используем старый метод (если применимо)
            if (process.env.YOOMONEY_ACCESS_TOKEN) {
                console.log('⚠️ Using fallback access token from environment');
                this.accessToken = process.env.YOOMONEY_ACCESS_TOKEN;
                this.tokenExpires = Date.now() + 2.5 * 365 * 24 * 60 * 60 * 1000;
                return this.accessToken;
            }

            throw error;
        }
    }

    // Обновление токена при необходимости
    async ensureValidToken() {
        if (!this.isTokenValid()) {
            console.log('🔄 Access token expired, getting new one...');
            await this.getNewAccessToken();
        }
        return this.accessToken;
    }

    // Метод для выполнения авторизованных запросов
    async makeAuthorizedRequest(config) {
        try {
            await this.ensureValidToken();

            const response = await axios({
                ...config,
                headers: {
                    ...config.headers,
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            return response.data;
        } catch (error) {
            console.error('Authorized request failed:', error.response?.data || error.message);

            // Если ошибка авторизации, пробуем обновить токен
            if (error.response?.status === 401) {
                console.log('🔄 Token might be invalid, trying to refresh...');
                await this.getNewAccessToken();

                // Повторяем запрос с новым токеном
                const retryResponse = await axios({
                    ...config,
                    headers: {
                        ...config.headers,
                        Authorization: `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                });

                return retryResponse.data;
            }

            throw error;
        }
    }
}
