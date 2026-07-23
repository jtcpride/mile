import type { Coordinates } from '../types'

const EARTH_RADIUS_METERS = 6_371_000

export function distanceInMeters(from: Coordinates, to: Coordinates): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const deltaLat = toRadians(to.lat - from.lat)
  const deltaLng = toRadians(to.lng - from.lng)

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2
  const angularDistance = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return EARTH_RADIUS_METERS * angularDistance
}

export function formatDistance(meters: number): string {
  if (meters < 1_000) {
    return `${Math.max(10, Math.round(meters / 10) * 10)}m`
  }
  return `${(meters / 1_000).toFixed(1)}km`
}

