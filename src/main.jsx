import '../i18n.js';
import React, {useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {InputBar} from './components/agent-elements/input-bar';
import './agent.css';
import '../studio.css';
import '../layout.js';
import {canSend, setAttachments, readAttachment, slashCommands, slashModes, runSlash} from '../studio.js';
import {t} from '../i18n.js';
import {IconUsersGroup,IconSparkles,IconCode,IconLayoutColumns,IconPalette,IconDeviceMobile,IconPencil,IconTool,IconCube,IconChevronRight} from '@tabler/icons-react';
const SLASH_ICONS={agents:IconUsersGroup,new:IconSparkles,app:IconCode,x3:IconLayoutColumns,polish:IconPalette,mobile:IconDeviceMobile,copy:IconPencil,fix:IconTool,'3d':IconCube};
import '../inline-edit.js';
import '../publish.js';
import '../remix.js';
import '../versions.js';
import '../projects.js';
import '../local-projects.js';
import '../palette.js';
import '../brand.js';
import '../theme.js';
import '../screens.js';
import '../roblox-sync.js';
import '../mobile.js';
import '../code.js';
import '../thinking-cursor.js';
import Welcome from './Welcome';
import {langSelect} from '../i18n.js';

document.getElementById('sbLang')?.append(langSelect('lang-select'));
import('../ui-theme.js');

const ACCEPT='image/*,.txt,.md,.csv,.json,.html,.css,.svg';
const fmt=n=>n<1000?String(n):n<100000?(n/1000).toFixed(1).replace(/\.0$/,'')+'k':Math.round(n/1000)+'k';
// Live token counter: rolls up while the agents write, then stays with the total of the last request
function Tokens(){
 const [k,setK]=useState(null);
 useEffect(()=>{const on=e=>setK(e.detail);window.addEventListener('oc:tokens',on);return()=>window.removeEventListener('oc:tokens',on)},[]);
 if(!k||!(k.turnIn+k.turnOut))return null;
 const live=k.live>0;
 return <span className={'tok-chip'+(live?' live':'')} title={`${t('this request')}: ${k.turnIn.toLocaleString()} ${t('in')} · ${k.turnOut.toLocaleString()} ${t('out')}\n${t('this session')}: ${k.session.toLocaleString()} ${t('tokens')}\n${live?t('counting while the AI writes, exact numbers come at the end'):k.approx?t('some providers sent no numbers: those are estimated (~)'):t('exact numbers from the provider')}`}>
  <i aria-hidden="true"></i><b key={fmt(k.turnIn+k.turnOut)}>{live||k.approx?'~':''}{fmt(k.turnIn+k.turnOut)}</b> {t('tokens')}{live&&k.live>1?<em>· {k.live} {t('agents')}</em>:null}
 </span>;
}
function Composer(){
 const [value,setValue]=useState('');
 const [busy,setBusy]=useState(false);
 const [attached,setAttached]=useState([]); // [{id,name,url?,w?,h?,text?}]
 const [drag,setDrag]=useState(false);
 const preserveInput=useRef(false);
 const [modes,setModes]=useState(()=>slashModes());
 const [sel,setSel]=useState(0);
 useEffect(()=>{const on=()=>setModes(slashModes());window.addEventListener('oc:modes',on);window.addEventListener('oc:auth',on);return()=>{window.removeEventListener('oc:modes',on);window.removeEventListener('oc:auth',on)}},[]);
 // "/" opens the command menu while the command word is being typed
 const q=/^\/([a-z0-9]*)$/i.exec(value);
 const cmds=q?slashCommands().filter(c=>c.cmd.startsWith(q[1].toLowerCase())||c.label.toLowerCase().includes(q[1].toLowerCase())):[];
 useEffect(()=>{setSel(0)},[value]);
 const focusBox=()=>requestAnimationFrame(()=>{const ta=document.querySelector('#react-composer textarea');if(ta){ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length)}});
 function pick(c){if(runSlash(c.cmd)){setValue('');setModes(slashModes())}else setValue('/'+c.cmd+' ');focusBox()}
 function onKey(e){
  if(!cmds.length)return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();setSel(i=>(i+(e.key==='ArrowDown'?1:cmds.length-1))%cmds.length)}
  else if((e.key==='Enter'&&!e.shiftKey)||e.key==='Tab'){e.preventDefault();e.stopPropagation();pick(cmds[Math.min(sel,cmds.length-1)])}
  else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setValue('')}
 }
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
 const left=<>{modes.map(m=><button type="button" key={m.cmd} className={'mode-chip mode-'+m.cmd} onClick={()=>{runSlash(m.cmd);setModes(slashModes())}} title={m.cmd==='agents'?t('Agent team'):t('switch off')}>{m.label}{m.cmd!=='agents'&&<span aria-hidden="true">×</span>}</button>)}<Tokens/></>;
 return <div className="dark agent-composer" onKeyDownCapture={onKey}
  onDragOver={e=>{if([...e.dataTransfer.items].some(i=>i.kind==='file')){e.preventDefault();setDrag(true)}}}
  onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDrag(false)}}
  onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();e.stopPropagation();setDrag(false);addFiles(e.dataTransfer.files)}}}>
  {cmds.length>0&&<div className="slash-menu" role="listbox" aria-label={t('Commands')}>
   <div className="slash-head">{t('Commands')}<span>↑↓ · Enter</span></div>
   {cmds.map((c,i)=><button type="button" role="option" aria-selected={i===sel} key={c.cmd} className={'slash-item'+(i===sel?' on':'')} onMouseEnter={()=>setSel(i)} onMouseDown={e=>e.preventDefault()} onClick={()=>pick(c)} style={{'--i':i}}>
    <span className="slash-ic" aria-hidden="true">{(I=>I?<I size={16} stroke={1.75}/>:c.icon)(SLASH_ICONS[c.cmd])}</span><span className="slash-cmd" data-no-i18n>/{c.cmd}</span><span className="slash-label">{c.label}<small>{c.hint}</small></span>
    {c.kind==='toggle'?<span className={'slash-state'+(c.on?' is-on':'')}>{c.on?t('on'):t('off')}</span>:c.kind==='panel'?<span className="slash-go"><IconChevronRight size={16} stroke={2}/></span>:null}
   </button>)}
  </div>}
  <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={e=>{addFiles(e.target.files);e.target.value=''}}/>
  <InputBar value={value} onChange={(next)=>{if(preserveInput.current && next===''){preserveInput.current=false;return}setValue(next)}} onSend={submit} status="ready" onStop={()=>{}} disabled={busy} placeholder={t('describe what to build or change — / for commands')}
   onAttach={()=>fileInput.current?.click()} attachedImages={images} attachedFiles={files} onRemoveImage={remove} onRemoveFile={remove} isDragOver={drag}
   onPaste={e=>{const fs=[...(e.clipboardData?.files||[])];if(fs.length){e.preventDefault();addFiles(fs)}}} leftActions={left} />
 </div>;
}
createRoot(document.getElementById('react-composer')).render(<Composer/>);

const welcomeRoot=document.createElement('div');
welcomeRoot.id='welcome';
document.body.append(welcomeRoot);
createRoot(welcomeRoot).render(<Welcome/>);
