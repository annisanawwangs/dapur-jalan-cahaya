const timeZone = 'Asia/Makassar'

export const localDate = (date = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone }).format(date)

export const localTime = (date = new Date()) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)

export function monthRange(month = localDate().slice(0, 7)) {
  const [year, number] = month.split('-').map(Number)
  const nextYear = number === 12 ? year + 1 : year
  const nextMonth = number === 12 ? 1 : number + 1
  return { from: month + '-01', to: nextYear + '-' + String(nextMonth).padStart(2, '0') + '-01' }
}

export function requestItems(items) {
  return items.filter(item => item.item_name.trim()).map(item => ({
    item_name: item.item_name.trim(),
    qty: Number(item.qty),
    unit: item.unit,
    unit_price: Number(item.unit_price),
  }))
}

export function requestTotal(items) {
  return items.reduce((total, item) => total + Math.round(item.qty * item.unit_price * 100), 0) / 100
}
