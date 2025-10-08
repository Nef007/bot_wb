import { WildberriesAbstractAPI } from './wbAbstractAPI.js';

export class WildberriesAPI extends WildberriesAbstractAPI {
    Catalog = {
        /**
         * Get products from catalog with pagination
         */
        getProducts: async (catalog, categoryId, page = 1, sort = 'popular') => {
            const url = this.buildCatalogUrl(catalog, page, sort);
            const params = {
                ...(categoryId && { cat: categoryId }),
            };

            return this.request('GET', url, { qs: params });
        },

        /**
         * Get all products from category (with auto-pagination)
         */
        getAllProducts: async (catalog, categoryId, maxPages = 30, delayBetweenPages = 1000) => {
            const allProducts = [];

            // Сначала получаем первую страницу чтобы узнать общее количество
            const firstPage = await this.Catalog.getProducts(catalog, categoryId, 1);
            const totalProducts = firstPage.data?.total || 0;
            const actualMaxPages = Math.min(maxPages, Math.ceil(totalProducts / 100));

            console.log(`📊 Category ${categoryId}: ${totalProducts} total products, scanning ${actualMaxPages} pages`);

            for (let page = 1; page <= actualMaxPages; page++) {
                try {
                    console.log(`📄 Scanning page ${page}/${actualMaxPages}`);

                    const response = await this.Catalog.getProducts(catalog, categoryId, page);
                    const products = response.data?.products || [];

                    if (products.length === 0) break;

                    allProducts.push(...products);

                    // Задержка между страницами
                    if (page < actualMaxPages) {
                        await this.sleep(delayBetweenPages);
                    }
                } catch (error) {
                    console.error(`❌ Error scanning page ${page}:`, error.message);
                    break;
                }
            }

            return {
                categoryId,
                catalog,
                totalProducts: allProducts.length,
                products: allProducts,
                scannedPages: actualMaxPages,
            };
        },
    };

    Price = {
        /**
         * Get price history for a product
         */
        getHistory: async (productId) => {
            const productUrl = this.makeProductImageUrl(productId);
            const historyUrl = `${productUrl}/info/price-history.json`;

            try {
                return await this.request('GET', historyUrl);
            } catch (error) {
                console.error(`❌ Error getting price history for ${productId}:`, error.message);
                return null;
            }
        },

        /**
         * Calculate price change percentage
         */
        calculateChange: (currentPrice, previousPrice) => {
            if (!previousPrice || previousPrice === 0) return 0;
            const diff = previousPrice - currentPrice;
            return Math.floor((diff / previousPrice) * 100);
        },

        /**
         * Get current price from product data
         */
        getCurrentPrice: (product) => {
            return product.sizes?.[0]?.price?.total || product.salePrice || product.price || 0;
        },
    };

    Product = {
        /**
         * Get detailed product information
         */
        getDetail: async (productId) => {
            const detailUrls = [
                `https://card.wb.ru/cards/detail?nm=${productId}`,
                `https://wbx-content-v2.wbstatic.net/ru/${productId}.json`,
                `https://product-order.wildberries.ru/basket/get?nm=${productId}`,
            ];

            for (const url of detailUrls) {
                try {
                    const data = await this.request('GET', url);
                    if (data) return data;
                } catch (error) {
                    continue;
                }
            }
            throw new Error('Не удалось получить детальную информацию о товаре');
        },

        /**
         * Analyze product price changes
         */
        analyzePriceChanges: async (products, thresholdPercent = 5) => {
            const productsWithChanges = [];

            for (const product of products) {
                try {
                    const currentPrice = this.Price.getCurrentPrice(product);
                    const priceHistory = await this.Price.getHistory(product.id);

                    if (priceHistory?.data && priceHistory.data.length > 0) {
                        const previousPrice = priceHistory.data[priceHistory.data.length - 1].price.RUB;
                        const percentChange = this.Price.calculateChange(currentPrice, previousPrice);

                        if (Math.abs(percentChange) >= thresholdPercent) {
                            productsWithChanges.push({
                                id: product.id,
                                name: product.name,
                                brand: product.brand,
                                currentPrice,
                                previousPrice,
                                percentChange,
                                priceHistory: priceHistory.data,
                                imageUrl: this.makeProductImageUrl(product.id),
                            });
                        }
                    }

                    // Задержка между запросами истории цен
                    await this.sleep(100);
                } catch (error) {
                    console.error(`❌ Error analyzing product ${product.id}:`, error.message);
                }
            }

            return productsWithChanges;
        },
    };

