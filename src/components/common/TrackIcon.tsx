import React from 'react';
import {
  Music,
  Music2,
  Disc,
  Volume2,
  Zap,
  Mic2,
  Wind,
  Sparkles,
  Cpu,
  Layers,
  Activity,
  Flame,
  Waves,
  Radio,
  Bell,
  LucideIcon,
} from 'lucide-react';

export interface IconOption {
  id: string;
  name: string;
  category: string;
  icon: LucideIcon;
}

export const TRACK_ICON_OPTIONS: IconOption[] = [
  { id: 'piano', name: 'Grand Piano', category: 'Keys', icon: Music },
  { id: 'strings', name: 'Strings Ensemble', category: 'Strings', icon: Activity },
  { id: 'cello', name: 'Cello / Viola', category: 'Strings', icon: Music2 },
  { id: 'bass', name: 'Contrabass / Bass', category: 'Bass', icon: Waves },
  { id: 'brass', name: 'French Horn / Brass', category: 'Brass', icon: Radio },
  { id: 'trombones', name: 'Trombones', category: 'Brass', icon: Flame },
  { id: 'choir', name: 'Choir / Vocals', category: 'Vocal', icon: Mic2 },
  { id: 'flute', name: 'Flute / Woodwinds', category: 'Woodwinds', icon: Wind },
  { id: 'harp', name: 'Harp / Plucked', category: 'Plucked', icon: Sparkles },
  { id: 'drum', name: 'Taiko / Drums', category: 'Drums', icon: Disc },
  { id: 'bell', name: 'Timpani / Percussion', category: 'Percussion', icon: Bell },
  { id: 'synth', name: 'Synthesizer Lead', category: 'Electronic', icon: Cpu },
  { id: 'arp', name: 'Arpeggiator / Pluck', category: 'Electronic', icon: Zap },
  { id: 'pad', name: 'Ambient Pad / Drone', category: 'Atmospheric', icon: Layers },
  { id: 'sub', name: 'Sub Bass / Low End', category: 'Bass', icon: Volume2 },
];

export function getTrackIconComponent(iconId?: string): LucideIcon {
  const found = TRACK_ICON_OPTIONS.find((opt) => opt.id === iconId);
  return found ? found.icon : Music;
}

export function getDefaultIconForInstrument(instrumentId: string): string {
  if (instrumentId.includes('piano')) return 'piano';
  if (instrumentId.includes('violins')) return 'strings';
  if (instrumentId.includes('cellos')) return 'cello';
  if (instrumentId.includes('contrabass')) return 'bass';
  if (instrumentId.includes('french_horn')) return 'brass';
  if (instrumentId.includes('trombone')) return 'trombones';
  if (instrumentId.includes('choir')) return 'choir';
  if (instrumentId.includes('flute')) return 'flute';
  if (instrumentId.includes('harp')) return 'harp';
  if (instrumentId.includes('taiko')) return 'drum';
  if (instrumentId.includes('timpani') || instrumentId.includes('snare')) return 'bell';
  if (instrumentId.includes('synth')) return 'synth';
  if (instrumentId.includes('pad')) return 'pad';
  if (instrumentId.includes('sub')) return 'sub';
  return 'piano';
}

interface TrackIconProps {
  iconId?: string;
  className?: string;
}

export const TrackIcon: React.FC<TrackIconProps> = ({ iconId, className = 'w-3.5 h-3.5' }) => {
  const IconComponent = getTrackIconComponent(iconId);
  return <IconComponent className={className} />;
};
