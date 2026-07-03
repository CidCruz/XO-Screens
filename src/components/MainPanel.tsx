interface Props {
  activeApp: string
}

export default function MainPanel({ activeApp }: Props) {
  const panels: Record<string, { icon: string; title: string; desc: string }> = {
    chat: { icon: '💬', title: 'Assistant', desc: 'Chat with XO on the right →' },
    notes: { icon: '📝', title: 'Quick Notes', desc: 'Jot down ideas instantly.' },
    search: { icon: '🔍', title: 'Smart Search', desc: 'Search anything with AI.' },
    clipboard: { icon: '📋', title: 'Clipboard', desc: 'Your clipboard history.' },
    settings: { icon: '⚙️', title: 'Settings', desc: 'Configure XO Screens.' },
  }

  const panel = panels[activeApp] ?? panels['chat']

  return (
    <div className="glass-dark rounded-2xl flex flex-col items-center justify-center h-full shadow-2xl">
      <span className="text-5xl mb-4">{panel.icon}</span>
      <h2 className="text-white text-xl font-semibold mb-2">{panel.title}</h2>
      <p className="text-white/40 text-sm">{panel.desc}</p>
    </div>
  )
}
