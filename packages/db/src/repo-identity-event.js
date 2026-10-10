import { encode } from '@momo/domain';
import { identityEvent } from './schema';
export function identityEventWriterOn(db) {
    return {
        record: async (entry) => {
            await db.transaction((tx) => tx.insert(identityEvent).values({
                id: entry.id,
                userId: entry.userId,
                action: entry.action,
                at: entry.at,
                payload: entry.payload === undefined ? null : encode(entry.payload),
            }));
        },
    };
}
