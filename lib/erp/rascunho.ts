// Rascunho da venda em andamento no app do vendedor, guardado NO CELULAR (IndexedDB).
// Se o app fechar no meio (ao abrir a câmera, trocar de app, bateria...), ao voltar a venda
// continua de onde parou, com dados, fotos e assinatura. Some ao enviar ou descartar.

const BANCO = 'dlg-erp-rascunhos'
const TABELA = 'vendas'

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(BANCO, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(TABELA)
    req.onsuccess = () => ok(req.result)
    req.onerror = () => erro(req.error)
  })
}

async function operar<T>(modo: IDBTransactionMode, fn: (t: IDBObjectStore) => IDBRequest): Promise<T | null> {
  try {
    const db = await abrir()
    return await new Promise<T | null>((ok) => {
      const req = fn(db.transaction(TABELA, modo).objectStore(TABELA))
      req.onsuccess = () => ok((req.result as T) ?? null)
      req.onerror = () => ok(null)
    })
  } catch {
    return null // navegador sem IndexedDB (ex.: janela anônima): segue sem rascunho
  }
}

export const lerRascunho = <T>(chave: string) => operar<T>('readonly', (t) => t.get(chave))
export const salvarRascunho = (chave: string, dados: unknown) => operar('readwrite', (t) => t.put(dados, chave))
export const apagarRascunho = (chave: string) => operar('readwrite', (t) => t.delete(chave))
