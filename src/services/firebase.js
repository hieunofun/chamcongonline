import { supabase, DEFAULT_COMPANY_ID } from './supabase'
import { mapAppToUser, mapUserToApp } from '../utils/helpers'

/**
 * Supabase-backed storage with the same API as the old Firebase helpers.
 * All former `hr/*` collections live in `public.hr_records`.
 * `employees` maps to `public.users`.
 */

const genId = () =>
  `-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`

const rowId = (collection, id) => `${collection}::${id}`
const scopedRowPrefix = (collection, companyId) =>
  companyId ? `${String(companyId)}::${collection}::` : `${collection}::`
const scopedRowId = (collection, id, companyId) =>
  `${scopedRowPrefix(collection, companyId)}${id}`
const canReadLegacyCompanyRecords = companyId =>
  !companyId || String(companyId) === String(DEFAULT_COMPANY_ID)
const companyRecordPrefixes = (collection, companyId) => {
  const prefixes = []
  if (canReadLegacyCompanyRecords(companyId)) prefixes.push(`${collection}::`)
  if (companyId) prefixes.push(scopedRowPrefix(collection, companyId))
  return [...new Set(prefixes)]
}
const rowsForCompany = (rows, collection, companyId) => {
  const legacyRows = canReadLegacyCompanyRecords(companyId)
    ? rows.filter(row => row.id.startsWith(`${collection}::`))
    : []
  const scopedRows = companyId
    ? rows.filter(row => row.id.startsWith(scopedRowPrefix(collection, companyId)))
    : []
  return [...legacyRows, ...scopedRows]
}
const logicalRecordId = (id, collection, companyId) => {
  const selectedPrefix = scopedRowPrefix(collection, companyId)
  if (companyId && id.startsWith(selectedPrefix)) return id.slice(selectedPrefix.length)
  const legacyPrefix = `${collection}::`
  return id.startsWith(legacyPrefix) ? id.slice(legacyPrefix.length) : id
}

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

async function readCollectionRows(collection, companyId) {
  // Supabase/PostgREST mặc định max 1000 dòng/request — phải phân trang + order ổn định.
  const pageSize = 1000
  const rows = []

  for (const prefix of companyRecordPrefixes(collection, companyId)) {
    let expectedCount = null
    let fetchedCount = 0
    for (let from = 0; ; from += pageSize) {
      const { data, error, count } = await supabase
        .from('hr_records')
        .select('id, data', from === 0 ? { count: 'exact' } : undefined)
        .eq('collection', collection)
        .like('id', `${prefix}%`)
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)

      if (error) throw error
      if (from === 0 && typeof count === 'number') expectedCount = count
      fetchedCount += data?.length || 0
      rows.push(...(data || []))
      if (!data || data.length < pageSize) break
    }
    if (typeof expectedCount === 'number' && fetchedCount < expectedCount) {
      console.warn(
        `[listCollection:${collection}] thiếu dữ liệu: lấy ${fetchedCount}/${expectedCount}`
      )
    }
  }

  return rows
}

async function listCollection(collection, companyId) {
  const rows = rowsForCompany(await readCollectionRows(collection, companyId), collection, companyId)
  const out = {}
  rows.forEach(row => { out[logicalRecordId(row.id, collection, companyId)] = row.data || {} })
  return Object.keys(out).length ? out : null
}

async function getRecordById(id) {
  const { data, error } = await supabase
    .from('hr_records')
    .select('data')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data?.data ?? null
}

async function getRecord(collection, id, companyId) {
  if (companyId) {
    const scoped = await getRecordById(scopedRowId(collection, id, companyId))
    if (scoped !== null) return scoped
  }
  if (canReadLegacyCompanyRecords(companyId)) {
    return getRecordById(rowId(collection, id))
  }
  return null
}

async function listManualWorkdaysByMonth(month, companyId) {
  const out = { ...((await getRecord('manualWorkdays', month, companyId)) || {}) }
  const rows = rowsForCompany(
    await readCollectionRows('manualWorkdays', companyId),
    'manualWorkdays',
    companyId
  )
  rows.forEach(row => {
    const recordPrefix = scopedRowPrefix('manualWorkdays', companyId)
    const legacyPrefix = 'manualWorkdays::'
    const idPrefix = row.id.startsWith(recordPrefix) ? recordPrefix : legacyPrefix
    const logicalId = row.id.slice(idPrefix.length)
    const monthPrefix = `${month}__`
    if (!logicalId.startsWith(monthPrefix)) return
    const employeeId = logicalId.slice(monthPrefix.length)
    if (employeeId) out[employeeId] = row.data || {}
  })
  return Object.keys(out).length ? out : null
}

