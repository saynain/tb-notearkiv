import { z } from 'zod';
import * as posts from './posts';
import * as board from './board';
import * as leaders from './gruppeledere';
import { MobileError } from '../lib/mobile-http';
export const mentionQuery = z.object({ operation: z.string().max(100), query: z.string().max(60), postId: z.string().optional(), audience: z.enum(['all', 'board']).optional() }).strict();
export async function mobileMentions(input: z.infer<typeof mentionQuery>) {
    if (input.operation === 'board.postMessage')
        return board.searchMentionableMembers({ data: { query: input.query } });
    if (input.operation === 'gruppeledere.postMessage')
        return leaders.searchMentionableMembers({ data: { query: input.query } });
    if (input.operation === 'posts.addComment' && input.postId)
        return posts.searchMentionableMembers({ data: { postId: input.postId, query: input.query } });
    if (input.operation === 'posts.createPost' || input.operation === 'posts.updatePost')
        return posts.searchMentionableForAudience({ data: { audience: input.audience ?? 'all', query: input.query } });
    throw new MobileError(400, 'invalid_input', 'Omtaler er ikke tilgjengelige her.');
}
