import type { AppItem } from '../types'

function AppIcon({ id }: { id: string }) {
  const cls = 'w-5 h-5'
  switch (id) {
    case 'chat':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
        </svg>
      )
    case 'notes':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      )
    case 'search':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
      )
    case 'clipboard':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      )
    case 'screenshot':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    case 'usage':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    case 'settings':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    default: return null
  }
}

interface Props {
  apps: AppItem[]
  activeApp: string
  onSelect: (id: string) => void
}

export default function AppHub({ apps, activeApp, onSelect }: Props) {
  return (
    <div className="glass-dark rounded-2xl shadow-2xl select-none flex flex-col" style={{ width: 64, overflow: 'visible' }}>

      {/* Logo */}
      <div className="flex items-center justify-center py-5 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0">
          <span className="text-white font-black text-sm tracking-tight" style={{ textShadow: '0 0 12px rgba(255,255,255,0.9), 0 0 24px rgba(255,255,255,0.5)' }}>XO</span>
        </div>
      </div>

      {/* Nav icons */}
      <div className="flex flex-col items-center gap-2 px-3 flex-1" style={{ paddingTop: 20, paddingBottom: 20 }}>
        {apps.map(app => {
          const isActive = activeApp === app.id
          return (
            <div key={app.id} className="group relative flex items-center">
              <button
                data-no-drag
                onClick={() => onSelect(app.id)}
                title={app.label}
                className={`
                  w-10 h-10 rounded-xl flex items-center justify-center
                  transition-all duration-200 cursor-pointer
                  ${isActive
                    ? 'bg-white text-black'
                    : 'text-white/40 hover:text-white hover:bg-white/10'
                  }
                `}
              >
                <AppIcon id={app.id} />
              </button>
              {/* Tooltip — outside AppHub via fixed positioning */}
              <span className="pointer-events-none fixed ml-3 px-3 py-1.5 rounded-lg
                text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100
                transition-opacity duration-150 z-[99999]"
                style={{ left: 72, background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.12)', paddingLeft: 16, paddingRight: 16 }}>
                {app.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Hide button */}
      <div className="flex items-center justify-center py-3 border-t border-white/10">
        <button
          data-no-drag
          onClick={() => window.xo?.quit()}
          title="Quit"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white/25
            hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

    </div>
  )
}
