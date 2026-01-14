import React, { useState, useEffect, useMemo } from 'react';
import './App.css';

// ==========================================
// 1. ENGINE: DYNAMIC REGEX COMPILER (Thompson's Construction)
// ==========================================

// --- Tipe Data Graph ---
type NodeType = { id: number; x: number; y: number; label: string; isAccept: boolean };
type EdgeType = { from: number; to: number; label: string; id: string };

// --- Class State NFA ---
class State {
  id: number;
  transitions: Record<string, State[]> = {};
  isAccept: boolean = false;
  
  static idCounter = 0;
  constructor() {
    this.id = State.idCounter++;
  }
  
  addTransition(char: string, next: State) {
    if (!this.transitions[char]) this.transitions[char] = [];
    this.transitions[char].push(next);
  }
}

// --- Class NFA Fragment ---
class NFA {
  start: State;
  end: State;
  constructor(start: State, end: State) {
    this.start = start;
    this.end = end;
  }
}

// --- Helper: Insert Explicit Concatenation (.) ---
const insertConcat = (pattern: string) => {
  let res = "";
  for (let i = 0; i < pattern.length; i++) {
    const c1 = pattern[i];
    res += c1;
    if (i + 1 < pattern.length) {
      const c2 = pattern[i + 1];
      const isC1Alphanum = /[a-zA-Z0-9*)]/.test(c1);
      const isC2Alphanum = /[a-zA-Z0-9(]/.test(c2);
      if (isC1Alphanum && isC2Alphanum) res += ".";
    }
  }
  return res;
};

// --- Helper: Infix to Postfix (Shunting Yard) ---
const toPostfix = (pattern: string) => {
  const precedence: Record<string, number> = { '*': 3, '.': 2, '|': 1 };
  let output = "";
  const stack: string[] = [];
  
  const formatted = insertConcat(pattern);

  for (const char of formatted) {
    if (/[a-zA-Z0-9]/.test(char)) {
      output += char;
    } else if (char === '(') {
      stack.push(char);
    } else if (char === ')') {
      while (stack.length && stack[stack.length - 1] !== '(') {
        output += stack.pop();
      }
      stack.pop();
    } else {
      while (stack.length && precedence[stack[stack.length - 1]] >= precedence[char]) {
        output += stack.pop();
      }
      stack.push(char);
    }
  }
  while (stack.length) output += stack.pop();
  return output;
};

// --- CORE: Compile Regex String to NFA Graph ---
const compileRegexToNFA = (pattern: string) => {
  State.idCounter = 0; // Reset ID
  const postfix = toPostfix(pattern);
  const stack: NFA[] = [];

  try {
    for (const char of postfix) {
      if (char === '.') {
        const n2 = stack.pop()!;
        const n1 = stack.pop()!;
        n1.end.isAccept = false;
        n1.end.addTransition('ε', n2.start); 
        stack.push(new NFA(n1.start, n2.end));
      } else if (char === '|') {
        const n2 = stack.pop()!;
        const n1 = stack.pop()!;
        const start = new State();
        const end = new State();
        start.addTransition('ε', n1.start);
        start.addTransition('ε', n2.start);
        n1.end.isAccept = false; n2.end.isAccept = false;
        n1.end.addTransition('ε', end);
        n2.end.addTransition('ε', end);
        stack.push(new NFA(start, end));
      } else if (char === '*') {
        const n1 = stack.pop()!;
        const start = new State();
        const end = new State();
        start.addTransition('ε', n1.start);
        start.addTransition('ε', end); 
        n1.end.isAccept = false;
        n1.end.addTransition('ε', n1.start); 
        n1.end.addTransition('ε', end);
        stack.push(new NFA(start, end));
      } else {
        const start = new State();
        const end = new State();
        start.addTransition(char, end);
        stack.push(new NFA(start, end));
      }
    }
  } catch (e) {
    return null; 
  }

  const finalNFA = stack.pop();
  if (finalNFA) finalNFA.end.isAccept = true;
  return finalNFA || null; // Ensure return is explicit
};

