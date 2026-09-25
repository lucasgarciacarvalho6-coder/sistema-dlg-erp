// Sem React: pode ser importado pelo layout raiz (Server Component).
export const CHAVE_TEMA = 'dlg-erp:tema'

// Script inline (roda antes do React) — evita "piscar" o tema errado ao abrir a página
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem('${CHAVE_TEMA}');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}})()`
