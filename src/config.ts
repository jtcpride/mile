import type { Coordinates } from './types'
import type { StyleSpecification } from 'maplibre-gl'

export const DEFAULT_CENTER: Coordinates = {
  lat: 35.0116,
  lng: 135.7681,
}

export const DEFAULT_CENTER_LABEL = '京都市中心部'
export const DETECTION_RADIUS_METERS = 3_000
export const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    openStreetMap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'openStreetMap',
      type: 'raster',
      source: 'openStreetMap',
      paint: {
        'raster-saturation': -0.58,
        'raster-contrast': -0.12,
        'raster-brightness-min': 0.12,
        'raster-brightness-max': 0.92,
      },
    },
  ],
}
export const PHOTO_MAX_DIMENSION = 1_600
export const PHOTO_TARGET_BYTES = 1_000_000