// --- VISUALIZER: Auto Layout Graph (BFS Layering) ---
const layoutGraph = (nfa: NFA) => { // Removed 'null' from type here because we handle it in useMemo
  const nodes: NodeType[] = [];
  const edges: EdgeType[] = [];
  const visited = new Set<number>();
  const queue: { state: State, layer: number }[] = [{ state: nfa.start, layer: 0 }];
  const layers: Record<number, number> = {}; 

  while (queue.length > 0) {
    const { state, layer } = queue.shift()!;
    if (visited.has(state.id)) continue;
    visited.add(state.id);

    const layerCount = layers[layer] || 0;
    layers[layer] = layerCount + 1;
    
    // Zigzag Layout
    const yOffset = (layerCount % 2 === 0 ? 1 : -1) * (Math.floor(layerCount/1) * 70);

    nodes.push({
      id: state.id,
      x: 60 + (layer * 120), // [FIX UI] Jarak horizontal diperlebar sedikit agar lega
      y: 150 + yOffset,      
      label: state.isAccept ? "End" : `${state.id}`,
      isAccept: state.isAccept
    });

    Object.entries(state.transitions).forEach(([char, nextStates]) => {
      nextStates.forEach(next => {
        edges.push({
          from: state.id,
          to: next.id,
          label: char === 'ε' ? 'ε' : char,
          id: `${state.id}-${next.id}-${char}`
        });
        queue.push({ state: next, layer: layer + 1 });
      });
    });
  }
  return { nodes, edges };
};


// ==========================================
// 2. COMPONENT: BIT CONVERTER
// ==========================================
const BitConverter = () => {
  const [text, setText] = useState("");
  const [binary, setBinary] = useState("");

  const onTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    setBinary(val.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(''));
  };

  const onBinaryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setBinary(val);
    const clean = val.replace(/[^01]/g, '');
    const bytes = clean.match(/.{1,8}/g) || [];
    setText(bytes.map(b => String.fromCharCode(parseInt(b, 2))).join(''));
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 style={{ color: 'var(--accent-bit)' }}>Bit Converter</h2>
        <p className="subtitle">Real-time ASCII to 8-bit binary translator.</p>
      </div>
      <div className="form-body">
        <div className="input-group">
          <label className="input-label">Text Input</label>
          <textarea className="text-area" value={text} onChange={onTextChange} placeholder="Type regular text here..." />
        </div>
        <div className="input-group">
          <label className="input-label">Binary Output</label>
          <textarea className="text-area mono" value={binary} onChange={onBinaryChange} placeholder="01000001..." />
        </div>
      </div>
    </div>
  );
};


