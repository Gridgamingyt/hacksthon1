import { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { createClient } from '@supabase/supabase-js'
import {
  AlertTriangle, ArrowLeft, ArrowRight, Bell, Building2, Camera, Check, CheckCircle2,
  ChevronRight, ClipboardList, FileText, Home, ImagePlus, Landmark, LockKeyhole,
  Map, MapPin, Navigation, Pencil, Plus, Search, ShieldCheck,
  Eye, EyeOff, Sparkles, UserRound, X, Zap
} from 'lucide-react'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://uwiiywacaujbgmontskm.supabase.co').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_wp_h8GzjV85ylWe2hBgXZA_YesFAozW').trim()
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

const navItems = [
  ['/citizen/dashboard', 'Home', Home], ['/complaints', 'My complaints', ClipboardList], ['/map', 'Map', Map],
  ['/notifications', 'Alerts', Bell], ['/profile', 'Profile', UserRound],
]

const issueTypes = ['Pothole', 'Garbage overflow', 'Streetlight not working', 'Water leakage', 'Other']
const DEFAULT_MAP_CENTER = { lat: 28.6139, lng: 77.2090 }
const issuePriority = {
  Pothole: { label: 'High', score: '8.5 / 10', impact: 'High', publicImpact: 'High' },
  'Garbage overflow': { label: 'Medium', score: '6.5 / 10', impact: 'Medium', publicImpact: 'High' },
  'Streetlight not working': { label: 'Medium', score: '6 / 10', impact: 'Medium', publicImpact: 'Medium' },
  'Water leakage': { label: 'High', score: '8 / 10', impact: 'High', publicImpact: 'High' },
  Other: { label: 'Medium', score: '5 / 10', impact: 'Medium', publicImpact: 'Medium' },
}
const issueDescriptions = {
  Pothole: 'A pothole is affecting road safety and may cause difficulty for vehicles and pedestrians. Please inspect and repair the damaged road surface.',
  'Garbage overflow': 'Garbage has overflowed from the collection point, creating an unhygienic condition and requiring prompt clearance.',
  'Streetlight not working': 'A streetlight appears to be non-functional, reducing visibility and creating a potential safety concern after dark.',
  'Water leakage': 'Water is leaking in a public area and may damage the surrounding surface or waste essential water. Please inspect and repair the source.',
  Other: 'A civic issue was detected in the uploaded photo. Please review the image and route it to the appropriate department.',
}

function getLocationLabel(results, fallbackLabel = 'Your current location') {
  const preferredTypes = ['sublocality', 'locality', 'administrative_area_level_2', 'administrative_area_level_1']
  const address = results.find(result => preferredTypes.some(type => result.types?.includes(type)))
  return address?.formatted_address || fallbackLabel
}

function formatComplaintDate(value) {
  if (!value) return 'Recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getIndianNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
}

function getIndianGreeting() {
  const hour = getIndianNow().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 21) return 'Good evening'
  return 'Good night'
}

function formatIndianDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(value)
}

function normalizeComplaint(row) {
  const savedReasons = JSON.parse(localStorage.getItem('civic-rejection-reasons') || '{}')
  const latitude = Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null
  const longitude = Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null
  return {
    dbId: row.id || null,
    userId: row.user_id || null,
    reporterName: row.reporter_name || row.full_name || '',
    reporterEmail: row.reporter_email || row.email || '',
    reporterAvatar: row.reporter_avatar || row.avatar_url || '',
    id: row.report_id || row.id || 'CL-000000',
    type: row.issue_type || row.title || 'Civic issue',
    location: row.location_name || row.address || (latitude !== null && longitude !== null ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : 'Location unavailable'),
    latitude,
    longitude,
    status: row.status || 'Pending review',
    priority: row.priority || 'Medium',
    date: formatComplaintDate(row.created_at),
    createdAt: row.created_at || new Date().toISOString(),
    image: row.image_url || row.image || '',
    description: row.description || 'Issue reported by citizen.',
    rejectionReason: Array.isArray(row.rejection_reason)
      ? row.rejection_reason.filter(Boolean).join(', ').trim()
      : String(row.rejection_reason || savedReasons[row.report_id || row.id] || '').trim(),
  }
}

const complaintCache = new globalThis.Map()
const complaintRequests = new globalThis.Map()
const COMPLAINT_CACHE_TTL = 30 * 1000
const ISSUE_COLUMNS = 'id,report_id,user_id,reporter_name,reporter_email,reporter_avatar,title,issue_type,location_name,address,latitude,longitude,status,priority,created_at,image_url,description,rejection_reason'

function withTimeout(promise, timeoutMs = 10000, message = 'Unable to reach Supabase. Check your internet connection and Supabase project status.') {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer))
}

function getSupabaseError(error) {
  const message = String(error?.message || '')
  if (error?.status === 401 || /401|invalid api key|jwt/i.test(message)) {
    return new Error('Supabase API key is invalid or revoked. Copy the current Publishable/anon key from Supabase Project Settings > API and update VITE_SUPABASE_ANON_KEY in .env.')
  }
  return error instanceof Error ? error : new Error(message || 'Unable to load complaints.')
}

async function fetchIssueRows({ userId = null, userEmail = '' } = {}) {
  if (userId) {
    const { data: userRows, error: userError } = await supabase
      .from('issues')
      .select(ISSUE_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (!userError) return userRows || []

    if (!String(userError.message || '').includes('user_id')) throw getSupabaseError(userError)
    const knownReports = JSON.parse(localStorage.getItem(`civic-reports-${userId}`) || '[]')
    const { data: allRows, error: allError } = await supabase
      .from('issues')
      .select('*')
      .order('created_at', { ascending: false })
    if (allError) throw getSupabaseError(allError)
    const normalizedEmail = userEmail.trim().toLowerCase()
    return (allRows || []).filter(row => {
      const reportId = row.report_id || row.id
      const rowEmail = String(row.reporter_email || row.email || '').trim().toLowerCase()
      return knownReports.includes(reportId)
        || row.user_id === userId
        || Boolean(normalizedEmail && rowEmail && rowEmail === normalizedEmail)
    })
  }

  let query = supabase.from('issues').select(ISSUE_COLUMNS)
  query = query.order('created_at', { ascending: false })
  const { data, error } = await query
  if (!error) return data || []

  // Government dashboards must also support older issues tables that do not
  // yet contain the denormalized citizen fields.
  if (/column issues\./i.test(error.message || '')) {
    const { data: legacyRows, error: legacyError } = await supabase
      .from('issues')
      .select('*')
      .order('created_at', { ascending: false })
    if (legacyError) throw getSupabaseError(legacyError)
    return legacyRows || []
  }
  throw getSupabaseError(error)
}

function getLocalComplaintItems(userId = 'anonymous') {
  const keys = Object.keys(localStorage).filter(key => key.startsWith('civic-local-issues-'))
  const rows = keys.flatMap(key => {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]')
    } catch {
      return []
    }
  })
  if (rows.length === 0 && userId) {
    try {
      return JSON.parse(localStorage.getItem(`civic-local-issues-${userId}`) || '[]').map(normalizeComplaint)
    } catch {
      return []
    }
  }
  return rows
    .sort((first, second) => new Date(second.created_at || 0) - new Date(first.created_at || 0))
    .map(normalizeComplaint)
}

function mergeComplaintItems(remoteItems, localItems) {
  const merged = new Map()
  ;[...remoteItems, ...localItems].forEach(item => {
    if (item?.id && !merged.has(item.id)) merged.set(item.id, item)
  })
  return [...merged.values()].sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0))
}

function syncLocalComplaintStatus(reportIdentifier, nextStatus, reason = '') {
  const keys = Object.keys(localStorage).filter(key => key.startsWith('civic-local-issues-'))
  let changed = false

  keys.forEach(key => {
    try {
      const rows = JSON.parse(localStorage.getItem(key) || '[]')
      const updatedRows = rows.map(row => {
        const matches = String(row.report_id || row.id) === String(reportIdentifier)
        if (!matches) return row
        changed = true
        return {
          ...row,
          status: nextStatus,
          rejection_reason: nextStatus === 'Rejected' ? reason : row.rejection_reason || '',
        }
      })
      if (changed && updatedRows !== rows) {
        localStorage.setItem(key, JSON.stringify(updatedRows))
      }
    } catch {
      // ignore malformed local storage entries
    }
  })

  return changed
}

async function fetchMyComplaintsFromSupabase({ force = false } = {}) {
  const { data: { session }, error: sessionError } = await withTimeout(
    supabase.auth.getSession(),
    10000,
    'Supabase authentication is not responding. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.'
  )
  if (sessionError) throw getSupabaseError(sessionError)
  const user = session?.user
  if (!user) return []

  const cached = complaintCache.get(user.id)
  if (!force && cached && Date.now() - cached.timestamp < COMPLAINT_CACHE_TTL) return cached.items

  if (!complaintRequests.has(user.id)) {
    const request = withTimeout(
      fetchIssueRows({ userId: user.id, userEmail: user.email || '' }),
      10000,
      'Supabase is not responding while loading complaints. Check the project URL, API key, and project status.'
    )
      .then(data => {
        const items = (data || []).map(normalizeComplaint)
        complaintCache.set(user.id, { items, timestamp: Date.now() })
        return items
      })
      .finally(() => complaintRequests.delete(user.id))
    complaintRequests.set(user.id, request)
  }
  return complaintRequests.get(user.id)
}

async function fetchMyComplaints({ force = false } = {}) {
  let userId = 'anonymous'
  try {
    const { data: { session } } = await supabase.auth.getSession()
    userId = session?.user?.id || 'anonymous'
    if (!session?.user) return getLocalComplaintItems(userId)
    const remoteItems = await fetchMyComplaintsFromSupabase({ force })
    return mergeComplaintItems(remoteItems, getLocalComplaintItems(userId))
  } catch (error) {
    console.warn('Supabase complaints unavailable; using local reports:', error.message)
    return getLocalComplaintItems(userId)
  }
}

async function fetchGovernmentComplaints() {
  try {
    const data = await fetchIssueRows()
    return (data || []).map(normalizeComplaint)
  } catch (error) {
    console.warn('Government complaint fetch failed:', error.message)
    return []
  }
}

async function insertIssueRowInSupabase(payload) {
  const remaining = { ...payload }
  const removedColumns = new Set()
  const requiredColumns = new Set(['report_id', 'description', 'issue_type', 'status', 'priority', 'created_at'])

  for (let attempt = 0; attempt <= Object.keys(payload).length; attempt += 1) {
    const { error } = await supabase.from('issues').insert([remaining])
    if (!error) {
      if (remaining.user_id) complaintCache.delete(remaining.user_id)
      return
    }

    const message = String(error.message || '')
    const missingColumn = message.match(/Could not find the '([^']+)' column of 'issues'/i)?.[1]
    if (!missingColumn || !(missingColumn in remaining) || removedColumns.has(missingColumn)) {
      throw error
    }
    if (requiredColumns.has(missingColumn)) {
      throw new Error(`The Supabase issues table is missing required column "${missingColumn}". Run supabase-schema.sql, then retry.`)
    }

    delete remaining[missingColumn]
    removedColumns.add(missingColumn)
  }

  throw new Error('Unable to save the issue because the issues table schema is incomplete.')
}

