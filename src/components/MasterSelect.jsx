import React from 'react'

export default function MasterSelect({ label, name, value, onChange, options, allowEmpty = false, onAdd, className }) {
  const [adding, setAdding] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const input = React.useRef(null)
  const busy = React.useRef(false)
  const values = value && !options.includes(value) ? [value, ...options] : options

  async function add() {
    if (busy.current || !newName.trim()) return
    busy.current = true
    setSaving(true)
    setError('')
    try {
      const result = await onAdd(newName)
      if (!result) return
      onChange(result)
      setAdding(false)
      setNewName('')
    } catch (error) {
      setError(error.message)
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  return <div className={className}>
    <label>{label}
      <select value={value || ''} onChange={event => onChange(event.target.value)}>
        {allowEmpty && <option value="">-</option>}
        {values.map(option => <option key={option}>{option}</option>)}
      </select>
    </label>
    {onAdd && !adding && <button type="button" onClick={() => { setAdding(true); requestAnimationFrame(() => input.current?.focus()) }}>
      + Tambah {name}
    </button>}
    {adding && <div>
      <label>Nama {name} baru
        <input ref={input} value={newName} maxLength={100} disabled={saving}
          onChange={event => setNewName(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add() } }} />
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="button" disabled={saving || !newName.trim()} onClick={add}>Simpan {name}</button>{' '}
      <button type="button" disabled={saving} onClick={() => { setAdding(false); setNewName(''); setError('') }}>Batal tambah</button>
    </div>}
  </div>
}
