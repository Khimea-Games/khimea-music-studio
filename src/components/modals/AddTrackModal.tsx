import React, { useState } from 'react';
import { X, Plus, Music2 } from 'lucide-react';
import { INSTRUMENT_LIBRARY } from '../../core/instruments/library';
import { InstrumentDefinition, Track, TrackRole } from '../../types/music';
import {
  TRACK_ICON_OPTIONS,
  getDefaultIconForInstrument,
  TrackIcon,
} from '../common/TrackIcon';

interface AddTrackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTrack: (track: Track) => void;
}

export const AddTrackModal: React.FC<AddTrackModalProps> = ({
  isOpen,
  onClose,
  onAddTrack,
}) => {
  const [selectedInst, setSelectedInst] = useState<InstrumentDefinition>(INSTRUMENT_LIBRARY[0]);
  const [trackName, setTrackName] = useState<string>(INSTRUMENT_LIBRARY[0].name);
  const [role, setRole] = useState<TrackRole>('melody');
  const [selectedIcon, setSelectedIcon] = useState<string>(getDefaultIconForInstrument(INSTRUMENT_LIBRARY[0].id));

  if (!isOpen) return null;

  const handleSelectInstrument = (inst: InstrumentDefinition) => {
    setSelectedInst(inst);
    setTrackName(inst.name);
    setSelectedIcon(getDefaultIconForInstrument(inst.id));
    if (inst.family === 'percussion' || inst.family === 'tribal') {
      setRole('percussion');
    } else if (inst.family === 'bass') {
      setRole('bass');
    } else if (inst.family === 'ambient' || inst.family === 'choir') {
      setRole('texture');
    } else {
      setRole('melody');
    }
  };

  const handleConfirm = () => {
    const newTrack: Track = {
      id: `track_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: trackName.trim() || selectedInst.name,
      instrumentId: selectedInst.id,
      role,
      notes: [],
      automation: [],
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      color: selectedInst.color,
      icon: selectedIcon,
      reverbSend: 0.3,
    };
    onAddTrack(newTrack);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-lg w-full p-6 text-neutral-200 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Music2 className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-sm text-white">Add New Virtual Instrument Track</h3>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Track Name & Role */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="text-neutral-400 font-bold block mb-1">Track Name</label>
            <input
              type="text"
              value={trackName}
              onChange={(e) => setTrackName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="text-neutral-400 font-bold block mb-1">Musical Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as TrackRole)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="melody">Melody</option>
              <option value="harmony">Harmony / Accompaniment</option>
              <option value="bass">Bass</option>
              <option value="percussion">Percussion</option>
              <option value="texture">Texture / Ambient</option>
            </select>
          </div>
        </div>

        {/* Symbolic Track Icon Selector */}
        <div>
          <label className="text-neutral-400 text-xs font-bold block mb-1.5">Track Symbol / Icon</label>
          <div className="grid grid-cols-5 gap-1.5 bg-neutral-950 p-2 rounded border border-neutral-800">
            {TRACK_ICON_OPTIONS.map((opt) => {
              const isSelected = selectedIcon === opt.id;
              const IconComp = opt.icon;
              return (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setSelectedIcon(opt.id)}
                  title={opt.name}
                  className={`p-1.5 rounded flex items-center justify-center gap-1 text-xs transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span className="text-[10px] truncate">{opt.name.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Instruments Catalog List */}
        <div>
          <label className="text-neutral-400 text-xs font-bold block mb-1.5">Select Acoustic Voice</label>
          <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
            {INSTRUMENT_LIBRARY.map((inst) => {
              const isSelected = selectedInst.id === inst.id;
              return (
                <div
                  key={inst.id}
                  onClick={() => handleSelectInstrument(inst)}
                  className={`p-2 rounded border cursor-pointer flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-neutral-800 border-indigo-500 text-white'
                      : 'bg-neutral-950/60 border-neutral-850 hover:bg-neutral-850 text-neutral-300'
                  }`}
                >
                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: inst.color }} />
                      <span className="font-semibold text-xs text-white">{inst.name}</span>
                    </div>
                    <span className="text-[10px] text-neutral-400 block truncate mt-0.5">
                      {inst.description}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono uppercase bg-neutral-900 px-2 py-0.5 rounded text-neutral-400 shrink-0">
                    {inst.family}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs text-neutral-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
          >
            Add Track
          </button>
        </div>
      </div>
    </div>
  );
};
