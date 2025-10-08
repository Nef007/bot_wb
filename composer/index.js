import { createSuggestionsComposer } from './suggestionsComposer.js';
import { createSubscriptionComposer } from './subscriptionComposer.js';
import { createAdminComposer } from './adminComposer.js';
import { createMenuComposer } from './menuComposer.js';
import { createCategoryComposer } from './categoryComposer.js';
export default [
    createSubscriptionComposer,
    createSuggestionsComposer,
    createAdminComposer,
    createMenuComposer,
    createCategoryComposer,
];
