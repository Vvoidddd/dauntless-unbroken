type Direction='up'|'down'|'left'|'right';
export type ControllerAction=Direction|'confirm'|'back'|'previous'|'next'|'primary';
type Pad=Pick<Gamepad,'buttons'|'axes'>;

// Edge-trigger confirmation: holding a button through focus changes cannot start/cancel twice.
export class ControllerInput {
 private previous=new Set<number>();private armed=false;private direction:Direction|null=null;private repeatAt=0;
 reset(){this.previous.clear();this.armed=false;this.direction=null;}
 read(pad:Pad,now:number){
  const down=new Set(pad.buttons.flatMap((b,i)=>b.pressed?[i]:[])),actions:ControllerAction[]=[];
  if(!this.armed){this.armed=true;this.previous=down;return {actions,scroll:0};}
  for(const [index,action] of [[0,'confirm'],[1,'back'],[4,'previous'],[5,'next'],[9,'primary']] as const)
   if(down.has(index)&&!this.previous.has(index))actions.push(action);
  const x=Number.isFinite(pad.axes[0])?pad.axes[0]:0,y=Number.isFinite(pad.axes[1])?pad.axes[1]:0;
  const direction:Direction|null=down.has(12)?'up':down.has(13)?'down':down.has(14)?'left':down.has(15)?'right':
   Math.max(Math.abs(x),Math.abs(y))<0.55?null:Math.abs(x)>Math.abs(y)?x<0?'left':'right':y<0?'up':'down';
  if(direction&&(direction!==this.direction||now>=this.repeatAt)){
   actions.push(direction);this.repeatAt=now+(direction===this.direction?110:300);
  }
  this.direction=direction;this.previous=down;
  const axis=Number.isFinite(pad.axes[3])?pad.axes[3]:0;
  const scroll=(Math.abs(axis)>0.25?axis*14:0)+(down.has(7)?14:0)-(down.has(6)?14:0);
  return {actions,scroll};
 }
}

