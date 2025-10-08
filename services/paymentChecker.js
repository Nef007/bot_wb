import { paymentController } from '../controllers/paymentController.js';

export class PaymentChecker {
    constructor() {
        this.interval = null;
        this.isChecking = false;
    }

    start() {
        // Проверяем каждые 15 минут
        this.interval = setInterval(async () => {
            if (!this.isChecking) {
                this.isChecking = true;
                try {
                    await paymentController.checkAllPendingPayments();
                } catch (error) {
                    console.error('Error in scheduled payment check:', error);
                } finally {
                    this.isChecking = false;
                }
            }
        }, 15 * 60 * 1000);

        // Первая проверка при запуске
        setTimeout(() => {
            paymentController.checkAllPendingPayments();
        }, 5000);

        console.log('✅ Payment checker started with Axios');
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            console.log('🛑 Payment checker stopped');
        }
    }

    // Ручной запуск проверки
    async manualCheck() {
        if (!this.isChecking) {
            this.isChecking = true;
            try {
                const result = await paymentController.checkAllPendingPayments();
                return result;
            } finally {
                this.isChecking = false;
            }
        }
        return { error: 'Check already in progress' };
    }
}
