import type { AppItem } from '../types'

// SVG icons per app id
function AppIcon({ id, active }: { id: string; active: boolean }) {
  const cls = `w-6 h-6 transition-colors ${active ? 'text-violet-300' : 'text-white/60 group-hover:text-white'}`
  switch (id) {
    case 'chat':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
        </svg>
      )
    case 'notes':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      )
    case 'search':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
      )
    case 'clipboard':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      )
    case 'screenshot':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    case 'settings':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    default:
      return null
  }
}

interface Props {
  apps: AppItem[]
  activeApp: string
  onSelect: (id: string) => void
}

export default function AppHub({ apps, activeApp, onSelect }: Props) {
  return (
    <div className="glass-dark rounded-2xl shadow-2xl select-none overflow-hidden" style={{ width: 220 }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center pulse-glow shrink-0">
            <span className="text-white font-bold text-xs">XO</span>
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-none">XO Screens</p>
            <p className="text-white/35 text-[10px] mt-0.5">Your AI Desktop</p>
          </div>
        </div>
        <button
          data-no-drag
          onClick={() => window.xo?.hide()}
          title="Hide (⌘⇧Space to restore)"
          className="w-6 h-6 rounded-md flex items-center justify-center text-white/25
            hover:text-red-400 hover:bg-red-500/15 transition-all cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 3-col × 2-row grid */}
      <div className="grid grid-cols-3 gap-1 p-3">
        {apps.map(app => {
          const isActive = activeApp === app.id
          return (
            <button
              key={app.id}
              data-no-drag
              onClick={() => onSelect(app.id)}
              className={`
                group flex flex-col items-center justify-center gap-1.5
                rounded-xl px-1 py-3 transition-all duration-200 cursor-pointer
                ${isActive
                  ? 'bg-violet-500/30 border border-violet-400/40 shadow-lg shadow-violet-500/20'
                  : 'border border-transparent hover:bg-white/8 hover:border-white/10'
                }
              `}
            >
              <div className={`
                w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200
                ${isActive
                  ? 'bg-violet-500/40'
                  : 'bg-white/6 group-hover:bg-white/12'
                }
              `}>
                <AppIcon id={app.id} active={isActive} />
              </div>
              <span className={`text-[10px] font-medium leading-none transition-colors
                ${isActive ? 'text-violet-300' : 'text-white/50 group-hover:text-white/80'}`}>
                {app.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