async function insertIssueRow(payload) {
  const userId = payload.user_id || 'anonymous'
  const localKey = `civic-local-issues-${userId}`
  const saveLocalCopy = () => {
    const localRows = (() => {
      try {
        return JSON.parse(localStorage.getItem(localKey) || '[]')
      } catch {
        return []
      }
    })()
    const withoutDuplicate = localRows.filter(row => row.report_id !== payload.report_id)
    localStorage.setItem(localKey, JSON.stringify([payload, ...withoutDuplicate]))
  }

  try {
    await insertIssueRowInSupabase(payload)
  } catch (error) {
    console.warn('Supabase issue save unavailable; saving locally:', error.message)
  } finally {
    saveLocalCopy()
  }
}

function getUserDisplayName(user) {
  const stored = localStorage.getItem('civic-name')
  if (stored && stored.trim()) return stored.trim()
  const metadataName = user?.user_metadata?.full_name
  if (metadataName && metadataName.trim()) return metadataName.trim()
  const emailName = user?.email?.split('@')[0]
  if (emailName && emailName.trim()) return emailName.trim()
  return 'Civic User'
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read the selected image.'))
    reader.readAsDataURL(file)
  })
}

function loadGoogleMapsScript(apiKey, onReady) {
  if (!apiKey) {
    onReady(false)
    return
  }

  if (window.google?.maps) {
    onReady(true)
    return
  }

  const scriptId = 'google-maps-script'
  let script = document.getElementById(scriptId)

  if (!script) {
    script = document.createElement('script')
    script.id = scriptId
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => {
      script.dataset.loaded = 'true'
      onReady(true)
    }
    script.onerror = () => onReady(false)
    document.head.appendChild(script)
    return
  }

  if (script.dataset.loaded === 'true') {
    onReady(true)
    return
  }

  script.addEventListener('load', () => {
    script.dataset.loaded = 'true'
    onReady(true)
  }, { once: true })
  script.addEventListener('error', () => onReady(false), { once: true })
}

function normalizeAiResult(result = {}) {
  const issueType = issueTypes.includes(result.issueType) ? result.issueType : 'Other'
  const priority = ['Low', 'Medium', 'High'].includes(result.priority) ? result.priority : issuePriority[issueType].label
  const score = priority === 'High' ? '8 / 10' : priority === 'Low' ? '3 / 10' : '5 / 10'
  return {
    isCivicIssue: result.isCivicIssue === true,
    issueType,
    description: String(result.description || issueDescriptions[issueType]).trim(),
    priority: { ...issuePriority[issueType], label: priority, score },
    confidence: Math.min(99, Math.max(50, Number(result.confidence) || 78)),
  }
}
async function analyzeIssueImage(image) {
  const apiKey = import.meta.env.VITE_ZENMUX_API_KEY
  if (!apiKey) throw new Error('VITE_ZENMUX_API_KEY is missing from .env. Add your rotated ZenMux API key and restart the dev server.')

  const model = import.meta.env.VITE_ZENMUX_MODEL || 'openai/gpt-6-luna'
  const response = await withTimeout(fetch('https://zenmux.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Determine whether this image clearly shows a civic/public-infrastructure issue that a citizen can report to local authorities. Valid examples include a pothole or damaged road, overflowing garbage, a broken streetlight, and a public water leak. Reject unrelated images such as selfies, pets, food, documents, indoor scenes, or ordinary scenery without a visible civic problem. Return only JSON with isCivicIssue (boolean), issueType, description, priority, confidence. Set isCivicIssue to true only when a reportable civic issue is visible. issueType must be exactly one of: ${issueTypes.join(', ')}. priority must be Low, Medium, or High. confidence must be 50-99. Write a concise actionable English description from visible evidence. Use Other only for a visible civic issue that does not fit another type. High means immediate public safety risk, active water leak, or dangerous road damage. Medium means garbage overflow or moderate disruption. Low means minor issue.`,
          },
          { type: 'image_url', image_url: { url: image, detail: 'low' } },
        ],
      }],
    }),
  }), 30000, 'AI image analysis timed out. Please try again.')

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    const providerMessage = errorBody?.error?.message || errorBody?.message
    throw new Error(providerMessage
      ? `ZenMux request failed (HTTP ${response.status}): ${providerMessage}`
      : `ZenMux request failed (HTTP ${response.status}). Check your API key, model, and image support.`)
  }

  const payload = await response.json()
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('ZenMux returned an empty image analysis.')
  const jsonText = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
  return normalizeAiResult(JSON.parse(jsonText))
}

function CitizenAvatar({ large = false }) {
  const [avatar, setAvatar] = useState(() => localStorage.getItem('civic-avatar') || '')
  useEffect(() => {
    const syncAvatar = () => setAvatar(localStorage.getItem('civic-avatar') || '')
    window.addEventListener('storage', syncAvatar)
    window.addEventListener('civic-avatar-updated', syncAvatar)
    return () => {
      window.removeEventListener('storage', syncAvatar)
      window.removeEventListener('civic-avatar-updated', syncAvatar)
    }
  }, [])
  return <span className={`avatar${large ? ' large' : ''}${avatar ? ' avatar-image' : ''}`}>{avatar ? <img src={avatar} alt="Profile" /> : (localStorage.getItem('civic-name') || 'CU').split(' ').map(part => part[0]).join('').slice(0, 2) || 'CU'}</span>
}

function useCitizenName() {
  const [name, setName] = useState(() => getUserDisplayName({ email: localStorage.getItem('civic-email'), user_metadata: { full_name: localStorage.getItem('civic-name') } }))
  useEffect(() => {
    const syncName = () => setName(getUserDisplayName({ email: localStorage.getItem('civic-email'), user_metadata: { full_name: localStorage.getItem('civic-name') } }))
    window.addEventListener('storage', syncName)
    window.addEventListener('civic-name-updated', syncName)
    return () => {
      window.removeEventListener('storage', syncName)
      window.removeEventListener('civic-name-updated', syncName)
    }
  }, [])
  return name
}

function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand" onClick={() => navigate('/citizen/dashboard')}>
        <div className="brand-mark"><ShieldCheck size={20} /></div><span>CivicLens <b>AI</b></span>
      </div>
      <div className="topbar-actions"><span className="desktop-only">AI-powered civic reporting</span><button className="icon-btn" onClick={() => navigate('/notifications')} aria-label="Open notifications"><Bell size={19} /></button><button onClick={() => navigate('/profile')} aria-label="Open profile"><CitizenAvatar /></button></div>
    </header>
    <main className="main-content">{children}</main>
    <nav className="bottom-nav">{navItems.map(([path, label, Icon]) => <button key={label} className={location.pathname === path ? 'active' : ''} onClick={() => navigate(path)}><Icon size={19} /><span>{label}</span></button>)}<button className="report-tab" onClick={() => navigate('/report')}><Plus size={22} /><span>Report</span></button></nav>
  </div>
}

function RolePage() {
  const navigate = useNavigate()
  const choose = role => { localStorage.setItem('civic-role', role); navigate(role === 'government' ? '/gov/login' : '/citizen/login') }
  const features = [[Camera, 'AI-powered reporting', 'Upload a photo and get an instant issue type and description.'], [MapPin, 'Smart location detection', 'Automatic GPS location ensures accurate, actionable reports.'], [ShieldCheck, 'Duplicate detection', 'Avoid multiple reports for the same issue with AI search.'], [Zap, 'Priority & assignment', 'The right issue reaches the right department faster.'], [ClipboardList, 'Live tracking & updates', 'Follow your complaint in real time with notifications.'], [Building2, 'Transparency & insights', 'Public dashboards help communities stay accountable.']]
  return <div className="landing"><header className="landing-header"><div className="landing-container landing-nav"><div className="brand"><div className="brand-mark"><ShieldCheck size={20} /></div><span>CivicLens <b>AI</b></span></div><nav className="landing-links"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#impact">Our impact</a></nav><div className="landing-nav-actions"><button className="outline-btn" onClick={() => navigate('/citizen/login')}>Sign in</button><button className="primary-btn compact" onClick={() => choose('citizen')}>Get started</button></div></div></header><main><section className="landing-hero"><div className="landing-container landing-hero-grid"><div className="landing-copy"><span className="landing-kicker"><Sparkles size={14} /> Civic tech · Smarter cities · Better tomorrow</span><h1>See an issue.<br /><em>Be the change.</em></h1><p>CivicLens AI helps you report civic issues like potholes, garbage, streetlights, and water leakage. Our AI detects the problem, finds the location, and makes sure it reaches the right department.</p><div className="landing-cta"><button className="primary-btn" onClick={() => choose('citizen')}>Report an issue <ArrowRight size={16} /></button><button className="outline-btn" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}><Zap size={15} /> See how it works</button></div><div className="workflow-strip" id="how-it-works">{[['Report', Camera], ['Verify', CheckCircle2], ['Prioritize', Zap], ['Assign', Building2], ['Resolve', CheckCircle2], ['Track', ClipboardList]].map(([label, Icon], index) => <div key={label}><i><Icon size={15} /></i><span>{label}</span>{index < 5 && <ArrowRight size={13} />}</div>)}</div></div><div className="phone-stage"><div className="phone-glow" /><div className="phone"><div className="phone-notch" /><div className="phone-brand"><ShieldCheck size={17} /> CivicLens <b>AI</b></div><h3>Report a Civic Issue</h3><small>Take a photo, we'll handle the rest.</small><div className="phone-photo"><MapPin size={30} /><span>Photo evidence</span></div><div className="phone-result"><AlertTriangle size={17} /><span><b>Pothole detected</b><small>Confidence: 92%</small></span><CheckCircle2 size={16} /></div><div className="phone-location"><MapPin size={14} /> MG Road, Bengaluru</div><button className="phone-submit">Submit report</button><div className="phone-tabs"><Home size={13} /><Map size={13} /><Plus size={19} /><Bell size={13} /><UserRound size={13} /></div></div><div className="hero-badge badge-location"><MapPin size={17} /><span><b>Location detected</b><small>MG Road, Bengaluru</small></span><CheckCircle2 size={16} /></div><div className="hero-badge badge-ai"><Sparkles size={17} /><span><b>AI analysis</b><small>Pothole · 92% confidence</small></span><CheckCircle2 size={16} /></div><div className="hero-badge badge-assign"><Building2 size={17} /><span><b>Assigned to</b><small>Roads department</small></span><CheckCircle2 size={16} /></div></div></div></section><section className="features-section" id="features"><div className="landing-container"><div className="section-intro"><p className="eyebrow">KEY FEATURES</p><h2>Powerful features for a <em>smarter city</em></h2><p>Everything you need to turn a concern into meaningful civic action.</p></div><div className="feature-grid">{features.map(([Icon, title, description]) => <article className="feature-card" key={title}><div className="feature-icon"><Icon size={20} /></div><h3>{title}</h3><p>{description}</p></article>)}</div></div></section><section className="impact-section" id="impact"><div className="landing-container impact-grid"><div><p className="eyebrow">TOGETHER, WE MAKE A DIFFERENCE</p><h2>Small reports.<br /><em>Big impact.</em></h2></div><div className="impact-stat"><b>12,486+</b><span>Active citizens</span></div><div className="impact-stat"><b>8,732+</b><span>Issues reported</span></div><div className="impact-stat"><b>76%</b><span>Issues resolved</span></div><div className="impact-stat"><b>4.8 days</b><span>Average resolution</span></div></div></section></main><footer className="landing-footer"><div className="landing-container"><div className="brand brand-light"><div className="brand-mark"><ShieldCheck size={18} /></div><span>CivicLens <b>AI</b></span></div><span>Real problems. Real action. A cleaner tomorrow.</span><div><button onClick={() => choose('government')}>Government portal</button><button>Privacy</button><button>Contact</button></div></div></footer><div className="role-picker"><button onClick={() => choose('citizen')}><UserRound size={15} /> Citizen login</button><button onClick={() => choose('government')}><Landmark size={15} /> Official login</button></div></div>
}

