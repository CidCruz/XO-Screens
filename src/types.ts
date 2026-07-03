export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface AppItem {
  id: string
  label: string
}

export interface Note {
  id: string
  title: string
  content: string
  color: string
  createdAt: number
  updatedAt: number
}
