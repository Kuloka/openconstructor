import '../i18n.js';
import React, {useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {InputBar} from './components/agent-elements/input-bar';
import './agent.css';
import '../studio.css';
import '../layout.js';
import {canSend, setAttachments, readAttachment} from '../studio.js';
import '../inline-edit.js';
import '../publish.js';
import '../remix.js';
import '../versions.js';
import '../projects.js';
import '../theme.js';
import '../screens.js';
import '../roblox-sync.js';
import Welcome from './Welcome';
import {langSelect} from '../i18n.js';

document.getElementById('sbLang')?.append(langSelect('lang-select'));

const ACCEPT='image/*,.txt,.md,.csv,.json,.html,.css,.svg';
function Composer(){
 const [value,setValue]=useState('');
 const [busy,setBusy]=useState(false);
 const [attached,setAttached]=useState([]); // [{id,name,url?,w?,h?,text?}]
 const [drag,setDrag]=useState(false);
 const preserveInput=useRef(false);
 const fileInput=useRef(null);
 useEffect(()=>{const send=document.getElementById('send');const observer=new MutationObserver(()=>setBusy(send.disabled));observer.observe(send,{attributes:true,attributeFilter:['disabled']});return()=>observer.disconnect()},[]);
 // The welcome screen and the empty canvas prefill a ready-made prompt here
 useEffect(()=>{const onPrompt=e=>{setValue(String(e.detail||''));requestAnimationFrame(()=>document.querySelector('#react-composer textarea')?.focus())};window.addEventListener('oc:prompt',onPrompt);return()=>window.removeEventListener('oc:prompt',onPrompt)},[]);
 // studio.js reads the attachments when the request is sent
 useEffect(()=>{setAttachments(attached)},[attached]);
 useEffect(()=>{const clear=()=>setAttached([]);window.addEventListener('oc:attachments-sent',clear);return()=>window.removeEventListener('oc:attachments-sent',clear)},[]);
 async function addFiles(list){
  const files=[...(list||[])].slice(0,6);
  for(const f of files){
   try{const a=await readAttachment(f);setAttached(prev=>prev.length>=6?prev:[...prev,a])}
   catch(e){document.getElementById('chatStatus').textContent=String(e.message||e)}
  }
 }
 function submit(message){
  if(!canSend()){preserveInput.current=true;document.getElementById('settingsButton').click();document.getElementById('chatStatus').textContent='Connect an AI provider to send a request.';return}
  document.getElementById('prompt').value=message.content;
  document.getElementById('send').click();
  setValue('');
 }
 const images=attached.filter(a=>a.url).map(a=>({id:a.id,filename:a.name,url:a.url}));
 const files=attached.filter(a=>!a.url).map(a=>({id:a.id,filename:a.name,size:a.size}));
 const remove=id=>setAttached(prev=>prev.filter(a=>a.id!==id));
 return <div className="dark agent-composer"
  onDragOver={e=>{if([...e.dataTransfer.items].some(i=>i.kind==='file')){e.preventDefault();setDrag(true)}}}
  onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDrag(false)}}
  onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();e.stopPropagation();setDrag(false);addFiles(e.dataTransfer.files)}}}>
  <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={e=>{addFiles(e.target.files);e.target.value=''}}/>
  <InputBar value={value} onChange={(next)=>{if(preserveInput.current && next===''){preserveInput.current=false;return}setValue(next)}} onSend={submit} status="ready" onStop={()=>{}} disabled={busy} placeholder="describe what to build or change…"
   onAttach={()=>fileInput.current?.click()} attachedImages={images} attachedFiles={files} onRemoveImage={remove} onRemoveFile={remove} isDragOver={drag}
   onPaste={e=>{const fs=[...(e.clipboardData?.files||[])];if(fs.length){e.preventDefault();addFiles(fs)}}} />
 </div>;
}
createRoot(document.getElementById('react-composer')).render(<Composer/>);

const welcomeRoot=document.createElement('div');
welcomeRoot.id='welcome';
document.body.append(welcomeRoot);
createRoot(welcomeRoot).render(<Welcome/>);
