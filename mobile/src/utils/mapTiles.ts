export function latLngToOsmTile(lat: number, lng: number, zoom = 15): string {
    const n = Math.pow(2, zoom);
    const rad = (lat * Math.PI) / 180;
    const x = Math.floor(((lng + 180) / 360) * n);
    const y = Math.floor((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2 * n);
    // Standard OSM tile URL: (Note: CartoDB Voyager is high-dpi and cleaner for mobile)
    return `https://basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${x}/${y}.png`;
}
