import type { AppItem } from '../types'

interface Props {
  apps: AppItem[]
  activeApp: string
  onSelect: (id: string) => void
  onChatToggle: () => void
  chatOpen: boolean
}

export default function AppHub({ apps, activeApp, onSelect, onChatToggle, chatOpen }: Props) {
  return (
    <div className="glass-dark rounded-2xl p-3 flex flex-col gap-2 w-16 shadow-2xl select-none">
      {/* Logo */}
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 pulse-glow mx-auto mb-1 shrink-0">
        <span className="text-white font-bold text-sm">XO</span>
      </div>

      <div className="w-full h-px bg-white/10" />

      {apps.map(app => (
        <button
          key={app.id}
          data-no-drag
          onClick={() => { onSelect(app.id); if (app.id === 'chat') onChatToggle() }}
          title={app.label}
          className={`
            relative flex items-center justify-center w-10 h-10 rounded-xl mx-auto
            transition-all duration-200 group cursor-pointer
            ${activeApp === app.id
              ? 'bg-violet-500/40 border border-violet-400/50 shadow-lg shadow-violet-500/20'
              : 'hover:bg-white/10 border border-transparent'
            }
          `}
        >
          <span className="text-xl">{app.icon}</span>
          <span className="absolute left-14 bg-black/80 text-white text-xs px-2 py-1 rounded-lg
            opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-lg">
            {app.label}
          </span>
          {activeApp === app.id && (
            <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-violet-400 rounded-l-full" />
          )}
        </button>
      ))}

      <div className="w-full h-px bg-white/10 mt-1" />

      {/* Hide overlay */}
      <button
        data-no-drag
        onClick={() => window.xo?.hide()}
        title="Hide XO (⌘⇧Space to restore)"
        className="flex items-center justify-center w-10 h-10 rounded-xl mx-auto
          hover:bg-red-500/20 border border-transparent hover:border-red-400/30
          text-white/30 hover:text-red-400 transition-all duration-200 cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
        </svg>
      </button>
    </div>
  )
}
