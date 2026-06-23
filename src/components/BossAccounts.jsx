import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { extractInvoiceFromImage } from '../lib/claude.js'
import { formatMoney } from '../utils/csv.js'
import AddressInput from './AddressInput.jsx'

const EMPTY_ACCOUNT = { name: '', address: '', phone: '', payment_terms: '', notes: '' }

export default function BossAccounts() {
  const [accounts, setAccounts] = useState([])
  const [services, setServices] = useState({})  // accountId -> services[]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)   // account row or 'new'
  const [editServices, setEditServices] = useState([])
  const [form, setForm] = useState(EMPTY_ACCOUNT)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrError, setOcrError] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)      // scanned invoice, saved with the account
  const [extractedJson, setExtractedJson] = useState(null)

  const load = async () => {
    setLoading(true); setError(null)
    const { data: acc, error: e1 } = await supabase
      .from('accounts')
      .select('*')
      .order('name', { ascending: true })
    if (e1) { setError(e1.message); setLoading(false); return }
    const { data: svc, error: e2 } = await supabase
      .from('services')
      .select('*')
      .order('service_name', { ascending: true })
    if (e2) { setError(e2.message); setLoading(false); return }
    const byAccount = {}
    for (const s of svc) {
      byAccount[s.account_id] = byAccount[s.account_id] || []
      byAccount[s.account_id].push(s)
    }
    setAccounts(acc)
    setServices(byAccount)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const startNew = () => {
    setEditing('new')
    setForm(EMPTY_ACCOUNT)
    setEditServices([{ service_name: '', price_per_unit: '' }])
    setOcrError(null)
    setPhotoFile(null)
    setExtractedJson(null)
  }

  const startEdit = (account) => {
    setEditing(account)
    setForm({
      name: account.name || '',
      address: account.address || '',
      phone: account.phone || '',
      payment_terms: account.payment_terms || '',
      notes: account.notes || ''
    })
    setEditServices((services[account.id] || []).map((s) => ({
      id: s.id, service_name: s.service_name, price_per_unit: String(s.price_per_unit)
    })))
    setOcrError(null)
    setPhotoFile(null)
    setExtractedJson(null)
  }

  const onPhoto = async (file) => {
    if (!file) return
    setPhotoFile(file)
    setOcrBusy(true); setOcrError(null)
    const result = await extractInvoiceFromImage(file)
    setOcrBusy(false)
    if (!result.ok) {
      setOcrError(
        (result.error || 'Could not extract from image') +
        ' — you can still fill the fields manually below.'
      )
      return
    }
    const d = result.data || {}
    setExtractedJson(d)
    setForm((f) => ({
      ...f,
      name: d.name || f.name,
      address: d.address || f.address,
      phone: d.phone || f.phone,
      payment_terms: d.payment_terms || f.payment_terms
    }))
    if (Array.isArray(d.services) && d.services.length) {
      setEditServices(d.services.map((s) => ({
        service_name: s.service_name || '',
        price_per_unit: s.price_per_unit != null ? String(s.price_per_unit) : ''
      })))
    }
  }

  const save = async () => {
    if (!form.name.trim()) { setError('Account name is required'); return }
    setError(null)
    let accountId
    if (editing === 'new') {
      const { data, error: e } = await supabase
        .from('accounts')
        .insert([{ ...form }])
        .select()
        .single()
      if (e) { setError(e.message); return }
      accountId = data.id
    } else {
      const { error: e } = await supabase
        .from('accounts')
        .update({ ...form })
        .eq('id', editing.id)
      if (e) { setError(e.message); return }
      accountId = editing.id
    }

    // Replace services for the account: simplest correct approach.
    const validServices = editServices
      .filter((s) => s.service_name.trim() && s.price_per_unit !== '')
      .map((s) => ({
        account_id: accountId,
        service_name: s.service_name.trim(),
        price_per_unit: Number(s.price_per_unit)
      }))
    const { error: delErr } = await supabase
      .from('services')
      .delete()
      .eq('account_id', accountId)
    if (delErr) { setError(delErr.message); return }
    if (validServices.length) {
      const { error: insErr } = await supabase.from('services').insert(validServices)
      if (insErr) { setError(insErr.message); return }
    }

    // Persist the scanned invoice photo (if any) to the private bucket and
    // record it. Non-fatal: a storage hiccup must not lose the account edits.
    if (photoFile) {
      try {
        const ext = (photoFile.name?.split('.').pop() || 'jpg').toLowerCase()
        const storagePath = `${accountId}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase
          .storage
          .from('invoices')
          .upload(storagePath, photoFile, { contentType: photoFile.type || 'image/jpeg', upsert: false })
        if (upErr) throw upErr
        const { error: invErr } = await supabase
          .from('invoices')
          .insert([{ account_id: accountId, storage_path: storagePath, extracted_json: extractedJson }])
        if (invErr) throw invErr
      } catch (err) {
        console.error('[invoices] save failed', err)
        setOcrError(`Account saved, but the invoice photo could not be stored: ${err.message}`)
      }
    }

    setEditing(null)
    await load()
  }

  const remove = async (account) => {
    if (!confirm(`Delete "${account.name}" and all of its services?`)) return
    const { error: e } = await supabase.from('accounts').delete().eq('id', account.id)
    if (e) { setError(e.message); return }
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="ae-h1">Accounts</h1>
          <p className="ae-muted text-sm mt-1">
            Permanent customer records. Invoice photos auto-delete after 90 days.
          </p>
        </div>
        <button type="button" className="ae-btn" onClick={startNew}>+ New account</button>
      </div>

      {error && <div className="ae-card p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="ae-muted">Loading accounts…</div>
      ) : accounts.length === 0 ? (
        <div className="ae-card p-6 text-center">
          <p className="ae-muted">No accounts yet. Add your first one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {accounts.map((a) => (
            <div key={a.id} className="ae-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-base">{a.name}</div>
                  {a.address && <div className="ae-muted text-sm mt-0.5">{a.address}</div>}
                  {a.phone && <div className="ae-muted text-sm">{a.phone}</div>}
                  {a.payment_terms && (
                    <div className="mt-1"><span className="ae-chip">{a.payment_terms}</span></div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <button className="ae-btn-secondary text-sm py-1.5 px-3" onClick={() => startEdit(a)}>Edit</button>
                  <button className="ae-btn-danger text-sm py-1.5 px-3" onClick={() => remove(a)}>Delete</button>
                </div>
              </div>
              {(services[a.id] || []).length > 0 && (
                <div className="mt-3 border-t border-classic-border/40 pt-2 space-y-0.5">
                  {(services[a.id] || []).map((s) => (
                    <div key={s.id} className="flex justify-between text-sm">
                      <span>{s.service_name}</span>
                      <span className="font-mono">{formatMoney(s.price_per_unit)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-2">
          <div className="ae-card w-full max-w-lg max-h-[92vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="ae-h2">{editing === 'new' ? 'New account' : `Edit ${editing.name}`}</h2>
              <button className="ae-muted text-sm underline" onClick={() => setEditing(null)}>Cancel</button>
            </div>

            {editing === 'new' && (
              <div className="ae-card p-3 mb-4 border-dashed">
                <label className="ae-label">Scan an invoice (optional)</label>
                <p className="ae-muted text-xs mb-2">
                  Snap a photo and Claude Vision will pre-fill the fields below.
                </p>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={ocrBusy}
                  onChange={(e) => onPhoto(e.target.files?.[0])}
                  className="text-sm"
                />
                {ocrBusy && <div className="text-sm mt-2 ae-muted">Reading invoice…</div>}
                {ocrError && <div className="text-sm mt-2 text-amber-600">{ocrError}</div>}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="ae-label">Account name *</label>
                <input className="ae-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="ae-label">Address</label>
                <AddressInput value={form.address} onChange={(address) => setForm({ ...form, address })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="ae-label">Phone</label>
                  <input className="ae-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div>
                  <label className="ae-label">Payment terms</label>
                  <input className="ae-input" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="Net 30" />
                </div>
              </div>
              <div>
                <label className="ae-label">Notes</label>
                <textarea className="ae-input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              <div>
                <label className="ae-label">Services & pricing</label>
                <div className="space-y-2">
                  {editServices.map((s, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        className="ae-input flex-1"
                        placeholder="Service (e.g. Chef knife)"
                        value={s.service_name}
                        onChange={(e) => {
                          const copy = [...editServices]
                          copy[i] = { ...copy[i], service_name: e.target.value }
                          setEditServices(copy)
                        }}
                      />
                      <input
                        className="ae-input w-28"
                        placeholder="$ per unit"
                        inputMode="decimal"
                        value={s.price_per_unit}
                        onChange={(e) => {
                          const copy = [...editServices]
                          copy[i] = { ...copy[i], price_per_unit: e.target.value }
                          setEditServices(copy)
                        }}
                      />
                      <button
                        type="button"
                        className="ae-btn-danger px-3 py-1"
                        onClick={() => setEditServices(editServices.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="ae-btn-secondary py-2 px-3 text-sm"
                    onClick={() => setEditServices([...editServices, { service_name: '', price_per_unit: '' }])}
                  >
                    + Add service line
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="ae-btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="ae-btn" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
