import { SoundLibraryPackage } from '../../types/music';

export const VERIFIED_SOUND_PACKAGES: SoundLibraryPackage[] = [
  {
    id: 'pkg_orchestral_essentials',
    name: 'Orchestral Essentials',
    category: 'orchestral',
    version: '2.1.0',
    instrumentsCount: 12,
    totalSamples: 288,
    license: 'CC0-1.0 (Public Domain / Commercial Safe)',
    commercialUse: true,
    attributionRequired: false,
    author: 'Khimea Acoustic Sound Research',
    provenance: 'Curated Open Acoustic Multisample Archive (CC0)',
    instruments: [
      'Solo Violin',
      'Violin Ensemble',
      'Viola Ensemble',
      'Cello Section',
      'Orchestral Contrabass',
      'French Horn Section',
      'Solo Trumpet',
      'Trombones & Tuba Section',
      'Concert Wooden Flute',
      'Orchestral Oboe',
      'Clarinet Section',
      'Concert Grand Piano',
    ],
    articulations: ['sustain', 'legato', 'staccato', 'spiccato', 'pizzicato', 'tremolo', 'marcato'],
    description:
      'Foundational symphonic scoring palette covering complete strings, brass, woodwinds, and concert grand piano with authentic multisampling across velocity layers.',
    installed: true,
  },
  {
    id: 'pkg_dark_fantasy',
    name: 'Dark Fantasy Scoring Suite',
    category: 'dark_fantasy',
    version: '1.4.0',
    instrumentsCount: 9,
    totalSamples: 144,
    license: 'CC0-1.0 (Public Domain / Commercial Safe)',
    commercialUse: true,
    attributionRequired: false,
    author: 'Khimea Acoustic Sound Research',
    provenance: 'Gothic Chamber & Catacomb Sessions (CC0)',
    instruments: [
      'Cinematic Felt Piano',
      'Cello Section',
      'Orchestral Contrabass',
      'French Horn Section',
      'Low Male Choir',
      'Taiko War Drums',
      'Dark Atmospheric Drone',
      'Concert Celtic Harp',
      'Tuned Timpani',
    ],
    articulations: ['sustain', 'legato', 'staccato', 'pizzicato', 'marcato', 'accent'],
    description:
      'Gothic scoring toolkit engineered for melancholic exploration, somber cathedrals, crumbling castles, and climactic boss battles.',
    installed: true,
  },
  {
    id: 'pkg_medieval',
    name: 'Medieval & Renaissance Suite',
    category: 'medieval',
    version: '1.3.0',
    instrumentsCount: 7,
    totalSamples: 112,
    license: 'CC0-1.0 (Public Domain / Commercial Safe)',
    commercialUse: true,
    attributionRequired: false,
    author: 'Khimea Early Music Guild',
    provenance: 'Historic Instrument Preservation Archive (CC0)',
    instruments: [
      'Concert Celtic Harp',
      'Medieval Lute & Acoustic Guitar',
      'Wooden Flute',
      'Rustic Mandolin',
      'Frame Drums',
      'Bells & Tubular Chimes',
      'Viola Ensemble',
    ],
    articulations: ['sustain', 'staccato', 'pizzicato', 'normal', 'accent'],
    description:
      'Authentic acoustic instruments for tavern ambiance, rustic villages, castle feasts, and nomadic frontier journeys.',
    installed: true,
  },
  {
    id: 'pkg_horror',
    name: 'Gothic & Survival Horror Textures',
    category: 'horror',
    version: '1.5.2',
    instrumentsCount: 8,
    totalSamples: 96,
    license: 'CC0-1.0 (Public Domain / Commercial Safe)',
    commercialUse: true,
    attributionRequired: false,
    author: 'Khimea Sound Design Core',
    provenance: 'Industrial Psychoacoustic Acoustic Sessions (CC0)',
    instruments: [
      'Dissonant Bowed Strings',
      'Tremolo Horror Textures',
      'Reverse Sound Impacts',
      'Subterranean Wind Rumbles',
      'Metal Clashes & Scrapes',
      'Dark Atmospheric Drone',
      'Sub Basso Drones',
      'Pizzicato Cello Stabs',
    ],
    articulations: ['tremolo', 'spiccato', 'sustain', 'accent'],
    description:
      'Chilling tonal textures, dissonant cluster bends, scraping metal resonance, and psychological tension drones for survival horror.',
    installed: true,
  },
  {
    id: 'pkg_cinematic_percussion',
    name: 'Cinematic War Percussion & Taikos',
    category: 'cinematic_percussion',
    version: '2.0.1',
    instrumentsCount: 7,
    totalSamples: 120,
    license: 'CC0-1.0 (Public Domain / Commercial Safe)',
    commercialUse: true,
    attributionRequired: false,
    author: 'Khimea Sound Design Core',
    provenance: 'Soundstage Percussion Recording Collective (CC0)',
    instruments: [
      'Cinematic Taiko War Drums',
      'Orchestral Timpani',
      'Gran Cassa Bass Drum',
      'Field War Snares Ensemble',
      'Bronze Gongs & Tam-Tams',
      'Suspended Cymbals',
      'Metal Anvil Impacts',
    ],
    articulations: ['normal', 'accent', 'staccato'],
    description:
      'Heavy subterranean taikos, tuned orchestral timpanis, field war snares, bronze gongs, and seismic sub impacts for action and boss battles.',
    installed: true,
  },
  {
    id: 'pkg_ambient',
    name: 'Ambient Drones & Soundscapes',
    category: 'ambient',
    version: '1.2.0',
    instrumentsCount: 6,
    totalSamples: 72,
    license: 'CC0-1.0 (Public Domain / Commercial Safe)',
    commercialUse: true,
    attributionRequired: false,
    author: 'Khimea Ambient Lab',
    provenance: 'Field Acoustics & Spectral Resynthesis (CC0)',
    instruments: [
      'Orchestral Drone Beds',
      'Dark Atmospheric Drone',
      'Evolving Pad Textures',
      'Wind & Mist Atmospheric Shimmers',
      'Low Frequency Rumbles',
      'Harmonic Chimes & Bells',
    ],
    articulations: ['sustain'],
    description:
      'Hypnotic evolving sub-drone beds, atmospheric pad shimmers, and evocative soundscapes for open-world exploration.',
    installed: true,
  },
  {
    id: 'pkg_electronic',
    name: 'Cinematic Hybrid Electronic',
    category: 'electronic',
    version: '1.1.0',
    instrumentsCount: 6,
    totalSamples: 84,
    license: 'CC0-1.0 (Public Domain / Commercial Safe)',
    commercialUse: true,
    attributionRequired: false,
    author: 'Khimea Hybrid Synthesis Unit',
    provenance: 'Analog Modular & Acoustic Re-amping Lab (CC0)',
    instruments: [
      'Heavy Sub Bass Braam',
      'Cybernetic Arp Bass',
      'Cinematic Risers',
      'Sub Low Drop Impacts',
      'Distorted Analog Leads',
      'Granular Texture Drones',
    ],
    articulations: ['sustain', 'staccato', 'accent'],
    description:
      'Modern hybrid cinematic synthesis blending analog modular warmth with acoustic orchestral layering for sci-fi, cyberpunk, and modern action.',
    installed: true,
  },
  {
    id: 'pkg_low_choir',
    name: 'Low Male Choir & Gothic Chants',
    category: 'choir',
    version: '1.0.0',
    instrumentsCount: 4,
    totalSamples: 64,
    license: 'CC0-1.0 (Public Domain / Commercial Safe)',
    commercialUse: true,
    attributionRequired: false,
    author: 'Khimea Vocal Formant Project',
    provenance: 'Acoustic Cathedral Formant Study (CC0)',
    instruments: [
      'Basso Profondo Male Section',
      'Baritone Sacred Chants',
      'Ethereal Female Choir',
      'Gothic Vocal Drone Pads',
    ],
    articulations: ['sustain', 'accent', 'legato'],
    description:
      'Deep basso profondo and baritone choral pads chanting dark acoustic vowels (Ooh / Aah) for ancient shrines and boss encounters.',
    installed: true,
  },
];

export class SoundLibraryManager {
  private static packages = [...VERIFIED_SOUND_PACKAGES];

  public static getPackages(): SoundLibraryPackage[] {
    return this.packages;
  }

  public static togglePackage(id: string): void {
    const pkg = this.packages.find((p) => p.id === id);
    if (pkg) {
      pkg.installed = !pkg.installed;
    }
  }

  public static getLicenseInfo(id: string) {
    const pkg = this.packages.find((p) => p.id === id);
    if (!pkg) return null;
    return {
      library: pkg.name,
      license: pkg.license,
      commercialUse: pkg.commercialUse,
      attributionRequired: pkg.attributionRequired,
      author: pkg.author,
      provenance: pkg.provenance,
    };
  }
}