async function upsertRecord(collection, id, data, companyId) {
  const { error } = await supabase.from('hr_records').upsert(
    {
      id: scopedRowId(collection, id, companyId),
      collection,
      data,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'id' }
  )
  if (error) throw error
}

async function patchRecord(collection, id, patch, companyId) {
  const current = (await getRecord(collection, id, companyId)) || {}
  const next = { ...current, ...(patch || {}) }
  await upsertRecord(collection, id, next, companyId)
  return next
}

async function deleteRecord(collection, id, companyId) {
  const ids = [scopedRowId(collection, id, companyId)]
  if (canReadLegacyCompanyRecords(companyId) && companyId) ids.push(rowId(collection, id))
  for (const idValue of [...new Set(ids)]) {
    const { error } = await supabase
      .from('hr_records')
      .delete()
      .eq('id', idValue)
    if (error) throw error
  }
}

async function deleteCollection(collection, companyId) {
  const rows = rowsForCompany(await readCollectionRows(collection, companyId), collection, companyId)
  const ids = rows.map(row => row.id)
  for (let index = 0; index < ids.length; index += 500) {
    const { error } = await supabase
      .from('hr_records')
      .delete()
      .in('id', ids.slice(index, index + 500))
    if (error) throw error
  }
}

async function listEmployeesAsFirebaseMap(companyId) {
  // YÊU CẦU: Bảng công chỉ được lấy nhân sự từ bảng nhan_su.
  // Không được join hoặc đưa các tài khoản hệ thống từ bảng users vào bảng công.
  let query = supabase.from('nhan_su').select('*')
  if (companyId) query = query.eq('company_id', companyId)
  const { data, error } = await query.order('ma_nhan_vien', { ascending: true })

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

export const fbGetEmployeesDirectory = (companyId) => listEmployeesAsFirebaseMap(companyId)

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

async function getHrRoot(companyId) {
  let query = supabase
    .from('hr_records')
    .select('id, collection, data')
  if (companyId && !canReadLegacyCompanyRecords(companyId)) {
    query = query.like('id', `${String(companyId)}::%`)
  }
  const { data, error } = await query
  if (error) throw error

  const root = {}
  const applicableRows = [...(data || [])].sort((left, right) => {
    const leftIsScoped = Boolean(companyId && left.id.startsWith(scopedRowPrefix(left.collection, companyId)))
    const rightIsScoped = Boolean(companyId && right.id.startsWith(scopedRowPrefix(right.collection, companyId)))
    return Number(leftIsScoped) - Number(rightIsScoped)
  })
  ;applicableRows.forEach((row) => {
    const collection = row.collection
    if (!rowsForCompany([row], collection, companyId).length) return
    const logicalId = logicalRecordId(row.id, collection, companyId)
    if (!root[collection]) root[collection] = {}
    root[collection][logicalId] = row.data || {}
  })
  return Object.keys(root).length ? root : null
}

export const fbGet = async (path, companyId) => {
  const parsed = parsePath(path)

  if (parsed.kind === 'employees') {
    if (parsed.id) {
      let query = supabase.from('nhan_su').select('*').eq('id', parsed.id)
      if (companyId) query = query.eq('company_id', companyId)
      const { data, error } = await query.maybeSingle()
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
    return listEmployeesAsFirebaseMap(companyId)
  }

  if (parsed.kind === 'hr_root') return getHrRoot(companyId)

  if (parsed.kind === 'manual_workdays_month') {
    return listManualWorkdaysByMonth(parsed.month, companyId)
  }

  if (parsed.kind === 'collection') {
    return listCollection(parsed.collection, companyId)
  }

  if (parsed.kind === 'record') {
    return getRecord(parsed.collection, parsed.id, companyId)
  }

  return null
}

export const fbGetAttendanceByEmployee = async (employeeId, companyId) => {
  const ownerId = String(employeeId || '').trim()
  if (!ownerId) return null
  const rows = []
  for (const prefix of companyRecordPrefixes('attendanceLogs', companyId)) {
    const { data, error } = await supabase
      .from('hr_records')
      .select('id, data')
      .eq('collection', 'attendanceLogs')
      .like('id', `${prefix}%`)
      .contains('data', { employeeId: ownerId })
      .order('id')
    if (error) throw error
    rows.push(...(data || []))
  }
  const out = {}
  rowsForCompany(rows, 'attendanceLogs', companyId).forEach(row => {
    out[logicalRecordId(row.id, 'attendanceLogs', companyId)] = row.data || {}
  })
  return Object.keys(out).length ? out : null
}

/**
 * Load attendance logs for one YYYY-MM (filters by data.date prefix).
 * Ưu tiên đọc từ bảng cham_cong chính thức của công ty hiện tại.
 */
export const fbGetAttendanceLogsByMonth = async (month, companyId) => {
  const period = String(month || '').trim()
  if (!/^\d{4}-\d{2}$/.test(period)) return null
  const [year, monthNumber] = period.split('-').map(Number)
  const lastDay = String(new Date(year, monthNumber, 0).getDate()).padStart(2, '0')

  // 1. Đọc từ bảng cham_cong chính thức liên kết với nhan_su
  try {
    let query = supabase
      .from('cham_cong')
      .select('*, nhan_su(id, ma_nhan_vien, ho_ten, chuc_vu, bo_phan, ca_lam)')
      .gte('ngay', `${period}-01`)
      .lte('ngay', `${period}-${lastDay}`)
    if (companyId) query = query.eq('company_id', companyId)
    const { data: ccData, error: ccErr } = await query.order('ngay', { ascending: true })

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

  const rows = []
  const pageSize = 1000
  for (const prefix of companyRecordPrefixes('attendanceLogs', companyId)) {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('hr_records')
        .select('id, data')
        .eq('collection', 'attendanceLogs')
        .like('id', `${prefix}%`)
        .gte('data->>date', `${period}-01`)
        .lte('data->>date', `${period}-${lastDay}`)
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) throw error
      rows.push(...(data || []))
      if (!data || data.length < pageSize) break
    }
  }
  const out = {}
  rowsForCompany(rows, 'attendanceLogs', companyId).forEach(row => {
    out[logicalRecordId(row.id, 'attendanceLogs', companyId)] = row.data || {}
  })
  return Object.keys(out).length ? out : null
}

/** List logical ids in a collection without loading full JSON payloads. */
export const fbListCollectionIds = async (collection, companyId) => {
  const name = String(collection || '').trim()
  if (!name) return []
  const rows = await readCollectionRows(name, companyId)
  return Array.from(new Set(rowsForCompany(rows, name, companyId).map(row =>
    logicalRecordId(row.id, name, companyId)
  )))
}

export const fbSet = async (path, data, companyId) => {
  const parsed = parsePath(path)

  if (parsed.kind === 'record') {
    await upsertRecord(parsed.collection, parsed.id, data || {}, companyId)
    return
  }

  if (parsed.kind === 'collection') {
    await deleteCollection(parsed.collection, companyId)
    const entries = Object.entries(data || {})
    if (!entries.length) return
    const rows = entries.map(([id, value]) => ({
      id: scopedRowId(parsed.collection, id, companyId),
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

export const fbPush = async (path, data, companyId) => {
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
  await upsertRecord(collection, id, data || {}, companyId)
  return { name: id }
}

export const fbDelete = async (path, companyId) => {
  const parsed = parsePath(path)

  if (parsed.kind === 'employees' && parsed.id) {
    const { error } = await supabase.from('users').delete().eq('id', parsed.id)
    if (error) throw error
    return
  }

  if (parsed.kind === 'collection') {
    await deleteCollection(parsed.collection, companyId)
    return
  }

  if (parsed.kind === 'record') {
    await deleteRecord(parsed.collection, parsed.id, companyId)
  }
}

export const fbUpdate = async (path, data, companyId) => {
  const parsed = parsePath(path)

  if (parsed.kind === 'employees' && parsed.id) {
    const dbPayload = mapAppToUser(data || {}) || {}
    const { error } = await supabase.from('users').update(dbPayload).eq('id', parsed.id)
    if (error) throw error
    return
  }

  if (parsed.kind === 'record') {
    await patchRecord(parsed.collection, parsed.id, data || {}, companyId)
    return
  }

  if (parsed.kind === 'collection') {
    const entries = Object.entries(data || {})
    for (const [id, value] of entries) {
      await patchRecord(parsed.collection, id, value || {}, companyId)
    }
  }
}
