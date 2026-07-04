/**
 * Runtime environment detection.
 *
 * `isElectron` is true when the app is running inside the Electron desktop
 * overlay (window.xo is injected by the preload script).  It is false when
 * the app is opened in a normal browser tab.
 */
export const isElectron = typeof window !== 'undefined' && !!window.xo

/**
 * A safe, no-op stub that mirrors the real window.xo API so every call-site
 * can just use `xo.*` without checking isElectron first.
 */
const noOp = () => {}

export const xo = isElectron
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
