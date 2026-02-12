import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const PAGE_SIZE = 20
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

const models = {
  claude: { name: 'Claude' },
  gpt: { name: 'ChatGPT' },
  gemini: { name: 'Gemini' },
  perplexity: { name: 'Perplexity' },
}

const modelDeltas = {
  claude: '+36.8%',
  gpt: '+18.4%',
  gemini: '-4.2%',
  perplexity: '+42.1%',
}

const fallbackPromptBatches = [
  {
    id: 1,
    text: 'best media solutions agency San Diego',
    timestamp: '2 hours ago',
    results: {
      claude: { rank: 2, mentioned: true, lastQueried: '2 hours ago' },
      gpt: { rank: 4, mentioned: true, lastQueried: '3 hours ago' },
      gemini: { rank: null, mentioned: false, lastQueried: '5 hours ago' },
      perplexity: { rank: 1, mentioned: true, lastQueried: '1 hour ago' },
    },
  },
  {
    id: 2,
    text: 'creative media agency near me',
    timestamp: '1 day ago',
    results: {
      claude: { rank: 3, mentioned: true, lastQueried: '1 day ago' },
      gpt: { rank: 6, mentioned: true, lastQueried: '1 day ago' },
      gemini: { rank: null, mentioned: false, lastQueried: '1 day ago' },
      perplexity: { rank: 2, mentioned: true, lastQueried: '1 day ago' },
    },
  },
  {
    id: 3,
    text: 'b2b media marketing services',
    timestamp: '2 days ago',
    results: {
      claude: { rank: 5, mentioned: true, lastQueried: '2 days ago' },
      gpt: { rank: 8, mentioned: false, lastQueried: '2 days ago' },
      gemini: { rank: null, mentioned: false, lastQueried: '2 days ago' },
      perplexity: { rank: 4, mentioned: true, lastQueried: '2 days ago' },
    },
  },
  {
    id: 4,
    text: 'digital growth partner for local businesses',
    timestamp: '4 days ago',
    results: {
      claude: { rank: 7, mentioned: false, lastQueried: '4 days ago' },
      gpt: { rank: null, mentioned: false, lastQueried: '4 days ago' },
      gemini: { rank: null, mentioned: false, lastQueried: '4 days ago' },
      perplexity: { rank: 6, mentioned: true, lastQueried: '4 days ago' },
    },
  },
]

const defaultResultByModel = {
  claude: { rank: null, mentioned: false, lastQueried: '--' },
  gpt: { rank: null, mentioned: false, lastQueried: '--' },
  gemini: { rank: null, mentioned: false, lastQueried: '--' },
  perplexity: { rank: null, mentioned: false, lastQueried: '--' },
}

const backendModelToUiModel = {
  chatgpt: 'gpt',
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

const normalizePromptQuery = (query) => {
  const normalizedResults = {
    ...defaultResultByModel,
    claude: { ...defaultResultByModel.claude },
    gpt: { ...defaultResultByModel.gpt },
    gemini: { ...defaultResultByModel.gemini },
    perplexity: { ...defaultResultByModel.perplexity },
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
        lastQueried: formatTimestamp(query.timestamp),
      }
    })
  }

  return {
    id: query.id,
    text: query.text,
    timestamp: formatTimestamp(query.timestamp),
    results: normalizedResults,
  }
}

