import { createFileRoute } from '@tanstack/react-router'
import { handleMobileAPI } from '../../../../server/mobile-api'

export const Route = createFileRoute('/api/mobile/v1/$')({
  server: { handlers: {
    GET: ({ request, params }) => handleMobileAPI(request, params._splat ?? ''),
    POST: ({ request, params }) => handleMobileAPI(request, params._splat ?? ''),
    PUT: ({ request, params }) => handleMobileAPI(request, params._splat ?? ''),
  } },
})
