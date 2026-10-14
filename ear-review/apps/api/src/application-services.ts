import type { Store } from './store.js';
import { MODEL } from '../../../packages/nlp/index.js';
import { CollectionService } from './services/collection-service.js';
import { ImportService } from './services/import-service.js';
import { ProductService } from './services/product-service.js';
import { AnalysisJobService } from './services/analysis-job-service.js';
import { ModelService } from './services/model-service.js';
/** 仅在启动边界组装依赖；路由不选择模型、不创建任务或存储实现。 */
export function createApplicationServices(store: Store) {
    return {
        collectionService: new CollectionService(store),
        importService: new ImportService(store),
        productService: new ProductService(store, MODEL.version),
        analysisJobService: new AnalysisJobService(store),
        modelService: new ModelService(),
    };
}
export type ApplicationServices = ReturnType<typeof createApplicationServices>;
