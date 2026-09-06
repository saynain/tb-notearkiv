import { z } from 'zod'
import { searchWorksForPicker } from './projects'
import { searchWorksForEvent } from './event-meta'
import { searchProjectsForTask } from './board'

export const choiceQuery = z.object({
  source: z.enum(['project-works', 'event-works', 'board-projects']),
  query: z.string().max(120),
  projectId: z.string().max(128).optional(),
}).strict()

/** Bounded search results keep native pickers useful for the entire archive. */
export async function mobileChoices(input: z.infer<typeof choiceQuery>) {
  if (input.source === 'project-works') {
    const result = await searchWorksForPicker({ data: { q: input.query, excludeProjectId: input.projectId ?? '' } })
    return result.works.map(w => ({ value: w.id, label: w.title }))
  }
  if (input.source === 'event-works') {
    const result = await searchWorksForEvent({ data: { q: input.query } })
    return result.works.map(w => ({ value: w.id, label: w.title }))
  }
  const result = await searchProjectsForTask({ data: { q: input.query } })
  return result.projects.map(p => ({ value: p.id, label: p.name }))
}
