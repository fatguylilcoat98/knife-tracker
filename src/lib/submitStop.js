import { supabase } from './supabase.js'

// Write a stop submission to Supabase. Idempotent for a given
// (route_account_id, employee_id): it clears any existing submission first, so
// it covers brand-new submits, edits of flagged stops, and offline replays
// without tripping the unique index.
export async function submitStopToServer(payload) {
  const { routeAccountId, employeeId, total, notes, items } = payload

  const { error: delErr } = await supabase
    .from('submissions')
    .delete()
    .eq('route_account_id', routeAccountId)
    .eq('employee_id', employeeId)
  if (delErr) throw delErr

  const { data: sub, error } = await supabase
    .from('submissions')
    .insert([{
      route_account_id: routeAccountId,
      employee_id: employeeId,
      status: 'pending',
      total_amount: total,
      notes: notes || null
    }])
    .select()
    .single()
  if (error) throw error

  if (Array.isArray(items) && items.length) {
    const rows = items.map((it) => ({ ...it, submission_id: sub.id }))
    const { error: itemsErr } = await supabase.from('submission_items').insert(rows)
    if (itemsErr) throw itemsErr
  }
  return sub
}