function AuthLayout({ children, onBack }) {
  return <div className="auth-page simple-auth"><div className="auth-visual"><div className="brand brand-light"><div className="brand-mark"><ShieldCheck size={22} /></div><span>CivicLens <b>AI</b></span></div><div className="visual-copy"><Sparkles size={35} /><h1>Smarter cities<br />start with <em>you.</em></h1><p>Every report makes a difference.</p></div></div><div className="login-panel"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back</button>{children}</div></div>
}

function PasswordField({ label = 'Password', placeholder = '••••••••', value = '', onChange = () => {}, onKeyDown }) {
  const [visible, setVisible] = useState(false)
  return <label>{label}<span className="password-field"><input value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} type={visible ? 'text' : 'password'} required /><button type="button" className="password-toggle" onClick={() => setVisible(value => !value)} aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} title={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

async function getUserProfileRole(userId) {
  if (!userId) return null
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      const message = String(error.message || '')
      if (message.includes('does not exist') || message.includes('column') || message.includes('schema cache')) {
        return null
      }
      console.warn('Profile role lookup failed:', error.message)
      return null
    }

    return data?.role || null
  } catch (error) {
    console.warn('Profile role lookup crashed:', error.message)
    return null
  }
}

function clearLocalUserSession() {
  localStorage.removeItem('civic-role')
  localStorage.removeItem('civic-name')
  localStorage.removeItem('civic-email')
  localStorage.removeItem('civic-user-id')
  localStorage.removeItem('civic-avatar')
  window.dispatchEvent(new Event('civic-name-updated'))
}

function setLocalUserSession({ role, name, email, userId }) {
  localStorage.setItem('civic-role', role)
  localStorage.setItem('civic-name', name)
  localStorage.setItem('civic-email', email)
  if (userId) localStorage.setItem('civic-user-id', userId)
  window.dispatchEvent(new Event('civic-name-updated'))
}

function RoleGuard({ allowedRole, children }) {
  const navigate = useNavigate()
  const [isAllowed, setIsAllowed] = useState(null)
  const [verificationError, setVerificationError] = useState('')

  useEffect(() => {
    let active = true

    const checkAccess = async () => {
      try {
        const storedRole = (localStorage.getItem('civic-role') || '').trim().toLowerCase()
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        if (userError) {
          throw userError
        }

        if (!user) {
          if (active) {
            clearLocalUserSession()
            setIsAllowed(false)
            navigate('/')
          }
          return
        }

        const sessionRole = String(user.user_metadata?.role || '').trim().toLowerCase()
        const profileRole = await getUserProfileRole(user.id)
        const liveRole = (profileRole || sessionRole || storedRole || '').trim().toLowerCase()

        if (liveRole && liveRole !== allowedRole) {
          if (active) {
            clearLocalUserSession()
            setIsAllowed(false)
            navigate(liveRole === 'government' ? '/gov/login' : '/citizen/login')
          }
          return
        }

        if (active) {
          setIsAllowed(true)
          if (storedRole && storedRole !== allowedRole) {
            localStorage.setItem('civic-role', allowedRole)
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('Protected route access check failed:', message)
        if (active) {
          setVerificationError('Check your connection, then reload this page.')
        }
      }
    }

    checkAccess()
    return () => { active = false }
  }, [allowedRole, navigate])

  if (verificationError) return <div className="page-wrap"><div className="detail-card"><h3>Unable to verify your session</h3><p>{verificationError}</p></div></div>
  if (isAllowed === null) return <div className="page-wrap"><div className="detail-card"><h3>Checking access...</h3></div></div>
  return isAllowed ? children : null
}

function LoginPage({ government = false }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    const trimmedEmail = email.trim()

    if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
      setEmailError('Please enter a valid email address, such as you@example.com.')
      return
    }
    if (!password.trim()) {
      setAuthError('Password is required.')
      return
    }

    setEmailError('')
    setAuthError('')
    setLoading(true)

    try {
      const expectedRole = government ? 'government' : 'citizen'
      localStorage.removeItem('civic-role')

      const { data, error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
      if (error) throw error

      const user = data?.user
      if (!user) throw new Error('User account not found.')

      const profileRole = await getUserProfileRole(user.id)
      const sessionRole = String(user.user_metadata?.role || '').trim().toLowerCase()
      const resolvedRole = (profileRole || sessionRole || '').trim().toLowerCase()

      if (resolvedRole && resolvedRole !== expectedRole) {
        await supabase.auth.signOut()
        clearLocalUserSession()
        throw new Error(`This email is registered as a ${resolvedRole === 'government' ? 'government' : 'citizen'} account. Use the ${resolvedRole === 'government' ? 'official' : 'citizen'} login page.`)
      }

      const fullName = user.user_metadata?.full_name || trimmedEmail.split('@')[0]

      try {
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: user.id,
          full_name: fullName,
          email: trimmedEmail,
          role: expectedRole,
          avatar_url: localStorage.getItem('civic-avatar') || null,
        }, { onConflict: 'id' })

        if (profileError) {
          const message = String(profileError.message || '')
          if (!message.includes('does not exist') && !message.includes('column') && !message.includes('schema cache')) {
            console.warn('Profile role sync failed:', profileError.message)
          }
        }
      } catch (profileSyncError) {
        console.warn('Profile sync unavailable:', profileSyncError.message)
      }

      setLocalUserSession({ role: expectedRole, name: fullName, email: trimmedEmail, userId: user.id })
      navigate(government ? '/gov/dashboard' : '/citizen/dashboard')
    } catch (error) {
      setAuthError(error.message || 'Unable to sign in. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return <AuthLayout onBack={() => navigate('/')}><div className="login-box"><div className="role-icon blue"><UserRound /></div><div className="eyebrow">{government ? 'OFFICIAL ACCESS' : 'CITIZEN ACCESS'}</div><h2>Welcome back</h2><p className="muted">Sign in to continue to CivicLens</p><label>Email address<input value={email} onChange={e => { setEmail(e.target.value); setEmailError('') }} onBlur={() => email && !isValidEmail(email) && setEmailError('Please enter a valid email address, such as you@example.com.')} placeholder="you@example.com" type="email" required />{emailError && <small className="field-error">{emailError}</small>}</label><PasswordField value={password} onChange={e => { setPassword(e.target.value); setAuthError('') }} onKeyDown={event => { if (event.key === 'Enter' && !loading) { event.preventDefault(); submit() } }} /><div className="form-row"><label className="check-row"><input type="checkbox" /> Remember me</label><button type="button" className="text-btn" onClick={() => navigate(`/forgot-password?role=${government ? 'government' : 'citizen'}`)}>Forgot password?</button></div>{authError && <div className="field-error auth-error">{authError}</div>}<button type="button" className="primary-btn" onClick={submit} disabled={loading}>{loading ? 'Signing in...' : 'Sign in'} <ArrowRight size={17} /></button><p className="switch-auth">Don't have an account? <button type="button" className="text-btn" onClick={() => navigate(`/signup?role=${government ? 'government' : 'citizen'}`)}>Sign up</button></p></div></AuthLayout>
}

function AuthActionPage({ mode }) {
  const navigate = useNavigate()
  const params = new URLSearchParams(window.location.search)
  const government = params.get('role') === 'government'
  const [submitted, setSubmitted] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(false)
  const isSignup = mode === 'signup'

  const submit = async () => {
    const trimmedEmail = email.trim()

    if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
      setEmailError('Please enter a valid email address, such as you@example.com.')
      return
    }

    if (isSignup && (!fullName.trim() || fullName.trim().length < 2)) {
      setAuthError('Please enter your full name.')
      return
    }

    if (isSignup && password.length < 6) {
      setAuthError('Password must be at least 6 characters long.')
      return
    }

    setEmailError('')
    setAuthError('')
    setLoading(true)

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              role: government ? 'government' : 'citizen',
            },
          },
        })

        if (error) throw error

        const savedName = fullName.trim()
        localStorage.setItem('civic-name', savedName)
        localStorage.setItem('civic-email', trimmedEmail)
        if (data.user?.id) localStorage.setItem('civic-user-id', data.user.id)
        window.dispatchEvent(new Event('civic-name-updated'))

        if (data.user) {
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: data.user.id,
            full_name: savedName,
            email: trimmedEmail,
            role: government ? 'government' : 'citizen',
            avatar_url: localStorage.getItem('civic-avatar') || null,
          }, { onConflict: 'id' })

          if (profileError) {
            console.warn('Profile upsert failed:', profileError.message)
          }
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: `${window.location.origin}/forgot-password`,
        })
        if (error) throw error
      }

      setSubmitted(true)
    } catch (error) {
      setAuthError(error.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return <AuthLayout onBack={() => navigate(government ? '/gov/login' : '/citizen/login')}><div className="login-box">{submitted ? <div className="success-screen"><div className="success-icon"><CheckCircle2 size={42} /></div><h2>{isSignup ? 'Account created!' : 'Check your inbox'}</h2><p className="muted">{isSignup ? 'Your CivicLens account is ready.' : 'We sent password reset instructions to your email.'}</p><button className="primary-btn" onClick={() => navigate(government ? '/gov/login' : '/citizen/login')}>Continue to sign in</button></div> : <><div className="role-icon blue">{isSignup ? <UserRound /> : <LockKeyhole />}</div><div className="eyebrow">{isSignup ? 'CREATE ACCOUNT' : 'RESET PASSWORD'}</div><h2>{isSignup ? 'Join CivicLens' : 'Forgot password?'}</h2><p className="muted">{isSignup ? 'Help make your city better, together.' : 'Enter your email and we will send you a reset link.'}</p>{isSignup && <label>Full name<input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Doe" required /></label>}<label>Email address<input value={email} onChange={event => { setEmail(event.target.value); setEmailError('') }} onBlur={() => email && !isValidEmail(email) && setEmailError('Please enter a valid email address, such as you@example.com.')} type="email" placeholder="you@example.com" required />{emailError && <small className="field-error">{emailError}</small>}</label>{isSignup && <PasswordField value={password} onChange={e => { setPassword(e.target.value); setAuthError('') }} placeholder="Create a password" />} {authError && <div className="field-error auth-error">{authError}</div>}<button className="primary-btn" onClick={submit} disabled={loading}>{loading ? (isSignup ? 'Creating account...' : 'Sending...') : (isSignup ? 'Create account' : 'Send reset link')} <ArrowRight size={17} /></button><p className="switch-auth"><button className="text-btn" onClick={() => navigate(government ? '/gov/login' : '/citizen/login')}>Back to sign in</button></p></>}</div></AuthLayout>
}

function Dashboard() {
  const navigate = useNavigate()
  const fullName = useCitizenName()
  const firstName = fullName.trim().split(/\s+/)[0] || 'John'
  const [today, setToday] = useState(() => new Date())
  const [complaints, setComplaints] = useState([])

  useEffect(() => {
    const timer = window.setInterval(() => setToday(new Date()), 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    const loadComplaints = async () => {
      const items = await fetchMyComplaints()
      if (active) setComplaints(items)
    }
    loadComplaints()
    return () => { active = false }
  }, [])

  const stats = useMemo(() => {
    const total = complaints.length
    const resolved = complaints.filter(item => item.status && item.status.toLowerCase().includes('resolved')).length
    const inProgress = complaints.filter(item => item.status && item.status.toLowerCase().includes('progress')).length
    return { total, resolved, inProgress }
  }, [complaints])

  const dateLabel = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).toUpperCase()
  return <Layout><section className="page-wrap"><div className="welcome-row"><div><p className="eyebrow">{dateLabel}</p><h1>{getIndianGreeting()}, <span>{firstName}</span> <span className="wave">👋</span></h1><p className="muted">Let's make your city a little better today.</p></div><button onClick={() => navigate('/profile')} aria-label="Open profile"><CitizenAvatar large /></button></div><div className="hero-card"><div><span className="pill light-pill"><Zap size={13} /> AI ASSISTED REPORTING</span><h2>See something?<br /><b>Say something.</b></h2><p>Report civic issues in under 60 seconds.</p><button className="white-btn" onClick={() => navigate('/report')}>Report an issue <ArrowRight size={16} /></button></div><div className="hero-art"><MapPin size={90} /></div></div><div className="section-head"><h2>Your impact</h2><a onClick={() => navigate('/complaints')}>View all <ChevronRight size={15} /></a></div><div className="stats-grid"><div className="stat-card"><div className="stat-icon blue"><ClipboardList /></div><b>{stats.total}</b><span>Reports made</span><small>+{Math.max(0, stats.total - 1)} this month</small></div><div className="stat-card"><div className="stat-icon green"><CheckCircle2 /></div><b>{stats.resolved}</b><span>Issues resolved</span><small>Great work!</small></div><div className="stat-card"><div className="stat-icon violet"><MapPin /></div><b>{Math.max(0, stats.inProgress)}</b><span>In your area</span><small>Needs attention</small></div></div><div className="section-head"><h2>Recent activity</h2><a onClick={() => navigate('/complaints')}>See all <ChevronRight size={15} /></a></div><div className="activity-list">{complaints.slice(0, 4).map(c => <div className="activity-row" key={c.id}><div className="activity-thumb">{c.image ? <img src={c.image} alt={c.type} /> : <FileText size={20} />}</div><div><strong>{c.type}</strong><span>{c.location}</span><small>{c.date}</small></div><Status status={c.status} /></div>)}</div></section></Layout>
}

function Status({ status }) { const text = status || 'Pending review'; return <span className={`status ${text.toLowerCase().replace(/\s+/g, '-')}`}>{text}</span> }

function Complaints() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [complaints, setComplaints] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true
    const loadComplaints = async () => {
      try {
        const items = await fetchMyComplaints()
        if (active) {
          setComplaints(items)
          setLoadError('')
        }
      } catch (error) {
        if (active) setLoadError(error.message || 'Unable to load your complaints.')
      } finally {
        if (active) setLoading(false)
      }
    }
    loadComplaints()
    return () => { active = false }
  }, [])

  const matchesStatus = complaint => statusFilter === 'All' || (statusFilter === 'Rejected' ? complaint.status === 'Rejected' : complaint.status?.toLowerCase().includes(statusFilter.toLowerCase()))
  const list = complaints.filter(c => matchesStatus(c) && (`${c.type} ${c.id} ${c.location}`.toLowerCase().includes(query.toLowerCase())));
  const filterButton = (label, count) => <button className={`filter${statusFilter === label ? ' active' : ''}`} onClick={() => setStatusFilter(label)}>{label} <span>{count}</span></button>
  return <Layout><section className="page-wrap complaints-page"><div className="page-title"><div><p className="eyebrow">YOUR ACTIVITY</p><h1>My complaints</h1></div><button className="primary-btn compact" onClick={() => navigate('/report')}><Plus size={16} /> New report</button></div>{loadError && <div className="field-error auth-error">{loadError}</div>}{loading ? <div className="complaints-loading" role="status" aria-live="polite"><div className="loading-spinner" /><b>Loading your complaints...</b><span>Fetching your latest report updates</span></div> : <><div className="searchbox"><Search size={18} /><input placeholder="Search by issue or report ID" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="filter-row">{filterButton('All', complaints.length)}{filterButton('In progress', complaints.filter(item => item.status?.toLowerCase().includes('progress')).length)}{filterButton('Resolved', complaints.filter(item => item.status?.toLowerCase().includes('resolved')).length)}{filterButton('Rejected', complaints.filter(item => item.status === 'Rejected').length)}</div><div className="complaint-list">{list.map(c => <article className="complaint-card" key={c.id} onClick={() => navigate(`/complaints/${c.id}`)}>{c.image ? <img src={c.image} alt={c.type} /> : <div className="empty-thumb"><FileText /></div>}<div className="complaint-info"><div className="card-top"><strong>{c.type}</strong><Status status={c.status} /></div><p><MapPin size={14} />{c.location}</p><small>{c.id} · {c.date}</small>{c.status === 'Rejected' && c.rejectionReason && <div className="rejection-preview"><b>Rejection reason:</b> {c.rejectionReason}</div>}</div><ChevronRight className="chevron" /></article>)}</div></>}</section></Layout> }

