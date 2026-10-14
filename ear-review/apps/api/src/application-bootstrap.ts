import { Store } from './store.js';
import { MODEL, analyze } from '../../../packages/nlp/index.js';
import { DEMO_PRODUCTS, DEMO_REVIEWS } from '../../../data/demo.js';
import { fingerprint } from './fingerprint.js';
/** Composition root: demo initialization depends on NLP; repositories do not. */
export class ApplicationStore extends Store {
    constructor(path?: string, seed = true) { super(path, MODEL.version); if (seed && !this.products().length)
        seedDemo(this); }
}
function seedDemo(store: Store) {
    store.transaction(() => {
        const batch = store.run('INSERT INTO batches(name,source,created_at) VALUES(?,?,?)', '预置教学样例', '人工编写，非真实测评', new Date().toISOString());
        for (const product of DEMO_PRODUCTS) {
            store.run('INSERT INTO products VALUES(?,?,?,?)', product.id, product.name, product.subtitle, product.source);
            for (const [i, text] of DEMO_REVIEWS[product.id]!.entries()) {
                const row = store.run('INSERT INTO reviews(product_id,external_id,text,fingerprint,source,synthetic,batch_id) VALUES(?,?,?,?,?,?,?)', product.id, `demo-${i + 1}`, text, fingerprint(text), '教学合成样例', 1, Number(batch.lastInsertRowid));
                store.savePrediction(Number(row.lastInsertRowid), analyze(text));
            }
        }
    });
}
