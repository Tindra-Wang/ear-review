import type { Analysis, PreviewRow } from '../../../packages/contracts/index.js';
import { SqliteDatabase } from './sqlite-database.js';
import { ProductRepository } from './repositories/product-repository.js';
import { ReviewRepository } from './repositories/review-repository.js';
import { BatchRepository } from './repositories/batch-repository.js';
import { JobRepository } from './repositories/job-repository.js';
import { CollectionRepository } from './repositories/collection-repository.js';
import { AdminRepository } from './repositories/admin-repository.js';
import { aggregateProductStats } from './services/product-statistics.js';
export { RUNTIME_DIR } from './sqlite-database.js';
export { fingerprint } from './fingerprint.js';
/** Compatibility facade and repository composition; no SQL or NLP algorithm lives here. */
export class Store extends SqliteDatabase {
    readonly jobRepository: JobRepository;
    readonly collectionRepository: CollectionRepository;
    readonly productRepository: ProductRepository;
    readonly reviewRepository: ReviewRepository;
    readonly batchRepository: BatchRepository;
    readonly adminRepository: AdminRepository;
    constructor(path?: string, private baselineVersion = '') { super(path); this.productRepository = new ProductRepository(this); this.reviewRepository = new ReviewRepository(this, baselineVersion); this.batchRepository = new BatchRepository(this); this.adminRepository = new AdminRepository(this); this.jobRepository = new JobRepository(this, this.reviewRepository); this.collectionRepository = new CollectionRepository(this, this.productRepository); }
    products() { return this.productRepository.all(); }
    review(id: number, pure = false) { return this.reviewRepository.get(id, pure); }
    reviews(productId?: string, pure = false) { return this.reviewRepository.list(productId, pure); }
    savePrediction(id: number, result: Analysis) { return this.reviewRepository.savePrediction(id, result); }
    stats(productId: string, pure = false) { const product = this.products().find(p => p.id === productId); return product ? aggregateProductStats(product, this.reviews(productId, pure), this.baselineVersion) : undefined; }
    importRows(rows: PreviewRow[], name: string, source: string) { return this.batchRepository.importRows(rows, name, source); }
    jobs() { return this.jobRepository.list(); }
    batches() { return this.batchRepository.batches(); }
}