function MapPage() {
  const [now, setNow] = useState(() => new Date())
  const [mapZoomed, setMapZoomed] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const [location, setLocation] = useState({
    latitude: DEFAULT_MAP_CENTER.lat,
    longitude: DEFAULT_MAP_CENTER.lng,
    label: 'Delhi, India',
    fallback: true,
    accuracy: null,
  })
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const userMarkerRef = useRef(null)

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) {
      return
    }

    const onSuccess = position => {
      const { latitude, longitude, accuracy } = position.coords
      setLocation({
        latitude,
        longitude,
        label: 'Your current location',
        fallback: false,
        accuracy,
      })
    }

    const onError = () => {
      setLocation(current => ({ ...current, label: 'Location permission denied', fallback: true }))
    }

    const watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
    })

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  const formattedTime = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Kolkata',
  })

  const formattedDate = now.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })

  const hasLocation = Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
  const coords = hasLocation ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : 'Location unavailable'
  const accuracy = location.accuracy ? ` +/- ${Math.round(location.accuracy)} m` : ''
  const locationPrecision = location.accuracy && location.accuracy > 500
    ? 'Approximate device location. Turn on phone GPS for better accuracy.'
    : 'Exact device GPS location is active.'

  useEffect(() => {
    if (!apiKey) {
      return
    }

    loadGoogleMapsScript(apiKey, ready => {
      if (!ready || !mapRef.current || !window.google?.maps) {
        setMapReady(false)
        setMapError('Google Maps could not be loaded. Check your API key and billing settings.')
        return
      }

      const center = { lat: location.latitude, lng: location.longitude }
      const map = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 12,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        gestureHandling: 'greedy',
        styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
      })

      userMarkerRef.current = new window.google.maps.Marker({
        map,
        position: center,
        title: 'Your current location',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#2563eb',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
      })

      if (!location.fallback) {
        const geocoder = new window.google.maps.Geocoder()
        geocoder.geocode({ location: center }, (results, status) => {
          if (status === 'OK' && results?.length) {
            setLocation(current => ({ ...current, label: getLocationLabel(results) }))
          }
        })
      }

      mapInstanceRef.current = map
      setMapReady(true)
      setMapError('')
    })
  }, [apiKey, location.latitude, location.longitude, location.fallback])

  useEffect(() => {
    if (!mapInstanceRef.current) return

    const center = { lat: location.latitude, lng: location.longitude }
    mapInstanceRef.current.setCenter(center)
    mapInstanceRef.current.setZoom(mapZoomed ? 16 : 12)

    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition(center)
    } else if (window.google?.maps) {
      userMarkerRef.current = new window.google.maps.Marker({
        map: mapInstanceRef.current,
        position: center,
      })
    }
  }, [location, mapZoomed])

  const focusCurrentLocation = () => {
    if (!hasLocation) {
      setMapZoomed(false)
      return
    }
    setMapZoomed(true)
  }

  const displayedMapError = mapError || (!apiKey ? 'Add VITE_GOOGLE_MAPS_API_KEY in your .env file to enable the live map.' : '')

  return <Layout><section className="page-wrap"><div className="page-title"><div><p className="eyebrow">DISCOVER</p><h1>Issues near you</h1></div><button className="icon-btn" onClick={focusCurrentLocation} aria-label="Focus current location"><Navigation size={18} /></button></div><div className="map-live-card"><div className="map-live-header"><span className="live-pill">LIVE</span><span className="map-live-time">{formattedTime}</span></div><div className="google-map-shell" onClick={focusCurrentLocation} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusCurrentLocation() } }}><div ref={mapRef} className="google-map" /><div className="map-location-tag" title={location.label} aria-label={location.label}><Navigation size={16} /> <span>{location.label}</span></div><button className="map-focus-btn" onClick={event => { event.stopPropagation(); focusCurrentLocation() }}>Center on me</button>{!mapReady && <div className="google-map-overlay"><div className="google-map-loading"><div className="mini-spinner" /><span>{displayedMapError || 'Loading Google Maps...'}</span></div></div>}</div><div className="map-live-footer"><div><small>Current time</small><strong>{formattedDate}</strong></div><div><small>Coordinates</small><strong>{coords}{accuracy}</strong></div></div></div><div className="nearby-card"><div><b>{hasLocation && !location.fallback ? 'Live GPS' : 'GPS unavailable'}</b><span>{hasLocation && !location.fallback ? locationPrecision : 'Allow browser location access for accurate tracking'}</span></div><div className="map-mini-time"><span>{formattedTime}</span></div></div></section></Layout> }
function Detail({ id }) {
  const [complaint, setComplaint] = useState(null)

  useEffect(() => {
    let active = true
    const loadComplaint = async () => {
      const items = await fetchMyComplaints()
      const selected = items.find(item => String(item.id) === String(id)) || items[0] || null
      if (active) setComplaint(selected)
    }
    loadComplaint()
    return () => { active = false }
  }, [id])

  if (!complaint) return <Layout><section className="page-wrap"><button className="back-link" onClick={() => history.back()}><ArrowLeft size={16} /> Back to complaints</button><div className="detail-card"><h3>Loading report...</h3></div></section></Layout>

  const timeline = ['Submitted', 'AI Verified', 'Assigned to Department', 'In Progress', 'Resolved', 'Rejected']
  const statusIndex = { 'Pending review': 1, Assigned: 2, 'In Progress': 3, Resolved: 4, Rejected: 5 }
  const currentIndex = statusIndex[complaint.status] ?? 2
  const timelineItems = complaint.status === 'Rejected' ? timeline.filter(item => item !== 'Resolved') : timeline.slice(0, 5)
  return <Layout><section className="page-wrap"><style>{`.timeline-row.rejected{color:#d9504a}.timeline-row.rejected i{background:#fff0ee;border-color:#d9504a;color:#d9504a}.timeline-row.rejected b,.timeline-row.rejected small{color:#d9504a}`}</style><button className="back-link" onClick={() => history.back()}><ArrowLeft size={16} /> Back to complaints</button><div className="detail-head"><div><p className="eyebrow">REPORT {complaint.id}</p><h1>{complaint.type}</h1><Status status={complaint.status} /></div><span className={`priority ${complaint.priority.toLowerCase()}`}>{complaint.priority} priority</span></div>{complaint.image && <img className="detail-image" src={complaint.image} alt={complaint.type} />}<div className="detail-card"><h3>Report details</h3><p>{complaint.description}</p>{complaint.rejectionReason && <div className="rejection-message"><b>Reason for rejection</b><p>{complaint.rejectionReason}</p></div>}<div className="detail-meta"><span><MapPin />{complaint.location}</span><span><CalendarIcon />Reported {complaint.date}</span></div></div><div className="timeline"><h3>Status timeline</h3>{timelineItems.map((s, i) => { const itemIndex = statusIndex[s] ?? i; const done = s === 'Submitted' || itemIndex < currentIndex; const current = itemIndex === currentIndex && s !== 'Submitted'; return <div className={`timeline-row ${done ? 'done' : ''}${current ? ' current' : ''}${s === 'Rejected' ? ' rejected' : ''}`} key={s}><i>{done ? <Check size={13} /> : current ? <span className="timeline-pulse" /> : <span />}</i><div><b>{s}</b><small>{current ? 'Current status' : done ? 'Completed' : 'Pending'}</small></div></div> })}</div></section></Layout> }