function App() {
  const [selectedModel, setSelectedModel] = useState('claude')
  const [promptBatches, setPromptBatches] = useState(fallbackPromptBatches)
  const [selectedPromptId, setSelectedPromptId] = useState(fallbackPromptBatches[0].id)
  const [nextOffset, setNextOffset] = useState(0)
  const [hasMoreQueries, setHasMoreQueries] = useState(true)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [queryLoadError, setQueryLoadError] = useState('')
  const pastQueriesRef = useRef(null)

  const selectedPrompt = promptBatches.find((prompt) => prompt.id === selectedPromptId) ?? promptBatches[0]
  const result = selectedPrompt.results[selectedModel]
  const hasRank = result.rank !== null
  const activePrompt = selectedPrompt.text
  const mostRecentPrompt = promptBatches[0] ?? null
  const pastPrompts = useMemo(() => promptBatches.slice(1), [promptBatches])

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
        const initialQueries = incomingQueries.length ? incomingQueries : fallbackPromptBatches
        setPromptBatches(initialQueries)
        setSelectedPromptId(initialQueries[0].id)
      } else {
        setPromptBatches((current) => [...current, ...incomingQueries])
      }

      setNextOffset(offset + incomingQueries.length)
      setHasMoreQueries(Boolean(payload.hasMore) && incomingQueries.length > 0)
    } catch {
      if (offset === 0) {
        setPromptBatches(fallbackPromptBatches)
        setSelectedPromptId(fallbackPromptBatches[0].id)
        setHasMoreQueries(false)
      }
      setQueryLoadError('Unable to load more prompt queries right now.')
    } finally {
      setIsInitialLoading(false)
      setIsLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    loadQueries(0)
  }, [loadQueries])

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
      <main className="dashboard-content">
        <header className="content-head">
          <h1>Geo Dashboard | Ark Marketing</h1>
          <p>Track Ark Marketing visibility by prompt, model ranking position, mention status, and recent query activity across AI platforms.</p>
        </header>

        <section className="overview-card">
          <div className="card-head">
            <h3>Overview</h3>
            <span>{result.lastQueried}</span>
          </div>

          <p className="model-tabs-hint">Model tabs (click to switch)</p>

          <div className="model-pills" role="tablist" aria-label="Select model">
            {Object.entries(models).map(([key, model]) => (
              <button
                key={key}
                type="button"
                className={selectedModel === key ? 'pill active' : 'pill'}
                onClick={() => setSelectedModel(key)}
              >
                {model.name}
              </button>
            ))}
          </div>

          <div className="overview-grid" key={`${selectedPromptId}-${selectedModel}`}>
            <article className="focus-metric">
              <div>
                <p className="metric-label">Ranking position</p>
                <p className={`metric-value ${hasRank ? 'up' : 'muted'}`}>
                  {hasRank ? `#${result.rank}` : 'Not ranked'}
                </p>
                <span className={modelDeltas[selectedModel].startsWith('-') ? 'delta down' : 'delta up'}>
                  {modelDeltas[selectedModel]} vs last month
                </span>
                <p className="prompt-context">
                  <span className="prompt-label">Prompt used</span>
                  <span className="prompt-text">"{activePrompt}"</span>
                </p>
              </div>
            </article>

            <article className="secondary-metric">
              <p className="metric-label">Overall growth</p>
              <p className="metric-value muted">Pending data</p>
              <p className="helper-copy">
                Database-backed growth metrics will appear here once trend data is connected.
              </p>
              <div className="growth-stats" aria-label="Overall growth placeholders">
                <p><span>Visibility rate</span><strong>--</strong></p>
                <p><span>Average Rank</span><strong>--</strong></p>
                <p><span>% Appearances</span><strong>--</strong></p>
              </div>
            </article>
          </div>

        </section>

        <div className="prompt-sections">
          <section className="activity-card">
            <h3>Most recent batch</h3>
            <div className="queries-list">
              {mostRecentPrompt && (
                <button
                  type="button"
                  className={`query-item ${selectedPromptId === mostRecentPrompt.id ? 'active' : ''}`}
                  onClick={() => setSelectedPromptId(mostRecentPrompt.id)}
                >
                  <p>{mostRecentPrompt.text}</p>
                  <span>{mostRecentPrompt.timestamp}</span>
                </button>
              )}
            </div>
          </section>

          <section className="past-queries-card">
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
                  <span>{query.timestamp}</span>
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
        </div>
      </main>
    </div>
  )
}

export default App
