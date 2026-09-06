// Exercises the exact bearer-authenticated upload protocols used by iOS.
// Hardcoded to synthetic localhost fixtures; never accepts a hosted origin.
import assert from 'node:assert/strict'
const base = 'http://localhost:3088'
async function login(email) {
  const r = await fetch(base + '/api/dev-login?as=' + encodeURIComponent(email), { method: 'POST', headers: { Origin: base }, redirect: 'manual' })
  const token = r.headers.get('set-auth-token'); assert.ok(token); return token
}
async function request(token, path, method = 'GET', body, type = 'application/json') {
  const r = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + token, Origin: base, 'Content-Type': type }, body: body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : body })
  return r
}
async function json(token, path, method = 'GET', body, type) {
  const r = await request(token, path, method, body, type)
  const data = await r.json(); assert.ok(r.ok, path.split('?')[0] + ': ' + JSON.stringify(data)); return data
}
const action = (token, operation, values) => json(token, '/api/mobile/v1/workspace/action', 'POST', { operation, values })
const screen = (token, path) => json(token, '/api/mobile/v1/workspace?screen=' + encodeURIComponent(path))
const admin = await login('sindre@demo.tertnesbrass.no')
const member = await login('ingrid@demo.tertnesbrass.no')
const snapshot = await json(admin, '/api/mobile/v1/snapshot')
const original = await request(admin, snapshot.scores[0].path)
assert.equal(original.status, 200)
const pdf = Buffer.from(await original.arrayBuffer())
assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
const name = 'Native upload smoke ' + Date.now()
let workId, postId, documentId
try {
  await action(admin, 'works.createWork', { title: name })
  const archive = await screen(admin, 'archive')
  workId = archive.sections.flatMap(s => s.rows).find(r => r.title === name).path.split('/').at(-1)
  const input = { workId, fileName: 'native-smoke.pdf', fileSize: pdf.length }
  assert.equal((await request(member, '/api/upload/start', 'POST', input)).status, 403)
  const ticket = await json(admin, '/api/upload/start', 'POST', input)
  const parts = []
  for (let offset = 0; offset < pdf.length; offset += ticket.partSize) {
    const query = new URLSearchParams({ token: ticket.token, part: String(parts.length + 1) })
    parts.push(await json(admin, '/api/upload/part?' + query, 'PUT', pdf.subarray(offset, offset + ticket.partSize), 'application/octet-stream'))
  }
  const completed = await json(admin, '/api/upload/complete', 'POST', { token: ticket.token, parts, pageCount: 1, partId: 'score' })
  assert.equal(completed.file.partId, 'score')
  const downloaded = await request(admin, '/api/files/' + completed.file.id)
  assert.equal(downloaded.status, 200); assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdf)
  assert.equal((await request(member, '/api/files/' + completed.file.id)).status, 403)
  const documentPath = '/api/board-files/upload?' + new URLSearchParams({ name: 'native-smoke.pdf', title: name })
  assert.equal((await request(member, documentPath, 'PUT', pdf, 'application/pdf')).status, 403)
  const document = await json(admin, documentPath, 'PUT', pdf, 'application/pdf'); documentId = document.document.id
  assert.equal((await request(admin, '/api/board-files/' + documentId)).status, 200)
  assert.equal((await request(member, '/api/board-files/' + documentId)).status, 403)
  const post = await json(member, '/api/mobile/v1/posts', 'POST', { body: name }); postId = post.id
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=', 'base64')
  const image = await json(member, '/api/post-images/upload?' + new URLSearchParams({ postId, fileName: 'native-smoke.png' }), 'PUT', png, 'image/png')
  const shown = await request(member, '/api/post-images/' + image.id)
  assert.equal(shown.status, 200); assert.deepEqual(Buffer.from(await shown.arrayBuffer()), png)
  await action(member, 'posts.deletePostImage', { id: image.id })
  console.log('PASS: multipart PDF, explicit part assignment, exact download bytes, board document and post image uploads, permission denials')
} finally {
  if (postId) await action(member, 'posts.deletePost', { id: postId })
  if (documentId) await action(admin, 'board.deleteDocument', { id: documentId })
  if (workId) await action(admin, 'works.deleteWork', { id: workId })
}
