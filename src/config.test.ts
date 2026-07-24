import { describe, expect, it } from 'vitest'

import { MAP_STYLE } from './config'

describe('base map configuration', () => {
  it('uses one raster tile source with visible attribution', () => {
    const source = MAP_STYLE.sources.openStreetMap

    expect(source.type).toBe('raster')
    if (source.type !== 'raster') throw new Error('The base map source must be raster.')
    expect(source.tiles).toEqual(['https://tile.openstreetmap.org/{z}/{x}/{y}.png'])
    expect(source.attribution).toContain('OpenStreetMap')
    expect(MAP_STYLE.layers).toHaveLength(1)
  })
})