    Categories = {
        /**
         * Get main categories menu
         */
        getMainMenu: async () => {
            return this.request('GET', 'https://static-basket-01.wbbasket.ru/vol0/data/main-menu-ru-ru-v3.json');
        },

        /**
         * Get all categories (flattened structure)
         */
        getAll: async () => {
            const mainMenu = await this.Categories.getMainMenu();
            return this.flattenCategories(mainMenu);
        },

        /**
         * Get category by ID
         */
        getById: async (categoryId) => {
            const allCategories = await this.Categories.getAll();
            return allCategories.find((cat) => cat.id === categoryId);
        },

        /**
         * Detect catalog by category
         */
        detectCatalog: (categoryId) => {
            // Простая логика определения каталога по ID категории
            // Можно расширить на основе реальных данных WB
            if (categoryId >= 8000 && categoryId < 9000) return 'men_clothes6';
            if (categoryId >= 6000 && categoryId < 7000) return 'women_clothes';
            if (categoryId >= 12000 && categoryId < 13000) return 'electronics';
            return 'men_clothes6'; // fallback
        },
    };

    // Вспомогательные методы
    flattenCategories(categories, parentName = '', result = []) {
        for (const category of categories) {
            if (category.id && category.name && category.name !== 'Wibes') {
                const fullName = parentName ? `${parentName} › ${category.name}` : category.name;

                const categoryData = {
                    id: category.id,
                    name: category.name,
                    fullName: fullName,
                    url: category.url,
                    query: category.query,
                    shard: category.shard,
                    dest: category.dest,
                    parentId: category.parent,
                    hasChildren: !!(category.childs && category.childs.length > 0),
                    catalog: this.Categories.detectCatalog(category.id),
                };

                result.push(categoryData);

                if (category.childs && category.childs.length > 0) {
                    this.flattenCategories(category.childs, fullName, result);
                }
            }
        }
        return result;
    }

    // Мониторинг в реальном времени
    async startPriceMonitoring(categoryId, thresholdPercent = 5, checkInterval = 600000) {
        // 10 минут
        const category = await this.Categories.getById(categoryId);
        const catalog = category?.catalog || 'men_clothes6';

        console.log(`🚀 Starting price monitoring for category: ${category?.name} (ID: ${categoryId})`);

        const monitor = async () => {
            try {
                console.log(`🔍 Scanning category ${categoryId} for price changes...`);

                const scanResult = await this.Catalog.getAllProducts(catalog, categoryId, 10, 500); // 10 страниц максимум
                const productsWithChanges = await this.Product.analyzePriceChanges(
                    scanResult.products,
                    thresholdPercent
                );

                console.log(
                    `📈 Found ${productsWithChanges.length} products with price changes ≥ ${thresholdPercent}%`
                );

                return {
                    category: category,
                    scanTime: new Date(),
                    totalProducts: scanResult.products.length,
                    productsWithChanges: productsWithChanges,
                    threshold: thresholdPercent,
                };
            } catch (error) {
                console.error(`❌ Monitoring error for category ${categoryId}:`, error);
                return { error: error.message };
            }
        };

        // Запускаем сразу и затем по расписанию
        const initialResult = await monitor();

        const intervalId = setInterval(async () => {
            await monitor();
        }, checkInterval);

        return {
            initialResult,
            stop: () => clearInterval(intervalId),
        };
    }
}

// Создаем и экспортируем экземпляр по умолчанию
export const wbAPI = new WildberriesAPI();
