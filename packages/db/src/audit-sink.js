import { encode } from '@momo/domain';
import * as s from './schema';
import { holdsWatermark, lockWatermark } from './watermark-lock';
export function auditSinkOn(bound) {
    const { tx, tenantId } = bound;
    return {
        append: async (entry) => {
            if (!holdsWatermark(tx))
                await lockWatermark(bound, { kind: 'tenant' });
            await tx.insert(s.auditLog).values({
                tenantId,
                actor: entry.actor,
                action: entry.action,
                target: entry.target,
                payload: encode(entry.payload),
                at: entry.at,
            });
        },
    };
}