// ==========================================
// 3. COMPONENT: DYNAMIC REGEX AUTOMATA
// ==========================================
const RegexAutomata = () => {
  const [regexInput, setRegexInput] = useState("(a|b)*abb");
  const [testString, setTestString] = useState("");
  const [activeStates, setActiveStates] = useState<number[]>([]);
  const [isMatch, setIsMatch] = useState(false);

  // 1. Compile Regex & Layout
  const { nodes, edges, nfaObject } = useMemo(() => {
    const nfa = compileRegexToNFA(regexInput);
    
    // [FIX CODE] Handle NULL agar tidak error merah
    if (!nfa) {
      return { nodes: [], edges: [], nfaObject: null };
    }

    const layout = layoutGraph(nfa);
    return { ...layout, nfaObject: nfa };
  }, [regexInput]);

  // 2. Simulasi NFA
  useEffect(() => {
    if (!nfaObject) return;
    if (!testString) {
      setActiveStates([nfaObject.start.id]);
      setIsMatch(false);
      return;
    }

    let currentStates = new Set<State>();
    
    const addState = (s: State, set: Set<State>) => {
      if (set.has(s)) return;
      set.add(s);
      if (s.transitions['ε']) {
        s.transitions['ε'].forEach(next => addState(next, set));
      }
    };

    addState(nfaObject.start, currentStates);

    for (const char of testString.split('')) {
      const nextStates = new Set<State>();
      currentStates.forEach(s => {
        if (s.transitions[char]) {
          s.transitions[char].forEach(next => addState(next, nextStates));
        }
      });
      currentStates = nextStates;
    }

    const activeIds = Array.from(currentStates).map(s => s.id);
    setActiveStates(activeIds);
    
    let matchFound = false;
    currentStates.forEach(s => { if (s.isAccept) matchFound = true; });
    setIsMatch(matchFound);

  }, [testString, nfaObject]);

  // [FIX UI] Menghitung lebar konten untuk SVG
  const contentWidth = nodes.length > 0 ? Math.max(...nodes.map(n => n.x)) + 150 : 0;

  return (
    <div className="card" style={{minWidth: '700px', width: '100%'}}>
      <div className="card-header">
        <h2 style={{ color: 'var(--accent-regex)' }}>Dynamic Automata Engine</h2>
        <p className="subtitle">Compiles Regex to NFA Graph using Thompson's Construction.</p>
      </div>

      <div className="form-body" style={{paddingBottom:0}}>
        <div className="input-group">
          <label className="input-label" style={{color: 'var(--accent-regex)'}}>Regex Pattern</label>
          <input 
            className="input-text"
            style={{border: '1px solid var(--accent-regex)', color: 'white'}}
            value={regexInput}
            onChange={(e) => setRegexInput(e.target.value)}
            placeholder="e.g. (a|b)*c" 
          />
        </div>
      </div>

      {/* [FIX UI] VISUALIZER CONTAINER - Scrollable & Wider */}
      <div className="svg-container" style={{
        height: '400px', 
        overflow: 'auto', // [FIX] Mengaktifkan Scrollbar
        backgroundColor: '#020617',
        borderTop: '1px solid #1e293b',
        borderBottom: '1px solid #1e293b',
        position: 'relative'
      }}>
        {nodes.length > 0 ? (
          <svg 
            // [FIX] Lebar SVG dinamis berdasarkan konten, bukan 100% dari layar
            // Ini memaksa scrollbar muncul jika graph panjang
            width={Math.max(contentWidth, 600)} 
            height="100%" 
            viewBox={`0 0 ${contentWidth} 300`}
          >
            <defs>
              <marker id="arrow" markerWidth="14" markerHeight="14" refX="26" refY="3.5" orient="auto">
                <path d="M0,0 L0,7 L11,3.5 z" fill="#e2e8f0" />
              </marker>
              <marker id="arrow-active" markerWidth="14" markerHeight="14" refX="26" refY="3.5" orient="auto">
                <path d="M0,0 L0,7 L11,3.5 z" fill="var(--accent-regex)" />
              </marker>
            </defs>
            
            {edges.map((e) => (
              <g key={e.id}>
                <path 
                  d={`M ${nodes.find(n=>n.id===e.from)!.x} ${nodes.find(n=>n.id===e.from)!.y} L ${nodes.find(n=>n.id===e.to)!.x} ${nodes.find(n=>n.id===e.to)!.y}`} 
                  stroke="#cbd5e1" 
                  strokeWidth="2.5" 
                  fill="none" 
                  markerEnd="url(#arrow)" 
                />
                <text 
                  x={(nodes.find(n=>n.id===e.from)!.x + nodes.find(n=>n.id===e.to)!.x)/2} 
                  y={(nodes.find(n=>n.id===e.from)!.y + nodes.find(n=>n.id===e.to)!.y)/2 - 8} 
                  textAnchor="middle" 
                  fontSize="16" 
                  fontWeight="bold"
                  fill="#ffffff" 
                  stroke="#020617" 
                  strokeWidth="4" 
                  paintOrder="stroke"
                >
                  {e.label}
                </text>
              </g>
            ))}

            {nodes.map(n => {
              const isActive = activeStates.includes(n.id);
              return (
                <g key={n.id}>
                  {isActive && <circle cx={n.x} cy={n.y} r="35" fill="var(--accent-regex)" opacity="0.4" />}
                  <circle 
                    cx={n.x} cy={n.y} r="22" 
                    fill={isActive ? "#064e3b" : "#1e293b"} 
                    stroke={isActive ? "var(--accent-regex)" : n.isAccept ? "#ffffff" : "#64748b"} 
                    strokeWidth={n.isAccept ? 4 : 2.5} 
                  />
                  <text 
                    x={n.x} y={n.y + 5} 
                    textAnchor="middle" 
                    fill={isActive ? "#ffffff" : "#e2e8f0"} 
                    fontSize="14" 
                    fontWeight="bold"
                    style={{pointerEvents: 'none'}}
                  >
                    {n.label}
                  </text>
                </g>
              )
            })}
          </svg>
        ) : (
          <p style={{color:'#64748b', textAlign:'center', marginTop:'150px'}}>Invalid Regex or Empty</p>
        )}
      </div>

      <div className="form-body">
        <div className="input-group">
          <label className="input-label">Test String</label>
          <input 
            className="input-text"
            value={testString} 
            onChange={(e) => setTestString(e.target.value)} 
            placeholder="Type string to test..."
          />
        </div>
        <div className={`status-box ${isMatch ? 'status-match' : 'status-wait'}`}>
          {isMatch ? "✓ MATCH ACCEPTED" : "○ PROCESSING / REJECTED"}
        </div>
      </div>
    </div>
  );
};


// ==========================================
// 4. MAIN APP
// ==========================================
function App() {
  const [view, setView] = useState<'bit' | 'regex'>('bit');

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="brand">
          <h1>DEV<span>TOOLS</span></h1>
          <span className="version">Ultimate Engine v3.0</span>
        </div>
        <nav className="nav-menu">
          <button className={`nav-item bit ${view === 'bit' ? 'active' : ''}`} onClick={() => setView('bit')}>Bit Converter</button>
          <button className={`nav-item regex ${view === 'regex' ? 'active' : ''}`} onClick={() => setView('regex')}>Dynamic Automata</button>
        </nav>
      </aside>
      <main className="main-content">
        <div className="content-wrapper">
          {view === 'bit' ? <BitConverter /> : <RegexAutomata />}
        </div>
      </main>
    </div>
  );
}

export default App;