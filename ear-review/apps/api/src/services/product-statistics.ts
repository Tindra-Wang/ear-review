import { ASPECTS, type Product, type Review, type ProductStats, type AspectStat } from '../../../../packages/contracts/index.js';
export function aggregateProductStats(product: Product, reviews: Review[], baselineVersion: string): ProductStats {
    const aspects: AspectStat[] = ASPECTS.map(a => {
        const stat: AspectStat = { aspect: a.id, total: 0, positive: 0, negative: 0, neutral: 0, mixed: 0, pending: 0, corrected: 0, positiveRatio: null, examples: [] };
        for (const review of reviews) {
            const opinion = review.opinions.find(o => o.aspect === a.id);
            if (!opinion)
                continue;
            if (opinion.status === 'review')
                stat.pending++;
            else {
                stat.total++;
                stat[opinion.sentiment]++;
            }
            if (opinion.corrected)
                stat.corrected++;
            if (stat.examples.length < 3)
                stat.examples.push(review);
        }
        stat.positiveRatio = stat.total ? Math.round(stat.positive / stat.total * 100) : null;
        return stat;
    });
    return { product, reviews: reviews.length, analyzed: reviews.filter(r => r.analyzed).length, synthetic: reviews.filter(r => r.isSynthetic).length, version: [...new Set(reviews.filter(r => r.analyzed).map(r => r.modelVersion))].join(' / ') || baselineVersion, aspects };
}
