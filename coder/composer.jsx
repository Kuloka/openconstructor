// The message box: the same React input as in the interface builder (src/main.jsx).
// Talks to main.js through window events: cx:send (text) out, cx:stop out, cx:busy (true/false) in.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InputBar } from '../src/components/agent-elements/input-bar';
import '../src/agent.css';

function Composer(){
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onBusy = e => setBusy(!!e.detail);
    const onPrefill = e => { setValue(String(e.detail || '')); requestAnimationFrame(() => document.querySelector('#cxComposer textarea')?.focus()); };
    window.addEventListener('cx:busy', onBusy); window.addEventListener('cx:prefill', onPrefill);
    return () => { window.removeEventListener('cx:busy', onBusy); window.removeEventListener('cx:prefill', onPrefill); };
  }, []);
  return <div className="dark agent-composer">
    <InputBar value={value} onChange={setValue} status={busy ? 'streaming' : 'ready'}
      onSend={m => { window.dispatchEvent(new CustomEvent('cx:send', { detail: m.content })); setValue(''); }}
      onStop={() => window.dispatchEvent(new CustomEvent('cx:stop'))}
      placeholder="describe the change… (Enter to send, Shift+Enter for a new line)" />
  </div>;
}
createRoot(document.getElementById('cxComposer')).render(<Composer />);
