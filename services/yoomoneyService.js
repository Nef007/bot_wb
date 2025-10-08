import axios from 'axios';

export class YooMoneyService {
    constructor() {
        this.receiver = process.env.YOOMONEY_RECEIVER || '4100119345887634';
        this.baseUrl = 'https://yoomoney.ru/quickpay/confirm.xml';
        this.accessToken = process.env.YOOMONEY_ACCESS_TOKEN;

        if (!this.accessToken) {
            console.warn('⚠️ YOOMONEY_ACCESS_TOKEN not set. Payment checking will be disabled.');
        }

        // Создаем экземпляр axios с настройками
        this.apiClient = axios.create({
            baseURL: 'https://yoomoney.ru/api',
            timeout: 10000,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        // Добавляем Authorization header если токен есть
        if (this.accessToken) {
            this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
        }

        this.apiClient.interceptors.response.use(
            (response) => response,
            (error) => {
                console.error('YooMoney API Error:', error.message);
                if (error.response?.status === 401) {
                    console.error('❌ Invalid access token. Please check YOOMONEY_ACCESS_TOKEN');
                }
                throw error;
            }
        );
    }

    // Простая инициализация - проверяем токен
    async initialize() {
        if (!this.accessToken) {
            console.warn('⚠️ YooMoney service: No access token available');
            return false;
        }

        try {
            // Проверяем валидность токена простым запросом
            const response = await this.apiClient.post('/account-info');
            console.log('✅ YooMoney service initialized successfully');
            console.log(`💳 Account: ${response.data.account} Balance: ${response.data.balance}`);
            return true;
        } catch (error) {
            console.error('❌ YooMoney service initialization failed:', error.response?.data || error.message);
            return false;
        }
    }

    generateOrderNumber() {
        return 'PM' + Date.now();
    }

    generateYooMoneyLabel(orderNumber) {
        return orderNumber;
    }

    createPaymentUrl(orderNumber, amount, comment = '') {
        if (amount === 0) return null;

        const params = new URLSearchParams({
            receiver: this.receiver,
            'quickpay-form': 'donate',
            targets: `Подписка на WBBot (${orderNumber})`,
            sum: amount,
            label: this.generateYooMoneyLabel(orderNumber),
            comment: comment,
            'need-fio': 'false',
            'need-email': 'false',
            'need-phone': 'false',
            'need-address': 'false',
        });

        return `${this.baseUrl}?${params.toString()}`;
    }

    async createOrder(userId, planType, amount, duration) {
        const orderNumber = this.generateOrderNumber();
        const yoomoneyLabel = this.generateYooMoneyLabel(orderNumber);
        const paymentUrl = amount > 0 ? this.createPaymentUrl(orderNumber, amount, `${duration} подписка`) : null;

        // Импортируем здесь чтобы избежать циклических зависимостей
        const orderModel = (await import('../db/models/order.js')).default;
        const result = await orderModel.create(userId, orderNumber, planType, amount, yoomoneyLabel, paymentUrl);

        return {
            id: result.lastInsertRowid,
            orderNumber,
            paymentUrl,
            amount,
            planType,
        };
    }

    // Проверка статуса платежа
    async checkPaymentStatus(orderNumber) {
        if (!this.accessToken) {
            return {
                status: 'error',
                message: 'Сервис проверки платежей не настроен',
            };
        }

        try {
            const response = await this.apiClient.post(
                '/operation-history',
                new URLSearchParams({
                    type: 'deposition',
                    label: orderNumber,
                    records: '10',
                    details: 'true',
                })
            );

            const data = response.data;

            if (data.error) {
                console.error('YooMoney API Error:', data.error);
                return {
                    status: 'error',
                    error: 'api_error',
                    message: 'Ошибка API ЮMoney: ' + data.error,
                };
            }

            if (data.operations && data.operations.length > 0) {
                const operation = data.operations.find((op) => op.label === orderNumber);

                if (operation) {
                    if (operation.status === 'success') {
                        return {
                            status: 'success',
                            payment_status: 'success',
                            operation_id: operation.operation_id,
                            amount: operation.amount,
                            datetime: operation.datetime,
                            direction: operation.direction,
                            title: operation.title,
                        };
                    }

                    return {
                        status: 'found',
                        payment_status: operation.status,
                        operation_id: operation.operation_id,
                        message: this.getStatusMessage(operation.status),
                        datetime: operation.datetime,
                        amount: operation.amount,
                    };
                }
            }

            return {
                status: 'not_found',
                message: 'Платеж не найден. Возможно, оплата еще не поступила.',
            };
        } catch (error) {
            console.error('Error checking payment status:', error.response?.data || error.message);
            return {
                status: 'error',
                error: 'request_failed',
                message: 'Ошибка при запросе статуса платежа',
            };
        }
    }

    // Расширенная проверка с повторными попытками
    async checkPaymentStatusExtended(orderNumber, maxAttempts = 2) {
        if (!this.accessToken) {
            return {
                status: 'error',
                message: 'Сервис проверки платежей не настроен',
            };
        }

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                console.log(`Checking payment status for ${orderNumber}, attempt ${attempt}`);

                const result = await this.checkPaymentStatus(orderNumber);

                if (result.status !== 'not_found') {
                    return result;
                }

                if (attempt < maxAttempts) {
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }
            } catch (error) {
                console.error(`Attempt ${attempt} failed:`, error);
                if (attempt === maxAttempts) {
                    return {
                        status: 'error',
                        message: 'Ошибка при проверке платежа',
                    };
                }
            }
        }

        return {
            status: 'not_found',
            message: 'Платеж не найден после всех попыток поиска',
        };
    }

    getStatusMessage(status) {
        const messages = {
            success: '✅ Платеж успешно завершен',
            refused: '❌ Платеж отклонен',
            in_progress: '⏳ Платеж в обработке',
            waiting: '⏳ Ожидание подтверждения',
            not_found: '🔍 Платеж не найден',
            hold: '⏳ Средства заблокированы (холд)',
        };
        return messages[status] || `Статус: ${status}`;
    }

    getPlanInfo(planType) {
        const plans = {
            TRIAL: { amount: 0, duration: '2 недели', days: 14 },
            MONTHLY: { amount: 90, duration: '1 месяц', days: 30 },
            QUARTERLY: { amount: 250, duration: '3 месяца', days: 90 },
        };
        return plans[planType];
    }
}
