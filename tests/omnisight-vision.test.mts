import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOmniSightVisionContent } from '../netlify/functions/lib/omnisight-vision.mts'

test('includes prompt and only unique HTTPS images', () => {
  const parts = buildOmniSightVisionContent('inspect lot', [
    'https://cdn.example.com/lot-1.jpg',
    'https://cdn.example.com/lot-1.jpg',
    'http://insecure.example.com/a.jpg',
    'javascript:alert(1)',
    'https://user:pass@example.com/a.jpg',
    'https://cdn.example.com/lot-2.webp',
  ])
  assert.equal(parts[0].type, 'input_text')
  assert.equal(parts[0].text, 'inspect lot')
  assert.deepEqual(parts.slice(1).map(part => part.image_url), [
    'https://cdn.example.com/lot-1.jpg',
    'https://cdn.example.com/lot-2.webp',
  ])
})

test('caps image count and ignores malformed inputs', () => {
  const parts = buildOmniSightVisionContent('prompt', [
    'https://a.example/1.jpg',
    'https://a.example/2.jpg',
    'https://a.example/3.jpg',
    'https://a.example/4.jpg',
    'https://a.example/5.jpg',
    null,
    42,
  ], 3)
  assert.equal(parts.length, 4)
})

test('does not allow local hosts', () => {
  const parts = buildOmniSightVisionContent('prompt', [
    'https://localhost/private.jpg',
    'https://image.local/private.jpg',
    'https://public.example/image.jpg',
  ])
  assert.deepEqual(parts.slice(1).map(part => part.image_url), [
    'https://public.example/image.jpg',
  ])
})
