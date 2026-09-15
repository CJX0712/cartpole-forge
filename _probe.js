/* 语义探针：学习曲线、评估、价值函数、策略行为 dump 到 _probe.txt */
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const m=html.match(/<script id="engine">([\s\S]*?)<\/script>/);
const ctx={console,Math,TextEncoder,TextDecoder,Uint8Array,Int32Array,Int8Array,Float64Array,Object,Array,JSON,isFinite,Infinity,globalThis:{}};
ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(m[1],ctx,{filename:'engine.js'});
const RL=ctx.RL;

const L=[];
const model=RL.train({iters:200,seed:42,rolloutSteps:800,maxSteps:200,lr:0.008,hidden:16,evalEpisodes:10});

L.push('=== 训练曲线（每 5 迭代的平均回合步数） ===');
model.hist.forEach((h,i)=>{if(i%5===0||i===model.hist.length-1)L.push('iter '+String(i).padStart(3)+'  ret='+h.ret.toFixed(1)+'  loss='+h.loss.toFixed(4));});

L.push('');
L.push('=== 贪心评估（10 回合，上限 200） ===');
L.push('steps: '+model.evals.join(', ')+'   avg='+model.evalAvg.toFixed(1));

L.push('');
L.push('=== 随机基线对照 ===');
const base=RL.train({iters:0,seed:99,rolloutSteps:300,maxSteps:200,evalEpisodes:10});
L.push('random avg='+base.evalAvg.toFixed(1)+'  evals='+base.evals.join(', '));

L.push('');
L.push('=== 贪心回合的杆角轨迹（前 60 步，每 4 步采样，单位：度） ===');
const rng=RL.mulberry32(7);
let s=RL.reset(rng),line1='',line2='';
for(let t=0;t<60;t++){
  const g=RL.greedyAction(model.policy,s);
  const deg=s[2]*57.3;
  line1+=(deg>=0?'+':'')+deg.toFixed(1).padStart(6);
  const v=RL.valueForward(model.value,s).v;
  line2+=(v>=0?'+':'')+v.toFixed(1).padStart(6);
  const st=RL.step(s,g.a);s=st.state;
  if(st.done){line1+=' (done t='+t+')';break;}
  if((t+1)%8===0){L.push('θ: '+line1);L.push('V: '+line2);line1='';line2='';}
}
if(line1){L.push('θ: '+line1);L.push('V: '+line2);}

L.push('');
L.push('=== 动作偏好扫描（x 固定 0，扫 θ ∈ [-0.2,0.2]） ===');
let scan='';
for(let k=-10;k<=10;k++){
  const th=k*0.02;
  const g2=RL.greedyAction(model.policy,[0,0,th,0]);
  scan+=g2.a===1?'R':'L';
}
L.push('θ: -0.20 … +0.20');
L.push('π: '+scan+'   （合理策略应在 θ>0 时向右推）');

fs.writeFileSync(path.join(__dirname,'_probe.txt'),L.join('\n'));
console.log('probe written');
