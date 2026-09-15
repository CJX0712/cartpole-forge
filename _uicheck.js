/* UI 接线检查：最小 DOM stub 下执行 <script id="ui">，点遍所有控件 */
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const eng=html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const ui=html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1];

function makeCtx2d(){
  const calls=[];
  return {
    calls,
    canvas:{width:600,height:240},
    clearRect(){calls.push('clearRect')},
    fillRect(){calls.push('fillRect')},
    beginPath(){calls.push('beginPath')},
    arc(){calls.push('arc')},
    fill(){calls.push('fill')},
    stroke(){calls.push('stroke')},
    strokeRect(){calls.push('strokeRect')},
    moveTo(){},lineTo(){},
    fillText(){calls.push('fillText')},
    measureText(){return{width:10}},
    save(){},restore(){},
    setLineDash(){},
    createLinearGradient(){return{addColorStop(){}}},
    createImageData(w,h){return{width:w,height:h,data:new Uint8ClampedArray(w*h*4)}},
    getImageData(w,h){return{width:w,height:h,data:new Uint8ClampedArray(w*h*4)}},
    putImageData(){}
  };
}
function makeEl(id){
  const listeners={};
  const el={
    id,value:'0',textContent:'',innerHTML:'',
    style:{},_children:[],
    addEventListener(ev,fn){listeners[ev]=fn},
    _fire(ev){if(listeners[ev])listeners[ev]();},
    appendChild(c){el._children.push(c)},
    _ctx:null,
    getContext(){if(!el._ctx)el._ctx=makeCtx2d();return el._ctx;}
  };
  let _html='';
  Object.defineProperty(el,'innerHTML',{
    get(){return _html},
    set(v){
      _html=String(v);
      if(_html==='')el._children.length=0;
      if(/<option/.test(_html)){
        const opts=[],sel=[];
        for(const mm of _html.matchAll(/<option([^>]*)>/g)){
          const attrs=mm[1];
          const vm2=attrs.match(/value="([^"]+)"/);
          if(!vm2)continue;
          opts.push(vm2[1]);
          if(/\bselected\b/.test(attrs))sel.push(vm2[1]);
        }
        el.value=sel[0]!==undefined?sel[0]:(opts[0]!==undefined?opts[0]:'');
      }
    }
  });
  return el;
}
const document={
  getElementById(id){return els[id]||null},
  createElement(tag){return makeEl('_'+tag);}
};
const els={};
['iters','rollout','maxSteps','lr','hidden','seed','btnTrain','btnReset',
 'status','cCurve','cAnim','btnPlay','btnPause','btnNew','speed',
 'barL','barR','pL','pR','liveHint','liveSteps','liveVal','evalHint'].forEach(id=>els[id]=makeEl(id));
els.iters.value='30';els.rollout.value='300';els.maxSteps.value='100';
els.lr.value='0.008';els.hidden.value='16';els.seed.value='42';
els.speed.innerHTML='<option value="1">1×</option><option value="3" selected>3×</option><option value="8">8×</option>';
els.speed.value='3';

const ctx2={console,Math,document,Uint8ClampedArray,Uint8Array,Float64Array,Int32Array,
  Object,Array,JSON,isFinite,Infinity,globalThis:{},
  requestAnimationFrame(fn){if(rafCount<3){rafCount++;fn(0);}return 1;},  /* 同步跑 3 帧驱动动画 tick */
  cancelAnimationFrame(){}};
let rafCount=0;
ctx2.globalThis=ctx2;
vm.createContext(ctx2);
vm.runInContext(eng,ctx2,{filename:'engine.js'});
vm.runInContext(ui,ctx2,{filename:'ui.js'});   /* 自动 train() 一次（小配置） */

els.btnPlay._fire('click');
els.btnPause._fire('click');
els.btnNew._fire('click');
els.btnTrain._fire('click');   /* 再训一次（小配置） */
els.btnReset._fire('click');   /* 恢复默认并重训（真实默认配置） */

let fail=0;
function ok(name,cond,detail){if(!cond){fail++;console.log('FAIL '+name+' :: '+(detail||''));}else console.log('ok '+name);}
ok('status filled',els.status.textContent.indexOf('就绪')>=0,els.status.textContent);
ok('curve drew',els.cCurve.getContext('2d').calls.length>0);
ok('anim drew',els.cAnim.getContext('2d').calls.length>0);
ok('evalHint filled',els.evalHint.textContent.length>0,els.evalHint.textContent);
ok('live steps rendered',/\d/.test(els.liveSteps.textContent),els.liveSteps.textContent);
ok('probs rendered',/%/.test(els.pL.textContent),els.pL.textContent);
ok('value rendered',/\d/.test(els.liveVal.textContent),els.liveVal.textContent);
ok('speed select',els.speed.value==='3');

if(fail){process.exit(1);}
console.log('UICHECK ALL GREEN');
