import { supabase } from './supabase'
import { mapAppToUser, mapUserToApp } from '../utils/helpers'

/**
 * Supabase-backed storage with the same API as the old Firebase helpers.
 * All former `hr/*` collections live in `public.hr_records`.
 * `employees` maps to `public.users`.
 */

const genId = () =>
  `-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`

const rowId = (collection, id) => `${collection}::${id}`

function normalizePath(path = '') {
  return String(path || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function parsePath(path) {
  const parts = normalizePath(path).split('/').filter(Boolean)
  if (!parts.length) return { kind: 'empty' }

  if (parts[0] === 'employees') {
    return { kind: 'employees', id: parts[1] || null }
  }

  if (parts[0] === 'hr') {
    if (parts.length === 1) return { kind: 'hr_root' }
    const collection = parts[1]
    if (parts.length === 2) return { kind: 'collection', collection }

    // hr/manualWorkdays/{month} loads all per-employee overrides in that month.
    if (collection === 'manualWorkdays' && parts.length === 3) {
      return {
        kind: 'manual_workdays_month',
        collection,
        month: parts[2]
      }
    }

    // hr/manualWorkdays/{month}/{empId}
    if (collection === 'manualWorkdays' && parts.length >= 4) {
      return {
        kind: 'record',
        collection: 'manualWorkdays',
        id: `${parts[2]}__${parts[3]}`
      }
    }

    // hr/{collection}/{id...}
    return {
      kind: 'record',
      collection,
      id: parts.slice(2).join('__')
    }
  }

  if (parts.length === 1) return { kind: 'collection', collection: parts[0] }
  return { kind: 'record', collection: parts[0], id: parts.slice(1).join('__') }
}

async function listCollection(collection) {
  // Supabase/PostgREST mặc định max 1000 dòng/request — phải phân trang + order ổn định.
  const pageSize = 1000
  const rows = []

  for (let from = 0; ; from += pageSize) {
    const { data, error, count } = await supabase
      .from('hr_records')
      .select('id, data', from === 0 ? { count: 'exact' } : undefined)
      .eq('collection', collection)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) {
      if (typeof count === 'number' && rows.length < count) {
        console.warn(
          `[listCollection:${collection}] thiếu dữ liệu: lấy ${rows.length}/${count}`
        )
      }
      break
    }
  }

  if (!rows.length) return null

  const prefix = `${collection}::`
  const out = {}
  rows.forEach((row) => {
    const logicalId = row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.id
    out[logicalId] = row.data || {}
  })
  return out
}

async function getRecord(collection, id) {
  const { data, error } = await supabase
    .from('hr_records')
    .select('data')
    .eq('id', rowId(collection, id))
    .maybeSingle()

  if (error) throw error
  return data?.data ?? null
}

async function listManualWorkdaysByMonth(month) {
  const legacy = (await getRecord('manualWorkdays', month)) || {}
  const prefix = `manualWorkdays::${month}__`
  const { data, error } = await supabase
    .from('hr_records')
    .select('id, data')
    .eq('collection', 'manualWorkdays')
    .like('id', `${prefix}%`)

  if (error) throw error

  const out = { ...legacy }
  ;(data || []).forEach((row) => {
    const employeeId = row.id.slice(prefix.length)
    if (employeeId) out[employeeId] = row.data || {}
  })
  return Object.keys(out).length ? out : null
}

async function upsertRecord(collection, id, data) {
  const { error } = await supabase.from('hr_records').upsert(
    {
      id: rowId(collection, id),
      collection,
      data,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'id' }
  )
  if (error) throw error
}

async function patchRecord(collection, id, patch) {
  const current = (await getRecord(collection, id)) || {}
  const next = { ...current, ...(patch || {}) }
  await upsertRecord(collection, id, next)
  return next
}

async function deleteRecord(collection, id) {
  const { error } = await supabase
    .from('hr_records')
    .delete()
    .eq('id', rowId(collection, id))
  if (error) throw error
}

async function deleteCollection(collection) {
  const { error } = await supabase
    .from('hr_records')
    .delete()
    .eq('collection', collection)
  if (error) throw error
}

async function listEmployeesAsFirebaseMap() {
  // YÊU CẦU: Bảng công chỉ được lấy nhân sự từ bảng nhan_su.
  // Không được join hoặc đưa các tài khoản hệ thống từ bảng users vào bảng công.
  const { data, error } = await supabase
    .from('nhan_su')
    .select('*')
    .order('ma_nhan_vien', { ascending: true })

  if (error) throw error
  if (!data?.length) return null

  const out = {}
  data.forEach((ns) => {
    const employmentStatus = String(ns.trang_thai ?? '').trim()
    out[ns.id] = {
      id: ns.id,
      employeeId: ns.ma_nhan_vien || '',
      employeeCode: ns.ma_nhan_vien || '',
      ma_nhan_vien: ns.ma_nhan_vien || '',
      username: ns.ma_nhan_vien || '',
      name: ns.ho_ten || '',
      ho_va_ten: ns.ho_ten || '',
      ho_ten: ns.ho_ten || '',
      email: ns.email || '',
      phone: ns.so_dien_thoai || '',
      sđt: ns.so_dien_thoai || '',
      position: ns.chuc_vu || '',
      vi_tri: ns.chuc_vu || '',
      chuc_vu: ns.chuc_vu || '',
      department: ns.bo_phan || '',
      bo_phan: ns.bo_phan || '',
      shift: ns.ca_lam || 'Ca ngày',
      ca_lam_viec: ns.ca_lam || 'Ca ngày',
      // Trạng thái do HR đánh dấu; dữ liệu rỗng phải giữ rỗng, không suy diễn
      // thành "Đang làm việc" hay "Chính thức".
      status: employmentStatus,
      trang_thai: employmentStatus,
      joinDate: ns.ngay_vao_lam || '',
      ngay_vao_lam: ns.ngay_vao_lam || '',
      avatarDataUrl: ns.avatar_url || ''
    }
  })
  return out
}

export const fbGetEmployeesDirectory = () => listEmployeesAsFirebaseMap()

async function pushEmployee(payload) {
  const id = crypto.randomUUID()
  const dbPayload = mapAppToUser(payload || {}) || {}
  dbPayload.id = id
  if (!dbPayload.password) dbPayload.password = payload?.password || '123456'
  if (!dbPayload.employee_id && payload?.employeeId) {
    dbPayload.employee_id = payload.employeeId
  }
  if (!dbPayload.role) dbPayload.role = payload?.role || 'user'

  const { error } = await supabase.from('users').insert([dbPayload])
  if (error) throw error
  return { name: id }
}

async function getHrRoot() {
  const { data, error } = await supabase
    .from('hr_records')
    .select('id, collection, data')
  if (error) throw error

  const root = {}
  ;(data || []).forEach((row) => {
    const prefix = `${row.collection}::`
    const logicalId = row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.id
    if (!root[row.collection]) root[row.collection] = {}
    root[row.collection][logicalId] = row.data || {}
  })
  return Object.keys(root).length ? root : null
}

export const fbGet = async (path) => {
  const parsed = parsePath(path)

  if (parsed.kind === 'employees') {
    if (parsed.id) {
      const { data, error } = await supabase
        .from('nhan_su')
        .select('*')
        .eq('id', parsed.id)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const employmentStatus = String(data.trang_thai ?? '').trim()
      return {
        id: data.id,
        employeeId: data.ma_nhan_vien || '',
        employeeCode: data.ma_nhan_vien || '',
        name: data.ho_ten || '',
        ho_va_ten: data.ho_ten || '',
        position: data.chuc_vu || '',
        department: data.bo_phan || '',
        shift: data.ca_lam || 'Ca ngày',
        status: employmentStatus,
        trang_thai: employmentStatus
      }
    }
    return listEmployeesAsFirebaseMap()
  }

  if (parsed.kind === 'hr_root') return getHrRoot()

  if (parsed.kind === 'manual_workdays_month') {
    return listManualWorkdaysByMonth(parsed.month)
  }

  if (parsed.kind === 'collection') {
    return listCollection(parsed.collection)
  }

  if (parsed.kind === 'record') {
    return getRecord(parsed.collection, parsed.id)
  }

  return null
}

export const fbGetAttendanceByEmployee = async (employeeId) => {
  const ownerId = String(employeeId || '').trim()
  if (!ownerId) return null
  const { data, error } = await supabase
    .from('hr_records')
    .select('id, data')
    .eq('collection', 'attendanceLogs')
    .contains('data', { employeeId: ownerId })
    .order('id')
  if (error) throw error
  const prefix = 'attendanceLogs::'
  return Object.fromEntries((data || []).map(row => [row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.id, row.data || {}]))
}

/**
 * Load attendance logs for one YYYY-MM (filters by data.date prefix).
 * Ưu tiên đọc từ bảng cham_cong chính thức của Company B.
 */
export const fbGetAttendanceLogsByMonth = async (month) => {
  const period = String(month || '').trim()
  if (!/^\d{4}-\d{2}$/.test(period)) return null

  // 1. Đọc từ bảng cham_cong chính thức liên kết với nhan_su
  try {
    const { data: ccData, error: ccErr } = await supabase
      .from('cham_cong')
      .select('*, nhan_su(id, ma_nhan_vien, ho_ten, chuc_vu, bo_phan, ca_lam)')
      .gte('ngay', `${period}-01`)
      .lte('ngay', `${period}-31`)
      .order('ngay', { ascending: true })

    if (!ccErr && ccData && ccData.length > 0) {
      const out = {}
      ccData.forEach((row) => {
        const ns = row.nhan_su || {}
        out[row.id] = {
          id: row.id,
          employeeId: row.nhan_su_id,
          employeeCode: ns.ma_nhan_vien || '',
          employeeName: ns.ho_ten || '',
          sourceEmployeeCode: ns.ma_nhan_vien || '',
          sourceEmployeeName: ns.ho_ten || '',
          department: ns.bo_phan || '',
          position: ns.chuc_vu || '',
          date: row.ngay,
          checkIn: row.gio_vao || '',
          checkOut: row.gio_ra || '',
          cong: Number(row.tong_cong) || 0,
          hours: Number(row.gia_tri_goc) || (Number(row.tong_cong) * 8) || 0,
          giaTriGoc: row.gia_tri_goc || '',
          rawVal: row.gia_tri_goc || '',
          shiftName: row.ca_lam || ns.ca_lam || 'Ca ngày',
          tangCa: Number(row.tang_ca) || 0,
          phepSuDung: Number(row.phep_su_dung) || 0,
          congLamLe: Number(row.cong_lam_le) || 0,
          congLe: Number(row.cong_le) || 0,
          status: row.notes || (Number(row.tong_cong) >= 1 ? 'Đủ' : Number(row.tong_cong) > 0 ? 'Nửa ngày' : 'Nghỉ'),
          notes: row.notes || '',
          xacNhan: row.xac_nhan || false
        }
      })
      return out
    }
  } catch (err) {
    console.warn('[fbGetAttendanceLogsByMonth] Lỗi đọc từ bảng cham_cong:', err)
  }

  const pageSize = 1000
  const rows = []
  let expectedTotal = null

  for (let from = 0; ; from += pageSize) {
    const { data, error, count } = await supabase
      .from('hr_records')
      .select('id, data', from === 0 ? { count: 'exact' } : undefined)
      .eq('collection', 'attendanceLogs')
      .gte('data->>date', `${period}-01`)
      .lte('data->>date', `${period}-31`)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (from === 0 && typeof count === 'number') expectedTotal = count
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }

  if (
    typeof expectedTotal === 'number' &&
    expectedTotal > 0 &&
    rows.length < expectedTotal
  ) {
    console.warn(
      `[attendanceLogs:${period}] thiếu dữ liệu: lấy ${rows.length}/${expectedTotal}`
    )
  }

  if (!rows.length) return null

  const prefix = 'attendanceLogs::'
  const out = {}
  rows.forEach((row) => {
    const logicalId = row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.id
    out[logicalId] = row.data || {}
  })
  return out
}

/** List logical ids in a collection without loading full JSON payloads. */
export const fbListCollectionIds = async (collection) => {
  const name = String(collection || '').trim()
  if (!name) return []
  const { data, error } = await supabase
    .from('hr_records')
    .select('id')
    .eq('collection', name)
  if (error) throw error
  const prefix = `${name}::`
  return (data || []).map((row) =>
    row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.id
  )
}

export const fbSet = async (path, data) => {
  const parsed = parsePath(path)

  if (parsed.kind === 'record') {
    await upsertRecord(parsed.collection, parsed.id, data || {})
    return
  }

  if (parsed.kind === 'collection') {
    await deleteCollection(parsed.collection)
    const entries = Object.entries(data || {})
    if (!entries.length) return
    const rows = entries.map(([id, value]) => ({
      id: rowId(parsed.collection, id),
      collection: parsed.collection,
      data: value || {},
      updated_at: new Date().toISOString()
    }))
    const { error } = await supabase.from('hr_records').upsert(rows, { onConflict: 'id' })
    if (error) throw error
    return
  }

  if (parsed.kind === 'employees' && parsed.id) {
    const dbPayload = mapAppToUser(data || {}) || {}
    const { error } = await supabase.from('users').update(dbPayload).eq('id', parsed.id)
    if (error) throw error
  }
}

export const fbPush = async (path, data) => {
  const parsed = parsePath(path)

  if (parsed.kind === 'employees') {
    return pushEmployee(data)
  }

  const collection =
    parsed.kind === 'collection'
      ? parsed.collection
      : parsed.kind === 'record'
        ? parsed.collection
        : normalizePath(path).replace(/^hr\//, '') || 'misc'

  const id = genId()
  await upsertRecord(collection, id, data || {})
  return { name: id }
}

export const fbDelete = async (path) => {
  const parsed = parsePath(path)

  if (parsed.kind === 'employees' && parsed.id) {
    const { error } = await supabase.from('users').delete().eq('id', parsed.id)
    if (error) throw error
    return
  }

  if (parsed.kind === 'collection') {
    await deleteCollection(parsed.collection)
    return
  }

  if (parsed.kind === 'record') {
    await deleteRecord(parsed.collection, parsed.id)
  }
}

export const fbUpdate = async (path, data) => {
  const parsed = parsePath(path)

  if (parsed.kind === 'employees' && parsed.id) {
    const dbPayload = mapAppToUser(data || {}) || {}
    const { error } = await supabase.from('users').update(dbPayload).eq('id', parsed.id)
    if (error) throw error
    return
  }

  if (parsed.kind === 'record') {
    await patchRecord(parsed.collection, parsed.id, data || {})
    return
  }

  if (parsed.kind === 'collection') {
    const entries = Object.entries(data || {})
    for (const [id, value] of entries) {
      await patchRecord(parsed.collection, id, value || {})
    }
  }
}
