import React from 'react'

function isStandalone() {
  return (
    window.matchMedia?.(
      '(display-mode: standalone)'
    ).matches ||
    window.navigator.standalone === true
  )
}

export function useInstallApp() {
  const [promptEvent, setPromptEvent] =
    React.useState(null)

  const [installed, setInstalled] =
    React.useState(() => isStandalone())

  React.useEffect(() => {
    const beforeInstall = (event) => {
      event.preventDefault()

      setPromptEvent(event)
    }

    const onInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
    }

    const media =
      window.matchMedia?.(
        '(display-mode: standalone)'
      )

    const onMode = () => {
      setInstalled(isStandalone())
    }

    window.addEventListener(
      'beforeinstallprompt',
      beforeInstall
    )

    window.addEventListener(
      'appinstalled',
      onInstalled
    )

    media?.addEventListener?.(
      'change',
      onMode
    )

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        beforeInstall
      )

      window.removeEventListener(
        'appinstalled',
        onInstalled
      )

      media?.removeEventListener?.(
        'change',
        onMode
      )
    }
  }, [])

  async function install() {
    if (!promptEvent) return

    setPromptEvent(null)
    try {
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice
      if (choice?.outcome === 'accepted') setInstalled(true)
    } catch {
      // The browser can revoke a queued prompt before it is used.
    }
  }

  return { installed, promptEvent, install }
}

export default function InstallApp({ installed, promptEvent, install }) {
  const ua =
    navigator.userAgent || ''

  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (
      navigator.platform === 'MacIntel' &&
      navigator.maxTouchPoints > 1
    )

  if (installed) {
    return (
      <div className="pwa-card pwa-card-installed">
        <div>
          <h3>
            Aplikasi sudah terpasang
          </h3>

          <p>
            Dapur Jalan Cahaya sudah
            berjalan sebagai aplikasi
            di perangkat ini.
          </p>
        </div>

        <div className="pwa-status">
          Terpasang
        </div>
      </div>
    )
  }

  return (
    <div className="pwa-card">

      <div className="pwa-icon">
        JC
      </div>

      <div className="pwa-copy">

        <h3>
          Pasang aplikasi di HP
        </h3>

        {promptEvent ? (
          <p>
            Pasang Dapur Jalan Cahaya
            agar bisa dibuka dari layar
            utama seperti aplikasi biasa.
          </p>
        ) : isIOS ? (
          <p>
            Di iPhone/iPad: buka menu{' '}
            <b>Bagikan</b> di Safari lalu
            pilih{' '}
            <b>
              Tambahkan ke Layar Utama
            </b>.
          </p>
        ) : (
          <p>
            Jika tombol install belum
            tersedia, buka menu Chrome{' '}
            <b>⋮</b> lalu pilih{' '}
            <b>Install app</b> atau{' '}
            <b>
              Tambahkan ke layar utama
            </b>.
          </p>
        )}

      </div>

      {promptEvent && (
        <button
          type="button"
          className="primary pwa-install-btn"
          onClick={install}
        >
          Install aplikasi
        </button>
      )}

    </div>
  )
}
