import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const PAGE_SIZE = 20
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '')

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

function App() {
  const [selectedModel, setSelectedModel] = useState('claude')
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

  const chartWidth = 580
  const chartHeight = 130
  const chartPadding = { top: 8, right: 8, bottom: 20, left: 34 }

  const providerValues = useMemo(() => providerTrendData.map((point) => point.value), [providerTrendData])
  const allValues = useMemo(() => allTrendData.map((point) => point.value), [allTrendData])
  const providerMaxValue = useMemo(() => Math.max(1, ...providerValues, 0), [providerValues])
  const allMaxValue = useMemo(() => Math.max(1, ...allValues, 0), [allValues])
  const providerYTicks = useMemo(() => getYAxisTicks(providerMaxValue), [providerMaxValue])
  const allYTicks = useMemo(() => getYAxisTicks(allMaxValue), [allMaxValue])
  const providerPoints = useMemo(
    () => getChartPoints(providerValues, chartWidth, chartHeight, chartPadding, providerMaxValue),
    [providerValues, chartWidth, chartHeight, providerMaxValue],
  )
  const allPoints = useMemo(
    () => getChartPoints(allValues, chartWidth, chartHeight, chartPadding, allMaxValue),
    [allValues, chartWidth, chartHeight, allMaxValue],
  )
  const chartLinePath = useMemo(
    () => buildSmoothLinePath(providerPoints),
    [providerPoints],
  )
  const allChartLinePath = useMemo(
    () => buildSmoothLinePath(allPoints),
    [allPoints],
  )
  const [providerHoverIndex, setProviderHoverIndex] = useState(null)
  const [allHoverIndex, setAllHoverIndex] = useState(null)

  const providerHoverPoint = providerHoverIndex !== null ? providerPoints[providerHoverIndex] : null
  const allHoverPoint = allHoverIndex !== null ? allPoints[allHoverIndex] : null
  const providerLatestPoint = providerPoints.length ? providerPoints[providerPoints.length - 1] : null
  const allLatestPoint = allPoints.length ? allPoints[allPoints.length - 1] : null
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

  const updateHoverIndex = useCallback((event, points, setHover) => {
    if (!points.length) {
      setHover(null)
      return
    }

    const bounds = event.currentTarget.getBoundingClientRect()
    const localX = ((event.clientX - bounds.left) / bounds.width) * chartWidth

    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY

    points.forEach((point, index) => {
      const distance = Math.abs(point.x - localX)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })

    setHover(nearestIndex)
  }, [chartWidth])

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
      const response = await fetch(`${API_BASE_URL}/api/models/overall-summary`)
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
    loadQueries(0)
  }, [loadQueries])

  useEffect(() => {
    loadOverallSummary()
  }, [loadOverallSummary])

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

  return (
    <div className="dashboard-shell">
      <div className="workspace-frame">
        <aside className="left-rail">
          <div className="brand-block">
            <div className="brand-mark" aria-hidden="true">G</div>
            <div>
              <p className="brand-name">geoip</p>
              <p className="brand-sub">visibility suite</p>
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
            <div className="date-chip">
              {new Date().toLocaleDateString(undefined, {
                month: 'short',
                day: '2-digit',
                year: 'numeric',
              })}
            </div>
          </header>

          <section className="chart-card">
            <div className="card-head">
              <h3>Overall progress visualization</h3>
              <span>
                {progressTab === 'provider'
                  ? (providerTrendData.length ? `${providerTrendData.length} recent scans` : 'No data yet')
                  : (allTrendData.length ? `${allTrendData.length} overview scans` : 'No data yet')}
              </span>
            </div>
            {progressTab === 'provider' ? (
              <>
                <div className="chart-wrap">
                  {providerTrendData.length >= 1 ? (
                    <svg
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                      preserveAspectRatio="xMidYMid meet"
                      role="img"
                      aria-label="Visibility trend chart"
                      onMouseMove={(event) => updateHoverIndex(event, providerPoints, setProviderHoverIndex)}
                      onMouseLeave={() => setProviderHoverIndex(null)}
                    >
                      <line className="axis" x1={chartPadding.left} y1={chartHeight - chartPadding.bottom} x2={chartWidth - chartPadding.right} y2={chartHeight - chartPadding.bottom} />

                      {providerYTicks.map((tick) => {
                        const tickY = chartPadding.top + ((providerMaxValue - tick) / providerMaxValue) * (chartHeight - chartPadding.top - chartPadding.bottom)
                        return (
                          <g key={tick}>
                            <line className={tick === Math.round(providerMaxValue / 2) ? 'axis-grid mid' : 'axis-grid'} x1={chartPadding.left} y1={tickY} x2={chartWidth - chartPadding.right} y2={tickY} />
                            <text className="axis-text" x={chartPadding.left - 8} y={tickY + 3} textAnchor="end">{tick}</text>
                          </g>
                        )
                      })}

                      {providerPoints.length > 1 ? <path className="line" d={chartLinePath} /> : null}
                      {providerLatestPoint && <circle className="end-dot" cx={providerLatestPoint.x} cy={providerLatestPoint.y} r="6" />}

                      {providerHoverPoint && (
                        <>
                          <line
                            className="hover-guide"
                            x1={providerHoverPoint.x}
                            y1={chartPadding.top}
                            x2={providerHoverPoint.x}
                            y2={chartHeight - chartPadding.bottom}
                          />
                          <circle className="hover-dot" cx={providerHoverPoint.x} cy={providerHoverPoint.y} r="4.5" />
                          <g transform={`translate(${Math.min(providerHoverPoint.x + 10, chartWidth - 140)}, ${Math.max(providerHoverPoint.y - 44, chartPadding.top + 2)})`}>
                            <rect className="chart-tooltip" width="130" height="38" rx="8" />
                            <text className="chart-tooltip-text" x="8" y="16">{providerTrendData[providerHoverIndex]?.day}</text>
                            <text className="chart-tooltip-text strong" x="8" y="30">
                              Appearances: {Math.round(providerHoverPoint.value)}
                            </text>
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
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                      preserveAspectRatio="xMidYMid meet"
                      role="img"
                      aria-label="All provider trend chart"
                      onMouseMove={(event) => updateHoverIndex(event, allPoints, setAllHoverIndex)}
                      onMouseLeave={() => setAllHoverIndex(null)}
                    >
                      <line className="axis" x1={chartPadding.left} y1={chartHeight - chartPadding.bottom} x2={chartWidth - chartPadding.right} y2={chartHeight - chartPadding.bottom} />

                      {allYTicks.map((tick) => {
                        const tickY = chartPadding.top + ((allMaxValue - tick) / allMaxValue) * (chartHeight - chartPadding.top - chartPadding.bottom)
                        return (
                          <g key={`all-${tick}`}>
                            <line className={tick === Math.round(allMaxValue / 2) ? 'axis-grid mid' : 'axis-grid'} x1={chartPadding.left} y1={tickY} x2={chartWidth - chartPadding.right} y2={tickY} />
                            <text className="axis-text" x={chartPadding.left - 8} y={tickY + 3} textAnchor="end">{tick}</text>
                          </g>
                        )
                      })}

                      {allPoints.length > 1 ? <path className="line" d={allChartLinePath} style={{ stroke: '#4ca287' }} /> : null}
                      {allLatestPoint && <circle className="end-dot" cx={allLatestPoint.x} cy={allLatestPoint.y} r="6" />}

                      {allHoverPoint && (
                        <>
                          <line
                            className="hover-guide"
                            x1={allHoverPoint.x}
                            y1={chartPadding.top}
                            x2={allHoverPoint.x}
                            y2={chartHeight - chartPadding.bottom}
                          />
                          <circle className="hover-dot" cx={allHoverPoint.x} cy={allHoverPoint.y} r="4.5" />
                          <g transform={`translate(${Math.min(allHoverPoint.x + 10, chartWidth - 140)}, ${Math.max(allHoverPoint.y - 44, chartPadding.top + 2)})`}>
                            <rect className="chart-tooltip" width="130" height="38" rx="8" />
                            <text className="chart-tooltip-text" x="8" y="16">{allTrendData[allHoverIndex]?.day}</text>
                            <text className="chart-tooltip-text strong" x="8" y="30">
                              Appearances: {Math.round(allHoverPoint.value)}
                            </text>
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
              <h3>Current query ({models[selectedModel].name})</h3>
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
              <h3>Past prompt queries ({models[selectedModel].name})</h3>
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