function CalendarIcon() { return <span className="calendar-icon">▣</span> }

function ReportWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [image, setImage] = useState(null);
  const [issueType, setIssueType] = useState('Other');
  const [location, setLocation] = useState(null);
  const [manualLocationOpen, setManualLocationOpen] = useState(false);
  const [manualLocation, setManualLocation] = useState('');
  const [description, setDescription] = useState(issueDescriptions.Other);
  const [aiResult, setAiResult] = useState(null);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [invalidImageOpen, setInvalidImageOpen] = useState(false);
  const [duplicateIssueOpen, setDuplicateIssueOpen] = useState(false);
  const priority = aiResult?.priority || issuePriority[issueType] || issuePriority.Other
  const confidence = aiResult?.confidence || 0
  const [reportId, setReportId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const inputRef = useRef(null)
  const invalidImageCloseRef = useRef(null)
  const duplicateIssueCloseRef = useRef(null)
  const labels = ['Upload', 'Location', 'AI review', 'Results', 'Duplicate', 'Priority', 'Review', 'Done']

  useEffect(() => { if (step === 3 || step === 5) { const t = setTimeout(() => setStep(step + 1), 1800); return () => clearTimeout(t) } }, [step])
  useEffect(() => {
    if (!invalidImageOpen && !duplicateIssueOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (duplicateIssueOpen) duplicateIssueCloseRef.current?.focus()
    else invalidImageCloseRef.current?.focus()
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        setInvalidImageOpen(false)
        setDuplicateIssueOpen(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [invalidImageOpen, duplicateIssueOpen])

  const next = () => { if (step === 1 && !image) return; if (step === 2 && !location) return; setStep(Math.min(8, step + 1)) }

  const onFile = async e => {
    const f = e.target.files?.[0]
    if (!f) return
    e.target.value = ''
    if (analyzingImage) return
    try {
      setSubmitError('')
      setAnalyzingImage(true)
      const imageData = await fileToDataUrl(f)
      try {
        const result = await analyzeIssueImage(imageData)
        if (!result.isCivicIssue) {
          setImage(null)
          setAiResult(null)
          setInvalidImageOpen(true)
          return
        }
        setImage(imageData)
        setAiResult(result)
        setIssueType(result.issueType)
        setDescription(result.description)
      } catch (analysisError) {
        console.warn('AI image analysis unavailable:', analysisError.message)
        const fallback = normalizeAiResult({ isCivicIssue: true, issueType: 'Other' })
        setImage(imageData)
        setAiResult(fallback)
        setIssueType(fallback.issueType)
        setDescription(fallback.description)
        setSubmitError(`AI analysis failed: ${analysisError.message} Please choose the issue type and review the suggested description.`)
      }
    } catch (error) {
      setSubmitError(error.message)
    } finally {
      setAnalyzingImage(false)
    }
  }

  const submitReport = async () => {
    setSubmitting(true)
    try {
      setSubmitError('')
      setDuplicateIssueOpen(false)
      const { data: { user }, error: userError } = await withTimeout(
        supabase.auth.getUser(),
        10000,
        'Supabase authentication is not responding. Check your internet connection and try again.'
      )
      if (userError) throw getSupabaseError(userError)

      const userId = user?.id || 'anonymous'
      const databaseRows = await withTimeout(
        fetchIssueRows({ userId: user?.id || null, userEmail: user?.email || '' }),
        10000,
        'Unable to check existing reports. Please try submitting again.'
      )
      const localRows = getLocalComplaintItems(userId)
      const alreadyReported = [...databaseRows, ...localRows].some(row => (row.image_url || row.image) === image)
      if (alreadyReported) {
        setDuplicateIssueOpen(true)
        return
      }

      const generatedReportId = `CL-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
      const payload = {
        user_id: user?.id || null,
        reporter_name: user ? getUserDisplayName(user) : localStorage.getItem('civic-name') || '',
        reporter_email: user?.email || localStorage.getItem('civic-email') || '',
        reporter_avatar: localStorage.getItem('civic-avatar') || null,
        report_id: generatedReportId,
        title: issueType,
        issue_type: issueType,
        description: description.trim() || 'Civic issue reported by citizen.',
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        location_name: location?.label || 'Location unavailable',
        address: location?.label || 'Location unavailable',
        priority: priority.label,
        status: 'Pending review',
        image_url: image || null,
        created_at: new Date().toISOString(),
      }

      await insertIssueRow(payload)
      if (payload.user_id) {
        const knownReports = JSON.parse(localStorage.getItem(`civic-reports-${payload.user_id}`) || '[]')
        localStorage.setItem(`civic-reports-${payload.user_id}`, JSON.stringify([...new Set([...knownReports, generatedReportId])]))
      }
      setReportId(generatedReportId)
      setStep(8)
    } catch (error) {
      console.error('Issue submission failed:', error)
      setSubmitError(error.message || 'Unable to save this issue. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="wizard"><header className="wizard-head"><button onClick={() => step > 1 ? setStep(step - 1) : navigate('/citizen/dashboard')}><ArrowLeft size={19} /></button><div><b>Report an issue</b><span>Step {step} of 8</span></div><button onClick={() => navigate('/citizen/dashboard')}><X size={19} /></button></header><div className="progress">{labels.map((l, i) => <div key={l} className={i + 1 <= step ? 'filled' : ''}><i>{i + 1 < step ? <Check size={11} /> : i + 1}</i><span>{l}</span></div>)}</div><main className="wizard-main"><div className="wizard-card">
    {step === 1 && <><StepTitle eyebrow="STEP 1 · ADD EVIDENCE" title="What needs attention?" subtitle="A clear photo helps our AI understand the issue." /><div className="issue-type-picker"><b>What is the complaint about?</b><div className="issue-type-options">{issueTypes.map(type => <button type="button" className={issueType === type ? 'selected' : ''} key={type} onClick={() => setIssueType(type)}>{type}</button>)}</div></div><div className={`upload-zone ${image ? 'has-image' : ''}${analyzingImage ? ' is-analyzing' : ''}`} onClick={() => { if (!analyzingImage) inputRef.current?.click() }} aria-busy={analyzingImage}>{image ? <><img src={image} /><button className="remove-image" onClick={e => { e.stopPropagation(); setImage(null) }}><X size={16} /></button></> : <><div className="upload-icon">{analyzingImage ? <div className="mini-spinner" /> : <Camera />}</div><b>{analyzingImage ? 'Checking your photo...' : 'Tap to capture a photo'}</b><span aria-live="polite">{analyzingImage ? 'Our AI is checking whether it shows a civic issue' : 'or choose from your gallery'}</span>{!analyzingImage && <button className="outline-btn"><ImagePlus size={16} /> Choose from gallery</button>}</>}<input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onFile} /></div><Tip /></>}
    {step === 2 && <><StepTitle eyebrow="STEP 2 · LOCATION" title="Where is the issue?" subtitle="We use your location to route this report to the right team." /><div className="location-card"><div className="location-visual"><MapPin size={32} /><div className="ring r1" /><div className="ring r2" /></div>{location ? <><b>Location detected</b><p>{location.label}<br /><small>Coordinates saved with this report</small></p></> : <><b>Location not detected</b><p className="muted">Allow location access or enter it manually</p></>}<button className="primary-btn" onClick={() => { setSubmitError(''); if (!navigator.geolocation) { setSubmitError('Location is not supported by this browser.'); return } navigator.geolocation.getCurrentPosition(({ coords }) => setLocation({ latitude: coords.latitude, longitude: coords.longitude, label: `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}` }), error => setSubmitError(error.message || 'Unable to detect your location.')) }}>{location ? 'Refresh location' : 'Use my current location'} <Navigation size={16} /></button><button className="text-btn" onClick={() => { setManualLocationOpen(value => !value); setSubmitError('') }}>Use a different location</button>{manualLocationOpen && <div className="manual-location-form"><label htmlFor="manual-location">Enter location</label><input id="manual-location" value={manualLocation} onChange={event => setManualLocation(event.target.value)} placeholder="Street, area, city" /><button className="outline-btn" onClick={() => { const value = manualLocation.trim(); if (!value) { setSubmitError('Please enter a location.'); return } setLocation({ latitude: null, longitude: null, label: value }); setManualLocationOpen(false); setSubmitError('') }}>Use this location</button></div>}</div></>}
    {step === 3 && <Processing title="Analyzing your image" subtitle={analyzingImage ? 'AI is identifying the issue, writing a description, and calculating priority' : 'Analysis complete'} />}
    {step === 4 && <><StepTitle eyebrow="STEP 4 · AI RESULTS" title="Does this look right?" subtitle={`Our AI is reviewing this as ${issueType.toLowerCase()}.`} /><div className="result-card"><div className="result-row"><div className="result-icon"><AlertTriangle /></div><div><b>{issueType}</b><span>Issue detected</span></div><span className="confidence">{confidence}%</span></div><div className="confidence-bar"><i style={{ width: `${confidence}%` }} /></div><label>Description <button className="edit-label"><Pencil size={13} /> Edit</button><textarea value={description} onChange={e => setDescription(e.target.value)} /></label><div className="confirm-location"><MapPin size={16} /><span>{location?.label || 'Location unavailable'}</span><CheckCircle2 size={16} /></div></div></>}
    {step === 5 && <Processing title="Checking for duplicates" subtitle="Looking for similar reports in your area" />}
    {step === 6 && <><StepTitle eyebrow="STEP 6 · PRIORITY" title="How urgent is this?" subtitle="AI calculated the priority using multiple factors." /><div className="priority-card"><div className="priority-label"><span className="flame">🔥</span><b>{priority.label} priority</b><span>{priority.score}</span></div><div className="priority-bar"><i style={{ width: `${Number(priority.score.split('/')[0].trim()) * 10}%` }} /></div><h4>Factors considered</h4>{[['Issue type', `${priority.impact} impact`], ['Location sensitivity', priority.label], ['Reported frequency', 'Low'], ['Public impact', priority.publicImpact]].map(([a, b]) => <div className="factor" key={a}><CheckCircle2 size={15} /><span>{a}</span><small>{b}</small></div>)}</div></>}
    {step === 7 && <><StepTitle eyebrow="STEP 7 · FINAL REVIEW" title="Ready to submit?" subtitle="Make sure everything looks good before sending." /><div className="review-card">{image && <img src={image} />}<div className="review-line"><span>Issue</span><b>{issueType}</b></div><div className="review-line"><span>Location</span><b>{location?.label || 'Location unavailable'}</b></div><div className="review-line"><span>Priority</span><b className="red-text">{priority.label}</b></div><p>{description}</p></div></>}
    {step === 8 && <div className="success-screen"><div className="success-icon"><CheckCircle2 size={46} /></div><StepTitle title="Report submitted!" subtitle="Thank you for helping improve your community." /><div className="report-id"><span>REPORT ID</span><b>{reportId ? `#${reportId}` : '#CL-2024-000123'}</b></div><button className="primary-btn" onClick={() => navigate('/complaints')}>View my complaint <ArrowRight size={16} /></button><button className="text-btn" onClick={() => navigate('/citizen/dashboard')}>Back to home</button></div>}
    {submitError && <div className="field-error auth-error">{submitError}</div>}
    {step < 8 && step !== 3 && step !== 5 && <div className="wizard-actions"><button className="text-btn" onClick={() => step > 1 ? setStep(step - 1) : navigate('/citizen/dashboard')}>Back</button><button className="primary-btn" onClick={step === 7 ? submitReport : next} disabled={submitting || (step === 1 && analyzingImage)}>{submitting ? 'Submitting...' : step === 7 ? 'Confirm & submit' : step === 2 && location ? 'Confirm location' : 'Continue'} <ArrowRight size={16} /></button></div>}
  </div></main>{invalidImageOpen && <div className="image-rejection-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setInvalidImageOpen(false) }}><section className="image-rejection-dialog" role="alertdialog" aria-modal="true" aria-labelledby="image-rejection-title" aria-describedby="image-rejection-description"><button ref={invalidImageCloseRef} className="image-rejection-close" aria-label="Close message" onClick={() => setInvalidImageOpen(false)}><X size={18} /></button><div className="image-rejection-icon"><ImagePlus size={28} /></div><span className="image-rejection-eyebrow">PHOTO NOT RECOGNIZED</span><h2 id="image-rejection-title">This photo doesn't show a civic issue</h2><p id="image-rejection-description">Please upload a clear photo of a civic problem so we can help route it to the right team.</p><div className="image-rejection-examples"><span>Potholes</span><span>Overflowing garbage</span><span>Broken streetlights</span><span>Water leaks</span></div><button className="image-rejection-action" onClick={() => setInvalidImageOpen(false)}>Choose another photo <ArrowRight size={17} /></button><small>Your photo hasn't been added to the report.</small></section></div>}{duplicateIssueOpen && <div className="image-rejection-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setDuplicateIssueOpen(false) }}><section className="image-rejection-dialog duplicate-image-dialog" role="alertdialog" aria-modal="true" aria-labelledby="duplicate-image-title" aria-describedby="duplicate-image-description"><button ref={duplicateIssueCloseRef} className="image-rejection-close" aria-label="Go to dashboard" onClick={() => navigate('/citizen/dashboard')}><X size={18} /></button><div className="image-rejection-icon duplicate-image-icon"><AlertTriangle size={28} /></div><span className="image-rejection-eyebrow duplicate-image-eyebrow">DUPLICATE PHOTO</span><h2 id="duplicate-image-title">This complaint is already in our database</h2><p id="duplicate-image-description">We found an existing complaint with this same image. Your report hasn’t been submitted again.</p><button className="image-rejection-action duplicate-image-action" onClick={() => navigate('/citizen/dashboard')}>Got it <Check size={17} /></button></section></div>}</div>
}
function StepTitle({ eyebrow, title, subtitle }) { return <div className="step-title"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{subtitle}</p></div> }
function Tip() { return <div className="tip"><Sparkles size={16} /><div><b>Photo tips</b><span>Good lighting · Show surroundings · Keep it steady</span></div></div> }
const processingSteps = ['Image quality', 'Issue detection', 'Generating description', 'Checking duplicates']

function Processing({ title, subtitle = 'Our AI is checking the details for you' }) {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex(current => Math.min(current + 1, processingSteps.length - 1))
    }, 420)
    return () => window.clearInterval(timer)
  }, [])

  return <div className="processing"><div className="processing-orb scanning-orb"><span className="scan-line" /><Sparkles size={34} /></div><h1>{title}</h1><p className="muted">{subtitle}</p><div className="processing-live"><span className="live-dot" /> Live AI analysis in progress</div><div className="processing-list">{processingSteps.map((step, index) => { const done = index < activeIndex; const current = index === activeIndex; return <div className={`${done ? 'analysis-done' : ''}${current ? ' analysis-current' : ''}`} key={step}>{done ? <CheckCircle2 size={17} className="green-icon" /> : <span className="analysis-icon">{current ? <span className="mini-spinner" /> : <span>{index + 1}</span>}</span>}<span>{step}</span><small>{done ? 'Done' : current ? 'Scanning...' : 'Pending'}</small></div> })}</div></div>
}

