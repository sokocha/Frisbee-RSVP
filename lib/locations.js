// Structured location data for Lagos
// Areas organized by general region for easy selection

export const LAGOS_AREAS = [
  // Island areas
  'Victoria Island',
  'Ikoyi',
  'Lekki Phase 1',
  'Lekki Phase 2',
  'Ajah',
  'Lagos Island',
  'Oniru',
  'Banana Island',

  // Mainland - Ikeja axis
  'Ikeja',
  'Maryland',
  'Ojodu',
  'Ogba',
  'Agidingbi',
  'Alausa',
  'GRA Ikeja',
  'Allen Avenue',
  'Opebi',

  // Mainland - Yaba/Surulere axis
  'Yaba',
  'Surulere',
  'Gbagada',
  'Anthony',
  'Ogudu',
  'Magodo',
  'Ketu',
  'Ojota',

  // Mainland - Other areas
  'Ikorodu',
  'Festac',
  'Apapa',
  'Mushin',
  'Oshodi',
  'Isolo',
  'Ejigbo',
  'Egbeda',
  'Alimosho',
  'Agege',
  'Badagry',
  'Epe',
].sort();

// Format location for storage and display
export function formatLocation(area) {
  if (!area) return '';
  return `${area}, Lagos`;
}

// Get just the area from a formatted location string
export function parseArea(locationString) {
  if (!locationString) return '';
  // Handle "Area, Lagos" format
  const parts = locationString.split(',').map(p => p.trim());
  return parts[0] || '';
}
