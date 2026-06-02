/** Turn WebKit/Safari fetch failures into actionable Vision API errors. */
export function visionFetchError(err: unknown, baseUrl: string, action: string): Error {
  const raw = err instanceof Error ? err.message : String(err)
  if (
    raw === 'Load failed' ||
    raw.includes('Failed to fetch') ||
    raw.includes('NetworkError') ||
    raw.includes('network connection was lost')
  ) {
    const portHint = baseUrl.includes('8741') ? ':8741' : ''
    return new Error(
      `Cannot reach Vision API at ${baseUrl} (${action}: ${raw}). ` +
        `The engine may not be listening${portHint}. In a terminal: lsof -ti :8741 | xargs kill -9, ` +
        'then `source activate.sh` from your repo and `curl -s http://localhost:8741/health`. ' +
        'If the engine log shows /Users/.../Code/BrightVision but you use /Volumes/Code/..., rebuild the app or open the /Volumes repo as project. ' +
        'Terminal → Stop, quit the app, Start again.'
    )
  }
  if (err instanceof Error) return err
  return new Error(`${action}: ${raw}`)
}