function GovDashboard() {
  const navigate = useNavigate()
  const [reports, setReports] = useState([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [evidencePreview, setEvidencePreview] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [openedReports, setOpenedReports] = useState(() => JSON.parse(localStorage.getItem('civic-opened-government-reports') || '[]'))
  const [reporter, setReporter] = useState(null)
  const reportQueueRef = useRef(null)
  const [govUser, setGovUser] = useState(() => ({
    name: localStorage.getItem('civic-name') || 'Government User',
    email: localStorage.getItem('civic-email') || 'official@civiclens.ai',
  }))

  useEffect(() => {
    let active = true
    const loadData = async () => {
      const nextReports = await fetchGovernmentComplaints()
      if (active) setReports(nextReports)

      const { data: { user } } = await supabase.auth.getUser()
      if (!active) return
      const nextName = getUserDisplayName(user || { email: localStorage.getItem('civic-email'), user_metadata: { full_name: localStorage.getItem('civic-name') } })
      const nextEmail = (user?.email || localStorage.getItem('civic-email') || 'official@civiclens.ai').trim()
      setGovUser({ name: nextName, email: nextEmail })
    }
    loadData()
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const loadReporter = async () => {
      if (!selected) {
        setReporter(null)
        return
      }

      if (!selected.userId || (selected.reporterName && selected.reporterEmail && selected.reporterAvatar)) {
        setReporter({ name: selected.reporterName || 'Citizen reporter', email: selected.reporterEmail || 'Email unavailable', avatar: selected.reporterAvatar || '' })
        return
      }

      let { data, error } = await supabase
        .from('profiles')
        .select('full_name, email, avatar_url')
        .eq('id', selected.userId)
        .maybeSingle()
      if (error && String(error.message || '').match(/column|schema cache|does not exist/i)) {
        const fallback = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', selected.userId)
          .maybeSingle()
        data = fallback.data
        error = fallback.error
      }

      if (!active) return
      if (error) {
        console.warn('Citizen profile lookup failed:', error.message)
      }
      setReporter({
        name: data?.full_name || selected.reporterName || 'Citizen reporter',
        email: selected.reporterEmail || data?.email || 'Email unavailable',
        avatar: selected.reporterAvatar || data?.avatar_url || '',
      })
    }

    loadReporter()
    return () => { active = false }
  }, [selected])

  const showAllReports = async () => {
    setQuery('')
    const nextReports = await fetchGovernmentComplaints()
    setReports(nextReports)
    reportQueueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const openReport = report => {
    setSelected(report)
    if (!openedReports.includes(report.id)) {
      const nextOpenedReports = [...openedReports, report.id]
      setOpenedReports(nextOpenedReports)
      localStorage.setItem('civic-opened-government-reports', JSON.stringify(nextOpenedReports))
    }
  }

  const visible = reports.filter(report => `${report.id} ${report.type} ${report.location}`.toLowerCase().includes(query.toLowerCase()))
  const greeting = getIndianGreeting()
  const headerDate = formatIndianDate()
  const initials = govUser.name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'GO'
  const reporterName = reporter?.name || selected?.reporterName || ''
  const reporterEmail = reporter?.email || selected?.reporterEmail || ''
  const reporterAvatar = reporter?.avatar || selected?.reporterAvatar || ''
  const reporterInitials = reporterName
    ? reporterName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
    : 'CU'

  const trendDays = Array.from({ length: 7 }, (_, index) => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    d.setDate(d.getDate() - (6 - index))
    d.setHours(0, 0, 0, 0)
    return {
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }),
      count: 0,
    }
  })

  reports.forEach(report => {
    const createdAt = report.createdAt ? new Date(report.createdAt) : new Date()
    const key = new Date(createdAt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toISOString().slice(0, 10)
    const day = trendDays.find(item => item.key === key)
    if (day) day.count += 1
  })

  const trendMax = Math.max(...trendDays.map(item => item.count), 1)
  const trendPoints = trendDays
    .map((day, index) => {
      const x = (index / Math.max(trendDays.length - 1, 1)) * 100
      const y = 100 - (day.count / trendMax) * 70 - 10
      return `${x},${y}`
    })
    .join(' ')

  const issueGroups = reports.reduce((acc, report) => {
    const type = (report.type || report.issue_type || 'Uncategorized').trim() || 'Uncategorized'
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {})

  const issueStats = Object.entries(issueGroups)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([label, count]) => ({ label, count, percent: reports.length ? Math.round((count / reports.length) * 100) : 0 }))

  const updateStatus = async (status, reason = '') => {
    if (!selected) return

    const key = selected.dbId ? 'id' : 'report_id'
    const value = selected.dbId || selected.id
    const cleanReason = reason.trim()
    const update = status === 'Rejected'
      ? { status, rejection_reason: cleanReason || null }
      : { status }
    let { error } = await supabase
      .from('issues')
      .update(update)
      .eq(key, value)

    // Some existing Supabase projects created this column as text[].
    // Retry with the array shape so rejection still works until that column is migrated to text.
    if (error && status === 'Rejected' && cleanReason && /malformed array literal/i.test(error.message || '')) {
      ({ error } = await supabase
        .from('issues')
        .update({ status, rejection_reason: [cleanReason] })
        .eq(key, value))
    }

    if (error) {
      console.error('Issue status update failed:', error)
      window.alert(error.message || 'Unable to update the complaint status.')
      return
    }

    if (status === 'Rejected' && cleanReason) {
      const savedReasons = JSON.parse(localStorage.getItem('civic-rejection-reasons') || '{}')
      localStorage.setItem('civic-rejection-reasons', JSON.stringify({
        ...savedReasons,
        [selected.id]: cleanReason,
        ...(selected.dbId ? { [selected.dbId]: cleanReason } : {}),
      }))
    }

    const localReportKey = selected.id || selected.dbId
    if (localReportKey) {
      syncLocalComplaintStatus(localReportKey, status, cleanReason)
      complaintCache.clear()
    }

    setReports(current => current.map(report => report.id === selected.id
      ? { ...report, status, rejectionReason: status === 'Rejected' ? cleanReason : report.rejectionReason }
      : report))
    setSelected(null)
    setRejecting(false)
    setRejectionReason('')
    navigate('/gov/dashboard')
  }
  return <div className="gov-page"><style>{`.report-queue{margin:24px 0}.gov-search{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:9px;padding:9px 11px;margin:16px 0;color:var(--muted)}.gov-search input{border:0;outline:0;width:100%;font-size:12px}.gov-report-list{display:grid;gap:6px}.gov-report-row{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:11px 6px;border-top:1px solid #eef2f6;transition:background .2s,border-color .2s}.gov-report-row:hover{background:#f7faff}.gov-report-row.unopened{background:#f6f8fb;border-color:#e7ebf1}.gov-report-row.unopened .gov-report-type b,.gov-report-row.unopened .gov-report-type small{color:#8b98aa}.gov-report-row.unopened .settings-icon{background:#edf0f4;color:#8b98aa}.gov-report-type{display:flex;align-items:center;gap:10px;flex:1}.gov-report-type>span{display:grid;gap:3px}.gov-report-type b{font-size:12px}.gov-report-type small{font-size:10px;color:var(--muted)}.gov-report-row>svg{color:#a5b0c0}.status.pending-review{background:#fff0d6;color:#b86a00}.status.rejected{background:#fff0ee;color:#d9504a}.gov-detail-modal{background:#fff;border-radius:18px;padding:28px;max-width:470px;width:100%;position:relative;box-shadow:0 20px 50px #10203b33}.gov-detail-modal h2{font-size:23px;margin:0 0 10px}.gov-detail-meta{display:grid;gap:9px;margin:20px 0;color:#63728a;font-size:12px}.gov-detail-meta span{display:flex;align-items:center;gap:7px}.gov-description{font-size:13px;line-height:1.6;color:#586880;border-top:1px solid #eef2f6;padding-top:16px}.gov-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:20px}.gov-actions button{border-radius:9px;padding:11px 8px;font-size:11px;font-weight:750;display:flex;align-items:center;justify-content:center;gap:5px}.reject-btn{background:#fff0ee;color:#d9504a}.assign-btn{background:#e8f1ff;color:#2563eb}.resolve-btn{grid-column:1/-1;background:#e4f7ed;color:#159464}  `}</style>{selected && evidencePreview && <div className="evidence-lightbox" role="dialog" aria-modal="true" aria-label="Evidence image preview" onClick={() => setEvidencePreview(false)}><button type="button" className="evidence-lightbox-close" onClick={() => setEvidencePreview(false)} aria-label="Close image preview"><X size={22} /></button><div className="evidence-lightbox-stage" onClick={event => event.stopPropagation()}><img src={selected.image} alt={`${selected.type} full evidence`} /></div></div>}<header className="gov-top"><div className="brand brand-light"><div className="brand-mark"><ShieldCheck size={21} /></div><span>CivicLens <b>AI</b></span></div><span>Government portal</span><button className="avatar" onClick={() => navigate('/gov/profile')}>{initials}</button></header><main className="gov-main"><p className="eyebrow">OVERVIEW · {headerDate.toUpperCase()}</p><h1>{greeting}, {govUser.name}</h1><p className="muted">Review, verify, and route citizen reports.</p><div className="gov-stats"><div><span>Total reports</span><b>{reports.length}</b><small>Live queue</small></div><div><span>In progress</span><b>{reports.filter(item => (item.status || '').toLowerCase().includes('progress') || (item.status || '').toLowerCase().includes('assigned')).length}</b><small>Active cases</small></div><div><span>Resolved</span><b>{reports.filter(item => (item.status || '').toLowerCase().includes('resolved')).length}</b><small>Closed</small></div><div className="overdue"><span>Pending</span><b>{reports.filter(item => (item.status || '').toLowerCase().includes('pending') || (item.status || '').toLowerCase().includes('review')).length}</b><small>Needs action</small></div></div>  <div ref={reportQueueRef} className="gov-panel report-queue"><div className="panel-head"><h3>Report queue</h3><button className="text-btn" onClick={showAllReports}>View all reports <ArrowRight size={14} /></button></div><div className="gov-search"><Search size={16} /><input placeholder="Search report ID, issue, or location" value={query} onChange={event => setQuery(event.target.value)} /></div>  <div className="gov-report-list">  {visible.map(report => <div className={`gov-report-row${openedReports.includes(report.id) ? '' : ' unopened'}`} key={report.id}><div className="gov-report-type"><div className="settings-icon blue"><AlertTriangle size={16} /></div><span><b>{report.type}</b><small>{report.id} · {report.location}</small></span></div><Status status={report.status} /><button className="view-report-btn" onClick={() => openReport(report)}>View report</button><ChevronRight size={16} /></div>)}</div></div><div className="gov-panels"><div className="gov-panel"><div className="panel-head"><h3>Reports trend</h3><span>Last 7 days</span></div><div className="fake-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={trendPoints} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /></svg></div><div className="trend-labels" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#71809a', marginTop: '8px' }}>{trendDays.map(day => <span key={day.key}>{day.label}</span>)}</div></div><div className="gov-panel"><div className="panel-head"><h3>Top issue types</h3></div><div className="donut"><div><b>{reports.length}</b><span>Total</span></div></div><ul className="legend">{issueStats.length ? issueStats.map((item, index) => <li key={item.label}><i className={`dot ${index === 0 ? 'blue-dot' : index === 1 ? 'green-dot' : 'orange-dot'}`} />{item.label} <b>{item.percent}%</b></li>) : <li><i className="dot blue-dot" />No reports yet <b>0%</b></li>}</ul></div></div></main>{selected && <div className="review-wizard"><header className="review-wizard-head"><button onClick={() => setSelected(null)}><ArrowLeft size={19} /></button><div><b>Review report</b><span>{selected.id}</span></div><button onClick={() => setSelected(null)}><X size={19} /></button></header><div className="review-progress"><span className="complete"><i><Check size={11} /></i>Submitted</span><b /><span className="complete"><i><Check size={11} /></i>AI verified</span><b /><span className="current"><i>3</i>Official review</span><b /><span><i>4</i>Resolution</span></div><main className="review-content"><div className="review-title"><div><p className="eyebrow">OFFICIAL REVIEW · {selected.id}</p><h1>{selected.type}</h1><Status status={selected.status} /></div><span className={`priority ${selected.priority.toLowerCase()}`}>{selected.priority} priority</span></div><div className="review-grid">    <section className="review-evidence"><h3>Evidence submitted</h3>{selected.image ? <button type="button" className="evidence-image-button" onClick={() => setEvidencePreview(true)} aria-label="Open evidence image"><img src={selected.image} alt={`${selected.type} evidence`} /><span>Tap to zoom image</span></button> : <div className="no-evidence"><Camera size={28} /><span>No image attached</span></div>}<div className="evidence-caption"><CheckCircle2 size={15} /> Image verified by AI · 92% confidence</div></section><section className="review-info"><div className="info-block"><h3>Reported by</h3><div className="reporter">  <div className="reporter-avatar">{reporterAvatar ? <img src={reporterAvatar} alt="" /> : reporterInitials}</div><div>  <b>{reporterName || 'Citizen reporter'}</b><span>Citizen · Resident reporter</span><small>{reporterEmail || 'Email unavailable'}</small></div></div></div><div className="info-block"><h3>Issue details</h3><p>{selected.description}</p><div className="info-line"><MapPin size={15} /><span><b>Location</b>{selected.location}</span></div><div className="info-line"><FileText size={15} /><span><b>Submitted</b>{selected.date}</span></div></div><div className="info-block"><h3>AI assessment</h3><div className="assessment"><span>Issue type <b>{selected.type}</b></span><span>Confidence <b className="green-text">92%</b></span><span>Duplicate check <b className="green-text">No match found</b></span></div></div></section></div><section className="decision-panel"><div><h3>Choose an action</h3><p>Update the report status and route it to the appropriate team.</p></div><div className="gov-actions">  {rejecting ? <div className="rejection-form"><label htmlFor="rejection-reason">Reason for rejection</label><textarea id="rejection-reason" value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} placeholder="Explain why this complaint is being rejected." rows={4} /><div><button className="text-btn" onClick={() => { setRejecting(false); setRejectionReason('') }}>Cancel</button><button className="reject-btn" disabled={!rejectionReason.trim()} onClick={() => updateStatus('Rejected', rejectionReason.trim())}>Send rejection</button></div></div> : <button className="reject-btn" onClick={() => setRejecting(true)}><X size={15} /> Reject complaint</button>}<button className="assign-btn" onClick={() => updateStatus('Assigned')}><Building2 size={15} /> Pass to department</button><button className="resolve-btn" onClick={() => updateStatus('Resolved')}><Check size={15} /> Mark resolved</button></div></section></main></div>}</div>
}

function GovProfile() {
  const navigate = useNavigate()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [profile, setProfile] = useState(() => ({
    name: localStorage.getItem('civic-name') || 'Government User',
    email: localStorage.getItem('civic-email') || 'official@civiclens.ai',
  }))

  useEffect(() => {
    const refreshProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const nextName = getUserDisplayName(user)
      const nextEmail = (user.email || localStorage.getItem('civic-email') || 'official@civiclens.ai').trim()
      setProfile({ name: nextName, email: nextEmail })
    }
    refreshProfile()
  }, [])

  const logout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.warn('Government logout failed:', error.message)
    }
    localStorage.removeItem('civic-role')
    localStorage.removeItem('civic-name')
    localStorage.removeItem('civic-email')
    navigate('/')
  }
  const initials = (profile.name || 'Government User').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'GO'
  return <div id="gov-profile" className="gov-page"><style>{`#gov-profile .settings-card{background:#fff;border:1px solid #e3eaf3;border-radius:18px;padding:6px 18px;margin-top:18px;box-shadow:0 8px 20px #10203b06}#gov-profile .settings-row{display:flex;align-items:center;gap:12px;width:100%;min-height:68px;padding:14px 0;text-align:left;border-bottom:1px solid #eef2f6}#gov-profile .settings-row:last-child{border-bottom:0}#gov-profile .settings-row>span{flex:1;display:grid;gap:4px}#gov-profile .settings-row b{font-size:13px}#gov-profile .settings-row small{font-size:11px;color:#71809a}#gov-profile .settings-row>svg{width:16px;color:#a5b0c0}#gov-profile .settings-icon{width:37px;height:37px;min-width:37px;border-radius:11px;display:grid;place-items:center;flex-shrink:0}#gov-profile .settings-icon.blue{background:#e8f1ff;color:#2563eb}#gov-profile .settings-icon.violet{background:#f0ebff;color:#7654d8}#gov-profile .settings-icon.red{background:#fff0ee;color:#df514c}#gov-profile .gov-profile-card{background:#fff;border:1px solid #e3eaf3;border-radius:18px;padding:26px;display:flex;align-items:center;gap:16px;margin-top:28px;box-shadow:0 8px 20px #10203b08}#gov-profile .gov-profile-avatar{width:70px;height:70px;min-width:70px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#dbeafe,#c7dcff);color:#2563eb;font-size:20px;font-weight:850}#gov-profile .gov-profile-card h2{font-size:20px;margin:0 0 5px}#gov-profile .gov-profile-card p,#gov-profile .gov-profile-card span{font-size:12px;color:#71809a;margin:0 0 5px;display:block}#gov-profile .modal-label{display:grid;gap:7px;font-size:11px;font-weight:750;margin:13px 0}#gov-profile .modal-label input{border:1px solid #e3eaf3;border-radius:8px;padding:10px}@media(max-width:700px){#gov-profile .gov-main{padding:24px 16px}#gov-profile .gov-profile-card{padding:20px;gap:13px}#gov-profile .gov-profile-avatar{width:56px;height:56px;min-width:56px;font-size:16px}#gov-profile .gov-profile-card h2{font-size:17px}#gov-profile .settings-card{padding:5px 12px}#gov-profile .settings-row{min-height:64px}}`}</style><header className="gov-top"><div className="brand brand-light" onClick={() => navigate('/gov/dashboard')}><div className="brand-mark"><ShieldCheck size={21} /></div><span>CivicLens <b>AI</b></span></div><span>Government portal</span><button className="avatar" onClick={() => navigate('/gov/profile')}>{initials}</button></header><main className="gov-main gov-profile-page"><button className="back-link" onClick={() => navigate('/gov/dashboard')}><ArrowLeft size={16} /> Back to dashboard</button><p className="eyebrow">ACCOUNT SETTINGS</p><h1>Official profile</h1><p className="muted">Manage your government account and security preferences.</p><div className="gov-profile-card"><div className="gov-profile-avatar">{initials}</div><div><h2>{profile.name}</h2><p>City Operations Department</p><span>{profile.email}</span></div></div><div className="settings-card"><button className="settings-row" onClick={() => setPasswordOpen(true)}><div className="settings-icon blue"><LockKeyhole size={17} /></div><span><b>Change password</b><small>Update your account password</small></span><ChevronRight /></button><button className="settings-row" onClick={() => setSaved(true)}><div className="settings-icon violet"><ShieldCheck size={17} /></div><span><b>Security preferences</b><small>Two-factor authentication and login alerts</small></span><ChevronRight /></button><button className="settings-row logout-row" onClick={logout}><div className="settings-icon red"><ArrowRight size={17} /></div><span><b>Log out</b><small>Sign out of this device</small></span><ChevronRight /></button></div>{(passwordOpen || saved) && <div className="modal-backdrop" onClick={() => { setPasswordOpen(false); setSaved(false) }}><div className="privacy-modal" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={() => { setPasswordOpen(false); setSaved(false) }}><X size={18} /></button><div className="settings-icon blue">{passwordOpen ? <LockKeyhole size={19} /> : <ShieldCheck size={19} />}</div><h2>{passwordOpen ? 'Change password' : 'Security preferences'}</h2>{passwordOpen ? <><label className="modal-label">Current password<input type="password" /></label><label className="modal-label">New password<input type="password" /></label><button className="primary-btn" onClick={() => { setPasswordOpen(false); setSaved(true) }}>Save password</button></> : <><p>Two-factor authentication and login alerts are enabled for this official account.</p><button className="primary-btn" onClick={() => setSaved(false)}>Done</button></>}</div></div>}</main></div>
}

