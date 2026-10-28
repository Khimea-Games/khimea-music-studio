import React, { useState } from 'react';
import { BookOpen, Terminal, Sparkles, FileText, Code2, Play } from 'lucide-react';
import { KNOWLEDGE_ARTICLES, KnowledgeArticle } from '../../core/knowledge/knowledgeBase';
import { CLAUDE_SKILLS } from '../../core/skills/skillsRegistry';
import { MCP_RESOURCES, MCP_TOOLS, McpDispatcher } from '../../core/mcp/mcpProtocol';
import { Composition } from '../../types/music';

interface KnowledgeAndMcpViewProps {
  composition: Composition;
  onApplyNewComposition: (newComp: Composition, versionTitle: string) => void;
}

export const KnowledgeAndMcpView: React.FC<KnowledgeAndMcpViewProps> = ({
  composition,
  onApplyNewComposition,
}) => {
  const [activeTab, setActiveTab] = useState<'knowledge' | 'skills' | 'mcp'>('knowledge');
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle>(KNOWLEDGE_ARTICLES[0]);

  // MCP Interactive tester state
  const [selectedTool, setSelectedTool] = useState<string>(MCP_TOOLS[0].name);
  const [toolArgsJson, setToolArgsJson] = useState<string>(
    JSON.stringify({ purpose: 'combat', mood: 'dark, aggressive', tempo: 130, key: 'D', scale: 'phrygian' }, null, 2)
  );
  const [mcpResult, setMcpResult] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleToolChange = (toolName: string) => {
    setSelectedTool(toolName);
    if (toolName === 'create_composition') {
      setToolArgsJson(JSON.stringify({ purpose: 'boss', mood: 'tribal, ferocious', tempo: 132, key: 'D', scale: 'phrygian' }, null, 2));
    } else if (toolName === 'create_variation') {
      setToolArgsJson(JSON.stringify({ variationType: 'combat', instruction: 'Add war drums and brass' }, null, 2));
    } else if (toolName === 'validate_composition') {
      setToolArgsJson(JSON.stringify({ compositionId: composition.id }, null, 2));
    } else if (toolName === 'list_instruments') {
      setToolArgsJson(JSON.stringify({ family: 'strings' }, null, 2));
    } else if (toolName === 'get_music_knowledge') {
      setToolArgsJson(JSON.stringify({ topicId: 'harmony' }, null, 2));
    }
  };

  const handleExecuteMcp = async () => {
    setIsExecuting(true);
    try {
      const parsedArgs = JSON.parse(toolArgsJson);
      const res = await McpDispatcher.executeTool(selectedTool, parsedArgs, composition);
      setMcpResult(res);

      if (res.success && res.result?.title && res.result?.tracks) {
        onApplyNewComposition(res.result, `MCP Tool: ${selectedTool}`);
      }
    } catch (err: any) {
      setMcpResult({ error: err.message });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 overflow-hidden select-none">
      {/* View Sub-Navigation */}
      <div className="h-10 bg-neutral-900 border-b border-neutral-800 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('knowledge')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'knowledge'
                ? 'bg-neutral-800 text-white font-semibold'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Music Knowledge Base
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'skills'
                ? 'bg-neutral-800 text-white font-semibold'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Claude Skills Directory
          </button>
          <button
            onClick={() => setActiveTab('mcp')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'mcp'
                ? 'bg-indigo-600 text-white font-semibold'
                : 'text-indigo-400 hover:text-indigo-300'
            }`}
          >
            MCP Server & Tools Tester
          </button>
        </div>
      </div>

      {/* Tab 1: Knowledge Base */}
      {activeTab === 'knowledge' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Article list */}
          <div className="w-72 bg-neutral-900/70 border-r border-neutral-800 overflow-y-auto p-3 space-y-1 shrink-0">
            {KNOWLEDGE_ARTICLES.map((art) => (
              <button
                key={art.id}
                onClick={() => setSelectedArticle(art)}
                className={`w-full text-left p-2.5 rounded transition-colors block ${
                  selectedArticle.id === art.id
                    ? 'bg-neutral-800 text-white border-l-2 border-l-indigo-400'
                    : 'text-neutral-400 hover:bg-neutral-850 hover:text-neutral-200'
                }`}
              >
                <span className="text-[10px] font-mono text-neutral-500 uppercase block font-semibold">
                  {art.category}
                </span>
                <span className="text-xs font-bold block truncate mt-0.5 text-white">{art.title}</span>
                <span className="text-[11px] text-neutral-400 line-clamp-1 mt-0.5">{art.summary}</span>
              </button>
            ))}
          </div>

          {/* Article Reader */}
          <div className="flex-1 p-8 overflow-y-auto bg-neutral-950 font-sans">
            <div className="max-w-3xl mx-auto prose prose-invert text-xs leading-relaxed space-y-3 whitespace-pre-line">
              {selectedArticle.content}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Claude Skills */}
      {activeTab === 'skills' && (
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="border-b border-neutral-800 pb-3">
              <h2 className="text-lg font-bold text-white tracking-tight">Claude Composer Skills</h2>
              <p className="text-xs text-neutral-400 mt-1">
                Domain skills guiding Claude agents to compose, orchestrate, humanize, and loop music.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CLAUDE_SKILLS.map((skill) => (
                <div key={skill.id} className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-sm text-indigo-400 font-mono">{skill.name}</h3>
                  </div>
                  <p className="text-xs text-neutral-300 mb-4">{skill.summary}</p>

                  <h4 className="text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-wider mb-2">
                    Step-by-Step Directives
                  </h4>
                  <ul className="space-y-1 text-xs text-neutral-400 font-sans">
                    {skill.steps.map((st, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-indigo-400 font-mono text-[10px]">•</span>
                        <span>{st}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 pt-3 border-t border-neutral-800 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono text-neutral-500">MCP TOOLS:</span>
                    {skill.mcpTools.map((tool, i) => (
                      <span key={i} className="text-[10px] font-mono bg-neutral-950 px-1.5 py-0.5 rounded text-neutral-300">
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: MCP Server Tester */}
      {activeTab === 'mcp' && (
        <div className="flex-1 p-8 overflow-y-auto font-mono text-xs">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="border-b border-neutral-800 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-indigo-400" />
                  <span>Claude MCP Tool Console</span>
                </h2>
                <p className="text-xs text-neutral-400 mt-1">
                  Test and execute MCP protocol tools exactly as an external Claude agent would call them.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-neutral-500">TOOL:</span>
                <select
                  value={selectedTool}
                  onChange={(e) => handleToolChange(e.target.value)}
                  className="bg-neutral-900 border border-neutral-700 text-white rounded px-2.5 py-1 text-xs focus:outline-none"
                >
                  {MCP_TOOLS.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Request JSON */}
              <div className="flex flex-col gap-2">
                <label className="text-neutral-400 text-[11px] font-bold">TOOL ARGUMENTS (JSON)</label>
                <textarea
                  rows={8}
                  value={toolArgsJson}
                  onChange={(e) => setToolArgsJson(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded p-3 text-neutral-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleExecuteMcp}
                  disabled={isExecuting}
                  className="py-2 px-4 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mt-1"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isExecuting ? 'Executing...' : 'Invoke MCP Tool'}</span>
                </button>
              </div>

              {/* Response Output */}
              <div className="flex flex-col gap-2">
                <label className="text-neutral-400 text-[11px] font-bold">MCP RESPONSE DISPATCH</label>
                <pre className="h-60 overflow-auto bg-neutral-900 border border-neutral-800 rounded p-3 text-neutral-300 text-[11px] font-mono">
                  {mcpResult ? JSON.stringify(mcpResult, null, 2) : '// Result will appear here'}
                </pre>
              </div>
            </div>

            {/* MCP Resources List */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                Exposed MCP Resources (music://)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {MCP_RESOURCES.map((r) => (
                  <div key={r.uri} className="bg-neutral-950 p-2 rounded border border-neutral-850">
                    <span className="text-indigo-400 font-bold block">{r.uri}</span>
                    <span className="text-[10px] text-neutral-400 block">{r.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
