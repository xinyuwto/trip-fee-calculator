import { describe, it, expect, vi } from 'vitest'
import { downloadJsonFile } from '../import-export'

it('triggers download on the DOM', () => {
  // downloadJsonFile creates a temporary anchor element and clicks it.
  // We spy on URL.createObjectURL and the click.
  let clicked = false
  const originalCreateObjectURL = URL.createObjectURL
  URL.createObjectURL = (blob) => {
    expect(blob.type).toBe('application/json')
    return 'blob:fake'
  }

  const originalCreateElement = document.createElement
  document.createElement = (tag) => {
    const el = originalCreateElement.call(document, tag)
    if (tag === 'a') {
      const originalClick = el.click.bind(el)
      el.click = () => {
        clicked = true
        originalClick()
      }
    }
    return el
  }

  downloadJsonFile('{"test":1}', 'test.json')

  expect(clicked).toBe(true)

  // Cleanup
  URL.createObjectURL = originalCreateObjectURL
  document.createElement = originalCreateElement
})