function Profile() {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [avatar, setAvatar] = useState(() => localStorage.getItem('civic-avatar') || '')
  const [name, setName] = useState(() => getUserDisplayName({ email: localStorage.getItem('civic-email'), user_metadata: { full_name: localStorage.getItem('civic-name') } }))
  const email = localStorage.getItem('civic-email') || 'user@example.com'
  const [editing, setEditing] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const updateAvatar = event => {
    const file = event.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result)
      setAvatar(value)
      localStorage.setItem('civic-avatar', value)
      window.dispatchEvent(new Event('civic-avatar-updated'))
      supabase.from('profiles').update({ avatar_url: value }).eq('id', localStorage.getItem('civic-user-id')).then(({ error }) => {
        if (error) console.warn('Profile avatar sync failed:', error.message)
      })
    }
    reader.readAsDataURL(file)
  }
  const saveName = () => {
    const nextName = name.trim() || 'Civic User'
    localStorage.setItem('civic-name', nextName)
    window.dispatchEvent(new Event('civic-name-updated'))
    setName(nextName)
    setEditing(false)
  }
  const logout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.warn('Citizen logout failed:', error.message)
    }
    localStorage.removeItem('civic-role')
    localStorage.removeItem('civic-name')
    localStorage.removeItem('civic-email')
    navigate('/')
  }
  return <Layout><section className="page-wrap profile-page"><style>{`.profile-page{max-width:720px}.profile-hero{text-align:center;padding:27px 20px}.profile-avatar-wrap{position:relative;width:88px;margin:0 auto 13px}.profile-avatar{width:88px;height:88px;border-radius:50%;background:#dbeafe;color:#2563eb;display:grid;place-items:center;font-size:25px;font-weight:800;overflow:hidden;border:4px solid #fff;box-shadow:0 2px 0 1px #dbe5f1}.profile-avatar img{width:100%;height:100%;object-fit:cover}.avatar-edit{position:absolute;right:-3px;bottom:0;width:29px;height:29px;border-radius:50%;background:#2563eb;color:#fff;display:grid;place-items:center;border:3px solid #fff}.profile-hero h2{font-size:20px;margin:0 0 4px}.profile-hero .text-btn{margin-top:8px;display:inline-flex;align-items:center;gap:5px}.profile-edit{display:flex;max-width:320px;margin:auto;gap:8px}.profile-edit input{min-width:0;flex:1;border:1px solid #e3eaf3;border-radius:9px;padding:10px;font-size:13px}.settings-card{background:#fff;border:1px solid #e3eaf3;border-radius:16px;padding:6px 16px;margin-top:18px}.settings-row{display:flex;align-items:center;gap:12px;width:100%;padding:14px 0;text-align:left;border-bottom:1px solid #eef2f6}.settings-row:last-child{border-bottom:0}.settings-row>span{flex:1;display:grid;gap:4px}.settings-row b{font-size:13px}.settings-row small{font-size:11px;color:#71809a}.settings-row>svg{width:16px;color:#a5b0c0}.settings-icon{width:37px;height:37px;border-radius:11px;display:grid;place-items:center;flex-shrink:0}.settings-icon.red{background:#fff0ee;color:#df514c}.logout-row b{color:#df514c}.modal-backdrop{position:fixed;inset:0;background:#10203b66;z-index:50;display:grid;place-items:center;padding:20px}.privacy-modal{background:#fff;border-radius:18px;padding:26px;max-width:390px;width:100%;position:relative;box-shadow:0 20px 50px #10203b33}.privacy-modal h2{font-size:21px;margin:16px 0 10px}.privacy-modal p{font-size:12px;color:#63728a;line-height:1.65}.privacy-modal .primary-btn{width:100%;margin-top:8px}.modal-close{position:absolute;right:15px;top:15px;color:#78879b}`}</style><div className="page-title"><div><p className="eyebrow">ACCOUNT</p><h1>Profile</h1></div><button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit profile"><Pencil size={17} /></button></div><div className="profile-card profile-hero"><div className="profile-avatar-wrap"><div className="profile-avatar">{avatar ? <img src={avatar} alt="Profile" /> : <span>{name.split(' ').map(part => part[0]).join('').slice(0, 2)}</span>}</div><button className="avatar-edit" onClick={() => inputRef.current?.click()} aria-label="Change profile image"><Camera size={14} /></button><input ref={inputRef} type="file" accept="image/*" onChange={updateAvatar} hidden /></div>{editing ? <div className="profile-edit"><input value={name} onChange={event => setName(event.target.value)} aria-label="Full name" /><button className="primary-btn compact" onClick={saveName}>Save</button></div> : <><h2>{name}</h2><p className="muted">{email}</p><button className="text-btn" onClick={() => setEditing(true)}><Pencil size={13} /> Edit profile</button></>}</div><div className="settings-card"><button className="settings-row" onClick={() => setEditing(true)}><div className="settings-icon blue"><UserRound size={17} /></div><span><b>Personal information</b><small>Update your name and account details</small></span><ChevronRight /></button><button className="settings-row" onClick={() => setPrivacyOpen(true)}><div className="settings-icon violet"><LockKeyhole size={17} /></div><span><b>Privacy policy</b><small>Learn how CivicLens protects your data</small></span><ChevronRight /></button><button className="settings-row logout-row" onClick={logout}><div className="settings-icon red"><ArrowRight size={17} /></div><span><b>Log out</b><small>Sign out of this device</small></span><ChevronRight /></button></div>{privacyOpen && <div className="modal-backdrop" onClick={() => setPrivacyOpen(false)}><div className="privacy-modal" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={() => setPrivacyOpen(false)}><X size={18} /></button><div className="settings-icon violet"><LockKeyhole size={19} /></div><h2>Privacy policy</h2><p>We only use your account, location, and report data to improve civic services and route issues to the right government team.</p><p>Your information is stored securely and is never sold. You can request account deletion by contacting support.</p><button className="primary-btn" onClick={() => setPrivacyOpen(false)}>Got it</button></div></div>}</section></Layout>
}

function AppRoutes() { return <Routes><Route path="/" element={<RolePage />} /><Route path="/citizen/login" element={<LoginPage />} /><Route path="/citizen/dashboard" element={<RoleGuard allowedRole="citizen"><Dashboard /></RoleGuard>} /><Route path="/gov/login" element={<LoginPage government />} /><Route path="/gov/dashboard" element={<RoleGuard allowedRole="government"><GovDashboard /></RoleGuard>} /><Route path="/gov/profile" element={<RoleGuard allowedRole="government"><GovProfile /></RoleGuard>} /><Route path="/signup" element={<AuthActionPage mode="signup" />} /><Route path="/forgot-password" element={<AuthActionPage mode="forgot" />} /><Route path="/report" element={<RoleGuard allowedRole="citizen"><ReportWizard /></RoleGuard>} /><Route path="/complaints" element={<RoleGuard allowedRole="citizen"><Complaints /></RoleGuard>} /><Route path="/complaints/:id" element={<RoleGuard allowedRole="citizen"><DetailRoute /></RoleGuard>} /><Route path="/map" element={<RoleGuard allowedRole="citizen"><MapPage /></RoleGuard>} /><Route path="/notifications" element={<RoleGuard allowedRole="citizen"><Notifications /></RoleGuard>} /><Route path="/profile" element={<RoleGuard allowedRole="citizen"><Profile /></RoleGuard>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes> }

function Notifications() {
  const navigate = useNavigate()
  const [complaints, setComplaints] = useState([])
  useEffect(() => { fetchMyComplaints().then(setComplaints) }, [])
  const updates = complaints.filter(item => item.status === 'Rejected' || item.status === 'Resolved' || item.status === 'Assigned' || item.status === 'In Progress')
  return <Layout><section className="page-wrap"><button className="back-link" onClick={() => navigate('/citizen/dashboard')}><ArrowLeft size={16} /> Back to home</button><div className="page-title"><div><p className="eyebrow">STAY UPDATED</p><h1>Notifications</h1><p className="muted">Updates about your reports and nearby issues.</p></div><button className="text-btn">Mark all read</button></div><div className="notification-list">{updates.length ? updates.map(item => <div className="notification-card unread" key={item.id}><div className={`notification-icon ${item.status === 'Rejected' ? 'violet' : 'green'}`}>{item.status === 'Rejected' ? <X size={17} /> : <CheckCircle2 size={17} />}</div><div><b>{item.type} report {item.status.toLowerCase()}</b><span>{item.rejectionReason || `Your report ${item.id} was updated to ${item.status}.`}</span><small>{item.date}</small></div></div>) : <div className="detail-card"><p className="muted">No report updates yet.</p></div>}</div></section></Layout>
}
function DetailRoute() { const location = useLocation(); return <Detail id={location.pathname.split('/').pop()} /> }
export default function App() { return <BrowserRouter><AppRoutes /></BrowserRouter> }
