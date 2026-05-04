import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const PAGE_SIZE = 20
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '')
const CHART_WIDTH = 760
const CHART_HEIGHT = 220
const CHART_PADDING = { top: 16, right: 22, bottom: 40, left: 46 }
const HOVER_ACTIVATION_RADIUS = 18

const models = {
  claude: { name: 'Claude' },
  gpt: { name: 'ChatGPT' },
  gemini: { name: 'Gemini' },
}

const emptyPromptBatches = []

const defaultResultByModel = {
  claude: { rank: null, mentioned: false, lastQueried: '--' },
  gpt: { rank: null, mentioned: false, lastQueried: '--' },
  gemini: { rank: null, mentioned: false, lastQueried: '--' },
}

const backendModelToUiModel = {
  chatgpt: 'gpt',
  claude: 'claude',
  gemini: 'gemini',
}

const uiModelToBackendModel = {
  gpt: 'chatgpt',
  claude: 'claude',
  gemini: 'gemini',
}

const formatTimestamp = (timestamp) => {
  if (!timestamp) {
    return '--'
  }

  const source = new Date(timestamp)
  if (Number.isNaN(source.getTime())) {
    return String(timestamp)
  }

  const diffMs = Date.now() - source.getTime()
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000))
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

const formatDayLabel = (timestamp, fallbackIndex) => {
  if (!timestamp) {
    return `Day ${fallbackIndex + 1}`
  }

  const source = new Date(timestamp)
  if (Number.isNaN(source.getTime())) {
    return `Day ${fallbackIndex + 1}`
  }

  return source.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const buildDailySeries = (queries, resolveAppearanceCount) => {
  const byDay = new Map()

  queries.forEach((query) => {
    const source = new Date(query.timestamp)
    if (Number.isNaN(source.getTime())) {
      return
    }

    const dayKey = source.toISOString().slice(0, 10)
    const count = resolveAppearanceCount(query)
    byDay.set(dayKey, (byDay.get(dayKey) || 0) + count)
  })

  return [...byDay.entries()]
    .sort(([dayA], [dayB]) => dayA.localeCompare(dayB))
    .slice(-12)
    .map(([dayKey, value], index) => ({
      day: formatDayLabel(dayKey, index),
      value,
    }))
}

const getYAxisTicks = (maxValue) => {
  const safeMax = Math.max(1, maxValue)
  const step = Math.max(1, Math.ceil(safeMax / 4))
  const ticks = [0]

  for (let value = step; value < safeMax; value += step) {
    ticks.push(value)
  }

  if (ticks[ticks.length - 1] !== safeMax) {
    ticks.push(safeMax)
  }

  return ticks
}

const getChartPoints = (values, width, height, padding, maxValue) => {
  if (!values.length) {
    return []
  }

  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const safeMax = Math.max(1, maxValue)

  return values.map((value, index) => {
    const x = values.length > 1
      ? padding.left + (index * plotWidth) / (values.length - 1)
      : padding.left + plotWidth / 2
    const y = padding.top + ((safeMax - value) / safeMax) * plotHeight
    return { x, y, value, index }
  })
}

const buildSmoothLinePath = (points) => {
  if (!points.length) {
    return ''
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`
  }

  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]
    const current = points[index]
    const controlX = (prev.x + current.x) / 2
    path += ` Q ${controlX} ${prev.y}, ${current.x} ${current.y}`
  }

  return path
}

const buildAreaPath = (points, baselineY) => {
  if (!points.length) {
    return ''
  }

  const linePath = buildSmoothLinePath(points)
  if (!linePath) {
    return ''
  }

  const firstPoint = points[0]
  const lastPoint = points[points.length - 1]
  return `${linePath} L ${lastPoint.x} ${baselineY} L ${firstPoint.x} ${baselineY} Z`
}

const normalizePromptQuery = (query) => {
  const providerModels = Array.isArray(query?.models)
    ? query.models
    : Array.isArray(query?.results)
      ? query.results.map((result) => result.model).filter(Boolean)
      : []

  const normalizedResults = {
    ...defaultResultByModel,
    claude: { ...defaultResultByModel.claude },
    gpt: { ...defaultResultByModel.gpt },
    gemini: { ...defaultResultByModel.gemini },
  }

  if (Array.isArray(query?.results)) {
    query.results.forEach((result) => {
      const mappedKey = backendModelToUiModel[result.model]
      if (!mappedKey) {
        return
      }

      normalizedResults[mappedKey] = {
        rank: typeof result.rank === 'number' ? result.rank : null,
        mentioned: Boolean(result.mentioned),
        lastQueried: query.timestamp,
      }
    })
  }

  return {
    id: query.id,
    text: query.text,
    timestamp: query.timestamp,
    providerModels,
    results: normalizedResults,
  }
}

const SUPABASE_AUTH_REDIRECT_PARAMS = [
  'access_token',
  'error',
  'error_description',
  'expires_at',
  'expires_in',
  'provider_refresh_token',
  'provider_token',
  'refresh_token',
  'sb',
  'state',
  'token_type',
]

const getSupabaseAuthRedirectPayload = () => {
  const getPayload = (params) => ({
    accessToken: params.get('access_token') || '',
    error: params.get('error_description') || params.get('error') || '',
  })

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const hashPayload = getPayload(hashParams)
  if (hashPayload.accessToken || hashPayload.error) {
    return hashPayload
  }

  const queryParams = new URLSearchParams(window.location.search)
  const queryPayload = getPayload(queryParams)
  if (queryPayload.accessToken || queryPayload.error) {
    return queryPayload
  }

  return { accessToken: '', error: '' }
}

const clearSupabaseAuthRedirectPayload = () => {
  const queryParams = new URLSearchParams(window.location.search)
  const hadHash = Boolean(window.location.hash)
  let removedQueryParam = false

  SUPABASE_AUTH_REDIRECT_PARAMS.forEach((param) => {
    if (queryParams.has(param)) {
      queryParams.delete(param)
      removedQueryParam = true
    }
  })

  if (!hadHash && !removedQueryParam) {
    return
  }

  const query = queryParams.toString()
  window.history.replaceState(null, document.title, `${window.location.pathname}${query ? `?${query}` : ''}`)
}

function App() {
  const [authStatus, setAuthStatus] = useState('checking')
  const [authUser, setAuthUser] = useState(null)
  const [authError, setAuthError] = useState('')
  const [authConfig, setAuthConfig] = useState({
    authMethod: 'azure_oauth',
    azureConfigured: false,
    emailConfigured: false,
    supabaseConfigured: false,
    domainConfigured: true,
  })
  const [loginEmail, setLoginEmail] = useState('')
  const [loginCode, setLoginCode] = useState('')
  const [loginCodeSent, setLoginCodeSent] = useState(false)
  const [developmentCode, setDevelopmentCode] = useState('')
  const [selectedModel, setSelectedModel] = useState('claude')
  const [isBrandLogoBroken, setIsBrandLogoBroken] = useState(false)
  const [progressTab, setProgressTab] = useState('provider')
  const [promptBatches, setPromptBatches] = useState(emptyPromptBatches)
  const [selectedPromptId, setSelectedPromptId] = useState(null)
  const [overallSummary, setOverallSummary] = useState(null)
  const [overallLoadError, setOverallLoadError] = useState('')
  const [nextOffset, setNextOffset] = useState(0)
  const [hasMoreQueries, setHasMoreQueries] = useState(true)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [queryLoadError, setQueryLoadError] = useState('')
  const pastQueriesRef = useRef(null)

  const selectedBackendModel = uiModelToBackendModel[selectedModel]
  const providerPromptBatches = useMemo(
    () => promptBatches.filter((prompt) => prompt.providerModels.includes(selectedBackendModel)),
    [promptBatches, selectedBackendModel],
  )
  const selectedPromptFromProvider = providerPromptBatches.find((prompt) => prompt.id === selectedPromptId)
    ?? providerPromptBatches[0]
    ?? null
  const selectedModelSummary = overallSummary?.models?.find((item) => item.model === selectedBackendModel)
  const result = selectedPromptFromProvider?.results?.[selectedModel] ?? defaultResultByModel[selectedModel]
  const hasRank = result.rank !== null
  const selectedPromptTime = selectedPromptFromProvider?.timestamp
    ? formatTimestamp(selectedPromptFromProvider.timestamp)
    : '--'
  const mostRecentPrompt = providerPromptBatches[0] ?? null
  const pastPrompts = useMemo(() => providerPromptBatches.slice(1), [providerPromptBatches])
  const providerTrendData = useMemo(() => {
    return buildDailySeries(providerPromptBatches, (query) => {
      const providerResult = query.results?.[selectedModel]
      return providerResult?.mentioned ? 1 : 0
    })
  }, [providerPromptBatches, selectedModel])
  const allTrendData = useMemo(() => {
    return buildDailySeries(promptBatches, (query) => {
      return query.providerModels
        .map((providerModel) => {
          const uiModel = backendModelToUiModel[providerModel]
          if (!uiModel) {
            return 0
          }
          return query.results?.[uiModel]?.mentioned ? 1 : 0
        })
        .reduce((sum, value) => sum + value, 0)
    })
  }, [promptBatches])

  const providerValues = useMemo(() => providerTrendData.map((point) => point.value), [providerTrendData])
  const allValues = useMemo(() => allTrendData.map((point) => point.value), [allTrendData])
  const providerMaxValue = useMemo(() => Math.max(1, ...providerValues, 0), [providerValues])
  const allMaxValue = useMemo(() => Math.max(1, ...allValues, 0), [allValues])
  const providerYTicks = useMemo(() => getYAxisTicks(providerMaxValue), [providerMaxValue])
  const allYTicks = useMemo(() => getYAxisTicks(allMaxValue), [allMaxValue])
  const providerPoints = useMemo(
    () => getChartPoints(providerValues, CHART_WIDTH, CHART_HEIGHT, CHART_PADDING, providerMaxValue),
    [providerValues, providerMaxValue],
  )
  const allPoints = useMemo(
    () => getChartPoints(allValues, CHART_WIDTH, CHART_HEIGHT, CHART_PADDING, allMaxValue),
    [allValues, allMaxValue],
  )
  const chartLinePath = useMemo(
    () => buildSmoothLinePath(providerPoints),
    [providerPoints],
  )
  const providerAreaPath = useMemo(
    () => buildAreaPath(providerPoints, CHART_HEIGHT - CHART_PADDING.bottom),
    [providerPoints],
  )
  const allChartLinePath = useMemo(
    () => buildSmoothLinePath(allPoints),
    [allPoints],
  )
  const allAreaPath = useMemo(
    () => buildAreaPath(allPoints, CHART_HEIGHT - CHART_PADDING.bottom),
    [allPoints],
  )
  const [providerHoverIndex, setProviderHoverIndex] = useState(null)
  const [allHoverIndex, setAllHoverIndex] = useState(null)

  const providerActiveIndex = providerHoverIndex ?? (providerPoints.length ? providerPoints.length - 1 : null)
  const allActiveIndex = allHoverIndex ?? (allPoints.length ? allPoints.length - 1 : null)
  const providerActivePoint = providerActiveIndex !== null ? providerPoints[providerActiveIndex] : null
  const allActivePoint = allActiveIndex !== null ? allPoints[allActiveIndex] : null
  const providerHoverPoint = providerHoverIndex !== null ? providerPoints[providerHoverIndex] : null
  const allHoverPoint = allHoverIndex !== null ? allPoints[allHoverIndex] : null
  const isAzureOAuthAuth = authConfig.authMethod === 'azure_oauth'
  const isSupabaseMagicLinkAuth = authConfig.authMethod === 'supabase_magic_link'
  const allProviderStats = useMemo(() => {
    const modelsSummary = overallSummary?.models || []
    if (!modelsSummary.length) {
      return {
        overallRanking: null,
        visibilityRating: null,
        totalModelScans: 0,
      }
    }

    const rankedProviders = modelsSummary.filter((item) => typeof item.averageRank === 'number')
    const overallRanking = rankedProviders.length
      ? rankedProviders.reduce((sum, item) => sum + item.averageRank, 0) / rankedProviders.length
      : null

    const totalScans = modelsSummary.reduce((sum, item) => sum + item.totalScans, 0)
    const weightedVisibility = totalScans
      ? modelsSummary.reduce((sum, item) => sum + item.mentionRate * item.totalScans, 0) / totalScans
      : null

    return {
      overallRanking,
      visibilityRating: weightedVisibility,
      totalModelScans: totalScans,
    }
  }, [overallSummary])
  const chartScanCount = progressTab === 'provider'
    ? selectedModelSummary?.totalScans ?? 0
    : allProviderStats.totalModelScans
  const chartSummaryLabel = chartScanCount
    ? `${chartScanCount} recent scan${chartScanCount === 1 ? '' : 's'}`
    : 'No data yet'

  const updateHoverIndex = useCallback((event, points, setHover) => {
    if (!points.length) {
      setHover(null)
      return
    }

    const bounds = event.currentTarget.getBoundingClientRect()
    const localX = ((event.clientX - bounds.left) / bounds.width) * CHART_WIDTH
    const localY = ((event.clientY - bounds.top) / bounds.height) * CHART_HEIGHT

    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY

    points.forEach((point, index) => {
      const distanceX = point.x - localX
      const distanceY = point.y - localY
      const distance = Math.hypot(distanceX, distanceY)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })

    if (nearestDistance <= HOVER_ACTIVATION_RADIUS) {
      setHover(nearestIndex)
      return
    }

    setHover(null)
  }, [])

  const resetDashboardState = useCallback(() => {
    setPromptBatches([])
    setSelectedPromptId(null)
    setOverallSummary(null)
    setOverallLoadError('')
    setNextOffset(0)
    setHasMoreQueries(true)
    setIsInitialLoading(true)
    setIsLoadingMore(false)
    setQueryLoadError('')
  }, [])

  const loadSession = useCallback(async () => {
    setAuthError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Unauthenticated')
      }

      const payload = await response.json()
      setAuthUser(payload.user ?? null)
      setAuthStatus('authenticated')
    } catch {
      setAuthUser(null)
      setAuthStatus('unauthenticated')
      resetDashboardState()
    }
  }, [resetDashboardState])

  const handleSupabaseAuthSession = useCallback(async (accessToken) => {
    setAuthStatus('checking')
    setAuthError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/supabase/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ accessToken }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Sign-in failed')
      }

      const payload = await response.json()
      setAuthUser(payload.user ?? null)
      setAuthStatus('authenticated')
      setLoginCodeSent(false)
      setLoginEmail('')
    } catch (error) {
      setAuthStatus('unauthenticated')
      setAuthUser(null)
      setAuthError(error instanceof Error ? error.message : 'Sign-in failed.')
      resetDashboardState()
    }
  }, [resetDashboardState])

  const handleAzureSignIn = useCallback(() => {
    setAuthError('')
    window.location.assign(`${API_BASE_URL}/api/auth/azure/start`)
  }, [])

  const handleRequestMagicLink = useCallback(async (event) => {
    event.preventDefault()
    setAuthError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/supabase/request-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email: loginEmail.trim() }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Unable to send magic link')
      }

      setLoginCodeSent(true)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to send magic link.')
    }
  }, [loginEmail])

  const handleRequestEmailCode = useCallback(async (event) => {
    event.preventDefault()
    setAuthError('')
    setDevelopmentCode('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/email/request-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email: loginEmail.trim() }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Unable to send access code')
      }

      const payload = await response.json()
      setLoginCodeSent(true)
      setDevelopmentCode(payload.developmentCode || '')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to send access code.')
    }
  }, [loginEmail])

  const handleVerifyEmailCode = useCallback(async (event) => {
    event.preventDefault()
    setAuthError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/email/verify-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: loginEmail.trim(),
          code: loginCode.trim(),
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Invalid access code')
      }

      setLoginCode('')
      setDevelopmentCode('')
      await loadSession()
    } catch (error) {
      setAuthStatus('unauthenticated')
      setAuthUser(null)
      setAuthError(error instanceof Error ? error.message : 'Invalid access code.')
    }
  }, [loadSession, loginCode, loginEmail])

  const handleLogout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } finally {
      setAuthStatus('unauthenticated')
      setAuthUser(null)
      resetDashboardState()
    }
  }, [resetDashboardState])

  const loadQueries = useCallback(async (offset) => {
    if (offset === 0) {
      setIsInitialLoading(true)
    } else {
      setIsLoadingMore(true)
    }

    setQueryLoadError('')

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/models/recent-queries?limit=${PAGE_SIZE}&offset=${offset}`,
        { credentials: 'include' },
      )

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`)
      }

      const payload = await response.json()
      const incomingQueries = Array.isArray(payload.recentQueries)
        ? payload.recentQueries.map(normalizePromptQuery)
        : []

      if (offset === 0) {
        const initialQueries = incomingQueries
        setPromptBatches(initialQueries)
        setSelectedPromptId(initialQueries[0]?.id ?? null)
      } else {
        setPromptBatches((current) => [...current, ...incomingQueries])
      }

      setNextOffset(offset + incomingQueries.length)
      setHasMoreQueries(Boolean(payload.hasMore) && incomingQueries.length > 0)
    } catch {
      if (offset === 0) {
        setPromptBatches([])
        setSelectedPromptId(null)
        setHasMoreQueries(false)
      }
      setQueryLoadError('Unable to load more prompt queries right now.')
    } finally {
      setIsInitialLoading(false)
      setIsLoadingMore(false)
    }
  }, [])

  const loadOverallSummary = useCallback(async () => {
    setOverallLoadError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/models/overall-summary`, {
        credentials: 'include',
      })
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`)
      }

      const payload = await response.json()
      setOverallSummary(payload)
    } catch {
      setOverallSummary(null)
      setOverallLoadError('Unable to load overall progress right now.')
    }
  }, [])

  useEffect(() => {
    const { accessToken, error } = getSupabaseAuthRedirectPayload()

    if (accessToken || error) {
      window.setTimeout(clearSupabaseAuthRedirectPayload, 0)
    }

    if (error) {
      setAuthError(error)
      setAuthStatus('unauthenticated')
      return
    }

    if (accessToken) {
      handleSupabaseAuthSession(accessToken)
      return
    }

    loadSession()
  }, [handleSupabaseAuthSession, loadSession])

  useEffect(() => {
    if (authStatus !== 'unauthenticated') {
      return undefined
    }

    let isActive = true

    const loadAuthConfig = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/config`, {
          credentials: 'include',
        })
        if (!response.ok) {
          throw new Error('Unable to load access settings')
        }
        const payload = await response.json()
        if (isActive) {
          setAuthConfig({
            authMethod: ['azure_oauth', 'email_code', 'supabase_magic_link'].includes(payload.authMethod)
              ? payload.authMethod
              : 'azure_oauth',
            azureConfigured: Boolean(payload.azureConfigured),
            emailConfigured: Boolean(payload.emailConfigured),
            supabaseConfigured: Boolean(payload.supabaseConfigured),
            domainConfigured: Boolean(payload.domainConfigured ?? payload.whitelistConfigured),
          })
        }
      } catch {
        if (isActive) {
          setAuthConfig({
            authMethod: 'azure_oauth',
            azureConfigured: false,
            emailConfigured: false,
            supabaseConfigured: false,
            domainConfigured: false,
          })
        }
      }
    }

    loadAuthConfig()

    return () => {
      isActive = false
    }
  }, [authStatus])

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      return
    }

    loadQueries(0)
    loadOverallSummary()
  }, [authStatus, loadOverallSummary, loadQueries])

  useEffect(() => {
    if (!providerPromptBatches.length) {
      setSelectedPromptId(null)
      return
    }

    const hasSelectedInProvider = providerPromptBatches.some((prompt) => prompt.id === selectedPromptId)
    if (!hasSelectedInProvider) {
      setSelectedPromptId(providerPromptBatches[0].id)
    }
  }, [providerPromptBatches, selectedPromptId])

  useEffect(() => {
    const pastQueriesNode = pastQueriesRef.current
    if (!pastQueriesNode) {
      return
    }

    const handleScroll = () => {
      if (!hasMoreQueries || isLoadingMore || isInitialLoading) {
        return
      }

      const reachedBottom =
        pastQueriesNode.scrollTop + pastQueriesNode.clientHeight >= pastQueriesNode.scrollHeight - 24

      if (reachedBottom) {
        loadQueries(nextOffset)
      }
    }

    pastQueriesNode.addEventListener('scroll', handleScroll)
    return () => {
      pastQueriesNode.removeEventListener('scroll', handleScroll)
    }
  }, [hasMoreQueries, isInitialLoading, isLoadingMore, loadQueries, nextOffset])

  if (authStatus === 'checking') {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <p className="auth-eyebrow">Ark Marketing Dashboard</p>
          <h1>Checking access...</h1>
          <p>Verifying your session before loading the dashboard.</p>
        </section>
      </div>
    )
  }

  if (authStatus !== 'authenticated') {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <p className="auth-eyebrow">Secure Access</p>
          {isAzureOAuthAuth ? (
            <>
              <h1>Sign in with Microsoft</h1>
              <p>Use your Ark Marketing Microsoft account to access this dashboard.</p>
              <div className="auth-actions">
                <button
                  type="button"
                  className="auth-submit-button"
                  onClick={handleAzureSignIn}
                  disabled={!authConfig.domainConfigured || !authConfig.azureConfigured}
                >
                  Sign in with Microsoft
                </button>
              </div>
              {!authConfig.azureConfigured && (
                <p className="auth-error">Microsoft sign-in is not configured yet.</p>
              )}
            </>
          ) : isSupabaseMagicLinkAuth ? (
            <>
              <h1>Email magic link</h1>
              <p>Use an approved company email and open the secure sign-in link sent to that inbox.</p>
              <form className="auth-form" onSubmit={handleRequestMagicLink}>
                <label className="auth-field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(event) => {
                      setLoginEmail(event.target.value)
                      setLoginCodeSent(false)
                    }}
                    autoComplete="email"
                    placeholder="name@company.com"
                    disabled={!authConfig.domainConfigured || !authConfig.emailConfigured || loginCodeSent}
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="auth-submit-button"
                  disabled={!authConfig.domainConfigured || !authConfig.emailConfigured || loginCodeSent}
                >
                  {loginCodeSent ? 'Magic link sent' : 'Send magic link'}
                </button>
                {loginCodeSent && (
                  <button
                    type="button"
                    className="auth-secondary-button"
                    onClick={() => {
                      setLoginCodeSent(false)
                      setLoginEmail('')
                    }}
                  >
                    Use a different email
                  </button>
                )}
              </form>
              {loginCodeSent && (
                <p className="auth-success">Check your inbox for the sign-in link. It may take a minute to arrive.</p>
              )}
              {!authConfig.emailConfigured && (
                <p className="auth-error">Supabase Auth is not configured yet.</p>
              )}
            </>
          ) : authConfig.authMethod === 'email_code' ? (
            <>
              <h1>Email access code</h1>
              <p>Use your company email and the one-time code sent to that inbox.</p>
              <form className="auth-form" onSubmit={loginCodeSent ? handleVerifyEmailCode : handleRequestEmailCode}>
                <label className="auth-field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                    autoComplete="email"
                    placeholder="name@company.com"
                    disabled={!authConfig.domainConfigured || !authConfig.emailConfigured || loginCodeSent}
                    required
                  />
                </label>
                {loginCodeSent && (
                  <label className="auth-field">
                    <span>Access code</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={loginCode}
                      onChange={(event) => setLoginCode(event.target.value)}
                      autoComplete="one-time-code"
                      placeholder="123456"
                      required
                    />
                  </label>
                )}
                <button
                  type="submit"
                  className="auth-submit-button"
                  disabled={!authConfig.domainConfigured || !authConfig.emailConfigured}
                >
                  {loginCodeSent ? 'Verify code' : 'Send access code'}
                </button>
                {loginCodeSent && (
                  <button
                    type="button"
                    className="auth-secondary-button"
                    onClick={() => {
                      setLoginCodeSent(false)
                      setLoginCode('')
                      setDevelopmentCode('')
                    }}
                  >
                    Use a different email
                  </button>
                )}
              </form>
              {developmentCode && <p className="auth-dev-code">Development code: {developmentCode}</p>}
              {!authConfig.emailConfigured && (
                <p className="auth-error">Email delivery is not configured yet.</p>
              )}
            </>
          ) : (
            <>
              <h1>Access unavailable</h1>
              <p>Dashboard sign-in is not configured for this deployment.</p>
            </>
          )}
          {!authConfig.domainConfigured && (
            <p className="auth-error">Dashboard company email domain is not configured yet.</p>
          )}
          {authError && <p className="auth-error">{authError}</p>}
        </section>
      </div>
    )
  }

  return (
    <div className="dashboard-shell">
      <div className="workspace-frame">
        <aside className="left-rail">
          <div className="brand-block">
            <div className="brand-chip" role="img" aria-label="Ark Marketing">
              <img
                className={isBrandLogoBroken ? 'brand-logo hidden' : 'brand-logo'}
                src="/Ark-Marketing-Logo-Color-Registered-Trademark.webp"
                alt="Ark Marketing"
                onError={() => setIsBrandLogoBroken(true)}
              />
              <span className={isBrandLogoBroken ? 'brand-fallback visible' : 'brand-fallback'}>mArketing</span>
            </div>
          </div>
          <nav className="side-nav" aria-label="Dashboard navigation">
            <p className="side-group-label">Overall progress</p>
            <button
              type="button"
              className={progressTab === 'all' ? 'side-item active' : 'side-item'}
              onClick={() => setProgressTab('all')}
            >
              Overview
            </button>
            <p className="side-group-label">Providers</p>
            {Object.entries(models).map(([key, model]) => (
              <button
                key={key}
                type="button"
                className={progressTab === 'provider' && selectedModel === key ? 'side-item active' : 'side-item'}
                onClick={() => {
                  setSelectedModel(key)
                  setProgressTab('provider')
                }}
              >
                {model.name}
              </button>
            ))}
          </nav>
        </aside>

        <main className="dashboard-content">
          <header className="content-head">
            <div>
              <h1>Hello, Ark Marketing</h1>
              <p>Track prompt visibility, rankings, and trend movement across LLM providers.</p>
            </div>
            <div className="head-controls">
              <div className="account-chip">
                <span>{authUser?.name || 'Authorized user'}</span>
                <small>{authUser?.email || 'Company email access'}</small>
              </div>
              <button type="button" className="signout-button" onClick={handleLogout}>
                Sign out
              </button>
              <div className="date-chip">
                {new Date().toLocaleDateString(undefined, {
                  month: 'short',
                  day: '2-digit',
                  year: 'numeric',
                })}
              </div>
            </div>
          </header>

          <section className="chart-card">
            <div className="card-head">
              <h3>Overall progress visualization</h3>
              <span>{chartSummaryLabel}</span>
            </div>
            {progressTab === 'provider' ? (
              <>
                <div className="chart-wrap">
                  {providerTrendData.length >= 1 ? (
                    <svg
                      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                      preserveAspectRatio="xMidYMid meet"
                      role="img"
                      aria-label="Visibility trend chart"
                      onMouseMove={(event) => updateHoverIndex(event, providerPoints, setProviderHoverIndex)}
                      onMouseLeave={() => setProviderHoverIndex(null)}
                    >
                      <defs>
                        <linearGradient id="providerAreaFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#49a893" stopOpacity="0.32" />
                          <stop offset="100%" stopColor="#49a893" stopOpacity="0.03" />
                        </linearGradient>
                      </defs>

                      <line className="axis" x1={CHART_PADDING.left} y1={CHART_PADDING.top} x2={CHART_PADDING.left} y2={CHART_HEIGHT - CHART_PADDING.bottom} />
                      <line className="axis" x1={CHART_PADDING.left} y1={CHART_HEIGHT - CHART_PADDING.bottom} x2={CHART_WIDTH - CHART_PADDING.right} y2={CHART_HEIGHT - CHART_PADDING.bottom} />

                      {providerYTicks.map((tick) => {
                        const tickY = CHART_PADDING.top + ((providerMaxValue - tick) / providerMaxValue) * (CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom)
                        return (
                          <g key={tick}>
                            <line className="axis-grid" x1={CHART_PADDING.left} y1={tickY} x2={CHART_WIDTH - CHART_PADDING.right} y2={tickY} />
                            <text className="axis-text" x={CHART_PADDING.left - 10} y={tickY + 4} textAnchor="end">{tick}</text>
                          </g>
                        )
                      })}

                      {providerPoints.map((point, index) => (
                        <line
                          key={`provider-grid-x-${providerTrendData[index]?.day ?? index}`}
                          className="axis-grid vertical"
                          x1={point.x}
                          y1={CHART_PADDING.top}
                          x2={point.x}
                          y2={CHART_HEIGHT - CHART_PADDING.bottom}
                        />
                      ))}

                      {providerAreaPath ? <path className="area" d={providerAreaPath} fill="url(#providerAreaFill)" /> : null}

                      {providerPoints.length > 1 ? <path className="line" d={chartLinePath} /> : null}

                      {providerPoints.map((point, index) => (
                        <circle
                          key={`provider-point-${providerTrendData[index]?.day ?? index}`}
                          className={providerActiveIndex === index ? 'point-dot active' : 'point-dot'}
                          cx={point.x}
                          cy={point.y}
                          r={providerActiveIndex === index ? '6.5' : '4'}
                        />
                      ))}

                      {providerActivePoint && <circle className="hover-ring" cx={providerActivePoint.x} cy={providerActivePoint.y} r="13" />}

                      {providerPoints.map((point, index) => (
                        <text
                          key={`provider-label-${providerTrendData[index]?.day ?? index}`}
                          className="axis-label"
                          x={point.x}
                          y={CHART_HEIGHT - CHART_PADDING.bottom + 18}
                          textAnchor="middle"
                        >
                          {providerTrendData[index]?.day}
                        </text>
                      ))}

                      {providerHoverPoint && (
                        <>
                          <line
                            className="hover-guide"
                            x1={providerHoverPoint.x}
                            y1={providerHoverPoint.y}
                            x2={providerHoverPoint.x}
                            y2={CHART_HEIGHT - CHART_PADDING.bottom}
                          />
                          <g transform={`translate(${Math.max(CHART_PADDING.left + 8, Math.min(providerHoverPoint.x - 72, CHART_WIDTH - CHART_PADDING.right - 148))}, ${Math.max(CHART_PADDING.top + 4, providerHoverPoint.y - 96)})`}>
                            <rect className="chart-tooltip" width="148" height="66" rx="10" />
                            <polygon className="chart-tooltip-pointer" points="70,66 78,66 74,74" />
                            <text className="chart-tooltip-text" x="12" y="22">{providerTrendData[providerHoverIndex]?.day}</text>
                            <text className="chart-tooltip-text strong" x="12" y="48">
                              {Math.round(providerHoverPoint.value)}
                            </text>
                            <text className="chart-tooltip-text muted" x="76" y="58">mentions</text>
                          </g>
                        </>
                      )}

                    </svg>
                  ) : (
                    <p className="queries-meta">Need at least 2 scans to render trend visualization.</p>
                  )}
                </div>
                <div className="all-provider-stats">
                  <article className="mini-metric">
                    <p>Overall ranking</p>
                    <strong>{selectedModelSummary?.averageRank ? `#${selectedModelSummary.averageRank.toFixed(1)}` : 'Not ranked'}</strong>
                  </article>
                  <article className="mini-metric">
                    <p>Visibility rating</p>
                    <strong>{selectedModelSummary ? `${selectedModelSummary.mentionRate.toFixed(1)}%` : '--'}</strong>
                  </article>
                  <article className="mini-metric">
                    <p>Total queries</p>
                    <strong>{overallSummary?.totalQueries ?? '--'}</strong>
                  </article>
                  <article className="mini-metric">
                    <p>Total provider scans</p>
                    <strong>{selectedModelSummary?.totalScans ?? '--'}</strong>
                  </article>
                </div>
              </>
            ) : (
              <>
                <div className="chart-wrap">
                  {allTrendData.length >= 1 ? (
                    <svg
                      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                      preserveAspectRatio="xMidYMid meet"
                      role="img"
                      aria-label="All provider trend chart"
                      onMouseMove={(event) => updateHoverIndex(event, allPoints, setAllHoverIndex)}
                      onMouseLeave={() => setAllHoverIndex(null)}
                    >
                      <defs>
                        <linearGradient id="allAreaFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2f9d8b" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#2f9d8b" stopOpacity="0.03" />
                        </linearGradient>
                      </defs>

                      <line className="axis" x1={CHART_PADDING.left} y1={CHART_PADDING.top} x2={CHART_PADDING.left} y2={CHART_HEIGHT - CHART_PADDING.bottom} />
                      <line className="axis" x1={CHART_PADDING.left} y1={CHART_HEIGHT - CHART_PADDING.bottom} x2={CHART_WIDTH - CHART_PADDING.right} y2={CHART_HEIGHT - CHART_PADDING.bottom} />

                      {allYTicks.map((tick) => {
                        const tickY = CHART_PADDING.top + ((allMaxValue - tick) / allMaxValue) * (CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom)
                        return (
                          <g key={`all-${tick}`}>
                            <line className="axis-grid" x1={CHART_PADDING.left} y1={tickY} x2={CHART_WIDTH - CHART_PADDING.right} y2={tickY} />
                            <text className="axis-text" x={CHART_PADDING.left - 10} y={tickY + 4} textAnchor="end">{tick}</text>
                          </g>
                        )
                      })}

                      {allPoints.map((point, index) => (
                        <line
                          key={`all-grid-x-${allTrendData[index]?.day ?? index}`}
                          className="axis-grid vertical"
                          x1={point.x}
                          y1={CHART_PADDING.top}
                          x2={point.x}
                          y2={CHART_HEIGHT - CHART_PADDING.bottom}
                        />
                      ))}

                      {allAreaPath ? <path className="area" d={allAreaPath} fill="url(#allAreaFill)" /> : null}

                      {allPoints.length > 1 ? <path className="line" d={allChartLinePath} /> : null}

                      {allPoints.map((point, index) => (
                        <circle
                          key={`all-point-${allTrendData[index]?.day ?? index}`}
                          className={allActiveIndex === index ? 'point-dot active' : 'point-dot'}
                          cx={point.x}
                          cy={point.y}
                          r={allActiveIndex === index ? '6.5' : '4'}
                        />
                      ))}

                      {allActivePoint && <circle className="hover-ring" cx={allActivePoint.x} cy={allActivePoint.y} r="13" />}

                      {allPoints.map((point, index) => (
                        <text
                          key={`all-label-${allTrendData[index]?.day ?? index}`}
                          className="axis-label"
                          x={point.x}
                          y={CHART_HEIGHT - CHART_PADDING.bottom + 18}
                          textAnchor="middle"
                        >
                          {allTrendData[index]?.day}
                        </text>
                      ))}

                      {allHoverPoint && (
                        <>
                          <line
                            className="hover-guide"
                            x1={allHoverPoint.x}
                            y1={allHoverPoint.y}
                            x2={allHoverPoint.x}
                            y2={CHART_HEIGHT - CHART_PADDING.bottom}
                          />
                          <g transform={`translate(${Math.max(CHART_PADDING.left + 8, Math.min(allHoverPoint.x - 72, CHART_WIDTH - CHART_PADDING.right - 148))}, ${Math.max(CHART_PADDING.top + 4, allHoverPoint.y - 96)})`}>
                            <rect className="chart-tooltip" width="148" height="66" rx="10" />
                            <polygon className="chart-tooltip-pointer" points="70,66 78,66 74,74" />
                            <text className="chart-tooltip-text" x="12" y="22">{allTrendData[allHoverIndex]?.day}</text>
                            <text className="chart-tooltip-text strong" x="12" y="48">
                              {Math.round(allHoverPoint.value)}
                            </text>
                            <text className="chart-tooltip-text muted" x="76" y="58">mentions</text>
                          </g>
                        </>
                      )}

                    </svg>
                  ) : (
                    <p className="queries-meta">Need at least 2 scans to render overview visualization.</p>
                  )}
                </div>
                <div className="all-provider-stats">
                  <article className="mini-metric">
                    <p>Overall ranking</p>
                    <strong>{allProviderStats.overallRanking ? `#${allProviderStats.overallRanking.toFixed(1)}` : 'Not ranked'}</strong>
                  </article>
                  <article className="mini-metric">
                    <p>Visibility rating</p>
                    <strong>{allProviderStats.visibilityRating ? `${allProviderStats.visibilityRating.toFixed(1)}%` : '--'}</strong>
                  </article>
                  <article className="mini-metric">
                    <p>Total queries</p>
                    <strong>{overallSummary?.totalQueries ?? '--'}</strong>
                  </article>
                  <article className="mini-metric">
                    <p>Total provider scans</p>
                    <strong>{allProviderStats.totalModelScans || '--'}</strong>
                  </article>
                </div>
                <div className="provider-grid" aria-label="All provider breakdown">
                  {(overallSummary?.models || []).map((item) => (
                    <article key={item.model} className="provider-tile">
                      <h4>{models[backendModelToUiModel[item.model]]?.name || item.model}</h4>
                      <p><span>Avg rank</span><strong>{item.averageRank ? `#${item.averageRank.toFixed(1)}` : 'Not ranked'}</strong></p>
                      <p><span>Visibility</span><strong>{item.mentionRate.toFixed(1)}%</strong></p>
                      <p><span>Ranked coverage</span><strong>{item.rankedRate.toFixed(1)}%</strong></p>
                      <p><span>Samples</span><strong>{item.totalScans}</strong></p>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          {progressTab === 'provider' && (
            <section className="overview-card">
              <div className="card-head">
                <h3>Current query overview</h3>
                <span>{selectedPromptTime}</span>
              </div>

              <div className="metric-row compact">
                <article className="mini-metric">
                  <p>Ranking position</p>
                  <strong>{hasRank ? `#${result.rank}` : 'Not ranked'}</strong>
                </article>
                <article className="mini-metric">
                  <p>Mention status</p>
                  <strong>{result.mentioned ? 'Mentioned' : 'Not mentioned'}</strong>
                </article>
              </div>
              {overallLoadError && <p className="queries-meta error">{overallLoadError}</p>}
            </section>
          )}

          {progressTab === 'provider' && (
            <section className="query-row">
            <section className="panel-card current-card">
              <h3>Current query</h3>
              {mostRecentPrompt ? (
                <button
                  type="button"
                  className={`query-item ${selectedPromptId === mostRecentPrompt.id ? 'active' : ''}`}
                  onClick={() => setSelectedPromptId(mostRecentPrompt.id)}
                >
                  <p>{mostRecentPrompt.text}</p>
                  <span>{formatTimestamp(mostRecentPrompt.timestamp)}</span>
                </button>
              ) : (
                <p className="queries-meta">No current query yet.</p>
              )}
            </section>

            <section className="panel-card history-card">
              <h3>Past prompt queries</h3>
              <div className="past-queries-scroll" ref={pastQueriesRef}>
                {pastPrompts.map((query) => (
                  <button
                    type="button"
                    key={query.id}
                    className={`query-item ${selectedPromptId === query.id ? 'active' : ''}`}
                    onClick={() => setSelectedPromptId(query.id)}
                  >
                    <p>{query.text}</p>
                    <span>{formatTimestamp(query.timestamp)}</span>
                  </button>
                ))}

                {isInitialLoading && <p className="queries-meta">Loading prompt queries...</p>}
                {!isInitialLoading && isLoadingMore && <p className="queries-meta">Loading more queries...</p>}
                {!isInitialLoading && !hasMoreQueries && pastPrompts.length > 0 && (
                  <p className="queries-meta">You reached the end of stored prompt history.</p>
                )}
                {!isInitialLoading && pastPrompts.length === 0 && (
                  <p className="queries-meta">No past prompt queries available yet.</p>
                )}
                {queryLoadError && <p className="queries-meta error">{queryLoadError}</p>}
              </div>
            </section>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
