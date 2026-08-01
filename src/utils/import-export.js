export async function copyToClipboard(json) {
  try {
    await navigator.clipboard.writeText(json)
    return { success: true }
  } catch {
    return { success: false, error: '剪贴板访问失败，请手动复制' }
  }
}

export function downloadJsonFile(json, filename = 'trip-expenses.json') {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function importFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    return { success: true, data: text }
  } catch {
    return { success: false, error: '无法读取剪贴板' }
  }
}

export function importFromFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve({ success: true, data: e.target.result })
    reader.onerror = () => resolve({ success: false, error: '文件读取失败' })
    reader.readAsText(file)
  })
}
