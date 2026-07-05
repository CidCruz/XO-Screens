/**
 * Runtime environment detection.
 *
 * `isElectron` is true when the app is running inside the Electron desktop
 * overlay (window.xo is injected by the preload script).  It is false when
 * the app is opened in a normal browser tab.
 */

export interface XoBridge {
  platform: string
  hide: () => void
  quit: () => void
  minimizeToTray: () => void
  readyToHide: () => void
  setIgnoreMouse: (v: boolean) => void
  onShow: (cb: () => void) => void
  onHideAnimate: (cb: () => void) => void
}

declare global {
  interface Window {
    xo?: XoBridge
  }
}

export const isElectron = typeof window !== 'undefined' && !!window.xo

const noOp = () => {}

export const xo: XoBridge = isElectron
  ? window.xo!
  : {
      platform: 'web',
      hide: noOp,
      quit: noOp,
      minimizeToTray: noOp,
      readyToHide: noOp,
      setIgnoreMouse: noOp,
      onShow: noOp,
      onHideAnimate: noOp,
    }