export function installControllerNavigation(){
 const inputs=new Map<number,ControllerInput>();let stopped=false,timer=0,lastFocus='';
 const hints=document.createElement('div');hints.id='controller-hint';hints.hidden=true;document.body.append(hints);
 const visible=(el:HTMLElement)=>!!el.getClientRects().length&&!el.closest('[hidden],[inert],[aria-hidden="true"]');
 function scope():ParentNode {
  const dialogs=[...document.querySelectorAll<HTMLElement>('dialog[open],#modal-root:not([hidden]),[role="listbox"],[role="menu"]')].filter(visible);
  return dialogs.at(-1)??document;
 }
 function controls(){return [...scope().querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled):not([readonly]),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el=>visible(el)&&el.getAttribute('aria-disabled')!=='true');}
 function focus(el:HTMLElement|undefined){if(!el)return;el.focus({preventScroll:true});el.scrollIntoView({block:'nearest',inline:'nearest'});lastFocus=el.dataset.fk??el.id;}
 function current(list=controls()){
  return list.includes(document.activeElement as HTMLElement)?document.activeElement as HTMLElement:
   list.find(el=>(el.dataset.fk??el.id)===lastFocus)||list.find(el=>el.id==='primary')||list.find(el=>el.getAttribute('aria-current')==='page')||list[0];
 }
 function key(key:string){const e=new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});(document.activeElement??document.body).dispatchEvent(e);return e.defaultPrevented;}
 function move(direction:Direction){
  const list=controls(),from=current(list);if(!from)return;
  if(document.activeElement!==from)focus(from);
  if((from.closest('[role="listbox"]')||from.getAttribute('role')==='tab'||from.getAttribute('aria-haspopup')==='listbox')&&key('Arrow'+direction[0].toUpperCase()+direction.slice(1)))return;
  const origin=from.getBoundingClientRect(),ox=origin.x+origin.width/2,oy=origin.y+origin.height/2;
  const horizontal=direction==='left'||direction==='right',sign=direction==='left'||direction==='up'?-1:1;
  const target=list.filter(el=>el!==from).map(el=>{
   const r=el.getBoundingClientRect(),dx=r.x+r.width/2-ox,dy=r.y+r.height/2-oy;
   const forward=(horizontal?dx:dy)*sign,cross=Math.abs(horizontal?dy:dx);
   return {el,forward,score:Math.hypot(dx,dy)+cross*2};
  }).filter(t=>t.forward>4).sort((a,b)=>a.score-b.score)[0]?.el;
  focus(target??from);
 }
 function keyboard(target:HTMLInputElement|HTMLTextAreaElement){
  if(document.querySelector('#controller-keyboard'))return;
  const dialog=document.createElement('dialog');dialog.id='controller-keyboard';dialog.setAttribute('aria-label','Controller keyboard');
  const title=document.createElement('h2');title.textContent=target.labels?.[0]?.textContent||'Enter text';
  const value=document.createElement('input');value.readOnly=true;value.tabIndex=-1;value.type=target instanceof HTMLInputElement&&target.type==='password'?'password':'text';
  let draft=target.value,shift=false;value.value=draft;
  const letters=document.createElement('div');letters.className='controller-keys';
  const actions=document.createElement('div');actions.className='controller-key-actions';
  function close(save:boolean){
   if(save){target.value=draft;target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('change',{bubbles:true}));}
   draft='';value.value='';dialog.close();dialog.remove();if(target.isConnected)focus(target);
  }
  function add(parent:HTMLElement,label:string,run:()=>void){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=label;b.onclick=run;parent.append(b);return b;}
  function refresh(){
   letters.replaceChildren();
   for(const c of '1234567890qwertyuiopasdfghjklzxcvbnm-_.:/?=&+%@#')add(letters,shift?c.toUpperCase():c,()=>{
    if(target.maxLength<0||draft.length<target.maxLength)draft+=shift?c.toUpperCase():c;value.value=draft;
   });
  }
  refresh();
  add(actions,'Shift',()=>{shift=!shift;refresh();focus(letters.querySelector('button')??undefined);});
  add(actions,'Space',()=>{if(target.maxLength<0||draft.length<target.maxLength)draft+=' ';value.value=draft;});
  add(actions,'Backspace',()=>{draft=Array.from(draft).slice(0,-1).join('');value.value=draft;});
  add(actions,'Cancel',()=>close(false));add(actions,'Done',()=>close(true));
  dialog.addEventListener('cancel',e=>{e.preventDefault();close(false);});
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(false);}});
  dialog.append(title,value,letters,actions);document.body.append(dialog);dialog.showModal();focus(letters.querySelector('button')??undefined);
 }
 function mode(pad:Gamepad){
  document.documentElement.dataset.input='controller';hints.hidden=false;
  hints.textContent=/dualsense|dualshock|playstation|054c/i.test(pad.id)?'✕ Select · ○ Back · L1/R1 Next · Right stick Scroll':'A Select · B Back · LB/RB Next · Right stick Scroll';
 }
 function pointer(){delete document.documentElement.dataset.input;hints.hidden=true;}
 function act(action:ControllerAction){
  const list=controls(),el=current(list);
  if(action==='confirm'){
   if(!el)return;focus(el);
   if((el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)&&!el.readOnly)keyboard(el);else el.click();
  }else if(action==='back'){
   if(!key('Escape'))document.querySelector<HTMLElement>('[data-fk="nav-play"]')?.click();
  }else if(action==='previous'||action==='next'){
   const i=el?list.indexOf(el):-1;focus(list[(i+(action==='next'?1:-1)+list.length)%list.length]);
  }else if(action==='primary')focus(list.find(el=>el.id==='primary')??el);
  else move(action);
 }
 function scroll(amount:number){
  let el=current()??document.body;
  while(el&&el!==document.body){const style=getComputedStyle(el);if(el.scrollHeight>el.clientHeight+2&&/(auto|scroll)/.test(style.overflowY)){el.scrollTop+=amount;return;}el=el.parentElement!;}
  const pane=document.querySelector<HTMLElement>('.view:not([hidden])');if(pane)pane.scrollTop+=amount;
 }
 function poll(){
  if(stopped)return;
  let pads:(Gamepad|null)[]=[];try{pads=[...(navigator.getGamepads?.()??[])];}catch{/* Unsupported/blocked Gamepad API leaves mouse and keyboard available. */}
  const connected=pads.filter((p):p is Gamepad=>!!p&&p.connected);
  if(document.visibilityState!=='visible'||!document.hasFocus())for(const input of inputs.values())input.reset();
  else for(const pad of connected){
   let input=inputs.get(pad.index);if(!input){input=new ControllerInput();inputs.set(pad.index,input);}
   const {actions,scroll:amount}=input.read(pad,performance.now());
   if(actions.length||amount){mode(pad);for(const action of actions)act(action);if(amount)scroll(amount);}
  }
  for(const index of inputs.keys())if(!connected.some(p=>p.index===index))inputs.delete(index);
  if(!connected.length)pointer();
  timer=window.setTimeout(poll,connected.length&&document.visibilityState==='visible'?16:250);
 }
 document.addEventListener('pointermove',pointer);document.addEventListener('pointerdown',pointer);
 poll();
 return ()=>{stopped=true;clearTimeout(timer);document.removeEventListener('pointermove',pointer);document.removeEventListener('pointerdown',pointer);hints.remove();document.querySelector('#controller-keyboard')?.remove();};
}
