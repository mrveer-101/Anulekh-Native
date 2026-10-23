import { Linking, Alert } from 'react-native';

/**
 * Structure of a search result for a college, university, school, or exam center.
 */
export interface PlaceSearchResult {
  id: string;
  name: string;
  address: string;
  lat?: string;
  lon?: string;
  category?: 'University' | 'College' | 'School' | 'Exam Center' | 'Library' | 'Institution';
  mapsUrl: string;
}

/**
 * Returns a universal Google Maps URL for a venue, address, or coordinate pair.
 * Can be opened in Google Maps app on native or browser on web.
 */
export function getGoogleMapsUrl(
  venueOrUrl?: string | null,
  lat?: number | string | null,
  lon?: number | string | null
): string {
  if (!venueOrUrl && !lat) return '';

  const clean = (venueOrUrl || '').trim();

  // If already an HTTP/HTTPS link to Google Maps or web, return it directly
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return clean;
  }

  // If coordinates provided, direct pin query
  if (lat && lon) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  }

  if (!clean) return '';

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clean)}`;
}

/**
 * Opens Google Maps in the native Google Maps app or browser navigation.
 */
export async function openGoogleMaps(
  venueOrUrl?: string | null,
  lat?: number | string | null,
  lon?: number | string | null
): Promise<void> {
  const url = getGoogleMapsUrl(venueOrUrl, lat, lon);
  if (!url) {
    Alert.alert('Location unavailable', 'No exam venue address is available.');
    return;
  }

  try {
    const supported = await Linking.canOpenURL(url).catch(() => true);
    if (supported) {
      await Linking.openURL(url);
    } else {
      await Linking.openURL(url);
    }
  } catch (err: any) {
    console.error('Failed to open Google Maps URL:', err);
    Alert.alert('Could not open Maps', 'Please check your internet connection or Google Maps app.');
  }
}

/** Curated major educational institutions across India for instant selection & offline fallback */
export const POPULAR_EXAM_CENTERS: PlaceSearchResult[] = [
  {
    id: 'pop-1',
    name: "St. Xavier's College",
    address: '5, Mahapalika Marg, Dhobi Talao, Fort, Mumbai, Maharashtra 400001',
    lat: '18.9429649',
    lon: '72.8314839',
    category: 'College',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=18.9429649,72.8314839',
  },
  {
    id: 'pop-2',
    name: 'Mumbai University (Kalina Campus)',
    address: 'Vidya Nagari, Kalina, Santacruz East, Mumbai, Maharashtra 400098',
    lat: '19.0736',
    lon: '72.8596',
    category: 'University',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=19.0736,72.8596',
  },
  {
    id: 'pop-3',
    name: 'IIT Bombay (Indian Institute of Technology)',
    address: 'Main Gate Rd, IIT Area, Powai, Mumbai, Maharashtra 400076',
    lat: '19.1326186',
    lon: '72.9149702',
    category: 'University',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=19.1326186,72.9149702',
  },
  {
    id: 'pop-4',
    name: 'Gujarat University',
    address: 'Navrangpura, Ahmedabad, Gujarat 380009',
    lat: '23.0371',
    lon: '72.5458',
    category: 'University',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=23.0371,72.5458',
  },
  {
    id: 'pop-5',
    name: 'L.D. College of Engineering',
    address: '120 Circular Road, University Area, Navrangpura, Ahmedabad, Gujarat 380015',
    lat: '23.0328',
    lon: '72.5463',
    category: 'College',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=23.0328,72.5463',
  },
  {
    id: 'pop-6',
    name: 'Delhi Public School (R.K. Puram)',
    address: 'Kaifi Azmi Marg, Sector 12, Rama Krishna Puram, New Delhi, Delhi 110022',
    lat: '28.5672',
    lon: '77.1738',
    category: 'School',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=28.5672,77.1738',
  },
  {
    id: 'pop-7',
    name: 'Delhi University (North Campus)',
    address: 'University Enclave, New Delhi, Delhi 110007',
    lat: '28.6892',
    lon: '77.2098',
    category: 'University',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=28.6892,77.2098',
  },
  {
    id: 'pop-8',
    name: 'Blind People\'s Association (BPA India)',
    address: 'Jagdish Patel Chowk, Surdas Marg, Vastrapur, Ahmedabad, Gujarat 380015',
    lat: '23.0336',
    lon: '72.5283',
    category: 'Exam Center',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=23.0336,72.5283',
  },
  {
    id: 'pop-9',
    name: 'National Library of India',
    address: 'Belvedere Rd, Block A, Alipore, Kolkata, West Bengal 700027',
    lat: '22.5332',
    lon: '88.3331',
    category: 'Library',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=22.5332,88.3331',
  },
];

/**
 * Searches real colleges, universities, and exam centers via Nominatim OpenStreetMap API,
 * with local curated presets for instant suggestions and offline resiliency.
 */
export async function searchCollegesAndPlaces(query: string): Promise<PlaceSearchResult[]> {
  const clean = (query || '').trim();

  // If query is blank, return curated popular institutions
  if (clean.length < 2) {
    return POPULAR_EXAM_CENTERS;
  }

  const results: PlaceSearchResult[] = [];

  // Match local curated items first for instant responsiveness
  const queryLower = clean.toLowerCase();
  const localMatches = POPULAR_EXAM_CENTERS.filter(
    (p) =>
      p.name.toLowerCase().includes(queryLower) ||
      p.address.toLowerCase().includes(queryLower)
  );
  results.push(...localMatches);

  // Query live Nominatim place search API with a 3.5-second timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      clean
    )}&addressdetails=1&limit=8`;

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AnulekhScribeApp/1.0',
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        data.forEach((item: any) => {
          const name = item.name || item.display_name?.split(',')[0] || clean;
          const address = item.display_name || clean;
          const lat = item.lat;
          const lon = item.lon;
          const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat || ''},${lon || ''}`;

          let category: PlaceSearchResult['category'] = 'Institution';
          const type = (item.type || '').toLowerCase();
          const cls = (item.class || '').toLowerCase();
          if (type.includes('college') || cls.includes('college')) category = 'College';
          else if (type.includes('university') || cls.includes('university')) category = 'University';
          else if (type.includes('school') || cls.includes('school')) category = 'School';
          else if (type.includes('library') || cls.includes('library')) category = 'Library';

          // Avoid duplicates with local matches
          if (!results.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
            results.push({
              id: `osm-${item.place_id || Math.random()}`,
              name,
              address,
              lat,
              lon,
              category,
              mapsUrl: lat && lon ? mapsUrl : getGoogleMapsUrl(name + ', ' + address),
            });
          }
        });
      }
    }
  } catch {
    // Fail gracefully: local matches are already populated
  }

  return results;
}
