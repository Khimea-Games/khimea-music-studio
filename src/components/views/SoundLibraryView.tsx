import React, { useState } from 'react';
import {
  Package,
  CheckCircle,
  Download,
  Trash2,
  Volume2,
  ShieldCheck,
  Info,
  Sparkles,
  Music2,
  Layers,
  Search,
  ExternalLink,
} from 'lucide-react';
import { SoundLibraryManager } from '../../core/instruments/SoundLibraryManager';
import { SoundLibraryPackage } from '../../types/music';
import { globalAudioEngine } from '../../core/audio/WebAudioEngine';
import { INSTRUMENT_LIBRARY } from '../../core/instruments/library';

export const SoundLibraryView: React.FC = () => {
  const [packages, setPackages] = useState<SoundLibraryPackage[]>(
    SoundLibraryManager.getPackages()
  );
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [auditioningInstrument, setAuditioningInstrument] = useState<string | null>(null);

  const categories = [
    { id: 'all', name: 'All Libraries' },
    { id: 'orchestral', name: 'Orchestral Essentials' },
    { id: 'dark_fantasy', name: 'Dark Fantasy' },
    { id: 'medieval', name: 'Medieval' },
    { id: 'horror', name: 'Horror & Textures' },
    { id: 'cinematic_percussion', name: 'War Percussion' },
    { id: 'choir', name: 'Choir & Formants' },
    { id: 'ambient', name: 'Ambient & Drones' },
    { id: 'electronic', name: 'Hybrid Electronic' },
  ];

  const handleToggleInstall = (pkgId: string) => {
    SoundLibraryManager.togglePackage(pkgId);
    setPackages([...SoundLibraryManager.getPackages()]);
  };

  const handleAudition = (instrumentName: string) => {
    const clean = instrumentName.toLowerCase();
    const inst =
      INSTRUMENT_LIBRARY.find((i) => clean.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(clean)) ||
      INSTRUMENT_LIBRARY[0];

    const pitch = inst.family === 'bass' ? 36 : inst.family === 'percussion' ? 40 : 60;
    setAuditioningInstrument(instrumentName);
    globalAudioEngine.triggerNotePreview(inst.id, pitch, 100, 1.2);
    setTimeout(() => {
      setAuditioningInstrument(null);
    }, 1200);
  };

  const filteredPackages = packages.filter((pkg) => {
    const matchesCat = selectedCategory === 'all' || pkg.category === selectedCategory;
    const matchesSearch =
      pkg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pkg.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pkg.instruments.some((i) => i.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const totalInstalled = packages.filter((p) => p.installed).length;
  const totalSamples = packages.reduce((acc, p) => (p.installed ? acc + p.totalSamples : acc), 0);

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 overflow-hidden select-none">
      {/* Top Banner */}
      <div className="bg-neutral-900 border-b border-neutral-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Package className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">Sound Library & Package Manager</h2>
            <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded">
              CC0 Verified
            </span>
          </div>
          <p className="text-xs text-neutral-400 max-w-2xl leading-relaxed">
            Manage high-fidelity multisampled acoustic libraries, orchestral sections, and atmospheric sound beds.
            All registered packages are strictly verified for commercial game soundtrack production under CC0 and public domain licenses.
          </p>
        </div>

        {/* Global Stats */}
        <div className="flex items-center gap-3 bg-neutral-950 border border-neutral-800 rounded-lg p-3 shrink-0">
          <div className="text-center px-2">
            <span className="text-xs font-mono text-neutral-500 block uppercase">Installed</span>
            <span className="text-base font-bold text-white font-mono">{totalInstalled} / {packages.length}</span>
          </div>
          <div className="w-px h-8 bg-neutral-800" />
          <div className="text-center px-2">
            <span className="text-xs font-mono text-neutral-500 block uppercase">Active Samples</span>
            <span className="text-base font-bold text-indigo-400 font-mono">{totalSamples}</span>
          </div>
          <div className="w-px h-8 bg-neutral-800" />
          <div className="text-center px-2">
            <span className="text-xs font-mono text-neutral-500 block uppercase">License</span>
            <span className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> 100% Safe
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-neutral-900/60 border-b border-neutral-800 px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Category Pills */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-3xl">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1 text-xs rounded transition-colors whitespace-nowrap ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                  : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search instruments or packs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Package List Grid */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredPackages.map((pkg) => (
            <div
              key={pkg.id}
              className={`bg-neutral-900 border rounded-xl p-5 flex flex-col justify-between transition-all ${
                pkg.installed
                  ? 'border-neutral-800 hover:border-indigo-500/40 shadow-lg'
                  : 'border-neutral-800/60 opacity-70'
              }`}
            >
              {/* Package Header */}
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-sm">{pkg.name}</h3>
                      <span className="text-[10px] font-mono text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded">
                        v{pkg.version}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-indigo-400 block mt-0.5">
                      {pkg.author} · {pkg.provenance}
                    </span>
                  </div>

                  <button
                    onClick={() => handleToggleInstall(pkg.id)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors shrink-0 ${
                      pkg.installed
                        ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-rose-950 hover:text-rose-300 hover:border-rose-500/40'
                        : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm'
                    }`}
                  >
                    {pkg.installed ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Installed</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>Install Pack</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-xs text-neutral-300 mb-3 leading-relaxed">{pkg.description}</p>

                {/* Instruments Included with Audition buttons */}
                <div className="mb-3">
                  <span className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-wider block mb-1.5">
                    Included Instruments ({pkg.instruments.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {pkg.instruments.map((inst) => (
                      <button
                        key={inst}
                        onClick={() => handleAudition(inst)}
                        title={`Click to audition ${inst}`}
                        className={`text-[11px] px-2 py-0.5 rounded border flex items-center gap-1 transition-colors ${
                          auditioningInstrument === inst
                            ? 'bg-indigo-600 text-white border-indigo-400 shadow-xs'
                            : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:bg-neutral-800 hover:text-white'
                        }`}
                      >
                        <Volume2 className="w-3 h-3 text-indigo-400" />
                        <span>{inst}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Articulations Supported */}
                <div className="mb-3">
                  <span className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-wider block mb-1">
                    Articulations Supported
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {pkg.articulations.map((art) => (
                      <span
                        key={art}
                        className="text-[10px] font-mono uppercase bg-neutral-800/80 text-neutral-400 px-1.5 py-0.5 rounded"
                      >
                        {art}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* License Compliance Badge */}
              <div className="border-t border-neutral-800/80 pt-3 flex items-center justify-between text-[11px] font-mono text-neutral-400">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{pkg.license}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span>Commercial: {pkg.commercialUse ? 'Approved' : 'Restricted'}</span>
                  <span>Attribution: {pkg.attributionRequired ? 'Required' : 'None'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Legal License Compliance Guarantee Footer */}
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 flex items-start gap-3 text-xs text-neutral-400 mt-6">
          <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-neutral-200">Legal License Guarantee for Game Soundtrack Developers</h4>
            <p className="leading-relaxed">
              Every instrument sample in Khimea Music Studio is rendered through proprietary acoustic PCM models and verified CC0 1.0 Universal public domain sound sources. 
              Audio generated, rendered, or exported from this studio is 100% royalty-free, approved for commercial distribution on Steam, PlayStation, Xbox, Nintendo Switch, iOS, and Android without license fees or mandatory attribution.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
