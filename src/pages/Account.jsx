import React from 'react'

import {
  supabase
} from '../lib'

import {
  Card,
  Toast
} from '../components/UI'

import InstallApp
  from '../components/InstallApp'

export default function Account({
  profile,
  onChanged,
  installApp
}) {

  const [
    name,
    setName
  ] = React.useState(
    profile?.full_name || ''
  )

  const [
    password,
    setPassword
  ] = React.useState('')

  const [
    confirm,
    setConfirm
  ] = React.useState('')

  const [
    toast,
    setToast
  ] = React.useState('')

  React.useEffect(
    () => {
      setName(
        profile?.full_name || ''
      )
    },
    [
      profile?.full_name
    ]
  )

  async function saveName(e) {
    e.preventDefault()

    const {
      error
    } = await supabase
      .from('members')
      .update({
        full_name: name
      })
      .eq(
        'id',
        profile.id
      )

    if (error) {
      setToast(
        error.message
      )

      return
    }

    setToast(
      'Nama berhasil diperbarui.'
    )

    onChanged?.()
  }

  async function savePassword(e) {
    e.preventDefault()

    if (
      password.length < 8
    ) {
      setToast(
        'Password minimal 8 karakter.'
      )

      return
    }

    if (
      password !== confirm
    ) {
      setToast(
        'Konfirmasi password tidak sama.'
      )

      return
    }

    const {
      error
    } = await supabase
      .auth
      .updateUser({
        password
      })

    if (error) {
      setToast(
        error.message
      )

      return
    }

    setPassword('')
    setConfirm('')

    setToast(
      'Password berhasil diperbarui.'
    )
  }

  return (
    <>
      <Toast
        message={toast}
      />

      <InstallApp {...installApp} />

      <div className="settings-grid">

        <Card>

          <div className="card-title">
            <div>
              <h3>
                Profil saya
              </h3>

              <p>
                Nama yang tampil
                di dashboard
              </p>
            </div>
          </div>

          <form
            className="stack-form"
            onSubmit={saveName}
          >

            <label>
              Nama lengkap

              <input
                value={name}
                onChange={
                  e =>
                    setName(
                      e.target.value
                    )
                }
                required
              />
            </label>

            <label>
              Email

              <input
                value={
                  profile?.email || ''
                }
                disabled
              />
            </label>

            <label>
              Role

              <input
                value={
                  profile
                    ?.roles
                    ?.name || ''
                }
                disabled
              />
            </label>

            <button
              className="primary"
            >
              Simpan profil
            </button>

          </form>

        </Card>

        <Card>

          <div className="card-title">
            <div>

              <h3>
                Password
              </h3>

              <p>
                Ganti password
                akun Anda
              </p>

            </div>
          </div>

          <form
            className="stack-form"
            onSubmit={savePassword}
          >

            <label>
              Password baru

              <input
                type="password"
                value={password}
                onChange={
                  e =>
                    setPassword(
                      e.target.value
                    )
                }
                minLength="8"
                required
              />
            </label>

            <label>
              Ulangi password

              <input
                type="password"
                value={confirm}
                onChange={
                  e =>
                    setConfirm(
                      e.target.value
                    )
                }
                minLength="8"
                required
              />
            </label>

            <button
              className="primary"
            >
              Simpan password
            </button>

          </form>

        </Card>

      </div>
    </>
  )
}
