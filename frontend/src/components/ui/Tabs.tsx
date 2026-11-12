import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface TabItem<Key extends string> {
  key: Key
  label: string
  /** Small tally beside the label; hidden when zero or missing. */
  count?: number
}

/**
 * A row of tabs over one panel: only the active section is on screen, so a
 * long page (or a long trophy shelf) doesn't bury everything below it.
 * Arrow keys, Home and End move between tabs.
 */
export function Tabs<Key extends string>({
  tabs,
  active,
  onChange,
  label,
  panelClassName = 'mt-3',
  children,
}: {
  tabs: readonly TabItem<Key>[]
  active: Key
  onChange: (key: Key) => void
  /** Accessible name of the tab list. */
  label: string
  panelClassName?: string
  /** The active tab's content. */
  children: ReactNode
}) {
  const tabRefs = useRef<Partial<Record<Key, HTMLButtonElement | null>>>({})
  const id = useId()

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.key === active)
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : null
    if (next == null) return
    event.preventDefault()
    onChange(tabs[next].key)
    tabRefs.current[tabs[next].key]?.focus()
  }

  return (
    <div>
      {/* Tabs grow with their labels instead of sharing equal columns, so four
          of them still fit a 360px phone without shrinking the text. */}
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-1 rounded-2xl bg-sand-100 p-1"
      >
        {tabs.map((tab) => {
          const selected = tab.key === active
          return (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[tab.key] = el
              }}
              type="button"
              role="tab"
              id={`${id}-${tab.key}-tab`}
              aria-selected={selected}
              aria-controls={`${id}-${tab.key}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.key)}
              className={`flex min-w-0 flex-auto items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-extrabold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-500 ${
                selected ? 'bg-white text-ink shadow-sm' : 'text-sand-500 hover:text-ink'
              }`}
            >
              <span className="truncate">{tab.label}</span>
              {tab.count != null && tab.count > 0 && (
                <span
                  aria-hidden
                  className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                    selected ? 'bg-grain-100 text-grain-800' : 'bg-sand-200 text-sand-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`${id}-${active}-panel`}
        aria-labelledby={`${id}-${active}-tab`}
        tabIndex={0}
        className={`rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-500 ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  )
}
