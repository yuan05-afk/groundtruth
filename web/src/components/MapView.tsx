import {
  Map as MapLibreMap,
  Popup,
  NavigationControl,
  ScaleControl,
  LngLatBounds,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type MapLayerMouseEvent,
  type Map as MapLibreMapType,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { type MuniFeature, type Project, LABELS, fmtKm, loadMunicipalities } from '../lib/data'

export const LABEL_COLORS = {
  records: '#b3402a',
  field: '#2d4a8a',
  low: '#9c9686',
  insufficient: '#c9c1ae',
}

type Props = {
  points: Project[]
  selected: Project | null
  related: Project[]
  basemap: 'map' | 'satellite'
  onSelect: (i: number) => void
  drawerOpen: boolean
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function centroidOf(f: MuniFeature): [number, number] {
  const rings = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat()
  let best = rings[0]
  for (const r of rings) if (r.length > best.length) best = r
  let x = 0
  let y = 0
  for (const [a, b] of best) {
    x += a
    y += b
  }
  return [x / best.length, y / best.length]
}

function bboxOf(f: MuniFeature): [number, number, number, number] {
  const rings = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat()
  let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const r of rings)
    for (const [x, y] of r) {
      a = Math.min(a, x)
      b = Math.min(b, y)
      c = Math.max(c, x)
      d = Math.max(d, y)
    }
  return [a, b, c, d]
}

function restyle(map: MapLibreMapType) {
  const set = (id: string, prop: string, value: unknown) => {
    if (map.getLayer(id)) {
      // OpenFreeMap layer paint keys vary by style version.
      ;(map as MapLibreMapType & { setPaintProperty: (a: string, b: string, c: unknown) => void }).setPaintProperty(
        id,
        prop,
        value,
      )
    }
  }
  set('background', 'background-color', '#efebe1')
  set('water', 'fill-color', '#d3dcdd')
  set('park', 'fill-color', '#e6e4d6')
  set('landcover_wood', 'fill-color', '#e7e5d8')
  set('landuse_residential', 'fill-color', '#ebe6db')
  set('waterway', 'line-color', '#a7bcc2')
  set('building', 'fill-color', '#e2ddd0')
  for (const id of ['boundary_2', 'boundary_3']) set(id, 'line-color', '#b9b1a0')
}

export function MapView({ points, selected, related, basemap, onSelect, drawerOpen }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMapType | null>(null)
  const ready = useRef<Promise<void> | null>(null)
  const munisRef = useRef<Map<number, MuniFeature> | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!ref.current) return
    const map = new MapLibreMap({
      container: ref.current,
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [122.3, 12.2],
      zoom: 4.9,
      minZoom: 4,
      maxZoom: 18,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-left')
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
    mapRef.current = map

    ready.current = new Promise((resolve) => {
      map.on('load', () => {
        restyle(map)
        map.addSource('esri', {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          maxzoom: 19,
          attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
        })
        map.addLayer({ id: 'esri', type: 'raster', source: 'esri', layout: { visibility: 'none' } })

        map.addSource('munis', { type: 'geojson', data: EMPTY })
        map.addLayer({
          id: 'muni-actual-fill',
          type: 'fill',
          source: 'munis',
          filter: ['in', ['get', 'mid'], ['literal', []]],
          paint: { 'fill-color': '#1b1a16', 'fill-opacity': 0.05 },
        })
        map.addLayer({
          id: 'muni-actual-line',
          type: 'line',
          source: 'munis',
          filter: ['in', ['get', 'mid'], ['literal', []]],
          paint: { 'line-color': '#1b1a16', 'line-width': 1, 'line-opacity': 0.55 },
        })
        map.addLayer({
          id: 'muni-claimed-fill',
          type: 'fill',
          source: 'munis',
          filter: ['in', ['get', 'mid'], ['literal', []]],
          paint: { 'fill-color': '#b3402a', 'fill-opacity': 0.07 },
        })
        map.addLayer({
          id: 'muni-claimed-line',
          type: 'line',
          source: 'munis',
          filter: ['in', ['get', 'mid'], ['literal', []]],
          paint: { 'line-color': '#b3402a', 'line-width': 1.6, 'line-dasharray': [2, 1.5] },
        })

        map.addSource('pts', { type: 'geojson', data: EMPTY })
        map.addLayer({
          id: 'pts',
          type: 'circle',
          source: 'pts',
          layout: {
            'circle-sort-key': ['match', ['get', 'L'], 'records', 3, 'field', 2, 'insufficient', 1, 0],
          },
          paint: {
            'circle-color': [
              'match',
              ['get', 'L'],
              'records',
              LABEL_COLORS.records,
              'field',
              LABEL_COLORS.field,
              'insufficient',
              LABEL_COLORS.insufficient,
              LABEL_COLORS.low,
            ],
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              ['match', ['get', 'L'], 'records', 2.6, 'field', 2.3, 1.5],
              9,
              ['match', ['get', 'L'], 'records', 5, 'field', 4.5, 3],
              14,
              ['match', ['get', 'L'], 'records', 8, 'field', 7, 5],
            ],
            'circle-opacity': ['match', ['get', 'L'], 'low', 0.5, 'insufficient', 0.7, 0.92],
            'circle-stroke-color': '#f6f3ec',
            'circle-stroke-width': ['match', ['get', 'L'], 'low', 0, 0.6],
          },
        })

        map.addSource('sel', { type: 'geojson', data: EMPTY })
        map.addLayer({
          id: 'sel-lines',
          type: 'line',
          source: 'sel',
          filter: ['==', ['get', 'kind'], 'line'],
          paint: {
            'line-color': ['match', ['get', 'role'], 'water', '#2b6f8f', '#b3402a'],
            'line-width': 1.6,
            'line-dasharray': [1.5, 1.5],
          },
        })
        map.addLayer({
          id: 'sel-related',
          type: 'circle',
          source: 'sel',
          filter: ['==', ['get', 'kind'], 'related'],
          paint: {
            'circle-radius': 7,
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-color': '#1b1a16',
            'circle-stroke-width': 1.2,
          },
        })
        map.addLayer({
          id: 'sel-water',
          type: 'circle',
          source: 'sel',
          filter: ['==', ['get', 'kind'], 'water'],
          paint: { 'circle-radius': 4, 'circle-color': '#2b6f8f', 'circle-stroke-color': '#f6f3ec', 'circle-stroke-width': 1.5 },
        })
        map.addLayer({
          id: 'sel-ring',
          type: 'circle',
          source: 'sel',
          filter: ['==', ['get', 'kind'], 'pin'],
          paint: {
            'circle-radius': 15,
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-color': '#1b1a16',
            'circle-stroke-width': 1.4,
          },
        })
        map.addLayer({
          id: 'sel-pin',
          type: 'circle',
          source: 'sel',
          filter: ['==', ['get', 'kind'], 'pin'],
          paint: { 'circle-radius': 5.5, 'circle-color': '#1b1a16', 'circle-stroke-color': '#f6f3ec', 'circle-stroke-width': 2 },
        })
        map.addLayer({
          id: 'sel-labels',
          type: 'symbol',
          source: 'sel',
          filter: ['==', ['get', 'kind'], 'label'],
          layout: {
            'text-field': ['get', 'text'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 12,
            'text-offset': [0, -1.1],
            'text-allow-overlap': true,
          },
          paint: {
            'text-color': ['match', ['get', 'role'], 'water', '#1f5670', '#8f3120'],
            'text-halo-color': '#f6f3ec',
            'text-halo-width': 2,
          },
        })

        const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 10, className: 'gt-popup' })
        map.on('mouseenter', 'pts', (e: MapLayerMouseEvent) => {
          map.getCanvas().style.cursor = 'pointer'
          const f = e.features?.[0]
          if (!f) return
          const props = f.properties as { t: string; L: keyof typeof LABELS }
          popup
            .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
            .setHTML(`<div class="gt-popup-label l-${props.L}">${LABELS[props.L].name}</div><div class="gt-popup-title"></div>`)
            .addTo(map)
          const el = popup.getElement()?.querySelector('.gt-popup-title')
          if (el) el.textContent = props.t
        })
        map.on('mouseleave', 'pts', () => {
          map.getCanvas().style.cursor = ''
          popup.remove()
        })
        map.on('click', 'pts', (e: MapLayerMouseEvent) => {
          const f = e.features?.[0]
          if (f) onSelectRef.current(Number(f.properties?.i))
        })
        resolve()
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    ready.current?.then(() => {
      if (!map) return
      const fc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: points.map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          properties: { i: p.i, L: p.L, t: p.t },
        })),
      }
      ;(map.getSource('pts') as GeoJSONSource).setData(fc)
    })
  }, [points])

  useEffect(() => {
    const map = mapRef.current
    ready.current?.then(() => {
      if (!map) return
      map.setLayoutProperty('esri', 'visibility', basemap === 'satellite' ? 'visible' : 'none')
    })
  }, [basemap])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    let cancelled = false
    ready.current?.then(async () => {
      const sel = map.getSource('sel') as GeoJSONSource
      if (!selected) {
        sel.setData(EMPTY)
        for (const id of ['muni-actual-fill', 'muni-actual-line', 'muni-claimed-fill', 'muni-claimed-line'])
          map.setFilter(id, ['in', ['get', 'mid'], ['literal', []]])
        return
      }
      if (!munisRef.current) {
        const fc = await loadMunicipalities()
        ;(map.getSource('munis') as GeoJSONSource).setData(fc)
        munisRef.current = new Map(fc.features.map((f: MuniFeature) => [f.properties.mid, f]))
      }
      if (cancelled) return
      const munis = munisRef.current
      const p = selected
      const claimed = [...new Set([p.fm, p.tm].filter((m): m is number => m !== null))]
      const actual = p.am !== null && !claimed.includes(p.am) ? [p.am] : []
      map.setFilter('muni-claimed-fill', ['in', ['get', 'mid'], ['literal', claimed]])
      map.setFilter('muni-claimed-line', ['in', ['get', 'mid'], ['literal', claimed]])
      map.setFilter('muni-actual-fill', ['in', ['get', 'mid'], ['literal', actual]])
      map.setFilter('muni-actual-line', ['in', ['get', 'mid'], ['literal', actual]])

      const pin: [number, number] = [p.lon, p.lat]
      const features: GeoJSON.Feature[] = [{ type: 'Feature', geometry: { type: 'Point', coordinates: pin }, properties: { kind: 'pin' } }]
      const bounds = new LngLatBounds(pin, pin)

      const disagree = p.sig.find((s) => s.code === 'record_fields_disagree')
      for (const m of claimed) {
        const f = munis.get(m)
        if (!f) continue
        const bb = bboxOf(f)
        const c = centroidOf(f)
        const measured = m === p.sm ? (p.md ?? 0) : (disagree?.value ?? haversineKm(pin, c))
        if (p.am !== m && measured > 3) {
          features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [pin, c] }, properties: { kind: 'line', role: 'muni' } })
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [(pin[0] + c[0]) / 2, (pin[1] + c[1]) / 2] },
            properties: { kind: 'label', role: 'muni', text: `${f.properties.name}: ${fmtKm(measured)} from the pin` },
          })
        }
        bounds.extend([bb[0], bb[1]])
        bounds.extend([bb[2], bb[3]])
      }
      if (p.wp && p.wd !== null && p.wd > 0.05) {
        const w: [number, number] = [p.wp[1], p.wp[0]]
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [pin, w] }, properties: { kind: 'line', role: 'water' } })
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: w }, properties: { kind: 'water' } })
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: w },
          properties: { kind: 'label', role: 'water', text: `${p.wn ?? 'river'}, ${fmtKm(p.wd)}` },
        })
        bounds.extend(w)
      }
      for (const r of related) {
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.lon, r.lat] }, properties: { kind: 'related' } })
      }
      sel.setData({ type: 'FeatureCollection', features })

      const container = map.getContainer()
      const right = drawerOpen ? Math.min(500, container.clientWidth * 0.5) : 60
      map.fitBounds(bounds as LngLatBoundsLike, {
        padding: { top: 80, bottom: 80, left: 60, right: right + 40 },
        maxZoom: 14.5,
        duration: 1400,
        essential: true,
      })
    })
    return () => {
      cancelled = true
    }
  }, [selected, related, drawerOpen])

  return <div ref={ref} className="map" />
}

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
