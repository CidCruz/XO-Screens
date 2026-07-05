/**
 * appBridge.ts
 *
 * Defines all XO app-control tools exposed to Gemini via function-calling.
 * Two exports are consumed by ChatBox:
 *
 *   APP_TOOLS   — array of GeminiToolDeclaration passed in every chat request
 *   makeExecutor — factory that binds an AppControl instance to an executor
 *                  function that Gemini's tool-call responses are routed through
 */

import type { AppControl, WidgetId, Note } from './types'
import type { GeminiToolDeclaration, ToolCallRequest } from './gemini'

// ─────────────────────────────────────────────────────────────────────────────
// Tool declarations (sent to Gemini so it knows what it can call)
// ─────────────────────────────────────────────────────────────────────────────

export const APP_TOOLS: GeminiToolDeclaration[] = [
  // ── Widget visibility ──────────────────────────────────────────────────────
  {
    name: 'open_widget',
    description: 'Opens (makes visible) one of the XO overlay widgets: chat, notes, video captions, or settings.',
    parameters: {
      type: 'OBJECT',
      properties: {
        widget: {
          type: 'string',
          enum: ['chat', 'notes', 'video', 'settings'],
          description: 'The widget to open.',
        },
      },
      required: ['widget'],
    },
  },
  {
    name: 'close_widget',
    description: 'Closes (hides) one of the XO overlay widgets.',
    parameters: {
      type: 'OBJECT',
      properties: {
        widget: {
          type: 'string',
          enum: ['chat', 'notes', 'video', 'settings'],
          description: 'The widget to close.',
        },
      },
      required: ['widget'],
    },
  },
  {
    name: 'get_open_widgets',
    description: 'Returns a list of widget IDs that are currently visible on screen.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },

  // ── Notes — read ───────────────────────────────────────────────────────────
  {
    name: 'list_notes',
    description: 'Returns a summary list of all notes (id, title, first 80 chars of content, color, timestamps). Use this to find a note before reading or editing it.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'get_note',
    description: 'Returns the full content of a single note by its id.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: 'string', description: 'The note id returned by list_notes.' },
      },
      required: ['id'],
    },
  },

  // ── Notes — write ──────────────────────────────────────────────────────────
  {
    name: 'create_note',
    description: 'Creates a new note and opens the Notes widget so it is visible. Returns the new note object.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title:   { type: 'string', description: 'Title of the note.' },
        content: { type: 'string', description: 'Body text of the note.' },
        color: {
          type: 'string',
          enum: ['default', 'purple', 'blue', 'green', 'yellow', 'red'],
          description: 'Optional highlight color. Defaults to "default" (no color).',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'update_note',
    description: 'Updates the title, content, and/or color of an existing note. Only the provided fields are changed.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id:      { type: 'string', description: 'The note id to update.' },
        title:   { type: 'string', description: 'New title (optional).' },
        content: { type: 'string', description: 'New body text (optional).' },
        color: {
          type: 'string',
          enum: ['default', 'purple', 'blue', 'green', 'yellow', 'red'],
          description: 'New highlight color (optional).',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_note',
    description: 'Permanently deletes a note by its id.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: 'string', description: 'The note id to delete.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'focus_note',
    description: 'Makes a note the active/selected note in the Notes widget and opens the widget if it is closed. Use this to draw the user\'s attention to a specific note.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: 'string', description: 'The note id to focus.' },
      },
      required: ['id'],
    },
  },

  // ── Video captions history ─────────────────────────────────────────────────
  {
    name: 'get_caption_history',
    description: 'Returns the list of previously generated video caption results (label, tones, timestamps). Does not process new videos.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Color name → CSS value mapping (matches NotesApp palette)
// ─────────────────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  default: 'rgba(255,255,255,0.0)',
  purple:  'rgba(139,92,246,0.14)',
  blue:    'rgba(59,130,246,0.14)',
  green:   'rgba(16,185,129,0.14)',
  yellow:  'rgba(245,158,11,0.14)',
  red:     'rgba(239,68,68,0.14)',
}

function toCssColor(name: string | undefined): string {
  return COLOR_MAP[name ?? 'default'] ?? COLOR_MAP['default']
}

// ─────────────────────────────────────────────────────────────────────────────
// Executor factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns an async executor function bound to the given AppControl instance.
 * Pass the returned function as the `executor` argument of sendToGeminiWithTools.
 */
export function makeExecutor(ctrl: AppControl) {
  return async function execute(call: ToolCallRequest): Promise<unknown> {
    const a = call.args

    switch (call.name) {

      // ── Widget visibility ────────────────────────────────────────────────
      case 'open_widget': {
        ctrl.openWidget(a.widget as WidgetId)
        return { ok: true, widget: a.widget, state: 'open' }
      }

      case 'close_widget': {
        ctrl.closeWidget(a.widget as WidgetId)
        return { ok: true, widget: a.widget, state: 'closed' }
      }

      case 'get_open_widgets': {
        return { openWidgets: ctrl.getOpenWidgets() }
      }

      // ── Notes — read ─────────────────────────────────────────────────────
      case 'list_notes': {
        const notes = ctrl.listNotes()
        return {
          count: notes.length,
          notes: notes.map(n => ({
            id: n.id,
            title: n.title || '(Untitled)',
            preview: n.content.slice(0, 80) + (n.content.length > 80 ? '…' : ''),
            color: n.color,
            updatedAt: new Date(n.updatedAt).toISOString(),
          })),
        }
      }

      case 'get_note': {
        const note = ctrl.getNote(a.id as string)
        if (!note) return { error: `No note found with id "${a.id}".` }
        return note
      }

      // ── Notes — write ────────────────────────────────────────────────────
      case 'create_note': {
        const note = ctrl.createNote(
          (a.title as string) ?? '',
          (a.content as string) ?? '',
        )
        // Apply color if provided
        if (a.color) {
          ctrl.updateNote(note.id, { color: toCssColor(a.color as string) })
        }
        // Open and focus the Notes widget so the user sees the result
        ctrl.openWidget('notes')
        ctrl.focusNote(note.id)
        return { ok: true, note: { id: note.id, title: note.title } }
      }

      case 'update_note': {
        const patch: Partial<Pick<Note, 'title' | 'content' | 'color'>> = {}
        if (typeof a.title   === 'string') patch.title   = a.title
        if (typeof a.content === 'string') patch.content = a.content
        if (typeof a.color   === 'string') patch.color   = toCssColor(a.color)

        const updated = ctrl.updateNote(a.id as string, patch)
        if (!updated) return { error: `No note found with id "${a.id}".` }
        return { ok: true, note: { id: updated.id, title: updated.title } }
      }

      case 'delete_note': {
        const deleted = ctrl.deleteNote(a.id as string)
        if (!deleted) return { error: `No note found with id "${a.id}".` }
        return { ok: true, deletedId: a.id }
      }

      case 'focus_note': {
        const note = ctrl.getNote(a.id as string)
        if (!note) return { error: `No note found with id "${a.id}".` }
        ctrl.openWidget('notes')
        ctrl.focusNote(a.id as string)
        return { ok: true, focused: a.id }
      }

      // ── Video captions ───────────────────────────────────────────────────
      case 'get_caption_history': {
        const history = ctrl.getCaptionHistory()
        return {
          count: history.length,
          entries: history.map(e => ({
            id: e.id,
            label: e.label,
            tones: Object.keys(e.results),
            createdAt: new Date(e.createdAt).toISOString(),
          })),
        }
      }

      default:
        return { error: `Unknown tool: "${call.name}"` }
    }
  }
}
