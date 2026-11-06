import React, {useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {InputBar} from './components/agent-elements/input-bar';
import './agent.css';
import '../studio.css';
import '../layout.js';
import {canSend} from '../studio.js';
import '../inline-edit.js';
import '../publish.js';
import '../remix.js';
import '../versions.js';
import '../projects.js';
import '../theme.js';
import Welcome from './Welcome';

function Composer(){
 const [value,setValue]=useState('');
 const [busy,setBusy]=useState(false);
 const preserveInput=useRef(false);
 useEffect(()=>{const send=document.getElementById('send');const observer=new MutationObserver(()=>setBusy(send.disabled));observer.observe(send,{attributes:true,attributeFilter:['disabled']});return()=>observer.disconnect()},[]);
 // The welcome screen and the empty canvas prefill a ready-made prompt here
 useEffect(()=>{const onPrompt=e=>{setValue(String(e.detail||''));requestAnimationFrame(()=>document.querySelector('#react-composer textarea')?.focus())};window.addEventListener('oc:prompt',onPrompt);return()=>window.removeEventListener('oc:prompt',onPrompt)},[]);
 function submit(message){
  if(!canSend()){preserveInput.current=true;document.getElementById('settingsButton').click();document.getElementById('chatStatus').textContent='Connect an AI provider to send a request.';return}
  document.getElementById('prompt').value=message.content;
  document.getElementById('send').click();
  setValue('');
 }
 return <div className="dark agent-composer"><InputBar value={value} onChange={(next)=>{if(preserveInput.current && next===''){preserveInput.current=false;return}setValue(next)}} onSend={submit} status="ready" onStop={()=>{}} disabled={busy} placeholder="describe what to build or change…" /></div>;
}
createRoot(document.getElementById('react-composer')).render(<Composer/>);

const welcomeRoot=document.createElement('div');
welcomeRoot.id='welcome';
document.body.append(welcomeRoot);
createRoot(welcomeRoot).render(<Welcome/>);
