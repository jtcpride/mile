import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'

import {
  DEFAULT_CENTER,
  DEFAULT_CENTER_LABEL,
  DETECTION_RADIUS_METERS,
  MAP_STYLE,
} from './config'
import { createDataAccess } from './data-access'
import { distanceInMeters, formatDistance } from './lib/geo'
import { escapeHtml } from './lib/html'
import { compressPhoto, formatFileSize } from './lib/image'
import { formatConfirmedAt, formatRemaining, remainingMilliseconds } from './lib/time'
import { scheduleTransientDismiss } from './lib/transient'
import type { AnswerReceipt, Coordinates, DataAccess, Mission } from './types'

const RECEIPT_SESSION_KEY = 'mairu:last-receipt'
const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, '')
const routeHref = (path: string): string => `${BASE_PATH}${path}`
const appRoot = document.querySelector<HTMLDivElement>('#app')
if (!appRoot) throw new Error('App root was not found.')

class MairuApp {
  private readonly dataAccess: DataAccess = createDataAccess()
  private map: MapLibreMap | null = null
  private mapMarkers: Marker[] = []
  private timers: number[] = []
  private cancelReactionSheetDismiss: (() => void) | null = null
  private currentCoordinates: Coordinates | null = null
  private geolocationDenied = false

  constructor(private readonly root: HTMLDivElement) {
    window.addEventListener('popstate', () => void this.render())
    document.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-route]')
      if (!target || target.origin !== window.location.origin) return
      event.preventDefault()
      const appPath =
        BASE_PATH && target.pathname.startsWith(BASE_PATH)
          ? target.pathname.slice(BASE_PATH.length) || '/'
          : target.pathname
      this.navigate(appPath)
    })
  }

  async start(): Promise<void> {
    await this.render()
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      window.addEventListener('load', () => {
        void navigator.serviceWorker.register(routeHref('/sw.js'))
      })
    }
  }

  private navigate(path: string): void {
    window.history.pushState({}, '', routeHref(path))
    void this.render()
  }

  private clearView(): void {
    this.cancelReactionSheetDismiss?.()
    this.cancelReactionSheetDismiss = null
    this.timers.forEach((timer) => window.clearInterval(timer))
    this.timers = []
    this.mapMarkers.forEach((marker) => marker.remove())
    this.mapMarkers = []
    this.map?.remove()
    this.map = null
  }

  private async render(): Promise<void> {
    this.clearView()
    window.scrollTo({ top: 0, behavior: 'instant' })
    const pathname = window.location.pathname.startsWith(BASE_PATH)
      ? window.location.pathname.slice(BASE_PATH.length)
      : window.location.pathname
    const path = pathname.replace(/\/+$/, '') || '/'
    const answerMatch = path.match(/^\/missions\/([^/]+)\/answer$/)
    const detailMatch = path.match(/^\/missions\/([^/]+)$/)

    if (answerMatch) {
      await this.renderAnswer(answerMatch[1])
      return
    }
    if (detailMatch) {
      await this.renderMissionDetail(detailMatch[1])
      return
    }
    if (path === '/complete') {
      this.renderComplete()
      return
    }
    if (path !== '/') {
      this.navigate('/')
      return
    }
    await this.renderMap()
  }

  private shell(content: string, options: { pageClass?: string; backHref?: string } = {}): void {
    const back = options.backHref
      ? `<a class="icon-link" href="${escapeHtml(routeHref(options.backHref))}" data-route aria-label="前の画面へ戻る">
          <span aria-hidden="true">←</span>
        </a>`
      : '<span class="header-spacer" aria-hidden="true"></span>'

    this.root.innerHTML = `
      <div class="app-shell ${options.pageClass || ''}">
        <header class="app-header">
          ${back}
          <a class="wordmark" href="${routeHref('/')}" data-route aria-label="参る ホーム">参る</a>
          <button class="about-button" type="button" data-about aria-label="このサービスについて">?</button>
        </header>
        ${this.dataAccess.mode === 'demo' ? '<div class="demo-ribbon">静的デモモード</div>' : ''}
        ${content}
        <div class="toast" role="status" aria-live="polite" hidden></div>
      </div>
    `

    this.root.querySelector<HTMLButtonElement>('[data-about]')?.addEventListener('click', () => {
      this.showAbout()
    })
  }

  private showAbout(): void {
    const existing = this.root.querySelector<HTMLDialogElement>('#about-dialog')
    if (existing) {
      existing.showModal()
      return
    }

    const dialog = document.createElement('dialog')
    dialog.id = 'about-dialog'
    dialog.className = 'about-dialog'
    dialog.innerHTML = `
      <form method="dialog">
        <div class="dialog-heading">
          <span class="eyebrow">このサービスについて</span>
          <button class="icon-link" value="close" aria-label="閉じる">×</button>
        </div>
        <h2>参る</h2>
        <p>その場所のいまを、近くの誰かにミテキテもらう。</p>
        <div class="promise-list">
          <p><strong>現在地は保存しません。</strong><br>地図の中心合わせと端末内の距離計算だけに使います。</p>
          <p><strong>依頼は運営だけが登録します。</strong><br>自由記述の依頼投稿機能はありません。</p>
          <p><strong>他の人の回答は公開しません。</strong><br>回答数や達成率も公開面には表示しません。</p>
        </div>
        <button class="button button-secondary button-full" value="close">閉じる</button>
      </form>
    `
    this.root.querySelector('.app-shell')?.append(dialog)
    dialog.showModal()
  }

  private showToast(message: string, kind: 'normal' | 'error' = 'normal'): void {
    const toast = this.root.querySelector<HTMLDivElement>('.toast')
    if (!toast) return
    toast.textContent = message
    toast.dataset.kind = kind
    toast.hidden = false
    window.setTimeout(() => {
      toast.hidden = true
    }, 5_000)
  }

  private async renderMap(): Promise<void> {
    this.shell(
      `
        <main class="map-screen">
          <section class="map-copy" aria-labelledby="map-title">
            <p class="eyebrow">近くの見守りを探す</p>
            <h1 id="map-title">その場所の「いま」に、<br>静かに応える。</h1>
          </section>
          <div class="map-frame">
            <div id="map" aria-label="現在地周辺の地図"></div>
            <div class="radar-overlay" aria-hidden="true">
              <span class="radar-ring radar-ring-1"></span>
              <span class="radar-ring radar-ring-2"></span>
              <span class="radar-ring radar-ring-3"></span>
              <span class="radar-center"></span>
            </div>
            <div class="map-status" data-map-status>
              <span class="status-dot" aria-hidden="true"></span>
              <span>現在地を確認しています</span>
            </div>
            <div class="map-attribution-note">地図上の反応は、探知するまで現れません</div>
            <section class="reaction-sheet" data-reaction-sheet aria-live="polite" hidden></section>
          </div>
          <div class="map-actions">
            <p class="privacy-note"><span aria-hidden="true">○</span> 現在地は保存・回答送信されません</p>
            <button class="button button-primary button-full detect-button" type="button" data-detect disabled>
              <span class="button-radar" aria-hidden="true"></span>
              <span data-detect-label>現在地を確認中</span>
            </button>
          </div>
        </main>
      `,
      { pageClass: 'map-page' },
    )

    const mapElement = this.root.querySelector<HTMLDivElement>('#map')
    if (!mapElement) return

    const map = new MapLibreMap({
      container: mapElement,
      style: MAP_STYLE,
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: 13.8,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    })
    this.map = map
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    map.on('error', (event) => {
      console.error('MapLibre failed to load the base map.', event.error)
      this.showToast('地図を読み込めませんでした。通信状態をご確認ください。', 'error')
    })

    const detectButton = this.root.querySelector<HTMLButtonElement>('[data-detect]')
    detectButton?.addEventListener('click', () => void this.handleDetection())
    await this.locateResponder()
  }

  private locateResponder(): Promise<void> {
    const status = this.root.querySelector<HTMLElement>('[data-map-status] span:last-child')
    const button = this.root.querySelector<HTMLButtonElement>('[data-detect]')
    const label = this.root.querySelector<HTMLElement>('[data-detect-label]')

    if (!navigator.geolocation) {
      if (status) status.textContent = `${DEFAULT_CENTER_LABEL}を表示中`
      if (label) label.textContent = 'この端末では位置情報を利用できません'
      if (button) button.disabled = true
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.currentCoordinates = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }
          this.geolocationDenied = false
          this.map?.flyTo({
            center: [this.currentCoordinates.lng, this.currentCoordinates.lat],
            zoom: 15,
            duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900,
          })
          this.addCurrentLocationMarker(this.currentCoordinates)
          if (status) status.textContent = `現在地を中心に表示中・精度 約${Math.round(position.coords.accuracy)}m`
          if (label) label.textContent = '周辺を探知'
          if (button) button.disabled = false
          resolve()
        },
        (error) => {
          this.currentCoordinates = null
          this.geolocationDenied = error.code === GeolocationPositionError.PERMISSION_DENIED
          if (status) status.textContent = `${DEFAULT_CENTER_LABEL}を仮表示中`
          if (label) {
            label.textContent = this.geolocationDenied
              ? '位置情報を許可して探知'
              : '現在地をもう一度確認'
          }
          if (button) button.disabled = false
          resolve()
        },
        {
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 60_000,
        },
      )
    })
  }

  private addCurrentLocationMarker(coordinates: Coordinates): void {
    const element = document.createElement('div')
    element.className = 'current-location-marker'
    element.setAttribute('aria-label', '現在地')
    const marker = new Marker({ element })
      .setLngLat([coordinates.lng, coordinates.lat])
      .addTo(this.map!)
    this.mapMarkers.push(marker)
  }

  private async handleDetection(): Promise<void> {
    if (!this.currentCoordinates) {
      if (this.geolocationDenied) {
        this.showToast(
          'ブラウザのサイト設定で位置情報を許可してから、もう一度押してください。',
          'error',
        )
      }
      await this.locateResponder()
      return
    }

    const button = this.root.querySelector<HTMLButtonElement>('[data-detect]')
    const label = this.root.querySelector<HTMLElement>('[data-detect-label]')
    const overlay = this.root.querySelector<HTMLElement>('.radar-overlay')
    if (!button || !label || !overlay) return

    button.disabled = true
    label.textContent = '探知しています'
    overlay.classList.remove('is-scanning')
    void overlay.offsetWidth
    overlay.classList.add('is-scanning')

    try {
      const [missions] = await Promise.all([
        this.dataAccess.missions.listActivePublic(),
        new Promise((resolve) => window.setTimeout(resolve, 1_250)),
      ])
      const origin = this.currentCoordinates
      if (!origin) return

      const nearby = missions
        .map((mission) => ({
          mission,
          distance: distanceInMeters(origin, { lat: mission.lat, lng: mission.lng }),
        }))
        .filter(({ mission, distance }) => {
          return (
            mission.visibility === 'public' &&
            mission.status === 'active' &&
            remainingMilliseconds(mission.expiresAt) > 0 &&
            distance <= DETECTION_RADIUS_METERS
          )
        })
        .sort((left, right) => left.distance - right.distance)

      this.showDetectedMissions(nearby)
      label.textContent = 'もう一度探知'
    } catch {
      this.showToast('周辺のミッションを取得できませんでした。もう一度お試しください。', 'error')
      label.textContent = 'もう一度探知'
    } finally {
      button.disabled = false
      window.setTimeout(() => overlay.classList.remove('is-scanning'), 1_800)
    }
  }

  private showDetectedMissions(results: Array<{ mission: Mission; distance: number }>): void {
    this.mapMarkers
      .filter((marker) => marker.getElement().classList.contains('mission-marker-host'))
      .forEach((marker) => {
        marker.remove()
        this.mapMarkers = this.mapMarkers.filter((candidate) => candidate !== marker)
      })

    const sheet = this.root.querySelector<HTMLElement>('[data-reaction-sheet]')
    if (!sheet) return
    this.cancelReactionSheetDismiss?.()
    this.cancelReactionSheetDismiss = null
    sheet.classList.remove('is-dismissing')

    if (results.length === 0) {
      sheet.hidden = false
      sheet.innerHTML = `
        <p class="eyebrow">反応なし</p>
        <strong>いま、近くに進行中のミテキテはありません。</strong>
        <p>場所を変えて、また探知してみてください。</p>
      `
      this.cancelReactionSheetDismiss = scheduleTransientDismiss(sheet, {
        schedule: (callback, delay) => window.setTimeout(callback, delay),
        cancel: (timer) => window.clearTimeout(timer),
        onDismissed: () => {
          const guide = this.root.querySelector<HTMLElement>('.map-attribution-note')
          if (guide) guide.textContent = '場所を変えたら「もう一度探知」で再確認できます'
          this.cancelReactionSheetDismiss = null
        },
      })
      return
    }

    results.forEach(({ mission, distance }, index) => {
      const host = document.createElement('div')
      host.className = 'mission-marker-host'
      host.style.setProperty('--reaction-delay', `${index * 120}ms`)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'reaction-beacon'
      button.setAttribute(
        'aria-label',
        `${mission.title}、${formatDistance(distance)}、${formatRemaining(mission.expiresAt)}`,
      )
      button.innerHTML = `
        <span class="beacon-ripple" aria-hidden="true"></span>
        <span class="beacon-core" aria-hidden="true"></span>
        <span class="beacon-label">
          <strong>${escapeHtml(mission.title)}</strong>
          <small>${formatDistance(distance)}・<span data-expiry="${escapeHtml(mission.expiresAt)}">${formatRemaining(mission.expiresAt)}</span></small>
        </span>
      `
      button.addEventListener('click', () => this.navigate(`/missions/${mission.id}`))
      host.append(button)

      const marker = new Marker({ element: host, anchor: 'center' })
        .setLngLat([mission.lng, mission.lat])
        .addTo(this.map!)
      this.mapMarkers.push(marker)
    })

    const nearest = results[0]
    sheet.hidden = false
    sheet.innerHTML = `
      <div class="reaction-sheet-heading">
        <p class="eyebrow">${results.length}件の反応</p>
        <span class="quiet-badge">最寄り ${formatDistance(nearest.distance)}</span>
      </div>
      <h2>${escapeHtml(nearest.mission.title)}</h2>
      <p>${escapeHtml(nearest.mission.question)}</p>
      <div class="reaction-meta">
        <span data-expiry="${escapeHtml(nearest.mission.expiresAt)}">${formatRemaining(nearest.mission.expiresAt)}</span>
        <span>獲得 ${nearest.mission.rewardMiles} mile</span>
      </div>
      <a class="button button-primary button-full" href="${routeHref(`/missions/${nearest.mission.id}`)}" data-route>反応を確かめる</a>
    `
    this.startExpiryUpdates()
  }

  private startExpiryUpdates(): void {
    const update = () => {
      this.root.querySelectorAll<HTMLElement>('[data-expiry]').forEach((element) => {
        const expiresAt = element.dataset.expiry
        if (!expiresAt) return
        element.textContent = formatRemaining(expiresAt)
        if (remainingMilliseconds(expiresAt) <= 0) {
          element.closest('.mission-marker-host')?.remove()
        }
      })
    }
    update()
    this.timers.push(window.setInterval(update, 15_000))
  }

  private async loadMission(id: string): Promise<Mission | null> {
    try {
      return await this.dataAccess.missions.getActivePublicById(id)
    } catch {
      return null
    }
  }

  private async renderMissionDetail(id: string): Promise<void> {
    this.shell(this.loadingMarkup(), { backHref: '/' })
    const mission = await this.loadMission(id)
    if (!mission) {
      this.renderUnavailable()
      return
    }

    this.shell(
      `
        <main class="content-screen">
          <section class="mission-heading">
            <div class="heading-line">
              <p class="eyebrow">ミテキテ</p>
              <span class="expiry-badge" data-expiry="${escapeHtml(mission.expiresAt)}">${formatRemaining(mission.expiresAt)}</span>
            </div>
            <h1>${escapeHtml(mission.title)}</h1>
            <p class="mission-question">${escapeHtml(mission.question)}</p>
          </section>

          <section class="quiet-panel location-panel">
            <span class="panel-symbol" aria-hidden="true">⌖</span>
            <div>
              <span class="eyebrow">確認する場所</span>
              <p>地図上の反応地点を、公道から見える範囲で確認してください。</p>
            </div>
          </section>

          <section class="promise-section" aria-labelledby="promise-title">
            <p class="eyebrow">見守りの約束</p>
            <h2 id="promise-title">安全と静けさを、最優先に。</h2>
            <ul class="promise-cards">
              <li><span aria-hidden="true">人</span><strong>人を撮らない</strong></li>
              <li><span aria-hidden="true">道</span><strong>公道からだけ</strong></li>
              <li><span aria-hidden="true">止</span><strong>無理に近づかない</strong></li>
            </ul>
            ${mission.note ? `<p class="operator-note">${escapeHtml(mission.note)}</p>` : ''}
          </section>

          <section class="reward-preview">
            <span>回答後の獲得</span>
            <strong>+${mission.rewardMiles} mile</strong>
          </section>

          <div class="sticky-action">
            <a class="button button-primary button-full" href="${routeHref(`/missions/${mission.id}/answer`)}" data-route>
              この場所をミテキテする
            </a>
          </div>
        </main>
      `,
      { backHref: '/' },
    )
    this.startExpiryUpdates()
  }

  private async renderAnswer(id: string): Promise<void> {
    this.shell(this.loadingMarkup(), { backHref: `/missions/${id}` })
    const mission = await this.loadMission(id)
    if (!mission) {
      this.renderUnavailable()
      return
    }

    this.shell(
      `
        <main class="content-screen answer-screen">
          <section class="mission-heading compact">
            <div class="heading-line">
              <p class="eyebrow">回答</p>
              <span class="expiry-badge" data-expiry="${escapeHtml(mission.expiresAt)}">${formatRemaining(mission.expiresAt)}</span>
            </div>
            <h1>${escapeHtml(mission.question)}</h1>
            <p>${escapeHtml(mission.title)}</p>
          </section>

          <form class="answer-form" data-answer-form novalidate>
            <fieldset>
              <legend>見えた様子をひとつ選んでください</legend>
              <div class="choice-list">
                ${mission.choices
                  .map(
                    (choice, index) => `
                      <label class="choice-row">
                        <input type="radio" name="choice" value="${escapeHtml(choice)}" ${index === 0 ? 'checked' : ''}>
                        <span class="radio-mark" aria-hidden="true"></span>
                        <span>${escapeHtml(choice)}</span>
                      </label>
                    `,
                  )
                  .join('')}
              </div>
            </fieldset>

            <section class="photo-section">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">写真</p>
                  <h2>1枚だけ添えられます</h2>
                </div>
                <span class="quiet-badge">任意</span>
              </div>
              <label class="photo-picker" data-photo-picker>
                <input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment">
                <span class="photo-symbol" aria-hidden="true">＋</span>
                <strong>写真を選ぶ</strong>
                <small>人の顔や車のナンバーは写さないでください</small>
              </label>
              <div class="photo-preview" data-photo-preview hidden>
                <img alt="選択した写真のプレビュー" data-photo-image>
                <div>
                  <strong>送信前に縮小しました</strong>
                  <small data-photo-meta></small>
                  <button class="text-button" type="button" data-photo-remove>写真を外す</button>
                </div>
              </div>
            </section>

            <div class="confirmation-note">
              <span aria-hidden="true">時</span>
              <p><strong>確認時刻は送信時にサーバーで記録します。</strong><br>現在地は回答に含まれません。</p>
            </div>

            <p class="form-error" data-form-error role="alert" hidden></p>
            <button class="button button-primary button-full" type="submit" data-submit>
              <span data-submit-label>この内容で回答する</span>
            </button>
          </form>
        </main>
      `,
      { backHref: `/missions/${id}` },
    )
    this.startExpiryUpdates()

    const form = this.root.querySelector<HTMLFormElement>('[data-answer-form]')
    const photoInput = form?.elements.namedItem('photo') as HTMLInputElement | null
    let compressedPhoto: File | null = null

    photoInput?.addEventListener('change', async () => {
      const file = photoInput.files?.[0]
      if (!file) return
      const picker = this.root.querySelector<HTMLElement>('[data-photo-picker]')
      const errorElement = this.root.querySelector<HTMLElement>('[data-form-error]')
      picker?.classList.add('is-processing')
      if (errorElement) errorElement.hidden = true

      try {
        compressedPhoto = await compressPhoto(file)
        const preview = this.root.querySelector<HTMLElement>('[data-photo-preview]')
        const image = this.root.querySelector<HTMLImageElement>('[data-photo-image]')
        const meta = this.root.querySelector<HTMLElement>('[data-photo-meta]')
        if (image) image.src = URL.createObjectURL(compressedPhoto)
        if (meta) meta.textContent = `${formatFileSize(compressedPhoto.size)}・長辺1600px以内`
        if (preview) preview.hidden = false
        if (picker) picker.hidden = true
      } catch (error) {
        compressedPhoto = null
        photoInput.value = ''
        if (errorElement) {
          errorElement.textContent =
            error instanceof Error ? error.message : '写真を処理できませんでした。'
          errorElement.hidden = false
        }
      } finally {
        picker?.classList.remove('is-processing')
      }
    })

    this.root.querySelector('[data-photo-remove]')?.addEventListener('click', () => {
      const image = this.root.querySelector<HTMLImageElement>('[data-photo-image]')
      if (image?.src) URL.revokeObjectURL(image.src)
      compressedPhoto = null
      if (photoInput) photoInput.value = ''
      const preview = this.root.querySelector<HTMLElement>('[data-photo-preview]')
      const picker = this.root.querySelector<HTMLElement>('[data-photo-picker]')
      if (preview) preview.hidden = true
      if (picker) picker.hidden = false
    })

    form?.addEventListener('submit', async (event) => {
      event.preventDefault()
      const selected = new FormData(form).get('choice')
      const submitButton = this.root.querySelector<HTMLButtonElement>('[data-submit]')
      const submitLabel = this.root.querySelector<HTMLElement>('[data-submit-label]')
      const errorElement = this.root.querySelector<HTMLElement>('[data-form-error]')
      if (typeof selected !== 'string' || !selected) {
        if (errorElement) {
          errorElement.textContent = '見えた様子をひとつ選んでください。'
          errorElement.hidden = false
        }
        return
      }

      if (submitButton) submitButton.disabled = true
      if (submitLabel) submitLabel.textContent = '回答を届けています'
      if (errorElement) errorElement.hidden = true

      try {
        const receipt = await this.dataAccess.answers.submit({
          missionId: mission.id,
          choice: selected,
          photo: compressedPhoto,
        })
        sessionStorage.setItem(RECEIPT_SESSION_KEY, JSON.stringify(receipt))
        this.navigate('/complete')
      } catch (error) {
        if (errorElement) {
          errorElement.textContent =
            error instanceof Error ? error.message : '回答を送信できませんでした。'
          errorElement.hidden = false
        }
        if (submitButton) submitButton.disabled = false
        if (submitLabel) submitLabel.textContent = 'この内容で回答する'
      }
    })
  }

  private renderComplete(): void {
    const rawReceipt = sessionStorage.getItem(RECEIPT_SESSION_KEY)
    let receipt: AnswerReceipt | null = null
    try {
      receipt = rawReceipt ? (JSON.parse(rawReceipt) as AnswerReceipt) : null
    } catch {
      receipt = null
    }

    if (!receipt) {
      this.shell(
        `
          <main class="center-screen">
            <div class="completion-mark muted">済</div>
            <h1>完了情報はありません</h1>
            <p>確認時刻とマイルは、回答直後のこのタブだけに表示します。</p>
            <a class="button button-primary button-full" href="${routeHref('/')}" data-route>地図へ戻る</a>
          </main>
        `,
      )
      return
    }

    this.shell(
      `
        <main class="center-screen completion-screen">
          <p class="eyebrow">ミテキテ完了</p>
          <div class="completion-mark" aria-hidden="true">
            <span></span><span></span><span></span>
            <strong>参</strong>
          </div>
          <h1>参りました</h1>
          <p class="completion-copy">静かな見守りを、ありがとうございました。</p>

          <section class="confirmed-time">
            <span class="eyebrow">確認時刻</span>
            <strong>${escapeHtml(formatConfirmedAt(receipt.confirmedAt))}</strong>
            <small>サーバー記録時刻</small>
          </section>

          <section class="miles-total">
            <div>
              <span>今回</span>
              <strong>+${receipt.earnedMiles} mile</strong>
            </div>
            <div class="total-line">
              <span>累計マイル</span>
              <strong>${receipt.totalMiles} mile</strong>
            </div>
          </section>

          <a class="button button-primary button-full" href="${routeHref('/')}" data-route>地図へ戻る</a>
          <p class="privacy-note">ランキング・交換機能はありません</p>
        </main>
      `,
    )
  }

  private renderUnavailable(): void {
    this.shell(
      `
        <main class="center-screen">
          <div class="completion-mark muted">静</div>
          <h1>この反応は消えました</h1>
          <p>期限が過ぎたか、公開が終了したミッションです。</p>
          <a class="button button-primary button-full" href="${routeHref('/')}" data-route>地図へ戻る</a>
        </main>
      `,
      { backHref: '/' },
    )
  }

  private loadingMarkup(): string {
    return `
      <main class="center-screen" aria-busy="true">
        <div class="loading-ripple" aria-hidden="true"></div>
        <p>反応を確かめています</p>
      </main>
    `
  }
}

void new MairuApp(appRoot).start()
